/* HR Compliance Health Check: the pop-up card (index.html)
 *
 * Opens from every [data-hc-open] button and from /?health-check. Renders
 * from the question bank served by GET /api/health-check, one section per
 * step: about the business, each area that applies, then where to send the
 * report. Progress is kept in this browser (localStorage) so people can leave
 * and come back. POST /api/health-check scores the answers on the server and
 * emails the report; the results then open on /health-check-results.
 * Exposes window.hrhHealthCheck.open() for other scripts (the booking card).
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORE_KEY = 'hrh-health-check-v1';
  const RESULT_KEY = 'hrh-health-check-result';
  const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
  const PHONE_RE = /^\+?[\d\s()-]{9,}$/;
  const ROLES = ['Owner / Director', 'HR / People', 'Finance / Payroll', 'Manager', 'Other'];

  const drawer = $('[data-hc-drawer]');
  if (!drawer) return;
  const panel = $('.hcd__panel', drawer);
  const form = $('[data-hc-form]', drawer);
  const body = $('[data-hc-body]', drawer);
  const intro = $('[data-hc-intro]', drawer);
  const stage = $('[data-hc-stage]', drawer);
  const progress = $('[data-hc-progress]', drawer);
  const errorEl = $('[data-hc-error]', drawer);
  const backBtn = $('[data-hc-back]', drawer);
  const nextBtn = $('[data-hc-next]', drawer);
  const nextLabel = $('[data-hc-nextlabel]', drawer);
  const stepLabel = $('[data-hc-steplabel]', drawer);
  const pctEl = $('[data-hc-pct]', drawer);
  const bar = $('[data-hc-bar]', drawer);
  const resumeEl = $('[data-hc-resume]', drawer);

  let bank = null;
  let bankPromise = null;
  let started = false;
  const blank = () => ({ step: 0, profile: {}, answers: {}, details: { name: '', email: '', company: '', phone: '', role: '', contactOk: false, consent: false } });
  let state = blank();

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, savedAt: Date.now() })); } catch (e) { /* storage unavailable */ } };
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } };
  const clearSaved = () => { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage unavailable */ } };

  const loadBank = () => {
    if (!bankPromise) {
      bankPromise = fetch('/api/health-check', { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((d) => { if (!d || !d.ok) throw new Error('bad bank'); bank = d; return d; });
      bankPromise.catch(() => { bankPromise = null; });
    }
    return bankPromise;
  };

  /* Same rules as src/healthcheck/questions.ts → conditions(). */
  function conditions(p) {
    const band = bank.profile[0].options.indexOf(p.employees || '');
    return { ee: band >= 3, ohsReps: band >= 2, sdl: p.payroll === 'Yes' || p.payroll === 'Not sure', foreign: p.foreign === 'Yes' || p.foreign === 'Not sure' };
  }
  function applicable() {
    const c = conditions(state.profile);
    const areaOn = new Map(bank.areas.map((a) => [a.id, !a.when || c[a.when]]));
    return bank.questions.filter((q) => areaOn.get(q.area) && (!q.when || c[q.when]));
  }
  /** Steps: profile, each applicable area, details. */
  function steps() {
    const qs = applicable();
    const areas = bank.areas.filter((a) => qs.some((q) => q.area === a.id));
    return [{ kind: 'profile', title: 'Your business' }, ...areas.map((a) => ({ kind: 'area', area: a, title: a.title, questions: qs.filter((q) => q.area === a.id) })), { kind: 'details', title: 'Your report' }];
  }

  /* ---------------- open / close ---------------- */

  let lastTrigger = null;
  let closeTimer = 0;

  function open(trigger) {
    clearTimeout(closeTimer);
    lastTrigger = trigger || document.activeElement;
    drawer.hidden = false;
    void drawer.offsetWidth; // let the closed state paint so the slide animates
    drawer.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    $('.booking__close', drawer).focus({ preventScroll: true });
    loadBank().then(showStart, () => {
      errorEl.textContent = 'The health check couldn’t load. Please check your connection and try again.';
    });
  }
  function close() {
    if (drawer.hidden) return;
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    closeTimer = setTimeout(() => { drawer.hidden = true; }, reduceMotion ? 0 : 600);
    if (lastTrigger && document.contains(lastTrigger) && lastTrigger.offsetParent) lastTrigger.focus({ preventScroll: true });
  }

  /** The start screen, offering to resume a check already under way. */
  function showStart() {
    if (started) return;
    const saved = load();
    const recent = saved && saved.savedAt && Date.now() - saved.savedAt < 30 * 86400000;
    const hasProgress = recent && (Object.keys(saved.answers || {}).length || Object.keys(saved.profile || {}).length);
    resumeEl.hidden = !hasProgress;
    nextBtn.hidden = Boolean(hasProgress);
    nextLabel.textContent = 'Start the check';
  }

  function begin(fromSaved) {
    if (window.hrhTrack) window.hrhTrack('hc_start');
    if (fromSaved) {
      const saved = load() || {};
      state = { ...blank(), ...saved, details: { ...blank().details, ...(saved.details || {}) } };
    } else {
      state = blank();
      clearSaved();
    }
    started = true;
    intro.hidden = true;
    stage.hidden = false;
    progress.hidden = false;
    nextBtn.hidden = false;
    render();
  }

  $$('[data-hc-open]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    open(el.closest('.menu') ? $('[data-menu-open]') : el);
  }));
  $$('[data-hc-close]', drawer).forEach((el) => el.addEventListener('click', close));
  $('[data-hc-continue]', drawer).addEventListener('click', () => begin(true));
  $('[data-hc-restart]', drawer).addEventListener('click', () => begin(false));

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const focusables = $$('a[href], button:not([disabled]), input:not([type="hidden"]):not([tabindex="-1"]), select, textarea', panel)
      .filter((el) => el.offsetParent !== null);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  window.hrhHealthCheck = { open: () => open() };

  /* ---------------- rendering ---------------- */

  const profileComplete = () => bank.profile.every((p) => state.profile[p.id]);

  function renderProgress(list) {
    const qs = applicable();
    const answered = qs.filter((q) => state.answers[q.id]).length;
    const pct = qs.length ? Math.round((answered / qs.length) * 100) : 0;
    const s = list[state.step];
    stepLabel.textContent = `Step ${state.step + 1} of ${list.length} · ${s.title}`;
    pctEl.textContent = profileComplete() ? `${pct}% answered` : '';
    bar.style.transform = `scaleX(${Math.max(0.03, (state.step + (s.kind === 'details' ? 1 : 0)) / (list.length - 1 || 1))})`;
  }

  function choice(name, value, label, checked) {
    return `<label class="hc-pill"><input type="radio" name="${esc(name)}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  }

  function renderProfile() {
    return `
      <header class="hc-stage__head">
        <p class="eyebrow">About your business</p>
        <h3 class="hc-stage__title">First, a little about you.</h3>
        <p class="hc-stage__intro">This decides which sections apply. Employment Equity, for example, has extra duties from 50 employees.</p>
      </header>
      ${bank.profile
        .map(
          (p) => `
        <div class="hc-q" role="radiogroup" aria-labelledby="hcq-${esc(p.id)}" data-q="${esc(p.id)}">
          <p class="hc-q__text" id="hcq-${esc(p.id)}">${esc(p.label)}</p>
          ${p.help ? `<p class="hc-q__help">${esc(p.help)}</p>` : ''}
          <div class="hc-pills">
            ${p.options.map((o) => choice(`profile-${p.id}`, o, o, state.profile[p.id] === o)).join('')}
          </div>
        </div>`,
        )
        .join('')}`;
  }

  function renderArea(s, index, total) {
    let n = 0;
    return `
      <header class="hc-stage__head">
        <p class="eyebrow">Section ${index} of ${total}</p>
        <h3 class="hc-stage__title">${esc(s.area.title)}</h3>
        <p class="hc-stage__intro">${esc(s.area.intro)} Answer for how things are today.</p>
      </header>
      ${s.questions
        .map((q) => {
          n++;
          const opts = bank.answers.filter((a) => a.value !== 'na' || q.allowNA);
          return `
        <div class="hc-q${state.answers[q.id] ? ' is-answered' : ''}" role="radiogroup" aria-labelledby="hcq-${esc(q.id)}" data-q="${esc(q.id)}">
          <p class="hc-q__text" id="hcq-${esc(q.id)}"><span class="hc-q__num" aria-hidden="true">${String(n).padStart(2, '0')}</span><span>${esc(q.text)}</span></p>
          <details class="hc-q__why">
            <summary>Why this matters</summary>
            <p>${esc(q.why)} <span class="hc-q__law">${esc(q.law)}</span></p>
          </details>
          <div class="hc-pills">
            ${opts.map((a) => choice(`q-${q.id}`, a.value, a.label, state.answers[q.id] === a.value)).join('')}
          </div>
        </div>`;
        })
        .join('')}`;
  }

  function renderDetails() {
    const d = state.details;
    const qs = applicable();
    return `
      <header class="hc-stage__head">
        <p class="eyebrow">Almost done</p>
        <h3 class="hc-stage__title">Where should we send your report?</h3>
        <p class="hc-stage__intro">You’ve answered all ${qs.length} questions. Your results open on the next page, and the full report goes to your inbox.</p>
      </header>
      <div class="hc-fields">
        <div class="field"><label for="hc-name">Name</label><input id="hc-name" name="name" type="text" autocomplete="name" maxlength="100" required value="${esc(d.name)}" aria-describedby="hc-name-err"><p class="field__error" id="hc-name-err" aria-live="polite"></p></div>
        <div class="field"><label for="hc-email">Email</label><input id="hc-email" name="email" type="email" autocomplete="email" maxlength="254" required value="${esc(d.email)}" aria-describedby="hc-email-err"><p class="field__error" id="hc-email-err" aria-live="polite"></p></div>
        <div class="field"><label for="hc-company">Company <span class="field__opt">(optional)</span></label><input id="hc-company" name="company" type="text" autocomplete="organization" maxlength="120" value="${esc(d.company)}"></div>
        <div class="field"><label for="hc-phone">Phone <span class="field__opt">(optional)</span></label><input id="hc-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" value="${esc(d.phone)}" aria-describedby="hc-phone-err"><p class="field__error" id="hc-phone-err" aria-live="polite"></p></div>
        <div class="field hc-fields__wide"><label for="hc-role">Your role <span class="field__opt">(optional)</span></label>
          <select id="hc-role" name="role" class="bk-select"><option value="">Select</option>${ROLES.map((r) => `<option${d.role === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
        </div>
      </div>
      <label class="hc-check">
        <input type="checkbox" name="contactOk"${d.contactOk ? ' checked' : ''}>
        <span>I’d like HR Hub to contact me to go through my results.</span>
      </label>
      <div class="field field--check hc-consent">
        <input id="hc-consent" name="consent" type="checkbox"${d.consent ? ' checked' : ''} aria-describedby="hc-consent-err">
        <label for="hc-consent">I agree that HR Hub Consultancy may use my answers and details to send my report and respond to me — see <a href="privacy-policy">Privacy Policy</a>.</label>
        <p class="field__error" id="hc-consent-err" aria-live="polite"></p>
      </div>`;
  }

  function render() {
    const list = steps();
    if (state.step >= list.length) state.step = list.length - 1;
    const s = list[state.step];
    stage.innerHTML = s.kind === 'profile' ? renderProfile() : s.kind === 'area' ? renderArea(s, state.step, list.length - 2) : renderDetails();
    stage.classList.remove('is-entering');
    void stage.offsetWidth;
    stage.classList.add('is-entering');
    backBtn.hidden = false;
    nextLabel.textContent = s.kind === 'details' ? 'See my results' : 'Continue';
    errorEl.textContent = '';
    renderProgress(list);
    body.scrollTop = 0;
    stage.focus({ preventScroll: true });
  }

  /* ---------------- interaction ---------------- */

  stage.addEventListener('change', (e) => {
    const t = e.target;
    if (t.type === 'radio') {
      if (t.name.startsWith('profile-')) {
        state.profile[t.name.slice(8)] = t.value;
      } else if (t.name.startsWith('q-')) {
        state.answers[t.name.slice(2)] = t.value;
        t.closest('.hc-q').classList.add('is-answered');
        // Glide to the next unanswered question in this section.
        const next = $$('.hc-q', stage).find((q) => !q.classList.contains('is-answered'));
        if (next && !reduceMotion) setTimeout(() => next.scrollIntoView({ behavior: 'smooth', block: 'center' }), 180);
      }
      const q = t.closest('.hc-q');
      if (q) q.classList.remove('is-missing');
      errorEl.textContent = '';
      renderProgress(steps());
    } else {
      readDetails();
    }
    save();
  });
  stage.addEventListener('input', () => { if (steps()[state.step].kind === 'details') { readDetails(); save(); } });

  function readDetails() {
    const f = (n) => form.elements.namedItem(n);
    if (!f('name')) return;
    state.details = {
      name: f('name').value,
      email: f('email').value,
      company: f('company').value,
      phone: f('phone').value,
      role: f('role').value,
      contactOk: f('contactOk').checked,
      consent: f('consent').checked,
    };
  }

  function setFieldError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
    const input = stage.querySelector(`[aria-describedby="${id}"]`);
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }

  function validateStep() {
    const s = steps()[state.step];
    if (s.kind !== 'details') {
      const missing = s.kind === 'profile' ? bank.profile.filter((p) => !state.profile[p.id]).map((p) => p.id) : s.questions.filter((q) => !state.answers[q.id]).map((q) => q.id);
      $$('.hc-q', stage).forEach((q) => q.classList.toggle('is-missing', missing.includes(q.dataset.q)));
      if (missing.length) {
        errorEl.textContent = missing.length === 1 ? 'Please answer the highlighted question.' : `Please answer the ${missing.length} highlighted questions.`;
        const first = $(`.hc-q[data-q="${missing[0]}"]`, stage);
        first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        $('input', first).focus({ preventScroll: true });
        return false;
      }
      return true;
    }
    readDetails();
    const d = state.details;
    const checks = [
      [setFieldError('hc-name-err', d.name.trim().length >= 2 ? '' : 'Please enter your name.'), 'hc-name'],
      [setFieldError('hc-email-err', EMAIL_RE.test(d.email.trim()) ? '' : d.email.trim() ? 'Please enter an email address in the format name@company.co.za.' : 'Please enter your email address so we can send your report.'), 'hc-email'],
      [setFieldError('hc-phone-err', !d.phone.trim() || PHONE_RE.test(d.phone.trim()) ? '' : 'Please enter a valid phone number.'), 'hc-phone'],
      [setFieldError('hc-consent-err', d.consent ? '' : 'Please confirm you agree so we can send your report.'), 'hc-consent'],
    ];
    const bad = checks.find(([ok]) => !ok);
    if (bad) document.getElementById(bad[1]).focus();
    return !bad;
  }

  backBtn.addEventListener('click', () => {
    if (state.step === 0) {
      // Back from the first step returns to the start screen.
      started = false;
      stage.hidden = true;
      progress.hidden = true;
      intro.hidden = false;
      backBtn.hidden = true;
      errorEl.textContent = '';
      save();
      showStart();
      return;
    }
    state.step--;
    save();
    render();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!bank) return;
    if (!started) { begin(false); return; }
    if (!validateStep()) return;
    if (state.step < steps().length - 1) {
      state.step++;
      save();
      render();
      return;
    }
    submit();
  });

  /* ---------------- submit ---------------- */

  function tracking() {
    const read = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const params = new URLSearchParams(location.search);
    const utm = read('hrh-utm') || {};
    ['source', 'medium', 'campaign', 'term', 'content'].forEach((k) => { const v = params.get(`utm_${k}`); if (v) utm[k] = v.slice(0, 100); });
    let referrer = read('hrh-ref') || '';
    try { if (!referrer && document.referrer && new URL(document.referrer).origin !== location.origin) referrer = document.referrer.slice(0, 300); } catch (e) { /* ignore */ }
    return { utm, referrer };
  }

  const stopSending = () => { nextBtn.disabled = false; nextBtn.classList.remove('is-loading'); };

  async function submit() {
    const answers = {};
    applicable().forEach((q) => { answers[q.id] = state.answers[q.id]; });
    const t = tracking();
    const d = state.details;
    nextBtn.disabled = true;
    nextBtn.classList.add('is-loading');
    errorEl.textContent = '';
    try {
      const res = await fetch('/api/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: d.name, email: d.email, company: d.company, phone: d.phone, role: d.role,
          contactOk: d.contactOk, consent: d.consent,
          profile: state.profile, answers,
          website: form.elements.namedItem('website').value,
          page: '/?health-check',
          utm: t.utm, referrer: t.referrer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const errs = data.errors || {};
        ['name', 'email', 'phone', 'consent'].forEach((k) => { if (errs[k]) setFieldError(`hc-${k}-err`, errs[k]); });
        errorEl.textContent = data.message || 'Your health check couldn’t be sent. Please try again, or call or email us.';
        stopSending();
        return;
      }
      clearSaved();
      if (window.hrhTrack) window.hrhTrack('hc_complete');
      // Hand the results to the results page (instant, and the only copy on the preview site).
      try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
      location.href = `health-check-results?ref=${encodeURIComponent(data.ref)}&k=${encodeURIComponent(data.key || '')}`;
    } catch (err) {
      errorEl.textContent = 'We couldn’t reach the server. Please check your connection and try again; your answers are saved.';
      stopSending();
    }
  }

  /* /?health-check (from the results page, or a campaign link) opens the card. */
  if (new URLSearchParams(location.search).has('health-check')) {
    const go = () => open();
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
})();
