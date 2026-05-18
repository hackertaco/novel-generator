import { describe, expect, it } from "vitest";
import {
  addObjectiveFact,
  closeMatchingObjectiveFacts,
  createObjectiveFactStore,
  listObjectiveFactHistory,
  listObjectiveFacts,
  ObjectiveFactRecordSchema,
} from "@/lib/sim";

describe("objective fact store", () => {
  it("stores objective facts in a dedicated structured collection", () => {
    const store = createObjectiveFactStore();

    const record = addObjectiveFact(store, {
      chapter: 1,
      subject: "세라",
      predicate: "is_at",
      object: "황궁",
      category: "character_location",
      summary: "[character-location] 세라: 황궁",
      subjectEntity: {
        entityId: "hero",
        entityType: "character",
      },
      scope: {
        scopeId: "scope:character:hero",
        scopeType: "character",
        entityIds: ["hero"],
      },
      factLineId: "fact-line:character-location:hero",
      tags: ["character:hero"],
    });

    expect(Object.keys(store.byId)).toEqual([record.id]);
    expect(store.timeline).toEqual([record.id]);
    expect(store.activeIds).toEqual([record.id]);
    expect(store.bySubjectEntityId.hero).toEqual([record.id]);
    expect(store.byScopeId["scope:character:hero"]).toEqual([record.id]);
    expect(store.byLineId["fact-line:character-location:hero"]).toEqual([record.id]);
    expect(ObjectiveFactRecordSchema.parse(store.byId[record.id]).category).toBe("character_location");
    expect(record.subjectEntity.entityId).toBe("hero");
    expect(record.scope.scopeId).toBe("scope:character:hero");
    expect(record.recordedAt.chapter).toBe(1);
    expect(record.effectiveRange.fromChapter).toBe(1);
    expect(record.revision.revisionNumber).toBe(1);
    expect(listObjectiveFactHistory(store, { factId: record.id })).toMatchObject([
      {
        action: "recorded",
        factId: record.id,
      },
    ]);
  });

  it("closes superseded active facts instead of mixing truth into a note stream", () => {
    const store = createObjectiveFactStore();

    addObjectiveFact(store, {
      chapter: 0,
      subject: "세라",
      predicate: "is_at",
      object: "황궁",
      category: "character_location",
      summary: "[character-location] 세라: 황궁",
      subjectEntity: {
        entityId: "hero",
        entityType: "character",
      },
      scope: {
        scopeId: "scope:character:hero",
        scopeType: "character",
        entityIds: ["hero"],
      },
      factLineId: "fact-line:character-location:hero",
    });
    closeMatchingObjectiveFacts(
      store,
      {
        lineId: "fact-line:character-location:hero",
      },
      2,
      {
        effectiveToEventId: "evt-2",
        closedByEventId: "evt-2",
        reason: "세라가 북회랑으로 이동했다.",
      },
    );
    addObjectiveFact(store, {
      chapter: 2,
      subject: "세라",
      predicate: "is_at",
      object: "북회랑",
      category: "character_location",
      summary: "[character-location] 세라: 북회랑",
      sourceEventId: "evt-2",
      subjectEntity: {
        entityId: "hero",
        entityType: "character",
      },
      scope: {
        scopeId: "scope:character:hero",
        scopeType: "character",
        entityIds: ["hero"],
      },
      factLineId: "fact-line:character-location:hero",
      revisionReason: "세라의 현재 위치 갱신",
    });

    const facts = listObjectiveFacts(store, {
      lineId: "fact-line:character-location:hero",
    });

    expect(facts).toHaveLength(2);
    expect(facts[0].validToChapter).toBe(2);
    expect(facts[0].effectiveRange.toChapter).toBe(2);
    expect(facts[0].effectiveRange.toEventId).toBe("evt-2");
    expect(facts[0].revision.closedByEventId).toBe("evt-2");
    expect(facts[0].revision.closedByFactId).toBe(facts[1].id);
    expect(facts[1].validToChapter).toBeUndefined();
    expect(facts[1].object).toBe("북회랑");
    expect(facts[1].revision.previousFactId).toBe(facts[0].id);
    expect(facts[1].revision.revisionNumber).toBe(2);
    expect(store.activeIds).toEqual([facts[1].id]);

    expect(listObjectiveFactHistory(store, { factId: facts[0].id }).map((entry) => entry.action))
      .toEqual(["recorded", "closed", "linked"]);
    expect(listObjectiveFactHistory(store, { factId: facts[1].id }).map((entry) => entry.action))
      .toEqual(["recorded"]);
  });

  it("captures close and supersession as append-only revisions without mutating prior references", () => {
    const store = createObjectiveFactStore();

    const original = addObjectiveFact(store, {
      chapter: 4,
      subject: "세라",
      predicate: "is_at",
      object: "황궁",
      category: "character_location",
      summary: "[character-location] 세라: 황궁",
      sourceEventId: "evt-4",
      subjectEntity: {
        entityId: "hero",
        entityType: "character",
      },
      scope: {
        scopeId: "scope:character:hero",
        scopeType: "character",
        entityIds: ["hero"],
      },
      factLineId: "fact-line:character-location:hero",
      tags: ["character:hero"],
    });

    const originalSnapshot = structuredClone(original);

    closeMatchingObjectiveFacts(
      store,
      {
        lineId: "fact-line:character-location:hero",
      },
      5,
      {
        effectiveToEventId: "evt-5",
        closedByEventId: "evt-5",
        reason: "세라가 북회랑으로 이동했다.",
      },
    );

    addObjectiveFact(store, {
      chapter: 5,
      subject: "세라",
      predicate: "is_at",
      object: "북회랑",
      category: "character_location",
      summary: "[character-location] 세라: 북회랑",
      sourceEventId: "evt-5",
      subjectEntity: {
        entityId: "hero",
        entityType: "character",
      },
      scope: {
        scopeId: "scope:character:hero",
        scopeType: "character",
        entityIds: ["hero"],
      },
      factLineId: "fact-line:character-location:hero",
      revisionReason: "이동 이벤트로 현재 위치를 수정",
      tags: ["character:hero"],
    });

    expect(original).toEqual(originalSnapshot);

    const revisedOriginal = listObjectiveFacts(store, {
      lineId: "fact-line:character-location:hero",
      limit: 1,
    })[0];
    expect(revisedOriginal.validToChapter).toBeUndefined();

    const originalHistory = listObjectiveFactHistory(store, { factId: original.id });
    expect(originalHistory).toHaveLength(3);
    expect(originalHistory[1]).toMatchObject({
      action: "closed",
      eventId: "evt-5",
    });
    expect(originalHistory[2]).toMatchObject({
      action: "linked",
      reason: "이동 이벤트로 현재 위치를 수정",
    });
    expect(originalHistory[2]?.snapshot.revision.closedByFactId).toBe("evt-5:2");
  });
});
