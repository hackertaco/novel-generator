/**
 * Code-based plot quality validator.
 *
 * Runs after the LLM pipeline (PlotWriter → PlotCritic → PlotPolisher)
 * and enforces quality rules that LLMs tend to ignore.
 */

import type { PlotOption } from "@/lib/schema/plot";
import {
  MALE_LEAD_ARCHETYPES,
  FEMALE_LEAD_ARCHETYPES,
} from "@/lib/archetypes/character-archetypes";

// ---------------------------------------------------------------------------
// Valid labels
// ---------------------------------------------------------------------------

const VALID_MALE_LABELS = new Set(MALE_LEAD_ARCHETYPES.map((a) => a.label));
const VALID_FEMALE_LABELS = new Set(FEMALE_LEAD_ARCHETYPES.map((a) => a.label));

// Fuzzy label map: common LLM paraphrases → our canonical labels
const MALE_LABEL_ALIASES: Record<string, string> = {
  집착광공: "집착광공형", 집착남: "집착광공형", 광공: "집착광공형",
  다정남: "다정남형", 다정: "다정남형",
  후회남: "후회남형", 후회: "후회남형",
  츤데레: "츤데레형", 츤데레남: "츤데레형",
  폭군: "폭군형", 냉혈: "폭군형", 냉혈남: "폭군형",
  대형견남: "대형견남형", 대형견: "대형견남형", 강아지남: "대형견남형",
};

const FEMALE_LABEL_ALIASES: Record<string, string> = {
  사이다: "사이다형", "사이다 여주": "사이다형", 사이다여주: "사이다형",
  상처녀: "상처녀형", 상처: "상처녀형",
  무심녀: "무심녀형", 무심: "무심녀형",
  순진녀: "순진녀형", 순진: "순진녀형",
  계략녀: "계략녀형", 계략: "계략녀형",
  햇살녀: "햇살녀형", 햇살: "햇살녀형",
  츤데레녀: "츤데레녀형",
};

// ---------------------------------------------------------------------------
// Banned vague expressions
// ---------------------------------------------------------------------------

const VAGUE_EXPRESSIONS = [
  "~하게 된다", "하게 된다", "하게된다",
  "진정한 ", "진정한 사랑", "진정한 힘",
  "을 찾아가는", "를 찾아가는",
  "의 여정", "여정을 시작",
  "와 마주하게", "과 마주하게",
  "성장해 나간다", "성장해나간다",
  "갈등을 겪", "시련을 겪",
  "점차 변화", "서서히 변화",
  "자신의 정체성",
  "라는 것이 밝혀",
  "운명에 맞서",
  "진짜 사랑을 찾",
  "새로운 삶을 시작",
  "두 사람의 관계가 깊어",
  "위기가 닥친다",
  "갈등이 심화",
];

const KEY_TWIST_BANNED = [
  "사실 ~였다", "사실은 ~였다",
  "알고 보니", "사실은",
];

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export interface PlotIssue {
  plotId: string;
  field: string;
  issue: string;
  autoFixed?: boolean;
}

export interface PlotValidationResult {
  passed: boolean;
  plots: PlotOption[];
  issues: PlotIssue[];
  /** Issues that were auto-fixed (archetype labels, etc.) */
  autoFixCount: number;
  /** Issues that need LLM regeneration */
  regenerationNeeded: PlotIssue[];
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

/**
 * Try to auto-correct an archetype label to our canonical form.
 * Returns the corrected label, or null if unrecoverable.
 */
function fixMaleLabel(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (VALID_MALE_LABELS.has(trimmed)) return trimmed;
  // Try aliases
  for (const [alias, canonical] of Object.entries(MALE_LABEL_ALIASES)) {
    if (trimmed.includes(alias)) return canonical;
  }
  // Try partial match against valid labels
  for (const label of VALID_MALE_LABELS) {
    if (trimmed.includes(label.replace("형", "")) || label.includes(trimmed.replace("형", ""))) {
      return label;
    }
  }
  return null;
}

function fixFemaleLabel(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (VALID_FEMALE_LABELS.has(trimmed)) return trimmed;
  for (const [alias, canonical] of Object.entries(FEMALE_LABEL_ALIASES)) {
    if (trimmed.includes(alias)) return canonical;
  }
  for (const label of VALID_FEMALE_LABELS) {
    if (trimmed.includes(label.replace("형", "")) || label.includes(trimmed.replace("형", ""))) {
      return label;
    }
  }
  return null;
}

/**
 * Count vague expressions in text.
 */
function countVagueExpressions(text: string): string[] {
  return VAGUE_EXPRESSIONS.filter((expr) => text.includes(expr));
}

/**
 * Simple Jaccard similarity between two strings (character bigrams).
 */
function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Validate and auto-fix plot options.
 * Returns validation result with auto-fixed plots and remaining issues.
 */
export function validatePlots(
  plots: PlotOption[],
  isRomance: boolean,
): PlotValidationResult {
  const issues: PlotIssue[] = [];
  let autoFixCount = 0;
  const fixedPlots = plots.map((plot) => ({ ...plot }));

  for (const plot of fixedPlots) {
    // --- 1. Archetype label validation (auto-fixable) ---
    if (isRomance) {
      if (!plot.male_archetype || !VALID_MALE_LABELS.has(plot.male_archetype)) {
        const fixed = fixMaleLabel(plot.male_archetype);
        if (fixed) {
          plot.male_archetype = fixed;
          autoFixCount++;
          issues.push({
            plotId: plot.id, field: "male_archetype",
            issue: `라벨 자동 수정: "${plot.male_archetype}" → "${fixed}"`,
            autoFixed: true,
          });
        } else {
          issues.push({
            plotId: plot.id, field: "male_archetype",
            issue: `유효하지 않은 남주 아키타입: "${plot.male_archetype}". 유효한 라벨: ${[...VALID_MALE_LABELS].join(", ")}`,
          });
        }
      }

      if (!plot.female_archetype || !VALID_FEMALE_LABELS.has(plot.female_archetype)) {
        const fixed = fixFemaleLabel(plot.female_archetype);
        if (fixed) {
          plot.female_archetype = fixed;
          autoFixCount++;
          issues.push({
            plotId: plot.id, field: "female_archetype",
            issue: `라벨 자동 수정: "${plot.female_archetype}" → "${fixed}"`,
            autoFixed: true,
          });
        } else {
          issues.push({
            plotId: plot.id, field: "female_archetype",
            issue: `유효하지 않은 여주 아키타입: "${plot.female_archetype}". 유효한 라벨: ${[...VALID_FEMALE_LABELS].join(", ")}`,
          });
        }
      }
    }

    // --- 2. Logline quality ---
    if (plot.logline.length < 40) {
      issues.push({
        plotId: plot.id, field: "logline",
        issue: `로그라인이 너무 짧음 (${plot.logline.length}자, 최소 40자)`,
      });
    }
    const loglineVague = countVagueExpressions(plot.logline);
    if (loglineVague.length > 0) {
      issues.push({
        plotId: plot.id, field: "logline",
        issue: `로그라인에 모호한 표현: ${loglineVague.join(", ")}`,
      });
    }

    // --- 3. Arc summary quality ---
    if (plot.arc_summary.length < 3) {
      issues.push({
        plotId: plot.id, field: "arc_summary",
        issue: `전개가 ${plot.arc_summary.length}부밖에 없음 (최소 3부 필요)`,
      });
    }
    for (let i = 0; i < plot.arc_summary.length; i++) {
      const arc = plot.arc_summary[i];
      // Each arc part should be substantial (at least 30 chars)
      if (arc.length < 30) {
        issues.push({
          plotId: plot.id, field: `arc_summary[${i}]`,
          issue: `${i + 1}부 전개가 너무 짧음 (${arc.length}자, 최소 30자)`,
        });
      }
      const arcVague = countVagueExpressions(arc);
      if (arcVague.length > 0) {
        issues.push({
          plotId: plot.id, field: `arc_summary[${i}]`,
          issue: `${i + 1}부 전개에 모호한 표현: ${arcVague.join(", ")}`,
        });
      }
    }

    // --- 4. Key twist quality ---
    for (const banned of KEY_TWIST_BANNED) {
      if (plot.key_twist.includes(banned)) {
        issues.push({
          plotId: plot.id, field: "key_twist",
          issue: `반전에 금지 패턴 사용: "${banned}"`,
        });
      }
    }

    // --- 5. Title length ---
    if ([...plot.title].length > 8) {
      issues.push({
        plotId: plot.id, field: "title",
        issue: `제목이 너무 김 (${[...plot.title].length}자, 6~8자 권장)`,
      });
    }
  }

  // --- 6. Cross-plot diversity ---
  if (fixedPlots.length >= 2) {
    for (let i = 0; i < fixedPlots.length; i++) {
      for (let j = i + 1; j < fixedPlots.length; j++) {
        const arcA = fixedPlots[i].arc_summary.join(" ");
        const arcB = fixedPlots[j].arc_summary.join(" ");
        const sim = bigramSimilarity(arcA, arcB);
        if (sim > 0.5) {
          issues.push({
            plotId: `${fixedPlots[i].id}+${fixedPlots[j].id}`,
            field: "diversity",
            issue: `플롯 ${fixedPlots[i].id}와 ${fixedPlots[j].id}의 전개가 너무 유사 (유사도: ${(sim * 100).toFixed(0)}%)`,
          });
        }

        // Same archetype combo = low diversity
        if (
          isRomance &&
          fixedPlots[i].male_archetype === fixedPlots[j].male_archetype &&
          fixedPlots[i].female_archetype === fixedPlots[j].female_archetype
        ) {
          issues.push({
            plotId: `${fixedPlots[i].id}+${fixedPlots[j].id}`,
            field: "diversity",
            issue: `플롯 ${fixedPlots[i].id}와 ${fixedPlots[j].id}의 캐릭터 조합이 동일 (${fixedPlots[i].male_archetype} × ${fixedPlots[i].female_archetype})`,
          });
        }
      }
    }
  }

  const regenerationNeeded = issues.filter((i) => !i.autoFixed);
  const passed = regenerationNeeded.length === 0;

  return { passed, plots: fixedPlots, issues, autoFixCount, regenerationNeeded };
}

/**
 * Build a focused repair prompt for plots that failed validation.
 * This gives the LLM very specific instructions about what to fix.
 */
export function buildRepairPrompt(
  plots: PlotOption[],
  issues: PlotIssue[],
  isRomance: boolean,
): string {
  const issuesByPlot = new Map<string, PlotIssue[]>();
  for (const issue of issues) {
    const plotId = issue.plotId.includes("+") ? issue.plotId : issue.plotId;
    if (!issuesByPlot.has(plotId)) issuesByPlot.set(plotId, []);
    issuesByPlot.get(plotId)!.push(issue);
  }

  const plotSections = plots.map((plot) => {
    const plotIssues = issuesByPlot.get(plot.id) || [];
    // Also include diversity issues that mention this plot
    const diversityIssues = issues.filter(
      (i) => i.field === "diversity" && i.plotId.includes(plot.id),
    );
    const allIssues = [...plotIssues, ...diversityIssues];

    if (allIssues.length === 0) return `플롯 ${plot.id}: 수정 불필요 (그대로 유지)`;

    return `플롯 ${plot.id} 수정 필요:
${allIssues.map((i) => `  - [${i.field}] ${i.issue}`).join("\n")}`;
  });

  const validLabels = isRomance ? `
유효한 남주 아키타입: ${[...VALID_MALE_LABELS].join(", ")}
유효한 여주 아키타입: ${[...VALID_FEMALE_LABELS].join(", ")}` : "";

  return `아래 플롯을 검증한 결과 품질 문제가 발견되었습니다.
각 플롯의 문제를 수정해주세요. 수정 불필요한 플롯은 그대로 유지하세요.

## 검증 결과
${plotSections.join("\n\n")}
${validLabels}

## 수정 규칙
1. male_archetype/female_archetype은 반드시 위 유효 라벨 중 하나를 사용
2. 모호한 표현("~하게 된다", "진정한 ~", "의 여정" 등)을 구체적 사건으로 교체
3. arc_summary 각 부는 30자 이상, 인물명+장소+사건 포함
4. 3개 플롯 간 캐릭터 조합과 전개가 완전히 달라야 함
5. "사실 ~였다" 패턴의 반전 금지

## 현재 플롯 (JSON)
${JSON.stringify(plots, null, 2)}

위 문제를 수정한 전체 플롯 3개를 JSON 배열로 출력하세요.`;
}
