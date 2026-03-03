"""Style evaluator for Kakao Page style compliance."""

import re

from novel_generator.schema.novel import StyleGuide


class StyleEvaluator:
    """Evaluates chapter content for Kakao Page style compliance."""

    def __init__(self, style_guide: StyleGuide):
        self.style_guide = style_guide

    def evaluate(self, content: str) -> dict:
        """Evaluate content and return scores."""
        return {
            "dialogue_ratio": self._check_dialogue_ratio(content),
            "paragraph_length": self._check_paragraph_length(content),
            "sentence_length": self._check_sentence_length(content),
            "hook_ending": self._check_hook_ending(content),
            "overall_score": self._calculate_overall(content),
        }

    def _check_dialogue_ratio(self, content: str) -> dict:
        """Check dialogue to narration ratio."""
        # Count dialogue (text in quotes)
        dialogue_pattern = r'["\u201C\u201D]([^"\u201C\u201D]+)["\u201C\u201D]'
        dialogues = re.findall(dialogue_pattern, content)
        dialogue_chars = sum(len(d) for d in dialogues)

        total_chars = len(content)
        ratio = dialogue_chars / total_chars if total_chars > 0 else 0

        target = self.style_guide.dialogue_ratio
        score = 1.0 - min(abs(ratio - target) / target, 1.0)

        return {
            "actual_ratio": ratio,
            "target_ratio": target,
            "score": score,
            "pass": score >= 0.7,
        }

    def _check_paragraph_length(self, content: str) -> dict:
        """Check paragraph lengths."""
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        max_allowed = self.style_guide.max_paragraph_length

        violations = 0
        for para in paragraphs:
            # Count sentences (rough)
            sentences = re.split(r'[.!?]\s+', para)
            if len(sentences) > max_allowed:
                violations += 1

        score = 1.0 - (violations / len(paragraphs)) if paragraphs else 1.0

        return {
            "total_paragraphs": len(paragraphs),
            "violations": violations,
            "max_allowed_sentences": max_allowed,
            "score": score,
            "pass": score >= 0.8,
        }

    def _check_sentence_length(self, content: str) -> dict:
        """Check for short, punchy sentences."""
        sentences = re.split(r'[.!?]\s+', content)
        sentences = [s.strip() for s in sentences if s.strip()]

        # Target: most sentences under 50 chars for Korean
        short_threshold = 50
        short_count = sum(1 for s in sentences if len(s) <= short_threshold)

        ratio = short_count / len(sentences) if sentences else 1.0
        score = ratio  # Higher ratio of short sentences = better

        return {
            "total_sentences": len(sentences),
            "short_sentences": short_count,
            "short_ratio": ratio,
            "score": score,
            "pass": score >= 0.6,
        }

    def _check_hook_ending(self, content: str) -> dict:
        """Check if chapter ends with a hook."""
        # Get last paragraph
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        if not paragraphs:
            return {"score": 0.0, "pass": False, "reason": "No content"}

        last_para = paragraphs[-1]

        # Hook indicators
        hook_patterns = [
            r'[.]{3}$',  # Ends with ...
            r'[?!]$',  # Ends with ? or !
            r'그때',  # "At that moment"
            r'순간',  # "The moment"
            r'하지만',  # "But"
            r'그러나',  # "However"
            r'바로',  # "Right then"
        ]

        has_hook = any(re.search(p, last_para) for p in hook_patterns)

        return {
            "has_hook": has_hook,
            "last_paragraph": last_para[:100] + "..." if len(last_para) > 100 else last_para,
            "score": 1.0 if has_hook else 0.3,
            "pass": has_hook,
        }

    def _calculate_overall(self, content: str) -> float:
        """Calculate overall style score."""
        dialogue = self._check_dialogue_ratio(content)["score"]
        paragraph = self._check_paragraph_length(content)["score"]
        sentence = self._check_sentence_length(content)["score"]
        hook = self._check_hook_ending(content)["score"]

        # Weighted average
        weights = {
            "dialogue": 0.3,
            "paragraph": 0.2,
            "sentence": 0.2,
            "hook": 0.3,
        }

        overall = (
            dialogue * weights["dialogue"]
            + paragraph * weights["paragraph"]
            + sentence * weights["sentence"]
            + hook * weights["hook"]
        )

        return overall
