"""Schema definitions for novel generation."""

from novel_generator.schema.character import Character, CharacterVoice, CharacterState
from novel_generator.schema.foreshadowing import Foreshadowing, ForeshadowingAction
from novel_generator.schema.chapter import ChapterSummary, ChapterEvent
from novel_generator.schema.novel import NovelSeed, PlotArc

__all__ = [
    "Character",
    "CharacterVoice",
    "CharacterState",
    "Foreshadowing",
    "ForeshadowingAction",
    "ChapterSummary",
    "ChapterEvent",
    "NovelSeed",
    "PlotArc",
]
