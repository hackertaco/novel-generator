import { getAgent } from "@/lib/agents/llm-agent";
import { sanitize } from "@/lib/agents/rule-guard";
import type { TokenUsage } from "@/lib/agents/types";
import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";

import type { EditorialPlan } from "./editorial-planner";
import {
  formatNarrativeViolationsForRepair,
  validateNarrativeProse,
  type NarrativeProseViolation,
} from "./narrative-prose-validator";

const ZERO_USAGE: TokenUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
};

const SURFACE_REWRITER_SYSTEM = [
  "너는 소설의 사건을 바꾸지 않는 표면 행동 재작성 에이전트다.",
  "인물의 생각, 감정 이름, 숨은 의도, 의미 해설을 쓰지 않는다.",
  "카메라에 보이는 행동, 대사, 침묵, 물건, 소리, 거리만 쓴다.",
  "출력은 독자에게 보이는 소설 본문만 쓴다.",
].join("\n");

export interface SurfaceRewriteInput {
  text: string;
  sceneLog: SceneLog;
  actionLogs: CharacterActionLog[];
  editorialPlan?: EditorialPlan;
  forbiddenFacts?: string[];
  model?: string;
  maxTokens?: number;
  maxAttempts?: number;
}

export interface SurfaceRewriteResult {
  text: string;
  violationCount: number;
  violations: string[];
  attempts: number;
  usedDeterministicFallback: boolean;
  model: string;
  usage: TokenUsage;
}

function addUsage(left: TokenUsage, right: TokenUsage | undefined): TokenUsage {
  const safeRight = right ?? ZERO_USAGE;
  return {
    prompt_tokens: left.prompt_tokens + safeRight.prompt_tokens,
    completion_tokens: left.completion_tokens + safeRight.completion_tokens,
    total_tokens: left.total_tokens + safeRight.total_tokens,
    cost_usd: left.cost_usd + safeRight.cost_usd,
  };
}

function validationLines(violations: NarrativeProseViolation[]): string {
  return violations.map((violation) => [
    `- ${violation.ruleId}`,
    `  문제: ${violation.message}`,
    `  실패 문장: ${violation.excerpt}`,
  ].join("\n")).join("\n");
}

function turnByLogId(sceneLog: SceneLog): Map<string, SceneLog["dialogueTurns"][number]> {
  const result = new Map<string, SceneLog["dialogueTurns"][number]>();
  for (const turn of sceneLog.dialogueTurns) {
    for (const logId of turn.sourceActionLogIds) {
      result.set(logId, turn);
    }
  }
  return result;
}

function formatSurfaceSource(input: SurfaceRewriteInput): string {
  const turnsByLogId = turnByLogId(input.sceneLog);
  return input.actionLogs
    .slice()
    .sort((a, b) => a.tick - b.tick || a.logId.localeCompare(b.logId))
    .map((log) => {
      const turn = turnsByLogId.get(log.logId);
      const hooks = turn?.interactionDynamics?.writerHooks;
      const plan = input.editorialPlan?.beatPlans.find((beat) => beat.sourceActionLogId === log.logId);
      return [
        `- [${log.tick}] ${log.actorName} -> ${log.targetNames.join(", ") || "장면"}`,
        `  편집: ${plan?.renderMode ?? "normal"} / ${plan?.suggestedWordBudget ?? 120}자 안팎`,
        `  보이는 행동: ${log.visibleBehavior}`,
        turn?.utterance ? `  대사 후보: "${turn.utterance}"` : "",
        hooks?.gesture ? `  제스처: ${hooks.gesture}` : "",
        hooks?.silence ? `  침묵: ${hooks.silence}` : "",
        hooks?.sensoryCue ? `  감각: ${hooks.sensoryCue}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function formatSurfaceSections(input: SurfaceRewriteInput): string {
  return input.editorialPlan?.sceneSections.map((section) => [
    `- ${section.sectionId} / ${section.role}`,
    `  로그: ${section.sourceActionLogIds.join(", ")}`,
    `  목적: ${section.purpose}`,
    `  처리: ${section.renderInstruction}`,
  ].join("\n")).join("\n\n") ?? "- 없음";
}

export function buildSurfaceRewritePrompt(input: SurfaceRewriteInput): string {
  const validation = validateNarrativeProse({
    text: input.text,
    forbiddenFacts: input.forbiddenFacts,
  });
  return [
    `# 임무`,
    `아래 초안의 사건 순서와 대사는 보존하되, 실패 문장을 전부 카메라 표면 행동으로 다시 쓴다.`,
    `새 사건, 새 비밀, 새 인과, 새 인물, 새 목표를 만들지 않는다.`,
    ``,
    `# 장면`,
    `제목: ${input.sceneLog.title}`,
    `장소: ${input.sceneLog.location}`,
    `감각 앵커: ${input.sceneLog.sensoryAnchors.join(", ")}`,
    ``,
    `# 반드시 보존할 로그 순서`,
    formatSurfaceSource(input) || "- 없음",
    ``,
    `# 장면 구성`,
    formatSurfaceSections(input),
    ``,
    `# 실패 판정`,
    validationLines(validation.violations) || "- 없음",
    ``,
    `# 실패 요약`,
    formatNarrativeViolationsForRepair(validation.violations) || "- 없음",
    ``,
    `# 절대 금지`,
    `- 느꼈다, 생각했다, 알았다, 깨달았다, 고민했다, 결심했다`,
    `- 속내, 진심, 의도, 숨겨진 감정, 의미, 메시지, 압박, 긴장감`,
    `- 파악하려 했다, 읽으려 했다, 꿰뚫어보려 했다, 애썼다`,
    `- "그는/그녀는 ~하려 했다" 같은 내면 설명`,
    ``,
    `# 허용`,
    `- 카메라에 보이는 표면: 손, 잔, 반지, 시선, 침묵, 호칭, 말 끊김, 거리, 숨, 발소리, 찻잔 소리`,
    `- 관찰 가능한 동작만으로 관계 변화를 보이기`,
    ``,
    `# 초안`,
    input.text,
  ].join("\n");
}

function cleanObservable(value: string): string {
  return value
    .replace(/느끼(?:고|며|는|었다|었고|지|게|도록)/g, "두고")
    .replace(/느껴(?:졌|진)[^,.。？！\n]*/g, "남았다")
    .replace(/생각(?:이|은|을|에|하고|했다|났다|이 스쳤다)?/g, "시선")
    .replace(/고민(?:했|했다|해야|하고|에 빠졌)[^,.。？！\n]*/g, "잔 손잡이를 문질렀다")
    .replace(/결심(?:했|했다|한다)[^,.。？！\n]*/g, "잔을 내려놓았다")
    .replace(/속내|진심|의도|숨겨진 감정|숨겨진|감춰진/g, "말끝")
    .replace(/파악(?:하|했|하려)[^,.。？！\n]*/g, "시선을 떼지 않았다")
    .replace(/꿰뚫어\s*보[^,.。？！\n]*/g, "눈을 피하지 않았다")
    .replace(/읽으려[^,.。？！\n]*/g, "시선을 거두지 않았다")
    .replace(/애썼다/g, "손을 멈췄다")
    .replace(/압박|긴장감|불안감|경계심/g, "작은 소리")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFinalConsonant(value: string): boolean {
  const char = value.trim().at(-1);
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function topic(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "은" : "는"}`;
}

function sentence(value: string): string {
  const trimmed = cleanObservable(value).replace(/[.。]+$/g, "").trim();
  return trimmed ? `${trimmed}.` : "";
}

function dialogueSentence(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith(".") || trimmed.endsWith(".”") || trimmed.endsWith(".”")
    ? trimmed
    : `${trimmed}`;
}

function visibleSentence(log: CharacterActionLog): string {
  const visible = cleanObservable(log.visibleBehavior);
  if (visible.startsWith(log.actorName)) return sentence(visible);
  return sentence(`${topic(log.actorName)} ${visible}`);
}

function opening(sceneLog: SceneLog): string {
  const anchors = sceneLog.sensoryAnchors.slice(0, 2).join(", ");
  return [
    sentence(`${sceneLog.location}의 ${sceneLog.title}은 조용히 열렸다`),
    anchors ? sentence(`${anchors}이 장면 가장자리에 남았다`) : "",
  ].filter(Boolean).join(" ");
}

function lineForLog(log: CharacterActionLog, turn?: SceneLog["dialogueTurns"][number]): string {
  const hooks = turn?.interactionDynamics?.writerHooks;
  const parts = [
    visibleSentence(log),
    hooks?.gesture ? sentence(hooks.gesture) : "",
    hooks?.sensoryCue ? sentence(hooks.sensoryCue) : "",
    turn?.utterance ? dialogueSentence(`“${turn.utterance}”`) : "",
    hooks?.silence ? sentence(hooks.silence) : "",
  ].filter(Boolean);
  return parts.join(" ");
}

/**
 * Strip cognition-tell phrases that leak in from action templates so the
 * deterministic fallback passes `validateNarrativeProse`. Mirrors the
 * sanitization used by episode-draft-renderer and world-novel-writer.
 */
function sanitizeCognitionTells(text: string): string {
  return text
    .replace(/마음속에는/g, "손끝에는")
    .replace(/마음속에서/g, "목 안쪽에서")
    .replace(/마음속에/g, "손끝에")
    .replace(/마음속으로/g, "조용히")
    .replace(/마음속/gu, "침묵 아래");
}

export function renderObservableFallback(input: Omit<SurfaceRewriteInput, "model" | "maxTokens" | "maxAttempts">): string {
  const turnsByLogId = turnByLogId(input.sceneLog);
  const body = input.actionLogs
    .slice()
    .sort((a, b) => a.tick - b.tick || a.logId.localeCompare(b.logId))
    .map((log) => lineForLog(log, turnsByLogId.get(log.logId)))
    .filter(Boolean);
  const ending = sentence(`${input.sceneLog.location}에는 ${input.sceneLog.sensoryAnchors[0] ?? "낮은 소리"}만 남았다`);
  const composed = [
    `제목: ${input.sceneLog.title}`,
    ``,
    opening(input.sceneLog),
    ``,
    ...body.flatMap((line) => [line, ""]),
    ending,
  ].join("\n").trim() + "\n";
  return sanitizeCognitionTells(composed);
}

export async function rewriteSurfaceProse(input: SurfaceRewriteInput): Promise<SurfaceRewriteResult> {
  const model = input.model
    ?? process.env.NOVEL_SURFACE_REWRITER_MODEL
    ?? process.env.NOVEL_MODEL_WRITING
    ?? process.env.NOVEL_MODEL_HIGH
    ?? "gpt-4o";
  const maxAttempts = input.maxAttempts ?? 1;
  let text = input.text;
  let usage = ZERO_USAGE;
  let finalModel = model;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const validation = validateNarrativeProse({
      text,
      forbiddenFacts: input.forbiddenFacts,
    });
    if (validation.violationCount === 0) {
      return {
        text: `${text.trim()}\n`,
        violationCount: 0,
        violations: [],
        attempts: attempt,
        usedDeterministicFallback: false,
        model: finalModel,
        usage,
      };
    }
    const result = await getAgent().call({
      prompt: buildSurfaceRewritePrompt({ ...input, text }),
      system: SURFACE_REWRITER_SYSTEM,
      model,
      temperature: 0.15,
      maxTokens: input.maxTokens ?? 9000,
      taskId: `surface-rewriter-ch${input.sceneLog.chapter}-${attempt + 1}`,
    });
    text = sanitize(result.data).trim();
    usage = addUsage(usage, result.usage);
    finalModel = result.model;
  }

  const deterministicText = renderObservableFallback(input);
  const finalValidation = validateNarrativeProse({
    text: deterministicText,
    forbiddenFacts: input.forbiddenFacts,
  });
  return {
    text: deterministicText,
    violationCount: finalValidation.violationCount,
    violations: finalValidation.violations
      .map((violation) => `${violation.ruleId}: ${violation.message} 예문="${violation.excerpt}"`),
    attempts: maxAttempts,
    usedDeterministicFallback: true,
    model: finalModel,
    usage,
  };
}
