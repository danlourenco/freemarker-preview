# Plan: freemarker-preview v1

> Source PRD: [DESIGN.md](../DESIGN.md)

## Architectural decisions

Durable decisions that apply across all phases:

- **Render approach**: Real Apache FreeMarker via JBang. JS-side never reimplements FreeMarker. JBang script (`Render.java`) ships inside the npm package. User prerequisites: JRE + JBang on PATH.
- **Module layout** (flat, no wrapper directory):
  ```
  src/
    core/         # render(template, fixture) → { html, errors }
      java/Render.java
    server/       # dev server: HTTP + SSE + iframe shell
      public/
    shot/         # Playwright screenshot module (lazy-loaded)
    cli/
      commands/
  ```
- **Render API**: `core.render(templatePath, fixturePath, opts) → Promise<{ html, errors, meta }>`. Pure function, no CLI/server assumptions. VS Code extension consumes this directly later.
- **Java protocol**: line-delimited JSON over stdio. Two modes — long-running daemon for `dev`, process-per-render for `render`/`shot`. Same protocol shape both modes.
- **Daemon request/response shape**:
  - Request: `{ id, templatePath, fixturePath }`
  - Success: `{ id, ok: true, html }`
  - Error: `{ id, ok: false, error: { type, message, line, column, templatePath } }`
  - Stderr reserved for daemon-level diagnostics, never per-render output.
- **Error type taxonomy**: `template-parse`, `undefined-variable`, `template-not-found`, `template-runtime`, `fixture-read`, `fixture-parse`, `internal`.
- **CLI surface**:
  ```
  freemarker-preview init
  freemarker-preview dev [--port N] [--no-open]
  freemarker-preview render <template> [--fixture name] [--out file.html] [--json]
  freemarker-preview shot <template> [--fixture name] [--width 600,375]
                                     [--dark] [--annotate] [--out file.png]
                                     [--format png|jpeg]
  ```
- **Config file**: `.freemarkerrc.json` at project root, optional, discovered by walking up from cwd.
  ```json
  {
    "templatesRoot": "src/main/resources/templates",
    "fixturesRoot": null,
    "locale": "en_US",
    "inlineCss": true,
    "inlineCssOptions": { "preserveMediaQueries": true },
    "dev": { "port": 5173, "open": true },
    "shot": { "widths": [600], "fullPage": true }
  }
  ```
- **Fixture conventions**: `welcome.ftlh` → `welcome.fixtures/<name>.json` (multi-fixture), or sibling `welcome.json` (single fixture fallback). Strict missing-data. ISO-8601 strings auto-converted to `java.util.Date`.
- **FreeMarker `Configuration` settings**: HTML auto-escape policy enabled, output charset UTF-8 hardcoded, locale from config (default `en_US`), strict mode on undefined variables.
- **Dev server URL state**: `?template=...&fixture=...&width=...&dark=1`. All UI state in query string — bookmarkable, deep-linkable, refresh-safe.
- **Reload mechanism**: SSE `/events` endpoint pushes `{ type: "reload" }`. Client re-fetches `/render?...` and swaps iframe `srcdoc`. No full page reload.
- **Watch behavior**: chokidar over `templatesRoot` (`*.ftlh`, `*.ftl`) and fixture dirs (`*.json`), 50ms debounce, in-flight render coalescing.
- **CSS inlining**: `juice` post-render, default on, `--no-inline-css` override.
- **Language + tooling**: TypeScript (modern Node native TS or `tsx`), Vitest for tests, no bundler.
- **Logging**: daemon debug log at `~/.cache/freemarker-preview/debug.log` (or platform equivalent), 10MB rotation, keep last 3. Never logs fixture data.
- **Cross-platform**: target macOS/Linux/Windows from day 1, verify only macOS in v1.

---

## Phase 1: Tracer 1 — minimal `render` command

**User stories**: One-shot render of a template against an explicit data file, output to stdout.

### What to build

The thinnest possible end-to-end path. CLI accepts `freemarker-preview render <template> --data <data.json>`, calls into `core.render()`, which spawns the JBang script (`Render.java`) once, passes paths as args, reads HTML from stdout, and prints it to the user's stdout. Process-per-render only — no daemon yet. Includes TypeScript scaffolding (`package.json`, `tsconfig.json`, bin entry), Vitest configured, and a single smoke test that renders a fixture template + fixture data through the entire pipeline. No fixture conventions, no config file, no CSS inlining, no error mapping (Java errors surface as raw stderr + non-zero exit for now).

### Acceptance criteria

- [ ] `npm install` installs deps; `npx freemarker-preview --help` lists the `render` command.
- [ ] Running `freemarker-preview render fixtures/hello.ftlh --data fixtures/hello.json` outputs the expected rendered HTML on stdout.
- [ ] Vitest smoke test passes: imports `core.render`, renders the same fixtures, asserts HTML output.
- [ ] Exit code is 0 on success; non-zero on render failure.
- [ ] `Render.java` lives at `src/core/java/Render.java` and is invoked via `jbang`.
- [ ] FreeMarker `Configuration` is set up with UTF-8 output, HTML auto-escape policy on, and `en_US` locale.

---

## Phase 2: Fixtures, config file, and the error model

**User stories**: Render commands honor fixture conventions and project config; failures produce readable, actionable output instead of Java stack traces.

### What to build

Two clusters of work:

1. **Conventions**: `core.render()` resolves fixtures by looking for `<template>.fixtures/<name>.json` (multi-fixture, `--fixture` flag picks one, defaults to alphabetically-first) and falls back to a sibling `<template>.json` (single-fixture). Config file (`.freemarkerrc.json`) is discovered by walking up from cwd; `templatesRoot`, `locale`, and `fixturesRoot` are honored. ISO-8601 date strings in fixture data are auto-converted to `java.util.Date` on the Java side before rendering.

2. **Error model**: `Render.java` catches FreeMarker exceptions and maps them to the seven error types in the taxonomy, emitting a structured JSON error response. Node side renders pretty errors to stderr by default — message, `file:line:col`, 3-line snippet of the template with the offending line highlighted. `--json` flag emits the raw structured error for scripting. Full Java stack traces written to the rotating debug log, never shown in stderr.

### Acceptance criteria

- [ ] `freemarker-preview render welcome.ftlh` (no `--fixture`) picks the first fixture from `welcome.fixtures/` alphabetically.
- [ ] `--fixture new-user` selects `welcome.fixtures/new-user.json`.
- [ ] If no `.fixtures/` directory exists, sibling `welcome.json` is used.
- [ ] `.freemarkerrc.json` is discovered when running from a subdirectory.
- [ ] `templatesRoot` from config is passed to FreeMarker's `TemplateLoader`.
- [ ] An ISO-8601 string in fixture JSON is renderable with `?datetime` in the template.
- [ ] A template with `${recipient.naem}` (typo) produces a colored stderr message with file:line:col and a snippet — no Java stack trace visible.
- [ ] Same error with `--json` produces structured JSON matching the daemon protocol's error shape.
- [ ] Each error type in the taxonomy has a Vitest test asserting correct mapping.
- [ ] Debug log is created and contains the full Java stack trace for the same error.

---

## Phase 3: Tracer 2 — dev server bare bones

**User stories**: Live preview with edit-save-reload loop, manual URL only.

### What to build

The second end-to-end tracer: prove the daemon protocol, the watch loop, and SSE reload all work. `freemarker-preview dev` starts an HTTP server on the configured port (collision-walked up to +5 with a clear message, never silent), spawns a long-running JBang daemon, watches `templatesRoot` and fixture directories with chokidar (50ms debounce, in-flight coalescing), and pushes `{ type: "reload" }` events on SSE `/events`.

The dev shell is a single HTML page with an `<iframe>` that loads `/render?template=...&fixture=...`. On SSE reload, client re-fetches and swaps `srcdoc`. Browser auto-opens on first start (suppressible with `--no-open`).

Explicitly out of scope for this phase: sidebar template list, fixture picker UI, width/dark toggles, error overlay, status indicator. URL state is set manually by the user; refreshing the page works because state is in the URL.

Daemon lifecycle: started lazily on first render, killed on SIGINT/SIGTERM, respawned once silently on crash, fails loudly on second crash. Single-threaded (queued requests).

### Acceptance criteria

- [ ] `freemarker-preview dev` starts a server, opens the browser to `http://localhost:5173/?template=<first>&fixture=<first>`.
- [ ] Editing the displayed template and saving triggers a reload within ~100ms; iframe content updates.
- [ ] Editing the displayed fixture also triggers a reload.
- [ ] If port 5173 is busy, server tries 5174..5180 and prints the actual URL prominently.
- [ ] SIGINT cleanly shuts down the JBang daemon (no orphan Java process).
- [ ] If JBang daemon crashes (e.g., killed externally), server respawns it once and the next render succeeds.
- [ ] Manually crashing the daemon twice in a row produces a clear error and the server exits non-zero.
- [ ] Daemon protocol over stdio handles 100 sequential renders without leaking memory or hanging (smoke test, not perf benchmark).
- [ ] `--no-open` suppresses browser auto-launch.

---

## Phase 4: Full dev UX

**User stories**: Pleasant, complete dev workflow — discover templates, switch fixtures, test responsive widths and dark mode, see clear errors.

### What to build

The dev shell gains its full chrome:

- **Sidebar**: scrollable list of all `*.ftlh`/`*.ftl` files under `templatesRoot`. Click to switch.
- **Fixture picker**: dropdown or pill row showing fixtures for the current template. Defaults to first alphabetically.
- **Width toggle**: preset buttons `Mobile (375)`, `Desktop (600)`, `Full`, plus a custom-width input. Wraps the iframe at the chosen width.
- **Dark mode toggle**: flips an attribute on the iframe wrapper that the iframe interprets as `prefers-color-scheme: dark`.
- **Status indicator**: dot in the header — idle / rendering / error.
- **URL state sync**: every control writes to query string (`?template=...&fixture=...&width=...&dark=1`). Refresh, deep-link, and bookmark all work.
- **Error overlay**: Vite-style red overlay covering the iframe on render failure. Shows `file:line:col`, message, and a 3-line template snippet with the offending line highlighted. Last successful render stays loaded *underneath* — dismissing the overlay reveals the previous-working state. Replaced (not stacked) by subsequent errors.

Vanilla JS, no framework, no build step. ~200 lines of JS, ~100 lines of CSS, system fonts, neutral grays with light/dark CSS custom properties.

### Acceptance criteria

- [ ] Sidebar lists all templates under `templatesRoot`; clicking a template loads it in the iframe.
- [ ] Fixture picker shows scenarios for the current template; switching re-renders without page reload.
- [ ] Width buttons resize the iframe wrapper to 375px, 600px, or 100% width respectively.
- [ ] Custom-width input accepts a number and applies it.
- [ ] Dark mode toggle propagates `prefers-color-scheme: dark` to the iframe.
- [ ] All state survives a full page refresh because it's in the URL.
- [ ] Introducing a typo in a template surfaces the error overlay; fixing the typo and saving makes the overlay disappear and the corrected render appears.
- [ ] The previously-successful render is visible behind the overlay when one is shown (dismiss button reveals it).
- [ ] Status dot transitions correctly during a render burst (idle → rendering → idle / error).
- [ ] No external CSS/JS dependencies — `server/public/` is fully self-contained.

---

## Phase 5: CSS inlining

**User stories**: Preview matches what real recipients see in clients that strip `<style>` blocks.

### What to build

`juice` integration in `core`, applied post-render to the HTML coming back from the daemon (or one-shot Java process). Honored by `render`, `shot`, and the dev server uniformly. Default `inlineCss: true` (config). `--no-inline-css` flag on `render` overrides per-invocation. Config option for `juice` options (`preserveMediaQueries`, etc.).

### Acceptance criteria

- [ ] A template with a `<style>` block in `<head>` and a class on a child element produces output where the child has the resolved styles applied as `style="..."`.
- [ ] Setting `"inlineCss": false` in config disables the behavior; output retains the original `<style>` block.
- [ ] `--no-inline-css` on `render` overrides config-level `true`.
- [ ] `@media` queries are preserved by default (not collapsed away by juice).
- [ ] Vitest tests assert before/after HTML for both a simple style block and one with a media query.
- [ ] Dev server output reflects inlining (verifiable by viewing source on the iframe).

---

## Phase 6: Tracer 3 — `shot` command

**User stories**: Generate screenshot evidence for Jira tickets.

### What to build

`freemarker-preview shot <template> [opts]` lazily loads `playwright`, launches a headless Chromium, navigates to a data URL or temp file containing the rendered HTML, and writes a PNG (or JPEG). First-run Chromium install (`npx playwright install chromium`) is detected and triggered with a clear message.

Flags:
- `--width 600,375` — comma-separated. Single width writes `out.png`; multiple widths write `out.png` (first) and `out@<width>.png` for the rest.
- `--out file.png` — output path (default derived from template + fixture name).
- `--dark` — sets `prefers-color-scheme: dark` on the page.
- `--annotate` — draws a thin footer band with template/fixture/width/timestamp/generated-by-tool tag.
- `--format png|jpeg` — defaults to PNG.
- `--viewport-only` — captures only the visible viewport (default is full page).

Render failure refuses to produce output, emits the same pretty stderr as `render`, and exits non-zero.

### Acceptance criteria

- [ ] `freemarker-preview shot welcome.ftlh --fixture new-user` writes a PNG to a sensibly-named default path.
- [ ] `--width 600,375 --out evidence.png` produces both `evidence.png` (600px) and `evidence@375.png`.
- [ ] `--dark` applied to a template with `@media (prefers-color-scheme: dark)` rules produces a visually-darker screenshot than without.
- [ ] `--annotate` adds a footer band containing template name, fixture name, width, ISO-8601 timestamp, and tool tag.
- [ ] `--format jpeg --out shot.jpg` produces a valid JPEG.
- [ ] Full-page (default) captures the entire scrollable height of a tall email template.
- [ ] `--viewport-only` captures only the initial viewport.
- [ ] If `playwright` is not installed, first invocation prints a clear message and runs the install command (or instructs the user to).
- [ ] Render failure produces no output file and exits non-zero with pretty stderr.

---

## Phase 7: Bootstrap polish

**User stories**: First-run UX is fast and clear; new users can get to a working dev server in under 2 minutes.

### What to build

- **`init` command**: scaffolds `.freemarkerrc.json` in the cwd. Detects Spring Boot heuristics — looks for `pom.xml` / `build.gradle` and `src/main/resources/templates/` (or `email-templates/`) — and pre-fills `templatesRoot`. Pre-warms JBang by running a tiny no-op render so the dep cache is hot.
- **JRE / JBang detection**: on first invocation of any command, check `which java` and `which jbang`. On miss, print clear install instructions (do not auto-run shell scripts from URLs) and exit non-zero.
- **README**: prerequisites, install instructions, command reference, config schema, fixture convention examples, troubleshooting (port collision, missing JBang, debug log location).
- **Cross-platform paths**: audit code for hardcoded `/` separators, replace with `path.join`. Verify `open` package handles browser auto-open on macOS/Linux/Windows.

### Acceptance criteria

- [ ] `freemarker-preview init` in a Spring Boot project root pre-fills `templatesRoot` to the detected directory.
- [ ] In a non-Spring-Boot directory, `init` writes a config with `templatesRoot` set to a sensible default (current dir or empty placeholder with a comment).
- [ ] After `init`, JBang has fetched the FreeMarker dep — first `render` is fast.
- [ ] Running any command without a JRE produces a clear, non-Stack-Trace error with install instructions.
- [ ] Running any command without JBang produces a clear, non-Stack-Trace error with install instructions.
- [ ] README covers all four commands with copy-pasteable examples.
- [ ] No hardcoded `/` separators in path handling (audit `git grep`).
- [ ] Manual test: tool works end-to-end (init → dev → render → shot) on macOS.
