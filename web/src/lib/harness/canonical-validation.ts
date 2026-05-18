import {
  formatSimulationValidationFailure,
} from "../sim";
import type {
  CharacterMismatchValidationFailure,
  SimulationValidationVerdict,
} from "../sim";

export interface CanonicalValidationFailureReport {
  code: "simulation_validation_failed";
  chapter: number;
  summary: string;
  invalidContradictionCount: number;
  allowedExceptionCount: number;
  issueCount: number;
  mismatchCount: number;
  uncausedMismatchFailures: CharacterMismatchValidationFailure[];
}

export interface CanonicalValidationErrorContract {
  code: "simulation_validation_failed";
  message: string;
  reports: CanonicalValidationFailureReport[];
}

export function buildCanonicalValidationFailureReport(
  chapter: number,
  verdict: SimulationValidationVerdict,
): CanonicalValidationFailureReport | null {
  const uncausedMismatchFailures = verdict.invalidContradictions
    .map((mismatch) => mismatch.causation.validationFailure)
    .filter(
      (
        failure,
      ): failure is CharacterMismatchValidationFailure => failure?.code === "uncaused_mismatch",
    );

  if (uncausedMismatchFailures.length === 0) {
    return null;
  }

  return {
    code: "simulation_validation_failed",
    chapter,
    summary: formatSimulationValidationFailure(verdict, chapter),
    invalidContradictionCount: verdict.invalidContradictionCount,
    allowedExceptionCount: verdict.allowedExceptionCount,
    issueCount: verdict.issueCount,
    mismatchCount: verdict.mismatchCount,
    uncausedMismatchFailures,
  };
}

export function mergeCanonicalValidationFailureReports(
  ...reportGroups: ReadonlyArray<
    ReadonlyArray<CanonicalValidationFailureReport> | undefined
  >
): CanonicalValidationFailureReport[] {
  const merged = new Map<number, CanonicalValidationFailureReport>();

  for (const reportGroup of reportGroups) {
    if (!reportGroup) {
      continue;
    }
    for (const report of reportGroup) {
      if (!merged.has(report.chapter)) {
        merged.set(report.chapter, report);
      }
    }
  }

  return Array.from(merged.values()).sort((left, right) => left.chapter - right.chapter);
}

export function buildCanonicalValidationErrorContract(
  reports: ReadonlyArray<CanonicalValidationFailureReport>,
): CanonicalValidationErrorContract | null {
  if (reports.length === 0) {
    return null;
  }

  const chapters = reports.map((report) => report.chapter).join(", ");

  return {
    code: "simulation_validation_failed",
    message: `Canonical simulation validation failed for chapter(s): ${chapters}`,
    reports: [...reports],
  };
}
