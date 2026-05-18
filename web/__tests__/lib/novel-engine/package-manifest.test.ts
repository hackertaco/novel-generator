// @vitest-environment node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as cliSurface from "../../../src/cli";
import * as librarySurface from "../../../src/index";
import * as orchestrationSurface from "../../../src/orchestration";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../",
);
const manifestPath = path.join(packageRoot, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
  name: string;
  private: boolean;
  type: string;
  main: string;
  types: string;
  bin: Record<string, string>;
  files: string[];
  exports: Record<string, string | Record<string, string>>;
  repository: {
    type: string;
    url: string;
    directory: string;
  };
  homepage: string;
  bugs: {
    url: string;
  };
  license: string;
  engines: {
    node: string;
  };
};

function expectEntryFile(relativePath: string) {
  expect(fs.existsSync(path.join(packageRoot, relativePath))).toBe(true);
}

describe("novel-engine package manifest", () => {
  it("publishes explicit library, orchestration, and CLI entrypoints", () => {
    expect(manifest.name).toBe("kakao-novel-engine");
    expect(manifest.private).toBe(false);
    expect(manifest.type).toBe("module");
    expect(manifest.main).toBe("./src/index.ts");
    expect(manifest.types).toBe("./src/index.ts");
    expect(manifest.exports).toMatchObject({
      ".": {
        types: "./src/index.ts",
        default: "./src/index.ts",
      },
      "./orchestration": {
        types: "./src/orchestration.ts",
        default: "./src/orchestration.ts",
      },
      "./cli": {
        types: "./src/cli.ts",
        default: "./src/cli.ts",
      },
      "./package.json": "./package.json",
    });
    expect(manifest.bin).toEqual({
      "kakao-novel-engine": "./bin/kakao-novel-engine.mjs",
    });

    expectEntryFile("src/index.ts");
    expectEntryFile("src/orchestration.ts");
    expectEntryFile("src/cli.ts");
    expectEntryFile("bin/kakao-novel-engine.mjs");
  });

  it("keeps release metadata aligned with the published engine surface", () => {
    expect(manifest.files).toEqual(
      expect.arrayContaining([
        "bin",
        "scripts/generate.ts",
        "scripts/novel-engine.ts",
        "scripts/verify-long-form.ts",
        "src",
        "README.md",
      ]),
    );
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/hackertaco/novel-generator.git",
      directory: "web",
    });
    expect(manifest.homepage).toBe(
      "https://github.com/hackertaco/novel-generator/tree/main/web",
    );
    expect(manifest.bugs).toEqual({
      url: "https://github.com/hackertaco/novel-generator/issues",
    });
    expect(manifest.license).toBe("UNLICENSED");
    expect(manifest.engines).toEqual({
      node: ">=20",
    });
  });

  it("exposes the documented public symbols through the package-facing entry files", () => {
    expect(librarySurface.runNovelGeneration).toBeTypeOf("function");
    expect(librarySurface.runNovelVerification).toBeTypeOf("function");
    expect(librarySurface.assertChapterGenerationReleaseParity).toBeTypeOf(
      "function",
    );

    expect(
      orchestrationSurface.createChapterGenerationProgrammaticRunRequest,
    ).toBeTypeOf("function");
    expect(
      orchestrationSurface.createLongFormVerificationProgrammaticRunRequest,
    ).toBeTypeOf("function");

    expect(cliSurface.runNovelEngineCli).toBeTypeOf("function");
    expect(cliSurface.runGenerateCli).toBeTypeOf("function");
    expect(cliSurface.runLongFormVerificationCli).toBeTypeOf("function");
    expect(cliSurface.getLongFormVerificationCliExitCode).toBeTypeOf("function");
  });
});
