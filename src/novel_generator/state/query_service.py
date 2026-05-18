"""Read-side query service for filtered character-state retrieval."""

from __future__ import annotations

from novel_generator.schema.character_state_contract import (
    CharacterStateQuery,
    CharacterStateQueryResponse,
)
from novel_generator.state.store import StateStore


class CharacterStateQueryService:
    """Resolve snapshot and history requests against the direct-access state store."""

    def __init__(self, store: StateStore):
        self.store = store

    def get_history_slice(self, query: CharacterStateQuery) -> CharacterStateQueryResponse:
        """Return the full matching history slice for the provided query."""
        return self.store.query_character_state_history(query)

    def get_state_snapshot(self, query: CharacterStateQuery) -> CharacterStateQueryResponse:
        """Return the latest matching state snapshot for the provided query."""
        return self.store.query_character_state_snapshot(query)

    def query_history_slice(self, query: CharacterStateQuery) -> CharacterStateQueryResponse:
        """Compatibility alias for history retrieval."""
        return self.get_history_slice(query)

    def query_state_snapshot(self, query: CharacterStateQuery) -> CharacterStateQueryResponse:
        """Compatibility alias for snapshot retrieval."""
        return self.get_state_snapshot(query)
