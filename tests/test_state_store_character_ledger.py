"""Tests for append-only character-state ledger persistence."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from novel_generator.schema.character_state_contract import (
    BeliefEntry,
    CharacterStateQuery,
    CharacterStateSourceFilter,
    CharacterStateTimelineFilter,
    MemoryEntry,
    TimelineQueryRelation,
)
from novel_generator.schema.character_state_metadata import (
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    SceneReference,
)
from novel_generator.state.store import StateStore
from tests.verification_fixture import seed_character_state_verification_fixture


class StateStoreCharacterLedgerTests(unittest.TestCase):
    """Verify the new persistence contract writes separate ledgers per state type."""

    def test_append_and_load_character_state_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            fixture = seed_character_state_verification_fixture(store)

            manifest = store.load_character_state_manifest()
            self.assertEqual(manifest.root_dir, "character_state")

            ledger_root = Path(tmp_dir) / ".state" / "character_state"
            self.assertTrue((ledger_root / "objective_facts.jsonl").exists())
            self.assertTrue((ledger_root / "memories.jsonl").exists())
            self.assertTrue((ledger_root / "beliefs.jsonl").exists())
            self.assertTrue((ledger_root / "utterances.jsonl").exists())
            self.assertTrue((ledger_root / "characters" / "character%3Amin-ji.jsonl").exists())

            loaded_entries = store.load_character_state_entries()
            loaded_memories = store.load_memories(character_id="character:min-ji")
            loaded_utterances = store.load_utterances(character_id=fixture.character_id)

            self.assertEqual(len(loaded_entries), 4)
            self.assertEqual(len(loaded_memories), 1)
            self.assertEqual(
                loaded_memories[0].metadata.entry_id,
                fixture.memory_entry_id,
            )
            self.assertEqual(
                loaded_memories[0].source_fact_entry_id,
                fixture.fact_entry_id,
            )
            self.assertEqual(len(loaded_utterances), 1)
            self.assertEqual(
                loaded_utterances[0].metadata.entry_id,
                fixture.utterance_entry_id,
            )
            self.assertEqual(
                loaded_utterances[0].references_belief_entry_ids,
                [fixture.belief_entry_id],
            )

    def test_query_character_state_returns_normalized_partial_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))

            early_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0200",
                    ),
                    scene=SceneReference(chapter_number=20, timeline_tick=400),
                ),
                state_key="memory:relic-owner",
                memory_summary="Min-ji remembers Han-seo holding the relic.",
                remembered_value={"owner": "character:han-seo"},
                source_fact_entry_id="csr_fact_0200",
            )
            later_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0400",
                    ),
                    scene=SceneReference(chapter_number=40, timeline_tick=810),
                ),
                state_key="memory:relic-owner",
                memory_summary="Min-ji remembers Seo-jin taking the relic.",
                remembered_value={"owner": "character:seo-jin"},
                source_fact_entry_id="csr_fact_0400",
            )
            belief = BeliefEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.BELIEF,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.INTERPRETATION,
                        source_id="belief-model",
                        event_id="event_0401",
                    ),
                    scene=SceneReference(chapter_number=40, timeline_tick=811),
                ),
                state_key="belief:seo-jin-intent",
                belief_summary="Min-ji believes Seo-jin intends to hide the relic.",
                believed_value={"intent": "hide"},
                interpretation_basis="Seo-jin keeps scanning for watchers.",
                source_memory_entry_ids=[later_memory.metadata.entry_id],
            )
            other_character_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:han-seo",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0402",
                    ),
                    scene=SceneReference(chapter_number=40, timeline_tick=812),
                ),
                state_key="memory:min-ji-reaction",
                memory_summary="Han-seo remembers Min-ji recoiling from Seo-jin.",
                remembered_value={"reaction": "recoil"},
            )

            store.append_character_state_entries(
                [early_memory, later_memory, belief, other_character_memory]
            )

            response = store.query_character_state(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                    source=CharacterStateSourceFilter(source_id="interaction-simulator"),
                    timeline_position=CharacterStateTimelineFilter(
                        relation=TimelineQueryRelation.AT_OR_AFTER,
                        chapter_number=30,
                    ),
                    limit=1,
                )
            )

            self.assertEqual(response.total_matches, 1)
            self.assertFalse(response.has_more)
            self.assertEqual(len(response.entries), 1)
            self.assertEqual(response.entries[0].character_id, "character:min-ji")
            self.assertEqual(response.entries[0].state_type, CharacterStateRecordType.MEMORY)
            self.assertEqual(response.entries[0].summary, later_memory.memory_summary)
            self.assertEqual(
                response.entries[0].structured_value,
                {"owner": "character:seo-jin"},
            )
            self.assertEqual(response.entries[0].timeline.chapter_number, 40)

    def test_character_scoped_queries_use_direct_store_without_global_ledger_scan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))

            early_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0300",
                    ),
                    scene=SceneReference(chapter_number=30, timeline_tick=600),
                ),
                state_key="memory:relic-owner",
                memory_summary="Min-ji remembers Han-seo holding the relic.",
                remembered_value={"owner": "character:han-seo"},
                source_fact_entry_id="csr_fact_0300",
            )
            later_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0400",
                    ),
                    scene=SceneReference(chapter_number=40, timeline_tick=810),
                ),
                state_key="memory:relic-owner",
                memory_summary="Min-ji remembers Seo-jin taking the relic.",
                remembered_value={"owner": "character:seo-jin"},
                source_fact_entry_id="csr_fact_0400",
            )
            belief = BeliefEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.BELIEF,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.INTERPRETATION,
                        source_id="belief-model",
                        event_id="event_0401",
                    ),
                    scene=SceneReference(chapter_number=40, timeline_tick=811),
                ),
                state_key="belief:seo-jin-intent",
                belief_summary="Min-ji believes Seo-jin intends to hide the relic.",
                believed_value={"intent": "hide"},
                interpretation_basis="Seo-jin keeps scanning for watchers.",
                source_memory_entry_ids=[later_memory.metadata.entry_id],
            )

            store.append_character_state_entries([early_memory, later_memory, belief])

            ledger_root = Path(tmp_dir) / ".state" / "character_state"
            (ledger_root / "memories.jsonl").unlink()
            (ledger_root / "beliefs.jsonl").unlink()

            response = store.query_character_state(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[
                        CharacterStateRecordType.MEMORY,
                        CharacterStateRecordType.BELIEF,
                    ],
                    source=CharacterStateSourceFilter(source_id="interaction-simulator"),
                    timeline_position=CharacterStateTimelineFilter(
                        relation=TimelineQueryRelation.AT_OR_AFTER,
                        chapter_number=35,
                    ),
                )
            )

            self.assertEqual(response.total_matches, 1)
            self.assertEqual(len(response.entries), 1)
            self.assertEqual(response.entries[0].state_type, CharacterStateRecordType.MEMORY)
            self.assertEqual(response.entries[0].timeline.chapter_number, 40)

            latest = store.load_latest_character_state_entry(
                record_type=CharacterStateRecordType.MEMORY,
                character_id="character:min-ji",
                state_key="memory:relic-owner",
            )

            self.assertIsNotNone(latest)
            self.assertEqual(latest.metadata.entry_id, later_memory.metadata.entry_id)

    def test_character_scoped_queries_independently_retrieve_each_record_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            fixture = seed_character_state_verification_fixture(store)

            ledger_root = Path(tmp_dir) / ".state" / "character_state"
            for ledger_name in (
                "objective_facts.jsonl",
                "memories.jsonl",
                "beliefs.jsonl",
                "utterances.jsonl",
            ):
                (ledger_root / ledger_name).unlink()

            cases = (
                (
                    CharacterStateRecordType.OBJECTIVE_FACT,
                    fixture.fact.state_key,
                    fixture.fact.metadata.entry_id,
                    fixture.fact.change_reason,
                    fixture.fact.fact_value,
                    [],
                ),
                (
                    CharacterStateRecordType.MEMORY,
                    fixture.memory.state_key,
                    fixture.memory.metadata.entry_id,
                    fixture.memory.memory_summary,
                    fixture.memory.remembered_value,
                    [],
                ),
                (
                    CharacterStateRecordType.BELIEF,
                    fixture.belief.state_key,
                    fixture.belief.metadata.entry_id,
                    fixture.belief.belief_summary,
                    fixture.belief.believed_value,
                    [],
                ),
                (
                    CharacterStateRecordType.UTTERANCE,
                    fixture.utterance.state_key,
                    fixture.utterance.metadata.entry_id,
                    fixture.utterance.utterance_text,
                    {
                        "text": fixture.utterance.utterance_text,
                        "intent": fixture.utterance.intent,
                    },
                    fixture.utterance.audience_character_ids,
                ),
            )

            for (
                record_type,
                state_key,
                entry_id,
                expected_summary,
                expected_value,
                expected_audience,
            ) in cases:
                with self.subTest(record_type=record_type.value):
                    response = store.query_character_state(
                        CharacterStateQuery(
                            character_ids=[fixture.character_id],
                            state_types=[record_type],
                            state_keys=[state_key],
                        )
                    )

                    self.assertEqual(response.total_matches, 1)
                    self.assertFalse(response.has_more)
                    self.assertEqual(len(response.entries), 1)
                    self.assertEqual(response.entries[0].entry_id, entry_id)
                    self.assertEqual(response.entries[0].character_id, fixture.character_id)
                    self.assertEqual(response.entries[0].state_type, record_type)
                    self.assertEqual(response.entries[0].summary, expected_summary)
                    self.assertEqual(response.entries[0].structured_value, expected_value)
                    self.assertEqual(
                        response.entries[0].audience_character_ids,
                        expected_audience,
                    )

    def test_query_character_state_snapshot_returns_latest_entries_per_state_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))

            early_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0700",
                    ),
                    scene=SceneReference(chapter_number=70, timeline_tick=1400),
                ),
                state_key="memory:relic-owner",
                memory_summary="Min-ji remembers Han-seo holding the relic.",
                remembered_value={"owner": "character:han-seo"},
            )
            later_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0800",
                    ),
                    scene=SceneReference(chapter_number=80, timeline_tick=1600),
                ),
                state_key="memory:relic-owner",
                memory_summary="Min-ji remembers Seo-jin taking the relic.",
                remembered_value={"owner": "character:seo-jin"},
            )
            second_memory = MemoryEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:min-ji",
                    record_type=CharacterStateRecordType.MEMORY,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                        source_id="interaction-simulator",
                        event_id="event_0801",
                    ),
                    scene=SceneReference(chapter_number=80, timeline_tick=1601),
                ),
                state_key="memory:secret-passage",
                memory_summary="Min-ji remembers the hidden stair beneath the altar.",
                remembered_value={"location": "altar-stairs"},
            )

            store.append_character_state_entries([early_memory, later_memory, second_memory])

            response = store.query_character_state_snapshot(
                CharacterStateQuery(
                    character_ids=["character:min-ji"],
                    state_types=[CharacterStateRecordType.MEMORY],
                    source=CharacterStateSourceFilter(source_id="interaction-simulator"),
                )
            )

            self.assertEqual(response.total_matches, 2)
            self.assertEqual(len(response.entries), 2)
            self.assertEqual(
                [entry.state_key for entry in response.entries],
                ["memory:relic-owner", "memory:secret-passage"],
            )
            self.assertEqual(
                response.entries[0].structured_value,
                {"owner": "character:seo-jin"},
            )
            self.assertEqual(
                response.entries[1].structured_value,
                {"location": "altar-stairs"},
            )


if __name__ == "__main__":
    unittest.main()
