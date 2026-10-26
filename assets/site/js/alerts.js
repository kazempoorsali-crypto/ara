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
    var d = document.createElement("div"); d.className = "psheet"; d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true">' + html + "</div>";
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
      var can = cur.province || cur.city;
      var pick = chans.length > 1 ? '<div class="alrt__ch" role="radiogroup" aria-label="پیام کجا بیاید؟">' + chans.map(function (k) {
        return '<button type="button" class="alrt__c' + (k === ch ? " is-on" : "") + '" role="radio" aria-checked="' + (k === ch) + '" data-ch="' + k + '"><i>' + ICONS[k] + "</i><span><b>" + NAMES[k] + "</b><small>" + (info[k].linked ? "متصل است" : "وصل نشده") + "</small></span></button>";
      }).join("") + "</div>" : "";
      var status = c.linked
        ? '<div class="alrt__st is-ok">' + ICONS[ch] + " متصل به " + name + "<small>پیام‌ها در گفت‌وگو با " + E(bot) + " می‌آید</small></div>"
        : '<div class="alrt__st">' + ICONS[ch] + " هنوز به " + name + " وصل نیستید<small>یک بار ربات را باز کنید و «" + (ch === "telegram" ? "Start" : "شروع") + "» را بزنید؛ سپس به همین صفحه برگردید.</small></div>" +
          (c.connect ? '<a class="btn btn--gold alrt__link" href="' + E(c.connect) + '" target="_blank" rel="noopener" data-connect>اتصال به ' + name + "</a>" : "");
      box.innerHTML = '<b class="psheet__t">🔔 خبرم کن</b>' +
        '<p class="alrt__p">هر وقت آگهی تازه‌ای با امتیاز بالا (فرصت طلایی یا مناسب) در این فیلتر پیدا شود، همان لحظه خبرتان می‌کنیم؛ حداکثر ۸ پیام در روز.</p>' +
        pick + status +
        (msg ? '<p class="alrt__ok">' + msg + "</p>" : "") +
        (c.linked ? (can ? '<button type="button" class="btn btn--gold" data-add>افزودن هشدار برای: ' + E(alertLabel(cur)) + "</button>" : '<p class="alrt__p">اول در فیلتر بالا استان یا شهر را انتخاب کنید.</p>') : "") +
        (r.items && r.items.length ? '<b class="alrt__h">هشدارهای فعال شما</b><ul class="alrt__list">' + r.items.map(function (a) {
          var k = a.channel === "telegram" ? "telegram" : "bale";
          return '<li><span><em class="alrt__tag">' + ICONS[k] + " " + NAMES[k] + "</em>" + E(alertLabel(a)) + '</span><button type="button" data-rm="' + a.id + '">حذف</button></li>';
        }).join("") + "</ul>" : "") +
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
    if (!FM.api.me.active) { (FM.toast || alert)("«خبرم کن» برای مشترکان است؛ با اشتراک، فرصت‌های تازه را زودتر از همه در بله یا تلگرام ببینید."); return FM.account.subscribe(); }
    FM.openAlerts(cur);
  };
})();
