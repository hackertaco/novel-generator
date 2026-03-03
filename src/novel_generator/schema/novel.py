"""Novel-level schema definitions."""

from pydantic import BaseModel, Field

from novel_generator.schema.character import Character
from novel_generator.schema.foreshadowing import Foreshadowing


class PlotArc(BaseModel):
    """Story arc definition."""

    id: str = Field(..., description="Arc identifier (e.g., 'arc_1')")
    name: str = Field(..., description="Arc name (e.g., '귀환편')")
    start_chapter: int = Field(..., description="Starting chapter")
    end_chapter: int = Field(..., description="Ending chapter")
    summary: str = Field(..., description="Arc summary")
    key_events: list[str] = Field(..., description="Major events in this arc")
    climax_chapter: int = Field(..., description="Chapter with arc climax")


class ChapterOutline(BaseModel):
    """Brief outline for a single chapter."""

    chapter_number: int
    title: str
    arc_id: str
    one_liner: str = Field(..., description="One sentence description")
    key_points: list[str] = Field(default_factory=list, description="Key plot points")
    characters_involved: list[str] = Field(default_factory=list)
    tension_level: int = Field(
        default=5, ge=1, le=10, description="Tension level 1-10"
    )


class StyleGuide(BaseModel):
    """Kakao Page style guidelines."""

    max_paragraph_length: int = Field(default=3, description="Max sentences per paragraph")
    dialogue_ratio: float = Field(
        default=0.6, ge=0, le=1, description="Target dialogue ratio"
    )
    sentence_style: str = Field(
        default="short", description="Sentence style: short, punchy"
    )
    hook_ending: bool = Field(default=True, description="Each chapter ends with hook")
    pov: str = Field(default="1인칭", description="Point of view")
    tense: str = Field(default="과거형", description="Tense")

    formatting_rules: list[str] = Field(
        default_factory=lambda: [
            "문단은 3문장 이하로",
            "대사 후 긴 지문 금지",
            "클리셰 표현 사용 가능 (장르 특성)",
            "매 회차 끝은 궁금증 유발",
        ]
    )


class WorldSetting(BaseModel):
    """World building settings."""

    name: str = Field(..., description="World/setting name")
    genre: str = Field(..., description="Genre (판타지, 현대, 무협, etc.)")
    sub_genre: str = Field(..., description="Sub-genre (회귀, 빙의, 헌터, etc.)")
    time_period: str = Field(..., description="Time period or era")
    magic_system: str | None = Field(default=None, description="Magic/power system")
    key_locations: dict[str, str] = Field(
        default_factory=dict, description="Important locations"
    )
    factions: dict[str, str] = Field(
        default_factory=dict, description="Important groups/factions"
    )
    rules: list[str] = Field(
        default_factory=list, description="World rules and constraints"
    )


class NovelSeed(BaseModel):
    """Complete novel seed - approved in Phase 0."""

    # Meta
    title: str = Field(..., description="Novel title")
    logline: str = Field(..., description="One-sentence premise")
    total_chapters: int = Field(..., description="Target total chapters")

    # World
    world: WorldSetting

    # Characters (fixed, never compressed)
    characters: list[Character] = Field(default_factory=list)

    # Plot structure
    arcs: list[PlotArc] = Field(default_factory=list)
    chapter_outlines: list[ChapterOutline] = Field(default_factory=list)

    # Foreshadowing (timeline set here)
    foreshadowing: list[Foreshadowing] = Field(default_factory=list)

    # Style (fixed)
    style: StyleGuide = Field(default_factory=StyleGuide)

    def get_character(self, character_id: str) -> Character | None:
        """Get character by ID."""
        for char in self.characters:
            if char.id == character_id:
                return char
        return None

    def get_arc_for_chapter(self, chapter: int) -> PlotArc | None:
        """Get the arc that contains given chapter."""
        for arc in self.arcs:
            if arc.start_chapter <= chapter <= arc.end_chapter:
                return arc
        return None

    def get_foreshadowing_actions(self, chapter: int) -> list[tuple[Foreshadowing, str]]:
        """Get all foreshadowing actions needed for given chapter."""
        actions = []
        for fs in self.foreshadowing:
            action = fs.should_act(chapter)
            if action:
                actions.append((fs, action.value))
        return actions
