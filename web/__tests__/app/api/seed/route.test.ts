// @vitest-environment node
/**
 * Tests for api/seed/route.ts
 *
 * The route now uses NovelHarness.stepSeed() which yields events.
 * It returns { seed } on success.
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

const GENERATED_SEED = makeMinimalSeed("생성된 시드");

// ---------------------------------------------------------------------------
// Mock modules — mock @/lib/harness which the route imports
// ---------------------------------------------------------------------------
const mockStepSeed = vi.fn();

vi.mock("@/lib/harness", () => {
  class MockNovelHarness {
    stepSeed = mockStepSeed;
  }
  return {
    NovelHarness: MockNovelHarness,
    getDefaultConfig: vi.fn().mockReturnValue({}),
  };
});

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
describe("POST /api/seed — response format contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: stepSeed yields a seed_generated event
    mockStepSeed.mockImplementation(async function* () {
      yield { type: "stage", stage: "seed" };
      yield { type: "seed_generated", seed: GENERATED_SEED };
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

  // --- top-level `seed` field ---

  it("response contains top-level `seed` field", async () => {
    const { json } = await callRoute(validBody);
    expect(json).toHaveProperty("seed");
  });

  it("`seed` is the generated result", async () => {
    const { json } = await callRoute(validBody);
    expect(json.seed.title).toBe("생성된 시드");
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

  // --- HTTP status ---

  it("returns HTTP 200 on success", async () => {
    const { response } = await callRoute(validBody);
    expect(response.status).toBe(200);
  });

  // --- error format ---

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
    mockStepSeed.mockImplementation(async function* () {
      throw new Error("LLM 오류");
    });

    const { response, json } = await callRoute(validBody);
    expect(response.status).toBe(500);
    expect(json).toHaveProperty("error");
    expect(json.error).toBe("LLM 오류");
  });

  it("returns HTTP 500 when no seed_generated event is yielded", async () => {
    mockStepSeed.mockImplementation(async function* () {
      yield { type: "stage", stage: "seed" };
      // No seed_generated event
    });

    const { response, json } = await callRoute(validBody);
    expect(response.status).toBe(500);
    expect(json).toHaveProperty("error");
  });

  // --- response only contains seed (no candidates/usage at top level) ---

  it("response returns { seed } structure matching route implementation", async () => {
    const { json } = await callRoute(validBody);
    expect(json).toHaveProperty("seed");
    expect(json.seed.title).toBe("생성된 시드");
  });

  it("stepSeed is called with genre and plot from request body", async () => {
    await callRoute(validBody);
    expect(mockStepSeed).toHaveBeenCalledWith("판타지", validBody.plot);
  });

  it("handles error event from stepSeed gracefully via try-catch", async () => {
    mockStepSeed.mockImplementation(async function* () {
      yield { type: "error", chapter: 0, message: "시드 생성 실패: timeout" };
    });

    const { response, json } = await callRoute(validBody);
    // No seed_generated event was yielded, so seed is undefined -> 500
    expect(response.status).toBe(500);
    expect(json).toHaveProperty("error");
  });
});
