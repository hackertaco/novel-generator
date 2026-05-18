# Kakao Novel Generator

Simulation-first long-form novel engine for generating and verifying serialized fiction with explicit world truth, character memory, belief state, utterance history, causal ledgers, foreshadow tracking, rendering, and verification.

The shipping implementation lives in [web/](./web). The public product surfaces for the current engine are:

- CLI: `web/scripts/novel-engine.ts`
- Library API: `web/src/lib/novel-engine/index.ts`
- HTTP wrappers over the same contracts: `web/src/app/api/orchestrate/route.ts` and `web/src/app/api/verify-long-form/route.ts`

## Setup

```bash
cd web
npm install
cp env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local` before running generation or long-form verification.
z-ai is disabled by default; `NOVEL_LLM_PROVIDER=zai` only works with the explicit opt-in `NOVEL_ALLOW_ZAI=1`.

## Quick Start

Chapter generation from a canonical seed:

```bash
cd web
npx tsx scripts/novel-engine.ts generate \
  --seed ./seeds/test-romance-fantasy.json \
  --chapters 1-3 \
  --out ./output/readme-generate
```

Long-form verification against the built-in deterministic 300-episode scenario:

```bash
cd web
npx tsx scripts/novel-engine.ts verify-long-form \
  --preset fast \
  --budget 25 \
  --out ./output/readme-verify
```

## Parity Guide

Matching CLI and library API examples for the same canonical scenarios are documented in [docs/novel-engine-cli-library-parity.md](./docs/novel-engine-cli-library-parity.md).

That guide covers:

- setup for both surfaces
- chapter generation with the same seed and chapter range
- long-form verification with the same 300-episode scenario
- success criteria, artifact locations, and failure checks

## Verification Outputs

Generation runs write artifacts under the chosen output directory, including:

- `result.json`
- `chapters/chapter-XXX.txt`
- `summaries/chapter-XXX.summary.json`
- `ledgers/causal-ledger.json`
- `metadata/run-metadata.json`

Long-form verification runs write:

- `validation-report.json`
- `result.json`
- `scenario.seed.json`

## Notes

- The old Python CLI under `src/novel_generator/` is legacy code and is not the canonical engine surface.
- When you need the reusable programmatic surface, prefer the exports from `web/src/lib/novel-engine/index.ts` and the request builders from `web/src/lib/orchestration/index.ts`.
