"""Main entry point for novel generator."""

import warnings

warnings.warn(
    "Python CLI는 deprecated입니다. web/ 디렉토리의 NovelHarness를 사용하세요.",
    DeprecationWarning,
    stacklevel=2,
)

import asyncio
from pathlib import Path

import typer
from rich.console import Console
from rich.prompt import Prompt, Confirm

app = typer.Typer(name="novel", help="웹소설 생성기")
console = Console()


@app.command()
def init(
    idea: str = typer.Argument(..., help="소설 아이디어"),
    name: str = typer.Option(None, "--name", "-n", help="프로젝트 이름 (폴더명)"),
    base_dir: Path = typer.Option(Path("./novels"), "--base-dir", "-d", help="기본 디렉토리"),
    skip_interview: bool = typer.Option(False, "--skip-interview"),
) -> None:
    """새 소설 프로젝트 시작."""
    from novel_generator.phase0.interview import NovelInterviewer
    from novel_generator.phase0.plot_generator import PlotGenerator, format_plot_options
    from novel_generator.phase0.seed_generator import SeedGenerator
    from novel_generator.state.store import StateStore
    import re
    from datetime import datetime

    # 프로젝트 이름 생성 (없으면 아이디어에서 추출)
    if not name:
        # 아이디어에서 핵심 단어 추출 (한글/영문/숫자만)
        clean = re.sub(r'[^\w\s가-힣]', '', idea)
        words = clean.split()[:3]  # 앞 3단어
        name = "_".join(words) if words else f"novel_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    output_dir = base_dir / name
    console.print(f"프로젝트: {name}")
    console.print(f"아이디어: {idea}\n")

    output_dir.mkdir(parents=True, exist_ok=True)
    store = StateStore(output_dir)

    existing_seed = store.load_seed()
    if existing_seed:
        console.print(f"기존 프로젝트: {existing_seed.title}")
        action = Prompt.ask("선택", choices=["덮어쓰기", "이어서", "취소"], default="이어서")
        if action == "취소":
            raise typer.Exit(0)
        if action == "이어서":
            console.print(f"저장됨: {output_dir}")
            console.print("다음: novel generate")
            raise typer.Exit(0)

    # Step 1: Interview
    interviewer = NovelInterviewer()

    if not skip_interview:
        greeting, (question, options) = interviewer.start(idea)
        console.print(greeting)

        while True:
            console.print(f"\n{question}")
            if options:
                for i, opt in enumerate(options, 1):
                    console.print(f"  {i}. {opt}")
                answer = Prompt.ask("선택")
            else:
                answer = Prompt.ask("입력 (없으면 엔터)")

            response, next_q = interviewer.answer(answer)
            console.print(response)

            if next_q is None:
                break
            question, options = next_q
    else:
        interviewer.start(idea)
        interviewer.state.genre = "현대 판타지"
        interviewer.state.protagonist = "귀환형"
        interviewer.state.conflict = "거대 악 vs 주인공"
        interviewer.state.tone = "어둡고 진지"
        interviewer.state.scale = "장편 (300화+)"

    interview_result = interviewer.get_interview_result()

    # Step 2: Generate plot options
    console.print("\n플롯 생성 중...")
    plot_gen = PlotGenerator()
    plots = asyncio.run(plot_gen.generate(interview_result))

    console.print(format_plot_options(plots))

    # Step 3: Select plot
    console.print("\n")
    choice = Prompt.ask("플롯 선택 (A/B/C) 또는 다시 생성(R)").upper()

    while choice == "R":
        console.print("\n다시 생성 중...")
        plots = asyncio.run(plot_gen.generate(interview_result))
        console.print(format_plot_options(plots))
        choice = Prompt.ask("플롯 선택 (A/B/C) 또는 다시 생성(R)").upper()

    selected = next((p for p in plots if p.id == choice), plots[0])
    console.print(f"\n선택: [{selected.id}] {selected.title}")

    # Step 4: Generate seed from selected plot
    console.print("\nSeed 생성 중...")

    # Combine interview + selected plot
    full_context = f"""{interview_result}

## 선택한 플롯
제목: {selected.title}
로그라인: {selected.logline}
훅: {selected.hook}
전개:
{chr(10).join('- ' + a for a in selected.arc_summary)}
핵심 반전: {selected.key_twist}
"""

    generator = SeedGenerator()

    try:
        seed = asyncio.run(generator.generate(full_context))
    except Exception as e:
        console.print(f"실패: {e}")
        raise typer.Exit(1)

    warnings = generator.validate_seed(seed)
    if warnings:
        console.print("\n경고:")
        for w in warnings:
            console.print(f"  - {w}")

    console.print(f"""
{seed.title}
{seed.logline}

장르: {seed.world.genre} / {seed.world.sub_genre}
분량: {seed.total_chapters}화
캐릭터: {len(seed.characters)}명
아크: {len(seed.arcs)}개
복선: {len(seed.foreshadowing)}개
""")

    if Confirm.ask("진행?"):
        store.save_seed(seed)
        console.print(f"저장됨: {output_dir}")
        console.print("다음: novel generate")
    else:
        console.print("취소됨")


@app.command()
def generate(
    name: str = typer.Argument(..., help="프로젝트 이름"),
    chapters: int = typer.Option(None, "--chapters", "-n"),
    start_from: int = typer.Option(None, "--start-from", "-s"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    model: str = typer.Option("openrouter/anthropic/claude-3-haiku", "--model", "-m"),
    base_dir: Path = typer.Option(Path("./novels"), "--base-dir", "-d"),
) -> None:
    """챕터 생성."""
    from novel_generator.state.store import StateStore
    from novel_generator.state.context_builder import ContextBuilder

    output_dir = base_dir / name
    if not output_dir.exists():
        console.print(f"프로젝트 없음: {name}")
        console.print(f"novel init으로 먼저 생성하세요.")
        raise typer.Exit(1)

    store = StateStore(output_dir)
    seed = store.load_seed()

    if not seed:
        console.print("Seed 없음. novel init 먼저.")
        raise typer.Exit(1)

    progress = store.get_progress()
    console.print(f"{seed.title}")
    console.print(f"진행: {progress['current_chapter']}/{progress['total_chapters']}")

    start = start_from or (progress["current_chapter"] + 1)
    end = min((start + chapters - 1) if chapters else seed.total_chapters, seed.total_chapters)

    console.print(f"생성: {start}화 ~ {end}화")

    if dry_run:
        context_builder = ContextBuilder(store)
        for ch_num in range(start, min(start + 3, end + 1)):
            try:
                context = context_builder.build_context(ch_num)
                prompt = context_builder.format_for_prompt(context)
                console.print(f"\n--- {ch_num}화 ---")
                console.print(prompt[:500] + "..." if len(prompt) > 500 else prompt)
            except Exception as e:
                console.print(f"{ch_num}화 실패: {e}")
        return

    # Generate using ouroboros adapter
    from novel_generator.ouroboros.adapter import NovelOuroborosAdapter

    adapter = NovelOuroborosAdapter(output_dir, model=model)

    def on_progress(current: int, total: int):
        console.print(f"[{current}/{total}] 생성 중...")

    try:
        results = asyncio.run(
            adapter.generate_chapters(
                novel_seed=seed,
                start_chapter=start,
                end_chapter=end,
                on_progress=on_progress,
            )
        )

        # Summary
        success_count = sum(1 for r in results if r.success)
        console.print(f"\n완료: {success_count}/{len(results)}화 생성")

        for r in results:
            if r.success:
                console.print(f"  {r.chapter_number}화: {r.title}")
            else:
                console.print(f"  {r.chapter_number}화: 실패 - {r.error}")

        # Update progress
        if success_count > 0:
            last_success = max(r.chapter_number for r in results if r.success)
            store.update_progress(last_success)

    except Exception as e:
        console.print(f"생성 실패: {e}")
        raise typer.Exit(1)


@app.command()
def status(
    name: str = typer.Argument(None, help="프로젝트 이름 (없으면 전체 목록)"),
    base_dir: Path = typer.Option(Path("./novels"), "--base-dir", "-d"),
) -> None:
    """상태 확인."""
    from novel_generator.state.store import StateStore

    # 프로젝트 이름 없으면 전체 목록
    if not name:
        if not base_dir.exists():
            console.print("프로젝트 없음.")
            return
        projects = [d.name for d in base_dir.iterdir() if d.is_dir()]
        if not projects:
            console.print("프로젝트 없음.")
            return
        console.print("프로젝트 목록:")
        for p in sorted(projects):
            store = StateStore(base_dir / p)
            seed = store.load_seed()
            if seed:
                progress = store.get_progress()
                console.print(f"  {p}: {seed.title} ({progress['current_chapter']}/{progress['total_chapters']}화)")
            else:
                console.print(f"  {p}: (seed 없음)")
        return

    output_dir = base_dir / name
    store = StateStore(output_dir)
    seed = store.load_seed()

    if not seed:
        console.print(f"프로젝트 없음: {name}")
        return

    progress = store.get_progress()
    console.print(f"""{seed.title}
{seed.logline}

장르: {seed.world.genre} / {seed.world.sub_genre}
캐릭터: {len(seed.characters)} / 아크: {len(seed.arcs)} / 복선: {len(seed.foreshadowing)}
진행: {progress['current_chapter']}/{progress['total_chapters']}""")

    summaries = store.get_all_summaries()[-5:]
    if summaries:
        console.print("\n최근:")
        for s in summaries:
            console.print(f"  {s.chapter_number}. {s.title}")


@app.command()
def show_seed(
    name: str = typer.Argument(..., help="프로젝트 이름"),
    section: str = typer.Option(None, "--section", "-s"),
    base_dir: Path = typer.Option(Path("./novels"), "--base-dir", "-d"),
) -> None:
    """Seed 상세 보기."""
    from novel_generator.state.store import StateStore

    output_dir = base_dir / name
    store = StateStore(output_dir)
    seed = store.load_seed()

    if not seed:
        console.print(f"Seed 없음: {name}")
        raise typer.Exit(1)

    if section == "characters":
        for char in seed.characters:
            console.print(f"\n{char.name} ({char.role})")
            console.print(f"  톤: {char.voice.tone}")
            console.print(f"  패턴: {', '.join(char.voice.speech_patterns)}")

    elif section == "arcs":
        for arc in seed.arcs:
            console.print(f"\n{arc.name} ({arc.start_chapter}-{arc.end_chapter}화)")
            console.print(f"  {arc.summary}")

    elif section == "foreshadowing":
        for fs in seed.foreshadowing:
            console.print(f"\n{fs.name} [{fs.importance}]")
            console.print(f"  심기: {fs.planted_at}화 / 회수: {fs.reveal_at}화")

    else:
        console.print(f"{seed.title}")
        console.print(f"캐릭터: {[c.name for c in seed.characters]}")
        console.print(f"아크: {[a.name for a in seed.arcs]}")
        console.print("\n--section [characters|arcs|foreshadowing]")


@app.command()
def evaluate(
    name: str = typer.Argument(..., help="프로젝트 이름"),
    chapter: int = typer.Argument(..., help="회차"),
    base_dir: Path = typer.Option(Path("./novels"), "--base-dir", "-d"),
) -> None:
    """회차 평가."""
    from novel_generator.state.store import StateStore
    from novel_generator.evaluators.style import StyleEvaluator

    output_dir = base_dir / name
    store = StateStore(output_dir)
    seed = store.load_seed()

    if not seed:
        console.print(f"Seed 없음: {name}")
        raise typer.Exit(1)

    chapter_files = list(store.chapters_dir.glob(f"{chapter:03d}_*.txt"))
    if not chapter_files:
        console.print(f"{chapter}화 없음.")
        raise typer.Exit(1)

    content = chapter_files[0].read_text(encoding="utf-8")

    style_eval = StyleEvaluator(seed.style)
    style_result = style_eval.evaluate(content)

    console.print(f"\n{chapter}화 평가")
    console.print(f"  대화: {style_result['dialogue_ratio']['actual_ratio']:.0%}")
    console.print(f"  문단: {'OK' if style_result['paragraph_length']['pass'] else 'X'}")
    console.print(f"  후킹: {'OK' if style_result['hook_ending']['pass'] else 'X'}")
    console.print(f"  총점: {style_result['overall_score']:.2f}")


if __name__ == "__main__":
    app()
