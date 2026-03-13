"""Adapter to convert NovelSeed to ouroboros Seed format."""

from novel_generator.schema.novel import NovelSeed

# Ouroboros Seed will be imported dynamically to avoid import errors
# when ouroboros is not installed


def novel_seed_to_ouroboros(novel_seed: NovelSeed, chapter_range: tuple[int, int]):
    """Convert NovelSeed to ouroboros Seed for chapter generation.

    Args:
        novel_seed: The novel seed from phase 0
        chapter_range: (start, end) chapters to generate

    Returns:
        Ouroboros Seed configured for chapter generation
    """
    from ouroboros.core.seed import (
        Seed,
        SeedMetadata,
        OntologySchema,
        OntologyField,
        EvaluationPrinciple,
        ExitCondition,
    )

    start_ch, end_ch = chapter_range

    # Build goal from novel seed
    goal = f"""웹소설 '{novel_seed.title}' 챕터 생성 ({start_ch}화 ~ {end_ch}화)

장르: {novel_seed.world.genre} / {novel_seed.world.sub_genre}
로그라인: {novel_seed.logline}

각 챕터는 약 6000자이며, 아래 스타일 가이드를 따릅니다:
- 문단 길이: 최대 {novel_seed.style.max_paragraph_length}문장
- 대화 비율: {novel_seed.style.dialogue_ratio:.0%}
- 문장 스타일: {novel_seed.style.sentence_style}
- 시점: {novel_seed.style.pov}
- 시제: {novel_seed.style.tense}
- 후킹 엔딩: {'필수' if novel_seed.style.hook_ending else '선택'}
"""

    # Constraints
    constraints = (
        f"캐릭터 목소리 일관성 유지 (각 캐릭터의 tone, speech_patterns 준수)",
        f"복선 타이밍 준수 (planted_at, hints_at, reveal_at)",
        f"세계관 규칙 준수 ({', '.join(novel_seed.world.rules[:3])}...)",
        f"챕터당 약 6000자",
        "이전 챕터 요약과 일관성 유지",
        "장르 클리셰 적절히 활용",
    )

    # Acceptance criteria (per chapter)
    acceptance_criteria = []
    for ch_num in range(start_ch, end_ch + 1):
        outline = next(
            (o for o in novel_seed.chapter_outlines if o.chapter_number == ch_num),
            None
        )
        if outline:
            acceptance_criteria.append(
                f"{ch_num}화 '{outline.title}' 생성: {outline.one_liner}"
            )
        else:
            acceptance_criteria.append(f"{ch_num}화 생성")

    # Ontology for chapter output
    ontology_schema = OntologySchema(
        name="ChapterOutput",
        description="Generated chapter content and metadata",
        fields=(
            OntologyField(
                name="chapter_number",
                field_type="number",
                description="Chapter number",
            ),
            OntologyField(
                name="title",
                field_type="string",
                description="Chapter title",
            ),
            OntologyField(
                name="content",
                field_type="string",
                description="Chapter content (6000 chars)",
            ),
            OntologyField(
                name="summary",
                field_type="string",
                description="Chapter summary for context compression",
            ),
            OntologyField(
                name="character_states",
                field_type="object",
                description="Updated character states after this chapter",
            ),
        ),
    )

    # Evaluation principles
    evaluation_principles = (
        EvaluationPrinciple(
            name="style_compliance",
            description="문단 길이, 대화 비율, 후킹 엔딩 등 스타일 규칙 준수",
            weight=0.3,
        ),
        EvaluationPrinciple(
            name="character_consistency",
            description="캐릭터 목소리, 말투, 성격 일관성",
            weight=0.25,
        ),
        EvaluationPrinciple(
            name="plot_coherence",
            description="이전 챕터 요약과의 일관성, 복선 처리",
            weight=0.25,
        ),
        EvaluationPrinciple(
            name="engagement",
            description="독자 몰입도, 긴장감 유지",
            weight=0.2,
        ),
    )

    # Exit conditions
    exit_conditions = (
        ExitCondition(
            name="all_chapters_generated",
            description=f"{start_ch}화부터 {end_ch}화까지 모든 챕터 생성 완료",
            evaluation_criteria="각 챕터 파일이 저장되고 요약이 생성됨",
        ),
        ExitCondition(
            name="quality_threshold_met",
            description="각 챕터가 스타일 가이드를 만족",
            evaluation_criteria="style_compliance >= 0.7",
        ),
    )

    return Seed(
        goal=goal,
        constraints=constraints,
        acceptance_criteria=tuple(acceptance_criteria),
        ontology_schema=ontology_schema,
        evaluation_principles=evaluation_principles,
        exit_conditions=exit_conditions,
        metadata=SeedMetadata(ambiguity_score=0.1),  # Low ambiguity - structured task
    )


def build_chapter_context(
    novel_seed: NovelSeed,
    chapter_num: int,
    previous_summaries: list[dict],
) -> str:
    """Build context prompt for a specific chapter.

    Args:
        novel_seed: The novel seed
        chapter_num: Chapter number to generate
        previous_summaries: List of previous chapter summaries

    Returns:
        Context string for the chapter generation prompt
    """
    # Get chapter outline if exists
    outline = next(
        (o for o in novel_seed.chapter_outlines if o.chapter_number == chapter_num),
        None
    )

    # Get current arc
    current_arc = next(
        (a for a in novel_seed.arcs if a.start_chapter <= chapter_num <= a.end_chapter),
        None
    )

    # Get active foreshadowing
    active_fs = [
        fs for fs in novel_seed.foreshadowing
        if fs.should_act(chapter_num)
    ]

    # Build characters involved
    characters_in_chapter = []
    if outline and outline.characters_involved:
        for char_id in outline.characters_involved:
            char = next((c for c in novel_seed.characters if c.id == char_id), None)
            if char:
                characters_in_chapter.append(char)

    # Recent summaries (last 5)
    recent_summaries = previous_summaries[-5:] if previous_summaries else []

    context_parts = []

    # Novel info
    context_parts.append(f"""# 소설 정보
제목: {novel_seed.title}
로그라인: {novel_seed.logline}
장르: {novel_seed.world.genre} / {novel_seed.world.sub_genre}
""")

    # Current arc
    if current_arc:
        context_parts.append(f"""# 현재 아크
{current_arc.name} ({current_arc.start_chapter}~{current_arc.end_chapter}화)
{current_arc.summary}
클라이맥스: {current_arc.climax_chapter}화
""")

    # Chapter outline
    if outline:
        context_parts.append(f"""# {chapter_num}화 아웃라인
제목: {outline.title}
핵심: {outline.one_liner}
포인트:
{chr(10).join('- ' + p for p in outline.key_points)}
긴장도: {outline.tension_level}/10
""")

    # Characters
    if characters_in_chapter:
        context_parts.append("# 등장 캐릭터")
        for char in characters_in_chapter:
            context_parts.append(f"""
## {char.name} ({char.role})
톤: {char.voice.tone}
말투: {', '.join(char.voice.speech_patterns)}
예시 대사:
{chr(10).join('- "' + d + '"' for d in char.voice.sample_dialogues[:3])}
""")

    # Foreshadowing
    if active_fs:
        context_parts.append("# 복선 처리")
        for fs in active_fs:
            action = fs.should_act(chapter_num)
            context_parts.append(f"- [{action}] {fs.name}: {fs.description}")

    # Previous summaries
    if recent_summaries:
        context_parts.append("# 이전 내용 요약")
        for s in recent_summaries:
            context_parts.append(f"- {s.get('chapter', '?')}화: {s.get('summary', '')[:100]}...")

    # Style guide
    context_parts.append(f"""# 스타일 가이드
- 문단: {novel_seed.style.max_paragraph_length}문장 이하
- 대화 비율: {novel_seed.style.dialogue_ratio:.0%}
- 시점: {novel_seed.style.pov}
- 시제: {novel_seed.style.tense}
- 후킹 엔딩: {'필수' if novel_seed.style.hook_ending else '선택'}
규칙:
{chr(10).join('- ' + r for r in novel_seed.style.formatting_rules)}
""")

    return "\n".join(context_parts)
