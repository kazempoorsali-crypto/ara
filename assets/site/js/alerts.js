/* ═══════════════════════════════════════════════════════════
   «خبرم کن»: هشدار فرصت‌های تازهٔ فیلتر فعلی در بله یا تلگرام
   منطق مشترک صفحهٔ اصلی و صفحهٔ «قیمت از دید آسمان»
   FM.alertGate(cur): سنجش ورود/اشتراک و سپس بازکردن برگهٔ هشدارها
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var E = FM.esc;
  function alertSheet(html) {
    if (FM.sheet) return FM.sheet(html);   // با دکمهٔ برگشت بسته می‌شود
    var d = document.createElement("div"); d.className = "psheet"; d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true" data-lenis-prevent>' + html + "</div>";
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-x]")) d.remove(); });
    document.body.appendChild(d); return d;
  }
  function alertLabel(a) {
    var cities = (a.city || "").split(",").filter(Boolean).map(function (id) { return (FM.cityById(id) || {}).name || id; });
    var prov = (FM.data.regions || []).filter(function (p) { return p.id === a.province; })[0];
    var where = cities.length ? cities.join("، ") : prov ? "استان " + prov.name : "";
    var deal = { sale: "خرید", rent: "رهن و اجاره", presale: "پیش‌فروش" }[a.deal] || "";
    return [where, a.district, deal, a.max_price ? "تا " + FM.money(a.max_price) : ""].filter(Boolean).join("  |  ");
  }
  FM.openAlerts = function (cur) {
    var d = alertSheet('<b class="psheet__t">🔔 خبرم کن</b><div class="psheet__wait">…</div>');
    var ch = null;   // کانال انتخابی؛ فقط کانال‌هایی که واقعاً کار می‌کنند نشان داده می‌شوند
    var NAMES = { bale: "بله", telegram: "تلگرام" }, ICONS = { bale: "💬", telegram: "✈️" };
    var last = { items: [] };
    var paint = function (r, msg) {
      last = r || last; r = last;
      var box = d.querySelector(".psheet__box");
      var tg = r.telegram || {};
      var info = {
        bale: { ok: !!r.ready, linked: !!r.linked, bot: r.bot, connect: r.connect },
        telegram: { ok: !!tg.ready, linked: !!tg.linked, bot: tg.bot, connect: tg.connect }
      };
      var chans = ["bale", "telegram"].filter(function (k) { return info[k].ok; });
      if (!chans.length) {
        box.innerHTML = '<b class="psheet__t">🔔 خبرم کن</b><p class="alrt__p">ارسال هشدار فعلاً در دسترس نیست؛ کمی بعد دوباره سر بزنید.</p><button type="button" class="psheet__x" data-x>بستن</button>';
        return;
      }
      if (!ch || chans.indexOf(ch) < 0) ch = chans.filter(function (k) { return info[k].linked; })[0] || chans[0];
      var c = info[ch], name = NAMES[ch];
      var bot = c.bot ? "@" + String(c.bot).replace(/^@/, "") : "ربات فرصت ملک";
      var can = cur.province || cur.city, where = can ? alertLabel(cur) : "";
      var items = r.items || [], n = items.length, me = FM.api.me || {};
      var dup = can && items.some(function (a) { return (a.city || "") === (cur.city || "") && (a.district || "") === (cur.district || "") && (a.channel || "bale") === ch; });
      // انتخاب پیام‌رسان فقط وقتی هر دو در دسترس است؛ ساده و کوچک
      var pick = chans.length > 1 ? '<div class="alrt__seg">' + chans.map(function (k) {
        return '<button type="button" class="' + (k === ch ? "is-on" : "") + '" data-ch="' + k + '">' + ICONS[k] + " " + NAMES[k] + (info[k].linked ? " ✓" : "") + "</button>";
      }).join("") + "</div>" : "";
      var body;
      if (!c.linked) {
        body = '<p class="alrt__lead">فقط یک بار ربات ' + name + ' را باز کنید و دکمهٔ «' + (ch === "telegram" ? "Start" : "شروع") + '» را بزنید.</p>' +
          (c.connect ? '<a class="btn btn--gold alrt__link alrt__go" href="' + E(c.connect) + '" target="_blank" rel="noopener" data-connect>' + ICONS[ch] + " باز کردن ربات " + name + "</a>" : "") +
          '<p class="alrt__p">بعد از آن به همین صفحه برگردید.</p>';
      } else if (!n) {
        body = can
          ? '<p class="alrt__lead">ربات ' + name + ' وصل است ✓<br>حالا این دکمه را بزنید:</p><button type="button" class="btn btn--gold alrt__go" data-add>🔔 خبرم کن برای ' + E(where) + "</button>" +
            '<p class="alrt__p">هر آگهی خوبِ تازه در این منطقه پیدا شود، در ' + name + " برایتان می‌فرستیم (حداکثر ۸ پیام در روز).</p>"
          : '<p class="alrt__lead alrt__blink">اول بالای صفحه شهر یا محلهٔ خودتان را انتخاب کنید، بعد دوباره «خبرم کن» را بزنید.</p>';
      } else {
        var chs = items.map(function (a) { return NAMES[a.channel === "telegram" ? "telegram" : "bale"]; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
        body = '<div class="alrt__banner is-ok">✅ هشدار شما روشن است<small>آگهی‌های خوبِ تازه را در ' + chs.join(" و ") + " برایتان می‌فرستیم.</small></div>" +
          '<ul class="alrt__list">' + items.map(function (a) {
            var k = a.channel === "telegram" ? "telegram" : "bale";
            return '<li><span><em class="alrt__tag">' + ICONS[k] + " " + NAMES[k] + "</em>" + E(alertLabel(a)) + '</span><button type="button" data-rm="' + a.id + '">حذف</button></li>';
          }).join("") + "</ul>" +
          (can && !dup ? '<button type="button" class="btn btn--ghost" data-add>+ هشدار برای ' + E(where) + "</button>" : "");
      }
      var trial = !me.active && me.alert_trial_left > 0 ? '<p class="alrt__trial">🎁 تا ' + FM.fa(me.alert_trial_left) + " روز دیگر رایگان</p>" : "";
      box.innerHTML = '<b class="psheet__t">🔔 خبرم کن</b>' + pick + body +
        (msg ? '<p class="alrt__ok">' + msg + "</p>" : "") + trial +
        '<button type="button" class="psheet__x" data-x>بستن</button>';
    };
    var reload = function (msg) { return FM.api.alerts().then(function (r) { paint(r, msg); }); };
    reload().catch(function (e) { d.querySelector(".psheet__wait").textContent = e.message || "خطا"; });
    // بعد از زدن «Start» در ربات و برگشتن به سایت، وضعیت اتصال خودکار تازه می‌شود
    var onVis = function () {
      if (!document.body.contains(d)) return document.removeEventListener("visibilitychange", onVis);
      if (document.visibilityState === "visible") reload().catch(function () {});
    };
    document.addEventListener("visibilitychange", onVis);
    d.addEventListener("click", function (e) {
      var add = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]"), c = e.target.closest("[data-ch]");
      if (c) { ch = c.dataset.ch; paint(); return; }
      if (add) {
        add.disabled = true;
        FM.api.alertAdd(Object.assign({}, cur, { channel: ch })).then(function (r) {
          paint(r, r.confirmed ? "هشدار ذخیره شد ✅ پیام تأیید هم در " + NAMES[ch] + " فرستاده شد." : "هشدار ذخیره شد ✅");
        }).catch(function (er) { reload(er.message).catch(function () { paint({ items: [] }, er.message); }); });
      }
      if (rm) FM.api.alertRemove(rm.dataset.rm).then(function (r) { paint(r, "حذف شد"); });
    });
  };
  /* درِ ورود: بدون حساب → ورود؛ بدون اشتراک فعال → اشتراک؛ otherwise → برگهٔ هشدارها */
  FM.alertGate = function (cur) {
    if (!FM.api || !FM.account) return;
    if (!FM.api.me) return FM.account.login(function () { FM.openAlerts(cur); });
    if (!FM.api.me.active && !(FM.api.me.alert_trial_left > 0)) { (FM.toast || alert)("دورهٔ رایگان «خبرم کن» تمام شده است؛ با اشتراک، فرصت‌های تازه را زودتر از همه در بله یا تلگرام ببینید."); return FM.account.subscribe(); }
    FM.openAlerts(cur);
  };
})();
