/**
 * Causal Graph — validates narrative plausibility at the God-level planning stage.
 *
 * Constructs a directed graph from PlotPoints (what/why) and validates:
 * 1. Causal completeness: every event has a "why"
 * 2. Connectivity: no isolated events (dead-ends)
 * 3. Reachability: path exists from ch1 to climax
 * 4. Thread coverage: all story threads are advanced
 *
 * References:
 * - Trabasso & van den Broek 1985: "Causal Thinking and the Representation
 *   of Narrative Events" (Journal of Memory and Language)
 * - Riedl & Young 2010: "Narrative Planning: Balancing Plot and Character"
 *   (JAIR) — IPOCL planning framework
 * - Ammanabrolu et al. 2021: "Automated Storytelling via Causal, Commonsense
 *   Plot Ordering" (AAAI) — soft causal relations
 * - Niehaus, Li & Riedl 2011: Dead-end detection in narrative planning
 * - Castricato et al. 2021: "Towards a Model-Theoretic View of Narratives"
 *   — Entropy of World Coherence / Transitional Coherence
 */

import type { NovelSeed } from "../schema/novel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CausalNode {
  id: string;            // "ch1_0", "ch1_1", etc.
  chapter: number;
  what: string;
  why: string;
  reveal: string;        // "immediate" | "delayed" | "implicit"
  threads: string[];     // which story threads this advances
}

export interface CausalEdge {
  from: string;  // node id (cause)
  to: string;    // node id (effect)
  type: "hard" | "soft";  // hard = explicit why, soft = inferred
}

export interface CausalGraph {
  nodes: CausalNode[];
  edges: CausalEdge[];
}

export interface CausalValidationResult {
  /** 0~1: higher = more plausible */
  score: number;
  graph: CausalGraph;
  issues: CausalIssue[];
}

export interface CausalIssue {
  type: "missing_cause" | "dead_end" | "unreachable_climax" | "thread_gap" | "orphan_event";
  severity: "critical" | "warning";
  chapter: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Graph Construction
// ---------------------------------------------------------------------------

/**
 * Build a causal graph from seed's chapter outlines.
 * Each PlotPoint becomes a node; "why" fields create edges.
 */
export function buildCausalGraph(seed: NovelSeed): CausalGraph {
  const nodes: CausalNode[] = [];
  const edges: CausalEdge[] = [];

  for (const outline of seed.chapter_outlines) {
    const ch = outline.chapter_number;
    const threads = outline.advances_thread || [];

    for (let i = 0; i < outline.key_points.length; i++) {
      const point = outline.key_points[i];
      const nodeId = `ch${ch}_${i}`;

      if (typeof point === "string") {
        nodes.push({ id: nodeId, chapter: ch, what: point, why: "", reveal: "immediate", threads });
      } else {
        nodes.push({
          id: nodeId,
          chapter: ch,
          what: point.what,
          why: point.why || "",
          reveal: point.reveal || "immediate",
          threads,
        });
      }
    }

    // If no key_points, create node from one_liner
    if (outline.key_points.length === 0) {
      nodes.push({
        id: `ch${ch}_0`,
        chapter: ch,
        what: outline.one_liner,
        why: "",
        reveal: "immediate",
        threads,
      });
    }
  }

  // Build edges: sequential chapters are connected,
  // and "why" fields that reference earlier events create cross-links
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];

    // Sequential edge (soft causal — temporal ordering)
    if (prev.chapter <= curr.chapter) {
      edges.push({ from: prev.id, to: curr.id, type: "soft" });
    }

    // Hard causal edge: if "why" mentions keywords from a previous node's "what"
    if (curr.why) {
      for (let j = 0; j < i; j++) {
        const candidate = nodes[j];
        const keywords = extractKeywords(candidate.what);
        const whyKeywords = extractKeywords(curr.why);
        const overlap = keywords.filter((k) => whyKeywords.includes(k));
        if (overlap.length >= 2) {
          edges.push({ from: candidate.id, to: curr.id, type: "hard" });
        }
      }
    }
  }

  return { nodes, edges };
}

/** Extract 2+ char Korean words as keywords */
function extractKeywords(text: string): string[] {
  return (text.match(/[가-힣]{2,}/g) || []).filter((w) => w.length >= 2);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateCausalGraph(seed: NovelSeed): CausalValidationResult {
  const graph = buildCausalGraph(seed);
  const issues: CausalIssue[] = [];

  // 1. Causal Completeness — every event should have a "why"
  for (const node of graph.nodes) {
    if (!node.why && node.chapter > 1) {
      issues.push({
        type: "missing_cause",
        severity: "critical",
        chapter: node.chapter,
        description: `${node.chapter}화 "${node.what}" — 이유(why)가 없습니다. 이 사건이 왜 일어나는지 정의해야 합니다.`,
      });
    }
  }

  // 2. Dead-End Detection — events that don't contribute to future events
  const hasOutgoing = new Set<string>();
  const hasIncoming = new Set<string>();
  for (const edge of graph.edges) {
    hasOutgoing.add(edge.from);
    hasIncoming.add(edge.to);
  }

  for (const node of graph.nodes) {
    const isLast = node.chapter === Math.max(...graph.nodes.map((n) => n.chapter));
    if (!isLast && !hasOutgoing.has(node.id) && graph.nodes.length > 1) {
      issues.push({
        type: "dead_end",
        severity: "warning",
        chapter: node.chapter,
        description: `${node.chapter}화 "${node.what}" — 이후 화에 영향을 주지 않는 고립된 사건입니다.`,
      });
    }
  }

  // 3. Orphan Events — events with no incoming edge (except ch1)
  for (const node of graph.nodes) {
    if (node.chapter > 1 && !hasIncoming.has(node.id)) {
      issues.push({
        type: "orphan_event",
        severity: "warning",
        chapter: node.chapter,
        description: `${node.chapter}화 "${node.what}" — 이전 사건과 연결되지 않은 갑작스러운 사건입니다.`,
      });
    }
  }

  // 4. Reachability — can we reach the last chapter from ch1? (BFS)
  if (graph.nodes.length >= 2) {
    const firstNode = graph.nodes[0];
    const lastNode = graph.nodes[graph.nodes.length - 1];
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from)!.push(edge.to);
    }

    const visited = new Set<string>();
    const queue = [firstNode.id];
    visited.add(firstNode.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (!visited.has(lastNode.id)) {
      issues.push({
        type: "unreachable_climax",
        severity: "critical",
        chapter: lastNode.chapter,
        description: `1화에서 ${lastNode.chapter}화까지 인과적 경로가 없습니다. 중간에 연결이 끊어져 있습니다.`,
      });
    }
  }

  // 5. Thread Coverage — are all threads advanced at least once?
  const threads = seed.story_threads || [];
  const advancedThreads = new Set(graph.nodes.flatMap((n) => n.threads));
  for (const thread of threads) {
    if (!advancedThreads.has(thread.id)) {
      issues.push({
        type: "thread_gap",
        severity: "warning",
        chapter: 0,
        description: `스레드 "${thread.name}"이 어떤 화에서도 진전되지 않습니다.`,
      });
    }
  }

  // Score
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const maxPossibleIssues = graph.nodes.length + threads.length;
  const penalty = (criticalCount * 2 + warningCount) / Math.max(1, maxPossibleIssues);
  const score = Math.max(0, Math.round((1 - penalty) * 100) / 100);

  return { score, graph, issues };
}
