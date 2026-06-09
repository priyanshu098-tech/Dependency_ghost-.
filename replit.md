# Dependency Ghost

A web app that detects silent behavior changes in npm/Python dependencies using a 3-agent AI pipeline powered by Gemini and GitHub Actions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/dependency-ghost run dev` — run the frontend (port 18258)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `GEMINI_API_KEY` — Gemini API key (free tier from aistudio.google.com)
- Required env: `GITHUB_TOKEN` — GitHub PAT with `repo` + `workflow` scopes

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (dark terminal aesthetic, Space Mono font, toxic green palette)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Gemini 2.5 Flash (`@google/genai`)
- GitHub: REST API v3 for triggering Actions workflows and creating PRs
- Validation: Zod, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/scans.ts` — DB schema: scans, scan_logs, mismatches tables
- `artifacts/api-server/src/lib/agents.ts` — 3-agent pipeline (THINK, EXECUTE, SELF-CORRECT)
- `artifacts/api-server/src/lib/gemini.ts` — Gemini client wrapper
- `artifacts/api-server/src/lib/github.ts` — GitHub API helpers
- `artifacts/api-server/src/routes/scans.ts` — scan CRUD + pipeline trigger
- `artifacts/api-server/src/routes/sandbox.ts` — GitHub sandbox repo setup
- `artifacts/dependency-ghost/src/` — React frontend

## Architecture decisions

- **Agent 1 (THINK):** Fetches `package.json` / `requirements.txt` from the raw GitHub URL, sends to Gemini to produce a JSON contract map of every dependency's functions + signatures.
- **Agent 2 (EXECUTE):** Generates a test script, commits it + a GitHub Actions workflow to a user-provided sandbox repo, triggers via `workflow_dispatch`, polls for completion. Falls back to Gemini simulation if no sandbox repo or workflow times out.
- **Agent 3 (SELF-CORRECT):** For each mismatch, Gemini generates a compatibility wrapper, commits to a new branch on the target repo, and opens a PR.
- **Fallback strategy:** If no sandbox repo is configured, Agent 2 uses Gemini to simulate behavioral analysis — the app still works without a sandbox, just without real execution.
- **Route order matters:** `/scans/stats` must be registered before `/scans/:id` in Express to avoid the literal "stats" being captured as an ID parameter.

## Product

Users paste a GitHub repo URL → the 3-agent pipeline runs → mismatches are shown with severity badges → auto-generated patches are committed and a PR is opened. The dashboard shows live stats and recent scans. A sandbox repo can be created with one click to enable GitHub Actions-based real execution.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `@import url(...)` in index.css must be the very first line — before `@import "tailwindcss"`. PostCSS fails silently otherwise.
- After adding new tables to `lib/db/src/schema/`, run `pnpm run typecheck:libs` before typechecking artifact packages — otherwise `@workspace/db` exports appear missing.
- `zod` must be in `api-server`'s own `dependencies` (not just a transitive dep) for the import to resolve.
- `@google/genai` build scripts are ignored by pnpm (sandboxed) — the package still works correctly at runtime.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
