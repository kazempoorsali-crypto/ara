/* ═══════════════════════════════════════════════════════════
   صفحهٔ فرعی ملک — گالری، تحلیل قیمت، اشتراک‌گذاری، مرتبط‌ها
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* تم */
  FM.theme = document.documentElement.getAttribute("data-theme") || "dark";
  FM.setTheme = function (t) {
    if (t !== "light" && t !== "dark") return;
    FM.theme = t;
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("fmTheme", t); } catch (e) {}
  };
  var themeBtn = document.getElementById("themeBtn");
  themeBtn && themeBtn.addEventListener("click", function () {
    FM.setTheme(FM.theme === "dark" ? "light" : "dark"); window.FMTheme && FMTheme.choose(FM.theme);
  });

  var p = FM.data.property;
  var $ = function (s) { return document.querySelector(s); };
  var E = FM.esc;
  if (!p) {
    var inner = $(".phero__inner");
    if (inner) inner.innerHTML = '<div class="pmissing"><h1>این ملک پیدا نشد</h1><p>ممکن است آگهی برداشته شده یا نشانی اشتباه باشد.</p><a class="btn btn--gold" href="/app.html#/s">جست‌وجوی فرصت‌ها</a></div>';
    document.querySelectorAll(".pdetails, .prelated").forEach(function (el) { el.hidden = true; });
    return;
  }
  var imgs = [];
  var mainImg = $("[data-main-img]");
  var thumbs = $("[data-pthumbs]");

  /* یافتن محلهٔ ملک در دادهٔ بازار (میانه و چارک‌ها از جدول بازار سرور) */
  function districtOf(r) {
    var out = null;
    FM.data.regions.forEach(function (pg) {
      pg.cities.forEach(function (c) {
        if (c.id !== r.city) return;
        c.districts.forEach(function (d) {
          if (d.id === r.district) {
            var sorted = c.districts.slice().sort(function (x, y) { return y.ppm - x.ppm; });
            out = { d: d, city: c, rank: sorted.indexOf(d) + 1, of: c.districts.length };
          }
        });
      });
    });
    return out;
  }
  var mt = function (ppm) { return ppm ? FM.ppmText(ppm) : "—"; };

  function render(p) {
    var l = p.raw, v = l.verdict || {};
    document.title = p.title + " | فرصت ملک";
    $("[data-ptitle]").textContent = p.title;
    $("[data-ploc]").textContent = [p.loc, p.kind, p.deal].filter(Boolean).join(" · ");
    var badge = $("[data-pbadge]");
    badge.textContent = "✦ " + p.tag;
    badge.style.background = "var(--st-" + p.status + ")";
    badge.style.color = p.status === "gold" || p.status === "mid" ? "" : "#fff";
    $("[data-pprice]").textContent = p.priceText || "—";
    var diff = $("[data-pdiff]");
    diff.textContent = p.diffText; diff.dataset.status = p.status;

    /* امتیاز فرصت و اطمینان */
    var ring = $("[data-pscore]");
    var scoreBox = ring.closest(".pscore");
    if (p.score == null) { if (scoreBox) scoreBox.hidden = true; }
    else {
      ring.style.setProperty("--sp", p.score);
      ring.querySelector("span").textContent = FM.fa(p.score);
      $("[data-pscore-label]").textContent = p.tag + " — امتیاز " + FM.fa(p.score) + " از ۱۰۰";
      var conf = { high: "اطمینان بالا", medium: "اطمینان متوسط", low: "اطمینان کم" }[v.confidence || l.confidence] || "";
      var bits = [conf, v.n ? FM.fa(v.n) + " آگهی مشابه در محله" : "", v.rank && v.rank_n ? "رتبهٔ " + FM.fa(v.rank) + " از " + FM.fa(v.rank_n) + " در محله" : ""].filter(Boolean);
      $("[data-pscore-desc]").textContent = bits.join("، ");
    }

    /* مشخصات */
    $("[data-parea]").textContent = p.area ? FM.fa(p.area) + " م" : "—";
    $("[data-prooms]").textContent = p.rooms ? FM.fa(p.rooms) : "—";
    $("[data-pyear]").textContent = p.year ? FM.fa(p.year) : "—";
    $("[data-pfloor]").textContent = l.floor != null && l.floor !== "" ? FM.fa(l.floor) : "—";
    $("[data-pdesc]").textContent = p.desc || (l.detail_pending ? "جزئیات این آگهی در حال دریافت است؛ کمی بعد دوباره سر بزنید." : "");
    var feats = $("[data-pfeatures]");
    feats.innerHTML = "";
    (p.features || []).forEach(function (f) { var s = document.createElement("span"); s.textContent = f; feats.appendChild(s); });

    var tbody = $("[data-ptable] tbody");
    tbody.innerHTML = "";
    var seen = l.first_seen ? new Date(l.first_seen * 1000).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" }) : "";
    [["نوع ملک", p.kind], ["نوع معامله", p.deal], ["موقعیت", p.loc], ["متراژ", p.area ? FM.fa(p.area) + " متر" : ""],
     ["خواب", p.rooms ? FM.fa(p.rooms) : ""], ["سال ساخت", p.year ? FM.fa(p.year) : ""], ["طبقه", l.floor != null && l.floor !== "" ? FM.fa(l.floor) : ""],
     ["قیمت هر متر", l.ppm ? mt(l.ppm) + " تومان" : ""], ["نخستین مشاهده در فرصت ملک", seen]].forEach(function (r) {
      if (!r[1]) return;
      var tr = document.createElement("tr");
      tr.innerHTML = "<th>" + r[0] + "</th><td>" + E(r[1]) + "</td>";
      tbody.appendChild(tr);
    });

    /* محله */
    var dd = districtOf(p.region), mk = FM.data.market;
    $("[data-pnb-name]").textContent = mk && mk.scope === "city" ? "کل " + (mk.name || "شهر") + " (دادهٔ محله کافی نیست)" : dd ? dd.d.name + "، " + dd.city.name : (p.loc || "محلهٔ ملک");
    $("[data-pnb-price]").textContent = mk ? mt(mk.median) : dd ? mt(dd.d.ppm) : "—";
    $("[data-pnb-trend]").textContent = mk ? FM.fa(mk.n) : dd ? FM.fa(dd.d.n) : "—";
    $("[data-pnb-rank]").textContent = dd ? "رتبهٔ " + FM.fa(dd.rank) + " از " + FM.fa(dd.of) : "—";

    /* خلاصهٔ حکم به زبان ساده */
    var vtxt = { gold: "در سنجش ما فرصت طلایی است: قیمتش به‌طور معناداری زیر برآورد بازار همین محله است.", good: "در سنجش ما فرصت مناسبی است: قیمتش زیر برآورد بازار محله است.",
      fair: "قیمتش نزدیک برآورد بازار است؛ فرصت ویژه‌ای نیست ولی گران هم نیست.", high: "بالاتر از برآورد بازار است و جای چانه‌زنی دارد.",
      over: "به‌طور معناداری بالاتر از برآورد بازار است.", sus: "احتیاط: ارزانی‌اش باورپذیر نیست؛ پیش از هر اقدامی استعلام کنید.", pending: "هنوز آگهی مشابه کافی برای سنجش دقیق این ملک نداریم." }[p.label] || "";
    var pv = $("[data-pverdict]");
    if (pv && vtxt) {
      var extra = v.estimated_profit ? " فاصلهٔ برآوردی تا قیمت بازار: حدود " + FM.money(v.estimated_profit) + "." : l.locked && (p.label === "gold" || p.label === "good") ? " درصد دقیق، برآورد بازار همین ملک و پیوند آگهی اصلی ویژهٔ مشترکان است." : "";
      pv.textContent = vtxt + extra; pv.dataset.status = p.status; pv.hidden = false;
    }

    /* پیوند آگهی اصلی: فقط برای مشترکان (برای بقیه، پنجرهٔ اشتراک) */
    var src = $("[data-psource]");
    var txt = l.locked ? "مشاهدهٔ آگهی اصلی (ویژهٔ مشترکان)" : "مشاهدهٔ آگهی اصلی";
    document.querySelectorAll("[data-psource-txt], [data-psource-txt2]").forEach(function (x) { x.textContent = txt; });
    if (!l.locked && l.url) { src.href = l.url; src.target = "_blank"; src.onclick = null; }
    else {
      src.href = "/account.html"; src.removeAttribute("target");
      src.onclick = function (e) { e.preventDefault(); if (FM.account) FM.account.subscribe(); else location.href = "/account.html"; };
    }

    /* گالری */
    imgs = p.imgs.length ? p.imgs : [FM.NOIMG];
    thumbs.innerHTML = "";
    mainImg.referrerPolicy = "no-referrer";
    mainImg.onerror = function () { mainImg.src = FM.NOIMG; };
    imgs.forEach(function (src0, i) {
      if (i === 0) { mainImg.src = src0; mainImg.classList.add("is-on"); }
      if (imgs.length < 2) return;
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = '<img src="' + E(src0) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
      if (i === 0) b.classList.add("is-on");
      b.addEventListener("click", function () {
        mainImg.classList.remove("is-on");
        setTimeout(function () { mainImg.src = src0; mainImg.classList.add("is-on"); }, 240);
        thumbs.querySelectorAll("button").forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
      });
      thumbs.appendChild(b);
    });

    /* تحلیل قیمت: هر متر آگهی، میانهٔ محله، و برآورد بازار همین ملک (برای مشترکان) */
    var ppm = l.ppm || 0, med = mk ? mk.median : dd ? dd.d.ppm : 0, fair = l.fair_ppm || v.fair_ppm || 0;
    var q25 = mk ? mk.p25 : dd ? dd.d.p25 : 0, q75 = mk ? mk.p75 : dd ? dd.d.p75 : 0;
    var top = Math.max(ppm, med, fair, q75 || 0) * 1.08 || 1;
    $("[data-pb1v]").textContent = ppm ? mt(ppm) + " م.ت" : "—";
    $("[data-pb2v]").textContent = med ? mt(med) + " م.ت" : "—";
    $("[data-pb3v]").textContent = fair ? mt(fair) + " م.ت" : l.locked ? "ویژهٔ مشترکان" : "—";
    setTimeout(function () {
      $("[data-pb1]").style.width = (ppm / top * 100) + "%";
      $("[data-pb2]").style.width = (med / top * 100) + "%";
      $("[data-pb3]").style.width = fair ? (fair / top * 100) + "%" : "0";
    }, 300);

    /* گیج: چارک پایین / میانه / چارک بالای محله + نقطهٔ این ملک */
    var gauge = $(".pgauge");
    if (q25 && q75 && ppm) {
      gauge.hidden = false;
      var gMin = Math.min(q25, ppm) * 0.95, gMax = Math.max(q75, ppm) * 1.05;
      var pos = function (x) { return Math.max(2, Math.min(98, (x - gMin) / (gMax - gMin) * 100)); };
      $("[data-gmin]").textContent = mt(q25) + " م.ت";
      $("[data-gavgv]").textContent = mt(med) + " م.ت";
      $("[data-gmax]").textContent = mt(q75) + " م.ت";
      $("[data-gavg]").style.right = pos(med) + "%";
      var dot = $("[data-gdot]");
      dot.style.setProperty("--dot", { gold: "#D5A626", ok: "#20976A", mid: "#E59B32", warm: "#CE7439", bad: "#CF4751" }[p.status] || "#D5A626");
      dot.querySelector("b").textContent = mt(ppm);
      dot.style.right = pos(ppm) + "%"; dot.style.opacity = 1;
    } else if (gauge) gauge.hidden = true;

    /* تاریخچهٔ قیمت همین آگهی (فقط اگر واقعاً تغییر قیمت ثبت شده باشد) */
    var hist = (l.history || []).filter(function (h) { return h.price || h.deposit; });
    var box = $("[data-pchart]");
    if (hist.length >= 2) {
      box.hidden = false;
      var vals = hist.map(function (h) { return h.price || h.deposit; });
      var hmin = Math.min.apply(null, vals), hmax = Math.max.apply(null, vals);
      var W = 560, H = 150, pad = 14;
      var pts = vals.map(function (x, i) { return [pad + i / (vals.length - 1) * (W - pad * 2), H - pad - ((x - hmin) / (hmax - hmin || 1)) * (H - pad * 2.4)]; });
      var d2 = pts.map(function (pt, i) { return (i ? "L" : "M") + pt[0].toFixed(1) + " " + pt[1].toFixed(1); }).join(" ");
      $("[data-hist-line]").setAttribute("d", d2);
      $("[data-hist-area]").setAttribute("d", d2 + " L" + (W - pad) + " " + H + " L" + pad + " " + H + " Z");
      var dots = $("[data-hist-dots]"), ev = $("[data-hist-events]");
      dots.innerHTML = ""; ev.innerHTML = "";
      var date = function (t) { return new Date(t * 1000).toLocaleDateString("fa-IR", { month: "long", day: "numeric" }); };
      hist.forEach(function (h, i) {
        var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", pts[i][0]); c.setAttribute("cy", pts[i][1]); c.setAttribute("r", i === hist.length - 1 ? "6" : "4.5");
        c.setAttribute("fill", i === hist.length - 1 ? "#D5A626" : "#20976A"); c.setAttribute("stroke", "#fff"); c.setAttribute("stroke-width", "2");
        dots.appendChild(c);
        var li = document.createElement("li");
        if (i === 0) { li.className = "first"; li.innerHTML = "<b>ثبت اولیه</b><span>" + date(h.at) + " — " + E(FM.money(vals[i])) + "</span>"; }
        else {
          var ch = Math.round((vals[i] - vals[i - 1]) / vals[i - 1] * 100);
          li.className = ch > 0 ? "up" : "down";
          li.innerHTML = "<b>" + (ch > 0 ? "↑" : "↓") + " " + FM.fa(Math.abs(ch)) + "٪</b><span>" + date(h.at) + " — " + E(FM.money(vals[i])) + "</span>";
        }
        ev.appendChild(li);
      });
    } else if (box) {
      box.hidden = false;
      var cur = l.pp || l.price;
      $("[data-hist-line]").setAttribute("d", "M14 75 L546 75");
      $("[data-hist-area]").setAttribute("d", "");
      $("[data-hist-dots]").innerHTML = '<circle cx="546" cy="75" r="6" fill="#D5A626" stroke="#fff" stroke-width="2"></circle>';
      $("[data-hist-events]").innerHTML = '<li class="first"><b>بدون تغییر قیمت</b><span>' + (l.first_seen ? "از " + new Date(l.first_seen * 1000).toLocaleDateString("fa-IR", { month: "long", day: "numeric" }) + " تا امروز" : "از نخستین مشاهده") + (cur ? " — " + E(FM.money(cur)) : "") + "</span></li>";
    }

    /* نقشهٔ موقعیت (برای مهمان تقریبی) */
    var mbox = $("[data-pmapbox]");
    if (mbox && window.L && l.lat != null && l.lng != null) {
      mbox.hidden = false;
      $("[data-pmap-note]").textContent = l.latlng_exact ? "دقیق" : "تقریبی";
      $("[data-pmap-hint]").hidden = !!l.latlng_exact;
      setTimeout(function () {
        if (FM._pmap) { FM._pmap.remove(); FM._pmap = null; }
        var map = FM._pmap = L.map("pMap", { scrollWheelZoom: false, attributionControl: false }).setView([l.lat, l.lng], l.latlng_exact ? 16 : 14);
        L.tileLayer("/tiles/osm/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
        if (l.latlng_exact) L.marker([l.lat, l.lng]).addTo(map);
        else L.circle([l.lat, l.lng], { radius: 700, color: "#D5A626", weight: 2, fillOpacity: .15 }).addTo(map);
      }, 60);
    }

    /* مشابه‌ها */
    var row = $("[data-prelated]");
    var rel = (l.similar || []).map(FM.mapListing);
    row.innerHTML = "";
    var relSec = $(".prelated"); if (relSec) relSec.hidden = !rel.length;
    rel.slice(0, 6).forEach(function (r) {
      var a = document.createElement("a");
      a.className = "ncard";
      a.href = FM.propUrl(r.id);
      a.innerHTML =
        '<span class="ncard__media"><img src="' + E(r.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG"></span>' +
        '<span class="ncard__body"><b>' + E(r.title) + "</b>" +
        '<span class="ncard__meta"><small>' + E(r.loc) + '</small><small class="st-text" data-status="' + r.status + '">' + E(r.diffText || r.tag) + "</small></span>" +
        '<span class="ncard__price">' + E(r.priceText) + "</span></span>";
      row.appendChild(a);
    });
  }
  render(p);
  /* پس از ورود: همین ملک با دسترسی کاربر (مشترک: درصد دقیق، برآورد و پیوند آگهی اصلی) */
  window.addEventListener("fm:me", function (e) {
    if (!e.detail || !FM.api) return;   // فقط کاربر واردشده؛ مهمان همان دادهٔ صفحه را دارد
    FM.api.listing(p.id).then(function (l) { p = FM.mapListing(l); render(p); }).catch(function () {});
  });

  /* افکت جوهر: بلوپرینت → واقعی، یک‌باره هنگام ورود */
  (function () {
    var inkSvg = document.querySelector(".pgallery__ink");
    var inkImg = document.querySelector("[data-inkimg]");
    var inkBp = document.querySelector("[data-inkbp]");
    var path = document.querySelector(".ink-path-p");
    if (!inkSvg || !path) return;
    if (!imgs.length || imgs[0] === FM.NOIMG) { inkSvg.style.display = "none"; inkBp.parentElement.style.display = "none"; return; }
    inkImg.setAttribute("href", imgs[0]);
    inkBp.src = imgs[0];
    var play = function () {
      gsap.to(path, { attr: { d: path.dataset.final }, duration: 1.6, ease: "power2.inOut" });
      gsap.to(inkBp.parentElement, { opacity: 0.14, duration: 1.6 });
      gsap.delayedCall(1.7, function () { inkSvg.style.display = "none"; inkBp.parentElement.style.opacity = ""; inkBp.parentElement.style.display = "none"; });
    };
    ScrollTrigger.create({ trigger: "[data-pmain]", start: "top 95%", once: true, onEnter: play });
  })();

  /* لایت‌باکس زوم تصویر */
  var lightbox = document.getElementById("lightbox");
  var lbImg = document.getElementById("lightboxImg");
  var mainWrap = document.querySelector("[data-pmain]");
  var zoomed = false;
  function openLb(src) {
    lbImg.src = src;
    lbImg.style.transform = "";
    zoomed = false;
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("is-locked");
  }
  function closeLb() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("is-locked");
  }
  mainWrap.addEventListener("click", function () { openLb(mainImg.src); });
  lbImg.addEventListener("click", function (e) {
    var r = lbImg.getBoundingClientRect();
    var ox = ((e.clientX - r.left) / r.width * 100).toFixed(1);
    var oy = ((e.clientY - r.top) / r.height * 100).toFixed(1);
    if (!zoomed) {
      lbImg.style.transformOrigin = ox + "% " + oy + "%";
      lbImg.style.transform = "scale(2.2)";
      zoomed = true;
    } else {
      lbImg.style.transform = "";
      zoomed = false;
    }
  });
  document.getElementById("lightboxClose").addEventListener("click", closeLb);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });

  /* اشتراک‌گذاری */
  FM.toast = FM.toast || function (m) {
    var t = document.createElement("div"); t.className = "fm-toast"; t.textContent = m;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("is-on"); }, 10);
    setTimeout(function () { t.classList.remove("is-on"); setTimeout(function () { t.remove(); }, 400); }, 2200);
  };
  FM.share = function () {
    var url = location.href;
    if (navigator.share) navigator.share({ title: p.title + " — فرصت ملک", url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { FM.toast("نشانی ملک کپی شد"); });
  };
  document.getElementById("pShare").addEventListener("click", FM.share);
  var saveBtn = document.getElementById("pSave");
  function renderSave() {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem("fmSaved") || "[]"); } catch (e) {}
    var isSaved = saved.indexOf(p.id) !== -1;
    saveBtn.classList.toggle("is-saved", isSaved);
    saveBtn.innerHTML = isSaved
      ? 'ذخیره شد <span style="color:#e0455a">♥</span>'
      : 'ذخیره <span style="opacity:.55">♡</span>';
  }
  renderSave();
  saveBtn.addEventListener("click", function () {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem("fmSaved") || "[]"); } catch (e) {}
    if (saved.indexOf(p.id) === -1) { saved.push(p.id); FM.toast("به ذخیره‌شده‌ها اضافه شد ♥"); }
    else { saved = saved.filter(function (x) { return x !== p.id; }); FM.toast("از ذخیره‌شده‌ها حذف شد"); }
    try { localStorage.setItem("fmSaved", JSON.stringify(saved)); } catch (e) {}
    renderSave();
  });

  /* فلش بالا: اگر بالای صفحه‌ایم → برگشت به سایت اصلی */
  var tt = document.createElement("button");
  tt.className = "totop"; tt.id = "toTop"; tt.hidden = true;
  tt.setAttribute("aria-label", "بازگشت");
  tt.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  document.body.appendChild(tt);
  tt.addEventListener("click", function () {
    if (window.scrollY > 120) window.scrollTo({ top: 0, behavior: "smooth" });
    else location.href = "/#golden";
  });
  window.addEventListener("scroll", function () {
    tt.hidden = window.scrollY < 60;
  }, { passive: true });

  /* ورود و ناوبری — بازگشت به همان نقطهٔ قبلی با Back */
  var backLink = document.querySelector(".pback");
  backLink.addEventListener("click", function (e) {
    if (history.length > 1 && document.referrer && document.referrer.indexOf(location.host) !== -1) {
      e.preventDefault();
      history.back();
    }
  });
  var nav = document.getElementById("nav");
  window.addEventListener("scroll", function () {
    nav.classList.toggle("is-scrolled", window.scrollY > 30);
    var bar = document.getElementById("scrollBar");
    if (bar) {
      var h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
    }
  }, { passive: true });

  if (typeof gsap !== "undefined") {
    gsap.fromTo(".phero__inner", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: .9, ease: "power3.out", delay: .1 });
  }
})();
