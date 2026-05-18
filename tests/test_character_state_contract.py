"""Tests for typed character-state write schema and persistence contract."""

from __future__ import annotations

import unittest

from pydantic import ValidationError

from novel_generator.schema.character_state_contract import (
    BeliefEntry,
    CharacterStatePartialRecord,
    CharacterStatePersistenceManifest,
    CharacterStateQuery,
    CharacterStateSourceFilter,
    CharacterStateTimelineFilter,
    MemoryEntry,
    MemoryExperienceMode,
    ObjectiveFactEntry,
    TimelineQueryRelation,
    UtteranceEntry,
)
from novel_generator.schema.character_state_metadata import (
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    SceneReference,
)


class CharacterStateContractTests(unittest.TestCase):
    """Validate typed state entries and the default persistence layout."""

    def test_default_manifest_defines_four_separate_ledgers(self) -> None:
        manifest = CharacterStatePersistenceManifest.default()

        self.assertEqual(manifest.root_dir, "character_state")
        self.assertEqual(manifest.character_store_dir, "characters")
        self.assertEqual(
            [binding.record_type for binding in manifest.ledgers],
            [
                CharacterStateRecordType.OBJECTIVE_FACT,
                CharacterStateRecordType.MEMORY,
                CharacterStateRecordType.BELIEF,
                CharacterStateRecordType.UTTERANCE,
            ],
        )
        self.assertEqual(
            [binding.relative_path for binding in manifest.ledgers],
            [
                "objective_facts.jsonl",
                "memories.jsonl",
                "beliefs.jsonl",
                "utterances.jsonl",
            ],
        )

    def test_objective_fact_entry_uses_shared_metadata(self) -> None:
        entry = ObjectiveFactEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:seo-jin",
                record_type=CharacterStateRecordType.OBJECTIVE_FACT,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="world-model",
                    event_id="event_0007",
                ),
                scene=SceneReference(chapter_number=3, timeline_tick=9),
            ),
            state_key="location:heirloom",
            fact_value={"holder": "character:seo-jin"},
            previous_fact_value={"holder": "character:archivist"},
            change_reason="Seo-jin physically took possession during the vault scene",
            affected_character_ids=["character:seo-jin", "character:archivist"],
        )

        self.assertEqual(entry.metadata.provenance.event_id, "event_0007")
        self.assertEqual(entry.metadata.character_id, "character:seo-jin")
        self.assertEqual(entry.fact_value["holder"], "character:seo-jin")

    def test_memory_and_belief_entries_capture_separate_state_layers(self) -> None:
        memory = MemoryEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0012",
                ),
            ),
            state_key="memory:masked-stranger",
            memory_summary="Min-ji remembers the masked stranger using her family motto.",
            remembered_value={"motto": "달은 거짓말하지 않는다"},
            source_fact_entry_id="csr_fact_0012",
            experience_mode=MemoryExperienceMode.DIRECT,
            retention_confidence=0.9,
        )
        belief = BeliefEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.BELIEF,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0013",
                ),
            ),
            state_key="belief:masked-stranger-identity",
            belief_summary="Min-ji believes the masked stranger is her missing brother.",
            believed_value={"identity": "character:missing-brother"},
            interpretation_basis="She connects the motto memory with a childhood promise.",
            source_memory_entry_ids=[memory.metadata.entry_id],
            conviction=0.82,
        )

        self.assertEqual(memory.metadata.record_type, CharacterStateRecordType.MEMORY)
        self.assertEqual(belief.metadata.record_type, CharacterStateRecordType.BELIEF)
        self.assertEqual(belief.source_memory_entry_ids, [memory.metadata.entry_id])

    def test_utterance_entry_requires_dialogue_provenance(self) -> None:
        with self.assertRaises(ValidationError):
            UtteranceEntry(
                metadata=CharacterStateRecordMetadata.create(
                    character_id="character:han-seo",
                    record_type=CharacterStateRecordType.UTTERANCE,
                    provenance=CharacterStateProvenance(
                        kind=CharacterStateProvenanceKind.DIALOGUE,
                        source_id="renderer",
                    ),
                ),
                state_key="utterance:warning",
                utterance_text="지금 문을 열면 다 죽어.",
            )

    def test_query_contract_validates_timeline_filter_and_normalizes_partial_record(self) -> None:
        memory = MemoryEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0402",
                    cause="direct_witness",
                ),
                scene=SceneReference(
                    chapter_number=40,
                    scene_id="scene_040_02",
                    scene_index=1,
                    timeline_tick=812,
                ),
            ),
            state_key="memory:relic-owner",
            memory_summary="Min-ji remembers Seo-jin taking the relic.",
            remembered_value={"owner": "character:seo-jin"},
            source_fact_entry_id="csr_fact_0401",
        )

        query = CharacterStateQuery(
            character_ids=["character:min-ji"],
            state_types=[CharacterStateRecordType.MEMORY],
            source=CharacterStateSourceFilter(
                kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                source_id="interaction-simulator",
            ),
            timeline_position=CharacterStateTimelineFilter(
                relation=TimelineQueryRelation.AT_OR_BEFORE,
                chapter_number=40,
                timeline_tick=900,
            ),
            limit=5,
        )
        partial = CharacterStatePartialRecord.from_entry(memory)

        self.assertEqual(query.character_ids, ["character:min-ji"])
        self.assertEqual(partial.summary, "Min-ji remembers Seo-jin taking the relic.")
        self.assertEqual(partial.structured_value, {"owner": "character:seo-jin"})
        self.assertEqual(partial.related_entry_ids, ["csr_fact_0401"])
        self.assertEqual(partial.source.source_id, "interaction-simulator")
        self.assertEqual(partial.source.cause, "direct_witness")
        self.assertEqual(partial.timeline.chapter_number, 40)
        self.assertEqual(partial.timeline.timeline_tick, 812)

    def test_timeline_filter_rejects_scene_id_range_queries(self) -> None:
        with self.assertRaises(ValidationError):
            CharacterStateTimelineFilter(
                relation=TimelineQueryRelation.AT_OR_AFTER,
                scene_id="scene_010_00",
            )


if __name__ == "__main__":
    unittest.main()
