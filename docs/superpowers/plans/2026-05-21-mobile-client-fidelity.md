# Mobile-client Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dev preview's width controls with a four-mode picker (iOS Mail, Gmail mobile, Desktop, Full) so users see what real mobile mail clients actually render, not just "iframe at 375px."

**Architecture:** A pure-function module (`mode.js`) computes a config struct from the mode name (containerWidth, iframeWidth, scale, chrome). Both the web shell and the VS Code webview consume this module to drive their picker UI. iOS Mail mode renders the iframe at a 980px virtual viewport (per Apple's documented Safari iOS default) with a CSS transform-scale to fit the 375px container — simulating Apple Mail's auto-zoom on non-responsive emails.

**Tech Stack:** Vanilla JS modules (no framework), CSS custom properties, vitest for pure-function tests, no DOM-test runner needed for unit coverage.

**Spec:** `docs/superpowers/specs/2026-05-21-mobile-client-fidelity-design.md`

---

## File Map

### New files

- `src/server/public/mode.js` — ES module exporting `modeConfig(mode)` and `migrateUrlParams(url)`. Pure, no DOM.
- `src/server/public/mode.test.ts` — unit tests for both pure functions.
- `src/vscode/webview/mode.js` — copy of the above (the VS Code webview bundle is separate; see vscode-build.config.ts copies from `src/vscode/webview/`, not from `src/server/public/`).

### Modified files

- `src/server/public/index.html` — replace 4 width buttons + custom-width `<input>` with 4 mode buttons; promote `<script src="/shell.js">` to `type="module"`.
- `src/server/public/shell.js` — drop IIFE wrapper (convert to module), import from `./mode.js`, replace `applyWidth()` with `applyMode()`, drop the `widthCustom` handler, wire URL migrator at bootstrap.
- `src/server/public/shell.css` — rename `.width-controls` → `.mode-controls` (or keep class, add new selectors), add iOS Mail mode container styling (`overflow: hidden` for the clip).
- `src/vscode/webview/shell.js` — same logic changes as the server shell (but preserve the VS Code-specific `acquireVsCodeApi` / `setState` patterns).
- `src/vscode/webview/shell.css` — same CSS changes as the server shell.
- `src/vscode/preview-panel.ts` — `buildWebviewHtml` swaps width buttons for mode buttons; script tag becomes `type="module"`.
- `src/vscode/preview-panel.test.ts` — update assertions on button class names / data attributes from `width-btn` / `data-width` to `mode-btn` / `data-mode`.
- `README.md` — add a "Mobile-client modes" section near the existing preview docs; remove any references to `--width` / custom widths.

### File-scope rationale

`mode.js` lives in two places because the VS Code build doesn't reach into `src/server/public/`. Single-source-of-truth via a shared TS module + esbuild import would be cleaner but expands scope. Keeping two files is pragmatic — they're 30 lines each, and a future refactor can consolidate them under a `src/shared/` module.

---

## Pre-flight

- [ ] **Step 0.1: Confirm baseline is green**

Run: `npm test`
Expected: 22 files, 146 tests, all pass. Current HEAD: `2f7d31c` (spec commit). If anything is red, stop and surface it.

- [ ] **Step 0.2: Sanity-check current preview behavior**

Skim `src/server/public/index.html` and `src/server/public/shell.js` to internalize the existing width-controls flow. Note: `applyWidth()` reads `?width=` from URL, sets `--preview-width` CSS custom property, slots the iframe into `phone-iframe-container` (when width=375) or `preview-plain` (otherwise), and updates the `aria-pressed` state of the buttons.

- [ ] **Step 0.3: Read the VS Code webview shell**

Run: `wc -l src/vscode/webview/shell.js src/server/public/shell.js`
The two are visibly different (the VS Code version uses `acquireVsCodeApi`, omits the sidebar/manifest code, etc.). Plan changes will touch both files separately.

---

## Task 1: Pure logic + tests (TDD)

**Why:** `modeConfig` and `migrateUrlParams` are pure functions — small, fully-coverable, side-effect-free. Writing tests first locks the contract before either shell consumes the module.

**Files:**

- Create: `src/server/public/mode.js`
- Create: `src/server/public/mode.test.ts`

### Steps

- [ ] **Step 1.1: Create the failing test file**

Create `src/server/public/mode.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { modeConfig, migrateUrlParams } from './mode.js'

describe('modeConfig', () => {
  test('iOS Mail: 980 virtual viewport, scale to 375, chrome on', () => {
    expect(modeConfig('ios-mail')).toEqual({
      containerWidth: '375px',
      iframeWidth: '980px',
      scale: 375 / 980,
      chrome: true,
    })
  })

  test('Gmail mobile: 375 1:1, no chrome', () => {
    expect(modeConfig('gmail-mobile')).toEqual({
      containerWidth: '375px',
      iframeWidth: '100%',
      scale: 1,
      chrome: false,
    })
  })

  test('Desktop: 600 1:1, no chrome', () => {
    expect(modeConfig('desktop')).toEqual({
      containerWidth: '600px',
      iframeWidth: '100%',
      scale: 1,
      chrome: false,
    })
  })

  test('Full: 100% 1:1, no chrome', () => {
    expect(modeConfig('full')).toEqual({
      containerWidth: '100%',
      iframeWidth: '100%',
      scale: 1,
      chrome: false,
    })
  })

  test('unknown mode falls back to iOS Mail', () => {
    expect(modeConfig('bogus')).toEqual(modeConfig('ios-mail'))
    expect(modeConfig('')).toEqual(modeConfig('ios-mail'))
    expect(modeConfig(undefined)).toEqual(modeConfig('ios-mail'))
  })
})

describe('migrateUrlParams', () => {
  test('passes through URLs with neither width nor mode', () => {
    expect(migrateUrlParams('http://localhost:5173/?template=hello.ftlh'))
      .toBe('http://localhost:5173/?template=hello.ftlh')
  })

  test('passes through URLs that already have mode set', () => {
    expect(migrateUrlParams('http://localhost:5173/?mode=desktop'))
      .toBe('http://localhost:5173/?mode=desktop')
  })

  test('width=375 migrates to mode=gmail-mobile', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=375'))
      .toBe('http://localhost:5173/?mode=gmail-mobile')
  })

  test('width=600 migrates to mode=desktop', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=600'))
      .toBe('http://localhost:5173/?mode=desktop')
  })

  test('width=full migrates to mode=full', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=full'))
      .toBe('http://localhost:5173/?mode=full')
  })

  test('numeric custom widths migrate to mode=gmail-mobile', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=420'))
      .toBe('http://localhost:5173/?mode=gmail-mobile')
  })

  test('drops stale width when mode is already present', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=375&mode=desktop'))
      .toBe('http://localhost:5173/?mode=desktop')
  })

  test('preserves other query params during migration', () => {
    expect(migrateUrlParams('http://localhost:5173/?template=hello.ftlh&width=600'))
      .toBe('http://localhost:5173/?template=hello.ftlh&mode=desktop')
  })

  test('unknown width values pass through unchanged', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=mobile'))
      .toBe('http://localhost:5173/?width=mobile')
  })
})
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `npm test -- src/server/public/mode.test.ts`
Expected: FAIL — cannot resolve `./mode.js`.

- [ ] **Step 1.3: Implement `mode.js`**

Create `src/server/public/mode.js`:

```js
export function modeConfig(mode) {
  switch (mode) {
    case 'ios-mail':
      return { containerWidth: '375px', iframeWidth: '980px', scale: 375 / 980, chrome: true };
    case 'gmail-mobile':
      return { containerWidth: '375px', iframeWidth: '100%', scale: 1, chrome: false };
    case 'desktop':
      return { containerWidth: '600px', iframeWidth: '100%', scale: 1, chrome: false };
    case 'full':
      return { containerWidth: '100%', iframeWidth: '100%', scale: 1, chrome: false };
    default:
      return modeConfig('ios-mail');
  }
}

export function migrateUrlParams(url) {
  const u = new URL(url);
  if (u.searchParams.has('mode')) {
    if (u.searchParams.has('width')) u.searchParams.delete('width');
    return u.toString();
  }
  const width = u.searchParams.get('width');
  if (!width) return u.toString();
  let mode;
  if (width === '600') mode = 'desktop';
  else if (width === 'full') mode = 'full';
  else if (width === '375' || /^\d+$/.test(width)) mode = 'gmail-mobile';
  else return u.toString();
  u.searchParams.delete('width');
  u.searchParams.set('mode', mode);
  return u.toString();
}
```

- [ ] **Step 1.4: Run the tests to verify they pass**

Run: `npm test -- src/server/public/mode.test.ts`
Expected: all 14 tests pass.

- [ ] **Step 1.5: Run the full suite**

Run: `npm test`
Expected: 23 files (was 22, +1 for mode.test.ts), all green.

- [ ] **Step 1.6: Commit**

```bash
git add src/server/public/mode.js src/server/public/mode.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add modeConfig and migrateUrlParams pure functions

modeConfig maps a mode name (ios-mail / gmail-mobile / desktop / full)
to a config struct: container width, iframe width, scale factor, chrome
flag. iOS Mail uses 980px virtual viewport (per Safari iOS default,
Apple Developer docs) with a scale-to-fit transform for the 375px
container.

migrateUrlParams rewrites legacy `?width=` URL state to the new `?mode=`
shape so bookmarks survive the picker change.

Both functions are pure and DOM-free; consumed by the web shell
(src/server/public/shell.js) and the VS Code webview
(src/vscode/webview/shell.js) in follow-up commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire web shell to new picker

**Why:** Replace the existing width-controls UX with the mode picker. Atomic UI change — index.html, shell.js, and shell.css must update together to avoid a broken intermediate state.

**Files:**

- Modify: `src/server/public/index.html`
- Modify: `src/server/public/shell.js`
- Modify: `src/server/public/shell.css`

### Steps

- [ ] **Step 2.1: Update `src/server/public/index.html`**

In the `<header>` block, replace this section:

```html
<div class="width-controls" role="group" aria-label="preview width">
  <button type="button" class="width-btn" data-width="375" title="Mobile (375px)">375</button>
  <button type="button" class="width-btn" data-width="600" title="Desktop (600px)">600</button>
  <button type="button" class="width-btn" data-width="full" title="Full container width">Full</button>
  <input type="number" class="width-custom" id="width-custom" min="200" max="2000" placeholder="px" aria-label="custom width">
</div>
```

with:

```html
<div class="mode-controls" role="group" aria-label="preview mode">
  <button type="button" class="mode-btn" data-mode="ios-mail" title="Apple Mail iOS — 980px virtual viewport, scaled to fit 375">iOS Mail</button>
  <button type="button" class="mode-btn" data-mode="gmail-mobile" title="Gmail mobile — 375px 1:1, responsive CSS fires">Gmail mobile</button>
  <button type="button" class="mode-btn" data-mode="desktop" title="Desktop — 600px">Desktop</button>
  <button type="button" class="mode-btn" data-mode="full" title="Full container width">Full</button>
</div>
```

Then at the bottom, change:

```html
<script src="/shell.js"></script>
```

to:

```html
<script type="module" src="/shell.js"></script>
```

- [ ] **Step 2.2: Update `src/server/public/shell.js`**

This is the bulk of the change. The full new file:

```js
import { modeConfig, migrateUrlParams } from './mode.js';

const iframe = document.getElementById('preview');
const iframeWrap = document.getElementById('iframe-wrap');
const status = document.getElementById('status');
const statusLabel = document.getElementById('status-label');
const sidebar = document.getElementById('templates');
const modeBtns = document.querySelectorAll('.mode-btn');
const overlay = document.getElementById('overlay');
const overlayType = document.getElementById('overlay-type');
const overlayLocation = document.getElementById('overlay-location');
const overlayMessage = document.getElementById('overlay-message');
const overlaySnippet = document.getElementById('overlay-snippet');
const overlayDismiss = document.getElementById('overlay-dismiss');

let manifest = { templates: [] };

function setStatus(state) {
  status.dataset.state = state;
  status.title = state;
  statusLabel.textContent = state;
}

function getParams() {
  const u = new URL(window.location.href);
  return {
    template: u.searchParams.get('template'),
    mode: u.searchParams.get('mode'),
  };
}

function setParams(updates) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null || v === false || v === '') u.searchParams.delete(k);
    else u.searchParams.set(k, v === true ? '1' : String(v));
  }
  window.history.replaceState(null, '', u.toString());
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ---------- sidebar ---------- */

// (Keep the existing sidebar / tree / folder / selectTemplate code intact —
//  it's not changing. Refer to the pre-task version of shell.js for the
//  buildTree / sortedChildren / defaultExpanded / toggleFolder /
//  renderSidebar / selectTemplate functions and the FOLDER_STATE_KEY
//  constant. They migrate verbatim.)

// ... [paste the existing sidebar block from lines ~48-174 of the
//      pre-task shell.js verbatim] ...

/* ---------- mode controls ---------- */

function applyMode() {
  const params = getParams();
  const mode = params.mode || 'ios-mail';
  const cfg = modeConfig(mode);

  // Container width (consumed by .iframe-wrap CSS via --preview-width)
  iframeWrap.style.setProperty('--preview-width', cfg.containerWidth);

  // Phone chrome on/off (consumed by CSS via [data-mode="phone"|"plain"])
  iframeWrap.dataset.mode = cfg.chrome ? 'phone' : 'plain';
  const phoneIframeContainer = document.getElementById('phone-iframe-container');
  const previewPlain = document.getElementById('preview-plain');
  const targetContainer = cfg.chrome ? phoneIframeContainer : previewPlain;
  if (iframe.parentElement !== targetContainer) {
    targetContainer.appendChild(iframe);
  }

  // iOS Mail scale: render iframe at 980px CSS width, transform-scale to
  // fit the 375px container. Set inline so it overrides anything the CSS
  // would otherwise apply. Height is derived from container height /
  // scale so the visual viewport fills the container vertically — read
  // the actual container size at call time since it depends on the
  // phone chrome layout.
  if (cfg.scale !== 1) {
    const containerHeight = targetContainer.clientHeight || 600;
    iframe.style.width = cfg.iframeWidth;
    iframe.style.height = `${containerHeight / cfg.scale}px`;
    iframe.style.transform = `scale(${cfg.scale})`;
    iframe.style.transformOrigin = 'top left';
  } else {
    iframe.style.width = '';
    iframe.style.height = '';
    iframe.style.transform = '';
    iframe.style.transformOrigin = '';
  }

  // Aria-pressed on the active mode button
  for (const btn of modeBtns) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  }
}

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setParams({ mode: btn.dataset.mode });
    applyMode();
  });
});

/**
 * Pull the email's <title> into the chrome's subject row. Best-effort —
 * if the template has no <title>, fall back to the placeholder.
 */
function updateMailChrome() {
  const subjectEl = document.getElementById('mc-subject');
  if (!subjectEl) return;
  try {
    const doc = iframe.contentDocument;
    const title = doc && doc.querySelector('title');
    const text = title && title.textContent && title.textContent.trim();
    subjectEl.textContent = text || 'Email Subject';
  } catch {
    subjectEl.textContent = 'Email Subject';
  }
}

iframe.addEventListener('load', updateMailChrome);

/* ---------- error overlay ---------- */

// (Keep the existing overlay code: hideOverlay, showError, overlayDismiss handler.
//  Verbatim from pre-task shell.js.)

/* ---------- render pipeline ---------- */

// (Keep the existing refresh() and inFlight tracking. Verbatim.)

/* ---------- bootstrap + SSE ---------- */

async function loadManifest() {
  try {
    const res = await fetch('/api/manifest');
    manifest = await res.json();
  } catch {
    manifest = { templates: [] };
  }
}

async function ensureTemplateInUrl() {
  const p = getParams();
  if (p.template) return;
  if (manifest.templates.length === 0) return;
  setParams({ template: manifest.templates[0].name });
}

async function bootstrap() {
  // First: migrate any legacy ?width= param to ?mode= (silently rewrites URL).
  const migrated = migrateUrlParams(window.location.href);
  if (migrated !== window.location.href) {
    window.history.replaceState(null, '', migrated);
  }

  await loadManifest();
  await ensureTemplateInUrl();
  renderSidebar();
  applyMode();
  await refresh();
}

const events = new EventSource('/events');
events.onmessage = async function () {
  await loadManifest();
  renderSidebar();
  refresh();
};

bootstrap();
```

**Important notes for the implementer:**

- The blocks marked with `// (Keep the existing ...)` are placeholders for the unchanged code from the pre-task file. Read the current shell.js (pre-Task-2 state) and paste those sections verbatim. Do NOT modify them.
- The IIFE wrapper `(function () { ... })();` is REMOVED — module syntax provides its own scope.
- All `var`/`let`/`const` that were inside the IIFE become module-scoped.
- The `renderFixturePicker` call in the SSE handler from the original is REMOVED (it doesn't exist — was a leftover from fixture removal). If you see it, drop it.

- [ ] **Step 2.3: Update `src/server/public/shell.css`**

Two changes:

**(a)** Rename selectors so the existing styling still applies to the renamed elements. Find every `.width-controls` and `.width-btn` and `.width-custom` in shell.css and rename:

- `.width-controls` → `.mode-controls`
- `.width-btn` → `.mode-btn`
- `.width-custom` → (delete the rule block entirely — input is gone)

**(b)** Add iOS Mail mode clipping. Append near the existing `.phone-iframe-container` styles:

```css
/* iOS Mail mode: iframe renders at 980px virtual viewport and is
   transform-scaled by JS to fit the 375 container. Container must clip
   overflow so the scaled-down 980px iframe doesn't bleed outside its
   visual bounds. */
.phone-iframe-container,
.preview-plain {
  overflow: hidden;
}
```

Use `grep -n "phone-iframe-container\|preview-plain\|width-controls\|width-btn\|width-custom" src/server/public/shell.css` to locate all selectors that need editing.

- [ ] **Step 2.4: Smoke-test the dev server manually**

Run: `node --experimental-strip-types src/cli/index.ts dev`

Open the printed URL in a browser. Verify:

- The header shows four mode buttons: **iOS Mail**, **Gmail mobile**, **Desktop**, **Full**. No numeric input.
- First load: **iOS Mail** is active (the default).
- iOS Mail mode: the iframe is wrapped in the phone chrome. Email content appears scaled-down — a typical non-responsive email (try `test-templates/styled.ftlh`) should be visibly smaller, fitting fully into the 375 container.
- Click **Gmail mobile**: phone chrome stays(? — verify), iframe content goes back to 1:1 at 375 wide.
- Click **Desktop**: 600px wide, no chrome, 1:1.
- Click **Full**: container fills available width, no chrome.
- URL bar updates with `?mode=...` on each click.
- Navigate to `http://localhost:5173/?template=hello.ftlh&width=375` directly — URL should silently rewrite to `?mode=gmail-mobile`.

Note any layout glitches. If iOS Mail mode shows the iframe blowing out of the container or has the wrong height proportion, the `containerHeight / cfg.scale` math may need adjustment — verify the container is the expected element and has a non-zero clientHeight at the time `applyMode` runs.

Hit Ctrl+C to stop the dev server.

- [ ] **Step 2.5: Run the full test suite**

Run: `npm test`
Expected: 23 files, all green (no test changes from this task).

- [ ] **Step 2.6: Commit**

```bash
git add src/server/public/index.html src/server/public/shell.js src/server/public/shell.css
git commit -m "$(cat <<'EOF'
feat(server)!: replace width controls with mode picker

BREAKING CHANGE: the dev preview's header no longer offers raw width
buttons or a custom-width input. Four mutually-exclusive modes replace
them: iOS Mail, Gmail mobile, Desktop, Full. The ?width= URL param is
replaced by ?mode= (legacy URLs migrate silently on load via
migrateUrlParams). Default mode is iOS Mail — existing users will see a
different rendering on first open after upgrading.

iOS Mail mode renders the iframe at 980px CSS width and applies
transform: scale(375/980) to fit the 375 container, simulating Apple
Mail's documented auto-zoom behavior for non-responsive emails.

Phone chrome (the DaisyUI mockup-phone wrapper) now ties to mode
(visible only in iOS Mail mode) rather than to the literal 375px width.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mirror changes in VS Code webview

**Why:** The VS Code preview pane builds its own webview HTML and bundles its own copy of shell.{js,css}. Same UX must land there too.

**Files:**

- Create: `src/vscode/webview/mode.js` (copy of `src/server/public/mode.js`)
- Modify: `src/vscode/webview/shell.js`
- Modify: `src/vscode/webview/shell.css`
- Modify: `src/vscode/preview-panel.ts`
- Modify: `src/vscode/preview-panel.test.ts`

### Steps

- [ ] **Step 3.1: Copy mode.js into the VS Code webview bundle**

```bash
cp src/server/public/mode.js src/vscode/webview/mode.js
```

This is intentional duplication. Both webview surfaces (browser + VS Code webview) need the file at their own asset roots because `vscode-build.config.ts` only copies from `src/vscode/webview/` into `dist/vscode/webview/`. A future refactor can hoist this to a single shared TS module + esbuild bundle, but that expands scope.

- [ ] **Step 3.2: Update `src/vscode/webview/shell.js`**

Read the file first — it's similar to the server version but uses `acquireVsCodeApi`, `vscode.postMessage`, and `vscode.setState` patterns and omits the sidebar/manifest code (templates come from the extension host).

Apply the same conceptual changes as Task 2.2:

- Add `import { modeConfig, migrateUrlParams } from './mode.js';` at the top.
- Remove the IIFE wrapper.
- Replace `applyWidth()` with `applyMode()` using identical logic to the server shell version (same DOM IDs, same iframe transform math). The `applyMode` function body is the SAME code as in Task 2.2 — copy verbatim.
- Replace `widthBtns` query selector with `modeBtns` (`.mode-btn`).
- Drop the `widthCustom` handler.
- Wire URL migrator at bootstrap (the VS Code webview uses `vscode.getState`/`vscode.setState` rather than URL state — verify whether legacy state needs migration. If state has a `width` field, migrate it to `mode`. If state isn't keyed by width at all, just default to `ios-mail` for state with no mode.)

- [ ] **Step 3.3: Update `src/vscode/webview/shell.css`**

Same changes as Task 2.3:

- Rename `.width-controls` → `.mode-controls`, `.width-btn` → `.mode-btn`, drop `.width-custom`.
- Add the `overflow: hidden` rule for `.phone-iframe-container` and `.preview-plain`.

- [ ] **Step 3.4: Update `src/vscode/preview-panel.ts`**

In `buildWebviewHtml` around line 73-80, replace:

```ts
<div class="width-controls" role="group" aria-label="preview width">
  <button type="button" class="width-btn" data-width="375" title="Mobile (375px)">375</button>
  <button type="button" class="width-btn" data-width="600" title="Desktop (600px)">600</button>
  <button type="button" class="width-btn" data-width="full" title="Full container width">Full</button>
  <input type="number" class="width-custom" id="width-custom" min="200" max="2000" placeholder="px" aria-label="custom width">
</div>
```

with:

```ts
<div class="mode-controls" role="group" aria-label="preview mode">
  <button type="button" class="mode-btn" data-mode="ios-mail" title="Apple Mail iOS — 980px virtual viewport, scaled to fit 375">iOS Mail</button>
  <button type="button" class="mode-btn" data-mode="gmail-mobile" title="Gmail mobile — 375px 1:1, responsive CSS fires">Gmail mobile</button>
  <button type="button" class="mode-btn" data-mode="desktop" title="Desktop — 600px">Desktop</button>
  <button type="button" class="mode-btn" data-mode="full" title="Full container width">Full</button>
</div>
```

At line 131, change:

```ts
<script src="${uris.shellJs}"></script>
```

to:

```ts
<script type="module" src="${uris.shellJs}"></script>
```

Also need to update `WebviewAssetUris` / `resolveAssetUris` (around lines 151-162) to include `modeJs` since mode.js needs a webview-safe URI:

```ts
export interface WebviewAssetUris {
  cspSource: string
  daisyuiCss: string
  shellCss: string
  shellJs: string
  modeJs: string  // NEW
}

function resolveAssetUris(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): WebviewAssetUris {
  const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'vscode', 'webview')
  const bust = Date.now()
  const uri = (name: string) =>
    `${panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, name))}?v=${bust}`
  return {
    cspSource: panel.webview.cspSource,
    daisyuiCss: uri('daisyui.css'),
    shellCss: uri('shell.css'),
    shellJs: uri('shell.js'),
    modeJs: uri('mode.js'),  // NEW
  }
}
```

Actually, on reflection: the webview JS bundle uses relative imports (`from './mode.js'`), and the browser resolves those relative to the script's own URL. Since shell.js is served from the webview root, `./mode.js` resolves to the same root — no separate URI needed in the asset bundle. The `modeJs` field is unnecessary; remove it from `WebviewAssetUris`.

The only real change to `WebviewAssetUris` / `resolveAssetUris` is **none** — they don't need to know about mode.js as long as both files live in the same webview root (which Task 3.5 ensures).

- [ ] **Step 3.5: Update `vscode-build.config.ts`**

The `copyAssets()` function copies the whole `src/vscode/webview/` directory recursively. As long as `mode.js` was added there in Step 3.1, no config change is needed.

Verify by reading the file:

```bash
cat vscode-build.config.ts | grep -A1 "src/vscode/webview"
```

Expected output:
```
  cpSync('src/vscode/webview', 'dist/vscode/webview', { recursive: true })
```

The `recursive: true` picks up `mode.js` automatically. No code change.

- [ ] **Step 3.6: Update `src/vscode/preview-panel.test.ts`**

Find any test assertions referencing the old button class/attribute names:

```bash
grep -n "width-btn\|data-width\|width-custom" src/vscode/preview-panel.test.ts
```

For each match, update to the new shape:
- `width-btn` → `mode-btn`
- `data-width="375"` → `data-mode="ios-mail"` (or whichever mode the test exercises)
- `data-width="600"` → `data-mode="desktop"`
- `data-width="full"` → `data-mode="full"`
- `width-custom` (any reference) → DELETE the assertion; the input no longer exists

If a test was specifically about parsing custom-width input behavior, delete that test.

- [ ] **Step 3.7: Build the VS Code extension**

Run: `npm run vscode:build`
Expected: builds clean. Verify `dist/vscode/webview/mode.js` exists after:

```bash
ls dist/vscode/webview/
```

Expected: includes `mode.js` (along with `shell.js`, `shell.css`, `daisyui.css`).

- [ ] **Step 3.8: Run the full test suite**

Run: `npm test`
Expected: 23 files, all green. The preview-panel tests should pass with the new assertions.

- [ ] **Step 3.9: Commit**

```bash
git add src/vscode/webview/mode.js src/vscode/webview/shell.js src/vscode/webview/shell.css \
        src/vscode/preview-panel.ts src/vscode/preview-panel.test.ts
git commit -m "$(cat <<'EOF'
feat(vscode)!: replace width controls with mode picker in preview webview

BREAKING CHANGE: the VS Code preview webview's header swaps width
buttons for the iOS Mail / Gmail mobile / Desktop / Full picker
established in the server shell. Includes the same iOS Mail
980px-virtual-viewport scaling, and the phone chrome ties to mode
rather than width.

mode.js is duplicated at src/vscode/webview/mode.js because the
extension's build pipeline copies only from src/vscode/webview/. A
future refactor can hoist both copies to a shared esbuild bundle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Document the modes in README

**Files:**

- Modify: `README.md`

### Steps

- [ ] **Step 4.1: Locate the existing preview / width docs**

Run:

```bash
grep -n "width\|375\|600\|--port\|dev server" README.md | head -20
```

Find the section that describes the dev server UI (likely under a Quickstart / Dev server / Preview section).

- [ ] **Step 4.2: Add a "Mobile-client modes" subsection**

Append (or insert near the dev-server docs) a section like:

```markdown
### Mobile-client modes

The dev preview's header picker chooses how the iframe renders:

| Mode | Behavior |
| --- | --- |
| **iOS Mail** (default) | 980px virtual viewport, scaled to fit 375px container; phone chrome on. Simulates Apple Mail's auto-zoom for non-responsive emails ([Safari iOS uses 980px by default](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/UsingtheViewport/UsingtheViewport.html)). |
| **Gmail mobile** | 375px container, iframe 1:1. Responsive CSS in your template fires. Matches Gmail mobile with `<meta name="viewport" content="width=device-width">` set. |
| **Desktop** | 600px container, 1:1. Standard email design width. |
| **Full** | Iframe fills the container width. Useful for wide layouts. |

State persists in the URL via `?mode=`. Legacy `?width=` bookmarks migrate silently to the equivalent mode on load.
```

- [ ] **Step 4.3: Remove any stale references**

Grep for things that mention the removed surface:

```bash
grep -n "--width\|custom width\|width-custom\|?width=" README.md
```

Update or delete each match. Most likely candidates: a section describing the width buttons + custom input, or a sample URL with `?width=`.

- [ ] **Step 4.4: Visual sanity scan**

Open README.md in your editor. Read top-to-bottom. Look for:

- The new section reads naturally in context (not floating).
- Headers form a sensible flow.
- No orphan paragraphs left over from deletions.

- [ ] **Step 4.5: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document mobile-client fidelity modes

Adds a Mobile-client modes section to README describing the four-mode
picker (iOS Mail, Gmail mobile, Desktop, Full), each mode's rendering
behavior, and the legacy ?width= URL migration. Removes references to
the dropped custom-width input.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Release v0.2.0

**Why:** Cut the release. The `feat!` commits drive a minor bump (0.1.0 → 0.2.0) per changelogen + pre-1.0 conventions.

### Steps

- [ ] **Step 5.1: Dry-run changelogen — PREVIEW ONLY, do not use `--bump` or `--release`**

Run: `npx changelogen --from=v0.1.0 --to=HEAD`
Expected: prints proposed changelog content for v0.2.0. Verify:

- All 4 work commits from Tasks 1-4 appear.
- The two `feat!` commits (Task 2 server, Task 3 vscode) appear in a Breaking Changes section.
- The proposed bump is **0.1.0 → 0.2.0**.

**Critical:** do NOT run `npx changelogen --bump` — that mutates package.json AND CHANGELOG.md silently. The previous release botched v0.1.0 → v0.2.0 by running --bump in a dry-run subagent. Read-only output only at this step.

- [ ] **Step 5.2: Run the release**

```bash
npm run release
```

Expected output: `Bumping npm package version from 0.1.0 to 0.2.0`. Creates a new commit (`chore(release): v0.2.0`) and tags `v0.2.0` locally.

If the bump says anything other than `0.1.0 to 0.2.0` (e.g., `0.2.0 to 0.3.0`), STOP — package.json was somehow pre-bumped. Recovery: `git reset --hard <previous-HEAD>`, delete the local tag, investigate, then re-run.

- [ ] **Step 5.3: Verify**

```bash
git log --oneline -3
git tag -l 'v0.2.0'
head -50 CHANGELOG.md
grep '"version"' package.json | head -1
```

Expected: latest commit is `chore(release): v0.2.0`, tag exists locally, CHANGELOG.md has a single `## v0.2.0` section, package.json shows `0.2.0`.

- [ ] **Step 5.4: Push commits + tag**

```bash
git push origin main
git push origin v0.2.0
```

- [ ] **Step 5.5: Create GitHub release**

Extract the v0.2.0 section from CHANGELOG.md and create the release:

```bash
awk '/^## v0\.2\.0/{flag=1; next} /^## v/{flag=0} flag' CHANGELOG.md > /tmp/v0.2.0-notes.md
gh release create v0.2.0 --title "v0.2.0 — mobile-client fidelity" --notes-file /tmp/v0.2.0-notes.md
```

Verify with `gh release view v0.2.0`.

- [ ] **Step 5.6: Close issue #44**

```bash
gh issue close 44 --reason completed --comment "Shipped in v0.2.0 — see CHANGELOG. Four-mode picker (iOS Mail / Gmail mobile / Desktop / Full) replaces the width controls in both the web shell and the VS Code preview panel. iOS Mail mode simulates Apple Mail's documented auto-zoom by rendering at a 980px virtual viewport and scale-transforming to fit the 375px container."
```

---

## Post-completion verification

After Task 5:

- [ ] Full test suite green: `npm test`
- [ ] `grep -rn "width-btn\|width-controls\|width-custom\|--width\|applyWidth" src --include='*.ts' --include='*.js' --include='*.css' --include='*.html'` returns zero matches (only the renamed/removed identifiers are present)
- [ ] `package.json` version is `0.2.0`
- [ ] CHANGELOG.md has a populated v0.2.0 section
- [ ] GitHub release v0.2.0 exists and is the Latest release
- [ ] Issue #44 is closed
- [ ] Manual smoke test: load the dev server, cycle through all four modes, verify each visually matches its description. Test with a known non-responsive template (e.g., one of the `test-templates/*.ftlh` files that doesn't include `<meta name="viewport">`).
