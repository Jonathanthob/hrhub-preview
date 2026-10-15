/* HR Hub Consultancy — interactions. Vanilla, no dependencies. */
(() => {
  'use strict';

  /* Feature flags.
     testimonials: switch to true ONLY once real, client-approved quotes
     (with written consent) are in the markup. */
  const FLAGS = {
    testimonials: false,
  };

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------- Flags ---------- */
  $$('[data-flag]').forEach((el) => {
    if (FLAGS[el.dataset.flag]) el.hidden = false;
  });

  /* ---------- Intro: cinematic welcome on every load ----------
     The head script decides whether it plays (adds html.intro-playing). The timeline
     is pure CSS; this only handles skipping, scroll lock and clean-up. */
  const intro = $('[data-intro]');
  if (intro && root.classList.contains('intro-playing')) {
    const INTRO_MS = 5250;
    let done = false;
    document.body.style.overflow = 'hidden';

    const finish = (skipped) => {
      if (done) return;
      done = true;
      root.classList.remove('intro-playing', 'intro-skipping');
      document.body.style.overflow = '';
      intro.remove();
      window.removeEventListener('keydown', onKey);
      if (skipped) {
        // Replay the hero's entrance from the start now that it is visible.
        $$('.hero__line, .hero__photo img').forEach((el) => {
          el.style.animation = 'none';
          void el.offsetWidth;
          el.style.animation = '';
        });
      }
    };
    const skip = () => {
      if (done || root.classList.contains('intro-skipping')) return;
      root.classList.add('intro-skipping');
      setTimeout(() => finish(true), 400);
    };
    function onKey(e) {
      if (['Escape', 'Enter', ' ', 'Spacebar'].includes(e.key)) { e.preventDefault(); skip(); }
    }

    intro.addEventListener('click', skip);
    window.addEventListener('keydown', onKey);
    setTimeout(() => finish(false), INTRO_MS);
  } else if (intro) {
    intro.remove();
  }

  /* ---------- Review mode: ?review outlines placeholders ---------- */
  if (new URLSearchParams(location.search).has('review')) {
    root.classList.add('review');
    const banner = document.createElement('div');
    banner.className = 'review-banner';
    banner.textContent = 'Review mode: dashed outlines mark [PLACEHOLDER] content';
    document.body.append(banner);
  }

  /* ---------- Nav: solid after 80px ---------- */
  const nav = $('[data-nav]');
  const SOLID_AT = 80;
  let ticking = false;

  const hero = $('.hero');
  const heroImg = $('[data-parallax]');
  let heroVisible = true;

  // Measured once (and on resize) so scrolling never forces a layout read.
  let heroMax = hero ? hero.offsetHeight * 0.06 : 0;
  window.addEventListener('resize', () => { if (hero) heroMax = hero.offsetHeight * 0.06; }, { passive: true });
  let solid = null;
  let lastShift = -1;

  function onScroll() {
    const y = window.scrollY;
    const wantSolid = y > SOLID_AT || document.body.classList.contains('menu-open');
    if (wantSolid !== solid) { solid = wantSolid; nav.classList.toggle('is-solid', solid); }

    // Hero parallax, capped well under 8% of the hero height.
    if (heroImg && heroVisible && !reduceMotion.matches) {
      const shift = Math.round(Math.min(y * 0.12, heroMax));
      if (shift !== lastShift) { lastShift = shift; heroImg.style.transform = `translate3d(0, ${-shift}px, 0)`; }
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
  onScroll();
  // Loading at #contact or restoring a scroll position jumps after this runs.
  window.addEventListener('load', () => requestAnimationFrame(onScroll));

  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      hero.classList.toggle('is-offscreen', !heroVisible); // pauses the frame's shine
    }).observe(hero);
  }

  /* ---------- Nav light follows the pointer while hovering ----------
     The light is moved with the CSS `translate` property via --glow-t
     (compositor-only); see .nav__inner::before in styles.css. */
  const capsule = $('.nav__inner', nav);
  if (capsule && window.matchMedia('(hover: hover)').matches) {
    // Pointer position across the capsule (0–1) → translate of the 44%-wide light.
    const toT = (x) => `${(((Math.min(Math.max(x, 0.15), 0.85) - 0.22) / 0.44) * 100).toFixed(1)}%`;
    const track = (e) => {
      if (reduceMotion.matches) return;
      const box = capsule.getBoundingClientRect();
      capsule.style.setProperty('--glow-t', toT((e.clientX - box.left) / box.width));
    };
    let resume = 0;
    capsule.addEventListener('pointerenter', (e) => {
      if (reduceMotion.matches) return;
      clearTimeout(resume);
      // Freeze the drift where it is, then let the transition glide to the pointer.
      if (!capsule.classList.contains('is-tracking')) {
        const now = getComputedStyle(capsule, '::before').translate.split(' ')[0];
        const px = parseFloat(now);
        const w = capsule.getBoundingClientRect().width * 0.44;
        if (now.endsWith('px') && w) capsule.style.setProperty('--glow-t', `${((px / w) * 100).toFixed(1)}%`);
        capsule.classList.add('is-tracking');
      }
      requestAnimationFrame(() => track(e));
    });
    capsule.addEventListener('pointermove', track);
    capsule.addEventListener('pointerleave', () => {
      if (!capsule.classList.contains('is-tracking')) return;
      // Glide back to the centre, then resume the drift from its midpoint so it never jumps.
      capsule.style.setProperty('--glow-t', '63.6%');
      resume = setTimeout(() => {
        capsule.style.removeProperty('--glow-t');
        capsule.style.setProperty('--glow-delay', '-2.25s');
        capsule.classList.remove('is-tracking');
      }, 700);
    });
  }

  /* ---------- Pause decorative motion while off screen ---------- */
  if ('IntersectionObserver' in window) {
    const motionIo = new IntersectionObserver((entries) => {
      entries.forEach((en) => en.target.classList.toggle('is-offscreen', !en.isIntersecting));
    });
    $$('[data-motion]').forEach((el) => motionIo.observe(el));
  }

  /* ---------- About billboard (video) ----------
     Silent and always playing: muted and looping. It loads as the visitor
     approaches and keeps playing (resuming if the browser pauses it), unless
     the visitor presses the small pause button. Visitors who ask for reduced
     motion see the still poster until they press play. */
  const billboard = $('[data-billboard]');
  if (billboard) {
    const video = $('video', billboard);
    const pauseBtn = $('[data-bb-pause]', billboard);
    const pauseLabel = $('[data-bb-pause-label]', billboard);
    let userPaused = reduceMotion.matches;
    let resting = false; // paused by us while far off screen
    video.muted = true;

    const show = (paused) => {
      billboard.classList.toggle('is-paused', paused);
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseLabel.textContent = paused ? 'Play background video' : 'Pause background video';
    };
    const start = () => {
      if (userPaused) return;
      resting = false;
      if (!video.src && video.dataset.src) { video.src = video.dataset.src; video.load(); }
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };
    show(userPaused);

    pauseBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      show(userPaused);
      if (userPaused) video.pause(); else start();
    });
    // If the browser pauses it (tab hidden, power saving), pick it up again.
    video.addEventListener('pause', () => {
      if (resting) { resting = false; return; }
      if (!userPaused && !document.hidden) start();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

    if ('IntersectionObserver' in window) {
      // Decode only while near the screen: it rests when far away and is
      // already playing again before it scrolls back into view.
      let near = false;
      new IntersectionObserver(([entry]) => {
        near = entry.isIntersecting;
        if (near) start();
        else if (!userPaused) { resting = true; video.pause(); }
      }, { rootMargin: '400px 0px' }).observe(billboard);
      new IntersectionObserver(([entry], obs) => {
        if (entry.isIntersecting) { billboard.classList.add('is-in'); obs.disconnect(); }
      }, { threshold: 0.2 }).observe(billboard);
    } else {
      billboard.classList.add('is-in');
      start();
    }
  }

  /* ---------- Mission & vision: interactive split ----------
     Desktop: hovering or focusing a half sets data-active, which slides the
     slash to give that half room and reveals its detail; a soft light follows
     the pointer. Phones/tablets: the switch (or a swipe) shows one half. */
  const mv = $('[data-mv]');
  if (mv) {
    const stage = $('[data-mv-stage]', mv);
    const panels = $$('[data-mv-panel]', mv);
    const switches = $$('[data-mv-show]', mv);
    const wide = window.matchMedia('(min-width: 1024px)');
    let pinned = '';

    const setActive = (name) => {
      mv.dataset.active = name;
      const shown = name || (wide.matches ? '' : 'mission');
      switches.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mvShow === (shown || 'mission'))));
      if (name) mv.classList.add('was-explored');
    };
    const resetForLayout = () => setActive(wide.matches ? pinned : (mv.dataset.active || 'mission'));
    resetForLayout();
    wide.addEventListener('change', () => { pinned = ''; setActive(wide.matches ? '' : 'mission'); });

    panels.forEach((panel) => {
      const name = panel.dataset.mvPanel;
      panel.addEventListener('pointerenter', (e) => { if (wide.matches && e.pointerType === 'mouse') setActive(name); });
      panel.addEventListener('focus', () => { if (wide.matches) setActive(name); });
      // Touch on a wide screen: tap to choose (and tap again to reset).
      panel.addEventListener('click', () => {
        if (!wide.matches) return;
        pinned = pinned === name ? '' : name;
        setActive(pinned);
      });
    });
    stage.addEventListener('pointerleave', (e) => {
      if (wide.matches && e.pointerType === 'mouse') { setActive(pinned); mv.classList.remove('is-pointing'); }
    });
    mv.addEventListener('focusout', (e) => {
      if (wide.matches && !mv.contains(e.relatedTarget)) setActive(pinned);
    });

    // Light that follows the pointer (desktop).
    let raf = 0;
    stage.addEventListener('pointermove', (e) => {
      if (!wide.matches || e.pointerType !== 'mouse' || reduceMotion.matches) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect();
        stage.style.setProperty('--mx', `${e.clientX - r.left}px`);
        stage.style.setProperty('--my', `${e.clientY - r.top}px`);
        mv.classList.add('is-pointing');
      });
    });

    // Switch and swipe (phones/tablets).
    switches.forEach((b) => b.addEventListener('click', () => setActive(b.dataset.mvShow)));
    let x0 = null;
    let y0 = null;
    stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (wide.matches || x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setActive(dx < 0 ? 'vision' : 'mission');
      x0 = null;
    }, { passive: true });
  }

  /* ---------- Mobile overlay menu ---------- */
  const menu = $('[data-menu]');
  const openBtn = $('[data-menu-open]');
  const closeBtn = $('[data-menu-close]');
  let lastFocus = null;

  $$('.menu__nav li, .menu__cta', menu).forEach((el, i) => el.style.setProperty('--i', i));

  function openMenu() {
    lastFocus = document.activeElement;
    menu.hidden = false;
    menu.classList.add('is-open');
    document.body.classList.add('menu-open');
    openBtn.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }
  function closeMenu({ restoreFocus = true } = {}) {
    menu.classList.remove('is-open');
    menu.hidden = true;
    document.body.classList.remove('menu-open');
    openBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus && lastFocus) lastFocus.focus();
    onScroll();
  }

  openBtn.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', () => closeMenu());
  $$('[data-menu-link]', menu).forEach((a) => a.addEventListener('click', () => closeMenu({ restoreFocus: false })));

  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep focus inside the dialog.
    const focusables = $$('a[href], button:not([disabled])', menu);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Close if the viewport grows past the mobile breakpoint.
  window.matchMedia('(min-width: 641px)').addEventListener('change', (mq) => {
    if (mq.matches && !menu.hidden) closeMenu({ restoreFocus: false });
  });

  /* ---------- Reveals ---------- */
  $$('[data-reveal]').forEach((group) => {
    $$('.rv', group).forEach((el, i) => el.style.setProperty('--i', i));
  });

  const revealTargets = $$('[data-reveal], [data-reveal-img]');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Booking drawer ----------
     Talks to the booking Worker:
       GET  /api/config              lists, duration, office city, booking window
       GET  /api/availability?month= open days and slot states (holidays, notice, taken)
       POST /api/booking             JSON request → reference, or field errors
     All rules live on the server (src/config.ts); this only renders them. */
  const API = {
    config: '/api/config',
    availability: (month) => `/api/availability?month=${month}`,
    booking: '/api/booking',
  };
  const FAILURE_MESSAGE = 'Your booking request couldn’t be sent. Please try again, or call or email us.';
  // Server field names → the panel's error elements.
  const ERROR_IDS = {
    date: 'bk-date-err', time: 'bk-time-err', name: 'bk-name-err', company: 'bk-company-err',
    email: 'bk-email-err', phone: 'bk-phone-err', notes: 'bk-notes-err', consent: 'bk-consent-err',
    hearingDate: 'bk-hearing-err', topic: 'bk-topic-err',
  };

  /* /api/config, fetched once and shared by the booking panel and the contact section. */
  const siteConfig = (() => {
    let p = null;
    return () => {
      if (!p) {
        p = fetch(API.config, { headers: { Accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .catch((err) => { p = null; throw err; });
      }
      return p;
    };
  })();

  /** Set by the booking panel: lets other parts of the page open it pre-filled. */
  let bookingApi = null;

  /* Lead source: UTM parameters and the external referrer, kept for the visit. */
  const tracking = (() => {
    const read = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const write = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
    const params = new URLSearchParams(location.search);
    const fromUrl = {};
    ['source', 'medium', 'campaign', 'term', 'content'].forEach((k) => {
      const v = params.get(`utm_${k}`);
      if (v) fromUrl[k] = v.slice(0, 100);
    });
    if (Object.keys(fromUrl).length) write('hrh-utm', fromUrl);
    let referrer = read('hrh-ref');
    if (referrer === null) {
      referrer = '';
      try { if (document.referrer && new URL(document.referrer).origin !== location.origin) referrer = document.referrer.slice(0, 300); } catch (e) { /* ignore */ }
      write('hrh-ref', referrer);
    }
    return { utm: read('hrh-utm') || {}, referrer };
  })();

  const drawer = $('[data-booking]');
  if (drawer) {
    const panel = $('.booking__panel', drawer);
    const bkForm = $('[data-booking-form]', drawer);
    const bkSuccess = $('[data-booking-success]', drawer);
    const grid = $('[data-cal-grid]', drawer);
    const calBox = $('[data-cal]', drawer);
    const calStatus = $('[data-cal-status]', drawer);
    const monthLabel = $('[data-cal-month]', drawer);
    const prevBtn = $('[data-cal-prev]', drawer);
    const nextBtn = $('[data-cal-next]', drawer);
    const dateInput = $('[data-cal-value]', drawer);
    const timesGrid = $('[data-times-grid]', drawer);
    const timesLabel = $('[data-times-label]', drawer);
    const schedule = $('[data-schedule]', drawer);
    const callbackRow = $('[data-callback]', drawer);
    const step3Opt = $('[data-step3-opt]', drawer);
    const urgentBox = $('#bk-urgent');
    const urgentFields = $('#bk-urgent-fields');
    const callbackBox = $('#bk-callback');
    const hearingInput = $('#bk-hearing');
    const phoneHint = $('[data-phone-hint]', drawer);
    const summary = $('[data-summary]', drawer);
    const bkSubmit = $('.bk-submit', drawer);
    const bkSubmitLabel = $('.bk-submit__label', drawer);
    const bkStatus = $('.form__status', bkForm);
    const timeInput = Object.assign(document.createElement('input'), { type: 'hidden', name: 'time' });
    bkForm.append(timeInput);

    const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const fmtLong = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
    const fmtAria = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fmtMonth = new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' });
    const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    let cfg = null;
    let cfgPromise = null;
    const months = new Map(); // 'YYYY-MM' → Map(date → day info)
    let view = null;          // first of the month on show
    let selDate = '';
    let selTime = '';
    let source = 'unknown';
    let sending = false;

    const isUrgent = () => urgentBox.checked;
    const wantsCallback = () => isUrgent() && callbackBox.checked;

    /* Config */
    function fillSelect(select, items, keepFirst) {
      const current = select.value;
      const head = keepFirst ? [select.options[0].cloneNode(true)] : [];
      select.replaceChildren(...head, ...items.map((label) => new Option(label, label)));
      if (items.includes(current)) select.value = current;
    }
    function applyConfig(c) {
      cfg = c;
      $$('[data-cfg="duration"]', drawer).forEach((el) => { el.textContent = c.durationMin; });
      $$('[data-cfg="office"]', drawer).forEach((el) => { el.textContent = c.officeCity ? `At our ${c.officeCity} office` : 'At our office'; });
      fillSelect(bkForm.elements.topic, c.topics, false);
      fillSelect($('#bk-industry'), c.industries, true);
      fillSelect($('#bk-prompt'), c.prompts, true);
      hearingInput.min = c.window.first;
      if (!view) {
        const start = fromIso(c.firstOpenDate || c.window.first);
        view = new Date(start.getFullYear(), start.getMonth(), 1);
      }
      return c;
    }
    function loadConfig() {
      if (!cfgPromise) {
        cfgPromise = siteConfig()
          .then(applyConfig)
          .catch((err) => { cfgPromise = null; throw err; });
      }
      return cfgPromise;
    }

    /* Availability */
    async function loadMonth(month, force = false) {
      if (!force && months.has(month)) return months.get(month);
      const r = await fetch(API.availability(month), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const days = new Map(data.days.map((d) => [d.date, d]));
      months.set(month, days);
      return days;
    }
    const dayFor = (date) => months.get(date.slice(0, 7))?.get(date);

    function showCalStatus(message, retry) {
      calStatus.replaceChildren();
      if (!message) return;
      const p = document.createElement('p');
      p.textContent = message;
      calStatus.append(p);
      if (retry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bk-cal__retry';
        b.textContent = 'Try again';
        b.addEventListener('click', retry);
        calStatus.append(b);
      }
    }

    async function showMonth({ force = false } = {}) {
      calBox.setAttribute('aria-busy', 'true');
      showCalStatus('Loading available dates…');
      try {
        await loadConfig();
        await loadMonth(monthKey(view), force);
        showCalStatus('');
      } catch (err) {
        showCalStatus('We couldn’t load available times. Check your connection and try again, or send us an enquiry instead.', () => showMonth({ force: true }));
      } finally {
        calBox.setAttribute('aria-busy', 'false');
        renderCalendar();
        renderTimes();
      }
    }

    function renderCalendar() {
      if (!view) { monthLabel.textContent = ''; grid.replaceChildren(); return; }
      monthLabel.textContent = fmtMonth.format(view);
      const first = cfg ? cfg.window.first.slice(0, 7) : monthKey(view);
      const last = cfg ? cfg.window.last.slice(0, 7) : monthKey(view);
      prevBtn.disabled = monthKey(view) <= first;
      nextBtn.disabled = monthKey(view) >= last;

      const days = months.get(monthKey(view));
      const frag = document.createDocumentFragment();
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => {
        const el = document.createElement('span');
        el.className = 'bk-cal__dow';
        el.setAttribute('aria-hidden', 'true');
        el.textContent = d;
        frag.append(el);
      });
      const lead = (view.getDay() + 6) % 7; // Monday-first
      for (let i = 0; i < lead; i++) frag.append(document.createElement('span'));

      const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (let n = 1; n <= count; n++) {
        const iso = `${monthKey(view)}-${String(n).padStart(2, '0')}`;
        const info = days && days.get(iso);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bk-cal__day';
        b.textContent = n;
        b.dataset.date = iso;
        let label = fmtAria.format(fromIso(iso));
        if (info && info.holiday) { label += `, ${info.holiday}`; b.classList.add('is-holiday'); b.title = info.holiday; }
        if (info && info.reason === 'full') label += ', fully booked';
        b.setAttribute('aria-label', label);
        b.setAttribute('aria-pressed', String(iso === selDate));
        if (cfg && iso === cfg.window.first) b.classList.add('is-today');
        if (!info || !info.open) b.disabled = true;
        frag.append(b);
      }
      grid.replaceChildren(frag);
    }

    function renderTimes() {
      timesGrid.replaceChildren();
      const info = selDate && dayFor(selDate);
      if (!info) {
        timesLabel.textContent = 'Choose a date to see available times.';
        return;
      }
      timesLabel.textContent = `Available times on ${fmtLong.format(fromIso(selDate))}`;
      info.slots.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bk-time';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(s.time === selTime));
        b.dataset.time = s.time;
        b.textContent = s.time;
        if (!s.available) {
          b.disabled = true;
          b.setAttribute('aria-label', `${s.time}, ${s.reason === 'taken' ? 'already requested' : 'too soon to book'}`);
        }
        timesGrid.append(b);
      });
    }

    function updateSummary() {
      const format = bkForm.elements.format.value;
      const topic = bkForm.elements.topic.value;
      if (wantsCallback()) {
        summary.textContent = `Urgent call-back about ${topic}. We’ll phone you as soon as possible.`;
      } else if (!selDate || !selTime) {
        summary.textContent = `${format} about ${topic}. Choose a date and time.`;
      } else {
        summary.textContent = `${isUrgent() ? 'Urgent: ' : ''}${format} about ${topic} on ${fmtLong.format(fromIso(selDate))} at ${selTime} (SAST).`;
      }
    }

    function setError(id, msg, field) {
      const err = document.getElementById(id);
      if (err) err.textContent = msg;
      if (field) field.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }

    /* Urgent fast-track */
    function syncUrgent() {
      const urgent = isUrgent();
      urgentFields.hidden = !urgent;
      callbackRow.hidden = !urgent;
      step3Opt.hidden = !urgent;
      schedule.hidden = wantsCallback();
      hearingInput.required = urgent;
      phoneHint.textContent = urgent ? '(required for urgent requests)' : '(needed for phone calls)';
      if (!urgent) setError('bk-hearing-err', '', hearingInput);
      if (wantsCallback()) { setError('bk-date-err', ''); setError('bk-time-err', ''); }
      updateSummary();
    }
    urgentBox.addEventListener('change', () => {
      syncUrgent();
      if (isUrgent()) hearingInput.focus();
    });
    callbackBox.addEventListener('change', syncUrgent);

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.bk-cal__day');
      if (!b || b.disabled) return;
      selDate = b.dataset.date;
      selTime = '';
      dateInput.value = selDate;
      timeInput.value = '';
      setError('bk-date-err', '');
      renderCalendar();
      renderTimes();
      updateSummary();
      grid.querySelector(`[data-date="${selDate}"]`).focus();
    });

    // Arrow keys move between open days.
    grid.addEventListener('keydown', (e) => {
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (!(e.key in steps) || !e.target.matches('.bk-cal__day')) return;
      e.preventDefault();
      const all = $$('.bk-cal__day', grid);
      let i = all.indexOf(e.target) + steps[e.key];
      while (all[i] && all[i].disabled) i += Math.sign(steps[e.key]);
      if (all[i]) all[i].focus();
    });

    prevBtn.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); showMonth(); });
    nextBtn.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); showMonth(); });

    timesGrid.addEventListener('click', (e) => {
      const b = e.target.closest('.bk-time');
      if (!b || b.disabled) return;
      selTime = b.dataset.time;
      timeInput.value = selTime;
      $$('.bk-time', timesGrid).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      setError('bk-time-err', '');
      updateSummary();
    });

    bkForm.addEventListener('change', (e) => {
      if (e.target.name === 'format' || e.target.name === 'topic') updateSummary();
      if (e.target.name === 'consent' && e.target.checked) setError('bk-consent-err', '', e.target);
      if (e.target === hearingInput && hearingInput.value) setError('bk-hearing-err', '', hearingInput);
    });

    /* Open / close */
    let lastTrigger = null;
    let closeTimer = 0;

    function openBooking(trigger) {
      clearTimeout(closeTimer);
      lastTrigger = trigger || document.activeElement;
      if (!bkSuccess.hidden) resetBooking();
      drawer.hidden = false;
      void drawer.offsetWidth; // let the closed state paint so the slide animates
      drawer.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      $('.booking__close', drawer).focus({ preventScroll: true });
      // Fresh availability every time the panel opens.
      if (view) months.delete(monthKey(view));
      showMonth();
    }
    function closeBooking(opts) {
      if (drawer.hidden) return;
      drawer.classList.remove('is-open');
      document.body.style.overflow = '';
      closeTimer = setTimeout(() => { drawer.hidden = true; }, reduceMotion.matches ? 0 : 600);
      const restore = !(opts && opts.restoreFocus === false);
      if (restore && lastTrigger && document.contains(lastTrigger) && lastTrigger.offsetParent) lastTrigger.focus({ preventScroll: true });
    }
    function resetBooking() {
      bkForm.reset();
      selDate = ''; selTime = '';
      dateInput.value = ''; timeInput.value = '';
      if (cfg) {
        const start = fromIso(cfg.firstOpenDate || cfg.window.first);
        view = new Date(start.getFullYear(), start.getMonth(), 1);
      }
      months.clear();
      $$('.field__error', drawer).forEach((el) => { el.textContent = ''; });
      $$('[aria-invalid]', drawer).forEach((el) => el.removeAttribute('aria-invalid'));
      bkForm.hidden = false;
      bkSuccess.hidden = true;
      setSending(false);
      syncUrgent();
      renderCalendar(); renderTimes(); updateSummary();
    }

    $$('[data-booking-open]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        source = btn.dataset.source || 'unknown';
        openBooking(btn.closest('.menu') ? openBtn : btn);
        // Buttons can pre-select a topic, e.g. the hero's Health Check.
        if (btn.dataset.topic) {
          const pick = () => { bkForm.elements.topic.value = btn.dataset.topic; updateSummary(); };
          pick();
          loadConfig().then(pick, () => {});
        }
      });
    });

    // Plain "Send an enquiry" links: let the page scroll to the form, then
    // put the cursor in the first field.
    $$('[data-enquiry]').forEach((link) => {
      link.addEventListener('click', () => {
        setTimeout(() => { const n = $('#f-name'); if (n) n.focus({ preventScroll: true }); }, reduceMotion.matches ? 0 : 700);
      });
    });
    $$('[data-booking-close]', drawer).forEach((el) => el.addEventListener('click', closeBooking));

    // "Send an enquiry": close the panel and take them to the contact form,
    // carrying over the topic they had chosen.
    $('[data-booking-enquiry]', drawer).addEventListener('click', (e) => {
      e.preventDefault();
      const topic = bkForm.elements.topic.value;
      const msg = $('#f-message');
      if (msg && !msg.value.trim() && topic !== 'Not sure yet') msg.value = `I'd like to find out more about ${topic}.`;
      closeBooking({ restoreFocus: false });
      const contact = $('#contact');
      contact.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => { const n = $('#f-name'); if (n) n.focus({ preventScroll: true }); }, reduceMotion.matches ? 0 : 700);
    });

    // "HR Compliance Health Check": switch the booking to that topic and show it.
    $('[data-booking-healthcheck]', drawer).addEventListener('click', () => {
      if (!bkSuccess.hidden) resetBooking();
      const select = bkForm.elements.topic;
      select.value = cfg ? cfg.healthCheckTopic : 'HR Compliance Health Check';
      if (source === 'unknown') source = 'panel-health-check';
      updateSummary();
      select.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
      select.classList.remove('is-flash');
      void select.offsetWidth;
      select.classList.add('is-flash');
      select.focus({ preventScroll: true });
    });

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeBooking(); return; }
      if (e.key !== 'Tab') return;
      const focusables = $$('a[href], button:not([disabled]), input:not([type="hidden"]):not([tabindex="-1"]), select, textarea', panel)
        .filter((el) => el.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* Submit */
    const BK_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const BK_PHONE = /^\+?[\d\s()-]{9,}$/;

    function setSending(on) {
      sending = on;
      bkSubmit.disabled = on;
      bkSubmit.classList.toggle('is-loading', on);
      bkForm.setAttribute('aria-busy', String(on));
      bkSubmitLabel.textContent = on ? 'Sending…' : 'Request booking';
    }

    function showSuccess(data) {
      const callback = Boolean(data.callback);
      $('[data-success-title]', drawer).textContent = callback ? 'Urgent request received.' : 'Booking requested.';
      $('[data-success-summary]', drawer).textContent = summary.textContent;
      $('[data-success-ref]', drawer).textContent = data.ref;
      $('[data-success-message]', drawer).textContent = callback
        ? `${data.callbackMessage || 'We’ll call you back as soon as possible.'} We’ve also emailed you a copy of your request.`
        : 'We’ll email you shortly to confirm the time. If it no longer suits, just reply to that email.';
      bkForm.hidden = true;
      bkSuccess.hidden = false;
      bkSuccess.focus();
      months.clear(); // the slot is now taken
    }

    function showServerErrors(errors) {
      let firstField = null;
      Object.entries(errors || {}).forEach(([key, msg]) => {
        const id = ERROR_IDS[key];
        const field = id && document.querySelector(`[aria-describedby~="${id}"]`);
        if (id) setError(id, msg, field);
        if (!firstField) firstField = field || (key === 'time' ? timesGrid.querySelector('.bk-time:not(:disabled)') : null);
      });
      if (firstField) firstField.focus();
    }

    bkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      bkStatus.textContent = '';
      const f = bkForm.elements;
      const urgent = isUrgent();
      const callback = wantsCallback();
      const phoneNeeded = f.format.value === 'Phone call' || urgent;
      const phone = f.phone.value.trim();
      const checks = [
        [setError('bk-hearing-err', !urgent || hearingInput.value ? '' : 'Please enter the hearing or CCMA date.', hearingInput), hearingInput],
        [setError('bk-date-err', callback || selDate ? '' : 'Please choose a date.'), grid.querySelector('.bk-cal__day:not(:disabled)')],
        [setError('bk-time-err', callback || !selDate || selTime ? '' : 'Please choose a time.'), timesGrid.querySelector('.bk-time:not(:disabled)')],
        [setError('bk-name-err', f.name.value.trim().length >= 2 ? '' : 'Please enter your name.', f.name), f.name],
        [setError('bk-email-err', BK_EMAIL.test(f.email.value.trim()) ? '' : 'Please enter an email address in the format name@company.co.za.', f.email), f.email],
        [setError('bk-phone-err',
          phoneNeeded && !phone ? (urgent ? 'Please add a phone number so we can call you back.' : 'Please add a phone number so we can call you.')
          : phone && !BK_PHONE.test(phone) ? 'Please enter a valid phone number.' : '', f.phone), f.phone],
        [setError('bk-consent-err', f.consent.checked ? '' : 'Please confirm you agree so we can arrange your consultation.', f.consent), f.consent],
      ];
      const firstBad = checks.find(([ok]) => !ok);
      if (firstBad) { if (firstBad[1]) firstBad[1].focus(); return; }

      const payload = {
        format: f.format.value,
        topic: f.topic.value,
        date: callback ? '' : selDate,
        time: callback ? '' : selTime,
        name: f.name.value,
        company: f.company.value,
        email: f.email.value,
        phone: f.phone.value,
        teamSize: f.teamSize.value,
        notes: f.notes.value,
        consent: f.consent.checked,
        honeypot: f.website.value,
        urgent,
        hearingDate: urgent ? hearingInput.value : '',
        callbackAsap: callback,
        industry: f.industry.value,
        prompt: f.prompt.value,
        hrSupport: (bkForm.querySelector('input[name="hrSupport"]:checked') || {}).value || '',
        source,
        utm: tracking.utm,
        referrer: tracking.referrer,
      };

      setSending(true);
      let res;
      let data = {};
      try {
        res = await fetch(API.booking, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        setSending(false);
        bkStatus.textContent = FAILURE_MESSAGE;
        return;
      }

      if (res.ok && data.ok) {
        showSuccess(data);
        return;
      }
      setSending(false);

      if (res.status === 409) {
        // Someone else just requested this slot: refresh and let them pick again.
        selTime = '';
        timeInput.value = '';
        await loadMonth(selDate.slice(0, 7), true).catch(() => {});
        renderCalendar();
        renderTimes();
        updateSummary();
        showServerErrors({ time: data.message || 'That time was just taken, please choose another.' });
        return;
      }
      if (res.status === 422 && data.errors) {
        showServerErrors(data.errors);
        if (data.errors.date || data.errors.time) { months.clear(); showMonth(); }
        return;
      }
      bkStatus.textContent = res.status === 429 && data.message ? data.message : FAILURE_MESSAGE;
    });

    syncUrgent();
    renderCalendar();
    renderTimes();
    updateSummary();

    /* Open the panel from elsewhere (enquiry confirmation, ?book links), pre-filled. */
    bookingApi = {
      open({ trigger, topic, slug, name, email, phone, source: from } = {}) {
        source = from || 'unknown';
        openBooking(trigger || document.activeElement);
        const fill = (el, v) => { if (el && v && !el.value) el.value = v; };
        fill($('#bk-name'), name);
        fill($('#bk-email'), email);
        fill($('#bk-phone'), phone);
        const pickTopic = () => {
          const select = bkForm.elements.topic;
          const wanted = topic || (slug && cfg && (cfg.topicOptions.find((t) => t.slug === slug) || {}).label);
          if (wanted && Array.from(select.options).some((o) => o.value === wanted)) select.value = wanted;
          updateSummary();
        };
        pickTopic();
        loadConfig().then(pickTopic, () => {});
      },
    };

    // /?book&topic=<slug> (e.g. the "Send booking link" email) opens the panel.
    const deep = new URLSearchParams(location.search);
    if (deep.has('book')) {
      const go = () => bookingApi.open({ slug: deep.get('topic') || '', source: 'booking-link' });
      if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
    }
  }

  /* ---------- Enquiry form ----------
     POST /api/enquiry as JSON. Without JavaScript the form posts normally to
     the same endpoint, which answers with a simple HTML page. */
  const enq = $('[data-enquiry-form]');
  if (enq) {
    const DRAFT_KEY = 'hrh-enquiry-draft';
    const MSG_MIN = 20;
    const MSG_MAX = 2000;
    const ENQ_FAILURE = 'Your enquiry couldn’t be sent. Please try again, or call or email us.';
    const ENQ_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const ENQ_PHONE = /^\+?[\d\s()-]{9,}$/;
    const f = enq.elements;
    const success = $('[data-enquiry-success]');
    const status = $('.form__status', enq);
    const submit = $('.enq-submit', enq);
    const submitLabel = $('.enq-submit__label', enq);
    const phoneHint = $('[data-enq-phone-hint]', enq);
    const urgentBox = $('#f-urgent');
    const urgentFields = $('#f-urgent-fields');
    const hearing = $('#f-hearing');
    const message = $('#f-message');
    const counter = $('[data-enq-count]', enq);
    let sending = false;
    let lastPayload = null;

    const method = () => (enq.querySelector('input[name="contactMethod"]:checked') || {}).value || 'Email';
    const phoneNeeded = () => urgentBox.checked || method() === 'Phone' || method() === 'WhatsApp';
    const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    function setErr(field, id, msg) {
      const el = document.getElementById(id);
      if (el) el.textContent = msg;
      if (field) field.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }

    /* Conditional phone + urgent fields */
    function syncConditional() {
      const urgent = urgentBox.checked;
      urgentFields.hidden = !urgent;
      hearing.required = urgent;
      f.phone.required = phoneNeeded();
      phoneHint.textContent = urgent ? '(required for urgent enquiries)'
        : method() === 'Phone' ? '(required for phone calls)'
        : method() === 'WhatsApp' ? '(required for WhatsApp)'
        : '(optional)';
      if (!urgent) setErr(hearing, 'f-hearing-err', '');
      if (!phoneNeeded() && !f.phone.value.trim()) setErr(f.phone, 'f-phone-err', '');
    }
    urgentBox.addEventListener('change', () => {
      syncConditional();
      if (urgentBox.checked) hearing.focus();
    });
    $$('input[name="contactMethod"]', enq).forEach((r) => r.addEventListener('change', syncConditional));

    /* Character count */
    function updateCount() {
      const n = message.value.trim().length;
      counter.textContent = `${n} / ${MSG_MAX}`;
      counter.classList.toggle('is-short', n > 0 && n < MSG_MIN);
    }
    message.addEventListener('input', updateCount);

    /* Topic deep links: ?topic=<slug>, and the service cards' "Ask about this" */
    function selectTopic(slug) {
      if (!slug) return false;
      const wanted = slugify(slug);
      const opt = Array.from(f.topic.options).find((o) => o.value && (o.dataset.slug === wanted || slugify(o.value) === wanted));
      if (!opt) return false;
      f.topic.value = opt.value;
      f.topicParam.value = opt.dataset.slug || wanted;
      setErr(f.topic, 'f-topic-err', '');
      return true;
    }
    $$('[data-enquiry-topic]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (!selectTopic(card.dataset.enquiryTopic)) return;
        e.preventDefault();
        saveDraft();
        $('#contact').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => f.name.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 700);
      });
    });

    /* Draft: survive an accidental refresh (this tab only) */
    const DRAFT_FIELDS = ['name', 'company', 'email', 'phone', 'topic', 'teamSize', 'industry', 'hearingDate', 'message', 'hearAbout'];
    let draftTimer = 0;
    function saveDraft() {
      const d = { contactMethod: method(), urgent: urgentBox.checked, topicParam: f.topicParam.value };
      DRAFT_FIELDS.forEach((k) => { d[k] = f[k].value; });
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ }
    }
    function restoreDraft() {
      let d = null;
      try { d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { d = null; }
      if (!d || typeof d !== 'object') return;
      DRAFT_FIELDS.forEach((k) => { if (typeof d[k] === 'string' && f[k]) f[k].value = d[k]; });
      const radio = enq.querySelector(`input[name="contactMethod"][value="${d.contactMethod}"]`);
      if (radio) radio.checked = true;
      urgentBox.checked = Boolean(d.urgent);
      if (typeof d.topicParam === 'string') f.topicParam.value = d.topicParam;
    }
    function clearDraft() {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage unavailable */ }
    }
    enq.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300); });
    enq.addEventListener('change', saveDraft);

    /* Contact details shown on the page come from config (src/config.ts). */
    function syncContact(c) {
      if (!c || !c.contact) return;
      const k = c.contact;
      const tel = (p) => {
        const d = p.replace(/[^\d+]/g, '');
        return `tel:${d.startsWith('+') ? d : `+27${d.replace(/^0/, '')}`}`;
      };
      $$('[data-contact]').forEach((el) => {
        const key = el.dataset.contact;
        const m = key.match(/^phone-(\d)$/);
        if (m && k.phones[Number(m[1])]) {
          const p = k.phones[Number(m[1])];
          el.href = tel(p);
          if (/\d/.test(el.textContent)) el.textContent = p;
        } else if (key === 'email' && k.email) {
          el.href = `mailto:${k.email}`;
          el.textContent = k.email;
        } else if (key === 'whatsapp' && k.whatsapp) {
          // Keep any pre-filled ?text= message, swap in the configured number.
          const u = new URL(el.href, location.href);
          u.pathname = `/${tel(k.whatsapp).replace('tel:+', '')}`;
          el.href = u.toString();
        } else if (key === 'hours' && k.officeHours) {
          el.textContent = k.officeHours;
        } else if (key === 'promise' && k.responsePromise) {
          el.textContent = k.responsePromise;
        }
      });
    }
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, obs) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        obs.disconnect();
        siteConfig().then(syncContact, () => {});
      }, { rootMargin: '600px 0px' });
      io.observe($('#contact'));
    }

    /* Submit */
    function setSending(on) {
      sending = on;
      submit.disabled = on;
      submit.classList.toggle('is-loading', on);
      enq.setAttribute('aria-busy', String(on));
      submitLabel.textContent = on ? 'Sending…' : 'Send enquiry';
    }

    function validate() {
      const urgent = urgentBox.checked;
      const phone = f.phone.value.trim();
      const msg = message.value.trim();
      const phoneMsg = urgent ? 'Please add a phone number so we can call you back.'
        : method() === 'WhatsApp' ? 'Please add a phone number so we can message you on WhatsApp.'
        : 'Please add a phone number so we can call you.';
      const checks = [
        [setErr(f.name, 'f-name-err', f.name.value.trim().length >= 2 ? '' : 'Please enter your name.'), f.name],
        [setErr(f.email, 'f-email-err', ENQ_EMAIL.test(f.email.value.trim()) ? '' : f.email.value.trim() ? 'Please enter an email address in the format name@company.co.za.' : 'Please enter your email address.'), f.email],
        [setErr(f.phone, 'f-phone-err', phoneNeeded() && !phone ? phoneMsg : phone && !ENQ_PHONE.test(phone) ? 'Please enter a valid phone number.' : ''), f.phone],
        [setErr(f.topic, 'f-topic-err', f.topic.value ? '' : 'Please choose what you need help with.'), f.topic],
        [setErr(hearing, 'f-hearing-err', !urgent || hearing.value ? '' : 'Please enter the hearing or CCMA date.'), hearing],
        [setErr(message, 'f-message-err', !msg ? 'Please tell us a little about what you need.'
          : msg.length < MSG_MIN ? `Please add a little more detail (at least ${MSG_MIN} characters).`
          : msg.length > MSG_MAX ? `Please keep your message under ${MSG_MAX} characters.` : ''), message],
        [setErr(f.consent, 'f-consent-err', f.consent.checked ? '' : 'Please confirm you agree so we can respond to your enquiry.'), f.consent],
      ];
      const bad = checks.find(([ok]) => !ok);
      if (bad) bad[1].focus();
      return !bad;
    }

    // Re-check a field once it has an error, as the visitor fixes it.
    enq.addEventListener('input', (e) => {
      if (e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') {
        const id = e.target.getAttribute('aria-describedby')?.split(' ').find((x) => x.endsWith('-err'));
        if (id && e.target.value.trim()) setErr(e.target, id, '');
      }
    });
    f.consent.addEventListener('change', () => { if (f.consent.checked) setErr(f.consent, 'f-consent-err', ''); });

    const SERVER_FIELDS = { name: 'f-name-err', company: 'f-company-err', email: 'f-email-err', phone: 'f-phone-err', topic: 'f-topic-err', hearingDate: 'f-hearing-err', message: 'f-message-err', consent: 'f-consent-err' };

    enq.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      status.textContent = '';
      if (!validate()) return;

      const payload = {
        name: f.name.value,
        company: f.company.value,
        email: f.email.value,
        phone: f.phone.value,
        contactMethod: method(),
        topic: f.topic.value,
        teamSize: f.teamSize.value,
        industry: f.industry.value,
        urgent: urgentBox.checked,
        hearingDate: urgentBox.checked ? hearing.value : '',
        message: message.value,
        hearAbout: f.hearAbout.value,
        consent: f.consent.checked,
        honeypot: f.website.value,
        page: location.pathname,
        topicParam: f.topicParam.value,
        utm: tracking.utm,
        referrer: tracking.referrer,
      };

      setSending(true);
      let res;
      let data = {};
      try {
        res = await fetch('/api/enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        setSending(false);
        status.textContent = ENQ_FAILURE;
        return;
      }
      setSending(false);

      if (res.ok && data.ok) {
        lastPayload = payload;
        clearDraft();
        $('[data-enq-success-title]', success).textContent = payload.urgent ? 'Urgent enquiry received.' : 'Enquiry received.';
        $('[data-enq-success-message]', success).textContent = data.message || `Thank you. We've received your enquiry [${data.ref}].`;
        enq.hidden = true;
        success.hidden = false;
        success.focus();
        return;
      }
      if (res.status === 422 && data.errors) {
        let first = null;
        Object.entries(data.errors).forEach(([k, msg]) => {
          const id = SERVER_FIELDS[k];
          const field = id && enq.querySelector(`[aria-describedby~="${id}"]`);
          if (id) setErr(field, id, msg);
          if (!first && field) first = field;
        });
        if (first) first.focus();
        return;
      }
      // Keep everything they typed; just explain.
      status.textContent = res.status === 429 && data.message ? data.message : ENQ_FAILURE;
    });

    // "Prefer to pick a time? Book a consultation" → booking panel, pre-filled.
    $('[data-enq-book]', success).addEventListener('click', (e) => {
      const p = lastPayload || {};
      if (bookingApi) bookingApi.open({ trigger: e.currentTarget, topic: p.topic, name: p.name, email: p.email, phone: p.phone, source: 'enquiry-confirmation' });
      else location.href = '#contact';
    });

    /* Start-up: draft first, then a ?topic link wins over the draft's topic. */
    restoreDraft();
    const params = new URLSearchParams(location.search);
    if (params.get('topic') && !params.has('book')) selectTopic(params.get('topic'));
    syncConditional();
    updateCount();
  }
})();
