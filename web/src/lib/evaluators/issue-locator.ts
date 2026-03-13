import type { Segment } from "@/lib/agents/segmenter";
import type { StyleResult } from "./style";
import type { ConsistencyResult } from "./consistency";
import type { PacingResult } from "./pacing";
import {
  POWER_UP_PATTERNS,
  CLIMAX_PATTERNS,
  TIME_JUMP_PATTERNS,
  DESCRIPTIVE_KEYWORDS,
} from "./pacing";
import type { NovelSeed } from "@/lib/schema/novel";

export interface SegmentIssue {
  segmentId: number;
  issues: string[];
  context?: {
    characterVoice?: { name: string; speechPatterns: string[] }[];
    foreshadowing?: { name: string; description: string }[];
  };
}

export function locateIssues(
  segments: Segment[],
  style: StyleResult,
  consistency: ConsistencyResult,
  pacing: PacingResult,
  seed: NovelSeed,
  chapterNumber: number,
): SegmentIssue[] {
  const issueMap = new Map<number, SegmentIssue>();

  function addIssue(segmentId: number, issue: string, context?: SegmentIssue["context"]) {
    const existing = issueMap.get(segmentId);
    if (existing) {
      existing.issues.push(issue);
      if (context) {
        existing.context = { ...existing.context, ...context };
      }
    } else {
      issueMap.set(segmentId, { segmentId, issues: [issue], context });
    }
  }

  // --- Location-specific: re-scan per segment ---

  // 1. Dialogue pacing: consecutive dialogue lines per segment
  if (!pacing.dialogue_pacing.pass) {
    for (const seg of segments) {
      const lines = seg.text.split("\n").filter((l) => l.trim());
      let maxConsecutive = 0;
      let current = 0;
      for (const line of lines) {
        if (/^["\u201C\u300C]/.test(line.trim())) {
          current++;
          maxConsecutive = Math.max(maxConsecutive, current);
        } else {
          current = 0;
        }
      }
      if (maxConsecutive >= 5) {
        addIssue(seg.id, `대사가 ${maxConsecutive}줄 연속됩니다. 중간에 행동/묘사 비트를 넣어주세요.`);
      }
    }
  }

  // 2. Paragraph length: sentence count per segment
  if (!style.paragraph_length.pass) {
    const maxSentences = seed.style.max_paragraph_length;
    for (const seg of segments) {
      const sentences = seg.text.split(/[.!?]\s+/).filter((s) => s.trim());
      if (sentences.length > maxSentences) {
        addIssue(seg.id, `문단이 ${sentences.length}문장입니다. ${maxSentences}문장 이하로 나눠주세요.`);
      }
    }
  }

  // 3. Character voice: match dialogue snippets to segments
  if (!consistency.character_voice.pass) {
    for (const issue of consistency.character_voice.issues) {
      for (const seg of segments) {
        if (seg.text.includes(issue.dialogue.slice(0, 30))) {
          const charInfo = seed.characters.find((c) => c.name === issue.character);
          addIssue(seg.id, `${issue.character}의 말투가 어색합니다. 패턴: ${issue.expected_patterns.join(", ")}`, {
            characterVoice: charInfo ? [{ name: charInfo.name, speechPatterns: charInfo.voice.speech_patterns }] : undefined,
          });
          break;
        }
      }
    }
  }

  // 4. Time jumps: scan segments for markers
  // For early chapters (1-2), any time jump is problematic even if the global check passes
  const timeJumpThreshold = chapterNumber <= 2 ? 0 : 2;
  if (!pacing.time_jumps.pass || pacing.time_jumps.count > timeJumpThreshold) {
    for (const seg of segments) {
      const markers: string[] = [];
      for (const pattern of TIME_JUMP_PATTERNS) {
        const matches = seg.text.match(pattern);
        if (matches) markers.push(...matches);
      }
      if (markers.length > 0) {
        addIssue(seg.id, `시간 점프 표현 발견: ${markers.join(", ")}. 현재 장면에 집중해주세요.`);
      }
    }
  }

  // 5. Early chapter pacing: power-up / climax patterns
  if (chapterNumber <= 5) {
    for (const seg of segments) {
      const powerUps: string[] = [];
      for (const pattern of POWER_UP_PATTERNS) {
        const matches = seg.text.match(pattern);
        if (matches) powerUps.push(...matches);
      }
      if (powerUps.length >= 2 && chapterNumber <= 2) {
        addIssue(seg.id, `능력 각성/획득 표현 ${powerUps.length}회 (초반에 과도). 일상적 장면으로 교체해주세요.`);
      }

      const climaxes: string[] = [];
      for (const pattern of CLIMAX_PATTERNS) {
        const matches = seg.text.match(pattern);
        if (matches) climaxes.push(...matches);
      }
      if (climaxes.length >= 2 && chapterNumber <= 3) {
        addIssue(seg.id, `클라이맥스급 표현 ${climaxes.length}회 (초반에 과도). 톤을 낮춰주세요.`);
      }
    }
  }

  // --- Ratio-based: inferred mapping ---

  // 6. Dialogue ratio low → longest narration-only segment
  if (!style.dialogue_ratio.pass && style.dialogue_ratio.actual_ratio < style.dialogue_ratio.target_ratio) {
    let bestSeg: Segment | null = null;
    let bestLen = 0;
    for (const seg of segments) {
      const hasDialogue = /["\u201C\u300C]/.test(seg.text);
      if (!hasDialogue && seg.text.length > bestLen) {
        bestLen = seg.text.length;
        bestSeg = seg;
      }
    }
    if (bestSeg) {
      addIssue(bestSeg.id, `대사 비율이 부족합니다 (${Math.round(style.dialogue_ratio.actual_ratio * 100)}% / 목표 ${Math.round(style.dialogue_ratio.target_ratio * 100)}%). 이 구간에 대사를 추가해주세요.`);
    }
  }

  // 7. Description ratio low → longest segment with zero descriptive keywords
  if (!pacing.description_ratio.pass && pacing.description_ratio.ratio < 0.25) {
    let bestSeg: Segment | null = null;
    let bestLen = 0;
    for (const seg of segments) {
      const hasDesc = DESCRIPTIVE_KEYWORDS.some((kw) => seg.text.includes(kw));
      if (!hasDesc && seg.text.length > bestLen) {
        bestLen = seg.text.length;
        bestSeg = seg;
      }
    }
    if (bestSeg) {
      addIssue(bestSeg.id, `묘사가 부족합니다. 감각적 묘사(시각, 청각, 촉각)를 추가해주세요.`);
    }
  }

  // 8. Hook ending fail → last segment
  if (!style.hook_ending.pass && segments.length > 0) {
    const lastId = segments[segments.length - 1].id;
    addIssue(lastId, "후킹 엔딩이 부족합니다. 긴장감/궁금증을 유발하는 마무리로 수정해주세요.");
  }

  // 9. Length short → shortest segment
  if (!pacing.length.pass) {
    let shortestSeg: Segment | null = null;
    let shortestLen = Infinity;
    for (const seg of segments) {
      if (seg.text.length < shortestLen) {
        shortestLen = seg.text.length;
        shortestSeg = seg;
      }
    }
    if (shortestSeg) {
      addIssue(shortestSeg.id, `분량이 부족합니다 (전체 ${pacing.length.char_count}자 / 최소 ${pacing.length.target_min}자). 이 구간의 장면 묘사를 더 풍부하게 해주세요.`);
    }
  }

  // 10. Foreshadowing missing → penultimate segment
  if (!consistency.foreshadowing.pass && consistency.foreshadowing.missing.length > 0) {
    const otherIssues = issueMap.size > 0;
    if (otherIssues && segments.length >= 2) {
      const penultimateId = segments[segments.length - 2].id;
      const fsNames = consistency.foreshadowing.missing.map((m) => m.name);
      const fsDetails = consistency.foreshadowing.missing.map((m) => {
        const fs = seed.foreshadowing.find((f) => f.id === m.id);
        return fs ? { name: fs.name, description: fs.description } : { name: m.name, description: "" };
      });
      addIssue(penultimateId, `복선 누락: ${fsNames.join(", ")}. 자연스럽게 암시를 넣어주세요.`, {
        foreshadowing: fsDetails,
      });
    }
  }

  return Array.from(issueMap.values());
}
