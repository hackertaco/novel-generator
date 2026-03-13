"""State store for managing novel state across chapters."""

import json
from pathlib import Path

import yaml

from novel_generator.schema.novel import NovelSeed
from novel_generator.schema.chapter import ChapterSummary
from novel_generator.schema.character import CharacterState


class StateStore:
    """Manages persistent state for novel generation."""

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.state_dir = output_dir / ".state"
        self.chapters_dir = output_dir / "chapters"
        self.summaries_dir = self.state_dir / "summaries"

        # Create directories
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.chapters_dir.mkdir(parents=True, exist_ok=True)
        self.summaries_dir.mkdir(parents=True, exist_ok=True)

    def save_seed(self, seed: NovelSeed) -> None:
        """Save the approved novel seed."""
        seed_path = self.state_dir / "seed.yaml"
        with open(seed_path, "w", encoding="utf-8") as f:
            yaml.dump(seed.model_dump(), f, allow_unicode=True, default_flow_style=False)

    def load_seed(self) -> NovelSeed | None:
        """Load the novel seed."""
        seed_path = self.state_dir / "seed.yaml"
        if not seed_path.exists():
            return None
        with open(seed_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return NovelSeed.model_validate(data)

    def save_chapter(self, chapter_number: int, title: str, content: str) -> Path:
        """Save a generated chapter."""
        filename = f"{chapter_number:03d}_{title}.txt"
        chapter_path = self.chapters_dir / filename
        with open(chapter_path, "w", encoding="utf-8") as f:
            f.write(content)
        return chapter_path

    def save_chapter_summary(self, summary: ChapterSummary) -> None:
        """Save structured chapter summary."""
        summary_path = self.summaries_dir / f"chapter_{summary.chapter_number:03d}.yaml"
        with open(summary_path, "w", encoding="utf-8") as f:
            yaml.dump(summary.model_dump(), f, allow_unicode=True, default_flow_style=False)

    def load_chapter_summary(self, chapter_number: int) -> ChapterSummary | None:
        """Load a chapter summary."""
        summary_path = self.summaries_dir / f"chapter_{chapter_number:03d}.yaml"
        if not summary_path.exists():
            return None
        with open(summary_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return ChapterSummary.model_validate(data)

    def get_all_summaries(self) -> list[ChapterSummary]:
        """Load all chapter summaries in order."""
        summaries = []
        for summary_file in sorted(self.summaries_dir.glob("chapter_*.yaml")):
            with open(summary_file, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            summaries.append(ChapterSummary.model_validate(data))
        return summaries

    def save_character_states(self, states: dict[str, CharacterState]) -> None:
        """Save current character states."""
        states_path = self.state_dir / "character_states.json"
        data = {cid: state.model_dump() for cid, state in states.items()}
        with open(states_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load_character_states(self) -> dict[str, CharacterState]:
        """Load character states."""
        states_path = self.state_dir / "character_states.json"
        if not states_path.exists():
            return {}
        with open(states_path, encoding="utf-8") as f:
            data = json.load(f)
        return {cid: CharacterState.model_validate(state) for cid, state in data.items()}

    def get_current_chapter(self) -> int:
        """Get the last generated chapter number."""
        summaries = list(self.summaries_dir.glob("chapter_*.yaml"))
        if not summaries:
            return 0
        last = max(summaries, key=lambda p: int(p.stem.split("_")[1]))
        return int(last.stem.split("_")[1])

    def get_progress(self) -> dict:
        """Get generation progress."""
        seed = self.load_seed()
        current = self.get_current_chapter()
        total = seed.total_chapters if seed else 0
        return {
            "current_chapter": current,
            "total_chapters": total,
            "progress_percent": (current / total * 100) if total > 0 else 0,
        }

    def update_progress(self, last_chapter: int) -> None:
        """Update progress tracking.

        Args:
            last_chapter: The last successfully generated chapter number
        """
        progress_path = self.state_dir / "progress.json"
        progress = {
            "last_generated": last_chapter,
            "updated_at": __import__("datetime").datetime.now().isoformat(),
        }
        with open(progress_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)
