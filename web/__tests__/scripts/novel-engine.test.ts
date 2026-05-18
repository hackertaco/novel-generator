// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { runNovelEngineCli } from "../../scripts/novel-engine";

describe("novel-engine CLI", () => {
  it("defaults to generate mode when args start with generate flags", async () => {
    const runGenerate = vi.fn(async () => undefined);
    const runVerify = vi.fn();

    const execution = await runNovelEngineCli({
      args: ["--seed", "seed.json", "--chapters", "1-2"],
      runGenerate,
      runVerify,
    });

    expect(execution).toEqual({
      command: "generate",
    });
    expect(runGenerate).toHaveBeenCalledWith({
      args: ["--seed", "seed.json", "--chapters", "1-2"],
      io: undefined,
    });
    expect(runVerify).not.toHaveBeenCalled();
  });

  it("dispatches verify-long-form as an explicit top-level subcommand", async () => {
    const verificationResult = {
      report: { run: { passed: true } },
      contradictionValidation: { contradiction_count: 0 },
    } as never;
    const runGenerate = vi.fn(async () => undefined);
    const runVerify = vi.fn(async () => verificationResult);

    const execution = await runNovelEngineCli({
      args: ["verify-long-form", "--scenario", "scenario.json"],
      runGenerate,
      runVerify,
    });

    expect(execution).toEqual({
      command: "verify-long-form",
      verificationResult,
    });
    expect(runVerify).toHaveBeenCalledWith({
      args: ["--scenario", "scenario.json"],
      io: undefined,
    });
    expect(runGenerate).not.toHaveBeenCalled();
  });
});
