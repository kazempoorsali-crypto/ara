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
