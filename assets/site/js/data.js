/* دادهٔ فرصت ملک — از سرور (window.FM_BOOT) و موتور ارزش‌گذاری؛ هیچ عدد ساختگی‌ای اینجا نیست.
   ساختار FM.data همان قرارداد صفحه‌هاست: regions / properties / levels / floors / stats */
window.FM = window.FM || {};
(function () {
  "use strict";
  var B = window.FM_BOOT || {};
  var fa = function (n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); };
  FM.fa = fa;
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
  FM.NOIMG = "/assets/site/img/noimg.svg";

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
    var imgs = (l.images && l.images.length ? l.images : l.image ? [l.image] : []).map(FM.img);
    var price = l.pp || l.price || 0;
    var label = (v && v.label) || l.label || "pending";
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
    };
  };

  var th = B.thresholds || { opp: 0.15, gold: 0.22, over: 0.3 };
  var P = function (x) { return fa(Math.round(x * 100)) + "٪"; };
  FM.data = {
    stats: B.stats || {},
    thresholds: th,
    /* استان ← شهر ← محله؛ price = میانهٔ قیمت هر متر به میلیون تومان (از جدول بازار) */
    regions: (B.regions || []).map(function (p) {
      return { id: p.id, name: p.name, cities: p.cities.map(function (c) {
        return { id: c.id, name: c.name, n: c.n, lat: c.lat, lon: c.lng, lng: c.lng, districts: c.districts.map(function (d) {
          return { id: d.id, name: d.name, n: d.n, price: Math.round(d.ppm / 1e5) / 10, ppm: d.ppm, p25: d.p25, p75: d.p75 };
        }) };
      }) };
    }),
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

  FM.regionLabel = function (r) {
    r = r || FM.region || {};
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
      if (r.province && p.id !== r.province) return;
      p.cities.forEach(function (c) {
        if (r.city && c.id !== r.city) return;
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
      var f = s.closest(".searchbar__field"); if (f) f.classList.toggle("is-set", !!s.value);
    });
  }
  ["change", "click"].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(mark, 0); }); });
  document.addEventListener("DOMContentLoaded", mark);
})();
