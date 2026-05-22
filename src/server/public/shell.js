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

/* ---------- sidebar + fixture picker ---------- */

// Persist which folders are open across reloads. The DOM gets re-rendered
// on every selection, so we serialise to sessionStorage rather than rely
// on the live `<details open>` attribute.
const FOLDER_STATE_KEY = 'fmp:expandedFolders';

function loadExpandedFolders() {
  try {
    const raw = sessionStorage.getItem(FOLDER_STATE_KEY);
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch { return null; }
}

function saveExpandedFolders(set) {
  try {
    sessionStorage.setItem(FOLDER_STATE_KEY, JSON.stringify([...set]));
  } catch { /* sessionStorage unavailable; that's fine */ }
}

/**
 * Build a tree from the flat manifest.
 *   templates: [{ name: "email/welcome.ftlh", fixtures: [...] }, ...]
 */
function buildTree(templates) {
  const root = { type: 'folder', name: '', path: '', children: {} };
  for (const tpl of templates) {
    const parts = tpl.name.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      if (!node.children[part]) {
        node.children[part] = { type: 'folder', name: part, path, children: {} };
      }
      node = node.children[part];
    }
    const fileName = parts[parts.length - 1];
    node.children[fileName] = { type: 'file', name: fileName, path: tpl.name };
  }
  return root;
}

function sortedChildren(node) {
  return Object.values(node.children).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function defaultExpanded(tree) {
  const out = new Set();
  (function walk(node) {
    for (const child of Object.values(node.children)) {
      if (child.type === 'folder') { out.add(child.path); walk(child); }
    }
  })(tree);
  return out;
}

let expandedFolders = null;

function toggleFolder(path) {
  if (expandedFolders.has(path)) expandedFolders.delete(path);
  else expandedFolders.add(path);
  saveExpandedFolders(expandedFolders);
  renderSidebar();
}

function renderSidebar() {
  const p = getParams();
  sidebar.innerHTML = '';
  const tree = buildTree(manifest.templates);

  if (expandedFolders === null) {
    expandedFolders = loadExpandedFolders() ?? defaultExpanded(tree);
  }

  function emit(node, depth) {
    for (const child of sortedChildren(node)) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.paddingLeft = `${8 + depth * 14}px`;

      if (child.type === 'folder') {
        const expanded = expandedFolders.has(child.path);
        btn.className = 'folder-row';
        btn.setAttribute('aria-expanded', String(expanded));
        const chev = document.createElement('span');
        chev.className = 'tree-chevron';
        chev.textContent = expanded ? '▾' : '▸';
        const name = document.createElement('span');
        name.className = 'folder-name';
        name.textContent = child.name;
        name.title = child.path;
        btn.appendChild(chev);
        btn.appendChild(name);
        btn.addEventListener('click', () => toggleFolder(child.path));
        li.appendChild(btn);
        sidebar.appendChild(li);
        if (expanded) emit(child, depth + 1);
      } else {
        btn.className = 'template-row';
        const spacer = document.createElement('span');
        spacer.className = 'tree-spacer';
        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = child.name;
        btn.appendChild(spacer);
        btn.appendChild(name);
        btn.title = child.path;
        if (child.path === p.template) btn.setAttribute('aria-current', 'true');
        btn.addEventListener('click', () => selectTemplate(child.path));
        li.appendChild(btn);
        sidebar.appendChild(li);
      }
    }
  }
  emit(tree, 0);
}

function selectTemplate(name) {
  setParams({ template: name });
  renderSidebar();
  refresh();
}

/* ---------- mode controls ---------- */

let scaleObserver = null;

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

  if (scaleObserver) {
    scaleObserver.disconnect();
    scaleObserver = null;
  }

  // iOS Mail scale: render iframe at 980px CSS width, transform-scale to fit
  // the 375px container. Height is derived from container height / scale so
  // the visual viewport fills the container vertically. A ResizeObserver
  // handles two cases the synchronous read can't: cold load (the mockup-phone
  // wrapper's aspect-ratio layout hasn't settled, so clientHeight is 0) and
  // browser window resizes mid-session.
  if (cfg.scale !== 1) {
    iframe.style.width = cfg.iframeWidth;
    iframe.style.transform = `scale(${cfg.scale})`;
    iframe.style.transformOrigin = 'top left';
    scaleObserver = new ResizeObserver(() => {
      const h = targetContainer.clientHeight;
      if (h > 0) iframe.style.height = `${h / cfg.scale}px`;
    });
    scaleObserver.observe(targetContainer);
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

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setParams({ mode: btn.dataset.mode });
    applyMode();
  });
});

/* ---------- error overlay ---------- */

function hideOverlay() { overlay.hidden = true; }

function showError(error) {
  overlayType.textContent = error.type || 'error';
  const loc = error.templatePath
    ? error.line
      ? error.templatePath + ':' + error.line + (error.column ? ':' + error.column : '')
      : error.templatePath
    : '';
  overlayLocation.textContent = loc;
  overlayMessage.textContent = error.message || '';

  if (error.snippet && Array.isArray(error.snippet.lines)) {
    const start = error.snippet.startLine;
    const errLine = error.snippet.errorLine;
    const lines = error.snippet.lines;
    const gutter = String(start + lines.length - 1).length;
    const html = lines.map(function (text, i) {
      const n = start + i;
      const num = String(n).padStart(gutter, ' ');
      const prefix = n === errLine ? '>' : ' ';
      const body = prefix + ' ' + num + ' | ' + escapeHtml(text);
      return n === errLine
        ? '<span class="err-line">' + body + '</span>'
        : body;
    }).join('\n');
    overlaySnippet.innerHTML = html;
    overlaySnippet.hidden = false;
  } else {
    overlaySnippet.textContent = '';
    overlaySnippet.hidden = true;
  }
  overlay.hidden = false;
}

overlayDismiss.addEventListener('click', hideOverlay);

/* ---------- render pipeline ---------- */

let inFlight = null;
async function refresh() {
  const p = getParams();
  if (!p.template) return;

  if (inFlight) inFlight.abort();
  const ctrl = new AbortController();
  inFlight = ctrl;

  setStatus('rendering');

  const qs = new URLSearchParams();
  qs.set('template', p.template);

  try {
    const res = await fetch('/render?' + qs.toString(), { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;

    if (!res.ok) {
      let body;
      try { body = await res.json(); }
      catch { body = { error: { type: 'internal', message: await res.text() } }; }
      if (ctrl.signal.aborted) return;
      showError(body && body.error ? body.error : { message: 'unknown error' });
      setStatus('error');
      return;
    }

    const html = await res.text();
    if (ctrl.signal.aborted) return;
    iframe.srcdoc = html;
    hideOverlay();
    setStatus('idle');
  } catch (err) {
    if (ctrl.signal.aborted) return;
    showError({ type: 'internal', message: String(err) });
    setStatus('error');
  } finally {
    if (inFlight === ctrl) inFlight = null;
  }
}

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
  // Migrate any legacy ?width= param to ?mode= (silently rewrites URL).
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
