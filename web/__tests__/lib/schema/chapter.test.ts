// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ChapterEventSchema,
  ChapterSummarySchema,
  CharacterChangeSchema,
  ForeshadowingTouchSchema,
} from "@/lib/schema/chapter";

describe("ChapterEventSchema", () => {
  it("parses with all EventType values", () => {
    const eventTypes = [
      "battle",
      "dialogue",
      "discovery",
      "training",
      "romance",
      "betrayal",
      "death",
      "power_up",
      "flashback",
      "cliffhanger",
    ] as const;

    for (const type of eventTypes) {
      const data = {
        type,
        participants: ["mc", "villain"],
        description: `${type} 이벤트`,
      };

      const result = ChapterEventSchema.parse(data);

      expect(result.type).toBe(type);
      expect(result.participants).toEqual(["mc", "villain"]);
      expect(result.description).toBe(`${type} 이벤트`);
      expect(result.outcome).toBeNull();
      expect(result.consequences).toEqual({});
    }
  });
});

describe("ChapterSummarySchema", () => {
  it("uses defaults (word_count=0, style_score=null)", () => {
    const data = {
      chapter_number: 1,
      title: "1화",
      plot_summary: "첫 번째 이야기",
      emotional_beat: "긴장감",
    };

    const result = ChapterSummarySchema.parse(data);

    expect(result.word_count).toBe(0);
    expect(result.style_score).toBeNull();
    expect(result.events).toEqual([]);
    expect(result.character_changes).toEqual([]);
    expect(result.foreshadowing_touched).toEqual([]);
    expect(result.cliffhanger).toBeNull();
  });
});

describe("CharacterChangeSchema", () => {
  it("parses correctly", () => {
    const data = {
      character_id: "mc",
      changes: { level: "5 → 6", status: "normal → injured" },
    };

    const result = CharacterChangeSchema.parse(data);

    expect(result.character_id).toBe("mc");
    expect(result.changes).toEqual({
      level: "5 → 6",
      status: "normal → injured",
    });
  });
});

describe("ForeshadowingTouchSchema", () => {
  it("parses correctly", () => {
    const data = {
      foreshadowing_id: "fs_1",
      action: "plant",
      context: "주인공이 의문의 검을 발견한다",
    };

    const result = ForeshadowingTouchSchema.parse(data);

    expect(result.foreshadowing_id).toBe("fs_1");
    expect(result.action).toBe("plant");
    expect(result.context).toBe("주인공이 의문의 검을 발견한다");
  });
});
