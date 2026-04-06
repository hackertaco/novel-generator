import { describe, it, expect } from "vitest";
import {
  detectEndingRepeat,
  detectSentenceStartRepeat,
  detectShortDialogueSequence,
  sanitize,
  deduplicateParagraphs,
  deduplicateSentences,
  fixEndingRepeat,
  fixSentenceStartRepeat,
} from "@/lib/agents/rule-guard";

// ---------------------------------------------------------------------------
// detectEndingRepeat
// ---------------------------------------------------------------------------

describe("detectEndingRepeat", () => {
  it("detects 3+ consecutive sentences with the same ending", () => {
    const text = "문은 닫혀 있었다. 정원사가 흙을 고르고 있었다. 그녀는 가까이 붙었다.";
    const issues = detectEndingRepeat(text);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe("ending_repeat");
    expect(issues[0].detail).toContain("었다");
  });

  it("returns no issues when endings are all different", () => {
    const text = "문은 닫혀 있었다. 그녀가 웃었지. 어디로 갈까요?";
    const issues = detectEndingRepeat(text);
    expect(issues).toEqual([]);
  });

  it("returns no issues for fewer than 3 sentences", () => {
    const text = "문은 닫혀 있었다. 그녀도 있었다.";
    const issues = detectEndingRepeat(text);
    expect(issues).toEqual([]);
  });

  it("detects repeat across a run of 4 sentences (one issue)", () => {
    // All four sentences end with "었다" (2-char ending before period)
    const text =
      "바람이 불었다. 나뭇잎이 날아갔었다. 하늘이 어두웠었다. 비가 쏟아졌었다.";
    const issues = detectEndingRepeat(text);
    // Only one issue emitted when the run first hits 3
    expect(issues.length).toBe(1);
  });

  it("handles multiple paragraphs independently", () => {
    const para1 = "문은 닫혀 있었다. 정원사가 있었다. 그녀도 있었다.";
    const para2 = "해가 떴다. 새가 울었지. 바람이 분다.";
    const text = `${para1}\n\n${para2}`;
    const issues = detectEndingRepeat(text);
    expect(issues.length).toBe(1);
    expect(issues[0].position).toBe(0); // first paragraph
  });
});

// ---------------------------------------------------------------------------
// detectSentenceStartRepeat
// ---------------------------------------------------------------------------

describe("detectSentenceStartRepeat", () => {
  it("detects 3+ consecutive sentences starting with the same characters", () => {
    const text = "그는 걸었다. 그는 멈췄다. 그는 돌아보았다.";
    const issues = detectSentenceStartRepeat(text);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe("sentence_start_repeat");
    expect(issues[0].detail).toContain("그는");
  });

  it("returns no issues when sentence starts are varied", () => {
    const text = "그는 걸었다. 바람이 불었다. 하늘이 맑았다.";
    const issues = detectSentenceStartRepeat(text);
    expect(issues).toEqual([]);
  });

  it("returns no issues for fewer than 3 sentences", () => {
    const text = "그는 걸었다. 그는 멈췄다.";
    const issues = detectSentenceStartRepeat(text);
    expect(issues).toEqual([]);
  });

  it("detects repeats only within the same paragraph", () => {
    const para1 = "그는 걸었다. 바람이 불었다. 하늘이 맑았다.";
    const para2 = "그녀는 웃었다. 그녀는 달렸다. 그녀는 넘어졌다.";
    const text = `${para1}\n\n${para2}`;
    const issues = detectSentenceStartRepeat(text);
    expect(issues.length).toBe(1);
    expect(issues[0].position).toBe(1); // second paragraph
  });
});

// ---------------------------------------------------------------------------
// detectShortDialogueSequence
// ---------------------------------------------------------------------------

describe("detectShortDialogueSequence", () => {
  it("detects 3+ consecutive short dialogues without narration", () => {
    const text = '"응."\n"그래."\n"알겠어."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe("short_dialogue_sequence");
  });

  it("returns no issues when dialogues are long enough", () => {
    const text = '"오늘 날씨가 정말 좋은 것 같아요."\n"그러게요, 산책이라도 갈까요?"\n"좋은 생각이에요, 같이 가요."';
    const issues = detectShortDialogueSequence(text);
    expect(issues).toEqual([]);
  });

  it("returns no issues when narration separates short dialogues", () => {
    const text = '"응."\n그녀는 고개를 끄덕였다.\n"그래."\n그는 미소를 지었다.\n"알겠어."';
    const issues = detectShortDialogueSequence(text);
    expect(issues).toEqual([]);
  });

  it("marks severity as critical for 5+ short dialogues", () => {
    const text = '"응."\n"그래."\n"뭐."\n"어."\n"헐."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe("critical");
  });

  it("does not trigger with only 2 short dialogues", () => {
    const text = '"응."\n"그래."';
    const issues = detectShortDialogueSequence(text);
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sanitize
// ---------------------------------------------------------------------------

describe("sanitize", () => {
  it("removes LLM meta markers like '--- 수정 대상 ---'", () => {
    const text = "--- 수정 대상 ---\n본문 내용입니다.";
    expect(sanitize(text)).toBe("본문 내용입니다.");
  });

  it("removes editor note bracket lines", () => {
    const text = "본문입니다.\n[편집자 노트: 수정 필요]\n다음 문장.";
    expect(sanitize(text)).toBe("본문입니다.\n\n다음 문장.");
  });

  it("collapses multiple blank lines", () => {
    const text = "첫째.\n\n\n\n\n둘째.";
    expect(sanitize(text)).toBe("첫째.\n\n둘째.");
  });

  it("returns clean text unchanged", () => {
    const text = "깨끗한 본문입니다. 아무 문제 없습니다.";
    expect(sanitize(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// deduplicateParagraphs
// ---------------------------------------------------------------------------

describe("deduplicateParagraphs", () => {
  it("removes exact duplicate paragraphs", () => {
    const text = "첫 번째 문단입니다.\n\n첫 번째 문단입니다.\n\n두 번째 문단입니다.";
    const result = deduplicateParagraphs(text);
    expect(result).toBe("첫 번째 문단입니다.\n\n두 번째 문단입니다.");
  });

  it("keeps unique paragraphs intact", () => {
    const text = "하나.\n\n둘.\n\n셋.";
    expect(deduplicateParagraphs(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// deduplicateSentences
// ---------------------------------------------------------------------------

describe("deduplicateSentences", () => {
  it("removes duplicate sentences within a paragraph (fingerprint >= 15 chars)", () => {
    // Sentences must be 15+ chars for dedup fingerprint to activate
    const sent = "그는 천천히 걸으면서 주변을 살폈다.";
    const text = `${sent} 바람이 세차게 불어오고 있었다. ${sent}`;
    const result = deduplicateSentences(text);
    expect(result).toBe(`${sent} 바람이 세차게 불어오고 있었다.`);
  });

  it("removes duplicate sentences across paragraphs", () => {
    const sent = "그는 천천히 걸으면서 주변을 살폈다.";
    const text = `${sent} 바람이 세차게 불어오고 있었다.\n\n${sent} 하늘이 점점 어두워지고 있었다.`;
    const result = deduplicateSentences(text);
    expect(result).toBe(`${sent} 바람이 세차게 불어오고 있었다.\n\n하늘이 점점 어두워지고 있었다.`);
  });

  it("does not deduplicate short sentences (< 15 chars fingerprint)", () => {
    const text = "그는 걸었다. 바람이 불었다. 그는 걸었다.";
    const result = deduplicateSentences(text);
    // Short sentences are kept because fingerprint < 15 chars
    expect(result).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// fixEndingRepeat
// ---------------------------------------------------------------------------

describe("fixEndingRepeat", () => {
  it("merges sentences to break 3-run ending repeats", () => {
    const text = "문은 닫혀 있었다. 정원사가 흙을 고르고 있었다. 그녀는 가까이 붙었다.";
    const result = fixEndingRepeat(text);
    // The middle sentence should get a connective ending instead of "었다."
    expect(result).not.toBe(text);
    expect(result).toContain("었고,");
  });

  it("leaves text unchanged when no 3-run repeats exist", () => {
    const text = "문은 닫혀 있었다. 그녀가 웃었지. 어디로 갈까요?";
    expect(fixEndingRepeat(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// fixSentenceStartRepeat
// ---------------------------------------------------------------------------

describe("fixSentenceStartRepeat", () => {
  it("replaces repeated name starts with a pronoun", () => {
    const text = "세레인은 걸었다. 세레인은 멈췄다. 세레인은 돌아보았다.";
    const genders = new Map([["세레인", "female"]]);
    const result = fixSentenceStartRepeat(text, genders);
    expect(result).toContain("그녀는");
  });

  it("uses male pronoun by default", () => {
    const text = "도현이는 걸었다. 도현이는 멈췄다. 도현이는 돌아보았다.";
    const result = fixSentenceStartRepeat(text);
    // Without gender info, defaults to male pronoun
    expect(result).toContain("그는");
  });

  it("leaves text unchanged when starts are varied", () => {
    const text = "그는 걸었다. 바람이 불었다. 하늘이 맑았다.";
    expect(fixSentenceStartRepeat(text)).toBe(text);
  });
});
