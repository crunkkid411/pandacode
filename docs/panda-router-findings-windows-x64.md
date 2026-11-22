# Panda Router on Jordan's PC: findings so far

Written 2026-11-06 by Claude Code (Opus 5.5) for Jordan's fork, `X:\AI-2\pandacode`. This is Jordan's note, not upstream documentation.

**Jordan's decision, 2026-11-06:** "let's assume it needs more fine tuning (and maybe further post-training) and move on". "It can certainly be a model in our stack - no single model should be doing everything." He declined further testing. Nothing is installed, and no PandaCode code was changed.

## Source

- Video: "I Built a Tiny Local Model That Outperforms Opus! (by using Orchestration)", AICodeKing, 2026-11-01, `https://youtu.be/Xa0Zhl8ljPY`. I read the captions and description; I didn't watch it.
- Router project: `https://github.com/aicodeking/PandaOrchestrator` (MIT). Tested at commit `83e408c`, the same commit PandaCode pins. The model file's SHA-256 matched PandaCode's pinned value in `X:\AI-2\pandacode\src-tauri\src\panda_router.rs`.

## What it does

It reads a job description and a list of models, then names the model to try first and an order to try the others if a check fails. It runs on the processor, and nothing leaves the PC. It doesn't run the model or check the work.

The author's numbers (150 held-out tasks, nine models, graded by an LLM judge; none of this reproduced here): one pick solved about 77 of 100. Following the ladder with up to 2 attempts solved 88.7 at the lowest cost; escalating from the pick solved 90.7. A perfect pick would solve 94. The author says escalation "is only as good as the check the architect runs".

## Findings on this PC (Windows 10, Intel i7-10750H, x64)

1. **PandaCode only has the keyword guess here, not the model.** `X:\AI-2\pandacode\src-tauri\build.rs` line 27 turns the model on only for `aarch64` (ARM). `X:\AI-2\pandacode\docs\model-routing.md` says x86_64 Windows has no profiler. The video lists only Intel Macs and x86 Linux as exceptions, so it doesn't warn about this.
2. **The standalone Python version runs here, but gives wrong answers as shipped, with no error.** It sent "Rename a variable in utils.py" to Opus first and rated "Make the app better" as easy. Its README example didn't reproduce (Sonnet 29% against the published 62%, category `test_writing` against `implementation`).
3. **One ONNX Runtime setting mostly fixes that.** Add this after `opts = ort.SessionOptions()` in `panda_router/model/onnx_profiler.py`:

   ```python
   opts.add_session_config_entry("session.x64quantprecision", "1")
   ```

   Likely cause: this processor lacks the newer instructions these compressed models tend to rely on. That cause isn't proven, but changing only this setting moved the results. Downgrading `transformers` to 4.57 changed nothing, and turning off graph optimization changed nothing.

## Scores on the project's own test set

`data/gold/gold.jsonl`, 359 tasks, `onnxruntime` 1.31.1, processor only.

| | As shipped | With the setting | Published |
|---|---|---|---|
| Job type correct | 40.4% | 66.6% | 68.8% (v3) |
| Difficulty rank correlation | 0.439 | 0.645 | 0.71-0.73 (v4 candidates) |
| Difficulty average error | 1.15 | 0.96 | 0.825 (v3) |

The published shipped weights "were not re-tabulated", so the comparison is approximate. The README example with the setting: Sonnet picked at 55.6% (published 62.3%), Haiku 45.9% (published 50.4%), `implementation` at 69.8% (published 79.1%), difficulty 5.13 (published 4.89).

## Limits for this setup

- Only 9 models have measured results. Everything else uses a hand-estimated card that's deliberately marked down.
- $0 and local models get an extra markdown, so it won't favour free models by default. It knows nothing about daily free limits.
- Vibe, Kilo and OpenCode's free models would each need a card, or a rank in the tier list.
- No job was ever run from one of its picks here. The picks were read, not proven.

## If this is picked up again

- The first thing to try is the setting above, because it may explain part of what looks like a tuning gap on this processor.
- Fine-tuning needs labelled tasks and real graded attempts. The author's upstream run cost about $50, and paid spending needs Jordan's yes. His standing rule is free or OAuth only.
- To use it inside PandaCode on this PC, `build.rs` and `Cargo.toml` would have to allow Windows x64, and the Rust session would need the same setting. Upstream's stated reason for leaving it out is "no baseline-compatible prebuilt ONNX Runtime". Not attempted.

## PandaCode itself

Still the best fit found so far for handing out jobs and showing what ran. It isn't the memory or the voice. Full comparison: `X:\AI-2\what-jordan-needs.md`, section "PandaCode". Read from docs and code searches only; not opened or tested by me.

## Vibe's `/understand` run on this repo

As of 2026-11-06 8:09 PM Jordan says it's still running; it was held up on permissions, and he's letting it continue.

`X:\AI-2\pandacode\.ua\knowledge-graph.json` was last written at 7:26 PM. It holds 15 nodes and 16 edges, the same counts as the earlier `knowledge-graph-demo.json` and far below the 2,000-3,000 nodes the run estimated. Don't rely on it until the run ends and the node count is checked again.
