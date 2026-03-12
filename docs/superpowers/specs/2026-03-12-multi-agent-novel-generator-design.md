# Multi-Agent Web Novel Generator Design Spec (v2)

## Revision Notes (v2)

v1에서 4개 에이전트 팀 리뷰를 거쳐 다음을 수정:
- Editor + QA Reviewer → 단일 Evaluator로 통합 (5→4 에이전트)
- LangGraph → 명시적 Python 오케스트레이터 (과잉 복잡도 제거)
- 인메모리 상태 → SQLite (Day 1부터 영속화)
- 토큰 버짓 8K → 모델별 가변 (기본 32K)
- 복선 검증 단계 추가
- 모델 티어링 (Writer만 Opus, 나머지 Sonnet)
- 비용 모델/Observability 섹션 추가
- 최선 초고 추적(monotonic progress) 추가

## Overview

카카오페이지 상위권 품질의 웹소설을 자동 생성하는 멀티 에이전트 시스템.
실제 출판사 편집부 워크플로우를 에이전트로 복제하는 "편집부 모델" 채택.

**핵심 문제**: 현재 단일 LLM 에이전트의 글 품질(대화/묘사/전개)이 웹소설 수준에 미달.
**해결 전략**: 전문화된 4개 에이전트 협업 + 구체적 피드백 기반 반복 개선.

## Architecture

### System Structure

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Frontend                    │
│   (장르선택 → 플롯선택 → 캐릭터미리보기 → 리더)       │
└────────────────────┬────────────────────────────────┘
                     │ HTTP/SSE (프록시)
┌────────────────────▼────────────────────────────────┐
│              Python API (FastAPI)                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │         ChapterPipeline (Orchestrator)         │    │
│  │                                               │    │
│  │   PlotArchitect → CharacterManager → Writer   │    │
│  │                                       ↓       │    │
│  │                                   Evaluator    │    │
│  │                                   ↓      ↑     │    │
│  │                              pass    revise    │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │            SQLite (aiosqlite)                  │    │
│  │  novels / chapters / character_states /        │    │
│  │  foreshadowing / quality_scores                │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Key Decisions

1. **Next.js는 프론트만** — 기존 UI 유지, `/api/*`를 Python 백엔드로 프록시
2. **FastAPI 백엔드** — Python 에이전트 호스팅, SSE 스트리밍 지원
3. **명시적 Python 오케스트레이터** — LangGraph 대신 `ChapterPipeline` 클래스로 구현. 디버깅 용이, 에이전트별 상태 접근 제어 가능. LangSmith 트레이싱이나 human-in-the-loop이 필요해지면 LangGraph 재검토.
4. **SQLite (Day 1)** — 서버 재시작 시 상태 보존, row-level 락으로 동시성 제어, 챕터 텍스트는 온디맨드 로드
5. **Pydantic → OpenAPI → TypeScript** — Python 모델이 single source of truth. `openapi-typescript`로 TS 타입 자동 생성

### Code Reuse from Existing Codebase

기존 Python (`src/novel_generator/`)과 TypeScript (`web/src/lib/`) 양쪽에서 재사용.

| Source                                  | Target (Python)                               | Action          |
|-----------------------------------------|-----------------------------------------------|-----------------|
| `src/novel_generator/schema/`           | `backend/schema/` (Pydantic)                  | 이관 + 확장     |
| `src/novel_generator/evaluators/`       | `backend/evaluators/`                         | 이관 + 확장     |
| `web/src/lib/prompts/`                  | `backend/prompts/` 한국어 프롬프트 복사        | 복사            |
| `web/src/lib/context/builder.ts`        | `backend/context/` Python 포팅                | 포팅            |
| `src/novel_generator/phase0/prompts.py` | `backend/prompts/shared/` 장르 프롬프트        | 이관            |

## Agents (4개)

### 1. PlotArchitect

**Role**: 전체 스토리의 거시적 구조를 설계하고 유지.

- **Input**: 장르, 선택된 플롯, NovelSeed
- **Output**: 강화된 NovelSeed (긴장감 곡선, 감정 비트, 복선 타임라인)
- **Tasks**:
  - 챕터별 긴장감 곡선 설계 (1-10 스케일)
  - 복선 plant/hint/reveal 타임라인 구체화
  - 각 챕터의 감정 비트(emotional beat) 지정
  - 아크 전환점에서 서브플롯 배치
- **When called**: 소설 시작 시 1회 + 아크 전환 시
- **Arc transition trigger**: `current_chapter`가 다음 아크의 `start_chapter` 도달 시 자동 재호출. 두 번째 호출에서는 새 아크의 긴장감 곡선만 출력.
- **Tension source of truth**: PlotArchitect가 출력한 `tension_curve`가 정본. `ChapterOutline.tension_level`은 PlotArchitect가 동기화 업데이트.
- **Model**: Haiku (구조 설계, 소설당 1-2회만 호출)

### 2. CharacterManager

**Role**: 캐릭터 일관성과 성장을 추적/관리.

- **Tasks**:
  - 챕터 생성 전: 현재 캐릭터 상태 요약 제공 (위치, 감정, 관계)
  - 챕터 생성 후: 캐릭터 상태 업데이트
  - 아크 종료 시: 아크 압축 요약 생성
- **State validation**: 상태 업데이트 시 `validate_state_transition()` 실행:
  - 캐릭터 ID가 seed에 존재하는지 확인
  - 관계 키가 기존 캐릭터 이름과 일치하는지 (퍼지 매칭으로 "이서연"/"서연" 통합)
  - 사망한 캐릭터가 행동하지 않는지
  - 위치가 `WorldSetting.key_locations`에 존재하는지 (또는 신규로 등록)
- **Voice samples**: NovelSeed에 고정, 에이전트가 관리하지 않음 (불변 참조 데이터)
- **When called**: 매 챕터 생성 전/후
- **Model**: Haiku (상태 추적은 구조화된 출력, 경량 모델로 충분)

### 3. Writer

**Role**: 실제 소설 텍스트 집필.

- **Input**: 챕터 아웃라인, 캐릭터 상태, 이전 요약/챕터, 스타일 가이드, 피드백(있으면)
- **Output**: 챕터 본문 (3000-6000자)
- **Tasks**:
  - 카카오페이지 문체로 집필
  - 캐릭터별 고유 말투 반영
  - 복선 자연스럽게 배치
  - 피드백 반영한 수정본 작성
- **Revision strategy**: 기존 `improver.ts`의 `selectStrategy` 패턴 유지:
  - `targeted_fix`: 특정 위치만 수정 지시 (대화 블록, 결말 등)
  - `dialogue_rewrite`: 대화만 재작성
  - `ending_fix`: 결말 훅만 수정
  - `full_regenerate`: 전체 재작성 (score < 40 일 때만)
- **Specialization**: 장르별 시스템 프롬프트 분기
- **Model**: Sonnet (글 품질 핵심이지만 비용 효율 고려. Sonnet 4의 글쓰기 품질이 충분히 높음)

### 4. Evaluator (Editor + QA 통합)

**Role**: 2-tier 품질 게이트 + 구체적 수정 지시.

기존 설계의 Editor와 QA Reviewer를 통합. `hybrid-evaluator.ts` 패턴을 따름.

**Tier 1 — Rule-based (무료, <1ms)**:
- 스타일: 대화 비율, 문장 길이, 훅 엔딩
- 페이싱: 장면 밀도, 묘사 비율, 챕터 길이
- 일관성: 캐릭터 목소리 매칭, 복선 키워드 존재 여부

**Tier 2 — LLM (조건부 실행)**:
- **스킵 조건**: rule-based 점수 < 40 (즉시 rewrite) 또는 > 90 (즉시 approve)
- **실행 시**: 40-90 점수 구간에서만
- 카카오페이지 5대 평가 항목 (각 20점, 총 100점):
  1. 몰입도 — 읽다가 멈추고 싶은 지점이 있는가?
  2. 캐릭터 매력 — 감정이입 되는가?
  3. 전개 속도 — 지루/급한 부분이 있는가?
  4. 대화 품질 — 캐릭터별 목소리 구분
  5. 끝맺음 — 다음 화를 읽고 싶은가?
- AI 패턴 감지 (클리셰, 반복 구조, 설명체)
- 감정선 연결 (이전 챕터와의 흐름)

**Verdict schema**:

```python
class EvaluationResult(BaseModel):
    decision: Literal["approve", "revise", "rewrite"]
    rule_score: float        # 0-100, rule-based
    llm_score: float | None  # 0-100, LLM (없으면 None)
    overall_score: float     # 0-100, 가중 평균
    feedback: list[EditorialNote]
    revision_strategy: Literal["targeted_fix", "dialogue_rewrite", "ending_fix", "full_regenerate"] | None

class EditorialNote(BaseModel):
    category: Literal["dialogue", "pacing", "description", "consistency"]
    location: str
    issue: str
    suggestion: str
    severity: Literal["high", "medium", "low"]
```

- **Model**: Haiku (Tier 2 LLM 평가 시. rubric 기반 채점이라 경량 모델로 충분)

## Pipeline Flow

```python
class ChapterPipeline:
    """명시적 async 오케스트레이터. LangGraph 대신 직접 제어."""

    async def run_chapter(self, novel_id: str, chapter_num: int) -> ChapterResult:
        state = await self.db.load_novel_state(novel_id)

        # 순서 검증: chapter_num == len(chapters) + 1
        if chapter_num != len(state.chapters) + 1:
            raise ChapterSequenceError(f"Expected {len(state.chapters)+1}, got {chapter_num}")

        # 아크 전환 체크
        if self.is_arc_transition(state, chapter_num):
            state = await self.plot_architect.enrich(state)
            await self.db.save_tension_curve(novel_id, state.tension_curve)

        # 캐릭터 상태 준비
        char_context = await self.character_manager.prepare(state, chapter_num)

        # 생성-평가 루프
        best_draft = None
        best_score = 0.0

        for attempt in range(MAX_EDITOR_ATTEMPTS):  # max 3
            if attempt == 0 or revision_strategy == "full_regenerate":
                draft = await self.writer.write(state, char_context)
            else:
                draft = await self.writer.revise(draft, feedback, revision_strategy)

            result = await self.evaluator.evaluate(draft, state)

            # 최선 초고 추적 (monotonic progress)
            if result.overall_score > best_score:
                best_draft = draft
                best_score = result.overall_score

            if result.decision == "approve":
                break

            feedback = result.feedback
            revision_strategy = result.revision_strategy

        # 강제 채택: 최선 초고 사용 (attempt 3 도달 시)
        final_draft = best_draft

        # 복선 검증
        await self.verify_foreshadowing(state, chapter_num, final_draft)

        # 캐릭터 상태 업데이트
        state_update = await self.character_manager.update(state, final_draft)
        validated = self.validate_state_transition(state, state_update)
        await self.db.save_character_states(novel_id, validated)

        # 요약 추출 + 저장
        summary = await self.character_manager.summarize(final_draft, state)
        await self.db.save_chapter(novel_id, chapter_num, final_draft, summary)

        return ChapterResult(chapter=final_draft, summary=summary, score=best_score)
```

### Loop Limits

| Counter | Max | 초과 시 |
|---------|-----|--------|
| `editor_attempt` | 3 | 최선 초고 강제 채택 |
| `rewrite` | 챕터당 1회 | 이후 revise만 가능 |

**v1의 QA 루프 제거**: Editor+QA 통합으로 이중 루프 문제 해소. 단일 Evaluator의 3회 판정으로 단순화.

### Foreshadowing Verification (신규)

```python
async def verify_foreshadowing(self, state, chapter_num, chapter_text):
    """강제 채택 후에도 복선이 실제 텍스트에 존재하는지 확인."""
    scheduled = state.foreshadowing_tracker.get_actions(chapter_num)
    for item in scheduled:
        # 키워드/문맥 검색으로 실제 실행 여부 확인
        if not self.foreshadowing_exists_in_text(item, chapter_text):
            if item.action == "plant":
                # 심기 실패 → 다음 챕터로 연기
                item.plant_chapter = chapter_num + 1
                item.status = "pending"
            elif item.action == "hint":
                # 힌트 실패 → 다음 적절한 챕터로 연기
                item.next_action = f"hint at chapter {chapter_num + 2}"
            await self.db.update_foreshadowing(state.novel_id, item)
```

## Shared State

### Database Schema (SQLite)

```sql
CREATE TABLE novels (
    id TEXT PRIMARY KEY,
    seed_json TEXT NOT NULL,
    tension_curve_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'  -- active / completed / abandoned
);

CREATE TABLE chapters (
    novel_id TEXT REFERENCES novels(id),
    chapter_num INTEGER,
    content TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    quality_score REAL,
    token_usage_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (novel_id, chapter_num)
);

CREATE TABLE character_states (
    novel_id TEXT REFERENCES novels(id),
    character_id TEXT,
    state_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (novel_id, character_id)
);

CREATE TABLE foreshadowing (
    novel_id TEXT REFERENCES novels(id),
    item_id TEXT,
    status TEXT NOT NULL,  -- pending / planted / hinted / revealed / missed
    state_json TEXT NOT NULL,
    PRIMARY KEY (novel_id, item_id)
);

-- 동시성 제어
CREATE TABLE generation_locks (
    novel_id TEXT PRIMARY KEY REFERENCES novels(id),
    current_chapter INTEGER,
    locked_at TIMESTAMP,
    -- SELECT ... WHERE novel_id = ? AND locked_at IS NULL
    -- 으로 optimistic locking
);
```

### Session Lifecycle

- `POST /api/init` → `novels` row 생성, `generation_locks` row 생성
- `POST /api/chapter` → lock 획득 → 생성 → lock 해제. 이미 lock이면 409 Conflict
- `GET /api/chapter/{novel_id}/{chapter_num}` → 이미 생성된 챕터 조회 (SSE 끊김 복구용)
- Session TTL: 24시간 미활동 시 `status = 'abandoned'`. Cron/startup 시 cleanup.

### Context Window Management

| Layer               | Content                                    | ~토큰 (50화 기준) |
|---------------------|--------------------------------------------|-------------------|
| **Always included** | 세계관, 스타일가이드, 현재 아크, 챕터 아웃라인 | ~1,000            |
|                     | 관련 캐릭터 보이스/상태 (등장인물만, ~5명)    | ~2,500            |
|                     | 활성 복선 (예정된 것만, ~7개)                 | ~600              |
| **Sliding window**  | 직전 1개 챕터 전문                            | ~5,000-10,000     |
|                     | 직전 5개 챕터 구조화 요약                     | ~2,500            |
| **Compressed**      | 아크별 압축 요약 (1아크 = ~200자)             | ~500              |
|                     | 주요 이벤트 타임라인 (한 줄씩)                | ~300              |
| **Conditional**     | 피드백 (revise 시에만)                        | ~500              |

**총 예상**: ~13,000-17,000 토큰 (50화 기준)

**Context budget**: 모델별 가변. 기본 32K 토큰. 초과 시 우선순위 기반 드롭:
1. Compressed 아크 요약 축소
2. Sliding window 1챕터 전문 → 요약으로 대체
3. 캐릭터 보이스 샘플 축소 (3→1개)
4. 고정 컨텍스트는 절대 드롭하지 않음

**Arc summary 검증**: 아크 요약 생성 후 rule-based 체크 — 아크에 등장하는 모든 캐릭터 이름이 요약에 언급되는지, 주요 이벤트(전투/고백/각성 등) 키워드가 포함되는지 확인.

**복선 reveal 시 원본 참조**: reveal 챕터에서는 원래 plant 챕터의 전문을 컨텍스트에 추가 (coherence 보장).

### Character State Update

```python
class CharacterStateUpdate(BaseModel):
    character_id: str
    changes: CharacterChanges

class CharacterChanges(BaseModel):
    location: str | None = None
    emotional_state: str | None = None
    relationships: dict[str, str] | None = None  # character_name → status
    power_level: str | None = None
    new_secrets: list[str] | None = None
    inventory_add: list[str] | None = None
    inventory_remove: list[str] | None = None

def validate_state_transition(old: CharacterState, update: CharacterStateUpdate, seed: NovelSeed) -> CharacterState:
    """상태 전이 유효성 검증."""
    # 1. character_id가 seed에 존재하는지
    assert update.character_id in {c.id for c in seed.characters}

    # 2. 관계 키가 기존 캐릭터 이름과 매칭 (퍼지 매칭)
    if update.changes.relationships:
        for name in update.changes.relationships:
            matched = fuzzy_match_character(name, seed.characters)
            if not matched:
                log.warning(f"Unknown character in relationship: {name}")

    # 3. 사망 캐릭터 행동 불가
    if old.status == "dead":
        raise InvalidTransitionError(f"Dead character {update.character_id} cannot act")

    # 4. 레벨 회귀 경고 (차단은 안 함 — 스토리상 디파워링 가능)
    if update.changes.power_level and parse_level(update.changes.power_level) < parse_level(old.power_level):
        log.warning(f"Power regression: {old.power_level} → {update.changes.power_level}")

    return apply_changes(old, update.changes)
```

### Foreshadowing Tracker

```python
class ForeshadowingItem(BaseModel):
    """기존 schema의 Foreshadowing을 확장."""
    id: str
    description: str
    status: Literal["pending", "planted", "hinted", "revealed", "missed"]
    plant_chapter: int | None
    hint_chapters: list[int] = []
    reveal_chapter: int | None = None
    target_reveal_chapter: int
    next_action: str

    def should_act(self, chapter: int) -> str | None:
        """기존 should_act 확장. status 기반 + 타임라인 기반."""
        if chapter == self.plant_chapter and self.status == "pending":
            return "plant"
        if chapter == self.target_reveal_chapter and self.status in ("planted", "hinted"):
            return "reveal"
        if self.status == "planted" and self._is_hint_due(chapter):
            return "hint"
        return None
```

## Project Structure

```
kakao-novel-generator/
├── web/                          # Next.js frontend (existing)
│   ├── src/app/                  # Pages
│   └── ...
│
├── backend/                      # New Python backend
│   ├── pyproject.toml
│   ├── main.py                   # FastAPI app
│   ├── db.py                     # SQLite setup + migrations
│   │
│   ├── api/                      # API routes
│   │   ├── plots.py
│   │   ├── seed.py
│   │   ├── chapter.py            # POST /chapter (SSE) + GET /chapter/{id}/{num}
│   │   ├── batch.py
│   │   ├── init.py
│   │   └── status.py
│   │
│   ├── agents/                   # Agent definitions
│   │   ├── plot_architect.py
│   │   ├── character_manager.py
│   │   ├── writer.py
│   │   └── evaluator.py          # Editor + QA 통합
│   │
│   ├── pipeline/                 # Orchestration (LangGraph 대체)
│   │   ├── chapter_pipeline.py   # ChapterPipeline 클래스
│   │   ├── batch_pipeline.py     # 배치 생성 관리
│   │   └── state.py              # NovelState 정의
│   │
│   ├── prompts/
│   │   ├── writer/               # 장르별 작가 프롬프트
│   │   ├── evaluator/            # 평가 프롬프트
│   │   ├── shared/               # 공통 (스타일가이드, 카카오페이지 규칙)
│   │   └── rubric.yaml           # 품질 기준 single source of truth
│   │
│   ├── evaluators/               # Rule-based 평가기
│   │   ├── style.py
│   │   ├── consistency.py
│   │   └── pacing.py
│   │
│   ├── schema/                   # Pydantic models
│   │   ├── novel.py
│   │   ├── character.py
│   │   └── evaluation.py
│   │
│   └── context/
│       ├── builder.py
│       └── summarizer.py
│
├── src/novel_generator/          # Legacy Python CLI (reference)
└── docs/
```

## API Design

### POST /api/plots
- **Body**: `{ genre: string }`
- **Response**: `{ plots: PlotOption[], usage: TokenUsage }`

### POST /api/seed
- **Body**: `{ genre: string, plot: PlotOption }`
- **Response**: `{ seed: NovelSeed, usage: TokenUsage }`

### POST /api/init
초기화. PlotArchitect로 seed 강화.
- **Body**: `{ seed: NovelSeed }`
- **Response**: `{ novel_id: string, enriched_seed: NovelSeed, tension_curve: float[] }`

### POST /api/chapter (SSE)
- **Body**: `{ novel_id: string, chapter_num: int }`
- **Validation**: `chapter_num == len(existing_chapters) + 1`, generation lock 확인
- **SSE Events** (envelope pattern):
  ```python
  class SSEEvent(BaseModel):
      type: str
      payload: dict
      timestamp: float
  ```
  - `agent_start` — `{ agent: "writer", chapter: 1, attempt: 1 }`
  - `chunk` — `{ text: "..." }`
  - `agent_done` — `{ agent: "writer" }`
  - `evaluation` — `{ rule_score, llm_score, overall_score, decision, feedback }`
  - `character_update` — `{ changes: {...} }`
  - `foreshadowing_update` — `{ item_id, action, result: "executed" | "deferred" }`
  - `complete` — `{ chapter, summary, usage, quality_score }`
  - `error` — `{ code: "llm_timeout" | "parse_error" | "lock_conflict", message, recoverable: bool }`

### GET /api/chapter/{novel_id}/{chapter_num}
이미 생성된 챕터 조회 (SSE 끊김 복구용).
- **Response**: `{ content, summary, quality_score }`

### POST /api/batch (SSE)
- **Body**: `{ novel_id: string, start_chapter: int, end_chapter: int }`
- 챕터별 `complete` + `chapter_boundary` 이벤트
- **Error handling**: 실패 시 `batch_error` 이벤트 + 마지막 성공 챕터 번호 반환. 클라이언트가 개별 `/api/chapter`로 재시도 가능.

### GET /api/status/{novel_id}
- **Response**: `{ novel_id, current_chapter, total_chapters, character_states, quality_scores, token_usage, cost_usd }`

## Cost Model

### Model Tiering

비용 목표: 50화 기준 1-2만원 ($7-14).

| Agent | Model | 가격 (in/out per 1M) | 이유 |
|-------|-------|---------------------|------|
| PlotArchitect | Haiku | $0.25/$1.25 | 구조 설계, 소설당 1-2회만 호출 |
| CharacterManager | Haiku | $0.25/$1.25 | 상태 추적/요약, 구조화된 출력 |
| Writer | Sonnet | $3/$15 | 글 품질 핵심. Sonnet의 글쓰기 품질이 충분히 높음 |
| Evaluator (Tier 2) | Haiku | $0.25/$1.25 | 평가 기준이 rubric으로 명확, 경량 모델로 충분 |

### Per-Chapter Cost Estimate

| Scenario | Agent Calls | Estimated Tokens | Cost |
|----------|-------------|-----------------|------|
| **Best case** (1회 통과) | CharManager(2,Haiku) + Writer(1,Sonnet) + Eval rule | ~40K in, ~5K out | ~$0.12 |
| **Average** (1회 수정) | CharManager(2) + Writer(2) + Eval(2) | ~70K in, ~10K out | ~$0.20 |
| **Worst case** (3회 수정) | CharManager(2) + Writer(3) + Eval(3) + PlotArch(1) | ~120K in, ~15K out | ~$0.35 |

### Per-Novel Cost Estimate (50화)

| Scenario | Cost | 원화 (환율 1300) |
|----------|------|-----------------|
| Best case | ~$6 | ~8천원 |
| Average | ~$10 | ~1.3만원 |
| Worst case | ~$17.5 | ~2.3만원 |

**추가 비용 최적화 레버**:
- Writer를 GPT-4o-mini로 전환 시 추가 ~60% 절감 (품질 트레이드오프)
- Rule-based 점수 > 90이면 LLM 평가 스킵 (Tier 2 호출 자체 제거)
- 컨텍스트 버짓을 20K로 줄이면 입력 토큰 ~35% 절감
- Evaluator Tier 2를 5화마다만 실행 (나머지는 rule-based만)

## Quality Strategy

### Shared Quality Rubric (`rubric.yaml`)

모든 평가기와 LLM 프롬프트가 참조하는 단일 기준:

```yaml
dialogue_ratio:
  target: 0.55-0.65
  weight: 0.15
  description: "전체 텍스트 중 대화문 비율"

sentence_length:
  target_short_ratio: 0.6  # 50자 미만 문장 비율
  weight: 0.10

hook_ending:
  weight: 0.15
  description: "다음 화 읽고 싶은 엔딩"
  # NOTE: '하지만', '그때' 같은 키워드 매칭은 보조 지표.
  # LLM 평가에서 실질적 긴장감/호기심 유발 여부 판단.

character_voice:
  weight: 0.20
  description: "캐릭터별 말투 구분"

pacing:
  target_scene_density: "1500-2500 chars/scene"
  weight: 0.15

engagement:
  weight: 0.25
  description: "몰입도, 캐릭터 매력, 전개 흥미"
  evaluation: "llm_only"  # rule-based로 측정 불가
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

**한계 인식**: LLM이 LLM의 패턴을 감지하는 것은 근본적 한계가 있음. 향후 인간 평가 샘플이나 파인튜닝된 분류기로 보강 필요. 현 단계에서는 "없는 것보다 나은" 수준으로 사용.

### Concrete Editorial Feedback

```python
EditorialNote(
    category="dialogue",
    location="4번째 대화 블록 (강현우-이서연)",
    issue="두 캐릭터의 말투가 거의 동일",
    suggestion="강현우: '~인데' 체, 이서연: '~거든요' 체로 구분",
    severity="high"
)
```

## Observability

### Structured Logging

```python
# 모든 에이전트 호출에 trace context 부착
@dataclass
class TraceContext:
    novel_id: str
    chapter_num: int
    agent: str
    attempt: int
    trace_id: str  # uuid4, 챕터 생성 시작 시 발급

# 로그 예시
logger.info("agent_call", extra={
    "trace_id": ctx.trace_id,
    "novel_id": ctx.novel_id,
    "chapter": ctx.chapter_num,
    "agent": "writer",
    "attempt": 2,
    "input_tokens": 15000,
    "output_tokens": 3000,
    "duration_ms": 12500,
    "model": "claude-opus-4",
})
```

### Prompt Version Tracking

프롬프트 파일에 버전 헤더:

```yaml
# prompts/writer/modern_fantasy.yaml
version: "1.2.0"
last_modified: "2026-03-12"
changelog: "전투 묘사 3비트 구조 추가"
```

챕터 생성 시 사용된 프롬프트 버전을 `chapters` 테이블에 기록. 품질 회귀 분석 시 프롬프트 변경과 상관관계 추적.

### Quality Dashboard (향후)

- 챕터별 품질 점수 시계열
- 에이전트별 토큰 소비량
- 수정 횟수 분포 (1회 통과 vs 3회 수정)
- 복선 실행률 (scheduled vs actual)

## Testing Strategy

1. **Unit tests**: 각 평가기 (rule-based) — 기존 TS 테스트를 Python으로 포팅
2. **Agent unit tests**: mock LLM으로 각 에이전트 입출력 검증
3. **Pipeline integration test**: mock LLM으로 ChapterPipeline 전체 흐름 검증 (루프, 강제채택, 복선검증)
4. **E2E test**: 1화 생성 end-to-end (실제 LLM 호출, CI에서는 스킵)
5. **Quality benchmarks**: 동일 시드로 생성한 1/5/10화의 품질 점수 추적
6. **Regression tests**: 프롬프트 변경 시 기존 품질 점수 하락 감지

### LLM Error Handling Tests

```python
# 에이전트별 garbage response 시나리오
def test_writer_returns_empty():
    """Writer가 빈 문자열 반환 시 → retry with explicit instruction"""

def test_evaluator_returns_invalid_json():
    """Evaluator가 JSON 파싱 실패 시 → Pydantic ValidationError → revise로 처리"""

def test_character_manager_hallucinated_character():
    """존재하지 않는 캐릭터 ID → validate_state_transition에서 경고 + 무시"""
```

## Frontend Changes

### API Migration

| 기존 (Next.js)            | 신규 (Python FastAPI)              | 변경사항              |
|---------------------------|------------------------------------|-----------------------|
| `POST /api/plots`         | `POST /api/plots`                  | 동일                  |
| `POST /api/seed`          | `POST /api/seed`                   | 동일                  |
| `POST /api/orchestrate`   | `POST /api/chapter`                | SSE 이벤트 확장       |
| `POST /api/chapter`       | (통합)                             |                       |
| `POST /api/evaluate`      | (제거, evaluator 내부)             |                       |
| (없음)                    | `POST /api/init`                   | 신규                  |
| (없음)                    | `POST /api/batch`                  | 신규                  |
| (없음)                    | `GET /api/chapter/{id}/{num}`      | 신규 (복구용)         |
| (없음)                    | `GET /api/status/{id}`             | 신규                  |

### Migration Strategy

1. Python 백엔드를 `/api/v2/*`로 마운트
2. Next.js `/api/v1/*` (기존) 유지하면서 병행 운영
3. 프론트엔드를 페이지별로 v2로 마이그레이션
4. 전체 완료 후 v1 제거

### Frontend Code Changes

1. **`next.config.ts`**: `/api/v2/*` → `http://localhost:8000` 프록시
2. **`useStreamingGeneration.ts`**: SSE envelope 패턴 적용, 새 이벤트 타입 처리
3. **`useNovelStore.ts`**: `novel_id` 상태 추가
4. **`GenerationControls.tsx`**: 에이전트 진행 시각화
5. **CORS**: FastAPI에서 개발 `http://localhost:3000`, 프로덕션 도메인 허용
6. **TypeScript types**: FastAPI OpenAPI → `openapi-typescript`로 자동 생성
