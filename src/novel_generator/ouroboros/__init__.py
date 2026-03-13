"""Ouroboros integration for novel generator."""

from novel_generator.ouroboros.adapter import NovelOuroborosAdapter
from novel_generator.ouroboros.seed_adapter import novel_seed_to_ouroboros

__all__ = ["NovelOuroborosAdapter", "novel_seed_to_ouroboros"]
