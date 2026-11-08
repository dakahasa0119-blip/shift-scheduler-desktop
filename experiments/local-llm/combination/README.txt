Fictional combination experiment, authorized 2026-11-09 JST

Fixed model: pinned Qwen3.5-4B Q4_K_M, CPU4, context12288, greedy,
same runtime and same source records. No training or external AI service.
A compact one-shot baseline; B same with disjoint worked examples;
C split monthly generation by goal/event and remaining prose;
D both examples and split generation.

Each monthly report retains the agreed fields and deterministic utilization table.
Split stages have a combined4096 output-token limit, equal to the one-shot limit.
Input-token totals and number of calls differ and must be reported, not concealed.
One known monthly case and one prospectively written held-out monthly case.
Within each suite, all4 conditions use the same GitHub Windows runner; order is
A/B/C/D for known, D/C/B/A for heldout. Models restart between conditions,
fresh messages per call, no prompt cache. Different suites can have different CPUs.

Short daily/hint cases compare only A/B, since these are already single units.
Five short cases include follow-up, another person's information, answered hint,
and instruction-like text in a record. Total18 final documents across10 condition jobs.
There are only3 actual GitHub jobs; each condition is a sequential step within its suite.

Demonstrations are assistant-written fictional April records; the held-out monthly
case is November and was fixed before inference. No evaluation answers are provided
to the model. This is a small non-blinded engineering study, not clinical validation.
Raw responses, prompts, token counts, timings, process memory and assembled output
are retained. Assembly moves generated fields without changing their prose.
Missing or failed stages cause a failed result, never silently filled-in success.
No product data, credentials, source, deployment, or installer is changed.

Artifacts contain fictional text and logs only, never model weights.
Standard public runners only; no larger paid runner/GPU/cache upload.
The push trigger is temporary on the experiment branch and will be returned to
manual-only at completion. A new run must not be inferred from old experiment state.
