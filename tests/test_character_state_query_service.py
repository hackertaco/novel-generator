"""Tests for the read-side character-state query service."""

from __future__ import annotations

from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from novel_generator.schema.character_state_contract import (
    BeliefEntry,
    CharacterStateQuery,
    CharacterStateSourceFilter,
    CharacterStateTimelineFilter,
    MemoryEntry,
    ObjectiveFactEntry,
    TimelineQueryRelation,
    UtteranceEntry,
)
from novel_generator.schema.character_state_metadata import (
    CharacterStateLifecycle,
    CharacterStateLifecycleStatus,
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    SceneReference,
)
from novel_generator.state import CharacterStateQueryService, StateStore


class CharacterStateQueryServiceTests(unittest.TestCase):
    """Verify snapshot and history APIs resolve against the direct-access store."""

    def _make_metadata(
        self,
        *,
        character_id: str,
        record_type: CharacterStateRecordType,
        provenance: CharacterStateProvenance,
        chapter_number: int,
        scene_id: str,
        scene_index: int,
        timeline_tick: int,
        occurred_at: datetime,
        lifecycle_status: CharacterStateLifecycleStatus = (
            CharacterStateLifecycleStatus.ACTIVE
        ),
        status_reason: str | None = None,
    ) -> CharacterStateRecordMetadata:
        recorded_at = occurred_at + timedelta(minutes=5)
        return CharacterStateRecordMetadata(
            character_id=character_id,
            record_type=record_type,
            recorded_at=recorded_at,
            effective_at=occurred_at,
            scene=SceneReference(
                chapter_number=chapter_number,
                scene_id=scene_id,
                scene_index=scene_index,
                timeline_tick=timeline_tick,
                occurred_at=occurred_at,
            ),
            provenance=provenance,
            lifecycle=CharacterStateLifecycle(
                status=lifecycle_status,
                created_at=recorded_at,
                updated_at=recorded_at,
                status_reason=status_reason,
            ),
        )

    def _seed_query_fixture(
        self,
        store: StateStore,
    ) -> dict[str, MemoryEntry | BeliefEntry | UtteranceEntry]:
        base_time = datetime(2026, 1, 1, tzinfo=UTC)

        early_memory = MemoryEntry(
            metadata=self._make_metadata(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0100",
                    actor_character_id="character:seo-jin",
                ),
                chapter_number=10,
                scene_id="scene-0010-00",
                scene_index=0,
                timeline_tick=100,
                occurred_at=base_time,
            ),
            state_key="memory:relic-owner",
            memory_summary="Min-ji remembers Han-seo holding the relic.",
            remembered_value={"owner": "character:han-seo"},
        )
        archived_memory = MemoryEntry(
            metadata=self._make_metadata(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0150",
                    actor_character_id="character:seo-jin",
                    cause="forgetting",
                ),
                chapter_number=15,
                scene_id="scene-0015-00",
                scene_index=0,
                timeline_tick=150,
                occurred_at=base_time + timedelta(hours=1),
                lifecycle_status=CharacterStateLifecycleStatus.ARCHIVED,
                status_reason="Replaced by later recall.",
            ),
            state_key="memory:relic-owner",
            memory_summary="Min-ji briefly recalls losing track of the relic.",
            remembered_value={"owner": "unknown"},
        )
        belief = BeliefEntry(
            metadata=self._make_metadata(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.BELIEF,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0200",
                    actor_character_id="character:min-ji",
                    cause="misunderstanding",
                ),
                chapter_number=20,
                scene_id="scene-0020-01",
                scene_index=1,
                timeline_tick=200,
                occurred_at=base_time + timedelta(minutes=90),
            ),
            state_key="belief:seo-jin-intent",
            belief_summary="Min-ji believes Seo-jin plans to hide the relic.",
            believed_value={"intent": "hide"},
            interpretation_basis="Seo-jin keeps scanning the exits instead of attacking.",
            source_memory_entry_ids=[early_memory.metadata.entry_id],
        )
        utterance = UtteranceEntry(
            metadata=self._make_metadata(
                character_id="character:seo-jin",
                record_type=CharacterStateRecordType.UTTERANCE,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="renderer",
                    event_id="event_0210",
                    dialogue_id="dialogue_0210",
                    actor_character_id="character:seo-jin",
                    cause="lying",
                ),
                chapter_number=21,
                scene_id="scene-0021-00",
                scene_index=0,
                timeline_tick=210,
                occurred_at=base_time + timedelta(minutes=100),
            ),
            state_key="utterance:relic-cover-story",
            utterance_text="I never touched the relic.",
            audience_character_ids=["character:min-ji"],
            intent="deceive",
            references_belief_entry_ids=[belief.metadata.entry_id],
        )
        late_memory = MemoryEntry(
            metadata=self._make_metadata(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0400",
                    actor_character_id="character:seo-jin",
                ),
                chapter_number=40,
                scene_id="scene-0040-02",
                scene_index=2,
                timeline_tick=400,
                occurred_at=base_time + timedelta(hours=2),
            ),
            state_key="memory:relic-owner",
            memory_summary="Min-ji remembers Seo-jin taking the relic.",
            remembered_value={"owner": "character:seo-jin"},
        )
        other_character_memory = MemoryEntry(
            metadata=self._make_metadata(
                character_id="character:han-seo",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0300",
                    actor_character_id="character:han-seo",
                ),
                chapter_number=30,
                scene_id="scene-0030-00",
                scene_index=0,
                timeline_tick=300,
                occurred_at=base_time + timedelta(minutes=110),
            ),
            state_key="memory:min-ji-reaction",
            memory_summary="Han-seo remembers Min-ji stepping between the rivals.",
            remembered_value={"reaction": "intervened"},
        )
        secret_memory = MemoryEntry(
            metadata=self._make_metadata(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0401",
                    actor_character_id="character:min-ji",
                ),
                chapter_number=41,
                scene_id="scene-0041-00",
                scene_index=0,
                timeline_tick=410,
                occurred_at=base_time + timedelta(hours=3),
            ),
            state_key="memory:secret-passage",
            memory_summary="Min-ji remembers the hidden stair beneath the altar.",
            remembered_value={"location": "altar-stairs"},
        )

        store.append_character_state_entries(
            [
                early_memory,
                archived_memory,
                belief,
                utterance,
                late_memory,
                other_character_memory,
                secret_memory,
            ]
        )
        return {
            "archived_memory": archived_memory,
            "belief": belief,
            "early_memory": early_memory,
            "late_memory": late_memory,
            "other_character_memory": other_character_memory,
            "secret_memory": secret_memory,
            "utterance": utterance,
        }

    def _seed_same_character_same_state_key_fixture(
        self,
        store: StateStore,
    ) -> dict[str, ObjectiveFactEntry | MemoryEntry | BeliefEntry | UtteranceEntry]:
        base_time = datetime(2026, 2, 1, tzinfo=UTC)
        character_id = "character:min-ji"
        state_key = "state:sealed-gate"

        objective_fact = ObjectiveFactEntry(
            metadata=self._make_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.OBJECTIVE_FACT,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="world-model",
                    event_id="event_0500",
                    actor_character_id=character_id,
                ),
                chapter_number=50,
                scene_id="scene-0050-00",
                scene_index=0,
                timeline_tick=500,
                occurred_at=base_time,
            ),
            state_key=state_key,
            fact_value={"gate": "sealed"},
            previous_fact_value={"gate": "open"},
            change_reason="Min-ji seals the gate after the relic transfer.",
            affected_character_ids=[character_id],
        )
        memory = MemoryEntry(
            metadata=self._make_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0501",
                    actor_character_id=character_id,
                ),
                chapter_number=50,
                scene_id="scene-0050-01",
                scene_index=1,
                timeline_tick=501,
                occurred_at=base_time + timedelta(minutes=1),
            ),
            state_key=state_key,
            memory_summary="Min-ji remembers sealing the gate herself.",
            remembered_value={"gate": "sealed"},
            source_fact_entry_id=objective_fact.metadata.entry_id,
        )
        belief = BeliefEntry(
            metadata=self._make_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.BELIEF,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0502",
                    actor_character_id=character_id,
                    cause="misunderstanding",
                ),
                chapter_number=50,
                scene_id="scene-0050-02",
                scene_index=2,
                timeline_tick=502,
                occurred_at=base_time + timedelta(minutes=2),
            ),
            state_key=state_key,
            belief_summary="Min-ji believes the sealed gate still hides a second exit.",
            believed_value={"escape_route": "second-exit"},
            interpretation_basis="The hinges echo like another lock turning behind the wall.",
            source_memory_entry_ids=[memory.metadata.entry_id],
            source_fact_entry_ids=[objective_fact.metadata.entry_id],
        )
        utterance = UtteranceEntry(
            metadata=self._make_metadata(
                character_id=character_id,
                record_type=CharacterStateRecordType.UTTERANCE,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="renderer",
                    event_id="event_0503",
                    dialogue_id="dialogue_0503",
                    actor_character_id=character_id,
                    cause="lying",
                ),
                chapter_number=50,
                scene_id="scene-0050-03",
                scene_index=3,
                timeline_tick=503,
                occurred_at=base_time + timedelta(minutes=3),
            ),
            state_key=state_key,
            utterance_text="The gate is still wide open. Seo-jin already escaped.",
            audience_character_ids=["character:han-seo"],
            intent="deceive",
            references_belief_entry_ids=[belief.metadata.entry_id],
            references_fact_entry_ids=[objective_fact.metadata.entry_id],
        )

        store.append_character_state_entries([objective_fact, memory, belief, utterance])
        return {
            "objective_fact": objective_fact,
            "memory": memory,
            "belief": belief,
            "utterance": utterance,
        }

    def test_query_service_supports_per_character_history_and_snapshot_queries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            service = CharacterStateQueryService(store)
            entries = self._seed_query_fixture(store)

            history = service.get_history_slice(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                    state_keys=["memory:relic-owner"],
                )
            )
            snapshot = service.get_state_snapshot(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                )
            )

            self.assertEqual(history.total_matches, 2)
            self.assertEqual(
                [entry.summary for entry in history.entries],
                [
                    entries["early_memory"].memory_summary,
                    entries["late_memory"].memory_summary,
                ],
            )
            self.assertEqual(snapshot.total_matches, 2)
            self.assertEqual(
                [entry.state_key for entry in snapshot.entries],
                ["memory:relic-owner", "memory:secret-passage"],
            )
            self.assertEqual(
                snapshot.entries[0].structured_value,
                entries["late_memory"].remembered_value,
            )
            self.assertEqual(
                snapshot.entries[1].structured_value,
                entries["secret_memory"].remembered_value,
            )

    def test_query_service_supports_each_source_filter_dimension(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            service = CharacterStateQueryService(store)
            entries = self._seed_query_fixture(store)

            filter_cases = {
                "kind": (
                    CharacterStateQuery(
                        character_ids=["character:min-ji"],
                        state_types=[CharacterStateRecordType.BELIEF],
                        source=CharacterStateSourceFilter(
                            kind=CharacterStateProvenanceKind.INTERPRETATION
                        ),
                    ),
                    [entries["belief"].belief_summary],
                ),
                "source_id": (
                    CharacterStateQuery(
                        character_ids=["character:min-ji"],
                        state_types=[CharacterStateRecordType.BELIEF],
                        source=CharacterStateSourceFilter(source_id="belief-model"),
                    ),
                    [entries["belief"].belief_summary],
                ),
                "event_id": (
                    CharacterStateQuery(
                        character_ids=["character:seo-jin"],
                        state_types=[CharacterStateRecordType.UTTERANCE],
                        source=CharacterStateSourceFilter(event_id="event_0210"),
                    ),
                    [entries["utterance"].utterance_text],
                ),
                "dialogue_id": (
                    CharacterStateQuery(
                        character_ids=["character:seo-jin"],
                        state_types=[CharacterStateRecordType.UTTERANCE],
                        source=CharacterStateSourceFilter(dialogue_id="dialogue_0210"),
                    ),
                    [entries["utterance"].utterance_text],
                ),
                "actor_character_id": (
                    CharacterStateQuery(
                        character_ids=["character:min-ji"],
                        state_types=[CharacterStateRecordType.BELIEF],
                        source=CharacterStateSourceFilter(
                            actor_character_id="character:min-ji"
                        ),
                    ),
                    [entries["belief"].belief_summary],
                ),
                "cause": (
                    CharacterStateQuery(
                        character_ids=["character:min-ji"],
                        state_types=[CharacterStateRecordType.BELIEF],
                        source=CharacterStateSourceFilter(cause="misunderstanding"),
                    ),
                    [entries["belief"].belief_summary],
                ),
            }

            for dimension, (query, expected_summaries) in filter_cases.items():
                with self.subTest(dimension=dimension):
                    response = service.query_history_slice(query)
                    self.assertEqual(
                        [entry.summary for entry in response.entries],
                        expected_summaries,
                    )

    def test_query_service_supports_each_timeline_dimension_inactive_entries_and_limit(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            service = CharacterStateQueryService(store)
            entries = self._seed_query_fixture(store)

            timeline_cases = {
                "chapter_number": CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.BELIEF],
                    timeline_position=CharacterStateTimelineFilter(chapter_number=20),
                ),
                "scene_id": CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.BELIEF],
                    timeline_position=CharacterStateTimelineFilter(scene_id="scene-0020-01"),
                ),
                "scene_index": CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.BELIEF],
                    timeline_position=CharacterStateTimelineFilter(scene_index=1),
                ),
                "timeline_tick": CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                    state_keys=["memory:secret-passage"],
                    timeline_position=CharacterStateTimelineFilter(
                        relation=TimelineQueryRelation.AT_OR_AFTER,
                        timeline_tick=410,
                    ),
                ),
                "occurred_at": CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.BELIEF],
                    timeline_position=CharacterStateTimelineFilter(
                        relation=TimelineQueryRelation.AT_OR_BEFORE,
                        occurred_at=entries["belief"].metadata.scene.occurred_at,
                    ),
                ),
            }

            for dimension, query in timeline_cases.items():
                with self.subTest(dimension=dimension):
                    response = service.get_history_slice(query)
                    self.assertEqual(len(response.entries), 1)

            active_history = service.get_history_slice(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                    state_keys=["memory:relic-owner"],
                )
            )
            full_history = service.get_history_slice(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                    state_keys=["memory:relic-owner"],
                    include_inactive=True,
                )
            )
            limited_history = service.get_history_slice(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                    state_keys=["memory:relic-owner"],
                    include_inactive=True,
                    limit=2,
                )
            )

            self.assertEqual(
                [entry.summary for entry in active_history.entries],
                [
                    entries["early_memory"].memory_summary,
                    entries["late_memory"].memory_summary,
                ],
            )
            self.assertEqual(
                [entry.summary for entry in full_history.entries],
                [
                    entries["early_memory"].memory_summary,
                    entries["archived_memory"].memory_summary,
                    entries["late_memory"].memory_summary,
                ],
            )
            self.assertEqual(limited_history.total_matches, 3)
            self.assertTrue(limited_history.has_more)
            self.assertEqual(len(limited_history.entries), 2)

    def test_query_service_combines_filters_without_reconstructing_full_novel_context(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            service = CharacterStateQueryService(store)
            entries = self._seed_query_fixture(store)

            ledger_root = Path(tmp_dir) / ".state" / "character_state"
            for ledger_name in (
                "objective_facts.jsonl",
                "memories.jsonl",
                "beliefs.jsonl",
                "utterances.jsonl",
            ):
                ledger_path = ledger_root / ledger_name
                if ledger_path.exists():
                    ledger_path.unlink()

            query = CharacterStateQuery(
                character_ids=["character:min-ji"],
                state_types=[CharacterStateRecordType.BELIEF],
                state_keys=["belief:seo-jin-intent"],
                source=CharacterStateSourceFilter(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0200",
                    actor_character_id="character:min-ji",
                    cause="misunderstanding",
                ),
                timeline_position=CharacterStateTimelineFilter(
                    relation=TimelineQueryRelation.AT_OR_AFTER,
                    chapter_number=20,
                    scene_index=1,
                    timeline_tick=200,
                    occurred_at=entries["belief"].metadata.scene.occurred_at,
                ),
            )

            with ExitStack() as stack:
                for method_name in (
                    "load_seed",
                    "load_chapter_summary",
                    "get_all_summaries",
                    "load_character_states",
                ):
                    stack.enter_context(
                        mock.patch.object(
                            store,
                            method_name,
                            side_effect=AssertionError(
                                f"{method_name} should not be used for direct state retrieval"
                            ),
                        )
                    )

                history = service.get_history_slice(query)
                snapshot = service.get_state_snapshot(query)

            self.assertEqual(history.total_matches, 1)
            self.assertEqual(len(history.entries), 1)
            self.assertEqual(history.entries[0].summary, entries["belief"].belief_summary)
            self.assertEqual(snapshot.total_matches, 1)
            self.assertEqual(snapshot.entries[0].entry_id, entries["belief"].metadata.entry_id)

    def test_query_service_independently_retrieves_each_record_type_for_same_character(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            service = CharacterStateQueryService(store)
            entries = self._seed_same_character_same_state_key_fixture(store)

            cases = (
                (
                    "objective_fact",
                    CharacterStateRecordType.OBJECTIVE_FACT,
                    entries["objective_fact"].change_reason,
                    entries["objective_fact"].fact_value,
                    [],
                ),
                (
                    "memory",
                    CharacterStateRecordType.MEMORY,
                    entries["memory"].memory_summary,
                    entries["memory"].remembered_value,
                    [],
                ),
                (
                    "belief",
                    CharacterStateRecordType.BELIEF,
                    entries["belief"].belief_summary,
                    entries["belief"].believed_value,
                    [],
                ),
                (
                    "utterance",
                    CharacterStateRecordType.UTTERANCE,
                    entries["utterance"].utterance_text,
                    {
                        "text": entries["utterance"].utterance_text,
                        "intent": entries["utterance"].intent,
                    },
                    entries["utterance"].audience_character_ids,
                ),
            )

            for entry_name, record_type, expected_summary, expected_value, expected_audience in cases:
                with self.subTest(record_type=record_type.value):
                    query = CharacterStateQuery(
                        character_ids=["character:min-ji"],
                        state_types=[record_type],
                        state_keys=[entries[entry_name].state_key],
                    )

                    history = service.get_history_slice(query)
                    snapshot = service.get_state_snapshot(query)

                    for response in (history, snapshot):
                        self.assertEqual(response.total_matches, 1)
                        self.assertFalse(response.has_more)
                        self.assertEqual(len(response.entries), 1)
                        self.assertEqual(
                            response.entries[0].entry_id,
                            entries[entry_name].metadata.entry_id,
                        )
                        self.assertEqual(response.entries[0].character_id, "character:min-ji")
                        self.assertEqual(response.entries[0].state_type, record_type)
                        self.assertEqual(response.entries[0].summary, expected_summary)
                        self.assertEqual(response.entries[0].structured_value, expected_value)
                        self.assertEqual(
                            response.entries[0].audience_character_ids,
                            expected_audience,
                        )


if __name__ == "__main__":
    unittest.main()
