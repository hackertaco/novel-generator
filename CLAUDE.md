# Development Guidelines

## Dev Server

- **Port: 6367** — `npm run dev` 시 반드시 `-p 6367` 사용. 포트 3000 사용 금지.
- E2E 테스트: `npx tsx scripts/e2e-test.ts --base-url http://localhost:6367`
- Quick rerun: `npx tsx scripts/quick-rerun.ts <seed.json> [chapters]`

## Project Structure

- `web/` — Next.js 웹앱 (소설 생성 파이프라인)
- `src/` — Python 레거시 (사용 안 함)

## Commands

```bash
# 서버 시작
cd web && npx next dev -p 6367

# 테스트
cd web && npx vitest run

# E2E
cd web && npx tsx scripts/e2e-test.ts --preset fast --chapters 3 --base-url http://localhost:6367
```
