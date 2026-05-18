import { z } from "zod";

const VAGUE_PATTERN = /something|someone|mystery|strange feeling|ominous|weird|bad vibe|불길|수상함|이상한 기분|뭔가|누군가|비밀스럽/iu;

function isConcreteText(value: string): boolean {
  return value.trim().length >= 8 && !VAGUE_PATTERN.test(value);
}

export const ForeshadowPayoffKindSchema = z.enum([
  "explanation",
  "reveal",
  "reversal",
  "relationship",
  "threat",
  "object",
  "identity",
  "promise",
]);

export type ForeshadowPayoffKind = z.infer<typeof ForeshadowPayoffKindSchema>;

export const ForeshadowConcreteIntroductionSchema = z.object({
  subject: z.string().min(2).describe("What concrete thing was introduced or changed"),
  detail: z.string().min(8).describe("Specific detail observed on-page"),
  why_it_stands_out: z.string().min(8).describe("Why the scene makes this detail narratively notable"),
});

export type ForeshadowConcreteIntroduction = z.infer<
  typeof ForeshadowConcreteIntroductionSchema
>;

export const ForeshadowDeferredPayoffSchema = z.object({
  kind: ForeshadowPayoffKindSchema,
  promise: z.string().min(8).describe("What later explanation, reveal, or payoff this event implies"),
  earliest_chapter: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Earliest chapter where the payoff may legitimately occur"),
});

export type ForeshadowDeferredPayoff = z.infer<
  typeof ForeshadowDeferredPayoffSchema
>;

export const ForeshadowRegistrationContractSchema = z
  .object({
    event_id: z.string().min(1).describe("Source scene event identifier"),
    chapter: z.number().int().positive().describe("Chapter where the qualifying scene event occurs"),
    scene_id: z.string().min(1).optional().describe("Optional source scene identifier"),
    event_summary: z.string().min(8).describe("What happened in the source scene event"),
    introductions: z
      .array(ForeshadowConcreteIntroductionSchema)
      .min(1)
      .describe("Concrete information newly introduced by the event"),
    implied_question: z
      .string()
      .min(8)
      .describe("Question or expectation the reader should carry forward"),
    deferred_payoff: ForeshadowDeferredPayoffSchema,
    plausibility_basis: z
      .string()
      .min(8)
      .describe("Why the implied payoff follows plausibly from the introduced information"),
    evidence: z
      .array(z.string().min(3))
      .min(1)
      .describe("Concrete textual or situational evidence anchoring the registration"),
  })
  .superRefine((value, ctx) => {
    if (value.deferred_payoff.earliest_chapter !== undefined && value.deferred_payoff.earliest_chapter <= value.chapter) {
      ctx.addIssue({
        code: "custom",
        path: ["deferred_payoff", "earliest_chapter"],
        message: "Foreshadow payoff must occur after the source chapter.",
      });
    }

    if (!isConcreteText(value.implied_question)) {
      ctx.addIssue({
        code: "custom",
        path: ["implied_question"],
        message: "Implied question must be specific enough to suggest a later explanation or payoff.",
      });
    }

    if (!isConcreteText(value.plausibility_basis)) {
      ctx.addIssue({
        code: "custom",
        path: ["plausibility_basis"],
        message: "Plausibility basis must connect the on-page detail to the later payoff with concrete reasoning.",
      });
    }

    if (!isConcreteText(value.deferred_payoff.promise)) {
      ctx.addIssue({
        code: "custom",
        path: ["deferred_payoff", "promise"],
        message: "Deferred payoff promise must name a concrete later explanation, reveal, or consequence.",
      });
    }

    value.introductions.forEach((entry, index) => {
      if (!isConcreteText(entry.detail)) {
        ctx.addIssue({
          code: "custom",
          path: ["introductions", index, "detail"],
          message: "Introduced information must be concrete, not just mood or generic mystery.",
        });
      }
      if (!isConcreteText(entry.why_it_stands_out)) {
        ctx.addIssue({
          code: "custom",
          path: ["introductions", index, "why_it_stands_out"],
          message: "Each introduction must explain why the reader should treat it as payoff-bearing information.",
        });
      }
    });

    if (!value.evidence.some(isConcreteText)) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "At least one evidence entry must anchor the foreshadowing in concrete scene detail.",
      });
    }
  });

export type ForeshadowRegistrationContract = z.infer<
  typeof ForeshadowRegistrationContractSchema
>;

export interface ForeshadowQualificationResult {
  qualifies: boolean;
  issues: string[];
  contract?: ForeshadowRegistrationContract;
}

export function qualifyForeshadowRegistration(
  candidate: unknown,
): ForeshadowQualificationResult {
  const result = ForeshadowRegistrationContractSchema.safeParse(candidate);

  if (result.success) {
    return {
      qualifies: true,
      issues: [],
      contract: result.data,
    };
  }

  return {
    qualifies: false,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }),
  };
}
