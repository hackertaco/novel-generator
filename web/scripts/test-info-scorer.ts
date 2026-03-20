/**
 * Quick test: information-theoretic scorer on sample texts.
 * Run: npx tsx scripts/test-info-scorer.ts
 */

import { computeNarrativeInformationScores } from "../src/lib/evaluators/narrative-information-scorer";
import { computeDeterministicScores } from "../src/lib/evaluators/deterministic-scorer";
import type { NovelSeed } from "../src/lib/schema/novel";

// --- Sample A: "Good" text (from previous session — rich, varied, tension builds) ---
const GOOD_TEXT = `차가운 흑요석 바닥이 장화 밑창을 얇게 밀어 올렸다. 횃불은 거의 타들어 가는 소리만 냈고, 너무 고요해서 제 숨이 회랑 끝까지 번지는 듯했다. 그런데 바람 한 점 없는데도 젖은 쇠 냄새가 희미하게 스쳤다.

옆에서 검집 끝이 바닥 위를 한 치 가리켰다.

"보폭 줄여."

로웬 하르트는 고개도 돌리지 않은 채 손가락 두 마디만 들어 보였고, 유리아는 발끝 각도를 고쳐 디뎠다. 시선을 정면에 박아 두려던 순간, 그의 낮은 목소리가 다시 떨어졌다.

"앞만 보지 마. 그림자, 창살, 불빛 끊기는 자리부터."

유리아는 턱을 아주 조금 당기며 눈동자만 옆으로 흘렸다. 왼쪽 벽. 횃불 간격 사이로 드리운 그림자가 규칙적으로 늘어서 있었다. 두 번째와 세 번째 그림자 사이—폭이 유독 넓다.

그녀의 걸음이 저절로 멈췄다.

"거기."

로웬이 미세하게 고개를 끄덕였다. "좋아. 왜?"

"그림자 폭이 다릅니다. 횃불 간격은 동일한데 세 번째 그림자만 넓어요. 벽면에 뭔가—틈이 있거나, 횃불이 한쪽으로 기운 겁니다."

"기운 거라면?"

유리아는 입술을 한 번 깨물었다. 바람이 없는데 불꽃이 기울 이유. 틈 너머로 공기가 새는 것이다. 숨겨진 통로.

"누군가 이 길 말고 다른 길을 쓰고 있다는 뜻입니다."

로웬이 처음으로 멈춰 섰다. 어둠 속에서 그의 눈빛이 잠깐 날카로워지더니 이내 원래대로 돌아왔다. 하지만 유리아는 놓치지 않았다. 그 순간의 긴장—예상 밖이라는 반응.

"잘 봤다." 그가 말했다. "하지만 아는 척하지 마."

"네?"

"지금 네가 발견한 것, 혼자 알고 있어."

유리아의 가슴 한 구석이 서늘해졌다. 그의 말투에서 경고가 아닌, 진짜 위험의 냄새를 맡았기 때문이다. 비밀 통로를 아는 자가 이 성 안에 있다. 그리고 로웬 하르트도 그것을 몰랐다.

회랑 끝에서 철문이 나타났다. 녹이 슬어 손잡이가 갈색으로 부풀어 있었다. 로웬이 장갑 낀 손으로 손잡이를 잡았다.

"소리 나면 뒤로 빠져."

철문이 비명처럼 울었다.`;

// --- Sample B: "Flat" text (monotonous, low tension, repetitive) ---
const FLAT_TEXT = `유리아는 성을 걸어갔다. 성은 매우 컸다. 복도가 길었다. 유리아는 계속 걸었다. 로웬도 함께 걸었다.

유리아는 벽을 보았다. 벽은 돌로 되어 있었다. 횃불이 있었다. 횃불은 밝았다. 유리아는 횃불을 보았다.

"여기가 어디야?" 유리아가 물었다.

"성이야." 로웬이 말했다.

"왜 여기에 왔어?" 유리아가 물었다.

"할 일이 있어." 로웬이 말했다.

유리아는 고개를 끄덕였다. 그녀는 계속 걸었다. 로웬도 계속 걸었다. 복도는 길었다. 횃불이 계속 있었다. 유리아는 계속 걸었다.

이윽고 문이 나타났다. 문은 철로 되어 있었다. 유리아는 문을 보았다. 로웬도 문을 보았다.

"저 문을 열어야 해." 로웬이 말했다.

"알겠어." 유리아가 말했다.

로웬이 문을 열었다. 문이 열렸다. 그들은 안으로 들어갔다. 안은 어두웠다. 유리아는 걱정이 되었다. 하지만 로웬이 있으니 괜찮다고 생각했다.`;

// --- Minimal seed for testing ---
const testSeed: NovelSeed = {
  title: "기사단의 그림자",
  logline: "숨겨진 정체를 가진 소녀가 기사단에 들어가 생존하는 이야기",
  total_chapters: 50,
  chapter_outlines: [
    {
      chapter_number: 1,
      one_liner: "유리아가 로웬과 함께 성 지하를 탐색하며 비밀 통로를 발견한다",
      key_points: ["지하 회랑 탐색", "비밀 통로 발견", "로웬의 경고"],
      tension_level: 7,
    },
  ],
  characters: [
    {
      id: "yuria",
      name: "유리아",
      role: "주인공",
      gender: "female",
      introduction_chapter: 1,
      voice: {
        tone: "존댓말, 조심스러움",
        personality_core: "관찰력이 뛰어나고 신중한 성격",
        speech_patterns: ["~입니다", "~ㅂ니다"],
        sample_dialogues: ["그림자 폭이 다릅니다.", "누군가 이 길 말고 다른 길을 쓰고 있다는 뜻입니다."],
      },
      arc_summary: "숨겨진 정체를 가진 채 기사단에서 생존",
      backstory: "몰락한 가문의 딸",
      state: { status: "긴장", location: "성 지하", relationships: { "로웬": "경계+존경" }, secrets_known: [] },
    },
    {
      id: "rowen",
      name: "로웬",
      role: "멘토",
      gender: "male",
      introduction_chapter: 1,
      voice: {
        tone: "반말, 간결하고 명령적",
        personality_core: "냉정하지만 실력을 인정하면 인정하는 성격",
        speech_patterns: ["~해", "~마"],
        sample_dialogues: ["보폭 줄여.", "앞만 보지 마.", "아는 척하지 마."],
      },
      arc_summary: "유리아의 잠재력을 시험하는 기사단 간부",
      backstory: "전설적인 기사",
      state: { status: "경계", location: "성 지하", relationships: { "유리아": "시험 중" }, secrets_known: ["비밀 통로의 존재"] },
    },
  ],
  world: {
    genre: "판타지",
    sub_genre: "기사/정치",
    time_period: "중세 판타지",
    key_locations: { "기사단 성": "거대한 석조 성채", "지하 회랑": "비밀이 숨겨진 지하 통로" },
    factions: { "하르트 기사단": "왕국 최강의 기사단", "그림자 세력": "성 내부의 배신자들" },
    magic_system: "축복 — 신의 가호를 받은 자만 사용 가능",
    rules: ["축복은 혈통으로 전해진다", "기사단 입단은 시험을 통과해야 한다"],
  },
  foreshadowing: [],
  arcs: [
    {
      name: "입단편",
      chapters: [1, 10],
      climax_chapter: 8,
      theme: "생존과 발견",
    },
  ],
} as unknown as NovelSeed;

// --- Run tests ---
console.log("=".repeat(70));
console.log("정보이론 스코어러 테스트");
console.log("=".repeat(70));

console.log("\n--- Sample A: 좋은 텍스트 (긴장감, 대사 다양, 감각 풍부) ---\n");
const infoA = computeNarrativeInformationScores(GOOD_TEXT);
console.log("엔트로피 역동성:", infoA.entropyDynamism);
console.log("피봇 실현:", infoA.pivotRealization);
console.log("아크 상관:", infoA.arcCorrelation);
console.log("정체 방지:", infoA.antiStagnation);
console.log("종합:", infoA.overall);
console.log("\n문단별 엔트로피:", infoA.details.paragraphEntropies);
console.log("문단별 JSD:", infoA.details.paragraphJSDs);
console.log("정체 구간:", infoA.details.stagnationSegments);
console.log("피봇 분석:", infoA.details.pivotAnalysis);

console.log("\n--- Sample B: 밋밋한 텍스트 (단조, 반복, 긴장 없음) ---\n");
const infoB = computeNarrativeInformationScores(FLAT_TEXT);
console.log("엔트로피 역동성:", infoB.entropyDynamism);
console.log("피봇 실현:", infoB.pivotRealization);
console.log("아크 상관:", infoB.arcCorrelation);
console.log("정체 방지:", infoB.antiStagnation);
console.log("종합:", infoB.overall);
console.log("\n문단별 엔트로피:", infoB.details.paragraphEntropies);
console.log("문단별 JSD:", infoB.details.paragraphJSDs);
console.log("정체 구간:", infoB.details.stagnationSegments);
console.log("피봇 분석:", infoB.details.pivotAnalysis);

console.log("\n" + "=".repeat(70));
console.log("전체 DeterministicScorer (10차원)");
console.log("=".repeat(70));

console.log("\n--- Sample A ---\n");
const detA = computeDeterministicScores(GOOD_TEXT, testSeed, 1);
const dimA = Object.entries(detA).filter(([k]) => !["overall", "details", "informationTheory"].includes(k));
for (const [key, val] of dimA) {
  console.log(`  ${key}: ${(val as number).toFixed(3)}`);
}
console.log(`  ----`);
console.log(`  overall: ${detA.overall.toFixed(3)}`);

console.log("\n--- Sample B ---\n");
const detB = computeDeterministicScores(FLAT_TEXT, testSeed, 1);
const dimB = Object.entries(detB).filter(([k]) => !["overall", "details", "informationTheory"].includes(k));
for (const [key, val] of dimB) {
  console.log(`  ${key}: ${(val as number).toFixed(3)}`);
}
console.log(`  ----`);
console.log(`  overall: ${detB.overall.toFixed(3)}`);

console.log("\n" + "=".repeat(70));
console.log(`판정: A=${detA.overall.toFixed(3)} vs B=${detB.overall.toFixed(3)}`);
console.log(`차이: ${((detA.overall - detB.overall) * 100).toFixed(1)}%p`);
if (detA.overall > detB.overall) {
  console.log("✅ 좋은 텍스트가 높은 점수 — 정상 작동");
} else {
  console.log("❌ 밋밋한 텍스트가 더 높음 — 가중치 조정 필요");
}
console.log("=".repeat(70));
