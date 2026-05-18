"""Tests for shared per-character state metadata."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError

from novel_generator.schema.character_state_metadata import (
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    SceneReference,
)


class CharacterStateRecordMetadataTests(unittest.TestCase):
    """Validate the shared character-state metadata contract."""

    def test_create_generates_ids_timestamps_and_lifecycle_defaults(self) -> None:
        metadata = CharacterStateRecordMetadata.create(
            character_id="character:han-seo",
            record_type=CharacterStateRecordType.MEMORY,
            provenance=CharacterStateProvenance(
                kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                source_id="interaction-simulator",
                event_id="event_00042",
            ),
            scene=SceneReference(
                chapter_number=12,
                scene_id="scene_12_arrival",
                scene_index=1,
                timeline_tick=311,
            ),
            tags=["experienced", "high-priority"],
        )

        self.assertTrue(metadata.entry_id.startswith("csr_"))
        self.assertEqual(metadata.character_id, "character:han-seo")
        self.assertEqual(metadata.record_type, CharacterStateRecordType.MEMORY)
        self.assertEqual(metadata.scene.timeline_tick, 311)
        self.assertEqual(metadata.provenance.event_id, "event_00042")
        self.assertEqual(metadata.lifecycle.status.value, "active")
        self.assertIsNotNone(metadata.recorded_at.tzinfo)

    def test_scene_reference_requires_temporal_or_scene_anchor(self) -> None:
        with self.assertRaises(ValidationError):
            SceneReference()

    def test_blank_character_ids_are_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CharacterStateRecordMetadata.create(
                character_id="   ",
                record_type=CharacterStateRecordType.UTTERANCE,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="renderer",
                    dialogue_id="dialogue_001",
                ),
            )

    def test_effective_at_cannot_be_after_recorded_at(self) -> None:
        recorded_at = datetime.now(UTC)
        with self.assertRaises(ValidationError):
            CharacterStateRecordMetadata(
                character_id="character:min-ji",
                record_type=CharacterStateRecordType.BELIEF,
                recorded_at=recorded_at,
                effective_at=recorded_at + timedelta(minutes=1),
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                ),
            )

    def test_utterance_records_require_dialogue_id(self) -> None:
        with self.assertRaises(ValidationError):
            CharacterStateRecordMetadata.create(
                character_id="character:han-seo",
                record_type=CharacterStateRecordType.UTTERANCE,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="interaction-simulator",
                ),
            )


if __name__ == "__main__":
    unittest.main()
