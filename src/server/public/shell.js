(function () {
  const iframe = document.getElementById('preview');
  const meta = document.getElementById('meta');

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
        ? `${p.template} · ${p.fixture}`
        : p.template
      : '(no template selected)';
  }

  let inFlight = null;
  async function refresh() {
    const p = getParams();
    setMeta(p);
    if (!p.template) return;
    const qs = new URLSearchParams();
    qs.set('template', p.template);
    if (p.fixture) qs.set('fixture', p.fixture);

    if (inFlight) inFlight.abort();
    const ctrl = new AbortController();
    inFlight = ctrl;

    try {
      const res = await fetch('/render?' + qs.toString(), { signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.text();
        if (ctrl.signal.aborted) return;
        renderError(body);
        return;
      }
      const html = await res.text();
      if (ctrl.signal.aborted) return;
      iframe.srcdoc = html;
    } catch (err) {
      if (ctrl.signal.aborted) return;
      renderError(String(err));
    } finally {
      if (inFlight === ctrl) inFlight = null;
    }
  }

  function renderError(body) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { /* not json */ }
    const msg = parsed && parsed.error
      ? `${parsed.error.type}: ${parsed.error.message}`
      : body;
    iframe.srcdoc =
      '<html><body style="font-family:ui-monospace,monospace;padding:16px;color:#c00;white-space:pre-wrap">' +
      escapeHtml(msg) +
      '</body></html>';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
