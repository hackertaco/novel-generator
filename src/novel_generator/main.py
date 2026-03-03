"""Main entry point for novel generator."""

from pathlib import Path

import typer

app = typer.Typer(
    name="novel",
    help="Kakao-style Korean web novel generator",
)


@app.command()
def init(
    idea: str = typer.Argument(..., help="Novel idea/premise"),
    output_dir: Path = typer.Option(
        Path("./output"),
        "--output", "-o",
        help="Output directory for generated novel",
    ),
) -> None:
    """Initialize a new novel project with Phase 0 (plot generation)."""
    typer.echo(f"Initializing novel from idea: {idea}")
    typer.echo(f"Output directory: {output_dir}")

    # TODO: Integrate with ouroboros-ai Phase 0
    # 1. Run Big Bang interview to clarify idea
    # 2. Generate NovelSeed with plot, characters, worldbuilding
    # 3. Present for user approval
    # 4. Save approved seed to state store

    typer.echo("\n[Phase 0] Plot generation not yet implemented.")
    typer.echo("This will use ouroboros-ai to generate and approve the plot.")


@app.command()
def generate(
    output_dir: Path = typer.Option(
        Path("./output"),
        "--output", "-o",
        help="Output directory with saved seed",
    ),
    chapters: int = typer.Option(
        None,
        "--chapters", "-n",
        help="Number of chapters to generate (default: all remaining)",
    ),
    start_from: int = typer.Option(
        None,
        "--start-from", "-s",
        help="Start from specific chapter (default: next unwritten)",
    ),
) -> None:
    """Generate chapters from approved seed."""
    from novel_generator.state.store import StateStore

    store = StateStore(output_dir)
    seed = store.load_seed()

    if not seed:
        typer.echo("No seed found. Run 'novel init' first.", err=True)
        raise typer.Exit(1)

    progress = store.get_progress()
    typer.echo(f"Novel: {seed.title}")
    typer.echo(f"Progress: {progress['current_chapter']}/{progress['total_chapters']} chapters")

    start = start_from or (progress["current_chapter"] + 1)
    end = (start + chapters) if chapters else seed.total_chapters

    typer.echo(f"\nGenerating chapters {start} to {end}...")

    # TODO: Integrate with ouroboros-ai for generation
    # 1. Build context for each chapter
    # 2. Generate chapter using Double Diamond phase
    # 3. Evaluate style and consistency
    # 4. Extract and save summary
    # 5. Update character states
    # 6. Save chapter

    typer.echo("\n[Generation] Not yet implemented.")
    typer.echo("This will use ouroboros-ai to generate chapters.")


@app.command()
def status(
    output_dir: Path = typer.Option(
        Path("./output"),
        "--output", "-o",
        help="Output directory",
    ),
) -> None:
    """Show generation status."""
    from novel_generator.state.store import StateStore

    store = StateStore(output_dir)
    seed = store.load_seed()

    if not seed:
        typer.echo("No novel initialized. Run 'novel init' first.")
        return

    progress = store.get_progress()

    typer.echo(f"Title: {seed.title}")
    typer.echo(f"Genre: {seed.world.genre} / {seed.world.sub_genre}")
    typer.echo(f"Characters: {len(seed.characters)}")
    typer.echo(f"Arcs: {len(seed.arcs)}")
    typer.echo(f"Foreshadowing elements: {len(seed.foreshadowing)}")
    typer.echo(f"\nProgress: {progress['current_chapter']}/{progress['total_chapters']} ({progress['progress_percent']:.1f}%)")

    # Show recent chapters
    summaries = store.get_all_summaries()[-5:]
    if summaries:
        typer.echo("\nRecent chapters:")
        for s in summaries:
            typer.echo(f"  {s.chapter_number:3d}. {s.title} - {s.plot_summary[:50]}...")


@app.command()
def evaluate(
    chapter: int = typer.Argument(..., help="Chapter number to evaluate"),
    output_dir: Path = typer.Option(
        Path("./output"),
        "--output", "-o",
        help="Output directory",
    ),
) -> None:
    """Evaluate a generated chapter for style and consistency."""
    from novel_generator.state.store import StateStore
    from novel_generator.evaluators.style import StyleEvaluator
    from novel_generator.evaluators.consistency import ConsistencyEvaluator

    store = StateStore(output_dir)
    seed = store.load_seed()

    if not seed:
        typer.echo("No seed found.", err=True)
        raise typer.Exit(1)

    # Find chapter file
    chapter_files = list(store.chapters_dir.glob(f"{chapter:03d}_*.txt"))
    if not chapter_files:
        typer.echo(f"Chapter {chapter} not found.", err=True)
        raise typer.Exit(1)

    content = chapter_files[0].read_text(encoding="utf-8")

    # Style evaluation
    style_eval = StyleEvaluator(seed.style)
    style_result = style_eval.evaluate(content)

    typer.echo(f"\n=== Chapter {chapter} Evaluation ===\n")
    typer.echo("Style:")
    typer.echo(f"  Dialogue ratio: {style_result['dialogue_ratio']['actual_ratio']:.1%} (target: {style_result['dialogue_ratio']['target_ratio']:.1%})")
    typer.echo(f"  Paragraph length: {'PASS' if style_result['paragraph_length']['pass'] else 'FAIL'}")
    typer.echo(f"  Sentence style: {'PASS' if style_result['sentence_length']['pass'] else 'FAIL'}")
    typer.echo(f"  Hook ending: {'PASS' if style_result['hook_ending']['pass'] else 'FAIL'}")
    typer.echo(f"  Overall score: {style_result['overall_score']:.2f}")

    # Consistency evaluation
    consistency_eval = ConsistencyEvaluator(store)
    consistency_result = consistency_eval.evaluate(chapter, content)

    typer.echo("\nConsistency:")
    typer.echo(f"  Character voice: {'PASS' if consistency_result['character_voice']['pass'] else 'FAIL'}")
    typer.echo(f"  Foreshadowing: {'PASS' if consistency_result['foreshadowing']['pass'] else 'FAIL'}")
    typer.echo(f"  Continuity: {'PASS' if consistency_result['continuity']['pass'] else 'FAIL'}")


if __name__ == "__main__":
    app()
