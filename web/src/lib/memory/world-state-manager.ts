/**
 * WorldStateManager — in-memory store for extracted world facts and character states.
 *
 * Tracks facts as subject-action-object triples across chapters,
 * supports contradiction detection, and formats state for the Writer prompt.
 */

import type { ChapterWorldState, WorldFact, CharacterState } from "./world-state";

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
  detectContradictions(newFacts: WorldFact[]): Contradiction[] {
    const currentFacts = this.getCurrentFacts();
    const contradictions: Contradiction[] = [];

    for (const incoming of newFacts) {
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
        parts.push(
          `- **${state.name}**: ${state.location} / ${state.emotional}${relStr}`,
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
