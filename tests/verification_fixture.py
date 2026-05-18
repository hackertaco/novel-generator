"""Shared verification fixture for character-state tests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from novel_generator.schema.character_state_contract import (
    BeliefEntry,
    MemoryEntry,
    ObjectiveFactEntry,
    UtteranceEntry,
)
from novel_generator.schema.character_state_metadata import (
    CharacterStateLifecycle,
    CharacterStateProvenance,
    CharacterStateProvenanceKind,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
    SceneReference,
)
from novel_generator.state import StateStore

FIXTURE_CHARACTER_ID = "character:min-ji"
FIXTURE_FACT_ENTRY_ID = "csr_fixture_fact"
FIXTURE_MEMORY_ENTRY_ID = "csr_fixture_memory"
FIXTURE_BELIEF_ENTRY_ID = "csr_fixture_belief"
FIXTURE_UTTERANCE_ENTRY_ID = "csr_fixture_utterance"


@dataclass(frozen=True)
class CharacterStateVerificationFixture:
    """Shared seeded records plus stable identifiers for assertions."""

    character_id: str
    fact: ObjectiveFactEntry
    memory: MemoryEntry
    belief: BeliefEntry
    utterance: UtteranceEntry
    fact_entry_id: str
    memory_entry_id: str
    belief_entry_id: str
    utterance_entry_id: str


def _make_metadata(
    *,
    entry_id: str,
    character_id: str,
    record_type: CharacterStateRecordType,
    provenance: CharacterStateProvenance,
    chapter_number: int,
    scene_id: str,
    scene_index: int,
    timeline_tick: int,
    occurred_at: datetime,
) -> CharacterStateRecordMetadata:
    recorded_at = occurred_at + timedelta(minutes=5)
    return CharacterStateRecordMetadata(
        entry_id=entry_id,
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
            created_at=recorded_at,
            updated_at=recorded_at,
        ),
    )


def seed_character_state_verification_fixture(
    store: StateStore,
) -> CharacterStateVerificationFixture:
    """Seed one character with fact, memory, belief, and utterance records."""

    base_time = datetime(2026, 1, 1, tzinfo=UTC)

    fact = ObjectiveFactEntry(
        metadata=_make_metadata(
            entry_id=FIXTURE_FACT_ENTRY_ID,
            character_id=FIXTURE_CHARACTER_ID,
            record_type=CharacterStateRecordType.OBJECTIVE_FACT,
            provenance=CharacterStateProvenance(
                kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                source_id="world-model",
                event_id="event_fixture_0100",
                actor_character_id=FIXTURE_CHARACTER_ID,
            ),
            chapter_number=40,
            scene_id="scene-0040-00",
            scene_index=0,
            timeline_tick=800,
            occurred_at=base_time,
        ),
        state_key="fact:sealed-gate-status",
        fact_value={"gate": "sealed"},
        previous_fact_value={"gate": "open"},
        change_reason="Min-ji seals the vault gate after recovering the relic.",
        affected_character_ids=[FIXTURE_CHARACTER_ID, "character:seo-jin"],
    )
    memory = MemoryEntry(
        metadata=_make_metadata(
            entry_id=FIXTURE_MEMORY_ENTRY_ID,
            character_id=FIXTURE_CHARACTER_ID,
            record_type=CharacterStateRecordType.MEMORY,
            provenance=CharacterStateProvenance(
                kind=CharacterStateProvenanceKind.EVENT_OBSERVATION,
                source_id="interaction-simulator",
                event_id="event_fixture_0101",
                actor_character_id=FIXTURE_CHARACTER_ID,
            ),
            chapter_number=40,
            scene_id="scene-0040-01",
            scene_index=1,
            timeline_tick=801,
            occurred_at=base_time + timedelta(minutes=1),
        ),
        state_key="memory:sealed-gate-status",
        memory_summary="Min-ji remembers sealing the vault gate behind her.",
        remembered_value={"gate": "sealed"},
        source_fact_entry_id=FIXTURE_FACT_ENTRY_ID,
    )
    belief = BeliefEntry(
        metadata=_make_metadata(
            entry_id=FIXTURE_BELIEF_ENTRY_ID,
            character_id=FIXTURE_CHARACTER_ID,
            record_type=CharacterStateRecordType.BELIEF,
            provenance=CharacterStateProvenance(
                kind=CharacterStateProvenanceKind.INTERPRETATION,
                source_id="belief-model",
                event_id="event_fixture_0102",
                actor_character_id=FIXTURE_CHARACTER_ID,
                cause="misunderstanding",
            ),
            chapter_number=40,
            scene_id="scene-0040-02",
            scene_index=2,
            timeline_tick=802,
            occurred_at=base_time + timedelta(minutes=2),
        ),
        state_key="belief:seo-jin-escape-route",
        belief_summary="Min-ji believes Seo-jin can still escape through the sealed gate.",
        believed_value={"escape_route": "sealed-gate"},
        interpretation_basis="She mistakes the echoing hinges for the gate unlocking again.",
        source_memory_entry_ids=[FIXTURE_MEMORY_ENTRY_ID],
        source_fact_entry_ids=[FIXTURE_FACT_ENTRY_ID],
    )
    utterance = UtteranceEntry(
        metadata=_make_metadata(
            entry_id=FIXTURE_UTTERANCE_ENTRY_ID,
            character_id=FIXTURE_CHARACTER_ID,
            record_type=CharacterStateRecordType.UTTERANCE,
            provenance=CharacterStateProvenance(
                kind=CharacterStateProvenanceKind.DIALOGUE,
                source_id="renderer",
                event_id="event_fixture_0103",
                dialogue_id="dialogue_fixture_0103",
                actor_character_id=FIXTURE_CHARACTER_ID,
                cause="lying",
            ),
            chapter_number=40,
            scene_id="scene-0040-03",
            scene_index=3,
            timeline_tick=803,
            occurred_at=base_time + timedelta(minutes=3),
        ),
        state_key="utterance:sealed-gate-cover-story",
        utterance_text="The gate jammed open. Seo-jin must have fled already.",
        audience_character_ids=["character:han-seo"],
        intent="deceive",
        references_belief_entry_ids=[FIXTURE_BELIEF_ENTRY_ID],
        references_fact_entry_ids=[FIXTURE_FACT_ENTRY_ID],
    )

    store.append_character_state_entries([fact, memory, belief, utterance])

    return CharacterStateVerificationFixture(
        character_id=FIXTURE_CHARACTER_ID,
        fact=fact,
        memory=memory,
        belief=belief,
        utterance=utterance,
        fact_entry_id=FIXTURE_FACT_ENTRY_ID,
        memory_entry_id=FIXTURE_MEMORY_ENTRY_ID,
        belief_entry_id=FIXTURE_BELIEF_ENTRY_ID,
        utterance_entry_id=FIXTURE_UTTERANCE_ENTRY_ID,
    )
