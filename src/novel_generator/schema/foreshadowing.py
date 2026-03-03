"""Foreshadowing tracking schema."""

from enum import Enum

from pydantic import BaseModel, Field


class ForeshadowingAction(str, Enum):
    """Actions that can be taken on foreshadowing."""

    PLANT = "plant"  # First introduction
    HINT = "hint"  # Subtle reminder
    REVEAL = "reveal"  # Full payoff


class Foreshadowing(BaseModel):
    """Foreshadowing element with scheduled timeline."""

    id: str = Field(..., description="Unique foreshadowing identifier")
    name: str = Field(..., description="Short name for reference")
    description: str = Field(..., description="What this foreshadowing is about")
    importance: str = Field(
        default="normal",
        description="Importance level: critical (must resolve), normal, minor",
    )

    # Timeline - set during Phase 0 plot approval
    planted_at: int = Field(..., description="Chapter where foreshadowing is planted")
    hints_at: list[int] = Field(
        default_factory=list, description="Chapters where hints are dropped"
    )
    reveal_at: int = Field(..., description="Chapter where foreshadowing is revealed")

    # State tracking
    status: str = Field(default="pending", description="pending, planted, revealed")
    hint_count: int = Field(default=0, description="Number of hints given so far")

    def should_act(self, chapter: int) -> ForeshadowingAction | None:
        """Determine what action to take for this foreshadowing at given chapter."""
        if chapter == self.planted_at and self.status == "pending":
            return ForeshadowingAction.PLANT
        if chapter == self.reveal_at and self.status == "planted":
            return ForeshadowingAction.REVEAL
        if chapter in self.hints_at and self.status == "planted":
            return ForeshadowingAction.HINT
        return None

    def mark_planted(self) -> None:
        """Mark foreshadowing as planted."""
        self.status = "planted"

    def mark_revealed(self) -> None:
        """Mark foreshadowing as revealed."""
        self.status = "revealed"

    def mark_hinted(self) -> None:
        """Increment hint count."""
        self.hint_count += 1
