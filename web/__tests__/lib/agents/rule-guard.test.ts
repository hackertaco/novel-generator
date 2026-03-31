import { describe, it, expect } from "vitest";
import {
  sanitize,
  deduplicateParagraphs,
  deduplicateSentences,
  fixEndingRepeat,
  fixSentenceStartRepeat,
  detectEndingRepeat,
  detectSentenceStartRepeat,
  detectShortDialogueSequence,
  trimPostHookPadding,
} from "@/lib/agents/rule-guard";

// ===========================================================================
// 1. sanitize
// ===========================================================================

describe("sanitize", () => {
  it("removes --- 수정 대상 --- markers", () => {
    const text = "좋은 문장.\n\n--- 수정 대상 ---\n다른 문장.";
    expect(sanitize(text)).not.toContain("수정 대상");
  });

  it("removes --- 수정 지시 --- markers", () => {
    const text = "본문.\n--- 수정 지시 사항 ---\n이어서.";
    expect(sanitize(text)).not.toContain("수정 지시");
  });

  it("removes --- 편집 --- markers", () => {
    const text = "본문.\n--- 편집 ---\n이어서.";
    expect(sanitize(text)).not.toContain("편집");
  });

  it("removes --- 문맥 --- markers", () => {
    const text = "앞문단.\n--- 문맥 (읽기 전용, 수정하지 마세요) ---\n뒷문단.";
    expect(sanitize(text)).not.toContain("문맥");
  });

  it("removes 수정: prefix lines", () => {
    const text = "정상 문장.\n수정: 이 부분을 고쳤습니다.\n다음 문장.";
    expect(sanitize(text)).not.toContain("수정:");
  });

  it("removes 수정 : prefix lines (with space before colon)", () => {
    const text = "정상 문장.\n수정 : 여기를 바꿈.\n다음 문장.";
    const result = sanitize(text);
    expect(result).not.toContain("수정 :");
  });

  it("removes editor comment brackets", () => {
    const text = "본문.\n[편집자 노트: 여기를 수정함]\n이어서.";
    expect(sanitize(text)).not.toContain("편집자 노트");
  });

  it("removes LLM meta commentary (수정본, 정리했습니다, etc.)", () => {
    const lines = [
      "아래는 수정본입니다.",
      "내용을 정리했습니다.",
      "교정된 결과물입니다.",
      "문장을 다듬었습니다.",
      "윤문했습니다.",
    ];
    for (const meta of lines) {
      const text = `소설 본문.\n${meta}\n이어지는 본문.`;
      expect(sanitize(text)).not.toContain(meta);
    }
  });

  it("removes scene meta markers (씬 1, 씬 2 시작부분, etc.)", () => {
    const text = "본문.\n## 씬 1 시작부분\n이어지는 본문.\n씬 2\n마지막.";
    const result = sanitize(text);
    expect(result).not.toContain("씬 1");
    expect(result).not.toContain("씬 2");
  });

  it("removes 수정된 씬 markers", () => {
    const text = "본문.\n수정된 씬 3\n이어서.";
    const result = sanitize(text);
    expect(result).not.toContain("수정된 씬");
  });

  it("removes LLM format acknowledgments", () => {
    const lines = [
      "출력은 요청하신 형식입니다.",
      "결과물은 아래 포맷입니다.",
      "아래는 요청하신 형식입니다.",
    ];
    for (const ack of lines) {
      const text = `${ack}\n본문입니다.`;
      expect(sanitize(text)).not.toContain(ack);
    }
  });

  it("removes bracket meta markers like [원문], [계속], [이어서]", () => {
    const markers = ["[원문]", "[계속]", "[이어서]", "[다음]", "[원본]"];
    for (const m of markers) {
      const text = `본문.\n${m}\n이어서.`;
      expect(sanitize(text)).not.toContain(m);
    }
  });

  it("removes editorial headers like ## 교정 결과", () => {
    const headers = [
      "## 교정 결과",
      "### 수정 사항",
      "# 편집 완료",
      "## 윤문 결과",
      "### 개선 내용",
    ];
    for (const h of headers) {
      const text = `${h}\n본문입니다.`;
      expect(sanitize(text)).not.toContain(h);
    }
  });

  it("collapses multiple blank lines into double newline", () => {
    const text = "문단 하나.\n\n\n\n\n문단 둘.";
    const result = sanitize(text);
    expect(result).toBe("문단 하나.\n\n문단 둘.");
  });

  it("trims leading and trailing whitespace", () => {
    const text = "  \n본문입니다.\n  ";
    expect(sanitize(text)).toBe("본문입니다.");
  });

  it("preserves normal text unchanged", () => {
    const text = "정상적인 소설 본문입니다. 아무 문제가 없다.";
    expect(sanitize(text)).toBe(text);
  });

  it("returns empty string for empty input", () => {
    expect(sanitize("")).toBe("");
  });

  it("handles text that is only meta markers", () => {
    const text = "--- 수정 대상 ---\n수정: 내용\n[편집자 노트: 삭제]";
    const result = sanitize(text);
    expect(result).toBe("");
  });
});

// ===========================================================================
// 2. deduplicateParagraphs
// ===========================================================================

describe("deduplicateParagraphs", () => {
  it("removes exact duplicate paragraphs", () => {
    const text = "첫 번째 문단.\n\n두 번째 문단.\n\n첫 번째 문단.";
    const result = deduplicateParagraphs(text);
    expect(result.split("\n\n")).toHaveLength(2);
  });

  it("removes near-duplicate paragraphs sharing 50-char prefix", () => {
    const prefix = "복도를 지나며 나는 마법사의 음모에 대한 첫 단서를 찾을 수 있을 것이라는 희망을 품었다.";
    const text = `${prefix} 첫 번째 버전.\n\n다른 문단.\n\n${prefix} 두 번째 버전.`;
    const result = deduplicateParagraphs(text);
    expect(result.split("\n\n")).toHaveLength(2);
    // Should keep the first occurrence
    expect(result).toContain("첫 번째 버전");
    expect(result).not.toContain("두 번째 버전");
  });

  it("keeps non-duplicate paragraphs intact", () => {
    const text = "문단 하나.\n\n문단 둘.\n\n문단 셋.";
    expect(deduplicateParagraphs(text).split("\n\n")).toHaveLength(3);
  });

  it("handles single paragraph", () => {
    const text = "유일한 문단입니다.";
    expect(deduplicateParagraphs(text)).toBe(text);
  });

  it("handles empty text", () => {
    expect(deduplicateParagraphs("")).toBe("");
  });

  it("filters out empty paragraphs from whitespace-only splits", () => {
    const text = "문단 하나.\n\n\n\n문단 둘.";
    const result = deduplicateParagraphs(text);
    // The empty segment between \n\n\n\n is filtered by .filter(p => p.length > 0)
    expect(result.split("\n\n").length).toBeLessThanOrEqual(2);
  });

  it("keeps paragraphs with different first 50 chars even if similar later", () => {
    const a = "가나다라마바사아자차카타파하갈날달랄말발살알잘찰칼탈팔할감남담람맘밤삼암잠참캄탐팜함 끝이 같다.";
    const b = "하파타카차자아사바마라다나가할팔탈칼찰잘암알살발말랄담남감함팜탐캄참잠암삼밤맘람담남감 끝이 같다.";
    const text = `${a}\n\n${b}`;
    expect(deduplicateParagraphs(text).split("\n\n")).toHaveLength(2);
  });
});

// ===========================================================================
// 3. deduplicateSentences
// ===========================================================================

describe("deduplicateSentences", () => {
  it("removes duplicate sentences within a paragraph", () => {
    // Sentence must be 15+ chars for fingerprint-based dedup to work
    const sent = "나는 깊은 숲속을 천천히 걸으며 주변을 살폈다.";
    const text = `${sent} 바람이 시원하게 불어왔다. ${sent}`;
    const result = deduplicateSentences(text);
    const sentences = result.split(/(?<=[.!?])\s+/);
    expect(sentences).toHaveLength(2);
  });

  it("removes duplicate sentences across paragraphs", () => {
    const sent = "길고긴문장이여서서른자가넘는문장이라서중복판단이가능합니다.";
    const text = `${sent} 다른 문장.\n\n${sent} 또 다른 문장.`;
    const result = deduplicateSentences(text);
    // The duplicate sentence in the second paragraph should be removed
    const paragraphs = result.split("\n\n");
    expect(paragraphs).toHaveLength(2);
    // Second paragraph should not start with the duplicate
    expect(paragraphs[1]).not.toMatch(/^길고긴문장/);
  });

  it("keeps short sentences (< 15 char fingerprint) even if duplicated", () => {
    // Sentences with < 15 char fingerprint are not deduplicated
    const text = "안녕. 좋아. 안녕.";
    const result = deduplicateSentences(text);
    const sentences = result.split(/(?<=[.!?])\s+/);
    // Short fingerprints are skipped for dedup
    expect(sentences).toHaveLength(3);
  });

  it("handles single sentence", () => {
    const text = "유일한 문장입니다.";
    expect(deduplicateSentences(text)).toBe(text);
  });

  it("handles empty text", () => {
    expect(deduplicateSentences("")).toBe("");
  });

  it("preserves paragraph structure", () => {
    const text = "첫 문단의 문장입니다.\n\n두 번째 문단의 문장입니다.";
    const result = deduplicateSentences(text);
    expect(result.split("\n\n")).toHaveLength(2);
  });
});

// ===========================================================================
// 4. fixEndingRepeat
// ===========================================================================

describe("fixEndingRepeat", () => {
  it("merges when 3 consecutive sentences share the same ending", () => {
    const text = "문은 닫혀 있었다. 정원사가 흙을 고르고 있었다. 그녀는 가까이 붙었다.";
    const result = fixEndingRepeat(text);
    // The middle sentence should be merged with a connective
    expect(result).toContain("었고,");
    // The three sentences should become two (middle merged into third)
    expect(result).not.toMatch(/있었다\.\s+그녀는/);
  });

  it("uses correct connectives for 었다 endings", () => {
    const text = "그는 걸었다. 그녀는 웃었다. 바람이 불었다.";
    const result = fixEndingRepeat(text);
    expect(result).toContain("었고,");
  });

  it("uses correct connectives for 했다 endings", () => {
    const text = "그는 말했다. 그녀는 대답했다. 아이가 노래했다.";
    const result = fixEndingRepeat(text);
    expect(result).toContain("했고,");
  });

  it("uses correct connectives for 졌다 endings", () => {
    const text = "하늘이 어두워졌다. 거리가 조용해졌다. 공기가 차가워졌다.";
    const result = fixEndingRepeat(text);
    expect(result).toContain("졌고,");
  });

  it("does not modify text with fewer than 3 sentences", () => {
    const text = "그는 걸었다. 그녀는 웃었다.";
    expect(fixEndingRepeat(text)).toBe(text);
  });

  it("does not modify text with varied endings", () => {
    const text = "그는 걸었다. 바람이 분다. 꽃이 아름답지.";
    expect(fixEndingRepeat(text)).toBe(text);
  });

  it("handles single sentence", () => {
    const text = "단일 문장이었다.";
    expect(fixEndingRepeat(text)).toBe(text);
  });

  it("handles empty text", () => {
    expect(fixEndingRepeat("")).toBe("");
  });

  it("operates per paragraph", () => {
    // Only the first paragraph has 3 consecutive same endings
    const p1 = "그는 걸었다. 그녀는 웃었다. 바람이 불었다.";
    const p2 = "하늘은 맑다. 비가 온다. 구름이 낀다.";
    const text = `${p1}\n\n${p2}`;
    const result = fixEndingRepeat(text);
    // First paragraph should be fixed
    expect(result.split("\n\n")[0]).toContain("었고,");
    // Second paragraph has "다" endings with different 2-char suffixes (맑다, 온다, 낀다)
    // "맑다" → "맑다", "온다" → "온다", "낀다" → "낀다" — all different 2-char endings
    expect(result.split("\n\n")[1]).toBe(p2);
  });

  it("uses fallback connective for unknown endings", () => {
    // Construct 3 sentences with same 2-char ending not in the connectives map
    const text = "그것은 크구나. 이것도 크구나. 저것도 크구나.";
    const result = fixEndingRepeat(text);
    // Should use fallback: last char + "고,"
    expect(result).toContain("고,");
  });
});

// ===========================================================================
// 5. fixSentenceStartRepeat
// ===========================================================================

describe("fixSentenceStartRepeat", () => {
  it("replaces repeated name with male pronoun (그는)", () => {
    const text = "세레인은 걸었다. 세레인은 멈췄다. 세레인은 돌아봤다.";
    const genderMap = new Map([["세레인", "male"]]);
    const result = fixSentenceStartRepeat(text, genderMap);
    expect(result).toContain("그는");
  });

  it("replaces repeated name with female pronoun (그녀는)", () => {
    const text = "미라는 걸었다. 미라는 멈췄다. 미라는 돌아봤다.";
    const genderMap = new Map([["미라", "female"]]);
    const result = fixSentenceStartRepeat(text, genderMap);
    expect(result).toContain("그녀는");
  });

  it("defaults to male pronoun when gender is not in map", () => {
    const text = "준혁이 걸었다. 준혁이 멈췄다. 준혁이 돌아봤다.";
    const result = fixSentenceStartRepeat(text);
    expect(result).toContain("그는");
  });

  it("replaces only the second sentence's name (keeps 1st and 3rd)", () => {
    const text = "세레인은 걸었다. 세레인은 멈췄다. 세레인은 돌아봤다.";
    const genderMap = new Map([["세레인", "male"]]);
    const result = fixSentenceStartRepeat(text, genderMap);
    // First sentence should still start with the name
    expect(result).toMatch(/^세레인/);
    // Second sentence should have pronoun
    expect(result).toContain("그는");
  });

  it("does not modify text with fewer than 3 sentences", () => {
    const text = "세레인은 걸었다. 세레인은 멈췄다.";
    expect(fixSentenceStartRepeat(text)).toBe(text);
  });

  it("does not modify text with varied starts", () => {
    const text = "세레인은 걸었다. 바람이 불었다. 꽃이 피었다.";
    expect(fixSentenceStartRepeat(text)).toBe(text);
  });

  it("handles empty text", () => {
    expect(fixSentenceStartRepeat("")).toBe("");
  });

  it("handles single sentence", () => {
    const text = "세레인은 걸었다.";
    expect(fixSentenceStartRepeat(text)).toBe(text);
  });

  it("matches by first 3 characters of each sentence", () => {
    // "세레인" shares first 3 chars "세레인", "세레나" shares first 3 chars "세레나"
    // Different first-3 chars should not trigger
    const text = "세레인은 걸었다. 세레나는 멈췄다. 세레인은 돌아봤다.";
    expect(fixSentenceStartRepeat(text)).toBe(text);
  });
});

// ===========================================================================
// 6. detectEndingRepeat
// ===========================================================================

describe("detectEndingRepeat", () => {
  it("detects 3 consecutive same endings", () => {
    const text = "그는 걸었다. 그녀는 웃었다. 바람이 불었다.";
    const issues = detectEndingRepeat(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("ending_repeat");
    expect(issues[0].detail).toContain("었다");
  });

  it("reports correct sentence range in detail", () => {
    const text = "그는 걸었다. 그녀는 웃었다. 바람이 불었다.";
    const issues = detectEndingRepeat(text);
    expect(issues[0].detail).toContain("1~3");
  });

  it("does not flag varied endings", () => {
    const text = "그는 걸었다. 바람이 분다. 꽃이 피었지.";
    expect(detectEndingRepeat(text)).toHaveLength(0);
  });

  it("does not flag paragraphs with fewer than 3 sentences", () => {
    const text = "그는 걸었다. 그녀는 웃었다.";
    expect(detectEndingRepeat(text)).toHaveLength(0);
  });

  it("handles empty text", () => {
    expect(detectEndingRepeat("")).toHaveLength(0);
  });

  it("emits only one issue per 3-run (not one per additional sentence)", () => {
    // 4 sentences with same ending should still produce only 1 issue
    const text = "그는 걸었다. 그녀는 웃었다. 바람이 불었다. 해가 떴다.";
    const issues = detectEndingRepeat(text);
    // "었다" for first 3, then "떴다" — "떴다" has ending "떴다" which differs from "었다"
    // Actually: extractEnding gets last 2 chars before period
    // "걸었다." → "었다", "웃었다." → "었다", "불었다." → "었다", "떴다." → "떴다"
    // So only one run of 3 with "었다"
    expect(issues).toHaveLength(1);
  });

  it("detects issues in multiple paragraphs independently", () => {
    const p1 = "그는 걸었다. 그녀는 웃었다. 바람이 불었다.";
    const p2 = "하늘이 밝았다. 꽃이 피었다. 새가 울었다.";
    const text = `${p1}\n\n${p2}`;
    const issues = detectEndingRepeat(text);
    // p1 has "었다" x3, p2 has "았다", "었다", "었다" — only 2 of "었다" so no run of 3
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].position).toBe(0); // first paragraph
  });

  it("handles various ending punctuation (!?)", () => {
    const text = "그는 걸었다! 그녀는 웃었다! 바람이 불었다!";
    const issues = detectEndingRepeat(text);
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain("었다");
  });
});

// ===========================================================================
// 7. detectSentenceStartRepeat
// ===========================================================================

describe("detectSentenceStartRepeat", () => {
  it("detects 3 consecutive same starts", () => {
    const text = "그는 걸었다. 그는 멈췄다. 그는 돌아봤다.";
    const issues = detectSentenceStartRepeat(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("sentence_start_repeat");
  });

  it("reports correct sentence range and start chars in detail", () => {
    const text = "그는 걸었다. 그는 멈췄다. 그는 돌아봤다.";
    const issues = detectSentenceStartRepeat(text);
    expect(issues[0].detail).toContain("1~3");
    expect(issues[0].detail).toContain("그는");
  });

  it("does not flag varied starts", () => {
    const text = "그는 걸었다. 바람이 분다. 꽃이 피었다.";
    expect(detectSentenceStartRepeat(text)).toHaveLength(0);
  });

  it("does not flag paragraphs with fewer than 3 sentences", () => {
    const text = "그는 걸었다. 그는 멈췄다.";
    expect(detectSentenceStartRepeat(text)).toHaveLength(0);
  });

  it("handles empty text", () => {
    expect(detectSentenceStartRepeat("")).toHaveLength(0);
  });

  it("compares first 2 characters only", () => {
    // "그는" and "그녀" share first char "그" but not first 2 chars
    const text = "그는 걸었다. 그녀는 웃었다. 그가 돌아봤다.";
    // "그는" → "그는", "그녀" → "그녀", "그가" → "그가" — all different
    expect(detectSentenceStartRepeat(text)).toHaveLength(0);
  });

  it("detects runs across more than 3 sentences but emits one issue", () => {
    const text = "그는 걸었다. 그는 멈췄다. 그는 돌아봤다. 그는 다시 걸었다.";
    const issues = detectSentenceStartRepeat(text);
    // Only one issue emitted when run first hits 3
    expect(issues).toHaveLength(1);
  });

  it("sets position to paragraph index", () => {
    const p1 = "가는 문장. 나는 문장. 다른 문장.";
    const p2 = "그는 걸었다. 그는 멈췄다. 그는 돌아봤다.";
    const text = `${p1}\n\n${p2}`;
    const issues = detectSentenceStartRepeat(text);
    const p2Issue = issues.find((i) => i.detail.includes("그는"));
    expect(p2Issue?.position).toBe(1);
  });
});

// ===========================================================================
// 8. detectShortDialogueSequence
// ===========================================================================

describe("detectShortDialogueSequence", () => {
  it("detects chain of 3+ short dialogues", () => {
    const text = '"응."\n"그래."\n"알았어."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("short_dialogue_sequence");
  });

  it("does not flag long dialogues", () => {
    const text =
      '"오늘 날씨가 정말 좋구나, 산책하러 가자."\n"그러자, 공원에 가서 꽃도 구경하고 싶어."\n"좋아, 그러면 점심도 밖에서 먹자."';
    const issues = detectShortDialogueSequence(text);
    expect(issues).toHaveLength(0);
  });

  it("resets chain when meaningful narration (6+ chars) appears", () => {
    const text = '"응."\n"그래."\n그는 한숨을 쉬며 창밖을 내다봤다.\n"알았어."';
    const issues = detectShortDialogueSequence(text);
    // Chain is broken by the narration line (6+ chars), so no 3-chain
    expect(issues).toHaveLength(0);
  });

  it("does not reset chain on short narration (< 6 chars)", () => {
    const text = '"응."\n"그래."\n한숨.\n"알았어."';
    const issues = detectShortDialogueSequence(text);
    // "한숨." is only 3 chars (after removing quotes), so chain continues
    // But "한숨." has no dialogue, pure narration < 6 chars doesn't flush
    // The dialogues are "응", "그래", "알았어" — 3 short dialogues
    expect(issues.length).toBeGreaterThan(0);
  });

  it("handles empty text", () => {
    expect(detectShortDialogueSequence("")).toHaveLength(0);
  });

  it("handles text with no dialogue", () => {
    const text = "그는 걸었다. 바람이 불었다. 하늘이 맑았다.";
    expect(detectShortDialogueSequence(text)).toHaveLength(0);
  });

  it("uses curly/smart quotes as well", () => {
    const text = "\u201C응.\u201D\n\u201C그래.\u201D\n\u201C알았어.\u201D";
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("counts dialogue as short when cleaned text is 5 chars or fewer", () => {
    // "12345" is 5 chars — should count as short
    const text = '"가나다라마."\n"가나다라마."\n"가나다라마."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("does not count dialogue as short when cleaned text > 5 chars", () => {
    const text = '"가나다라마바사."\n"가나다라마바사."\n"가나다라마바사."';
    const issues = detectShortDialogueSequence(text);
    expect(issues).toHaveLength(0);
  });

  it("sets severity to critical for chain of 5+", () => {
    const text = '"응."\n"그래."\n"응."\n"그래."\n"응."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe("critical");
  });

  it("sets severity to warning for chain of 3-4", () => {
    const text = '"응."\n"그래."\n"알았어."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe("warning");
  });

  it("flushes chain at end of text", () => {
    // Chain of 3 at the very end with no trailing narration
    const text = '"응."\n"그래."\n"좋아."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("sets severity to critical when 75%+ are very short (2 chars or fewer)", () => {
    // All dialogues have cleaned length <= 2
    const text = '"응."\n"네."\n"응."';
    const issues = detectShortDialogueSequence(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe("critical");
  });
});

// ===========================================================================
// 9. trimPostHookPadding
// ===========================================================================

describe("trimPostHookPadding", () => {
  it("removes mood-summary padding after a crisis-keyword hook", () => {
    const text = [
      "긴 본문 문단이 여기 있다.",
      '"누가 당신을 죽이려 했는지."',
      "연회장이 숨을 죽였다. 황제는 웃지 않았다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    expect(result).toContain("죽이려 했는지");
    expect(result).not.toContain("숨을 죽");
  });

  it("removes multiple trailing padding paragraphs", () => {
    const text = [
      "본문.",
      '"그 비밀을 아는 자는 이미 죽었다."',
      "침묵이 흘렀다.",
      "그렇게 고요한 정적이 남아 있었다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    expect(result).toContain("죽었다");
    expect(result).not.toContain("침묵");
    expect(result).not.toContain("정적");
  });

  it("removes padding after a question-mark hook", () => {
    const text = [
      "본문.",
      "대체 누가 그런 짓을 한 거지?",
      "침묵이 흘렀다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    expect(result).toContain("한 거지?");
    expect(result).not.toContain("침묵");
  });

  it("removes padding after an ellipsis hook", () => {
    const text = [
      "본문.",
      "그의 손이 천천히 내려갔다...",
      "고요한 정적이 흘렀다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    expect(result).toContain("내려갔다...");
    expect(result).not.toContain("정적");
  });

  it("removes padding after an ellipsis (unicode) hook", () => {
    const text = [
      "본문.",
      "그의 손이 천천히 내려갔다\u2026",
      "고요한 정적이 흘렀다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    expect(result).toContain("내려갔다\u2026");
    expect(result).not.toContain("정적");
  });

  it("does NOT remove non-padding paragraphs after a hook", () => {
    const text = [
      "본문.",
      '"누가 당신을 죽이려 했는지."',
      "세레인은 검을 뽑아 들고 문 밖으로 뛰쳐나갔다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    // The trailing paragraph has action, not padding — should be kept
    expect(result).toContain("뛰쳐나갔다");
  });

  it("does NOT remove trailing paragraphs containing dialogue", () => {
    const text = [
      "본문.",
      '"그 비밀을 아는 자는 이미 죽었다."',
      '"침묵하라." 황제가 말했다.',
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    expect(result).toContain("침묵하라");
  });

  it("does NOT trim if trailing paragraph is long (>80 chars)", () => {
    const text = [
      "본문.",
      '"그 비밀을 아는 자는 이미 죽었다."',
      "침묵이 흘렀다. 그리고 그 침묵 속에서 누군가가 조용히 일어섰고 모든 시선이 그에게로 쏠렸다. 그의 손에는 칼이 들려 있었고 그 칼끝에서는 핏방울이 떨어지고 있었다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    // Long trailing paragraph should be kept even if it has padding words
    expect(result).toContain("침묵이 흘렀다");
  });

  it("returns text unchanged when no hook is found in last 5 paragraphs", () => {
    const text = [
      "평범한 문단 하나.",
      "평범한 문단 둘.",
      "평범한 문단 셋.",
    ].join("\n\n");
    expect(trimPostHookPadding(text)).toBe(text);
  });

  it("returns text unchanged when hook is the last paragraph", () => {
    const text = [
      "본문.",
      '"누가 당신을 죽이려 했는지."',
    ].join("\n\n");
    expect(trimPostHookPadding(text)).toBe(text);
  });

  it("handles single paragraph", () => {
    const text = "유일한 문단.";
    expect(trimPostHookPadding(text)).toBe(text);
  });

  it("handles empty text", () => {
    expect(trimPostHookPadding("")).toBe("");
  });

  it("only removes padding if ALL trailing paragraphs are padding", () => {
    const text = [
      "본문.",
      '"누가 당신을 죽이려 했는지."',
      "침묵이 흘렀다.",
      "세레인은 검을 뽑아 들었다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    // Second trailing paragraph is not padding, so nothing is removed
    expect(result).toContain("침묵");
    expect(result).toContain("검을 뽑아");
  });

  it("detects dialogue hook with tension keywords", () => {
    const text = [
      "긴 서사 문단이 있다.",
      "\u201C배신자의 이름을 대라.\u201D",
      "아무도 말하지 않았다.",
    ].join("\n\n");
    const result = trimPostHookPadding(text);
    expect(result).toContain("배신자");
    expect(result).not.toContain("아무도 말");
  });
});
