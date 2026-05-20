# freemarker-preview

## Agent skills

### Issue tracker

Issues live as GitHub issues, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commits & releases

Every commit follows the [Conventional Commits](https://www.conventionalcommits.org/) spec:

    <type>(<scope>)?!: <description>

- **Types:** `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `build`, `style`
- **Breaking changes:** add `!` after the type/scope (e.g. `refactor(core)!: drop fixturePath`)
- **Scope** is optional but used when a change is bounded to a subsystem (`core`, `cli`, `vscode`, `server`, `java`, `docs`, `tests`)

To cut a release: `npm run release` — bumps `package.json` version (driven by the highest-impact commit type since the last tag), regenerates `CHANGELOG.md`, and tags.
