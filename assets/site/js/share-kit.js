/* اشتراک‌گذاری مطمئن برای هر دو بخش سایت (صفحه‌های تازه و موتور جست‌وجو/صفحهٔ ملک):
   - پنجرهٔ «اشتراک پیوند»: کپی پیوند (با روش جایگزین وقتی Clipboard در دسترس نیست)، اشتراک خود گوشی، تلگرام، واتساپ
   - اگر FM (صفحه‌های تازه) نیست، ابزارهای لازم پوستر از روی UI موتور قدیمی ساخته می‌شوند */
(function () {
  "use strict";
  var FM = window.FM = window.FM || {};
  var U = window.UI || (typeof UI !== "undefined" ? UI : null);   // UI موتور قدیمی با const تعریف شده
  var DIG = "۰۱۲۳۴۵۶۷۸۹";
  if (!FM.fa) FM.fa = function (n) { return String(n).replace(/\d/g, function (d) { return DIG[d]; }); };
  if (!FM.esc) FM.esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  if (!FM.money) FM.money = function (v) { var m = U && U.money ? U.money(v) : null; return m ? m + " تومان" : ""; };
  if (!FM.propUrl) FM.propUrl = function (id) { return "/ad/" + encodeURIComponent(id); };
  /* وضعیت اشتراک از هر منبعی که در صفحه هست (صفحه‌های تازه، موتور قدیمی، نشانهٔ is-sub روی html) تا قفل‌ها در موبایل و دسکتاپ یکسان باشد */
  /* DataLayer موتور قدیمی با const تعریف شده و روی window نیست؛ با نامش خوانده می‌شود */
  function DL() { try { return typeof DataLayer !== "undefined" ? DataLayer : null; } catch (e) { return null; } }
  FM.isSub = function () {
    var dl = DL(), a = dl && dl.me, b = FM.api && FM.api.me;
    return !!((a && a.active) || (b && b.active) || document.documentElement.classList.contains("is-sub"));
  };
  /* اگر حساب هنوز از سرور نیامده، کمی صبر می‌کنیم تا پوستر با قفل اشتباه باز نشود */
  FM.meReady = function () {
    if (FM.isSub()) return Promise.resolve();
    var jobs = [];
    try { if (FM.api && FM.api.refreshMe && FM.api.token && FM.api.token.get && FM.api.token.get() && !FM.api.me) jobs.push(FM.api.refreshMe()); } catch (e) {}
    try { var dl = DL(); if (dl && dl.refreshMe && !dl.me) jobs.push(dl.refreshMe()); } catch (e) {}
    if (!jobs.length) return Promise.resolve();
    return Promise.race([Promise.all(jobs).catch(function () {}), new Promise(function (ok) { setTimeout(ok, 2500); })]);
  };
  function toast(m) {
    if (FM.toast) return FM.toast(m);
    if (U && U.toast) return U.toast(m);
    var t = document.createElement("div"); t.className = "fm-toast is-on"; t.textContent = m;
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1300;background:#13201c;color:#fff;padding:.6rem 1.1rem;border-radius:999px;font:inherit;font-size:.9rem";
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }

  /* کپی متن: Clipboard API و اگر نشد textarea + execCommand (مرورگرهای داخل برنامه‌ها) */
  FM.copyText = function (text) {
    function legacy() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0"; document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove(); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
  };

  /* دکمهٔ «برگشت» گوشی/مرورگر هر پنجرهٔ باز را می‌بندد (نه صفحهٔ زیر آن را):
     هر پنجره یک قدم در تاریخچه می‌گذارد؛ برگشت فقط بالاترین پنجره را می‌بندد و بستن با دکمه هم آن قدم را برمی‌دارد */
  var stack = [], ignore = 0, seq = 0, leaving = false;
  window.addEventListener("beforeunload", function () { leaving = true; });
  window.addEventListener("pagehide", function () { leaving = true; });
  function popOurs(ids) {   // اگر هنوز روی قدم همین پنجره‌ایم، برمی‌گردیم (اگر صفحه در حال رفتن یا نشانی عوض شده باشد، نه)
    setTimeout(function () {
      var cur = history.state && history.state.fmSheet;
      if (leaving || !cur || ids.indexOf(cur) < 0) return;
      ignore++; history.go(-(ids.indexOf(cur) + 1));
    }, 0);
  }
  FM.backable = function (el, close) {
    var it = { el: el, close: close, done: false, id: ++seq + "." + Date.now() };
    stack.push(it);
    try { history.pushState({ fmSheet: it.id }, "", location.href); } catch (e) { it.id = null; }
    return function dismiss() {
      if (it.done) return; it.done = true;
      var i = stack.indexOf(it); if (i >= 0) stack.splice(i, 1);
      close();
      if (it.id) popOurs([it.id]);
    };
  };
  FM.modalOpen = function () { return stack.length > 0; };
  /* بستن همهٔ پنجره‌های روی هم (مثلاً بعد از کپی موفق پیوند) */
  FM.closeSheets = function () {
    var ids = [];
    while (stack.length) { var it = stack.shift(); it.done = true; it.close(true); if (it.id) ids.push(it.id); }
    if (ids.length) popOurs(ids);
  };
  window.addEventListener("popstate", function (e) {
    if (ignore > 0) { ignore--; e.stopImmediatePropagation(); return; }
    var it = stack.pop();
    if (it) { it.done = true; it.close(); e.stopImmediatePropagation(); return; }
    // قدم باقی‌ماندهٔ پنجره‌ای که قبلاً بسته شده: بی‌اثر رد می‌شود تا یک «برگشت» هدر نرود
    if (e.state && e.state.fmSheet) { e.stopImmediatePropagation(); history.back(); }
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && stack.length && !document.querySelector("dialog[open]")) { e.preventDefault(); history.back(); }
  });

  /* پنجرهٔ پایین‌صفحه (psheet) با پشتیبانی برگشت؛ onClosed وقتی صدا زده می‌شود که پنجره بسته شد (برای نشان دادن دوبارهٔ منوی قبلی) */
  FM.sheet = function (html, onClosed) {
    var d = document.createElement("div"); d.className = "psheet"; d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(d);
    d.close = FM.backable(d, function (all) { d.remove(); if (onClosed && !all) onClosed(); });
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-x]")) d.close(); });
    return d;
  };
  /* زیرمنو: منوی فعلی پنهان می‌شود و با «برگشت» یا «بستن» زیرمنو دوباره دیده می‌شود */
  FM.subSheet = function (parent) {
    parent.style.display = "none";
    return function () { if (document.body.contains(parent)) parent.style.display = ""; };
  };
  var sheet = FM.sheet;
  var mobile = function () { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent); };
  /* تلگرام و واتساپ: در گوشی پیوند اشتراک خودشان؛ در دسکتاپ برنامهٔ نصب‌شده (tg:// و whatsapp://) چون نسخهٔ وب اغلب باز نمی‌شود؛
     پیوند نسخهٔ وب هم زیر گزینه‌ها می‌آید اگر برنامه نصب نبود */
  function appLinks(app, url, title) {
    var text = title + "\n" + url;
    return {
      web: app === "tg" ? "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title)
        : (mobile() ? "https://wa.me/?text=" : "https://web.whatsapp.com/send?text=") + encodeURIComponent(text),
      native: app === "tg" ? "tg://msg_url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title) : "whatsapp://send?text=" + encodeURIComponent(text),
    };
  }
  function openApp(d, app, url, title) {
    var L = appLinks(app, url, title), name = app === "tg" ? "تلگرام" : "واتساپ";
    if (mobile()) { location.href = L.web; return; }
    location.href = L.native;
    var hint = d.querySelector(".psheet__hint");
    if (!hint) { hint = document.createElement("p"); hint.className = "psheet__hint"; d.querySelector(".psheet__opts").after(hint); }
    hint.innerHTML = "اگر برنامهٔ " + name + " روی این رایانه باز نشد: <a href=\"" + FM.esc(L.web) + "\" target=\"_blank\" rel=\"noopener\">" + name + " وب</a> یا «کپی پیوند».";
  }
  FM.linkSheet = function (url, title, onClosed) {
    url = url || location.href; title = title || document.title;
    var d = sheet('<b class="psheet__t">اشتراک پیوند</b>' +
      '<div class="psheet__url" dir="ltr">' + FM.esc(url) + "</div>" +
      '<div class="psheet__opts">' +
      '<button type="button" class="psheet__opt" data-l="copy"><i>📋</i><span><b>کپی پیوند</b><small>برای چسباندن در هر جا</small></span></button>' +
      (navigator.share ? '<button type="button" class="psheet__opt" data-l="native"><i>📤</i><span><b>ارسال با برنامه‌های گوشی</b><small>بله، ایتا، تلگرام، پیامک و…</small></span></button>' : "") +
      '<button type="button" class="psheet__opt" data-l="tg"><i>✈️</i><span><b>تلگرام</b><small>ارسال در گفت‌وگو یا کانال</small></span></button>' +
      '<button type="button" class="psheet__opt" data-l="wa"><i>💬</i><span><b>واتساپ</b><small>ارسال در گفت‌وگو</small></span></button>' +
      '</div><button type="button" class="psheet__x" data-x>' + (onClosed ? "برگشت" : "بستن") + '</button>', onClosed);
    d.addEventListener("click", function (e) {
      var o = e.target.closest("[data-l]"); if (!o) return;
      if (o.dataset.l === "copy") {
        FM.copyText(url).then(function (ok) {
          if (ok) { toast("پیوند کپی شد ✓"); FM.closeSheets(); }
          else { var u = d.querySelector(".psheet__url"); var r = document.createRange(); r.selectNodeContents(u); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("پیوند را انتخاب کردیم؛ نگه دارید و «کپی» را بزنید"); }
        });
      } else if (o.dataset.l === "native") {
        navigator.share({ title: title, url: url }).then(function () { FM.closeSheets(); }).catch(function (err) {
          if (err && err.name === "AbortError") return;   // کاربر خودش بست
          FM.copyText(url).then(function (ok) { toast(ok ? "اشتراک گوشی در دسترس نبود؛ پیوند کپی شد ✓" : "اشتراک گوشی در دسترس نبود"); });
        });
      } else if (o.dataset.l === "tg" || o.dataset.l === "wa") {
        openApp(d, o.dataset.l, url, title);
      }
    });
  };
  /* همهٔ دکمه‌های «اشتراک این صفحه» حالا این پنجره را باز می‌کنند (به‌جای اتکا فقط به اشتراک گوشی که گاهی بی‌صدا شکست می‌خورد) */
  FM.share = function (url, title, onClosed) { FM.linkSheet(url, title, onClosed); };
})();
