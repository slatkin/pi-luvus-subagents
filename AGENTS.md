# Repository Guidelines

## Project Structure & Module Organization

This package is a Pi extension for running asynchronous subagents in Luvus. Runtime TypeScript lives in `pi-extension/subagents/`: `index.ts` registers tools and commands, `luvus.ts` handles panes and tabs, and the other modules manage sessions, status, activity, and completion. Agent definitions live in `agents/*.md`; shell hooks are under `pi-extension/subagents/plugin/hooks/`. Unit tests are in `test/*.test.ts` and `test/test.ts`; Luvus-backed tests and their fixture agents are in `test/integration/`. Behavior specifications and active proposals live in `openspec/`. Read `LUVUS-FORK.md` for fork-specific decisions.

## Build, Test, and Development Commands

- `npm install` installs the package dependencies.
- `npm test` runs the unit suite with Node's built-in test runner.
- `npm run test:integration` runs integration tests serially. Run inside a Luvus pane; tests skip when the required Luvus environment is absent.
- `npx tsc --noEmit` checks TypeScript without producing build files. The package loads `.ts` files directly and has no build script.
- `pi install /path/to/pi-luvus-subagents` installs the local extension for manual testing in Pi.

## Coding Style & Naming Conventions

Follow the surrounding TypeScript style: two-space indentation, double-quoted strings, semicolons, and `.ts` extensions in relative imports. Use `camelCase` for functions and variables, `PascalCase` for types, and descriptive kebab-case module filenames such as `subagent-done.ts`. Keep Luvus process and surface operations in `luvus.ts`. There is no configured formatter or linter; review diffs for consistency and run the type check.

## Testing Guidelines

Use `node:test` and `node:assert/strict`. Name focused tests `*.test.ts`; add unit cases for pure behavior and integration cases for real Pi/Luvus interactions. Integration tests use `test/integration/harness.ts`, require the `LUVUS_*` pane variables, and should clean up created panes and temporary files. No coverage threshold is configured. Run `npm test` and the type check before submitting changes; run integration tests for changes to spawning, messaging, or surface handling.

## Commit & Pull Request Guidelines

Recent commits use Conventional Commit-style subjects, for example `feat: subagent surface placement option`, `fix(subagents): surface provider errors`, and `docs: align README`. Use an imperative, scoped summary where helpful; mark breaking changes with `!`. In pull requests, explain the behavior change, list checks run, link the related issue or OpenSpec change when applicable, and include screenshots for visible widget or pane changes. Keep local `config.json` overrides out of commits; start from `config.json.example`.
