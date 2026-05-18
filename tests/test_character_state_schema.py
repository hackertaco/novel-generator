"""Tests for normalized fact, memory, and belief schema surfaces."""

from __future__ import annotations

import unittest

from pydantic import ValidationError

from novel_generator.schema import (
    BeliefEntry,
    BeliefStateProvenance,
    CanonicalFactRecordSchema,
    CharacterBeliefStateSchema,
    CharacterMemoryStateSchema,
    CharacterStateDivergenceCause,
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    MemoryEntry,
    MemoryExperienceMode,
    ObjectiveFactEntry,
)


class CharacterStateSchemaTests(unittest.TestCase):
    """Validate the normalized schema contract for fact, memory, and belief layers."""

    def test_schema_views_normalize_provenance_across_fact_memory_and_belief(self) -> None:
        fact = ObjectiveFactEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.OBJECTIVE_FACT,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="world-model",
                    event_id="event_0301",
                ),
            ),
            state_key="fact:relic-owner",
            fact_value={"owner": "character:min-ji"},
            previous_fact_value={"owner": "character:seo-jin"},
            change_reason="Min-ji takes the relic back in the vault.",
            affected_character_ids=["character:min-ji", "character:seo-jin"],
        )
        memory = MemoryEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.MEMORY,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0301",
                    cause=CharacterStateDivergenceCause.FORGETTING.value,
                ),
            ),
            state_key="memory:relic-owner",
            memory_summary="Min-ji vaguely remembers Seo-jin still holding the relic.",
            remembered_value={"owner": "character:seo-jin"},
            source_fact_entry_id=fact.metadata.entry_id,
            experience_mode=MemoryExperienceMode.DIRECT,
            retention_confidence=0.41,
        )
        belief = BeliefEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.BELIEF,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0302",
                    cause=CharacterStateDivergenceCause.MISUNDERSTANDING.value,
                    derived_from_entry_ids=[memory.metadata.entry_id],
                ),
            ),
            state_key="belief:relic-owner",
            belief_summary="Min-ji believes Seo-jin escaped with the relic.",
            believed_value={"owner": "character:seo-jin"},
            interpretation_basis="She trusts her incomplete memory over the vault camera feed.",
            source_memory_entry_ids=[memory.metadata.entry_id],
            source_fact_entry_ids=[fact.metadata.entry_id],
            conviction=0.68,
        )

        fact_schema = CanonicalFactRecordSchema.from_entry(fact)
        memory_schema = CharacterMemoryStateSchema.from_entry(memory)
        belief_schema = CharacterBeliefStateSchema.from_entry(belief)

        self.assertEqual(fact_schema.provenance.source_event_id, "event_0301")
        self.assertEqual(fact_schema.provenance.confidence, 1.0)
        self.assertEqual(memory_schema.provenance.source_event_id, "event_0301")
        self.assertEqual(memory_schema.provenance.confidence, 0.41)
        self.assertEqual(
            memory_schema.provenance.divergence_cause,
            CharacterStateDivergenceCause.FORGETTING,
        )
        self.assertEqual(belief_schema.provenance.source_event_id, "event_0302")
        self.assertEqual(belief_schema.provenance.confidence, 0.68)
        self.assertEqual(
            belief_schema.provenance.divergence_cause,
            CharacterStateDivergenceCause.MISUNDERSTANDING,
        )
        self.assertEqual(belief_schema.source_memory_entry_ids, [memory.metadata.entry_id])
        self.assertEqual(belief_schema.source_fact_entry_ids, [fact.metadata.entry_id])

    def test_schema_views_preserve_custom_divergence_labels(self) -> None:
        belief = BeliefEntry(
            metadata=CharacterStateRecordMetadata.create(
                character_id="character:han-seo",
                record_type=CharacterStateRecordType.BELIEF,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0441",
                    cause="counterintel-implant",
                ),
            ),
            state_key="belief:min-ji-loyalty",
            belief_summary="Han-seo believes Min-ji was turned by a forged dossier.",
            believed_value={"traitor": "character:min-ji"},
            interpretation_basis="A forged dossier was planted in his private archive.",
            conviction=0.73,
        )

        schema = CharacterBeliefStateSchema.from_entry(belief)

        self.assertEqual(schema.provenance.divergence_cause, "counterintel-implant")

    def test_belief_provenance_rejects_blank_divergence_cause(self) -> None:
        with self.assertRaises(ValidationError):
            BeliefStateProvenance(confidence=0.5, divergence_cause="   ")


if __name__ == "__main__":
    unittest.main()
