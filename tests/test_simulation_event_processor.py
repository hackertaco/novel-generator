"""Tests for persisting non-dialogue simulation events into character-state ledgers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from novel_generator.schema import (
    CharacterStateProvenanceKind,
    CharacterStateReference,
    EventType,
    MemoryExperienceMode,
    SimulationBeliefUpdate,
    SimulationMemoryUpdate,
    SimulationObjectiveFactUpdate,
    SimulationStateEvent,
)
from novel_generator.state import CharacterStateWriter, SimulationEventProcessor, StateStore


class SimulationEventProcessorTests(unittest.TestCase):
    """Verify non-dialogue event persistence across fact, memory, and belief layers."""

    def test_apply_event_persists_fact_memory_and_belief_layers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = StateStore(Path(tmp_dir))
            processor = SimulationEventProcessor(CharacterStateWriter(store))

            event = SimulationStateEvent(
                event_id="event_0201",
                event_type=EventType.DISCOVERY,
                chapter_number=21,
                actor_character_id="character:min-ji",
                scene_id="scene_021_02",
                scene_index=1,
                timeline_tick=521,
                summary="Min-ji recovers the relic and deduces Seo-jin staged the trap.",
                tags=["episode:21", "event:relic-recovered"],
                objective_fact_updates=[
                    SimulationObjectiveFactUpdate(
                        character_id="character:min-ji",
                        state_key="fact:relic-owner",
                        fact_value={"owner": "character:min-ji"},
                        change_reason="Min-ji takes the relic back during the vault escape.",
                        affected_character_ids=["character:min-ji", "character:seo-jin"],
                        tags=["fact:relic"],
                    )
                ],
                memory_updates=[
                    SimulationMemoryUpdate(
                        character_id="character:min-ji",
                        state_key="memory:relic-recovered",
                        memory_summary="Min-ji remembers reclaiming the relic from Seo-jin.",
                        remembered_value={"owner": "character:min-ji"},
                        source_fact=CharacterStateReference(
                            character_id="character:min-ji",
                            state_key="fact:relic-owner",
                        ),
                        experience_mode=MemoryExperienceMode.DIRECT,
                        tags=["memory:relic"],
                    )
                ],
                belief_updates=[
                    SimulationBeliefUpdate(
                        character_id="character:min-ji",
                        state_key="belief:seo-jin-role",
                        belief_summary=(
                            "Min-ji believes Seo-jin staged the trap to steal the relic."
                        ),
                        believed_value={"suspect": "character:seo-jin", "intent": "steal-relic"},
                        interpretation_basis=(
                            "She connects the recovered relic with Seo-jin's staged escape route."
                        ),
                        source_memories=[
                            CharacterStateReference(
                                character_id="character:min-ji",
                                state_key="memory:relic-recovered",
                            )
                        ],
                        source_facts=[
                            CharacterStateReference(
                                character_id="character:min-ji",
                                state_key="fact:relic-owner",
                            )
                        ],
                        conviction=0.85,
                        tags=["belief:trap"],
                    )
                ],
            )

            processed = processor.apply_event(event)

            self.assertEqual(len(processed.objective_fact_results), 1)
            self.assertEqual(len(processed.memory_results), 1)
            self.assertEqual(len(processed.belief_results), 1)

            facts = store.load_objective_facts()
            memories = store.load_memories(character_id="character:min-ji")
            beliefs = store.load_beliefs(character_id="character:min-ji")

            self.assertEqual(len(facts), 1)
            self.assertEqual(len(memories), 1)
            self.assertEqual(len(beliefs), 1)

            fact = facts[0]
            memory = memories[0]
            belief = beliefs[0]

            self.assertEqual(fact.fact_value, {"owner": "character:min-ji"})
            self.assertEqual(
                fact.metadata.provenance.kind,
                CharacterStateProvenanceKind.EVENT_OBSERVATION,
            )
            self.assertEqual(fact.metadata.scene.timeline_tick, 521)
            self.assertIn("event:relic-recovered", fact.metadata.tags)

            self.assertEqual(memory.source_fact_entry_id, fact.metadata.entry_id)
            self.assertEqual(memory.experience_mode, MemoryExperienceMode.DIRECT)
            self.assertEqual(
                memory.metadata.provenance.kind,
                CharacterStateProvenanceKind.EVENT_OBSERVATION,
            )
            self.assertEqual(memory.metadata.provenance.event_id, "event_0201")

            self.assertEqual(belief.source_memory_entry_ids, [memory.metadata.entry_id])
            self.assertEqual(belief.source_fact_entry_ids, [fact.metadata.entry_id])
            self.assertEqual(
                belief.metadata.provenance.kind,
                CharacterStateProvenanceKind.INTERPRETATION,
            )
            self.assertEqual(belief.metadata.provenance.source_id, "belief-model")

    def test_dialogue_events_are_rejected_from_non_dialogue_state_processor(self) -> None:
        with self.assertRaises(ValueError):
            SimulationStateEvent(
                event_id="event_0202",
                event_type=EventType.DIALOGUE,
                chapter_number=21,
                summary="Han-seo warns Min-ji not to open the door.",
            )


if __name__ == "__main__":
    unittest.main()
