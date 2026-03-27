/**
 * Constraint-based consistency checker — NO LLM calls.
 *
 * Validates narrative facts against logical rules using a simple
 * knowledge graph / state machine. Catches issues that are
 * mathematically provable, not subjective.
 */

import type { NovelSeed } from "../schema/novel";

// ---------------------------------------------------------------------------
// Constraint violation types
// ---------------------------------------------------------------------------

export interface ConstraintViolation {
  type:
    | "dead_character_active"    // 죽은 캐릭터가 등장
    | "unknown_knowledge"        // 모르는 정보를 아는 것처럼 행동
    | "impossible_location"      // 이동 불가능한 위치 변화
    | "relationship_asymmetry"   // 관계 비대칭
    | "timeline_paradox"         // 시간선 모순
    | "missing_character"        // 등장해야 할 캐릭터 부재
    | "premature_introduction";  // 등장 이전 화에서 활동
  severity: "error" | "warning";
  message: string;
  chapter: number;
  characterId?: string;
}

// ---------------------------------------------------------------------------
// Knowledge state per character
// ---------------------------------------------------------------------------

interface CharacterKnowledge {
  id: string;
  alive: boolean;
  /** Chapters where this character appeared */
  appearances: Set<number>;
  /** Secrets this character knows, with the chapter they learned it */
  knownSecrets: Map<string, number>;
  /** Location history: chapter → location */
  locationHistory: Map<number, string>;
  /** Relationships: otherId → latest description */
  relationships: Map<string, string>;
}

// ---------------------------------------------------------------------------
// ConstraintChecker
// ---------------------------------------------------------------------------

export class ConstraintChecker {
  private characters: Map<string, CharacterKnowledge> = new Map();
  private violations: ConstraintViolation[] = [];

  constructor(seed: NovelSeed) {
    // Initialize from seed
    for (const char of seed.characters) {
      this.characters.set(char.id, {
        id: char.id,
        alive: true,
        appearances: new Set(),
        knownSecrets: new Map(
          (char.state.secrets_known || []).map((s) => [s, 0]),
        ),
        locationHistory: new Map(
          char.state.location ? [[0, char.state.location]] : [],
        ),
        relationships: new Map(
          Object.entries(char.state.relationships || {}),
        ),
      });
    }
  }

  /**
   * Validate a chapter's character states against established constraints.
   * Call this after each chapter is summarized.
   */
  validateChapter(
    chapterNumber: number,
    characterChanges: Array<{
      characterId: string;
      change: string;
      relationship_updates?: Record<string, string>;
      emotional_state?: string;
      location?: string;
      new_secrets?: string[];
    }>,
    seed: NovelSeed,
  ): ConstraintViolation[] {
    const chapterViolations: ConstraintViolation[] = [];

    for (const change of characterChanges) {
      const char = this.characters.get(change.characterId);
      if (!char) continue;

      // 1. Dead character check
      if (!char.alive) {
        chapterViolations.push({
          type: "dead_character_active",
          severity: "error",
          message: `${change.characterId}는 이미 사망했는데 ${chapterNumber}화에서 활동합니다`,
          chapter: chapterNumber,
          characterId: change.characterId,
        });
        continue;
      }

      // 2. Premature introduction check
      const seedChar = seed.characters.find((c) => c.id === change.characterId);
      if (seedChar && chapterNumber < seedChar.introduction_chapter) {
        chapterViolations.push({
          type: "premature_introduction",
          severity: "warning",
          message: `${change.characterId}는 ${seedChar.introduction_chapter}화 등장 예정인데 ${chapterNumber}화에 나타남`,
          chapter: chapterNumber,
          characterId: change.characterId,
        });
      }

      // 3. Record appearance
      char.appearances.add(chapterNumber);

      // 4. Location continuity check
      if (change.location) {
        const prevLocation = this.getLastLocation(char);
        if (prevLocation && prevLocation.location !== change.location) {
          // Check if there was a reasonable gap (at least 1 chapter for travel)
          const gapChapters = chapterNumber - prevLocation.chapter;
          if (gapChapters === 0) {
            chapterViolations.push({
              type: "impossible_location",
              severity: "warning",
              message: `${change.characterId}가 같은 화 안에서 '${prevLocation.location}'에서 '${change.location}'로 이동 — 자연스러운가?`,
              chapter: chapterNumber,
              characterId: change.characterId,
            });
          }
        }
        char.locationHistory.set(chapterNumber, change.location);
      }

      // 5. Secret knowledge tracking
      if (change.new_secrets) {
        for (const secret of change.new_secrets) {
          char.knownSecrets.set(secret, chapterNumber);
        }
      }

      // 6. Relationship symmetry check
      if (change.relationship_updates) {
        for (const [otherId, rel] of Object.entries(change.relationship_updates)) {
          char.relationships.set(otherId, rel);

          // Check if other character has ANY relationship record with this one
          const other = this.characters.get(otherId);
          if (other && !other.relationships.has(change.characterId)) {
            chapterViolations.push({
              type: "relationship_asymmetry",
              severity: "warning",
              message: `${change.characterId}→${otherId} 관계가 '${rel}'인데, ${otherId}→${change.characterId} 관계 기록이 없음`,
              chapter: chapterNumber,
              characterId: change.characterId,
            });
          }
        }
      }

      // 7. Check for death events
      if (
        change.change.includes("사망") ||
        change.change.includes("죽") ||
        change.change.includes("처형")
      ) {
        char.alive = false;
      }
    }

    this.violations.push(...chapterViolations);
    return chapterViolations;
  }

  /**
   * Check if a character knows a specific secret.
   * Returns the chapter they learned it, or null if they don't know.
   */
  characterKnows(characterId: string, secret: string): number | null {
    const char = this.characters.get(characterId);
    if (!char) return null;
    return char.knownSecrets.get(secret) ?? null;
  }

  /**
   * Validate that text doesn't reference knowledge a character shouldn't have.
   * Call with extracted facts from the chapter text.
   */
  validateKnowledge(
    chapterNumber: number,
    characterId: string,
    referencedSecrets: string[],
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const char = this.characters.get(characterId);
    if (!char) return violations;

    for (const secret of referencedSecrets) {
      const learnedAt = char.knownSecrets.get(secret);
      if (learnedAt === undefined) {
        violations.push({
          type: "unknown_knowledge",
          severity: "error",
          message: `${characterId}가 '${secret}'을 아는 것처럼 행동하지만, 알게 된 기록이 없음`,
          chapter: chapterNumber,
          characterId,
        });
      } else if (learnedAt > chapterNumber) {
        violations.push({
          type: "timeline_paradox",
          severity: "error",
          message: `${characterId}가 '${secret}'을 ${learnedAt}화에서 알게 되는데, ${chapterNumber}화에서 이미 알고 있음`,
          chapter: chapterNumber,
          characterId,
        });
      }
    }

    this.violations.push(...violations);
    return violations;
  }

  /** Get all accumulated violations */
  getAllViolations(): ConstraintViolation[] {
    return [...this.violations];
  }

  /** Get violations for a specific chapter */
  getViolationsForChapter(chapter: number): ConstraintViolation[] {
    return this.violations.filter((v) => v.chapter === chapter);
  }

  /** Check if character is alive */
  isAlive(characterId: string): boolean {
    return this.characters.get(characterId)?.alive ?? false;
  }

  /**
   * Validate that only expected characters appear in the text.
   * Compares characters found in text against blueprint's characters_involved.
   *
   * @param text - Generated chapter text
   * @param chapterNumber - Current chapter number
   * @param seed - Novel seed with character data
   * @param blueprintCharacters - Character IDs from blueprint.characters_involved (optional)
   */
  validateCharacterAppearances(
    text: string,
    chapterNumber: number,
    seed: NovelSeed,
    blueprintCharacters?: string[],
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Find all seed characters that appear in the text (by name)
    const appearsInText: string[] = [];
    for (const char of seed.characters) {
      if (text.includes(char.name)) {
        appearsInText.push(char.id);
      }
    }

    // Check 1: Characters in text but not in blueprint
    if (blueprintCharacters && blueprintCharacters.length > 0) {
      for (const charId of appearsInText) {
        if (!blueprintCharacters.includes(charId)) {
          const char = seed.characters.find((c) => c.id === charId);
          const charName = char?.name || charId;

          // Skip if character was in a previous chapter (might be referenced in dialogue/memory)
          // Only flag if character has dialogue or action (not just mentioned)
          const charNamePattern = new RegExp(
            `${charName}[은는이가을를의에]|"[^"]*"[^"]*${charName}|${charName}[^\n]{0,10}(말했|물었|대답|외치|속삭|웃|소리)`,
          );
          if (charNamePattern.test(text)) {
            violations.push({
              type: "missing_character" as ConstraintViolation["type"],
              severity: "warning",
              message: `${charName}(이)가 ${chapterNumber}화에 등장하지만 블루프린트에 포함되지 않음 (예정: ${blueprintCharacters.join(", ")})`,
              chapter: chapterNumber,
              characterId: charId,
            });
          }
        }
      }
    }

    // Check 2: Characters not yet introduced appearing in text
    for (const charId of appearsInText) {
      const seedChar = seed.characters.find((c) => c.id === charId);
      if (seedChar && chapterNumber < seedChar.introduction_chapter) {
        // Check if they have dialogue or action (not just name-dropped)
        const hasAction = new RegExp(
          `${seedChar.name}[은는이가]\\s|"[^"]*"[^\\n]*${seedChar.name}`,
        ).test(text);
        if (hasAction) {
          violations.push({
            type: "premature_introduction",
            severity: "error",
            message: `${seedChar.name}(은)는 ${seedChar.introduction_chapter}화 등장 예정이지만 ${chapterNumber}화에서 대사/행동이 있음`,
            chapter: chapterNumber,
            characterId: charId,
          });
        }
      }
    }

    this.violations.push(...violations);
    return violations;
  }

  private getLastLocation(
    char: CharacterKnowledge,
  ): { chapter: number; location: string } | null {
    let latest: { chapter: number; location: string } | null = null;
    for (const [ch, loc] of char.locationHistory) {
      if (!latest || ch > latest.chapter) {
        latest = { chapter: ch, location: loc };
      }
    }
    return latest;
  }
}
