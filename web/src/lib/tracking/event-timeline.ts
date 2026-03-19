/**
 * Event Timeline — chronological index of story events.
 *
 * Stores what happened, when, where, and who was involved.
 * Enables selective retrieval: "give me all events involving character X"
 * or "what happened at location Y" without dumping everything into the prompt.
 */

export interface StoryEvent {
  chapter: number;
  /** Short description of what happened */
  description: string;
  /** Characters involved (IDs) */
  characters: string[];
  /** Location where it happened */
  location?: string;
  /** Type of event for filtering */
  type: "action" | "revelation" | "relationship" | "conflict" | "resolution" | "discovery" | "betrayal";
  /** Impact level — determines retrieval priority */
  impact: "minor" | "moderate" | "major";
  /** Whether this event has unresolved consequences */
  resolved: boolean;
}

export class EventTimeline {
  private events: StoryEvent[] = [];

  addEvents(chapter: number, events: StoryEvent[]): void {
    for (const event of events) {
      this.events.push({ ...event, chapter });
    }
  }

  /** Get all unresolved events (consequences still playing out) */
  getUnresolved(): StoryEvent[] {
    return this.events.filter((e) => !e.resolved);
  }

  /** Get events involving specific characters */
  getByCharacter(characterId: string, limit = 5): StoryEvent[] {
    return this.events
      .filter((e) => e.characters.includes(characterId))
      .slice(-limit);
  }

  /** Get events at a specific location */
  getByLocation(location: string): StoryEvent[] {
    return this.events.filter(
      (e) => e.location && e.location.includes(location),
    );
  }

  /** Get recent major events */
  getRecentMajor(limit = 3): StoryEvent[] {
    return this.events
      .filter((e) => e.impact === "major")
      .slice(-limit);
  }

  /** Mark an event as resolved */
  resolve(chapter: number, description: string): void {
    const event = this.events.find(
      (e) => e.chapter === chapter && e.description === description,
    );
    if (event) event.resolved = true;
  }

  /**
   * Build a context string for a specific scene.
   * Only retrieves relevant events based on characters and location.
   */
  buildContextForScene(
    characterIds: string[],
    location?: string,
  ): string {
    const parts: string[] = [];

    // 1. Unresolved events involving these characters
    const unresolvedForChars = this.getUnresolved()
      .filter((e) => e.characters.some((c) => characterIds.includes(c)));
    if (unresolvedForChars.length > 0) {
      parts.push("## 미해결 사건 (이 캐릭터 관련)");
      for (const e of unresolvedForChars.slice(-3)) {
        parts.push(`- [${e.chapter}화] ${e.description}`);
      }
    }

    // 2. Recent events at this location
    if (location) {
      const locationEvents = this.getByLocation(location).slice(-2);
      if (locationEvents.length > 0) {
        parts.push(`## 이 장소에서 일어난 사건`);
        for (const e of locationEvents) {
          parts.push(`- [${e.chapter}화] ${e.description}`);
        }
      }
    }

    // 3. Recent major events (world-level)
    const major = this.getRecentMajor(2);
    if (major.length > 0) {
      parts.push("## 최근 주요 사건");
      for (const e of major) {
        parts.push(`- [${e.chapter}화] ${e.description}`);
      }
    }

    return parts.length > 0 ? parts.join("\n") : "";
  }

  get size(): number {
    return this.events.length;
  }
}
