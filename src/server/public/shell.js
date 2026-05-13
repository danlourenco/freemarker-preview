(function () {
  const iframe = document.getElementById('preview');
  const iframeWrap = document.getElementById('iframe-wrap');
  const status = document.getElementById('status');
  const statusLabel = document.getElementById('status-label');
  const sidebar = document.getElementById('templates');
  const widthBtns = document.querySelectorAll('.width-btn');
  const widthCustom = document.getElementById('width-custom');
  const darkToggle = document.getElementById('dark-toggle');
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
      width: u.searchParams.get('width'),
      dark: u.searchParams.get('dark') === '1',
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

  /* ---------- width controls ---------- */

  function applyWidth() {
    const p = getParams();
    let cssWidth = '600px';
    let active = '600';
    let custom = '';

    if (p.width === 'full') {
      cssWidth = '100%';
      active = 'full';
    } else if (p.width === '375') {
      cssWidth = '375px';
      active = '375';
    } else if (p.width === '600' || !p.width) {
      cssWidth = '600px';
      active = '600';
    } else if (/^\d+$/.test(p.width)) {
      cssWidth = p.width + 'px';
      active = '';
      custom = p.width;
    }
    iframeWrap.style.setProperty('--preview-width', cssWidth);
    for (const btn of widthBtns) {
      btn.setAttribute(
        'aria-pressed',
        String(btn.dataset.width === active),
      );
    }
    if (document.activeElement !== widthCustom) {
      widthCustom.value = custom;
    }

    // Slot the iframe into the phone chrome (DaisyUI mockup-phone) when in
    // 375 mode; otherwise back into the plain container. Reparenting causes
    // a one-time iframe reload in some browsers, which is acceptable — the
    // user explicitly toggled width.
    const phoneMode = active === '375';
    const phoneDisplay = document.getElementById('phone-display');
    const previewPlain = document.getElementById('preview-plain');
    iframeWrap.dataset.mode = phoneMode ? 'phone' : 'plain';
    const targetContainer = phoneMode ? phoneDisplay : previewPlain;
    if (iframe.parentElement !== targetContainer) {
      targetContainer.appendChild(iframe);
    }
    applyPhoneZoom();
  }

  /**
   * Match what a real mobile mail client does for emails that lack
   * `<meta name="viewport" content="width=device-width">`: render at a
   * 980px virtual viewport and scale-to-fit. That's why a viewport-less
   * email looks tiny on your phone — clients fake a desktop viewport and
   * shrink it. We do the same here so the preview matches reality.
   *
   * Templates that DO declare a device-width viewport are authored for
   * mobile; we render them at the native 375 CSS-px viewport (no scale).
   *
   * Only applies in phone mode — desktop / full widths render unscaled.
   */
  const VIRTUAL_VIEWPORT_PX = 980;
  function applyPhoneZoom() {
    const inPhone = iframeWrap.dataset.mode === 'phone';
    if (!inPhone) {
      iframe.style.width = '';
      iframe.style.height = '';
      iframe.style.transform = '';
      iframe.style.transformOrigin = '';
      return;
    }
    let hasDeviceWidthViewport = false;
    try {
      const doc = iframe.contentDocument;
      const meta = doc && doc.querySelector('head meta[name="viewport"]');
      hasDeviceWidthViewport =
        !!meta && /width\s*=\s*device-width/i.test(meta.getAttribute('content') || '');
    } catch {
      /* iframe not ready / cross-origin — fall through to scaled view */
    }
    if (hasDeviceWidthViewport) {
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.transform = '';
      iframe.style.transformOrigin = '';
      return;
    }
    const display = document.getElementById('phone-display');
    const w = display.clientWidth || 375;
    const h = display.clientHeight || 600;
    const scale = w / VIRTUAL_VIEWPORT_PX;
    iframe.style.width = `${VIRTUAL_VIEWPORT_PX}px`;
    iframe.style.height = `${h / scale}px`;
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = '0 0';
  }

  // Re-apply zoom logic after each render lands in the iframe — the new
  // document may or may not have a viewport meta tag.
  iframe.addEventListener('load', applyPhoneZoom);

  widthBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      setParams({ width: btn.dataset.width });
      applyWidth();
    });
  });

  widthCustom.addEventListener('change', () => {
    const n = parseInt(widthCustom.value, 10);
    if (Number.isFinite(n) && n > 0) {
      setParams({ width: String(n) });
      applyWidth();
    }
  });

  /* ---------- dark toggle ---------- */

  function applyDark() {
    const p = getParams();
    darkToggle.setAttribute('aria-pressed', String(p.dark));
    iframe.style.colorScheme = p.dark ? 'dark' : '';
  }

  darkToggle.addEventListener('click', () => {
    const p = getParams();
    setParams({ dark: !p.dark });
    applyDark();
    refresh();
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
    if (p.dark) qs.set('dark', '1');

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
    await loadManifest();
    await ensureTemplateInUrl();
    renderSidebar();
    applyWidth();
    applyDark();
    await refresh();
  }

  const events = new EventSource('/events');
  events.onmessage = async function () {
    await loadManifest();
    renderSidebar();
    renderFixturePicker();
    refresh();
  };

  bootstrap();
})();
