(() => {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  if (typeof gsap === "undefined") {
    console.error("GSAP failed to load");
    document.documentElement.classList.add("is-ready");
    return;
  }

  gsap.ticker.fps(60);
  gsap.ticker.lagSmoothing(0);

  const header = document.querySelector(".site-header");
  const progressEl = document.querySelector(".progress");
  const toggle = document.querySelector(".nav-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  const panels = gsap.utils.toArray("[data-scene]");
  const dots = gsap.utils.toArray(".scene-dots a");
  const stage =
    document.querySelector(".scene-stage-root") ||
    document.querySelector("main");

  const menuLabels = {
    open: toggle?.getAttribute("aria-label") || "Open menu",
    close:
      document.documentElement.lang === "cs" ? "Zavřít menu" : "Close menu",
  };


  function syncLangSwitchHash() {
    const hash = location.hash || "";
    document.querySelectorAll(".lang-switch a[hreflang]").forEach((a) => {
      const raw = a.getAttribute("href") || "./";
      const base = raw.split("#")[0] || "./";
      a.setAttribute("href", base + hash);
    });
  }

  function setMenuOpen(open) {
    if (!toggle || !mobileNav) return;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? menuLabels.close : menuLabels.open);
    mobileNav.hidden = !open;
  }

  toggle?.addEventListener("click", () => {
    setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  mobileNav?.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => setMenuOpen(false))
  );

  function markReady() {
    document.documentElement.classList.add("is-ready");
  }

  if (reduceMotion) {
    // Native document scroll - no hijacked deck
    document.documentElement.classList.remove("deck-mode");
    syncLangSwitchHash();
    window.addEventListener("hashchange", syncLangSwitchHash);
    markReady();
    return;
  }

  if (!panels.length) {
    markReady();
    return;
  }

  document.documentElement.classList.add("deck-mode");
  stage?.classList.add("scene-stage-root");
  panels.forEach((p) => p.classList.add("deck-card"));

  /**
   * One slot model for every card:
   *   x, y  - top-left in px
   *   s     - uniform scale (never squash)
   *   o, z  - opacity / stacking
   *
   * Triangle:
   *   main  - big content left
   *   next  - larger peek, bottom-right (unwraps into main)
   *   further - smaller peek, top-right
   *   enter - offstage right
   *   exit  - offstage left
   */
  const SLOTS = ["main", "next", "further", "enter", "exit"];

  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const headerEl = document.querySelector(".site-header");
    const headerRect = headerEl?.getBoundingClientRect();
    // Place whole cards under the fixed header bar (slot y, not inner padding)
    const headerBottom = Math.max(
      64,
      Math.ceil((headerRect && headerRect.bottom) || 64)
    );
    const oneCard = vw < 700;
    const gap = oneCard ? 8 : 14;
    const padX = oneCard ? 10 : 20;
    const padY = headerBottom + (oneCard ? 12 : 18);
    const bottom = oneCard ? 36 : 28;

    const stageW = vw - padX * 2;
    const stageH = vh - padY - bottom;

    document.documentElement.classList.toggle("deck-one", oneCard);

    function fullSlots(mainW, mainH) {
      return {
        mainW,
        mainH,
        main: { x: padX, y: padY, s: 1, o: 1, z: 5 },
        next: { x: vw + 32, y: padY, s: 1, o: 0, z: 4 },
        further: { x: vw + 32 + stageW * 0.2, y: padY, s: 1, o: 0, z: 3 },
        enter: { x: vw + 32 + stageW * 0.45, y: padY, s: 1, o: 0, z: 2 },
        exit: { x: -mainW - 32, y: padY, s: 1, o: 0, z: 1 },
      };
    }

    // Narrow: one full card, R→L page flips (no peek stack)
    if (oneCard) {
      const full = fullSlots(stageW, stageH);
      return { peek: full, full };
    }

    // Large main; wider peek column via tuck-under; peeks scale up and clip (not fit-full-height)
    const mainW = stageW * 0.7;
    const mainH = stageH;
    const mainPeekOverlap = 52; // peeks slide under the main card
    const peekStackOverlap = Math.round(stageH * 0.22); // top peek clearly over bottom
    const peekLeft = padX + mainW - mainPeekOverlap;
    const peekW = Math.max(160, vw - padX - peekLeft);
    const peekBand = (stageH - gap) / 2;

    // Scale from width (with a floor) — do NOT shrink to full card height
    const nextS = Math.min(0.58, Math.max(0.42, (peekW / mainW) * 1.12));
    const furtherS = nextS * 0.92;

    const nextLeft = peekLeft;
    const nextTop = padY + peekBand + gap - peekStackOverlap;
    const furtherLeft = peekLeft;
    const furtherTop = padY;

    function place(cellLeft, cellTop, cellW, cellH, s, o, z) {
      const fittedW = mainW * s;
      return {
        x: cellLeft + Math.max(0, cellW - fittedW),
        y: cellTop,
        s,
        o,
        z,
      };
    }

    const peek = {
      mainW,
      mainH,
      main: { x: padX, y: padY, s: 1, o: 1, z: 5 },
      next: place(nextLeft, nextTop, peekW, peekBand, nextS, 0.95, 4),
      further: place(furtherLeft, furtherTop, peekW, peekBand, furtherS, 0.88, 3),
      enter: {
        x: vw + 40,
        y: furtherTop,
        s: furtherS,
        o: 0,
        z: 2,
      },
      exit: {
        x: -mainW - 40,
        y: padY,
        s: 1,
        o: 0,
        z: 1,
      },
    };

    return { peek, full: fullSlots(stageW, stageH) };
  }

  function slotName(panelIndex, pageIndex) {
    const d = panelIndex - pageIndex;
    if (d === 0) return "main";
    if (d === 1) return "next";
    if (d === 2) return "further";
    if (d >= 3) return "enter";
    return "exit";
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpSlot(from, to, t) {
    return {
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      s: lerp(from.s, to.s, t),
      o: lerp(from.o, to.o, t),
      // z is assigned by stackZ  -  never lerp it (causes order pops)
      z: from.z,
    };
  }

  // Continuous stack: past/exit always under the card becoming main.
  // Using page-relative depth avoids the main(z5)→exit(z1) vs next(z4)→main(z5)
  // crossover that flashes the previous block for the first frames.
  function stackZ(panelIndex, p) {
    const ahead = panelIndex >= p ? 25 : 0;
    return Math.round(40 + ahead - Math.abs(panelIndex - p) * 15);
  }

  let layouts = layout();
  let L = layouts.peek;
  const maxP = Math.max(0, panels.length - 1);

  const setters = panels.map((panel) => ({
    panel,
    x: gsap.quickSetter(panel, "x", "px"),
    y: gsap.quickSetter(panel, "y", "px"),
    // Don't use quickSetter("scale") — GSAP can call setAttribute("scaleX,scaleY") and crash WebKit/Chromium
    s: (v) => {
      gsap.set(panel, { scale: v, force3D: true });
    },
    o: gsap.quickSetter(panel, "opacity"),
    _pe: null,
    _lit: true,
    _z: null,
    _w: null,
  }));

  function sizeCards() {
    panels.forEach((panel) => {
      gsap.set(panel, {
        width: L.mainW,
        height: L.mainH,
        transformOrigin: "0 0",
        force3D: true,
      });
    });
    setters.forEach((set) => {
      set._w = L.mainW;
    });
  }

  let viewP = 0;
  let snapTween = null;
  let lastClassI = -1;
  let wheelLockUntil = 0;
  let touch = null;

  const CFG = {
    snapDur: 0.48,
    snapEase: "power2.out",
    wheelThreshold: 40,
    // Ignore wheel/swipe until unwrap finishes, then a short break so one flick ≠ two scenes
    wheelCooldownMs: 280,
    touchCommit: 0.12,
  };

  function deckBusy() {
    return !!snapTween || performance.now() < wheelLockUntil;
  }

  function armDeckLock(ms) {
    wheelLockUntil = Math.max(wheelLockUntil, performance.now() + ms);
  }

  function applySlot(set, slot, z) {
    set.x(slot.x);
    set.y(slot.y);
    set.s(slot.s);
    set.o(slot.o);
    const zi = String(z);
    if (set._z !== zi) {
      set.panel.style.zIndex = zi;
      set._z = zi;
    }
  }

  const navSceneLinks = gsap.utils.toArray(
    ".nav a[href^='#'], #mobile-nav a[href^='#']"
  );

  function syncChrome(p) {
    const clamped = Math.max(0, Math.min(maxP, p));
    const i = Math.round(clamped);
    const id = panels[i]?.id || "";
    dots.forEach((d, n) => d.classList.toggle("is-active", n === i));
    navSceneLinks.forEach((a) => {
      const href = a.getAttribute("href") || "";
      const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
      a.classList.toggle("is-active", hash === `#${id}`);
    });
    if (progressEl && maxP > 0) {
      progressEl.style.width = `${(clamped / maxP) * 100}%`;
    }
    header?.classList.toggle("is-scrolled", clamped > 0.08);
    document.documentElement.classList.toggle("deck-last", i === maxP);
    const label = document.querySelector("[data-scene-label]");
    if (label) label.textContent = `${i + 1} / ${panels.length}`;
  }

  function layForPage(pageIndex) {
    return pageIndex >= maxP ? layouts.full : layouts.peek;
  }

  function render(p) {
    const clamped = Math.max(0, Math.min(maxP, p));
    const k = Math.min(Math.floor(clamped + 1e-8), maxP);
    const t = clamped - k;
    const k2 = Math.min(k + 1, maxP);
    // Never "park early" on epsilon  -  that flashed the OLD page when t≈1
    // scrolling down (floor still on services while snap is almost at products).
    // Morph whenever we span two pages; only park when k === k2.
    const morphing = k !== k2;
    // While a snap is in flight, keep lerping even if float noise nudges p
    const forceMorph = !!snapTween && morphing;

    const layFrom = layForPage(k);
    const layTo = layForPage(k2);
    let targetW = layFrom.mainW;
    if (morphing || forceMorph) {
      targetW = lerp(layFrom.mainW, layTo.mainW, t);
    } else {
      targetW = layFrom.mainW;
    }
    const targetH = layouts.peek.mainH;

    setters.forEach((set, i) => {
      if (set._w !== targetW) {
        gsap.set(set.panel, { width: targetW, height: targetH });
        set._w = targetW;
      }
      // Only cards near the active page can be on-stage
      const d0 = i - k;
      const d1 = i - k2;
      if ((d0 < -1 || d0 > 3) && (d1 < -1 || d1 > 3)) {
        if (set._lit) {
          set.o(0);
          set.panel.style.pointerEvents = "none";
          set._lit = false;
        }
        return;
      }

      const from = layFrom[slotName(i, k)];
      const to = layTo[slotName(i, k2)];
      const slot = morphing || forceMorph ? lerpSlot(from, to, t) : from;
      applySlot(set, slot, stackZ(i, clamped));

      const pe = slot.o > 0.35 ? "auto" : "none";
      if (set._pe !== pe) {
        set.panel.style.pointerEvents = pe;
        set._pe = pe;
      }
      set._lit = slot.o > 0.01;
    });

    // Classes only on a true integer park  -  never mid-snap via round()
    if (k === k2 && !snapTween) parkClasses(k);

    syncChrome(clamped);
  }

  function commitHash() {
    const i = Math.round(Math.max(0, Math.min(maxP, viewP)));
    const id = panels[i]?.id;
    if (!id) return;
    const next = `#${id}`;
    // replaceState with a hash can still scroll-to-anchor in some engines  - 
    // only update when needed, and pin scroll so #services can't flash.
    if (location.hash !== next) {
      const x = window.scrollX;
      const y = window.scrollY;
      history.replaceState(null, "", next);
      window.scrollTo(x, y);
    }
    syncLangSwitchHash();
  }

  function cancelSnap() {
    if (snapTween) {
      snapTween.kill();
      snapTween = null;
    }
  }

  function parkClasses(mainI) {
    mainI = Math.max(0, Math.min(maxP, Math.round(mainI)));
    if (mainI === lastClassI) return;
    lastClassI = mainI;
    panels.forEach((panel, i) => {
      const isMain = i === mainI;
      panel.classList.toggle("is-active", isMain);
      panel.classList.toggle("is-preview", !isMain);
      panel.setAttribute("aria-hidden", isMain ? "false" : "true");
    });
  }

  function setMorphing(on) {
    document.documentElement.classList.toggle("deck-morphing", on);
  }

  function snapTo(target, duration = CFG.snapDur) {
    cancelSnap();
    pendingDir = 0;
    target = Math.max(0, Math.min(maxP, Math.round(target)));
    if (Math.abs(target - viewP) < 1e-4) {
      viewP = target;
      parkClasses(target);
      render(viewP);
      setMorphing(false);
      commitHash();
      return;
    }

    const dist = Math.abs(target - viewP);
    // Hero handoff is heavier  -  slightly longer, softer ease avoids hitch
    const fromHero = Math.round(viewP) === 0 || target === 0;
    const dur = Math.max(
      fromHero ? 0.42 : 0.3,
      Math.min(duration, (fromHero ? 0.34 : 0.22) + dist * 0.28)
    );
    const ease = fromHero ? "power3.out" : CFG.snapEase;
    const state = { p: viewP };
    setMorphing(true);
    // Lock for the whole unwrap + post-snap break (no chained second scene)
    armDeckLock(Math.round(dur * 1000) + CFG.wheelCooldownMs);
    snapTween = gsap.to(state, {
      p: target,
      duration: dur,
      ease,
      onUpdate: () => {
        viewP = state.p;
        render(viewP);
      },
      onComplete: () => {
        viewP = target;
        // Park classes WHILE morphing is still on, so the outgoing
        // card never briefly regains visible float/marquee chrome.
        parkClasses(target);
        render(viewP);
        setMorphing(false);
        commitHash();
        snapTween = null;
        armDeckLock(CFG.wheelCooldownMs);
        // Do not chain pendingDir — one gesture = one scene
        pendingDir = 0;
      },
    });
  }

  function canInnerScroll() {
    // Deck cards are fit-to-slot  -  never hand the wheel to inner scroll
    return false;
  }

  function normalizeWheel(e) {
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    if (e.deltaMode === 2) dy *= window.innerHeight;
    return dy;
  }

  let pendingDir = 0;

  // Firm page snap: one gesture = one scene (no mid-unwrap queue)
  window.addEventListener(
    "wheel",
    (e) => {
      const dy = normalizeWheel(e);
      if (canInnerScroll(dy)) return;
      e.preventDefault();

      if (Math.abs(dy) < CFG.wheelThreshold) return;
      if (deckBusy()) return;

      const dir = dy > 0 ? 1 : -1;
      const next = Math.round(viewP) + dir;
      if (next < 0 || next > maxP) return;

      pendingDir = 0;
      snapTo(next);
    },
    { passive: false }
  );

  // Window-level touch (same as wheel): stage-only missed some targets,
  // and touch-action:pan-y let Safari/Chrome keep native vertical pan.
  // FAQ/product buttons: allow deck swipe; only a tap (no drag) toggles them
  let suppressControlClick = false;

  window.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      suppressControlClick = false;
      // Skip native links/fields, open FAQ answer (scroll), and detail-mode list
      // — but NOT .faq-q / .product-row (those must pass swipe through)
      if (
        e.target.closest(
          "a, input, textarea, summary, .nav-toggle, .faq-a, .faq-list.is-detail"
        )
      ) {
        touch = null;
        return;
      }
      // Same break as wheel: don't start a new swipe mid-unwrap / during cooldown
      if (deckBusy()) {
        touch = null;
        return;
      }
      const t = e.touches[0];
      pendingDir = 0;
      touch = {
        x0: t.clientX,
        y0: t.clientY,
        p0: Math.round(viewP),
        x: t.clientX,
        y: t.clientY,
        t0: performance.now(),
        locked: false,
        axis: null,
        fromControl: !!e.target.closest(".faq-q, .product-row, button"),
      };
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!touch || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = touch.x0 - t.clientX;
      const dy = touch.y0 - t.clientY;

      // Axis lock after small slop so taps don't drag
      if (!touch.locked) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
        touch.locked = true;
        if (touch.fromControl) suppressControlClick = true;
        // One-card / phone: allow horizontal OR vertical page swipe
        touch.axis =
          document.documentElement.classList.contains("deck-one") &&
          Math.abs(dx) > Math.abs(dy)
            ? "x"
            : "y";
      }

      e.preventDefault();
      touch.x = t.clientX;
      touch.y = t.clientY;
      const drag =
        touch.axis === "x"
          ? dx / Math.max(1, window.innerWidth)
          : dy / Math.max(1, window.innerHeight);
      viewP = Math.max(-0.15, Math.min(maxP + 0.15, touch.p0 + drag));
      render(viewP);
    },
    { passive: false }
  );

  function endTouch() {
    if (!touch) return;
    const delta = viewP - touch.p0;
    const dt = Math.max(16, performance.now() - touch.t0) / 1000;
    const vel = delta / dt; // pages per second
    let target = touch.p0;
    // Distance or flick — same firm one-page snap as wheel
    if (delta > CFG.touchCommit || vel > 0.85) target = touch.p0 + 1;
    else if (delta < -CFG.touchCommit || vel < -0.85) target = touch.p0 - 1;
    touch = null;
    snapTo(target);
  }

  window.addEventListener("touchend", endTouch, { passive: true });
  window.addEventListener("touchcancel", endTouch, { passive: true });



  // FAQ + product list expand (buttons; details fought deck swipe on phones)
  function syncFaqView(list) {
    const anyOpen = [...list.querySelectorAll(".faq-q")].some(
      (b) => b.getAttribute("aria-expanded") === "true"
    );
    list.classList.toggle("is-detail", anyOpen);
    const section = list.closest("#faq") || list.closest("section");
    if (section) section.classList.toggle("faq-detail", anyOpen);
    list.querySelectorAll(".faq-item").forEach((item) => {
      const q = item.querySelector(".faq-q");
      const on = q && q.getAttribute("aria-expanded") === "true";
      item.classList.toggle("is-open", !!on);
    });
  }

  function bindExpandList(rootSel, btnSel, openExclusive) {
    document.querySelectorAll(rootSel).forEach((list) => {
      list.querySelectorAll(btnSel).forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Drag started on this control → it was a deck swipe, not a tap
          if (suppressControlClick) {
            suppressControlClick = false;
            return;
          }
          const panelId = btn.getAttribute("aria-controls");
          const panel = panelId ? document.getElementById(panelId) : null;
          const open = btn.getAttribute("aria-expanded") === "true";
          if (openExclusive) {
            list.querySelectorAll(btnSel).forEach((other) => {
              if (other === btn) return;
              other.setAttribute("aria-expanded", "false");
              const oid = other.getAttribute("aria-controls");
              const op = oid ? document.getElementById(oid) : null;
              if (op) op.hidden = true;
            });
          }
          btn.setAttribute("aria-expanded", open ? "false" : "true");
          if (panel) panel.hidden = open;
          if (list.hasAttribute("data-faq")) syncFaqView(list);
        });
      });
      if (list.hasAttribute("data-faq")) syncFaqView(list);
    });
  }
  bindExpandList("[data-faq]", ".faq-q", true);
  bindExpandList("[data-product-list]", ".product-row[aria-controls]", true);

  // Desktop: copy phone/email. Mobile: keep native tel:/mailto:
  function preferCopyContact() {
    return window.matchMedia("(min-width: 700px)").matches;
  }

  function flashCopied(el) {
    const prev = el.textContent;
    const cs = document.documentElement.lang === "cs";
    el.classList.add("is-copied");
    el.textContent = cs ? "Zkopírováno" : "Copied";
    window.setTimeout(() => {
      el.textContent = prev;
      el.classList.remove("is-copied");
    }, 1200);
  }

  document.querySelectorAll("[data-copy]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      if (!preferCopyContact()) return;
      e.preventDefault();
      const value = (el.getAttribute("data-copy") || "").trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        flashCopied(el);
      } catch (_) {
        // Fallback for older desktop browsers
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          flashCopied(el);
        } finally {
          ta.remove();
        }
      }
    });
  });


  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenuOpen(false);
    const stepKeys =
      e.key === "ArrowDown" ||
      e.key === "PageDown" ||
      e.key === "ArrowRight" ||
      e.key === " " ||
      e.key === "ArrowUp" ||
      e.key === "PageUp" ||
      e.key === "ArrowLeft";
    if (stepKeys && deckBusy()) {
      e.preventDefault();
      return;
    }
    if (
      e.key === "ArrowDown" ||
      e.key === "PageDown" ||
      e.key === "ArrowRight" ||
      e.key === " "
    ) {
      e.preventDefault();
      snapTo(Math.round(viewP) + 1);
    }
    if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      snapTo(Math.round(viewP) - 1);
    }
    if (e.key === "Home") {
      e.preventDefault();
      snapTo(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      snapTo(maxP);
    }
  });

  dots.forEach((d, i) => {
    d.addEventListener("click", (ev) => {
      ev.preventDefault();
      snapTo(i);
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href")?.slice(1);
      const i = panels.findIndex((p) => p.id === id);
      if (i >= 0) {
        e.preventDefault();
        setMenuOpen(false);
        snapTo(i);
      }
    });
  });

  panels.forEach((panel, i) => {
    panel.addEventListener("click", () => {
      if (panel.classList.contains("is-preview")) snapTo(i);
    });
  });

  function relayoutDeck() {
    layouts = layout();
    L = layouts.peek;
    sizeCards();
    viewP = Math.max(0, Math.min(maxP, Math.round(viewP)));
    render(viewP);
  }

  let resizeT;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(relayoutDeck, 100);
    },
    { passive: true }
  );

  gsap.set(panels, {
    x: 0,
    y: 0,
    opacity: 0,
    scale: 1,
    force3D: true,
  });

  let start = panels.findIndex((p) => p.id === location.hash.replace("#", ""));
  if (start < 0) start = 0;
  viewP = start;
  lastClassI = -1;

  // Hold the stage hidden until fonts → measure header → layout → paint.
  // Safari: fonts.ready can hang — race a short timeout so we never stay blank.
  let booted = false;
  function bootDeck() {
    if (booted) return;
    booted = true;
    try {
      layouts = layout();
      L = layouts.peek;
      sizeCards();
      render(viewP);
      commitHash();
      panels.forEach((p, i) => {
        p.classList.add("is-ready");
        p.classList.toggle("is-active", i === start);
        p.classList.toggle("is-preview", i !== start);
      });
      lastClassI = start;
      document.querySelectorAll(".reveal").forEach((el) => {
        el.classList.add("is-visible");
      });
    } catch (err) {
      console.error("deck boot failed", err);
    } finally {
      markReady();
    }
  }

  function scheduleBoot() {
    requestAnimationFrame(() => {
      requestAnimationFrame(bootDeck);
    });
  }

  const fontsReady =
    document.fonts && document.fonts.ready
      ? document.fonts.ready.catch(() => {})
      : Promise.resolve();
  const fontsTimeout = new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
  Promise.race([fontsReady, fontsTimeout]).then(scheduleBoot);

  syncLangSwitchHash();
  window.addEventListener("hashchange", syncLangSwitchHash);

  window.__anythinkDeck = {
    goTo: (i) => snapTo(i),
    get progress() {
      return viewP;
    },
    get slots() {
      return SLOTS.slice();
    },
  };
})();
