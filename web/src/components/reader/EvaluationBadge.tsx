"use client";

interface EvaluationBadgeProps {
  result: Record<string, unknown> | null;
}

// Dimension labels (CriticReport format)
const DIMENSION_LABELS: Record<string, string> = {
  narrative: "서사 전개",
  characterVoice: "캐릭터 음성",
  rhythm: "문장 리듬",
  hookEnding: "후킹 엔딩",
  immersion: "몰입감",
};

// Category labels (CriticIssue format)
const CATEGORY_LABELS: Record<string, string> = {
  characterVoice: "캐릭터 음성",
  rhythm: "리듬",
  cliche: "클리셰",
  narrative: "서사",
  repetition: "반복",
};

export default function EvaluationBadge({ result }: EvaluationBadgeProps) {
  if (!result) return null;

  // Detect format: CriticReport (from QualityLoop) vs legacy (from /api/chapter)
  const isCriticReport =
    "overallScore" in result || "dimensions" in result || "issues" in result;

  if (isCriticReport) {
    return <CriticReportBadge result={result} />;
  }

  return <LegacyBadge result={result} />;
}

/** CriticReport format from QualityLoop (orchestrate path) */
function CriticReportBadge({ result }: { result: Record<string, unknown> }) {
  const overallScore = (result.overallScore as number) ?? (result.overall_score as number) ?? 0;
  const displayScore = Math.round(overallScore * 100);
  const dimensions = result.dimensions as Record<string, number> | undefined;
  const issues = result.issues as Array<Record<string, unknown>> | undefined;

  const color =
    displayScore >= 85
      ? "text-green-400 border-green-400/30 bg-green-400/10"
      : displayScore >= 60
        ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
        : "text-red-400 border-red-400/30 bg-red-400/10";

  const criticalIssues = issues?.filter((i) => i.severity === "critical") || [];
  const majorIssues = issues?.filter((i) => i.severity === "major") || [];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">품질 평가</h3>
        <span className={`rounded-full border px-3 py-1 text-sm font-bold ${color}`}>
          {displayScore}점
        </span>
      </div>

      {/* Dimension scores */}
      {dimensions && Object.keys(dimensions).length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(dimensions).map(([key, score]) => (
            <div key={key} className="text-xs">
              <span className="text-zinc-500">
                {DIMENSION_LABELS[key] || key}
              </span>
              <p className={score < 0.6 ? "text-red-400" : score < 0.8 ? "text-yellow-400" : "text-zinc-300"}>
                {Math.round(score * 100)}점
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Critical/Major issues */}
      {(criticalIssues.length > 0 || majorIssues.length > 0) && (
        <div className="mt-3 border-t border-zinc-800 pt-3 space-y-1.5">
          {criticalIssues.map((issue, i) => (
            <div key={`c-${i}`} className="text-xs">
              <span className="text-red-400 font-medium">
                [{CATEGORY_LABELS[issue.category as string] || String(issue.category)}]
              </span>{" "}
              <span className="text-zinc-400">{String(issue.description)}</span>
            </div>
          ))}
          {majorIssues.slice(0, 3).map((issue, i) => (
            <div key={`m-${i}`} className="text-xs">
              <span className="text-amber-400 font-medium">
                [{CATEGORY_LABELS[issue.category as string] || String(issue.category)}]
              </span>{" "}
              <span className="text-zinc-400">{String(issue.description)}</span>
            </div>
          ))}
          {majorIssues.length > 3 && (
            <p className="text-xs text-zinc-600">+{majorIssues.length - 3}개 더...</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Legacy format from /api/chapter (style/consistency based) */
function LegacyBadge({ result }: { result: Record<string, unknown> }) {
  const style = result.style as Record<string, unknown> | undefined;
  const consistency = result.consistency as Record<string, unknown> | undefined;
  const overall = (style?.overall_score as number) ?? 0;
  const scorePercent = Math.round(overall * 100);

  const llmEval = result.llm as Record<string, unknown> | undefined;
  const hybridOverall = result.overall_score as number | undefined;
  const recommendation = result.recommendation as string | undefined;
  const displayScore = hybridOverall != null ? Math.round(hybridOverall * 100) : scorePercent;

  const color =
    displayScore >= 80
      ? "text-green-400 border-green-400/30 bg-green-400/10"
      : displayScore >= 60
        ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
        : "text-red-400 border-red-400/30 bg-red-400/10";

  const recommendationLabel: Record<string, string> = {
    accept: "통과",
    improve: "개선 필요",
    regenerate: "재생성 필요",
  };

  const dialogueResult = style?.dialogue_ratio as Record<string, unknown> | undefined;
  const hookResult = style?.hook_ending as Record<string, unknown> | undefined;
  const paragraphResult = style?.paragraph_length as Record<string, unknown> | undefined;
  const charVoice = consistency?.character_voice as Record<string, unknown> | undefined;
  const foreshadowing = consistency?.foreshadowing as Record<string, unknown> | undefined;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">품질 평가</h3>
        <div className="flex items-center gap-2">
          {recommendation && (
            <span className="text-xs text-zinc-400">
              {recommendationLabel[recommendation] || recommendation}
            </span>
          )}
          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${color}`}>
            {displayScore}점
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <ScoreItem
          label="대화 비율"
          value={dialogueResult ? `${Math.round((dialogueResult.actual_ratio as number) * 100)}%` : "-"}
          pass={dialogueResult?.pass as boolean | undefined}
        />
        <ScoreItem
          label="후킹 엔딩"
          value={hookResult ? ((hookResult.pass as boolean) ? "OK" : "X") : "-"}
          pass={hookResult?.pass as boolean | undefined}
        />
        <ScoreItem
          label="문단 길이"
          value={paragraphResult ? `위반 ${paragraphResult.violations}건` : "-"}
          pass={paragraphResult?.pass as boolean | undefined}
        />
        <ScoreItem
          label="캐릭터 음성"
          value={charVoice ? `${Math.round((charVoice.score as number) * 100)}점` : "-"}
          pass={charVoice?.pass as boolean | undefined}
        />
      </div>

      {foreshadowing && (foreshadowing.missing as unknown[])?.length > 0 && (
        <div className="mt-3 text-xs">
          <span className="text-red-400">복선 누락:</span>
          <span className="ml-1 text-zinc-400">
            {((foreshadowing.missing as Array<Record<string, unknown>>))
              .map(m => m.name as string)
              .join(", ")}
          </span>
        </div>
      )}

      {llmEval && (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="text-xs font-medium text-zinc-400 mb-2">AI 상세 평가</p>
          <div className="grid grid-cols-2 gap-2">
            <LLMScore label="음성 일관성" data={llmEval.character_voice_consistency as Record<string, unknown>} />
            <LLMScore label="서사 연결" data={llmEval.narrative_coherence as Record<string, unknown>} />
            <LLMScore label="복선 처리" data={llmEval.foreshadowing_quality as Record<string, unknown>} />
            <LLMScore label="카카오 스타일" data={llmEval.kakao_style_feel as Record<string, unknown>} />
          </div>
          {llmEval.summary_feedback ? (
            <p className="mt-2 text-xs text-zinc-500">{llmEval.summary_feedback as string}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ScoreItem({ label, value, pass }: { label: string; value: string; pass?: boolean }) {
  return (
    <div className="text-xs">
      <span className="text-zinc-500">{label}</span>
      <p className={pass === false ? "text-red-400" : "text-zinc-300"}>
        {value}
      </p>
    </div>
  );
}

function LLMScore({ label, data }: { label: string; data?: Record<string, unknown> }) {
  if (!data) return null;
  const score = Math.round((data.score as number) * 100);
  const feedback = data.feedback as string;
  return (
    <div className="text-xs">
      <span className="text-zinc-500">{label}</span>
      <p className={score >= 70 ? "text-zinc-300" : "text-red-400"}>
        {score}점
      </p>
      {feedback && <p className="text-zinc-600 truncate" title={feedback}>{feedback}</p>}
    </div>
  );
}
