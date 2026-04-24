# Quick rerun artifacts and verification

`web/scripts/quick-rerun.ts` is the narrowest smoke-path for re-running chapter generation from an existing `seed.json`.

## Usage

```bash
cd web
npx tsx scripts/quick-rerun.ts <seed.json> [chapters] [outDir]
```

## Output artifacts

Each run now emits a small artifact set that is meant to be inspected together:

- `seed.json` — copied input seed
- `chapters/chNN.txt` — generated chapter text for each successful chapter
- `blueprints/chNN.json` — blueprint captured for each successful chapter
- `progress.log` — chronological rerun log
- `quick-rerun.log` — chapter-level attempt/status log
- `world-state.json` — world-state snapshot when extraction succeeded
- `report.json` — machine-readable summary for verification/reporting

## `report.json`

`report.json` is intended for quick smoke review and team handoff. It includes:

- final rerun summary
- per-chapter attempt history
- stage history and pipeline warnings per attempt
- safeguard-stage counts for:
  - `future-character-debate`
  - `missing-character-repair`
  - `chapter-quality-repair`
  - `final-cast-hard-repair`
- artifact verification results, including missing required files

## Verification expectations

- A rerun is considered healthy only when chapter generation succeeds **and** required artifacts exist.
- Missing `report.json`, logs, chapter text, blueprint files, or `world-state.json` (when world-state entries were produced) will mark artifact verification as failed.
- The CLI exits non-zero when chapter generation fails or required artifacts are missing.

This keeps lane3 smoke reruns honest without changing the underlying cast/debate safeguards.
