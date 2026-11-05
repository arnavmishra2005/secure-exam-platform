# Documentation index

**Setup and everyday commands live in one place: the root [README.md](../README.md).**
It covers a fresh macOS or Ubuntu machine, which commands are one-time, which give you fresh
data, and which you run every day. This folder holds design notes and contracts.

| Document | What it covers | Owner |
|---|---|---|
| [merge-notes-person-b.md](merge-notes-person-b.md) | Phase 5 work by Person B that touches Person A's or C's code or shared files: what changed, why, and what to do when merging | B |
| [execution-security.md](execution-security.md) | How student code runs on the server: sandbox controls, languages, abuse tests, monitoring, capacity, deployment checklist | B |
| [local-code-runner.md](local-code-runner.md) | Running code on the student's lab PC inside the exam app (bubblewrap, cgroups, system-call filter), contract and acceptance checklist | B (implementation in C's app) |
| [kiosk-integration.md](kiosk-integration.md) | The Electron exam app: launch flow, lockdown, what has been verified | C |
| [phase4-contracts.md](phase4-contracts.md) | Shared API contracts agreed in Phase 4 | all |
| [analytics-data-contract.md](analytics-data-contract.md) | Data contract for results and analytics | A / B |

Planning documents are in the repo root: `phase5_feature_plan.md` (current), `person_b_plan.md`,
`phase4_improvements_electron_kiosk_codeeditor_plan.md`, `9_day_plan_windows_linux_kiosk.md`.
`infra/linux-kiosk/README.md` describes the lab kiosk session; `infra/runner/README.md` and
`infra/runner-images/` the server sandbox's system-call filter and images.

Running everything with `docker compose up --build` is **not supported** (see CLAUDE.md →
"Other gotchas"): only the `postgres` service of `docker-compose.yml` is used in development.
