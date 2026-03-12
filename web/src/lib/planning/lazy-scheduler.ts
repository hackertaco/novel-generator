import type {
  MasterPlan,
  PartPlan,
  ArcPlan,
  ChapterBlueprint,
} from "@/lib/schema/planning";

export class LazyScheduler {
  constructor(private plan: MasterPlan) {}

  getPartForChapter(chapter: number): PartPlan | undefined {
    return this.plan.parts.find(
      (p) => p.start_chapter <= chapter && chapter <= p.end_chapter,
    );
  }

  getArcForChapter(chapter: number): ArcPlan | undefined {
    for (const part of this.plan.parts) {
      const arc = part.arcs.find(
        (a) => a.start_chapter <= chapter && chapter <= a.end_chapter,
      );
      if (arc) return arc;
    }
    return undefined;
  }

  getBlueprint(chapter: number): ChapterBlueprint | undefined {
    const arc = this.getArcForChapter(chapter);
    if (!arc) return undefined;
    return arc.chapter_blueprints.find((b) => b.chapter_number === chapter);
  }

  needsArcPlanning(chapter: number): boolean {
    const part = this.getPartForChapter(chapter);
    if (!part) return false;
    return part.arcs.length === 0;
  }

  needsChapterBlueprint(chapter: number): boolean {
    return this.getBlueprint(chapter) === undefined;
  }

  getPlanningNeeds(chapter: number): {
    needsL2: boolean;
    needsL3: boolean;
    part?: PartPlan;
    arc?: ArcPlan;
  } {
    const part = this.getPartForChapter(chapter);
    const needsL2 = this.needsArcPlanning(chapter);
    const arc = this.getArcForChapter(chapter);
    const needsL3 = this.needsChapterBlueprint(chapter);
    return { needsL2, needsL3, part, arc };
  }
}
