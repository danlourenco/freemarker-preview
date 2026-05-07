# freemarker-preview — v1 Design

A FreeMarker (`.ftlh` / `.ftl`) template previewer for JS developers working in
Spring Boot environments. Renders email templates with full FreeMarker fidelity
without requiring the user to spin up a Spring Boot project.

---

## Goals

1. **Pixel-fidelity preview** of FreeMarker email templates without running the
   real Spring Boot app.
2. **Tight edit-save-see loop** with live reload.
3. **Screenshot capture** for Jira-ticket evidence.
4. **Clean architectural seam** for a future VS Code extension to consume the
   same render core.

## Non-goals (v1)

- VS Code extension (architecture supports it; building it is v2).
- Email-client emulation (Gmail/Outlook/Apple Mail rendering differences).
- Multi-template-root config.
- Click-to-open-in-editor from error overlay.
- "Available in scope" hint on undefined-variable errors.
- CI workflow.
- Windows verification (targeted, not yet tested).

---

## Render approach

**Real FreeMarker via JBang.** Full fidelity — no JS reimplementation. User
prerequisites: a JRE and JBang on PATH. CLI detects both, prints install
hints if missing, never auto-installs.

A small `Render.java` JBang script is shipped inside the npm package. Its
`//DEPS` line pins the FreeMarker version. JBang fetches the dep on first run
and caches it. We pre-warm during `init` so the first real render is fast.

`Configuration` settings inside the JBang script:
- HTML auto-escape policy enabled (matches `.ftlh` semantics).
- Output charset hardcoded UTF-8.
- Strict mode on undefined variables (no silent nulls).
- Locale from config file, default `en_US`.

---

## Architecture

Flat layout, no wrapper directory:

```
src/
  core/         # render(template, fixture) → { html, errors }
    render.ts
    fixtures.ts
    config.ts
    java/
      Render.java
  server/       # dev server: HTTP + SSE + iframe shell
    index.ts
    public/
      index.html
      shell.js
      shell.css
  shot/         # Playwright screenshot module (lazy-loaded)
    index.ts
  cli/
    index.ts
    commands/
      init.ts
      dev.ts
      render.ts
      shot.ts
```

- `core` is a pure Node module. Inputs: paths. Output: `{ html, errors, meta }`.
  Talks to JBang via child_process. That is its only side effect.
- `server`, `shot`, and `cli` import `core`. `cli` imports the others.
- The future VS Code extension will import `core` and `shot` directly. It will
  use VS Code's own webview, never the Node dev server.

---

## Node ↔ Java protocol

**Two modes**, hidden behind the same `core.render()` API:

| Surface | Mode | Why |
|---|---|---|
| `dev` | Long-running JBang daemon (stdio) | Renders in 5–20ms after warmup. |
| `render`, `shot` | Process-per-render | Cold JVM start (~700ms) is fine for one-shots. |

### Daemon protocol (line-delimited JSON over stdio)

Request:
```json
{ "id": "1", "templatePath": "/abs/welcome.ftlh", "fixturePath": "/abs/welcome.fixtures/new-user.json" }
```

Success response:
```json
{ "id": "1", "ok": true, "html": "<!DOCTYPE..." }
```

Error response:
```json
{ "id": "1", "ok": false, "error": {
  "type": "undefined-variable",
  "message": "user.naem is undefined",
  "line": 14, "column": 7,
  "templatePath": "/abs/welcome.ftlh"
}}
```

Stderr is reserved for daemon-level diagnostics (startup, crashes), never
per-render output.

### Daemon lifecycle

- Started lazily on first render in `dev`.
- Killed on dev server shutdown (SIGINT/SIGTERM handlers).
- If the daemon crashes, Node respawns it once silently, fails the second time
  loudly.
- Single-threaded (one render at a time, queued).

---

## Data model & fixtures

**Convention**: `welcome.ftlh` → `welcome.fixtures/<scenario>.json`. CLI picks
named fixture or defaults to first alphabetically. Fallback: a single
`welcome.json` next to the template if no `.fixtures/` directory exists.

**Format**: JSON.

**Date handling**: any string matching ISO 8601 is auto-converted to
`java.util.Date` on the Java side. Other strings pass through.

**Strict mode**: missing data raises errors (we want to catch typos, not mask
them).

**Optional `fixturesRoot`** in config for parallel fixture trees outside
`templatesRoot`.

---

## Config file

`.freemarkerrc.json` at project root. Optional — `dev` and `render` work
zero-config in simple cases.

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

- Discovered by walking up from cwd.
- Multi-root deferred to v2: `templatesRoot` is `string` for now, will accept
  `string | string[]` later without breaking existing configs.

---

## CLI surface

```
freemarker-preview init                           # scaffold .freemarkerrc.json + pre-warm JBang
freemarker-preview dev [--port N] [--no-open]     # dev server
freemarker-preview render <template> [--fixture name] [--out file.html]
freemarker-preview shot <template> [--fixture name] [--width 600,375]
                                    [--dark] [--annotate] [--out file.png]
                                    [--format png|jpeg]
```

- `render` defaults to stdout, applies CSS inlining matching dev.
- `shot` defaults: 600px width, full page, PNG. `--width 600,375` produces
  `out.png` and `out@375.png`. `--annotate` draws a thin footer band with
  template/fixture/width/timestamp for Jira evidence.
- All commands return non-zero exit on render failure.

---

## Dev server UX

- One HTML shell page, vanilla JS (~200 lines), no framework, no build.
- Layout: sidebar with template list; header with fixture picker, width toggle
  (Mobile 375 / Desktop 600 / Full / custom), dark mode toggle, status dot;
  main area with an `<iframe srcdoc="...">` containing the rendered email.
- The iframe boundary is critical: prevents shell CSS from leaking into the
  preview.
- URL holds all state: `?template=welcome&fixture=new-user&width=375&dark=1`.
  Bookmarkable, deep-linkable.
- Auto-opens browser on `dev` first start (suppress with `--no-open`).
- Port collision: increment from configured port up to +5, fail with a clear
  message. Never change port silently.

### Watch behavior (chokidar)

- Watches `templatesRoot` (`*.ftlh`, `*.ftl`) and fixture dirs (`*.json`),
  recursive.
- 50ms debounce.
- Currently-displayed template/fixture change → re-render + SSE reload event.
- Other templates change → still re-render (cheap, prevents stale-state bugs).
- Other fixtures change → update sidebar list, no re-render.
- Config file change → print "config changed, restart required". No auto-restart.

### Reload mechanism

- One SSE endpoint at `/events`.
- On change, server pushes `{ "type": "reload" }`.
- Client re-fetches `/render?template=...&fixture=...` and replaces iframe
  `srcdoc`. No full page reload — fixture picker / scroll / dark mode preserved.
- In-flight render coalescing: if a new save arrives mid-render, drop the
  in-flight result and re-render with latest state.

---

## Error UX

### Error type taxonomy

The Java wrapper maps FreeMarker exceptions into clean types:

| FreeMarker exception | `type` | Meaning |
|---|---|---|
| `ParseException` | `template-parse` | Template syntax error |
| `InvalidReferenceException` | `undefined-variable` | Reference not in data model |
| `TemplateNotFoundException` | `template-not-found` | Entry template or include missing |
| `TemplateException` (other) | `template-runtime` | Runtime error |
| IOException reading fixture | `fixture-read` | Fixture missing / unreadable |
| JSON parse fail | `fixture-parse` | Fixture isn't valid JSON |
| Anything else | `internal` | Bug in our wrapper |

### Per-surface rendering

- **Dev server**: Vite-style full-iframe overlay. Shows `file:line:col`,
  message, and a 3-line snippet of the template with the offending line
  highlighted. Last successful render stays loaded *underneath* — dismissing
  the overlay reveals the previous-working state.
- **`render` command**: pretty errors to stderr by default (color, snippet,
  file:line:col), exit code 1. `--json` flag emits the structured error for
  CI/scripting.
- **`shot` command**: refuses to write the PNG. Same pretty stderr. Exit code 1.

Java stack traces never reach the user's face but are written to a debug log
(see Logging).

---

## CSS inlining

Post-render, Node-side, via `juice`. Default `inlineCss: true` in config
(your templates have `<style>` blocks in `<head>`, so prod almost certainly
inlines and we want preview parity). `--no-inline-css` flag overrides.

---

## Distribution & install

- npm package name: `freemarker-preview`.
- Single bin: `freemarker-preview`.
- Prerequisites: JRE, JBang. Detected on first run; install hints printed
  on miss; never auto-installed.
- TypeScript source. Modern Node runs TS natively (`--experimental-strip-types`)
  or via `tsx`. No bundler.
- JBang script ships inside the package (`dist/java/Render.java`).
- Cross-platform target from day 1, but Windows verification deferred.

---

## Logging

- Daemon debug log: `~/.cache/freemarker-preview/debug.log`
  (`%LOCALAPPDATA%\freemarker-preview\debug.log` on Windows).
- Rotates at 10MB, keeps last 3.
- Logs daemon lifecycle, render times, full Java stacktraces.
- **Never** logs fixture data (could contain PII).

---

## Testing

- **Tool**: Vitest.
- **Scope**: unit tests on `core/render` and `core/fixtures`. ~5 sample
  template+fixture pairs covering happy path, undefined-variable, parse error,
  missing fixture, date handling, includes (one test even though current
  templates don't use them — guards future use). Snapshot tests for happy-path
  HTML output.
- **Skip in v1**: dev server / SSE / Playwright tests. High effort, brittle,
  low return.
- **CI**: not in v1. Add a minimal GitHub Actions workflow when publishing or
  handing off.

---

## v1 exit criteria

v1 is done when you can:

1. `freemarker-preview init` in your Spring Boot project's email template
   directory.
2. `freemarker-preview dev` and edit a `.ftlh` template with live preview,
   error overlay, fixture switcher, width toggle, dark mode toggle.
3. `freemarker-preview render foo.ftlh > foo.html` for one-shot output.
4. `freemarker-preview shot foo.ftlh --width 600,375 --out foo.png` and attach
   to a Jira ticket.
