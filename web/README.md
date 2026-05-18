# Novel Engine (`web/`)

This directory contains the shipping TypeScript novel engine and its public surfaces:

- CLI: `scripts/novel-engine.ts`
- Library API: `src/lib/novel-engine/index.ts`
- HTTP wrappers: `src/app/api/orchestrate/route.ts` and `src/app/api/verify-long-form/route.ts`

Published package metadata exposes the same surfaces under:

- package name: `kakao-novel-engine`
- root library entrypoint: `kakao-novel-engine`
- request/contract builders: `kakao-novel-engine/orchestration`
- CLI helpers: `kakao-novel-engine/cli`
- installed command: `kakao-novel-engine`

## Setup

```bash
npm install
cp env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`.
z-ai is disabled by default even if `NOVEL_LLM_PROVIDER=zai` is present; enabling it requires the explicit opt-in `NOVEL_ALLOW_ZAI=1`.

## Quick Commands

Generate chapters from the canonical seed:

```bash
npx tsx scripts/novel-engine.ts generate \
  --seed ./seeds/test-romance-fantasy.json \
  --chapters 1-3 \
  --out ./output/readme-generate
```

Run built-in 300-episode long-form verification:

```bash
npx tsx scripts/novel-engine.ts verify-long-form \
  --preset fast \
  --budget 25 \
  --out ./output/readme-verify
```

## Parity Documentation

The full CLI vs library API parity guide lives in [../docs/novel-engine-cli-library-parity.md](../docs/novel-engine-cli-library-parity.md).

That guide includes:

- matching setup for both surfaces
- canonical generation and verification scenarios
- artifact expectations
- pass/fail checks for parity validation
