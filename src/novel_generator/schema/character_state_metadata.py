"""Shared metadata schema for all per-character state records."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


def _utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(UTC)


def _make_entry_id(prefix: str = "csr") -> str:
    """Generate a stable immutable identifier for a state record."""
    return f"{prefix}_{uuid4().hex}"


class CharacterStateRecordType(str, Enum):
    """Canonical per-character record categories."""

    OBJECTIVE_FACT = "objective_fact"
    MEMORY = "memory"
    BELIEF = "belief"
    UTTERANCE = "utterance"
    STATE_SNAPSHOT = "state_snapshot"


class CharacterStateLifecycleStatus(str, Enum):
    """Lifecycle states for per-character records."""

    ACTIVE = "active"
    SUPERSEDED = "superseded"
    CORRECTED = "corrected"
    ARCHIVED = "archived"


class CharacterStateProvenanceKind(str, Enum):
    """How a per-character record entered the simulation state."""

    SEED_IMPORT = "seed_import"
    EVENT_OBSERVATION = "event_observation"
    INTERPRETATION = "interpretation"
    DIALOGUE = "dialogue"
    MANUAL_PATCH = "manual_patch"
    VERIFIER_REPAIR = "verifier_repair"
    SYSTEM_BOOTSTRAP = "system_bootstrap"


class SceneReference(BaseModel):
    """Temporal or scene anchor for a per-character state record."""

    chapter_number: int | None = Field(
        default=None,
        ge=1,
        description="Long-form episode/chapter number where the record became relevant",
    )
    scene_id: str | None = Field(
        default=None,
        description="Stable scene identifier within the episode/chapter",
    )
    scene_index: int | None = Field(
        default=None,
        ge=0,
        description="Zero-based scene order within the episode/chapter",
    )
    timeline_tick: int | None = Field(
        default=None,
        ge=0,
        description="Monotonic causal tick used by the simulator and event ledger",
    )
    occurred_at: datetime | None = Field(
        default=None,
        description="Wall-clock or in-world timestamp if the engine models absolute time",
    )
    label: str | None = Field(
        default=None,
        description="Optional human-readable scene label",
    )

    @model_validator(mode="after")
    def validate_anchor(self) -> SceneReference:
        """Require at least one temporal or scene locator."""
        if not any(
            value is not None
            for value in (
                self.chapter_number,
                self.scene_id,
                self.scene_index,
                self.timeline_tick,
                self.occurred_at,
            )
        ):
            raise ValueError(
                "scene reference requires at least one of chapter_number, scene_id, "
                "scene_index, timeline_tick, or occurred_at"
            )
        return self


class CharacterStateProvenance(BaseModel):
    """Source-of-truth trail for a per-character state record."""

    kind: CharacterStateProvenanceKind = Field(
        ...,
        description="How the record was created or modified",
    )
    source_id: str | None = Field(
        default=None,
        description="Stable identifier for the creating subsystem or import source",
    )
    event_id: str | None = Field(
        default=None,
        description="Event ledger entry that caused this record, when applicable",
    )
    dialogue_id: str | None = Field(
        default=None,
        description="Dialogue or utterance identifier that caused this record, when applicable",
    )
    actor_character_id: str | None = Field(
        default=None,
        description="Character whose action or interpretation produced this record",
    )
    derived_from_entry_ids: list[str] = Field(
        default_factory=list,
        description="Earlier state entries used as evidence or lineage for this record",
    )
    cause: str | None = Field(
        default=None,
        description="Explicit reason for truth/memory/belief/utterance divergence, if any",
    )
    notes: str | None = Field(
        default=None,
        description="Implementation notes for debugging and verification",
    )


class CharacterStateLifecycle(BaseModel):
    """Lifecycle metadata shared by all per-character state records."""

    status: CharacterStateLifecycleStatus = Field(
        default=CharacterStateLifecycleStatus.ACTIVE,
        description="Current lifecycle state of the record",
    )
    created_at: datetime = Field(
        default_factory=_utc_now,
        description="When the record entry was first created",
    )
    updated_at: datetime = Field(
        default_factory=_utc_now,
        description="When the record entry was last revised",
    )
    supersedes_entry_id: str | None = Field(
        default=None,
        description="Prior record replaced by this entry",
    )
    superseded_by_entry_id: str | None = Field(
        default=None,
        description="Later record that replaced this entry",
    )
    status_reason: str | None = Field(
        default=None,
        description="Why the lifecycle moved away from active, if applicable",
    )


class CharacterStateRecordMetadata(BaseModel):
    """Shared metadata contract for any per-character state record."""

    entry_id: str = Field(
        default_factory=_make_entry_id,
        description="Stable immutable identifier for the specific state record entry",
    )
    character_id: str = Field(
        ...,
        description="Stable character identifier that owns this record",
    )
    record_type: CharacterStateRecordType = Field(
        ...,
        description="Which per-character state collection this entry belongs to",
    )
    recorded_at: datetime = Field(
        default_factory=_utc_now,
        description="When the entry was written to the simulation state",
    )
    effective_at: datetime | None = Field(
        default=None,
        description="When the represented state became true or was first believed/uttered",
    )
    scene: SceneReference | None = Field(
        default=None,
        description="Scene/timeline anchor for this record",
    )
    provenance: CharacterStateProvenance = Field(
        ...,
        description="Provenance trail used for repair, audit, and explanation",
    )
    lifecycle: CharacterStateLifecycle = Field(
        default_factory=CharacterStateLifecycle,
        description="Lifecycle and replacement metadata",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Optional classification tags for indexing and verification",
    )

    @field_validator("entry_id", "character_id")
    @classmethod
    def validate_non_blank_identifiers(cls, value: str) -> str:
        """Disallow blank IDs."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("identifier fields must not be blank")
        return stripped

    @model_validator(mode="after")
    def validate_temporal_consistency(self) -> CharacterStateRecordMetadata:
        """Keep temporal and lifecycle timestamps coherent."""
        if self.effective_at and self.effective_at > self.recorded_at:
            raise ValueError("effective_at cannot be later than recorded_at")
        if self.lifecycle.updated_at < self.lifecycle.created_at:
            raise ValueError("lifecycle.updated_at cannot be earlier than lifecycle.created_at")
        if (
            self.record_type is CharacterStateRecordType.UTTERANCE
            and self.provenance.dialogue_id is None
        ):
            raise ValueError("utterance records require provenance.dialogue_id")
        return self

    @classmethod
    def create(
        cls,
        *,
        character_id: str,
        record_type: CharacterStateRecordType,
        provenance: CharacterStateProvenance,
        scene: SceneReference | None = None,
        effective_at: datetime | None = None,
        tags: list[str] | None = None,
    ) -> "CharacterStateRecordMetadata":
        """Convenience factory for record creation with generated IDs and timestamps."""
        return cls(
            character_id=character_id,
            record_type=record_type,
            provenance=provenance,
            scene=scene,
            effective_at=effective_at,
            tags=tags or [],
        )
