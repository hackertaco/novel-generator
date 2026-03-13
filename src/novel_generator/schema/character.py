"""Character schema definitions."""

from typing import Any
from pydantic import BaseModel, Field, field_validator


class CharacterVoice(BaseModel):
    """Character's speech patterns and personality expression."""

    tone: str = Field(..., description="Overall tone (e.g., '냉소적, 하지만 속정 있음')")
    speech_patterns: list[str] = Field(
        default_factory=list,
        description="Characteristic speech patterns (e.g., '~하지', '...그래서?')",
    )
    sample_dialogues: list[str] = Field(
        default_factory=list,
        description="Representative dialogue samples (5-10 examples)",
    )
    personality_core: str = Field(
        ..., description="Core personality description for consistency"
    )


class CharacterState(BaseModel):
    """Mutable character state that changes throughout the story."""

    level: int | None = Field(default=None, description="Power level if applicable")
    location: str | None = Field(default=None, description="Current location")
    status: str = Field(default="normal", description="Current status (normal, injured, etc.)")
    relationships: dict[str, str] = Field(
        default_factory=dict,
        description="Relationships with other characters (name -> status)",
    )
    inventory: list[str] = Field(default_factory=list, description="Important items held")
    secrets_known: list[str] = Field(
        default_factory=list, description="Secrets this character knows"
    )

    @field_validator('level', mode='before')
    @classmethod
    def parse_level(cls, v: Any) -> int | None:
        """Parse level from string or int."""
        if v is None:
            return None
        if isinstance(v, int):
            return v
        if isinstance(v, str):
            # Try to extract number from string like "1" or "레벨 1"
            import re
            match = re.search(r'\d+', v)
            if match:
                return int(match.group())
            return None
        return None


class Character(BaseModel):
    """Complete character definition."""

    id: str = Field(..., description="Unique character identifier")
    name: str = Field(..., description="Character name")
    role: str = Field(..., description="Role in story (주인공, 히로인, 악역, etc.)")
    introduction_chapter: int = Field(..., description="Chapter where character first appears")

    # Fixed - never compressed
    voice: CharacterVoice = Field(..., description="Speech patterns and personality")
    backstory: str = Field(..., description="Character backstory")
    arc_summary: str = Field(..., description="Character's growth arc throughout the story")

    # Mutable - updated each chapter
    state: CharacterState = Field(default_factory=CharacterState)

    @field_validator('introduction_chapter', mode='before')
    @classmethod
    def parse_chapter(cls, v: Any) -> int:
        """Parse chapter from string or int."""
        if isinstance(v, int):
            return v
        if isinstance(v, str):
            import re
            match = re.search(r'\d+', v)
            if match:
                return int(match.group())
            return 1
        return 1
