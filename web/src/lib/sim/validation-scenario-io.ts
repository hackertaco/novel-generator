import * as fs from "fs";

import { z } from "zod";

import { ForeshadowLifecycleStatusSchema } from "@/lib/schema/foreshadowing";
import { NovelSeedSchema } from "@/lib/schema/novel";

import {
  CharacterBeliefCanonicalAlignmentSchema,
  CharacterDivergenceCauseKindSchema,
} from "./cognitive-dissonance";
import { CharacterMemoryAccuracySchema } from "./memory-state";
import { ObjectiveFactCategorySchema } from "./objective-facts";
import { SimulationEventSchema } from "./causal-ledger";
import {
  createDeterministicLongFormValidationScenario,
  type DeterministicLongFormValidationScenario,
} from "./validation-scenario";

const ValidationScenarioRecordTypeSchema = z.enum([
  "memory",
  "belief",
  "utterance",
]);

const ValidationScenarioFactSnapshotSchema = z.object({
  factKey: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  category: ObjectiveFactCategorySchema,
  summary: z.string().min(1),
});

const ValidationScenarioMismatchAttributionSchema = z.object({
  mismatchId: z.string().min(1),
  characterId: z.string().min(1),
  recordType: ValidationScenarioRecordTypeSchema,
  mismatchType: z.literal("canonical_conflict"),
  causeKind: CharacterDivergenceCauseKindSchema,
  sourceEventId: z.string().min(1),
  canonicalFactKeys: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
});

const ValidationScenarioMemoryExpectationSchema = z.object({
  characterId: z.string().min(1),
  summary: z.string().min(1),
  truthAlignment: CharacterMemoryAccuracySchema,
  causeEventId: z.string().min(1).optional(),
  canonicalFactKeys: z.array(z.string().min(1)).default([]),
});

const ValidationScenarioBeliefExpectationSchema = z.object({
  characterId: z.string().min(1),
  belief: z.string().min(1),
  canonicalAlignment: CharacterBeliefCanonicalAlignmentSchema,
  causeEventId: z.string().min(1).optional(),
  canonicalFactKeys: z.array(z.string().min(1)).default([]),
});

const ValidationScenarioUtteranceExpectationSchema = z.object({
  characterId: z.string().min(1),
  sceneId: z.string().min(1),
  line: z.string().min(1),
  canonicalAlignment: CharacterBeliefCanonicalAlignmentSchema,
  causeEventId: z.string().min(1).optional(),
  canonicalFactKeys: z.array(z.string().min(1)).default([]),
});

const ValidationScenarioForeshadowExpectationSchema = z.object({
  foreshadowId: z.string().min(1),
  lifecycle: ForeshadowLifecycleStatusSchema,
  expectedPayoffEpisode: z.number().int().positive(),
});

const ValidationScenarioCheckpointSchema = z.object({
  chapter: z.number().int().positive(),
  label: z.string().min(1),
  notes: z.string().min(1),
  requiredEventIds: z.array(z.string().min(1)).default([]),
  activeFactKeys: z.array(z.string().min(1)).default([]),
  memoryExpectations: z.array(ValidationScenarioMemoryExpectationSchema).default([]),
  beliefExpectations: z.array(ValidationScenarioBeliefExpectationSchema).default([]),
  utteranceExpectations: z.array(ValidationScenarioUtteranceExpectationSchema).default([]),
  foreshadowExpectations: z.array(ValidationScenarioForeshadowExpectationSchema).default([]),
  expectedMismatchIds: z.array(z.string().min(1)).default([]),
});

const ValidationScenarioEventRecordSchema = z.object({
  episode: z.number().int().positive(),
  arcId: z.string().min(1),
  event: SimulationEventSchema,
  canonicalFactChanges: z.array(ValidationScenarioFactSnapshotSchema).default([]),
  directExperienceCharacterIds: z.array(z.string().min(1)).default([]),
  informedCharacterIds: z.array(z.string().min(1)).default([]),
  interpretationEligibleCharacterIds: z.array(z.string().min(1)).default([]),
  expectedMemoryOutcomes: z.array(ValidationScenarioMemoryExpectationSchema).default([]),
  expectedBeliefOutcomes: z.array(ValidationScenarioBeliefExpectationSchema).default([]),
  expectedUtteranceOutcomes: z.array(ValidationScenarioUtteranceExpectationSchema).default([]),
  expectedMismatchAttributions: z.array(ValidationScenarioMismatchAttributionSchema).default([]),
  continuityTags: z.array(z.string().min(1)).default([]),
});

export const LongFormValidationScenarioSchema: z.ZodType<DeterministicLongFormValidationScenario> = z
  .object({
    id: z.string().min(1),
    totalEpisodes: z.number().int().positive(),
    seed: NovelSeedSchema,
    groundTruthCausalEvents: z.array(ValidationScenarioEventRecordSchema),
    continuityCheckpoints: z.array(ValidationScenarioCheckpointSchema),
  })
  .superRefine((scenario, ctx) => {
    if (scenario.seed.total_chapters !== scenario.totalEpisodes) {
      ctx.addIssue({
        code: "custom",
        path: ["seed", "total_chapters"],
        message: "seed.total_chapters must match totalEpisodes",
      });
    }

    if (scenario.groundTruthCausalEvents.length !== scenario.totalEpisodes) {
      ctx.addIssue({
        code: "custom",
        path: ["groundTruthCausalEvents"],
        message: "groundTruthCausalEvents must contain one entry per episode",
      });
    }

    for (const [index, record] of scenario.groundTruthCausalEvents.entries()) {
      const expectedEpisode = index + 1;
      if (record.episode !== expectedEpisode) {
        ctx.addIssue({
          code: "custom",
          path: ["groundTruthCausalEvents", index, "episode"],
          message: `episode ${record.episode} is out of sequence; expected ${expectedEpisode}`,
        });
      }
    }

    for (const [index, checkpoint] of scenario.continuityCheckpoints.entries()) {
      if (checkpoint.chapter > scenario.totalEpisodes) {
        ctx.addIssue({
          code: "custom",
          path: ["continuityCheckpoints", index, "chapter"],
          message: "checkpoint chapter exceeds totalEpisodes",
        });
      }
    }
  });

export function parseLongFormValidationScenario(
  input: unknown,
): DeterministicLongFormValidationScenario {
  return LongFormValidationScenarioSchema.parse(input);
}

export function loadLongFormValidationScenarioFromFile(
  scenarioPath: string,
): DeterministicLongFormValidationScenario {
  const payload = JSON.parse(fs.readFileSync(scenarioPath, "utf-8")) as unknown;
  return parseLongFormValidationScenario(payload);
}

export interface ResolveLongFormValidationScenarioOptions {
  scenario?: DeterministicLongFormValidationScenario;
  scenarioPath?: string;
}

export function resolveLongFormValidationScenario(
  options: ResolveLongFormValidationScenarioOptions = {},
): DeterministicLongFormValidationScenario {
  if (options.scenarioPath) {
    return loadLongFormValidationScenarioFromFile(options.scenarioPath);
  }

  if (options.scenario) {
    return parseLongFormValidationScenario(options.scenario);
  }

  return createDeterministicLongFormValidationScenario();
}
