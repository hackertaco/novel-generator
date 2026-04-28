// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ForeshadowingSchema,
  shouldAct,
  type Foreshadowing,
} from "@/lib/schema/foreshadowing";

describe("ForeshadowingSchema", () => {
  it("parses valid data", () => {
    const data = {
      id: "fs_1",
      name: "복선 1",
      description: "테스트 복선",
      importance: "critical",
      planted_at: 5,
      hints_at: [15, 30],
      reveal_at: 48,
      status: "pending",
      hint_count: 0,
    };

    const result = ForeshadowingSchema.parse(data);

    expect(result.id).toBe("fs_1");
    expect(result.name).toBe("복선 1");
    expect(result.description).toBe("테스트 복선");
    expect(result.importance).toBe("critical");
    expect(result.planted_at).toBe(5);
    expect(result.hints_at).toEqual([15, 30]);
    expect(result.reveal_at).toBe(48);
    expect(result.status).toBe("pending");
    expect(result.hint_count).toBe(0);
  });

  it('uses correct defaults (importance="normal", status="pending", hint_count=0)', () => {
    const data = {
      id: "fs_2",
      name: "복선 2",
      description: "기본값 테스트",
      planted_at: 10,
      reveal_at: 50,
    };

    const result = ForeshadowingSchema.parse(data);

    expect(result.importance).toBe("normal");
    expect(result.status).toBe("pending");
    expect(result.hint_count).toBe(0);
    expect(result.hints_at).toEqual([]);
  });
});

describe("shouldAct", () => {
  function makeForeshadowing(
    overrides: Partial<Foreshadowing> = {},
  ): Foreshadowing {
    return {
      id: "fs_1",
      name: "복선 1",
      description: "테스트 복선",
      importance: "critical",
      planted_at: 5,
      hints_at: [15, 30],
      reveal_at: 48,
      status: "pending",
      hint_count: 0,
      ...overrides,
    };
  }

  it('returns "plant" when chapter === planted_at and status === "pending"', () => {
    const fs = makeForeshadowing({ planted_at: 5, status: "pending" });
    expect(shouldAct(fs, 5)).toBe("plant");
  });

  it('returns "reveal" when chapter === reveal_at and status === "planted"', () => {
    const fs = makeForeshadowing({ reveal_at: 48, status: "planted" });
    expect(shouldAct(fs, 48)).toBe("reveal");
  });

  it('returns "hint" when chapter is in hints_at and status === "planted"', () => {
    const fs = makeForeshadowing({
      hints_at: [15, 30],
      status: "planted",
    });
    expect(shouldAct(fs, 15)).toBe("hint");
    expect(shouldAct(fs, 30)).toBe("hint");
  });

  it("returns null when no action is needed", () => {
    const fs = makeForeshadowing({ status: "planted" });
    // Chapter 20 is not planted_at, reveal_at, or in hints_at
    expect(shouldAct(fs, 20)).toBeNull();
  });

  it("supports legacy foreshadowing field names from raw seeds", () => {
    const legacy = {
      id: "fs_legacy",
      name: "복선 레거시",
      description: "옛 seed 포맷",
      importance: "critical",
      plant_chapter: 2,
      hint_chapters: [4, 6],
      reveal_chapter: 9,
      status: "planted",
    } as unknown as Foreshadowing;

    expect(shouldAct({ ...legacy, status: "pending" } as Foreshadowing, 2)).toBe("plant");
    expect(shouldAct(legacy, 4)).toBe("hint");
    expect(shouldAct(legacy, 9)).toBe("reveal");
  });

  it("returns null when status does not match (e.g., planted_at chapter but status is already planted)", () => {
    const fs = makeForeshadowing({ planted_at: 5, status: "planted" });
    // planted_at chapter but status is not "pending"
    expect(shouldAct(fs, 5)).toBeNull();
  });
});
