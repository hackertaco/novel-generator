// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThreadType =
  | "encounter"
  | "question"
  | "promise"
  | "mystery"
  | "conflict";

export type ThreadStatus = "open" | "progressing" | "resolved";

export interface NarrativeThread {
  id: string;
  planted_chapter: number;
  content: string; // e.g. "정원에서 낯선 남자를 목격"
  type: ThreadType;
  characters_involved: string[];
  // Urgency
  must_mention_by: number; // chapter deadline
  mention_interval: number; // remind every N chapters (default: 5)
  // Status
  status: ThreadStatus;
  last_mentioned: number; // last chapter that referenced this
  mentions: number[]; // all chapters that mentioned this
}

/** Input type when adding a new thread (auto-filled fields omitted). */
export type NewThreadInput = Omit<
  NarrativeThread,
  "status" | "last_mentioned" | "mentions"
>;

interface SerializedThreadTracker {
  threads: NarrativeThread[];
}

// ---------------------------------------------------------------------------
// ThreadTracker
// ---------------------------------------------------------------------------

export class ThreadTracker {
  private threads: Map<string, NarrativeThread>;

  constructor() {
    this.threads = new Map();
  }

  // ---------- Mutation ----------

  /** Add a new narrative thread. */
  addThread(input: NewThreadInput): void {
    const thread: NarrativeThread = {
      ...input,
      mention_interval: input.mention_interval ?? 5,
      status: "open",
      last_mentioned: input.planted_chapter,
      mentions: [input.planted_chapter],
    };
    this.threads.set(thread.id, thread);
  }

  /** Update a thread after it is referenced in a chapter. */
  updateThread(
    threadId: string,
    chapter: number,
    newStatus?: ThreadStatus,
  ): void {
    const thread = this.threads.get(threadId);
    if (!thread) return;

    thread.last_mentioned = chapter;
    if (!thread.mentions.includes(chapter)) {
      thread.mentions.push(chapter);
      thread.mentions.sort((a, b) => a - b);
    }

    if (newStatus) {
      thread.status = newStatus;
    }
  }

  // ---------- Query ----------

  /**
   * Threads that MUST be mentioned in the given chapter
   * (deadline reached or past, and still open/progressing).
   */
  getUrgentThreads(chapter: number): NarrativeThread[] {
    const results: NarrativeThread[] = [];
    for (const thread of this.threads.values()) {
      if (thread.status === "resolved") continue;
      if (thread.must_mention_by <= chapter) {
        results.push(thread);
      }
    }
    return results;
  }

  /**
   * Threads that SHOULD be mentioned — their mention_interval has elapsed
   * since last mention, but deadline hasn't passed yet.
   */
  getSuggestedThreads(chapter: number): NarrativeThread[] {
    const results: NarrativeThread[] = [];
    for (const thread of this.threads.values()) {
      if (thread.status === "resolved") continue;
      // Skip if already urgent
      if (thread.must_mention_by <= chapter) continue;

      const sinceLastMention = chapter - thread.last_mentioned;
      if (sinceLastMention >= thread.mention_interval) {
        results.push(thread);
      }
    }
    return results;
  }

  /** Get all open (non-resolved) threads. */
  getOpenThreads(): NarrativeThread[] {
    const results: NarrativeThread[] = [];
    for (const thread of this.threads.values()) {
      if (thread.status !== "resolved") {
        results.push(thread);
      }
    }
    return results;
  }

  /**
   * Threads that are past their deadline AND haven't been mentioned
   * recently (forgotten).
   */
  getForgottenThreads(currentChapter: number): NarrativeThread[] {
    const results: NarrativeThread[] = [];
    for (const thread of this.threads.values()) {
      if (thread.status === "resolved") continue;
      if (
        thread.must_mention_by < currentChapter &&
        thread.last_mentioned < thread.must_mention_by
      ) {
        results.push(thread);
      }
    }
    return results;
  }

  /** Get a thread by ID. */
  getThread(threadId: string): NarrativeThread | undefined {
    return this.threads.get(threadId);
  }

  // ---------- Serialization ----------

  toJSON(): SerializedThreadTracker {
    return { threads: Array.from(this.threads.values()) };
  }

  static fromJSON(data: object): ThreadTracker {
    const tracker = new ThreadTracker();
    const parsed = data as SerializedThreadTracker;

    if (parsed.threads && Array.isArray(parsed.threads)) {
      for (const thread of parsed.threads) {
        tracker.threads.set(thread.id, thread);
      }
    }

    return tracker;
  }
}
