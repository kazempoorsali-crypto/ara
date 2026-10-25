/* لایهٔ ارتباط با سرور فرصت ملک (فقط دادهٔ واقعی؛ حالت نمونه ندارد).
   نشست کاربر با همان کلید «fy:token» نگه داشته می‌شود تا ورود در همهٔ صفحه‌ها مشترک باشد. */
window.FM = window.FM || {};
FM.api = (function () {
  "use strict";
  /* کوکی fy_t: سرور صفحه را از همان اول برای کاربر واردشده می‌سازد (مشترک قفل نمی‌بیند و صفحه نمی‌پرد) */
  FM.syncTokenCookie = function (v) {
    try { document.cookie = "fy_t=" + (v || "") + "; path=/; SameSite=Lax" + (v ? "; max-age=2592000" : "; max-age=0") + (location.protocol === "https:" ? "; Secure" : ""); } catch (e) {}
  };
  var me = null, config = null;
  var tok = {
    get: function () { try { return localStorage.getItem("fy:token") || ""; } catch (e) { return ""; } },
    set: function (v) { try { v ? localStorage.setItem("fy:token", v) : localStorage.removeItem("fy:token"); } catch (e) { /* حالت خصوصی */ } FM.syncTokenCookie(v); },
  };
  // حسابی که سرور در خود صفحه گذاشته (FM_BOOT.me): از لحظهٔ اول معلوم است مشترک هست یا نه
  (function () {
    var t = tok.get(), b = window.FM_BOOT && window.FM_BOOT.me;
    FM.syncTokenCookie(t);
    if (t && b) me = b;
  })();
  var H = function () { return { "content-type": "application/json", "x-user-token": tok.get() }; };
  var qs = function (o) { return Object.keys(o).filter(function (k) { return o[k] !== "" && o[k] != null; }).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&"); };
  function json(r) {
    return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "خطا در ارتباط با سرور"); return j; });
  }
  var get = function (path, q) { return fetch("/api/" + path + (q ? "?" + qs(q) : ""), { headers: H(), cache: "no-store" }).then(json); };
  var post = function (path, body) { return fetch("/api/" + path, { method: "POST", headers: H(), body: JSON.stringify(body || {}) }).then(json); };
  var sess = function (r) { tok.set(r.token); me = r.user; return Object.assign({}, r.user, { trial_started: r.trial_days || 0 }); };

  return {
    token: tok,
    get me() { return me; },
    get config() { return config; },
    init: function () {
      return get("config").then(function (c) {
        config = c;
        return tok.get() ? get("me").then(function (r) { me = r.user; if (!me) tok.set(""); }) : null;
      }).then(function () { return { config: config, me: me }; });
    },
    refreshMe: function () {
      if (!tok.get()) { me = null; return Promise.resolve(null); }
      return get("me").then(function (r) { me = r.user; if (!me) tok.set(""); return me; });
    },
    listing: function (id) { return get("listing/" + encodeURIComponent(id)); },
    search: function (f) { return get("listings", f); },
    districts: function (city, deal) { return get("districts", { city: city, deal: deal }); },
    requestOtp: function (phone, channel) { return post("auth/otp", { phone: phone, channel: channel || "sms" }); },
    verifyOtp: function (phone, code) { return post("auth/verify", { phone: phone, code: code }).then(sess); },
    register: function (d) { return post("auth/register", d).then(sess); },
    login: function (ident, password) { return post("auth/login", { ident: ident, password: password }).then(sess); },
    resetRequest: function (ident, channel) { return post("auth/reset/request", { ident: ident, channel: channel }); },
    resetCode: function (ident, code, password) { return post("auth/reset/code", { ident: ident, code: code, password: password }).then(sess); },
    resetToken: function (token, password) { return post("auth/reset/token", { token: token, password: password }).then(sess); },
    saveProfile: function (d) { return post("me/profile", d).then(function (r) { me = r.user; return r.user; }); },
    logout: function () { return post("auth/logout", {}).catch(function () {}).then(function () { tok.set(""); me = null; }); },
    startPayment: function (plan, method) { return post("pay/start", { plan: plan, method: method }); },
    payCheck: function (pid) { return get("pay/check", { pid: pid }); },
    invoice: function (pid) { return get("pay/invoice", { pid: pid }); },
    submitReceipt: function (pid, tracking, image) { return post("pay/receipt", { payment_id: pid, tracking: tracking, image: image }); },
    alerts: function () { return get("alerts"); },
    alertAdd: function (d) { return post("alerts", d); },
    alertRemove: function (id) { return post("alerts", { action: "remove", id: id }); },
    alertTest: function () { return post("alerts", { action: "test" }); },
  };
})();
