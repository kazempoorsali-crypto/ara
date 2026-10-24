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
    var paint = function (r, msg) {
      var box = d.querySelector(".psheet__box");
      var can = cur.province || cur.city, bot = r.bot ? "@" + String(r.bot).replace(/^@/, "") : "ربات فرصت ملک";
      box.innerHTML = '<b class="psheet__t">🔔 خبرم کن</b>' +
        '<p class="alrt__p">هر وقت آگهی تازه‌ای با امتیاز بالا (فرصت طلایی یا مناسب) در این فیلتر پیدا شود، همان لحظه خبرتان می‌کنیم؛ حداکثر ۸ پیام در روز.</p>' +
        '<b class="alrt__h">پیام کجا بیاید؟</b>' +
        '<div class="alrt__ch" role="radiogroup">' +
          '<button type="button" class="alrt__c is-on" role="radio" aria-checked="true" data-ch="bale"><i>💬</i><span><b>پیام‌رسان بله</b><small>' +
            (r.linked ? "وصل است ✓ پیام‌ها در گفت‌وگو با " + E(bot) + " می‌آید" : "یک بار ربات " + E(bot) + " را باز و «شروع» را بزنید") + '</small></span></button>' +
          '<button type="button" class="alrt__c is-off" role="radio" aria-checked="false" data-ch="telegram"><i>✈️</i><span><b>تلگرام</b><small>به‌زودی (در حال توسعه)</small></span></button>' +
          '<button type="button" class="alrt__c is-off" role="radio" aria-checked="false" data-ch="sms"><i>✉️</i><span><b>پیامک</b><small>به‌زودی</small></span></button>' +
        "</div>" +
        (msg ? '<p class="alrt__ok">' + msg + "</p>" : "") +
        (r.link ? '<a class="btn btn--gold alrt__link" href="' + E(r.link) + '" target="_blank" rel="noopener">باز کردن ربات بله و زدن «شروع»</a><p class="alrt__p">بعد از «شروع»، حساب شما به بله وصل می‌شود و همان‌جا پیام تأیید می‌آید.</p>' : "") +
        (r.linked ? '<button type="button" class="alrt__test" data-test>ارسال پیام آزمایشی به بله</button>' : "") +
        (can ? '<button type="button" class="btn btn--gold" data-add>افزودن هشدار برای: ' + E(alertLabel(cur)) + "</button>" : '<p class="alrt__p">اول در فیلتر بالا استان یا شهر را انتخاب کنید.</p>') +
        (r.items && r.items.length ? '<b class="alrt__h">هشدارهای فعال شما</b><ul class="alrt__list">' + r.items.map(function (a) {
          return '<li><span>' + E(alertLabel(a)) + '</span><button type="button" data-rm="' + a.id + '">حذف</button></li>';
        }).join("") + "</ul>" : "") +
        (r.items && r.items.length && !r.linked && !r.link ? '<p class="alrt__p">برای دریافت پیام، حساب شما باید یک بار به ربات بله وصل شود؛ «ارسال پیام آزمایشی» یا دوباره «افزودن» را بزنید تا پیوند بیاید.</p><button type="button" class="alrt__test" data-test>وصل کردن به بله</button>' : "") +
        '<button type="button" class="psheet__x" data-x>بستن</button>';
    };
    FM.api.alerts().then(function (r) { paint(r); }).catch(function (e) { d.querySelector(".psheet__wait").textContent = e.message || "خطا"; });
    d.addEventListener("click", function (e) {
      var add = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]"), ch = e.target.closest("[data-ch]"), test = e.target.closest("[data-test]");
      if (ch && ch.dataset.ch === "telegram") { (FM.toast || alert)("ربات تلگرام در حال برنامه‌نویسی و دریافت مجوز است. فعلاً از پیام‌رسان بله استفاده کنید."); return; }
      if (ch && ch.dataset.ch === "sms") { (FM.toast || alert)("این بخش هنوز فعال نیست؛ فعلاً هشدارها در بله و تلگرام فرستاده می‌شود"); return; }
      if (test) {
        test.disabled = true;
        FM.api.alertTest().then(function (r) {
          paint(r, r.sent ? "پیام آزمایشی در بله فرستاده شد ✅ گفت‌وگوی ربات را در بله ببینید." : r.link ? "حساب هنوز به بله وصل نیست؛ یک قدم مانده:" : "ارسال نشد؛ کمی بعد دوباره امتحان کنید");
        }).catch(function (er) { test.disabled = false; (FM.toast || alert)(er.message || "خطا"); });
      }
      if (add) { add.disabled = true; FM.api.alertAdd(cur).then(function (r) { paint(r, r.link ? "هشدار ذخیره شد؛ فقط یک قدم مانده:" : r.confirmed ? "هشدار ذخیره شد ✅ پیام تأیید هم در بله فرستاده شد." : "هشدار ذخیره شد ✅"); }).catch(function (er) { FM.api.alerts().then(function (r) { paint(r, er.message); }, function () { paint({ items: [] }, er.message); }); }); }
      if (rm) FM.api.alertRemove(rm.dataset.rm).then(function (r) { paint(r, "حذف شد"); });
    });
  };
  /* درِ ورود: بدون حساب → ورود؛ بدون اشتراک فعال → اشتراک؛ otherwise → برگهٔ هشدارها */
  FM.alertGate = function (cur) {
    if (!FM.api || !FM.account) return;
    if (!FM.api.me) return FM.account.login(function () { FM.openAlerts(cur); });
    if (!FM.api.me.active) { (FM.toast || alert)("«خبرم کن» برای مشترکان است؛ با اشتراک، فرصت‌های تازه را زودتر از همه در بله ببینید."); return FM.account.subscribe(); }
    FM.openAlerts(cur);
  };
})();
