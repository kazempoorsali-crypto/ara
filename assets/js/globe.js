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

export async function mountGlobe(host, { cities = [], textureUrl, onPick, onArrive } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);

  const tex = await new THREE.TextureLoader().loadAsync(textureUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.2, 1.1) }));
  scene.add(earth);

  // هالهٔ جو: درخشش لبه با سایه‌زن فرنل، به رنگ سبز برند
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 96, 96), new THREE.ShaderMaterial({
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    uniforms: { c: { value: new THREE.Color("#4fd39a") } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.,0.,1.)), 3.2); gl_FragColor = vec4(c, 1.0) * i * 1.6; }",
  }));
  scene.add(atmo);
  // لایهٔ نازک روشن روی سطح رو به بیننده (حس حجم)
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.002, 96, 96), new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "varying vec3 vN; void main(){ float f = pow(1.0 - max(dot(vN, vec3(0.,0.,1.)),0.), 2.5); gl_FragColor = vec4(0.35,0.85,0.65,1.0) * f * 0.35; }",
  }));
  scene.add(rim);

  // نقطه‌های شهر
  const dotT = dotTexture("rgba(120,240,180,1)"), ringT = dotTexture("rgba(120,240,180,1)", true);
  const marks = cities.map((c) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const size = 0.022 + 0.03 * Math.min(1, Math.sqrt((c.n || 1) / 300));
    s.scale.setScalar(size); s.position.copy(vec(c.lat, c.lng, 1.004)); s.userData = { c, size };
    scene.add(s);
    return s;
  });
  const rings = [];

  let dist = 3.1, dir = vec(30, 53).normalize(), auto = true, anim = null, drag = null, raf = 0, visible = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(host);

  const place = () => { camera.position.copy(dir).multiplyScalar(dist); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); };
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
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
  };
  raf = requestAnimationFrame(tick);

  // کشیدن برای چرخاندن، لمس نقطه برای انتخاب شهر
  const el = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    const sp = 0.005 * (dist - 0.9);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * sp);
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const nd = dir.clone().applyAxisAngle(side, -dy * sp);
    if (Math.abs(nd.y) < 0.95) dir = nd.normalize();
    drag.x = e.clientX; drag.y = e.clientY;
  });
  el.addEventListener("pointerup", (e) => {
    const moved = drag && drag.moved; drag = null;
    if (moved || !onPick) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(marks)[0];
    if (hit) onPick(hit.object.userData.c);
  });

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
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      renderer.dispose(); el.remove();
    },
  };
}
