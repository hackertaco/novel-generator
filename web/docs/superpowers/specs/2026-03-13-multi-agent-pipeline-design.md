# Multi-Agent Chapter Pipeline Design

## Problem

현재 chapter-lifecycle.ts가 모놀리식으로 Writer→Editor→Evaluator→Segment Patcher를 모두 처리한다.

핵심 문제:
1. **메타 마커 누출**: Segment Editor의 `--- 수정 대상 ---` 마커가 최종 출력에 포함됨
2. **Editor 전체 재작성**: 잘 된 부분까지 망가뜨림
3. **역할 모호**: Writer와 Editor의 경계가 불분명
4. **룰 기반 평가 한계**: "왜 안 좋은지" 구체적 피드백 부족
5. **문단 통째 중복**: LLM이 같은 문단을 여러 번 출력하는 루프 현상

## Architecture

### Pipeline with Middleware 패턴

모든 에이전트가 동일한 `PipelineAgent` 인터페이스를 구현하고, 공유 `ChapterContext`를 순차 전달.

```
Writer → RuleGuard → QualityLoop(Critic↔Surgeon) → Polisher → Done
```

### 공유 상태

```typescript
interface ChapterContext {
  seed: NovelSeed;
  chapterNumber: number;
  blueprint?: ChapterBlueprint;
  previousSummaries: ChapterSummary[];

  text: string;              // 현재 버전 — 각 에이전트가 직접 mutation
  snapshots: Snapshot[];     // 버전 히스토리 (롤백용)
  bestScore: number;

  ruleIssues: RuleIssue[];   // RuleGuard가 탐지한 문제 (Critic 힌트용)
  critiqueHistory: CriticReport[];
  totalUsage: TokenUsage;
}

// RuleGuard가 탐지만 하고 수정하지 않은 항목
interface RuleIssue {
  type: "ending_repeat" | "sentence_start_repeat" | "banned_expression";
  position: number;          // 문단 번호 (0-indexed)
  detail: string;            // "~였다 3연속" 등
}

interface Snapshot {
  text: string;
  score: number;
  iteration: number;         // 스냅샷이 저장된 루프 번째 (Surgeon 패치 직전에 저장)
}

// 공유 상태 규칙:
// - 각 에이전트는 ctx 객체를 직접 변경(mutation)한다.
// - 파이프라인 러너는 반환값 없이 동일한 ctx 레퍼런스를 순서대로 전달한다.
// - 스냅샷 롤백 시 ctx.text를 직접 덮어쓴다.
interface PipelineAgent {
  name: string;
  run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent>;
}
```

### 파이프라인 러너

```typescript
async function* runChapterLifecycle(options: ChapterLifecycleOptions) {
  const ctx = buildInitialContext(options);

  const pipeline: PipelineAgent[] = [
    new WriterAgent(),
    new RuleGuardAgent(),
    new QualityLoop(),
    new PolisherAgent(),
  ];

  for (const agent of pipeline) {
    yield* agent.run(ctx);
  }

  // Summary 추출 + 완료 이벤트
  const summary = extractSummaryRuleBased(ctx.chapterNumber, title, ctx.text);
  yield { type: "complete", summary, final_score: ctx.bestScore };
  yield { type: "done" };
}
```

## Agents

### 1. WriterAgent

**역할**: 초고 생성 + 자기검토

**Phase 1 — 초고 생성** (현재 로직 유지):
- 장르별 시스템 프롬프트 (`writer-system-prompt.ts`)
- `buildChapterContext()` 또는 `buildBlueprintContext()`로 맥락 구성
- 분량 부족 시 이어쓰기 (MAX_CONTINUATIONS: 2)

**Phase 2 — 자기검토** (NEW):
- Writer가 자기 초고를 한 번 점검
- 프롬프트: "방금 쓴 초고를 읽고 확인하세요: (1) 캐릭터 말투가 설정과 일치하는가 (2) 문장 구조 반복이 있는가 (3) 장면 전환이 자연스러운가. 문제가 있으면 수정한 전체 본문을 출력하세요. 문제가 없으면 `NO_CHANGES`만 출력하세요."
- `NO_CHANGES` 응답 시 ctx.text 유지, 그 외에는 출력으로 교체
- 자기검토 결과가 원본의 70% 미만 길이면 무시 (ctx.text 유지)
- 목적: Critic-Surgeon 루프 횟수를 줄여 토큰 절약

**분량 체크**: Writer 내부에서 Phase 1 완료 후 분량 체크 + 이어쓰기까지 처리 (현재 chapter-lifecycle.ts의 기존 로직과 동일). RuleGuard에서 역방향으로 Writer를 호출하지 않음.

**출력**: Writer 스트리밍은 UI에 보이지 않음 (현재와 동일). stage_change만 emit.

### 2. RuleGuardAgent

**역할**: 객관적 검증 + 자동 수정 (LLM 불필요, 비용 0)

**처리 항목**:

| 항목 | 방법 | 처리 |
|------|------|------|
| 메타 마커 제거 | 정규식 | `--- 수정 대상 ---`, `수정:`, 편집 코멘트 자동 삭제 |
| 문단 중복 탐지 | prefix 50자 비교 | 중복 문단 자동 제거 |
| 분량 체크 | char count | Writer가 이미 처리. RuleGuard에서는 체크하지 않음 |
| 어미 3연속 | 정규식 | 탐지만 (수정은 Critic→Surgeon에 위임) |
| 문장 시작 반복 | 정규식 | 탐지만 |
| 금지 표현 | 패턴 매칭 | 탐지만 |

RuleGuard가 탐지만 하는 항목은 `ctx.ruleIssues`에 저장 → Critic에게 힌트로 전달.

**핵심**: 마커 누출 문제를 근본적으로 차단. Surgeon 출력에도 항상 적용.

### 3. CriticAgent (LLM)

**역할**: 품질 평가 + 문제 범위 지정

**평가 차원 5개**:

| 차원 | 설명 | 가중치 |
|------|------|--------|
| narrative | 서사/개연성/동기 부재/갑작스러운 전개 | 0.25 |
| characterVoice | 캐릭터별 말투/어휘 레지스터 일관성 | 0.25 |
| rhythm | 문장 리듬 (긴장↔이완 매칭), 밀도 균일성 탈피 | 0.20 |
| hookEnding | 챕터 라스트 2~3줄의 훅 강도 | 0.15 |
| immersion | AI 티 안 나는지, 오글거림 정도 | 0.15 |

**출력 형식**:

```typescript
interface CriticReport {
  overallScore: number;               // 0~1 (가중 평균)
  dimensions: Record<string, number>; // 차원별 점수
  issues: CriticIssue[];
}

interface CriticIssue {
  startParagraph: number;   // 시작 문단 번호 (0-indexed)
  endParagraph: number;     // 끝 문단 번호
  category: string;         // "characterVoice" | "rhythm" | "cliche" | "narrative" | "repetition"
  description: string;      // "김태호의 대사가 너무 정중함. 건달 출신답게 거칠게"
  severity: "critical" | "major" | "minor";
  suggestedFix: string;     // "반말+은어 섞어서 수정"
}
```

**두 가지 모드**:
- `evaluate(ctx)`: 전체 분석 + 이슈 목록 (루프 시작 시)
- `quickScore(ctx)`: 전체 텍스트를 입력하되 5개 차원 점수만 JSON으로 반환 (max_tokens 200 이하). 반환 타입은 `{ dimensions: Record<string, number> }`. 내부에서 evaluate()와 동일한 가중치(narrative 0.25, characterVoice 0.25, rhythm 0.20, hookEnding 0.15, immersion 0.15)로 가중 평균을 계산해 `number`로 반환. Surgeon 수정 후 롤백 판단용.

**Critic 안전장치**:
- Critic이 존재하지 않는 문단 번호를 반환하면 해당 이슈 무시 (out-of-bounds 체크)
- JSON 파싱 실패 시 최대 1회 재시도, 그래도 실패하면 루프 종료

**RuleGuard 힌트 활용**: `ctx.ruleIssues`가 있으면 Critic 프롬프트에 포함하여 탐색 범위 좁힘.

**반복 탐지 기준** (Critic 프롬프트에 포함):
1. 동일 감정/상황을 다른 표현으로 2번 이상 서술
2. 같은 행동 비트 반복 (입술 깨물기, 주먹 쥐기 등)
3. 같은 구조의 비유 반복

### 4. SurgeonAgent

**역할**: Critic이 지정한 범위만 정밀 수정

**입력**: CriticIssue (범위 + 수정 지시)
**출력**: 수정된 텍스트 (해당 범위만)

**프롬프트 설계** (마커 없는 자연어):

```
아래 구간을 수정하세요.

문맥 (수정하지 마세요):
{이전 문단}

수정할 부분:
{대상 문단들}

문맥 (수정하지 마세요):
{다음 문단}

수정 이유: {issue.description}
방향: {issue.suggestedFix}

수정된 부분만 출력하세요. 다른 텍스트 없이.
```

**안전장치**:
- 출력 길이가 원본의 50% 미만이거나 빈 문자열이면 패치 무시
- 출력에 RuleGuard.sanitize() 항상 적용 (마커 제거)
- 이슈는 순차 처리 (인접 문단 동시 수정 방지)
- 각 패치 적용 후 텍스트를 재파싱하여 문단 목록 갱신. 나머지 이슈의 문단 번호는 텍스트 재파싱 결과 기준으로 재탐색 (offset 보정이 아닌 재인덱싱)

### 5. PolisherAgent

**역할**: 최종 문체 통일

**처리 항목**:
- 어미 반복 제거 (RuleGuard가 탐지한 것 + 추가)
- 문장 리듬 조절 (긴장 장면: 짧게, 감정 장면: 길게)
- 캐릭터 말투 미세 조정
- Critic의 minor 이슈 처리

**프롬프트 핵심 지시**: "내용과 스토리는 절대 바꾸지 마세요. 문체만 다듬으세요."

**LLM 기반**: Polisher는 LLM을 사용하며, 마지막 CriticReport의 minor 이슈를 프롬프트에 포함한다.

**실행 조건**: 항상 1회만 실행 (반복 없음).

## Quality Loop

### 흐름

```
1. Critic.evaluate(ctx) → report
2. report.overallScore >= 0.85? → YES → 종료
3. actionable = report.issues.filter(severity != "minor")
4. actionable.length === 0? → YES → 종료
5. 스냅샷 저장 (text + score)
6. Surgeon이 actionable 이슈 순차 수정
7. RuleGuard.sanitize() 적용
8. Critic.quickScore(ctx) → newScore
9. newScore < prevScore? → YES → 최고 스냅샷으로 롤백 → 종료
10. iteration >= 5? → YES → 종료
11. → 1번으로
```

### 롤백 전략 (우선순위 순서)

1. **이슈별 롤백** (패치 직후): Surgeon 출력이 원본의 50% 미만이거나 빈 문자열이면 해당 패치만 무시하고 다음 이슈로 진행
2. **반복별 롤백** (이터레이션 내 모든 패치 완료 후): quickScore가 이전 점수보다 낮으면 해당 이터레이션의 모든 패치를 되돌림 (스냅샷에서 복구)
3. **최종 보장**: 루프 종료 시 항상 bestScore에 해당하는 스냅샷 텍스트 사용

**초기 bestScore 설정**: Quality Loop 진입 시 첫 Critic.evaluate() 결과를 bestScore로 설정하고, 이 시점에 iteration=0으로 첫 스냅샷을 저장한다. 이후 흐름 5번 단계의 "스냅샷 저장"은 iteration=1부터 시작하며 Surgeon 패치 직전에 저장된다.

## File Changes

### 삭제

| 파일 | 이유 |
|------|------|
| `agents/editor-agent.ts` | Writer self-review + Surgeon으로 대체 |
| `agents/segment-editor.ts` | Surgeon으로 대체 (마커 누출 원인 제거) |
| `agents/improver.ts` | Quality Loop로 대체 |
| `evaluators/issue-locator.ts` | Critic이 직접 범위 지정 |
| `evaluators/hybrid-evaluator.ts` | Critic으로 통합 |
| `evaluators/llm-evaluator.ts` | Critic으로 통합 |
| `prompts/editor-system-prompt.ts` | 에디터 삭제에 따라 |

### 유지

| 파일 | 용도 |
|------|------|
| `agents/segmenter.ts` | Surgeon이 문단 분할/재조립에 재활용 |
| `agents/llm-agent.ts` | LLM 호출 인프라 (Critic, Surgeon, Polisher 공통) |
| `agents/token-tracker.ts` | 토큰 추적 |
| `evaluators/style.ts` | RuleGuard로 이동 (룰 기반 체크) |
| `evaluators/pacing.ts` | RuleGuard로 이동 (룰 기반 체크) |
| `evaluators/consistency.ts` | 객관적 체크만 RuleGuard로 이동 |
| `evaluators/summary.ts` | 요약 추출 (변경 없음) |
| `prompts/writer-system-prompt.ts` | Writer용 (self-review 프롬프트 추가) |

### 신규

| 파일 | 역할 |
|------|------|
| `agents/pipeline.ts` | PipelineAgent 인터페이스 + 러너 |
| `agents/writer-agent.ts` | Writer (기존 lifecycle에서 분리) |
| `agents/rule-guard.ts` | RuleGuard (기존 evaluators 통합) |
| `agents/critic-agent.ts` | Critic (LLM 평가) |
| `agents/surgeon-agent.ts` | Surgeon (범위 수정) |
| `agents/polisher-agent.ts` | Polisher (문체 마무리) |
| `agents/quality-loop.ts` | Critic↔Surgeon 반복 로직 |
| `prompts/critic-prompt.ts` | Critic 시스템 프롬프트 |
| `prompts/surgeon-prompt.ts` | Surgeon 프롬프트 빌더 |
| `prompts/polisher-prompt.ts` | Polisher 시스템 프롬프트 |

### 리팩터

| 파일 | 변경 |
|------|------|
| `agents/chapter-lifecycle.ts` | 모놀리식 → 얇은 파이프라인 러너 (파이프라인 조립 + summary 추출만) |

## UI/API Compatibility

**변경 없음**:
- `LifecycleEvent` 타입 유지 (stage_change, chunk, patch, evaluation, done)
- `stage` 값 추가: `"critiquing"`, `"surgery"`, `"polishing"`, `"rule_check"`
- `runChapterLifecycle()` 함수 시그니처 동일
- 프론트엔드 `useStreamingGeneration` 수정 불필요

## Testing Strategy

| 종류 | 대상 | 핵심 검증 |
|------|------|----------|
| Unit | RuleGuard | 마커 제거, 중복 문단 탐지, 어미 반복 탐지 |
| Unit | CriticAgent | JSON 응답 파싱, 점수 계산, 차원별 가중치 |
| Unit | SurgeonAgent | 범위 수정 후 전체 텍스트 재조립 |
| Unit | PolisherAgent | 내용 불변 + 문체만 변경 |
| Integration | QualityLoop | 점수 개선 시 계속, 하락 시 롤백, 상한 5회 |
| Integration | Full Pipeline | Writer→RuleGuard→Loop→Polisher 전체 흐름 |
| Unit | WriterAgent | 자기검토 NO_CHANGES 처리, 자기검토 결과 70% 미만 시 무시 |
| E2E | 1화 생성 | 마커 누출 없음, 문단 중복 없음, 품질 기준 충족 |

## Edge Cases

| 케이스 | 처리 방법 |
|--------|----------|
| Critic이 존재하지 않는 문단 번호 반환 | 해당 이슈 무시 (bounds check) |
| Surgeon이 빈 문자열 반환 | 50% 미만 체크에 의해 패치 무시 |
| 5회 모두 점수 하락 (첫 텍스트가 최선) | 초기 스냅샷으로 복구 (bestScore 보장) |
| Writer 자기검토 결과가 원본보다 짧음 | 70% 미만이면 무시 |
| Critic JSON 파싱 실패 | 1회 재시도, 그래도 실패하면 루프 종료 |
| Polisher가 내용을 변경 | 테스트에서 검증 (내용 불변 + 문체만 변경) |
