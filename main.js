(() => {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  if (typeof gsap === "undefined") {
    console.error("GSAP failed to load");
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

  if (reduceMotion) {
    // Native document scroll - no hijacked deck
    document.documentElement.classList.remove("deck-mode");
    return;
  }

  if (!panels.length) return;

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
    const headerH = 64;
    const oneCard = vw < 700;
    const gap = oneCard ? 8 : 14;
    const padX = oneCard ? 10 : 20;
    const padY = headerH + (oneCard ? 8 : 14);
    const bottom = oneCard ? 36 : 28;

    const stageW = vw - padX * 2;
    const stageH = vh - padY - bottom;

    document.documentElement.classList.toggle("deck-one", oneCard);

    // Narrow: one full card, R→L page flips (no peek stack)
    if (oneCard) {
      const mainW = stageW;
      const mainH = stageH;
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

    const mainW = stageW * 0.62;
    const mainH = stageH;
    const peekW = stageW - mainW - gap;
    const peekH = (stageH - gap) / 2;

    // Fit the full main card into a peek cell without distorting
    const nextS = Math.min(peekW / mainW, peekH / mainH);
    const furtherS = nextS * 0.86;

    const nextLeft = padX + mainW + gap;
    const nextTop = padY + peekH + gap;
    const furtherLeft = padX + mainW + gap;
    const furtherTop = padY;

    function place(cellLeft, cellTop, cellW, cellH, s, o, z) {
      return {
        x: cellLeft + (cellW - mainW * s) / 2,
        y: cellTop + (cellH - mainH * s) / 2,
        s,
        o,
        z,
      };
    }

    return {
      mainW,
      mainH,
      main: { x: padX, y: padY, s: 1, o: 1, z: 5 },
      next: place(nextLeft, nextTop, peekW, peekH, nextS, 0.94, 4),
      further: place(furtherLeft, furtherTop, peekW, peekH, furtherS, 0.78, 3),
      enter: {
        x: vw + 40,
        y: furtherTop + (peekH - mainH * furtherS) / 2,
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

  let L = layout();
  const maxP = Math.max(0, panels.length - 1);

  const setters = panels.map((panel) => ({
    panel,
    x: gsap.quickSetter(panel, "x", "px"),
    y: gsap.quickSetter(panel, "y", "px"),
    s: gsap.quickSetter(panel, "scale"),
    o: gsap.quickSetter(panel, "opacity"),
    _pe: null,
    _lit: true,
    _z: null,
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
    wheelCooldownMs: 420,
    touchCommit: 0.18,
  };

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

  function syncChrome(p) {
    const clamped = Math.max(0, Math.min(maxP, p));
    const i = Math.round(clamped);
    dots.forEach((d, n) => d.classList.toggle("is-active", n === i));
    if (progressEl && maxP > 0) {
      progressEl.style.width = `${(clamped / maxP) * 100}%`;
    }
    header?.classList.toggle("is-scrolled", clamped > 0.08);
    const label = document.querySelector("[data-scene-label]");
    if (label) label.textContent = `${i + 1} / ${panels.length}`;
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

    setters.forEach((set, i) => {
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

      const from = L[slotName(i, k)];
      const to = L[slotName(i, k2)];
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
        if (pendingDir) {
          const dir = pendingDir;
          pendingDir = 0;
          const next = Math.round(viewP) + dir;
          if (next >= 0 && next <= maxP) {
            wheelLockUntil = performance.now() + CFG.wheelCooldownMs;
            snapTo(next);
          }
        }
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

  // Firm page snap: one gesture = one scene
  window.addEventListener(
    "wheel",
    (e) => {
      const dy = normalizeWheel(e);
      if (canInnerScroll(dy)) return;
      e.preventDefault();

      if (Math.abs(dy) < CFG.wheelThreshold) return;
      const dir = dy > 0 ? 1 : -1;

      // Mid-morph: queue at most one extra page (don't fight the tween)
      if (snapTween) {
        pendingDir = dir;
        return;
      }

      const now = performance.now();
      if (now < wheelLockUntil) return;

      const next = Math.round(viewP) + dir;
      if (next < 0 || next > maxP) return;

      wheelLockUntil = now + CFG.wheelCooldownMs;
      pendingDir = 0;
      snapTo(next);
    },
    { passive: false }
  );

  stage?.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      cancelSnap();
      touch = {
        y0: t.clientY,
        p0: Math.round(viewP),
        y: t.clientY,
      };
    },
    { passive: true }
  );

  stage?.addEventListener(
    "touchmove",
    (e) => {
      if (!touch) return;
      const t = e.touches[0];
      const dy = touch.y0 - t.clientY;

      if (canInnerScroll(touch.y - t.clientY)) {
        touch = null;
        return;
      }

      e.preventDefault();
      touch.y = t.clientY;
      const drag = dy / window.innerHeight;
      viewP = Math.max(-0.15, Math.min(maxP + 0.15, touch.p0 + drag));
      render(viewP);
    },
    { passive: false }
  );

  stage?.addEventListener(
    "touchend",
    () => {
      if (!touch) return;
      const delta = viewP - touch.p0;
      let target = touch.p0;
      if (delta > CFG.touchCommit) target = touch.p0 + 1;
      else if (delta < -CFG.touchCommit) target = touch.p0 - 1;
      touch = null;
      snapTo(target);
    },
    { passive: true }
  );

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenuOpen(false);
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

  let resizeT;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        L = layout();
        sizeCards();
        viewP = Math.max(0, Math.min(maxP, Math.round(viewP)));
        render(viewP);
      }, 100);
    },
    { passive: true }
  );

  sizeCards();
  gsap.set(panels, {
    x: 0,
    y: 0,
    opacity: 0,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    force3D: true,
  });

  let start = panels.findIndex((p) => p.id === location.hash.replace("#", ""));
  if (start < 0) start = 0;
  viewP = start;
  lastClassI = -1;
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
