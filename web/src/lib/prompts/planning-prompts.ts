// src/lib/prompts/planning-prompts.ts
import type { NovelSeed } from "@/lib/schema/novel";
import { getActiveThreadsForChapter, formatThreadRevealsForPrompt } from "@/lib/schema/novel";
import type { PartPlan, ArcPlan } from "@/lib/schema/planning";
import type { DirectionDesign } from "@/lib/schema/direction";
import {
  getInfoBudgetForChapter,
  getEmotionTargetForChapter,
  formatInfoBudgetForPrompt,
  formatEmotionTargetForPrompt,
} from "@/lib/schema/direction";

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
3. **대막(Part) 분할 — 반드시 3~5개!**: 스토리의 자연스러운 큰 단위 (각 50~70화)
   - ⚠️ **parts 배열에 반드시 3개 이상의 대막을 넣으세요!** 1~2개만 넣으면 안 됩니다!
   - 각 대막의 테마, 핵심 갈등, 도달점
   - 대막 간 전환점 (왜 이야기가 다음 단계로 넘어가는지)
   - 예: Part1(1~60화) 각성편, Part2(61~130화) 성장편, Part3(131~200화) 전쟁편, Part4(201~300화) 완결편
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
  previousChapterEnding?: string,
  endingSceneState?: {
    time_of_day: string;
    location: string;
    characters_present: string[];
    ongoing_action: string;
    unresolved_tension: string;
  } | null,
  targetChapter?: number,
  directionDesign?: DirectionDesign,
): string {
  const recentSummaries = previousChapterSummaries.slice(-5);

  // Direction design context (info budget + emotion target for this chapter)
  let directionSection = "";
  if (directionDesign) {
    const chapterNum = targetChapter ?? arc.start_chapter;
    const dirParts: string[] = [];

    const infoBudget = getInfoBudgetForChapter(directionDesign, chapterNum);
    if (infoBudget) {
      dirParts.push(`### 정보 예산 (이 화의 정보 공개 제한)\n${formatInfoBudgetForPrompt(infoBudget)}`);
    }

    const emotionTarget = getEmotionTargetForChapter(directionDesign, chapterNum);
    if (emotionTarget) {
      dirParts.push(`### 감정 목표\n${formatEmotionTargetForPrompt(emotionTarget)}`);
    }

    if (dirParts.length > 0) {
      directionSection = `\n## 연출 설계 (반드시 반영)\n${dirParts.join("\n\n")}\n`;
    }
  }

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

## 스토리 스레드
${(seed.story_threads || []).map((t) => {
  const relStr = (t.relations || []).map((r) => `  ${r.relation} → ${r.target}: ${r.description}`).join("\n");
  return `- ${t.type === "main" ? "🔴" : "🔵"} ${t.name}: ${t.description}${relStr ? "\n" + relStr : ""}`;
}).join("\n") || "미정"}

## 이 화에서의 감정/비밀 공개 상태
${(() => {
  const chapterNum = targetChapter ?? arc.start_chapter;
  const activeReveals = getActiveThreadsForChapter(seed.story_threads || [], chapterNum);
  const formatted = formatThreadRevealsForPrompt(activeReveals);
  return formatted || "해당 화에 활성 스레드 없음";
})()}

## 챕터 아웃라인 (what/why)
${(() => {
  // Detailed outlines (chapters 1-10 typically)
  const detailed = seed.chapter_outlines
    .filter((o) => o.chapter_number >= arc.start_chapter && o.chapter_number <= arc.end_chapter)
    .map((o) => {
      const points = o.key_points.map((p) => {
        if (typeof p === "string") return p;
        const parts: string[] = [p.what];
        if (p.why) parts.push(`이유: ${p.why}`);
        if (p.caused_by) parts.push(`원인: ${p.caused_by}`);
        if (p.consequence) parts.push(`결과: ${p.consequence}`);
        if (p.prerequisite) parts.push(`전제: ${p.prerequisite}`);
        if (p.requires_items?.length) parts.push(`소품: ${p.requires_items.join(", ")}`);
        if (p.returning_character) parts.push(`재등장: ${p.returning_character}`);
        if (p.reveal === "delayed") parts.push("[서스펜스 — 아직 밝히지 않음]");
        return parts.join(" | ");
      }).join("; ");
      const threads = (o.advances_thread || []).join(", ");
      const infoStr = o.new_info_for_reader ? ` 📌 ${o.new_info_for_reader}` : "";
      const itemsStr = o.recurring_items?.length ? ` 🔄 ${o.recurring_items.join(", ")}` : "";
      return `- ${o.chapter_number}화: ${o.one_liner}${threads ? ` [${threads}]` : ""}${points ? ` | ${points}` : ""}${infoStr}${itemsStr}`;
    });
  // Extended outlines (lightweight, for chapters beyond the detailed set)
  const detailedChapters = new Set(seed.chapter_outlines.map((o) => o.chapter_number));
  const extended = (seed.extended_outlines || [])
    .filter((o) => o.chapter_number >= arc.start_chapter && o.chapter_number <= arc.end_chapter && !detailedChapters.has(o.chapter_number))
    .map((o) => {
      const reveals = (o.reveals || []).join(", ");
      return `- ${o.chapter_number}화: ${o.one_liner}${reveals ? ` [진전: ${reveals}]` : ""}`;
    });
  return [...detailed, ...extended].join("\n") || "아웃라인 없음";
})()}

## 캐릭터
${seed.characters.map((c) => `- ${c.name} (${c.role}${c.social_rank ? `/${c.social_rank}` : ""}): ${c.voice.tone}`).join("\n")}

## 활성 복선
${seed.foreshadowing
  .filter((fs) => fs.planted_at <= arc.end_chapter && (fs.reveal_at ?? Infinity) >= arc.start_chapter)
  .map((fs) => `- ${fs.name}: ${fs.description} (심기:${fs.planted_at}, 회수:${fs.reveal_at ?? "미정"})`)
  .join("\n") || "없음"}

${recentSummaries.length > 0 ? `## 이전 내용 요약\n${recentSummaries.map((s) => `- ${s.chapter}화: ${s.summary}`).join("\n")}` : ""}
${directionSection}
${endingSceneState ? `## ⚠️ 직전 화 종료 시점 상태 (다음 화는 반드시 이 상태에서 이어져야 합니다!)
- 시간: ${endingSceneState.time_of_day}
- 장소: ${endingSceneState.location}
- 그 자리에 있던 인물: ${endingSceneState.characters_present.join(", ") || "불명"}
- 진행 중이던 상황: ${endingSceneState.ongoing_action}
- 미해결 긴장: ${endingSceneState.unresolved_tension}

### 연속성 규칙 (위반 시 치명적 결함!)
1. 다음 화 첫 씬은 위 상황의 **직후**여야 합니다. 시간을 건너뛰지 마세요.
2. 첫 씬 캐릭터는 위 인물만 포함하세요. 새 인물은 반드시 "등장하는 순간" 씬을 별도로 만드세요.
3. 이미 다룬 사건을 반복하지 마세요. 위 상황에서 이어서 전개하세요.
4. 시간대가 바뀌려면 시간 경과를 명시하는 씬이 필요합니다.` : ""}

${previousChapterEnding && !endingSceneState ? `## ⚠️ 직전 화 마지막 장면 (연속성 필수!)
${previousChapterEnding}

위 장면에 등장한 인물만 다음 화 첫 씬에 포함하세요.
새 인물이 등장하려면 반드시 "도착/등장하는 순간"을 씬으로 만들어야 합니다.
이미 그 자리에 있던 것처럼 배치하면 안 됩니다.` : ""}

## 1화 구성 원칙 (매우 중요)
1화는 독자가 이 소설을 계속 읽을지 결정하는 화입니다.
- 세계관 설명은 행동/대화 속에 자연스럽게 녹이세요 (설명문 금지)
- 주인공의 매력(능력, 성격, 처지)을 30% 지점까지 보여주세요
- 사건은 딱 하나. 음모/복선/흑막은 2화부터.
- 1화 끝에 독자가 "이 주인공 어떻게 되는 거야?" 궁금해야 합니다
- 등장인물은 주인공 포함 3명 이내

## 지시사항

${targetChapter ?? arc.start_chapter}화의 블루프린트를 1개만 작성하세요:
1. **씬 구성**: 각 씬의 목적, 타입, 예상 분량 + **육하원칙(5W1H)**
   - ⚠️ **각 챕터에는 씬을 최대 2개까지만 배치하세요. 씬이 3개 이상이면 나머지는 다음 화로 넘기세요. 1화 = 1-2씬이 웹소설 황금 비율입니다.**
   - **purpose에는 반드시 캐릭터의 한국어 이름을 사용하세요** (ID가 아닌 이름! ❌ "char_1이" → ✅ "이수련이")
   - **purpose는 반드시 구체적으로**: "누가 무엇을 하고, 그 결과 어떤 변화가 생기는지" 포함
   - ❌ "동료와의 전략 논의" → 누가? 무슨 전략? 결론은?
   - ✅ "이수련이 시녀 루시아에게 측비의 과거 행적을 캐묻다가, 루시아가 '그날 밤 측비님이 약방에 있었다'고 실토한다"
   - ❌ "주인공이 위기를 느낀다" → 무슨 위기? 어떻게 느꼈는지?
   - ✅ "서진이 수술실에서 나오는데, 차트에 적힌 환자 이름이 7년 전 실종된 동생의 이름이다"
   - **각 씬에 5W1H 필드를 반드시 채우세요**:
     - **who**: "주체 → 상대" 형식 (예: "이수련 → 루시아")
     - **when**: 구체적 시간 맥락 (예: "계약 종료일 오후, 해가 지기 직전")
     - **where_detail**: 장소 + 감각적 디테일 1~2개 (예: "공작저 서재. 벽면 전체가 장부철, 창밖으로 겨울 정원")
     - **how**: 행동 시퀀스 3단계 (예: "서명 거부 → 청혼서를 증거로 제시 → 연회 참석 선언")
2. **감정선**: 화 내에서의 감정 흐름
3. **의존 관계**: 이전 화에서 뭘 넘겨받는지
4. **목표 분량**: 씬들의 합산 (보통 3000~5000자)
5. **복선 처리**: 해당 화에서 심기/힌트/회수할 복선
6. **전개 속도 조절 (매우 중요)**:
   - **모든 화에 사건이 있어야 한다.** "분위기만" "느낌만"인 화는 금지. 독자는 1화에서 이탈한다.
   - key_points는 반드시 **구체적 사건**(누가 무엇을 했다/발견했다/결정했다)이어야 한다.
     ❌ "세레나가 불안한 분위기를 감지한다" → 사건이 아님, 심리 묘사일 뿐
     ❌ "수상한 침묵을 느낀다", "경계 수위를 높인다" → 느낌일 뿐, 아무 일도 안 일어남
     ✅ "세레나가 계모의 서랍에서 독약 영수증을 발견한다" → 구체적 사건
     ✅ "시녀 미라가 북쪽 복도에서 황후 측근과 밀회하는 장면을 목격한다" → 구체적 사건
   - **1화**: 주인공의 상황 + 핵심 사건 1개 (독자가 "다음 화" 버튼을 눌러야 함)
   - **2~4화**: 사건이 점점 복잡해짐. 새로운 인물, 새로운 단서, 관계 변화
   - **5화~**: 갈등 심화 → 클라이맥스 → 반전
   - 한 화에 플롯 전환은 1~2번. 그 이상은 독자가 따라가지 못함.
   - **핵심 원칙**: 매 화 끝에 독자가 "그래서 어떻게 되는 거야?"라고 물을 수 있어야 한다.
7. **캐릭터 도입 페이싱**:
   - 아크 첫 화: 주인공 + 최대 1~2명만
   - 새 캐릭터는 한 화에 1명씩만. characters_involved에 3명 이하로 제한
   - **재등장 의무**: 3~4화마다 기존 인물이 재등장하여 관계가 깊어져야 합니다. 매 화가 "새 인물 만남"으로만 이루어지면 안 됩니다.
   - outline의 returning_character 필드가 있으면 해당 인물을 반드시 씬에 배치하세요.
   - outline의 recurring_items 필드가 있으면 해당 소품이 씬에서 사용되어야 합니다.
   - outline의 new_info_for_reader 필드가 있으면 그 정보를 이 화의 must_reveal로 변환하세요. 그 외 정보는 보류.
8. **시점(POV) 지정**:
   - **pov**: "first" (1인칭) 또는 "third" (3인칭). 미지정 시 "third"로 간주
   - **pov_character**: 시점 인물의 이름. 1인칭이면 화자, 3인칭이면 초점 인물
   - 한 챕터 안에서 시점이 바뀌면 안 됩니다
9. **재미 요소 (선택, 가능하면 채우세요)**:
   - **curiosity_hook**: 이 챕터에서 독자가 궁금해할 핵심 질문 1개 (예: "왜 죽은 형의 목소리가 던전에서 들리는가?")
   - **emotional_peak_position**: 감정이 가장 고조되는 위치 (0~1). role_in_arc에 따라:
     - setup/transition: 0.5 (중반)
     - rising_action/escalation: 0.8 (후반)
     - climax: 0.7 (클라이맥스 직전)
     - falling_action/resolution: 0.5 (중반)
   - **cliffhanger_type**: 챕터 끝 타입 — "question"(미스터리/추리), "crisis"(위기 상황), "revelation"(충격 폭로), "twist"(예상 뒤집기)
10. **긴장도 커브 (tension_level 1-10, 필수)**:
   각 챕터에 tension_level (1-10)을 지정하세요:
   - 1화: 3-4 (소개, 일상에서 사건 암시)
   - 초반부: 4-6 (갈등 시작, 점진적 상승)
   - 중반부: 6-8 (위기, 반전, 갈등 심화)
   - 클라이맥스: 9-10 (절정, 최대 위기)
   - 결말: 5-7 (해결, 여운)
   - 절대 금지: 같은 tension_level 3화 연속 (서사 루프)

11. **긴장 장치 (tension_device)**: 매 챕터에 tension_device를 지정하세요. 연속 2챕터에 같은 장치를 쓰지 마세요.
   - 선택지: door_threat, document, deadline, witness, betrayal, discovery, confrontation
12. **물리적 행동 (action_beat)**: action_beat에 이 챕터의 핵심 물리적 행동을 적으세요.
   - 예: "리세가 시종 통로로 도주한다", "준혁이 던전 2층으로 내려간다"
   - 매 챕터에 물리적 행동이 최소 1번 포함되어야 합니다.

씬 타입: action, dialogue, introspection, exposition, hook, flashback, transition

## 챕터 구조 다양성 (필수)

1. 주인공 능동성: 매 챕터에서 주인공은 반드시 하나의 "능동적 선택"을 합니다.
   - ❌ "리아는 위험에 처한다" (수동 — 일이 일어남)
   - ✅ "리아는 혼약서를 찢고 비밀문으로 도망친다" (능동 — 직접 행동)
   - 씬의 핵심에 "주인공이 ~한다"를 반드시 넣으세요.

5. 우연 장치 지양: 핵심 전환점은 캐릭터의 의도에서 비롯되는 게 좋습니다.
   - 지양: "종이를 떨어뜨리고, 마침 그 자리에 있던 남주가 주워 읽는다"
   - 권장: "남주가 성녀의 행동을 수상히 여겨 직접 추궁한다"
   - 소소한 우연은 괜찮지만, 챕터의 핵심 사건이 순전한 우연에만 의존하면 안 됩니다.

6. 쉬운 이해: 세계관 설정은 한 씬에 최대 2개만 도입합니다.
   - 새 용어/능력/규칙을 한꺼번에 쏟아내면 독자가 이해를 포기합니다.
   - 핵심 설정 1개를 씬의 사건으로 체험시키는 게 나열 5개보다 낫습니다.

2. 장소 변화: 연속된 2개 챕터가 같은 장소에서 진행되면 안 됩니다.
   - Ch1이 "유모실"이면, Ch2는 반드시 다른 장소 (복도, 정원, 외부 등)
   - 장소가 바뀌면 이동 과정도 하나의 소(小)사건이 됩니다.

3. 씬 타입 순환: 연속 챕터는 다른 타입의 씬이어야 합니다.
   씬 타입 목록: 대치(confrontation), 추격(chase), 발견(discovery),
   협상(negotiation), 도주(escape), 잠입(infiltration), 폭로(revelation)
   - Ch1이 "대치"면 Ch2는 "도주"나 "발견" 등 다른 타입
   - 같은 타입 2연속 금지

4. 텐션 변조: 챕터마다 긴장의 종류가 달라야 합니다.
   - "외부 위협" → "내면 갈등" → "추격전" → "관계 변화" 식으로 순환
   - 같은 종류의 긴장 2연속 금지

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
          "purpose": "이준혁이 던전 입구에서 마나 감지기가 오작동하는 걸 발견한다. 수치가 측정 불가를 표시하고, 준혁은 장비 고장이라고 넘기려 하지만 옆 파티원이 '이상한데'라고 중얼거린다.",
          "type": "action",
          "characters": ["mc"],
          "estimated_chars": 1500,
          "emotional_tone": "긴장",
          "must_reveal": ["마나 감지기가 측정 불가를 표시함", "준혁은 장비 고장으로 넘기려 함"],
          "who": "이준혁 → 파티원",
          "when": "새벽 5시, 던전 개방 직후",
          "where_detail": "서울역 B던전 입구. 콘크리트 잔해 사이로 푸른 마나 안개가 피어오름",
          "how": "감지기 확인 → 측정 불가 표시 발견 → 장비 고장으로 넘기려 함 → 파티원의 한마디에 멈칫"
        },
        {
          "purpose": "강서연이 던전 정보를 분석하며 '이 패턴은 3년 전 서울역 붕괴 때와 같다'고 경고한다. 준혁은 무시하려 하지만 서연의 데이터를 보고 표정이 굳는다.",
          "type": "dialogue",
          "characters": ["mc", "companion_1"],
          "estimated_chars": 1000,
          "emotional_tone": "진지",
          "must_reveal": ["이 던전 패턴이 3년 전 서울역 붕괴와 동일함", "서연의 분석 데이터가 준혁의 판단을 바꿈"],
          "who": "강서연 → 이준혁",
          "when": "새벽 5시 30분, 던전 진입 직전",
          "where_detail": "던전 입구 임시 지휘소. 노트북 화면에 3년 전 데이터 그래프가 떠 있음",
          "how": "서연이 데이터 비교 → 3년 전 패턴과 일치 경고 → 준혁 무시 → 데이터 직접 확인 후 표정 변화"
        },
        {
          "purpose": "던전 안에서 이미 죽었어야 할 사람의 목소리가 들린다. 준혁의 형, 3년 전 서울역에서 사망 확인된 이도현의 목소리다.",
          "type": "hook",
          "characters": ["mc"],
          "estimated_chars": 500,
          "emotional_tone": "충격",
          "must_reveal": ["죽었다고 확인된 이도현의 목소리가 들림"],
          "who": "이준혁 (단독)",
          "when": "새벽 6시경, 던전 2층 진입 직후",
          "where_detail": "던전 2층 통로. 벽면에 3년 전 붕괴 흔적, 습기 찬 공기",
          "how": "홀로 탐색 → 익숙한 목소리 포착 → 형의 목소리임을 인식 → 얼어붙음"
        }
      ],
      "dependencies": [],
      "emotional_arc": "긴장→진지→충격",
      "key_points": [
        {"what": "준혁이 던전에 진입한다", "why": "마나 감지기 이상을 직접 확인하기 위해", "reveal": "immediate"},
        {"what": "서연이 3년 전 데이터와 일치한다고 경고", "why": "서울역 붕괴 패턴과 동일 — 이 사실은 아직 공개하면 안 됨", "reveal": "delayed", "reveal_at": 5}
      ],
      "characters_involved": ["mc", "companion_1"],
      "tension_level": 5,
      "foreshadowing_actions": [{"id": "fs_1", "action": "plant"}],
      "curiosity_hook": "왜 죽은 형의 목소리가 던전에서 들리는가?",
      "emotional_peak_position": 0.8,
      "cliffhanger_type": "revelation",
      "pov": "third",
      "pov_character": "이준혁",
      "scene_type": "discovery",
      "protagonist_action": "준혁이 마나 감지기 이상을 직접 확인하기 위해 던전에 진입한다",
      "tension_device": "discovery",
      "action_beat": "준혁이 던전 입구를 통과하여 내부로 진입한다"
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;
}
