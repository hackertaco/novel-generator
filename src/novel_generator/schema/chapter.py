"""Chapter schema definitions."""

from enum import Enum

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Types of events that can occur in a chapter."""

    BATTLE = "battle"
    DIALOGUE = "dialogue"
    DISCOVERY = "discovery"
    TRAINING = "training"
    ROMANCE = "romance"
    BETRAYAL = "betrayal"
    DEATH = "death"
    POWER_UP = "power_up"
    FLASHBACK = "flashback"
    CLIFFHANGER = "cliffhanger"


class ChapterEvent(BaseModel):
    """Structured event that occurred in a chapter."""

    type: EventType = Field(..., description="Type of event")
    participants: list[str] = Field(..., description="Character IDs involved")
    description: str = Field(..., description="Brief description of what happened")
    outcome: str | None = Field(default=None, description="Result of the event")
    consequences: dict[str, str] = Field(
        default_factory=dict,
        description="Consequences (e.g., {'주인공_부상': '왼팔'})",
    )


class CharacterChange(BaseModel):
    """Character state change in a chapter."""

    character_id: str = Field(..., description="Character ID")
    changes: dict[str, str] = Field(
        ..., description="What changed (e.g., {'level': '5 → 6'})"
    )


class ForeshadowingTouch(BaseModel):
    """Foreshadowing interaction in a chapter."""

    foreshadowing_id: str = Field(..., description="Foreshadowing ID")
    action: str = Field(..., description="plant, hint, or reveal")
    context: str = Field(..., description="How it was presented in the chapter")


class ChapterSummary(BaseModel):
    """Structured summary of a chapter - used for context management."""

    chapter_number: int = Field(..., description="Chapter number")
    title: str = Field(..., description="Chapter title")

    # Structured data - for retrieval
    events: list[ChapterEvent] = Field(default_factory=list)
    character_changes: list[CharacterChange] = Field(default_factory=list)
    foreshadowing_touched: list[ForeshadowingTouch] = Field(default_factory=list)

    # Text summaries - for context injection
    plot_summary: str = Field(..., description="1-2 sentence plot summary")
    emotional_beat: str = Field(..., description="Emotional tone/beat of the chapter")
    cliffhanger: str | None = Field(default=None, description="Cliffhanger if any")

    # Validation
    word_count: int = Field(default=0, description="Actual word count of chapter")
    style_score: float | None = Field(
        default=None, description="Kakao style compliance score 0-1"
    )
