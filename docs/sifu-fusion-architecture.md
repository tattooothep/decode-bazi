# Sifu Fusion Architecture

Status: Phase 1 lab.

## Goal

Build a safe Fusion path for high-tier users without changing the production `/master` flow.

The Fusion flow lets a user ask a chart question from `/master-fusion`. The backend calls Codex, Grok, and Gemini as independent Sifu panel models, then calls Claude once as the primary judge. In that single judge call, Claude must first make its own chart judgment from the same Sifu packet/classics context, then synthesize the panel outputs into one final answer.

## Non-Negotiable Invariants

- `/master` and `public/master.html` stay untouched during Phase 1.
- `/api/sifu` stays the source of truth for prompt construction, chart packet injection, identity lock, trace gate, history trimming, and cache behavior.
- Classical/canonical rules are the interpretive source of truth within their scope. FACT/PILLAR locks are case facts. The packet is raw chart/calculation evidence used to prevent wrong-chart hallucination; it must not become a checklist that forces model wording or conclusions. Packet/engine outputs must not override strict classics.
- Every panel model call must route through `POST /api/sifu` with the selected `profileId`.
- The judge call must also route through `POST /api/sifu`, so the judge receives the same profile packet contract before synthesizing.
- Internal Fusion calls use a trusted localhost `/api/sifu` origin and a freshly signed internal auth cookie. They do not forward the browser's raw Cookie header.
- Public Fusion responses expose the final answer, sanitized panel/judge status metadata, and successful per-AI answer text in `fusion.answers` for the same authenticated user/question.
- Live progress/status metadata includes status/error/ms/chars/cache/attempts only. Provider stdout/stderr, raw prompt text, internal keys, and failed-provider raw details are not exposed to the browser.
- Fusion history stores the same sanitized response surface for the authenticated owner only. It must not store or expose raw prompts, API keys, provider stdout/stderr, or CLI account identities.
- Gemini is API-backed (`gemini-api`), not CLI-backed, but still receives the final prompt packet only after `/api/sifu` has built it. Gemini uses a raw-data adapter: it receives the packet/classics context but is not forced to output ID/TRACE lines or packet marker wording.
- Fusion is gated by login and high-tier/admin access before any model call.
- Fusion uses `spendHours()` before model calls when `SIFU_FUSION_SPEND_HOURS > 0`. Missing provider config such as a Gemini key is recorded as a sanitized `provider_config` failure with `attempts=0` because no provider call is made; if no usable panel/final answer can be produced, the run refunds the spend.
- Failed/incomplete Fusion runs refund the spent hours before returning a 5xx response.
- Strict audit mode requires every requested panel model to succeed before judge synthesis (`SIFU_FUSION_REQUIRE_ALL_PANELS !== 0`).
- Resilient user mode must not hang waiting for a dropped provider. It proceeds after enough panel replies, falls back through backup judges (`Codex -> Gemini -> Grok` by default after Claude), and if all judge synthesis fails it returns the best available panel answer with degraded metadata.
- Every user-facing Fusion response must tell the user how many AI engines actually answered in that round (`ai_answered_count` / `ai_requested_count`).

## Phase 1 Artifacts

- `src/app/api/sifu/fusion/route.ts`
  - New isolated endpoint.
  - Access gate: admin, owner/admin org member, or active subscription tier at/above `SIFU_FUSION_MIN_TIER` (`master` by default).
  - Spend gate: `SIFU_FUSION_SPEND_HOURS` (`25` by default).
  - Panel: `codex-cli`, `grok-cli`, `gemini-api`.
  - Judge: `claude-max-cli` by default, configurable with `SIFU_FUSION_JUDGE_MODEL`. Claude is not also called as a panel in the default flow.
  - Provider retry: panel and judge calls retry retryable transient failures within one child timeout budget. Quota/session-limit failures are surfaced as `provider_quota`, retried with longer backoff, and are not treated as packet failures.
  - Resilient mode: default for `/api/sifu/fusion` and `/master-fusion`; it uses bounded panel/judge budgets, waits for all configured panel models by default (`codex-cli`, `grok-cli`, `gemini-api`) until the panel budget expires, tries fallback judges (`codex-cli,gemini-api,grok-cli` by default), and returns a degraded answer if at least one panel answered.
  - Resilient `required_panel_count` is `1` to satisfy the no-hang/no-empty-answer requirement. `quorum_panel_count` (`SIFU_FUSION_RESILIENT_MIN_PANELS`, default `2`) is retained as metadata and as an optional early-exit target only when `SIFU_FUSION_WAIT_ALL_PANELS=0`; the production default waits for all panel models.
  - Strict audit mode: `fusionMode=strict` requires all panel replies. Judge calls still use the configured primary judge plus fallback judges so a provider outage does not hang the run; responses expose `judge_model`, `judge_attempted_models`, and `judge_backup_used` for audit.
  - Resilient panel fallback: no panel response refunds the spend; at least one usable panel can still produce a degraded user-facing answer.
  - Logs completed runs under `feature='sifu_fusion'` with final answer, receipt metadata, successful cleaned per-AI answers, status `done/degraded/fail`, and packet/profile audit snapshots when available from child `/api/sifu` logs.

- `src/app/api/sifu/fusion/history/route.ts`
  - Isolated history endpoint for Fusion only.
  - `GET` lists the authenticated user's Fusion rows for a selected `profileId`.
  - Filters by question/answer search, date range, topic, mode, status, favorite, and pinned.
  - `PATCH` updates user-owned favorite, pin, and private note state inside `response_meta.user_state`.
  - Does not change `/api/sifu/history` or master chat sync.

- `public/master-fusion.html`
  - New lab page.
  - Loads the user's real profiles from `/api/profile`.
  - Sends chart questions to `/api/sifu/fusion`.
  - Shows live progress while waiting: percent, current phase, panel/judge states, and sanitized per-model status.
  - Shows the final Fusion answer plus panel/judge status.
  - Shows Premium Fusion History per profile: search/filter, final answer, per-AI answers, run receipt, continue from a prior run, rerun the same question with the current packet, favorite/pin, private note, Markdown export, browser PDF print, compare two runs, and packet/profile snapshot proof.
  - Protected by `src/proxy.ts` like `/master`; unauthenticated users are redirected to login.

- `next.config.ts`
  - Adds no-store header coverage for `/master-fusion`.
  - Adds rewrite `/master-fusion -> /master-fusion.html`.

## Endpoint Contract

`POST /api/sifu/fusion`

Request:

```json
{
  "message": "คำถามดวง",
  "profileId": "uuid",
  "topic": "overview",
  "lang": "th",
  "history": [{ "role": "user", "content": "..." }],
  "threadProfileId": "uuid",
  "noCache": true,
  "threadId": "master-fusion"
}
```

Response:

```json
{
  "reply": "คำตอบสุดท้าย",
  "model": "fusion-api",
  "fusion": {
    "degraded": false,
    "reason": "judge_synthesized",
    "mode": "resilient",
    "ai_answered_count": 3,
    "ai_requested_count": 3,
    "panel_models": ["codex-cli", "grok-cli", "gemini-api"],
    "judge_model": "claude-max-cli",
    "answers": [
      { "model": "codex-cli", "role": "panel", "ok": true, "reply": "..." },
      { "model": "claude-max-cli", "role": "judge", "ok": true, "reply": "..." }
    ],
    "packet_contract": "Every panel and judge call is POST /api/sifu...",
    "spent": 25,
    "balance_after": 1175
  }
}
```

## Premium Fusion History

Fusion history is separate from master chat history.

- Store: `research_ai_messages`.
- Feature key: `sifu_fusion`.
- Scope: authenticated `user_id` and selected `profile_id`.
- Status: `response_meta.fusion_status` is `done`, `degraded`, or `fail`. The DB `status` column remains `ok` for done/degraded and `error` for fail.
- Receipt: AI answered/requested count, failed models, panel/judge statuses, judge trail, fallback/degraded flags, elapsed time, spent/refunded/net spent, and balance after.
- Per-AI answers: `response_meta.answers` stores successful cleaned replies only. Failed provider raw payloads, prompts, stdout/stderr, API keys, and provider account identities are not stored for user history.
- Snapshot proof: when child `/api/sifu` logs are available, the Fusion row copies safe audit fields into top-level research columns and response metadata: `profile_snapshot`, `pillars_snapshot`, `packet_hash`, `packet_snapshot_safe`, `context_hash`, `prompt_hash`, and `prompt_version`. If child logs have not landed yet, the row stores a safe profile fallback and marks `profile_snapshot_status`.
- User state: favorite, pin, and private note live under `response_meta.user_state` to avoid a schema migration for the first production version.

History API:

- `GET /api/sifu/fusion/history?profileId=...`
  - Optional: `q`, `topic`, `mode`, `status`, `dateFrom`, `dateTo`, `favorite`, `pinned`, `limit`.
- `PATCH /api/sifu/fusion/history`
  - Body: `{ id, favorite?, pinned?, note? }`.
  - Only the owner of the `sifu_fusion` row can update it.

## Rollout

Phase 1: `/master-fusion` lab only.

Phase 2: keep endpoint/page gated to admins/org owners or active subscriptions at/above tier `master`.

Phase 3: after lab verification, add an explicit Fusion control to `/master`. This phase is intentionally not implemented now.

Phase 4: only after quality and latency evidence, consider routing hard questions to Fusion by default.

## Environment Controls

- `SIFU_FUSION_MIN_TIER=master`
- `SIFU_FUSION_SPEND_HOURS=25`
- `SIFU_FUSION_CHILD_TIMEOUT_MS=650000`
- `SIFU_FUSION_PANEL_ATTEMPTS=3`
- `SIFU_FUSION_JUDGE_ATTEMPTS=3`
- `SIFU_FUSION_RESILIENT_MIN_PANELS=2`
- `SIFU_FUSION_RESILIENT_PREFERRED_MODELS=gemini-api`
- `SIFU_FUSION_RESILIENT_QUORUM_WAIT_MS=600000`
- `SIFU_FUSION_RESILIENT_PANEL_TIMEOUT_MS=600000`
- `SIFU_FUSION_RESILIENT_JUDGE_TIMEOUT_MS=600000`
- `SIFU_FUSION_TOTAL_TIMEOUT_MS=540000`
- `SIFU_FUSION_FALLBACK_JUDGE_MODELS=codex-cli,gemini-api,grok-cli`
- `SIFU_FUSION_JUDGE_MODEL=claude-max-cli`
- `SIFU_FUSION_JUDGE_MESSAGE_CHARS=24000` by default. This gives the judge enough room to compare panel answers instead of seeing only short excerpts.
- Internal Fusion child calls can send long judge synthesis messages through `/api/sifu` via the trusted fusion headers/token. Direct user-facing `/api/sifu` messages keep their short public limit.
- `SIFU_FUSION_REQUIRE_ALL_PANELS=1` by default; set `0` only for emergency diagnostics.
- `SIFU_FUSION_ALLOW_ALL=1` for local emergency testing only
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` is required when `gemini-api` is part of the panel.
- `SIFU_GEMINI_MODEL=gemini-3.1-pro-preview` by default.
- `SIFU_GEMINI_MAX_OUTPUT_TOKENS=8192` by default.
- `SIFU_GEMINI_THINKING_BUDGET` is unset by default for Pro Gemini models, so the provider can use its model-default thinking behavior.
- Gemini cache keys include the underlying `SIFU_GEMINI_MODEL`, and Fusion public metadata exposes `provider_model` for proof without exposing API keys.

## Safety Notes

- Fusion calls are expensive: one request can produce three panel calls plus one judge call.
- Before running the full 5-profile proof, run `node scripts/check-claude-cli-preflight.mjs` on the host. If it returns `CLAUDE_QUOTA_BLOCKED`, wait for provider reset instead of spending panel calls.
- In resilient user mode, the endpoint requires at least one usable panel reply to avoid an empty answer. By default it waits for all configured panel models until the bounded panel budget expires, then attempts judge synthesis with the successful answers it has.
- Judge synthesis must first reconcile consensus, strongest panel details/warnings, and conflicts against the canonical sources and hard facts. The final user answer must not expose that internal process, but it should preserve important timing/risk details rather than smoothing them away.
- Fusion raw-data panel replies must still be substantive. `SIFU_FUSION_MIN_VISIBLE_REPLY_CHARS` defaults to `900`; shorter replies are retried and then treated as failed instead of being exposed as a usable panel answer.
- The page is non-streaming in Phase 1 to keep the control path simple and easy to audit.
- Failed panel outputs are reported as sanitized status metadata and are not shown as user-facing final answers.
- Successful panel/judge answer text is returned in `fusion.answers` so the user can click into each AI's answer for that question. This field must contain only `/api/sifu` cleaned replies and must not include prompts, provider stdout/stderr, API keys, or raw failed-provider payloads.
- Claude CLI quota/session-limit exhaustion is an external provider availability condition. Fusion returns sanitized failure metadata and refunds spend; the 5-profile proof run must be repeated after the provider is available again.
