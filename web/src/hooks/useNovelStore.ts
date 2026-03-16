"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlotOption } from "@/lib/schema/plot";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { MasterPlan } from "@/lib/schema/planning";

interface NovelState {
  // Step 1: Genre
  genre: string | null;

  // Step 2: Plots
  plots: PlotOption[];
  selectedPlot: PlotOption | null;

  // Step 3: Seed
  seed: NovelSeed | null;

  // Step 3.5: Planning
  masterPlan: MasterPlan | null;
  planningStage: "idle" | "master" | "arcs" | "chapters" | "complete";

  // Step 4: Generation
  chapters: Record<number, string>;
  summaries: ChapterSummary[];
  currentChapter: number;

  // Token usage tracking
  tokenUsage: {
    total_tokens: number;
    total_cost_usd: number;
    by_phase: Record<string, { tokens: number; cost_usd: number }>;
  };

  // Pipeline state
  pipelineStage: string;
  pipelineRetries: number;
  pipelineLogs: Array<{ time: number; message: string; type: "info" | "warn" | "success" }>;

  // Arc summaries for hierarchical context
  arcSummaries: Record<string, string>;

  // Navigation state
  viewingChapter: number | null;

  // UI state
  isGenerating: boolean;
  streamingText: string;
  evaluationResult: Record<string, unknown> | null;
  error: string | null;

  // Actions
  setGenre: (genre: string) => void;
  setPlots: (plots: PlotOption[]) => void;
  selectPlot: (plot: PlotOption) => void;
  setSeed: (seed: NovelSeed | null) => void;
  setIsGenerating: (v: boolean) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (chunk: string) => void;
  saveChapter: (chapterNumber: number, content: string) => void;
  addSummary: (summary: ChapterSummary) => void;
  setEvaluationResult: (result: Record<string, unknown> | null) => void;
  recordUsage: (phase: string, usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number }) => void;
  setPipelineStage: (stage: string) => void;
  incrementPipelineRetries: () => void;
  addPipelineLog: (message: string, type?: "info" | "warn" | "success") => void;
  resetPipelineState: () => void;
  setArcSummaries: (summaries: Record<string, string>) => void;
  setViewingChapter: (chapter: number | null) => void;
  resetToPlotSelection: () => void;
  setError: (error: string | null) => void;
  setMasterPlan: (plan: MasterPlan) => void;
  updateMasterPlan: (updater: (plan: MasterPlan) => MasterPlan) => void;
  setPlanningStage: (stage: "idle" | "master" | "arcs" | "chapters" | "complete") => void;
  reset: () => void;
}

const initialState = {
  genre: null,
  plots: [],
  selectedPlot: null,
  seed: null,
  masterPlan: null,
  planningStage: "idle" as const,
  chapters: {},
  summaries: [],
  currentChapter: 0,
  tokenUsage: { total_tokens: 0, total_cost_usd: 0, by_phase: {} },
  pipelineStage: "idle",
  pipelineRetries: 0,
  pipelineLogs: [],
  arcSummaries: {},
  viewingChapter: null,
  isGenerating: false,
  streamingText: "",
  evaluationResult: null,
  error: null,
};

export const useNovelStore = create<NovelState>()(
  persist(
    (set) => ({
      ...initialState,

      // Hierarchical reset: changing a parent step clears all child steps
      setGenre: (genre) => set({
        genre,
        // Clear: plots → seed → plan → chapters
        plots: [], selectedPlot: null,
        seed: null,
        masterPlan: null, planningStage: "idle" as const,
        chapters: {}, summaries: [], currentChapter: 0, arcSummaries: {},
        pipelineStage: "idle", pipelineRetries: 0, pipelineLogs: [],
      }),
      setPlots: (plots) => set({ plots }),
      selectPlot: (plot) =>
        set(() => ({
          selectedPlot: plot,
          // Clear: seed → plan → chapters
          seed: null,
          masterPlan: null, planningStage: "idle" as const,
          chapters: {}, summaries: [], currentChapter: 0, arcSummaries: {},
          pipelineStage: "idle", pipelineRetries: 0, pipelineLogs: [],
        })),
      setSeed: (seed) => set((s) => ({
        seed,
        // When seed changes, clear plan → chapters (but not if just setting null)
        ...(seed && s.seed && seed !== s.seed ? {
          masterPlan: null, planningStage: "idle" as const,
          chapters: {}, summaries: [], currentChapter: 0, arcSummaries: {},
        } : {}),
      })),
      setIsGenerating: (v) => set({ isGenerating: v }),
      setStreamingText: (text) => set({ streamingText: text }),
      appendStreamingText: (chunk) =>
        set((s) => ({ streamingText: s.streamingText + chunk })),
      saveChapter: (chapterNumber, content) =>
        set((s) => ({
          chapters: { ...s.chapters, [chapterNumber]: content },
          currentChapter: Math.max(s.currentChapter, chapterNumber),
        })),
      addSummary: (summary) =>
        set((s) => ({ summaries: [...s.summaries, summary] })),
      recordUsage: (phase, usage) =>
        set((s) => ({
          tokenUsage: {
            total_tokens: s.tokenUsage.total_tokens + usage.total_tokens,
            total_cost_usd: s.tokenUsage.total_cost_usd + usage.cost_usd,
            by_phase: {
              ...s.tokenUsage.by_phase,
              [phase]: {
                tokens: (s.tokenUsage.by_phase[phase]?.tokens || 0) + usage.total_tokens,
                cost_usd: (s.tokenUsage.by_phase[phase]?.cost_usd || 0) + usage.cost_usd,
              },
            },
          },
        })),
      setEvaluationResult: (result) => set({ evaluationResult: result }),
      setPipelineStage: (stage) => set({ pipelineStage: stage }),
      incrementPipelineRetries: () => set((s) => ({ pipelineRetries: s.pipelineRetries + 1 })),
      addPipelineLog: (message, type = "info") =>
        set((s) => ({
          pipelineLogs: [...s.pipelineLogs, { time: Date.now(), message, type }],
        })),
      resetPipelineState: () => set({ pipelineStage: "idle", pipelineRetries: 0, pipelineLogs: [] }),
      setArcSummaries: (summaries) => set({ arcSummaries: summaries }),
      setViewingChapter: (chapter) => set({ viewingChapter: chapter }),
      resetToPlotSelection: () =>
        set((s) => ({
          ...initialState,
          genre: s.genre,
          plots: s.plots,
        })),
      setError: (error) => set({ error }),
      setMasterPlan: (plan) => set({ masterPlan: plan }),
      updateMasterPlan: (updater) =>
        set((s) => ({
          masterPlan: s.masterPlan ? updater(s.masterPlan) : null,
        })),
      setPlanningStage: (stage) => set({ planningStage: stage }),
      reset: () => set(initialState),
    }),
    {
      name: "novel-generator-store",
      partialize: (state) => ({
        genre: state.genre,
        plots: state.plots,
        selectedPlot: state.selectedPlot,
        seed: state.seed,
        masterPlan: state.masterPlan,
        chapters: state.chapters,
        summaries: state.summaries,
        currentChapter: state.currentChapter,
        tokenUsage: state.tokenUsage,
        arcSummaries: state.arcSummaries,
        viewingChapter: state.viewingChapter,
        // Excluded from persistence: isGenerating, streamingText, error,
        // pipelineStage, pipelineRetries, pipelineLogs, evaluationResult
      }),
    },
  ),
);
