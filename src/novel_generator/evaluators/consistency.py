"""Consistency evaluator for narrative coherence."""

import re

from novel_generator.schema.novel import NovelSeed
from novel_generator.schema.chapter import ChapterSummary
from novel_generator.state.store import StateStore


class ConsistencyEvaluator:
    """Evaluates chapter for consistency with established narrative."""

    def __init__(self, store: StateStore):
        self.store = store

    def evaluate(self, chapter_number: int, content: str) -> dict:
        """Evaluate chapter for consistency issues."""
        seed = self.store.load_seed()
        if not seed:
            return {"error": "No seed found"}

        return {
            "character_voice": self._check_character_voice(seed, content),
            "foreshadowing": self._check_foreshadowing(seed, chapter_number, content),
            "world_rules": self._check_world_rules(seed, content),
            "continuity": self._check_continuity(chapter_number, content),
        }

    def _check_character_voice(self, seed: NovelSeed, content: str) -> dict:
        """Check if character dialogue matches their voice."""
        issues = []

        for char in seed.characters:
            # Find dialogue attributed to this character
            # Pattern: 캐릭터이름 + 말했다/물었다 etc + "대사"
            name = char.name
            char_dialogue_pattern = rf'{name}[이가은는]?\s*[^"]*[""]([^""]+)[""]'
            dialogues = re.findall(char_dialogue_pattern, content)

            # Check if dialogue matches speech patterns
            for dialogue in dialogues:
                pattern_match = any(
                    pattern in dialogue for pattern in char.voice.speech_patterns
                )
                # This is a simplified check - in production, use LLM
                if not pattern_match and len(dialogue) > 20:
                    issues.append({
                        "character": name,
                        "dialogue": dialogue[:50],
                        "expected_patterns": char.voice.speech_patterns,
                    })

        return {
            "issues": issues[:5],  # Limit to 5
            "score": 1.0 - min(len(issues) * 0.1, 0.5),
            "pass": len(issues) <= 2,
        }

    def _check_foreshadowing(
        self, seed: NovelSeed, chapter_number: int, content: str
    ) -> dict:
        """Check if required foreshadowing is present."""
        actions = seed.get_foreshadowing_actions(chapter_number)
        results = []

        for fs, action in actions:
            # Simple keyword check - in production, use LLM
            keywords = fs.name.split()
            found = any(kw in content for kw in keywords)

            results.append({
                "id": fs.id,
                "name": fs.name,
                "action": action,
                "found": found,
            })

        missing = [r for r in results if not r["found"]]

        return {
            "required": results,
            "missing": missing,
            "score": 1.0 - (len(missing) / len(results)) if results else 1.0,
            "pass": len(missing) == 0,
        }

    def _check_world_rules(self, seed: NovelSeed, content: str) -> dict:
        """Check for world rule violations."""
        violations = []

        for rule in seed.world.rules:
            # This would need LLM in production
            # For now, just track that rules exist
            pass

        return {
            "rules_count": len(seed.world.rules),
            "violations": violations,
            "score": 1.0,
            "pass": True,
        }

    def _check_continuity(self, chapter_number: int, content: str) -> dict:
        """Check continuity with previous chapters."""
        if chapter_number <= 1:
            return {"score": 1.0, "pass": True, "note": "First chapter"}

        # Get previous chapter summary
        prev_summary = self.store.load_chapter_summary(chapter_number - 1)
        if not prev_summary:
            return {"score": 0.5, "pass": True, "note": "No previous summary"}

        issues = []

        # Check if cliffhanger is addressed
        if prev_summary.cliffhanger:
            # Simple check - in production, use LLM
            cliffhanger_words = prev_summary.cliffhanger.split()[:5]
            addressed = any(word in content[:500] for word in cliffhanger_words)
            if not addressed:
                issues.append({
                    "type": "cliffhanger_not_addressed",
                    "expected": prev_summary.cliffhanger,
                })

        return {
            "previous_chapter": chapter_number - 1,
            "issues": issues,
            "score": 1.0 - len(issues) * 0.3,
            "pass": len(issues) == 0,
        }
