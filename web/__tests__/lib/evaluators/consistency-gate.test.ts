// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  evaluateConsistencyGate,
} from "@/lib/evaluators/consistency-gate";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const characters = [
  { name: "강현우", role: "주인공" },
  { name: "서연", role: "동료" },
  { name: "이도현", role: "형" },
];

// ---------------------------------------------------------------------------
// 1. POV Consistency
// ---------------------------------------------------------------------------

describe("POV consistency", () => {
  it("passes for consistent 3rd person text", () => {
    const text = [
      "강현우는 천천히 걸었다. 서연이 뒤따라왔다.",
      "두 사람은 던전 입구에 도착했다. 강현우가 문을 열었다.",
      "서연은 긴장한 표정이었다. 이상한 기운이 느껴졌다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const povIssues = result.issues.filter((i) => i.type === "pov_inconsistency");
    expect(povIssues).toHaveLength(0);
    expect(result.score).toBe(1.0);
  });

  it("passes for consistent 1st person text", () => {
    const text = [
      "나는 천천히 걸었다. 내가 문을 열자 차가운 바람이 불었다.",
      "내 앞에 서연이 서 있었다. 나는 그녀에게 손짓했다.",
      "나를 따라오라는 뜻이었다. 나에게는 확신이 있었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const povIssues = result.issues.filter((i) => i.type === "pov_inconsistency");
    expect(povIssues).toHaveLength(0);
  });

  it("detects POV switch from 3rd to 1st person", () => {
    const text = [
      "강현우는 천천히 걸었다. 서연이 뒤따라왔다.",
      "두 사람은 던전 입구에 도착했다.",
      "나는 문을 열었다. 내가 본 것은 상상도 못한 광경이었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const povIssues = result.issues.filter((i) => i.type === "pov_inconsistency");
    expect(povIssues.length).toBeGreaterThan(0);
    expect(povIssues[0].severity).toBe("critical");
  });

  it("allows 1st person markers inside dialogue in 3rd person text", () => {
    const text = [
      "강현우는 천천히 걸었다. 서연이 뒤따라왔다.",
      '강현우가 "나는 괜찮아"라고 말했다.',
      "서연은 고개를 끄덕였다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const povIssues = result.issues.filter((i) => i.type === "pov_inconsistency");
    expect(povIssues).toHaveLength(0);
  });

  it("validates against declared POV from blueprint", () => {
    // Text is in 3rd person, but blueprint says 1st person
    const text = [
      "강현우는 천천히 걸었다. 서연이 뒤따라왔다.",
      "두 사람은 던전 입구에 도착했다. 강현우가 문을 열었다.",
      "서연은 긴장한 표정이었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters, "first");
    const povIssues = result.issues.filter((i) => i.type === "pov_inconsistency");
    expect(povIssues.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Unnamed Scene Start
// ---------------------------------------------------------------------------

describe("unnamed scene start", () => {
  it("detects scene after *** with no character name", () => {
    const text = [
      "강현우는 던전에 들어갔다.",
      "***",
      "어둠이 내려앉았다. 기이한 소리가 들렸다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const sceneIssues = result.issues.filter((i) => i.type === "unnamed_scene_start");
    expect(sceneIssues).toHaveLength(1);
    expect(sceneIssues[0].severity).toBe("major");
  });

  it("passes when scene after *** mentions a character", () => {
    const text = [
      "강현우는 던전에 들어갔다.",
      "***",
      "서연은 밖에서 기다리고 있었다. 불안한 표정이었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const sceneIssues = result.issues.filter((i) => i.type === "unnamed_scene_start");
    expect(sceneIssues).toHaveLength(0);
  });

  it("detects scene after --- with no character name", () => {
    const text = [
      "강현우는 걸어갔다.",
      "---",
      "하늘은 붉게 물들어 있었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const sceneIssues = result.issues.filter((i) => i.type === "unnamed_scene_start");
    expect(sceneIssues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Character Existence
// ---------------------------------------------------------------------------

describe("character existence", () => {
  it("detects unknown dialogue speaker", () => {
    const text = [
      '강현우가 "어디로 가야 하지?"라고 물었다.',
      '김태수가 "이쪽으로 따라와"라고 말했다.',
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const charIssues = result.issues.filter((i) => i.type === "character_existence");
    expect(charIssues.length).toBeGreaterThan(0);
    expect(charIssues[0].description).toContain("김태수");
  });

  it("passes for known characters", () => {
    const text = [
      '강현우가 "준비됐어?"라고 물었다.',
      '서연이 "응, 가자"라고 말했다.',
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const charIssues = result.issues.filter((i) => i.type === "character_existence");
    expect(charIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Timeline Contradiction
// ---------------------------------------------------------------------------

describe("timeline contradiction", () => {
  it("detects backward time without scene break", () => {
    const text = [
      "저녁이 되었다. 강현우는 식사를 마쳤다.",
      "아침 해가 떴다. 강현우는 눈을 떴다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const timeIssues = result.issues.filter((i) => i.type === "timeline_contradiction");
    expect(timeIssues).toHaveLength(1);
    expect(timeIssues[0].severity).toBe("major");
  });

  it("allows forward time progression", () => {
    const text = [
      "아침이 밝았다. 강현우는 훈련을 시작했다.",
      "오후가 되었다. 서연이 도착했다.",
      "밤이 깊어졌다. 두 사람은 잠자리에 들었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const timeIssues = result.issues.filter((i) => i.type === "timeline_contradiction");
    expect(timeIssues).toHaveLength(0);
  });

  it("resets timeline after scene break", () => {
    const text = [
      "밤이 깊어졌다. 강현우는 잠들었다.",
      "***",
      "아침이 밝았다. 새로운 하루가 시작됐다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const timeIssues = result.issues.filter((i) => i.type === "timeline_contradiction");
    expect(timeIssues).toHaveLength(0);
  });

  it("resets timeline on '다음 날'", () => {
    const text = [
      "밤이 깊어졌다. 강현우는 잠들었다.",
      "다음 날 아침이 밝았다. 강현우는 일어났다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const timeIssues = result.issues.filter((i) => i.type === "timeline_contradiction");
    expect(timeIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Location Discontinuity
// ---------------------------------------------------------------------------

describe("location discontinuity", () => {
  it("detects sudden location change without movement", () => {
    const text = [
      "강현우는 사무실에서 일을 하고 있었다.",
      "강현우는 병원에서 진료를 받았다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const locIssues = result.issues.filter((i) => i.type === "location_discontinuity");
    expect(locIssues).toHaveLength(1);
    expect(locIssues[0].severity).toBe("minor");
  });

  it("passes when movement verb is present", () => {
    const text = [
      "강현우는 사무실에서 일을 마쳤다.",
      "강현우는 병원에 도착했다. 병원에서 진료를 받았다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const locIssues = result.issues.filter((i) => i.type === "location_discontinuity");
    expect(locIssues).toHaveLength(0);
  });

  it("resets location after scene break", () => {
    const text = [
      "강현우는 사무실에서 일을 했다.",
      "***",
      "서연은 병원에서 기다리고 있었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    const locIssues = result.issues.filter((i) => i.type === "location_discontinuity");
    expect(locIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Gate Scoring
// ---------------------------------------------------------------------------

describe("gate scoring", () => {
  it("perfect text gets score 1.0", () => {
    const text = [
      "강현우는 천천히 걸었다. 서연이 옆에서 따라왔다.",
      "두 사람은 오후의 햇살 아래 길을 걸었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    expect(result.score).toBe(1.0);
    expect(result.issues).toHaveLength(0);
  });

  it("critical issue applies -0.3 penalty", () => {
    // Force a POV inconsistency (critical)
    const text = [
      "강현우는 천천히 걸었다. 서연이 뒤따라왔다.",
      "두 사람은 던전에 도착했다.",
      "나는 문을 열었다. 내가 본 것은 놀라운 광경이었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    expect(result.score).toBeLessThanOrEqual(0.7);
  });

  it("multiple issues stack penalties down to floor of 0.3", () => {
    // Text with multiple issues: POV switch + unnamed scene + timeline contradiction
    const text = [
      "강현우는 밤에 잠들었다.",
      "***",
      "아침 해가 떴다. 어둠이 사라졌다.",
      "나는 눈을 떴다. 내가 본 것은 낯선 방이었다.",
      "저녁이 되었다.",
      "아침이 밝았다. 새가 울었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    expect(result.score).toBeGreaterThanOrEqual(0.3);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("floor is 0.3 regardless of how many issues", () => {
    // Deliberately terrible text with many issues
    const text = [
      "밤이 깊었다.",
      "***",
      "빛이 사라졌다. 어둠뿐이었다.",
      "나는 걸었다. 내가 본 것은 끝이었다.",
      "***",
      "소리가 들렸다. 아무것도 보이지 않았다.",
      "나는 뛰었다. 나를 쫓는 무언가가 있었다.",
      "아침이 밝았다.",
      "저녁이 되었다. 밤이 되었다. 아침 해가 떴다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters);
    expect(result.score).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// 7. Name consistency false-positive fixes
// ---------------------------------------------------------------------------

describe("name consistency false positives", () => {
  const fantasyChars = [
    { name: "세레나 에버딘", role: "주인공" },
    { name: "루시안 벨로아", role: "상대역" },
    { name: "황후 비앙카", role: "황후" },
  ];

  it("does not flag name + surname with particle '을' (세레나 에버딘을)", () => {
    const text = "세레나 에버딘을 향해 루시안 벨로아가 걸어왔다.";
    const result = evaluateConsistencyGate(text, fantasyChars);
    const nameIssues = result.issues.filter((i) => i.type === "name_inconsistency");
    expect(nameIssues).toHaveLength(0);
  });

  it("does not flag name + surname with particle '께서' (에버딘께서)", () => {
    const text = "세레나 에버딘께서 입장하셨다.";
    const result = evaluateConsistencyGate(text, fantasyChars);
    const nameIssues = result.issues.filter((i) => i.type === "name_inconsistency");
    expect(nameIssues).toHaveLength(0);
  });

  it("does not flag name + surname with particle '에게서'", () => {
    const text = "세레나 에버딘에게서 편지가 왔다.";
    const result = evaluateConsistencyGate(text, fantasyChars);
    const nameIssues = result.issues.filter((i) => i.type === "name_inconsistency");
    expect(nameIssues).toHaveLength(0);
  });

  it("does not flag name + honorific '영애' (세레나 영애)", () => {
    const text = "세레나 영애는 정원을 거닐었다.";
    const result = evaluateConsistencyGate(text, fantasyChars);
    const nameIssues = result.issues.filter((i) => i.type === "name_inconsistency");
    expect(nameIssues).toHaveLength(0);
  });

  it("does not flag name + honorific '전하' with particle (루시안 전하가)", () => {
    const text = "루시안 전하가 명령을 내렸다.";
    const result = evaluateConsistencyGate(text, fantasyChars);
    const nameIssues = result.issues.filter((i) => i.type === "name_inconsistency");
    expect(nameIssues).toHaveLength(0);
  });

  it("does not flag title-as-firstName references (황후 폐하께서)", () => {
    const text = "황후 폐하께서 연회를 열었다.";
    const result = evaluateConsistencyGate(text, fantasyChars);
    const nameIssues = result.issues.filter((i) => i.type === "name_inconsistency");
    expect(nameIssues).toHaveLength(0);
  });

  it("still detects genuine wrong surname", () => {
    const text = "세레나 몬타나가 걸어왔다.";
    const result = evaluateConsistencyGate(text, fantasyChars);
    const nameIssues = result.issues.filter((i) => i.type === "name_inconsistency");
    expect(nameIssues.length).toBeGreaterThan(0);
    expect(nameIssues[0].description).toContain("몬타나");
  });
});

// ---------------------------------------------------------------------------
// 8. Character existence false-positive fixes
// ---------------------------------------------------------------------------

describe("character existence false positives", () => {
  const fantasyChars = [
    { name: "세레나 에버딘", role: "주인공" },
    { name: "루시안 벨로아", role: "상대역" },
  ];

  it("matches first-name-only usage (세레나) to full name", () => {
    const text = '세레나가 "조심해"라고 외쳤다.';
    const result = evaluateConsistencyGate(text, fantasyChars);
    const charIssues = result.issues.filter((i) => i.type === "character_existence");
    expect(charIssues).toHaveLength(0);
  });

  it("does not flag common Korean words as unknown characters", () => {
    const text = '하나가 "무엇인가"라고 물었다. 누군가 대답했다.';
    const result = evaluateConsistencyGate(text, fantasyChars);
    const charIssues = result.issues.filter((i) => i.type === "character_existence");
    // "하나" should be excluded as common word; "누군" is in exclusion list
    const falsePositives = charIssues.filter(
      (i) => i.description.includes("하나") || i.description.includes("누군"),
    );
    expect(falsePositives).toHaveLength(0);
  });

  it("still detects genuinely unknown speakers", () => {
    const text = '김태수가 "이리 오라"라고 말했다.';
    const result = evaluateConsistencyGate(text, fantasyChars);
    const charIssues = result.issues.filter((i) => i.type === "character_existence");
    expect(charIssues.length).toBeGreaterThan(0);
    expect(charIssues[0].description).toContain("김태수");
  });
});

// ---------------------------------------------------------------------------
// 9. Integration: consistency gate acts as multiplier
// ---------------------------------------------------------------------------

describe("integration with scoring concept", () => {
  it("gate score is between 0.3 and 1.0", () => {
    const texts = [
      "강현우는 걸었다.",
      "나는 강현우는 그녀는 밤이 아침이 나는 걸었다.",
      [
        "강현우는 던전에 들어갔다.",
        "***",
        "어둠이 가득했다.",
        "나는 칼을 들었다.",
      ].join("\n\n"),
    ];

    for (const text of texts) {
      const result = evaluateConsistencyGate(text, characters);
      expect(result.score).toBeGreaterThanOrEqual(0.3);
      expect(result.score).toBeLessThanOrEqual(1.0);
    }
  });
});

// ---------------------------------------------------------------------------
// Companion continuity (인물 동선)
// ---------------------------------------------------------------------------

describe("companion continuity", () => {
  const prevStates = [
    {
      name: "강현우",
      location: "왕궁 별관",
      physical: "건강",
      emotional: "긴장",
      knows: [],
      companions: ["서연"],
      relationships: [],
    },
    {
      name: "서연",
      location: "왕궁 별관",
      physical: "건강",
      emotional: "불안",
      knows: [],
      companions: ["강현우"],
      relationships: [],
    },
    {
      name: "이도현",
      location: "시장",
      physical: "건강",
      emotional: "평온",
      knows: [],
      companions: [],
      relationships: [],
    },
  ];

  it("detects companion group split without separation description", () => {
    // 강현우 appears but 서연 doesn't, and no separation verbs
    const text = [
      "강현우는 아침 일찍 눈을 떴다.",
      "차가운 공기가 방 안을 채웠다.",
      "그는 검을 챙기고 밖으로 나섰다.",
      "이도현이 시장 골목에서 기다리고 있었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters, undefined, prevStates);
    const companionIssues = result.issues.filter((i) => i.type === "companion_discontinuity");
    expect(companionIssues.length).toBeGreaterThan(0);
    expect(companionIssues[0].detail).toContain("서연");
  });

  it("no issue when companion group appears together", () => {
    const text = [
      "강현우와 서연은 함께 왕궁 별관을 나섰다.",
      "두 사람은 긴 복도를 걸었다.",
      "이도현은 여전히 시장에 있었다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters, undefined, prevStates);
    const companionIssues = result.issues.filter((i) => i.type === "companion_discontinuity");
    expect(companionIssues.length).toBe(0);
  });

  it("no issue when separation is described", () => {
    const text = [
      "강현우는 서연에게 작별 인사를 건넸다.",
      "서연은 떠났고, 강현우는 홀로 남았다.",
      "그는 검을 챙기고 밖으로 나섰다.",
    ].join("\n\n");

    const result = evaluateConsistencyGate(text, characters, undefined, prevStates);
    const companionIssues = result.issues.filter((i) => i.type === "companion_discontinuity");
    expect(companionIssues.length).toBe(0);
  });

  it("no issue when no previous character states", () => {
    const text = "강현우는 아침 일찍 눈을 떴다.\n\n그는 밖으로 나섰다.";
    const result = evaluateConsistencyGate(text, characters, undefined, undefined);
    const companionIssues = result.issues.filter((i) => i.type === "companion_discontinuity");
    expect(companionIssues.length).toBe(0);
  });

  it("no issue for solo characters at different locations", () => {
    const soloStates = [
      { name: "강현우", location: "왕궁", physical: "", emotional: "", knows: [], companions: [], relationships: [] },
      { name: "서연", location: "시장", physical: "", emotional: "", knows: [], companions: [], relationships: [] },
    ];
    const text = "강현우는 눈을 떴다.\n\n그는 밖으로 나섰다.";
    const result = evaluateConsistencyGate(text, characters, undefined, soloStates);
    const companionIssues = result.issues.filter((i) => i.type === "companion_discontinuity");
    expect(companionIssues.length).toBe(0);
  });
});
