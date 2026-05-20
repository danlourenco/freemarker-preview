# Rip Out Fixtures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the entire fixture system from freemarker-preview. Templates render against `{}`, every variable reference appears inline as `<span class="fmp-variable">‹varName›</span>`. No `--data` flag, no `previewMissingAs` config, no fixture files anywhere.

**Architecture:** Bottom-up removal driven by the Java/TS protocol change. The Java renderer's argument list shrinks first, propagating through `render()` → `RenderDaemon` → server / VS Code panel / CLI commands. Each commit keeps tests green by updating impl + tests + fixture-test inputs together. The convention-commit history feeds `changelogen`, which generates `CHANGELOG.md` and bumps to `0.1.0` at the end.

**Tech Stack:** TypeScript (Node ≥22.6, native `.ts` execution via `--experimental-strip-types`), Vitest, JBang + Java 21 (FreeMarker, Jackson for JSON envelope), unjs/changelogen.

**Spec:** `docs/superpowers/specs/2026-05-20-rip-out-fixtures-design.md`

---

## File Map

### Deleted

- `src/core/fixtures.ts` — entire file
- `fixtures/` — entire directory (renamed to `test-templates/` with `.json` files dropped; see Task 7)

### Modified (production code)

- `src/core/registry.ts` — drop two fields
- `src/core/config.ts` — drop two fields + type
- `src/core/render.ts` — signature change, drop missing-mode
- `src/core/daemon.ts` — drop fixturePath from request type + envelope + spawn args
- `src/core/errors.ts` — drop two error types
- `src/core/java/Render.java` — drop fixture arg, drop missing-mode, rename CSS class, delete handlers + ISO coercion
- `src/server/index.ts` — drop temp-dir / registry-reread / `x-fmp-fixtureless` header
- `src/vscode/preview-panel.ts` — drop fixture synthesis
- `src/cli/commands/render.ts` — drop `--data`, `--missing`
- `src/cli/commands/shot.ts` — same
- `src/cli/commands/dev.ts` — drop fixture from server opts
- `src/cli/index.ts` — drop help text

### Modified (tests)

All test files in §1 § Tests of the spec.

### New

- `CHANGELOG.md` (seeded in Task 0; auto-populated by `changelogen` in Task 10)

### Modified (docs / config)

- `package.json` — devDep + scripts + changelog config
- `CLAUDE.md` — commits & releases section
- `README.md` — fixture-section deletion + missing-mode removal
- `DESIGN.md` — surgical edit per spec §3

---

## Pre-flight

- [ ] **Step 0.1: Confirm baseline tests pass**

Run: `npm test`
Expected: all tests pass on `main` at commit `54bfe99`. If anything is red before we start, stop and surface it — we need green baseline so future failures are unambiguously from this work.

- [ ] **Step 0.2: Verify Java toolchain is available**

Run: `which jbang && jbang version`
Expected: prints jbang path + a version. If jbang isn't installed, tests that exercise `Render.java` will fail and the whole plan blocks.

---

## Task 0: Set up changelogen + Conventional Commits

**Why:** Tooling must be in place before any rip-out commit lands; that way changelogen sees every commit in the sequence and generates a clean `v0.1.0` entry at the end.

**Files:**

- Modify: `package.json` (add devDep, `release` script, `changelog` config)
- Modify: `CLAUDE.md` (add Commits & releases section)
- Create: `CHANGELOG.md` (placeholder header only)

### Steps

- [ ] **Step 0.1: Install changelogen as a devDependency**

Run: `npm i -D changelogen`
Expected: `package.json` gains `"changelogen": "^X.Y.Z"` under `devDependencies`; `package-lock.json` updates.

- [ ] **Step 0.2: Add `release` script and `changelog` config to `package.json`**

In `package.json`, inside the existing `"scripts"` object, add the `release` entry:

```jsonc
"scripts": {
  "test": "vitest run",
  "vscode:build": "node --experimental-strip-types vscode-build.config.ts",
  "vscode:watch": "node --experimental-strip-types vscode-build.config.ts --watch",
  "vscode:prepublish": "node --experimental-strip-types vscode-build.config.ts",
  "package:vscode": "vsce package --no-yarn --out dist/",
  "release": "changelogen --release"
}
```

Then add a top-level `changelog` block (sibling of `scripts`):

```jsonc
"changelog": {
  "types": {
    "feat": { "title": "Features" },
    "fix": { "title": "Bug fixes" },
    "refactor": { "title": "Refactors" },
    "perf": { "title": "Performance" },
    "chore": { "title": "Chores" },
    "docs": { "title": "Docs" },
    "test": { "title": "Tests" },
    "build": { "title": "Build" },
    "style": { "title": "Style" }
  }
}
```

- [ ] **Step 0.3: Add a "Commits & releases" section to `CLAUDE.md`**

Append to `CLAUDE.md`:

```markdown
## Commits & releases

Every commit follows the [Conventional Commits](https://www.conventionalcommits.org/) spec:

```
<type>(<scope>)?!: <description>
```

- **Types:** `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `build`, `style`
- **Breaking changes:** add `!` after the type/scope (e.g. `refactor(core)!: drop fixturePath`)
- **Scope** is optional but used when a change is bounded to a subsystem (`core`, `cli`, `vscode`, `server`, `java`, `docs`, `tests`)

To cut a release: `npm run release` — bumps `package.json` version (driven by the highest-impact commit type since the last tag), regenerates `CHANGELOG.md`, and tags.
```

- [ ] **Step 0.4: Seed `CHANGELOG.md`**

Create `CHANGELOG.md` at repo root:

```markdown
# Changelog

All notable changes documented here. Generated by [changelogen](https://github.com/unjs/changelogen) from conventional commits.
```

- [ ] **Step 0.5: Verify changelogen runs (dry)**

Run: `npx changelogen --help`
Expected: prints changelogen help with `--release`, `--from`, `--to` options. Confirms install + binary resolution work.

- [ ] **Step 0.6: Verify tests still pass**

Run: `npm test`
Expected: same green state as Pre-flight. Tooling-only change shouldn't affect tests.

- [ ] **Step 0.7: Commit**

```bash
git add package.json package-lock.json CLAUDE.md CHANGELOG.md
git commit -m "chore: set up changelogen and conventional commits"
```

---

## Task 1: Drop `fixturePath` from Java + render() + daemon protocol

**Why:** Atomic protocol change — Java side, TS render(), and the daemon JSON envelope must shift together or nothing renders. Largest single commit in this plan.

**Files:**

- Modify: `src/core/java/Render.java`
- Modify: `src/core/render.ts`
- Modify: `src/core/daemon.ts`
- Modify: `src/core/render.test.ts` (signature update + drop fixture-only tests)
- Modify: `src/core/daemon.test.ts` (drop fixturePath from every request)

### Steps

- [ ] **Step 1.1: Update `src/core/render.ts` signature**

Replace the `render` function and its options interface. Final shape:

```ts
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, basename, relative, resolve } from 'node:path'
import { FreemarkerError, type StructuredError } from './errors.ts'
import { debugLog } from './debug-log.ts'

export interface RenderOptions {
  templatesRoot?: string
  javaScriptPath?: string
  freemarkerSettings?: Record<string, string>
}

export interface RenderResult {
  html: string
}

const DEFAULT_JAVA_SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'java',
  'Render.java',
)

interface SuccessEnvelope { ok: true; html: string }
interface ErrorEnvelope { ok: false; error: StructuredError }
type Envelope = SuccessEnvelope | ErrorEnvelope

export function render(
  templatePath: string,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const templatesRoot = opts.templatesRoot
    ? resolve(opts.templatesRoot)
    : dirname(templatePath)
  const templateName = opts.templatesRoot
    ? relative(templatesRoot, templatePath)
    : basename(templatePath)

  const scriptPath = opts.javaScriptPath ?? DEFAULT_JAVA_SCRIPT_PATH

  const childEnv: NodeJS.ProcessEnv = { ...process.env }
  if (opts.freemarkerSettings && Object.keys(opts.freemarkerSettings).length > 0) {
    childEnv.FMP_FREEMARKER_SETTINGS = JSON.stringify(opts.freemarkerSettings)
  }

  return new Promise((resolveP, rejectP) => {
    const proc = spawn(
      'jbang',
      [scriptPath, templatesRoot, templateName],
      { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv },
    )

    let stdout = ''
    let stderr = ''

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (chunk) => { stdout += chunk })
    proc.stderr.on('data', (chunk) => { stderr += chunk })

    proc.on('error', rejectP)
    proc.on('close', (code) => {
      if (code !== 0) {
        rejectP(
          new FreemarkerError({
            type: 'internal',
            message: stderr.trim() || `jbang exited with code ${code}`,
            templatePath,
          }),
        )
        return
      }

      let envelope: Envelope
      try {
        envelope = JSON.parse(stdout) as Envelope
      } catch {
        rejectP(
          new FreemarkerError({
            type: 'internal',
            message: `unparseable response from jbang: ${stdout.slice(0, 200)}`,
            templatePath,
          }),
        )
        return
      }

      if (envelope.ok) {
        resolveP({ html: envelope.html })
      } else {
        if (envelope.error.stack) {
          debugLog(
            `render failed (${envelope.error.type}) for ${envelope.error.templatePath}\n${envelope.error.stack}`,
          )
        }
        rejectP(new FreemarkerError(envelope.error))
      }
    })
  })
}
```

Note: `PreviewMissingAs` export is gone — callers will fail typecheck (we fix them in later tasks within their own commits, but in this commit only render.ts/daemon.ts callers must compile).

- [ ] **Step 1.2: Update `src/core/daemon.ts`**

Three edits:

1. Remove the `import type { PreviewMissingAs, RenderResult }` import and re-import only `RenderResult`:

```ts
import type { RenderResult } from './render.ts'
```

2. Drop `previewMissingAs` from `DaemonOptions`, `missingMode` field, and constructor. Drop `fixturePath` from `DaemonRenderRequest` and `Pending`. The interface section becomes:

```ts
export interface DaemonOptions {
  templatesRoot: string
  javaScriptPath?: string
  freemarkerSettings?: Record<string, string>
  onStderr?: (chunk: string) => void
}

export interface DaemonRenderRequest {
  templateName: string
}
```

3. In the class: drop `missingMode` field + constructor assignment, drop `fixturePath` from `Pending`, drop it from the request enqueue in `render()`, drop it from the JSON envelope in `pump()`, drop it from spawn args in `ensureProc()`. Final spawn:

```ts
const proc = spawn(
  'jbang',
  [
    this.javaScriptPath,
    '--daemon',
    this.templatesRoot,
  ],
  { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv },
)
```

Final request JSON in `pump()`:

```ts
const request = JSON.stringify({ templateName: next.templateName })
proc.stdin.write(request + '\n')
```

Final enqueue in `render()`:

```ts
this.queue.push({
  templateName: req.templateName,
  templatePath: resolve(this.templatesRoot, req.templateName),
  resolve: resolveP,
  reject: rejectP,
})
```

- [ ] **Step 1.3: Update `src/core/java/Render.java`**

Edit the one-shot main path. Replace the arg-check block and the renderWithConfig call:

```java
if (args.length < 2 || args.length > 2) {
    System.err.println("usage: Render <templatesRoot> <templateName>");
    System.err.println("       Render --daemon <templatesRoot>");
    System.exit(2);
    return;
}

File templatesRoot = new File(args[0]);
String templateName = args[1];

try {
    Configuration cfg = freshConfig(templatesRoot);
    String html = renderWithConfig(cfg, templateName);
    // existing success-envelope code stays
```

Edit the daemon entrypoint:

```java
private static void runDaemon(File templatesRoot) throws Exception {
    Configuration cfg = freshConfig(templatesRoot);
    // existing reader loop, but read only templateName from each request:
    //   String templateName = (String) req.get("templateName");
    //   String html = renderWithConfig(cfg, templateName);
```

Remove the `fixturePath` extraction in the daemon request loop entirely.

Update `runDaemon` invocation in main:

```java
if (args.length == 2 && "--daemon".equals(args[0])) {
    runDaemon(new File(args[1]));
    return;
}
```

(Adjust the usage string accordingly: `Render --daemon <templatesRoot>` — no `[missingMode]`.)

Update `freshConfig` to drop the `missingMode` param:

```java
private static Configuration freshConfig(File templatesRoot) throws Exception {
    Configuration cfg = new Configuration(Configuration.VERSION_2_3_32);
    cfg.setDirectoryForTemplateLoading(templatesRoot);
    cfg.setDefaultEncoding("UTF-8");
    cfg.setTemplateExceptionHandler(PLACEHOLDER_HANDLER);
    cfg.setLogTemplateExceptions(false);
    cfg.setWrapUncheckedExceptions(true);
    cfg.setFallbackOnNullLoopVariable(false);
    applyUserSettings(cfg);
    return cfg;
}
```

Update `renderWithConfig` signature:

```java
private static String renderWithConfig(Configuration cfg, String templateName)
        throws IOException, TemplateException {
    cfg.clearTemplateCache();
    Template template = cfg.getTemplate(templateName);
    StringWriter out = new StringWriter();
    template.process(Collections.emptyMap(), out);
    return out.toString();
}
```

Delete `handlerFor()`, `EMPTY_HANDLER`, the `RETHROW_HANDLER` reference, `coerceIsoDates`, and the `ISO_8601` pattern. Also remove the `fixture-read` and `fixture-parse` branches from the error-classifier method (they reference `JsonProcessingException` / `IOException` paths that only existed for reading the fixture file).

Imports to remove (if no longer used after the deletions): `java.util.regex.Pattern`, `java.util.stream.Collectors`, `com.fasterxml.jackson.core.JsonProcessingException`, the `List` import if `coerceIsoDates` was the only user.

Keep `Collections.emptyMap()` import (`java.util.Collections`).

- [ ] **Step 1.4: Update `src/core/render.test.ts`**

Replace the whole file with a fixture-free version. Note: `fixtures/` paths still resolve here because we don't rename the directory until Task 7 — but the JSON files don't get used:

```ts
import { describe, test, expect } from 'vitest'
import { render } from './render.ts'
import { FreemarkerError } from './errors.ts'
import { resolve } from 'node:path'

describe('core.render', () => {
  test('renders a template against an empty data model', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')

    const { html } = await render(templatePath)

    expect(html).toContain('Hello, ')
    // hello.ftlh references ${name}; without data, it renders as a placeholder.
    expect(html).toMatch(/<span\s+class="fmp-variable"/)
    expect(html).toContain('‹name›')
  })

  test('templatesRoot opt sets the FreeMarker loader root so absolute-to-root includes resolve', async () => {
    const templatesRoot = resolve('fixtures/include-test/templates')
    const templatePath = resolve(
      'fixtures/include-test/templates/emails/main.ftlh',
    )

    const { html } = await render(templatePath, { templatesRoot })

    expect(html).toContain('Header content')
    // The body template references ${user.name}; renders as placeholder.
    expect(html).toContain('‹user.name›')
  })

  test('rejects with FreemarkerError(template-parse) for malformed template syntax', async () => {
    const templatePath = resolve('fixtures/errors/template-parse.ftlh')

    await expect(render(templatePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-parse',
      templatePath,
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(template-not-found) for a missing template', async () => {
    const templatePath = resolve('fixtures/does-not-exist.ftlh')

    await expect(render(templatePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-not-found',
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(template-runtime) for runtime template errors', async () => {
    const templatePath = resolve('fixtures/errors/template-runtime.ftlh')

    await expect(render(templatePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-runtime',
      templatePath,
    } satisfies Partial<FreemarkerError>)
  })

  test('freemarkerSettings forwards Configuration.setSetting() values to the Java side', async () => {
    // Uses fixtures/assigned-number.ftlh (created in Step 1.4a) — assigns a
    // numeric value inside the template via <#assign>, so output is affected
    // by number_format even without any fixture data.
    const templatePath = resolve('fixtures/assigned-number.ftlh')

    const { html: defaultOut } = await render(templatePath)
    const { html: customOut } = await render(templatePath, {
      freemarkerSettings: { number_format: '0' },
    })

    // Default en_US locale: 1.234567 → "1.235" (three-decimal default).
    // number_format='0': → "1" (integer, no decimals).
    expect(defaultOut).toContain('1.235')
    expect(customOut).toContain('Pi: 1')
    expect(customOut).not.toContain('1.235')
  })

  test('rejects with FreemarkerError(internal) when jbang fails to produce a parseable envelope', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')

    await expect(
      render(templatePath, {
        javaScriptPath: '/nonexistent/Render.java',
      }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'internal',
    } satisfies Partial<FreemarkerError>)
  })
})
```

- [ ] **Step 1.4a: Create a literal-number test template**

The existing `fixtures/numbers.ftlh` only contains `${pi}` (a reference). Without fixture data, that renders as a placeholder and number_format has nothing to affect. We need a template that binds a literal so the setting test is meaningful.

Create `fixtures/assigned-number.ftlh`:

```ftlh
<#assign pi = 1.234567 />
Pi: ${pi}
```

(This `.ftlh` survives the Task 7 rename — it'll move to `test-templates/assigned-number.ftlh` then.)

**Deleted tests** (no longer apply):
- "auto-coerces ISO-8601 strings…" — ISO coercion gone
- "rejects with FreemarkerError(undefined-variable)…" — undefined refs now placeholder, never throw
- "rejects with FreemarkerError(fixture-read)…" — error type gone
- "rejects with FreemarkerError(fixture-parse)…" — error type gone
- "previewMissingAs: placeholder…" — placeholder is always-on; covered by the new first test
- "previewMissingAs: empty…" — empty mode gone

If the `freemarkerSettings` test's literal-numbers assertion turns out to mismatch what `numbers.ftlh` outputs without data, simplify the test to just check that `--number_format=0` produces different output than default — the test's purpose is "settings reach Java," not specific number formatting.

- [ ] **Step 1.5: Update `src/core/daemon.test.ts`**

Drop `fixturePath` from every `daemon.render({...})` call. Drop the `previewMissingAs` test entirely. Drop tests that exercise undefined-variable error envelopes (now placeholder). Final test file:

```ts
import { describe, test, expect, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { RenderDaemon } from './daemon.ts'

let daemon: RenderDaemon | undefined

afterEach(async () => {
  await daemon?.shutdown()
  daemon = undefined
})

const fixturesRoot = resolve('fixtures')

describe('RenderDaemon', () => {
  test('roundtrips a single render request and returns html', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    const { html } = await daemon.render({ templateName: 'hello.ftlh' })

    expect(html).toContain('Hello, ')
    expect(html).toMatch(/<span\s+class="fmp-variable"/)
  })

  test('handles 100 sequential renders without leaking or hanging', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    for (let i = 0; i < 100; i++) {
      const { html } = await daemon.render({ templateName: 'hello.ftlh' })
      expect(html).toContain('Hello, ')
    }
  }, 60_000)

  test('per-render errors arrive as FreemarkerError envelopes (stderr stays empty)', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await expect(
      daemon.render({ templateName: 'errors/template-parse.ftlh' }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-parse',
    })

    const { html } = await daemon.render({ templateName: 'hello.ftlh' })
    expect(html).toContain('Hello, ')
  })

  test('an external kill triggers a silent respawn and the next render succeeds', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await daemon.render({ templateName: 'hello.ftlh' })

    const pid1 = daemon.pid!
    expect(pid1).toBeTypeOf('number')

    const closed = daemon.waitForClose()
    process.kill(pid1, 'SIGKILL')
    await closed

    const { html } = await daemon.render({ templateName: 'hello.ftlh' })
    expect(html).toContain('Hello, ')

    const pid2 = daemon.pid!
    expect(pid2).not.toBe(pid1)
  })

  test('two consecutive crashes surface a daemon-crash error', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await daemon.render({ templateName: 'hello.ftlh' })

    let closed = daemon.waitForClose()
    process.kill(daemon.pid!, 'SIGKILL')
    await closed

    await daemon.render({ templateName: 'hello.ftlh' })

    closed = daemon.waitForClose()
    process.kill(daemon.pid!, 'SIGKILL')
    await closed

    await expect(
      daemon.render({ templateName: 'hello.ftlh' }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'daemon-crash',
    })
  })

  test('shutdown() ends the underlying process and rejects subsequent renders', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await daemon.render({ templateName: 'hello.ftlh' })

    const pid = daemon.pid!
    await daemon.shutdown()

    expect(daemon.pid).toBeUndefined()
    await new Promise((r) => setTimeout(r, 50))
    expect(() => process.kill(pid, 0)).toThrow()

    await expect(
      daemon.render({ templateName: 'hello.ftlh' }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'daemon-crash',
    })
  })
})
```

- [ ] **Step 1.6: Run the targeted tests, expect compile failures elsewhere**

Run: `npm test -- src/core/render.test.ts src/core/daemon.test.ts`
Expected: passes. (Other test files won't compile because they still pass `fixturePath` / `previewMissingAs` — that's fixed in later tasks.)

- [ ] **Step 1.7: Verify the full test suite breaks only where expected**

Run: `npm test`
Expected: render.test.ts and daemon.test.ts pass; failures from `format-error.test.ts`, `debug-log.test.ts`, `config.test.ts`, `shot.test.ts`, `cli.test.ts`, `preview-panel.test.ts`, `panel-serializer.test.ts`, `diagnostics.test.ts` are acceptable — every failure should be a type error on a now-removed field (`fixturePath`, `fixture-read`, `fixture-parse`, `previewMissingAs`) or an unused-import error on `materializeFixture`. Note any unexpected failures (e.g., a runtime error in code paths we didn't touch) before continuing.

- [ ] **Step 1.8: Commit**

```bash
git add src/core/java/Render.java src/core/render.ts src/core/daemon.ts \
        src/core/render.test.ts src/core/daemon.test.ts
git commit -m "refactor(core,java)!: drop fixturePath from render API and Java protocol

BREAKING CHANGE: render(template, fixturePath, opts) is now render(template, opts).
Java Render takes only <templatesRoot> <templateName>. Daemon request envelope
no longer contains fixturePath. Templates render against an empty data model;
undefined references render as fmp-variable placeholder spans."
```

---

## Task 2: Remove `previewMissingAs` from config, registry, and `--missing` from CLI infrastructure

**Why:** With placeholder behavior wired unconditionally into Java, the whole mode-selection plumbing is dead — drop the field from config/registry and the type aliases.

**Note:** The `--missing` flag still exists in `src/cli/commands/{render,shot}.ts` after this task — those land in Tasks 3 and 4 alongside `--data` removal.

**Files:**

- Modify: `src/core/registry.ts`
- Modify: `src/core/config.ts`
- Modify: `src/core/config.test.ts`

### Steps

- [ ] **Step 2.1: Drop `previewMissingAs` from `RegistryProjectEntry`**

In `src/core/registry.ts`, remove the field. Final interface:

```ts
export interface RegistryProjectEntry {
  templatesRoot: string
  fixture?: Record<string, unknown>  // removed in Task 5
  locale?: string
  inlineCss?: boolean
  inlineCssOptions?: Record<string, unknown>
  freemarker?: Record<string, string>
  dev?: { port?: number; open?: boolean }
}
```

(`fixture?` stays for now to limit Task-2's blast radius; it's removed in Task 5 when we delete `fixtures.ts`.)

- [ ] **Step 2.2: Drop `previewMissingAs` + type from `src/core/config.ts`**

Remove the `PreviewMissingMode` type export, the `previewMissingAs?: PreviewMissingMode` field on `Config`, its DEFAULTS entry, and the mapping in `fromRegistryEntry`. Updated DEFAULTS:

```ts
const DEFAULTS: Omit<Config, 'configPath' | 'projectRoot'> = {
  templatesRoot: null,
  fixture: null,
  locale: 'en_US',
  inlineCss: true,
  inlineCssOptions: { preserveMediaQueries: true },
  freemarker: {},
  dev: { port: 5173, open: true },
}
```

Updated `Config` interface: delete the `previewMissingAs?: PreviewMissingMode` field; delete the `PreviewMissingMode` type.

Updated `fromRegistryEntry`: drop the `previewMissingAs: entry.previewMissingAs,` line.

- [ ] **Step 2.3: Update `src/core/config.test.ts`**

Find and delete any test that asserts on `previewMissingAs`. Keep tests around `templatesRoot`, `inlineCss`, `freemarker`, `dev.port`, etc. Run `grep -n "previewMissingAs" src/core/config.test.ts` to find the references; delete the asserting tests/lines.

- [ ] **Step 2.4: Run tests**

Run: `npm test -- src/core/config.test.ts`
Expected: passes. Then run `npm test` — accept the remaining failures from CLI / VS Code files that still import `PreviewMissingAs` (fixed in Tasks 3-5).

- [ ] **Step 2.5: Commit**

```bash
git add src/core/registry.ts src/core/config.ts src/core/config.test.ts
git commit -m "refactor(core)!: remove previewMissingAs config and registry field

BREAKING CHANGE: previewMissingAs key in the user-level registry and
.freemarkerrc.json is no longer read. Templates always render with placeholder
behavior."
```

---

## Task 3: Remove `--data` and `--missing` from `render` CLI

**Why:** With `previewMissingAs` gone from config and the placeholder behavior baked into Java, the CLI flags have no effect to deliver.

**Files:**

- Modify: `src/cli/commands/render.ts`
- Modify: `src/cli/cli.test.ts` (drop `--data` / `--missing` arg tests)

### Steps

- [ ] **Step 3.1: Simplify `src/cli/commands/render.ts`**

Rewrite the file to drop `materializeFixture`, `mkdtempSync`/`rmSync`, `parseMissingFlag`, the `data` and `missing` arg fields, the warning about non-default missing mode, and the `previewMissingAs`/`tempFixtureDir` logic. Final body:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '../../core/render.ts'
import { loadConfig } from '../../core/config.ts'
import { FreemarkerError } from '../../core/errors.ts'
import { formatError } from '../../core/format-error.ts'
import { inlineCss } from '../../core/inline.ts'

export interface RenderArgs {
  template: string
  json: boolean
  noInlineCss: boolean
}

export function parseRenderArgs(argv: string[]): RenderArgs {
  let template: string | undefined
  let json = false
  let noInlineCss = false

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--json') { json = true; i += 1; continue }
    if (arg === '--no-inline-css') { noInlineCss = true; i += 1; continue }
    if (!template && arg && !arg.startsWith('--')) {
      template = arg; i += 1; continue
    }
    i += 1
  }

  if (!template) throw new Error('render: missing <template> argument')

  return { template, json, noInlineCss }
}

function emitFailure(err: unknown, json: boolean, templatePath?: string): void {
  // unchanged — keep the existing implementation
}

export async function runRender(argv: string[]): Promise<number> {
  let args: RenderArgs
  try {
    args = parseRenderArgs(argv)
  } catch (err) {
    emitFailure(err, false)
    return 1
  }

  let cfg
  try {
    cfg = loadConfig(process.cwd())
  } catch (err) {
    emitFailure(err, args.json)
    return 1
  }

  const templatesRoot = cfg.templatesRoot
    ? resolve(cfg.projectRoot, cfg.templatesRoot)
    : undefined

  const cwdResolved = resolve(args.template)
  const templatePath =
    existsSync(cwdResolved) || !templatesRoot
      ? cwdResolved
      : resolve(templatesRoot, args.template)

  const shouldInline = !args.noInlineCss && cfg.inlineCss

  try {
    const { html } = await render(templatePath, {
      templatesRoot,
      freemarkerSettings: cfg.freemarker,
    })
    const out = shouldInline ? inlineCss(html, cfg.inlineCssOptions) : html
    process.stdout.write(out)
    return 0
  } catch (err) {
    emitFailure(err, args.json, templatePath)
    return 1
  }
}
```

(Keep `emitFailure` intact — it handles error formatting and doesn't reference removed types.)

- [ ] **Step 3.2: Update `src/cli/cli.test.ts`**

Delete any test asserting `--data` parses to `args.data`, or `--missing` parses to `args.missing`. If a test currently passes both flags and asserts on resulting render behavior, simplify it to just verify the command runs successfully without those flags.

Run `grep -n "data\|missing" src/cli/cli.test.ts` to locate impacted assertions.

- [ ] **Step 3.3: Run tests**

Run: `npm test -- src/cli/`
Expected: passes for cli.test.ts and shot.test.ts (shot.test.ts still has fixture refs; Task 4 fixes it — accept its failures here if any).

If shot.test.ts fails because of changes here (e.g., shared imports), inspect and either: a) defer to Task 4, or b) include minimal shot.ts fixes here if they're trivial. Prefer (a) — keep this commit focused.

- [ ] **Step 3.4: Commit**

```bash
git add src/cli/commands/render.ts src/cli/cli.test.ts
git commit -m "refactor(cli)!: remove --data and --missing flags from render

BREAKING CHANGE: 'freemarker-preview render' no longer accepts --data or
--missing. The render API is now a single behavior: templates render against
an empty data model with variables shown as inline placeholder spans."
```

---

## Task 4: Remove `--data` and `--missing` from `shot` CLI

**Why:** Same rationale as Task 3, applied to the `shot` (screenshot) subcommand.

**Files:**

- Modify: `src/cli/commands/shot.ts`
- Modify: `src/cli/shot.test.ts`

### Steps

- [ ] **Step 4.1: Simplify `src/cli/commands/shot.ts`**

Apply the same shape of changes as Task 3.1, plus simplify `defaultOutputPath`. The function no longer needs `fixturePath`:

```ts
function defaultOutputPath(templatePath: string): string {
  const stem = basename(templatePath, extname(templatePath))
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `${stem}-${ts}.png`
}
```

Drop the `parseMissingFlag` function, the `data` and `missing` arg parsing, the temp-dir creation, the `materializeFixture` call. Pass through `freemarkerSettings: cfg.freemarker` to `render()` and that's it.

- [ ] **Step 4.2: Update `src/cli/shot.test.ts`**

Drop `--data` / `--missing` arg parsing tests. Drop assertions where `defaultOutputPath` includes a fixture-name suffix — update to expect `<stem>-<timestamp>.png`.

- [ ] **Step 4.3: Run tests**

Run: `npm test -- src/cli/shot.test.ts`
Expected: passes.

- [ ] **Step 4.4: Commit**

```bash
git add src/cli/commands/shot.ts src/cli/shot.test.ts
git commit -m "refactor(cli)!: remove --data and --missing flags from shot

BREAKING CHANGE: 'freemarker-preview shot' no longer accepts --data or
--missing. Output filenames no longer include a fixture-name suffix —
default is <template-stem>-<timestamp>.png."
```

---

## Task 4.5: Update CLI help text in `cli/index.ts`

**Why:** The top-level help string still documents `--data`, `--missing`, and the "Missing-variable modes" section. With the flags gone, the help text is lying.

**Files:**

- Modify: `src/cli/index.ts`

### Steps

- [ ] **Step 4.5.1: Rewrite the `HELP` constant**

Replace the entire `HELP` template literal:

```ts
const HELP = `freemarker-preview — FreeMarker template previewer

Usage:
  freemarker-preview init [--force] [--no-warmup]
  freemarker-preview dev [--port N] [--no-open]
  freemarker-preview render <template> [--json] [--no-inline-css]
  freemarker-preview shot <template> [--out file.png] [--no-inline-css]
  freemarker-preview --help

Commands:
  init      Register the current project in your user-level registry (interactive picker + JBang pre-warm)
  dev       Start a live-reloading dev server with iframe preview
  render    Render a template and write HTML to stdout
  shot      Capture a PNG screenshot of the rendered template

Render flags:
  --json               Emit a structured error envelope to stderr on failure
  --no-inline-css      Skip the post-render CSS inlining pass

Dev flags:
  --port N             Preferred port (walks +5 if busy). Defaults to 5173.
  --no-open            Do not auto-open the browser

Shot flags:
  --out <file.png>     Output path (defaults to <template>-<timestamp>.png)
  --no-inline-css      Skip the post-render CSS inlining pass

Variable rendering:
  Templates render against an empty data model. Any variable reference appears
  inline as a styled \`‹varName›\` placeholder (<span class="fmp-variable">),
  so missing references never break the preview.
`
```

- [ ] **Step 4.5.2: Run CLI tests**

Run: `npm test -- src/cli/`
Expected: passes. If any test asserts on the literal HELP text contents (e.g., checks for the word "fixture" or "--data"), update or delete those assertions.

- [ ] **Step 4.5.3: Commit**

```bash
git add src/cli/index.ts
git commit -m "docs(cli): rewrite help text for fixture-free render model

Removes --data, --missing, fixture references, and the Missing-variable
modes section. Adds a 'Variable rendering' note explaining the
fmp-variable placeholder behavior."
```

---

## Task 5: Drop fixture plumbing from server, VS Code panel, and `dev` command

**Why:** Once the underlying APIs no longer accept a fixture path, the long tail of code that materializes one becomes dead. Removes `fixture` field from DevServerOptions, `mkdtempSync`/`rmSync` in start/stop, `readCurrentFixture`, `x-fmp-fixtureless` header, `fixtureDir` / `fixturePath` synthesis in VS Code panel.

**Files:**

- Modify: `src/server/index.ts`
- Modify: `src/vscode/preview-panel.ts`
- Modify: `src/cli/commands/dev.ts`
- Modify: `src/vscode/preview-panel.test.ts`
- Modify: `src/vscode/panel-serializer.test.ts`

### Steps

- [ ] **Step 5.1: Simplify `src/server/index.ts`**

Drop the `materializeFixture` import. Drop from `DevServerOptions`: `fixture`, `registryPath`, `projectRoot`, `previewMissingAs`. Drop the matching fields and constructor assignments. Drop `fixtureDir` / `fixturePath` fields and the `mkdtempSync` in `start()` + `rmSync` in `stop()`. Drop `readCurrentFixture()`. In the render handler, drop the `materializeFixture` call, drop the `x-fmp-fixtureless` header, and call `daemon.render({ templateName })` directly.

Also drop `previewMissingAs` from the daemon construction call (the daemon constructor's API changed in Task 1).

- [ ] **Step 5.2: Simplify `src/vscode/preview-panel.ts`**

Drop the `materializeFixture` import. Drop `fixtureDir` from `PreviewPanelDeps`. Drop `fixture` from `ActiveTemplate`. Drop the `fixtureDir` field on the class. Drop the synthesized `fixturePath` (`join(this.fixtureDir, ...)`) in the render path. Call `daemon.render({ templateName })` directly.

Drop the `tmpdir` import if no longer used.

- [ ] **Step 5.3: Simplify `src/cli/commands/dev.ts`**

Drop `fixture: cfg.fixture`, `registryPath`, `projectRoot`, `previewMissingAs` from the `DevServer` options object. Server constructor no longer needs them.

- [ ] **Step 5.4: Update `src/vscode/preview-panel.test.ts`**

Drop any test that asserts on fixture-path synthesis or `materializeFixture` calls. Drop any `fixtureDir` dep being passed in `deps`. Drop `fixture: {...}` from active-template assertions.

- [ ] **Step 5.5: Update `src/vscode/panel-serializer.test.ts`**

Drop `fixture` from any serialized-state object assertions. If the test serializes/restores a panel state, it should now contain only `uri`, `templatesRoot`, `templateName` (no `fixture` field).

- [ ] **Step 5.6: Run the targeted tests**

Run: `npm test -- src/server src/vscode`
Expected: all pass.

- [ ] **Step 5.7: Commit**

```bash
git add src/server/index.ts src/vscode/preview-panel.ts src/cli/commands/dev.ts \
        src/vscode/preview-panel.test.ts src/vscode/panel-serializer.test.ts
git commit -m "refactor(server,vscode): drop fixture temp-dir and registry re-read

Removes DevServer fixture materialization, the per-render registry re-read,
the x-fmp-fixtureless response header, and the VS Code panel's
fixture-path synthesis. Aligns server and extension with the fixture-free
render API."
```

---

## Task 6: Delete `fixtures.ts`, drop `fixture-*` error types, drop registry `fixture` field

**Why:** With no remaining callers of `materializeFixture` (verified in Tasks 1, 3, 4, 5), the file is dead. The `fixture-read` / `fixture-parse` error types from `errors.ts` are also unreachable now that Java no longer reads a fixture file.

**Files:**

- Delete: `src/core/fixtures.ts`
- Modify: `src/core/errors.ts`
- Modify: `src/core/registry.ts` (drop the `fixture` field finally)
- Modify: `src/core/config.ts` (drop the `fixture` field)
- Modify: `src/core/format-error.test.ts`
- Modify: `src/core/debug-log.test.ts`
- Modify: `src/vscode/diagnostics.test.ts`

### Steps

- [ ] **Step 6.1: Sanity check — confirm `fixtures.ts` is unused**

Run: `grep -rn "from.*fixtures'" src --include="*.ts"`
Expected: no matches outside `src/core/fixtures.ts` itself. If anything appears, that file still imports it — fix that import first.

Run: `grep -rn "materializeFixture" src --include="*.ts"`
Expected: matches only inside `src/core/fixtures.ts`.

- [ ] **Step 6.2: Delete `src/core/fixtures.ts`**

Run: `git rm src/core/fixtures.ts`

- [ ] **Step 6.3: Remove `fixture-read` and `fixture-parse` from `src/core/errors.ts`**

Edit the error-type union to drop those two strings. Final union should retain: `'template-parse'`, `'undefined-variable'`, `'template-not-found'`, `'template-runtime'`, `'internal'`, `'daemon-crash'`, plus any others already present. Grep to confirm: `grep -n "type:" src/core/errors.ts`.

- [ ] **Step 6.4: Drop `fixture?` from `RegistryProjectEntry` in `src/core/registry.ts`**

Final interface:

```ts
export interface RegistryProjectEntry {
  templatesRoot: string
  locale?: string
  inlineCss?: boolean
  inlineCssOptions?: Record<string, unknown>
  freemarker?: Record<string, string>
  dev?: { port?: number; open?: boolean }
}
```

- [ ] **Step 6.5: Drop `fixture` from `Config` in `src/core/config.ts`**

Remove the field from the interface, the DEFAULTS entry, and the mapping in `fromRegistryEntry`.

- [ ] **Step 6.6: Update `src/core/format-error.test.ts`**

Find and delete any assertions on `fixture-read` / `fixture-parse` error types.

Run: `grep -n "fixture" src/core/format-error.test.ts` to locate.

- [ ] **Step 6.7: Update `src/core/debug-log.test.ts`**

Drop the test case(s) that exercise fixture-read error logging — that error type no longer exists. Keep template-parse and template-runtime logging tests.

- [ ] **Step 6.8: Update `src/vscode/diagnostics.test.ts`**

Delete the test case at `line 68` (per the spec) that asserts on `type: 'fixture-parse'`.

- [ ] **Step 6.9: Run all tests**

Run: `npm test`
Expected: all pass. (Some tests still reference `fixtures/...` paths — that's fine; Task 7 renames the directory but the templates inside still exist.)

- [ ] **Step 6.10: Commit**

```bash
git add src/core/fixtures.ts src/core/errors.ts src/core/registry.ts \
        src/core/config.ts src/core/format-error.test.ts \
        src/core/debug-log.test.ts src/vscode/diagnostics.test.ts
git commit -m "chore(core): delete fixtures.ts and fixture-* error types

Removes the last fixture-related TypeScript module along with the
fixture-read / fixture-parse error variants, the registry.fixture field,
and the Config.fixture field. No remaining consumers."
```

---

## Task 7: Rename `fixtures/` → `test-templates/`, delete JSON data and legacy subdir

**Why:** The directory's contents stopped being "fixtures" the moment fixture data went away — these are test inputs (`.ftlh` templates) now. Rename clarifies intent; delete the `.json` files that no longer serve a purpose.

**Files:**

- Rename: `fixtures/` → `test-templates/`
- Delete: every `*.json` inside it
- Delete: `welcome.fixtures/` subdirectory
- Delete: `dated.ftlh` (only existed for ISO-date coercion)
- Modify: every test that references `fixtures/...` (path swap to `test-templates/...`)

### Steps

- [ ] **Step 7.1: Rename the directory**

Run: `git mv fixtures test-templates`

- [ ] **Step 7.2: Delete the JSON data and obsolete files**

Run:

```bash
git rm test-templates/*.json
git rm -r test-templates/welcome.fixtures
git rm test-templates/dated.ftlh
find test-templates -name '*.json' -delete  # catches errors/*.json and include-test/data.json
git add -A test-templates/
```

Then `git status` to confirm only `.ftlh` files remain and no JSON survives.

- [ ] **Step 7.3: Update test files**

Find every `fixtures/` reference in tests:

```bash
grep -rln "fixtures/" src --include='*.test.ts'
```

For each file, run a find-and-replace: `fixtures/` → `test-templates/`. Be careful: only swap the path literal, not class names like `fmp-variable` or other coincidental matches.

Specifically check (the spec's test-rewrite table covers most of these — they were updated in earlier tasks for behavior; here we're just swapping the path):

- `src/core/render.test.ts`
- `src/core/daemon.test.ts`
- `src/core/debug-log.test.ts`
- `src/cli/shot.test.ts`
- `src/cli/cli.test.ts`
- `src/vscode/preview-panel.test.ts`
- `src/vscode/panel-serializer.test.ts`
- `src/vscode/diagnostics.test.ts`
- `src/core/format-error.test.ts`
- `src/core/config.test.ts`

- [ ] **Step 7.4: Run all tests**

Run: `npm test`
Expected: all pass. If a test fails because a referenced template was in one of the deleted JSON-paired files (e.g. a test that pointed at `errors/fixture-parse.json` — now gone), delete that test; it's already lost its reason to exist.

- [ ] **Step 7.5: Commit**

```bash
git add -A
git commit -m "chore: rename fixtures/ to test-templates/ and remove json data

The directory now holds only .ftlh test inputs. Removes co-located JSON
data files, the legacy welcome.fixtures/ scenario tree, and dated.ftlh
(its only purpose was exercising ISO-date coercion, now gone)."
```

---

## Task 8: Rename `fmp-missing` CSS class to `fmp-variable`

**Why:** With "missing" no longer meaningful (every variable renders this way), the class name is misleading. New name describes what the span actually is.

**Files:**

- Modify: `src/core/java/Render.java` (one line — the span template string)

### Steps

- [ ] **Step 8.1: Confirm test assertions already expect `fmp-variable`**

Tests written in Tasks 1, 5, and elsewhere should already assert on `fmp-variable`. Run:

```bash
grep -rn "fmp-missing" src
```

Expected: only the Java line at `Render.java:156` (the actual span output). If any test still asserts on `fmp-missing`, that test should have been updated earlier — fix it now before changing Java, otherwise the test goes red.

- [ ] **Step 8.2: Update the Java string**

In `src/core/java/Render.java`, find:

```java
out.write(
    "<span class=\"fmp-missing\" style=\"" + PLACEHOLDER_STYLE + "\">"
    + "‹" + safe + "›</span>"
);
```

Change `fmp-missing` → `fmp-variable`:

```java
out.write(
    "<span class=\"fmp-variable\" style=\"" + PLACEHOLDER_STYLE + "\">"
    + "‹" + safe + "›</span>"
);
```

- [ ] **Step 8.3: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8.4: Commit**

```bash
git add src/core/java/Render.java
git commit -m "style(java): rename fmp-missing CSS class to fmp-variable

The 'missing' framing made sense when fixtures existed and an undefined
reference signaled missing data. Now every variable renders this way;
fmp-variable describes what the span actually is."
```

---

## Task 9: Rewrite README and DESIGN.md

**Files:**

- Modify: `README.md`
- Modify: `DESIGN.md`

### Steps

- [ ] **Step 9.1: README.md — delete fixture sections + `--data` / `--missing` rows**

Open `README.md` and apply per the spec:

- Delete the entire "Fixture data" section (currently around lines 255–298)
- Delete the "Migrating from per-template fixtures" subsection
- In the `render` flag table: delete the `--data` row, delete the `--missing` row
- In the `shot` flag table: same
- Delete the "Missing-variable modes" section if present
- Replace the "If no `fixture` key exists..." paragraph with one sentence:

  ```markdown
  Templates render against an empty data model. Any variable reference appears inline as a styled `‹varName›` placeholder (`<span class="fmp-variable">`).
  ```

- Delete the ISO-date-coercion paragraph
- Add a new "Commits & releases" subsection (anywhere appropriate, e.g. near the end):

  ```markdown
  ## Commits & releases

  Every commit follows [Conventional Commits](https://www.conventionalcommits.org/). Releases are cut with `npm run release`, which uses [changelogen](https://github.com/unjs/changelogen) to bump the version, regenerate `CHANGELOG.md` from the commits since the last tag, and create a git tag.
  ```

- [ ] **Step 9.2: DESIGN.md — surgical edits**

Open `DESIGN.md` and apply per the spec:

- Rewrite the §"Data model & fixtures" section as "Data model" — one paragraph:

  ```markdown
  ## Data model

  Templates render against an empty data model (`{}`). Any variable reference produces an inline `<span class="fmp-variable">‹varName›</span>` styled placeholder rather than throwing. There is no fixture file, no `--data` flag, and no configuration knob.
  ```

- Remove the `welcome.fixtures/<scenario>.json` convention paragraph
- Remove the `--fixture` flag from CLI examples (use plain `freemarker-preview render welcome.ftlh`)
- Remove `fixturesRoot` from the `.freemarkerrc.json` example
- In the error taxonomy table, remove the `fixture-read` and `fixture-parse` rows
- Remove the daemon-protocol JSON example's `"fixturePath"` field
- Anywhere "fixtures" appears as a sidebar/list-pane item, remove

- [ ] **Step 9.3: Verify README + DESIGN render correctly**

Run a markdown linter or open in a viewer. Watch for orphaned references (e.g. a TOC entry pointing at a deleted heading).

- [ ] **Step 9.4: Commit**

```bash
git add README.md DESIGN.md
git commit -m "docs: rewrite fixture sections in README and DESIGN.md

Reflects the fixture-free render model. README drops the Fixture data
section, --data / --missing flag rows, and the per-template migration
note. DESIGN.md rewrites the data-model section, strips the
fixture-related CLI examples, and removes fixture-* error rows from the
taxonomy table."
```

---

## Task 10: Release `v0.1.0`

**Why:** Cut a tagged release with auto-generated CHANGELOG.md driven by the conventional commits from Tasks 0–9.

**Files:**

- Modify (auto): `package.json` (version bump)
- Modify (auto): `CHANGELOG.md` (entries generated)
- New: `v0.1.0` git tag

### Steps

- [ ] **Step 10.1: Dry-run changelogen first**

Run: `npx changelogen --from=fb6b827 --to=HEAD`
Expected: prints the proposed CHANGELOG.md content based on commits since `fb6b827` (the v0.0.3 release). Confirm the breaking-change markers (`!`) on Tasks 1–4 are picked up and the proposed bump is `0.0.3 → 0.1.0`.

If the output looks wrong (missing entries, wrong bump), stop and investigate — don't proceed to `--release` until the dry-run is clean.

- [ ] **Step 10.2: Run the release**

Run: `npm run release`
Expected:
- `package.json` `version` updates to `0.1.0`
- `CHANGELOG.md` gets a new `## v0.1.0` section with grouped entries
- A `v0.1.0` git tag is created
- A release commit is created with the version bump

- [ ] **Step 10.3: Verify**

Run:

```bash
git log --oneline -5
git tag -l 'v*'
cat CHANGELOG.md | head -40
```

Expected: latest commit is the release commit, `v0.1.0` tag exists, CHANGELOG.md has a populated entry.

- [ ] **Step 10.4: Push (manual step — confirm with user before running)**

Suggest to user: `git push origin main --tags`
Do NOT push automatically — see CLAUDE.md / general policy on pushing.

---

## Post-completion verification

After Task 10:

- [ ] Full test suite is green: `npm test`
- [ ] `grep -rn "fixture" src --include='*.ts'` returns no production-code matches (only references in `test-templates/` paths inside tests are acceptable — and even those should be `test-templates/`)
- [ ] `grep -rn "previewMissingAs\|materializeFixture\|fixture-read\|fixture-parse\|fmp-missing" src` returns zero matches
- [ ] `package.json` version is `0.1.0`
- [ ] CHANGELOG.md has a populated v0.1.0 entry with grouped sections (Refactors, Chores, Tests, Docs, Style)
- [ ] Manual smoke test:

  ```bash
  echo 'Hello, ${name}!' > /tmp/smoke.ftlh
  node --experimental-strip-types src/cli/index.ts render /tmp/smoke.ftlh
  ```

  Expected stdout contains `Hello, <span class="fmp-variable" ...>‹name›</span>!`.
