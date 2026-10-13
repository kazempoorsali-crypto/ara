/* کرهٔ زمین واقعی (بافت ماهواره‌ای شب ناسا) برای کادر زندهٔ صفحهٔ اصلی.
   بی‌کار: آرام روی ایران می‌چرخد و شهرهای دارای آگهی نقطه‌های نورانی‌اند.
   focus(): دوربین به سمت شهرهای انتخابی می‌چرخد و نزدیک می‌شود؛ پس از رسیدن onArrive صدا زده می‌شود.
   همه‌چیز از سرور خود سایت بارگذاری می‌شود (بدون CDN). */
import * as THREE from "../vendor/globe/three.module.min.js";

const D = Math.PI / 180;
export function vec(lat, lng, r = 1) {
  const phi = (90 - lat) * D, th = (lng + 180) * D;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function dotTexture(color, ring = false) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (ring) {
    grd.addColorStop(0.55, "rgba(0,0,0,0)"); grd.addColorStop(0.7, color); grd.addColorStop(0.85, "rgba(0,0,0,0)");
  } else {
    grd.addColorStop(0, "#fff"); grd.addColorStop(0.18, color); grd.addColorStop(0.5, color.replace("1)", "0.25)")); grd.addColorStop(1, "rgba(0,0,0,0)");
  }
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function mountGlobe(host, { cities = [], textureUrl, day = false, onPick, onArrive } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);

  const tex = await new THREE.TextureLoader().loadAsync(textureUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), new THREE.MeshBasicMaterial({ map: tex, color: day ? new THREE.Color(1.05, 1.05, 1.05) : new THREE.Color(1.25, 1.2, 1.1) }));
  scene.add(earth);

  // هالهٔ جو: درخشش لبه با سایه‌زن فرنل، به رنگ سبز برند
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 96, 96), new THREE.ShaderMaterial({
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    uniforms: { c: { value: new THREE.Color(day ? "#8fd0ff" : "#4fd39a") } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.,0.,1.)), 3.2); gl_FragColor = vec4(c, 1.0) * i * 1.6; }",
  }));
  scene.add(atmo);
  // لایهٔ نازک روشن روی سطح رو به بیننده (حس حجم)
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.002, 96, 96), new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "varying vec3 vN; void main(){ float f = pow(1.0 - max(dot(vN, vec3(0.,0.,1.)),0.), 2.5); gl_FragColor = vec4(" + (day ? "0.55,0.8,1.0" : "0.35,0.85,0.65") + ",1.0) * f * " + (day ? "0.45" : "0.35") + "; }",
  }));
  scene.add(rim);

  // نقطه‌های شهر
  const dotT = dotTexture(day ? "rgba(255,190,70,1)" : "rgba(120,240,180,1)"), ringT = dotTexture(day ? "rgba(255,190,70,1)" : "rgba(120,240,180,1)", true);
  const marks = cities.map((c) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const size = 0.022 + 0.03 * Math.min(1, Math.sqrt((c.n || 1) / 300));
    s.scale.setScalar(size); s.position.copy(vec(c.lat, c.lng, 1.004)); s.userData = { c, size };
    scene.add(s);
    return s;
  });
  const rings = [];
  // نام شهرها هنگام نزدیک شدن (بزرگ‌نمایی با چرخ موس یا دو انگشت)
  const labels = document.createElement("div");
  labels.className = "globe__labels"; host.appendChild(labels);
  const labEls = marks.map((m) => { const e = document.createElement("span"); e.textContent = m.userData.c.name; labels.appendChild(e); return e; });
  const MIN_D = 1.24, MAX_D = 3.4;

  let dist = 3.1, dir = vec(30, 53).normalize(), auto = true, anim = null, drag = null, raf = 0, visible = true, paused = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // در کادر عمودی (موبایل) زاویهٔ دید عمودی بیشتر می‌شود تا کره در عرض جا شود
    camera.fov = camera.aspect < 1 ? Math.min(70, 2 * Math.atan(Math.tan(16 * D) / camera.aspect) / D) : 32;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(host);

  const place = () => { camera.position.copy(dir).multiplyScalar(dist); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); };
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (!visible || paused || document.hidden) return;
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.ms), k = ease(t);
      dir = anim.from.clone().lerp(anim.to, k).normalize();
      dist = anim.d0 + (anim.d1 - anim.d0) * k;
      if (t >= 1) { const cb = anim.cb; anim = null; cb && cb(); }
    } else if (auto && !drag && !reduced) {
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0009);
    }
    const pulse = 1 + 0.35 * Math.sin(now / 380);
    rings.forEach((r) => { r.scale.setScalar(r.userData.base * (1.2 + ((now / 1400) % 1) * 1.6)); r.material.opacity = 1 - ((now / 1400) % 1); });
    marks.forEach((m) => { if (m.userData.on) m.scale.setScalar(m.userData.size * 1.6 * pulse); });
    place();
    renderer.render(scene, camera);
    drawLabels();
  };
  const tmp = new THREE.Vector3();
  // مختصات صفحهٔ هر نقطهٔ شهر، فقط اگر رو به بیننده باشد
  const screenOf = (m) => {
    if (m.position.clone().normalize().dot(camera.position.clone().normalize()) < 0.15) return null;
    tmp.copy(m.position).project(camera);
    const w = host.clientWidth, h = host.clientHeight, x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
    return x < 4 || y < 4 || x > w - 4 || y > h - 4 ? null : { x, y };
  };
  let labT = 0;
  function drawLabels() {
    const show = dist < 2.35;
    labels.classList.toggle("is-on", show);
    if (!show) return;
    const now = performance.now(); if (now - labT < 50) return; labT = now;
    const placed = [];
    marks.map((m, i) => ({ m, i, p: screenOf(m) })).sort((a, b) => (b.m.userData.c.n || 0) - (a.m.userData.c.n || 0)).forEach(({ i, p }) => {
      const e = labEls[i];
      // نام‌ها روی هم نیفتند
      if (!p || placed.some((q) => Math.abs(q.x - p.x) < 70 && Math.abs(q.y - p.y) < 18)) { e.style.display = "none"; return; }
      placed.push(p); e.style.display = ""; e.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - 12).toFixed(1)}px) translate(-50%, -100%)`;
    });
  }
  // نزدیک‌ترین نقطهٔ شهر به نشانگر (تا ۱۸ پیکسل)
  const nearest = (cx, cy) => {
    const r = el.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    let best = null, bd = 18 * 18;
    marks.forEach((m) => { const p = screenOf(m); if (!p) return; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = m; } });
    return best;
  };
  raf = requestAnimationFrame(tick);

  // کشیدن برای چرخاندن، لمس نقطه برای انتخاب شهر
  const el = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!drag) { const m = nearest(e.clientX, e.clientY); el.style.cursor = m ? "pointer" : ""; el.title = m ? m.userData.c.name + " — برای انتخاب بزنید" : ""; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    const sp = 0.005 * (dist - 1.02);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * sp);
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const nd = dir.clone().applyAxisAngle(side, -dy * sp);
    if (Math.abs(nd.y) < 0.95) dir = nd.normalize();
    drag.x = e.clientX; drag.y = e.clientY;
  });
  el.addEventListener("pointerup", (e) => {
    const moved = drag && drag.moved; drag = null;
    if (moved || !onPick) return;
    const m = nearest(e.clientX, e.clientY);
    if (m) onPick(m.userData.c);
  });
  // بزرگ‌نمایی با چرخ موس؛ در مرز بزرگ‌نمایی، اسکرول صفحه آزاد می‌ماند
  el.addEventListener("wheel", (e) => {
    const nd = Math.min(MAX_D, Math.max(MIN_D, dist * Math.exp(e.deltaY * 0.0012)));
    if (Math.abs(nd - dist) < 1e-4) return;
    e.preventDefault(); anim = null; auto = false;
    // بزرگ‌نمایی به سمت نقطهٔ زیر نشانگر
    if (nd < dist) {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(earth)[0];
      if (hit) dir = dir.clone().lerp(hit.point.clone().normalize(), Math.min(0.5, (dist - nd) / (dist - 1) * 0.9)).normalize();
    }
    dist = nd;
  }, { passive: false });
  // دو انگشت روی موبایل
  const touches = new Map(); let pinch0 = 0, dist0 = 0;
  el.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") touches.set(e.pointerId, e); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); dist0 = dist; drag = null; } });
  el.addEventListener("pointermove", (e) => { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, e); if (touches.size === 2 && pinch0) { const [a, b] = [...touches.values()]; dist = Math.min(MAX_D, Math.max(MIN_D, dist0 * pinch0 / Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)))); auto = false; } });
  const tEnd = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; };
  el.addEventListener("pointerup", tEnd); el.addEventListener("pointercancel", tEnd);

  return {
    focus(points, { zoom = 1.32 } = {}) {
      auto = false;
      rings.splice(0).forEach((r) => scene.remove(r));
      marks.forEach((m) => { m.userData.on = points.some((p) => p.id === m.userData.c.id); if (!m.userData.on) m.scale.setScalar(m.userData.size); });
      points.forEach((p) => {
        const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        r.position.copy(vec(p.lat, p.lng, 1.005)); r.userData.base = 0.06; scene.add(r); rings.push(r);
      });
      const lat = points.reduce((a, p) => a + p.lat, 0) / points.length, lng = points.reduce((a, p) => a + p.lng, 0) / points.length;
      const to = vec(lat, lng).normalize();
      anim = { from: dir.clone(), to, d0: dist, d1: zoom, t0: performance.now(), ms: reduced ? 1 : 2000, cb: () => onArrive && onArrive() };
    },
    home() {
      rings.splice(0).forEach((r) => scene.remove(r));
      marks.forEach((m) => { m.userData.on = false; m.scale.setScalar(m.userData.size); });
      anim = { from: dir.clone(), to: vec(30, 53).normalize(), d0: dist, d1: 3.1, t0: performance.now(), ms: reduced ? 1 : 1400, cb: () => { auto = true; } };
    },
    // پس از جابه‌جایی کادر (تمام صفحه) اندازه و نمایش دوباره سنجیده شود
    refresh() { visible = true; resize(); },
    // وقتی نقشه روی کره باز است، کره رسم نمی‌شود (هم سبک‌تر، هم جلوی نمایش تصویر کره از زیر کاشی‌های نیامدهٔ نقشه را می‌گیرد)
    pause(v) { paused = !!v; },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      renderer.dispose(); el.remove(); labels.remove();
    },
  };
}
