"use client";

import { useCallback, useRef } from "react";
import { useNovelStore } from "./useNovelStore";

export function useStreamingGeneration() {
  const abortRef = useRef<AbortController | null>(null);
  const {
    seed,
    summaries,
    chapters,
    currentChapter,
    setIsGenerating,
    setStreamingText,
    appendStreamingText,
    saveChapter,
    addSummary,
    setEvaluationResult,
    setError,
    recordUsage,
    setPipelineStage,
    incrementPipelineRetries,
    resetPipelineState,
    addPipelineLog,
    masterPlan,
    updateMasterPlan,
  } = useNovelStore();

  const generate = useCallback(
    async (chapterNumber?: number) => {
      if (!seed) {
        setError("시드가 없습니다. 처음부터 시작해주세요.");
        return;
      }

      const targetChapter = chapterNumber ?? currentChapter + 1;
      setIsGenerating(true);
      setStreamingText("");
      setEvaluationResult(null);
      setError(null);

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chapter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seed,
            chapterNumber: targetChapter,
            previousSummaries: summaries.map((s) => ({
              chapter: s.chapter_number,
              title: s.title,
              summary: s.plot_summary,
              cliffhanger: s.cliffhanger || null,
            })),
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "생성 실패" }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("스트리밍 지원 안됨");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === "chunk") {
                  fullText += parsed.content;
                  appendStreamingText(parsed.content);
                } else if (parsed.type === "complete") {
                  saveChapter(targetChapter, fullText);
                  if (parsed.summary) {
                    addSummary(parsed.summary);
                  }
                } else if (parsed.type === "evaluation") {
                  setEvaluationResult(parsed.result);
                } else if (parsed.type === "usage") {
                  recordUsage(`chapter-${targetChapter}`, {
                    prompt_tokens: parsed.prompt_tokens || 0,
                    completion_tokens: parsed.completion_tokens || 0,
                    total_tokens: (parsed.prompt_tokens || 0) + (parsed.completion_tokens || 0),
                    cost_usd: parsed.cost_usd || 0,
                  });
                } else if (parsed.type === "error") {
                  setError(parsed.message);
                }
              } catch {
                // ignore parse errors for partial SSE data
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [
      seed,
      summaries,
      currentChapter,
      setIsGenerating,
      setStreamingText,
      appendStreamingText,
      saveChapter,
      addSummary,
      setEvaluationResult,
      setError,
      recordUsage,
    ],
  );

  const generateOrchestrated = useCallback(
    async (chapterNumber?: number, options?: { qualityThreshold?: number; maxAttempts?: number; budgetUsd?: number; preset?: string }) => {
      if (!seed) {
        setError("시드가 없습니다. 처음부터 시작해주세요.");
        return;
      }

      // Prevent double invocation (StrictMode, rapid clicks)
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const targetChapter = chapterNumber ?? currentChapter + 1;
      setIsGenerating(true);
      setStreamingText("");
      setEvaluationResult(null);
      setError(null);
      resetPipelineState();

      abortRef.current = new AbortController();

      // Get the last 500 chars of the previous chapter for continuity
      const prevChapterText = targetChapter > 1 ? chapters[targetChapter - 1] : undefined;
      const previousChapterEnding = prevChapterText
        ? prevChapterText.slice(-500)
        : undefined;

      try {
        const response = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seed,
            chapterNumber: targetChapter,
            previousSummaries: summaries.map((s) => ({
              chapter: s.chapter_number,
              title: s.title,
              summary: s.plot_summary,
              cliffhanger: s.cliffhanger || null,
            })),
            previousChapterEnding,
            options,
            masterPlan,
            preset: options?.preset || "default",
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "생성 실패" }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("스트리밍 지원 안됨");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                switch (parsed.type) {
                  case "chunk":
                    fullText += parsed.content;
                    appendStreamingText(parsed.content);
                    break;
                  case "stage_change":
                  case "pipeline_stage":
                    setPipelineStage(parsed.stage);
                    if (parsed.stage !== "idle") {
                      const wittyMessages: Record<string, string[]> = {
                        generating: [
                          "작가가 영감을 받는 중... 커피 한 잔 하세요 ☕",
                          "펜을 들었습니다. 집중 모드 ON",
                          "작가가 원고지를 펼쳤습니다",
                        ],
                        editing: [
                          "편집장이 빨간펜을 들었습니다",
                          "오글거리는 표현 사냥 중...",
                          "편집장: '이건 좀 고쳐야겠는데...'",
                        ],
                        evaluating: [
                          "품질 검수관이 돋보기를 꺼냈습니다",
                          "채점 중... 두근두근",
                        ],
                        improving: [
                          "편집장: '한 번 더 다듬어볼게요'",
                          "빨간줄 긋는 중...",
                        ],
                        completing: [
                          "마지막 마침표를 찍는 중",
                          "탈고 완료 직전!",
                        ],
                        planning_arcs: [
                          "아크 구조를 설계하는 중...",
                          "스토리 뼈대를 세우고 있습니다",
                        ],
                        planning_chapters: [
                          "각 화의 블루프린트를 그리는 중...",
                          "씬 구성을 계획하고 있습니다",
                        ],
                        patching: [
                          "문제 구간만 정밀 수정 중...",
                          "편집장이 빨간펜으로 특정 부분만 고치는 중",
                          "좋은 부분은 살리고, 문제만 콕콕 수정!",
                        ],
                      };
                      const msgs = wittyMessages[parsed.stage];
                      const labels: Record<string, string> = {};
                      if (msgs) {
                        labels[parsed.stage] = msgs[Math.floor(Math.random() * msgs.length)];
                      }
                      addPipelineLog(labels[parsed.stage] || parsed.stage);
                    }
                    break;
                  case "plan_update":
                    updateMasterPlan(() => parsed.plan);
                    addPipelineLog("플래닝 데이터 업데이트", "info");
                    break;
                  case "evaluation":
                    // Support both formats:
                    // - /api/chapter sends { result: { style: ... } }
                    // - orchestrate/QualityLoop sends { report: CriticReport, overall_score }
                    setEvaluationResult(
                      parsed.result || parsed.report || { overall_score: parsed.overall_score },
                    );
                    {
                      const score = Math.round((parsed.overall_score ?? 0) * 100);
                      const passed = score >= 85;
                      addPipelineLog(
                        `평가 완료: ${score}점${passed ? " — 통과!" : " — 기준 미달 (85점)"}`,
                        passed ? "success" : "warn",
                      );
                      if (parsed.result?.pacing) {
                        const p = parsed.result.pacing;
                        if (p.length && !p.length.pass)
                          addPipelineLog(`  분량: ${p.length.char_count}자 (최소 ${p.length.target_min}자)`, "warn");
                        if (p.description_ratio && !p.description_ratio.pass)
                          addPipelineLog(`  묘사 비율: ${Math.round(p.description_ratio.ratio * 100)}% (최소 25%)`, "warn");
                        if (p.dialogue_pacing && !p.dialogue_pacing.pass)
                          addPipelineLog(`  대사 연속: ${p.dialogue_pacing.max_consecutive_dialogue_lines}줄 (최대 5줄)`, "warn");
                      }
                    }
                    break;
                  case "retry":
                    incrementPipelineRetries();
                    addPipelineLog(
                      `재시도 ${parsed.attempt}회차: ${parsed.reason?.slice(0, 80) || "품질 개선 필요"}`,
                      "warn",
                    );
                    break;
                  case "usage":
                    recordUsage(`chapter-${targetChapter}`, {
                      prompt_tokens: parsed.prompt_tokens || 0,
                      completion_tokens: parsed.completion_tokens || 0,
                      total_tokens: (parsed.prompt_tokens || 0) + (parsed.completion_tokens || 0),
                      cost_usd: parsed.cost_usd || 0,
                    });
                    break;
                  case "replace_text":
                    // Editor agent produced a polished version — replace displayed text
                    fullText = parsed.content;
                    setStreamingText(parsed.content);
                    addPipelineLog(
                      `편집 완료 (${parsed.content.length.toLocaleString()}자)`,
                      "success",
                    );
                    break;
                  case "improvement":
                    fullText = "";
                    setStreamingText("");
                    addPipelineLog(
                      `개선 전략: ${parsed.strategy || "targeted_fix"}`,
                    );
                    break;
                  case "complete":
                    saveChapter(targetChapter, fullText);
                    if (parsed.summary) addSummary(parsed.summary);
                    addPipelineLog(
                      `${targetChapter}화 생성 완료 (${fullText.length.toLocaleString()}자)`,
                      "success",
                    );
                    break;
                  case "patch": {
                    // Replace specific paragraph in the full text
                    // Normalize to match server-side segmentText() behavior
                    const paragraphs = fullText.split("\n\n").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
                    if (parsed.paragraphId >= 0 && parsed.paragraphId < paragraphs.length) {
                      paragraphs[parsed.paragraphId] = parsed.content;
                      fullText = paragraphs.join("\n\n");
                      setStreamingText(fullText);
                      addPipelineLog(
                        `문단 ${parsed.paragraphId + 1} 수정 완료`,
                        "info",
                      );
                    }
                    break;
                  }
                  case "harness_done":
                    addPipelineLog(
                      `하네스 완료 (${parsed.config}) — $${(parsed.totalCostUsd ?? 0).toFixed(4)}, ${((parsed.totalDurationMs ?? 0) / 1000).toFixed(1)}초`,
                      "success",
                    );
                    break;
                  case "error":
                    setError(parsed.message);
                    addPipelineLog(parsed.message, "warn");
                    break;
                }
              } catch {
                // ignore partial SSE parse errors
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [seed, summaries, currentChapter, setIsGenerating, setStreamingText, appendStreamingText, saveChapter, addSummary, setEvaluationResult, setError, recordUsage, setPipelineStage, incrementPipelineRetries, resetPipelineState, addPipelineLog, masterPlan, updateMasterPlan],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, [setIsGenerating]);

  return { generate, generateOrchestrated, abort };
}
