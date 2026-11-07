# RAGsody Client — Roadmap

Status: post-audit, November 2026.

This roadmap covers the work that remains after the initial hardening pass (MIT license, README, unit tests, and CI). It is derived from the client migration plan and the gaps found in the repository audit. Items are ordered by risk first, then quality, then polish. Estimates are rough and assume one developer.

## Milestone 1 — Correctness and security

| # | Title | Description | Type | Hours |
|---|---|---|---|---|
| 1 | Centralize full-mode vs demo-mode boundaries | Consolidate `DEMO_MODE` checks into one capability/config module, remove scattered conditionals, document which features require the backend, and add tests for every boundary. | Refactor | 4 |
| 2 | Remove or formally support `demo_endpoint` | `detectSendMode` never returns `demo_endpoint`, but `sendMessage` still carries the branch. Delete it, or wire it explicitly with tests and documentation. | Chore | 3 |
| 3 | Stop shipping build-time Gemini keys | Remove `VITE_GEMINI_API_KEY` from the default full-mode path. Prefer a runtime user-provided key or a backend proxy, and document key rotation. | Security | 4 |
| 4 | Harden MCP authentication for deployments | `VITE_MCP_BEARER_TOKEN` is inlined into the browser bundle. Proxy MCP calls through the backend, or require an explicit trusted-local configuration with warnings in code and docs. | Security | 4 |

## Milestone 2 — Quality gates

| # | Title | Description | Type | Hours |
|---|---|---|---|---|
| 5 | Add backend contract tests | Use MSW to test `/query`, `/query/agent`, attachments, uploads, context-limit, and quota errors against fixtures that match the FastAPI schemas. | Testing | 6 |
| 6 | Add end-to-end demo tests | Add Playwright coverage for the demo welcome flow: continue without a key, continue with a key, reload (key must not persist), send a message with a mocked Gemini response, and attach a file. | Testing | 8 |
| 7 | Harden CI with coverage and dependency review | Add coverage thresholds for `src/lib` and `src/graph`, publish a coverage artifact, enable Dependabot, and add a dependency-review action for pull requests. | CI | 4 |
| 8 | Audit and fix accessibility | Check keyboard navigation, focus trapping in modals, form labels, color contrast, and screen-reader announcements. Add axe checks to the test suite and fix findings. | Accessibility | 5 |

## Milestone 3 — Performance and maintainability

| # | Title | Description | Type | Hours |
|---|---|---|---|---|
| 9 | Code-split the agent pipeline and highlighter | Lazy-load the LangGraph agent client and `highlight.js` so the initial bundle drops below Vite's 500 KB warning threshold. Measure with the bundle visualizer and Lighthouse. | Performance | 5 |
| 10 | Track architecture documentation | Move the 13 currently gitignored `doc/` modules into `docs/architecture/`, refresh stale paths, and link them from the README. | Docs | 4 |
| 11 | Repository hygiene and third-party review | Keep a single lockfile, decide whether to vendor `.agents/skills` (move to docs or remove), retain the required third-party licenses, and remove the `evals/evals.json` keyword false positive. | Chore | 3 |
| 12 | Add README walkthrough assets | Add screenshots or a short GIF of demo onboarding and chat, a full-mode setup diagram, and a prominent link to the live demo. | Docs | 2 |

## Milestone 4 — Backend (separate repository)

| # | Title | Description | Type | Hours |
|---|---|---|---|---|
| 13 | Audit and harden the server repository | Scan the full history for secrets, add a license, tests, and CI, review dependencies and container configuration, and document deployment boundaries. This is outside this repository but blocks end-to-end readiness. | Infrastructure | 6 |

## Total

| Scope | Hours |
|---|---|
| Milestone 1 — Correctness and security | 15 |
| Milestone 2 — Quality gates | 23 |
| Milestone 3 — Performance and maintainability | 14 |
| Milestone 4 — Backend (separate repository) | 6 |
| **Total** | **58** |

## Sequencing notes

- Items 3 and 4 are the only remaining security blockers for a public deployment; do them before promoting the demo widely.
- Items 1, 2, 5, and 6 define the supported mode contract and lock it down with tests.
- Item 13 must be tracked in the server repository, not here.
