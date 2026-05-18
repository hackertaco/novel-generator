import { describe, expect, it } from "vitest";
import { createWorldStateAuthority } from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterWorldState } from "@/lib/memory/world-state";

function makeSeed(): NovelSeed {
  return {
    title: "공유 권위 테스트",
    logline: "세라와 리안이 금고의 비밀을 추적한다.",
    total_chapters: 24,
    world: {
      name: "황궁",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        황궁: "권력의 중심",
        북회랑: "비밀 통로",
      },
      factions: {},
      rules: ["황실 금고는 이중 봉인으로 지킨다."],
    },
    characters: [
      {
        id: "hero",
        name: "세라",
        role: "주인공",
        social_rank: "noble",
        introduction_chapter: 1,
        voice: {
          tone: "차분함",
          speech_patterns: ["...그래요"],
          sample_dialogues: ["금고는 아직 열리지 않았어요."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락 귀족의 후계자",
        arc_summary: "진실을 직면한다",
        state: {
          level: null,
          location: "황궁",
          status: "normal",
          relationships: { ally: "경계" },
          inventory: ["은열쇠"],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "ally",
        name: "리안",
        role: "조력자",
        social_rank: "commoner",
        introduction_chapter: 1,
        voice: {
          tone: "직설적",
          speech_patterns: ["그러니까"],
          sample_dialogues: ["누가 먼저 다녀갔네요."],
          personality_core: "현실적이고 민첩함",
        },
        backstory: "황궁 관리",
        arc_summary: "세라를 돕는다",
        state: {
          level: null,
          location: "황궁",
          status: "normal",
          relationships: { hero: "경계" },
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
    ],
    arcs: [],
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "3인칭",
      tense: "과거형",
      formatting_rules: [],
    },
    story_threads: [],
  };
}

function makeChapterState(): ChapterWorldState {
  return {
    chapter: 2,
    facts: [
      {
        subject: "세라",
        action: "위치",
        object: "북회랑",
        chapter: 2,
      },
      {
        subject: "황실 금고",
        action: "잠겨 있음",
        object: "이중 봉인",
        chapter: 2,
      },
    ],
    character_states: [
      {
        name: "세라",
        location: "북회랑",
        physical: "차가운 벽에 손을 댄 상태",
        emotional: "결의",
        knows: ["황실 금고는 이중 봉인이다"],
        relationships: [{ with: "리안", status: "신뢰" }],
      },
      {
        name: "리안",
        location: "북회랑",
        physical: "숨을 고르는 중",
        emotional: "긴장",
        knows: ["세라가 먼저 금고 앞에 도착했다"],
        relationships: [{ with: "세라", status: "신뢰" }],
      },
    ],
    summary: "세라와 리안이 북회랑에서 금고 봉인을 확인한다.",
    revealed_facts: [
      {
        content: "황실 금고는 이중 봉인이다",
        revealedInChapter: 2,
        type: "evidence",
        revealedTo: ["세라", "리안"],
      },
    ],
    relationship_updates: [
      {
        a: "세라",
        b: "리안",
        firstMetChapter: 1,
        trust: 1,
        status: "공조",
        aKnowsAboutB: ["리안은 금고 경비 교대를 파악했다"],
        bKnowsAboutA: ["세라는 금고 열쇠를 쫓고 있다"],
      },
    ],
  };
}

describe("shared world state authority", () => {
  it("lets simulation writes immediately drive generation-facing prompt context", () => {
    const authority = createWorldStateAuthority(makeSeed());

    authority.applyEvent({
      id: "evt-2-move",
      chapter: 2,
      type: "move",
      actorId: "hero",
      location: "북회랑",
      summary: "세라가 북회랑으로 이동한다.",
    });

    const simulationState = authority.getSimulationState();
    const causalLedger = authority.getCausalLedger();
    const causalQuery = authority.queryCausalLedger({
      involvedEntityId: "hero",
      eventType: "move",
    });
    const promptContext = authority.buildSimulationPromptContext({
      chapterNumber: 2,
      sceneCharacterIds: ["hero"],
    });
    const writerContext = authority.formatForWriter(2);

    expect(simulationState.characters.hero.location).toBe("북회랑");
    expect(causalLedger.events[0]?.id).toBe("evt-2-move");
    expect(causalQuery.matchedEventCount).toBe(1);
    expect(causalQuery.events[0]?.episode).toBe(2);
    expect(promptContext).toContain("북회랑");
    expect(promptContext).toContain("세라");
    expect(writerContext).toContain("북회랑");
  });

  it("keeps chapter-text projections read-only while exposing them to writer continuity tools", () => {
    const authority = createWorldStateAuthority(makeSeed());

    authority.ingestNarrativeProjection(makeChapterState());

    const simulationState = authority.getSimulationState();
    const promptContext = authority.buildSimulationPromptContext({
      chapterNumber: 3,
      sceneCharacterIds: ["hero", "ally"],
    });
    const writerContext = authority.formatForWriter(3);

    expect(authority.size).toBe(1);
    expect(simulationState.chapterCursor).toBe(0);
    expect(simulationState.characters.hero.location).toBe("황궁");
    expect(simulationState.characters.hero.status).toBe("normal");
    expect(simulationState.characters.hero.secretsKnown).not.toContain("황실 금고는 이중 봉인이다");
    expect(simulationState.audienceKnowledge).not.toContain("황실 금고는 이중 봉인이다");
    expect(authority.getAudienceKnownFacts(3)[0]?.content).toBe("황실 금고는 이중 봉인이다");
    expect(authority.getCurrentFacts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: "황실 금고",
          action: "잠겨 있음",
          object: "이중 봉인",
        }),
      ]),
    );
    expect(promptContext).not.toContain("황실 금고는 이중 봉인이다");
    expect(promptContext).not.toContain("세라: location=북회랑");
    expect(promptContext).not.toContain("status=결의");
    expect(writerContext).toContain("Read-Only Narrative Projection");
    expect(writerContext).toContain("읽기 전용");
    expect(writerContext).toContain("황실 금고 잠겨 있음 이중 봉인");
    expect(writerContext).toContain("북회랑");
    expect(authority.formatAudienceKnowledge(3)).toContain("황실 금고는 이중 봉인이다");
    expect(authority.formatRelationshipContext(3, ["세라", "리안"])).toContain("세라 ↔ 리안");
  });

  it("does not let generated-text projections overwrite canonical objective facts", () => {
    const authority = createWorldStateAuthority(makeSeed());
    const canonicalBefore = structuredClone(authority.getSimulationState().objectiveFacts);

    authority.ingestNarrativeProjection({
      chapter: 2,
      facts: [
        {
          subject: "세라",
          action: "위치",
          object: "감옥",
          chapter: 2,
        },
      ],
      character_states: [
        {
          name: "세라",
          location: "감옥",
          physical: "차가운 쇠창살을 붙잡은 상태",
          emotional: "분노",
          knows: ["세라는 감옥에 갇혔다"],
          relationships: [],
        },
      ],
      summary: "생성 텍스트는 세라가 감옥에 갇혔다고 서술한다.",
      revealed_facts: [],
      relationship_updates: [],
    });

    const promptContext = authority.buildSimulationPromptContext({
      chapterNumber: 3,
      sceneCharacterIds: ["hero"],
    });
    const writerContext = authority.formatForWriter(3);

    expect(authority.getSimulationState().objectiveFacts).toEqual(canonicalBefore);
    expect(authority.getSimulationState().characters.hero.location).toBe("황궁");
    expect(promptContext).toContain("세라: location=황궁");
    expect(promptContext).not.toContain("세라: location=감옥");
    expect(writerContext).toContain("Read-Only Narrative Projection");
    expect(writerContext).toContain("읽기 전용");
    expect(writerContext).toContain("세라 위치 감옥");
  });
});
