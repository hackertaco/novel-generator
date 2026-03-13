"""Main ouroboros adapter for novel generation.

This adapter integrates:
- Unified LLM client (ouroboros when available, litellm fallback)
- PALRouter for model tier selection (when ouroboros available)
"""

import asyncio
import os
from pathlib import Path
from dataclasses import dataclass

from novel_generator.schema.novel import NovelSeed
from novel_generator.schema.chapter import ChapterSummary
from novel_generator.ouroboros.seed_adapter import (
    novel_seed_to_ouroboros,
    build_chapter_context,
)
from novel_generator.ouroboros.llm import call_llm


@dataclass
class GenerationResult:
    """Result of chapter generation."""
    chapter_number: int
    title: str
    content: str
    summary: str
    success: bool
    error: str | None = None


class NovelOuroborosAdapter:
    """Adapter that uses ouroboros for novel generation.

    Provides:
    - Model tier routing based on task complexity
    - LLM calls via LiteLLMAdapter
    - Event-based progress tracking
    """

    def __init__(
        self,
        output_dir: Path,
        model: str = "openrouter/anthropic/claude-3-haiku",
    ):
        """Initialize adapter.

        Args:
            output_dir: Directory for output files
            model: Default LLM model to use
        """
        self.output_dir = output_dir
        self.model = model
        self._router = None
        self._init_router()

    def _init_router(self):
        """Initialize PALRouter if ouroboros available."""
        try:
            from ouroboros.routing.router import PALRouter
            self._router = PALRouter()
        except ImportError:
            self._router = None

    async def generate_chapters(
        self,
        novel_seed: NovelSeed,
        start_chapter: int,
        end_chapter: int,
        on_progress: callable = None,
    ) -> list[GenerationResult]:
        """Generate chapters using ouroboros orchestration.

        Args:
            novel_seed: The novel seed specification
            start_chapter: First chapter to generate
            end_chapter: Last chapter to generate
            on_progress: Callback for progress updates

        Returns:
            List of GenerationResult for each chapter
        """

        results = []
        previous_summaries = []

        for ch_num in range(start_chapter, end_chapter + 1):
            if on_progress:
                on_progress(ch_num, end_chapter)

            try:
                result = await self._generate_single_chapter(
                    novel_seed=novel_seed,
                    chapter_num=ch_num,
                    previous_summaries=previous_summaries,
                )
                results.append(result)

                if result.success:
                    # Add to context for next chapter
                    previous_summaries.append({
                        "chapter": ch_num,
                        "title": result.title,
                        "summary": result.summary,
                    })

                    # Save chapter file
                    self._save_chapter(ch_num, result)

            except Exception as e:
                results.append(GenerationResult(
                    chapter_number=ch_num,
                    title="",
                    content="",
                    summary="",
                    success=False,
                    error=str(e),
                ))

        return results

    async def _generate_single_chapter(
        self,
        novel_seed: NovelSeed,
        chapter_num: int,
        previous_summaries: list[dict],
    ) -> GenerationResult:
        """Generate a single chapter.

        Args:
            novel_seed: Novel seed specification
            chapter_num: Chapter number to generate
            previous_summaries: Previous chapter summaries for context

        Returns:
            GenerationResult for this chapter
        """
        # Build context
        context = build_chapter_context(novel_seed, chapter_num, previous_summaries)

        prompt = f"""{context}

---

위 설정과 맥락을 바탕으로 {chapter_num}화를 작성해주세요.

요구사항:
1. 약 6000자 분량
2. 스타일 가이드 준수
3. 캐릭터 목소리 일관성 유지
4. 마지막은 다음 화가 궁금해지는 후킹 엔딩

출력 형식:
```yaml
title: "챕터 제목"
content: |
  본문 내용...
summary: "이 챕터 요약 (다음 챕터 맥락용, 3문장)"
```
"""

        # Determine model based on complexity (if router available)
        model = self.model
        if self._router:
            try:
                from ouroboros.routing.complexity import TaskContext
                context_obj = TaskContext(
                    token_count=len(prompt.split()) * 2,
                    tool_dependencies=[],
                    ac_depth=1,
                )
                routing = self._router.route(context_obj)
                if routing.is_ok:
                    model = self._tier_to_model(routing.value.tier.value)
            except Exception:
                pass

        try:
            content = await call_llm(
                prompt=prompt,
                system="당신은 한국 웹소설 전문 작가입니다. 카카오페이지 스타일의 몰입감 있는 소설을 씁니다.",
                model=model,
                temperature=0.7,
                max_tokens=8000,
            )
            return self._parse_chapter_response(chapter_num, content)
        except Exception as e:
            return GenerationResult(
                chapter_number=chapter_num,
                title="",
                content="",
                summary="",
                success=False,
                error=str(e),
            )

    def _tier_to_model(self, tier: str) -> str:
        """Map routing tier to model.

        Args:
            tier: "frugal", "standard", or "frontier"

        Returns:
            Model string for the tier
        """
        tier_models = {
            "frugal": "openrouter/anthropic/claude-3-haiku",
            "standard": "openrouter/anthropic/claude-3-5-sonnet",
            "frontier": "openrouter/anthropic/claude-3-opus",
        }
        return tier_models.get(tier, self.model)

    def _parse_chapter_response(self, chapter_num: int, response: str) -> GenerationResult:
        """Parse chapter from LLM response."""
        import re
        import yaml

        # Find YAML block
        yaml_match = re.search(r'```ya?ml\s*(.*?)```', response, re.DOTALL)
        if yaml_match:
            yaml_str = yaml_match.group(1)
            try:
                data = yaml.safe_load(yaml_str)
                return GenerationResult(
                    chapter_number=chapter_num,
                    title=data.get("title", f"{chapter_num}화"),
                    content=data.get("content", ""),
                    summary=data.get("summary", ""),
                    success=True,
                )
            except yaml.YAMLError:
                pass

        # Fallback: use entire response as content
        return GenerationResult(
            chapter_number=chapter_num,
            title=f"{chapter_num}화",
            content=response,
            summary=response[:200] + "...",
            success=True,
        )

    def _save_chapter(self, chapter_num: int, result: GenerationResult) -> None:
        """Save chapter to file."""
        chapters_dir = self.output_dir / "chapters"
        chapters_dir.mkdir(parents=True, exist_ok=True)

        # Save content
        filename = f"{chapter_num:03d}_{result.title}.txt"
        filepath = chapters_dir / filename
        filepath.write_text(result.content, encoding="utf-8")

        # Save summary
        summary_dir = self.output_dir / "summaries"
        summary_dir.mkdir(parents=True, exist_ok=True)
        summary_file = summary_dir / f"{chapter_num:03d}.yaml"

        import yaml
        summary_data = {
            "chapter_number": chapter_num,
            "title": result.title,
            "summary": result.summary,
        }
        summary_file.write_text(
            yaml.dump(summary_data, allow_unicode=True),
            encoding="utf-8",
        )
