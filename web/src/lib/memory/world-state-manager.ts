/**
 * WorldStateManager — in-memory store for extracted world facts and character states.
 *
 * Tracks facts as subject-action-object triples across chapters,
 * supports contradiction detection, and formats state for the Writer prompt.
 */

import type { ChapterWorldState, WorldFact, CharacterState, KeyDialogue, KeyAction, PendingSituation } from "./world-state";

export interface Contradiction {
  existing: WorldFact;
  incoming: WorldFact;
  description: string;
}

export class WorldStateManager {
  private history: ChapterWorldState[] = [];

  /** Append a new chapter's extracted state. */
  addChapterState(state: ChapterWorldState): void {
    this.history.push(state);
  }

  /** Get all facts where valid_until is null/undefined (still active). */
  getCurrentFacts(): WorldFact[] {
    const allFacts: WorldFact[] = [];
    for (const ch of this.history) {
      for (const fact of ch.facts) {
        allFacts.push(fact);
      }
    }
    return allFacts.filter((f) => !f.valid_until);
  }

  /** Get latest state for a character by name. */
  getCharacterState(name: string): CharacterState | undefined {
    // Walk backwards to find the most recent state
    for (let i = this.history.length - 1; i >= 0; i--) {
      const state = this.history[i].character_states.find(
        (cs) => cs.name === name,
      );
      if (state) return state;
    }
    return undefined;
  }

  /** Get all unique character names that have appeared. */
  getAllCharacterNames(): string[] {
    const names = new Set<string>();
    for (const ch of this.history) {
      for (const cs of ch.character_states) {
        names.add(cs.name);
      }
    }
    return [...names];
  }

  /** Get chapter summaries from all tracked chapters. */
  getSummaries(): Array<{ chapter: number; summary: string }> {
    return this.history.map((h) => ({
      chapter: h.chapter,
      summary: h.summary,
    }));
  }

  /** Check if new facts contradict existing active facts. */
  /** Actions that naturally change every chapter — not contradictions */
  private static DIALOGUE_ACTIONS = new Set([
    "말하다", "물어보다", "전하다", "대답하다", "외치다", "속삭이다",
    "소리치다", "중얼거리다", "묻다", "부르다", "요청하다", "명령하다",
    "제안하다", "보고하다", "설명하다",
  ]);

  detectContradictions(newFacts: WorldFact[]): Contradiction[] {
    const currentFacts = this.getCurrentFacts();
    const contradictions: Contradiction[] = [];

    for (const incoming of newFacts) {
      // Skip dialogue actions — speech content naturally changes every chapter
      if (WorldStateManager.DIALOGUE_ACTIONS.has(incoming.action)) continue;

      for (const existing of currentFacts) {
        // Same subject + same action domain but different object → possible contradiction
        if (
          existing.subject === incoming.subject &&
          existing.action === incoming.action &&
          existing.object !== incoming.object
        ) {
          contradictions.push({
            existing,
            incoming,
            description: `${incoming.subject}의 "${incoming.action}" 상태가 "${existing.object}"(${existing.chapter}화)에서 "${incoming.object}"(${incoming.chapter}화)로 변경됨`,
          });
        }
      }
    }

    return contradictions;
  }

  /**
   * Format anti-repeat context: collects key_dialogues and key_actions
   * from all previous chapters, groups by character, and returns a prompt
   * block instructing the Writer to avoid repeating them.
   */
  formatAntiRepeatContext(chapterNumber: number): string {
    // Collect all dialogues and actions from chapters before chapterNumber
    const dialoguesByChar = new Map<string, Array<{ chapter: number; line: string; context: string }>>();
    const actionsByChar = new Map<string, Array<{ chapter: number; action: string }>>();

    for (const ch of this.history) {
      if (ch.chapter >= chapterNumber) continue;

      if (ch.key_dialogues) {
        for (const d of ch.key_dialogues) {
          if (!dialoguesByChar.has(d.speaker)) dialoguesByChar.set(d.speaker, []);
          dialoguesByChar.get(d.speaker)!.push({ chapter: ch.chapter, line: d.line, context: d.context });
        }
      }
      if (ch.key_actions) {
        for (const a of ch.key_actions) {
          if (!actionsByChar.has(a.character)) actionsByChar.set(a.character, []);
          actionsByChar.get(a.character)!.push({ chapter: ch.chapter, action: a.action });
        }
      }
    }

    if (dialoguesByChar.size === 0 && actionsByChar.size === 0) return "";

    const parts: string[] = [];
    parts.push("## 반복 금지 (이전 화에서 이미 사용된 대사/행동)");

    const allChars = new Set([...dialoguesByChar.keys(), ...actionsByChar.keys()]);
    for (const charName of allChars) {
      parts.push(`${charName}:`);
      const dialogues = dialoguesByChar.get(charName) || [];
      const actions = actionsByChar.get(charName) || [];

      // Show last 5 dialogues per character to keep prompt concise
      for (const d of dialogues.slice(-5)) {
        parts.push(`  - ${d.chapter}화: "${d.line}" (${d.context})`);
      }
      for (const a of actions.slice(-5)) {
        parts.push(`  - ${a.chapter}화: ${a.action}`);
      }

      // Check for repeated patterns and add warning
      const lines = dialogues.map((d) => d.line);
      const duplicates = lines.filter((line, i) => lines.indexOf(line) !== i);
      if (duplicates.length > 0) {
        parts.push(`  → 이미 반복된 대사가 있습니다! 같은 감정이라도 다른 표현을 사용하세요.`);
      }
      parts.push(`  → 변주하세요: 말 대신 행동, 다른 어휘, 침묵 등`);
    }

    // Add already-explained facts/settings to prevent re-explanation
    const explainedFacts = this.getCurrentFacts()
      .filter((f) => f.chapter < chapterNumber)
      .slice(-15);
    if (explainedFacts.length > 0) {
      parts.push("");
      parts.push("## 이미 설명된 설정 (다시 설명하지 마세요)");
      parts.push("독자는 아래 정보를 이미 알고 있습니다. 언급은 가능하지만, 같은 내용을 다시 풀어서 설명하면 지루합니다.");
      for (const f of explainedFacts) {
        parts.push(`  - ${f.chapter}화: ${f.subject} ${f.action} ${f.object}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Format character placement at the end of the previous chapter.
   * Groups characters by location and shows who is with whom.
   * Used to prevent "characters who left together acting separately" errors.
   */
  formatScenePlacement(chapterNumber: number): string {
    if (this.history.length === 0) return "";

    // Get the most recent chapter state before this one
    const prevChapter = this.history
      .filter((h) => h.chapter < chapterNumber)
      .sort((a, b) => b.chapter - a.chapter)[0];
    if (!prevChapter || prevChapter.character_states.length === 0) return "";

    // Group characters by location
    const locationGroups = new Map<string, Array<{ name: string; companions: string[] }>>();
    for (const cs of prevChapter.character_states) {
      const loc = cs.location || "불명";
      if (!locationGroups.has(loc)) locationGroups.set(loc, []);
      locationGroups.get(loc)!.push({
        name: cs.name,
        companions: cs.companions || [],
      });
    }

    const parts: string[] = [];
    parts.push(`## 인물 배치 (${prevChapter.chapter}화 종료 시점)`);
    for (const [location, chars] of locationGroups) {
      const names = chars.map((c) => c.name).join(", ");
      parts.push(`- **${location}**: ${names}`);
    }

    // Add pending situations from previous chapter
    const pendingSituations = prevChapter.pending_situations;
    if (pendingSituations && pendingSituations.length > 0) {
      parts.push("");
      parts.push(`## 이전 화 미해결 상황 (${prevChapter.chapter}화 끝)`);
      for (const ps of pendingSituations) {
        parts.push(`- **${ps.characters.join(", ")}** @ ${ps.location}: ${ps.situation}`);
        parts.push(`  → 미해결: ${ps.unresolved}`);
      }
    }

    parts.push("");
    parts.push("⚠️ 위 배치와 미해결 상황을 반드시 이어받으세요:");
    parts.push("- 같은 장소에 있던 인물들은 함께 등장해야 합니다.");
    parts.push("- 누군가 자리를 떠나려면 떠나는 장면을 묘사하세요.");
    parts.push("- 다른 장소에 있던 인물이 합류하려면 이동 과정을 보여주세요.");
    parts.push("- 미해결 상황은 이번 화 초반에 반드시 이어서 처리하세요 (갑자기 해결된 채 시작 금지).");

    return parts.join("\n");
  }

  /**
   * Get character states from the most recent chapter before the given one.
   * Used by the consistency gate to check companion continuity.
   */
  getPreviousCharacterStates(chapterNumber: number): CharacterState[] | undefined {
    const prevChapter = this.history
      .filter((h) => h.chapter < chapterNumber)
      .sort((a, b) => b.chapter - a.chapter)[0];
    if (!prevChapter || prevChapter.character_states.length === 0) return undefined;
    return prevChapter.character_states;
  }

  /**
   * Format current world state as a prompt block for the Writer.
   * Keeps it concise to minimize token cost.
   */
  formatForWriter(chapterNumber: number): string {
    const facts = this.getCurrentFacts();
    const parts: string[] = [];

    parts.push("## 현재 세계 상태");

    // Active facts (limit to 20 most recent)
    if (facts.length > 0) {
      const recentFacts = facts.slice(-20);
      parts.push("### 확립된 사실");
      for (const f of recentFacts) {
        parts.push(`- ${f.subject} ${f.action} ${f.object} (${f.chapter}화)`);
      }
    }

    // Character states (latest for each character)
    const charNames = this.getAllCharacterNames();
    if (charNames.length > 0) {
      parts.push("### 캐릭터 상태");
      for (const name of charNames) {
        const state = this.getCharacterState(name);
        if (!state) continue;
        const relStr = state.relationships.length > 0
          ? ` | 관계: ${state.relationships.map((r) => `${r.with}(${r.status})`).join(", ")}`
          : "";
        const companionStr = state.companions && state.companions.length > 0
          ? ` | 동행: ${state.companions.join(", ")}`
          : "";
        parts.push(
          `- **${state.name}**: ${state.location} / ${state.emotional}${companionStr}${relStr}`,
        );
      }
    }

    // Recent summaries (last 3)
    const summaries = this.getSummaries().slice(-3);
    if (summaries.length > 0) {
      parts.push("### 최근 요약");
      for (const s of summaries) {
        parts.push(`- ${s.chapter}화: ${s.summary}`);
      }
    }

    parts.push(
      `\n⚠️ 위 사실과 모순되는 내용을 쓰지 마세요. ${chapterNumber}화를 이어서 작성하세요.`,
    );

    return parts.join("\n");
  }

  /** Number of chapters tracked. */
  get size(): number {
    return this.history.length;
  }

  /** Export the full history (for serialization). */
  toJSON(): ChapterWorldState[] {
    return this.history;
  }

  /** Restore from serialized history. */
  static fromJSON(data: ChapterWorldState[]): WorldStateManager {
    const mgr = new WorldStateManager();
    mgr.history = data;
    return mgr;
  }
}
