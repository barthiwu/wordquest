# AI evaluation testing

The unit tests under `src/**/*.spec.ts` mock `@anthropic-ai/sdk` entirely —
they verify plumbing (prompt construction, JSON-parsing/error-handling,
score-clamping, XP math) but say nothing about whether the model's actual
judgment is any good. That's a different, more expensive kind of test:
this directory holds it.

## What these tests do

Each `*.ai-eval-spec.ts` file constructs the real evaluation service
(`SentenceEvaluationService`, `ParagraphEvaluationService`, …) and sends it
a small set of hand-picked, clearly-differentiated inputs — a strong
response, a weak/flawed one, a couple of edge cases — against the REAL
Anthropic API. Assertions are deliberately loose (a strong sentence scores
meaningfully higher than a broken one; feedback fields are non-empty and
reference the actual content; a required field is present) rather than
pinned to exact numbers, since the model's precise scores are not
contractually stable across model versions. The point is to catch gross
regressions — a prompt change that flips the ranking, a broken JSON
contract, a dimension that stops discriminating — not to snapshot-test
exact outputs.

## Running them

These call a real, billed API and need real network access, so they are
**not** part of `npm test` or `npm run test:e2e` and do not run in normal
CI. Each spec file skips itself entirely (`describe.skip`) unless
`AI_PROVIDER_API_KEY` is set in the environment — the same variable the
app itself uses for AI configuration (`AppConfigService.isAiConfigured`).

```bash
export AI_PROVIDER_API_KEY=sk-ant-...
npm run test:ai-eval
```

## Coverage today, and extending it

Scaffolded for `SentenceEvaluationService` and `ParagraphEvaluationService`
— the two purest "send text, get back scored JSON" evaluators, and the
simplest pattern to extend. Not yet covered, following the same pattern:
`MasterChallengeEvaluationService`, `EvidenceAssessmentService` (Word in
the Wild), and `AliService`'s reaction generation.

(Speaking/Pronunciation, and its `SpeakingEvaluationService`, were removed
from V1 entirely — Correction & Completion Spec §1 — so there is no
longer an evaluator for it to cover here.)
