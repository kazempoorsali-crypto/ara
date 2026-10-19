/* ═══════════════════════════════════════════════════════════
   صفحهٔ «قیمت از دید آسمان»
   کرهٔ زندهٔ چرخان (Canvas) + نقشهٔ محله‌ها دقیقاً زیر کره
   فیلتر استان/شهر/محله هر دو را هم‌زمان به‌روز می‌کند
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ---------- فیلترها ---------- */
  var selProvince = document.getElementById("fProvince");
  var selCity = document.getElementById("fCity");
  var selDistrict = document.getElementById("fDistrict");
  var btnReset = document.getElementById("fReset");
  var statusEl = document.getElementById("skyStatus");
  var mapScope = document.getElementById("mapScope");
  var globeLabel = document.getElementById("globeLabel");
  var pinsBox = document.querySelector("[data-map-pins]");
  var statsBox = document.querySelector("[data-map-stats]");

  FM.region = { province: "", city: "", district: "" };
  FM.theme = document.documentElement.getAttribute("data-theme") || "dark";
  /* تم: نسخهٔ کامل app.js اگر موجود است، نگه داشته می‌شود */
  if (!FM.setTheme) FM.setTheme = function (t, animate) {
    if (t !== "light" && t !== "dark") return;
    FM.theme = t;
    var root = document.documentElement;
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("fmTheme", t); } catch (e) {}
  };
  var themeBtn = document.getElementById("themeBtn");
  if (themeBtn && !themeBtn.dataset.fmThemeBound) {
    themeBtn.dataset.fmThemeBound = "1";
    themeBtn.addEventListener("click", function () {
      FM.setTheme(FM.theme === "dark" ? "light" : "dark", true);
    });
  }
  FM.scrollToEl = function (t, o) {
    if (FM.lenis) FM.lenis.scrollTo(t, Object.assign({ duration: 1.4 }, o || {}));
    else if (typeof t === "number") window.scrollTo({ top: t, behavior: "smooth" });
  };
  FM.toast = function (m) {
    var t = document.createElement("div"); t.className = "fm-toast"; t.textContent = m;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("is-on"); }, 10);
    setTimeout(function () { t.classList.remove("is-on"); setTimeout(function () { t.remove(); }, 400); }, 2200);
  };

  function option(v, l) { var o = document.createElement("option"); o.value = v; o.textContent = l; return o; }
  function findProvince(id) { return FM.data.regions.filter(function (p) { return p.id === id; })[0] || null; }
  function findCity(pid, cid) { var p = findProvince(pid); return p ? p.cities.filter(function (c) { return c.id === cid; })[0] || null : null; }

  function fillProvinces() {
    selProvince.innerHTML = ""; selProvince.appendChild(option("", "همهٔ استان‌ها"));
    FM.data.regions.forEach(function (p) { selProvince.appendChild(option(p.id, p.name)); });
  }
  var picker = null;
  function fillCities() {
    if (!picker && !selCity.dataset.plain) {
      try {
        picker = FM.cityPicker(selCity, function (ids) {
          FM.region.city = ids.join(","); FM.region.district = "";
          fillDistricts(); apply();
        });
      } catch (e) {
        // اگر انتخاب چندشهری در این مرورگر کار نکرد، همان فهرست ساده (یک شهر) نمایش داده می‌شود
        picker = null; selCity.dataset.plain = "1";
        var pf = document.querySelector(".cpick-field"); if (pf) pf.remove();
        var f0 = selCity.closest(".searchbar__field"); if (f0) f0.style.display = "";
        selCity.hidden = false;
        selCity.addEventListener("change", function () { FM.region.city = selCity.value; FM.region.district = ""; fillDistricts(); apply(); });
      }
    }
    if (picker) { picker.province(FM.region.province); picker.set(FM.cityIds(FM.region)); return; }
    selCity.innerHTML = ""; selCity.appendChild(option("", "همهٔ شهرها"));
    var pv = findProvince(FM.region.province);
    if (pv) { pv.cities.forEach(function (c) { selCity.appendChild(option(c.id, c.name)); }); selCity.disabled = false; }
    else selCity.disabled = true;
  }
  function fillDistricts() {
    selDistrict.innerHTML = ""; selDistrict.appendChild(option("", "همهٔ محله‌ها"));
    var ids = FM.cityIds(FM.region), c = ids.length === 1 ? FM.cityById(ids[0]) : null;   // محله فقط با یک شهر
    if (c) { c.districts.forEach(function (d) { selDistrict.appendChild(option(d.id, d.name)); }); selDistrict.disabled = false; }
    else selDistrict.disabled = true;
  }

  function apply() {
    var label = FM.regionLabel(FM.region) || "ایران";
    statusEl.innerHTML = label === "ایران" ? "نمایش همهٔ مناطق تحت پوشش" : "نمایش بازار <b>" + label + "</b>";
    if (mapScope) mapScope.textContent = label;
    if (globeLabel) globeLabel.textContent = label + (FM.region.city ? " — نمای نزدیک" : " — نمای کل");
    btnReset.hidden = !(FM.region.province || FM.region.city || FM.region.district);
    renderPins(true);
    renderStats();
    if (globeApi) globeApi.focus(FM.region);
    sendLive();
  }
  /* فیلتر به کرهٔ زمین و نقشهٔ زندهٔ زیر آن فرستاده می‌شود */
  function sendLive() {
    var f = document.getElementById("skyLive");
    if (!f || !f.contentWindow) return;
    var ids = FM.cityIds(FM.region);
    try { f.contentWindow.postMessage({ fmSky: 1, province: ids.length ? "" : FM.region.province || "", cities: ids, city: ids.length === 1 ? ids[0] : "", district: FM.region.district || "" }, location.origin); } catch (e) { /* هنوز بار نشده */ }
  }
  (function () {
    var f = document.getElementById("skyLive");
    if (!f) return;
    f.addEventListener("load", function () { if (f.src) { sendLive(); setTimeout(sendLive, 1500); } });
    // کرهٔ سه‌بعدی بعد از نمایش فیلترها بار می‌شود تا صفحه همان اول قفل نشود
    var start = function () { if (!f.src && f.dataset.src) f.src = f.dataset.src; };
    var idle = function () { (window.requestIdleCallback || function (cb) { setTimeout(cb, 200); })(start, { timeout: 1200 }); };
    if (document.readyState === "complete") idle(); else window.addEventListener("load", idle);
  })();

  selProvince.addEventListener("change", function () {
    FM.region.province = selProvince.value;
    if (picker) picker.province(FM.region.province);
    if (!FM.cityIds(FM.region).length) apply();
  });
  selDistrict.addEventListener("change", function () { FM.region.district = selDistrict.value; apply(); });
  btnReset.addEventListener("click", function () {
    FM.region = { province: "", city: "", district: "" };
    selProvince.value = ""; fillCities(); fillDistricts(); apply();
  });

  function districtsOfRegion() {
    var r = FM.region, list = [];
    FM.data.regions.forEach(function (p) {
      var ids = FM.cityIds(r);
      if (r.province && !ids.length && p.id !== r.province) return;
      p.cities.forEach(function (c) {
        if (ids.length && ids.indexOf(c.id) < 0) return;
        c.districts.forEach(function (d) { if (!r.district || d.id === r.district) list.push({ d: d, city: c.name, cityId: c.id }); });
      });
    });
    return list;
  }

  function renderPins(animate) {
    if (!pinsBox) return;
    // فقط پرآگهی‌ترین محله‌ها (کل کشور هزاران محله دارد و رسم همه، صفحه را قفل می‌کرد)
    var list = districtsOfRegion().sort(function (a, b) { return b.d.n - a.d.n; }).slice(0, 36);
    pinsBox.innerHTML = "";
    var maxP = Math.max.apply(null, list.map(function (x) { return x.d.price; }).concat([1]));
    var gold = 137.508;
    list.forEach(function (entry, i) {
      var d = entry.d;
      var x = 50 + 42 * Math.cos(i * gold * Math.PI / 180);
      var y = 50 + 34 * Math.sin(i * gold * Math.PI / 180);
      x = Math.min(86, Math.max(14, x)); y = Math.min(72, Math.max(26, y));
      var el = document.createElement("div");
      el.className = "spin-pin" + (d.price / maxP > 0.8 ? " is-highest" : "") + (FM.region.district === d.id ? " is-highest" : "");
      el.style.setProperty("--x", x + "%");
      el.style.setProperty("--y", y + "%");
      el.innerHTML = "<i></i><b>" + FM.esc(d.name) + "</b><span>" + FM.mm(d.price) + " م.ت / متر</span>";
      pinsBox.appendChild(el);
      if (animate && typeof gsap !== "undefined") {
        gsap.fromTo(el, { autoAlpha: 0, y: -12, scale: .8 }, { autoAlpha: 1, y: 0, scale: 1, duration: .55, delay: i * .07, ease: "back.out(2)" });
      } else el.style.opacity = 1;
    });
  }

  function renderStats() {
    var cta = document.querySelector("[data-sky-cta]");
    if (cta) { var r = FM.region, q = ["opp=1"]; ["province", "city", "district"].forEach(function (k) { if (r[k] && !(k === "province" && r.city)) q.push(k + "=" + encodeURIComponent(r[k])); }); cta.href = "/app.html#/s?" + q.join("&"); }
    if (!statsBox) return;
    var list = districtsOfRegion();
    var avg = FM.districtPrice(FM.region);
    var max = list.length ? Math.max.apply(null, list.map(function (x) { return x.d.price; })) : 0;
    var min = list.length ? Math.min.apply(null, list.map(function (x) { return x.d.price; })) : 0;
    statsBox.innerHTML =
      "<div><b>" + FM.fa(list.length) + "</b><small>محله در نمای فعلی</small></div>" +
      "<div><b>" + FM.mm(avg) + "</b><small>میانهٔ هر متر (م.ت)</small></div>" +
      "<div><b>" + FM.mm(max) + "</b><small>گران‌ترین محله</small></div>" +
      "<div><b>" + FM.mm(min) + "</b><small>ارزان‌ترین محله</small></div>";

    /* کارت‌های محله‌های همین نما */
    var cardsBox = document.querySelector("[data-skycards]");
    if (cardsBox) {
      cardsBox.innerHTML = "";
      var sorted = list.slice().sort(function (a, b) { return b.d.n - a.d.n; }).slice(0, 48).sort(function (a, b) { return b.d.price - a.d.price; });
      sorted.forEach(function (entry) {
        var d = entry.d;
        var el = document.createElement("a");
        el.className = "skycard";
        el.href = "/app.html#/s?city=" + encodeURIComponent(entry.cityId) + "&district=" + encodeURIComponent(d.name);
        el.innerHTML =
          "<b>" + FM.esc(d.name) + "</b><small>" + FM.esc(entry.city) + "</small>" +
          '<span class="skycard__price">' + FM.mm(d.price) + " م.ت هر متر</span>" +
          '<span class="skycard__trend">' + FM.fa(d.n) + " آگهی سنجیده‌شده</span>";
        cardsBox.appendChild(el);
      });
      if (typeof gsap !== "undefined" && sorted.length) {
        gsap.fromTo(cardsBox.children, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: .5, stagger: .06, ease: "power3.out", overwrite: true });
      }
    }
  }

  /* ---------- کرهٔ زندهٔ چرخان ---------- */
  var globeApi = null;
  function initGlobe() {
    var canvas = document.getElementById("globeCanvas");
    if (!canvas || typeof gsap === "undefined") return;
    var ctx = canvas.getContext("2d");
    var img = new Image();
    var ready = false, paused = false, W = 0, H = 0, rot = 0;
    var speed = 0.09; /* درصد چرخش در فریم — گردش افقی پیوسته */

    /* مختصات واقعی: نقشهٔ equirectangular — x=(طول+180)/360 ، y=(90-عرض)/180 */
    function geo(c) {
      if (c.lon !== undefined) {
        return { id: c.id, name: c.name, x: (c.lon + 180) / 360 * 100, y: (90 - c.lat) / 180 * 100 };
      }
      return { id: c.id, name: c.name, x: c.x, y: c.y };
    }
    var cities = [];
    FM.data.regions.forEach(function (p) {
      p.cities.forEach(function (c) { cities.push(geo(c)); });
    });
    (FM.data.extraGlobeCities || []).forEach(function (c) { cities.push(geo(c)); });

    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      W = canvas.width; H = canvas.height;
    }

    function draw() {
      if (!ready) return;
      var R = Math.min(W, H) / 2;
      var cx = W / 2, cy = H / 2;
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

      var texW = img.width, texH = img.height;
      /* برش مربعی از وسط تکسچر برای پوشش کره */
      var texScale = (2 * R) / Math.min(texW, texH);
      var dw = texW * texScale, dh = texH * texScale;
      var off = ((rot / 100) * dw) % dw;

      /* دو بار کشیدن برای پیوستگی چرخش */
      ctx.drawImage(img, -off + dw * 0.5 - dw / 2, cy - dh / 2, dw, dh);
      ctx.drawImage(img, -off + dw * 0.5 - dw / 2 + dw, cy - dh / 2, dw, dh);

      /* سایهٔ کروی + اتمسفر */
      var shade = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R * 1.05);
      shade.addColorStop(0, "rgba(255,255,255,0.06)");
      shade.addColorStop(0.55, "rgba(0,0,0,0.12)");
      shade.addColorStop(1, "rgba(4,8,6,0.72)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      /* شهرهای ایران — فقط سمت مرئی */
      cities.forEach(function (c) {
        var u = (c.x / 100 * dw - off + dw) % dw; /* موقعیت در فضای چرخان */
        var half = dw / 2;
        var dx = u - half; /* -half..half نسبت به مرکز */
        if (Math.abs(dx) > half * 0.94) return;
        var px = cx + dx;
        var py = cy + (c.y / 100 - 0.5) * dh;
        if (Math.hypot(px - cx, py - cy) > R * 0.97) return;
        var alpha = Math.cos((dx / half) * Math.PI / 2);
        var selected = FM.cityIds(FM.region).indexOf(c.id) >= 0;

        ctx.beginPath();
        ctx.arc(px, py, selected ? 7 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = selected ? "rgba(213,166,38,0.98)" : "rgba(229,155,50,0.9)";
        ctx.globalAlpha = Math.max(0.25, alpha);
        ctx.fill();
        if (selected) {
          ctx.beginPath();
          ctx.arc(px, py, 12, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(213,166,38,0.9)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (alpha > 0.55 || selected) {
          ctx.font = "700 " + Math.round(H * 0.026) + "px Vazirmatn, Tahoma";
          ctx.fillStyle = "rgba(251,249,243,0.95)";
          ctx.textAlign = "center";
          ctx.fillText(c.name, px, py - 14);
        }
        ctx.globalAlpha = 1;
      });

      /* حلقهٔ لبه */
      ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(127,178,232,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (!paused) rot += speed;
      requestAnimationFrame(draw);
    }

    img.onload = function () { ready = true; resize(); requestAnimationFrame(draw); };
    img.src = "assets/vendor/globe/earth-night-1024.webp";

    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerenter", function () { paused = true; });
    canvas.addEventListener("pointerleave", function () { paused = false; });

    globeApi = {
      focus: function (r) {
        var first = FM.cityIds(r)[0]; if (!first) return;
        var city = cities.filter(function (c) { return c.id === first; })[0];
        if (!city) return;
        /* چرخش تا شهر رو به کاربر قرار گیرد: جلوِ کره = u == dw/2 */
        var cityU = city.x / 100 * img.width;
        var wantOff = ((cityU - img.width / 2) % img.width + img.width) % img.width;
        var wantRot = wantOff / img.width * 100;
        var cur = ((rot / 100 * img.width) % img.width + img.width) % img.width;
        var delta = wantRot - cur / img.width * 100;
        if (delta > 50) delta -= 100;
        if (delta < -50) delta += 100;
        paused = true;
        var o = { v: rot };
        gsap.to(o, {
          v: rot + delta, duration: 1.6, ease: "power2.inOut",
          onUpdate: function () { rot = o.v; },
          onComplete: function () { setTimeout(function () { paused = false; }, 900); },
        });
      },
    };
  }

  /* ---------- ورود سینمایی و بازگشت به بالا ---------- */
  function initMisc() {
    if (typeof gsap !== "undefined") {
      gsap.utils.toArray("[data-reveal]").forEach(function (el) {
        gsap.fromTo(el, { autoAlpha: 0, y: 30 }, {
          autoAlpha: 1, y: 0, duration: .9, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });
      gsap.utils.toArray("[data-split]").forEach(function (el) {
        var words = el.textContent.trim().split(/\s+/);
        el.innerHTML = words.map(function (w) { return '<span style="display:inline-block" data-w>' + w + "</span>"; }).join(" ");
        var ws = el.querySelectorAll("[data-w]");
        gsap.set(ws, { y: "115%" });
        gsap.to(ws, { y: "0%", duration: .8, stagger: .05, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 86%", once: true } });
      });
      var img = document.querySelector("[data-map-img]");
      if (img) {
        gsap.fromTo(img, { scale: 1.16 }, { scale: 1, ease: "none", scrollTrigger: { trigger: "[data-skymap]", start: "top bottom", end: "center center", scrub: .8 } });
      }
    }
    var toTop = document.getElementById("toTop");
    toTop.addEventListener("click", function () {
      if (window.scrollY > 120) FM.scrollToEl(0);
      else location.href = "index.html#golden";
    });
    window.addEventListener("scroll", function () {
      var show = window.scrollY > 600;
      if (show && toTop.hidden) { toTop.hidden = false; toTop.style.opacity = 1; }
      else if (!show) toTop.hidden = true;
      var bar = document.getElementById("scrollBar");
      if (bar) {
        var h = document.documentElement.scrollHeight - innerHeight;
        bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
      }
      document.getElementById("nav").classList.toggle("is-scrolled", window.scrollY > 40);
    }, { passive: true });
  }

  fillProvinces(); fillCities(); fillDistricts();
  initGlobe();
  /* با تغییر تم، کره و نقشهٔ زنده با همان تم دوباره بارگذاری می‌شوند */
  document.documentElement.addEventListener("fm:theme", function () {
    var f = document.getElementById("skyLive");
    if (f) setTimeout(function () { f.src = "/app.html?embed=1&t=" + Date.now() + "#/sky"; }, 120);
  });
  initMisc();
  apply();
  renderPins(true);
  renderStats();
})();
