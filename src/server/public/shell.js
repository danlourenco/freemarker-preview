(function () {
  const iframe = document.getElementById('preview');
  const iframeWrap = document.getElementById('iframe-wrap');
  const status = document.getElementById('status');
  const statusLabel = document.getElementById('status-label');
  const sidebar = document.getElementById('templates');
  const fixtures = document.getElementById('fixtures');
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
      fixture: u.searchParams.get('fixture'),
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

  function renderSidebar() {
    const p = getParams();
    sidebar.innerHTML = '';
    for (const tpl of manifest.templates) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-row';
      btn.textContent = tpl.name;
      btn.title = tpl.name;
      if (tpl.name === p.template) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', () => selectTemplate(tpl.name));
      li.appendChild(btn);
      sidebar.appendChild(li);
    }
  }

  function renderFixturePicker() {
    const p = getParams();
    const tpl = manifest.templates.find((t) => t.name === p.template);
    fixtures.innerHTML = '';
    if (!tpl || tpl.fixtures.length === 0) return;
    for (const fix of tpl.fixtures) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fixture-pill';
      btn.role = 'tab';
      btn.textContent = fix;
      btn.setAttribute('aria-selected', String(fix === p.fixture));
      btn.addEventListener('click', () => selectFixture(fix));
      fixtures.appendChild(btn);
    }
  }

  function selectTemplate(name) {
    const tpl = manifest.templates.find((t) => t.name === name);
    const fixture = tpl && tpl.fixtures.length > 0 ? tpl.fixtures[0] : null;
    setParams({ template: name, fixture });
    renderSidebar();
    renderFixturePicker();
    refresh();
  }

  function selectFixture(name) {
    setParams({ fixture: name });
    renderFixturePicker();
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
  }

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
    if (p.fixture) qs.set('fixture', p.fixture);
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
    const first = manifest.templates[0];
    const updates = { template: first.name };
    if (first.fixtures.length > 0) updates.fixture = first.fixtures[0];
    setParams(updates);
  }

  async function bootstrap() {
    await loadManifest();
    await ensureTemplateInUrl();
    renderSidebar();
    renderFixturePicker();
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
