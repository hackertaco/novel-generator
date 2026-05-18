"""Typed non-dialogue simulation events for append-only character-state writes."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from novel_generator.schema.chapter import EventType
from novel_generator.schema.character_state_contract import MemoryExperienceMode


class CharacterStateReference(BaseModel):
    """Reference the latest ledger entry for one character state key."""

    character_id: str = Field(..., description="Owner of the referenced character-state key")
    state_key: str = Field(..., description="Stable key for the referenced character state")

    @field_validator("character_id", "state_key")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        """Reject blank identifiers."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("character state references must not be blank")
        return stripped


class SimulationObjectiveFactUpdate(BaseModel):
    """Canonical fact effect emitted by a non-dialogue simulation event."""

    character_id: str = Field(..., description="Ledger owner for the canonical fact write")
    state_key: str = Field(..., description="Stable fact key in the objective fact ledger")
    fact_value: Any = Field(..., description="Canonical fact value after the event")
    change_reason: str = Field(..., description="Why the world truth changed")
    affected_character_ids: list[str] = Field(
        default_factory=list,
        description="Characters materially affected by the canonical change",
    )
    tags: list[str] = Field(default_factory=list, description="Optional fact index tags")
    source_id: str | None = Field(
        default=None,
        description="Subsystem override for fact provenance",
    )
    cause: str | None = Field(
        default=None,
        description="Explicit divergence cause when the fact creates downstream mismatch",
    )


class SimulationMemoryUpdate(BaseModel):
    """Per-character memory effect caused by a non-dialogue simulation event."""

    character_id: str = Field(..., description="Character whose memory changes")
    state_key: str = Field(..., description="Stable memory key in the memory ledger")
    memory_summary: str = Field(..., description="Natural-language memory statement")
    remembered_value: Any | None = Field(
        default=None,
        description="Structured remembered value when machine-comparable",
    )
    source_fact: CharacterStateReference | None = Field(
        default=None,
        description="Canonical fact that grounds this memory when available",
    )
    experience_mode: MemoryExperienceMode = Field(
        default=MemoryExperienceMode.DIRECT,
        description="How the character acquired the memory",
    )
    retention_confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="How strongly the memory is retained",
    )
    tags: list[str] = Field(default_factory=list, description="Optional memory index tags")
    source_id: str | None = Field(
        default=None,
        description="Subsystem override for memory provenance",
    )
    cause: str | None = Field(
        default=None,
        description="Explicit reason for memory distortion or mismatch",
    )


class SimulationBeliefUpdate(BaseModel):
    """Per-character belief effect derived from interpretation after an event."""

    character_id: str = Field(..., description="Character whose belief changes")
    state_key: str = Field(..., description="Stable belief key in the belief ledger")
    belief_summary: str = Field(..., description="Natural-language belief statement")
    interpretation_basis: str = Field(..., description="Why the character formed this belief")
    believed_value: Any | None = Field(
        default=None,
        description="Structured belief value when machine-comparable",
    )
    source_memories: list[CharacterStateReference] = Field(
        default_factory=list,
        description="Memories the character interpreted into this belief",
    )
    source_facts: list[CharacterStateReference] = Field(
        default_factory=list,
        description="Canonical facts consulted during interpretation",
    )
    conviction: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="How strongly the character holds this belief",
    )
    tags: list[str] = Field(default_factory=list, description="Optional belief index tags")
    source_id: str | None = Field(
        default=None,
        description="Subsystem override for belief provenance",
    )
    cause: str | None = Field(
        default=None,
        description="Explicit reason the belief diverges from objective truth",
    )


class SimulationStateEvent(BaseModel):
    """Structured non-dialogue simulation event with explicit state effects."""

    event_id: str = Field(..., description="Stable event ledger identifier")
    event_type: EventType = Field(..., description="Non-dialogue event type")
    chapter_number: int = Field(..., ge=1, description="Episode/chapter where the event occurs")
    summary: str = Field(..., description="Human-readable summary of the event")
    actor_character_id: str | None = Field(
        default=None,
        description="Character whose action triggered the event, if any",
    )
    source_id: str = Field(
        default="interaction-simulator",
        description="Subsystem that emitted the simulation event",
    )
    scene_id: str | None = Field(default=None, description="Stable scene identifier")
    scene_index: int | None = Field(default=None, ge=0, description="Zero-based scene order")
    timeline_tick: int | None = Field(
        default=None,
        ge=0,
        description="Monotonic simulator tick for causal ordering",
    )
    objective_fact_updates: list[SimulationObjectiveFactUpdate] = Field(
        default_factory=list,
        description="Canonical fact writes caused by the event",
    )
    memory_updates: list[SimulationMemoryUpdate] = Field(
        default_factory=list,
        description="Memory updates caused by the event",
    )
    belief_updates: list[SimulationBeliefUpdate] = Field(
        default_factory=list,
        description="Belief updates produced by explicit interpretation",
    )
    tags: list[str] = Field(default_factory=list, description="Optional event index tags")

    @field_validator("event_id", "summary", "source_id")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        """Reject blank event identifiers and descriptions."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("simulation event identifiers and text must not be blank")
        return stripped

    @model_validator(mode="after")
    def validate_non_dialogue_event(self) -> "SimulationStateEvent":
        """Keep utterance writes on the dialogue path and state effects on non-dialogue events."""
        if self.event_type is EventType.DIALOGUE:
            raise ValueError("SimulationStateEvent only accepts non-dialogue event types")
        return self
