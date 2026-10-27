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
        return '<button type="button" class="alrt__c' + (k === ch ? " is-on" : "") + '" role="radio" aria-checked="' + (k === ch) + '" data-ch="' + k + '"><i>' + ICONS[k] + "</i><span><b>" + NAMES[k] + "</b><small>" + (info[k].linked ? "ربات وصل است" : "ربات وصل نشده") + "</small></span></button>";
      }).join("") + "</div>" : "";
      var status = c.linked
        ? '<div class="alrt__st is-ok">' + ICONS[ch] + " ربات " + name + " به حساب شما وصل است<small>پیام‌ها در گفت‌وگو با " + E(bot) + " می‌آید؛ این فقط راه رسیدن پیام است، خود هشدار را در مرحلهٔ ۳ ثبت کنید.</small></div>"
        : '<div class="alrt__st">' + ICONS[ch] + " ربات " + name + " هنوز وصل نیست<small>یک بار ربات را باز کنید و «" + (ch === "telegram" ? "Start" : "شروع") + "» را بزنید؛ سپس به همین صفحه برگردید.</small></div>" +
          (c.connect ? '<a class="btn btn--gold alrt__link" href="' + E(c.connect) + '" target="_blank" rel="noopener" data-connect>اتصال به ' + name + "</a>" : "");
      var n = (r.items || []).length, me = FM.api.me || {};
      var trial = !me.active && me.alert_trial_left > 0 ? '<p class="alrt__trial">🎁 «خبرم کن» برای شما تا ' + FM.fa(me.alert_trial_left) + " روز دیگر رایگان است؛ پس از آن با اشتراک ادامه پیدا می‌کند.</p>" : "";
      var banner = n
        ? '<div class="alrt__banner is-ok">✅ ' + FM.fa(n) + " هشدار فعال دارید؛ آگهی‌های تازهٔ مناسب همان لحظه برایتان فرستاده می‌شود.</div>"
        : '<div class="alrt__banner is-warn" role="status">⚠️ هنوز هیچ هشداری ثبت نکرده‌اید<small>وصل بودن بله یا تلگرام به‌تنهایی پیامی نمی‌فرستد؛ هر سه مرحلهٔ زیر را کامل کنید.</small></div>';
      var step1 = can
        ? '<div class="alrt__step is-done"><b>۱. محدوده</b><span>' + E(alertLabel(cur)) + "</span></div>"
        : '<div class="alrt__step is-todo"><b>۱. محدوده</b><span>اول در فیلتر بالای صفحه استان، شهر یا محله را انتخاب کنید، بعد دوباره «خبرم کن» را بزنید.</span></div>';
      var step3 = can && c.linked
        ? '<button type="button" class="btn btn--gold" data-add>۳. ثبت هشدار برای: ' + E(alertLabel(cur)) + "</button>"
        : '<div class="alrt__step is-wait"><b>۳. ثبت هشدار</b><span>' + (!can ? "بعد از انتخاب محدوده" : "بعد از اتصال ربات " + name) + " فعال می‌شود.</span></div>";
      box.innerHTML = '<b class="psheet__t">🔔 خبرم کن</b>' +
        banner + trial +
        '<p class="alrt__p">هر وقت آگهی تازه‌ای با امتیاز بالا (فرصت طلایی یا مناسب) در محدودهٔ شما پیدا شود، همان لحظه خبرتان می‌کنیم؛ حداکثر ۸ پیام در روز.</p>' +
        step1 +
        '<b class="alrt__h">۲. پیام کجا بیاید؟</b>' + pick + status +
        step3 +
        (msg ? '<p class="alrt__ok">' + msg + "</p>" : "") +
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
    if (!FM.api.me.active && !(FM.api.me.alert_trial_left > 0)) { (FM.toast || alert)("دورهٔ رایگان «خبرم کن» تمام شده است؛ با اشتراک، فرصت‌های تازه را زودتر از همه در بله یا تلگرام ببینید."); return FM.account.subscribe(); }
    FM.openAlerts(cur);
  };
})();
