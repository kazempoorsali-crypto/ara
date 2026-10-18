/* ═══════════════════════════════════════════════════════════
   فرصت ملک — هستهٔ تجربهٔ سینمایی v2
   Intro ساختمان/طلوع · Lenis · منوی پلکانی · Hero لایه‌ای
   قفل/رهاسازی اسکرول · بازگشت‌به‌بالا · اشتراک‌گذاری · تم
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  window.FM = window.FM || {};

  var forceLite = false;
  try { forceLite = new URLSearchParams(location.search).get("lite") === "1"; } catch (e) {}
  var LITE =
    forceLite ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  document.documentElement.classList.toggle("lite", LITE);
  FM.lite = LITE;
  FM.lenis = null;
  FM.isHome = document.body.dataset.page === "home";

  /* ---------- تم ---------- */
  FM.theme = document.documentElement.getAttribute("data-theme") || "dark";
  FM.setTheme = function (t, animate) {
    if (t !== "light" && t !== "dark") return;
    FM.theme = t;
    var root = document.documentElement;
    var apply = function () {
      root.setAttribute("data-theme", t);
      try { localStorage.setItem("fmTheme", t); } catch (e) {}
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute("content", t === "dark" ? "#0b120e" : "#f4f1e9");
    };
    if (animate && !LITE) {
      root.classList.add("theming"); apply();
      setTimeout(function () { root.classList.remove("theming"); }, 550);
    } else apply();
    root.dispatchEvent(new CustomEvent("fm:theme", { detail: { theme: t } }));
  };
  (function initTheme() {
    var btn = document.getElementById("themeBtn");
    if (btn && !btn.dataset.fmThemeBound) {
      btn.dataset.fmThemeBound = "1";
      btn.addEventListener("click", function () {
        FM.setTheme(FM.theme === "dark" ? "light" : "dark", true);
      });
    }
  })();

  /* ---------- Lenis ---------- */
  /* اسکرول نرم فقط روی دسکتاپ قوی با ماوس؛ موبایل و سیستم ضعیف اسکرول بومی و روانِ خود مرورگر را دارند */
  var STRONG = matchMedia("(hover: hover) and (pointer: fine)").matches && innerWidth >= 1100 &&
    (navigator.hardwareConcurrency || 8) >= 4 && (navigator.deviceMemory || 8) >= 4;
  FM.strong = STRONG;
  function initLenis() {
    if (LITE || !STRONG || typeof Lenis === "undefined") return;
    var lenis = new Lenis({ duration: 1.2, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    FM.lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }
  FM.stopScroll = function () { FM.lenis && FM.lenis.stop(); document.documentElement.classList.add("is-locked"); };
  FM.startScroll = function () { FM.lenis && FM.lenis.start(); document.documentElement.classList.remove("is-locked"); };
  FM.scrollToEl = function (target, opts) {
    if (FM.lenis) FM.lenis.scrollTo(target, Object.assign({ duration: 1.5, offset: -10 }, opts || {}));
    else if (typeof target === "number") window.scrollTo({ top: target, behavior: "smooth" });
    else target.scrollIntoView({ behavior: "smooth" });
  };

  /* ---------- Intro صفحهٔ ورود ---------- */
  function runIntro(done) {
    var intro = document.getElementById("intro");
    if (!intro) return done();
    var seen = false;
    try { seen = sessionStorage.getItem("fmIntro2") === "1"; } catch (e) {}

    function finish() {
      if (finish._d) return; finish._d = true;
      try { sessionStorage.setItem("fmIntro2", "1"); } catch (e) {}
      intro.classList.add("is-done");
      setTimeout(function () { intro.style.display = "none"; }, 1000);
      done();
    }
    var skip = document.getElementById("introSkip");
    skip && skip.addEventListener("click", finish);
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { document.removeEventListener("keydown", esc); finish(); }
    });

    if (seen || LITE) {
      intro.classList.add("is-fast");
      setTimeout(finish, 420);
      return;
    }

    FM.stopScroll();
    var bar = document.getElementById("introBar");
    var st = document.querySelectorAll(".ib-s");
    var fl = document.querySelectorAll(".ib-f");
    var sun = document.querySelector("[data-intro-sun]");
    var brand = document.querySelector("[data-intro-brand]");

    /* محافظ خطا: اگر چیزی در ساخت تایم‌لاین شکست خورد، اسکرول قفل نمی‌ماند */
    try {
    gsap.set(st, { drawSVG: 0, attr: { "stroke-dashoffset": 400 }, opacity: 0 });
    st.forEach(function (p) { p.style.strokeDasharray = 400; });
    gsap.set(fl, { scaleY: 0, transformOrigin: "50% 100%" });
    gsap.set(sun, { y: "46vh", autoAlpha: 0 });
    gsap.set(brand, { autoAlpha: 0, y: 26 });

    var counter = { v: 0 };
    var tl = gsap.timeline({ onComplete: function () { FM.startScroll(); finish(); } });
    tl.to(sun, { y: 0, autoAlpha: 1, duration: 1.7, ease: "power2.out" }, 0)
      .to(st, { opacity: 1, duration: 0.01 }, 0.2)
      .to(st, { attr: { "stroke-dashoffset": 0 }, duration: 1.2, stagger: 0.12, ease: "power2.inOut" }, 0.25)
      .to(fl, { scaleY: 1, duration: 0.5, stagger: 0.22, ease: "power3.out" }, 0.9)
      .to(brand, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out" }, 1.3)
      .to(counter, {
        v: 100, duration: 2.2, ease: "power2.inOut",
        onUpdate: function () { bar.style.width = Math.round(counter.v) + "%"; },
      }, 0.2);
    } catch (err) { FM.startScroll(); finish(); }
  }

  /* ---------- ناوبری ---------- */
  function initNav() {
    var nav = document.getElementById("nav");
    var lastY = 0;
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      nav.classList.toggle("is-scrolled", y > 40);
      nav.classList.toggle("is-hidden", y > 460 && y > lastY && !document.body.classList.contains("menu-open"));
      lastY = y;
      var bar = document.getElementById("scrollBar");
      if (bar) {
        var h = document.documentElement.scrollHeight - innerHeight;
        bar.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
      }
    }, { passive: true });

    document.querySelectorAll("[data-navpage]").forEach(function (a) {
      a.addEventListener("click", function () {
        try { sessionStorage.setItem("fmScroll:" + location.pathname, String(Math.round(window.scrollY))); } catch (err) {}
      });
    });

    document.querySelectorAll("[data-scroll-to]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (!id || id.charAt(0) !== "#") return;
        var t = document.querySelector(id);
        if (!t) return;
        e.preventDefault();
        var wasMenu = document.body.classList.contains("menu-open");
        closeMenu();
        /* موقعیت فعلی را همین حالا ذخیره کن و تا پایان انیمیشن، ذخیرهٔ خودکار را قفل کن */
        try { sessionStorage.setItem("fmScroll:" + location.pathname, String(Math.round(window.scrollY))); } catch (err) {}
        navLock = true;
        setTimeout(function () { navLock = false; }, 2200);
        /* اگر از داخل منو آمده‌ایم، ورودی منو در تاریخچه جای خود را به بخش می‌دهد */
        if (wasMenu && menuPushed) {
          try { history.replaceState({ fm: "sec", id: id.slice(1) }, "", id); menuPushed = false; } catch (err) {}
        } else {
          try { history.pushState({ fm: "sec", id: id.slice(1) }, "", id); } catch (err) {}
        }
        FM.scrollToEl(t);
      });
    });

    /* ---------- Back در کل سایت: بازگشت به بخش یا موقعیت قبلی ---------- */
    var scrollSaveT = null;
    var navLock = false;
    window.addEventListener("scroll", function () {
      if (navLock) return;
      clearTimeout(scrollSaveT);
      scrollSaveT = setTimeout(function () {
        try { sessionStorage.setItem("fmScroll:" + location.pathname, String(Math.round(window.scrollY))); } catch (e) {}
      }, 250);
    }, { passive: true });

    /* اگر #main در صفحه نبود (مثل sky)، بقیهٔ initNav نباید بمیرد */
    var mainEl = document.getElementById("main");
    mainEl && mainEl.addEventListener("click", function (e) {
      var card = e.target.closest("a.dcard, a.ncard, a.hcard, .msg-card, a[href^='/property.html']");
      if (card) {
        try { sessionStorage.setItem("fmScroll:" + location.pathname, String(Math.round(window.scrollY))); } catch (err) {}
      }
    }, true);

    window.addEventListener("popstate", function (e) {
      var st = e.state || {};
      if (menuOpen) { closeMenu(); return; }
      if (st.fm === "menu") { openMenu(); return; }
      if (st.fm === "sec" && st.id) {
        var t = document.getElementById(st.id);
        if (t) { FM.scrollToEl(t, { immediate: true }); return; }
      }
      /* بازگشت به موقعیت ذخیره‌شدهٔ همین صفحه */
      var saved = parseInt(sessionStorage.getItem("fmScroll:" + location.pathname) || "0", 10);
      navLock = true;
      setTimeout(function () { navLock = false; }, 2200);
      if (FM.lenis) FM.lenis.scrollTo(saved, { immediate: true });
      else window.scrollTo(0, saved);
    });
  }

  /* ---------- منوی تمام‌صفحه ---------- */
  var menuTl = null, menuOpen = false;
  function buildMenuTl() {
    var menu = document.getElementById("menu");
    var bg = menu.querySelector(".menu__bg");
    var links = menu.querySelectorAll(".menu__link");
    var imgs = menu.querySelectorAll(".menu__img");
    var foot = menu.querySelector(".menu__foot");
    var tl = gsap.timeline({ paused: true });
    tl.set(menu, { visibility: "visible" });
    tl.fromTo(bg, { clipPath: "circle(0% at calc(100% - 60px) 40px)" },
      { clipPath: "circle(160% at calc(100% - 60px) 40px)", duration: 0.8, ease: "power3.inOut" });
    tl.fromTo(links, { autoAlpha: 0, x: 70, rotation: 2 },
      { autoAlpha: 1, x: 0, rotation: 0, duration: 0.65, stagger: 0.07, ease: "power3.out" }, "-=0.3");
    tl.fromTo(imgs, { autoAlpha: 0, y: 90, scale: 1.12 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.85, stagger: 0.1, ease: "power3.out" }, "-=0.5");
    tl.fromTo(foot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, "-=0.4");
    tl.eventCallback("onReverseComplete", function () {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      gsap.set(menu, { visibility: "hidden" });
    });
    return tl;
  }
  var menuPushed = false;
  function openMenu() {
    var menu = document.getElementById("menu");
    if (menuOpen || !menu || !document.getElementById("menuBtn")) return;
    menuOpen = true;
    try { history.pushState({ fm: "menu" }, "", location.hash || location.pathname); menuPushed = true; } catch (e) {}
    document.body.classList.add("menu-open");
    var menuBtn = document.getElementById("menuBtn");
    menuBtn.classList.add("is-open");
    menuBtn.setAttribute("aria-expanded", "true");
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    if (!menuTl) menuTl = buildMenuTl();
    if (LITE) { menuTl.progress(1); }
    else { FM.stopScroll(); menuTl.timeScale(1).play(); }
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    document.body.classList.remove("menu-open");
    var menu = document.getElementById("menu");
    if (!menu) return;
    var btn = document.getElementById("menuBtn");
    btn && btn.classList.remove("is-open");
    btn && btn.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-hidden", "true");
    FM.startScroll();
    if (menuTl && !LITE) menuTl.timeScale(1.5).reverse();
    else {
      menuTl && menuTl.pause(0);
      menu.classList.remove("is-open");
      /* مهم: visibility اینلاینِ حاصل از progress(1) پاک شود تا منو واقعاً بسته شود */
      gsap.set(menu, { visibility: "hidden" });
    }
    setTimeout(function () { if (!menuOpen) menu.classList.remove("is-open"); }, 900);
  }
  function initMenu() {
    var menuBtn = document.getElementById("menuBtn");
    var menuEl = document.getElementById("menu");
    if (!menuBtn || !menuEl) return; /* صفحاتی که منو ندارند */
    menuBtn.addEventListener("click", function () {
      menuOpen ? history.back() : openMenu();
    });
    var mc = document.getElementById("menuClose");
    mc && mc.addEventListener("click", function () { menuPushed ? history.back() : closeMenu(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuOpen) menuPushed ? history.back() : closeMenu();
    });
  }

  /* ---------- Hero: Idle Loop + Mouse-follow چندلایه ---------- */
  function initHero() {
    if (!FM.isHome) return;
    var sun = document.querySelector("[data-hero-sun]");
    var far = document.querySelector("[data-sky-far]");
    var near = document.querySelector("[data-sky-near]");
    var clouds = document.querySelectorAll("[data-cloud]");
    var eyebrow = document.querySelector("[data-hero-eyebrow]");
    var sub = document.querySelector("[data-hero-sub]");
    var lead = document.querySelector("[data-hero-lead]");
    var cta = document.querySelector("[data-hero-cta]");
    var stats = document.querySelector("[data-hero-stats]");
    var hint = document.querySelector("[data-hero-hint]");
    var stage = document.querySelector("[data-hero-stage]");
    var underline = document.querySelector(".hero__underline");

    /* تقسیم کلمه‌ای حفظ‌کنندهٔ em */
    function wordSplit(el) {
      var spans = [];
      Array.prototype.slice.call(el.childNodes).forEach(function (node) {
        var words = node.textContent.trim().split(/\s+/).filter(Boolean);
        words.forEach(function (w) {
          var s = document.createElement("span");
          s.className = "w";
          if (node.nodeType === 1) {
            var inner = node.cloneNode(false);
            inner.textContent = w; s.appendChild(inner);
          } else s.textContent = w;
          el.appendChild(s);
          spans.push(s);
        });
      });
      el.textContent = "";
      spans.forEach(function (s) { el.appendChild(s); el.appendChild(document.createTextNode(" ")); });
      return spans;
    }
    var w1 = wordSplit(document.querySelector("[data-hero-words]"));
    var w2 = wordSplit(document.querySelector("[data-hero-words2]"));

    gsap.set([w1, w2].flat(), { y: "120%" });
    gsap.set([eyebrow, lead, sub, cta, stats, hint], { autoAlpha: 0, y: 26 });
    gsap.set(far, { yPercent: 40 });
    gsap.set(near, { yPercent: 60 });
    gsap.set(sun, { yPercent: 60, scale: 0.8 });

    FM.playHero = function () {
      /* حالت LITE: اعمال مستقیم وضعیت نهایی بدون تایم‌لاین خالی */
      if (LITE) {
        gsap.set([sun, far, near], { yPercent: 0, scale: 1 });
        gsap.set([w1, w2].flat(), { y: "0%" });
        gsap.set([eyebrow, lead, sub, cta, stats, hint], { autoAlpha: 1, y: 0 });
        if (underline) gsap.set(underline, { strokeDashoffset: 0 });
        return;
      }
      var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(sun, { yPercent: 0, scale: 1, duration: 1.6 }, 0)
        .to(far, { yPercent: 0, duration: 1.5 }, 0.15)
        .to(near, { yPercent: 0, duration: 1.5 }, 0.25)
        .to(eyebrow, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.5)
        .to(w1, { y: "0%", duration: 0.85, stagger: 0.06 }, 0.65)
        .to(w2, { y: "0%", duration: 0.85, stagger: 0.05 }, 0.85)
        .fromTo(underline, { drawSVG: "0%", strokeDasharray: 260, strokeDashoffset: 260 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, 1.15)
        .to(lead, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out" }, 1.1)
        .to(sub, { autoAlpha: 1, y: 0, duration: 0.7 }, 1.3)
        .to(cta, { autoAlpha: 1, y: 0, duration: 0.7 }, 1.35)
        .to(stats, { autoAlpha: 1, y: 0, duration: 0.7 }, 1.5)
        .to(hint, { autoAlpha: 1, y: 0, duration: 0.6 }, 1.65);
    };

    /* شمارنده‌ها — در LITE هم باید مقدار نهایی دیده شود */
    document.querySelectorAll("[data-count]").forEach(function (el) {
      var target = +el.dataset.count, suffix = el.dataset.suffix || "";
      if (el.dataset.stat && !target) { var box = el.closest(".hero__stat"); if (box) box.hidden = true; return; }
      var o = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: "top 92%", once: true,
        onEnter: function () {
          gsap.to(o, {
            v: target, duration: LITE ? 0.01 : 2, ease: "power2.out",
            onUpdate: function () { el.textContent = FM.fa(Math.round(o.v)) + suffix; },
          });
        },
      });
    });

    if (LITE) return;

    /* Idle loop: شناوری دائمی لایه‌ها + درفت جانبی خورشید/ماه */
    gsap.to(sun, { yPercent: -3, duration: 5.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(sun, { x: -30, duration: 11, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(far, { yPercent: -1.2, duration: 7, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(near, { yPercent: -0.8, duration: 6, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.6 });
    clouds.forEach(function (c, i) {
      gsap.fromTo(c, { x: i ? "6vw" : "-4vw" }, {
        x: i ? "-14vw" : "14vw", duration: 46 + i * 22,
        repeat: -1, yoyo: true, ease: "sine.inOut",
      });
    });

    /* Mouse-follow با عمق متفاوت — quickTo برای کارایی */
    var mx = { v: 0 }, my = { v: 0 };
    var fx = [
      [sun, 34, 20], [far, 18, 8], [near, 30, 14],
    ].map(function (pair) {
      return [gsap.quickTo(pair[0], "xPercent", { duration: 1, ease: "power3" }),
              gsap.quickTo(pair[0], "yPercent", { duration: 1, ease: "power3" }), pair[1], pair[2]];
    });
    stage.addEventListener("pointermove", function (e) {
      mx.v = (e.clientX / innerWidth - 0.5) * 2;
      my.v = (e.clientY / innerHeight - 0.5) * 2;
      fx.forEach(function (f) {
        f[0](mx.v * f[2] / 100);
        f[1](my.v * f[3] / 100);
      });
    });

    /* برچسب‌های زنده: سه ملک با بالاترین امتیاز — قابل کلیک تا صفحهٔ ملک */
    var beam = document.querySelector("[data-beam]");
    var topProps = (FM.data.properties || []).slice().sort(function (x, y) { return y.score - x.score; }).slice(0, 3);
    var tagPos = [
      { left: "3%", bottom: "30%" },
      { left: "22%", bottom: "16%" },
      { left: "8%", bottom: "50%" },
    ];
    if (near && topProps.length) {
      topProps.forEach(function (p, i) {
        var a = document.createElement("a");
        a.className = "hero__tag hero__tag--live";
        a.href = FM.propUrl(p.id);
        var pos = tagPos[i % tagPos.length];
        a.style.left = pos.left || "auto";
        a.style.bottom = pos.bottom;
        a.style.animationDelay = (2.6 + i * 0.7) + "s";
        a.innerHTML = FM.esc(p.title) + (p.score != null ? "<b> · " + FM.fa(p.score) + "</b>" : "");
        near.parentElement.appendChild(a);
      });
    }
    var tags = document.querySelectorAll(".hero__tag");
    if (beam && tags.length) {
      var sweep = gsap.fromTo(beam, { x: "0vw" }, {
        x: "106vw", duration: 7, repeat: -1, yoyo: true, ease: "sine.inOut",
        onUpdate: function () {
          var br = beam.getBoundingClientRect();
          var bx = br.left + br.width / 2;
          tags.forEach(function (t) {
            var tr = t.getBoundingClientRect();
            var near = Math.abs(tr.left + tr.width / 2 - bx) < 170;
            t.classList.toggle("is-lit", near);
          });
        },
      });
      /* توقف با هاوس برای مطالعه */
      stage.addEventListener("pointerenter", function () { sweep.pause(); });
      stage.addEventListener("pointerleave", function () { sweep.resume(); });
    }

    /* تیلت سه‌بعدی ملایم کل صحنه با موس */
    if (!LITE) {
      var tiltX = gsap.quickTo(stage, "rotationX", { duration: 1.2, ease: "power3" });
      var tiltY = gsap.quickTo(stage, "rotationY", { duration: 1.2, ease: "power3" });
      gsap.set(stage, { transformPerspective: 1200 });
      stage.addEventListener("pointermove", function (e) {
        tiltX((e.clientY / innerHeight - 0.5) * -3.4);
        tiltY((e.clientX / innerWidth - 0.5) * 4.2);
      });
      stage.addEventListener("pointerleave", function () { tiltX(0); tiltY(0); });
    }

    /* اسکرول: لایه‌ها از هم باز می‌شوند و متن محو */
    gsap.timeline({
      scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: true },
    })
      .to(sun, { yPercent: -30, ease: "none" }, 0)
      .to(far, { yPercent: 24, ease: "none" }, 0)
      .to(near, { yPercent: 38, ease: "none" }, 0)
      .to("[data-hero] .hero__content", { y: -120, autoAlpha: 0, ease: "none" }, 0)
      .to(stats, { autoAlpha: 0, ease: "none" }, 0)
      .to("[data-hero] .hero__scrim", { opacity: 1.4, ease: "none" }, 0);
  }

  /* ---------- قفل/رهاسازی اسکرول ---------- */
  function initLock() {
    if (!FM.isHome) return;
    var btn = document.getElementById("lockToggle");
    if (!btn) return;
    var locked = false;
    function show(v) {
      if (v) { btn.hidden = false; gsap.to(btn, { autoAlpha: 1, y: 0, duration: 0.5 }); }
      else gsap.to(btn, { autoAlpha: 0, y: 20, duration: 0.4, onComplete: function () { btn.hidden = true; } });
    }
    btn.addEventListener("click", function () {
      locked = !locked;
      btn.setAttribute("aria-pressed", String(locked));
      btn.classList.toggle("is-locked", locked);
      if (locked) { FM.stopScroll(); FM.lenis && FM.lenis.scrollTo(0, { duration: 0 }); }
      else FM.startScroll();
    });
    /* نمایش فقط وقتی ویترین در دید است — بررسی در اسکرول/لود/تغییر اندازه */
    var goldenEl = document.getElementById("golden");
    var lockChecking = false;
    function checkLock() {
      if (!goldenEl) return;
      var r = goldenEl.getBoundingClientRect();
      var inView = r.top < innerHeight * 0.8 && r.bottom > 0;
      if (inView && btn.hidden) { btn.hidden = false; gsap.fromTo(btn, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.45 }); }
      else if (!inView && !btn.hidden && !lockChecking) {
        lockChecking = true;
        gsap.to(btn, { autoAlpha: 0, y: 16, duration: 0.35, onComplete: function () { btn.hidden = true; lockChecking = false; } });
      }
    }
    window.addEventListener("scroll", checkLock, { passive: true });
    window.addEventListener("resize", checkLock);
    window.addEventListener("load", checkLock);
    /* بعد از Intro هم یک بار بررسی شود */
    setTimeout(checkLock, 600);
    setTimeout(checkLock, 3600);
  }

  /* ---------- بازگشت به ابتدا ---------- */
  function initToTop() {
    var btn = document.getElementById("toTop");
    if (!btn) return;
    btn.addEventListener("click", function () { FM.scrollToEl(0); });
    window.addEventListener("scroll", function () {
      var show = window.scrollY > 700;
      if (show && btn.hidden) { btn.hidden = false; gsap.fromTo(btn, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.4 }); }
      else if (!show && !btn.hidden) { gsap.to(btn, { autoAlpha: 0, scale: 0.6, duration: 0.3, onComplete: function () { btn.hidden = true; } }); }
    }, { passive: true });
  }

  /* ---------- اشتراک‌گذاری ---------- */
  FM.share = function (title, url) {
    url = url || location.href;
    if (navigator.share) {
      navigator.share({ title: title || document.title, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { FM.toast("نشانی صفحه کپی شد"); });
    }
  };
  FM.toast = function (msg) {
    var t = document.createElement("div");
    t.className = "fm-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("is-on"); }, 10);
    setTimeout(function () { t.classList.remove("is-on"); setTimeout(function () { t.remove(); }, 400); }, 2400);
  };
  function initShare() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-share]");
      if (b) FM.share();
    });
  }

  /* ---------- Reveal و split عمومی ---------- */
  FM.splitWords = function (el) {
    var spans = [];
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      var words = node.textContent.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { el.appendChild(node.cloneNode(true)); return; }
      words.forEach(function (w) {
        var s = document.createElement("span");
        s.className = "w";
        if (node.nodeType === 1) { var inner = node.cloneNode(false); inner.textContent = w; s.appendChild(inner); }
        else s.textContent = w;
        spans.push(s);
      });
    });
    el.textContent = "";
    spans.forEach(function (s) { el.appendChild(s); el.appendChild(document.createTextNode(" ")); });
    return spans;
  };
  function initReveals() {
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      gsap.fromTo(el, { autoAlpha: 0, y: 34 }, {
        autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });
    document.querySelectorAll("[data-split]").forEach(function (el) {
      var words = FM.splitWords(el);
      gsap.set(words, { y: "115%" });
      gsap.to(words, {
        y: "0%", duration: 0.8, stagger: 0.05, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 86%", once: true },
      });
    });
    if (!LITE) {
      var track = document.querySelector("[data-marquee-track]");
      if (track) {
        var tl = gsap.to(track, { xPercent: 50, ease: "none", duration: 26, repeat: -1 });
        ScrollTrigger.create({
          onUpdate: function (s) {
            tl.timeScale(1 + Math.min(Math.abs(s.getVelocity() / 900), 3));
          },
        });
      }
    }
  }

  /* ---------- دکمه‌ها ---------- */
  function initButtons() {
    document.querySelectorAll(".btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.classList.remove("is-pressed");
        void btn.offsetWidth;
        btn.classList.add("is-pressed");
      });
    });
  }

  function boot() {
    initLenis();
    initNav();
    initMenu();
    initHero();
    initLock();
    initToTop();
    initShare();
    initReveals();
    initButtons();
    FM.stopScroll();
    runIntro(function () {
      FM.startScroll();
      FM.playHero && FM.playHero();
      ScrollTrigger.refresh();
      if (location.hash && location.hash.length > 1) {
        var t = document.querySelector(location.hash);
        if (t) {
          ScrollTrigger.refresh();
          setTimeout(function () { FM.scrollToEl(t, { immediate: true }); }, 80);
        }
      }
    });
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  }

  boot();
})();
