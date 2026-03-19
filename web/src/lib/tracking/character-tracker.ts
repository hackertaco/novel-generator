import type { Character } from "@/lib/schema/character";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CharacterStateSnapshot {
  chapter: number;
  characterId: string;
  // Voice evolution
  tone: string;
  status: string; // e.g. "시녀" -> "비밀을 알게 됨" -> "복수를 결심"
  location: string;
  // Relationship changes
  relationships: Record<string, string>;
  // Growth notes
  growth_note: string; // what changed and why
}

interface DriftResult {
  hasDrift: boolean;
  severity: "none" | "minor" | "major";
  details: string;
}

interface SerializedCharacterTracker {
  snapshots: Record<string, CharacterStateSnapshot[]>;
}

// ---------------------------------------------------------------------------
// CharacterTracker
// ---------------------------------------------------------------------------

export class CharacterTracker {
  private snapshots: Map<string, CharacterStateSnapshot[]>;
  private seed: NovelSeed;

  constructor(seed: NovelSeed) {
    this.seed = seed;
    this.snapshots = new Map();

    // Initialize each character with a chapter-0 snapshot derived from seed data
    for (const char of seed.characters) {
      const initial: CharacterStateSnapshot = {
        chapter: 0,
        characterId: char.id,
        tone: char.voice.tone,
        status: char.state.status ?? "normal",
        location: char.state.location ?? "",
        relationships: { ...char.state.relationships },
        growth_note: "초기 상태 (시드에서 생성)",
      };
      this.snapshots.set(char.id, [initial]);
    }
  }

  // ---------- Mutation ----------

  /** Record a character's state after a chapter is written. */
  recordState(snapshot: CharacterStateSnapshot): void {
    const list = this.snapshots.get(snapshot.characterId);
    if (list) {
      // Replace if same chapter already exists, otherwise append
      const idx = list.findIndex((s) => s.chapter === snapshot.chapter);
      if (idx >= 0) {
        list[idx] = snapshot;
      } else {
        list.push(snapshot);
        list.sort((a, b) => a.chapter - b.chapter);
      }
    } else {
      this.snapshots.set(snapshot.characterId, [snapshot]);
    }
  }

  // ---------- Query ----------

  /** Get character state at a specific chapter (exact match or latest before). */
  getStateAt(
    characterId: string,
    chapter: number,
  ): CharacterStateSnapshot | null {
    const list = this.snapshots.get(characterId);
    if (!list || list.length === 0) return null;

    // Find exact match first
    const exact = list.find((s) => s.chapter === chapter);
    if (exact) return exact;

    // Otherwise return latest snapshot at or before the chapter
    let best: CharacterStateSnapshot | null = null;
    for (const s of list) {
      if (s.chapter <= chapter) best = s;
      else break; // list is sorted
    }
    return best;
  }

  /** Get the most recent snapshot for a character. */
  getCurrentState(characterId: string): CharacterStateSnapshot | null {
    const list = this.snapshots.get(characterId);
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

  /**
   * Get characters relevant to a chapter along with their current states.
   * Filters by provided character IDs (typically from a chapter blueprint).
   */
  getRelevantCharacters(
    characterIds: string[],
    chapter: number,
  ): Array<{ character: Character; currentState: CharacterStateSnapshot }> {
    const results: Array<{
      character: Character;
      currentState: CharacterStateSnapshot;
    }> = [];

    for (const cid of characterIds) {
      const character = this.seed.characters.find((c) => c.id === cid);
      if (!character) continue;

      const state = this.getStateAt(cid, chapter);
      if (!state) continue;

      results.push({ character, currentState: state });
    }

    return results;
  }

  /**
   * Detect drift between a character's current state and their original
   * voice/personality defined in the seed.
   */
  detectDrift(characterId: string): DriftResult {
    const character = this.seed.characters.find((c) => c.id === characterId);
    if (!character) {
      return { hasDrift: false, severity: "none", details: "캐릭터를 찾을 수 없음" };
    }

    const current = this.getCurrentState(characterId);
    if (!current) {
      return { hasDrift: false, severity: "none", details: "스냅샷 없음" };
    }

    const initial = this.snapshots.get(characterId)?.[0];
    if (!initial) {
      return { hasDrift: false, severity: "none", details: "초기 상태 없음" };
    }

    const driftPoints: string[] = [];

    // 1. Tone drift
    if (current.tone !== initial.tone) {
      driftPoints.push(
        `말투 변화: "${initial.tone}" -> "${current.tone}"`,
      );
    }

    // 2. Relationship drift — check for new or changed relationships
    const origRels = initial.relationships;
    const currRels = current.relationships;
    for (const [name, rel] of Object.entries(currRels)) {
      if (!(name in origRels)) {
        driftPoints.push(`새로운 관계: ${name} (${rel})`);
      } else if (origRels[name] !== rel) {
        driftPoints.push(
          `관계 변화: ${name} "${origRels[name]}" -> "${rel}"`,
        );
      }
    }

    // 3. Status drift
    if (current.status !== initial.status) {
      driftPoints.push(
        `상태 변화: "${initial.status}" -> "${current.status}"`,
      );
    }

    if (driftPoints.length === 0) {
      return { hasDrift: false, severity: "none", details: "변화 없음" };
    }

    const severity: DriftResult["severity"] =
      driftPoints.length >= 3 ? "major" : "minor";

    return {
      hasDrift: true,
      severity,
      details: driftPoints.join("\n"),
    };
  }

  // ---------- Serialization ----------

  toJSON(): SerializedCharacterTracker {
    const obj: Record<string, CharacterStateSnapshot[]> = {};
    for (const [key, val] of this.snapshots.entries()) {
      obj[key] = val;
    }
    return { snapshots: obj };
  }

  static fromJSON(data: object, seed: NovelSeed): CharacterTracker {
    const tracker = new CharacterTracker(seed);
    const parsed = data as SerializedCharacterTracker;

    if (parsed.snapshots) {
      for (const [charId, snaps] of Object.entries(parsed.snapshots)) {
        // Overwrite the initial-only list created by the constructor
        tracker.snapshots.set(
          charId,
          (snaps as CharacterStateSnapshot[]).sort(
            (a, b) => a.chapter - b.chapter,
          ),
        );
      }
    }

    return tracker;
  }
}
