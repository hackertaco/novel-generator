import { z } from "zod";

export const CharacterDivergenceCauseKindSchema = z.enum([
  "forgetting",
  "misunderstanding",
  "misinterpretation",
  "lying",
  "lack_of_information",
  "deception",
  "trauma",
  "bias",
]);

export const CharacterDivergenceCauseSchema = z.object({
  kind: CharacterDivergenceCauseKindSchema,
  summary: z.string().min(1),
  sourceEventId: z.string().min(1).optional(),
  sourceCharacterId: z.string().min(1).optional(),
});

export const CharacterBeliefCanonicalAlignmentSchema = z.enum([
  "supported",
  "uncertain",
  "contradicted",
]);

export type CharacterDivergenceCauseKind = z.infer<
  typeof CharacterDivergenceCauseKindSchema
>;
export type CharacterDivergenceCause = z.infer<
  typeof CharacterDivergenceCauseSchema
>;
export type CharacterBeliefCanonicalAlignment = z.infer<
  typeof CharacterBeliefCanonicalAlignmentSchema
>;
