/* تم خودکار روز/شب بر پایهٔ طلوع و غروب واقعی خورشید در ایران (مختصات تهران، به وقت ایران)
   اگر کاربر خودش تم را عوض کند، انتخابش تا طلوع یا غروب بعدی می‌ماند و بعد دوباره خودکار می‌شود.
   این فایل در <head> همهٔ صفحه‌ها پیش از رسم صفحه اجرا می‌شود تا تم بدون پرش اعمال شود. */
(function () {
  "use strict";
  var LAT = 35.6892, LON = 51.389;   // تهران
  var rad = Math.PI / 180;

  // معادلهٔ طلوع و غروب (الگوریتم استاندارد بر پایهٔ روز ژولینی)؛ خروجی بر حسب میلی‌ثانیهٔ UTC
  function sun(ms) {
    var jd = ms / 86400000 + 2440587.5;
    var n = Math.round(jd - 2451545.0 + 0.0008);
    var js = n - LON / 360;
    var M = (357.5291 + 0.98560028 * js) % 360;
    var C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    var lam = (M + C + 180 + 102.9372) % 360;
    var jt = 2451545 + js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
    var dec = Math.asin(Math.sin(lam * rad) * Math.sin(23.4397 * rad));
    var cw = (Math.sin(-0.833 * rad) - Math.sin(LAT * rad) * Math.sin(dec)) / (Math.cos(LAT * rad) * Math.cos(dec));
    var w = Math.acos(Math.max(-1, Math.min(1, cw))) / rad;
    var toMs = function (j) { return (j - 2440587.5) * 86400000; };
    return { rise: toMs(jt - w / 360), set: toMs(jt + w / 360) };
  }

  function state(now) {
    now = now || Date.now();
    var s = sun(now);
    if (now < s.rise) return { day: false, next: s.rise };
    if (now < s.set) return { day: true, next: s.set };
    return { day: false, next: sun(now + 86400000).rise };
  }

  function manual() {
    try {
      var m = JSON.parse(localStorage.getItem("fmThemeManual") || "null");
      return m && (m.t === "light" || m.t === "dark") && m.until > Date.now() ? m.t : null;
    } catch (e) { return null; }
  }

  var api = {
    auto: function () { return state().day ? "light" : "dark"; },
    current: function () { return manual() || api.auto(); },
    // انتخاب دستی کاربر: تا طلوع یا غروب بعدی معتبر است
    choose: function (t) {
      try { localStorage.setItem("fmThemeManual", JSON.stringify({ t: t, until: state().next })); } catch (e) { /* حالت خصوصی */ }
    },
    _state: state,
  };
  window.FMTheme = api;

  var t = api.current(), root = document.documentElement;
  root.setAttribute("data-theme", t);
  try {   // هر دو بخش سایت (صفحه‌های تازه و موتور جست‌وجو) همین تم را بخوانند
    localStorage.setItem("fmTheme", t);
    localStorage.setItem("ara:theme_v2", JSON.stringify(t));
  } catch (e) { /* حالت خصوصی */ }

  // اگر صفحه هنگام طلوع یا غروب باز است، تم خودش عوض می‌شود (مگر کاربر دستی انتخاب کرده باشد)
  setInterval(function () {
    var want = api.current();
    if (root.getAttribute("data-theme") === want) return;
    if (window.FM && typeof window.FM.setTheme === "function") window.FM.setTheme(want, true);
    else root.setAttribute("data-theme", want);
  }, 5 * 60 * 1000);
})();

/* علامت مثبت/منفی کنار درصدها در متن راست‌به‌چپ سمت راست عدد می‌افتاد (مثلاً «۱۶٪−»).
   هر «+۱۶٪» یا «−۱۶٪» در صفحه چپ‌به‌راست جدا (LRI…PDI) می‌شود تا علامت سمت چپ بماند: «−۱۶٪». در همهٔ صفحه‌ها و محتوای تازه. */
(function () {
  "use strict";
  var RE = /(^|[^⁦\d۰-۹])([+\-−–]\s?[\d۰-۹][\d۰-۹٫.,]*\s?[٪%])/g;
  var TEST = /[+\-−–]\s?[\d۰-۹][\d۰-۹٫.,]*\s?[٪%]/;
  function fixNode(t) {
    var v = t.nodeValue;
    if (!v || !TEST.test(v)) return;
    var p = t.parentNode;
    if (!p || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(p.nodeName) || p.closest && p.closest("[dir=ltr], bdi, svg")) return;
    var nv = v.replace(RE, function (m, a, b) { return a + "⁦" + b.replace(/\s/g, "") + "⁩"; });
    if (nv !== v) t.nodeValue = nv;
  }
  function walk(root) {
    if (root.nodeType === 3) return fixNode(root);
    if (root.nodeType !== 1) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) fixNode(n);
  }
  function start() {
    walk(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === "characterData") fixNode(m.target);
        else m.addedNodes.forEach(walk);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

/* آمار بازدید برای پنل مدیریت (سرور خود سایت؛ بدون سرویس بیرونی و بدون کوکی ردیابی):
   بازدید فقط وقتی صفحه واقعاً دیده شد ثبت می‌شود (نه در پیش‌بارگذاری) و هنگام ترک صفحه مدت دیدن فرستاده می‌شود. */
(function () {
  "use strict";
  if (window.top !== window || /(^|[?&])embed=1/.test(location.search)) return;   // نقشهٔ جاسازی‌شده داخل صفحهٔ آسمان
  var sid = "";
  try { sid = sessionStorage.getItem("fmSid") || ""; if (!sid) { sid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4); sessionStorage.setItem("fmSid", sid); } } catch (e) {}
  var cur = null, shown = 0, acc = 0, firstRef = document.referrer;
  function post(data, beacon) {
    var body = JSON.stringify(data);
    try {
      if (beacon && navigator.sendBeacon) return navigator.sendBeacon("/api/t", new Blob([body], { type: "application/json" }));
      var tk = ""; try { tk = localStorage.getItem("fy:token") || ""; } catch (e) {}
      return fetch("/api/t", { method: "POST", headers: { "content-type": "application/json", "x-user-token": tk }, body: body, keepalive: true, credentials: "same-origin" })
        .then(function (r) { return r.json(); }).catch(function () { return {}; });
    } catch (e) { return null; }
  }
  // نشانی خوانا برای گزارش: صفحه‌های برنامهٔ قدیمی (#/ad/…، #/p/maghale/…) با همان نشانی اصلی‌شان
  function route() {
    var h = (location.hash || "").split("?")[0], m;
    if ((m = h.match(/^#\/ad\/(.+)/))) return "/ad/" + m[1];
    if ((m = h.match(/^#\/p\/(.+)/))) return "/" + m[1];
    if ((m = h.match(/^#\/(s|market|sky|support|saved|account|estimate|faq|method|invoice)\b/))) return "/" + (m[1] === "s" ? "search" : m[1]);
    return location.pathname;
  }
  function view() {
    var utm = (location.search.match(/[?&]utm_source=([^&#]+)/) || [])[1] || "";
    var rec = { id: 0 };
    cur = rec; acc = 0; shown = document.visibilityState === "visible" ? Date.now() : 0;
    var p = post({ e: "view", p: route(), r: firstRef, s: sid, u: decodeURIComponent(utm) });
    firstRef = location.href;   // صفحه‌های بعدی همین برگه «داخلی»اند
    if (p && p.then) p.then(function (j) { rec.id = j && j.id || 0; });
  }
  function end() {
    if (!cur) return;
    if (shown) { acc += Date.now() - shown; shown = 0; }
    if (cur.id && acc > 1500) post({ e: "end", id: cur.id, d: Math.round(acc / 1000) }, true);
  }
  function begin() {
    view();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") end(); else if (cur) shown = Date.now();
    });
    addEventListener("pagehide", end);
    addEventListener("pageshow", function (e) { if (e.persisted) view(); });   // برگشت از کش مرورگر هم یک بازدید است
    var last = route();
    addEventListener("hashchange", function () { var r = route(); if (r !== last) { last = r; end(); view(); } });
  }
  if (document.prerendering) document.addEventListener("prerenderingchange", begin, { once: true });
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin); else begin();
})();
