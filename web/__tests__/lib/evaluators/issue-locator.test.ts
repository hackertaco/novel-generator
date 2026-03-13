import { describe, it, expect } from "vitest";
import { locateIssues } from "@/lib/evaluators/issue-locator";
import { segmentText } from "@/lib/agents/segmenter";
import { evaluateStyle } from "@/lib/evaluators/style";
import { evaluateConsistency } from "@/lib/evaluators/consistency";
import { evaluatePacing } from "@/lib/evaluators/pacing";

const MOCK_SEED = {
  title: "테스트",
  logline: "테스트",
  total_chapters: 10,
  world: {
    name: "test", genre: "현대 판타지", sub_genre: "헌터물",
    time_period: "현대", magic_system: "마나",
    key_locations: {}, factions: {}, rules: [],
  },
  characters: [
    {
      id: "mc", name: "이준혁", role: "주인공", introduction_chapter: 1,
      voice: {
        tone: "무심한", speech_patterns: ["~거든", "뭐..."],
        sample_dialogues: [], personality_core: "현실주의자",
      },
      backstory: "평범한 학생", arc_summary: "성장",
      state: { level: 1, location: "서울", status: "normal", relationships: {}, inventory: [], secrets_known: [] },
    },
  ],
  arcs: [{ id: "arc_1", name: "각성편", start_chapter: 1, end_chapter: 30, summary: "각성", key_events: [], climax_chapter: 28 }],
  chapter_outlines: [
    { chapter_number: 1, title: "시작", arc_id: "arc_1", one_liner: "일상", key_points: ["일상"], characters_involved: ["mc"], tension_level: 3 },
  ],
  foreshadowing: [],
  style: { max_paragraph_length: 3, dialogue_ratio: 0.6, sentence_style: "short" as const, hook_ending: true, pov: "1인칭", tense: "과거형", formatting_rules: [] },
} as any;

describe("locateIssues", () => {
  it("flags segment with too many consecutive dialogue lines", () => {
    const text = [
      "서술 문단입니다. 길을 걸었다.",
      '"첫 번째 대사"\n"두 번째 대사"\n"세 번째 대사"\n"네 번째 대사"\n"다섯 번째 대사"\n"여섯 번째 대사"',
      "마지막 서술 문단.",
    ].join("\n\n");

    const segments = segmentText(text);
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    const dialogueIssue = issues.find((i) => i.segmentId === 1);
    expect(dialogueIssue).toBeDefined();
    expect(dialogueIssue!.issues.some((i) => i.includes("대사"))).toBe(true);
  });

  it("flags last segment when hook_ending fails", () => {
    const text = "첫 문단.\n\n두 번째 문단.\n\n그냥 끝나는 마지막 문단이다";
    const segments = segmentText(text);
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    const lastSegId = segments[segments.length - 1].id;
    const hookIssue = issues.find((i) => i.segmentId === lastSegId);
    expect(hookIssue).toBeDefined();
    expect(hookIssue!.issues.some((i) => i.includes("후킹") || i.includes("엔딩"))).toBe(true);
  });

  it("flags segment with time jump markers", () => {
    const text = "첫 문단입니다.\n\n다음 날 아침이 밝았다. 며칠 후 상황이 달라졌다.\n\n마지막 문단.";
    const segments = segmentText(text);
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    const timeIssue = issues.find((i) => i.segmentId === 1);
    expect(timeIssue).toBeDefined();
    expect(timeIssue!.issues.some((i) => i.includes("시간"))).toBe(true);
  });

  it("does not flag good text with false positives on core metrics", () => {
    const text = `수업 종이 울렸다. 이준혁은 책상에 엎드린 채 꿈쩍도 하지 않았다.

"야, 종 쳤다."

짝꿍이 등을 쿡 찔렀다. 준혁은 느릿하게 고개를 들었다. 창밖으로 석양이 내리고 있었다.

"뭐... 알았어."

가방을 대충 챙겨 복도로 나왔다. 학교는 늘 이 시간이 가장 시끄러웠다. 웃는 소리, 뛰는 소리, 누군가를 부르는 소리.

준혁은 이어폰을 꽂았다. 그게 이 소음에서 살아남는 유일한 방법이었다.

편의점까지는 걸어서 15분. 매일 같은 길을 걸었다. 같은 가로수, 같은 횡단보도, 같은 벽돌 담.

"어서 오세요~"

알바 선배가 카운터 뒤에서 손을 흔들었다. 준혁은 고개만 까딱했다.

앞치마를 두르고 진열대를 정리하기 시작했다. 유통기한 확인, 앞줄 빼기, 뒷줄 채우기. 손이 알아서 움직였다.

그때 창밖을 봤다.

하늘에 실금 같은 게 있었다. 아주 가느다란 선. 마치 유리에 금이 간 것처럼.

"...뭐야 저거."

혼잣말이 나왔다. 하지만 창밖을 지나가는 사람들은 아무도 고개를 들지 않았다.

준혁은 다시 한번 올려다봤다. 분명히 있었다. 하늘에, 뭔가가.

"준혁아, 3번 냉장고 좀 채워~"

"...네."

고개를 돌렸다. 다시 올려다봤을 때, 선은 여전히 거기 있었다.`;

    const segments = segmentText(text);
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    const criticalIssues = issues.filter((i) =>
      i.issues.some((iss) => iss.includes("대사 연속") || iss.includes("시간") || iss.includes("각성"))
    );
    expect(criticalIssues).toHaveLength(0);
  });
});
