"""Summary extractor for chapters."""

import re

from novel_generator.schema.chapter import (
    ChapterSummary,
    ChapterEvent,
    CharacterChange,
    ForeshadowingTouch,
    EventType,
)


class SummaryExtractor:
    """Extracts structured summary from chapter content.

    Note: In production, this should use LLM for accurate extraction.
    This implementation provides a rule-based fallback.
    """

    def extract(
        self,
        chapter_number: int,
        title: str,
        content: str,
        llm_summary: dict | None = None,
    ) -> ChapterSummary:
        """Extract structured summary from chapter.

        Args:
            chapter_number: Chapter number
            title: Chapter title
            content: Full chapter content
            llm_summary: Optional LLM-generated structured summary

        Returns:
            Structured ChapterSummary
        """
        if llm_summary:
            return self._from_llm_summary(chapter_number, title, content, llm_summary)

        return self._extract_rule_based(chapter_number, title, content)

    def _from_llm_summary(
        self,
        chapter_number: int,
        title: str,
        content: str,
        llm_summary: dict,
    ) -> ChapterSummary:
        """Create summary from LLM-generated data."""
        events = []
        for evt in llm_summary.get("events", []):
            try:
                events.append(ChapterEvent(
                    type=EventType(evt.get("type", "dialogue")),
                    participants=evt.get("participants", []),
                    description=evt.get("description", ""),
                    outcome=evt.get("outcome"),
                    consequences=evt.get("consequences", {}),
                ))
            except ValueError:
                continue

        character_changes = []
        for change in llm_summary.get("character_changes", []):
            character_changes.append(CharacterChange(
                character_id=change.get("character_id", ""),
                changes=change.get("changes", {}),
            ))

        foreshadowing_touched = []
        for fs in llm_summary.get("foreshadowing_touched", []):
            foreshadowing_touched.append(ForeshadowingTouch(
                foreshadowing_id=fs.get("foreshadowing_id", ""),
                action=fs.get("action", "hint"),
                context=fs.get("context", ""),
            ))

        return ChapterSummary(
            chapter_number=chapter_number,
            title=title,
            events=events,
            character_changes=character_changes,
            foreshadowing_touched=foreshadowing_touched,
            plot_summary=llm_summary.get("plot_summary", ""),
            emotional_beat=llm_summary.get("emotional_beat", ""),
            cliffhanger=llm_summary.get("cliffhanger"),
            word_count=len(content),
        )

    def _extract_rule_based(
        self, chapter_number: int, title: str, content: str
    ) -> ChapterSummary:
        """Rule-based extraction fallback."""
        # Extract basic info
        word_count = len(content)

        # Try to identify events from keywords
        events = []
        event_keywords = {
            EventType.BATTLE: ["싸움", "전투", "공격", "방어", "검", "마법"],
            EventType.DIALOGUE: ["말했다", "물었다", "대답했다", "속삭였다"],
            EventType.DISCOVERY: ["발견", "알게", "깨달", "비밀"],
            EventType.ROMANCE: ["심장", "두근", "사랑", "고백"],
        }

        for event_type, keywords in event_keywords.items():
            if any(kw in content for kw in keywords):
                events.append(ChapterEvent(
                    type=event_type,
                    participants=[],
                    description=f"Detected {event_type.value} event",
                ))

        # Extract last paragraph for cliffhanger
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        cliffhanger = paragraphs[-1][:100] if paragraphs else None

        # Generate basic summary (first 2 sentences)
        sentences = re.split(r'[.!?]\s+', content)
        plot_summary = ". ".join(sentences[:2]) + "." if sentences else ""

        return ChapterSummary(
            chapter_number=chapter_number,
            title=title,
            events=events[:3],
            character_changes=[],
            foreshadowing_touched=[],
            plot_summary=plot_summary[:200],
            emotional_beat="unknown",
            cliffhanger=cliffhanger,
            word_count=word_count,
        )

    def validate_summary(
        self, summary: ChapterSummary, content: str
    ) -> dict:
        """Validate summary against original content."""
        issues = []

        # Check if plot_summary seems reasonable
        if len(summary.plot_summary) < 20:
            issues.append("Plot summary too short")

        # Check word count accuracy
        actual_count = len(content)
        if abs(summary.word_count - actual_count) > 100:
            issues.append(f"Word count mismatch: {summary.word_count} vs {actual_count}")

        # Check events make sense
        for event in summary.events:
            if not event.participants:
                issues.append(f"Event {event.type} has no participants")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "confidence": 1.0 - len(issues) * 0.2,
        }
