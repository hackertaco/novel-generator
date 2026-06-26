#!/usr/bin/env bash
# 장면 다리(scene bridge) A/B 검증 하니스.
# 같은 시드를 다리 ON / OFF(--no-scene-bridges)로 N회씩 렌더하고
# sceneSeam 점수·보고체 점프 수를 집계해 다리의 효과를 측정한다.
#
# 사용:
#   bash scripts/scene-bridge-ab.sh [seed] [chapters] [episodes] [maxScenesPerEpisode] [reps] [outRoot]
# 기본값은 어려운 케이스(4 장면 span) — 다리 효과가 드러나는 영역.
#   bash scripts/scene-bridge-ab.sh                      # 기본 어려운 케이스
#   bash scripts/scene-bridge-ab.sh seeds/test-romance-fantasy-inverted.json 1-8 3 3 3  # 쉬운 케이스
#
# 배경/결과: docs/superpowers/specs/2026-06-08-outline-inversion-design.md,
#            memory project_scene_bridge — 다리는 "바닥 보호 장치"(floor-raiser).

set -uo pipefail
cd "$(dirname "$0")/.."

SEED="${1:-seeds/test-romance-fantasy-inverted.json}"
CHAPTERS="${2:-1-8}"
EPISODES="${3:-2}"
MAXS="${4:-4}"
REPS="${5:-3}"
ROOT="${6:-/tmp/scene-bridge-ab}"

rm -rf "$ROOT"; mkdir -p "$ROOT"
echo "시드=$SEED chapters=$CHAPTERS episodes=$EPISODES maxScenes=$MAXS reps=$REPS"
echo "출력=$ROOT"

run() { # cond extra-args
  local cond="$1"; shift
  for rep in $(seq 1 "$REPS"); do
    echo "=== $cond rep$rep ==="
    npx tsx scripts/simulate-world.ts --seed "$SEED" --chapters "$CHAPTERS" \
      --out "$ROOT/$cond-rep$rep" --episodes "$EPISODES" --max-scenes-per-episode "$MAXS" \
      --writer episode-llm "$@" > "$ROOT/$cond-rep$rep.log" 2>&1 || true
    tail -2 "$ROOT/$cond-rep$rep.log"
  done
}

run on
run off --no-scene-bridges

echo ""
echo "================= 집계 ================="
ROOT="$ROOT" REPS="$REPS" python3 - <<'PY'
import json, glob, os, statistics as st
root=os.environ["ROOT"]; reps=int(os.environ["REPS"])
def collect(cond):
    rows=[]
    for rep in range(1, reps+1):
        for f in sorted(glob.glob(f"{root}/{cond}-rep{rep}/episode-qa/episode-*.qa.json")):
            if "renderer" in f: continue
            qa=json.load(open(f)); s=qa["metrics"]["sceneSeam"]; d=s["details"]
            rows.append({"seam":s["score"], "jumps":len(d.get("reportStyleTransitions") or []),
                         "overall":qa.get("score")})
    return rows
for cond in ("on","off"):
    r=collect(cond)
    if not r:
        print(f"{cond.upper()}: (no episodes)"); continue
    seam=[x["seam"] for x in r]; jumps=[x["jumps"] for x in r]
    print(f"{cond.upper()}  n={len(r)}  sceneSeam mean={st.mean(seam):.3f} "
          f"min={min(seam):.3f} max={max(seam):.3f}  "
          f"보고체점프 total={sum(jumps)}  종합QA={st.mean([x['overall'] for x in r]):.3f}")
print("\n해석: 다리는 약한 seam의 '바닥'(min)을 끌어올린다 — 한 에피소드가 더 많은/먼 장면을 묶을수록 효과 커짐.")
PY
echo "ALL_DONE"
