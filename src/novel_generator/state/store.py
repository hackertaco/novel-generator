"""State store for managing novel state across chapters."""

import json
from pathlib import Path
from typing import Any
from urllib.parse import quote

import yaml

from novel_generator.schema.chapter import ChapterSummary
from novel_generator.schema.character import CharacterState
from novel_generator.schema.character_state_contract import (
    CHARACTER_STATE_ENTRY_ADAPTER,
    BeliefEntry,
    CharacterStateEntry,
    CharacterStatePartialRecord,
    CharacterStatePersistenceManifest,
    CharacterStateQuery,
    CharacterStateQueryResponse,
    MemoryEntry,
    ObjectiveFactEntry,
    TimelineQueryRelation,
    UtteranceEntry,
)
from novel_generator.schema.character_state_metadata import (
    CharacterStateLifecycleStatus,
    CharacterStateRecordMetadata,
    CharacterStateRecordType,
)
from novel_generator.schema.novel import NovelSeed


class StateStore:
    """Manages persistent state for novel generation."""

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.state_dir = output_dir / ".state"
        self.chapters_dir = output_dir / "chapters"
        self.summaries_dir = self.state_dir / "summaries"
        self.character_state_dir = self.state_dir / "character_state"
        self.character_state_manifest_path = self.character_state_dir / "manifest.json"

        # Create directories
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.chapters_dir.mkdir(parents=True, exist_ok=True)
        self.summaries_dir.mkdir(parents=True, exist_ok=True)
        self.character_state_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_character_state_manifest()

    def _ensure_character_state_manifest(self) -> CharacterStatePersistenceManifest:
        """Create the default character-state persistence contract if missing."""
        if self.character_state_manifest_path.exists():
            return self.load_character_state_manifest()
        manifest = CharacterStatePersistenceManifest.default()
        self.save_character_state_manifest(manifest)
        return manifest

    def save_character_state_manifest(
        self,
        manifest: CharacterStatePersistenceManifest,
    ) -> None:
        """Persist the append-only character-state ledger contract."""
        with open(self.character_state_manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest.model_dump(mode="json"), f, ensure_ascii=False, indent=2)

        for binding in manifest.ledgers:
            ledger_path = self.character_state_dir / binding.relative_path
            ledger_path.parent.mkdir(parents=True, exist_ok=True)
            ledger_path.touch(exist_ok=True)
        (self.character_state_dir / manifest.character_store_dir).mkdir(
            parents=True,
            exist_ok=True,
        )

    def load_character_state_manifest(self) -> CharacterStatePersistenceManifest:
        """Load the character-state persistence contract."""
        with open(self.character_state_manifest_path, encoding="utf-8") as f:
            data = json.load(f)
        return CharacterStatePersistenceManifest.model_validate(data)

    def _get_character_state_ledger_path(self, record_type: CharacterStateRecordType) -> Path:
        """Resolve the append-only ledger path for a record type."""
        manifest = self.load_character_state_manifest()
        binding = manifest.binding_for(record_type)
        return self.character_state_dir / binding.relative_path

    def _get_character_state_character_store_path(self, character_id: str) -> Path:
        """Resolve the append-only direct store path for one character."""
        manifest = self.load_character_state_manifest()
        safe_character_id = quote(character_id, safe="")
        return (
            self.character_state_dir
            / manifest.character_store_dir
            / f"{safe_character_id}.jsonl"
        )

    def _load_character_state_entries_from_character_store(
        self,
        *,
        character_id: str,
        record_type: CharacterStateRecordType | None = None,
        state_key: str | None = None,
    ) -> list[CharacterStateEntry]:
        """Load typed entries for one character from the persisted direct store."""
        store_path = self._get_character_state_character_store_path(character_id)
        if not store_path.exists():
            return []

        entries: list[CharacterStateEntry] = []
        with open(store_path, encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line:
                    continue
                entry = CHARACTER_STATE_ENTRY_ADAPTER.validate_python(json.loads(line))
                if record_type is not None and entry.record_type is not record_type:
                    continue
                if state_key is not None and entry.state_key != state_key:
                    continue
                entries.append(entry)
        return entries

    def append_character_state_entries(self, entries: list[CharacterStateEntry]) -> None:
        """Append one or more typed character-state entries to their respective ledgers."""
        if not entries:
            return

        ledger_lines: dict[CharacterStateRecordType, list[str]] = {}
        character_store_lines: dict[str, list[str]] = {}
        for entry in entries:
            payload = json.dumps(entry.model_dump(mode="json"), ensure_ascii=False)
            ledger_lines.setdefault(entry.record_type, []).append(payload)
            character_store_lines.setdefault(entry.metadata.character_id, []).append(payload)

        for record_type, lines in ledger_lines.items():
            ledger_path = self._get_character_state_ledger_path(record_type)
            with open(ledger_path, "a", encoding="utf-8") as f:
                for line in lines:
                    f.write(f"{line}\n")

        for character_id, lines in character_store_lines.items():
            character_store_path = self._get_character_state_character_store_path(character_id)
            character_store_path.parent.mkdir(parents=True, exist_ok=True)
            with open(character_store_path, "a", encoding="utf-8") as f:
                for line in lines:
                    f.write(f"{line}\n")

    def append_character_state_entry(self, entry: CharacterStateEntry) -> None:
        """Append a single character-state entry."""
        self.append_character_state_entries([entry])

    def load_character_state_entries(
        self,
        *,
        record_type: CharacterStateRecordType | None = None,
        character_id: str | None = None,
        state_key: str | None = None,
    ) -> list[CharacterStateEntry]:
        """Load typed character-state entries from the append-only ledgers."""
        if character_id is not None:
            entries = self._load_character_state_entries_from_character_store(
                character_id=character_id,
                record_type=record_type,
                state_key=state_key,
            )
            return sorted(
                entries,
                key=lambda entry: (entry.metadata.recorded_at, entry.metadata.entry_id),
            )

        manifest = self.load_character_state_manifest()
        record_types = (
            [record_type]
            if record_type is not None
            else [binding.record_type for binding in manifest.ledgers]
        )

        entries: list[CharacterStateEntry] = []
        for current_record_type in record_types:
            ledger_path = self._get_character_state_ledger_path(current_record_type)
            if not ledger_path.exists():
                continue
            with open(ledger_path, encoding="utf-8") as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line:
                        continue
                    entry = CHARACTER_STATE_ENTRY_ADAPTER.validate_python(json.loads(line))
                    if character_id is not None and entry.metadata.character_id != character_id:
                        continue
                    if state_key is not None and entry.state_key != state_key:
                        continue
                    entries.append(entry)

        return sorted(
            entries,
            key=lambda entry: (entry.metadata.recorded_at, entry.metadata.entry_id),
        )

    def load_latest_character_state_entry(
        self,
        *,
        record_type: CharacterStateRecordType,
        character_id: str,
        state_key: str,
    ) -> CharacterStateEntry | None:
        """Load the newest entry for one character-state key, if present."""
        entries = self.load_character_state_entries(
            record_type=record_type,
            character_id=character_id,
            state_key=state_key,
        )
        if not entries:
            return None
        return entries[-1]

    def _collect_matching_character_state_entries(
        self,
        query: CharacterStateQuery,
    ) -> list[CharacterStateEntry]:
        """Resolve matching entries, preferring direct per-character stores when possible."""
        manifest = self.load_character_state_manifest()
        record_types = query.state_types or [
            binding.record_type for binding in manifest.ledgers
        ]
        matched_entries: list[CharacterStateEntry] = []

        if query.character_ids:
            for character_id in query.character_ids:
                entries = self.load_character_state_entries(character_id=character_id)
                for entry in entries:
                    if entry.record_type not in record_types:
                        continue
                    if self._matches_character_state_query(entry=entry, query=query):
                        matched_entries.append(entry)
        else:
            for record_type in record_types:
                entries = self.load_character_state_entries(record_type=record_type)
                for entry in entries:
                    if self._matches_character_state_query(entry=entry, query=query):
                        matched_entries.append(entry)

        matched_entries.sort(
            key=lambda entry: (entry.metadata.recorded_at, entry.metadata.entry_id),
        )
        return matched_entries

    def _build_character_state_query_response(
        self,
        *,
        query: CharacterStateQuery,
        matched_entries: list[CharacterStateEntry],
    ) -> CharacterStateQueryResponse:
        """Project matching entries into the normalized read-side response shape."""
        total_matches = len(matched_entries)
        limited_entries = (
            matched_entries[: query.limit] if query.limit is not None else matched_entries
        )

        return CharacterStateQueryResponse(
            query=query,
            entries=[CharacterStatePartialRecord.from_entry(entry) for entry in limited_entries],
            total_matches=total_matches,
            has_more=query.limit is not None and total_matches > len(limited_entries),
        )

    def query_character_state_history(self, query: CharacterStateQuery) -> CharacterStateQueryResponse:
        """Return the matching history slice for a filtered character-state query."""
        matched_entries = self._collect_matching_character_state_entries(query)
        return self._build_character_state_query_response(
            query=query,
            matched_entries=matched_entries,
        )

    def query_character_state_snapshot(
        self,
        query: CharacterStateQuery,
    ) -> CharacterStateQueryResponse:
        """Return the latest matching snapshot per character/state-type/state-key."""
        matched_entries = self._collect_matching_character_state_entries(query)

        latest_by_state: dict[
            tuple[str, CharacterStateRecordType, str],
            CharacterStateEntry,
        ] = {}
        for entry in matched_entries:
            snapshot_key = (
                entry.metadata.character_id,
                entry.record_type,
                entry.state_key,
            )
            latest_by_state[snapshot_key] = entry

        snapshot_entries = sorted(
            latest_by_state.values(),
            key=lambda entry: (entry.metadata.recorded_at, entry.metadata.entry_id),
        )
        return self._build_character_state_query_response(
            query=query,
            matched_entries=snapshot_entries,
        )

    def query_character_state(self, query: CharacterStateQuery) -> CharacterStateQueryResponse:
        """Execute the default history-slice character-state query contract."""
        return self.query_character_state_history(query)

    def _matches_character_state_query(
        self,
        *,
        entry: CharacterStateEntry,
        query: CharacterStateQuery,
    ) -> bool:
        """Apply all query filters to one character-state entry."""
        if query.character_ids and entry.metadata.character_id not in query.character_ids:
            return False
        if query.state_keys and entry.state_key not in query.state_keys:
            return False
        if (
            not query.include_inactive
            and entry.metadata.lifecycle.status is not CharacterStateLifecycleStatus.ACTIVE
        ):
            return False
        if query.source is not None and not self._matches_source_filter(
            metadata=entry.metadata,
            query=query,
        ):
            return False
        if query.timeline_position is not None and not self._matches_timeline_filter(
            metadata=entry.metadata,
            query=query,
        ):
            return False
        return True

    def _matches_source_filter(
        self,
        *,
        metadata: CharacterStateRecordMetadata,
        query: CharacterStateQuery,
    ) -> bool:
        """Check provenance fields against the query source filter."""
        if query.source is None:
            return True
        source = query.source
        provenance = metadata.provenance
        if source.kind is not None and provenance.kind is not source.kind:
            return False
        if source.source_id is not None and provenance.source_id != source.source_id:
            return False
        if source.event_id is not None and provenance.event_id != source.event_id:
            return False
        if source.dialogue_id is not None and provenance.dialogue_id != source.dialogue_id:
            return False
        if (
            source.actor_character_id is not None
            and provenance.actor_character_id != source.actor_character_id
        ):
            return False
        if source.cause is not None and provenance.cause != source.cause:
            return False
        return True

    def _matches_timeline_filter(
        self,
        *,
        metadata: CharacterStateRecordMetadata,
        query: CharacterStateQuery,
    ) -> bool:
        """Check scene/timeline anchors against the query timeline filter."""
        if query.timeline_position is None:
            return True
        scene = metadata.scene
        if scene is None:
            return False
        timeline = query.timeline_position
        checks = (
            (scene.chapter_number, timeline.chapter_number),
            (scene.scene_index, timeline.scene_index),
            (scene.timeline_tick, timeline.timeline_tick),
            (scene.occurred_at, timeline.occurred_at),
        )
        for actual, expected in checks:
            if expected is None:
                continue
            if not self._compare_timeline_value(
                actual=actual,
                expected=expected,
                relation=timeline.relation,
            ):
                return False
        if timeline.scene_id is not None and scene.scene_id != timeline.scene_id:
            return False
        return True

    def _compare_timeline_value(
        self,
        *,
        actual: Any,
        expected: Any,
        relation: TimelineQueryRelation,
    ) -> bool:
        """Compare one timeline field under the configured relation."""
        if actual is None:
            return False
        if relation is TimelineQueryRelation.EXACT:
            return actual == expected
        if relation is TimelineQueryRelation.AT_OR_BEFORE:
            return actual <= expected
        return actual >= expected

    def load_objective_facts(self) -> list[ObjectiveFactEntry]:
        """Load canonical truth writes."""
        return [
            entry
            for entry in self.load_character_state_entries(
                record_type=CharacterStateRecordType.OBJECTIVE_FACT
            )
            if isinstance(entry, ObjectiveFactEntry)
        ]

    def load_memories(self, character_id: str | None = None) -> list[MemoryEntry]:
        """Load memory writes, optionally filtered to one character."""
        return [
            entry
            for entry in self.load_character_state_entries(
                record_type=CharacterStateRecordType.MEMORY,
                character_id=character_id,
            )
            if isinstance(entry, MemoryEntry)
        ]

    def load_beliefs(self, character_id: str | None = None) -> list[BeliefEntry]:
        """Load belief writes, optionally filtered to one character."""
        return [
            entry
            for entry in self.load_character_state_entries(
                record_type=CharacterStateRecordType.BELIEF,
                character_id=character_id,
            )
            if isinstance(entry, BeliefEntry)
        ]

    def load_utterances(self, character_id: str | None = None) -> list[UtteranceEntry]:
        """Load utterance writes, optionally filtered to one character."""
        return [
            entry
            for entry in self.load_character_state_entries(
                record_type=CharacterStateRecordType.UTTERANCE,
                character_id=character_id,
            )
            if isinstance(entry, UtteranceEntry)
        ]

    def save_seed(self, seed: NovelSeed) -> None:
        """Save the approved novel seed."""
        seed_path = self.state_dir / "seed.yaml"
        with open(seed_path, "w", encoding="utf-8") as f:
            yaml.dump(seed.model_dump(), f, allow_unicode=True, default_flow_style=False)

    def load_seed(self) -> NovelSeed | None:
        """Load the novel seed."""
        seed_path = self.state_dir / "seed.yaml"
        if not seed_path.exists():
            return None
        with open(seed_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return NovelSeed.model_validate(data)

    def save_chapter(self, chapter_number: int, title: str, content: str) -> Path:
        """Save a generated chapter."""
        filename = f"{chapter_number:03d}_{title}.txt"
        chapter_path = self.chapters_dir / filename
        with open(chapter_path, "w", encoding="utf-8") as f:
            f.write(content)
        return chapter_path

    def save_chapter_summary(self, summary: ChapterSummary) -> None:
        """Save structured chapter summary."""
        summary_path = self.summaries_dir / f"chapter_{summary.chapter_number:03d}.yaml"
        with open(summary_path, "w", encoding="utf-8") as f:
            yaml.dump(summary.model_dump(), f, allow_unicode=True, default_flow_style=False)

    def load_chapter_summary(self, chapter_number: int) -> ChapterSummary | None:
        """Load a chapter summary."""
        summary_path = self.summaries_dir / f"chapter_{chapter_number:03d}.yaml"
        if not summary_path.exists():
            return None
        with open(summary_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return ChapterSummary.model_validate(data)

    def get_all_summaries(self) -> list[ChapterSummary]:
        """Load all chapter summaries in order."""
        summaries = []
        for summary_file in sorted(self.summaries_dir.glob("chapter_*.yaml")):
            with open(summary_file, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            summaries.append(ChapterSummary.model_validate(data))
        return summaries

    def save_character_states(self, states: dict[str, CharacterState]) -> None:
        """Save current character states."""
        states_path = self.state_dir / "character_states.json"
        data = {cid: state.model_dump() for cid, state in states.items()}
        with open(states_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load_character_states(self) -> dict[str, CharacterState]:
        """Load character states."""
        states_path = self.state_dir / "character_states.json"
        if not states_path.exists():
            return {}
        with open(states_path, encoding="utf-8") as f:
            data = json.load(f)
        return {cid: CharacterState.model_validate(state) for cid, state in data.items()}

    def get_current_chapter(self) -> int:
        """Get the last generated chapter number."""
        summaries = list(self.summaries_dir.glob("chapter_*.yaml"))
        if not summaries:
            return 0
        last = max(summaries, key=lambda p: int(p.stem.split("_")[1]))
        return int(last.stem.split("_")[1])

    def get_progress(self) -> dict:
        """Get generation progress."""
        seed = self.load_seed()
        current = self.get_current_chapter()
        total = seed.total_chapters if seed else 0
        return {
            "current_chapter": current,
            "total_chapters": total,
            "progress_percent": (current / total * 100) if total > 0 else 0,
        }

    def update_progress(self, last_chapter: int) -> None:
        """Update progress tracking.

        Args:
            last_chapter: The last successfully generated chapter number
        """
        progress_path = self.state_dir / "progress.json"
        progress = {
            "last_generated": last_chapter,
            "updated_at": __import__("datetime").datetime.now().isoformat(),
        }
        with open(progress_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)
