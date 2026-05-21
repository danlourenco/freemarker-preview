# freemarker-preview

A FreeMarker (`.ftlh` / `.ftl`) template previewer for JS developers in Spring Boot shops. Renders email templates with full FreeMarker fidelity — no JS reimplementation, no Spring Boot app required.

- **Live-reloading dev server** with iframe preview, sidebar, width toggles, error overlay.
- **One-shot `render`** to stdout for scripts and CI.
- **PNG capture (`shot`)** for Jira evidence.
- **Real Apache FreeMarker via JBang** — `${user.name?datetime}`, `<#include>`, `<#macro>` — all behave exactly like prod.

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

## VS Code extension (sideload)

Same renderer, packaged as a sideloadable VS Code extension. **Not** on the Marketplace — distributed as a `.vsix` from GitHub Releases.

```bash
# 1. Download freemarker-preview-<version>.vsix from
#    https://github.com/danlourenco/freemarker-preview/releases
# 2. Install:
code --install-extension freemarker-preview-<version>.vsix
# 3. Reload VS Code (Cmd/Ctrl+Shift+P → "Developer: Reload Window")
```

What you get:

- **Right-click** any `.ftlh`/`.ftl` file in the editor or Explorer → **FreeMarker: Preview Template**. Opens a webview beside the editor with the same phone chrome + width toggles as `freemarker-preview dev`.
- **Save** the source template → re-render within ~150ms.
- **Explorer sidebar**: a "FreeMarker Templates" tree view lists every `.ftlh`/`.ftl` under the registered `templatesRoot`. Click to preview.
- **Status bar**: rendering / idle / error indicator on the right. Click to refresh.
- **Diagnostics**: FreeMarker errors surface as red squiggles on the source file with hover messages.
- **Output channel**: "FreeMarker" in the Output panel — surfaces JBang stderr and activation diagnostics if something goes wrong.

### Troubleshooting

- **Right-click menu doesn't show "Preview Template"**: the file extension must be `.ftlh` or `.ftl`. The menu is gated on extension, not on language ID.
- **"JBang daemon crashed twice in a row"**: open the **FreeMarker** Output channel — the JBang stderr there will show the real cause (usually missing JBang or a Render.java compile error). Install JBang per the [Prerequisites](#prerequisites) section.
- **TreeView shows "Run `freemarker-preview init` to register this workspace"**: no entry exists for this folder in `~/.config/freemarker-preview/projects.json`. Run `freemarker-preview init` in the project root with the CLI to register it.
- **Wrong `templatesRoot`**: edit `~/.config/freemarker-preview/projects.json` directly — change the `templatesRoot` for your project entry. The extension re-reads the registry per preview.
- **Extension didn't pick up a code change**: in the dev host, use Cmd/Ctrl+R to reload the window. For new contributions in `package.json`, fully relaunch the dev host (close the `[Extension Development Host]` window and re-launch).

### Building the .vsix yourself

```bash
git clone https://github.com/danlourenco/freemarker-preview.git
cd freemarker-preview
npm install
npm run package:vscode      # → dist/freemarker-preview-<version>.vsix
code --install-extension dist/freemarker-preview-*.vsix
```

## Quickstart

```bash
# In your Spring Boot project root:
npx freemarker-preview init     # registers this project in your user-level config + pre-warms JBang
npx freemarker-preview dev      # browser opens to live-reloading preview
```

Edit any `.ftlh` template; the iframe swaps in within ~100ms via SSE.

## Commands

### `init`

Registers the current project in your **user-level project registry** (see [Config](#config)), then pre-warms the JBang FreeMarker dep cache so the first real render is fast. No file is written into the project tree — your config travels with you, not the repo.

```bash
freemarker-preview init [--force] [--no-warmup]
```

Flow:

1. Detect the project root by walking up for `pom.xml`, `build.gradle`, or `build.gradle.kts`.
2. Probe standard templates locations (`src/main/resources/templates`, `…/email-templates`, `…/email`, `email-templates/`). If found, prompt to use the detected directory.
3. Otherwise (or on rejection), launch an interactive directory picker rooted at the project root. Arrow keys navigate; `[ select this directory ]` confirms.
4. Save the entry to the user registry, keyed by absolute project root.
5. Pre-warm JBang (skippable with `--no-warmup`).

| Flag | Behavior |
|---|---|
| `--force` | Overwrite an existing registry entry without prompting. |
| `--no-warmup` | Skip the JBang dep pre-warm step. |

Run `init` from anywhere inside your project — including a templates subdirectory. The detected project root is always the directory containing the build file.

### `dev`

Starts a live-reloading HTTP server with an iframe preview, sidebar template list, width toggles, and a Vite-style error overlay.

```bash
freemarker-preview dev [--port N] [--no-open]
```

| Flag | Default | Behavior |
|---|---|---|
| `--port N` | `5173` | Preferred port. Walks +5 if busy (probes across IP families to avoid silent shadow conflicts with e.g. an existing Vite server). |
| `--no-open` | (browser opens) | Skip the auto browser launch. |

URL state survives refresh and supports deep-linking:

```
http://localhost:5173/?template=welcome.ftlh&width=375
```

### `render`

One-shot render to stdout. The default error mode is **strict** — production fidelity for output that's about to be piped into a script or email pipeline.

```bash
freemarker-preview render <template> \
  [--json] [--no-inline-css]
```

| Flag | Behavior |
|---|---|
| `--json` | On render failure, emit a structured JSON error envelope to stderr instead of the pretty colored output. |
| `--no-inline-css` | Skip the post-render CSS-inlining pass. |

Exit code is `0` on success, non-zero on failure.

```bash
freemarker-preview render welcome.ftlh > out.html
freemarker-preview render welcome.ftlh --json 2> err.json
```

### `shot`

PNG screenshot of the rendered, css-inlined template via Playwright. Lazy-loads Playwright so `render` and `dev` don't pay the import cost.

```bash
freemarker-preview shot <template> \
  [--out file.png] [--no-inline-css]
```

| Flag | Default | Behavior |
|---|---|---|
| `--out <file.png>` | `<template>-<timestamp>.png` | Override output path. The timestamp keeps repeated shots from overwriting each other. |
| `--no-inline-css` | (off) | Skip the inline pass before capture. |

Defaults: 600px viewport width, full-page capture, PNG, `deviceScaleFactor: 2` for retina.

If Playwright or its Chromium binary isn't installed, the first invocation prints a clear message:

```
Chromium isn't installed for Playwright. Run the suggested command and retry.
  fix: npx playwright install chromium
```

A render failure refuses to write any output and exits non-zero with the same pretty stderr as `render`.

## Config

There are two ways to configure `freemarker-preview`. The primary one is the **user-level project registry** written by `init`. The legacy `.freemarkerrc.json` keeps working as a fallback for teams that prefer committed config.

### Resolution order

Each command runs `loadConfig(cwd)`, which:

1. Walks up from `cwd`; if any ancestor is a key in the user registry, uses that entry. Longest-prefix match wins (so a registered nested project beats its parent).
2. Else walks up looking for `.freemarkerrc.json` (legacy behavior).
3. Else uses defaults with `projectRoot = cwd`.

CLI commands resolve relative paths (`templatesRoot`) against `cfg.projectRoot` — the registry key, the directory containing `.freemarkerrc.json`, or `cwd`.

### User-level project registry

Written by `init`. Lives outside any project tree, keyed by absolute project root path:

| Platform | Path |
|---|---|
| macOS / Linux | `$XDG_CONFIG_HOME/freemarker-preview/projects.json` (default `~/.config/freemarker-preview/projects.json`) |
| Windows | `%APPDATA%\freemarker-preview\projects.json` |
| Test/CI override | `FMP_REGISTRY_PATH=/path/to/projects.json` |

```json
{
  "projects": {
    "/Users/dlo/Dev/agreement": {
      "templatesRoot": "src/main/resources/templates/email",
      "freemarker": { "number_format": "#,##0.00" }
    },
    "/Users/dlo/Dev/another-app": {
      "templatesRoot": "src/main/resources/templates"
    }
  }
}
```

Per-project entry mirrors the `.freemarkerrc.json` schema below (minus `configPath`). Edit by hand or re-run `init` (use `--force` to skip the overwrite prompt).

### Legacy: `.freemarkerrc.json` (committed)

Drop this into your project root if you'd rather commit config to the repo. The loader walks up from `cwd` to find it; relative paths resolve against its directory.

```json
{
  "templatesRoot": "src/main/resources/templates",
  "locale": "en_US",
  "inlineCss": true,
  "inlineCssOptions": { "preserveMediaQueries": true },
  "dev": { "port": 5173, "open": true }
}
```

| Key | Default | Notes |
|---|---|---|
| `templatesRoot` | `cwd` | Used as FreeMarker's `TemplateLoader` directory. Resolved relative to `projectRoot`. |
| `locale` | `"en_US"` | FreeMarker `Configuration.setLocale`. |
| `inlineCss` | `true` | Run `juice` post-render. |
| `inlineCssOptions` | `{ preserveMediaQueries: true }` | Forwarded to `juice`. |
| `freemarker` | `{}` | Forwarded to `Configuration.setSetting(key, value)` on the Java side (e.g. `number_format`, `date_format`). |
| `dev.port` | `5173` | Walks +5 if busy. |
| `dev.open` | `true` | Auto-open browser on `dev` start. |

## Variable rendering

Templates render against an empty data model. Any variable reference appears inline as a styled `‹varName›` placeholder (`<span class="fmp-variable">`).

This is intentional. The point is to let you review layout and copy without setting up data — the styling makes placeholders visually distinct from real text, so you can still spot rendering issues. If you want to customize the placeholder appearance (e.g., to match your own dev workflow), the `fmp-variable` class is the hook.

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

Template data is never written to the log (PII protection).

## Cross-platform notes

- macOS: verified end-to-end.
- Linux: targeted; should work, not verified in v1.
- Windows: targeted; the path code is platform-aware (debug log, browser auto-open) but **not verified end-to-end in v1**. File issues if you hit OS-specific bugs.

## Out of scope (v1)

- Email-client emulation (Gmail / Outlook / Apple Mail rendering quirks).
- Multi-template-root config.
- Click-to-open-in-editor from the error overlay.
- "Available variables in scope" hint on undefined-variable errors.
- CI workflow.

## Commits & releases

Every commit follows [Conventional Commits](https://www.conventionalcommits.org/). Releases are cut with `npm run release`, which uses [changelogen](https://github.com/unjs/changelogen) to bump the version, regenerate `CHANGELOG.md` from the commits since the last tag, and create a git tag.

## License

[TBD]
