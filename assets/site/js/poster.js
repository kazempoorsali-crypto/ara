/* سازندهٔ پوستر ملک (استوری ۱۰۸۰×۱۹۲۰ و پست ۱۰۸۰×۱۳۵۰ برای اینستاگرام، تلگرام و بله)
   - روی خود دستگاه کاربر ساخته می‌شود؛ فقط داده‌های واقعی همان کارت (بدون عدد ساختگی)
   - دو چیدمان (کارت / تمام‌عکس)، سه پوسته (تیره / روشن / طلایی)
   - نام، تلفن، لوگو و متن دلخواه آگهی‌دهنده (برای مشترکان)
   - واترمارک کم‌رنگ و کاشی‌شدهٔ «فرصت ملک» روی خود عکس + نشانی کوتاه پایین پوستر، تا با بریدن حذف نشود */
(function () {
  "use strict";
  var FONT = "Vazirmatn, Tahoma, sans-serif";
  var SIZES = { story: [1080, 1920], post: [1080, 1350] };
  var THEMES = {
    dark: { bg: ["#0d1a13", "#07100b"], ink: "#f6f3ea", soft: "#b9b4a4", acc: "#e9b949", good: "#7fd9a5", card: "rgba(255,255,255,.06)", line: "rgba(246,243,234,.14)" },
    light: { bg: ["#fbf8f1", "#efe8da"], ink: "#1c241e", soft: "#5f665f", acc: "#a8730a", good: "#1f8a52", card: "rgba(28,36,30,.05)", line: "rgba(28,36,30,.14)" },
    gold: { bg: ["#2a1f08", "#120d04"], ink: "#fff6dc", soft: "#e2cf9a", acc: "#ffd36b", good: "#9be7b4", card: "rgba(255,214,107,.08)", line: "rgba(255,214,107,.25)" },
  };
  var LB = { gold: ["✦ فرصت طلایی", "#e9b949", "#16120a"], good: ["فرصت مناسب", "#2fbf71", "#06170d"], fair: ["قیمت متعادل", "#9aa3a0", "#101413"] };
  var KEY = "fmPosterBrand";
  var PAPPS = [["ig", "اینستاگرام", "#d6297a", "IG"], ["tg", "تلگرام", "#2aa3df", "TG"], ["wa", "واتساپ", "#25b45b", "WA"],
    ["bale", "بله", "#2bb3a3", "ب"], ["eitaa", "ایتا", "#f08a24", "ا"], ["rubika", "روبیکا", "#7b4bd6", "ر"]];

  function loadImg(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      if (/^img\?u=/.test(src)) src = "/" + src;   // نشانی نسبی پروکسی عکس در صفحهٔ /ad/... به /ad/img می‌رفت و عکس (و واترمارک) نمی‌آمد
      else if (/^https:\/\/[^/]*(divarcdn\.com|divar\.ir|sheypoor\.com|sheypoor\.ir)\//i.test(src)) src = "/img?u=" + encodeURIComponent(src);   // هم‌دامنه تا بوم آلوده نشود
      var im = new Image(), t = setTimeout(function () { ok(null); }, 4000);
      im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer";
      im.onload = function () { clearTimeout(t); ok(im); };
      im.onerror = function () { clearTimeout(t); ok(null); };
      im.src = src;
    });
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(c, text, maxW, maxLines) {
    // واژه‌های بلند بی‌فاصله (مثل «۱۲۰متری/فول/دلباز/…») از «/» و اگر باز هم بلند بود حرف‌به‌حرف شکسته می‌شوند تا از پوستر بیرون نزنند
    var words = [], lines = [], cur = "";
    String(text || "").split(/\s+/).forEach(function (w) {
      w.replace(/\//g, "/\u0001").split("\u0001").forEach(function (part) {
        while (part && c.measureText(part).width > maxW) {
          var n = part.length; while (n > 1 && c.measureText(part.slice(0, n)).width > maxW) n--;
          words.push(part.slice(0, n)); part = part.slice(n);
        }
        if (part) words.push(part);
      });
    });
    words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
    return lines;
  }
  function cover(c, img, x, y, w, h) {
    var s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  /* واترمارک: چند نوشتهٔ کم‌رنگ و مورب «فرصت ملک» پراکنده روی عکس (هم روی عکس روشن دیده می‌شود هم تیره، و با بریدن گوشه‌ها حذف نمی‌شود)
     + برچسب کوچک گوشه */
  function watermark(c, x, y, w, h, host) {
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.font = "800 40px " + FONT; c.textAlign = "center"; c.direction = "rtl"; c.lineJoin = "round";
    var label = "فرصت ملک", cols = 2, rows = Math.max(2, Math.round(h / 330));
    for (var r = 0; r < rows; r++) for (var q = 0; q < cols; q++) {
      var cx = x + w * (q + 0.5 + (r % 2 ? 0.25 : -0.25)) / cols, cy = y + h * (r + 0.5) / rows;
      c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 9);
      c.lineWidth = 3; c.strokeStyle = "rgba(0,0,0,.16)"; c.strokeText(label, 0, 0);
      c.fillStyle = "rgba(255,255,255,.26)"; c.fillText(label, 0, 0);
      c.restore();
    }
    c.restore();
    c.save(); c.font = "800 26px " + FONT; c.direction = "rtl"; c.textAlign = "left";
    var bw = c.measureText("فرصت ملک | " + host).width + 36;
    rr(c, x + 24, y + h - 70, bw, 46, 23); c.fillStyle = "rgba(0,0,0,.5)"; c.fill();
    c.fillStyle = "#fff"; c.fillText("فرصت ملک | " + host, x + 42, y + h - 38);
    c.restore();
  }

  function draw(o) {
    var p = o.p, S = SIZES[o.size], W = S[0], H = S[1], T = THEMES[o.theme] || THEMES.dark;
    var story = o.size === "story", k = story ? 1 : 0.86;
    var safeT = story ? 190 : 56, safeB = story ? 210 : 50;   // استوری: بالا و پایین زیر دکمه‌های برنامه نرود
    var host = (location.host || "forsatmelk.ir").replace(/^www\./, "");
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"); c.direction = "rtl"; c.textAlign = "right";
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.bg[0]); g.addColorStop(1, T.bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var full = o.layout === "full" && o.img;
    var M = 64, y;
    // ---- چیدمان از پایین: پانویس فرصت ملک، بعد کارت آگهی‌دهنده؛ متن و عکس در فضای باقی‌مانده (هیچ‌چیز روی هم نمی‌افتد)
    var footUrlY = H - safeB - 8, footTxtY = footUrlY - 44, footLineY = footTxtY - 44;
    var ch = 200 * k, brandY = o.brand ? footLineY - 30 - ch : footLineY;
    c.font = "900 " + Math.round(58 * k) + "px " + FONT;
    var tLines = wrap(c, p.title, W - 2 * M, 2), di = p.raw && p.raw.drop_info;
    var textH = tLines.length * 80 * k + 92 * k + (di ? 80 * k : 0) + 84 * k + (p.diffText ? 64 * k : 0);
    // ---- عکس
    if (full) {
      cover(c, o.img, 0, 0, W, H);
      var sh = c.createLinearGradient(0, H * 0.3, 0, H); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(0.5, "rgba(0,0,0,.7)"); sh.addColorStop(1, "rgba(0,0,0,.92)");
      c.fillStyle = sh; c.fillRect(0, 0, W, H);
      y = brandY - 36 - textH + 58 * k;
      watermark(c, 0, 0, W, Math.max(400, y - 220 * k), host);   // فقط روی بخش عکس، نه زیر متن
      T = Object.assign({}, T, { ink: "#fff", soft: "rgba(255,255,255,.82)", line: "rgba(255,255,255,.22)", card: "rgba(255,255,255,.12)" });
    } else {
      var iy = safeT, ih = Math.max(260, brandY - 40 - textH - 60 * k - iy);
      ih = Math.min(ih, story ? 860 : 620);
      c.save(); rr(c, M - 10, iy, W - 2 * M + 20, ih, 44); c.clip();
      if (o.img) cover(c, o.img, M - 10, iy, W - 2 * M + 20, ih);
      else { c.fillStyle = T.card; c.fillRect(M - 10, iy, W - 2 * M + 20, ih); c.fillStyle = T.soft; c.font = "700 50px " + FONT; c.textAlign = "center"; c.fillText("بدون عکس", W / 2, iy + ih / 2); c.textAlign = "right"; }
      c.restore();
      watermark(c, M - 10, iy, W - 2 * M + 20, ih, host);
      y = iy + ih + 96 * k;
    }
    // ---- برچسب رده و امتیاز
    var lb = LB[p.label], by = full ? y - 150 * k : (safeT + 34);
    if (lb) {
      c.font = "800 " + Math.round(38 * k) + "px " + FONT; var bw = c.measureText(lb[0]).width + 60;
      rr(c, W - M - bw, by, bw, 72 * k, 36 * k); c.fillStyle = lb[1]; c.fill();
      c.fillStyle = lb[2]; c.fillText(lb[0], W - M - 30, by + 50 * k);
    }
    if (p.score != null) {
      var sx = M + 66, sy = by + 36 * k;
      c.beginPath(); c.arc(sx, sy, 62 * k, 0, Math.PI * 2); c.fillStyle = "#e9b949"; c.fill();
      c.fillStyle = "#16120a"; c.font = "900 " + Math.round(50 * k) + "px " + FONT; c.textAlign = "center"; c.fillText(FM.fa(p.score), sx, sy + 12 * k);
      c.font = "700 " + Math.round(20 * k) + "px " + FONT; c.fillText("امتیاز", sx, sy + 40 * k); c.textAlign = "right";
    }
    // ---- متن
    c.fillStyle = T.ink; c.font = "900 " + Math.round(58 * k) + "px " + FONT;
    tLines.forEach(function (l) { c.fillText(l, W - M, y); y += 80 * k; });
    c.fillStyle = T.soft; c.font = "500 " + Math.round(38 * k) + "px " + FONT;
    c.fillText([p.loc, p.area ? FM.fa(p.area) + " متر" : "", p.rooms ? FM.fa(p.rooms) + " خواب" : ""].filter(Boolean).join("  |  "), W - M, y + 4); y += 92 * k;
    if (di) {
      c.fillStyle = "#e0634b"; c.font = "700 " + Math.round(42 * k) + "px " + FONT;
      var old = FM.money(di.prev); c.fillText(old, W - M, y);
      var ow = c.measureText(old).width; c.fillRect(W - M - ow, y - 15 * k, ow, 5);
      y += 80 * k;
    }
    c.fillStyle = T.acc; c.font = "900 " + Math.round(74 * k) + "px " + FONT; c.fillText(p.priceText || "", W - M, y); y += 84 * k;
    if (p.diffText) { c.fillStyle = T.good; c.font = "800 " + Math.round(44 * k) + "px " + FONT; c.fillText(p.diffText, W - M, y); y += 64 * k; }
    // ---- آگهی‌دهنده (اختیاری)
    if (o.brand) {
      var B = o.brand, cy = brandY;
      rr(c, M - 10, cy, W - 2 * M + 20, ch, 34); c.fillStyle = T.card; c.fill(); c.strokeStyle = T.line; c.lineWidth = 2; c.stroke();
      var tx = W - M - 20;
      if (B.logo) { var ls = ch - 50 * k; c.save(); rr(c, M + 14, cy + 25 * k, ls, ls, 24); c.clip(); cover(c, B.logo, M + 14, cy + 25 * k, ls, ls); c.restore(); }
      c.fillStyle = T.ink; c.font = "900 " + Math.round(48 * k) + "px " + FONT; c.fillText(B.name || "", tx, cy + 68 * k);
      if (B.phone) { c.fillStyle = T.acc; c.font = "800 " + Math.round(44 * k) + "px " + FONT; c.direction = "ltr"; c.textAlign = "right"; c.fillText("☎ " + B.phone, tx, cy + 128 * k); c.direction = "rtl"; }
      if (B.note) { c.fillStyle = T.soft; c.font = "500 " + Math.round(32 * k) + "px " + FONT; c.fillText(wrap(c, B.note, W - 2 * M - (B.logo ? ch : 0) - 40, 1)[0], tx, cy + 178 * k); }
    }
    // ---- پانویس کوچک فرصت ملک (همیشه)
    c.fillStyle = T.line; c.fillRect(M, footLineY, W - 2 * M, 2);
    c.fillStyle = T.soft; c.font = "600 30px " + FONT; c.textAlign = "center";
    c.fillText("ارزیابی قیمت و جزئیات بیشتر در فرصت ملک", W / 2, footTxtY);
    c.fillStyle = T.acc; c.font = "800 34px " + FONT; c.direction = "ltr"; c.fillText(host + "/ad/" + p.id, W / 2, footUrlY);
    return cv;
  }

  /* تصویر پوستر در دو قالب: PNG برای کپی در حافظه (دسکتاپ) و JPEG برای فهرست اشتراک گوشی */
  FM._poster = FM._poster || {};
  function blobs(cv, done) {
    var out = {}, n = 0, fin = function () { if (++n === 2) done(out); };
    try {
      cv.toBlob(function (b) { out.png = b; fin(); }, "image/png");
      cv.toBlob(function (b) { out.jpg = b; fin(); }, "image/jpeg", 0.92);
    } catch (e) { done(null); }   // عکس دامنهٔ دیگر بوم را آلوده کرده
  }
  function defaults(sub) {
    var saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
    return { size: "story", layout: "card", theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
      useBrand: !!(sub && (saved.name || saved.phone || saved.logo)),   // حالت خودکار: مشخصات ذخیره‌شدهٔ قبلی خودش می‌آید
      name: saved.name || "", phone: saved.phone || "", note: saved.note || "", logoData: saved.logo || "" };
  }
  function fontReady() { return document.fonts && document.fonts.load ? document.fonts.load("900 60px Vazirmatn").catch(function () {}) : Promise.resolve(); }
  /* پوستر آماده (یا آخرین پوستری که کاربر سفارشی کرده) برای اشتراک مستقیم از منو */
  FM.posterImage = function (p) {
    if (FM._poster[p.id]) return Promise.resolve(FM._poster[p.id]);
    var sub = FM.isSub && FM.isSub(), st = defaults(sub);
    return Promise.all([loadImg(p.img && p.img.indexOf("noimg") < 0 ? p.img : ""), loadImg(st.logoData), fontReady()]).then(function (r) {
      var b = st.useBrand && sub && (st.name || st.phone || st.note || r[1]) ? { name: st.name, phone: st.phone, note: st.note, logo: r[1] } : null;
      return new Promise(function (ok) {
        var go = function (img) { blobs(draw({ p: p, img: img, size: st.size, layout: st.layout, theme: st.theme, brand: b }), function (x) { if (!x && img) return go(null); if (x) FM._poster[p.id] = x; ok(x); }); };
        go(r[0]);
      });
    });
  };

  function seg(name, opts, cur, locked) {
    return '<div class="pe__seg" data-seg="' + name + '">' + opts.map(function (o) {
      var lock = locked && locked.indexOf(o[0]) >= 0;
      return '<button type="button" data-v="' + o[0] + '" class="' + (o[0] === cur ? "is-on" : "") + (lock ? " is-lock" : "") + '">' + o[1] + (lock ? " 🔒" : "") + "</button>";
    }).join("") + "</div>";
  }

  FM.poster = function (p, onClosed, opt) {
    (FM.meReady ? FM.meReady() : Promise.resolve()).then(function () { openPoster(p, onClosed, opt || {}); });
  };
  function openPoster(p, onClosed, opt) {
    var sub = FM.isSub && FM.isSub(), mob = FM.isMobile && FM.isMobile();
    var st = defaults(sub);
    var d = FM.sheet('<b class="psheet__t">سازندهٔ پوستر</b>' +
      '<div class="pe"><div class="pe__view"><canvas class="pe__cv"></canvas><span class="pe__wait">در حال ساخت…</span></div>' +
      '<div class="pe__ctl">' +
        '<div class="pe__quick"><b>پوستر آماده است ✓</b><small>همین حالا می‌توانید بفرستید یا ذخیره کنید؛ یا آن را به سلیقهٔ خودتان تغییر دهید.</small>' +
        '<div class="pe__acts"><button type="button" class="btn btn--gold" data-share-p>اشتراک‌گذاری</button><button type="button" class="btn btn--ghost" data-save-p>ذخیرهٔ تصویر</button></div>' +
        '<div class="pe__ig" hidden>' + PAPPS.map(function (a) { return '<button type="button" class="pe__app psheet__app" data-pa="' + a[0] + '"><i style="background:' + a[2] + '">' + a[3] + "</i><span>" + a[1] + "</span></button>"; }).join("") + "</div>" +
        '<button type="button" class="pe__edit" data-edit>✎ ویرایش و شخصی‌سازی</button></div>' +
        '<div class="pe__more" hidden>' +
        '<label class="pe__l">اندازه</label>' + seg("size", [["story", "استوری ۹:۱۶"], ["post", "پست ۴:۵"]], st.size) +
        '<label class="pe__l">چیدمان</label>' + seg("layout", [["card", "کارت"], ["full", "تمام‌عکس"]], st.layout, sub ? [] : ["full"]) +
        '<label class="pe__l">پوسته</label>' + seg("theme", [["dark", "تیره"], ["light", "روشن"], ["gold", "طلایی"]], st.theme) +
        '<label class="pe__chk"><input type="checkbox" data-brand' + (sub ? "" : " disabled") + '> نام و مشخصات آگهی‌دهنده روی پوستر' + (sub ? "" : " 🔒") + "</label>" +
        '<div class="pe__brand" hidden>' +
          '<input class="pe__in" data-k="name" maxlength="40" placeholder="نام املاک یا نام شما" value="' + FM.esc(st.name) + '">' +
          '<input class="pe__in" data-k="phone" maxlength="20" inputmode="tel" dir="ltr" placeholder="تلفن (اختیاری)" value="' + FM.esc(st.phone) + '">' +
          '<input class="pe__in" data-k="note" maxlength="70" placeholder="متن دلخواه (اختیاری)، مثلاً: بازدید با هماهنگی" value="' + FM.esc(st.note) + '">' +
          '<label class="pe__file">لوگو (اختیاری)<input type="file" accept="image/*" data-logo></label>' +
        "</div>" +
        (sub ? "" : '<div class="pe__up"><b>با اشتراک:</b> نام، تلفن و لوگوی خودتان روی پوستر و چیدمان ویژهٔ «تمام‌عکس».<button type="button" class="btn btn--gold" data-fm-sub>فعال‌سازی اشتراک</button></div>') +
        '<div class="pe__acts"><button type="button" class="btn btn--gold" data-share-p>اشتراک‌گذاری</button><button type="button" class="btn btn--ghost" data-save-p>ذخیرهٔ تصویر</button></div>' +
        '<div class="pe__ig" hidden>' + PAPPS.map(function (a) { return '<button type="button" class="pe__app psheet__app" data-pa="' + a[0] + '"><i style="background:' + a[2] + '">' + a[3] + "</i><span>" + a[1] + "</span></button>"; }).join("") + "</div>" +
      '</div></div></div><button type="button" class="psheet__x" data-x>' + (onClosed ? "برگشت" : "بستن") + '</button>', onClosed);
    var cvBox = d.querySelector(".pe__view"), photo = null, logo = null, lastBlob = null, tmr = null;
    function brand() { return st.useBrand && sub && (st.name || st.phone || st.note || logo) ? { name: st.name, phone: st.phone, note: st.note, logo: logo } : null; }
    function render() {
      var cv = draw({ p: p, img: photo, size: st.size, layout: st.layout, theme: st.theme, brand: brand() });
      var old = cvBox.querySelector("canvas"); cv.className = "pe__cv"; old.replaceWith(cv);
      d.querySelector(".pe__wait").hidden = true;
      lastBlob = null;
      blobs(cv, function (x) {
        if (!x) { if (photo) { photo = null; render(); } return; }   // عکس دامنهٔ دیگر: بدون عکس
        lastBlob = x; FM._poster[p.id] = x;   // همین پوستر سفارشی از منوی اشتراک هم فرستاده می‌شود
      });
    }
    function later() { clearTimeout(tmr); tmr = setTimeout(render, 160); }
    function saveBrand() { try { localStorage.setItem(KEY, JSON.stringify({ name: st.name, phone: st.phone, note: st.note, logo: st.logoData })); } catch (e) {} }
    d.addEventListener("click", function (e) {
      if (e.target.closest("[data-edit]")) { d.querySelector(".pe__more").hidden = false; d.querySelector(".pe__quick").hidden = true; return; }
      var b = e.target.closest(".pe__seg button");
      if (b) {
        if (b.classList.contains("is-lock")) { if (FM.toast) FM.toast("چیدمان «تمام‌عکس» برای مشترکان است"); return; }
        var sg = b.parentNode; st[sg.dataset.seg] = b.dataset.v;
        sg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        render(); return;
      }
      var pa = e.target.closest("[data-pa]");
      if (pa) { withImg(function (img) { FM.sendImage(pa.dataset.pa, img, p.id, caption(), note); }); return; }   // دسکتاپ: برنامهٔ انتخاب‌شده
      if (e.target.closest("[data-save-p]")) send("save");
      else if (e.target.closest("[data-share-p]")) send("share");
    });
    function caption() { return p.title + "\n" + location.origin + FM.propUrl(p.id); }
    /* پیام وضعیت داخل همین پنجره (در صفحه‌های قدیمی toast نیست و کاربر نباید بی‌واکنش بماند) */
    function note(t) {
      d.querySelectorAll(".pe__note").forEach(function (n) { n.remove(); });
      var shown = false;
      d.querySelectorAll(".pe__quick, .pe__more").forEach(function (box) {
        if (shown || box.hidden) return;
        var at = [].filter.call(box.querySelectorAll(".pe__ig, .pe__acts"), function (x) { return x.offsetParent; }).pop();
        if (!at) return;
        var n = document.createElement("p"); n.className = "pe__note"; n.innerHTML = t; at.after(n); n.scrollIntoView({ block: "nearest" }); shown = true;
      });
      if (!shown && FM.toast) FM.toast(t.replace(/<[^>]+>/g, ""));
    }
    function download(blob, name) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }
    function withImg(fn) {
      if (lastBlob) return fn(lastBlob);
      blobs(cvBox.querySelector("canvas"), function (x) { if (x) fn(x); else note("ساخت تصویر ممکن نشد؛ دوباره امتحان کنید"); });
    }
    function send(mode) {
      if (mode === "save") return withImg(function (img) { download(mob ? img.jpg : img.png, "forsatmelk-" + p.id + (mob ? ".jpg" : ".png")); note("تصویر ذخیره شد ✓"); });
      // گوشی: فهرست اشتراک گوشی (پوستر + متن و پیوند). دسکتاپ: فهرست برنامه‌ها باز می‌شود
      if (mob) return withImg(function (img) { FM.sendImage("", img, p.id, caption(), note); });
      d.querySelectorAll(".pe__ig").forEach(function (g) { g.hidden = false; });
      note("برنامه را انتخاب کنید؛ اگر روی رایانه نصب باشد همان باز می‌شود، وگرنه نسخهٔ وب.");
    }
    d.querySelector("[data-brand]").addEventListener("change", function (e) { st.useBrand = e.target.checked; d.querySelector(".pe__brand").hidden = !st.useBrand; render(); });
    d.querySelectorAll(".pe__in").forEach(function (inp) {
      inp.addEventListener("input", function () { st[inp.dataset.k] = inp.value.trim(); saveBrand(); later(); });
    });
    d.querySelector("[data-logo]").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        loadImg(fr.result).then(function (im) {   // لوگو کوچک ذخیره می‌شود تا دفعهٔ بعد هم باشد
          if (!im) return;
          var cv = document.createElement("canvas"), s = 240 / Math.max(im.width, im.height); cv.width = im.width * s; cv.height = im.height * s;
          cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
          st.logoData = cv.toDataURL("image/png"); saveBrand();
          loadImg(st.logoData).then(function (l) { logo = l; render(); });
        });
      };
      fr.readAsDataURL(f);
    });
    Promise.all([loadImg(p.img && p.img.indexOf("noimg") < 0 ? p.img : ""), loadImg(st.logoData), fontReady()]).then(function (r) {
      photo = r[0]; logo = r[1];
      // چیدمان پیش‌فرض همیشه «کارت» است؛ «تمام‌عکس» را خود کاربر انتخاب می‌کند
      if (opt.app && !mob) d.querySelectorAll(".pe__ig").forEach(function (g) { g.hidden = false; g.querySelectorAll('[data-pa="' + opt.app + '"]').forEach(function (b) { b.classList.add("is-hl"); }); });   // از گزینهٔ همان برنامه آمده
      var cb = d.querySelector("[data-brand]"); cb.checked = st.useBrand; d.querySelector(".pe__brand").hidden = !st.useBrand;
      render();
    });
  }

  /* دکمهٔ اشتراک کارت: پوستر آماده (برجسته تا دیده شود) + اشتراک با برنامه‌ها + کپی پیوند */
  FM.shareSheet = function (p, url) {
    var mob = FM.isMobile && FM.isMobile(), ready = null;
    var d = FM.sheet('<b class="psheet__t">اشتراک‌گذاری</b><div class="psheet__opts">' +
      '<button type="button" class="psheet__opt psheet__opt--poster" data-o="poster"><i>🖼</i><span><b>ساخت پوستر آگهی <em>بزنید</em></b><small>پوستر با عکس، قیمت و ارزیابی؛ با نام و لوگوی خودتان. اندازه و رنگ را هم می‌توانید عوض کنید.</small></span></button>' +
      "</div>" + FM.shareBody(url, true) +
      '<button type="button" class="psheet__x" data-x>بستن</button>');
    // پوستر آماده از همین حالا ساخته می‌شود تا لحظهٔ زدن دکمه آماده باشد (اشتراک گوشی باید همان لحظهٔ کلیک انجام شود)
    var job = FM.posterImage(p).then(function (x) { ready = x; return x; }, function () { return null; });
    var caption = p.title + "\n" + url;
    var say = function (t) {
      var h = d.querySelector(".psheet__hint");
      if (!h) { h = document.createElement("p"); h.className = "psheet__hint"; d.querySelector(".psheet__url").after(h); }
      h.innerHTML = t;
    };
    FM.bindShare(d, url, p.title, {
      id: p.id,
      image: function () { return FM._poster[p.id] || ready; },
      onInstagram: function () { FM.poster(p, FM.subSheet(d), { app: "ig" }); },
      onNative: function (btn) {   // گوشی: پوستر + متن و پیوند به فهرست اشتراک گوشی
        var img = FM._poster[p.id] || ready;
        if (img) return FM.sendImage("", img, p.id, caption, say);
        btn.disabled = true; say("در حال آماده کردن پوستر…");
        job.then(function (x) {
          btn.disabled = false;
          if (x) FM.sendImage("", x, p.id, caption, say);   // اگر مرورگر اجازه نداد، پیام «یک بار دیگر بزنید» می‌آید
          else navigator.share({ title: p.title, text: p.title, url: url }).catch(function () {});
        });
      },
    });
    d.addEventListener("click", function (e) {
      var o = e.target.closest("[data-o]"); if (!o) return;
      FM.poster(p, FM.subSheet(d));   // «برگشت» از پوستر دوباره همین منو را نشان می‌دهد
    });
  };
})();
