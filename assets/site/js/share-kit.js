/* اشتراک‌گذاری مطمئن برای هر دو بخش سایت (صفحه‌های تازه و موتور جست‌وجو/صفحهٔ ملک):
   - پنجرهٔ «اشتراک پیوند»: کپی پیوند (با روش جایگزین وقتی Clipboard در دسترس نیست)، اشتراک خود گوشی، تلگرام، واتساپ
   - اگر FM (صفحه‌های تازه) نیست، ابزارهای لازم پوستر از روی UI موتور قدیمی ساخته می‌شوند */
(function () {
  "use strict";
  var FM = window.FM = window.FM || {};
  var U = window.UI || null;
  var DIG = "۰۱۲۳۴۵۶۷۸۹";
  if (!FM.fa) FM.fa = function (n) { return String(n).replace(/\d/g, function (d) { return DIG[d]; }); };
  if (!FM.esc) FM.esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  if (!FM.money) FM.money = function (v) { var m = U && U.money ? U.money(v) : null; return m ? m + " تومان" : ""; };
  if (!FM.propUrl) FM.propUrl = function (id) { return "/ad/" + encodeURIComponent(id); };
  if (!FM.isSub) FM.isSub = function () { var me = (window.DataLayer && window.DataLayer.me) || (FM.api && FM.api.me); return !!(me && me.active); };
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

  function sheet(html) {
    var d = document.createElement("div"); d.className = "psheet"; d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true">' + html + "</div>";
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-x]")) d.remove(); });
    document.body.appendChild(d); return d;
  }

  FM.linkSheet = function (url, title) {
    url = url || location.href; title = title || document.title;
    var enc = encodeURIComponent(url), txt = encodeURIComponent(title + "\n" + url);
    var d = sheet('<b class="psheet__t">اشتراک پیوند</b>' +
      '<div class="psheet__url" dir="ltr">' + FM.esc(url) + "</div>" +
      '<div class="psheet__opts">' +
      '<button type="button" class="psheet__opt" data-l="copy"><i>📋</i><span><b>کپی پیوند</b><small>برای چسباندن در هر جا</small></span></button>' +
      (navigator.share ? '<button type="button" class="psheet__opt" data-l="native"><i>📤</i><span><b>ارسال با برنامه‌های گوشی</b><small>بله، ایتا، تلگرام، پیامک و…</small></span></button>' : "") +
      '<a class="psheet__opt" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + enc + "&text=" + encodeURIComponent(title) + '"><i>✈️</i><span><b>تلگرام</b><small>ارسال در گفت‌وگو یا کانال</small></span></a>' +
      '<a class="psheet__opt" target="_blank" rel="noopener" href="https://wa.me/?text=' + txt + '"><i>💬</i><span><b>واتساپ</b><small>ارسال در گفت‌وگو</small></span></a>' +
      '</div><button type="button" class="psheet__x" data-x>بستن</button>');
    d.addEventListener("click", function (e) {
      var o = e.target.closest("[data-l]"); if (!o) return;
      if (o.dataset.l === "copy") {
        FM.copyText(url).then(function (ok) {
          if (ok) { toast("پیوند کپی شد ✓"); d.remove(); }
          else { var u = d.querySelector(".psheet__url"); var r = document.createRange(); r.selectNodeContents(u); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("پیوند را انتخاب کردیم؛ نگه دارید و «کپی» را بزنید"); }
        });
      } else if (o.dataset.l === "native") {
        navigator.share({ title: title, url: url }).then(function () { d.remove(); }).catch(function (err) {
          if (err && err.name === "AbortError") return;   // کاربر خودش بست
          FM.copyText(url).then(function (ok) { toast(ok ? "اشتراک گوشی در دسترس نبود؛ پیوند کپی شد ✓" : "اشتراک گوشی در دسترس نبود"); });
        });
      }
    });
  };
  /* همهٔ دکمه‌های «اشتراک این صفحه» حالا این پنجره را باز می‌کنند (به‌جای اتکا فقط به اشتراک گوشی که گاهی بی‌صدا شکست می‌خورد) */
  FM.share = function (url, title) { FM.linkSheet(url, title); };
})();
