/* پوستر آمادهٔ استوری و کانال: کارت تصویری ۱۰۸۰×۱۹۲۰ از همان داده‌های کارت (بدون هیچ عدد ساختگی)
   روی خود گوشی کاربر ساخته می‌شود؛ سرور و کتابخانهٔ اضافه لازم ندارد. */
(function () {
  "use strict";
  var W = 1080, H = 1920, FONT = "Vazirmatn, Tahoma, sans-serif";
  var LB = { gold: ["✦ فرصت طلایی", "#e9b949", "#16120a"], good: ["فرصت مناسب", "#2fbf71", "#06170d"], fair: ["قیمت متعادل", "#9aa3a0", "#101413"] };

  function loadImg(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var im = new Image();
      im.crossOrigin = "anonymous";
      im.referrerPolicy = "no-referrer";
      var t = setTimeout(function () { ok(null); }, 4000);   // عکس کند یا در دسترس نبود: پوستر بدون عکس، نه گیر کردن
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

  function draw(p, img) {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    c.direction = "rtl"; c.textAlign = "right";
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0d1a13"); g.addColorStop(1, "#08110c");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // سربرگ
    c.fillStyle = "#f6f3ea"; c.font = "900 64px " + FONT; c.fillText("فرصت ملک", W - 80, 150);
    c.fillStyle = "#c9c4b4"; c.font = "500 34px " + FONT; c.fillText("ارزش واقعی ملک، محله به محله", W - 80, 205);
    // تصویر
    var iy = 270, ih = 860;
    c.save(); rr(c, 60, iy, W - 120, ih, 46); c.clip();
    if (img) {
      var s = Math.max((W - 120) / img.width, ih / img.height), dw = img.width * s, dh = img.height * s;
      c.drawImage(img, 60 + (W - 120 - dw) / 2, iy + (ih - dh) / 2, dw, dh);
    } else { c.fillStyle = "#14251b"; c.fillRect(60, iy, W - 120, ih); c.fillStyle = "#3d5a49"; c.font = "700 54px " + FONT; c.textAlign = "center"; c.fillText("بدون عکس", W / 2, iy + ih / 2); c.textAlign = "right"; }
    var sh = c.createLinearGradient(0, iy + ih - 260, 0, iy + ih); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.55)");
    c.fillStyle = sh; c.fillRect(60, iy, W - 120, ih);
    c.restore();
    // برچسب رده و امتیاز
    var lb = LB[p.label];
    if (lb) {
      c.font = "800 40px " + FONT; var bw = c.measureText(lb[0]).width + 64;
      rr(c, W - 100 - bw, iy + 40, bw, 76, 38); c.fillStyle = lb[1]; c.fill();
      c.fillStyle = lb[2]; c.fillText(lb[0], W - 132, iy + 92);
    }
    if (p.score != null) {
      c.beginPath(); c.arc(170, iy + 110, 70, 0, Math.PI * 2); c.fillStyle = "#e9b949"; c.fill();
      c.fillStyle = "#16120a"; c.font = "900 56px " + FONT; c.textAlign = "center"; c.fillText(FM.fa(p.score), 170, iy + 130);
      c.font = "700 22px " + FONT; c.fillText("امتیاز", 170, iy + 160); c.textAlign = "right";
    }
    // متن
    var y = iy + ih + 110;
    c.fillStyle = "#f6f3ea"; c.font = "900 62px " + FONT;
    wrap(c, p.title, W - 160, 2).forEach(function (l) { c.fillText(l, W - 80, y); y += 84; });
    c.fillStyle = "#b9b4a4"; c.font = "500 40px " + FONT;
    var meta = [p.loc, p.area ? FM.fa(p.area) + " متر" : "", p.rooms ? FM.fa(p.rooms) + " خواب" : ""].filter(Boolean).join("  |  ");
    c.fillText(meta, W - 80, y + 6); y += 100;
    var di = p.raw && p.raw.drop_info;
    if (di) {
      c.fillStyle = "#e0634b"; c.font = "700 44px " + FONT;
      var old = FM.money(di.prev); c.fillText(old, W - 80, y);
      var ow = c.measureText(old).width; c.fillRect(W - 80 - ow, y - 16, ow, 5);
      y += 86;
    }
    c.fillStyle = "#e9b949"; c.font = "900 76px " + FONT; c.fillText(p.priceText || FM.money(p.price * 1e6), W - 80, y); y += 90;
    if (p.diffText) { c.fillStyle = "#7fd9a5"; c.font = "800 46px " + FONT; c.fillText(p.diffText, W - 80, y); y += 70; }
    // پانویس
    c.fillStyle = "rgba(246,243,234,.12)"; c.fillRect(80, H - 210, W - 160, 2);
    c.fillStyle = "#f6f3ea"; c.font = "800 44px " + FONT; c.textAlign = "center";
    c.fillText("جزئیات و ارزش‌گذاری کامل در", W / 2, H - 135);
    c.fillStyle = "#e9b949"; c.font = "900 54px " + FONT; c.direction = "ltr"; c.fillText(location.host || "forsatmelk.ir", W / 2, H - 60);
    return cv;
  }

  function sheet(html) {
    var d = document.createElement("div"); d.className = "psheet"; d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true">' + html + "</div>";
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-x]")) d.remove(); });
    document.body.appendChild(d); return d;
  }

  FM.poster = function (p) {
    var d = sheet('<b class="psheet__t">پوستر استوری و کانال</b><div class="psheet__wait">در حال ساخت پوستر…</div><button type="button" class="psheet__x" data-x>بستن</button>');
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load("900 60px Vazirmatn").catch(function () {}) : Promise.resolve();
    function show(blob) {
      if (!blob) { d.querySelector(".psheet__wait").textContent = "ساخت پوستر در این مرورگر ممکن نشد."; return; }
      var url = URL.createObjectURL(blob), name = "forsatmelk-" + p.id + ".png";
      var file = window.File ? new File([blob], name, { type: "image/png" }) : null;
      var canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
      d.querySelector(".psheet__box").innerHTML = '<b class="psheet__t">پوستر استوری و کانال</b><img class="psheet__img" src="' + url + '" alt="پوستر">' +
        '<div class="psheet__row">' + (canShare ? '<button type="button" class="btn btn--gold" data-psh>اشتراک در استوری یا تلگرام</button>' : "") +
        '<a class="btn btn--ghost" href="' + url + '" download="' + name + '">ذخیرهٔ تصویر</a></div><button type="button" class="psheet__x" data-x>بستن</button>';
      var b = d.querySelector("[data-psh]");
      if (b) b.addEventListener("click", function () {
        navigator.share({ files: [file], title: p.title, text: p.title + " — " + location.origin + FM.propUrl(p.id) }).catch(function () {});
      });
    }
    function render(img) {
      try { draw(p, img).toBlob(show, "image/png"); }
      catch (err) { if (img) render(null); else show(null); }   // عکسِ دامنهٔ دیگر بوم را قفل کرد: پوستر بدون عکس
    }
    Promise.all([loadImg(p.img && p.img.indexOf("noimg") < 0 ? p.img : ""), fontReady]).then(function (r) { render(r[0]); });
  };

  /* دکمهٔ اشتراک کارت: پیوند یا پوستر */
  FM.shareSheet = function (p, url) {
    var d = sheet('<b class="psheet__t">اشتراک‌گذاری</b><div class="psheet__opts">' +
      '<button type="button" class="psheet__opt" data-o="link"><i>🔗</i><span><b>پیوند ملک</b><small>کپی پیوند یا فرستادن در پیام‌رسان</small></span></button>' +
      '<button type="button" class="psheet__opt" data-o="poster"><i>🖼</i><span><b>پوستر استوری و کانال</b><small>تصویر آماده با عکس، قیمت و ارزیابی فرصت ملک</small></span></button>' +
      '</div><button type="button" class="psheet__x" data-x>بستن</button>');
    d.addEventListener("click", function (e) {
      var o = e.target.closest("[data-o]"); if (!o) return;
      d.remove();
      if (o.dataset.o === "link") FM.share(url, p.title); else FM.poster(p);
    });
  };
})();
