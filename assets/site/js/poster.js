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

  function loadImg(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var im = new Image(), t = setTimeout(function () { ok(null); }, 4000);
      im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer";
      im.onload = function () { clearTimeout(t); ok(im); };
      im.onerror = function () { clearTimeout(t); ok(null); };
      im.src = src;
    });
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(c, text, maxW, maxLines) {
    var words = String(text || "").split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
    return lines;
  }
  function cover(c, img, x, y, w, h) {
    var s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  /* واترمارک: متن کم‌رنگ مورب و کاشی‌شده روی کل عکس (بریدن گوشه‌ها حذفش نمی‌کند) + برچسب کوچک گوشه */
  function watermark(c, x, y, w, h, host) {
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.translate(x + w / 2, y + h / 2); c.rotate(-Math.PI / 7);
    // ملایم: چند تکرار پراکنده و بسیار کم‌رنگ (عکس شلوغ نشود، ولی با بریدن گوشه‌ها هم حذف نشود)
    c.font = "700 30px " + FONT; c.fillStyle = "rgba(255,255,255,.085)"; c.textAlign = "center"; c.direction = "rtl";
    var label = "فرصت ملک  |  " + host, step = 460, gap = 330, row = 0;
    for (var yy = -h; yy < h; yy += gap, row++) for (var xx = -w; xx < w; xx += step * 2) c.fillText(label, xx + (row % 2 ? step : 0), yy);
    c.restore();
    c.save(); c.font = "800 26px " + FONT; c.direction = "rtl"; c.textAlign = "left";
    var bw = c.measureText("فرصت ملک").width + 36;
    rr(c, x + 24, y + h - 70, bw, 46, 23); c.fillStyle = "rgba(0,0,0,.45)"; c.fill();
    c.fillStyle = "#fff"; c.fillText("فرصت ملک", x + 42, y + h - 38);
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
      if (o.img) watermark(c, M - 10, iy, W - 2 * M + 20, ih, host);
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

  function sheet(html) {
    var d = document.createElement("div"); d.className = "psheet"; d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true">' + html + "</div>";
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-x]")) d.remove(); });
    document.body.appendChild(d); return d;
  }
  function seg(name, opts, cur, locked) {
    return '<div class="pe__seg" data-seg="' + name + '">' + opts.map(function (o) {
      var lock = locked && locked.indexOf(o[0]) >= 0;
      return '<button type="button" data-v="' + o[0] + '" class="' + (o[0] === cur ? "is-on" : "") + (lock ? " is-lock" : "") + '">' + o[1] + (lock ? " 🔒" : "") + "</button>";
    }).join("") + "</div>";
  }

  FM.poster = function (p) {
    var sub = FM.isSub && FM.isSub();
    var saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
    var st = { size: "story", layout: "card", theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
      useBrand: !!(sub && (saved.name || saved.phone || saved.logo)),   // حالت خودکار: مشخصات ذخیره‌شدهٔ قبلی خودش می‌آید
      name: saved.name || "", phone: saved.phone || "", note: saved.note || "", logoData: saved.logo || "" };
    var d = sheet('<b class="psheet__t">سازندهٔ پوستر</b>' +
      '<div class="pe"><div class="pe__view"><canvas class="pe__cv"></canvas><span class="pe__wait">در حال ساخت…</span></div>' +
      '<div class="pe__ctl">' +
        '<div class="pe__quick"><b>پوستر آماده است ✓</b><small>همین حالا می‌توانید بفرستید یا ذخیره کنید؛ یا آن را به سلیقهٔ خودتان تغییر دهید.</small>' +
        '<div class="pe__acts"><button type="button" class="btn btn--gold" data-share-p>اشتراک‌گذاری</button><button type="button" class="btn btn--ghost" data-save-p>ذخیرهٔ تصویر</button></div>' +
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
      '</div></div></div><button type="button" class="psheet__x" data-x>بستن</button>');
    var cvBox = d.querySelector(".pe__view"), photo = null, logo = null, lastBlob = null, tmr = null;
    function brand() { return st.useBrand && sub && (st.name || st.phone || st.note || logo) ? { name: st.name, phone: st.phone, note: st.note, logo: logo } : null; }
    function render() {
      var cv = draw({ p: p, img: photo, size: st.size, layout: st.layout, theme: st.theme, brand: brand() });
      var old = cvBox.querySelector("canvas"); cv.className = "pe__cv"; old.replaceWith(cv);
      d.querySelector(".pe__wait").hidden = true;
      lastBlob = null;
      try { cv.toBlob(function (b) { lastBlob = b; }, "image/png"); } catch (e) { photo = null; render(); }   // عکس دامنهٔ دیگر: بدون عکس
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
      if (e.target.closest("[data-save-p]") || e.target.closest("[data-share-p]")) {
        var share = !!e.target.closest("[data-share-p]");
        var go = function (blob) {
          if (!blob) return;
          var name = "forsatmelk-" + p.id + ".png", file = window.File ? new File([blob], name, { type: "image/png" }) : null;
          if (share && file && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: p.title, text: p.title + " — " + location.origin + FM.propUrl(p.id) }).catch(function () {});
          } else {
            var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
          }
        };
        if (lastBlob) go(lastBlob); else cvBox.querySelector("canvas").toBlob(go, "image/png");
      }
    });
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
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load("900 60px Vazirmatn").catch(function () {}) : Promise.resolve();
    Promise.all([loadImg(p.img && p.img.indexOf("noimg") < 0 ? p.img : ""), loadImg(st.logoData), fontReady]).then(function (r) {
      photo = r[0]; logo = r[1];
      if (sub && photo) {   // خودکار: با عکس و اشتراک، چیدمان ویژهٔ تمام‌عکس
        st.layout = "full";
        d.querySelectorAll('[data-seg="layout"] button').forEach(function (x) { x.classList.toggle("is-on", x.dataset.v === "full"); });
      }
      var cb = d.querySelector("[data-brand]"); cb.checked = st.useBrand; d.querySelector(".pe__brand").hidden = !st.useBrand;
      render();
    });
  };

  /* دکمهٔ اشتراک کارت: پیوند یا پوستر */
  FM.shareSheet = function (p, url) {
    var d = sheet('<b class="psheet__t">اشتراک‌گذاری</b><div class="psheet__opts">' +
      '<button type="button" class="psheet__opt" data-o="link"><i>🔗</i><span><b>پیوند ملک</b><small>کپی پیوند یا فرستادن در پیام‌رسان</small></span></button>' +
      '<button type="button" class="psheet__opt" data-o="poster"><i>🖼</i><span><b>پوستر استوری و پست</b><small>پوستر آماده با عکس، قیمت و ارزیابی؛ با نام و لوگوی خودتان</small></span></button>' +
      '</div><button type="button" class="psheet__x" data-x>بستن</button>');
    d.addEventListener("click", function (e) {
      var o = e.target.closest("[data-o]"); if (!o) return;
      d.remove();
      if (o.dataset.o === "link") FM.share(url, p.title); else FM.poster(p);
    });
  };
})();
