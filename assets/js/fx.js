/* جلوه‌های پیشرفتهٔ طراحی تازه — فقط وقتی <html data-design="new"> و حالت سبک خاموش است:
   ۱. نشانگر آهنربایی ماوس (فقط دسکتاپ با ماوس)؛ روی پیوند و دکمه بزرگ می‌شود و به مرکزشان کشیده می‌شود،
      روی عکس «دیدن»، روی کره «بچرخانید» نشان می‌دهد، روی فیلدهای متنی کنار می‌رود.
   ۲. اسکرول نرم Lenis و حرکت‌های هماهنگ با GSAP ScrollTrigger — فقط روی دسکتاپ قوی؛ موبایل و سیستم ضعیف اسکرول عادی.
   ۳. جابه‌جایی زاویهٔ دید عکس‌های صحنه با نقشهٔ عمق و سایه‌زن سادهٔ WebGL (با حرکت ماوس و اسکرول).
   کتابخانه‌ها از سرور خود سایت بارگذاری می‌شوند (بدون CDN خارجی). */
(() => {
  const root = document.documentElement;
  const ok = () => root.dataset.design === "new" && !root.classList.contains("lite") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!ok()) return;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const strong = fine && innerWidth >= 1100 && (navigator.hardwareConcurrency || 8) >= 4 && (navigator.deviceMemory || 8) >= 4;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const V = (($('script[src*="assets/js/fx.js"]') || {}).src || "").split("?v=")[1] || "";
  const load = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src + (V ? "?v=" + V : ""); s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  /* ---------- ۱. نشانگر آهنربایی ---------- */
  function cursor() {
    if (!fine) return;
    const c = document.createElement("div");
    c.className = "mcur"; c.setAttribute("aria-hidden", "true");
    c.innerHTML = '<i class="mcur__ring"><b class="mcur__label"></b></i><i class="mcur__dot"></i>';
    document.body.append(c);
    root.classList.add("has-mcur");
    const ring = c.firstChild, dot = c.lastChild, label = $(".mcur__label", c);
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, tx = x, ty = y, raf = 0, target = null, mode = "";
    const MAG = "a, button, [role=button], .chip, summary, .card__fav, label.switch";
    const setMode = (m, text = "") => { if (m === mode && label.textContent === text) return; mode = m; c.dataset.mode = m; label.textContent = text; };
    const loop = () => {
      raf = 0;
      // حلقه با تأخیر نرم دنبال می‌کند؛ روی دکمه به سمت مرکز آن کشیده می‌شود (آهنربا)
      let gx = x, gy = y;
      if (target && mode === "link") { const r = target.getBoundingClientRect(); gx = x + (r.left + r.width / 2 - x) * 0.35; gy = y + (r.top + r.height / 2 - y) * 0.35; }
      rx += (gx - rx) * 0.2; ry += (gy - ry) * 0.2;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (Math.abs(gx - rx) > 0.3 || Math.abs(gy - ry) > 0.3) raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") { c.classList.add("is-off"); return; }
      x = e.clientX; y = e.clientY; c.classList.remove("is-off");
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest("input, textarea, select, [contenteditable], .leaflet-container, .dlg, .lightbox")) { setMode("hide"); target = null; }
      else if (el.closest("#skyStage")) { setMode("drag", "بچرخانید"); target = null; }
      else if (el.closest(".card__media, #gal [data-img], .scene__stage")) { setMode("view", el.closest(".scene__stage") ? "" : "دیدن"); target = null; }
      else if ((target = el.closest(MAG))) setMode("link");
      else { setMode(""); target = null; }
      kick();
    }, { passive: true });
    addEventListener("pointerdown", () => c.classList.add("is-down"), { passive: true });
    addEventListener("pointerup", () => c.classList.remove("is-down"), { passive: true });
    document.addEventListener("mouseleave", () => c.classList.add("is-off"));
    // دکمه‌های اصلی خودشان هم کمی به سمت نشانگر کشیده می‌شوند
    document.addEventListener("pointerover", (e) => {
      const b = e.target instanceof Element && e.target.closest(".btn--lg, .btn--hot, .nav a, #accountBtn");
      if (!b || b.dataset.mag2) return;
      b.dataset.mag2 = "1";
      b.addEventListener("pointermove", (ev) => { const r = b.getBoundingClientRect(); b.style.translate = `${((ev.clientX - r.left - r.width / 2) * 0.15).toFixed(1)}px ${((ev.clientY - r.top - r.height / 2) * 0.25).toFixed(1)}px`; });
      b.addEventListener("pointerleave", () => { b.style.translate = ""; });
    });
  }

  /* ---------- ۲. اسکرول نرم و حرکت‌های هماهنگ ---------- */
  let lenis = null;
  async function smooth() {
    if (!strong) return;
    try {
      await load("/assets/vendor/fx/lenis.min.js");
      await load("/assets/vendor/fx/gsap.min.js");
      await load("/assets/vendor/fx/ScrollTrigger.min.js");
    } catch { return; }
    const { Lenis, gsap, ScrollTrigger } = window;
    if (!Lenis || !gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    lenis = new Lenis({
      duration: 1.05, smoothWheel: true, wheelMultiplier: 1,
      // جاهایی که خودشان پیمایش یا چرخ موس دارند (نقشه، کره، فهرست‌ها، پنجره‌ها) دست‌نخورده می‌مانند
      prevent: (node) => !!(node && node.closest && node.closest(".leaflet-container, #skyStage, .dlg, dialog, .lightbox, .cb__panel, .dd__panel, .ai, .sky__more-list, .hs__sc, [data-lenis-prevent], textarea")),
    });
    root.classList.add("has-lenis");
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    // پنجره‌ها و نمایش عکس: اسکرول نرم موقتاً می‌ایستد
    new MutationObserver(() => { const busy = !!document.querySelector("dialog[open], .lightbox") || root.classList.contains("sky-fs"); busy ? lenis?.stop() : lenis?.start(); })
      .observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ["class"] });
    document.getElementById("dlg")?.addEventListener("close", () => lenis?.start());
    new MutationObserver(() => { const busy = !!document.querySelector("dialog[open]"); busy ? lenis?.stop() : lenis?.start(); }).observe(document.getElementById("dlg") || document.body, { attributes: true, attributeFilter: ["open"] });
    // تغییر صفحه: بالا رفتن فوری (برنامه خودش scrollTo می‌کند؛ Lenis هم‌گام می‌شود)
    addEventListener("hashchange", () => { setTimeout(() => { lenis?.resize(); ScrollTrigger.refresh(); }, 120); });
    scenes(gsap, ScrollTrigger);
    new MutationObserver(() => { clearTimeout(scenes.t); scenes.t = setTimeout(() => scenes(gsap, ScrollTrigger), 150); }).observe($("#view"), { childList: true });
  }
  // حرکت‌های وابسته به اسکرول (scrub): تیتر اصلی، کادر کره، پژواک تیترها و عکس کارت‌ها
  function scenes(gsap, ST) {
    ST.getAll().forEach((t) => t.vars.id === "fx" && t.kill());
    if (document.body.dataset.page !== "home") { ST.refresh(); return; }
    const h1 = $(".hero h1"), sky = $(".hero .sky");
    if (h1) gsap.to(h1, { yPercent: -18, opacity: .35, ease: "none", scrollTrigger: { id: "fx", trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    if (sky) gsap.fromTo(sky, { rotateX: 0 }, { rotateX: 6, scale: .96, ease: "none", transformPerspective: 1400, scrollTrigger: { id: "fx", trigger: ".hero", start: "center top", end: "bottom top", scrub: true } });
    $$(".cine-echo").forEach((h) => gsap.fromTo(h, { "--echo-x": "6%" }, { "--echo-x": "-6%", ease: "none", scrollTrigger: { id: "fx", trigger: h, start: "top bottom", end: "bottom top", scrub: true } }));
    $$("#view .card__media img").slice(0, 16).forEach((im) => gsap.fromTo(im, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { id: "fx", trigger: im.closest(".card") || im, start: "top bottom", end: "bottom top", scrub: true } }));
    $$(".section--sunk .sec-head, .story__q").forEach((el) => gsap.fromTo(el, { y: 40 }, { y: -20, ease: "none", scrollTrigger: { id: "fx", trigger: el, start: "top bottom", end: "bottom top", scrub: true } }));
    ST.refresh();
  }

  /* ---------- ۳. جابه‌جایی زاویهٔ دید عکس‌های صحنه با نقشهٔ عمق (WebGL) ---------- */
  const VS = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;v.y=1.-v.y;gl_Position=vec4(p,0.,1.);}";
  const FS = "precision mediump float;varying vec2 v;uniform sampler2D img,dep;uniform vec2 off,sc;void main(){vec2 uv=(v-.5)*sc+.5;float d=texture2D(dep,uv).r;vec2 u=uv+off*(d-.45);gl_FragColor=texture2D(img,clamp(u,0.,1.));}";
  function depthPic(img, depthUrl) {
    const cv = document.createElement("canvas");
    cv.className = img.className + " fx-depth";
    const gl = cv.getContext("webgl", { premultipliedAlpha: false, antialias: false });
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = (unit, src) => new Promise((res) => { const im = new Image(); im.onload = () => { gl.activeTexture(gl.TEXTURE0 + unit); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); res(im); }; im.onerror = () => res(null); im.src = src; });
    let aspect = 1.5, ox = 0, oy = 0, want = [0, 0], raf = 0;
    const draw = () => {
      raf = 0;
      ox += (want[0] - ox) * 0.12; oy += (want[1] - oy) * 0.12;
      const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(1.5, devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); gl.viewport(0, 0, cv.width, cv.height); }
      const ca = w / Math.max(1, h);   // پوشش کامل قاب مثل object-fit: cover
      gl.uniform2f(gl.getUniformLocation(pr, "sc"), ca > aspect ? 1 : ca / aspect, ca > aspect ? aspect / ca : 1);
      gl.uniform2f(gl.getUniformLocation(pr, "off"), ox, oy);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (Math.abs(want[0] - ox) > 0.0003 || Math.abs(want[1] - oy) > 0.0003) raf = requestAnimationFrame(draw);
    };
    const api = { cv, set(x, y) { want = [x, y]; if (!raf) raf = requestAnimationFrame(draw); }, redraw() { if (!raf) raf = requestAnimationFrame(draw); } };
    Promise.all([tex(0, img.currentSrc || img.src), tex(1, depthUrl)]).then(([im, d]) => {
      if (!im || !d) return;
      aspect = im.width / im.height;
      gl.uniform1i(gl.getUniformLocation(pr, "img"), 0); gl.uniform1i(gl.getUniformLocation(pr, "dep"), 1);
      img.after(cv); img.classList.add("fx-hidden"); api.redraw();
    });
    return api;
  }
  function depth() {
    if (!fine) return;
    const run = () => {
      const scene = $("#pinScene");
      if (!scene || scene.dataset.fx || scene.classList.contains("is-static")) return;
      scene.dataset.fx = "1";
      const pics = [];
      $$(".scene__pic", scene).forEach((pic) => {
        const name = pic.classList.contains("scene__pic--living") ? "living" : "house";
        $$("img", pic).forEach((img) => {
          const go = () => { const p = depthPic(img, `/assets/img/scene/${name}-depth.webp`); if (p) pics.push(p); };
          img.complete && img.naturalWidth ? go() : img.addEventListener("load", go, { once: true });
        });
      });
      const strength = 0.035;
      scene.addEventListener("pointermove", (e) => { const r = scene.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; pics.forEach((p) => p.set(-x * strength, -y * strength * 0.7)); }, { passive: true });
      scene.addEventListener("pointerleave", () => pics.forEach((p) => p.set(0, 0)));
      addEventListener("resize", () => pics.forEach((p) => p.redraw()));
    };
    run();
    new MutationObserver(() => setTimeout(run, 200)).observe($("#view"), { childList: true });
  }

  // اگر بعداً حالت سبک روشن شد (کندی صفحه)، جلوه‌ها کنار می‌روند و اسکرول عادی برمی‌گردد
  new MutationObserver(() => {
    if (!root.classList.contains("lite")) return;
    if (lenis) { lenis.destroy(); lenis = null; root.classList.remove("has-lenis"); }
    document.querySelector(".mcur")?.remove(); root.classList.remove("has-mcur");
  }).observe(root, { attributes: true, attributeFilter: ["class"] });
  const start = () => { cursor(); depth(); smooth(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
