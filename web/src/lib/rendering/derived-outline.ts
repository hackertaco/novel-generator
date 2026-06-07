/**
 * Derived Outline (솎기) — 시뮬 로그에서 줄거리를 "발견"한다.
 * spec: docs/superpowers/specs/2026-06-08-outline-inversion-design.md §6
 *
 * 하이브리드 원칙:
 *  - 1·2단계(절단 후보 채점 → 경계 확정)는 결정적 — 같은 로그 + 같은 분량 → 같은 구성.
 *  - 3단계(제목/한줄 이름표)만 LLM(주입형) — 골격(포함 사건/절단점)은 바꿀 수 없다.
 */

export interface DerivedOutlineSceneInput {
  sceneId: string;
  chapter: number;
  eventIds: string[];
  /** 그 장면의 압력 피크 (정수). */
  pressurePeak: number;
}

export interface DerivedOutlineEventInput {
  id: string;
  chapter: number;
  tags: string[];
  summary: string;
}

export interface DerivedOutlineChapter {
  number: number;
  title: string;
  oneLiner: string;
  sourceSceneIds: string[];
  sourceEventIds: string[];
  /** 절단점 — 이 화의 마지막 사건 (cliffhanger 후보). */
  endsOn: string | null;
  tensionPeak: number;
}

export interface DerivedOutline {
  chapters: DerivedOutlineChapter[];
  totalChapters: number;
}

// 경계 점수 가중 (정수)
const W = {
  schemeTransition: 1000,
  cutPointCandidate: 400,
  foreshadowReveal: 200,
  pressureMul: 10,
} as const;

function boundaryScore(scene: DerivedOutlineSceneInput, eventsById: Map<string, DerivedOutlineEventInput>): number {
  let tagScore = 0;
  let hasTransition = false;
  let hasCutPoint = false;
  let hasReveal = false;
  for (const eventId of scene.eventIds) {
    const tags = eventsById.get(eventId)?.tags ?? [];
    if (tags.includes("scheme-transition")) hasTransition = true;
    else if (tags.includes("cut-point-candidate")) hasCutPoint = true;
    if (tags.some((tag) => tag.includes("foreshadow") && tag.includes("reveal"))) hasReveal = true;
  }
  if (hasTransition) tagScore += W.schemeTransition;
  else if (hasCutPoint) tagScore += W.cutPointCandidate;
  if (hasReveal) tagScore += W.foreshadowReveal;
  return tagScore + scene.pressurePeak * W.pressureMul;
}

/**
 * 결정적 솎기: M-1개 화 경계를 "이상 위치 ±창" 안에서 점수 최대 후보로 고른다.
 * 후보가 없으면(점수 동률) 이상 위치 = 균등 분할로 수렴. 명시적 루프, .sort 미사용.
 */
export function cullDerivedOutline(input: {
  scenes: DerivedOutlineSceneInput[];
  events: DerivedOutlineEventInput[];
  /** 분량 입력 M — 화수는 주문, 경계는 발견. */
  totalChapters: number;
}): DerivedOutline {
  const scenes = input.scenes;
  const eventsById = new Map(input.events.map((event) => [event.id, event]));
  const sceneCount = scenes.length;
  const chapterCount = Math.max(1, Math.min(input.totalChapters, sceneCount));

  // 경계 위치 b = "scene[b-1] 직후" (1-based, 1..n-1)
  const scores: number[] = [];
  for (let b = 1; b <= sceneCount - 1; b += 1) {
    scores[b] = boundaryScore(scenes[b - 1]!, eventsById);
  }

  const window = Math.max(1, Math.floor(sceneCount / chapterCount / 2));
  const boundaries: number[] = [];
  let previous = 0;
  for (let k = 1; k <= chapterCount - 1; k += 1) {
    const ideal = Math.round((k * sceneCount) / chapterCount);
    const lo = Math.max(previous + 1, ideal - window);
    const hi = Math.min(sceneCount - 1, ideal + window);
    let chosen = Math.min(sceneCount - 1, previous + 1);
    if (lo <= hi) {
      let bestScore = -1;
      let bestDistance = Number.MAX_SAFE_INTEGER;
      for (let b = lo; b <= hi; b += 1) {
        const score = scores[b] ?? 0;
        const distance = Math.abs(b - ideal);
        if (score > bestScore || (score === bestScore && distance < bestDistance)) {
          bestScore = score;
          bestDistance = distance;
          chosen = b;
        }
      }
    }
    boundaries.push(chosen);
    previous = chosen;
  }

  // 경계로 화 구성
  const chapters: DerivedOutlineChapter[] = [];
  let start = 0;
  for (let index = 0; index <= boundaries.length; index += 1) {
    const end = index < boundaries.length ? boundaries[index]! : sceneCount;
    const slice = scenes.slice(start, end);
    if (slice.length === 0) continue;
    const sourceEventIds = slice.flatMap((scene) => scene.eventIds);
    const lastScene = slice[slice.length - 1]!;
    chapters.push({
      number: chapters.length + 1,
      title: `${chapters.length + 1}화`,
      oneLiner: eventsById.get(sourceEventIds[0] ?? "")?.summary ?? "",
      sourceSceneIds: slice.map((scene) => scene.sceneId),
      sourceEventIds,
      endsOn: lastScene.eventIds[lastScene.eventIds.length - 1] ?? null,
      tensionPeak: Math.max(...slice.map((scene) => scene.pressurePeak)),
    });
    start = end;
  }

  return { chapters, totalChapters: chapters.length };
}

/**
 * 3단계 — 이름표 (LLM 주입형 + 결정적 폴백).
 * labelWriter 는 title/oneLiner 만 반환할 수 있고, 골격(사건/절단점)은 복사되지 않는다.
 */
export async function labelDerivedOutline(input: {
  outline: DerivedOutline;
  eventSummariesById: Record<string, string>;
  labelWriter?: (
    chapter: DerivedOutlineChapter,
    eventSummaries: string[],
  ) => Promise<{ title: string; oneLiner: string }>;
}): Promise<DerivedOutline> {
  const chapters: DerivedOutlineChapter[] = [];
  for (const chapter of input.outline.chapters) {
    if (!input.labelWriter) {
      chapters.push({
        ...chapter,
        title: `${chapter.number}화`,
        oneLiner: chapter.oneLiner || `${chapter.sourceSceneIds.length}개 장면`,
      });
      continue;
    }
    const summaries = chapter.sourceEventIds
      .map((eventId) => input.eventSummariesById[eventId])
      .filter((summary): summary is string => Boolean(summary));
    const label = await input.labelWriter(chapter, summaries);
    chapters.push({
      ...chapter, // 골격 불변 — label 에서는 title/oneLiner 만 취한다.
      title: label.title,
      oneLiner: label.oneLiner,
    });
  }
  return { chapters, totalChapters: input.outline.totalChapters };
}
