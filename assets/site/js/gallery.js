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
  var picker = null;
  function fillCities() {
    if (!picker && !selCity.dataset.plain) {
      try {
        picker = FM.cityPicker(selCity, function (ids) {
          FM.region.city = ids.join(","); FM.region.district = "";
          fillDistricts(); refresh();
        });
      } catch (e) {
        // اگر انتخاب چندشهری در این مرورگر کار نکرد، همان فهرست ساده (یک شهر) نمایش داده می‌شود
        picker = null; selCity.dataset.plain = "1";
        var pf = document.querySelector(".cpick-field"); if (pf) pf.remove();
        var f0 = selCity.closest(".searchbar__field"); if (f0) f0.style.display = "";
        selCity.hidden = false;
        selCity.addEventListener("change", function () { FM.region.city = selCity.value; FM.region.district = ""; fillDistricts(); refresh(); });
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

  var E = FM.esc;
  /* نتیجهٔ فیلتر منطقه از خود سرور خوانده می‌شود (همهٔ آگهی‌های سنجیده‌شدهٔ آن منطقه، نه فقط ویترین) */
  var current = (FM.data.properties || []).slice(), seq = 0;
  /* ---------- فیلتر پیشرفته: همان فیلترهای جست‌وجوی کامل سایت ---------- */
  var ADV = {};   // { deal, kinds, min, max, depMax, rentMax, areaMin, areaMax, rooms, ageMax, fresh, settle, amenities, opp, drop }
  var advPanel = document.getElementById("advPanel"), advToggle = document.getElementById("advToggle"), advCount = document.getElementById("advCount");
  function toNum(t) {
    t = String(t || "").replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/[,٬،\s]/g, "").replace("٫", ".");
    var m = t.match(/[\d.]+/); if (!m) return "";
    var n = parseFloat(m[0]); if (!n) return "";
    if (/میلیارد/.test(t)) n *= 1e9; else if (/میلیون/.test(t)) n *= 1e6; else if (/هزار/.test(t)) n *= 1e3;
    else if (n < 1000) n *= 1e6;   // عدد خالی کوچک: میلیون تومان
    return Math.round(n);
  }
  function digits(t) { var m = String(t || "").replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).match(/\d+/); return m ? +m[0] : ""; }
  function advParams() {
    var q = {}, d = ADV.deal || "";
    if (d === "presale") { q.deal = "sale"; q.presale = 1; } else if (d) q.deal = d;
    ["kinds", "rooms", "amenities"].forEach(function (k) { if (ADV[k] && ADV[k].length) q[k] = ADV[k].join(","); });
    ["min", "max", "depMax", "rentMax", "areaMin", "areaMax", "ageMax", "fresh", "settle", "opp", "drop"].forEach(function (k) { if (ADV[k]) q[k] = ADV[k]; });
    return q;
  }
  function advActive() { return Object.keys(advParams()).filter(function (k) { return k !== "presale"; }).length; }
  function anyFilter() { var r = FM.region; return !!(r.province || r.city || r.district || advActive()); }
  function queryOf(extra) {
    var r = FM.region, q = Object.assign({ province: r.city ? "" : r.province, city: r.city, district: r.district }, advParams(), extra || {});
    Object.keys(q).forEach(function (k) { if (q[k] === "" || q[k] == null) delete q[k]; });
    return q;
  }
  function searchUrl() {
    var q = queryOf({ sort: "score" });
    return "/app.html#/s?" + Object.keys(q).map(function (k) { return k + "=" + encodeURIComponent(q[k]); }).join("&");
  }
  if (advPanel && advToggle) {
    advToggle.addEventListener("click", function () {
      var open = advPanel.hidden;
      advPanel.hidden = !open; advToggle.setAttribute("aria-expanded", open); advToggle.classList.toggle("is-open", open);
      if (window.ScrollTrigger) setTimeout(function () { ScrollTrigger.refresh(); }, 50);
    });
    var tmr = null;
    var later = function () { clearTimeout(tmr); tmr = setTimeout(refresh, 350); };
    advPanel.addEventListener("click", function (e) {
      var b = e.target.closest(".advf__chips button"); if (!b) return;
      var box = b.parentNode, k = box.dataset.adv, v = b.dataset.v;
      if (box.hasAttribute("data-one")) {
        ADV[k] = v;
        box.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        if (k === "deal") {
          var rent = v === "rent";
          document.getElementById("advRent").hidden = !rent;
          document.getElementById("advPriceH").textContent = rent ? "رهن کامل (تومان)" : v === "daily" ? "اجارهٔ هر شب (تومان)" : "بودجه (تومان)";
        }
      } else if (k === "drop") {
        ADV.drop = ADV.drop ? "" : 1; b.classList.toggle("is-on", !!ADV.drop);
      } else {
        var arr = ADV[k] = ADV[k] || [], i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        b.classList.toggle("is-on", i < 0);
      }
      later();
    });
    [["advMin", "min", toNum], ["advMax", "max", toNum], ["advDep", "depMax", toNum], ["advRentMax", "rentMax", toNum],
     ["advAMin", "areaMin", digits], ["advAMax", "areaMax", digits]].forEach(function (x) {
      var el = document.getElementById(x[0]);
      if (el) el.addEventListener("input", function () { ADV[x[1]] = x[2](el.value); later(); });
    });
    document.getElementById("advClear").addEventListener("click", function () {
      ADV = {};
      advPanel.querySelectorAll(".advf__chips button").forEach(function (x) { x.classList.toggle("is-on", x.dataset.v === "" ); });
      advPanel.querySelectorAll("input").forEach(function (x) { x.value = ""; });
      document.getElementById("advRent").hidden = true; document.getElementById("advPriceH").textContent = "بودجه (تومان)";
      refresh();
    });
    document.getElementById("advDone").addEventListener("click", function () {
      var g = document.getElementById("gallery");
      if (g) (FM.scrollToEl ? FM.scrollToEl(g, { offset: -80 }) : g.scrollIntoView({ behavior: "smooth" }));
    });
  }

  /* فیلترها در همین زبانه نگه داشته می‌شوند تا با «برگشت» از صفحهٔ ملک، همان نتیجه‌ها دوباره بیایند */
  var ADV_INPUTS = ["advMin", "advMax", "advDep", "advRentMax", "advAMin", "advAMax"];
  function saveFilters() {
    try {
      var inp = {};
      ADV_INPUTS.forEach(function (id) { var el = document.getElementById(id); if (el && el.value) inp[id] = el.value; });
      sessionStorage.setItem("fmHomeFilter", JSON.stringify({ region: FM.region, adv: ADV, inp: inp }));
    } catch (e) { /* حالت خصوصی */ }
  }
  function loadFilters() {
    if (!hasFilters || !FM.backNav) return false;
    var st = null;
    try { st = JSON.parse(sessionStorage.getItem("fmHomeFilter") || "null"); } catch (e) { return false; }
    if (!st || !st.region) return false;
    FM.region = { province: st.region.province || "", city: st.region.city || "", district: st.region.district || "" };
    ADV = st.adv || {};
    if (!anyFilter()) return false;
    selProvince.value = FM.region.province;
    fillCities(); fillDistricts();
    selDistrict.value = FM.region.district;
    if (selCity.dataset.plain) selCity.value = FM.region.city;
    if (advPanel) {
      advPanel.querySelectorAll(".advf__chips").forEach(function (box) {
        var k = box.dataset.adv, v = ADV[k];
        box.querySelectorAll("button").forEach(function (b) {
          var on = box.hasAttribute("data-one") ? String(v || "") === b.dataset.v : Array.isArray(v) ? v.indexOf(b.dataset.v) >= 0 : !!v;
          b.classList.toggle("is-on", on);
        });
      });
      var rentBox = document.getElementById("advRent"), priceH = document.getElementById("advPriceH");
      if (rentBox) rentBox.hidden = ADV.deal !== "rent";
      if (priceH) priceH.textContent = ADV.deal === "rent" ? "رهن کامل (تومان)" : ADV.deal === "daily" ? "اجارهٔ هر شب (تومان)" : "بودجه (تومان)";
      Object.keys(st.inp || {}).forEach(function (id) { var el = document.getElementById(id); if (el) el.value = st.inp[id]; });
    }
    return true;
  }

  function refresh() {
    var my = ++seq;
    saveFilters();
    if (allBtn) allBtn.href = searchUrl();
    var n = advActive();
    if (advCount) { advCount.hidden = !n; advCount.textContent = FM.fa(n); }
    if (!anyFilter() || !FM.api) { current = (FM.data.properties || []).slice(); applyFilterUI(); renderMasonry(true); renderHunts(bootHunts()); document.dispatchEvent(new CustomEvent("fm:filtered", { detail: { items: null } })); return; }
    statusEl.textContent = "در حال جست‌وجو…";
    var scoredOnly = !ADV.deal || ADV.deal === "sale" || ADV.deal === "presale";
    var ids = FM.cityIds(FM.region);
    /* چند شهر: هر شهر جداگانه و به ترتیب انتخاب (اول شهر اول، بعد بقیه) */
    var byCity = function (extra) {
      if (ids.length < 2) return FM.api.search(queryOf(extra)).then(function (r) { return [r]; });
      return Promise.all(ids.map(function (id) { return FM.api.search(queryOf(Object.assign({}, extra, { city: id, limit: Math.min(extra.limit, 12) }))).catch(function () { return { items: [] }; }); }));
    };
    byCity({ ranked: scoredOnly ? 1 : "", sort: "score", limit: 30, imgs: 1 }).then(function (rs) {
      if (my !== seq) return;
      current = [];
      current.groups = rs.map(function (res, i) { return { id: ids[i], name: ids.length > 1 ? (FM.cityById(ids[i]) || {}).name || ids[i] : "", items: (res.items || []).map(FM.mapListing), locked: res.locked_more || 0 }; });
      current.groups.forEach(function (g) { current.push.apply(current, g.items); });
      current.total = rs.reduce(function (a, r) { return a + (r.total || 0); }, 0) || current.length;
      current.locked = rs.reduce(function (a, r) { return a + (r.locked_more || 0); }, 0);
      applyFilterUI(); renderMasonry(true);
      document.dispatchEvent(new CustomEvent("fm:filtered", { detail: { items: current } }));
    }).catch(function () { if (my === seq) statusEl.textContent = "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید."; });
    /* شکارهای بازار هم با همین فیلتر: فقط فرصت‌ها، بیشترین فاصله با برآورد بازار */
    byCity({ opp: 1, sort: "deal", limit: 12, imgs: 1 }).then(function (rs) {
      if (my !== seq) return;
      var hs = [];
      rs.forEach(function (res, i) {
        var items = (res.items || []).map(FM.mapListing);
        if (ids.length > 1 && items.length) hs.push({ head: (FM.cityById(ids[i]) || {}).name || ids[i] });
        hs.push.apply(hs, items);
      });
      renderHunts(hs);
    }).catch(function () {});
  }

  function matchesRegion(p) {
    var r = FM.region;
    if (r.province && p.region.province !== r.province) return false;
    if (r.city && FM.cityIds(r).indexOf(p.region.city) < 0) return false;
    if (r.district && p.region.district !== r.district) return false;
    return true;
  }

  function applyFilterUI() {
    if (!hasFilters) return;
    var label = FM.regionLabel(FM.region) || "همهٔ مناطق";
    var reg = FM.region.province || FM.region.city || FM.region.district, any = anyFilter();
    statusEl.innerHTML = any ? "گالری و شکارهای بازار با فیلتر <b>" + E(label) + "</b>" + (advActive() ? " + " + FM.fa(advActive()) + " فیلتر پیشرفته" : "") : "نمایش همهٔ املاک ویترین";
    btnReset.hidden = !reg;
    if (allCount) allCount.textContent = any ? "همهٔ آگهی‌های " + label + " با فیلتر کامل" : "جست‌وجوی کامل با فیلتر و نقشه";
    if (allBtn) allBtn.querySelector("b").textContent = any ? "مشاهدهٔ همه در جست‌وجوی فرصت‌ها" : "جست‌وجوی همهٔ فرصت‌ها";
  }

  if (hasFilters) {
    fillProvinces(); fillCities(); fillDistricts(); applyFilterUI();

    selProvince.addEventListener("change", function () {
      FM.region.province = selProvince.value;
      if (picker) picker.province(FM.region.province);
      if (!FM.cityIds(FM.region).length) refresh();
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
      '<span class="ncard__media">' + FM.badge(p, "ncard__badge") + FM.cardActs(p) +
      '<img src="' + E(p.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG">' +
      (p.imgs.length > 1 ? '<span class="ncard__swap">' + FM.fa(p.imgs.length) + " عکس</span>" + '<span class="ncard__dots">' + p.imgs.slice(0, 8).map(function (_, i) { return "<i" + (i ? "" : ' class="is-on"') + "></i>"; }).join("") + "</span>" : "") +
      "</span>" +
      '<span class="ncard__body"><b>' + E(p.title) + "</b>" +
      '<span class="ncard__meta"><small>' + E(p.loc) + "</small>" +
      '<small class="st-text" data-status="' + p.status + '">' + E(p.diffText || p.tag) + "</small></span>" +
      '<span class="ncard__price">' + E(p.priceText) + "</span>" +
      (p.locked && p.label ? '<span class="ncard__lock">قیمت منصفانه و سود تخمینی <i>🔒 با اشتراک</i></span>' : "") + "</span>";
    if (p.imgs.length > 1) slideshow(a, p.imgs.slice(0, 8));
    return a;
  }

  /* با رفتن موس روی کارت، بقیهٔ عکس‌های همان ملک یکی‌یکی نشان داده می‌شوند */
  function slideshow(a, imgs) {
    var timer = null, i = 0, img, dots;
    function show(n) {
      i = n % imgs.length;
      var pre = new Image();
      pre.onload = function () { if (timer !== null || n === 0) img.src = imgs[i]; };
      pre.src = imgs[i];
      Array.prototype.forEach.call(dots, function (d, k) { d.classList.toggle("is-on", k === i); });
    }
    // گوشی و لمسی (بدون موس): وقتی کارت در صفحه دیده می‌شود، عکس‌ها خودشان جابه‌جا می‌شوند
    if (matchMedia("(hover: none)").matches && "IntersectionObserver" in window) {
      var start = function () {
        img = a.querySelector(".ncard__media img"); dots = a.querySelectorAll(".ncard__dots i");
        if (timer === null) timer = setInterval(function () { show(i + 1); }, 2200 + Math.random() * 900);
      };
      var stop = function () { clearInterval(timer); timer = null; };
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6) start(); else stop(); });
      }, { threshold: [0, 0.6] }).observe(a);
      return;
    }
    a.addEventListener("mouseenter", function () {
      img = a.querySelector(".ncard__media img"); dots = a.querySelectorAll(".ncard__dots i");
      clearInterval(timer);
      timer = setInterval(function () { show(i + 1); }, 1100);
      show(1);
    });
    a.addEventListener("mouseleave", function () {
      clearInterval(timer); timer = null;
      if (img) show(0);
    });
  }

  function clearColTweens() {
    colTweens.forEach(function (t) { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); });
    colTweens = [];
  }

  /* بقیهٔ نتیجه‌ها برای غیرمشترک: کارت‌های مات با قفل و شمار واقعی همان جست‌وجو؛ دکمه، پنجرهٔ اشتراک را باز می‌کند */
  function lockTeaser(n, where) {
    var box = document.createElement("div");
    box.className = "lockteaser";
    box.innerHTML = '<div class="lockteaser__ghosts" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
      '<div class="lockteaser__body"><span class="lockteaser__ico">🔒</span><b>' + FM.fa(n) + " فرصت دیگر" + (where ? " در " + E(where) : "") + " قفل است</b>" +
      "<small>با اشتراک همهٔ نتیجه‌ها، قیمت منصفانه، درصد دقیق زیر بازار، سود تخمینی و پیوند آگهی اصلی باز می‌شود.</small>" +
      '<button type="button" class="btn btn--gold" data-fm-sub>دیدن همه با اشتراک</button></div>';
    return box;
  }

  function renderMasonry(animate) {
    if (!wrap || !cols.length) return;
    var items = current;
    var limited = anyFilter();
    if (limited) {
      statusEl.innerHTML = items.length
        ? "بهترین‌های <b>" + E(FM.regionLabel(FM.region) || "همهٔ مناطق") + "</b> با این فیلترها" + (current.total > items.length ? "؛ " + FM.fa(current.total) + " آگهی پیدا شد" : "") + (current.locked ? " — بقیه با اشتراک در جست‌وجوی کامل" : "")
        : "با این فیلترها آگهی سنجیده‌شده‌ای پیدا نشد؛ فیلترها را کمتر کنید.";
    } else {
      statusEl.innerHTML = items.length ? "بهترین فرصت‌های امروز بر پایهٔ امتیاز فرصت" : "هنوز آگهی سنجیده‌شده‌ای نداریم.";
    }
    var gal = document.querySelector("[data-gallery]");
    if (gal) gal.classList.toggle("is-empty", !items.length);

    clearColTweens();
    /* چند شهر: هر شهر یک بخش جدا، به ترتیب انتخاب */
    var groupsBox = document.querySelector("[data-cgroups]");
    var grouped = !!(current.groups && current.groups.filter(function (g) { return g.name; }).length > 1 && current === items);
    if (!groupsBox) { groupsBox = document.createElement("div"); groupsBox.className = "cgroups"; groupsBox.setAttribute("data-cgroups", ""); wrap.after(groupsBox); }
    wrap.hidden = grouped; groupsBox.hidden = !grouped;
    var lt = document.querySelector("[data-lockslot]");
    if (!lt) { lt = document.createElement("div"); lt.setAttribute("data-lockslot", ""); groupsBox.after(lt); }
    lt.innerHTML = "";
    if (limited && !grouped && current.locked) lt.appendChild(lockTeaser(current.locked, FM.regionLabel(FM.region)));
    if (grouped) {
      groupsBox.innerHTML = "";
      current.groups.forEach(function (g, gi) {
        var sec = document.createElement("section"); sec.className = "cgroup";
        sec.innerHTML = '<h3 class="cgroup__h"><i>' + FM.fa(gi + 1) + "</i>فرصت‌های " + E(g.name) + " <small>" + (g.items.length ? FM.fa(g.items.length) + " ملک" : "موردی با این فیلترها پیدا نشد") + "</small></h3>";
        var grid = document.createElement("div"); grid.className = "cgroup__grid";
        g.items.forEach(function (p) { grid.appendChild(ncardEl(p)); });
        sec.appendChild(grid);
        if (g.locked) sec.appendChild(lockTeaser(g.locked, g.name));
        groupsBox.appendChild(sec);
      });
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      return;
    }
    /* فقط ستون‌های دیده‌شده (در صفحهٔ باریک ستون‌های کمتری نمایش داده می‌شود) */
    var vis = Array.prototype.filter.call(cols, function (c) { return getComputedStyle(c).display !== "none"; });
    if (!vis.length) vis = Array.prototype.slice.call(cols);
    var perCol = Array.prototype.map.call(cols, function () { return []; });
    items.forEach(function (p, i) { perCol[Array.prototype.indexOf.call(cols, vis[i % vis.length])].push(p); });

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
  function bootHunts() { return (FM.data.properties || []).filter(function (p) { return p.label === "gold" || p.label === "good"; }).slice(0, 8); }
  /* شکارهای بازار: بدون اشتراک فقط سه شکار اول (در هر شهر) باز است؛ بقیه مات با قفل */
  var HUNT_FREE = 3, lastHunts = [];
  addEventListener("fm:me", function () { if (lastHunts.length) renderHunts(lastHunts); });
  function renderHunts(hunts) {
    if (!htrack) return;
    lastHunts = hunts;
    var sub = FM.isSub(), n = 0;
    htrack.innerHTML = hunts.length ? hunts.map(function (p) {
      if (p.head) { n = 0; return '<div class="hcard hcard--head"><span>فرصت‌های</span><b>' + E(p.head) + "</b></div>"; }
      if (!sub && n++ >= HUNT_FREE) {
        return '<div class="hcard is-locked"><img src="' + E(p.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG">' +
          '<span class="hcard__lock"><i>🔒</i><b>شکار قفل‌شده</b><button type="button" class="btn btn--gold" data-fm-sub>باز کردن با اشتراک</button></span>' +
          "<figcaption><b>" + E(p.diffText || "فروش زیر برآورد بازار") + "</b><small>" + (p.area ? FM.fa(p.area) + " متر" : "") + "</small></figcaption></div>";
      }
      return '<a class="hcard" href="' + FM.propUrl(p.id) + '">' + FM.badge(p, "hcard__badge") + FM.cardActs(p) + '<img src="' + E(p.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG"><figcaption><b>' + E(p.title) + "</b><small>" +
        (p.area ? FM.fa(p.area) + " متر · " : "") + E(p.diffText || p.tag) + "</small></figcaption></a>";
    }).join("") : '<p class="hscroll__empty">با این فیلترها فعلاً شکاری (فروش زیر برآورد بازار) پیدا نشد.</p>';
    var hs = document.querySelector("[data-hscroll]"); if (hs && hunts.length) hs.hidden = false;
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
  var hunts = bootHunts();
  renderHunts(hunts);
  if (htrack && hunts.length < 3) { var hs = document.querySelector("[data-hscroll]"); if (hs) { hs.hidden = true; hs.classList.add("is-static"); } hpin = null; }
  var hfree = !hpin || !htrack || FM.lite || matchMedia("(max-width: 860px)").matches;
  /* بدون پین (گوشی، دستگاه ضعیف): نوار با انگشت یا اسکرول افقی خودش جابه‌جا می‌شود */
  if (hfree) { var hsx = document.querySelector("[data-hscroll]"); if (hsx) hsx.classList.add("is-free"); }
  if (!hfree) {
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
  /* برگشت از صفحهٔ ملک: همان فیلترها و نتیجه‌ها دوباره ساخته می‌شوند */
  if (loadFilters()) { FM.filterRestoring = true; refresh(); }
})();
