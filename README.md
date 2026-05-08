# freemarker-preview

A FreeMarker (`.ftlh` / `.ftl`) template previewer for JS developers in Spring Boot shops. Renders email templates with full FreeMarker fidelity — no JS reimplementation, no Spring Boot app required.

- **Live-reloading dev server** with iframe preview, sidebar, fixture picker, width/dark toggles, error overlay.
- **One-shot `render`** to stdout for scripts and CI.
- **PNG capture (`shot`)** for Jira evidence.
- **Real Apache FreeMarker via JBang** — `${user.name?datetime}`, `<#include>`, `<#macro>`, strict-mode missing-data — all behave exactly like prod.

## Prerequisites

| Tool | Why |
|---|---|
| **Node.js 22.6+** | TypeScript runs natively (no bundler). |
| **JRE (Java 17+)** | FreeMarker is Java. |
| **JBang** | Pulls and runs the bundled `Render.java` script with the FreeMarker dep pinned. |
| _Optional:_ **Playwright Chromium** | Only needed for the `shot` command. |

Detected on first run; missing tools produce a clear non-stack-trace error with copy-pasteable install hints.

```bash
# macOS
brew install jbang openjdk@21

# Linux
curl -Ls https://sh.jbang.dev | bash -s - app setup
apt install default-jre
```

## Install

```bash
npm install --save-dev freemarker-preview
# or globally:
npm install -g freemarker-preview
```

## Quickstart

```bash
# In your Spring Boot project root:
npx freemarker-preview init     # scaffolds .freemarkerrc.json + pre-warms JBang
npx freemarker-preview dev      # browser opens to live-reloading preview
```

Edit any `.ftlh` template or fixture JSON; the iframe swaps in within ~100ms via SSE.

## Commands

### `init`

Scaffolds `.freemarkerrc.json` in the current directory, detecting Spring Boot conventions to pre-fill `templatesRoot`, and pre-warms the JBang FreeMarker dep cache so the first real render is fast.

```bash
freemarker-preview init [--force] [--no-warmup]
```

| Flag | Behavior |
|---|---|
| `--force` | Overwrite an existing `.freemarkerrc.json`. |
| `--no-warmup` | Skip the JBang dep pre-warm step. |

Detected directories (first match wins): `src/main/resources/templates`, `src/main/resources/email-templates`, `src/main/resources/email`, `email-templates/`.

### `dev`

Starts a live-reloading HTTP server with an iframe preview, sidebar template list, fixture picker, width/dark toggles, and a Vite-style error overlay.

```bash
freemarker-preview dev [--port N] [--no-open] [--missing <mode>]
```

| Flag | Default | Behavior |
|---|---|---|
| `--port N` | `5173` | Preferred port. Walks +5 if busy (probes across IP families to avoid silent shadow conflicts with e.g. an existing Vite server). |
| `--no-open` | (browser opens) | Skip the auto browser launch. |
| `--missing <mode>` | `placeholder` | `error` / `placeholder` / `empty`. See [Missing-variable modes](#missing-variable-modes). |

URL state survives refresh and supports deep-linking:

```
http://localhost:5173/?template=welcome.ftlh&fixture=new-user&width=375&dark=1
```

### `render`

One-shot render to stdout. The default error mode is **strict** — production fidelity for output that's about to be piped into a script or email pipeline.

```bash
freemarker-preview render <template> \
  [--fixture <name>] [--data <fixture.json>] \
  [--json] [--no-inline-css] [--missing <mode>]
```

| Flag | Behavior |
|---|---|
| `--fixture <name>` | Pick a named fixture from `<template>.fixtures/`. |
| `--data <path>` | Explicit fixture path (overrides convention). |
| `--json` | On render failure, emit a structured JSON error envelope to stderr instead of the pretty colored output. |
| `--no-inline-css` | Skip the post-render CSS-inlining pass. |
| `--missing <mode>` | `error` (default) / `placeholder` / `empty`. |

Exit code is `0` on success, non-zero on failure.

```bash
freemarker-preview render welcome.ftlh --fixture new-user > out.html
freemarker-preview render welcome.ftlh --json 2> err.json
```

### `shot`

PNG screenshot of the rendered, css-inlined template via Playwright. Lazy-loads Playwright so `render` and `dev` don't pay the import cost.

```bash
freemarker-preview shot <template> \
  [--fixture <name>] [--data <fixture.json>] \
  [--out file.png] [--no-inline-css]
```

| Flag | Default | Behavior |
|---|---|---|
| `--out <file.png>` | `<template>[-<fixture>]-<timestamp>.png` | Override output path. The timestamp keeps repeated shots from overwriting each other. |
| `--fixture <name>` | (alphabetical first) | Same convention as `render`. |
| `--no-inline-css` | (off) | Skip the inline pass before capture. |

Defaults: 600px viewport width, full-page capture, PNG, `deviceScaleFactor: 2` for retina.

If Playwright or its Chromium binary isn't installed, the first invocation prints a clear message:

```
Chromium isn't installed for Playwright. Run the suggested command and retry.
  fix: npx playwright install chromium
```

A render failure refuses to write any output and exits non-zero with the same pretty stderr as `render`.

## Config: `.freemarkerrc.json`

Optional — `dev` and `render` work zero-config in simple cases (assumes `templatesRoot = cwd`). The loader walks up from `cwd` to find the first `.freemarkerrc.json`.

```json
{
  "templatesRoot": "src/main/resources/templates",
  "fixturesRoot": null,
  "locale": "en_US",
  "inlineCss": true,
  "inlineCssOptions": { "preserveMediaQueries": true },
  "previewMissingAs": "placeholder",
  "dev": { "port": 5173, "open": true }
}
```

| Key | Default | Notes |
|---|---|---|
| `templatesRoot` | `cwd` | Used as FreeMarker's `TemplateLoader` directory. Resolved relative to the config file. |
| `fixturesRoot` | `null` | Optional separate fixtures tree (watcher follows both). |
| `locale` | `"en_US"` | FreeMarker `Configuration.setLocale`. |
| `inlineCss` | `true` | Run `juice` post-render. |
| `inlineCssOptions` | `{ preserveMediaQueries: true }` | Forwarded to `juice`. |
| `previewMissingAs` | (per-command) | When unset, `render` defaults to `error`, `dev` defaults to `placeholder`. |
| `dev.port` | `5173` | Walks +5 if busy. |
| `dev.open` | `true` | Auto-open browser on `dev` start. |

## Fixture conventions

```
src/main/resources/templates/
├── welcome.ftlh                       <- template
├── welcome.fixtures/                  <- multi-fixture: pick with --fixture
│   ├── new-user.json
│   └── returning-user.json
├── confirmation.ftlh                  <- template
└── confirmation.json                  <- single-fixture sibling
```

| Pattern | Resolver picks |
|---|---|
| `<template>.fixtures/<name>.json` | `--fixture <name>` selects this. |
| `<template>.fixtures/*.json` (no `--fixture`) | Alphabetically first. |
| `<template>.json` (sibling fallback) | When no `.fixtures/` directory exists. |

ISO-8601 strings in fixture JSON auto-coerce to `java.util.Date` on the Java side, so `${createdAt?datetime}` and `${createdAt?string("yyyy-MM-dd")}` work without special setup.

## Missing-variable modes

| Mode | Behavior | When to use |
|---|---|---|
| `error` | FreeMarker strict-mode. Undefined references throw and `render` exits non-zero / dev shows the error overlay. | Default for `render`. CI / one-shot output going to email pipelines where typos must be loud. |
| `placeholder` | Renders `<span class="fmp-missing">‹recipient.naem›</span>` at the reference site. The preview never breaks. | Default for `dev`. The fastest live-edit loop. |
| `empty` | Replaces undefined references with empty strings. | Quietest mode. Useful for screenshots of partially-filled fixtures. |

Production templates always behave as if `previewMissingAs = "error"` — the soft modes are *preview-only*. The CLI emits a one-line stderr note on `render` when running in a non-error mode so the divergence from prod fidelity is obvious.

## Troubleshooting

### Port collision on `dev`

The default port is `5173`. If something else holds it, the server walks forward by up to 5 ports and prints the actual URL. The walk probes across IP families (IPv4 and IPv6), so it correctly handles cases where a long-running Vite server holds the IPv6 side of `localhost:5173`.

```bash
freemarker-preview dev --port 5183     # pick a different starting point
```

### Missing JRE / JBang

```
java not found on PATH. freemarker-preview needs a JRE (Java 17+).
  install:  brew install openjdk@21        (macOS)
            apt install default-jre        (Debian/Ubuntu)
            https://adoptium.net/          (other platforms)
```

Install per the printed hint and retry. The tool never auto-installs.

### Missing Playwright / Chromium for `shot`

```
Chromium isn't installed for Playwright. Run the suggested command and retry.
  fix: npx playwright install chromium
```

### Debug log

When a render fails, the full Java stack trace lands in a rotating debug log (10MB, last 3 archives kept). The user-facing error never includes the stack trace — those go in the log:

| Platform | Path |
|---|---|
| macOS | `~/.cache/freemarker-preview/debug.log` |
| Linux | `$XDG_CACHE_HOME/freemarker-preview/debug.log` (or `~/.cache/...`) |
| Windows | `%LOCALAPPDATA%\freemarker-preview\debug.log` |
| Test/CI override | `FREEMARKER_PREVIEW_DEBUG_LOG=/path/to/log` |

Fixture data is never written to the log (PII protection).

## Cross-platform notes

- macOS: verified end-to-end.
- Linux: targeted; should work, not verified in v1.
- Windows: targeted; the path code is platform-aware (debug log, browser auto-open) but **not verified end-to-end in v1**. File issues if you hit OS-specific bugs.

## Out of scope (v1)

- VS Code extension (the architecture supports it; building it is v2 — `core/render`, `core/daemon`, and `core/shot` are all the seams a VS Code webview would consume).
- Email-client emulation (Gmail / Outlook / Apple Mail rendering quirks).
- Multi-template-root config.
- Click-to-open-in-editor from the error overlay.
- "Available variables in scope" hint on undefined-variable errors.
- CI workflow.

## License

[TBD]
