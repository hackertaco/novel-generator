"""Tests for conflict-safe character-state write semantics."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any

from novel_generator.schema.character_state_metadata import (
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordType,
    SceneReference,
)
from novel_generator.state import CharacterStateWriteAction, CharacterStateWriter, StateStore
from tests.verification_fixture import seed_character_state_verification_fixture


class CharacterStateWriterTests(unittest.TestCase):
    """Verify typed create/update behavior for the state-write service."""

    def _snapshot_ledgers(self, store: StateStore) -> dict[str, list[dict[str, Any]]]:
        """Capture normalized state snapshots for isolation assertions."""
        return {
            "facts": [
                entry.model_dump(mode="json") for entry in store.load_objective_facts()
            ],
            "memories": [
                entry.model_dump(mode="json")
                for entry in store.load_memories(character_id="character:min-ji")
            ],
            "beliefs": [
                entry.model_dump(mode="json")
                for entry in store.load_beliefs(character_id="character:min-ji")
            ],
            "utterances": [
                entry.model_dump(mode="json")
                for entry in store.load_utterances(character_id="character:min-ji")
            ],
        }

    def test_objective_fact_write_supersedes_prior_value(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            writer = CharacterStateWriter(store)

            first = writer.write_objective_fact(
                character_id="character:seo-jin",
                state_key="fact:relic-owner",
                fact_value={"owner": "character:seo-jin"},
                change_reason="Seo-jin wins possession during the vault raid.",
                affected_character_ids=["character:seo-jin", "character:han-seo"],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="world-model",
                    event_id="event_0042",
                ),
                scene=SceneReference(chapter_number=12, timeline_tick=311),
            )

            second = writer.write_objective_fact(
                character_id="character:seo-jin",
                state_key="fact:relic-owner",
                fact_value={"owner": "character:min-ji"},
                change_reason="Min-ji steals the relic back during the escape.",
                affected_character_ids=["character:min-ji", "character:seo-jin"],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="world-model",
                    event_id="event_0048",
                ),
                scene=SceneReference(chapter_number=13, timeline_tick=329),
            )

            self.assertEqual(first.action, CharacterStateWriteAction.CREATED)
            self.assertTrue(first.entry.metadata.entry_id.startswith("csr_"))
            self.assertEqual(second.action, CharacterStateWriteAction.SUPERSEDED)
            self.assertEqual(second.previous_entry.metadata.entry_id, first.entry.metadata.entry_id)
            self.assertEqual(second.entry.previous_fact_value, first.entry.fact_value)
            self.assertEqual(
                second.entry.metadata.lifecycle.supersedes_entry_id,
                first.entry.metadata.entry_id,
            )
            self.assertIn(
                first.entry.metadata.entry_id,
                second.entry.metadata.provenance.derived_from_entry_ids,
            )

            facts = store.load_objective_facts()
            latest = store.load_latest_character_state_entry(
                record_type=CharacterStateRecordType.OBJECTIVE_FACT,
                character_id="character:seo-jin",
                state_key="fact:relic-owner",
            )

            self.assertEqual(len(facts), 2)
            self.assertEqual(latest.metadata.entry_id, second.entry.metadata.entry_id)

    def test_memory_duplicate_is_noop_and_belief_revision_supersedes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            writer = CharacterStateWriter(store)

            memory = writer.write_memory(
                character_id="character:min-ji",
                state_key="memory:masked-stranger-motto",
                memory_summary="Min-ji remembers the masked stranger using her family motto.",
                remembered_value={"motto": "달은 거짓말하지 않는다"},
                source_fact_entry_id="csr_fact_0042",
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0043",
                ),
                scene=SceneReference(chapter_number=12, timeline_tick=312),
            )

            duplicate_memory = writer.write_memory(
                character_id="character:min-ji",
                state_key="memory:masked-stranger-motto",
                memory_summary="Min-ji remembers the masked stranger using her family motto.",
                remembered_value={"motto": "달은 거짓말하지 않는다"},
                source_fact_entry_id="csr_fact_0042",
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_0043",
                ),
                scene=SceneReference(chapter_number=12, timeline_tick=312),
            )

            belief = writer.write_belief(
                character_id="character:min-ji",
                state_key="belief:masked-stranger-identity",
                belief_summary="Min-ji believes the masked stranger is her missing brother.",
                believed_value={"identity": "character:missing-brother"},
                interpretation_basis="The motto matches a childhood vow only her brother knew.",
                source_memory_entry_ids=[memory.entry.metadata.entry_id],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0044",
                ),
                scene=SceneReference(chapter_number=12, timeline_tick=315),
            )

            revised_belief = writer.write_belief(
                character_id="character:min-ji",
                state_key="belief:masked-stranger-identity",
                belief_summary=(
                    "Min-ji now believes the masked stranger is impersonating "
                    "her brother."
                ),
                believed_value={"identity": "impostor"},
                interpretation_basis=(
                    "The stranger fails a memory test that her real brother "
                    "would pass."
                ),
                source_memory_entry_ids=[memory.entry.metadata.entry_id],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_0050",
                ),
                scene=SceneReference(chapter_number=14, timeline_tick=351),
            )

            self.assertEqual(memory.action, CharacterStateWriteAction.CREATED)
            self.assertEqual(duplicate_memory.action, CharacterStateWriteAction.NOOP)
            self.assertEqual(
                duplicate_memory.entry.metadata.entry_id,
                memory.entry.metadata.entry_id,
            )
            self.assertEqual(belief.action, CharacterStateWriteAction.CREATED)
            self.assertEqual(revised_belief.action, CharacterStateWriteAction.SUPERSEDED)
            self.assertEqual(
                revised_belief.entry.metadata.lifecycle.supersedes_entry_id,
                belief.entry.metadata.entry_id,
            )

            self.assertEqual(len(store.load_memories(character_id="character:min-ji")), 1)
            self.assertEqual(len(store.load_beliefs(character_id="character:min-ji")), 2)

    def test_utterance_deduplicates_same_dialogue_but_appends_new_dialogue(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            writer = CharacterStateWriter(store)

            first = writer.write_utterance(
                character_id="character:han-seo",
                state_key="utterance:warning",
                utterance_text="지금 문을 열면 다 죽어.",
                audience_character_ids=["character:min-ji"],
                references_fact_entry_ids=["csr_fact_0099"],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="interaction-simulator",
                    event_id="event_0099",
                    dialogue_id="dialogue_040_02",
                ),
                scene=SceneReference(chapter_number=40, timeline_tick=820),
            )

            duplicate = writer.write_utterance(
                character_id="character:han-seo",
                state_key="utterance:warning",
                utterance_text="지금 문을 열면 다 죽어.",
                audience_character_ids=["character:min-ji"],
                references_fact_entry_ids=["csr_fact_0099"],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="interaction-simulator",
                    event_id="event_0099",
                    dialogue_id="dialogue_040_02",
                ),
                scene=SceneReference(chapter_number=40, timeline_tick=820),
            )

            repeated_text_new_dialogue = writer.write_utterance(
                character_id="character:han-seo",
                state_key="utterance:warning",
                utterance_text="지금 문을 열면 다 죽어.",
                audience_character_ids=["character:min-ji"],
                references_fact_entry_ids=["csr_fact_0114"],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="interaction-simulator",
                    event_id="event_0114",
                    dialogue_id="dialogue_041_01",
                ),
                scene=SceneReference(chapter_number=41, timeline_tick=841),
            )

            utterances = store.load_utterances(character_id="character:han-seo")

            self.assertEqual(first.action, CharacterStateWriteAction.CREATED)
            self.assertEqual(duplicate.action, CharacterStateWriteAction.NOOP)
            self.assertEqual(repeated_text_new_dialogue.action, CharacterStateWriteAction.CREATED)
            self.assertEqual(len(utterances), 2)

    def test_objective_fact_update_only_changes_fact_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            fixture = seed_character_state_verification_fixture(store)
            writer = CharacterStateWriter(store)
            before = self._snapshot_ledgers(store)

            result = writer.write_objective_fact(
                character_id=fixture.character_id,
                state_key=fixture.fact.state_key,
                fact_value={"gate": "breached"},
                change_reason="Seo-jin detonates the locking seam and breaches the gate.",
                affected_character_ids=[fixture.character_id, "character:seo-jin"],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="world-model",
                    event_id="event_fixture_0200",
                ),
                scene=SceneReference(chapter_number=41, timeline_tick=820),
            )

            after = self._snapshot_ledgers(store)

            self.assertEqual(result.action, CharacterStateWriteAction.SUPERSEDED)
            self.assertEqual(len(after["facts"]), len(before["facts"]) + 1)
            self.assertEqual(
                after["facts"][-1]["previous_fact_value"],
                fixture.fact.fact_value,
            )
            self.assertEqual(after["facts"][-1]["fact_value"], {"gate": "breached"})
            self.assertEqual(after["memories"], before["memories"])
            self.assertEqual(after["beliefs"], before["beliefs"])
            self.assertEqual(after["utterances"], before["utterances"])

    def test_memory_update_only_changes_memory_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            fixture = seed_character_state_verification_fixture(store)
            writer = CharacterStateWriter(store)
            before = self._snapshot_ledgers(store)

            result = writer.write_memory(
                character_id=fixture.character_id,
                state_key=fixture.memory.state_key,
                memory_summary=(
                    "Min-ji remembers the breached gate showering sparks into the corridor."
                ),
                remembered_value={"gate": "breached"},
                source_fact_entry_id=fixture.fact_entry_id,
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                    source_id="interaction-simulator",
                    event_id="event_fixture_0201",
                ),
                scene=SceneReference(chapter_number=41, timeline_tick=821),
            )

            after = self._snapshot_ledgers(store)

            self.assertEqual(result.action, CharacterStateWriteAction.SUPERSEDED)
            self.assertEqual(len(after["memories"]), len(before["memories"]) + 1)
            self.assertEqual(
                after["memories"][-1]["metadata"]["lifecycle"]["supersedes_entry_id"],
                fixture.memory_entry_id,
            )
            self.assertEqual(after["memories"][-1]["remembered_value"], {"gate": "breached"})
            self.assertEqual(after["facts"], before["facts"])
            self.assertEqual(after["beliefs"], before["beliefs"])
            self.assertEqual(after["utterances"], before["utterances"])

    def test_belief_update_only_changes_belief_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            fixture = seed_character_state_verification_fixture(store)
            writer = CharacterStateWriter(store)
            before = self._snapshot_ledgers(store)

            result = writer.write_belief(
                character_id=fixture.character_id,
                state_key=fixture.belief.state_key,
                belief_summary="Min-ji now believes Seo-jin escaped through a roof hatch.",
                believed_value={"escape_route": "roof-hatch"},
                interpretation_basis=(
                    "A scorch mark on the ceiling convinces her the blast opened a new exit."
                ),
                source_memory_entry_ids=[fixture.memory_entry_id],
                source_fact_entry_ids=[fixture.fact_entry_id],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.INTERPRETATION,
                    source_id="belief-model",
                    event_id="event_fixture_0202",
                ),
                scene=SceneReference(chapter_number=41, timeline_tick=822),
            )

            after = self._snapshot_ledgers(store)

            self.assertEqual(result.action, CharacterStateWriteAction.SUPERSEDED)
            self.assertEqual(len(after["beliefs"]), len(before["beliefs"]) + 1)
            self.assertEqual(
                after["beliefs"][-1]["metadata"]["lifecycle"]["supersedes_entry_id"],
                fixture.belief_entry_id,
            )
            self.assertEqual(
                after["beliefs"][-1]["believed_value"],
                {"escape_route": "roof-hatch"},
            )
            self.assertEqual(after["facts"], before["facts"])
            self.assertEqual(after["memories"], before["memories"])
            self.assertEqual(after["utterances"], before["utterances"])

    def test_utterance_update_only_changes_utterance_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            fixture = seed_character_state_verification_fixture(store)
            writer = CharacterStateWriter(store)
            before = self._snapshot_ledgers(store)

            result = writer.write_utterance(
                character_id=fixture.character_id,
                state_key=fixture.utterance.state_key,
                utterance_text="The blast punched a hole in the roof. Seo-jin went up.",
                audience_character_ids=["character:han-seo"],
                intent="misdirect",
                references_belief_entry_ids=[fixture.belief_entry_id],
                references_fact_entry_ids=[fixture.fact_entry_id],
                provenance=CharacterStateProvenance(
                    kind=CharacterStateProvenanceKind.DIALOGUE,
                    source_id="interaction-simulator",
                    event_id="event_fixture_0203",
                    dialogue_id="dialogue_fixture_0203",
                ),
                scene=SceneReference(chapter_number=41, timeline_tick=823),
            )

            after = self._snapshot_ledgers(store)

            self.assertEqual(result.action, CharacterStateWriteAction.CREATED)
            self.assertEqual(len(after["utterances"]), len(before["utterances"]) + 1)
            self.assertEqual(
                after["utterances"][-1]["utterance_text"],
                "The blast punched a hole in the roof. Seo-jin went up.",
            )
            self.assertEqual(after["facts"], before["facts"])
            self.assertEqual(after["memories"], before["memories"])
            self.assertEqual(after["beliefs"], before["beliefs"])


if __name__ == "__main__":
    unittest.main()
