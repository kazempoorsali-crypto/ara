/* نوارهای نورانی سینمایی (الهام از سایت‌هایی که «به بیننده نگاه می‌کنند»):
   چند نوار نور نرم با Canvas2D که آرام موج می‌زنند و به سمت نشانگر خم می‌شوند.
   سبک است (بدون کتابخانه)، بیرون از دید متوقف می‌شود و با «کاهش حرکت» ساکن می‌ماند. */
window.Ribbons = (() => {
  "use strict";
  function mount(host, { colors = ["#3fd99a", "#d4b46a", "#7be3ff"], count = 5, alpha = 0.55 } = {}) {
    if (!host || host.querySelector(":scope > canvas.ribbons")) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cv = document.createElement("canvas");
    cv.className = "ribbons"; cv.setAttribute("aria-hidden", "true");
    host.prepend(cv);
    const g = cv.getContext("2d");
    let w = 1, h = 1, dpr = 1, raf = 0, visible = true, t0 = performance.now();
    const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0, ton: 0 };
    const R = Array.from({ length: count }, (_, i) => ({
      c: colors[i % colors.length], y: 0.25 + (i / Math.max(1, count - 1)) * 0.5,
      a: 0.05 + Math.random() * 0.05, f: 1.2 + Math.random() * 1.4, s: 0.15 + Math.random() * 0.25,
      ph: Math.random() * 6.28, lw: 1 + Math.random() * 2.2,
    }));
    const size = () => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = host.clientWidth || 1; h = host.clientHeight || 1;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(host);
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(host);
    const move = (e) => {
      const r = host.getBoundingClientRect();
      ptr.tx = (e.clientX - r.left) / r.width; ptr.ty = (e.clientY - r.top) / r.height; ptr.ton = 1;
    };
    const leave = () => { ptr.ton = 0; };
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave);

    const draw = (now) => {
      const t = (now - t0) / 1000;
      ptr.x += (ptr.tx - ptr.x) * 0.06; ptr.y += (ptr.ty - ptr.y) * 0.06; ptr.on += (ptr.ton - ptr.on) * 0.04;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      const N = 64, px = ptr.x * w, py = ptr.y * h, rad = Math.max(160, w * 0.22);
      R.forEach((r) => {
        g.beginPath();
        for (let i = 0; i <= N; i++) {
          const u = i / N, x = u * w;
          let y = (r.y + r.a * Math.sin(u * r.f * 6.28 + t * r.s * 2 + r.ph) + 0.03 * Math.sin(u * 13 + t * 0.7 + r.ph)) * h;
          // کشش به سمت نشانگر: نوار در نزدیکی نشانگر به سمت آن خم می‌شود
          const dx = x - px, d = Math.exp(-(dx * dx) / (2 * rad * rad));
          y += (py - y) * d * 0.55 * ptr.on;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        const grd = g.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(0.5, r.c); grd.addColorStop(1, "rgba(0,0,0,0)");
        g.strokeStyle = grd;
        g.globalAlpha = alpha * 0.35; g.lineWidth = r.lw * 7; g.shadowBlur = 0; g.stroke();
        g.globalAlpha = alpha; g.lineWidth = r.lw; g.shadowColor = r.c; g.shadowBlur = 18; g.stroke();
      });
      g.globalAlpha = 1; g.shadowBlur = 0;
    };
    const tick = (now) => {
      if (!host.isConnected) { ro.disconnect(); io.disconnect(); return; }
      raf = requestAnimationFrame(tick);
      if (visible && !document.hidden) draw(now);
    };
    if (reduced) draw(performance.now() + 4000); else raf = requestAnimationFrame(tick);
  }
  return { mount };
})();
