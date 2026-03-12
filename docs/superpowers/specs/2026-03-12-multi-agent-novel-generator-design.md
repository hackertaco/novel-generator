# Multi-Agent Web Novel Generator Design Spec

## Overview

카카오페이지 상위권 품질의 웹소설을 자동 생성하는 멀티 에이전트 시스템.
실제 출판사 편집부 워크플로우를 에이전트로 복제하는 "편집부 모델" 채택.

**핵심 문제**: 현재 단일 LLM 에이전트의 글 품질(대화/묘사/전개)이 웹소설 수준에 미달.
**해결 전략**: 전문화된 5개 에이전트 협업 + 구체적 피드백 기반 반복 개선.

## Architecture

### System Structure

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Frontend                    │
│   (장르선택 → 플롯선택 → 캐릭터미리보기 → 리더)       │
└────────────────────┬────────────────────────────────┘
                     │ HTTP/SSE
┌────────────────────▼────────────────────────────────┐
│              Python API (FastAPI)                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │           LangGraph Orchestrator              │    │
│  │                                               │    │
│  │   PlotArchitect → CharacterManager → Writer   │    │
│  │                                       ↓       │    │
│  │                                    Editor      │    │
│  │                                    ↓    ↑      │    │
│  │                              QAReviewer  revise │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │         Shared State (In-Memory / Redis)      │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Key Decisions

1. **Next.js는 프론트만** — 기존 UI 유지, API Routes는 Python 백엔드로 프록시
2. **FastAPI 백엔드** — Python 에이전트 호스팅, SSE 스트리밍 지원
3. **LangGraph** — 에이전트 간 상태 전이와 조건부 라우팅 관리
4. **Shared State** — 모든 에이전트가 접근하는 공유 컨텍스트

### Code Reuse from Existing Codebase

기존 Python (`src/novel_generator/`)과 TypeScript (`web/src/lib/`) 양쪽에서 재사용.
`src/novel_generator/`는 레거시 CLI로 간주하되, 스키마와 평가기 로직을 `backend/`로 이관.

| Source                                  | Target (Python)                               | Action          |
|-----------------------------------------|-----------------------------------------------|-----------------|
| `src/novel_generator/schema/`           | `backend/schema/` (Pydantic)                  | 이관 + 확장     |
| `src/novel_generator/evaluators/`       | `backend/evaluators/`                         | 이관 + 확장     |
| `web/src/lib/prompts/`                  | `backend/prompts/` 한국어 프롬프트 복사        | 복사            |
| `web/src/lib/context/builder.ts`        | `backend/context/` Python 포팅                | 포팅            |
| `web/src/lib/agents/llm-agent.ts`       | LangGraph 노드로 대체                          | 재작성          |
| `src/novel_generator/phase0/prompts.py` | `backend/prompts/shared/` 장르 프롬프트        | 이관            |

## Agents

### 1. PlotArchitect

**Role**: 전체 스토리의 거시적 구조를 설계하고 유지.

- **Input**: 장르, 선택된 플롯, NovelSeed
- **Output**: 강화된 NovelSeed (아크 구조, 긴장감 곡선, 복선 배치)
- **Tasks**:
  - 챕터별 긴장감 곡선 설계 (1-10 스케일, 아크별 클라이맥스 배치)
  - 복선 plant/hint/reveal 타임라인 구체화
  - 각 챕터의 감정 비트(emotional beat) 지정
  - 아크 전환점에서 서브플롯 배치
- **When called**: 소설 생성 시작 시 1회 + 아크 전환 시
- **Arc transition trigger**: `NovelState.current_chapter_num`이 다음 아크의 `start_chapter`에 도달하면 `character_manager_pre` 전에 자동 재호출. 두 번째 호출 시에는 새 아크의 긴장감 곡선과 감정 비트만 출력 (기존 챕터 아웃라인은 유지, 새 아크 챕터만 업데이트).
- **Model**: 고급 (Claude Opus / GPT-4o)

### 2. CharacterManager

**Role**: 캐릭터 일관성과 성장을 추적/관리.

- **Tasks**:
  - 챕터 생성 전: 현재 캐릭터 상태 요약 제공 (위치, 감정, 관계)
  - 챕터 생성 후: 캐릭터 상태 업데이트 (레벨, 관계 변화, 새 비밀)
  - 캐릭터 간 관계 그래프 유지
  - 캐릭터 목소리(voice) 샘플 대화 관리
- **When called**: 매 챕터 생성 전/후
- **Model**: 고급 (Claude Opus / GPT-4o) — 캐릭터 상태 오류가 이후 모든 챕터에 전파되므로 정확성 중요

### 3. Writer

**Role**: 실제 소설 텍스트 집필.

- **Input**: 챕터 아웃라인, 캐릭터 상태, 이전 요약, 스타일 가이드, 편집자 피드백(있으면)
- **Output**: 챕터 본문 (3000-6000자)
- **Tasks**:
  - 카카오페이지 문체로 집필 (짧은 문장, 60% 대화, 훅 엔딩)
  - 캐릭터별 고유 말투 반영
  - 복선 자연스럽게 배치
  - 편집자 피드백 반영한 수정본 작성
- **Specialization**: 장르별 시스템 프롬프트 분기 (로맨스/판타지/무협/회귀)
- **Model**: 고급 (Claude Opus / GPT-4o)

### 4. Editor

**Role**: 품질 게이트 + 구체적 수정 지시.

- **Input**: 작가가 쓴 챕터 + 평가 결과
- **Output**: 판정(approve/revise/rewrite) + 수정 시 구체적 피드백

**Evaluation layers**:

1. **Rule-based 1차 평가** (기존 평가기 재사용):
   - 스타일: 대화 비율, 문장 길이, 훅 엔딩
   - 페이싱: 장면 밀도, 묘사 비율
   - 일관성: 캐릭터 목소리, 복선 연결

2. **LLM 2차 평가** (조건부 실행 — rule-based 점수가 40점 미만이면 스킵하고 즉시 rewrite):
   - 대화 자연스러움 (캐릭터별 말투 차이)
   - 클리셰 검출 ("AI가 쓴 티" 나는 표현)
   - 감정선 연결 (이전 챕터와의 감정 흐름)
   - 긴장감 곡선 부합 여부

**Verdict schema**:

```python
class EditorialVerdict(BaseModel):
    decision: Literal["approve", "revise", "rewrite"]
    score: float  # 0-100
    feedback: list[EditorialNote]

class EditorialNote(BaseModel):
    category: Literal["dialogue", "pacing", "description", "consistency"]
    location: str      # "3번째 대화 블록", "결말 부분"
    issue: str         # 구체적 문제
    suggestion: str    # 구체적 수정 제안
    severity: Literal["high", "medium", "low"]
```

- **Model**: 고급 (Claude Opus / GPT-4o)

### 5. QAReviewer

**Role**: 최종 품질 확인 + 카카오페이지 기준 채점.

- **When called**: 편집자가 approve한 후, 최종 게이트
- **Scoring** (각 20점, 총 100점):
  1. 몰입도 — 읽다가 멈추고 싶은 지점이 있는가?
  2. 캐릭터 매력 — 주인공에 감정이입 되는가?
  3. 전개 속도 — 지루하거나 급한 부분이 있는가?
  4. 대화 품질 — 캐릭터별 목소리가 구분되는가?
  5. 끝맺음 — 다음 화를 읽고 싶은가?
- 80점 미만이면 편집자에게 반려 (최대 2회, 이후 강제 채택)
- **Model**: 고급 (Claude Opus / GPT-4o) — 잘못된 저평가가 비싼 재작성 사이클을 유발하므로

## Agent Flow (LangGraph State Machine)

```
START
  │
  ▼
[check_arc_transition] ─── current_chapter가 새 아크 시작인지 확인
  │
  ├── yes ──▶ [plot_architect] ──▶ (아래로)
  └── no ───────────────────────── (아래로)
  │
  ▼
[character_manager_pre] ─── 챕터 생성 전 상태 준비
  │
  ▼
[writer] ─── 초고 작성
  │
  ▼
[editor] ─── 평가 + 판정
  │
  ├── approve ──▶ [qa_reviewer]
  │                    │
  │                    ├── pass (≥80) ──▶ [character_manager_post] ──▶ CHAPTER_DONE
  │                    └── fail (<80) ──▶ [editor] (qa_attempt < 2일 때만, 초과 시 강제 채택)
  │
  ├── revise ──▶ [writer] (피드백 반영, editor_attempt < 3일 때만)
  │
  └── rewrite ──▶ [writer] (처음부터 다시, rewrite_used == false일 때만)
```

**Chapter boundary reset**: 각 챕터 시작 시 `current_draft`, `editorial_feedback`, `editor_attempt`, `qa_attempt`, `rewrite_used`를 초기화. LangGraph에서는 챕터 단위로 서브그래프를 호출하고, 누적 상태(`chapters`, `character_states` 등)만 상위 그래프에서 유지.

**Quality feedback loop thresholds**:

| Score     | 1차 판정  | 2차 판정 (기준 완화) | 3차 (최종) |
|-----------|-----------|---------------------|-----------|
| ≥ 80      | approve   | approve             | approve   |
| 60-79     | revise    | ≥75 approve         | approve*  |
| < 60      | rewrite   | revise              | approve*  |

*3차는 최선 결과 강제 채택 (무한 루프 방지)

## Shared State

```python
class NovelState(TypedDict):
    """LangGraph graph shared state"""

    # === Fixed context (set at novel start) ===
    seed: NovelSeed
    tension_curve: list[float]  # per-chapter tension (1-10)

    # === Cumulative context (updated per chapter) ===
    chapters: list[Chapter]
    chapter_summaries: list[ChapterSummary]
    character_states: dict[str, CharacterState]
    foreshadowing_tracker: ForeshadowingTracker
    relationship_graph: RelationshipGraph

    # === Current chapter work context (reset per chapter) ===
    current_chapter_num: int
    current_draft: str | None
    editorial_feedback: list[EditorialNote]
    editor_attempt: int       # 편집자→작가 수정 루프 카운터 (max 3)
    qa_attempt: int           # QA 반려 카운터 (max 2)
    rewrite_used: bool        # rewrite는 챕터당 1회만

    # === Metrics ===
    quality_scores: list[QualityScore]
    token_usage: TokenUsage
```

### Context Window Management

50화 이상 생성 시 컨텍스트 폭발 방지:

| Layer               | Content                                    | Scope           |
|---------------------|--------------------------------------------|-----------------|
| **Always included** | 세계관, 스타일가이드, 현재 아크, 챕터 아웃라인 | Fixed           |
|                     | 관련 캐릭터 보이스/상태 (등장인물만)           | Filtered        |
|                     | 활성 복선 (plant/hint/reveal 예정)           | Filtered        |
| **Sliding window**  | 직전 3개 챕터 전문                            | Recent          |
|                     | 직전 5개 챕터 구조화 요약                     | Recent          |
| **Compressed**      | 아크별 압축 요약 (1아크 = ~200자)             | Historical      |
|                     | 주요 이벤트 타임라인 (한 줄씩)                | Historical      |
| **Conditional**     | 편집자 피드백 (수정 요청 시에만)               | On revise only  |

**Context token budget**: 작가 에이전트 기준 최대 8,000 토큰. 초과 시 우선순위 기반 드롭: Compressed → Sliding window 축소(3→2챕터) → 캐릭터 보이스 샘플 축소. 고정 컨텍스트는 절대 드롭하지 않음.

**Arc summary auto-generation**: 아크 종료 시 CharacterManager가 해당 아크의 압축 요약을 생성. 이후 챕터에서는 개별 챕터 요약 대신 아크 요약만 참조.

### Character State Auto-Update

```python
class CharacterStateUpdate:
    character_id: str
    changes: dict  # e.g.:
    # {
    #     "location": "학원 → 던전 3층",
    #     "emotional_state": "불안 → 각오",
    #     "relationships": {"이서연": "경계 → 신뢰 시작"},
    #     "power_level": "F등급 → F등급 (각성 조짐)",
    #     "new_secrets": ["전생의 기억 일부 회복"],
    #     "inventory": ["+파란 오브"]
    # }
```

### Foreshadowing Tracker

```python
class ForeshadowingItem(BaseModel):
    """기존 schema의 Foreshadowing을 확장.
    기존: status=pending/planted/revealed, hints_at: int, reveal_at: int
    신규: hinted 상태 추가, hint 이력 추적, next_action 필드 추가
    """
    id: str
    description: str
    status: Literal["pending", "planted", "hinted", "revealed"]
    plant_chapter: int | None      # 기존 hints_at에 대응
    hint_chapters: list[int]       # 신규: 힌트 뿌린 챕터 이력
    reveal_chapter: int | None     # 기존 reveal_at에 대응
    target_reveal_chapter: int     # 기존 reveal_at (계획된 시점)
    next_action: str               # 신규: "hint at chapter 12" 등
```

편집자가 복선 타이밍 체크: "이 복선은 5화에 심었는데 15화까지 힌트가 없다" → 작가에게 힌트 삽입 지시.

## Project Structure

```
kakao-novel-generator/
├── web/                          # Next.js frontend (existing, maintained)
│   ├── src/app/                  # Pages (genre/plot/preview/reader/chapters)
│   └── ...
│
├── backend/                      # New Python backend
│   ├── pyproject.toml
│   ├── main.py                   # FastAPI app entrypoint
│   │
│   ├── api/                      # API routes
│   │   ├── plots.py              # POST /plots
│   │   ├── seed.py               # POST /seed
│   │   ├── chapter.py            # POST /chapter (SSE)
│   │   └── status.py             # GET /status
│   │
│   ├── agents/                   # Agent definitions
│   │   ├── plot_architect.py
│   │   ├── character_manager.py
│   │   ├── writer.py
│   │   ├── editor.py
│   │   └── qa_reviewer.py
│   │
│   ├── graph/                    # LangGraph workflow
│   │   ├── novel_graph.py        # Main graph definition
│   │   ├── state.py              # NovelState definition
│   │   └── nodes.py              # Graph nodes (agent wrappers)
│   │
│   ├── prompts/                  # Prompt templates
│   │   ├── writer/               # Genre-specific writer prompts
│   │   ├── editor/               # Editor prompts
│   │   └── shared/               # Common (style guide, Kakao Page rules)
│   │
│   ├── evaluators/               # Evaluators (ported from TS)
│   │   ├── style.py
│   │   ├── consistency.py
│   │   ├── pacing.py
│   │   └── llm_evaluator.py
│   │
│   ├── schema/                   # Pydantic models
│   │   ├── novel.py
│   │   ├── character.py
│   │   └── evaluation.py
│   │
│   └── context/                  # Context builder
│       ├── builder.py
│       └── summarizer.py
│
├── src/novel_generator/          # Legacy Python CLI (reference only)
└── docs/
```

## API Design

### State Management Model

서버는 `novel_id`로 키잉된 인메모리 상태를 유지. 소설 생성이 시작되면 (`POST /api/init`) 서버가 `novel_id`를 발급하고, 이후 모든 요청은 이 ID를 포함. 챕터 생성 시 서버가 `character_states`, `foreshadowing_tracker`, `chapter_summaries` 등을 자동 누적 관리.

Redis 또는 파일 기반 백업으로 서버 재시작 시 복구 가능 (Phase 2).

### POST /api/plots
Generate 3 plot options from genre.
- **Body**: `{ genre: string }`
- **Response**: `{ plots: PlotOption[], usage: TokenUsage }`

### POST /api/seed
Generate full NovelSeed from genre + selected plot.
- **Body**: `{ genre: string, plot: PlotOption }`
- **Response**: `{ seed: NovelSeed, usage: TokenUsage }`

### POST /api/init
Initialize a novel session with a seed. Runs PlotArchitect for initial enrichment.
- **Body**: `{ seed: NovelSeed }`
- **Response**: `{ novel_id: string, enriched_seed: NovelSeed, tension_curve: float[] }`

### POST /api/chapter (SSE)
Generate a single chapter with multi-agent pipeline.
- **Body**: `{ novel_id: string, chapter_num: int }`
- Server retrieves accumulated state (summaries, character states, foreshadowing) from `novel_id`.
- **SSE Events**:
  - `agent_start` — `{ agent: "writer", chapter: 1 }`
  - `chunk` — `{ text: "..." }` (real-time text)
  - `agent_done` — `{ agent: "writer" }`
  - `evaluation` — `{ scores: {...}, verdict: "revise" }`
  - `feedback` — `{ notes: [...] }`
  - `qa_result` — `{ score: 87, breakdown: {...} }`
  - `character_update` — `{ changes: {...} }`
  - `complete` — `{ chapter, summary, usage }`
- **Error events**: `error` — `{ code, message }` (LLM 실패, 타임아웃 등)

### POST /api/batch (SSE)
Generate multiple chapters sequentially.
- **Body**: `{ novel_id: string, start_chapter: int, end_chapter: int }`
- Server uses accumulated state, updating `character_states` and `foreshadowing` between chapters.
- **SSE Events**: Same as `/chapter`, repeated per chapter, with `chapter_boundary` event between chapters.

### GET /api/status/{novel_id}
Get current novel generation state.
- **Response**: `{ novel_id, current_chapter, total_chapters, character_states, quality_scores, token_usage }`

## Quality Strategy

### Genre-Specialized Prompts

```python
WRITER_CONFIGS = {
    "modern_fantasy": {
        "persona": "카카오페이지 현대판타지 TOP10 작가 스타일",
        "style_rules": [
            "전투 묘사: 동작 → 감각 → 결과 3비트 구조",
            "스킬 발동: 짧은 문장 연타 + 의성어",
            "일상: 대화 70% 이상, 가벼운 톤",
        ],
        "anti_patterns": [
            "~였다. ~였다. ~였다. 반복 금지",
            "'마치 ~처럼' 비유 과다 사용 금지",
            "설명체 서술 금지 (보여주기, 말하지 않기)",
        ]
    },
    "romance": { ... },
    "martial_arts": { ... },
    "regression": { ... },
}
```

### AI Smell Detection

편집자 프롬프트에 명시적 AI 패턴 감지/교정:

```python
AI_SMELL_PATTERNS = [
    "동일한 문장 구조 3연속 반복",
    "과도한 감정 설명 (행동으로 보여줘야)",
    "불필요한 요약/해설",
    "부자연스러운 독백",
    "클리셰 비유 ('심장이 두근거렸다', '눈이 휘둥그레졌다')",
    "모든 캐릭터가 너무 예의바르게 말함",
]
```

### Concrete Editorial Feedback

기존 "스타일 점수 72점" → 구체적 위치/문제/수정안 제시:

```
EditorialNote(
    category="dialogue",
    location="4번째 대화 블록 (강현우-이서연)",
    issue="두 캐릭터의 말투가 거의 동일",
    suggestion="강현우: '~인데' 체, 이서연: '~거든요' 체로 구분",
    severity="high"
)
```

## Testing Strategy

1. **Unit tests**: 각 평가기 (rule-based) — 기존 TS 테스트를 Python으로 포팅
2. **Agent unit tests**: mock LLM으로 각 에이전트 입출력 검증
3. **Integration tests**: 1화 생성 end-to-end (실제 LLM 호출, CI에서는 스킵)
4. **Quality benchmarks**: 동일 시드로 생성한 1/5/10화의 품질 점수 추적
5. **Regression tests**: 프롬프트 변경 시 기존 품질 점수 하락 감지

## Frontend Changes

### API Migration

기존 Next.js API Routes → Python 백엔드로 이관:

| 기존 (Next.js)            | 신규 (Python FastAPI)       | 변경사항                     |
|---------------------------|-----------------------------|------------------------------|
| `POST /api/plots`         | `POST /api/plots`           | 동일 계약, 서버만 변경       |
| `POST /api/seed`          | `POST /api/seed`            | 동일                         |
| `POST /api/orchestrate`   | `POST /api/chapter`         | SSE 이벤트 타입 확장         |
| `POST /api/chapter`       | (제거, /api/chapter로 통합) |                              |
| `POST /api/evaluate`      | (제거, editor가 내부 처리)  |                              |
| (없음)                    | `POST /api/init`            | 신규: 소설 세션 초기화       |
| (없음)                    | `POST /api/batch`           | 신규: 배치 생성              |
| (없음)                    | `GET /api/status/{id}`      | 신규: 상태 조회              |

### Frontend Code Changes

1. **`next.config.ts`**: `/api/*` 요청을 `http://localhost:8000`으로 프록시 (개발), 프로덕션에서는 환경변수 `BACKEND_URL`
2. **`useStreamingGeneration.ts`**: SSE 이벤트 핸들러에 `agent_start`, `feedback`, `qa_result`, `character_update`, `error` 추가
3. **`useNovelStore.ts`**: `novel_id` 상태 추가, `POST /api/init` 호출 로직 추가
4. **`GenerationControls.tsx`**: 에이전트 진행 시각화 (현재 파이프라인 로그 확장)
5. **`web/src/app/api/` 디렉토리**: 전체 제거 (Python으로 이관 완료 후)
6. **CORS**: FastAPI에서 `http://localhost:3000` 허용 (개발), 프로덕션 도메인 설정
7. **Error handling**: Python 백엔드 응답 형식 `{ error: string, code: string }` 통일
