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
        FM.setTheme(FM.theme === "dark" ? "light" : "dark", true); window.FMTheme && FMTheme.choose(FM.theme);
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
      FM.startScroll();
      done();
    }
    var skip = document.getElementById("introSkip");
    skip && skip.addEventListener("click", finish);
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { document.removeEventListener("keydown", esc); finish(); }
    });

    /* انیمیشن خود صفحهٔ بارگذاری با CSS است و از همان لحظهٔ رسیدن صفحه اجرا می‌شود؛ اینجا فقط صبر می‌کنیم
       تا صفحه واقعاً بار شود (و انیمیشن یک بار کامل دیده شود)، و هرگز بیش از ۸ ثانیه معطل نمی‌مانیم */
    FM.stopScroll();
    var minMs = seen || LITE ? 600 : 2700;
    var loaded = document.readyState === "complete", sched = false;
    function go() {
      if (!loaded || sched) return;
      sched = true;
      setTimeout(function () {
        intro.classList.add("is-loaded");   // نوار پیشرفت تا آخر پر می‌شود
        setTimeout(finish, 280);
      }, Math.max(0, minMs - performance.now()));
    }
    if (!loaded) addEventListener("load", function () { loaded = true; go(); });
    setTimeout(function () { loaded = true; go(); }, 8000);
    go();
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
      if (FM.chatOpen && FM.chatOpen()) return;   // برگشت فقط دستیار را می‌بندد (assistant.js)
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

    /* نورافکن فرصت‌ها: برترین ملک‌ها یکی‌یکی بالای ساختمان‌ها ظاهر و پس از چند ثانیه محو می‌شوند (قابل کلیک) */
    var topOf = function (list) {
      return (list || []).filter(function (p) { return p.score != null; }).sort(function (x, y) { return y.score - x.score; }).slice(0, 8);
    };
    var topProps = topOf(FM.data.properties);
    /* با اعمال فیلتر صفحهٔ اصلی، نورافکن هم فقط ملک‌های همان فیلتر را نشان می‌دهد */
    document.addEventListener("fm:filtered", function (e) {
      var list = e.detail && e.detail.items;
      topProps = list ? topOf(list) : topOf(FM.data.properties);
      if (typeof propIdx !== "undefined") propIdx = 0;
      if (typeof live !== "undefined") live.forEach(function (a) { a.classList.remove("is-on"); a.classList.add("is-out"); });
    });
    if (stage) {
      var spots = document.createElement("div");
      spots.className = "hspots";
      stage.appendChild(spots);
      var mobile = matchMedia("(max-width: 760px)").matches;
      /* گوشی: کارت‌های کوچک‌تر و چندتایی هم‌زمان (مثل رایانه)، در جاهایی که روی دکمهٔ دستیار نیفتند */
      var SLOTS = mobile ? [{ r: 30, b: 0, lane: 1 }, { r: 72, b: 0, lane: 2 }]
        : [{ r: 60, b: 30 }, { r: 80, b: 40 }, { r: 66, b: 46 }, { r: 86, b: 27 }];
      if (mobile) spots.classList.add("is-mini");
      var slotIdx = 0, propIdx = 0, paused = false, live = [];
      var spawn = function () {
        if (paused || document.hidden || !topProps.length) return;
        /* جایی که هنوز کارت قبلی رویش است رد می‌شود تا دو کارت روی هم نیفتند */
        var si = -1;
        for (var k = 0; k < SLOTS.length; k++) {
          var c = (slotIdx + k) % SLOTS.length;
          if (!live.some(function (x) { return x._slot === c && !x.classList.contains("is-out"); })) { si = c; break; }
        }
        if (si < 0) return;
        slotIdx = si + 1;
        var p = topProps[propIdx++ % topProps.length];
        var slot = SLOTS[si];
        var a = document.createElement("a");
        a.className = "hspot";
        a._slot = si;
        a.dataset.status = p.status;
        a.href = FM.propUrl(p.id);
        a.style.bottom = slot.b + "%";
        a.innerHTML = '<span class="hspot__img"><img src="' + FM.esc(p.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG"></span>' +
          '<span class="hspot__txt">' + FM.badge(p) + '<b>' + FM.esc(p.title) + '</b><small>' + FM.esc(p.diffText || p.tag) + '</small></span>' +
          '<span class="hspot__score">' + FM.fa(p.score) + '</span><i class="hspot__beam" aria-hidden="true"></i>';
        spots.appendChild(a);
        live.push(a);
        /* کارت از پنجرهٔ روشن یکی از خانه‌ها بیرون می‌آید: پنجره چشمک می‌زند، پرتو از همان پنجره بالا می‌رود
           و کارت از نقطهٔ پنجره بزرگ می‌شود؛ هنگام رفتن هم به همان پنجره برمی‌گردد */
        var sr = stage.getBoundingClientRect(), w = a.offsetWidth, h = a.offsetHeight;
        var cx = sr.width * (1 - slot.r / 100), cardY = sr.bottom - sr.height * slot.b / 100;
        var btnB = 0;
        if (slot.lane) {
          /* گوشی: کارت در فاصلهٔ میان دکمه‌ها و ساختمان‌ها می‌نشیند تا پرتو تا پنجره دیده شود */
          var winT = sr.bottom;
          heroBtns.forEach(function (b) { var r = b.getBoundingClientRect(); if (r.height) btnB = Math.max(btnB, r.bottom); });
          winEls.forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width && r.top < winT) winT = r.top; });
          cardY = Math.max(btnB + 8 + h, Math.min(winT - 26, btnB + 8 + h + 40));
          a.style.bottom = Math.round(sr.bottom - cardY) + "px";
        }
        var win = pickWindow(sr, cx, cardY);
        var wx = win ? win.x - sr.left : cx;
        var maxR = sr.width - 8;
        if (mobile && heroHint) { var hr = heroHint.getBoundingClientRect(); if (hr.width) maxR = Math.min(maxR, hr.left - sr.left - 8); }   // نوشتهٔ عمودی «اسکرول کنید» آزاد بماند
        var minL = 8, mid = (8 + maxR) / 2;                    // وسطِ فضای آزاد (بدون نوشتهٔ «اسکرول کنید»)
        if (slot.lane === 1) minL = mid + 4;                  // نیمهٔ راست
        if (slot.lane === 2) maxR = mid - 4;                  // نیمهٔ چپ
        var left = Math.min(Math.max(wx - w / 2, minL), maxR - w);
        if (slot.lane === 1 && left < minL) {
          /* گوشی باریک: دو کارت کنار هم جا نمی‌شوند؛ کارت راست یک ردیف بالاتر، وگرنه این نوبت نمایش داده نمی‌شود */
          cardY -= h + 8;
          if (cardY - h < btnB + 6) { a.remove(); live = live.filter(function (x) { return x !== a; }); return; }
          a.style.bottom = Math.round(sr.bottom - cardY) + "px";
          win = pickWindow(sr, cx, cardY);
          wx = win ? win.x - sr.left : cx;
          left = Math.min(Math.max(wx - w / 2, 8), maxR - w);
        }
        a.style.left = left + "px";
        a.style.setProperty("--bx", Math.round(wx - left) + "px");
        var beamH = Math.round(win ? Math.min(340, Math.max(14, win.y - cardY)) : mobile ? 18 : 46);
        a.style.setProperty("--beam", beamH + "px");
        /* نقطهٔ شروع پرواز: مرکز کارت روی همان پنجره */
        a.style.setProperty("--fx", Math.round(wx - left - w / 2) + "px");
        a.style.setProperty("--fy", Math.round(beamH + h / 2) + "px");
        if (win) { win.el.classList.add("is-calling"); a._wx = win.x; }
        setTimeout(function () { a.classList.add("is-on"); }, win ? 420 : 30);
        setTimeout(function () {
          a.classList.remove("is-on"); a.classList.add("is-out");
          setTimeout(function () { if (win) win.el.classList.remove("is-calling"); a.remove(); live = live.filter(function (x) { return x !== a; }); }, 700);
        }, mobile ? 5000 : 5600);
      };
      /* نزدیک‌ترین پنجرهٔ پیدای زیر کارت (چند گزینهٔ نزدیک، یکی تصادفی) */
      var winEls = Array.prototype.slice.call(document.querySelectorAll("[data-hero] .win-lights rect"));
      var heroBtns = Array.prototype.slice.call(document.querySelectorAll("[data-hero] .hero__content .btn"));
      var heroHint = document.querySelector("[data-hero-hint]");
      var pickWindow = function (sr, cx, cardY) {
        var cand = [];
        var fab = document.getElementById("chatFab"), fabR = fab && fab.offsetParent ? fab.getBoundingClientRect() : null;
        var busyX = live.filter(function (a) { return !a.classList.contains("is-out") && a._wx != null; }).map(function (a) { return a._wx; });
        for (var i = 0; i < winEls.length; i++) {
          var el = winEls[i];
          if (el.classList.contains("is-calling")) continue;
          var r = el.getBoundingClientRect();
          if (!r.width) continue;
          var x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (mobile && x > sr.right - 60) continue;
          if (fabR && x > fabR.left - 8 && x < fabR.right + 8 && y > fabR.top - 30) continue;   // پرتو پشت دکمهٔ دستیار نرود
          if (busyX.some(function (bx) { return Math.abs(bx - x) < (mobile ? 40 : 70); })) continue;   // پرتوها روی هم نیفتند
          if (y < cardY + 12 || y > Math.min(sr.bottom, innerHeight) - 4) continue;
          var d = Math.abs(x - sr.left - cx);
          if (d < (mobile ? 70 : 120)) cand.push({ el: el, x: x, y: y, d: d });
        }
        if (!cand.length) return null;
        cand.sort(function (a, b) { return a.d - b.d; });
        return cand[Math.floor(Math.random() * Math.min(3, cand.length))];
      };
      spots.addEventListener("pointerenter", function () { paused = true; });
      spots.addEventListener("pointerleave", function () { paused = false; });
      setTimeout(function () { spawn(); setTimeout(spawn, 900); }, LITE ? 300 : 2400);
      setInterval(spawn, mobile ? 1900 : 2600);
    }
    var beam = document.querySelector("[data-beam]");
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

  /* اشتراک‌گذاری: FM.share و دکمه‌های [data-share] در data.js و share-kit.js (پنجرهٔ پیوند و پوستر) */
  FM.toast = function (msg) {
    var t = document.createElement("div");
    t.className = "fm-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("is-on"); }, 10);
    setTimeout(function () { t.classList.remove("is-on"); setTimeout(function () { t.remove(); }, 400); }, 2400);
  };


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

  /* برگشت از صفحهٔ فرعی (ملک، اشتراک و …): به همان نقطه‌ای از صفحه که کاربر از آن رفته بود */
  function restoreBackY(y) {
    if (!FM.backNav || y < 40) return;
    var touched = false;
    var stop = function () { touched = true; };
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (ev) { window.addEventListener(ev, stop, { once: true, passive: true }); });
    var go = function () {
      if (touched || Math.abs(window.scrollY - y) < 4) return;
      ScrollTrigger.refresh();
      if (FM.lenis) FM.lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    };
    go();
    /* محتوای دیررس (نتیجهٔ فیلترِ برگشته، تصاویر) ارتفاع صفحه را عوض می‌کند؛ چند بار دیگر هم تنظیم شود */
    document.addEventListener("fm:filtered", function () { setTimeout(go, 80); }, { once: true });
    if (document.readyState !== "complete") window.addEventListener("load", function () { setTimeout(go, 80); });
    setTimeout(go, 700);
    setTimeout(go, 1600);
    setTimeout(function () { touched = true; }, 4000);
  }

  function boot() {
    var backY = 0;
    try { backY = parseInt(sessionStorage.getItem("fmScroll:" + location.pathname) || "0", 10) || 0; } catch (e) {}
    initLenis();
    initNav();
    initMenu();
    initHero();
    initLock();
    initToTop();
    initReveals();
    initButtons();
    FM.stopScroll();
    runIntro(function () {
      FM.startScroll();
      FM.playHero && FM.playHero();
      ScrollTrigger.refresh();
      if (FM.backNav && backY >= 40) restoreBackY(backY);
      else if (location.hash && location.hash.length > 1) {
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

  /* نصب روی صفحهٔ گوشی (PWA): اندروید با دکمهٔ نصب خود مرورگر، آیفون با راهنمای «Add to Home Screen»؛
     بعد از ۲۵ ثانیه ماندن در سایت، و اگر کاربر «بعداً» زد تا ۱۴ روز دوباره نمی‌آید */
  (function installHint() {
    var KEY = "fmInstallLater", standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone || !matchMedia("(max-width: 860px)").matches) return;
    try { if (+localStorage.getItem(KEY) > Date.now()) return; } catch (e) {}
    var deferred = null, ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; });
    setTimeout(function () {
      if (!deferred && !ios) return;
      var b = document.createElement("div");
      b.className = "ihint";
      b.innerHTML = '<img src="/assets/img/icon-192.png" alt=""><div><b>فرصت ملک روی صفحهٔ گوشی</b><small>' +
        (deferred ? "با یک لمس، بدون بازار و گوگل‌پلی، مثل یک برنامه باز شود." : "در سافاری دکمهٔ اشتراک <bdi>⬆︎</bdi> را بزنید و «Add to Home Screen» را انتخاب کنید.") +
        '</small></div><div class="ihint__acts">' + (deferred ? '<button type="button" class="btn btn--gold" data-i="ok">نصب</button>' : "") + '<button type="button" class="ihint__later" data-i="later">بعداً</button></div>';
      document.body.appendChild(b);
      requestAnimationFrame(function () { b.classList.add("is-on"); });
      b.addEventListener("click", function (e) {
        var a = e.target.closest("[data-i]"); if (!a) return;
        if (a.dataset.i === "ok" && deferred) { deferred.prompt(); deferred = null; }
        try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)); } catch (err) {}
        b.classList.remove("is-on"); setTimeout(function () { b.remove(); }, 400);
      });
    }, 25000);
  })();

  /* پیش‌واکشی برای مرورگرهایی که Speculation Rules ندارند (سافاری، فایرفاکس):
     - با نزدیک شدن نشانگر (۶۵ میلی‌ثانیه) یا لمس یک پیوند داخلی، همان صفحه پیش‌واکشی می‌شود
     - در زمان بیکاری بعد از بار کامل، صفحهٔ «قیمت از دید آسمان» و اسکریپت‌هایش آماده می‌شوند */
  (function prefetchFallback() {
    if (HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) return;
    var conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ""))) return;   // اینترنت کند یا صرفه‌جویی داده: نه
    var done = {};
    function pf(url) {
      if (done[url]) return; done[url] = 1;
      var l = document.createElement("link"); l.rel = "prefetch"; l.href = url; document.head.appendChild(l);
    }
    function internal(a) { return a && a.origin === location.origin && /^\/(ad\/|sky\.html|app\.html|account\.html)/.test(a.pathname) && a.pathname !== location.pathname; }
    var t = null;
    document.addEventListener("pointerover", function (e) {
      var a = e.target.closest && e.target.closest("a[href]"); if (!internal(a)) return;
      clearTimeout(t); t = setTimeout(function () { pf(a.pathname + a.search); }, 65);
    }, { passive: true });
    document.addEventListener("pointerout", function () { clearTimeout(t); }, { passive: true });
    document.addEventListener("touchstart", function (e) {
      var a = e.target.closest && e.target.closest("a[href]"); if (internal(a)) pf(a.pathname + a.search);
    }, { passive: true });
    addEventListener("load", function () {
      var idle = window.requestIdleCallback || function (f) { setTimeout(f, 1500); };
      idle(function () {
        pf("/sky.html");
        var tag = ((document.querySelector('script[src*="/assets/site/js/app.js"]') || {}).src || "").split("?v=")[1];
        if (tag) { pf("/assets/site/js/sky.js?v=" + tag); pf("/assets/site/css/pages.css?v=" + tag); }
      });
    });
  })();
})();
