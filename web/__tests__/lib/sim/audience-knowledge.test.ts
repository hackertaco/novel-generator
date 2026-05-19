import { describe, expect, it } from "vitest";

import {
  addAudienceKnowledge,
  cloneAudienceKnowledgeStore,
  createAudienceKnowledgeStore,
  getAudienceKnowledgeBySummary,
  hasAudienceKnowledgeSummary,
  listAudienceKnowledge,
  updateAudienceKnowledgeStatus,
} from "@/lib/sim/audience-knowledge";

describe("audience-knowledge store", () => {
  it("creates an empty store with byId/timeline/bySummary", () => {
    const store = createAudienceKnowledgeStore();
    expect(store.byId).toEqual({});
    expect(store.timeline).toEqual([]);
    expect(store.bySummary).toEqual({});
  });

  it("adds a record, indexes by summary, and assigns stable ids", () => {
    const store = createAudienceKnowledgeStore();
    const record = addAudienceKnowledge(store, {
      chapter: 1,
      kind: "fact_revealed",
      subject: "황태자",
      summary: "황태자는 약혼식 직전 파혼을 선언했다",
      source: "action",
    });

    expect(record.id).toBe("audience:1");
    expect(store.timeline).toEqual(["audience:1"]);
    expect(hasAudienceKnowledgeSummary(store, "황태자는 약혼식 직전 파혼을 선언했다")).toBe(true);
    expect(
      getAudienceKnowledgeBySummary(store, "황태자는 약혼식 직전 파혼을 선언했다")?.id,
    ).toBe("audience:1");
  });

  it("dedupes by normalized summary on repeated adds", () => {
    const store = createAudienceKnowledgeStore();
    const first = addAudienceKnowledge(store, {
      chapter: 1,
      kind: "fact_revealed",
      subject: "황태자",
      summary: "황태자는 파혼을 선언했다",
    });
    const second = addAudienceKnowledge(store, {
      chapter: 2,
      kind: "hint_planted",
      subject: "황태자",
      summary: "  황태자는 파혼을 선언했다  ",
    });

    expect(second.id).toBe(first.id);
    expect(store.timeline).toHaveLength(1);
  });

  it("defaults must_understand records to pending status", () => {
    const store = createAudienceKnowledgeStore();
    const record = addAudienceKnowledge(store, {
      chapter: 1,
      kind: "must_understand",
      subject: "전생",
      summary: "엘리시아는 전생에서 독살당했다",
    });

    expect(record.status).toBe("pending");
  });

  it("lists records with kind/status/uptoChapter filters", () => {
    const store = createAudienceKnowledgeStore();
    addAudienceKnowledge(store, {
      chapter: 1,
      kind: "fact_revealed",
      subject: "약혼",
      summary: "약혼식이 열렸다",
    });
    addAudienceKnowledge(store, {
      chapter: 1,
      kind: "hint_planted",
      subject: "독",
      summary: "은잔에서 떫은 냄새가 났다",
      status: "pending",
    });
    addAudienceKnowledge(store, {
      chapter: 3,
      kind: "fact_revealed",
      subject: "독",
      summary: "독은 황실 약초에서 추출됐다",
    });

    expect(
      listAudienceKnowledge(store, { kinds: ["hint_planted"] }).map((r) => r.summary),
    ).toEqual(["은잔에서 떫은 냄새가 났다"]);
    expect(
      listAudienceKnowledge(store, { statuses: ["pending"] }).map((r) => r.summary),
    ).toEqual(["은잔에서 떫은 냄새가 났다"]);
    expect(
      listAudienceKnowledge(store, { uptoChapter: 1 }).map((r) => r.chapter),
    ).toEqual([1, 1]);
  });

  it("updates record status without mutating other fields", () => {
    const store = createAudienceKnowledgeStore();
    const planted = addAudienceKnowledge(store, {
      chapter: 1,
      kind: "hint_planted",
      subject: "독",
      summary: "은잔에서 떫은 냄새가 났다",
      status: "pending",
    });

    const resolved = updateAudienceKnowledgeStatus(store, planted.id, "resolved", 5);
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolvedAtChapter).toBe(5);
    expect(resolved?.summary).toBe(planted.summary);
    expect(store.byId[planted.id].status).toBe("resolved");
  });

  it("clones the store without aliasing inner arrays/records", () => {
    const original = createAudienceKnowledgeStore();
    addAudienceKnowledge(original, {
      chapter: 1,
      kind: "fact_revealed",
      subject: "약혼",
      summary: "약혼식이 열렸다",
      references: { objectiveFactIds: ["fact-1"] },
      tags: ["intro"],
    });

    const clone = cloneAudienceKnowledgeStore(original);
    addAudienceKnowledge(clone, {
      chapter: 2,
      kind: "fact_revealed",
      subject: "독",
      summary: "독이 검출됐다",
    });

    expect(original.timeline).toHaveLength(1);
    expect(clone.timeline).toHaveLength(2);
    clone.byId["audience:1"].tags.push("mutated");
    expect(original.byId["audience:1"].tags).toEqual(["intro"]);
    clone.byId["audience:1"].references.objectiveFactIds.push("fact-2");
    expect(original.byId["audience:1"].references.objectiveFactIds).toEqual(["fact-1"]);
  });
});
