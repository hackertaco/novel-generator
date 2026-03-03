# Kakao Novel Generator

카카오페이지 스타일 한국 웹소설 자동 생성기

## 개요

`ouroboros-ai`를 활용하여 플롯 승인 후 장편 웹소설을 자동 생성합니다.

## 특징

- **Phase 0 플롯 생성**: 아이디어 → 세계관/캐릭터/줄거리 자동 생성 → 승인
- **컨텍스트 관리**: 300화 이상 장편에서도 일관성 유지
  - 구조화된 회차 요약
  - 캐릭터 상태 추적
  - 복선 심기/회수 스케줄링
- **카카오페이지 스타일**: 짧은 문단, 대사 중심, 후킹 엔딩
- **품질 검증**: 스타일/일관성 자동 평가

## 설치

```bash
uv pip install -e .
```

## 사용법

```bash
# 1. 새 소설 초기화 (Phase 0: 플롯 생성)
novel init "회귀한 천재 검사의 복수극"

# 2. 상태 확인
novel status

# 3. 챕터 생성
novel generate --chapters 10

# 4. 품질 평가
novel evaluate 1
```

## 아키텍처

```
사용자 아이디어
     ↓
[Phase 0: Big Bang] ← ouroboros-ai
├── 소크라테스식 질문으로 아이디어 구체화
├── 세계관, 캐릭터, 플롯 아크 생성
├── 복선 타임라인 확정
└── 사용자 승인
     ↓
[State Store]
├── seed.yaml (승인된 설정)
├── character_states.json (캐릭터 상태)
└── summaries/ (회차별 요약)
     ↓
[Chapter Generation Loop]
├── Context Builder (필요한 정보만 조립)
├── Generate (ouroboros Double Diamond)
├── Evaluate (스타일 + 일관성)
├── Extract Summary (구조화된 요약)
└── Update State
     ↓
output/chapters/
├── 001_제목.txt
├── 002_제목.txt
└── ...
```

## 스키마

### NovelSeed (Phase 0 산출물)

```yaml
title: "회귀한 천재 검사"
total_chapters: 300
world:
  genre: 현대 판타지
  sub_genre: 회귀
characters:
  - id: mc
    name: 강현우
    voice:
      tone: "냉소적, 하지만 속정 있음"
      speech_patterns: ["~하지", "...그래서?"]
      sample_dialogues:
        - "또 이 꼴이군. 지겹다, 진짜."
arcs:
  - id: arc_1
    name: 귀환편
    start_chapter: 1
    end_chapter: 50
foreshadowing:
  - id: ring_secret
    name: 검은 반지의 비밀
    planted_at: 12
    hints_at: [20, 30, 40]
    reveal_at: 45
```

## TODO

- [ ] ouroboros-ai Phase 0 통합
- [ ] LLM 기반 요약 추출
- [ ] 배치 생성 모드
- [ ] 비용 추적

## 라이선스

MIT
