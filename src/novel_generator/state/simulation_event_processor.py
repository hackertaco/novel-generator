"""Persist non-dialogue simulation events through the append-only state writer."""

from __future__ import annotations

from dataclasses import dataclass, field

from novel_generator.schema.character_state_contract import CharacterStateEntry
from novel_generator.schema.character_state_metadata import (
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordType,
    SceneReference,
)
from novel_generator.schema.simulation_event import (
    CharacterStateReference,
    SimulationStateEvent,
)
from novel_generator.state.character_state_writer import (
    CharacterStateWriter,
    CharacterStateWriteResult,
)


@dataclass(slots=True)
class ProcessedSimulationEvent:
    """Structured write results for one persisted simulation event."""

    event_id: str
    objective_fact_results: list[CharacterStateWriteResult] = field(default_factory=list)
    memory_results: list[CharacterStateWriteResult] = field(default_factory=list)
    belief_results: list[CharacterStateWriteResult] = field(default_factory=list)

    @property
    def write_results(self) -> list[CharacterStateWriteResult]:
        """Return all write results in causal write order."""
        return [
            *self.objective_fact_results,
            *self.memory_results,
            *self.belief_results,
        ]


class SimulationEventProcessor:
    """Bridge structured non-dialogue events into append-only character-state ledgers."""

    def __init__(self, writer: CharacterStateWriter):
        self.writer = writer

    def apply_event(self, event: SimulationStateEvent) -> ProcessedSimulationEvent:
        """Persist one structured simulation event into the character-state ledgers."""
        scene = self._build_scene(event)
        processed = ProcessedSimulationEvent(event_id=event.event_id)
        local_results: dict[
            tuple[CharacterStateRecordType, str, str],
            CharacterStateWriteResult,
        ] = {}

        for update in event.objective_fact_updates:
            result = self.writer.write_objective_fact(
                character_id=update.character_id,
                state_key=update.state_key,
                fact_value=update.fact_value,
                change_reason=update.change_reason,
                provenance=self._build_provenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    event=event,
                    source_id=update.source_id,
                    cause=update.cause,
                ),
                affected_character_ids=update.affected_character_ids,
                scene=scene,
                tags=self._merge_tags(event.tags, update.tags),
            )
            processed.objective_fact_results.append(result)
            self._remember_result(local_results, result)

        for update in event.memory_updates:
            result = self.writer.write_memory(
                character_id=update.character_id,
                state_key=update.state_key,
                memory_summary=update.memory_summary,
                remembered_value=update.remembered_value,
                source_fact_entry_id=self._resolve_fact_entry_id(local_results, update.source_fact),
                experience_mode=update.experience_mode,
                retention_confidence=update.retention_confidence,
                provenance=self._build_provenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    event=event,
                    source_id=update.source_id,
                    cause=update.cause,
                ),
                scene=scene,
                tags=self._merge_tags(event.tags, update.tags),
            )
            processed.memory_results.append(result)
            self._remember_result(local_results, result)

        for update in event.belief_updates:
            result = self.writer.write_belief(
                character_id=update.character_id,
                state_key=update.state_key,
                belief_summary=update.belief_summary,
                believed_value=update.believed_value,
                interpretation_basis=update.interpretation_basis,
                source_memory_entry_ids=self._resolve_memory_entry_ids(
                    local_results,
                    update.source_memories,
                ),
                source_fact_entry_ids=self._resolve_fact_entry_ids(
                    local_results,
                    update.source_facts,
                ),
                conviction=update.conviction,
                provenance=self._build_provenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    event=event,
                    source_id=update.source_id or "belief-model",
                    cause=update.cause,
                ),
                scene=scene,
                tags=self._merge_tags(event.tags, update.tags),
            )
            processed.belief_results.append(result)
            self._remember_result(local_results, result)

        return processed

    @staticmethod
    def _remember_result(
        local_results: dict[tuple[CharacterStateRecordType, str, str], CharacterStateWriteResult],
        result: CharacterStateWriteResult,
    ) -> None:
        """Track the newest result for one record-type/state-key tuple."""
        local_results[
            (
                result.entry.record_type,
                result.entry.metadata.character_id,
                result.entry.state_key,
            )
        ] = result

    @staticmethod
    def _build_scene(event: SimulationStateEvent) -> SceneReference:
        """Create a shared scene anchor for all writes caused by one event."""
        return SceneReference(
            chapter_number=event.chapter_number,
            scene_id=event.scene_id,
            scene_index=event.scene_index,
            timeline_tick=event.timeline_tick,
            label=event.summary,
        )

    @staticmethod
    def _merge_tags(event_tags: list[str], update_tags: list[str]) -> list[str]:
        """Merge event-level and effect-level tags while preserving order."""
        seen: set[str] = set()
        ordered: list[str] = []
        for tag in [*event_tags, *update_tags]:
            if tag not in seen:
                seen.add(tag)
                ordered.append(tag)
        return ordered

    @staticmethod
    def _build_provenance(
        *,
        kind: CharacterStateProvenanceKind,
        event: SimulationStateEvent,
        source_id: str | None,
        cause: str | None,
    ) -> CharacterStateProvenance:
        """Build shared provenance for one event-caused state write."""
        return CharacterStateProvenance(
            kind=kind,
            source_id=source_id or event.source_id,
            event_id=event.event_id,
            actor_character_id=event.actor_character_id,
            cause=cause,
        )

    def _resolve_fact_entry_id(
        self,
        local_results: dict[tuple[CharacterStateRecordType, str, str], CharacterStateWriteResult],
        reference: CharacterStateReference | None,
    ) -> str | None:
        """Resolve one fact reference into the latest ledger entry ID."""
        if reference is None:
            return None
        entry = self._lookup_entry(
            local_results,
            record_type=CharacterStateRecordType.OBJECTIVE_FACT,
            reference=reference,
        )
        return entry.metadata.entry_id if entry is not None else None

    def _resolve_fact_entry_ids(
        self,
        local_results: dict[tuple[CharacterStateRecordType, str, str], CharacterStateWriteResult],
        references: list[CharacterStateReference],
    ) -> list[str]:
        """Resolve fact references into the newest matching ledger entry IDs."""
        entry_ids: list[str] = []
        for reference in references:
            entry_id = self._resolve_fact_entry_id(local_results, reference)
            if entry_id is not None:
                entry_ids.append(entry_id)
        return entry_ids

    def _resolve_memory_entry_ids(
        self,
        local_results: dict[tuple[CharacterStateRecordType, str, str], CharacterStateWriteResult],
        references: list[CharacterStateReference],
    ) -> list[str]:
        """Resolve memory references into the newest matching ledger entry IDs."""
        entry_ids: list[str] = []
        for reference in references:
            entry = self._lookup_entry(
                local_results,
                record_type=CharacterStateRecordType.MEMORY,
                reference=reference,
            )
            if entry is not None:
                entry_ids.append(entry.metadata.entry_id)
        return entry_ids

    def _lookup_entry(
        self,
        local_results: dict[tuple[CharacterStateRecordType, str, str], CharacterStateWriteResult],
        *,
        record_type: CharacterStateRecordType,
        reference: CharacterStateReference,
    ) -> CharacterStateEntry | None:
        """Resolve a state reference from local writes first, then persisted ledger state."""
        key = (record_type, reference.character_id, reference.state_key)
        if key in local_results:
            return local_results[key].entry

        return self.writer.store.load_latest_character_state_entry(
            record_type=record_type,
            character_id=reference.character_id,
            state_key=reference.state_key,
        )
