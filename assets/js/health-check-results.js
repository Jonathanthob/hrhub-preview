/* HR Compliance Health Check: the results page (health-check-results.html)
 *
 * Opened with ?ref=…&k=… (the private link). Straight after the check, the
 * results come from this tab's sessionStorage; from the email link they come
 * from GET /api/health-check/result. "Download PDF" prints the page with a
 * print layout and a file name like HR-Compliance-Health-Check-Company.pdf.
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RESULT_KEY = 'hrh-health-check-result';
  const root = $('[data-hcr]');
  const meta = $('[data-hcr-meta]');
  const printMeta = $('[data-hcr-printmeta]');
  if (!root) return;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const ref = params.get('ref') || '';
  const key = params.get('k') || '';
  const PRIORITY = { 1: ['Fix first', 'Within the next 30 days'], 2: ['Next', 'Within 60–90 days'], 3: ['Then', 'As part of your regular HR review'] };
  const ANSWER = { yes: 'Yes', partly: 'Partly', no: 'No', unsure: 'Not sure', na: 'Doesn’t apply' };
  const longDate = (iso) => {
    try { return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
  };

  function failed() {
    meta.textContent = 'We couldn’t open these results.';
    root.innerHTML = `
      <div class="hc-card hcr-empty">
        <h2 class="hc-stage__title">This results link isn’t valid or has expired.</h2>
        <p>Results are kept for 12 months. Please use the link in your report email, or take the check again; it takes about seven minutes.</p>
        <div class="hc-res__btns"><a class="btn btn--dark" href="index.html?health-check">Take the Health Check</a><a class="btn btn--outline" href="index.html#contact">Contact us</a></div>
      </div>`;
  }

  function render(data) {
    const r = data.result;
    const date = longDate(data.createdAt) || longDate(new Date().toISOString());
    const who = data.company || '';
    meta.textContent = [who, date, `Reference ${data.ref}`].filter(Boolean).join(' · ');
    printMeta.textContent = [who ? `Prepared for ${who}` : '', date, `Reference ${data.ref}`].filter(Boolean).join(' · ');
    // Chrome and Edge use the page title as the PDF's file name.
    const day = new Date(data.createdAt || Date.now());
    const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    document.title = `HR-Compliance-Health-Check${who ? `-${who.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}` : ''}-${stamp}`;

    const top = r.actions.filter((a) => a.priority === 1).slice(0, 4);
    const shown = top.length ? top : r.actions.slice(0, 3);
    const circumference = 2 * Math.PI * 54;
    const strengths = Array.isArray(r.strengths) ? r.strengths : [];
    const groups = [1, 2, 3].map((p) => ({ p, items: r.actions.filter((a) => a.priority === p) })).filter((g) => g.items.length);
    let n = 0;

    let mail = '';
    if (data.preview) mail = 'Preview site: on the live website your full report would also be emailed to you, and HR Hub would receive your results.';
    else if (data.emailed === true) mail = `Your report is also on its way to <strong>${esc(data.email)}</strong>, with a link back to this page.`;
    else if (data.emailed === false) mail = 'We couldn’t email your report just now, but your results are saved and HR Hub will follow up. Download the PDF below to keep a copy.';

    root.innerHTML = `
      <div class="hc-res__head">
        <div class="hc-ring" style="--c:${circumference.toFixed(1)}; --v:${r.score}">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="hc-ring__track" cx="60" cy="60" r="54"/>
            <circle class="hc-ring__arc" cx="60" cy="60" r="54" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${circumference.toFixed(1)}"/>
          </svg>
          <p class="hc-ring__fig"><span data-hcr-count>${reduceMotion ? r.score : 0}</span><small>%</small></p>
        </div>
        <div class="hc-res__summary">
          <p class="eyebrow">Your result${data.firstName ? `, ${esc(data.firstName)}` : ''}</p>
          <h2 class="hc-res__band">${esc(r.band)}</h2>
          <p class="hc-res__text">${esc(r.bandText)}</p>
          <ul class="hc-res__stats">
            <li><strong>${r.criticalGaps}</strong> critical gap${r.criticalGaps === 1 ? '' : 's'}</li>
            <li><strong>${r.actions.length}</strong> action${r.actions.length === 1 ? '' : 's'} in your plan</li>
            <li><strong>${strengths.length}</strong> thing${strengths.length === 1 ? '' : 's'} you’re doing well</li>
          </ul>
        </div>
      </div>

      <div class="hcr-toolbar">
        ${mail ? `<p class="hc-res__mail">${mail}</p>` : '<span></span>'}
        <div class="hc-res__btns">
          <button class="btn btn--dark hcr-pdf" type="button" data-hcr-pdf>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 14.5V16h12v-1.5"/></svg>
            Download PDF
          </button>
        </div>
      </div>

      <div class="hc-res__grid">
        <section class="hc-res__areas" aria-label="Score by area">
          <h3>Score by area</h3>
          ${r.areas.map((a, i) => `<div class="hc-area" style="--w:${a.score}; --i:${i}"><div class="hc-area__top"><span>${esc(a.title)}</span><span>${a.score}%</span></div><div class="hc-area__bar"><span></span></div></div>`).join('')}
        </section>
        <section class="hc-res__plan" aria-label="Fix these first">
          <h3>${top.length ? 'Fix these first' : r.actions.length ? 'Your next actions' : 'Nothing urgent'}</h3>
          ${
            shown.length
              ? `<ol class="hc-plan">${shown.map((a) => `<li><p class="hc-plan__meta">${esc(PRIORITY[a.priority][0])} · ${esc(a.areaTitle)}</p><p class="hc-plan__label">${esc(a.label)}</p><p class="hc-plan__action">${esc(a.action)}</p><p class="hc-plan__law">${esc(a.law)}</p></li>`).join('')}</ol>`
              : '<p class="hc-plan__more">You answered “Yes” throughout. Keep your documents current as the law changes and review them once a year.</p>'
          }
        </section>
      </div>

      ${
        groups.length
          ? `<section class="hcr-plan" aria-labelledby="hcr-plan-title">
        <div class="hcr-plan__head">
          <h3 id="hcr-plan-title">Your full action plan</h3>
          <p>Every gap from your answers, ranked by risk: what could cost you most comes first.</p>
        </div>
        ${groups
          .map(
            (g) => `
          <div class="hcr-tier">
            <p class="hcr-tier__title">${esc(PRIORITY[g.p][0])} <span>· ${esc(PRIORITY[g.p][1])}</span></p>
            ${g.items
              .map((a) => {
                n++;
                return `
            <article class="hcr-item">
              <span class="hcr-item__num">${n}</span>
              <div>
                <p class="hc-plan__meta">${esc(a.areaTitle)} · You answered “${esc(ANSWER[a.answer] || a.answer)}”</p>
                <h4 class="hcr-item__label">${esc(a.label)}</h4>
                <p class="hcr-item__why">${esc(a.why)}</p>
                <p class="hcr-item__action"><strong>What to do:</strong> ${esc(a.action)}</p>
                <p class="hc-plan__law">Reference: ${esc(a.law)}</p>
              </div>
            </article>`;
              })
              .join('')}
          </div>`,
          )
          .join('')}
      </section>`
          : ''
      }

      ${
        strengths.length
          ? `<section class="hcr-strengths" aria-labelledby="hcr-strengths-title">
        <h3 id="hcr-strengths-title">What you’re doing well</h3>
        <ul>${strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </section>`
          : ''
      }

      <div class="hc-res__cta">
        <div>
          <h3>Want help closing the gaps?</h3>
          <p>HR Hub can take you through your results and put the fixes in place.</p>
        </div>
        <div class="hc-res__btns">
          <a class="btn btn--dark" href="index.html?book&amp;topic=health-check">Book a consultation</a>
          <button class="btn btn--outline" type="button" data-hcr-pdf>Download PDF</button>
          <a class="btn btn--outline" href="index.html?health-check">Take it again</a>
        </div>
      </div>`;

    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-in')));
    const num = $('[data-hcr-count]', root);
    if (!reduceMotion) {
      const t0 = performance.now() + 250;
      const tick = (now) => {
        const p = Math.min(Math.max((now - t0) / 1800, 0), 1);
        num.textContent = Math.round(r.score * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    root.querySelectorAll('[data-hcr-pdf]').forEach((b) => b.addEventListener('click', () => {
      // Make sure the animated parts are in their final state for the PDF.
      root.classList.add('is-in');
      num.textContent = r.score;
      window.print();
    }));
  }

  async function init() {
    let fromTab = null;
    try { fromTab = JSON.parse(sessionStorage.getItem(RESULT_KEY) || 'null'); } catch (e) { fromTab = null; }
    if (fromTab && fromTab.ref === ref && fromTab.result) { render(fromTab); return; }
    if (!ref || !key) { failed(); return; }
    try {
      const res = await fetch(`/api/health-check/result?ref=${encodeURIComponent(ref)}&k=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error('not found');
      render(data);
    } catch (e) {
      failed();
    }
  }
  init();
})();
