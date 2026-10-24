/* دادهٔ فرصت ملک — از سرور (window.FM_BOOT) و موتور ارزش‌گذاری؛ هیچ عدد ساختگی‌ای اینجا نیست.
   ساختار FM.data همان قرارداد صفحه‌هاست: regions / properties / levels / floors / stats */
window.FM = window.FM || {};
(function () {
  "use strict";
  var B = window.FM_BOOT || {};
  var fa = function (n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); };
  FM.fa = fa;
  /* کاربر واردشده با اشتراک فعال (دورهٔ رایگان هم حساب است) */
  FM.isSub = function () { return !!(FM.api && FM.api.me && FM.api.me.active); };
  /* صفحه با دکمهٔ برگشت (یا تازه‌سازی) باز شده؟ آن‌وقت موقعیت اسکرول و فیلترهای قبلی برمی‌گردند */
  FM.backNav = (function () {
    try {
      var n = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      var t = n ? n.type : (performance.navigation && performance.navigation.type === 2 ? "back_forward" : "");
      return t === "back_forward" || t === "reload";
    } catch (e) { return false; }
  })();
  /* متن آگهی‌ها از کاربران است؛ پیش از گذاشتن در HTML امن می‌شود */
  FM.esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  FM.faDec = function (n, dec) { return fa(Number(n).toFixed(dec === undefined ? 2 : dec)); };

  var KIND = { apartment: "آپارتمان", villa: "ویلا", land: "زمین", commercial: "تجاری", office: "اداری" };
  var DEAL = { sale: "فروش", rent: "رهن و اجاره", presale: "پیش‌فروش", daily: "اجارهٔ روزانه" };
  // برچسب‌های موتور ارزش‌گذاری ← وضعیت‌های رنگی سایت
  var STATUS = { gold: "gold", good: "ok", fair: "mid", high: "warm", over: "bad", sus: "bad", pending: "mid" };
  var LABEL = { gold: "فرصت طلایی", good: "فرصت مناسب", fair: "قیمت متعادل", high: "بالاتر از ارزش واقعی", over: "قیمت غیرمنطقی", sus: "قیمت مشکوک", pending: "در انتظار داده" };
  FM.KIND = KIND; FM.DEAL = DEAL; FM.LABEL = LABEL; FM.STATUS = STATUS;

  /* مبلغ تومان ← «۴٫۲ میلیارد تومان» */
  FM.money = function (t) {
    if (!t && t !== 0) return "";
    if (t >= 1e9) return fa((Math.round(t / 1e8) / 10).toString().replace(".", "٫")) + " میلیارد تومان";
    if (t >= 1e6) return fa(Math.round(t / 1e6).toLocaleString("en-US").replace(/,/g, "٬")) + " میلیون تومان";
    return fa(Math.round(t).toLocaleString("en-US").replace(/,/g, "٬")) + " تومان";
  };
  FM.mm = function (x) { return x == null ? "—" : fa(String(x).replace(".", "٫")); };
  FM.ppmText = function (ppm) { return ppm ? fa((Math.round(ppm / 1e5) / 10).toString().replace(".", "٫")) + " میلیون" : ""; };
  /* عکس آگهی از طریق پراکسی همین سرور (دیوار و شیپور) */
  FM.img = function (u) {
    if (!u) return "";
    return /^https:\/\/[^/]*(divarcdn\.com|divar\.ir|sheypoor\.com|sheypoor\.ir)\//i.test(u) ? "/img?u=" + encodeURIComponent(u) : u;
  };
  // جای عکسِ خالی هم‌رنگ تم: روشن در تم روشن، تیره در تم تیره
  Object.defineProperty(FM, "NOIMG", { configurable: true, get: function () {
    return document.documentElement.getAttribute("data-theme") === "light" ? "/assets/site/img/noimg-light.svg" : "/assets/site/img/noimg.svg";
  } });

  /* فاصله با برآورد بازار؛ برای غیرمشترکان بازهٔ ۵ درصدی */
  FM.gapText = function (v) {
    if (!v || v.delta == null) return "";
    var a = Math.abs(v.delta), pct = Math.round(a * 100);
    if (v.approx && a < 0.05) return "نزدیک برآورد بازار";
    var txt = v.approx ? fa(pct) + " تا " + fa(pct + 5) + "٪" : fa(pct) + "٪";
    return v.delta < -0.005 ? txt + " زیر برآورد بازار" : v.delta > 0.005 ? txt + " بالاتر از برآورد بازار" : "هم‌سطح برآورد بازار";
  };

  FM.mapListing = function (l) {
    var v = l.verdict || (l.label ? { label: l.label, delta: l.discount != null ? -l.discount : null, approx: l.locked } : null);
    var rawImgs = (l.images && l.images.length ? l.images : l.image ? [l.image] : []);
    var goodImgs = rawImgs.filter(function(u){ return u && u.indexOf("thumb") === -1 && u.indexOf("web_image") === -1; });
    if(!goodImgs.length && rawImgs.length) goodImgs = rawImgs;
    var imgs = goodImgs.filter(function(v, i, a){ return a.indexOf(v) === i; }).map(FM.img);
    var price = l.pp || l.price || 0;
    var label = (v && v.label) || l.label || "pending";
    
      var _s = {}, _c = [];
      imgs.forEach(function(u) {
          if(!u) return;
          var u_str = String(u).replace(/\/(thumbnail|thumb|small)\//g, "/web_image/");
          var base = u_str.split("?")[0].replace(/[_.-]\d+x\d+/g, "");
          if(!_s[base]) { _s[base] = true; _c.push(u_str); }
      });
      imgs = _c;
      return {
id: l.id,
      raw: l,
      title: l.title || ((KIND[l.kind] || "ملک") + (l.area ? " " + fa(l.area) + " متری" : "")),
      kind: KIND[l.kind] || "ملک",
      deal: DEAL[l.presale ? "presale" : l.deal] || "",
      loc: [l.district, l.city_name].filter(Boolean).join("، "),
      region: { province: l.province || "", city: l.city_key || "", district: l.district || "" },
      price: price / 1e6, area: l.area || 0, rooms: l.rooms || 0, year: l.year || 0, floor: l.floor || 0, floorsCount: 0,
      priceText: l.deal === "rent" && l.deposit != null ? "ودیعه " + FM.money(l.deposit) + (l.rent ? "، اجاره " + FM.money(l.rent) : "") : FM.money(price),
      diffText: FM.gapText(v),
      status: STATUS[label] || "mid",
      label: label,
      score: l.score != null ? Math.round(l.score) : null,
      tag: LABEL[label] || "",
      img: imgs[0] || FM.NOIMG,
      img2: imgs[1] || imgs[0] || FM.NOIMG,
      imgs: imgs,
      noimg: !imgs.length,
      desc: l.description || "",
      features: l.amenities || [],
      locked: !!l.locked,
      fairPrice: l.fair_price || (l.verdict && l.verdict.fair) || 0,
      fairPpm: l.fair_ppm || (l.verdict && l.verdict.fair_ppm) || 0,
      profit: l.estimated_profit || (l.verdict && l.verdict.estimated_profit) || (l.fair_price && price && l.fair_price > price ? l.fair_price - price : 0),
      why: l.why || null,
    };
  };
  /* «چرا ارزان‌تر است؟» روی کارت: عوامل کاهندهٔ قیمت همین خانه که در برآورد لحاظ شده‌اند، و نشان «استعلام لازم» */
  FM.whyLine = function (p) {
    var w = p && p.why; if (!w || p.label !== "gold" && p.label !== "good") return "";
    var parts = (w.neg || []).map(function (e) { return FM.esc(e[0]) + (e[1] != null ? " <bdi dir=\"ltr\">" + fa(Math.round(e[1] * 100)) + "٪</bdi>" : ""); });
    return '<span class="why" title="این عوامل در برآورد بازار لحاظ شده‌اند؛ فاصلهٔ باقی‌مانده با برآورد، فرصت است">' +
      (parts.length ? "<b>چرا ارزان‌تر؟</b> " + parts.join("، ") : "") +
      (w.warn ? '<i class="why__warn">⚠ پیش از اقدام استعلام کنید</i>' : "") + "</span>";
  };

  var th = B.thresholds || { opp: 0.15, gold: 0.22, over: 0.3 };
  var P = function (x) { return fa(Math.round(x * 100)) + "٪"; };
  FM.data = {
    stats: B.stats || {},
    thresholds: th,
    /* استان ← شهر ← محله؛ price = میانهٔ قیمت هر متر به میلیون تومان (از جدول بازار) */
    regions: (B.regions || []).map(function (p) {
      return { id: p.id, name: p.name, cities: (p.cities || []).map(function (c) {
        return { id: c.id, name: c.name, n: c.n, lat: c.lat, lon: c.lng, lng: c.lng, districts: (c.districts || []).map(function (d) {
          return { id: d.id, name: d.name, n: d.n, price: Math.round(d.ppm / 1e5) / 10, ppm: d.ppm, p25: d.p25, p75: d.p75 };
        }).sort(function(a, b){ return (a.name || "").localeCompare(b.name || "", "fa"); }) };
      }).sort(function(a, b){ return (a.name || "").localeCompare(b.name || "", "fa"); }) };
    }).sort(function(a, b){ return (a.name || "").localeCompare(b.name || "", "fa"); }),
    properties: (B.properties || []).map(FM.mapListing),
    property: B.property ? FM.mapListing(B.property) : null,
    market: B.market || null,
    /* پنج سطح، با آستانه‌های واقعی موتور ارزش‌گذاری */
    levels: [
      { id: "gold", name: "فرصت طلایی", rule: P(th.gold) + " و بیشتر زیر برآورد بازار", color: "#D5A626" },
      { id: "ok", name: "فرصت مناسب", rule: P(th.opp) + " تا " + P(th.gold) + " زیر برآورد", color: "#20976A" },
      { id: "mid", name: "قیمت متعادل", rule: "کمتر از " + P(th.opp) + " فاصله با برآورد", color: "#E59B32" },
      { id: "warm", name: "بالاتر از ارزش", rule: P(th.opp) + " تا " + P(th.over) + " بالاتر", color: "#CE7439" },
      { id: "bad", name: "غیرمنطقی", rule: P(th.over) + " و بیشتر بالاتر", color: "#CF4751" },
    ],
    /* «هر طبقه، یک داستان» — راهنمای کیفی؛ بدون ضریب عددی ساختگی */
    floors: [
      { id: "first", num: "۱", name: "طبقه اول", st: 0, summary: "دسترسی بی‌واسطه به لابی و خیابان؛ معمولاً پایین‌ترین قیمت هر متر در ساختمان.",
        pros: ["معمولاً ارزان‌ترین متر مربع مسکونی", "بدون انتظار آسانسور", "مناسب سالمند و معلول", "خروج سریع در اضطرار"],
        cons: ["نور روز کمتر", "دید عابران و نیاز به پوشش پنجره", "سروصدای لابی و خیابان", "نیاز بیشتر به حفاظ"] },
      { id: "second", num: "۲", name: "طبقه دوم", st: 1, summary: "تعادل نور و دسترسی؛ بیرون از سایهٔ سطح خیابان.",
        pros: ["نور بهتر از طبقه اول", "بدون آسانسور هم قابل استفاده", "حس امنیت بیشتر"],
        cons: ["دید محدود به حیاط یا خیابان", "در ساختمان بی‌آسانسور، سقف قیمت دارد"] },
      { id: "middle", num: "میانی", name: "طبقات میانی", st: 2, summary: "مرجع مقایسهٔ بازار؛ بیشترین تقاضا برای سکونت و اجاره.",
        pros: ["نور کامل و تهویهٔ خوب", "دور از سروصدای خیابان", "نقدشوندگی بالا"],
        cons: ["وابستگی به آسانسور", "انتظار آسانسور در ساعت شلوغی"] },
      { id: "secondLast", num: "یکی مانده", name: "یکی‌مانده به آخر", st: 3, summary: "مزیت بلندی بدون هزینه‌های طبقهٔ آخر.",
        pros: ["نمای باز و سکوت بیشتر", "بدون مشکلات بام", "معمولاً ارزان‌تر از طبقهٔ آخر با چشم‌انداز مشابه"],
        cons: ["حساسیت به وضعیت آسانسور", "جابه‌جایی اثاثیهٔ سنگین پرهزینه"] },
      { id: "last", num: "آخر", name: "طبقه آخر / پنت‌هاوس", st: 4, summary: "چشم‌انداز و نور بیشتر؛ کیفیت بام و عایق تعیین‌کننده است.",
        pros: ["چشم‌انداز و نور بیشتر", "امکان تراس یا بام اختصاصی", "کمترین مزاحمت همسایهٔ بالایی"],
        cons: ["گرمای تابستان و سرمای زمستان بیشتر", "ریسک نشتی بام در سازهٔ ضعیف", "هزینهٔ نگهداری بیشتر"] },
    ],
  };

  FM.cityIds = function (r) { return String((r || FM.region || {}).city || "").split(",").filter(Boolean); };
  FM.cityById = function (id) {
    var hit = null;
    (FM.data.regions || []).forEach(function (p) { p.cities.forEach(function (c) { if (c.id === id) hit = Object.assign({ province: p.id, provinceName: p.name }, c); }); });
    return hit;
  };
  FM.regionLabel = function (r) {
    r = r || FM.region || {};
    var ids = FM.cityIds(r);
    if (ids.length > 1) return ids.map(function (id) { var c = FM.cityById(id); return c ? c.name : id; }).join("، ");
    if (ids.length === 1 && !r.province) { var c1 = FM.cityById(ids[0]); r = Object.assign({}, r, { province: c1 ? c1.province : "" }); }
    var parts = [];
    (FM.data.regions || []).forEach(function (p) {
      if (p.id !== r.province) return;
      p.cities.forEach(function (c) {
        if (c.id !== r.city) return;
        c.districts.forEach(function (d) { if (d.id === r.district) parts.unshift(d.name); });
        parts.unshift(c.name);
      });
      parts.unshift(p.name);
    });
    return parts.join("، ");
  };
  /* میانهٔ قیمت هر متر منطقه (میلیون تومان)، وزن‌دار با تعداد آگهی؛ null یعنی داده نداریم */
  FM.districtPrice = function (r) {
    r = r || FM.region || {};
    var list = [];
    (FM.data.regions || []).forEach(function (p) {
      var ids = FM.cityIds(r);
      if (r.province && !ids.length && p.id !== r.province) return;
      p.cities.forEach(function (c) {
        if (ids.length && ids.indexOf(c.id) < 0) return;
        c.districts.forEach(function (d) { if (!r.district || d.id === r.district) list.push(d); });
      });
    });
    if (!list.length) return null;
    var w = list.reduce(function (s, d) { return s + d.n; }, 0) || 1;
    return Math.round(list.reduce(function (s, d) { return s + d.price * d.n; }, 0) / w * 10) / 10;
  };
  FM.basePrice = FM.districtPrice;
  FM.propertyById = function (id) {
    if (FM.data.property && FM.data.property.id === id) return FM.data.property;
    return (FM.data.properties || []).filter(function (p) { return p.id === id; })[0] || null;
  };
  FM.propUrl = function (id) { return "/ad/" + encodeURIComponent(id); };

  /* پر کردن عددهای صفحه از دادهٔ واقعی (اسکریپت‌ها در پایان body اجرا می‌شوند) */
  var st = FM.data.stats || {};
  document.querySelectorAll("[data-stat]").forEach(function (el) { el.dataset.count = st[el.dataset.stat] || 0; });
  var TXT = { cities: function (n) { return fa(n) + " شهر دارای آگهی"; }, districts: function (n) { return fa(n) + " محله با برآورد قیمت"; } };
  document.querySelectorAll("[data-stat-text]").forEach(function (el) {
    var k = el.dataset.statText, n = st[k];
    if (n && TXT[k]) el.textContent = TXT[k](n); else { el.hidden = true; if (el.nextElementSibling && el.nextElementSibling.tagName === "I") el.nextElementSibling.hidden = true; }
  });
  var lv = document.querySelector("[data-levels]");
  if (lv) lv.innerHTML = FM.data.levels.map(function (l) {
    return '<article class="level" style="--st:' + l.color + '" data-reveal><i class="level__dot"></i><b>' + l.name + "</b><em>" + l.rule + '</em><span class="level__bar"></span></article>';
  }).join("");
})();

/* فیلتر انتخاب‌شده (مقدار غیرخالی) نشان «is-set» می‌گیرد تا در تم تاریک سبز فسفری شود */
(function () {
  function mark() {
    document.querySelectorAll(".searchbar__field select").forEach(function (s) {
      if (s.hidden) return;   // کادر چندشهری خودش وضعیتش را نشان می‌دهد
      var f = s.closest(".searchbar__field"); if (f) f.classList.toggle("is-set", !!s.value);
    });
  }
  ["change", "click"].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(mark, 0); }); });
  document.addEventListener("DOMContentLoaded", mark);
})();

/* برچسب حکم، اشتراک‌گذاری و علاقه‌مندی‌ها (مشترک همهٔ صفحه‌ها؛ فهرست علاقه‌مندی با سایت جست‌وجو یکی است) */
(function () {
  var LB = { gold: "فرصت طلایی", good: "فرصت مناسب", fair: "قیمت متعادل", high: "بالاتر از ارزش", over: "قیمت غیرمنطقی" };
  FM.badge = function (p, cls) {
    var t = LB[p.label]; if (!t) return "";
    return '<span class="lbadge lbadge--' + p.label + (cls ? " " + cls : "") + '">' + (p.label === "gold" ? "✦ " : "") + t + "</span>";
  };
  var KEY = "ara:favs";
  FM.favs = {
    all: function () { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } },
    has: function (id) { return FM.favs.all().indexOf(id) >= 0; },
    toggle: function (id) {
      var a = FM.favs.all(), i = a.indexOf(id);
      if (i >= 0) a.splice(i, 1); else a.unshift(id);
      try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 500))); } catch (e) { /* حالت خصوصی */ }
      return i < 0;
    },
  };
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
  var SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8 15.7 6.3M8.3 13.2l7.4 4.5"/></svg>';
  FM._cards = {};
  FM.cardActs = function (p) {
    var on = FM.favs.has(p.id);
    FM._cards[p.id] = p;   // برای پنجرهٔ اشتراک (پیوند یا پوستر)
    return '<span class="cacts"><button type="button" class="cact cact--fav' + (on ? " is-on" : "") + '" data-fav="' + FM.esc(p.id) + '" aria-pressed="' + on + '" aria-label="افزودن به علاقه‌مندی‌ها" title="علاقه‌مندی">' + HEART + "</button>" +
      '<button type="button" class="cact" data-share="' + FM.esc(location.origin + FM.propUrl(p.id)) + '" data-share-title="' + FM.esc(p.title) + '" data-pid="' + FM.esc(p.id) + '" aria-label="اشتراک‌گذاری" title="کپی نشانی">' + SHARE + "</button></span>" +
      '<span class="seen-tag" data-seen="' + FM.esc(p.id) + '"' + (FM.seen.has(p.id) ? "" : " hidden") + ">دیده‌ای</span>";
  };
  /* «دیده‌ای»: هر ملکی که صفحه‌اش باز شده در حافظهٔ همین مرورگر می‌ماند (همان کلید موتور جست‌وجو، ۴۰۰ مورد آخر)
     و روزهای بعد هم روی کارتش برچسب «دیده‌ای» می‌خورد */
  var SEEN = "ara:seen";
  FM.seen = {
    all: function () { try { return JSON.parse(localStorage.getItem(SEEN) || "[]"); } catch (e) { return []; } },
    has: function (id) { return FM.seen.all().indexOf(id) >= 0; },
    add: function (id) {
      var a = FM.seen.all(); if (a.indexOf(id) >= 0) return;
      a.unshift(id);
      try { localStorage.setItem(SEEN, JSON.stringify(a.slice(0, 400))); } catch (e) { /* حالت خصوصی */ }
    },
  };
  FM.paintSeen = function () {
    var a = FM.seen.all();
    document.querySelectorAll("[data-seen]").forEach(function (t) { t.hidden = a.indexOf(t.getAttribute("data-seen")) < 0; });
  };
  /* با کلیک روی کارت همان لحظه «دیده‌ای» ثبت می‌شود؛ برگشت با دکمهٔ Back (حتی از حافظهٔ مرورگر) هم برچسب را نشان می‌دهد */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href*="/ad/"]');
    if (!a || e.target.closest("[data-fav],[data-share]")) return;
    var m = a.getAttribute("href").match(/\/ad\/([^/?#]+)/);
    if (m) FM.seen.add(decodeURIComponent(m[1]));
  }, true);
  addEventListener("pageshow", function () { FM.paintSeen(); });
  addEventListener("storage", function (e) { if (e.key === SEEN) FM.paintSeen(); });
  function toast(m) {
    if (FM.toast) return FM.toast(m);
    var t = document.createElement("div"); t.className = "fm-toast is-on"; t.textContent = m; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  FM.share = function (url, title) {
    url = url || location.href;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { navigator.share({ title: title || document.title, url: url }).catch(function () {}); return; }
    var done = function () { toast("نشانی صفحه کپی شد"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("نشانی را کپی کنید:", url); });
    else prompt("نشانی را کپی کنید:", url);
  };
  function paintFavs() {
    var a = FM.favs.all();
    document.querySelectorAll("[data-fav]").forEach(function (b) { var on = a.indexOf(b.dataset.fav) >= 0; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
    document.querySelectorAll("[data-fav-count]").forEach(function (c) { c.textContent = a.length ? FM.fa(a.length) : ""; c.hidden = !a.length; });
  }
  FM.paintFavs = paintFavs;
  document.addEventListener("click", function (e) {
    var f = e.target.closest("[data-fav]"), s = e.target.closest("[data-share]");
    if (!f && !s) return;
    e.preventDefault(); e.stopPropagation();
    if (s) {
      var cp = s.dataset.pid && FM._cards[s.dataset.pid];
      if (cp && FM.shareSheet) return FM.shareSheet(cp, s.dataset.share);
      return FM.share(s.dataset.share || location.href, s.dataset.shareTitle);
    }
    var id = f.dataset.fav;
    var go = function () { var on = FM.favs.toggle(id); paintFavs(); toast(on ? "به علاقه‌مندی‌ها اضافه شد" : "از علاقه‌مندی‌ها حذف شد"); };
    // علاقه‌مندی برای اعضاست: مهمان اول وارد می‌شود و بعد همان ملک ذخیره می‌شود
    if (FM.api && !FM.api.me && FM.account) { toast("برای ذخیره در علاقه‌مندی‌ها وارد شوید"); FM.account.login(go); return; }
    go();
  }, true);
  /* دکمه‌های سربرگ: اشتراک‌گذاری صفحه و علاقه‌مندی‌ها */
  document.addEventListener("DOMContentLoaded", function () {
    var act = document.querySelector(".nav__act");
    if (act && !document.getElementById("navShare")) {
      var theme = document.getElementById("themeBtn");
      var wrap = document.createElement("span"); wrap.className = "nav__extra";
      wrap.innerHTML = '<a class="nav__iconbtn nav__fav" id="navFav" href="/app.html#/saved" aria-label="علاقه‌مندی‌ها" title="علاقه‌مندی‌ها">' + HEART + '<b data-fav-count hidden></b></a>' +
        '<button class="nav__iconbtn" id="navShare" type="button" data-share aria-label="اشتراک‌گذاری این صفحه" title="کپی نشانی این صفحه">' + SHARE + "</button>";
      act.insertBefore(wrap, theme || act.firstChild);
    }
    paintFavs();
  });
  window.addEventListener("storage", function (e) { if (e.key === KEY) paintFavs(); });
})();
/* پیوندهای منو: خرید اشتراک و ورود، پنجرهٔ همان کار را باز می‌کنند */
document.addEventListener("click", function (e) {
  var a = e.target.closest("[data-fm-sub],[data-fm-login]");
  if (!a || !window.FM || !FM.account) return;
  e.preventDefault();
  var mb = document.getElementById("menuClose"); if (mb && document.body.classList.contains("menu-open")) mb.click();
  if (a.hasAttribute("data-fm-sub")) {
    if (FM.api && FM.api.me) FM.account.subscribe(); else FM.account.login(function () { FM.account.subscribe(); });
  } else if (FM.api && FM.api.me) location.href = "/account.html";
  else FM.account.login();
});

/* انتخاب چند شهر (از هر استانی): ترتیب انتخاب، اولویت نمایش نتیجه‌هاست */
FM.cityPicker = function (sel, onChange) {
  if (!sel) return null;
  var picked = [], prov = "";
  var orig = sel.closest(".searchbar__field") || sel.parentNode;
  // کادر جدا (نه درون <label>): بعضی مرورگرهای اندروید دکمه داخل برچسب را درست نشان نمی‌دادند
  var field = document.createElement("div");
  field.className = "searchbar__field cpick-field";
  field.innerHTML = "<span>شهر</span>";
  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "cpick__btn"; btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
  field.appendChild(btn);
  var panel = document.createElement("div");
  panel.className = "cpick fmx"; panel.hidden = true;
  field.appendChild(panel);
  orig.parentNode.insertBefore(field, orig.nextSibling);
  orig.style.display = "none";
  function name(id) { var c = FM.cityById(id); return c ? c.name : id; }
  function paintBtn() {
    btn.innerHTML = picked.length ? picked.map(name).join("، ") + (picked.length > 1 ? ' <small>' + FM.fa(picked.length) + " شهر</small>" : "") : "همهٔ شهرها";
    field.classList.toggle("is-set", !!picked.length);
  }
  function render() {
    var q = (panel.querySelector(".cpick__q") || {}).value || "";
    var regs = (FM.data.regions || []).slice().sort(function (a, b) { return (b.id === prov) - (a.id === prov); });
    panel.innerHTML = '<input class="cpick__q" placeholder="نام شهر را بنویسید…" value="' + FM.esc(q) + '">' +
      '<p class="cpick__hint">چند شهر را با هم انتخاب کنید؛ نتیجه به ترتیب انتخاب شما نمایش داده می‌شود.</p><div class="cpick__list">' +
      regs.map(function (p) {
        var cs = p.cities.filter(function (c) { return !q || c.name.indexOf(q) >= 0; });
        if (!cs.length) return "";
        return '<div class="cpick__g"><b>' + FM.esc(p.name) + "</b><div>" + cs.map(function (c) {
          var i = picked.indexOf(c.id);
          return '<button type="button" data-c="' + FM.esc(c.id) + '" class="' + (i >= 0 ? "is-on" : "") + '">' + (i >= 0 ? "<i>" + FM.fa(i + 1) + "</i>" : "") + FM.esc(c.name) + " <small>" + FM.fa(c.n || 0) + "</small></button>";
        }).join("") + "</div></div>";
      }).join("") + '</div><div class="cpick__foot"><button type="button" class="cpick__clear">پاک کردن شهرها</button><button type="button" class="cpick__ok">تأیید</button></div>';
    var inp = panel.querySelector(".cpick__q");
    inp.addEventListener("input", function () { var pos = inp.selectionStart; render(); var n = panel.querySelector(".cpick__q"); n.focus(); n.setSelectionRange(pos, pos); });
  }
  function open(on) {
    panel.hidden = !on; btn.setAttribute("aria-expanded", on); field.classList.toggle("is-open", on);
    document.body.classList.toggle("cpick-open", on);   // دکمهٔ دستیار و «بالا» روی دکمهٔ تأیید نیفتند
    if (on) {
      render(); setTimeout(function () { var i = panel.querySelector(".cpick__q"); if (i && matchMedia("(pointer: fine)").matches) i.focus(); }, 30);
      /* گوشی: کادر شهر بالای صفحه بیاید تا کل پنجره و دکمهٔ تأیید دیده شود */
      if (matchMedia("(max-width: 860px)").matches) {
        var top = field.getBoundingClientRect().top + scrollY - 76;
        if (Math.abs(top - scrollY) > 20) window.scrollTo({ top: top, behavior: "smooth" });
      }
    }
  }
  btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); open(panel.hidden); });
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
    var c = e.target.closest("[data-c]");
    if (c) {
      var i = picked.indexOf(c.dataset.c);
      if (i >= 0) picked.splice(i, 1); else if (picked.length < 8) picked.push(c.dataset.c);
      render(); paintBtn(); onChange(picked.slice()); return;
    }
    if (e.target.closest(".cpick__clear")) { picked = []; render(); paintBtn(); onChange([]); return; }
    if (e.target.closest(".cpick__ok")) open(false);
  });
  document.addEventListener("click", function (e) { if (!panel.hidden && !field.contains(e.target)) open(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) open(false); });
  paintBtn();
  return {
    set: function (ids) { picked = (ids || []).slice(); paintBtn(); if (!panel.hidden) render(); },
    province: function (p) { prov = p || ""; if (!panel.hidden) render(); },
    get: function () { return picked.slice(); },
    field: field,
    /* بعضی مرورگرهای گوشی گاهی کادر را نمی‌کشند (تا اسکرول یا تازه‌سازی)؛ با این، کادر دوباره نقاشی و دیده می‌شود */
    repaint: function () {
      if (orig.style.display !== "none") orig.style.display = "none";
      field.style.display = ""; field.style.visibility = "visible"; field.style.opacity = "1";
      paintBtn();
      field.style.transform = "translateZ(0)";
      requestAnimationFrame(function () { field.style.transform = ""; });
    },
  };
};

/* گوشی: اول فیلترها (ساده و پیشرفته)، بعد ویترین و بقیهٔ صفحه */
(function () {
  if (!matchMedia("(max-width: 860px)").matches) return;
  /* homefilter is already #1 in DOM order */
})();
