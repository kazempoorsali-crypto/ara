/* ═══════════════════════════════════════════════════════════
   فیلتر منطقه (بعد از ویترین) + گالری ستونی پلکانی که به فیلتر
   واکنش نشان می‌دهد + دکمهٔ «مشاهدهٔ همهٔ املاک»
   + اسکرول افقی پروژه‌ها
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ---------- فیلترهای صفحهٔ اصلی ---------- */
  FM.region = FM.region || { province: "", city: "", district: "" };

  var selProvince = document.getElementById("fProvince");
  var selCity = document.getElementById("fCity");
  var selDistrict = document.getElementById("fDistrict");
  var btnReset = document.getElementById("fReset");
  var statusEl = document.getElementById("homeFilterStatus");
  var allBtn = document.querySelector("[data-show-all]");
  var allCount = document.getElementById("allCount");
  var hasFilters = !!(selProvince && selCity && selDistrict);

  function option(v, l) { var o = document.createElement("option"); o.value = v; o.textContent = l; return o; }
  function findProvince(id) { return FM.data.regions.filter(function (p) { return p.id === id; })[0] || null; }
  function findCity(pid, cid) { var p = findProvince(pid); return p ? p.cities.filter(function (c) { return c.id === cid; })[0] || null : null; }

  function fillProvinces() {
    if (!hasFilters) return;
    selProvince.innerHTML = ""; selProvince.appendChild(option("", "همهٔ استان‌ها"));
    FM.data.regions.forEach(function (p) { selProvince.appendChild(option(p.id, p.name)); });
  }
  function fillCities() {
    selCity.innerHTML = ""; selCity.appendChild(option("", "همهٔ شهرها"));
    var p = findProvince(FM.region.province);
    if (p) { p.cities.forEach(function (c) { selCity.appendChild(option(c.id, c.name)); }); selCity.disabled = false; }
    else selCity.disabled = true;
  }
  function fillDistricts() {
    selDistrict.innerHTML = ""; selDistrict.appendChild(option("", "همهٔ محله‌ها"));
    var c = findCity(FM.region.province, FM.region.city);
    if (c) { c.districts.forEach(function (d) { selDistrict.appendChild(option(d.id, d.name)); }); selDistrict.disabled = false; }
    else selDistrict.disabled = true;
  }

  var E = FM.esc;
  /* نتیجهٔ فیلتر منطقه از خود سرور خوانده می‌شود (همهٔ آگهی‌های سنجیده‌شدهٔ آن منطقه، نه فقط ویترین) */
  var current = (FM.data.properties || []).slice(), seq = 0;
  function searchUrl() {
    var r = FM.region, q = [];
    if (r.province) q.push("province=" + encodeURIComponent(r.province));
    if (r.city) q.push("city=" + encodeURIComponent(r.city));
    if (r.district) q.push("district=" + encodeURIComponent(r.district));
    return "/app.html#/s" + (q.length ? "?" + q.join("&") : "");
  }
  function refresh() {
    var r = FM.region, my = ++seq;
    if (allBtn) allBtn.href = searchUrl();
    if (!(r.province || r.city || r.district) || !FM.api) { current = (FM.data.properties || []).slice(); applyFilterUI(); renderMasonry(true); return; }
    statusEl.textContent = "در حال جست‌وجو…";
    FM.api.search({ province: r.province, city: r.city, district: r.district, ranked: 1, sort: "score", limit: 12 }).then(function (res) {
      if (my !== seq) return;
      current = (res.items || []).map(FM.mapListing);
      current.total = res.total || current.length;
      applyFilterUI(); renderMasonry(true);
    }).catch(function () { if (my === seq) statusEl.textContent = "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید."; });
  }

  function matchesRegion(p) {
    var r = FM.region;
    if (r.province && p.region.province !== r.province) return false;
    if (r.city && p.region.city !== r.city) return false;
    if (r.district && p.region.district !== r.district) return false;
    return true;
  }

  function applyFilterUI() {
    if (!hasFilters) return;
    var label = FM.regionLabel(FM.region);
    var any = FM.region.province || FM.region.city || FM.region.district;
    statusEl.innerHTML = any ? "گالری محدود به <b>" + label + "</b>" : "نمایش همهٔ املاک ویترین";
    btnReset.hidden = !any;
    if (allCount) allCount.textContent = any ? "همهٔ آگهی‌های " + label + " با فیلتر کامل" : "جست‌وجوی کامل با فیلتر و نقشه";
    if (allBtn) allBtn.querySelector("b").textContent = any ? "مشاهدهٔ همه در جست‌وجوی فرصت‌ها" : "جست‌وجوی همهٔ فرصت‌ها";
  }

  if (hasFilters) {
    fillProvinces(); fillCities(); fillDistricts(); applyFilterUI();

    selProvince.addEventListener("change", function () {
      FM.region = { province: selProvince.value, city: "", district: "" };
      fillCities(); fillDistricts(); refresh();
    });
    selCity.addEventListener("change", function () {
      FM.region.city = selCity.value; FM.region.district = "";
      fillDistricts(); refresh();
    });
    selDistrict.addEventListener("change", function () {
      FM.region.district = selDistrict.value;
      refresh();
    });
    btnReset.addEventListener("click", function () {
      FM.region = { province: "", city: "", district: "" };
      selProvince.value = ""; fillCities(); fillDistricts(); refresh();
    });
    if (allBtn) allBtn.href = searchUrl();
  }

  /* ---------- گالری ستونی ---------- */
  var wrap = document.querySelector("[data-masonry-wrap]");
  var cols = document.querySelectorAll("[data-col-speed]");
  var colTweens = [];

  function ncardEl(p) {
    var a = document.createElement("a");
    a.className = "ncard";
    a.href = FM.propUrl(p.id);
    a.dataset.status = p.status;
    if (p.noimg) a.classList.add("is-noimg");
    a.innerHTML =
      '<span class="ncard__media">' +
      '<img src="' + E(p.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG">' +
      (p.imgs.length > 1 ? '<img class="ncard__alt" src="' + E(p.img2) + '" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="ncard__swap">عکس دیگر</span>' : "") +
      "</span>" +
      '<span class="ncard__body"><b>' + E(p.title) + "</b>" +
      '<span class="ncard__meta"><small>' + E(p.loc) + "</small>" +
      '<small class="st-text" data-status="' + p.status + '">' + E(p.diffText || p.tag) + "</small></span>" +
      '<span class="ncard__price">' + E(p.priceText) + "</span></span>";
    return a;
  }

  function clearColTweens() {
    colTweens.forEach(function (t) { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); });
    colTweens = [];
  }

  function renderMasonry(animate) {
    if (!wrap || !cols.length) return;
    var items = current;
    var limited = FM.region.province || FM.region.city || FM.region.district;
    if (limited) {
      statusEl.innerHTML = items.length
        ? "بهترین‌های <b>" + E(FM.regionLabel(FM.region)) + "</b> بر پایهٔ امتیاز فرصت" + (current.total > items.length ? "؛ " + FM.fa(current.total) + " آگهی سنجیده‌شده" : "")
        : "در <b>" + E(FM.regionLabel(FM.region)) + "</b> هنوز آگهی سنجیده‌شده‌ای نداریم.";
    } else {
      statusEl.innerHTML = items.length ? "بهترین فرصت‌های امروز بر پایهٔ امتیاز فرصت" : "هنوز آگهی سنجیده‌شده‌ای نداریم.";
    }
    var gal = document.querySelector("[data-gallery]");
    if (gal) gal.classList.toggle("is-empty", !items.length);

    clearColTweens();
    var perCol = [[], [], []];
    items.forEach(function (p, i) { perCol[i % 3].push(p); });

    cols.forEach(function (col, ci) {
      col.innerHTML = "";
      perCol[ci].forEach(function (p, ii) {
        var el = ncardEl(p);
        if (ii === 0 && ci === 1) el.classList.add("is-offset");
        col.appendChild(el);
      });
      gsap.fromTo(col.children, { autoAlpha: 0, y: 30 }, {
        autoAlpha: 1, y: 0, duration: animate ? .55 : 0, stagger: .07, ease: "power3.out", overwrite: true,
      });
    });

    /* حرکت پلکانی ستون‌ها */
    if (!FM.lite && !matchMedia("(max-width: 860px)").matches) {
      cols.forEach(function (col) {
        var dir = col.getAttribute("data-col-speed") === "0.8" ? 1 : -1;
        var t = gsap.fromTo(col, { y: dir * 70 }, {
          y: -dir * 70,
          ease: "none",
          scrollTrigger: { trigger: wrap, start: "top bottom", end: "bottom top", scrub: 0.6 },
        });
        colTweens.push(t);
      });
    }
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  renderMasonry(false);

  /* ---------- اسکرول افقی: فرصت‌های واقعی زیر برآورد بازار ---------- */
  var hpin = document.querySelector("[data-hscroll-pin]");
  var htrack = document.querySelector("[data-hscroll-track]");
  var hunts = (FM.data.properties || []).filter(function (p) { return p.label === "gold" || p.label === "good"; }).slice(0, 8);
  if (htrack) {
    htrack.innerHTML = hunts.map(function (p) {
      return '<a class="hcard" href="' + FM.propUrl(p.id) + '"><img src="' + E(p.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG"><figcaption><b>' + E(p.title) + "</b><small>" +
        (p.area ? FM.fa(p.area) + " متر · " : "") + E(p.diffText || p.tag) + "</small></figcaption></a>";
    }).join("");
    if (hunts.length < 3) { var hs = document.querySelector("[data-hscroll]"); if (hs) hs.hidden = true; hpin = null; }
  }
  if (hpin && htrack && !FM.lite && !matchMedia("(max-width: 860px)").matches) {
    /* ورود از راست: کل تراک ابتدا بیرونِ لبهٔ راست است و با اسکرول تا fit کامل در صفحه می‌آید */
    gsap.fromTo(htrack,
      { x: function () { return innerWidth + 160; } },
      {
        x: 0,
        ease: "none",
        scrollTrigger: {
          trigger: hpin,
          start: "top top",
          end: "+=" + innerHeight * 1.4,
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      }
    );
  }
})();
