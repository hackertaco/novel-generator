import { z } from "zod";

export const NarrativeProseViolationSchema = z.object({
  ruleId: z.string(),
  category: z.enum([
    "internal_source_leak",
    "forbidden_fact_leak",
    "cognition_tell",
    "hidden_state_tell",
    "interpretation_tell",
  ]),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  excerpt: z.string(),
});

export const NarrativeProseValidationResultSchema = z.object({
  violationCount: z.number().int().nonnegative(),
  violations: z.array(NarrativeProseViolationSchema),
});

export type NarrativeProseViolation = z.infer<typeof NarrativeProseViolationSchema>;
export type NarrativeProseValidationResult = z.infer<typeof NarrativeProseValidationResultSchema>;

export interface NarrativeProseRule {
  ruleId: string;
  category: NarrativeProseViolation["category"];
  severity: NarrativeProseViolation["severity"];
  message: string;
  patterns: RegExp[];
}

export interface ValidateNarrativeProseInput {
  text: string;
  forbiddenFacts?: string[];
  extraRules?: NarrativeProseRule[];
}

const INTERNAL_SOURCE_PATTERN = /evt_world_|scene_log_|actionLogId|act_ch|sourceEventId|sourceActionLogIds|<!--/;

const DEFAULT_RULES: NarrativeProseRule[] = [
  {
    ruleId: "cognition-tell",
    category: "cognition_tell",
    severity: "error",
    message: "내면 판단을 설명하지 말고 관찰 가능한 행동으로 바꿔야 한다.",
    patterns: [
      /마음속/u,
      /생각(?:이|은|을|에|하고|했다|났다|났다|이 스쳤다)?/u,
      /계산(?:이|은|을|가|하고|했다)?/u,
      /고민(?:했|했다|해야|하고|에 빠졌)/u,
      /결심(?:했|했다|한다)/u,
      /알(?:았|고 있었다| 수 없)/u,
      /깨달(?:았|았다)/u,
      /판단(?:했|했다|하려)/u,
      /기분이 들/u,
      /느끼(?:고|며|는|었다|었고|지|게|도록)|느껴(?:졌|진)/u,
      /압박을 느/u,
      /긴장감|불안감|경계심/u,
    ],
  },
  {
    ruleId: "hidden-state-tell",
    category: "hidden_state_tell",
    severity: "error",
    message: "숨은 의도/진심을 직접 해설하지 말고 말끝, 침묵, 손동작으로 보여야 한다.",
    patterns: [
      /의도(?:는|를|가|와|과|은)?/u,
      /속내/u,
      /진심/u,
      /숨겨(?:져|진|둔|져 있는|져 있었다)/u,
      /감춰(?:진|져|져 있는|져 있었다)/u,
      /말 속/u,
      /그 속에는/u,
      /이면(?:에는|에|을)/u,
    ],
  },
  {
    ruleId: "interpretation-tell",
    category: "interpretation_tell",
    severity: "warning",
    message: "장면 의미를 해설하지 말고 독자가 읽게 둬야 한다.",
    patterns: [
      /깊은 의미/u,
      /분명한 메시지/u,
      /상징(?:했|했다|하는)/u,
      /암시(?:했|했다|하는)/u,
      /파악(?:하|했|하려)/u,
      /간파(?:하|했|했다)/u,
      /꿰뚫어\s*보/u,
      /읽으려/u,
      /캐치/u,
      /탐색(?:하|했|하려)/u,
      /상황을 관망/u,
    ],
  },
];

function compact(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function forbiddenNeedles(forbiddenFacts: string[]): string[] {
  return compact(forbiddenFacts.flatMap((fact) => {
    const withoutNominalEnding = fact.replace(/(하기|기)$/u, "");
    const withoutObjectMarker = withoutNominalEnding.replace(/(을|를)$/u, "");
    return [
      fact,
      withoutNominalEnding,
      withoutObjectMarker,
    ];
  })).filter((fact) => fact.length >= 6);
}

function sentenceExcerpt(text: string, index: number): string {
  const start = Math.max(
    text.lastIndexOf(".", index),
    text.lastIndexOf("?", index),
    text.lastIndexOf("!", index),
    text.lastIndexOf("다.", index),
    text.lastIndexOf("\n", index),
  );
  const endCandidates = [
    text.indexOf(".", index + 1),
    text.indexOf("?", index + 1),
    text.indexOf("!", index + 1),
    text.indexOf("\n", index + 1),
  ].filter((value) => value >= 0);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) + 1 : Math.min(text.length, index + 80);
  return text.slice(start >= 0 ? start + 1 : 0, end).replace(/\s+/g, " ").trim();
}

function firstMatchExcerpt(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  if (!match?.[0] || match.index === undefined) return null;
  return sentenceExcerpt(text, match.index);
}

export function validateNarrativeProse(input: ValidateNarrativeProseInput): NarrativeProseValidationResult {
  const violations: NarrativeProseViolation[] = [];
  const text = input.text;

  const sourceMatch = firstMatchExcerpt(text, INTERNAL_SOURCE_PATTERN);
  if (sourceMatch) {
    violations.push({
      ruleId: "internal-source-leak",
      category: "internal_source_leak",
      severity: "error",
      message: "내부 로그 ID가 독자용 본문에 노출됐다.",
      excerpt: sourceMatch,
    });
  }

  for (const fact of forbiddenNeedles(input.forbiddenFacts ?? [])) {
    const pattern = new RegExp(escapeRegExp(fact), "u");
    const excerpt = firstMatchExcerpt(text, pattern);
    if (!excerpt) continue;
    violations.push({
      ruleId: "forbidden-fact-leak",
      category: "forbidden_fact_leak",
      severity: "error",
      message: `비공개 사실이 직접 노출됐다: ${fact}`,
      excerpt,
    });
  }

  for (const rule of [...DEFAULT_RULES, ...(input.extraRules ?? [])]) {
    for (const pattern of rule.patterns) {
      const excerpt = firstMatchExcerpt(text, pattern);
      if (!excerpt) continue;
      violations.push({
        ruleId: rule.ruleId,
        category: rule.category,
        severity: rule.severity,
        message: rule.message,
        excerpt,
      });
      break;
    }
  }

  return NarrativeProseValidationResultSchema.parse({
    violationCount: violations.length,
    violations,
  });
}

export function formatNarrativeViolationsForRepair(violations: NarrativeProseViolation[]): string {
  return violations
    .map((violation) => `${violation.ruleId}: ${violation.message} 예문="${violation.excerpt}"`)
    .join(" / ");
}
