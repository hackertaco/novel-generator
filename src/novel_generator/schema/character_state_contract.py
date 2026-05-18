"""Typed write contract and persistence layout for simulation-first character state."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter, field_validator, model_validator

from novel_generator.schema.character_state_metadata import (
    CharacterStateLifecycleStatus,
    CharacterStateProvenanceKind,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    SceneReference,
)


def _utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(UTC)


class MemoryExperienceMode(str, Enum):
    """How a memory entered a character's personal recall."""

    DIRECT = "direct"
    REPORTED = "reported"
    INFERRED = "inferred"


class LedgerStorageFormat(str, Enum):
    """Supported persistence format for character state ledgers."""

    JSONL = "jsonl"


class TimelineQueryRelation(str, Enum):
    """How a query anchor should be matched against scene/timeline metadata."""

    EXACT = "exact"
    AT_OR_BEFORE = "at_or_before"
    AT_OR_AFTER = "at_or_after"


class BaseCharacterStateEntry(BaseModel):
    """Common base contract for append-only character state ledger entries."""

    schema_version: str = Field(
        default="1.0",
        description="Schema version for forward-compatible persistence parsing",
    )
    record_type: CharacterStateRecordType = Field(
        ...,
        description="Concrete record type for discriminated parsing",
    )
    metadata: CharacterStateRecordMetadata = Field(
        ...,
        description="Shared metadata for auditability and verification",
    )
    state_key: str = Field(
        ...,
        description="Stable domain key under which this state entry is indexed",
    )

    @field_validator("state_key")
    @classmethod
    def validate_state_key(cls, value: str) -> str:
        """Disallow blank state keys."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("state_key must not be blank")
        return stripped

    @model_validator(mode="after")
    def validate_record_type_alignment(self) -> "BaseCharacterStateEntry":
        """Keep the top-level record type aligned with metadata."""
        if self.metadata.record_type is not self.record_type:
            raise ValueError("entry record_type must match metadata.record_type")
        return self


class ObjectiveFactEntry(BaseCharacterStateEntry):
    """Canonical world-truth write entry."""

    record_type: Literal[CharacterStateRecordType.OBJECTIVE_FACT] = (
        CharacterStateRecordType.OBJECTIVE_FACT
    )
    fact_value: Any = Field(
        ...,
        description="Canonical truth value written into the objective fact store",
    )
    previous_fact_value: Any | None = Field(
        default=None,
        description="Previous canonical value before this overwrite, if any",
    )
    change_reason: str = Field(
        ...,
        description="Why the fact changed in the world model",
    )
    affected_character_ids: list[str] = Field(
        default_factory=list,
        description="Characters materially impacted by this fact change",
    )


class MemoryEntry(BaseCharacterStateEntry):
    """Per-character remembered state entry."""

    record_type: Literal[CharacterStateRecordType.MEMORY] = CharacterStateRecordType.MEMORY
    memory_summary: str = Field(
        ...,
        description="Compact natural-language statement of what the character remembers",
    )
    remembered_value: Any | None = Field(
        default=None,
        description="Structured remembered value when the memory is machine-comparable",
    )
    source_fact_entry_id: str | None = Field(
        default=None,
        description="Objective fact ledger entry that originally grounded this memory",
    )
    experience_mode: MemoryExperienceMode = Field(
        default=MemoryExperienceMode.DIRECT,
        description="Whether the memory was directly experienced, reported, or inferred",
    )
    retention_confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="How strongly the character retains the memory",
    )


class BeliefEntry(BaseCharacterStateEntry):
    """Per-character interpretation or conclusion entry."""

    record_type: Literal[CharacterStateRecordType.BELIEF] = CharacterStateRecordType.BELIEF
    belief_summary: str = Field(
        ...,
        description="Compact statement of what the character currently believes",
    )
    believed_value: Any | None = Field(
        default=None,
        description="Structured believed value when the belief is machine-comparable",
    )
    interpretation_basis: str = Field(
        ...,
        description="Why the character formed or updated this belief",
    )
    source_memory_entry_ids: list[str] = Field(
        default_factory=list,
        description="Memory entries that informed this belief",
    )
    source_fact_entry_ids: list[str] = Field(
        default_factory=list,
        description="Objective fact entries consulted during interpretation",
    )
    conviction: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="How strongly the character holds the belief",
    )


class UtteranceEntry(BaseCharacterStateEntry):
    """Spoken dialogue entry recorded only when a character says something."""

    record_type: Literal[CharacterStateRecordType.UTTERANCE] = CharacterStateRecordType.UTTERANCE
    utterance_text: str = Field(
        ...,
        description="Exact spoken line or normalized dialogue text",
    )
    audience_character_ids: list[str] = Field(
        default_factory=list,
        description="Characters who heard the utterance directly",
    )
    intent: str | None = Field(
        default=None,
        description="Optional speech intent such as confess, deceive, threaten, or comfort",
    )
    references_belief_entry_ids: list[str] = Field(
        default_factory=list,
        description="Belief entries explicitly surfaced by the utterance",
    )
    references_fact_entry_ids: list[str] = Field(
        default_factory=list,
        description="Objective facts the utterance claims or references",
    )

    @field_validator("utterance_text")
    @classmethod
    def validate_utterance_text(cls, value: str) -> str:
        """Disallow empty utterance text."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("utterance_text must not be blank")
        return stripped


CharacterStateEntry = Annotated[
    ObjectiveFactEntry | MemoryEntry | BeliefEntry | UtteranceEntry,
    Field(discriminator="record_type"),
]

CHARACTER_STATE_ENTRY_ADAPTER = TypeAdapter(CharacterStateEntry)
QUERYABLE_CHARACTER_STATE_RECORD_TYPES = (
    CharacterStateRecordType.OBJECTIVE_FACT,
    CharacterStateRecordType.MEMORY,
    CharacterStateRecordType.BELIEF,
    CharacterStateRecordType.UTTERANCE,
)


class CharacterStateSourceFilter(BaseModel):
    """Filter character-state records by provenance and explicit mismatch cause."""

    kind: CharacterStateProvenanceKind | None = Field(
        default=None,
        description="Restrict matches to one provenance kind when provided",
    )
    source_id: str | None = Field(
        default=None,
        description="Restrict matches to records emitted by one subsystem or source",
    )
    event_id: str | None = Field(
        default=None,
        description="Restrict matches to records caused by one event ledger entry",
    )
    dialogue_id: str | None = Field(
        default=None,
        description="Restrict matches to records tied to one dialogue event",
    )
    actor_character_id: str | None = Field(
        default=None,
        description="Restrict matches to records caused by one character actor",
    )
    cause: str | None = Field(
        default=None,
        description="Restrict matches to one explicit divergence cause",
    )

    @field_validator(
        "source_id",
        "event_id",
        "dialogue_id",
        "actor_character_id",
        "cause",
    )
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        """Reject blank filter values while allowing omitted fields."""
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("query filter text fields must not be blank")
        return stripped


class CharacterStateTimelineFilter(BaseModel):
    """Filter character-state records by normalized timeline position."""

    relation: TimelineQueryRelation = Field(
        default=TimelineQueryRelation.EXACT,
        description="Comparison mode for the provided timeline anchor",
    )
    chapter_number: int | None = Field(
        default=None,
        ge=1,
        description="Episode/chapter anchor for the query",
    )
    scene_id: str | None = Field(
        default=None,
        description="Scene identifier anchor for exact matching",
    )
    scene_index: int | None = Field(
        default=None,
        ge=0,
        description="Scene-order anchor within a chapter",
    )
    timeline_tick: int | None = Field(
        default=None,
        ge=0,
        description="Monotonic causal tick anchor for the query",
    )
    occurred_at: datetime | None = Field(
        default=None,
        description="Absolute scene/event timestamp anchor",
    )

    @field_validator("scene_id")
    @classmethod
    def validate_scene_id(cls, value: str | None) -> str | None:
        """Reject blank scene identifiers."""
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("scene_id must not be blank")
        return stripped

    @model_validator(mode="after")
    def validate_anchor(self) -> "CharacterStateTimelineFilter":
        """Require at least one timeline anchor and sensible comparisons."""
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
            raise ValueError("timeline filter requires at least one anchor")
        if self.scene_id is not None and self.relation is not TimelineQueryRelation.EXACT:
            raise ValueError("scene_id only supports exact timeline matching")
        return self


class CharacterStateQuery(BaseModel):
    """Reusable query contract for partial character-state retrieval."""

    character_ids: list[str] = Field(
        default_factory=list,
        description="Restrict matches to one or more character owners",
    )
    state_types: list[CharacterStateRecordType] = Field(
        default_factory=list,
        description="Restrict matches to one or more character-state layers",
    )
    state_keys: list[str] = Field(
        default_factory=list,
        description="Optional stable keys to narrow retrieval within a state layer",
    )
    source: CharacterStateSourceFilter | None = Field(
        default=None,
        description="Optional provenance filter for partial state retrieval",
    )
    timeline_position: CharacterStateTimelineFilter | None = Field(
        default=None,
        description="Optional episode/scene/tick position filter",
    )
    include_inactive: bool = Field(
        default=False,
        description="Whether inactive, corrected, or superseded entries are returned",
    )
    limit: int | None = Field(
        default=None,
        ge=1,
        description="Maximum number of normalized partial records to return",
    )

    @field_validator("character_ids", "state_keys")
    @classmethod
    def validate_identifier_lists(cls, values: list[str]) -> list[str]:
        """Reject blank identifiers inside list-based filters."""
        validated: list[str] = []
        for value in values:
            stripped = value.strip()
            if not stripped:
                raise ValueError("query identifier lists must not include blank values")
            validated.append(stripped)
        return validated

    @field_validator("state_types")
    @classmethod
    def validate_state_types(
        cls,
        values: list[CharacterStateRecordType],
    ) -> list[CharacterStateRecordType]:
        """Keep the first query API scoped to the implemented four-state surface."""
        unsupported = [
            value.value for value in values if value not in QUERYABLE_CHARACTER_STATE_RECORD_TYPES
        ]
        if unsupported:
            raise ValueError(
                "query state_types must be limited to objective_fact, memory, belief, or "
                f"utterance (unsupported={unsupported})"
            )
        return values


class CharacterStateQuerySourceView(BaseModel):
    """Normalized provenance payload returned by the query API."""

    kind: CharacterStateProvenanceKind = Field(
        ...,
        description="How the returned state record entered the simulation state",
    )
    source_id: str | None = Field(
        default=None,
        description="Subsystem or import source that emitted the record",
    )
    event_id: str | None = Field(
        default=None,
        description="Event ledger entry that produced the record",
    )
    dialogue_id: str | None = Field(
        default=None,
        description="Dialogue event tied to the record when applicable",
    )
    actor_character_id: str | None = Field(
        default=None,
        description="Character whose action or interpretation caused the record",
    )
    cause: str | None = Field(
        default=None,
        description="Explicit reason for divergence from objective truth, if present",
    )
    derived_from_entry_ids: list[str] = Field(
        default_factory=list,
        description="Prior entries used as evidence for the record",
    )


class CharacterStateQueryTimelineView(BaseModel):
    """Normalized temporal payload returned by the query API."""

    chapter_number: int | None = Field(default=None, ge=1)
    scene_id: str | None = Field(default=None)
    scene_index: int | None = Field(default=None, ge=0)
    timeline_tick: int | None = Field(default=None, ge=0)
    occurred_at: datetime | None = Field(default=None)
    recorded_at: datetime = Field(
        ...,
        description="When the record was appended to the simulation ledger",
    )
    effective_at: datetime | None = Field(
        default=None,
        description="When the represented state became effective",
    )

    @classmethod
    def from_scene(
        cls,
        *,
        scene: SceneReference | None,
        recorded_at: datetime,
        effective_at: datetime | None,
    ) -> "CharacterStateQueryTimelineView":
        """Create a normalized timeline projection from optional scene metadata."""
        if scene is None:
            return cls(recorded_at=recorded_at, effective_at=effective_at)
        return cls(
            chapter_number=scene.chapter_number,
            scene_id=scene.scene_id,
            scene_index=scene.scene_index,
            timeline_tick=scene.timeline_tick,
            occurred_at=scene.occurred_at,
            recorded_at=recorded_at,
            effective_at=effective_at,
        )


class CharacterStatePartialRecord(BaseModel):
    """Normalized partial projection for read-side character-state retrieval."""

    entry_id: str = Field(..., description="Immutable identifier for the underlying ledger entry")
    character_id: str = Field(..., description="Owner of the returned state record")
    state_type: CharacterStateRecordType = Field(
        ...,
        description="Character-state layer represented by the partial record",
    )
    lifecycle_status: CharacterStateLifecycleStatus = Field(
        ...,
        description="Lifecycle status of the returned record",
    )
    state_key: str = Field(..., description="Stable state key for this record")
    summary: str = Field(
        ...,
        description="Normalized human-readable statement describing the state record",
    )
    structured_value: Any | None = Field(
        default=None,
        description="Normalized machine-readable value for partial consumers",
    )
    source: CharacterStateQuerySourceView = Field(
        ...,
        description="Normalized provenance metadata for the partial record",
    )
    timeline: CharacterStateQueryTimelineView = Field(
        ...,
        description="Normalized episode/scene/tick metadata for the partial record",
    )
    related_entry_ids: list[str] = Field(
        default_factory=list,
        description="Relevant evidence or referenced records for this partial state",
    )
    audience_character_ids: list[str] = Field(
        default_factory=list,
        description="Audience captured for utterance records; empty otherwise",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Copied classification tags for indexing and API consumers",
    )

    @classmethod
    def from_entry(cls, entry: CharacterStateEntry) -> "CharacterStatePartialRecord":
        """Project a full ledger entry into the normalized partial query shape."""
        provenance = entry.metadata.provenance
        source = CharacterStateQuerySourceView(
            kind=provenance.kind,
            source_id=provenance.source_id,
            event_id=provenance.event_id,
            dialogue_id=provenance.dialogue_id,
            actor_character_id=provenance.actor_character_id,
            cause=provenance.cause,
            derived_from_entry_ids=list(provenance.derived_from_entry_ids),
        )
        timeline = CharacterStateQueryTimelineView.from_scene(
            scene=entry.metadata.scene,
            recorded_at=entry.metadata.recorded_at,
            effective_at=entry.metadata.effective_at,
        )

        summary: str
        structured_value: Any | None
        related_entry_ids: list[str]
        audience_character_ids: list[str] = []
        if isinstance(entry, ObjectiveFactEntry):
            summary = entry.change_reason
            structured_value = entry.fact_value
            related_entry_ids = []
        elif isinstance(entry, MemoryEntry):
            summary = entry.memory_summary
            structured_value = entry.remembered_value
            related_entry_ids = (
                [entry.source_fact_entry_id] if entry.source_fact_entry_id is not None else []
            )
        elif isinstance(entry, BeliefEntry):
            summary = entry.belief_summary
            structured_value = entry.believed_value
            related_entry_ids = list(entry.source_memory_entry_ids) + list(
                entry.source_fact_entry_ids
            )
        else:
            summary = entry.utterance_text
            structured_value = {"text": entry.utterance_text, "intent": entry.intent}
            related_entry_ids = list(entry.references_belief_entry_ids) + list(
                entry.references_fact_entry_ids
            )
            audience_character_ids = list(entry.audience_character_ids)

        return cls(
            entry_id=entry.metadata.entry_id,
            character_id=entry.metadata.character_id,
            state_type=entry.record_type,
            lifecycle_status=entry.metadata.lifecycle.status,
            state_key=entry.state_key,
            summary=summary,
            structured_value=structured_value,
            source=source,
            timeline=timeline,
            related_entry_ids=related_entry_ids,
            audience_character_ids=audience_character_ids,
            tags=list(entry.metadata.tags),
        )


class CharacterStateQueryResponse(BaseModel):
    """Normalized response shape for reusable partial state retrieval."""

    query: CharacterStateQuery = Field(
        ...,
        description="Echo of the executed query contract",
    )
    entries: list[CharacterStatePartialRecord] = Field(
        default_factory=list,
        description="Normalized partial records returned by the query",
    )
    total_matches: int = Field(
        ...,
        ge=0,
        description="Full match count before query limit is applied",
    )
    has_more: bool = Field(
        ...,
        description="Whether the query was truncated by a limit",
    )


class CharacterStateLedgerBinding(BaseModel):
    """Manifest entry describing one append-only character state ledger."""

    record_type: CharacterStateRecordType = Field(
        ...,
        description="Record type stored in this ledger file",
    )
    relative_path: str = Field(
        ...,
        description="Path relative to the character state root directory",
    )
    storage_format: LedgerStorageFormat = Field(
        default=LedgerStorageFormat.JSONL,
        description="On-disk representation for this ledger",
    )
    append_only: bool = Field(
        default=True,
        description="Whether callers must append instead of rewriting history",
    )
    description: str = Field(
        ...,
        description="Human-readable contract description for the ledger",
    )


class CharacterStatePersistenceManifest(BaseModel):
    """Persistence contract for the simulation-first character state ledgers."""

    schema_version: str = Field(
        default="1.0",
        description="Persistence manifest version",
    )
    root_dir: str = Field(
        default="character_state",
        description="Directory under `.state/` that owns the new state ledgers",
    )
    character_store_dir: str = Field(
        default="characters",
        description="Directory under the character state root for per-character direct stores",
    )
    generated_at: datetime = Field(
        default_factory=_utc_now,
        description="When the manifest was last emitted",
    )
    ledgers: list[CharacterStateLedgerBinding] = Field(
        default_factory=list,
        description="Separate append-only ledgers for each state record type",
    )

    @model_validator(mode="after")
    def validate_required_ledgers(self) -> "CharacterStatePersistenceManifest":
        """Require one ledger file for each first-pass simulation state stream."""
        if not self.character_store_dir.strip():
            raise ValueError("manifest character_store_dir must not be blank")
        record_types = {binding.record_type for binding in self.ledgers}
        required = {
            CharacterStateRecordType.OBJECTIVE_FACT,
            CharacterStateRecordType.MEMORY,
            CharacterStateRecordType.BELIEF,
            CharacterStateRecordType.UTTERANCE,
        }
        if record_types != required:
            missing = sorted(value.value for value in required - record_types)
            extra = sorted(value.value for value in record_types - required)
            details = []
            if missing:
                details.append(f"missing={missing}")
            if extra:
                details.append(f"extra={extra}")
            detail_text = ", ".join(details)
            raise ValueError(
                f"manifest ledgers must match required record types ({detail_text})"
            )
        return self

    def binding_for(self, record_type: CharacterStateRecordType) -> CharacterStateLedgerBinding:
        """Return the configured ledger binding for one record type."""
        for binding in self.ledgers:
            if binding.record_type is record_type:
                return binding
        raise KeyError(f"no ledger binding configured for {record_type.value}")

    @classmethod
    def default(cls) -> "CharacterStatePersistenceManifest":
        """Create the default four-ledger append-only persistence contract."""
        return cls(
            ledgers=[
                CharacterStateLedgerBinding(
                    record_type=CharacterStateRecordType.OBJECTIVE_FACT,
                    relative_path="objective_facts.jsonl",
                    description="Canonical truth writes from world events and verifier repairs",
                ),
                CharacterStateLedgerBinding(
                    record_type=CharacterStateRecordType.MEMORY,
                    relative_path="memories.jsonl",
                    description="Per-character memories formed from direct or indirect experience",
                ),
                CharacterStateLedgerBinding(
                    record_type=CharacterStateRecordType.BELIEF,
                    relative_path="beliefs.jsonl",
                    description=(
                        "Per-character interpretations that do not auto-follow truth changes"
                    ),
                ),
                CharacterStateLedgerBinding(
                    record_type=CharacterStateRecordType.UTTERANCE,
                    relative_path="utterances.jsonl",
                    description="Spoken dialogue records captured only when uttered in-scene",
                ),
            ]
        )
