# Loading Card Engine in Claude

This folder is the project memory that was pulled out of the specs in `docs/superpowers/`, the merged pull requests, and the code on `main`. Claude Code reads it by itself. Claude.ai needs the files uploaded.

## Claude Code

Open this repository and start a session. Claude Code loads `CLAUDE.md` at the repo root, then expands the `@docs/claude/...` imports inside it. Notes under `.claude/rules/` load when a session reads or edits a file that matches that rule's `paths`.

After this memory changes, start a new session, or run `/memory`, so the new text is picked up. `/doctor prompt-audit` checks these files for stale instructions.

`CLAUDE.local.md` is gitignored. Use it for machine-specific URLs and keys. Do not put secrets in `CLAUDE.md`.

## Claude.ai Projects

`@` imports are a Claude Code feature. A Project on claude.ai does not expand them. Upload these files as project knowledge:

- `CLAUDE.md`
- `docs/claude/architecture.md`
- `docs/claude/decisions.md`
- `.claude/rules/pricing.md`
- `.claude/rules/deck-ai.md`
- `.claude/rules/scanner.md`
- `.claude/rules/web.md`
- `.claude/rules/mobile.md`
- `.claude/rules/deploy.md`
- `.claude/rules/api.md`

The longer design write-ups stay in `docs/superpowers/specs/` and `docs/superpowers/plans/`. The decision log names which of those still match the code.

## What lives where

| File | When it is in context |
| --- | --- |
| `CLAUDE.md` | Every Claude Code session |
| `docs/claude/architecture.md` | Every session, imported by `CLAUDE.md` |
| `docs/claude/decisions.md` | Every session, imported by `CLAUDE.md` |
| `.claude/rules/*.md` | When a matching source file is opened |
| `docs/claude/README.md` | Only if someone opens it. It is not imported |
