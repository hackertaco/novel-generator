import type { Character } from "@/lib/schema/character";
import type { NovelSeed } from "@/lib/schema/novel";

export interface OpeningSetupCharacterEntry {
  characterId: string;
  name: string;
  shortLabel: string;
  relationToProtagonist?: string;
}

export interface OpeningSetupContext {
  chapter: number;
  scenePremise: string;
  protagonist: OpeningSetupCharacterEntry;
  introducedCharacters: OpeningSetupCharacterEntry[];
  centralTension: string;
}

export interface BuildOpeningSetupContextInput {
  seed: NovelSeed;
  chapter: number;
  participantIds: ReadonlyArray<string>;
  sceneLocation?: string | null;
  sceneTitle?: string;
  sceneAtmosphere?: string;
}

function pickProtagonist(seed: NovelSeed): Character | undefined {
  const heroByRole = seed.characters.find((character) =>
    /주인공|hero|protagonist/i.test(character.role ?? ""),
  );
  if (heroByRole) return heroByRole;
  return seed.characters[0];
}

function shortLabelFor(character: Character): string {
  const segments: string[] = [];
  if (character.public_title) segments.push(character.public_title);
  else if (character.house) segments.push(character.house);
  if (character.role && !segments.some((part) => part.includes(character.role!))) {
    segments.push(character.role);
  }
  return segments.length > 0 ? `${character.name} (${segments.join(", ")})` : character.name;
}

function relationToProtagonist(
  protagonist: Character | undefined,
  candidate: Character,
): string | undefined {
  if (!protagonist || protagonist.id === candidate.id) return undefined;
  const fromProtagonist = (protagonist.relationship_facts ?? []).find(
    (fact) => fact.target === candidate.id || fact.target === candidate.name,
  );
  if (fromProtagonist) {
    const parts: string[] = [];
    if (fromProtagonist.romance_role === "primary") parts.push("약혼자");
    else if (fromProtagonist.romance_role === "rival") parts.push("연적");
    if (fromProtagonist.kinship === "elder_sibling") parts.push("언니/오빠");
    if (fromProtagonist.kinship === "younger_sibling") parts.push("동생");
    if (fromProtagonist.service === "served_by") parts.push("측근/시녀");
    if (fromProtagonist.service === "serves") parts.push("모시는 윗사람");
    if (fromProtagonist.public_face === "hostile_masked") parts.push("겉은 화친 속은 적대");
    if (fromProtagonist.private_truth === "devoted") parts.push("진짜 충성");
    if (fromProtagonist.private_truth === "hostile") parts.push("속내 적대");
    if (parts.length > 0) return parts.join(", ");
  }

  const protagonistRelText = protagonist.state?.relationships?.[candidate.id]
    ?? protagonist.state?.relationships?.[candidate.name];
  if (protagonistRelText) return protagonistRelText;
  return undefined;
}

function deriveCentralTension(
  protagonist: Character | undefined,
): string {
  if (!protagonist) return "이번 화의 핵심 갈등을 한 문장으로 드러내라.";
  const origin = protagonist.genre_origin;
  const arc = protagonist.internal_arc;
  const parts: string[] = [];
  if (origin?.trigger) parts.push(origin.trigger);
  if (origin?.must_understand && origin.must_understand.length > 0) {
    parts.push(origin.must_understand[0]);
  }
  if (arc?.want) parts.push(`주인공의 외부 목표: ${arc.want}`);
  if (arc?.misbelief) parts.push(`아직 깨지지 않은 잘못된 믿음: ${arc.misbelief}`);
  return parts.length > 0
    ? parts.join(" / ")
    : "주인공이 처음 마주하는 위협을 한 줄로 드러내라.";
}

export function buildOpeningSetupContext(
  input: BuildOpeningSetupContextInput,
): OpeningSetupContext | undefined {
  if (input.chapter !== 1) return undefined;

  const protagonist = pickProtagonist(input.seed);
  if (!protagonist) return undefined;

  const participantSet = new Set(input.participantIds);
  const introducedCharacters: OpeningSetupCharacterEntry[] = input.seed.characters
    .filter((character) =>
      character.id !== protagonist.id
      && (participantSet.has(character.id) || character.introduction_chapter === input.chapter),
    )
    .map((character) => ({
      characterId: character.id,
      name: character.name,
      shortLabel: shortLabelFor(character),
      relationToProtagonist: relationToProtagonist(protagonist, character),
    }));

  const sceneLocation = input.sceneLocation?.trim();
  const sceneTitle = input.sceneTitle?.trim();
  const atmosphere = input.sceneAtmosphere?.trim();
  const scenePremiseParts: string[] = [];
  if (sceneLocation) scenePremiseParts.push(sceneLocation);
  if (sceneTitle) scenePremiseParts.push(sceneTitle);
  if (atmosphere) scenePremiseParts.push(atmosphere);
  const scenePremise = scenePremiseParts.length > 0
    ? scenePremiseParts.join(" — ")
    : "장면의 시간·장소·분위기를 한 줄로 깔아라.";

  return {
    chapter: input.chapter,
    scenePremise,
    protagonist: {
      characterId: protagonist.id,
      name: protagonist.name,
      shortLabel: shortLabelFor(protagonist),
    },
    introducedCharacters,
    centralTension: deriveCentralTension(protagonist),
  };
}

export function formatOpeningSetupContextForPrompt(
  context: OpeningSetupContext | undefined,
): string {
  if (!context) return "";

  const lines: string[] = [
    `# 이번 화 독자 진입 (Reader Onboarding)`,
    `독자는 이 작품을 처음 읽는다. 본문 도입부 약 300자 안에 아래 정보가 자연스럽게 풀려야 한다.`,
    `라벨이나 리스트를 본문에 그대로 인용하지 말 것. 호칭, 소개, 사소한 단서, 행동, 시선으로 풀어쓴다.`,
    ``,
    `장면: ${context.scenePremise}`,
    `주인공: ${context.protagonist.shortLabel}`,
  ];

  if (context.introducedCharacters.length > 0) {
    lines.push(`이번 화 등장 인물 (주인공과의 관계):`);
    for (const character of context.introducedCharacters) {
      const relation = character.relationToProtagonist
        ? ` — ${character.relationToProtagonist}`
        : "";
      lines.push(`- ${character.shortLabel}${relation}`);
    }
  }

  lines.push(`핵심 갈등: ${context.centralTension}`);
  return lines.join("\n");
}
