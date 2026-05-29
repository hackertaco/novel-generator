import type { NovelSeed } from "@/lib/schema/novel";
import type { WorldBrain } from "./world-brain";

export type ChapterMicroBeatSource =
  | "arc_key_event"
  | "foreshadow_plant"
  | "foreshadow_hint"
  | "foreshadow_reveal"
  | "character_plan"
  | "genre_origin";

export interface ChapterMicroBeat {
  source: ChapterMicroBeatSource;
  beat: string;
}

export interface DeriveChapterMicroBeatsInput {
  seed: NovelSeed;
  brain: WorldBrain;
  chapter: number;
  characterIds: ReadonlyArray<string>;
}

function dedupeBeats(beats: ChapterMicroBeat[]): ChapterMicroBeat[] {
  const seen = new Set<string>();
  const result: ChapterMicroBeat[] = [];
  for (const beat of beats) {
    const key = beat.beat.replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ source: beat.source, beat: key });
  }
  return result;
}

function deriveArcBeat(
  seed: NovelSeed,
  chapter: number,
): ChapterMicroBeat[] {
  const arc = seed.arcs.find(
    (candidate) => candidate.start_chapter <= chapter && chapter <= candidate.end_chapter,
  );
  if (!arc || arc.key_events.length === 0) return [];

  const span = Math.max(1, arc.end_chapter - arc.start_chapter + 1);
  const rel = chapter - arc.start_chapter;
  const index = Math.min(
    arc.key_events.length - 1,
    Math.max(0, Math.floor((rel / span) * arc.key_events.length)),
  );
  const beats: ChapterMicroBeat[] = [
    { source: "arc_key_event", beat: arc.key_events[index] },
  ];
  // Arc 시작화는 첫 key_event를 확실히 포함 (도입 anchor).
  if (rel === 0 && index !== 0) {
    beats.unshift({ source: "arc_key_event", beat: arc.key_events[0] });
  }
  return beats;
}

function deriveForeshadowBeats(
  seed: NovelSeed,
  chapter: number,
): ChapterMicroBeat[] {
  const beats: ChapterMicroBeat[] = [];
  for (const foreshadow of seed.foreshadowing) {
    const label = foreshadow.description?.trim()
      || foreshadow.canonical_target?.trim()
      || foreshadow.name?.trim();
    if (!label) continue;

    if (foreshadow.planted_at === chapter) {
      beats.push({ source: "foreshadow_plant", beat: `복선 심기 — ${label}` });
    }
    if ((foreshadow.hints_at ?? []).includes(chapter)) {
      beats.push({ source: "foreshadow_hint", beat: `복선 힌트 — ${foreshadow.name ?? label}` });
    }
    if (foreshadow.reveal_at === chapter) {
      beats.push({
        source: "foreshadow_reveal",
        beat: `복선 공개 — ${foreshadow.canonical_target?.trim() || label}`,
      });
    }
  }
  return beats;
}

function deriveCharacterPlanBeats(
  brain: WorldBrain,
  characterIds: ReadonlyArray<string>,
): ChapterMicroBeat[] {
  const beats: ChapterMicroBeat[] = [];
  for (const characterId of characterIds) {
    const mind = brain.characterMinds[characterId];
    if (!mind) continue;
    const plan = mind.currentPlan?.trim();
    const hidden = mind.desires?.hiddenGoal?.trim();
    if (plan) {
      const hiddenSuffix = hidden && hidden !== plan ? ` (속내: ${hidden})` : "";
      beats.push({ source: "character_plan", beat: `${mind.name}: ${plan}${hiddenSuffix}` });
    }
  }
  return beats;
}

function deriveGenreOriginBeats(
  seed: NovelSeed,
  chapter: number,
  characterIds: ReadonlyArray<string>,
): ChapterMicroBeat[] {
  const beats: ChapterMicroBeat[] = [];
  const idSet = new Set(characterIds);
  for (const character of seed.characters) {
    if (!idSet.has(character.id)) continue;
    const origin = character.genre_origin;
    if (!origin) continue;
    if ((origin.awareness_chapter ?? 1) !== chapter) continue;
    const must = origin.must_understand?.[0]?.trim();
    beats.push({
      source: "genre_origin",
      beat: must ? `${character.name}: ${must}` : `${character.name}: 장르 자각(${origin.kind})`,
    });
  }
  return beats;
}

export function deriveChapterMicroBeats(
  input: DeriveChapterMicroBeatsInput,
): ChapterMicroBeat[] {
  const { seed, brain, chapter, characterIds } = input;
  return dedupeBeats([
    ...deriveGenreOriginBeats(seed, chapter, characterIds),
    ...deriveArcBeat(seed, chapter),
    ...deriveForeshadowBeats(seed, chapter),
    ...deriveCharacterPlanBeats(brain, characterIds),
  ]);
}
