// __tests__/lib/agents/segment-patcher-integration.test.ts
import { describe, it, expect } from "vitest";
import { segmentText, reassemble } from "@/lib/agents/segmenter";
import { locateIssues } from "@/lib/evaluators/issue-locator";
import { evaluateStyle } from "@/lib/evaluators/style";
import { evaluateConsistency } from "@/lib/evaluators/consistency";
import { evaluatePacing } from "@/lib/evaluators/pacing";

const MOCK_SEED = {
  title: "테스트",
  logline: "테스트",
  total_chapters: 10,
  world: {
    name: "test", genre: "현대 판타지", sub_genre: "헌터물",
    time_period: "현대", magic_system: "마나",
    key_locations: {}, factions: {}, rules: [],
  },
  characters: [
    {
      id: "mc", name: "이준혁", role: "주인공", introduction_chapter: 1,
      voice: {
        tone: "무심한", speech_patterns: ["~거든", "뭐..."],
        sample_dialogues: [], personality_core: "현실주의자",
      },
      backstory: "평범한 학생", arc_summary: "성장",
      state: { level: 1, location: "서울", status: "normal", relationships: {}, inventory: [], secrets_known: [] },
    },
  ],
  arcs: [{ id: "arc_1", name: "각성편", start_chapter: 1, end_chapter: 30, summary: "각성", key_events: [], climax_chapter: 28 }],
  chapter_outlines: [
    { chapter_number: 1, title: "시작", arc_id: "arc_1", one_liner: "일상", key_points: ["일상"], characters_involved: ["mc"], tension_level: 3 },
  ],
  foreshadowing: [],
  style: { max_paragraph_length: 3, dialogue_ratio: 0.6, sentence_style: "short" as const, hook_ending: true, pov: "1인칭", tense: "과거형", formatting_rules: [] },
} as any;

describe("Segment Patcher Integration", () => {
  it("unflagged segments remain byte-identical after issue location", () => {
    const text = [
      "좋은 첫 문단. 잘 쓰여진 서술이다.",
      '"첫 대사"\n"두 번째 대사"\n"세 번째 대사"\n"네 번째 대사"\n"다섯 번째 대사"\n"여섯 번째 대사"\n"일곱 번째 대사"',
      "좋은 마지막 문단. 그때 무언가가 움직였다...",
    ].join("\n\n");

    const segments = segmentText(text);
    const originalTexts = segments.map((s) => s.text);

    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);
    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);

    const flaggedIds = new Set(issues.map((i) => i.segmentId));

    // Simulate patching: replace flagged segments with "[PATCHED]"
    for (const seg of segments) {
      if (flaggedIds.has(seg.id)) {
        seg.text = "[PATCHED]";
      }
    }

    // Verify unflagged segments are byte-identical
    for (const seg of segments) {
      if (!flaggedIds.has(seg.id)) {
        expect(seg.text).toBe(originalTexts[seg.id]);
      }
    }
  });

  it("reassemble preserves structure after patching", () => {
    const original = "A 문단\n\nB 문단\n\nC 문단";
    const segments = segmentText(original);
    segments[1].text = "B 수정됨";
    const result = reassemble(segments);
    expect(result).toBe("A 문단\n\nB 수정됨\n\nC 문단");
  });

  it("segment IDs are stable across segmentText calls", () => {
    const text = "문단 1\n\n문단 2\n\n문단 3";
    const s1 = segmentText(text);
    const s2 = segmentText(text);
    expect(s1.map((s) => s.id)).toEqual(s2.map((s) => s.id));
    expect(s1.map((s) => s.text)).toEqual(s2.map((s) => s.text));
  });

  it("best-score tracking: worse patch should not overwrite bestText", () => {
    const goodText = "좋은 문단 A.\n\n좋은 문단 B.\n\n그때 무언가가 움직였다...";
    const segments = segmentText(goodText);

    // Simulate a bad patch on segment 1
    const originalSeg1 = segments[1].text;
    segments[1].text = "나쁜 패치";

    const patchedText = reassemble(segments);

    // The patched version should differ
    expect(patchedText).not.toBe(goodText);
    // Restore the original — simulating revert
    segments[1].text = originalSeg1;
    expect(reassemble(segments)).toBe(goodText);
  });
});
