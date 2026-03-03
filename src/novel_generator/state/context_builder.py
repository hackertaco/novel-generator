"""Context builder for chapter generation."""

from novel_generator.schema.novel import NovelSeed
from novel_generator.schema.chapter import ChapterSummary
from novel_generator.schema.character import Character, CharacterState
from novel_generator.state.store import StateStore


class ContextBuilder:
    """Builds context for chapter generation."""

    def __init__(self, store: StateStore):
        self.store = store

    def build_context(self, chapter_number: int) -> dict:
        """Build complete context for generating a chapter."""
        seed = self.store.load_seed()
        if not seed:
            raise ValueError("No seed found. Run Phase 0 first.")

        return {
            "fixed": self._build_fixed_context(seed),
            "dynamic": self._build_dynamic_context(seed, chapter_number),
            "chapter_specific": self._build_chapter_context(seed, chapter_number),
        }

    def _build_fixed_context(self, seed: NovelSeed) -> dict:
        """Build fixed context that never changes."""
        return {
            "world": seed.world.model_dump(),
            "style_guide": seed.style.model_dump(),
            "characters": {
                char.id: {
                    "name": char.name,
                    "role": char.role,
                    "voice": char.voice.model_dump(),
                    "backstory": char.backstory,
                    "arc_summary": char.arc_summary,
                }
                for char in seed.characters
            },
        }

    def _build_dynamic_context(self, seed: NovelSeed, chapter_number: int) -> dict:
        """Build dynamic context based on story progress."""
        # Get recent chapter summaries (last 3)
        all_summaries = self.store.get_all_summaries()
        recent_summaries = all_summaries[-3:] if len(all_summaries) >= 3 else all_summaries

        # Get current arc
        current_arc = seed.get_arc_for_chapter(chapter_number)

        # Get arc summary (all chapters in current arc before this one)
        arc_summaries = [
            s for s in all_summaries
            if current_arc and current_arc.start_chapter <= s.chapter_number < chapter_number
        ]

        # Get character states
        character_states = self.store.load_character_states()

        return {
            "recent_chapters": [s.model_dump() for s in recent_summaries],
            "current_arc": current_arc.model_dump() if current_arc else None,
            "arc_progress": [
                {"chapter": s.chapter_number, "summary": s.plot_summary}
                for s in arc_summaries
            ],
            "character_states": {
                cid: state.model_dump() for cid, state in character_states.items()
            },
        }

    def _build_chapter_context(self, seed: NovelSeed, chapter_number: int) -> dict:
        """Build context specific to this chapter."""
        # Get chapter outline
        outline = next(
            (o for o in seed.chapter_outlines if o.chapter_number == chapter_number),
            None,
        )

        # Get foreshadowing actions for this chapter
        fs_actions = seed.get_foreshadowing_actions(chapter_number)

        # Get characters involved
        characters_in_chapter = []
        if outline:
            for char_id in outline.characters_involved:
                char = seed.get_character(char_id)
                if char:
                    characters_in_chapter.append({
                        "id": char.id,
                        "name": char.name,
                        "voice": char.voice.model_dump(),
                        "sample_dialogues": char.voice.sample_dialogues[:3],
                    })

        return {
            "chapter_number": chapter_number,
            "outline": outline.model_dump() if outline else None,
            "foreshadowing_actions": [
                {"id": fs.id, "name": fs.name, "action": action, "description": fs.description}
                for fs, action in fs_actions
            ],
            "characters": characters_in_chapter,
            "is_arc_climax": (
                seed.get_arc_for_chapter(chapter_number).climax_chapter == chapter_number
                if seed.get_arc_for_chapter(chapter_number)
                else False
            ),
        }

    def format_for_prompt(self, context: dict) -> str:
        """Format context as a prompt string."""
        lines = []

        # Style guide
        style = context["fixed"]["style_guide"]
        lines.append("## 스타일 가이드")
        lines.append(f"- 시점: {style['pov']}")
        lines.append(f"- 시제: {style['tense']}")
        lines.append(f"- 대화 비율: {style['dialogue_ratio']*100:.0f}%")
        for rule in style["formatting_rules"]:
            lines.append(f"- {rule}")
        lines.append("")

        # Current chapter info
        chapter = context["chapter_specific"]
        lines.append(f"## {chapter['chapter_number']}화 개요")
        if chapter["outline"]:
            lines.append(f"제목: {chapter['outline']['title']}")
            lines.append(f"내용: {chapter['outline']['one_liner']}")
            lines.append(f"긴장도: {chapter['outline']['tension_level']}/10")
        lines.append("")

        # Recent context
        if context["dynamic"]["recent_chapters"]:
            lines.append("## 최근 전개")
            for ch in context["dynamic"]["recent_chapters"]:
                lines.append(f"- {ch['chapter_number']}화: {ch['plot_summary']}")
            lines.append("")

        # Foreshadowing
        if chapter["foreshadowing_actions"]:
            lines.append("## 이번 화 복선")
            for fs in chapter["foreshadowing_actions"]:
                action_kr = {"plant": "심기", "hint": "힌트", "reveal": "회수"}
                lines.append(f"- [{action_kr.get(fs['action'], fs['action'])}] {fs['name']}: {fs['description']}")
            lines.append("")

        # Characters in this chapter
        if chapter["characters"]:
            lines.append("## 등장인물")
            for char in chapter["characters"]:
                lines.append(f"### {char['name']}")
                lines.append(f"말투: {char['voice']['tone']}")
                lines.append("대사 예시:")
                for dialogue in char["sample_dialogues"]:
                    lines.append(f'  "{dialogue}"')
            lines.append("")

        return "\n".join(lines)
