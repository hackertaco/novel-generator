"""Conflict-safe state-write service for simulation-first character records."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

from novel_generator.schema.character_state_contract import (
    BeliefEntry,
    CharacterStateEntry,
    MemoryEntry,
    MemoryExperienceMode,
    ObjectiveFactEntry,
    UtteranceEntry,
)
from novel_generator.schema.character_state_metadata import (
    CharacterStateProvenance,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    SceneReference,
)
from novel_generator.state.store import StateStore


class CharacterStateWriteAction(str, Enum):
    """Outcome of a state write attempt."""

    CREATED = "created"
    NOOP = "noop"
    SUPERSEDED = "superseded"


@dataclass(slots=True)
class CharacterStateWriteResult:
    """Structured result for one state write attempt."""

    action: CharacterStateWriteAction
    entry: CharacterStateEntry
    previous_entry: CharacterStateEntry | None = None


class CharacterStateWriter:
    """Create and revise typed character-state entries without mutating history."""

    def __init__(self, store: StateStore):
        self.store = store

    def write_objective_fact(
        self,
        *,
        character_id: str,
        state_key: str,
        fact_value: Any,
        change_reason: str,
        provenance: CharacterStateProvenance,
        affected_character_ids: list[str] | None = None,
        scene: SceneReference | None = None,
        effective_at: datetime | None = None,
        tags: list[str] | None = None,
    ) -> CharacterStateWriteResult:
        """Write canonical truth, superseding the latest fact for the same key when needed."""
        previous = self._get_latest_entry(
            record_type=CharacterStateRecordType.OBJECTIVE_FACT,
            character_id=character_id,
            state_key=state_key,
        )
        if previous is not None and not isinstance(previous, ObjectiveFactEntry):
            raise TypeError("latest objective fact lookup returned the wrong entry type")

        entry = ObjectiveFactEntry(
            metadata=self._build_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.OBJECTIVE_FACT,
                provenance=provenance,
                scene=scene,
                effective_at=effective_at,
                tags=tags,
                previous_entry=previous,
            ),
            state_key=state_key,
            fact_value=fact_value,
            previous_fact_value=previous.fact_value if previous is not None else None,
            change_reason=change_reason,
            affected_character_ids=affected_character_ids or [],
        )
        if previous is not None and self._same_fact_payload(previous, entry):
            return CharacterStateWriteResult(CharacterStateWriteAction.NOOP, previous, previous)

        self.store.append_character_state_entry(entry)
        action = (
            CharacterStateWriteAction.SUPERSEDED
            if previous is not None
            else CharacterStateWriteAction.CREATED
        )
        return CharacterStateWriteResult(
            action,
            entry,
            previous,
        )

    def write_memory(
        self,
        *,
        character_id: str,
        state_key: str,
        memory_summary: str,
        provenance: CharacterStateProvenance,
        remembered_value: Any | None = None,
        source_fact_entry_id: str | None = None,
        experience_mode: MemoryExperienceMode = MemoryExperienceMode.DIRECT,
        retention_confidence: float = 1.0,
        scene: SceneReference | None = None,
        effective_at: datetime | None = None,
        tags: list[str] | None = None,
    ) -> CharacterStateWriteResult:
        """Write or revise a per-character memory record for one state key."""
        previous = self._get_latest_entry(
            record_type=CharacterStateRecordType.MEMORY,
            character_id=character_id,
            state_key=state_key,
        )
        if previous is not None and not isinstance(previous, MemoryEntry):
            raise TypeError("latest memory lookup returned the wrong entry type")

        entry = MemoryEntry(
            metadata=self._build_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.MEMORY,
                provenance=provenance,
                scene=scene,
                effective_at=effective_at,
                tags=tags,
                previous_entry=previous,
            ),
            state_key=state_key,
            memory_summary=memory_summary,
            remembered_value=remembered_value,
            source_fact_entry_id=source_fact_entry_id,
            experience_mode=experience_mode,
            retention_confidence=retention_confidence,
        )
        if previous is not None and self._same_memory_payload(previous, entry):
            return CharacterStateWriteResult(CharacterStateWriteAction.NOOP, previous, previous)

        self.store.append_character_state_entry(entry)
        action = (
            CharacterStateWriteAction.SUPERSEDED
            if previous is not None
            else CharacterStateWriteAction.CREATED
        )
        return CharacterStateWriteResult(
            action,
            entry,
            previous,
        )

    def write_belief(
        self,
        *,
        character_id: str,
        state_key: str,
        belief_summary: str,
        interpretation_basis: str,
        provenance: CharacterStateProvenance,
        believed_value: Any | None = None,
        source_memory_entry_ids: list[str] | None = None,
        source_fact_entry_ids: list[str] | None = None,
        conviction: float = 0.5,
        scene: SceneReference | None = None,
        effective_at: datetime | None = None,
        tags: list[str] | None = None,
    ) -> CharacterStateWriteResult:
        """Write or revise a per-character belief for one state key."""
        previous = self._get_latest_entry(
            record_type=CharacterStateRecordType.BELIEF,
            character_id=character_id,
            state_key=state_key,
        )
        if previous is not None and not isinstance(previous, BeliefEntry):
            raise TypeError("latest belief lookup returned the wrong entry type")

        entry = BeliefEntry(
            metadata=self._build_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.BELIEF,
                provenance=provenance,
                scene=scene,
                effective_at=effective_at,
                tags=tags,
                previous_entry=previous,
            ),
            state_key=state_key,
            belief_summary=belief_summary,
            believed_value=believed_value,
            interpretation_basis=interpretation_basis,
            source_memory_entry_ids=source_memory_entry_ids or [],
            source_fact_entry_ids=source_fact_entry_ids or [],
            conviction=conviction,
        )
        if previous is not None and self._same_belief_payload(previous, entry):
            return CharacterStateWriteResult(CharacterStateWriteAction.NOOP, previous, previous)

        self.store.append_character_state_entry(entry)
        action = (
            CharacterStateWriteAction.SUPERSEDED
            if previous is not None
            else CharacterStateWriteAction.CREATED
        )
        return CharacterStateWriteResult(
            action,
            entry,
            previous,
        )

    def write_utterance(
        self,
        *,
        character_id: str,
        state_key: str,
        utterance_text: str,
        provenance: CharacterStateProvenance,
        audience_character_ids: list[str] | None = None,
        intent: str | None = None,
        references_belief_entry_ids: list[str] | None = None,
        references_fact_entry_ids: list[str] | None = None,
        scene: SceneReference | None = None,
        effective_at: datetime | None = None,
        tags: list[str] | None = None,
    ) -> CharacterStateWriteResult:
        """Append spoken dialogue, deduplicating only the same dialogue event."""
        previous = self._find_utterance_by_dialogue(
            character_id=character_id,
            dialogue_id=provenance.dialogue_id,
        )

        entry = UtteranceEntry(
            metadata=self._build_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.UTTERANCE,
                provenance=provenance,
                scene=scene,
                effective_at=effective_at,
                tags=tags,
                previous_entry=previous,
            ),
            state_key=state_key,
            utterance_text=utterance_text,
            audience_character_ids=audience_character_ids or [],
            intent=intent,
            references_belief_entry_ids=references_belief_entry_ids or [],
            references_fact_entry_ids=references_fact_entry_ids or [],
        )
        if previous is not None and self._same_utterance_payload(previous, entry):
            return CharacterStateWriteResult(CharacterStateWriteAction.NOOP, previous, previous)

        self.store.append_character_state_entry(entry)
        action = (
            CharacterStateWriteAction.SUPERSEDED
            if previous is not None
            else CharacterStateWriteAction.CREATED
        )
        return CharacterStateWriteResult(
            action,
            entry,
            previous,
        )

    def _build_metadata(
        self,
        *,
        character_id: str,
        record_type: CharacterStateRecordType,
        provenance: CharacterStateProvenance,
        scene: SceneReference | None,
        effective_at: datetime | None,
        tags: list[str] | None,
        previous_entry: CharacterStateEntry | None,
    ) -> CharacterStateRecordMetadata:
        """Create metadata and attach lineage for append-only revisions."""
        provenance_copy = provenance.model_copy(deep=True)
        if (
            previous_entry is not None
            and previous_entry.metadata.entry_id not in provenance_copy.derived_from_entry_ids
        ):
            provenance_copy.derived_from_entry_ids.append(previous_entry.metadata.entry_id)

        metadata = CharacterStateRecordMetadata.create(
            character_id=character_id,
            record_type=record_type,
            provenance=provenance_copy,
            scene=scene,
            effective_at=effective_at,
            tags=tags,
        )
        if previous_entry is not None:
            metadata.lifecycle.supersedes_entry_id = previous_entry.metadata.entry_id
        return metadata

    def _get_latest_entry(
        self,
        *,
        record_type: CharacterStateRecordType,
        character_id: str,
        state_key: str,
    ) -> CharacterStateEntry | None:
        """Load the latest entry for a state key."""
        return self.store.load_latest_character_state_entry(
            record_type=record_type,
            character_id=character_id,
            state_key=state_key,
        )

    def _find_utterance_by_dialogue(
        self,
        *,
        character_id: str,
        dialogue_id: str | None,
    ) -> UtteranceEntry | None:
        """Resolve the latest utterance for one dialogue event, if already recorded."""
        if dialogue_id is None:
            return None
        utterances = self.store.load_utterances(character_id=character_id)
        for entry in reversed(utterances):
            if entry.metadata.provenance.dialogue_id == dialogue_id:
                return entry
        return None

    @staticmethod
    def _same_fact_payload(previous: ObjectiveFactEntry, current: ObjectiveFactEntry) -> bool:
        """Compare objective fact payloads without revision lineage."""
        return (
            previous.state_key == current.state_key
            and previous.fact_value == current.fact_value
            and previous.change_reason == current.change_reason
            and previous.affected_character_ids == current.affected_character_ids
        )

    @staticmethod
    def _same_memory_payload(previous: MemoryEntry, current: MemoryEntry) -> bool:
        """Compare remembered state payloads without revision lineage."""
        return (
            previous.state_key == current.state_key
            and previous.memory_summary == current.memory_summary
            and previous.remembered_value == current.remembered_value
            and previous.source_fact_entry_id == current.source_fact_entry_id
            and previous.experience_mode == current.experience_mode
            and previous.retention_confidence == current.retention_confidence
        )

    @staticmethod
    def _same_belief_payload(previous: BeliefEntry, current: BeliefEntry) -> bool:
        """Compare belief payloads without revision lineage."""
        return (
            previous.state_key == current.state_key
            and previous.belief_summary == current.belief_summary
            and previous.believed_value == current.believed_value
            and previous.interpretation_basis == current.interpretation_basis
            and previous.source_memory_entry_ids == current.source_memory_entry_ids
            and previous.source_fact_entry_ids == current.source_fact_entry_ids
            and previous.conviction == current.conviction
        )

    @staticmethod
    def _same_utterance_payload(previous: UtteranceEntry, current: UtteranceEntry) -> bool:
        """Compare utterance payloads without revision lineage."""
        return (
            previous.state_key == current.state_key
            and previous.utterance_text == current.utterance_text
            and previous.audience_character_ids == current.audience_character_ids
            and previous.intent == current.intent
            and previous.references_belief_entry_ids == current.references_belief_entry_ids
            and previous.references_fact_entry_ids == current.references_fact_entry_ids
        )
