"""Canonical schema views for fact, memory, and belief state layers."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator

from novel_generator.schema.character_state_contract import (
    BeliefEntry,
    MemoryEntry,
    ObjectiveFactEntry,
)


class CharacterStateDivergenceCause(str, Enum):
    """Explicit reasons a subjective state can diverge from canonical truth."""

    FORGETTING = "forgetting"
    MISUNDERSTANDING = "misunderstanding"
    LYING = "lying"
    LACK_OF_INFORMATION = "lack_of_information"
    RUMOR = "rumor"
    INFERENCE_ERROR = "inference_error"
    DELIBERATE_CONCEALMENT = "deliberate_concealment"


class CanonicalCauseValueMixin(BaseModel):
    """Normalize optional free-text cause values while preserving custom labels."""

    @field_validator("divergence_cause", check_fields=False)
    @classmethod
    def validate_divergence_cause(
        cls, value: CharacterStateDivergenceCause | str | None
    ) -> CharacterStateDivergenceCause | str | None:
        """Reject blank cause strings while allowing enum-backed or custom labels."""
        if value is None:
            return value
        if isinstance(value, CharacterStateDivergenceCause):
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("divergence_cause must not be blank")
        return stripped


class StateEvidenceProvenance(CanonicalCauseValueMixin):
    """Normalized provenance for machine-verifiable subjective or canonical state."""

    source_event_id: str | None = Field(
        default=None,
        description="Event ledger identifier that caused this record, when available",
    )
    source_id: str | None = Field(
        default=None,
        description="Subsystem or import source that produced this record",
    )
    actor_character_id: str | None = Field(
        default=None,
        description="Character whose action or interpretation created the record",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Strength assigned to the recorded state from its own perspective",
    )
    divergence_cause: CharacterStateDivergenceCause | str | None = Field(
        default=None,
        description="Explicit cause of divergence from canonical truth, if any",
    )
    derived_from_entry_ids: list[str] = Field(
        default_factory=list,
        description="Upstream ledger entries used as evidence or lineage",
    )
    notes: str | None = Field(
        default=None,
        description="Implementation notes preserved for verification or repair",
    )

    @field_validator("source_event_id", "source_id", "actor_character_id", "notes")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        """Reject blank identifiers while allowing omitted fields."""
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("provenance text fields must not be blank")
        return stripped


class CanonicalFactProvenance(StateEvidenceProvenance):
    """Provenance for canonical objective facts."""

    confidence: float = Field(
        default=1.0,
        ge=1.0,
        le=1.0,
        description="Canonical facts are asserted at full confidence once committed",
    )


class MemoryStateProvenance(StateEvidenceProvenance):
    """Provenance for per-character memory state."""

    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Retention strength of the recorded memory",
    )


class BeliefStateProvenance(StateEvidenceProvenance):
    """Provenance for per-character belief state."""

    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Conviction level of the recorded belief",
    )


class CanonicalFactRecordSchema(BaseModel):
    """Formal schema for one canonical objective fact record."""

    schema_version: str = Field(..., description="Schema version of the underlying record")
    entry_id: str = Field(..., description="Immutable ledger identifier for this fact write")
    character_id: str = Field(..., description="Ledger owner for the fact record")
    state_key: str = Field(..., description="Stable canonical fact key")
    fact_value: Any = Field(..., description="Canonical truth value")
    previous_fact_value: Any | None = Field(
        default=None,
        description="Earlier canonical value before the latest overwrite",
    )
    change_reason: str = Field(..., description="Why the canonical fact changed")
    affected_character_ids: list[str] = Field(
        default_factory=list,
        description="Characters materially affected by the fact change",
    )
    provenance: CanonicalFactProvenance = Field(
        ...,
        description="Normalized provenance for the canonical write",
    )

    @classmethod
    def from_entry(cls, entry: ObjectiveFactEntry) -> "CanonicalFactRecordSchema":
        """Project a ledger entry into the canonical fact schema surface."""
        source = entry.metadata.provenance
        return cls(
            schema_version=entry.schema_version,
            entry_id=entry.metadata.entry_id,
            character_id=entry.metadata.character_id,
            state_key=entry.state_key,
            fact_value=entry.fact_value,
            previous_fact_value=entry.previous_fact_value,
            change_reason=entry.change_reason,
            affected_character_ids=list(entry.affected_character_ids),
            provenance=CanonicalFactProvenance(
                source_event_id=source.event_id,
                source_id=source.source_id,
                actor_character_id=source.actor_character_id,
                divergence_cause=source.cause,
                derived_from_entry_ids=list(source.derived_from_entry_ids),
                notes=source.notes,
            ),
        )


class CharacterMemoryStateSchema(BaseModel):
    """Formal schema for one per-character memory record."""

    schema_version: str = Field(..., description="Schema version of the underlying record")
    entry_id: str = Field(..., description="Immutable ledger identifier for this memory")
    character_id: str = Field(..., description="Character that owns the memory")
    state_key: str = Field(..., description="Stable memory key")
    memory_summary: str = Field(..., description="Human-readable memory statement")
    remembered_value: Any | None = Field(
        default=None,
        description="Structured remembered value when machine-comparable",
    )
    source_fact_entry_id: str | None = Field(
        default=None,
        description="Canonical fact entry that grounded the memory, when available",
    )
    experience_mode: str = Field(..., description="How the character acquired the memory")
    provenance: MemoryStateProvenance = Field(
        ...,
        description="Normalized provenance for the memory record",
    )

    @classmethod
    def from_entry(cls, entry: MemoryEntry) -> "CharacterMemoryStateSchema":
        """Project a ledger entry into the memory schema surface."""
        source = entry.metadata.provenance
        return cls(
            schema_version=entry.schema_version,
            entry_id=entry.metadata.entry_id,
            character_id=entry.metadata.character_id,
            state_key=entry.state_key,
            memory_summary=entry.memory_summary,
            remembered_value=entry.remembered_value,
            source_fact_entry_id=entry.source_fact_entry_id,
            experience_mode=entry.experience_mode.value,
            provenance=MemoryStateProvenance(
                source_event_id=source.event_id,
                source_id=source.source_id,
                actor_character_id=source.actor_character_id,
                confidence=entry.retention_confidence,
                divergence_cause=source.cause,
                derived_from_entry_ids=list(source.derived_from_entry_ids),
                notes=source.notes,
            ),
        )


class CharacterBeliefStateSchema(BaseModel):
    """Formal schema for one per-character belief record."""

    schema_version: str = Field(..., description="Schema version of the underlying record")
    entry_id: str = Field(..., description="Immutable ledger identifier for this belief")
    character_id: str = Field(..., description="Character that owns the belief")
    state_key: str = Field(..., description="Stable belief key")
    belief_summary: str = Field(..., description="Human-readable belief statement")
    believed_value: Any | None = Field(
        default=None,
        description="Structured believed value when machine-comparable",
    )
    interpretation_basis: str = Field(
        ...,
        description="Explanation for how the belief was formed or revised",
    )
    source_memory_entry_ids: list[str] = Field(
        default_factory=list,
        description="Memory entries used during interpretation",
    )
    source_fact_entry_ids: list[str] = Field(
        default_factory=list,
        description="Canonical fact entries consulted during interpretation",
    )
    provenance: BeliefStateProvenance = Field(
        ...,
        description="Normalized provenance for the belief record",
    )

    @classmethod
    def from_entry(cls, entry: BeliefEntry) -> "CharacterBeliefStateSchema":
        """Project a ledger entry into the belief schema surface."""
        source = entry.metadata.provenance
        return cls(
            schema_version=entry.schema_version,
            entry_id=entry.metadata.entry_id,
            character_id=entry.metadata.character_id,
            state_key=entry.state_key,
            belief_summary=entry.belief_summary,
            believed_value=entry.believed_value,
            interpretation_basis=entry.interpretation_basis,
            source_memory_entry_ids=list(entry.source_memory_entry_ids),
            source_fact_entry_ids=list(entry.source_fact_entry_ids),
            provenance=BeliefStateProvenance(
                source_event_id=source.event_id,
                source_id=source.source_id,
                actor_character_id=source.actor_character_id,
                confidence=entry.conviction,
                divergence_cause=source.cause,
                derived_from_entry_ids=list(source.derived_from_entry_ids),
                notes=source.notes,
            ),
        )
