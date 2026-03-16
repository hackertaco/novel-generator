// @vitest-environment node
/**
 * AC 8: api/seed/route.ts 응답 형식이 변경되지 않는다
 *
 * The evolution loop added `candidates` to the response and now produces the
 * final `seed` via crossover (best + second-best candidates).  The top-level
 * `seed` and `usage` fields must remain intact so that all existing consumers
 * continue to work without modification.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeMinimalSeed = (title = "테스트 시드") => ({
  title,
  logline: "테스트 로그라인",
  total_chapters: 300,
  world: {
    name: "테스트 세계",
    genre: "판타지",
    sub_genre: "회귀",
    time_period: "중세",
    magic_system: null,
    key_locations: {},
    factions: {},
    rules: [],
  },
  characters: [],
  arcs: [],
  chapter_outlines: [],
  foreshadowing: [],
  style: {
    max_paragraph_length: 3,
    dialogue_ratio: 0.6,
    sentence_style: "short",
    hook_ending: true,
    pov: "1인칭",
    tense: "과거형",
    formatting_rules: [],
  },
});

const makeUsage = () => ({
  prompt_tokens: 100,
  completion_tokens: 200,
  total_tokens: 300,
  cost_usd: 0.01,
});

const makeSeedEvolutionResult = () => ({
  candidates: [
    { seed: makeMinimalSeed("후보 1"), temperature: 0.7, index: 0, usage: makeUsage() },
    { seed: makeMinimalSeed("후보 2"), temperature: 0.9, index: 1, usage: makeUsage() },
    { seed: makeMinimalSeed("후보 3"), temperature: 1.1, index: 2, usage: makeUsage() },
  ],
  usage: {
    prompt_tokens: 300,
    completion_tokens: 600,
    total_tokens: 900,
    cost_usd: 0.03,
  },
});

/** The seed returned by the crossover stage */
const CROSSOVER_SEED = makeMinimalSeed("교배 결과 시드");
const CROSSOVER_USAGE = {
  prompt_tokens: 500,
  completion_tokens: 1000,
  total_tokens: 1500,
  cost_usd: 0.05,
};

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------
vi.mock("@/lib/planning/seed-evolver", () => ({
  generateSeedCandidates: vi.fn(),
}));

// Mock the crossover function (it makes an LLM call and must not hit the network)
vi.mock("@/lib/evolution/seed-crossover", () => ({
  crossoverSeeds: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers to call the route handler directly
// ---------------------------------------------------------------------------
async function callRoute(body: unknown) {
  const { POST } = await import("@/app/api/seed/route");
  const request = new Request("http://localhost/api/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Next.js NextRequest is a superset of Request — cast is safe in tests
  const response = await POST(request as never);
  return { response, json: await response.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/seed — response format contract (AC 8)", () => {
  beforeEach(async () => {
    vi.resetModules();

    const { generateSeedCandidates } = await import("@/lib/planning/seed-evolver");
    (generateSeedCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSeedEvolutionResult(),
    );

    const { crossoverSeeds } = await import("@/lib/evolution/seed-crossover");
    (crossoverSeeds as ReturnType<typeof vi.fn>).mockResolvedValue({
      seed: CROSSOVER_SEED,
      usage: CROSSOVER_USAGE,
    });
  });

  const validBody = {
    genre: "판타지",
    plot: {
      id: "A",
      title: "테스트 플롯",
      logline: "로그라인",
      hook: "훅",
      arc_summary: ["1부", "2부", "3부"],
      key_twist: "반전",
    },
  };

  // ─── top-level `seed` field ──────────────────────────────────────────────

  it("response contains top-level `seed` field", async () => {
    const { json } = await callRoute(validBody);
    expect(json).toHaveProperty("seed");
  });

  it("`seed` is the crossover result (final evolved seed)", async () => {
    const { json } = await callRoute(validBody);
    expect(json.seed.title).toBe("교배 결과 시드");
  });

  it("`seed` has required NovelSeed fields: title, logline, total_chapters", async () => {
    const { json } = await callRoute(validBody);
    expect(json.seed).toHaveProperty("title");
    expect(json.seed).toHaveProperty("logline");
    expect(json.seed).toHaveProperty("total_chapters");
  });

  it("`seed` has `world` sub-object", async () => {
    const { json } = await callRoute(validBody);
    expect(json.seed).toHaveProperty("world");
    expect(json.seed.world).toHaveProperty("genre");
  });

  it("`seed` has `characters` array", async () => {
    const { json } = await callRoute(validBody);
    expect(Array.isArray(json.seed.characters)).toBe(true);
  });

  it("`seed` has `arcs` array", async () => {
    const { json } = await callRoute(validBody);
    expect(Array.isArray(json.seed.arcs)).toBe(true);
  });

  it("`seed` has `style` object", async () => {
    const { json } = await callRoute(validBody);
    expect(json.seed).toHaveProperty("style");
  });

  // ─── top-level `usage` field ─────────────────────────────────────────────

  it("response contains top-level `usage` field", async () => {
    const { json } = await callRoute(validBody);
    expect(json).toHaveProperty("usage");
  });

  it("`usage` has prompt_tokens, completion_tokens, total_tokens, cost_usd", async () => {
    const { json } = await callRoute(validBody);
    expect(json.usage).toHaveProperty("prompt_tokens");
    expect(json.usage).toHaveProperty("completion_tokens");
    expect(json.usage).toHaveProperty("total_tokens");
    expect(json.usage).toHaveProperty("cost_usd");
  });

  it("`usage` values are numbers", async () => {
    const { json } = await callRoute(validBody);
    expect(typeof json.usage.prompt_tokens).toBe("number");
    expect(typeof json.usage.completion_tokens).toBe("number");
    expect(typeof json.usage.total_tokens).toBe("number");
    expect(typeof json.usage.cost_usd).toBe("number");
  });

  it("`usage` aggregates generation + crossover token counts", async () => {
    const { json } = await callRoute(validBody);
    // Generation: 300 + 600 + 900 = 1800 total_tokens
    // Crossover: 1500 total_tokens
    expect(json.usage.total_tokens).toBe(900 + 1500);
  });

  // ─── HTTP status ─────────────────────────────────────────────────────────

  it("returns HTTP 200 on success", async () => {
    const { response } = await callRoute(validBody);
    expect(response.status).toBe(200);
  });

  // ─── error format unchanged ──────────────────────────────────────────────

  it("returns HTTP 400 with `error` field when genre is missing", async () => {
    const { response, json } = await callRoute({ plot: validBody.plot });
    expect(response.status).toBe(400);
    expect(json).toHaveProperty("error");
    expect(typeof json.error).toBe("string");
  });

  it("returns HTTP 400 with `error` field when plot is missing", async () => {
    const { response, json } = await callRoute({ genre: "판타지" });
    expect(response.status).toBe(400);
    expect(json).toHaveProperty("error");
    expect(typeof json.error).toBe("string");
  });

  it("returns HTTP 500 with `error` field on unexpected exception", async () => {
    const { generateSeedCandidates } = await import("@/lib/planning/seed-evolver");
    (generateSeedCandidates as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("LLM 오류"),
    );

    const { response, json } = await callRoute(validBody);
    expect(response.status).toBe(500);
    expect(json).toHaveProperty("error");
    expect(json.error).toBe("LLM 오류");
  });

  // ─── additive `candidates` field (backward-compatible) ───────────────────

  it("response also contains `candidates` array (additive, not breaking)", async () => {
    const { json } = await callRoute(validBody);
    expect(Array.isArray(json.candidates)).toBe(true);
    expect(json.candidates).toHaveLength(3);
  });

  it("`candidates` contains the original 3 generated candidates", async () => {
    const { json } = await callRoute(validBody);
    expect(json.candidates[0].seed.title).toBe("후보 1");
    expect(json.candidates[1].seed.title).toBe("후보 2");
    expect(json.candidates[2].seed.title).toBe("후보 3");
  });
});
