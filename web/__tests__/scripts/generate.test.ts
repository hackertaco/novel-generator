import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  buildRendererNarrativeStateIdentityManifest,
  buildRendererNarrativeStateImmutabilityReport,
} from "../../src/lib/harness";
import type { HarnessConfig, HarnessEvent } from "../../src/lib/harness";
import {
  addCharacterBelief,
  buildSimulationCausalLedger,
  createSimulationState,
  createSimulationValidationVerdict,
  formatSimulationValidationFailure,
} from "../../src/lib/sim";
import { ChapterGenerationPipelineExitCode } from "../../src/lib/cli/pipeline-run";
import { CHAPTER_GENERATION_ARTIFACT_LAYOUT } from "../../src/lib/orchestration";
import type {
  CharacterClaimMismatchRecord,
  CognitionVerificationIssue,
  ObjectiveStateVerificationRecord,
} from "../../src/lib/sim";
import {
  CausalLedgerValidationCliError,
  CanonicalValidationCliError,
  ContradictionValidationCliError,
  ForeshadowQualityGateCliError,
  handleGenerateCliFailure,
  runGenerateCli,
} from "../../scripts/generate";

function createSeed() {
  return {
    title: "canonical mismatch smoke",
    logline: "세라가 잘못된 믿음을 드러낸다.",
    total_chapters: 1,
    world: {
      name: "회랑",
      genre: "fantasy",
      sub_genre: "mystery",
      time_period: "unknown",
      magic_system: "sigils",
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    story_threads: [],
    arcs: [],
    foreshadowing: [],
    chapter_outlines: [],
    extended_outlines: [],
    style: {
      tone: "긴장",
      prose_guidelines: [],
      banned: [],
    },
  };
}

function makeIssue(): CognitionVerificationIssue {
  return {
    code: "missing_divergence_cause",
    recordType: "belief",
    characterId: "hero",
    recordId: "belief:missing-cause",
    chapter: 1,
    factIds: ["fact:door-closed"],
    severity: "error",
    message: "Belief conflicts with canonical truth without an explicit cause.",
  };
}

function makeObjectiveStateCheck(): ObjectiveStateVerificationRecord {
  return {
    recordType: "belief",
    characterId: "hero",
    recordId: "belief:missing-cause",
    chapter: 1,
    factIds: ["fact:door-closed"],
    normalizedTruthValues: {
      canonicalFacts: [],
      observedClaims: [{ raw: "문은 이미 열려 있었다.", normalized: "문은 이미 열려 있었다." }],
    },
    comparisonFields: {
      canonicalSubjects: [],
      canonicalPredicates: [],
      canonicalObjects: [],
      canonicalSummaries: [],
      observedClaims: [{ raw: "문은 이미 열려 있었다.", normalized: "문은 이미 열려 있었다." }],
    },
    contradictionCategories: ["missing_divergence_cause"],
    issueCodes: ["missing_divergence_cause"],
  };
}

function makeInvalidMismatch(): CharacterClaimMismatchRecord {
  return {
    recordType: "belief",
    characterId: "hero",
    recordId: "belief:missing-cause",
    chapter: 1,
    claim: "세라는 문이 이미 열려 있었다고 믿는다.",
    mismatchType: "canonical_conflict",
    causation: {
      mismatchType: "canonical_conflict",
      causeStatus: "missing",
      validationFailure: {
        code: "uncaused_mismatch",
        message: "No explicit recorded cause was available for belief:belief:missing-cause (canonical_conflict).",
        mismatch: {
          recordType: "belief",
          recordId: "belief:missing-cause",
          characterId: "hero",
          chapter: 1,
          mismatchType: "canonical_conflict",
          factIds: ["fact:door-closed"],
        },
        missingCause: {
          path: "divergenceCause",
          required: "explicit_divergence_cause",
          allowedKinds: ["misinterpretation", "lack_of_information"],
        },
        failureContext: {
          triggeringEventId: "evt-door-check",
          contradictedFactId: "fact:door-closed",
          objectiveFactIds: ["fact:door-closed"],
          traceabilityAnchors: [],
          unresolvedTraceabilityReferences: [],
        },
      },
      affectedEntity: {
        recordType: "belief",
        recordId: "belief:missing-cause",
        characterId: "hero",
      },
      introduction: {
        chapter: 1,
      },
      episodeSpan: {
        startChapter: 1,
        endChapter: 1,
        chapterCount: 1,
      },
    },
    validityStatus: "invalid",
    explanation: "Rejected mismatch: belief has no explicit cause.",
    canonicalTruths: [],
    ruleOutcome: {
      status: "invalid",
      requiredDimensions: ["inferred"],
      satisfiedDimensions: [],
      missingDimensions: ["inferred"],
      traceabilityStatus: "missing",
      traceabilityAnchors: [],
      unresolvedTraceabilityReferences: [],
      trace: [],
      summary: "missing cause",
    },
    evidence: {
      objectiveFactIds: ["fact:door-closed"],
      memoryIds: [],
      utteranceIds: [],
      traceabilityAnchors: [],
      unresolvedTraceabilityReferences: [],
    },
    issueCodes: ["missing_divergence_cause"],
  };
}

function createVerificationVerdict() {
  return createSimulationValidationVerdict({
    passed: false,
    checkedMemories: 0,
    checkedBeliefs: 1,
    checkedUtterances: 0,
    issues: [makeIssue()],
    mismatches: [makeInvalidMismatch()],
    objectiveStateChecks: [makeObjectiveStateCheck()],
  });
}

function createRecordedContradictionVerdict() {
  return createSimulationValidationVerdict({
    passed: false,
    checkedMemories: 1,
    checkedBeliefs: 0,
    checkedUtterances: 0,
    issues: [{
      code: "unsupported_divergence_cause",
      recordType: "memory",
      characterId: "hero",
      recordId: "memory:sealed-gate",
      chapter: 1,
      factIds: ["fact:sealed-gate"],
      severity: "error",
      message: "Memory relies on an unsupported divergence cause.",
    }],
    mismatches: [{
      recordType: "memory",
      characterId: "hero",
      recordId: "memory:sealed-gate",
      chapter: 1,
      claim: "세라는 봉인문이 이미 열렸다고 기억한다.",
      mismatchType: "canonical_conflict",
      causation: {
        mismatchType: "canonical_conflict",
        causeStatus: "recorded",
        provenance: {
          causeId: "cause:lying:sealed-gate",
          causeType: "lying",
          sourceEpisode: 1,
          sourceEventId: "evt-sealed-gate",
        },
        explicitCause: {
          kind: "lying",
          summary: "적대자가 봉인문 기록을 위조했다.",
          sourceEventId: "evt-sealed-gate",
          sourceCharacterId: "villain",
        },
        sourceEvent: {
          eventId: "evt-sealed-gate",
          chapter: 1,
        },
        affectedEntity: {
          recordType: "memory",
          recordId: "memory:sealed-gate",
          characterId: "hero",
        },
        triggeringEvent: {
          eventId: "evt-memory-echo",
          chapter: 1,
          sourceActorId: "hero",
        },
        contradictedFact: {
          factId: "fact:sealed-gate",
          chapter: 1,
          sourceEventId: "evt-sealed-gate",
        },
        introduction: {
          chapter: 1,
          eventId: "evt-memory-echo",
        },
        episodeSpan: {
          startChapter: 1,
          endChapter: 1,
          chapterCount: 1,
        },
      },
      validityStatus: "invalid",
      explanation: "Rejected mismatch: memory used a lie cause where only forgetting was allowed.",
      canonicalTruths: [],
      ruleOutcome: {
        status: "invalid",
        requiredDimensions: ["forgotten"],
        satisfiedDimensions: [],
        missingDimensions: ["forgotten"],
        traceabilityStatus: "supported",
        traceabilityAnchors: ["fact:sealed-gate"],
        unresolvedTraceabilityReferences: [],
        trace: [],
        summary: "unsupported divergence cause",
      },
      evidence: {
        objectiveFactIds: ["fact:sealed-gate"],
        memoryIds: [],
        utteranceIds: [],
        traceabilityAnchors: ["fact:sealed-gate"],
        unresolvedTraceabilityReferences: [],
      },
      issueCodes: ["unsupported_divergence_cause"],
    }],
    objectiveStateChecks: [],
  });
}

function createHarnessConfig(): HarnessConfig {
  return {
    name: "test",
    models: {
      planning: "test",
      writing: "test",
      critique: "test",
      repair: "test",
      default: "test",
    },
    pipeline: [],
    qualityThreshold: 0.8,
    maxAttempts: 1,
    budgetUsd: null,
    evalDimensions: [],
    tracking: {
      memory: false,
      characters: false,
      threads: false,
      tone: false,
      progress: false,
      feedback: false,
    },
    output: { mode: "file", verbose: false },
    chapterLength: { min: 1, max: 1 },
    fastMode: false,
    parallelMode: false,
    simpleMode: false,
  };
}

function createRendererRegenerationFixture() {
  const failedText =
    "세라는 북회랑 봉인 흔적을 보며 누군가 먼저 왔다고 생각했다. 세라는 북회랑 봉인 흔적을 보며 누군가 먼저 왔다고 생각했다.";
  const regeneratedText =
    "세라는 북회랑 봉인 흔적을 쓸어내리며 누군가 자신보다 먼저 이 복도를 지나갔다고 확신했다.";
  const seed = {
    ...createSeed(),
    characters: [
      {
        id: "hero",
        name: "세라",
        role: "protagonist",
        description: "북회랑의 흔적을 추적하는 주인공",
        introduction_chapter: 1,
        traits: [],
        speech_style: { formality: "plain", quirk: "", vocabulary: [] },
        state: {
          status: "긴장",
          location: "북회랑",
          inventory: [],
          relationships: {},
          secrets_known: [],
          realization_stage: null,
        },
      },
    ],
  } as const;
  const simulationState = createSimulationState(seed as never);

  simulationState.eventLog.push({
    id: "evt-renderer-regen-1",
    type: "knowledge_reveal",
    chapter: 1,
    actorId: "hero",
    summary: "세라가 북회랑 봉인 흔적을 직접 확인했다.",
    participants: ["hero"],
    objectiveFactIds: [],
    cognition: {
      experiencedBy: ["hero"],
      interpretedBy: [],
      witnesses: ["hero"],
    },
    memoryUpdates: [],
    beliefUpdates: [],
    utteranceIds: [],
    causes: [],
    effects: [],
    tags: ["observation"],
  } as never);
  addCharacterBelief(simulationState.beliefs, {
    characterId: "hero",
    chapter: 1,
    kind: "interpretation",
    subject: "북회랑 봉인 흔적",
    belief: "누군가 자신보다 먼저 북회랑에 도착했다.",
    confidence: "medium",
    cause: "봉인 흔적과 발자국을 연결한 추론",
    references: {
      eventId: "evt-renderer-regen-1",
    },
  });

  const worldStateProjection = [{
    chapter: 1,
    facts: [],
    character_states: [],
    summary: "세라가 봉인 흔적을 발견했다.",
  }] as never;
  const stateIdentity = buildRendererNarrativeStateIdentityManifest({
    simulationState,
    worldStateProjection,
  });
  const immutabilityReport = buildRendererNarrativeStateImmutabilityReport({
    baseline: stateIdentity,
    rehydrated: stateIdentity,
    postRender: stateIdentity,
  });

  return {
    seed,
    failedText,
    regeneratedText,
    request: {
      snapshot: {
        chapterNumber: 7,
        blueprint: {
          chapter_number: 7,
          title: "봉인 흔적의 재정리",
          arc_id: "arc-renderer-regression",
          one_liner: "같은 narrative state를 유지한 채 prose만 교체한다.",
          role_in_arc: "rising_action",
          scenes: [],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: ["hero"],
          tension_level: 6,
          target_word_count: 3200,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [{
          chapter: 6,
          title: "6화",
          summary: "세라가 북회랑의 봉인 흔적을 포착했다.",
        }],
        previousChapterEnding:
          "세라는 봉인 흔적이 아직 따뜻하다는 사실에서 누군가 막 지나갔다고 판단했다.",
        simulationState,
        worldStateProjection,
        stateIdentity,
      },
      proseFailureContext: {
        summary: "반복 문장을 제거하고 행동 중심 prose로 다시 써야 한다.",
        issues: ["같은 사실을 두 번 서술한다."],
        preserve: ["북회랑 봉인 흔적 발견", "세라의 의심"],
        failedText,
      },
      immutabilityReport,
    },
  };
}

function createForeshadowSeed({
  resolvedCount,
  pendingCount = 0,
  abandonedCount = 0,
}: {
  resolvedCount: number;
  pendingCount?: number;
  abandonedCount?: number;
}) {
  const seed = createSeed();
  const foreshadowing: Array<Record<string, unknown>> = [];

  for (let index = 0; index < resolvedCount; index++) {
    const id = `fs_resolved_${index + 1}`;
    foreshadowing.push({
      id,
      name: `해결 복선 ${index + 1}`,
      description: `복선 ${index + 1}의 약속`,
      importance: "critical",
      planted_at: 1,
      hints_at: [],
      reveal_at: 1,
      origin: {
        episode_id: "ep_001",
        scene_id: `scene_001_resolved_${String(index + 1).padStart(2, "0")}`,
        source_span: {
          start_offset: 0,
          end_offset: 10,
        },
      },
      linked_hint_occurrences: [],
      status: "pending",
      hint_count: 0,
    });
  }

  for (let index = 0; index < pendingCount; index++) {
    foreshadowing.push({
      id: `fs_pending_${index + 1}`,
      name: `미해결 복선 ${index + 1}`,
      description: `아직 회수되지 않은 복선 ${index + 1}`,
      importance: "critical",
      planted_at: 1,
      hints_at: [],
      reveal_at: null,
      origin: {
        episode_id: "ep_001",
        scene_id: `scene_001_pending_${String(index + 1).padStart(2, "0")}`,
        source_span: {
          start_offset: 0,
          end_offset: 10,
        },
      },
      linked_hint_occurrences: [],
      status: "pending",
      hint_count: 0,
    });
  }

  for (let index = 0; index < abandonedCount; index++) {
    foreshadowing.push({
      id: `fs_abandoned_${index + 1}`,
      name: `폐기 복선 ${index + 1}`,
      description: `의도적으로 접은 복선 ${index + 1}`,
      importance: "critical",
      planted_at: 1,
      hints_at: [],
      reveal_at: null,
      origin: {
        episode_id: "ep_001",
        scene_id: `scene_001_abandoned_${String(index + 1).padStart(2, "0")}`,
        source_span: {
          start_offset: 0,
          end_offset: 10,
        },
      },
      linked_hint_occurrences: [],
      status: "pending",
      hint_count: 0,
      abandonment_marker: "intentional-abandonment:timeline-cut",
    });
  }

  return {
    ...seed,
    foreshadowing,
  };
}

class ForeshadowGateHarness {
  constructor(
    private readonly resolvedCount: number,
    private readonly evaluationHorizonChapter = 1,
  ) {}

  async *run(): AsyncGenerator<HarnessEvent> {
    const foreshadowingTouched = Array.from({ length: this.resolvedCount }, (_, index) => ({
      foreshadowing_id: `fs_resolved_${index + 1}`,
      action: "reveal",
      context: `복선 ${index + 1}의 회수 장면`,
    }));

    yield { type: "chapter_start", chapter: 1 };
    yield {
      type: "chapter_complete",
      result: {
        chapterNumber: 1,
        text: "복선 회수 테스트 장면.",
        summary: {
          title: "1화",
          plot_summary: "복선 회수율을 검증한다.",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: ["hero"],
            ongoing_action: "표식을 확인한다",
            unresolved_tension: "남은 복선이 정리되는가",
          },
          foreshadowing_touched: foreshadowingTouched,
        } as never,
        score: 0.81,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        durationMs: 20,
      } as never,
    };
    const chapters = [{
      chapterNumber: 1,
      text: "복선 회수 테스트 장면.",
      summary: {
        title: "1화",
        plot_summary: "복선 회수율을 검증한다.",
        ending_scene_state: {
          location: "회랑",
          time_of_day: "night",
          characters_present: ["hero"],
          ongoing_action: "표식을 확인한다",
          unresolved_tension: "남은 복선이 정리되는가",
        },
        foreshadowing_touched: foreshadowingTouched,
      } as never,
      score: 0.81,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
      durationMs: 20,
    }];
    if (this.evaluationHorizonChapter > 1) {
      chapters.push({
        chapterNumber: this.evaluationHorizonChapter,
        text: "회수 기한 검증용 평가 지평 장면.",
        summary: {
          title: `${this.evaluationHorizonChapter}화`,
          plot_summary: "남은 복선의 회수 기한이 지났는지 검증한다.",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: ["hero"],
            ongoing_action: "기한이 지난 표식을 대조한다",
            unresolved_tension: "미회수 복선이 품질 게이트를 막는가",
          },
          foreshadowing_touched: [],
        } as never,
        score: 0.81,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
        durationMs: 0,
      });
    }

    yield {
      type: "done",
      result: {
        config: "test",
        chapters,
        totalUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        totalDurationMs: 20,
        totalCostUsd: 0.01,
        canonicalValidationFailures: [],
        beliefInterpretationRecoveries: [],
      } as never,
    };
  }
}

class FakeHarness {
  async *run(): AsyncGenerator<HarnessEvent> {
    const verification = createVerificationVerdict();
    const causalLedger = buildSimulationCausalLedger([{
      id: "evt-door-check",
      chapter: 1,
      episode: 1,
      type: "learn_fact",
      actorId: "hero",
      summary: "세라가 문이 잠겨 있다는 사실을 확인한다.",
      involvedEntities: [{
        entityId: "hero",
        entityType: "character",
        role: "actor",
      }],
      prerequisites: [],
      outcomes: [],
      stateChanges: [],
      tags: ["cli-test"],
      payload: {
        subject: "문",
        object: "잠겨 있음",
      },
    }]);

    yield { type: "chapter_start", chapter: 1 };
    yield {
      type: "chapter_complete",
      result: {
        chapterNumber: 1,
        text: "문은 닫혀 있었지만 세라는 반대로 믿었다.",
        summary: {
          title: "1화",
          plot_summary: "잘못된 믿음이 드러난다.",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: ["hero"],
            ongoing_action: "문을 조사한다",
            unresolved_tension: "왜 믿음이 엇갈렸는가",
          },
        } as never,
        score: 0.64,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        durationMs: 20,
        verification,
      },
    };
    yield {
      type: "error",
      chapter: 1,
      message: formatSimulationValidationFailure(verification, 1),
    };
    yield {
      type: "done",
      result: {
        config: "test",
        chapters: [{
          chapterNumber: 1,
          text: "문은 닫혀 있었지만 세라는 반대로 믿었다.",
          summary: {
            title: "1화",
            plot_summary: "잘못된 믿음이 드러난다.",
            ending_scene_state: {
              location: "회랑",
              time_of_day: "night",
              characters_present: ["hero"],
              ongoing_action: "문을 조사한다",
              unresolved_tension: "왜 믿음이 엇갈렸는가",
            },
          } as never,
          score: 0.64,
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
          durationMs: 20,
          verification,
        }],
        totalUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        totalDurationMs: 20,
        totalCostUsd: 0.01,
        verification,
        canonicalValidationFailures: [],
        beliefInterpretationRecoveries: [],
        causalLedger,
      },
    };
  }
}

class RecoveredBeliefHarness {
  async *run(): AsyncGenerator<HarnessEvent> {
    const beliefInterpretationRecovery = {
      chapter: 1,
      attempted: true,
      status: "recovered" as const,
      triggerIssueCodes: ["missing_traceability_link"],
      targetedBeliefIds: ["belief:hero:3"],
      targetedCharacterIds: ["hero"],
      selectedMemoryIds: ["memory:hero:4"],
      recomputations: [
        {
          characterId: "hero",
          targetedBeliefIds: ["belief:hero:3"],
          selectedMemoryIds: ["memory:hero:4"],
          removedBeliefIds: ["belief:hero:3"],
          invalidatedInterpretationIds: ["belief-interpretation:hero:2"],
          createdBeliefIds: ["belief:hero:4"],
          createdInterpretationIds: ["belief-interpretation:hero:3"],
        },
      ],
      before: {
        passed: false,
        issueCount: 1,
        invalidContradictionCount: 1,
        targetedIssueCount: 1,
        targetedInvalidContradictionCount: 1,
      },
      after: {
        passed: true,
        issueCount: 0,
        invalidContradictionCount: 0,
        targetedIssueCount: 0,
        targetedInvalidContradictionCount: 0,
      },
      recoveredBeliefIds: ["belief:hero:3"],
      unresolvedBeliefIds: [],
      message:
        "Belief interpretation recovery rebuilt the failing belief set from existing memories.",
    };

    yield { type: "chapter_start", chapter: 1 };
    yield {
      type: "chapter_complete",
      result: {
        chapterNumber: 1,
        text: "세라는 기억을 더듬어 잘못된 추론을 다시 계산했다.",
        summary: {
          title: "1화",
          plot_summary: "기억 기반 믿음 복구가 성공한다.",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: ["hero"],
            ongoing_action: "봉인 흔적을 다시 훑는다",
            unresolved_tension: "누가 거짓 흔적을 남겼는가",
          },
        } as never,
        score: 0.88,
        usage: { prompt_tokens: 9, completion_tokens: 7, total_tokens: 16, cost_usd: 0.02 },
        durationMs: 25,
        verification: {
          passed: true,
          issueCount: 0,
          mismatchCount: 1,
          invalidContradictionCount: 0,
          allowedExceptionCount: 1,
          issues: [],
          invalidContradictions: [],
          allowedExceptions: [],
        } as never,
        beliefInterpretationRecovery,
      } as never,
    };
    yield {
      type: "done",
      result: {
        config: "test",
        chapters: [{
          chapterNumber: 1,
          text: "세라는 기억을 더듬어 잘못된 추론을 다시 계산했다.",
          summary: {
            title: "1화",
            plot_summary: "기억 기반 믿음 복구가 성공한다.",
            ending_scene_state: {
              location: "회랑",
              time_of_day: "night",
              characters_present: ["hero"],
              ongoing_action: "봉인 흔적을 다시 훑는다",
              unresolved_tension: "누가 거짓 흔적을 남겼는가",
            },
          } as never,
          score: 0.88,
          usage: { prompt_tokens: 9, completion_tokens: 7, total_tokens: 16, cost_usd: 0.02 },
          durationMs: 25,
          verification: {
            passed: true,
            issueCount: 0,
            mismatchCount: 1,
            invalidContradictionCount: 0,
            allowedExceptionCount: 1,
            issues: [],
            invalidContradictions: [],
            allowedExceptions: [],
          } as never,
          beliefInterpretationRecovery,
        }],
        totalUsage: { prompt_tokens: 9, completion_tokens: 7, total_tokens: 16, cost_usd: 0.02 },
        totalDurationMs: 25,
        totalCostUsd: 0.02,
        verification: {
          passed: true,
          issueCount: 0,
          mismatchCount: 1,
          invalidContradictionCount: 0,
          allowedExceptionCount: 1,
          issues: [],
          invalidContradictions: [],
          allowedExceptions: [],
        } as never,
        beliefInterpretationRecoveries: [beliefInterpretationRecovery],
        canonicalValidationFailures: [],
      } as never,
    };
  }
}

class CausalLedgerFailureHarness {
  async *run(): AsyncGenerator<HarnessEvent> {
    yield { type: "chapter_start", chapter: 1 };
    yield {
      type: "chapter_complete",
      result: {
        chapterNumber: 1,
        text: "원인이 늦게 도착한 사건 로그.",
        summary: {
          title: "1화",
          plot_summary: "원인보다 결과가 먼저 기록된다.",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: ["hero"],
            ongoing_action: "늦은 원인을 정리한다",
            unresolved_tension: "왜 순서가 뒤집혔는가",
          },
        } as never,
        score: 0.73,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        durationMs: 20,
      } as never,
    };
    yield {
      type: "done",
      result: {
        config: "test",
        chapters: [{
          chapterNumber: 1,
          text: "원인이 늦게 도착한 사건 로그.",
          summary: {
            title: "1화",
            plot_summary: "원인보다 결과가 먼저 기록된다.",
            ending_scene_state: {
              location: "회랑",
              time_of_day: "night",
              characters_present: ["hero"],
              ongoing_action: "늦은 원인을 정리한다",
              unresolved_tension: "왜 순서가 뒤집혔는가",
            },
          } as never,
          score: 0.73,
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
          durationMs: 20,
        }],
        totalUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        totalDurationMs: 20,
        totalCostUsd: 0.01,
        canonicalValidationFailures: [],
        causalLedgerValidation: {
          passed: false,
          majorPlotActionCount: 0,
          issueCount: 1,
          issues: [{
            code: "episode_order_violation",
            eventId: "evt_cause_later",
            chapter: 3,
            episode: 3,
            referencedEventId: "evt_effect_first",
            message: "Event \"evt_cause_later\" is out of chronology after \"evt_effect_first\".",
          }],
        },
      } as never,
    };
  }
}

class ContradictionOnlyHarness {
  async *run(): AsyncGenerator<HarnessEvent> {
    const verification = createRecordedContradictionVerdict();

    yield { type: "chapter_start", chapter: 1 };
    yield {
      type: "chapter_complete",
      result: {
        chapterNumber: 1,
        text: "거짓 기록을 사실처럼 기억한 장면.",
        summary: {
          title: "1화",
          plot_summary: "기억 모순이 명시적으로 기록된다.",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: ["hero"],
            ongoing_action: "거짓 기록을 되짚는다",
            unresolved_tension: "왜 기억이 왜곡됐는가",
          },
        } as never,
        score: 0.71,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        durationMs: 20,
        verification,
      },
    };
    yield {
      type: "error",
      chapter: 1,
      message: formatSimulationValidationFailure(verification, 1),
    };
    yield {
      type: "done",
      result: {
        config: "test",
        chapters: [{
          chapterNumber: 1,
          text: "거짓 기록을 사실처럼 기억한 장면.",
          summary: {
            title: "1화",
            plot_summary: "기억 모순이 명시적으로 기록된다.",
            ending_scene_state: {
              location: "회랑",
              time_of_day: "night",
              characters_present: ["hero"],
              ongoing_action: "거짓 기록을 되짚는다",
              unresolved_tension: "왜 기억이 왜곡됐는가",
            },
          } as never,
          score: 0.71,
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
          durationMs: 20,
          verification,
        }],
        totalUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.01 },
        totalDurationMs: 20,
        totalCostUsd: 0.01,
        verification,
        canonicalValidationFailures: [],
        beliefInterpretationRecoveries: [],
      },
    };
  }
}

describe("generate CLI canonical validation handling", () => {
  it("propagates uncaused mismatch validation failures without generic fatal text", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-test-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");
    const stdout: string[] = [];
    const stderr: string[] = [];

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");

    let thrown: unknown;
    try {
      await runGenerateCli({
        args: ["--seed", seedPath, "--chapters", "1", "--out", outDir, "--quiet"],
        io: {
          log: (...args) => stdout.push(args.join(" ")),
          error: (...args) => stderr.push(args.join(" ")),
          write: (chunk) => stdout.push(chunk),
        },
        createHarness: () => new FakeHarness() as never,
        resolveConfig: () => createHarnessConfig(),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CanonicalValidationCliError);
    expect(handleGenerateCliFailure(thrown, {
      error: (...args) => stderr.push(args.join(" ")),
    })).toBe(ChapterGenerationPipelineExitCode.canonicalValidationFailed);

    const stderrOutput = stderr.join("\n");
    expect(stderrOutput).toContain("canonical validation failure");
    expect(stderrOutput).toContain("[uncaused_mismatch] belief/belief:missing-cause");
    expect(stderrOutput).toContain("explicit_divergence_cause");
    expect(stderrOutput).toContain("\"triggeringEventId\": \"evt-door-check\"");
    expect(stderrOutput).toContain("실패 요약");
    expect(stderrOutput).toContain(`output dir: ${outDir}`);
    expect(stderrOutput).toContain(`partial result: ${path.join(outDir, "result.json")}`);
    expect(stderrOutput).toContain(
      `run metadata: ${path.join(
        outDir,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName,
      )}`,
    );
    expect(stderrOutput).toContain(
      `artifact manifest: ${path.join(
        outDir,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.manifestFileName,
      )}`,
    );
    expect(stderrOutput).not.toContain("Fatal error:");
    expect(stderrOutput).not.toContain("1화 에러:");

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "result.json"), "utf-8"),
    ) as {
      causalLedgerSummary: {
        eventCount: number;
        firstEventId: string | null;
        lastEventId: string | null;
        startEpisode: number | null;
        endEpisode: number | null;
      } | null;
      causalLedgerAggregationSummary: {
        episodeCount: number;
        firstEpisode: number | null;
        lastEpisode: number | null;
        crossEpisodeLinkCount: number;
        unresolvedCrossEpisodeLinkCount: number;
      } | null;
      causalLedgerValidation: {
        passed: boolean;
        majorPlotActionCount: number;
        issueCount: number;
      } | null;
      canonicalValidationFailures: Array<{
        code: string;
        chapter: number;
        uncausedMismatchFailures: Array<{
          code: string;
          mismatch: { recordId: string };
        }>;
      }>;
    };

    expect(result.canonicalValidationFailures).toEqual([
      expect.objectContaining({
        code: "simulation_validation_failed",
        chapter: 1,
        uncausedMismatchFailures: [
          expect.objectContaining({
            code: "uncaused_mismatch",
            mismatch: expect.objectContaining({
              recordId: "belief:missing-cause",
            }),
          }),
        ],
      }),
    ]);
    expect(result.causalLedgerSummary).toMatchObject({
      eventCount: 1,
      firstEventId: "evt-door-check",
      lastEventId: "evt-door-check",
      startEpisode: 1,
      endEpisode: 1,
    });
    expect(result.causalLedgerAggregationSummary).toMatchObject({
      episodeCount: 1,
      firstEpisode: 1,
      lastEpisode: 1,
      crossEpisodeLinkCount: 0,
      unresolvedCrossEpisodeLinkCount: 0,
    });
    expect(result.causalLedgerValidation).toMatchObject({
      passed: true,
      majorPlotActionCount: 0,
      issueCount: 0,
    });

    const causalLedger = JSON.parse(
      fs.readFileSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.ledgersDirName,
          "causal-ledger.json",
        ),
        "utf-8",
      ),
    ) as {
      events: Array<{ id: string; episode: number }>;
    };
    expect(causalLedger.events).toEqual([
      expect.objectContaining({
        id: "evt-door-check",
        episode: 1,
      }),
    ]);

    const causalLedgerAggregation = JSON.parse(
      fs.readFileSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.ledgersDirName,
          "causal-ledger-aggregation.json",
        ),
        "utf-8",
      ),
    ) as {
      totalEventCount: number;
      totalEpisodeCount: number;
      crossEpisode: {
        totalLinkCount: number;
      };
      perEpisode: Array<{
        episode: number;
        eventIds: string[];
      }>;
    };
    expect(causalLedgerAggregation).toMatchObject({
      totalEventCount: 1,
      totalEpisodeCount: 1,
      crossEpisode: {
        totalLinkCount: 0,
      },
      perEpisode: [
        {
          episode: 1,
          eventIds: ["evt-door-check"],
        },
      ],
    });

    const runMetadata = JSON.parse(
      fs.readFileSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName,
        ),
        "utf-8",
      ),
    ) as {
      workflow: string;
      chapterRange: {
        startChapter: number;
        endChapter: number;
        generatedChapterCount: number;
      };
      validation: {
        canonicalValidationFailureCount: number;
      };
    };
    expect(runMetadata).toMatchObject({
      workflow: "chapter_generation",
      chapterRange: {
        startChapter: 1,
        endChapter: 1,
        generatedChapterCount: 1,
      },
      validation: {
        canonicalValidationFailureCount: 1,
      },
    });

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.manifestFileName,
        ),
        "utf-8",
      ),
    ) as {
      artifacts: {
        chapters: Array<{
          chapterNumber: number;
          textFile: string;
          summaryFile: string;
        }>;
      };
    };
    expect(manifest.artifacts.chapters).toEqual([
      {
        chapterNumber: 1,
        textFile:
          `${CHAPTER_GENERATION_ARTIFACT_LAYOUT.chaptersDirName}/chapter-001.txt`,
        summaryFile:
          `${CHAPTER_GENERATION_ARTIFACT_LAYOUT.summariesDirName}/chapter-001.summary.json`,
      },
    ]);
  });

  it("records belief interpretation recovery outcomes in CLI logs and result artifacts", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-recovery-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");
    const stdout: string[] = [];
    const stderr: string[] = [];

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");

    await runGenerateCli({
      args: ["--seed", seedPath, "--chapters", "1", "--out", outDir, "--quiet"],
      io: {
        log: (...args) => stdout.push(args.join(" ")),
        error: (...args) => stderr.push(args.join(" ")),
        write: (chunk) => stdout.push(chunk),
      },
      createHarness: () => new RecoveredBeliefHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    });

    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("belief recovery: recovered");

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "result.json"), "utf-8"),
    ) as {
      beliefInterpretationRecoveries: Array<{
        status: string;
        targetedBeliefIds: string[];
        selectedMemoryIds: string[];
      }>;
      chapters: Array<{
        beliefInterpretationRecovery?: {
          status: string;
          recoveredBeliefIds: string[];
        };
      }>;
    };

    expect(result.beliefInterpretationRecoveries).toEqual([
      expect.objectContaining({
        status: "recovered",
        targetedBeliefIds: ["belief:hero:3"],
        selectedMemoryIds: ["memory:hero:4"],
      }),
    ]);
    expect(result.chapters[0]?.beliefInterpretationRecovery).toEqual(
      expect.objectContaining({
        status: "recovered",
        recoveredBeliefIds: ["belief:hero:3"],
      }),
    );
  });

  it("streams workflow stages, warnings, and output locations during a quiet successful run", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-stage-reporting-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");
    const stdout: string[] = [];
    const stderr: string[] = [];

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");

    await runGenerateCli({
      args: ["--seed", seedPath, "--chapters", "1", "--out", outDir, "--quiet"],
      io: {
        log: (...args) => stdout.push(args.join(" ")),
        error: (...args) => stderr.push(args.join(" ")),
        write: (chunk) => stdout.push(chunk),
      },
      createHarness: () => new RecoveredBeliefHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    });

    const stdoutOutput = stdout.join("\n");
    expect(stderr).toEqual([]);
    expect(stdoutOutput).toContain("[workflow:start] chapter_generation runId=");
    expect(stdoutOutput).toContain("[stage:start] Resolve Run Input [resolve_run_input]");
    expect(stdoutOutput).toContain("[stage:done] Finalize Output [finalize_output]");
    expect(stdoutOutput).toContain("[workflow:done] chapter_generation ok=true errors=0");
    expect(stdoutOutput).toContain("warning: allowed verification exceptions=1");
    expect(stdoutOutput).toContain(`output dir: ${outDir}`);
    expect(stdoutOutput).toContain(`result.json: ${path.join(outDir, "result.json")}`);
    expect(stdoutOutput).toContain(
      `run metadata: ${path.join(
        outDir,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName,
      )}`,
    );
    expect(stdoutOutput).toContain(
      `artifact manifest: ${path.join(
        outDir,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
        CHAPTER_GENERATION_ARTIFACT_LAYOUT.manifestFileName,
      )}`,
    );
  });
});

describe("generate CLI contradiction validation handling", () => {
  it("surfaces recorded belief or memory contradictions without falling back to the generic error", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-contradiction-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");
    const stdout: string[] = [];
    const stderr: string[] = [];

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");

    let thrown: unknown;
    try {
      await runGenerateCli({
        args: ["--seed", seedPath, "--chapters", "1", "--out", outDir, "--quiet"],
        io: {
          log: (...args) => stdout.push(args.join(" ")),
          error: (...args) => stderr.push(args.join(" ")),
          write: (chunk) => stdout.push(chunk),
        },
        createHarness: () => new ContradictionOnlyHarness() as never,
        resolveConfig: () => createHarnessConfig(),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContradictionValidationCliError);
    expect(handleGenerateCliFailure(thrown, {
      error: (...args) => stderr.push(args.join(" ")),
    })).toBe(ChapterGenerationPipelineExitCode.contradictionValidationFailed);

    const stderrOutput = stderr.join("\n");
    expect(stderrOutput).toContain("contradiction validation failure");
    expect(stderrOutput).toContain("belief=0, memory=1, utterance=0, continuity=0");
    expect(stderrOutput).toContain("[memory/canonical_conflict] hero/memory:sealed-gate");
    expect(stderrOutput).not.toContain("Fatal error:");
    expect(stderrOutput).not.toContain("Simulation validation failed without canonical mismatch details.");

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "result.json"), "utf-8"),
    ) as {
      contradictionValidation: {
        passed: boolean;
        contradiction_count: number;
        totalViolationCount: number;
        counts: {
          belief: number;
          memory: number;
          utterance: number;
          continuity: number;
        };
        episodeDiagnostics: Array<{
          episode: number;
          episodeId: string;
          contradictionCount: number;
          details: Array<{
            sourceType: string;
            recordId: string | null;
          }>;
        }>;
        memoryViolations: Array<{
          recordId: string;
        }>;
      };
    };

    expect(result.contradictionValidation).toMatchObject({
      passed: false,
      contradiction_count: 1,
      totalViolationCount: 1,
      counts: {
        belief: 0,
        memory: 1,
        utterance: 0,
        continuity: 0,
      },
      memoryViolations: [
        {
          recordId: "memory:sealed-gate",
        },
      ],
      episodeDiagnostics: [
        {
          episode: 1,
          episodeId: "ep_001",
          contradictionCount: 1,
          details: [
            {
              sourceType: "memory",
              recordId: "memory:sealed-gate",
            },
          ],
        },
      ],
    });
  });
});

describe("generate CLI causal ledger validation handling", () => {
  it("surfaces chronology contradictions without falling back to generic fatal output", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-causal-ledger-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");
    const stdout: string[] = [];
    const stderr: string[] = [];

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");

    let thrown: unknown;
    try {
      await runGenerateCli({
        args: ["--seed", seedPath, "--chapters", "1", "--out", outDir, "--quiet"],
        io: {
          log: (...args) => stdout.push(args.join(" ")),
          error: (...args) => stderr.push(args.join(" ")),
          write: (chunk) => stdout.push(chunk),
        },
        createHarness: () => new CausalLedgerFailureHarness() as never,
        resolveConfig: () => createHarnessConfig(),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CausalLedgerValidationCliError);
    expect(handleGenerateCliFailure(thrown, {
      error: (...args) => stderr.push(args.join(" ")),
    })).toBe(ChapterGenerationPipelineExitCode.causalLedgerValidationFailed);

    const stderrOutput = stderr.join("\n");
    expect(stderrOutput).toContain("causal ledger chronology validation failure");
    expect(stderrOutput).toContain("[episode_order_violation] event=evt_cause_later");
    expect(stderrOutput).not.toContain("Fatal error:");

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "result.json"), "utf-8"),
    ) as {
      causalLedgerValidation: {
        passed: boolean;
        issueCount: number;
        issues: Array<{ code: string; eventId: string }>;
      };
    };

    expect(result.causalLedgerValidation).toMatchObject({
      passed: false,
      issueCount: 1,
      issues: [
        {
          code: "episode_order_violation",
          eventId: "evt_cause_later",
        },
      ],
    });
  });
});

describe("generate CLI foreshadow quality gate", () => {
  it("fails the run when fewer than 90% of eligible foreshadow items resolve within the window", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-foreshadow-fail-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");
    const stdout: string[] = [];
    const stderr: string[] = [];

    fs.writeFileSync(
      seedPath,
      JSON.stringify(createForeshadowSeed({ resolvedCount: 8, pendingCount: 2 }), null, 2),
      "utf-8",
    );

    let thrown: unknown;
    try {
      await runGenerateCli({
        args: ["--seed", seedPath, "--chapters", "1", "--out", outDir, "--quiet"],
        io: {
          log: (...args) => stdout.push(args.join(" ")),
          error: (...args) => stderr.push(args.join(" ")),
          write: (chunk) => stdout.push(chunk),
        },
        createHarness: () => new ForeshadowGateHarness(8, 81) as never,
        resolveConfig: () => createHarnessConfig(),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ForeshadowQualityGateCliError);
    expect(handleGenerateCliFailure(thrown, {
      error: (...args) => stderr.push(args.join(" ")),
    })).toBe(ChapterGenerationPipelineExitCode.foreshadowQualityGateFailed);

    const stderrOutput = stderr.join("\n");
    expect(stderrOutput).toContain("foreshadow quality gate failure");
    expect(stderrOutput).toContain("8/10");
    expect(stderrOutput).toContain("\"resolutionPercentage\": 80");
    expect(stderrOutput).not.toContain("Fatal error:");

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "result.json"), "utf-8"),
    ) as {
      foreshadowQualityGate: {
        eligibleRegisteredItemCount: number;
        resolvedWithinWindowItemCount: number;
        resolutionPercentage: number;
        pass: boolean;
      };
    };

    expect(result.foreshadowQualityGate).toMatchObject({
      eligibleRegisteredItemCount: 10,
      resolvedWithinWindowItemCount: 8,
      resolutionPercentage: 80,
      pass: false,
    });
  });

  it("excludes intentionally abandoned threads from the 90% denominator", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-foreshadow-pass-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");

    fs.writeFileSync(
      seedPath,
      JSON.stringify(createForeshadowSeed({ resolvedCount: 8, abandonedCount: 2 }), null, 2),
      "utf-8",
    );

    await expect(runGenerateCli({
      args: ["--seed", seedPath, "--chapters", "1", "--out", outDir, "--quiet"],
      createHarness: () => new ForeshadowGateHarness(8) as never,
      resolveConfig: () => createHarnessConfig(),
    })).resolves.toBeUndefined();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "result.json"), "utf-8"),
    ) as {
      foreshadowQualityGate: {
        totalRegisteredItemCount: number;
        eligibleRegisteredItemCount: number;
        intentionallyAbandonedItemCount: number;
        resolvedWithinWindowItemCount: number;
        resolutionPercentage: number;
        pass: boolean;
      };
    };

    expect(result.foreshadowQualityGate).toMatchObject({
      totalRegisteredItemCount: 10,
      eligibleRegisteredItemCount: 8,
      intentionallyAbandonedItemCount: 2,
      resolvedWithinWindowItemCount: 8,
      resolutionPercentage: 100,
      pass: true,
    });
  });

  it("loads renderer regeneration requests and targets the snapshot chapter", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-renderer-regeneration-"));
    const seedPath = path.join(tempDir, "seed.json");
    const requestPath = path.join(tempDir, "renderer-regeneration.json");
    const outDir = path.join(tempDir, "out");
    const capturedRuns: Array<{
      startChapter: number;
      endChapter: number;
      options?: Record<string, unknown>;
    }> = [];

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");
    fs.writeFileSync(requestPath, JSON.stringify({
      snapshot: {
        chapterNumber: 7,
        blueprint: {
          chapter_number: 7,
          title: "7화",
          arc_id: "arc-7",
          one_liner: "기존 상태에서 prose만 재렌더링한다.",
          role_in_arc: "rising_action",
          scenes: [],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: [],
          tension_level: 6,
          target_word_count: 3000,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [],
        simulationState: {
          seedTitle: "regen",
          chapterCursor: 6,
          objectiveFacts: { entries: [] },
          audienceKnowledge: [],
          characters: {},
          memories: { byCharacterId: {} },
          beliefs: { byCharacterId: {}, trustMatrix: {} },
          utterances: { byCharacterId: {} },
          foreshadowRegistry: { items: {} },
          threads: {},
          eventLog: [],
        },
        worldStateProjection: [],
      },
      proseFailureContext: {
        summary: "설명체를 행동 중심 prose로 다시 써야 한다.",
        issues: ["같은 사실을 두 번 요약한다."],
      },
    }, null, 2), "utf-8");

    class RendererRegenerationHarness {
      async *run(
        _seed: unknown,
        startChapter: number,
        endChapter: number,
        options?: Record<string, unknown>,
      ): AsyncGenerator<HarnessEvent> {
        capturedRuns.push({ startChapter, endChapter, options });

        yield { type: "chapter_start", chapter: startChapter };
        yield {
          type: "chapter_complete",
          result: {
            chapterNumber: startChapter,
            text: "렌더 재생성 결과 본문.",
            summary: {
              title: `${startChapter}화`,
              plot_summary: "기존 상태를 유지한 채 prose만 교체했다.",
              ending_scene_state: {
                location: "회랑",
                time_of_day: "night",
                characters_present: [],
                ongoing_action: "재작성 결과를 확인한다",
                unresolved_tension: "문체 수정이 충분한가",
              },
              foreshadowing_touched: [],
            } as never,
            score: 0.88,
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
              cost_usd: 0.03,
            },
            durationMs: 1200,
          },
        };
        yield {
          type: "done",
          result: {
            mode: "renderer_regeneration",
            config: "test",
            chapters: [{
              chapterNumber: startChapter,
              text: "렌더 재생성 결과 본문.",
              summary: {
                title: `${startChapter}화`,
                plot_summary: "기존 상태를 유지한 채 prose만 교체했다.",
              } as never,
              score: 0.88,
              usage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
                cost_usd: 0.03,
              },
              durationMs: 1200,
            }],
            totalUsage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
              cost_usd: 0.03,
            },
            totalDurationMs: 1200,
            totalCostUsd: 0.03,
            canonicalValidationFailures: [],
            beliefInterpretationRecoveries: [],
          },
        };
      }
    }

    await expect(runGenerateCli({
      args: [
        "--seed",
        seedPath,
        "--chapters",
        "1-3",
        "--out",
        outDir,
        "--quiet",
        "--renderer-regeneration-request",
        requestPath,
      ],
      createHarness: () => new RendererRegenerationHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    })).resolves.toBeUndefined();

    expect(capturedRuns).toHaveLength(1);
    expect(capturedRuns[0]).toMatchObject({
      startChapter: 7,
      endChapter: 7,
      options: {
        rendererRegeneration: expect.objectContaining({
          snapshot: expect.objectContaining({
            chapterNumber: 7,
            stateIdentity: expect.objectContaining({
              overallSha256: expect.any(String),
            }),
          }),
          proseFailureContext: expect.objectContaining({
            summary: "설명체를 행동 중심 prose로 다시 써야 한다.",
          }),
        }),
      },
    });
  });

  it("keeps renderer regeneration narrative state byte-identical in CLI artifacts while prose changes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-renderer-immutability-"));
    const seedPath = path.join(tempDir, "seed.json");
    const requestPath = path.join(tempDir, "renderer-request.json");
    const outDir = path.join(tempDir, "out");
    const capturedRuns: Array<{
      startChapter: number;
      endChapter: number;
      options?: Record<string, unknown>;
    }> = [];
    const fixture = createRendererRegenerationFixture();
    const originalRequestJson = JSON.stringify(fixture.request, null, 2);
    const serializedRequest = JSON.parse(originalRequestJson) as typeof fixture.request;

    fs.writeFileSync(seedPath, JSON.stringify(fixture.seed, null, 2), "utf-8");
    fs.writeFileSync(requestPath, originalRequestJson, "utf-8");

    class RendererImmutabilityHarness {
      async *run(
        _seed: unknown,
        startChapter: number,
        endChapter: number,
        options?: Record<string, unknown>,
      ): AsyncGenerator<HarnessEvent> {
        capturedRuns.push(structuredClone({
          startChapter,
          endChapter,
          options,
        }));

        const rendererRegenerationRequest = structuredClone(
          options?.rendererRegeneration as Record<string, unknown>,
        );

        yield { type: "chapter_start", chapter: startChapter };
        yield {
          type: "chapter_complete",
          result: {
            chapterNumber: startChapter,
            text: fixture.regeneratedText,
            summary: {
              title: `${startChapter}화`,
              plot_summary: "렌더러만 다시 실행했고 narrative state는 유지됐다.",
            } as never,
            score: 0.9,
            usage: {
              prompt_tokens: 12,
              completion_tokens: 18,
              total_tokens: 30,
              cost_usd: 0.03,
            },
            durationMs: 30,
            rendererRegenerationRequest: {
              ...rendererRegenerationRequest,
              immutabilityReport: fixture.request.immutabilityReport,
            } as never,
          },
        };
        yield {
          type: "done",
          result: {
            mode: "renderer_regeneration",
            config: "test",
            chapters: [{
              chapterNumber: startChapter,
              text: fixture.regeneratedText,
              summary: {
                title: `${startChapter}화`,
                plot_summary: "렌더러만 다시 실행했고 narrative state는 유지됐다.",
              } as never,
              score: 0.9,
              usage: {
                prompt_tokens: 12,
                completion_tokens: 18,
                total_tokens: 30,
                cost_usd: 0.03,
              },
              durationMs: 30,
            }],
            totalUsage: {
              prompt_tokens: 12,
              completion_tokens: 18,
              total_tokens: 30,
              cost_usd: 0.03,
            },
            totalDurationMs: 30,
            totalCostUsd: 0.03,
            canonicalValidationFailures: [],
            beliefInterpretationRecoveries: [],
          },
        };
      }
    }

    await expect(runGenerateCli({
      args: [
        "--seed",
        seedPath,
        "--chapters",
        "1-1",
        "--out",
        outDir,
        "--quiet",
        "--renderer-regeneration-request",
        requestPath,
      ],
      createHarness: () => new RendererImmutabilityHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    })).resolves.toBeUndefined();

    expect(capturedRuns).toHaveLength(1);
    expect(capturedRuns[0]).toMatchObject({
      startChapter: 7,
      endChapter: 7,
      options: {
        rendererRegeneration: {
          snapshot: {
            chapterNumber: 7,
            simulationState: serializedRequest.snapshot.simulationState,
            worldStateProjection: serializedRequest.snapshot.worldStateProjection,
          },
        },
      },
    });

    expect(fs.readFileSync(requestPath, "utf-8")).toBe(originalRequestJson);

    const chapterPath = path.join(
      outDir,
      CHAPTER_GENERATION_ARTIFACT_LAYOUT.chaptersDirName,
      "chapter-007.txt",
    );
    expect(fs.readFileSync(chapterPath, "utf-8")).toBe(fixture.regeneratedText);
    expect(fs.readFileSync(chapterPath, "utf-8")).not.toBe(
      fixture.failedText,
    );

    const artifactPath = path.join(
      outDir,
      CHAPTER_GENERATION_ARTIFACT_LAYOUT.rendererRegenerationDirName,
      "chapter-007.json",
    );
    expect(JSON.parse(fs.readFileSync(artifactPath, "utf-8"))).toMatchObject({
      snapshot: {
        chapterNumber: 7,
        simulationState: serializedRequest.snapshot.simulationState,
        worldStateProjection: serializedRequest.snapshot.worldStateProjection,
      },
      immutabilityReport: {
        byteEquivalent: true,
        rehydratedMatchesBaseline: true,
        postRenderMatchesBaseline: true,
        baseline: {
          overallSha256:
            fixture.request.immutabilityReport.baseline.overallSha256,
        },
        rehydrated: {
          overallSha256:
            fixture.request.immutabilityReport.baseline.overallSha256,
        },
        postRender: {
          overallSha256:
            fixture.request.immutabilityReport.baseline.overallSha256,
        },
        segmentComparisons: {
          beliefs: {
            rehydratedMatchesBaseline: true,
            postRenderMatchesBaseline: true,
          },
          events: {
            rehydratedMatchesBaseline: true,
            postRenderMatchesBaseline: true,
          },
          continuity: {
            rehydratedMatchesBaseline: true,
            postRenderMatchesBaseline: true,
          },
        },
      },
    });
  });

  it("accepts a saved renderer snapshot artifact and wraps it in a default regeneration request", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-renderer-snapshot-"));
    const seedPath = path.join(tempDir, "seed.json");
    const snapshotPath = path.join(tempDir, "renderer-snapshot.json");
    const outDir = path.join(tempDir, "out");
    const capturedRuns: Array<{
      startChapter: number;
      endChapter: number;
      options?: Record<string, unknown>;
    }> = [];

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");
    fs.writeFileSync(snapshotPath, JSON.stringify({
      chapterNumber: 5,
      blueprint: {
        chapter_number: 5,
        title: "5화",
        arc_id: "arc-5",
        one_liner: "저장된 narrative state에서 prose만 다시 쓴다.",
        role_in_arc: "rising_action",
        scenes: [],
        emotional_arc: "긴장",
        key_points: [],
        characters_involved: [],
        tension_level: 5,
        target_word_count: 2800,
        foreshadowing_actions: [],
        dependencies: [],
      },
      previousSummaries: [],
      simulationState: {
        seedTitle: "regen",
        chapterCursor: 4,
        objectiveFacts: { entries: [] },
        audienceKnowledge: [],
        characters: {},
        memories: { byCharacterId: {} },
        beliefs: { byCharacterId: {}, trustMatrix: {} },
        utterances: { byCharacterId: {} },
        foreshadowRegistry: { items: {} },
        threads: {},
        eventLog: [],
      },
      worldStateProjection: [],
    }, null, 2), "utf-8");

    class SnapshotHarness {
      async *run(
        _seed: unknown,
        startChapter: number,
        endChapter: number,
        options?: Record<string, unknown>,
      ): AsyncGenerator<HarnessEvent> {
        capturedRuns.push({ startChapter, endChapter, options });
        yield { type: "chapter_start", chapter: startChapter };
        yield {
          type: "chapter_complete",
          result: {
            chapterNumber: startChapter,
            text: "snapshot reload prose",
            summary: {
              title: `${startChapter}화`,
              plot_summary: "저장된 상태를 읽어 prose만 재작성했다.",
            } as never,
            score: 0.8,
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
              cost_usd: 0.002,
            },
            durationMs: 10,
          },
        };
        yield {
          type: "done",
          result: {
            mode: "renderer_regeneration",
            config: "test",
            chapters: [{
              chapterNumber: startChapter,
              text: "snapshot reload prose",
              summary: {
                title: `${startChapter}화`,
                plot_summary: "저장된 상태를 읽어 prose만 재작성했다.",
              } as never,
              score: 0.8,
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
                cost_usd: 0.002,
              },
              durationMs: 10,
            }],
            totalUsage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
              cost_usd: 0.002,
            },
            totalDurationMs: 10,
            totalCostUsd: 0.002,
            canonicalValidationFailures: [],
            beliefInterpretationRecoveries: [],
          },
        };
      }
    }

    await expect(runGenerateCli({
      args: [
        "--seed",
        seedPath,
        "--chapters",
        "1-1",
        "--out",
        outDir,
        "--quiet",
        "--renderer-regeneration-request",
        snapshotPath,
      ],
      createHarness: () => new SnapshotHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    })).resolves.toBeUndefined();

    expect(capturedRuns).toHaveLength(1);
    expect(capturedRuns[0]).toMatchObject({
      startChapter: 5,
      endChapter: 5,
      options: {
        rendererRegeneration: expect.objectContaining({
          snapshot: expect.objectContaining({
            chapterNumber: 5,
            stateIdentity: expect.objectContaining({
              overallSha256: expect.any(String),
            }),
          }),
          proseFailureContext: expect.objectContaining({
            summary: "저장된 narrative state에서 prose만 다시 렌더링합니다.",
          }),
        }),
      },
    });
  });

  it("persists renderer regeneration artifacts during a standard generation run", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-cli-renderer-artifact-"));
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");

    class StandardHarness {
      async *run(
        _seed: unknown,
        startChapter: number,
      ): AsyncGenerator<HarnessEvent> {
        yield { type: "chapter_start", chapter: startChapter };
        yield {
          type: "chapter_complete",
          result: {
            chapterNumber: startChapter,
            text: "표준 생성 결과 본문.",
            summary: {
              title: `${startChapter}화`,
              plot_summary: "표준 생성 결과",
            } as never,
            score: 0.85,
            usage: {
              prompt_tokens: 4,
              completion_tokens: 5,
              total_tokens: 9,
              cost_usd: 0.009,
            },
            durationMs: 22,
            rendererRegenerationRequest: {
              snapshot: {
                chapterNumber: startChapter,
                blueprint: {
                  chapter_number: startChapter,
                  title: `${startChapter}화`,
                  arc_id: "arc-standard",
                  one_liner: "저장 가능한 renderer snapshot",
                  role_in_arc: "rising_action",
                  scenes: [],
                  emotional_arc: "긴장",
                  key_points: [],
                  characters_involved: [],
                  tension_level: 5,
                  target_word_count: 3000,
                  foreshadowing_actions: [],
                  dependencies: [],
                },
                previousSummaries: [],
                simulationState: {
                  seedTitle: "standard",
                  chapterCursor: startChapter - 1,
                  objectiveFacts: { entries: [] },
                  audienceKnowledge: [],
                  characters: {},
                  memories: { byCharacterId: {} },
                  beliefs: { byCharacterId: {}, trustMatrix: {} },
                  utterances: { byCharacterId: {} },
                  foreshadowRegistry: { items: {} },
                  threads: {},
                  eventLog: [],
                },
                worldStateProjection: [],
              },
              proseFailureContext: {
                summary: "저장된 renderer request",
              },
            } as never,
          },
        };
        yield {
          type: "done",
          result: {
            mode: "standard",
            config: "test",
            chapters: [{
              chapterNumber: startChapter,
              text: "표준 생성 결과 본문.",
              summary: {
                title: `${startChapter}화`,
                plot_summary: "표준 생성 결과",
              } as never,
              score: 0.85,
              usage: {
                prompt_tokens: 4,
                completion_tokens: 5,
                total_tokens: 9,
                cost_usd: 0.009,
              },
              durationMs: 22,
            }],
            totalUsage: {
              prompt_tokens: 4,
              completion_tokens: 5,
              total_tokens: 9,
              cost_usd: 0.009,
            },
            totalDurationMs: 22,
            totalCostUsd: 0.009,
            canonicalValidationFailures: [],
            beliefInterpretationRecoveries: [],
          },
        };
      }
    }

    await expect(runGenerateCli({
      args: ["--seed", seedPath, "--chapters", "1-1", "--out", outDir, "--quiet"],
      createHarness: () => new StandardHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    })).resolves.toBeUndefined();

    const artifactPath = path.join(
      outDir,
      CHAPTER_GENERATION_ARTIFACT_LAYOUT.rendererRegenerationDirName,
      "chapter-001.json",
    );
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(artifactPath, "utf-8"))).toMatchObject({
      snapshot: {
        chapterNumber: 1,
        stateIdentity: {
          overallSha256: expect.any(String),
        },
      },
      proseFailureContext: {
        summary: "저장된 renderer request",
      },
    });
  });
});
