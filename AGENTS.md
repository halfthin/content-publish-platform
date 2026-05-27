# Repository Guidelines

## Behavioral Guidelines

### 1. Think Before Coding
State assumptions explicitly. If uncertain, ask. When multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so. If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative. No features beyond what was asked. No abstractions for single-use code. If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style. If your changes create orphans (unused imports/variables/functions), clean them up. Don't touch pre-existing dead code.

The test: Every changed line should trace directly to the requirement.

### 4. Goal-Driven Execution
Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"

For multi-step tasks, state a brief plan before implementing:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

## Project Structure & Module Organization
`apps/server` is the Bun/Elysia API. Keep production code in `apps/server/src`, Prisma schema changes in `apps/server/prisma`, and backend tests close to the code as `*.test.ts`. `apps/web` is the Vue 3/Vite frontend; organize UI code under `src/views`, `components`, `api`, `stores`, `utils`, and `websocket`. `content/{inbox,approved,published}` stores content files used by the publishing workflow. Use `tests/` for broader functional, performance, and regression scripts; keep setup and reports there. Operational docs live in `docs/`, and local container files live in `docker/`.

## Build, Test, and Development Commands
- `bun install` — install workspace dependencies.
- `bun run dev` — start server and web together.
- `bun run dev:server:watch` / `bun run dev:web` — run one app at a time.
- `bun run build` — build the Vite frontend.
- `bun run db:generate`, `bun run db:migrate`, `bun run db:push` — Prisma tasks from `apps/server`.
- `cd apps/server && bun test` — run the default backend test suite.
- `cd apps/server && RUN_INTEGRATION_TESTS=true bun test` — enable infra-backed integration tests.
- `bash run-tests.sh` or `bash tests/test-runner.sh` — run scripted regression and scenario checks.
- `bun run docker:up` / `bun run docker:down` — manage local Docker services.

## Coding Style & Naming Conventions
Both apps use Biome. Run `bun run check` in the package you touched before opening a PR. Formatting is 2-space indentation, single quotes, trailing commas (ES5), and ~100-character lines. Prefer strict TypeScript, ESM imports, and avoid `any` unless necessary. Use PascalCase for Vue views/components (`PublishStatus.vue`), camelCase for symbols, and kebab-case or dotted kebab-case for backend files such as `publish-queue.ts` and `cookie-refresh.service.ts`.

## Testing Guidelines
Add Bun tests next to changed backend code with the `*.test.ts` suffix. Existing examples live in `apps/server/src/routes`, `queues`, and `utils`. Use `tests/test-*.ts` for cross-module workflows. No numeric coverage gate is configured, so keep relevant suites green and add regression coverage for every bug fix.

## Commit & Pull Request Guidelines
Follow the Conventional Commit pattern used in history: `feat:`, `fix:`, `chore:`, `refactor:`. Keep subjects short and imperative. PRs should summarize scope, note schema or environment changes, list commands run, and include screenshots for frontend changes. Link related issues/tasks and highlight impacts to Docker, Redis, Postgres, Playwright, or cookie handling.

## Security & Configuration Tips
Never commit `.env`, real cookies, or account data. Start from `.env.example`, replace development encryption secrets outside local use, and document any new required variables.
