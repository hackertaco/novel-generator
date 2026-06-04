import { z } from "zod";

// --- Schemas ---

export const RelationTaxonomyEnum = z.enum([
  "older_sibling",
  "younger_sibling",
  "serves",
  "served_by",
  "guardian",
  "ward",
  "younger_to_elder_sibling",
  "elder_to_younger_sibling",
  "servant_to_mistress",
  "mistress_to_servant",
  "formal_fiance_under_tension",
  "trusted_attendant",
  "public_masked_hostility",
]);

export type RelationTaxonomy = z.infer<typeof RelationTaxonomyEnum>;

export const KinshipDirectionEnum = z.enum(["elder_sibling", "younger_sibling", "none"]);
export type KinshipDirection = z.infer<typeof KinshipDirectionEnum>;

export const ServiceDirectionEnum = z.enum(["serves", "served_by", "none"]);
export type ServiceDirection = z.infer<typeof ServiceDirectionEnum>;

export const RomanceRoleEnum = z.enum(["primary", "rival", "latent", "none"]);
export type RomanceRole = z.infer<typeof RomanceRoleEnum>;

export const PublicFaceEnum = z.enum(["warm", "formal", "hostile_masked", "cold", "devoted", "neutral"]);
export type PublicFace = z.infer<typeof PublicFaceEnum>;

export const PrivateTruthEnum = z.enum(["trusting", "suspicious", "hostile", "devoted", "utilitarian", "neutral"]);
export type PrivateTruth = z.infer<typeof PrivateTruthEnum>;

export const CharacterAddressHintSchema = z.object({
  to: z.string().describe("상대 캐릭터 id 또는 이름"),
  relation: RelationTaxonomyEnum.optional().describe("관계 힌트"),
  address: z.string().optional().describe("이 상대를 직접 부를 때 기본 호칭"),
  speech_level: z.enum(["formal", "polite", "casual", "intimate"]).optional().describe("이 상대에게 기본적으로 사용하는 화계"),
  note: z.string().optional().describe("조건부 메모"),
});

export type CharacterAddressHint = z.infer<typeof CharacterAddressHintSchema>;

export const RelationshipFactSchema = z.object({
  target: z.string().describe("상대 캐릭터 id 또는 이름"),
  kinship: KinshipDirectionEnum.default("none").describe("친족 방향 truth"),
  service: ServiceDirectionEnum.default("none").describe("주종 방향 truth"),
  romance_role: RomanceRoleEnum.default("none").describe("로맨스 축에서 이 상대가 어떤 역할인지"),
  public_face: PublicFaceEnum.default("neutral").describe("공적/겉보기 관계의 얼굴"),
  private_truth: PrivateTruthEnum.default("neutral").describe("실제 속내/관계 진실"),
  trust_level: z.number().int().min(-2).max(2).default(0).describe("신뢰도 방향값 (-2~+2)"),
  hostility_mode: z.string().optional().describe("적대/경계의 방식 (예: jealous, masked, political)"),
  address_default: z.string().optional().describe("이 상대를 기본적으로 부르는 호칭"),
  speech_mode_default: z.enum(["formal", "polite", "casual", "intimate"]).optional().describe("이 상대에게 기본적으로 사용하는 화계"),
  preferred_register: z.string().optional().describe("이 관계에서 선호되는 말투 설명"),
  forbidden_register: z.array(z.string()).default([]).describe("이 관계에서 피해야 하는 어조/문구"),
  preferred_patterns: z.array(z.string()).default([]).describe("이 관계에서 자주 쓰는 자연스러운 표현 예"),
  note: z.string().optional().describe("추가 메모"),
});

export type RelationshipFact = z.infer<typeof RelationshipFactSchema>;

export const EventDispositionEnum = z.enum([
  "confront",
  "sabotage",
  "take_physical",
  "awaken_magic",
  "none",
]);

export type EventDisposition = z.infer<typeof EventDispositionEnum>;

export const IntentProfileSchema = z.object({
  surface_goal: z.string().describe("겉으로 드러난 현재 목표"),
  hidden_goal: z.string().describe("숨기고 있는 진짜 목표"),
  core_fear: z.string().describe("핵심 두려움"),
  leverage_points: z.array(z.string()).default([]).describe("이 인물을 움직일 수 있는 압박/미끼"),
  taboo_actions: z.array(z.string()).default([]).describe("아무리 급해도 쉽게 넘지 못하는 금기 행동"),
  event_disposition: EventDispositionEnum.optional().describe(
    "이 인물이 기우는 사건(plot-level) 행동 — Planner가 자발 발화 판단에 사용. 미설정 시 사건 비기울임(none).",
  ),
});

export type IntentProfile = z.infer<typeof IntentProfileSchema>;

export const AccessProfileSchema = z.object({
  knowledge_domains: z.array(z.string()).default([]).describe("자연스럽게 알고 있을 법한 지식 영역"),
  forbidden_knowledge: z.array(z.string()).default([]).describe("알고 있으면 이상해지는 금지 지식"),
  access_rights: z.array(z.string()).default([]).describe("출입/열람 가능한 장소/기록/권한"),
  surveillance_risk: z.array(z.string()).default([]).describe("이 인물이 감시되거나 오해받기 쉬운 행동/장소"),
});

export type AccessProfile = z.infer<typeof AccessProfileSchema>;

export const CharacterVoiceSchema = z.object({
  tone: z.string().describe("Overall tone (e.g., '냉소적, 하지만 속정 있음')"),
  speech_patterns: z
    .array(z.string())
    .default([])
    .describe("Characteristic speech patterns (e.g., '~하지', '...그래서?')"),
  sample_dialogues: z
    .array(z.string())
    .default([])
    .describe("Representative dialogue samples (5-10 examples)"),
  personality_core: z
    .string()
    .describe("Core personality description for consistency"),
});

export type CharacterVoice = z.infer<typeof CharacterVoiceSchema>;

export const GenreOriginKindEnum = z.enum([
  "regression",
  "possession",
  "transmigration",
  "awakening",
]);

export type GenreOriginKind = z.infer<typeof GenreOriginKindEnum>;

export const GenreOriginSchema = z.object({
  kind: GenreOriginKindEnum.describe(
    "장르 원형. regression=회귀, possession=빙의, transmigration=환생/이세계, awakening=각성. " +
    "이 필드가 있으면 GenreConvention 룰이 결정적으로 1화 hook(회상/자각/시간점프 등)을 자동 생성.",
  ),
  past_life_summary: z
    .string()
    .optional()
    .describe(
      "전생/원래 세계에서의 마지막 기억 요약. regression이면 죽음 직전 장면 권장. " +
      "canonical bootstrap 시 chapter 0 memory로 자동 시드되어 1화 회상의 결정적 소스가 됨.",
    ),
  trigger: z
    .string()
    .optional()
    .describe(
      "회귀/빙의/각성을 촉발한 사건 요약 (예: '독배를 마시고 눈을 뜨니 1년 전 약혼식 아침이었다'). " +
      "1화 realization event의 cause로 사용.",
    ),
  awareness_chapter: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      "자각이 일어나는 화. 기본 1화. GenreConvention 룰이 이 화에 한해 결정적으로 hook 이벤트를 emit.",
    ),
  must_understand: z
    .array(z.string())
    .default([])
    .describe(
      "1화 끝나기 전 독자가 반드시 이해해야 하는 사실들. EditorialPlan의 " +
      "audience_must_understand로 자동 등재되어 검증 게이트의 대상이 됨.",
    ),
  fallback_lines: z
    .object({
      flashback: z.string().optional().describe(
        "회상이 본문에 풀려나오지 못했을 때 결정적으로 삽입할 한 줄.",
      ),
      realization: z.string().optional().describe(
        "회귀/빙의 자각이 본문에 풀려나오지 못했을 때 결정적으로 삽입할 한 줄.",
      ),
      time_jump: z.string().optional().describe(
        "시간 점프가 본문에 풀려나오지 못했을 때 결정적으로 삽입할 한 줄.",
      ),
    })
    .optional()
    .describe(
      "검증 게이트가 must_understand 누락을 감지했을 때 결정적으로 본문에 삽입할 fallback 라인. " +
      "비워두면 GenreConvention이 past_life_summary/trigger에서 default 문장을 결정적으로 생성.",
    ),
});

export type GenreOrigin = z.infer<typeof GenreOriginSchema>;

export const CharacterStateSchema = z.object({
  level: z
    .preprocess((v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const match = v.match(/\d+/);
        return match ? parseInt(match[0], 10) : null;
      }
      return null;
    }, z.number().int().nullable())
    .default(null)
    .describe("Power level if applicable"),
  location: z.string().nullable().default(null).describe("Current location"),
  status: z
    .string()
    .default("normal")
    .describe("Current status (normal, injured, etc.)"),
  relationships: z
    .preprocess((v) => {
      if (Array.isArray(v)) {
        const record: Record<string, string> = {};
        for (const item of v) {
          if (typeof item === "string") {
            const [key, ...rest] = item.split(/[:：]\s*/);
            record[key.trim()] = rest.join(":").trim() || "관계";
          } else if (typeof item === "object" && item !== null) {
            const obj = item as Record<string, unknown>;
            const name = String(obj.name || obj.id || Object.values(obj)[0] || "");
            const desc = String(obj.description || obj.status || obj.relation || Object.values(obj)[1] || name);
            if (name) record[name] = desc;
          }
        }
        return record;
      }
      return v;
    }, z.record(z.string(), z.string()))
    .default({})
    .describe("Relationships with other characters (name -> status)"),
  inventory: z
    .array(z.string())
    .default([])
    .describe("Important items held"),
  secrets_known: z
    .array(z.string())
    .default([])
    .describe("Secrets this character knows"),
  realization_stage: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe(
      "내면 깨달음 단계. 1=모름, 2=의심, 3=단서 포착, 4=거의 확신, 5=완전 자각. " +
      "internal_arc.misbelief를 뒤집는 과정을 추적. " +
      "이미 높은 단계에 도달했으면 Writer가 재서술/재발견 금지.",
    ),
});

export type CharacterState = z.infer<typeof CharacterStateSchema>;

export const CharacterSchema = z.object({
  id: z.string().describe("Unique character identifier"),
  name: z.string().describe("Character name"),
  role: z.string().describe("Role in story (주인공, 히로인, 악역, etc.)"),
  gender: z
    .enum(["male", "female", "other"])
    .optional()
    .describe("Character gender — controls pronouns (그/그녀) and honorifics. Defaults to 'male' if omitted."),
  social_rank: z
    .enum(["royal", "noble", "gentry", "commoner", "servant", "slave", "outcast"])
    .default("commoner")
    .describe("사회적 신분 — 대화/행동 제약을 결정. royal: 왕족, noble: 귀족, gentry: 사대부/기사, commoner: 평민, servant: 하인/시녀, slave: 노예, outcast: 추방자"),
  house: z.string().optional().describe("소속 가문/집안"),
  faction: z.string().optional().describe("소속 파벌/진영"),
  public_title: z.string().optional().describe("공적 자리에서 주로 불리는 칭호"),
  court_position: z.string().optional().describe("궁정/가문 내 공식 위치나 직함"),
  introduction_chapter: z
    .preprocess((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const match = v.match(/\d+/);
        return match ? parseInt(match[0], 10) : 1;
      }
      return 1;
    }, z.number().int())
    .describe("Chapter where character first appears"),

  // Fixed - never compressed
  voice: CharacterVoiceSchema.describe("Speech patterns and personality"),
  backstory: z.string().describe("Character backstory"),
  arc_summary: z
    .string()
    .describe("Character's growth arc throughout the story"),
  address_hints: z.array(CharacterAddressHintSchema).optional().describe(
    "관계별 호칭/화계 힌트. 예: 시녀→아가씨, 동생→언니 같은 비대칭 규칙"
  ),
  relationship_facts: z.array(RelationshipFactSchema).optional().describe(
    "자유서술 relationships를 보조/대체하는 구조화된 관계 truth"
  ),
  masking_habit: z.string().optional().describe("공적 얼굴과 사적 진실 사이를 어떻게 숨기는지"),
  intent_profile: IntentProfileSchema.optional().describe("현재 욕망/두려움/leverage truth"),
  access_profile: AccessProfileSchema.optional().describe("지식/출입/감시 위험 truth"),
  genre_origin: GenreOriginSchema.optional().describe(
    "회귀/빙의/환생/각성 같은 장르 원형. 있으면 GenreConvention이 1화 hook을 결정적으로 생성.",
  ),
  internal_arc: z
    .object({
      want: z
        .string()
        .describe(
          "외부 목표. 캐릭터가 명시적으로 원한다고 말하는 것 (예: '황위 탈환', '북부로 도주', '복수'). " +
          "플롯의 엔진이 되는 외부 goal.",
        ),
      need: z
        .string()
        .describe(
          "내면 진실. 캐릭터가 진짜 성장하려면 받아들여야 할 것 (예: '약함을 인정하기', '타인에게 의지해도 됨'). " +
          "want와 보통 충돌.",
        ),
      misbelief: z
        .string()
        .describe(
          "캐릭터가 붙잡은 잘못된 믿음. 이게 want를 낳고, 클라이맥스에서 깨져야 need가 드러남 " +
          "(예: '혼자 버텨야만 살아남는다', '도움은 늘 대가를 요구한다').",
        ),
      aha_chapter: z
        .number()
        .int()
        .optional()
        .describe("misbelief가 완전히 뒤집히는 목표 회차. 없어도 됨."),
    })
    .optional()
    .describe(
      "Character Arc의 내면 구조. Want vs Need + Misbelief. " +
      "Lisa Cron의 Story Genius 방식. 매 씬은 misbelief를 한 번씩 흔들거나 강화해야 함. " +
      "없어도 됨(주연만 권장).",
    ),

  // Mutable - updated each chapter
  state: CharacterStateSchema.default({
    level: null,
    location: null,
    status: "normal",
    relationships: {},
    inventory: [],
    secrets_known: [],
    realization_stage: 1,
  }),
});

export type Character = z.infer<typeof CharacterSchema>;

function normalizeRelationLookup(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function getRelationshipFactForPair<T extends Pick<Character, "id" | "name"> & { relationship_facts?: RelationshipFact[] }>(
  from: T,
  to: Pick<Character, "id" | "name">,
): RelationshipFact | undefined {
  const targets = new Set([
    normalizeRelationLookup(to.id),
    normalizeRelationLookup(to.name),
    normalizeRelationLookup(to.name.split(/\s+/)[0] || to.name),
  ]);
  return (from.relationship_facts || []).find((fact) => targets.has(normalizeRelationLookup(fact.target)));
}

export function getAddressHintForPair<T extends Pick<Character, "id" | "name"> & { address_hints?: CharacterAddressHint[] }>(
  from: T,
  to: Pick<Character, "id" | "name">,
): CharacterAddressHint | undefined {
  const targets = new Set([
    normalizeRelationLookup(to.id),
    normalizeRelationLookup(to.name),
    normalizeRelationLookup(to.name.split(/\s+/)[0] || to.name),
  ]);
  return (from.address_hints || []).find((hint) => targets.has(normalizeRelationLookup(hint.to)));
}

function normalizeCharacterRef(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCharacterRefNoSpace(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * Character references in prompts/blueprints are not consistently emitted as IDs.
 * Accept common human-facing variants such as full name and first token.
 */
export function getCharacterReferenceVariants(
  character: Pick<Character, "id" | "name">,
): string[] {
  const variants = new Set<string>();
  const fullName = normalizeCharacterRef(character.name);

  variants.add(normalizeCharacterRef(character.id));
  variants.add(fullName);

  const compactName = normalizeCharacterRefNoSpace(fullName);
  if (compactName && compactName !== fullName) {
    variants.add(compactName);
  }

  const firstToken = fullName.split(/\s+/)[0];
  if (firstToken && firstToken.length >= 2) {
    variants.add(firstToken);
  }

  return [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
}

export function resolveCharacterReference<T extends Pick<Character, "id" | "name">>(
  reference: string,
  characters: T[],
): T | undefined {
  const normalized = normalizeCharacterRef(reference);
  const compact = normalizeCharacterRefNoSpace(reference);

  return characters.find((character) =>
    getCharacterReferenceVariants(character).some((variant) =>
      variant === normalized || normalizeCharacterRefNoSpace(variant) === compact
    )
  );
}


export interface DialoguePlaybook {
  taxonomies: RelationTaxonomy[];
  preferredTone: string;
  forbiddenPhrases: string[];
  preferredPatterns: string[];
  note?: string;
}

function relationTextBetween(from: Pick<Character, "state">, to: Pick<Character, "id" | "name">): string {
  const rel = from.state.relationships || {};
  return String(rel[to.id] || rel[to.name] || rel[to.name.split(/\s+/)[0] || ""] || "");
}

export function inferRelationTaxonomies<T extends Character>(
  from: T,
  to: Pick<Character, "id" | "name" | "social_rank" | "gender">,
): RelationTaxonomy[] {
  const tags: RelationTaxonomy[] = [];
  const explicit = getAddressHintForPair(from, to as Pick<Character, "id" | "name">);
  if (explicit?.relation) tags.push(explicit.relation);
  const structured = getRelationshipFactForPair(from as T & { relationship_facts?: RelationshipFact[] }, to as Pick<Character, "id" | "name">);
  if (structured) {
    if (structured.kinship === "elder_sibling") tags.push("younger_to_elder_sibling");
    if (structured.kinship === "younger_sibling") tags.push("elder_to_younger_sibling");
    if (structured.service === "serves") tags.push("servant_to_mistress");
    if (structured.service === "served_by") tags.push("mistress_to_servant");
    if (structured.romance_role !== "none") tags.push("formal_fiance_under_tension");
    if (structured.public_face === "hostile_masked") tags.push("public_masked_hostility");
    if (structured.private_truth === "devoted") tags.push("trusted_attendant");
  }

  const relText = relationTextBetween(from, to);
  if (/(언니|누나|오빠|형)/.test(relText)) tags.push("younger_to_elder_sibling");
  if (/(동생)/.test(relText)) tags.push("elder_to_younger_sibling");
  if (/(시녀|하녀|시종|집사|측근|모시)/.test(relText)) tags.push("trusted_attendant");
  if (/(약혼|정략혼|혼인)/.test(relText)) tags.push("formal_fiance_under_tension");
  if (/(경계|불신|대치|위선|견제|적대)/.test(relText)) tags.push("public_masked_hostility");

  if (from.social_rank === "servant" && ["noble", "gentry", "royal"].includes(to.social_rank)) {
    tags.push("servant_to_mistress");
  }
  if (["noble", "gentry", "royal"].includes(from.social_rank) && to.social_rank === "servant") {
    tags.push("mistress_to_servant");
  }

  return [...new Set(tags)];
}

export function getDialoguePlaybookForPair<T extends Character>(
  from: T,
  to: Pick<Character, "id" | "name" | "social_rank" | "gender">,
): DialoguePlaybook {
  const taxonomies = inferRelationTaxonomies(from, to);
  const structured = getRelationshipFactForPair(from as T & { relationship_facts?: RelationshipFact[] }, to as Pick<Character, "id" | "name">);
  const forbidden = new Set<string>(structured?.forbidden_register || []);
  const preferred = new Set<string>(structured?.preferred_patterns || []);
  let preferredTone = structured?.preferred_register || "상대와의 관계에 맞는 기본 말투를 유지하되, 공손함과 감정의 미세한 온도를 같이 살릴 것";
  const notes: string[] = [];
  if (structured?.note) notes.push(structured.note);

  for (const tag of taxonomies) {
    switch (tag) {
      case "servant_to_mistress":
        preferredTone = "시녀/하인으로서 존대를 유지하되, 걱정은 다정하게 표현할 것";
        ["왜 그래", "알겠어", "내가 볼게", "괜찮아?", "하지 마"].forEach((p) => forbidden.add(p));
        ["왜 그러세요", "알겠어요", "제가 볼게요", "괜찮으세요", "하지 마세요"].forEach((p) => preferred.add(p));
        notes.push("호칭이 맞아도 직설 반말 표현은 금지");
        break;
      case "mistress_to_servant":
        preferredTone = "상급자의 권위를 잃지 않되, 이름을 부르며 짧고 자연스럽게 지시할 것";
        ["배려는 감사히 받되", "판단하는 편이 익숙해서요"].forEach((p) => forbidden.add(p));
        ["마리안, 내가 할게", "잠깐 나가 있어 줘"].forEach((p) => preferred.add(p));
        break;
      case "younger_to_elder_sibling":
        preferredTone = "언니 호칭을 기본으로, 가족 사이의 부드러운 존대와 숨은 감정을 섞을 것";
        ["배려는 감사히 받되", "제가 판단하는 편이 익숙해서요", "확인하겠습니다"].forEach((p) => forbidden.add(p));
        ["언니가 신경 써 주는 건 고마워요", "그래도 이건 제가 볼게요"].forEach((p) => preferred.add(p));
        notes.push("공문서/면담체처럼 지나치게 딱딱한 문어체 금지");
        break;
      case "elder_to_younger_sibling":
        preferredTone = "윗형제의 여유와 친근함을 유지하되, 감시/통제 의도가 있으면 다정한 말 속에 숨길 것";
        ["배려는 감사히 받되"].forEach((p) => forbidden.add(p));
        ["걱정돼서 그러지", "너무 무리하지 말아"].forEach((p) => preferred.add(p));
        break;
      case "formal_fiance_under_tension":
        preferredTone = "격식 있는 약혼 관계를 유지하되, 예의 속에서 탐색과 경계를 드러낼 것";
        ["배려는 감사히 받되"].forEach((p) => forbidden.add(p));
        ["와 주셔서 영광이에요", "오늘은 유난히 다정하시네요"].forEach((p) => preferred.add(p));
        break;
      case "public_masked_hostility":
        preferredTone = "겉으로는 부드럽고 예의를 지키지만, 속뜻은 선 긋기와 탐색으로 흐르게 할 것";
        ["확인하겠습니다"].forEach((p) => forbidden.add(p));
        ["고마워요", "그래도 이번엔 제가 볼게요"].forEach((p) => preferred.add(p));
        break;
      case "trusted_attendant":
        preferredTone = "친밀함은 허용하되, 신분선을 넘는 반말이나 무례함은 금지";
        ["왜 그래"].forEach((p) => forbidden.add(p));
        ["괜찮으세요", "제가 옆에 있을게요"].forEach((p) => preferred.add(p));
        break;
    }
  }

  return {
    taxonomies,
    preferredTone,
    forbiddenPhrases: [...forbidden],
    preferredPatterns: [...preferred],
    note: notes.length > 0 ? notes.join(" / ") : undefined,
  };
}
