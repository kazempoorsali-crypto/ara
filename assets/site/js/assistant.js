/* ═══════════════════════════════════════════════════════════
   دستیار هوشمند فرصت ملک — موتور مکالمهٔ محلی
   تشخیص نیت (خرید/اجاره/ارزیابی/قیمت محله/روش/راهنمایی)،
   پرسش‌های تکمیلی برای رفع ابهام، جست‌وجوی واقعی در املاک
   و هدایت کاربر به بخش درست سایت.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var fab = document.getElementById("chatFab");
  var panel = document.getElementById("chat");
  if (!fab || !panel) return;

  var log = document.getElementById("chatLog");
  var chips = document.getElementById("chatChips");
  var form = document.getElementById("chatForm");
  var input = document.getElementById("chatInput");
  var status = document.getElementById("chatStatus");
  var openBtn = document.getElementById("assistantOpen");

  var state = { slot: null, need: null, criteria: {} };

  /* ---------- نرمال‌سازی متن فارسی ---------- */
  function norm(s) {
    return String(s)
      .replace(/[ىي]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه")
      .replace(/[أإآ]/g, "ا").replace(/\u200c/g, " ")
      .replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  var KIND_WORDS = {
    "اپارتمان": "آپارتمان", "اپارتمان": "آپارتمان", "آپارتمان": "آپارتمان", "فلت": "آپارتمان", "واحد": "آپارتمان",
    "ویلا": "ویلا", "ویلایی": "ویلا", "خانه": "ویلا", "ساحلی": "ویلا",
    "زمین": "زمین", "قطعه": "زمین", "باغ": "زمین",
  };

  /* ---------- تشخیص مکان در متن ---------- */
  function findPlace(t) {
    var out = {};
    FM.data.regions.forEach(function (p) {
      if (t.indexOf(norm(p.name)) !== -1) { out.province = p.id; out._provinceName = p.name; }
      p.cities.forEach(function (c) {
        if (t.indexOf(norm(c.name)) !== -1) { out.city = c.id; out._cityName = c.name; }
        c.districts.forEach(function (d) {
          var n = norm(d.name);
          if (t.indexOf(n) !== -1) { out.district = d.id; out._districtName = d.name; }
        });
      });
    });
    return out;
  }

  /* تشخیص بودجه: «تا ۵ میلیارد» / «زیر ۷ میلیارد» / «۵ میلیارد» */
  function findBudget(t) {
    var m = t.match(/(?:تا|زیر|حداکثر|حدود)?\s*(\d+(?:[.,]\d+)?)\s*(میلیارد|میلیون)/);
    if (!m) return null;
    var v = parseFloat(m[1].replace(",", "."));
    if (m[2] === "میلیون") v = v / 1000;
    return v;
  }

  function detectDeal(t) {
    if (/اجاره|رهن|ماهانه/.test(t)) return "rent";
    if (/خرید|بخرم|فروش|خریدار/.test(t)) return "buy";
    return null;
  }

  function detectKind(t) {
    for (var k in KIND_WORDS) if (t.indexOf(norm(k)) !== -1) return KIND_WORDS[k];
    return null;
  }

  function detectIntent(t) {
    if (/^(سلام|درود|وقت بخیر|هی|های)/.test(t)) return "greet";
    if (/ارزیابی|ارزش (ملک|خانه|ویلا|آپارتمان)|قیمت (ملک|خانه|ویلا|آپارتمان) ?(من|مارو|ما رو)/.test(t)) return "valuate";
    if (/قیمت (محله|منطقه|هر متر)|بازار (محله|منطقه)/.test(t)) return "market";
    if (/روش|چطور|چگونه|چه جوری|الگوریتم|امتیاز/.test(t)) return "method";
    if (/کره|آسمان|نقشه|جغرافی/.test(t)) return "sky";
    if (/آگهی|ملک|خانه|ویلا|آپارتمان|زمین|خرید|اجاره|دنبال|می ?خوام|میخوام/.test(t)) return "search";
    if (/طبقه|پنت ?هاوس/.test(t)) return "floors";
    if (/ممنون|دستت درد|مرسی|سپاس/.test(t)) return "thanks";
    if (/تماس|پشتیبانی|گزارش|تیکت/.test(t)) return "support";
    return "fallback";
  }

  /* ---------- جست‌وجوی واقعی ---------- */
  var KIND_KEY = { "آپارتمان": "apartment", "ویلا": "villa", "زمین": "land" };
  /* جست‌وجو در همهٔ آگهی‌های سنجیده‌شدهٔ سرور، مرتب بر پایهٔ امتیاز فرصت */
  function search(c) {
    var q = { sort: "score", limit: 6, ranked: 1, deal: c.deal === "rent" ? "rent" : "sale" };
    if (c.kind && KIND_KEY[c.kind]) q.kinds = KIND_KEY[c.kind];
    if (c.province) q.province = c.province;
    if (c.city) q.city = c.city;
    if (c.district) q.district = c.district;
    if (c.budget && q.deal === "sale") q.max = Math.round(c.budget * 1e9);
    return FM.api ? FM.api.search(q).then(function (r) { var a = (r.items || []).map(FM.mapListing); a.total = r.total || a.length; return a; }) : Promise.resolve([]);
  }
  function searchLink(c) {
    var q = [];
    ["province", "city", "district"].forEach(function (k) { if (c[k]) q.push(k + "=" + encodeURIComponent(c[k])); });
    if (c.kind && KIND_KEY[c.kind]) q.push("kinds=" + KIND_KEY[c.kind]);
    if (c.budget) q.push("max=" + Math.round(c.budget * 1e9));
    return "/app.html#/s" + (q.length ? "?" + q.join("&") : "");
  }

  /* ---------- رندر پیام ---------- */
  function bubble(html, who) {
    var div = document.createElement("div");
    div.className = "msg " + (who || "bot");
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function propertyCard(p) {
    return (
      '<a class="msg-card" href="' + FM.propUrl(p.id) + '">' +
      '<img src="' + FM.esc(p.img) + '" alt="" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG">' +
      '<span><b>' + FM.esc(p.title) + "</b><small>" + FM.esc(p.loc) + (p.area ? " · " + FM.fa(p.area) + " متر" : "") + "</small>" +
      '<span class="msg-card__row"><b>' + FM.esc(p.priceText) + '</b><i class="st-text" data-status="' + p.status + '">' + FM.esc(p.diffText || p.tag) + "</i></span></span></a>"
    );
  }

  function setChips(list) {
    chips.innerHTML = "";
    (list || []).forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = c.label;
      b.addEventListener("click", function () { send(c.value); });
      chips.appendChild(b);
    });
  }

  /* نمونه‌ها از شهرها و محله‌هایی که واقعاً داده دارند */
  function firstCity() { var p = FM.data.regions[0]; return p && p.cities[0] ? p.cities[0].name : ""; }
  function firstDistrict() { var p = FM.data.regions[0]; var c = p && p.cities[0]; return c && c.districts[0] ? c.districts[0].name : ""; }
  function exampleChips() {
    var c = firstCity(), d = firstDistrict(), out = [];
    if (c) out.push({ label: "آپارتمان در " + c, value: "آپارتمان در " + c });
    if (c) out.push({ label: "ویلا در " + c + " تا ۸ میلیارد", value: "ویلا در " + c + " تا ۸ میلیارد" });
    if (d) out.push({ label: "قیمت محله " + d, value: "قیمت محله " + d });
    out.push({ label: "همهٔ فرصت‌ها", value: "همه فرصت ها" });
    out.push({ label: "روش ارزش‌گذاری", value: "روش ارزش‌گذاری چطور است؟" });
    return out;
  }

  /* ---------- جریان مکالمه ---------- */
  function askMissing(c, found) {
    if (c.kind === undefined) {
      state.need = "kind";
      bubble("چه نوع ملکی مد نظرتان است؟");
      setChips([{ label: "آپارتمان", value: "آپارتمان" }, { label: "ویلا", value: "ویلا" }, { label: "زمین", value: "زمین" }, { label: "فرقی ندارد", value: "هرچی" }]);
      return;
    }
    if (!c.province && !c.city) {
      state.need = "place";
      bubble("در کدام شهر دنبال ملک هستید؟ فعلاً بازار " + FM.data.regions.map(function (p) { return p.name; }).join("، ") + " را پوشش می‌دهیم.");
      setChips(FM.data.regions.map(function (p) { return { label: p.name, value: p.name }; }));
      return;
    }
    if (c.budget == null && !state.askedBudget) {
      state.askedBudget = true;
      bubble("بازهٔ بودجه‌تان چقدر است؟ (مثلاً «تا ۶ میلیارد») — اگر محدودیتی ندارید، بنویسید «فرقی ندارد».");
      setChips([{ label: "تا ۵ میلیارد", value: "تا ۵ میلیارد" }, { label: "تا ۸ میلیارد", value: "تا ۸ میلیارد" }, { label: "فرقی ندارد", value: "فرقی ندارد" }]);
      return;
    }
    /* همه اسلات‌ها پر است */
    status.textContent = "در حال جست‌وجو…";
    search(c).then(function (res) {
      status.textContent = "آنلاین — آمادهٔ پاسخ";
      if (res.length) {
        var canPromise = c.budget ? "با بودجهٔ " + FM.fa(c.budget) + " میلیارد " : "";
        bubble("بله، " + canPromise + FM.fa(res.total) + " آگهی سنجیده‌شده پیدا کردم" + (c._cityName ? " در " + FM.esc(c._cityName) : "") + "؛ بهترین‌ها از نظر امتیاز فرصت:");
        res.slice(0, 3).forEach(function (p) { bubble(propertyCard(p), "bot"); });
        bubble("برای تحلیل کامل قیمت هر ملک روی کارتش بزنید، یا <a href='" + searchLink(c) + "' class='msg-link'>همهٔ نتیجه‌ها را با فیلتر و نقشه ببینید</a>.");
      } else {
        bubble("صادقانه بگویم: با این شرایط فعلاً آگهی سنجیده‌شده‌ای نداریم.");
        bubble("می‌توانم یکی از این‌ها را امتحان کنیم:");
        setChips([
          { label: "بدون محدودیت بودجه", value: (c.kind || "ملک") + " " + (c._cityName || "") + " فرقی ندارد" },
          { label: "دیدن همهٔ فرصت‌ها", value: "همه فرصت ها" },
        ]);
      }
    }).catch(function () { status.textContent = "آنلاین — آمادهٔ پاسخ"; bubble("ارتباط با سرور برقرار نشد؛ کمی بعد دوباره امتحان کنید."); });
  }

  function handle(t) {
    var intent = detectIntent(t);
    var place = findPlace(t);
    var budget = findBudget(t);
    var kind = detectKind(t);
    var deal = detectDeal(t);

    /* اگر در حال پر کردن اسلات هستیم */
    if (state.need) {
      if (state.need === "kind") {
        if (kind) state.criteria.kind = kind;
        else if (/فرقی ندار|هرچی|هر ملک|مهم نیست/.test(t)) state.criteria.kind = null;
        state.need = null;
      } else if (state.need === "place") {
        if (place.city || place.province) {
          if (place.province) state.criteria.province = place.province;
          if (place.city) { state.criteria.city = place.city; state.criteria.province = place.province || state.criteria.province; }
          if (place._cityName) state.criteria._cityName = place._cityName;
        }
        state.need = null;
      } else if (state.need === "budget") {
        if (budget != null) state.criteria.budget = budget;
        state.need = null;
      }
    }

    switch (intent) {
      case "greet":
        bubble("سلام! 👋 من دستیار فرصت ملک هستم. دنبال چه ملکی هستید؟ می‌توانم در املاک سایت جست‌وجو کنم، قیمت محله‌ها را بگویم یا روش ارزش‌گذاری را توضیح دهم.");
        setChips(exampleChips());
        return;

      case "valuate":
        var vp = findPlace(t);
        bubble("برای ارزیابی دقیق، به ابزار «ارزیابی ملک» در پنل کاربری نیاز دارید؛ اما می‌توانم همین‌جا برآورد اولیه بدهم. ملک‌تان در کدام شهر و محله است و چند متر و چند طبقه است؟");
        bubble("ابزار ارزیابی دقیق: <a class='msg-link' href='/app.html#/estimate'>ارزیابی یک ملک</a>.");
        return;

      case "market": {
        var mp = findPlace(t);
        var price = FM.districtPrice({ province: mp.province, city: mp.city, district: mp.district });
        var label = FM.regionLabel({ province: mp.province, city: mp.city, district: mp.district });
        if (!label) { bubble("نام محله یا شهر را بنویسید؛ مثلاً «قیمت محله " + FM.esc(firstDistrict() || "گلسار") + "»."); return; }
        if (price == null) { bubble("برای <b>" + FM.esc(label) + "</b> هنوز آگهی کافی برای برآورد قیمت هر متر نداریم."); return; }
        bubble("میانهٔ قیمت هر متر آپارتمان در <b>" + FM.esc(label) + "</b> بر پایهٔ آگهی‌های فعلی حدود <b>" + FM.fa(String(price).replace(".", "٫")) + " میلیون تومان</b> است.");
        bubble("می‌خواهید نقشهٔ محله‌ها و کرهٔ داده را ببینید؟");
        setChips([{ label: "بله، قیمت از دید آسمان", value: "کره و نقشه" }]);
        return;
      }

      case "method":
        bubble("روش ما سه قدم دارد: <b>پالایش</b> آگهی‌های تکراری و گمراه‌کننده، <b>سنجش</b> با توزیع آماری قیمت همان محله، و <b>کشف</b> آگهی‌های زیر ارزش با امتیاز ۰ تا ۱۰۰. خلاصهٔ تصویری‌اش را در بخش «پنج سطح ارزش‌گذاری» صفحهٔ اصلی می‌بینید.");
        setChips([{ label: "رفتن به بالای صفحهٔ اصلی", value: "برو بالا" }, { label: "فرصت‌های طلایی را نشانم بده", value: "همه فرصت ها" }]);
        return;

      case "sky":
      case "floors":
        bubble(intent === "sky"
          ? "کرهٔ زندهٔ بازار و نقشهٔ «قیمت از دید آسمان» در صفحهٔ اختصاصی خودش است — با فیلتر استان/شهر/محله، هم کره و هم نقشه به‌روز می‌شوند."
          : "داستان هر طبقه — از طبقهٔ اول تا پنت‌هاوس — با مزایا و معایبش در بخش «هر طبقه، یک داستان» صفحهٔ اصلی است.");
        setChips([
          { label: "باز کردن قیمت از دید آسمان", value: "باز کن sky" },
          { label: "باز کردن طبقات", value: "باز کن floors" },
        ]);
        return;

      case "search": {
        if (kind) state.criteria.kind = kind;
        if (deal === "rent") { /* دادهٔ اجاره نداریم */ }
        if (place.province) state.criteria.province = state.criteria.province || place.province;
        if (place.city) { state.criteria.city = place.city; state.criteria._cityName = place._cityName; }
        if (place.district) state.criteria.district = place.district;
        if (budget != null) state.criteria.budget = budget;
        state.criteria._provinceName = place._provinceName || state.criteria._provinceName;
        state.criteria._cityName = place._cityName || state.criteria._cityName;
        state.criteria._districtName = place._districtName || state.criteria._districtName;
        askMissing(state.criteria);
        return;
      }

      case "thanks":
        bubble("خواهش می‌کنم! 🌟 اگر چیز دیگری لازم داشتید در خدمتم.");
        setChips([{ label: "جست‌وجوی جدید", value: "سلام" }]);
        return;

      case "support":
        bubble("برای گزارش مشکل یا پرسش، <a class='msg-link' href='/app.html#/support'>یک تیکت پشتیبانی بفرستید</a>؛ پاسخ را همان‌جا می‌بینید.");
        return;

      default: {
        /* دستورات خاص */
        if (/همه فرصت/.test(t)) {
          var top = FM.data.properties || [];
          if (!top.length) { bubble("هنوز فرصت سنجیده‌شده‌ای نداریم."); return; }
          bubble("بهترین فرصت‌های امروز:");
          top.slice(0, 4).forEach(function (p) { bubble(propertyCard(p), "bot"); });
          bubble("<a class='msg-link' href='/app.html#/s?opp=1'>همهٔ فرصت‌ها با فیلتر و نقشه</a>");
          setChips([{ label: "فیلتر دقیق‌تر", value: "میخوام فیلتر کنم" }]);
          return;
        }
        if (/برو بالا|اول صفحه/.test(t)) { window.scrollTo({ top: 0, behavior: "smooth" }); bubble("رفتم بالای صفحه. ✨"); return; }
        if (/باز کن sky|کره و نقشه/.test(t)) { location.href = "/sky.html"; return; }
        if (/باز کن floors/.test(t)) { close(); var f = document.getElementById("floors"); f && f.scrollIntoView({ behavior: "smooth" }); return; }
        if (/فیلتر/.test(t)) {
          bubble("حتماً. نوع ملک، شهر و بودجه را بگویید تا دقیق جست‌وجو کنم. مثلاً: «آپارتمان در رشت تا ۵ میلیارد».");
          setChips(FM.data.regions.map(function (p) { return { label: p.name, value: "ملک در " + p.name }; }));
          return;
        }
        /* ابهام → پرسش تکمیلی */
        bubble("دقیق‌تر بگویم چه کمکی می‌کنم؟ می‌توانم:");
        setChips([
          { label: "جست‌وجوی ملک", value: "دنبال ملک میگردم" },
          { label: "قیمت یک محله", value: "قیمت محله چقدره" },
          { label: "روش ارزش‌گذاری", value: "روشت چیه" },
        ]);
        state.need = null;
      }
    }
  }

  function send(text) {
    if (!text) return;
    bubble(String(text).replace(/</g, "&lt;"), "user");
    setChips([]);
    status.textContent = "در حال نوشتن…";
    setTimeout(function () {
      status.textContent = "آنلاین — آمادهٔ پاسخ";
      handle(norm(text));
    }, 420);
  }

  /* ---------- باز و بسته ---------- */
  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    fab.classList.add("is-hidden");
    if (!log.children.length) {
      bubble("سلام! 👋 من دستیار هوشمند فرصت ملک هستم.<br>هر سؤالی دربارهٔ ملک دارید بپرسید — جست‌وجوی املاک، قیمت محله، روش ارزش‌گذاری یا راهنمایی در سایت.");
      setChips(exampleChips());
    }
    input.focus();
    /* یک ورودی در تاریخچه: دکمهٔ «برگشت» گوشی فقط دستیار را می‌بندد و صفحهٔ زیرش تکان نمی‌خورد */
    if (!chatPushed) { try { history.pushState({ fm: "chat" }, "", location.href); chatPushed = true; } catch (e) { /* بی‌تاریخچه */ } }
  }
  function shut() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    fab.classList.remove("is-hidden");
  }
  function close() {
    if (chatPushed) { history.back(); return; }   // بستن در popstate انجام می‌شود
    shut();
  }
  var chatPushed = false;
  FM.chatOpen = function () { return panel.classList.contains("is-open"); };
  window.addEventListener("popstate", function () {
    if (!chatPushed) return;
    chatPushed = false;
    shut();
  });

  fab.addEventListener("click", open);
  openBtn && openBtn.addEventListener("click", open);
  document.getElementById("chatClose").addEventListener("click", close);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value.trim();
    input.value = "";
    send(v);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.classList.contains("is-open")) close();
  });
})();
