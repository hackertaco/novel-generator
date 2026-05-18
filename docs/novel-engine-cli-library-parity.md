# Novel Engine CLI / Library API Parity

This guide documents the same canonical scenarios through both supported public surfaces:

- CLI: `web/scripts/novel-engine.ts`
- Library API: `web/src/lib/novel-engine/index.ts`

The goal is parity: the same inputs should drive the same workflow contracts, artifact layout, and verification expectations regardless of whether you invoke the engine from the shell or from TypeScript.

When this engine is consumed as a package, the release-facing entrypoints are:

- CLI command: `kakao-novel-engine`
- library API: `kakao-novel-engine`
- request builders and workflow contracts: `kakao-novel-engine/orchestration`
- CLI helper module: `kakao-novel-engine/cli`

## Setup

All examples below assume you start in the repository root.

```bash
cd web
npm install
cp env.example .env.local
```

Add `OPENAI_API_KEY` to `.env.local`.

## Surface Map

| Scenario | CLI surface | Library API surface | Shared success signal |
| --- | --- | --- | --- |
| Chapter generation from a canonical seed | `scripts/novel-engine.ts generate` | `runNovelGeneration()` | Run completes, artifacts are written, canonical verification stays at zero failures |
| 300-episode long-form verification | `scripts/novel-engine.ts verify-long-form` | `runNovelVerification()` | Verification passes with `0` causal contradictions |

## Canonical Scenario 1: Generate Chapters From A Seed

Shared input:

- seed file: `web/seeds/test-romance-fantasy.json`
- chapter range: `1-3`
- preset: `default`

### CLI

```bash
cd web
npx tsx scripts/novel-engine.ts generate \
  --seed ./seeds/test-romance-fantasy.json \
  --chapters 1-3 \
  --out ./output/parity-generate-cli
```

The same workflow can also be reached through the package script:

```bash
cd web
npm run generate -- \
  --seed ./seeds/test-romance-fantasy.json \
  --chapters 1-3 \
  --out ./output/parity-generate-cli
```

### Library API

```ts
import fs from "node:fs";

import {
  createChapterGenerationProgrammaticRunRequest,
} from "kakao-novel-engine/orchestration";
import { runNovelGeneration } from "kakao-novel-engine";

const seed = JSON.parse(
  fs.readFileSync("./seeds/test-romance-fantasy.json", "utf-8"),
);

const request = createChapterGenerationProgrammaticRunRequest({
  input: {
    workflow: "chapter_generation",
    seed,
    startChapter: 1,
    endChapter: 3,
    preset: "default",
  },
  outDir: "./output/parity-generate-library",
  verbose: false,
});

const execution = await runNovelGeneration({ request });

console.log(execution.contract.ok);
console.log(execution.contract.state.chapterRange.generatedChapterCount);
console.log(execution.contract.state.verification);
console.log(execution.contract.artifacts.map((artifact) => artifact.path));
```

### What To Verify

Both surfaces should produce the same artifact layout under their respective output directories:

- `result.json`
- `chapters/chapter-001.txt`
- `chapters/chapter-002.txt`
- `chapters/chapter-003.txt`
- `summaries/chapter-001.summary.json`
- `ledgers/causal-ledger.json`
- `metadata/run-metadata.json`

Use these checks for parity:

- CLI run exits without error.
- Library run returns `execution.contract.ok === true`.
- `execution.contract.state.verification.canonicalValidationFailureCount === 0`.
- `execution.contract.state.verification.contradictionViolationCount === 0`.
- `execution.contract.state.verification.foreshadowQualityGatePassed === true`.

## Canonical Scenario 2: Verify A 300-Episode Novel Horizon

Shared input:

- preset: `fast`
- budget: `25`
- scenario: built-in deterministic long-form validation scenario

The built-in scenario already spans `300` episodes, so you can omit a custom scenario file for the first parity run. If you need a custom regression fixture later, use `--scenario <path>` on the CLI or `scenarioPath` in the request input.

### CLI

```bash
cd web
npx tsx scripts/novel-engine.ts verify-long-form \
  --preset fast \
  --budget 25 \
  --out ./output/parity-verify-cli
```

The package script calls the same implementation:

```bash
cd web
npm run verify:long-form -- \
  --preset fast \
  --budget 25 \
  --out ./output/parity-verify-cli
```

### Library API

```ts
import {
  createLongFormVerificationProgrammaticRunRequest,
} from "kakao-novel-engine/orchestration";
import { runNovelVerification } from "kakao-novel-engine";

const request = createLongFormVerificationProgrammaticRunRequest({
  input: {
    workflow: "long_form_verification",
    preset: "fast",
    outDir: "./output/parity-verify-library",
    budgetUsd: 25,
    verbose: false,
  },
});

const execution = await runNovelVerification({ request });

console.log(execution.contract.state.scenario.totalEpisodes);
console.log(execution.contract.state.verification);
console.log(execution.contract.result.report.run.passed);
console.log(execution.contract.result.contradictionValidation.contradiction_count);
```

### What To Verify

Both surfaces should report a full-horizon verification result and emit:

- `validation-report.json`
- `result.json`
- `scenario.seed.json`

Use these checks for parity:

- CLI exits with code `0`.
- Library run returns `execution.contract.state.verification.passed === true`.
- `execution.contract.state.verification.contradictionViolationCount === 0`.
- `execution.contract.result.report.run.passed === true`.
- `execution.contract.result.contradictionValidation.contradiction_count === 0`.

## Custom Scenario Parity

If you need both surfaces to verify the exact same saved scenario file rather than the built-in deterministic one, use the matching fields below:

- CLI: `--scenario ./path/to/scenario.json`
- Library API: `input.scenarioPath: "./path/to/scenario.json"`

That mapping is the parity contract. Do not mix a custom scenario file on one surface with the built-in scenario on the other if you are trying to compare outputs.

## HTTP Wrapper Note

The Next.js route handlers wrap the same request contracts used above:

- chapter generation: `web/src/app/api/orchestrate/route.ts`
- long-form verification: `web/src/app/api/verify-long-form/route.ts`

If you need HTTP instead of direct TypeScript calls, start from the library API examples and forward the same `input` payloads through those routes. The library API remains the canonical contract surface.
