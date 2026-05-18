export type {
  NovelEngineCliCommand,
  NovelEngineCliExecution,
  RunNovelEngineCliOptions,
} from "../scripts/novel-engine";
export { runNovelEngineCli } from "../scripts/novel-engine";

export type {
  CanonicalValidationCliReport,
  CausalLedgerValidationCliReport,
  ContradictionValidationCliReport,
  ForeshadowQualityGateCliReport,
  GenerateCliIo,
  RunGenerateCliOptions,
} from "../scripts/generate";
export {
  CanonicalValidationCliError,
  CausalLedgerValidationCliError,
  ContradictionValidationCliError,
  ForeshadowQualityGateCliError,
  emitCanonicalValidationCliReport,
  emitCausalLedgerValidationCliReport,
  emitContradictionValidationCliReport,
  emitForeshadowQualityGateCliReport,
  handleGenerateCliFailure,
  runGenerateCli,
} from "../scripts/generate";

export type {
  LongFormVerificationCliOptions,
  RunLongFormVerificationCliOptions,
} from "../scripts/verify-long-form";
export {
  getLongFormVerificationCliExitCode,
  runLongFormVerificationCli,
} from "../scripts/verify-long-form";
