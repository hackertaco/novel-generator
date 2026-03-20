# Novel Generator

AI novel generation harness with information-theoretic quality evaluation.

A configurable pipeline that generates Korean web novels chapter-by-chapter, with deterministic quality scoring, parallel scene generation, and step-by-step orchestration.

## Architecture

```
Genre ─→ stepPlots() ─→ stepSeed() ─→ stepPlan() ─→ stepChapters()
          3 plots        3-temp         plausibility    parallel scenes
          generated      evolution +    check +         + bridge stitch
                         crossover      master plan     + quality gate
```

Each step is managed by **NovelHarness** — a configurable runner that applies consistent model selection, evaluation criteria, and tracking across the entire pipeline. Users control progression between steps; the harness manages quality.

### Chapter Generation Pipeline

```
WriterAgent        → Scene-by-scene or parallel generation
RuleGuardAgent     → Code-based rules (ending repetition, cliché, length)
ConstraintChecker  → Knowledge graph validation (dead characters, timeline paradox)
QualityLoop        → Deterministic gate → LLM critic (only for borderline cases)
PolisherAgent      → Final style pass
```

### Deterministic Quality Scoring (10 dimensions, $0)

| Dimension | Weight | Method |
|-----------|--------|--------|
| Information theory | 21% | Shannon entropy, JSD pivot detection, arc correlation |
| Narrative | 15% | Entity density, causal connectors, tension escalation |
| Character voice | 12% | Speech pattern matching, formality consistency |
| Immersion | 12% | Concreteness ratio, scene grounding, psychic distance |
| Rhythm | 10% | Sentence length distribution, ending diversity |
| Hook ending | 8% | Last paragraph pattern analysis |
| Anti-repetition | 8% | Subject repetition, 4-gram frequency |
| Dialogue ratio | 6% | 30-60% optimal range |
| Sensory diversity | 4% | 5 senses coverage |
| Length | 4% | Target character count adherence |

**Gate logic:** Score < 0.70 → reject (no LLM). Score > 0.85 → pass (no LLM). Middle → LLM critic. Expected ~70% LLM cost reduction.

### Information Theory Scorer

Built on academic foundations:
- **Shannon Entropy** — emotion distribution complexity per paragraph (dynamism detection)
- **Jensen-Shannon Divergence** — surprise/pivot detection between consecutive segments
- **Pearson Correlation** — blueprint tension curve vs actual sentiment curve alignment
- **Korean Emotion Lexicon** — 300+ keywords with valence/arousal, 18 categories including web-novel body language

Sources: [Narrative Information Theory](https://arxiv.org/abs/2411.12907), [Fabula Entropy Indexing](https://arxiv.org/abs/2104.07472), [Syuzhet](https://github.com/mjockers/syuzhet)

### Tracking Systems (7)

- **HierarchicalMemory** — short/mid/long-term chapter memory
- **CharacterTracker** — emotion, relationships, location, secrets per chapter
- **ThreadTracker** — open narrative threads with deadline reminders
- **EventTimeline** — searchable event index by character/location/type
- **ToneManager** — arc-level tone profiles and tension curves
- **ProgressMonitor** — pacing feedback (too fast/slow)
- **FeedbackAccumulator** — bottom-up correction planning

### Presets

| Preset | Model | Pipeline | Speed |
|--------|-------|----------|-------|
| Default | gpt-5.4 | Full (6 agents) | ~2 min/ch |
| Budget | gpt-4o | Full | ~1.5 min/ch |
| Fast | gpt-4o-mini | Writer + Guard + Constraint | ~15s/ch (parallel) |

## Usage

```typescript
import { NovelHarness, getFastConfig } from './lib/harness';

const harness = new NovelHarness(getFastConfig());

// Step-by-step (UI)
for await (const event of harness.stepPlots("판타지")) { /* show plots */ }
for await (const event of harness.stepSeed("판타지", selectedPlot)) { /* show seed */ }
for await (const event of harness.stepPlan()) { /* show master plan */ }
for await (const event of harness.stepChapters(1, 10)) { /* stream chapters */ }

// Full auto (CLI)
for await (const event of harness.runFullPipeline("판타지", { endChapter: 10 })) {
  console.log(event.type);
}
```

## Setup

```bash
cd web
npm install
cp .env.example .env.local  # Add your OpenAI API key
npm run dev
```

## Tech Stack

- **Next.js** (App Router)
- **TypeScript**
- **OpenAI GPT-5.4 / GPT-4o** (via configurable model selection)
- **Zod** (schema validation)
- **Information Theory** (Shannon entropy, JSD, Pearson correlation)

## License

MIT
