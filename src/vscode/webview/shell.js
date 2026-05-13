(function () {
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const previewIframe = () => document.getElementById('preview');
  const iframeWrap = document.getElementById('iframe-wrap');
  const widthBtns = document.querySelectorAll('.width-btn');
  const widthCustom = document.getElementById('width-custom');

  let persisted = (vscode && vscode.getState && vscode.getState()) || {};
  function saveState(patch) {
    persisted = Object.assign({}, persisted, patch);
    if (vscode && vscode.setState) vscode.setState(persisted);
  }

  /* ---------- width controls ---------- */

  function applyWidth(width) {
    let cssWidth = '375px';
    let active = '375';
    let custom = '';

    if (width === 'full') {
      cssWidth = '100%';
      active = 'full';
    } else if (width === '600') {
      cssWidth = '600px';
      active = '600';
    } else if (width === '375' || !width) {
      cssWidth = '375px';
      active = '375';
    } else if (/^\d+$/.test(width)) {
      cssWidth = width + 'px';
      active = '';
      custom = width;
    }

    iframeWrap.style.setProperty('--preview-width', cssWidth);
    for (const btn of widthBtns) {
      btn.setAttribute('aria-pressed', String(btn.dataset.width === active));
    }
    if (document.activeElement !== widthCustom) widthCustom.value = custom;

    const phoneMode = active === '375';
    const phoneContainer = document.getElementById('phone-iframe-container');
    const plainContainer = document.getElementById('preview-plain');
    iframeWrap.dataset.mode = phoneMode ? 'phone' : 'plain';
    const target = phoneMode ? phoneContainer : plainContainer;
    const iframe = previewIframe();
    if (iframe && iframe.parentElement !== target) target.appendChild(iframe);
  }

  let currentWidth = persisted.width || '375';

  widthBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentWidth = btn.dataset.width;
      applyWidth(currentWidth);
      saveState({ width: currentWidth });
      if (vscode) vscode.postMessage({ type: 'widthChange', value: currentWidth });
    });
  });

  widthCustom.addEventListener('change', () => {
    const n = parseInt(widthCustom.value, 10);
    if (Number.isFinite(n) && n > 0) {
      currentWidth = String(n);
      applyWidth(currentWidth);
      saveState({ width: currentWidth });
      if (vscode) vscode.postMessage({ type: 'widthChange', value: currentWidth });
    }
  });

  /* ---------- mail chrome subject from <title> ---------- */

  function updateMailChrome() {
    const subjectEl = document.getElementById('mc-subject');
    const iframe = previewIframe();
    if (!subjectEl || !iframe) return;
    try {
      const doc = iframe.contentDocument;
      const title = doc && doc.querySelector('title');
      const text = title && title.textContent && title.textContent.trim();
      subjectEl.textContent = text || 'Email Subject';
    } catch {
      subjectEl.textContent = 'Email Subject';
    }
  }

  /* ---------- inbound render messages ---------- */

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'render' && typeof msg.html === 'string') {
      const iframe = previewIframe();
      if (!iframe) return;
      iframe.removeEventListener('load', updateMailChrome);
      iframe.addEventListener('load', updateMailChrome, { once: true });
      iframe.srcdoc = msg.html;
      if (typeof msg.templateUriPath === 'string') {
        saveState({ templateUriPath: msg.templateUriPath });
      }
    }
  });

  applyWidth(currentWidth);
})();
