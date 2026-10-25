/* ═══════════════════════════════════════════════════════════
   «خبرم کن»: هشدار فرصت‌های تازهٔ فیلتر فعلی در پیام‌رسان بله
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
    var ch = "bale";   // کانال انتخابی: بله (پیش‌فرض) یا تلگرام (اگر در پنل فعال باشد)
    var last = { items: [] };
    var paint = function (r, msg) {
      last = r || last;
      var box = d.querySelector(".psheet__box");
      var tg = r.telegram || {};
      if (ch === "telegram" && !tg.ready) ch = "bale";
      var can = cur.province || cur.city;
      var at = function (b, def) { return b ? "@" + String(b).replace(/^@/, "") : def; };
      var name = ch === "telegram" ? "تلگرام" : "بله";
      var linked = ch === "telegram" ? tg.linked : r.linked;
      var bot = ch === "telegram" ? at(tg.bot, "ربات فرصت ملک") : at(r.bot, "ربات فرصت ملک");
      var chBtn = function (key, icon, title, sub, on, off) {
        return '<button type="button" class="alrt__c' + (on ? " is-on" : "") + (off ? " is-off" : "") + '" role="radio" aria-checked="' + !!on + '" data-ch="' + key + '"><i>' + icon + "</i><span><b>" + title + "</b><small>" + sub + "</small></span></button>";
      };
      box.innerHTML = '<b class="psheet__t">🔔 خبرم کن</b>' +
        '<p class="alrt__p">هر وقت آگهی تازه‌ای با امتیاز بالا (فرصت طلایی یا مناسب) در این فیلتر پیدا شود، همان لحظه خبرتان می‌کنیم؛ حداکثر ۸ پیام در روز.</p>' +
        '<b class="alrt__h">پیام کجا بیاید؟</b>' +
        '<div class="alrt__ch alrt__ch--3" role="radiogroup">' +
          chBtn("bale", "💬", "پیام‌رسان بله", r.linked ? "وصل است ✓" : "یک بار «شروع» در ربات", ch === "bale", !r.ready) +
          chBtn("telegram", "✈️", "تلگرام", tg.ready ? (tg.linked ? "وصل است ✓" : "یک بار «Start» در ربات") : "هنوز فعال نشده", ch === "telegram", !tg.ready) +
          chBtn("sms", "✉️", "پیامک", "به‌زودی", false, true) +
        "</div>" +
        (msg ? '<p class="alrt__ok">' + msg + "</p>" : "") +
        (r.link ? '<a class="btn btn--gold alrt__link" href="' + E(r.link) + '" target="_blank" rel="noopener">باز کردن ربات ' + name + " و زدن «" + (ch === "telegram" ? "Start" : "شروع") + "»</a><p class=\"alrt__p\">بعد از آن، حساب شما به " + name + " وصل می‌شود و همان‌جا پیام تأیید می‌آید.</p>" : "") +
        (linked ? '<p class="alrt__p">پیام‌ها در گفت‌وگو با ' + E(bot) + " در " + name + ' می‌آید.</p><button type="button" class="alrt__test" data-test>ارسال پیام آزمایشی به ' + name + "</button>" : "") +
        (can ? '<button type="button" class="btn btn--gold" data-add>افزودن هشدار ' + name + " برای: " + E(alertLabel(cur)) + "</button>" : '<p class="alrt__p">اول در فیلتر بالا استان یا شهر را انتخاب کنید.</p>') +
        (r.items && r.items.length ? '<b class="alrt__h">هشدارهای فعال شما</b><ul class="alrt__list">' + r.items.map(function (a) {
          return "<li><span>" + (a.channel === "telegram" ? "✈️ " : "💬 ") + E(alertLabel(a)) + '</span><button type="button" data-rm="' + a.id + '">حذف</button></li>';
        }).join("") + "</ul>" : "") +
        '<button type="button" class="psheet__x" data-x>بستن</button>';
    };
    FM.api.alerts().then(function (r) { paint(r); }).catch(function (e) { d.querySelector(".psheet__wait").textContent = e.message || "خطا"; });
    d.addEventListener("click", function (e) {
      var add = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]"), c = e.target.closest("[data-ch]"), test = e.target.closest("[data-test]");
      if (c) {
        if (c.dataset.ch === "sms") { (FM.toast || alert)("این بخش هنوز فعال نیست؛ فعلاً هشدارها در بله و تلگرام فرستاده می‌شود"); return; }
        if (c.classList.contains("is-off")) { (FM.toast || alert)(c.dataset.ch === "telegram" ? "ارسال در تلگرام هنوز از طرف مدیر سایت فعال نشده؛ فعلاً بله را انتخاب کنید." : "این کانال فعلاً در دسترس نیست"); return; }
        ch = c.dataset.ch; var r0 = Object.assign({}, last); delete r0.link; paint(r0); return;
      }
      var name = ch === "telegram" ? "تلگرام" : "بله";
      if (test) {
        test.disabled = true;
        FM.api.alertTest(ch).then(function (r) {
          paint(r, r.sent ? "پیام آزمایشی در " + name + " فرستاده شد ✅" : r.link ? "حساب هنوز به " + name + " وصل نیست؛ یک قدم مانده:" : "ارسال نشد؛ کمی بعد دوباره امتحان کنید");
        }).catch(function (er) { test.disabled = false; (FM.toast || alert)(er.message || "خطا"); });
      }
      if (add) {
        add.disabled = true;
        FM.api.alertAdd(Object.assign({}, cur, { channel: ch })).then(function (r) {
          paint(r, r.link ? "هشدار ذخیره شد؛ فقط یک قدم مانده:" : r.confirmed ? "هشدار ذخیره شد ✅ پیام تأیید هم در " + name + " فرستاده شد." : "هشدار ذخیره شد ✅");
        }).catch(function (er) { FM.api.alerts().then(function (r) { paint(r, er.message); }, function () { paint({ items: [] }, er.message); }); });
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
