/* لایهٔ سینمایی نمایش: فقط چیدمان، حرکت، عمق و نور؛ هیچ متن، پیوند یا مدل کره‌ای تغییر نمی‌کند.
   الهام: تغییر رنگ فصل‌ها و خطوط تراز (landonorris)، قاب نقشه‌کشی و نشانه‌های گوشه (heronai)،
   ستون فصل‌ها و پژواک تیترها (huyml). همه‌چیز با IntersectionObserver و یک حلقهٔ rAF، فقط transform/opacity. */
const Cine = (() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const toFa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

  /* ---------- خطوط تراز (نقشهٔ توپوگرافی) به‌صورت رویه‌ای؛ یک بار ساخته و به‌صورت پس‌زمینه استفاده می‌شود ---------- */
  function contours(w = 900, h = 900, step = 18) {
    const nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1, f = [];
    const bumps = Array.from({ length: 7 }, (_, i) => ({ x: ((i * 397) % 1000) / 1000 * w, y: ((i * 613 + 211) % 1000) / 1000 * h, r: 160 + ((i * 89) % 220), a: i % 2 ? 1 : -0.8 }));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = i * step, y = j * step;
      let v = 0.18 * Math.sin(x / 140) * Math.cos(y / 170);
      for (const b of bumps) v += b.a * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.r * b.r));
      f.push(v);
    }
    const at = (i, j) => f[j * nx + i], paths = [];
    for (let k = -0.9; k <= 1.05; k += 0.12) {
      let d = "";
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
        const idx = (a > k) | ((b > k) << 1) | ((c > k) << 2) | ((e > k) << 3);
        if (!idx || idx === 15) continue;
        const x = i * step, y = j * step, L = (p, q) => (k - p) / (q - p || 1e-9);
        const T = [x + step * L(a, b), y], R = [x + step, y + step * L(b, c)], B = [x + step * L(e, c), y + step], Lf = [x, y + step * L(a, e)];
        const seg = { 1: [Lf, T], 2: [T, R], 3: [Lf, R], 4: [R, B], 5: [Lf, T, R, B], 6: [T, B], 7: [Lf, B], 8: [B, Lf], 9: [T, B], 10: [T, R, B, Lf], 11: [R, B], 12: [R, Lf], 13: [T, R], 14: [Lf, T] }[idx];
        for (let s = 0; s < seg.length; s += 2) d += `M${seg[s][0].toFixed(1)} ${seg[s][1].toFixed(1)}L${seg[s + 1][0].toFixed(1)} ${seg[s + 1][1].toFixed(1)}`;
      }
      if (d) paths.push(`<path d="${d}"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="1.1" stroke-linecap="round">${paths.join("")}</svg>`;
  }

  /* ---------- لایه‌های ثابت: پس‌زمینهٔ تراز، نوار پیشرفت و پردهٔ گذار ---------- */
  function layers() {
    if ($("#cineBg")) return;
    const bg = document.createElement("div");
    bg.id = "cineBg"; bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = `<i class="cine-topo"></i><i class="cine-glow"></i>`;
    document.body.prepend(bg);
    root.style.setProperty("--cine-topo", `url("data:image/svg+xml;utf8,${encodeURIComponent(contours())}")`);
    const bar = document.createElement("div");
    bar.className = "cine-progress"; bar.setAttribute("aria-hidden", "true");
    document.body.append(bar);
    const veil = document.createElement("div");
    veil.className = "cine-veil"; veil.setAttribute("aria-hidden", "true");
    document.body.append(veil);
  }

  /* ---------- پردهٔ آغاز (فقط بار اول در هر نشست و فقط روی صفحهٔ اصلی) ---------- */
  function intro() {
    let seen = false;
    try { seen = sessionStorage.getItem("cineIntro") === "1"; sessionStorage.setItem("cineIntro", "1"); } catch { /* */ }
    if (seen || reduce || (location.hash && location.hash !== "#/")) return;
    const mark = $(".brand__mark")?.outerHTML || "";
    const name = $(".brand__txt b")?.textContent || "";
    const el = document.createElement("div");
    el.className = "cine-intro"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<i class="cine-intro__a"></i><i class="cine-intro__b"></i><div class="cine-intro__in">${mark}<b>${name}</b></div>`;
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add("is-run"));
    setTimeout(() => el.classList.add("is-out"), 1150);
    setTimeout(() => el.remove(), 2100);
  }

  /* ---------- تیترهای جنبشی: واژه به واژه از پشت ماسک بالا می‌آیند (متن و ساختار داخلی دست نمی‌خورد) ---------- */
  function splitWords(h) {
    if (h.dataset.cineSplit) return;
    h.dataset.cineSplit = "1";
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const parts = c.textContent.split(/(\s+)/);
          if (parts.every((p) => !p.trim())) return;
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (!p.trim()) { frag.append(p); return; }
            const w = document.createElement("span"); w.className = "cw";
            const i = document.createElement("span"); i.className = "cw__i"; i.style.setProperty("--i", n++); i.textContent = p;
            w.append(i); frag.append(w);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && c.tagName !== "BR" && !c.classList.contains("cw")) walk(c);
      });
    };
    walk(h);
    h.classList.add("cine-words");
  }

  /* ---------- فصل‌ها: رنگ، شماره و پژواک تیتر ---------- */
  const TONE_DARK = /section--ink|scene|solution/;
  function chapters(view) {
    if (document.body.dataset.page !== "home") return [];
    const secs = $$(":scope > section", view).filter((s) => s.offsetHeight > 120 && s.querySelector("h1, h2"));
    secs.forEach((s, i) => {
      s.classList.add("cine-ch");
      s.dataset.cineTone = TONE_DARK.test(s.className) ? "dark" : s.classList.contains("section--sunk") ? "sunk" : "light";
      if (s.classList.contains("section--ink")) s.classList.add("cine-slab");
      if (!s.querySelector(":scope > .cine-idx") && !s.classList.contains("scene")) {
        const idx = document.createElement("span");
        idx.className = "cine-idx"; idx.setAttribute("aria-hidden", "true");
        idx.innerHTML = `<b>${toFa(String(i + 1).padStart(2, "0"))}</b><i></i><em>${toFa(String(secs.length).padStart(2, "0"))}</em>`;
        s.prepend(idx);
      }
    });
    // پژواک بزرگ و توخالی تیتر، پشت سر خودش (فقط تزئینی و برای صفحه‌خوان پنهان)
    $$(".sec-head h2, .story__q h2, .solution h2", view).forEach((h) => {
      if (!h.dataset.echo) h.dataset.echo = h.textContent.replace(/\s+/g, " ").trim().split(/[،,.؛]/)[0];
      h.classList.add("cine-echo");
    });
    return secs;
  }

  /* ---------- ستون فصل‌ها (نقشهٔ کوچک صفحه) ---------- */
  let rail = null;
  function buildRail(list) {
    const key = list.map((s) => s.className).join("|") + innerWidth;
    if (rail && rail._key === key && rail._secs?.[0] === list[0]) return;
    rail?.remove(); rail = null;
    // ستون فقط در حاشیهٔ خالی کنار محتوا: اگر جا نباشد اصلاً ساخته نمی‌شود تا روی کادرها نیفتد
    const margin = Math.min(...$$(".wrap", $("#view")).map((w) => w.getBoundingClientRect().left).filter((x) => x >= 0), innerWidth);
    if (list.length < 4 || margin < 52) return;
    rail = document.createElement("nav");
    rail.className = "cine-rail"; rail.setAttribute("aria-label", "فصل‌های صفحه");
    rail.innerHTML = `<i class="cine-rail__line"><i></i></i>` + list.map((s, i) => {
      const t = (s.querySelector("h1, h2")?.textContent || "").replace(/\s+/g, " ").trim().split(/[؛،.:]/)[0].slice(0, 34);
      return `<button type="button" data-i="${i}" aria-label="${t.replace(/"/g, "")}"><span>${t}</span></button>`;
    }).join("");
    rail.classList.toggle("cine-rail--labels", margin >= 250);   // حاشیهٔ پهن: نام فصل فعال کنار نقطه می‌ماند
    document.body.append(rail);
    rail.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      list[+b.dataset.i].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
    rail._secs = list; rail._key = key;
  }

  /* ---------- ورود تدریجی، پرده‌برداری تصویرها و کارت‌های عمق‌دار ---------- */
  let io, scrubs = [];
  function observe(view) {
    scrubs = scrubs.filter((h) => h.isConnected);
    io ||= new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in"); io.unobserve(e.target);
    }), { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    $$("h1, h2", view).forEach((h) => {
      if (h.dataset.cineSplit || h.closest(".dlg")) return;
      splitWords(h);
      // جمله‌های بیانیه‌ای فصل‌ها: پررنگ‌شدن واژه به واژه با پیمایش (به‌جای ورود یک‌باره)
      if (!reduce && document.body.dataset.page === "home" && h.closest(".story__q, .section--ink") && !h.closest(".scene")) { h.classList.add("cine-scrub"); scrubs.push(h); return; }
      io.observe(h);
    });
    $$(".cine-ch:not(.is-in)", view).forEach((s) => io.observe(s));
  }

  // کارت‌ها: کج‌شدن سه‌بعدی و برق نور زیر نشانگر
  function tilt(view) {
    if (!fine || reduce) return;
    $$(".card, .how__card, .trust__item, .plan, .strip > div", view).forEach((c) => {
      if (c.dataset.tilt) return; c.dataset.tilt = "1"; c.classList.add("cine-tilt");
      let raf = 0;
      c.addEventListener("pointermove", (e) => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          c.style.setProperty("--rx", ((0.5 - y) * 6).toFixed(2) + "deg"); c.style.setProperty("--ry", ((x - 0.5) * 8).toFixed(2) + "deg");
          c.style.setProperty("--gx", (x * 100).toFixed(1) + "%"); c.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
        });
      });
      c.addEventListener("pointerleave", () => { cancelAnimationFrame(raf); c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
    });
    // دکمه‌های اصلی: کشش مغناطیسی ملایم
    $$(".hero__cta .btn, .consult .btn", view).forEach((b) => {
      if (b.dataset.mag) return; b.dataset.mag = "1"; b.classList.add("cine-mag");
      b.addEventListener("pointermove", (e) => { const r = b.getBoundingClientRect(); b.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + "px"); b.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + "px"); });
      b.addEventListener("pointerleave", () => { b.style.setProperty("--mx", "0px"); b.style.setProperty("--my", "0px"); });
    });
  }

  /* ---------- صحنهٔ کره: فضای عمیق، ستاره، هاله و جاروی نور؛ خود مدل کره دست نمی‌خورد ---------- */
  function globeStage(view) {
    const st = $("#skyStage", view);
    if (!st || st.querySelector(".cine-space")) return;
    const space = document.createElement("div");
    space.className = "cine-space"; space.setAttribute("aria-hidden", "true");
    let stars = "";
    for (let i = 0; i < 70; i++) {
      const x = (i * 137.5) % 100, y = (i * 61.8 + i * i * 0.7) % 100, o = 0.25 + ((i * 7) % 10) / 16;
      stars += `${(x * 4).toFixed(0)}px ${(y * 4).toFixed(0)}px 0 ${i % 9 ? 0 : 0.6}px rgba(255,255,255,${o.toFixed(2)}),`;
    }
    space.innerHTML = `<i class="cine-stars" style="box-shadow:${stars.slice(0, -1)}"></i><i class="cine-halo"></i><i class="cine-sweep"></i>`;
    st.prepend(space);
  }

  /* ---------- عمق صحنهٔ آغاز با نشانگر (ستون متن و کادر کره در دو عمق متفاوت) ---------- */
  function heroDepth(view) {
    const hero = $(".hero", view);
    if (!hero || hero.dataset.depth || !fine || reduce) return;
    hero.dataset.depth = "1";
    let raf = 0;
    hero.addEventListener("pointermove", (e) => {
      if (e.target.closest("#skyStage")) return;   // هنگام چرخاندن کره، لایه‌ها جابه‌جا نمی‌شوند
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { root.style.setProperty("--hx", ((e.clientX / innerWidth) - 0.5).toFixed(3)); root.style.setProperty("--hy", ((e.clientY / innerHeight) - 0.5).toFixed(3)); });
    });
    hero.addEventListener("pointerleave", () => { root.style.setProperty("--hx", 0); root.style.setProperty("--hy", 0); });
  }

  /* ---------- حلقهٔ پیمایش: پیشرفت، عمق پس‌زمینه، رنگ فصل، سربرگ و ستون فصل‌ها ---------- */
  let ticking = false, lastY = 0, secs = [];
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY, H = root.scrollHeight - innerHeight;
      root.style.setProperty("--cine-p", H > 0 ? (y / H).toFixed(4) : 0);
      root.style.setProperty("--cine-y", y.toFixed(0) + "px");
      // سربرگ: با پیمایش رو به پایین کنار می‌رود و با کمی بالا آمدن برمی‌گردد
      const top = $("#top");
      if (top) {
        const busy = document.querySelector("dialog[open]") || document.body.classList.contains("menu-open") || root.classList.contains("sky-fs");
        if (y > 480 && y > lastY + 6 && !busy) top.classList.add("cine-hide");
        else if (y < lastY - 6 || y < 200 || busy) top.classList.remove("cine-hide");
      }
      lastY = y;
      // پرده‌های تیره: میزان باز شدن بر پایهٔ ورود به صفحه
      $$(".cine-slab").forEach((s) => { const r = s.getBoundingClientRect(); const k = Math.max(0, Math.min(1, (innerHeight - r.top) / (innerHeight * 0.75))); s.style.setProperty("--cine-in", k.toFixed(3)); });
      // جمله‌های بیانیه‌ای: هر واژه با رسیدن خط میانی صفحه پررنگ می‌شود
      scrubs.forEach((h) => {
        const r = h.getBoundingClientRect(); if (r.bottom < -100 || r.top > innerHeight + 100) return;
        const k = Math.max(0, Math.min(1, (innerHeight * 0.85 - r.top) / (innerHeight * 0.5 + r.height)));
        const ws = h.querySelectorAll(".cw__i"), n = ws.length;
        ws.forEach((w, i) => w.style.setProperty("--o", Math.max(0.16, Math.min(1, k * (n + 2) - i)).toFixed(2)));
      });
      // فصل فعال: رنگ پس‌زمینه و ستون
      let cur = -1;
      secs.forEach((s, i) => { const r = s.getBoundingClientRect(); if (r.top < innerHeight * 0.55 && r.bottom > innerHeight * 0.3) cur = i; });
      const tone = cur >= 0 ? secs[cur].dataset.cineTone : "light";
      if (root.dataset.cineTone !== tone) root.dataset.cineTone = tone;
      if (rail) {
        $$("button", rail).forEach((b, i) => b.classList.toggle("is-on", i === cur));
        const first = secs[0]?.offsetTop || 0, last = (secs.at(-1)?.offsetTop || 1) + (secs.at(-1)?.offsetHeight || 0) - innerHeight;
        rail.style.setProperty("--fill", Math.max(0, Math.min(1, (y - first) / Math.max(1, last - first))).toFixed(3));
        rail.classList.toggle("is-on", y > innerHeight * 0.6);
      }
    });
  }

  /* ---------- هر بار که محتوای صفحه عوض می‌شود ---------- */
  let lastHash = location.hash, pending = 0;
  function enhance() {
    const view = $("#view");
    if (!view) return;
    root.classList.toggle("cine-home", document.body.dataset.page === "home");
    secs = chapters(view);
    buildRail(secs);
    observe(view); tilt(view); globeStage(view); heroDepth(view);
    onScroll();
  }
  function onRoute() {
    const page = (h) => (h.split("?")[0] || "#/");
    if (page(location.hash) !== page(lastHash) && !reduce) {
      // گذار صفحه: پردهٔ باریک از راست به چپ و ورود نرم محتوا (هیچ‌گاه جلوی تعامل را نمی‌گیرد)
      document.body.classList.remove("cine-go"); void document.body.offsetWidth; document.body.classList.add("cine-go");
      setTimeout(() => document.body.classList.remove("cine-go"), 900);
    }
    lastHash = location.hash;
  }

  function init() {
    if (root.dataset.cine) return;
    root.dataset.cine = reduce ? "lite" : "full";
    layers(); intro();
    const view = $("#view");
    new MutationObserver(() => { clearTimeout(pending); pending = setTimeout(enhance, 80); }).observe(view, { childList: true, subtree: true });
    addEventListener("hashchange", onRoute);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", () => { clearTimeout(pending); pending = setTimeout(enhance, 200); });
    enhance();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  return { contours };
})();
