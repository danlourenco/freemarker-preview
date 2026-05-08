(function () {
  const iframe = document.getElementById('preview');
  const meta = document.getElementById('meta');
  const status = document.getElementById('status');
  const statusLabel = document.getElementById('status-label');
  const overlay = document.getElementById('overlay');
  const overlayType = document.getElementById('overlay-type');
  const overlayLocation = document.getElementById('overlay-location');
  const overlayMessage = document.getElementById('overlay-message');
  const overlaySnippet = document.getElementById('overlay-snippet');
  const overlayDismiss = document.getElementById('overlay-dismiss');

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
    };
  }

  function setMeta(p) {
    meta.textContent = p.template
      ? p.fixture
        ? p.template + ' · ' + p.fixture
        : p.template
      : '(no template selected)';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

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

  let inFlight = null;
  async function refresh() {
    const p = getParams();
    setMeta(p);
    if (!p.template) return;

    if (inFlight) inFlight.abort();
    const ctrl = new AbortController();
    inFlight = ctrl;

    setStatus('rendering');

    const qs = new URLSearchParams();
    qs.set('template', p.template);
    if (p.fixture) qs.set('fixture', p.fixture);

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

  async function ensureTemplateInUrl() {
    const p = getParams();
    if (p.template) return;
    try {
      const res = await fetch('/api/discover');
      const data = await res.json();
      if (data.firstTemplate) {
        const u = new URL(window.location.href);
        u.searchParams.set('template', data.firstTemplate);
        window.history.replaceState(null, '', u.toString());
      }
    } catch {
      /* nothing to discover */
    }
  }

  const events = new EventSource('/events');
  events.onmessage = function () { refresh(); };

  ensureTemplateInUrl().then(refresh);
})();
