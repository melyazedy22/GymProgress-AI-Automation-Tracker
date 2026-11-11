// FitWave shared helpers
const FITWAVE_CONFIG = {
  // Active workflows use /webhook. While testing in the n8n editor, use 'http://localhost:5678/webhook-test'
  N8N_BASE: 'http://localhost:5678/webhook',
  AUTH_PATH: 'fitwave-auth',
  COACH_PATH: 'fitwave-coach'
};

const FW = (() => {
  const KEY = 'fitwave_session';

  function saveSession(s) { sessionStorage.setItem(KEY, JSON.stringify(s)); }
  function getSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!s || !s.access_token) return null;
      if (s.expires_at && Date.now() / 1000 > s.expires_at - 30) { sessionStorage.removeItem(KEY); return null; }
      return s;
    } catch { return null; }
  }
  function updateSession(patch) { const s = getSession(); if (s) saveSession({ ...s, ...patch }); }
  function logout(reason) {
    sessionStorage.removeItem(KEY);
    location.href = 'index.html' + (reason ? '?' + encodeURIComponent(reason) + '=1' : '');
  }
  function requireSession() {
    const s = getSession();
    if (!s) { logout('expired'); throw new Error('No session'); }
    return s;
  }

  // Form-encoded body = "simple" CORS request (no preflight). n8n parses it into $json.body
  async function post(path, fields) {
    const body = new URLSearchParams();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) body.append(k, String(v)); });
    let res;
    try {
      res = await fetch(`${FITWAVE_CONFIG.N8N_BASE}/${path}`, { method: 'POST', body });
    } catch {
      return { ok: false, status: 0, data: { success: false, message: 'Cannot reach the server. Make sure n8n is running and the workflow is active.' } };
    }
    let data;
    try { data = await res.json(); } catch { data = { success: false, message: `Unexpected server response (HTTP ${res.status}).` }; }
    if (res.status === 401 && path !== FITWAVE_CONFIG.AUTH_PATH) logout('expired');
    return { ok: res.ok && data.success !== false, status: res.status, data };
  }
  function coach(action, fields = {}) {
    const s = requireSession();
    return post(FITWAVE_CONFIG.COACH_PATH, { action, access_token: s.access_token, ...fields });
  }

  // Safe DOM builder: AI text is always inserted as text, never as HTML
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') node.className = v; else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  function showMessage(box, content, type = 'info') {
    if (!content) { box.hidden = true; box.replaceChildren(); return; }
    box.className = `alert alert-${type}`;
    box.replaceChildren(content instanceof Node ? content : document.createTextNode(String(content)));
    box.hidden = false;
  }
  function setBusy(btn, busy, busyText) {
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyText || 'Please wait…'; btn.disabled = true; btn.classList.add('busy'); }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; btn.classList.remove('busy'); }
  }
  function renderTopbar(active) {
    const s = getSession();
    const chip = document.getElementById('topbar-user');
    if (chip && s) chip.textContent = s.full_name || s.email || '';
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === active));
    const out = document.getElementById('logout-btn');
    if (out) out.addEventListener('click', () => logout());
  }
  function membershipText(m) {
    const sub = m && m.subscription;
    if (!sub) return 'No active membership found.';
    const end = new Date(sub.end_date + 'T00:00:00Z');
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const days = Math.max(0, Math.round((end - today) / 86400000));
    const name = { trial: 'Free trial', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[sub.plan_type] || sub.plan_type;
    return `${name} membership · ${days} day${days === 1 ? '' : 's'} left (ends ${sub.end_date})`;
  }

  return { saveSession, getSession, updateSession, logout, requireSession, post, coach, el, showMessage, setBusy, renderTopbar, membershipText };
})();