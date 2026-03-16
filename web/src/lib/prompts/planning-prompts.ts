// src/lib/prompts/planning-prompts.ts
import type { NovelSeed } from "@/lib/schema/novel";
import type { PartPlan, ArcPlan } from "@/lib/schema/planning";

/**
 * L1: Master Plan — analyze seed's world complexity and derive part structure.
 */
export function getMasterPlanPrompt(seed: NovelSeed): string {
  const worldInfo = `
세계관: ${seed.world.name}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
시대: ${seed.world.time_period}
능력 체계: ${seed.world.magic_system || "없음"}
주요 장소: ${Object.entries(seed.world.key_locations).map(([k, v]) => `${k}: ${v}`).join(", ")}
진영: ${Object.entries(seed.world.factions).map(([k, v]) => `${k}: ${v}`).join(", ")}
세계 규칙: ${seed.world.rules.join("; ")}`;

  const characterInfo = seed.characters
    .map((c) => `- ${c.name} (${c.role}): ${c.arc_summary}`)
    .join("\n");

  const existingArcs = seed.arcs
    .map((a) => `- ${a.name} (${a.start_chapter}~${a.end_chapter}): ${a.summary}`)
    .join("\n");

  return `당신은 한국 웹소설 기획 전문가입니다. 다음 소설 설정을 분석하고, 세계관 규모에 맞는 전체 구조를 설계해주세요.

## 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}

## 세계관
${worldInfo}

## 캐릭터 (${seed.characters.length}명)
${characterInfo}

## 기존 아크 구상 (참고용)
${existingArcs}

## 지시사항

1. **세계관 복잡도 분석**: 진영 수, 장소 수, 능력 체계 깊이, 서브플롯 수를 파악
2. **적정 편수 산출**: 이 세계관과 스토리를 완결하는 데 필요한 편수 범위 (min~max)
   - 진영이 많으면 각 진영의 스토리가 필요 → 편수 증가
   - 능력 체계가 깊으면 성장 과정이 길어짐 → 편수 증가
   - 서브플롯이 많으면 병렬 전개 필요 → 편수 증가
3. **대막(Part) 분할**: 스토리의 자연스러운 큰 단위 (각 50~70화)
   - 각 대막의 테마, 핵심 갈등, 도달점
   - 대막 간 전환점 (왜 이야기가 다음 단계로 넘어가는지)
4. **글로벌 복선**: 대막을 넘어서는 장기 복선

## 출력 형식 (JSON)

\`\`\`json
{
  "estimated_total_chapters": { "min": 200, "max": 280 },
  "world_complexity": {
    "faction_count": 5,
    "location_count": 12,
    "power_system_depth": "deep",
    "subplot_count": 4
  },
  "parts": [
    {
      "id": "part_1",
      "name": "각성편",
      "start_chapter": 1,
      "end_chapter": 60,
      "theme": "평범한 일상에서 비범한 세계로",
      "core_conflict": "자신의 능력을 받아들이고 살아남기",
      "resolution_target": "첫 번째 대규모 위기를 넘기고 동료를 얻는다",
      "estimated_chapter_count": 60,
      "arcs": [],
      "transition_to_next": "새로운 세력의 등장으로 더 큰 세계가 열린다"
    }
  ],
  "global_foreshadowing_timeline": [
    {
      "id": "gfs_1",
      "plant_part": "part_1",
      "reveal_part": "part_3",
      "description": "주인공의 진짜 정체에 대한 단서"
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;
}

/**
 * L2: Arc Planning — expand a Part into detailed Arcs.
 */
export function getArcPlanPrompt(
  seed: NovelSeed,
  part: PartPlan,
  previousPartSummary?: string,
): string {
  return `당신은 한국 웹소설 기획 전문가입니다. 대막을 아크(호)로 분할해주세요.

## 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}

## 대막 정보
${part.name} (${part.start_chapter}~${part.end_chapter}화, 약 ${part.estimated_chapter_count}화)
테마: ${part.theme}
핵심 갈등: ${part.core_conflict}
도달점: ${part.resolution_target}
${previousPartSummary ? `\n## 이전 대막 요약\n${previousPartSummary}` : ""}

## 캐릭터
${seed.characters.map((c) => `- ${c.name} (${c.role}): ${c.arc_summary}`).join("\n")}

## 지시사항

이 대막을 8~12화 단위의 아크로 분할하세요:
1. 각 아크의 테마와 핵심 사건 3~5개
2. 긴장도 커브 (아크 내 각 화의 1-10 텐션)
3. 클라이맥스 위치
4. 아크 간 전환이 자연스럽도록
5. **신규 캐릭터**: 이 대막에서 새로 등장해야 할 캐릭터가 있다면 제안 (이름, 역할, 등장 아크, 성격 핵심)

## 출력 형식 (JSON)

\`\`\`json
{
  "arcs": [
    {
      "id": "arc_${part.id}_1",
      "name": "던전 발견",
      "part_id": "${part.id}",
      "start_chapter": ${part.start_chapter},
      "end_chapter": ${part.start_chapter + 9},
      "summary": "주인공이 숨겨진 던전을 발견하고...",
      "theme": "호기심과 공포",
      "key_events": ["던전 발견", "첫 전투", "보스 조우"],
      "climax_chapter": ${part.start_chapter + 8},
      "tension_curve": [3, 4, 5, 5, 6, 7, 6, 8, 9, 7],
      "chapter_blueprints": []
    }
  ],
  "new_characters": [
    {
      "id": "mentor_1",
      "name": "이름",
      "role": "멘토",
      "introduction_arc": "arc_${part.id}_2",
      "voice": {
        "tone": "말투 설명",
        "speech_patterns": ["특징적 어미"],
        "sample_dialogues": ["예시 대사 1", "예시 대사 2"],
        "personality_core": "핵심 성격"
      },
      "backstory": "배경",
      "arc_summary": "이 캐릭터의 역할과 성장"
    }
  ]
}
\`\`\`

**신규 캐릭터 기준**: 스토리 전개상 기존 캐릭터만으로는 부족할 때. 새로운 갈등, 새로운 세력, 새로운 관계가 필요하면 추가. 대막당 1~3명 정도가 적당.

JSON만 출력하세요.`;
}

/**
 * L3: Chapter Blueprint — expand an Arc into per-chapter scene plans.
 */
export function getChapterBlueprintPrompt(
  seed: NovelSeed,
  arc: ArcPlan,
  previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>,
): string {
  const recentSummaries = previousChapterSummaries.slice(-5);

  return `당신은 한국 웹소설 기획 전문가입니다. 아크 내 각 화의 세부 블루프린트를 작성해주세요.

## 소설 정보
제목: ${seed.title}
장르: ${seed.world.genre} / ${seed.world.sub_genre}

## 아크 정보
${arc.name} (${arc.start_chapter}~${arc.end_chapter}화)
테마: ${arc.theme}
요약: ${arc.summary}
핵심 사건: ${arc.key_events.join(", ")}
클라이맥스: ${arc.climax_chapter}화
텐션 커브: ${arc.tension_curve.join(", ")}

## 캐릭터
${seed.characters.map((c) => `- ${c.name} (${c.role}): ${c.voice.tone}`).join("\n")}

## 활성 복선
${seed.foreshadowing
  .filter((fs) => fs.planted_at <= arc.end_chapter && (fs.reveal_at ?? Infinity) >= arc.start_chapter)
  .map((fs) => `- ${fs.name}: ${fs.description} (심기:${fs.planted_at}, 회수:${fs.reveal_at ?? "미정"})`)
  .join("\n") || "없음"}

${recentSummaries.length > 0 ? `## 이전 내용 요약\n${recentSummaries.map((s) => `- ${s.chapter}화: ${s.summary}`).join("\n")}` : ""}

## 지시사항

${arc.start_chapter}화부터 ${arc.end_chapter}화까지 각 화의 블루프린트를 작성하세요:
1. **씬 구성**: 각 씬의 목적, 타입, 예상 분량
2. **감정선**: 화 내에서의 감정 흐름
3. **의존 관계**: 이전 화에서 뭘 넘겨받는지
4. **목표 분량**: 씬들의 합산 (보통 3000~5000자)
5. **복선 처리**: 해당 화에서 심기/힌트/회수할 복선
6. **전개 속도 조절 (매우 중요)**:
   - **아크 첫 1~2화**: 씬 1~2개만. key_points 1~2개. "보여주기"가 전부. 사건을 시작하지 마세요.
     ❌ 첫 화에 "계약 서명", "저주 발견", "적과 조우" → 이건 아크 후반에 배치
     ✅ 첫 화에 "일상 속 불안", "낯선 시선", "의미심장한 대화 한마디" → 이 정도로 충분
   - **아크 중반 (3~6화)**: 씬 2~3개. 갈등의 씨앗이 자라지만 아직 폭발하지 않음.
   - **아크 후반 (7화~)**: 씬 3~4개. 핵심 사건과 클라이맥스. 계약, 각성, 대결 등 큰 사건은 여기.
   - 한 화에 플롯 전환(새로운 사건 발생)은 최대 1~2번. 그 이상은 독자가 따라가지 못함.
   - **핵심 원칙**: 아크 총 10화라면, 7화까지는 "분위기+관계+전조"이고 8~10화가 "사건+클라이맥스"입니다.
7. **캐릭터 도입 페이싱**:
   - 아크 첫 화: 주인공 + 최대 1~2명만
   - 새 캐릭터는 한 화에 1명씩만. characters_involved에 3명 이하로 제한

씬 타입: action, dialogue, introspection, exposition, hook, flashback, transition

## 출력 형식 (JSON)

\`\`\`json
{
  "chapter_blueprints": [
    {
      "chapter_number": ${arc.start_chapter},
      "title": "화 제목",
      "arc_id": "${arc.id}",
      "one_liner": "한 줄 요약",
      "role_in_arc": "setup",
      "scenes": [
        {
          "purpose": "주인공이 던전 입구에서 수상한 기운을 감지한다",
          "type": "action",
          "characters": ["mc"],
          "estimated_chars": 1500,
          "emotional_tone": "긴장"
        },
        {
          "purpose": "동료와의 전략 논의",
          "type": "dialogue",
          "characters": ["mc", "companion_1"],
          "estimated_chars": 1000,
          "emotional_tone": "진지"
        },
        {
          "purpose": "클리프행어 - 예상치 못한 존재의 등장",
          "type": "hook",
          "characters": ["mc"],
          "estimated_chars": 500,
          "emotional_tone": "충격"
        }
      ],
      "dependencies": [],
      "emotional_arc": "긴장→진지→충격",
      "key_points": ["던전 진입", "전략 수립"],
      "characters_involved": ["mc", "companion_1"],
      "tension_level": 5,
      "foreshadowing_actions": [{"id": "fs_1", "action": "plant"}]
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;
}
