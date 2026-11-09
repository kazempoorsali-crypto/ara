/* استودیوی گزارش تحلیل قیمت ملک (برگهٔ کارشناسی گرافیکی با کارت ویزیت مشاور)
   یک بوم (canvas) واحد هم پیش‌نمایش است، هم تصویر PNG، هم برگهٔ چاپ A4؛ پس آنچه دیده می‌شود همان است که ذخیره و چاپ می‌شود.
   بدون کتابخانهٔ بیرونی (سرور در ایران است)؛ متن فارسی با خود canvas و قلم Vazirmatn سایت کشیده می‌شود.
   ورودی فقط اعداد واقعی همان برآورد/آگهی است؛ هیچ عددی این‌جا ساخته نمی‌شود و هر بخشی که داده ندارد کشیده نمی‌شود.
   مشترکان: استودیوی کامل؛ کارت ویزیت با نام مشاور: طرح VIP؛ بدون اشتراک: پیش‌نمایش تار و دعوت به اشتراک.
   برآورد آماری است و کارشناسی رسمی نیست؛ این جمله همیشه روی خود برگه کشیده می‌شود. */
(function () {
  "use strict";
  var fa = function (n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var money = function (v) {
    if (!v) return "—";
    if (v >= 1e9) return fa((Math.round(v / 1e8) / 10).toString()).replace(".", "٫") + " میلیارد تومان";
    if (v >= 1e6) return fa(Math.round(v / 1e6).toLocaleString("en-US")).replace(/,/g, "٬") + " میلیون تومان";
    return fa(Math.round(v).toLocaleString("en-US")).replace(/,/g, "٬") + " تومان";
  };
  var pctTxt = function (x) { return fa(Math.round(Math.abs(x) * 1000) / 10).replace(".", "٫") + "٪"; };
  var LS = "fmAgent", LSN = "fmSheetNote:";
  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* حالت خصوصی */ } }
  function agent() {
    var a = load(LS, {}) || {};
    return Object.assign({ name: "", role: "", dept: "", phone: "", social: "", theme: "light", card: true, ask: true, bars: true, table: true }, a);
  }

  /* پنج سطح ارزیابی سایت (همان رنگ‌های نوار شناسنامهٔ قیمت) از ارزان به گران */
  var LEVELS = [["فرصت طلایی", "#D5A626"], ["فرصت مناسب", "#20976A"], ["متعادل", "#6b7c76"], ["بالاتر از ارزش", "#E0531F"], ["غیرمنطقی", "#7a1118"]];
  var THEMES = {
    light: { bg: "#ffffff", panel: "#f4f1e9", ink: "#16241f", dim: "#5a6b63", line: "#d9dfdb", gold: "#B8890F", goldBg: "#D5A626", green: "#20976A", head: "#15231e", headInk: "#f4f1e9" },
    lux: { bg: "#0e1815", panel: "#15231e", ink: "#f4f1e9", dim: "#a9b4ae", line: "#2a3c35", gold: "#D5A626", goldBg: "#D5A626", green: "#3fbf8b", head: "#15231e", headInk: "#f4f1e9" },
  };
  THEMES.story = THEMES.lux;
  var FONT = "Vazirmatn, Tahoma, sans-serif";

  /* ---------- رسم برگه روی بوم ---------- */
  function wrap(ctx, text, max) {
    var words = String(text || "").split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* opt: تنظیمات استودیو؛ برمی‌گرداند ارتفاع منطقی کشیده‌شده */
  function paint(ctx, W, info, opt, note) {
    var T = THEMES[opt.theme] || THEMES.light, story = opt.theme === "story";
    var P = story ? 34 : 30, x0 = P, x1 = W - P, cw = x1 - x0, y = 0;
    var font = function (sz, wt) { ctx.font = (wt || 400) + " " + sz + "px " + FONT; };
    var text = function (t, x, yy, sz, wt, color, align) { font(sz, wt); ctx.fillStyle = color; ctx.textAlign = align || "right"; ctx.fillText(t, x, yy); };
    var para = function (t, sz, color, wt, lh) {
      font(sz, wt); ctx.fillStyle = color; ctx.textAlign = "right";
      wrap(ctx, t, cw).forEach(function (ln) { y += sz * (lh || 1.9); ctx.fillText(ln, x1, y - sz * .55); });
    };
    var section = function (t) { y += 22; text(t, x1, y + 16, story ? 19 : 17, 800, T.ink); y += 30; };
    ctx.direction = "rtl"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, 6000);

    /* سربرگ */
    var hh = story ? 150 : 118;
    ctx.fillStyle = T.head; ctx.fillRect(0, 0, W, hh);
    var g = ctx.createLinearGradient(0, 0, W, 0); LEVELS.slice().reverse().forEach(function (l, i) { g.addColorStop(i / 4, l[1]); });
    ctx.fillStyle = g; ctx.fillRect(0, hh - 5, W, 5);
    text("فرصت ملک", x1, 40, 15, 800, T.goldBg);
    text("forsatmelk.ir", x0, 40, 13, 600, "#c9d3ce", "left");
    text(new Date().toLocaleDateString("fa-IR", { dateStyle: "long" }), x0, 62, 12, 500, "#a9b4ae", "left");
    text("گزارش تحلیل آماری قیمت ملک", x1, story ? 90 : 76, story ? 27 : 23, 900, T.headInk);
    font(13, 500); var sub = (info.title || "") + (info.place ? " — " + info.place : "");
    ctx.fillStyle = "#c9d3ce"; ctx.textAlign = "right"; ctx.fillText(wrap(ctx, sub, cw)[0] || "", x1, story ? 124 : 100);
    y = hh + 10;

    /* گیج پنج‌رنگ: جای قیمت آگهی نسبت به برآورد بازار */
    if (info.delta != null && isFinite(info.delta)) {
      y += 14;
      var gy = y + 46, gx0 = x0 + 8, gx1 = x1 - 8, gw = gx1 - gx0, d = Math.max(-0.35, Math.min(0.35, info.delta));
      var gg = ctx.createLinearGradient(gx1, 0, gx0, 0);
      [0, .26, .5, .76, 1].forEach(function (s, i) { gg.addColorStop(s, LEVELS[i][1]); });
      rr(ctx, gx0, gy, gw, 16, 8); ctx.fillStyle = gg; ctx.fill();
      var mx = gx1 - (d + 0.35) / 0.7 * gw;
      ctx.beginPath(); ctx.arc(mx, gy + 8, 13, 0, 7); ctx.fillStyle = T.bg; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = T.ink; ctx.stroke();
      var lvl = info.levelName || "";
      var gap = info.delta < -0.005 ? pctTxt(info.delta) + " زیر برآورد بازار" : info.delta > 0.005 ? pctTxt(info.delta) + " بالاتر از برآورد بازار" : "هم‌سطح برآورد بازار";
      text(gap, x1, y + 24, story ? 24 : 21, 900, info.delta < 0 ? T.green : info.delta > 0.05 ? "#E0531F" : T.ink);
      if (lvl) text(lvl, x0, y + 24, 15, 800, T.gold, "left");
      LEVELS.forEach(function (l, i) { text(l[0], gx1 - gw * (i + .5) / 5, gy + 42, 11.5, 700, T.dim, "center"); });
      y = gy + 54;
    }

    /* کاشی‌های عدد اصلی */
    var tiles = [];
    if (opt.ask && info.ask) tiles.push(["قیمت اعلامی فروشنده", money(info.ask), T.ink]);
    if (info.fairLow && info.fairHigh) tiles.push(["بازهٔ ارزش برآوردی", money(info.fairLow).split(" ")[0] + " تا " + money(info.fairHigh), T.gold]);
    else if (info.fair) tiles.push(["ارزش منصفانهٔ برآوردی", money(info.fair), T.gold]);
    if (info.ask && info.fairLow && info.fairLow > info.ask) tiles.push(["فاصله تا کف بازه", money(info.fairLow - info.ask), T.green]);
    else if (info.ppm) tiles.push(["قیمت هر متر", money(info.ppm), T.ink]);
    if (tiles.length) {
      y += 16;
      var cols = story ? 1 : tiles.length, tw = (cw - (cols - 1) * 10) / cols, th = 74;
      tiles.forEach(function (t, i) {
        var r = story ? i : 0, c = story ? 0 : i, tx = x1 - (c + 1) * tw - c * 10, ty = y + r * (th + 10);
        rr(ctx, tx, ty, tw, th, 14); ctx.fillStyle = T.panel; ctx.fill();
        text(t[0], tx + tw - 14, ty + 26, 12.5, 600, T.dim);
        font(tiles.length > 2 && !story ? 15 : 18, 900); var s = t[1];
        while (ctx.measureText(s).width > tw - 24 && s.length > 4) s = s.slice(0, -1);
        text(s, tx + tw - 14, ty + 56, tiles.length > 2 && !story ? 15 : 18, 900, t[2]);
      });
      y += story ? tiles.length * (th + 10) : th;
    }

    /* نمودار میله‌ای مقایسه با همسایه‌ها (قیمت هر متر) با همان پنج رنگ */
    var cmp = (info.compare || []).filter(function (c) { return c && c[1] > 0; });
    if (opt.bars && cmp.length >= 2) {
      section("مقایسهٔ قیمت هر متر با همسایه‌ها");
      var base = info.basePpm || cmp[cmp.length - 1][1], max = Math.max.apply(null, cmp.map(function (c) { return c[1]; })) * 1.08;
      var lw = story ? 150 : 170, vw = 120, bx1 = x1 - lw, bw = cw - lw - vw;
      cmp.forEach(function (c) {
        var r = c[1] / base - 1, col = r <= -0.22 ? LEVELS[0][1] : r <= -0.08 ? LEVELS[1][1] : r < 0.08 ? LEVELS[2][1] : r < 0.3 ? LEVELS[3][1] : LEVELS[4][1];
        if (c[2] === "base") col = "#9AA3A0";
        var w = Math.max(6, c[1] / max * bw);
        text(c[0], x1, y + 17, 12.5, c[2] === "me" ? 900 : 600, c[2] === "me" ? T.ink : T.dim);
        rr(ctx, bx1 - w, y + 5, w, 16, 8); ctx.fillStyle = col; ctx.fill();
        if (c[2] === "me") { ctx.lineWidth = 2; ctx.strokeStyle = T.ink; ctx.stroke(); }
        text(money(c[1]), x0, y + 18, 12, 700, T.ink, "left");
        y += 28;
      });
    }

    /* جدول شناسنامهٔ قیمت */
    var rows = (info.rows || []).filter(function (r) { return r && r[1] && (opt.ask || !/^قیمت آگهی/.test(r[0])); });
    if (opt.table && rows.length) {
      section("شناسنامهٔ قیمت");
      rows.forEach(function (r, i) {
        font(13, 700); var lines = wrap(ctx, String(r[1]), cw * .52 - 16), h = Math.max(34, lines.length * 22 + 12);
        ctx.fillStyle = i % 2 ? T.bg : T.panel; ctx.fillRect(x0, y, cw, h);
        ctx.strokeStyle = T.line; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, y + .5, cw - 1, h - 1);
        text(r[0], x1 - 12, y + 22, 13, 600, T.dim);
        lines.forEach(function (ln, k) { text(ln, x0 + cw * .52 - 12, y + 22 + k * 22, 13, 800, T.ink); });
        y += h;
      });
    }

    /* دلایل تعدیل (اثر مشخصات بر قیمت هر متر، از مدل) */
    var fx = (info.effects || []).filter(function (e) { return Array.isArray(e) && e.length === 2 && Math.abs(e[1]) >= 0.005; }).slice(0, 8);
    if (fx.length) {
      section("دلایل تعدیل قیمت این ملک");
      var cx = x1;
      font(12.5, 700);
      fx.forEach(function (e) {
        var t = e[0] + "، " + pctTxt(e[1]) + (e[1] >= 0 ? " افزایش" : " کاهش"), w = ctx.measureText(t).width + 26;
        if (cx - w < x0) { cx = x1; y += 38; }
        rr(ctx, cx - w, y, w, 30, 15); ctx.fillStyle = e[1] >= 0 ? "rgba(32,151,106,.16)" : "rgba(224,83,31,.14)"; ctx.fill();
        text(t, cx - 13, y + 20, 12.5, 700, e[1] >= 0 ? T.green : "#E0531F");
        cx -= w + 8;
      });
      y += 38;
    }

    /* یادداشت مشاور */
    if (note) {
      section("یادداشت کارشناسی مشاور");
      var top = y; para(note, 13.5, T.ink, 500, 1.85);
      ctx.fillStyle = T.goldBg; ctx.fillRect(x1 + 6, top + 4, 3, y - top);
    }

    /* سلب مسئولیت (همیشه) */
    y += 16; ctx.strokeStyle = T.line; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]); y += 4;
    para("این برگه بر پایهٔ " + (info.n ? fa(info.n) + " آگهی معتبر همین محله و " : "") + "مدل آماری فرصت ملک تهیه شده است. برآورد آماری است و کارشناسی رسمی نیست؛ پیش از معامله بازدید، استعلام سند و مشورت با کارشناس رسمی لازم است.", 11.5, T.dim, 500, 1.8);

    /* کارت ویزیت مشاور */
    if (opt.card && info.agentOk && (opt.name || opt.phone)) {
      y += 14;
      var ch = 92 + (opt.social ? 18 : 0);
      rr(ctx, x0, y, cw, ch, 16); ctx.fillStyle = T.head; ctx.fill();
      ctx.strokeStyle = T.goldBg; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x1 - 44, y + 46, 28, 0, 7); ctx.fillStyle = T.goldBg; ctx.fill();
      text((opt.name || "م").trim().charAt(0), x1 - 44, y + 56, 24, 900, "#191307", "center");
      text(opt.name || "", x1 - 86, y + 36, 17, 900, "#f4f1e9");
      text([opt.role, opt.dept].filter(Boolean).join(" · "), x1 - 86, y + 60, 12.5, 600, "#c9d3ce");
      if (opt.social) { var ltr = /^[\x00-\x7F]+$/.test(opt.social); if (ltr) ctx.direction = "ltr"; text(opt.social, x1 - 86, y + 82, 12, 600, "#a9b4ae"); ctx.direction = "rtl"; }
      if (opt.phone) { ctx.direction = "ltr"; text("☎ " + opt.phone, x0 + 16, y + 52, 17, 800, T.goldBg, "left"); ctx.direction = "rtl"; }
      y += ch;
    }
    y += P;
    return story ? Math.max(y, W * 16 / 9) : y;
  }

  var S = 2;   // کیفیت: هر واحد منطقی دو پیکسل (تصویر ۱۲۰۰ پیکسلی)
  function render(canvas, info, opt, note) {
    var W = opt.theme === "story" ? 540 : 600;
    var tmp = document.createElement("canvas"); tmp.width = W * S; tmp.height = 3200 * S;
    var t = tmp.getContext("2d"); t.scale(S, S);
    var h = Math.ceil(paint(t, W, info, opt, note));
    canvas.width = W * S; canvas.height = h * S;
    var c = canvas.getContext("2d");
    c.fillStyle = (THEMES[opt.theme] || THEMES.light).bg; c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(tmp, 0, 0, W * S, Math.min(h, 3200) * S, 0, 0, W * S, Math.min(h, 3200) * S);
    return canvas;
  }
  function blobOf(canvas) { return new Promise(function (ok) { canvas.toBlob(function (b) { ok(b); }, "image/png"); }); }
  function download(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }

  /* چاپ A4: همان تصویر پیش‌نمایش در یک صفحهٔ A4 (رنگ‌ها دقیق) */
  function printA4(canvas) {
    var url = canvas.toDataURL("image/png");
    var w = window.open("", "_blank");
    if (!w) { alert("پنجرهٔ چاپ باز نشد؛ اجازهٔ باز شدن پنجرهٔ تازه را بدهید."); return; }
    w.document.open();
    w.document.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش تحلیل قیمت ملک — فرصت ملک</title>' +
      "<style>@page{size:A4;margin:8mm}html,body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "#appraisalSheetPreview{display:block;margin:0 auto;max-width:100%;max-height:281mm;object-fit:contain}" +
      "@media screen{body{padding:16px;background:#e9e6de}#appraisalSheetPreview{box-shadow:0 10px 30px rgba(0,0,0,.2)}}</style></head>" +
      '<body><img id="appraisalSheetPreview" src="' + url + '" alt="گزارش تحلیل قیمت ملک"></body></html>');
    w.document.close();
    var im = w.document.getElementById("appraisalSheetPreview");
    var go = function () { setTimeout(function () { w.focus(); w.print(); }, 120); };
    if (im.complete) go(); else im.onload = go;
  }

  /* ---------- پنجرهٔ استودیو ---------- */
  function noteKey(info) { return LSN + (info.id || ((info.title || "") + "|" + (info.place || ""))).slice(0, 120); }
  function studio(info, me, onSub) {
    var opt = agent(), vip = me && me.plan === "vip";
    info = Object.assign({}, info, { agentOk: vip });
    var note = load(noteKey(info), "") || "";
    var d = document.createElement("div");
    d.className = "psheet psheet--studio"; d.setAttribute("data-lenis-prevent", "");
    var inp = function (k, label, ph, ltr) { return '<label class="pst__f"><span>' + label + '</span><input data-k="' + k + '"' + (ltr ? ' dir="ltr"' : "") + ' maxlength="80" placeholder="' + ph + '" value="' + esc(opt[k] || "") + '"' + (vip ? "" : " disabled") + "></label>"; };
    var tg = function (k, label) { return '<label class="pst__t"><input type="checkbox" data-t="' + k + '"' + (opt[k] ? " checked" : "") + "><span>" + label + "</span></label>"; };
    d.innerHTML = '<div class="psheet__box pst" role="dialog" aria-modal="true" aria-label="استودیوی گزارش کارشناسی">' +
      '<div class="pst__head"><b class="psheet__t">📄 استودیوی گزارش تحلیل قیمت</b><button type="button" class="psheet__x" data-x>بستن ✕</button></div>' +
      '<div class="pst__grid"><div class="pst__view"><canvas id="appraisalSheetPreview" aria-label="پیش‌نمایش گزارش"></canvas></div>' +
      '<div class="pst__side">' +
      '<div class="pst__acts"><button type="button" class="btn btn--gold" data-save>📥 ذخیره تصویر در گوشی/گالری</button>' +
      '<button type="button" class="btn btn--ghost" data-share>📤 ارسال در پیام‌رسان‌ها</button>' +
      '<div class="pst__apps"><button type="button" data-app="wa">واتساپ</button><button type="button" data-app="tg">تلگرام</button><button type="button" data-app="bale">بله</button><button type="button" data-copy>کپی تصویر</button></div>' +
      '<button type="button" class="btn btn--ghost" data-print>🖨️ چاپ / PDF (A4)</button><p class="pst__msg" data-msg aria-live="polite"></p></div>' +
      '<div class="pst__sec"><b>تم برگه</b><div class="pst__seg" data-pst-theme>' +
      [["light", "رسمی روشن"], ["lux", "لوکس تیره‌طلایی"], ["story", "استوری عمودی"]].map(function (t) { return '<button type="button" data-v="' + t[0] + '"' + (opt.theme === t[0] ? ' class="is-on"' : "") + ">" + t[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="pst__sec"><b>بخش‌ها</b><div class="pst__tgs">' + tg("card", "کارت ویزیت") + tg("ask", "قیمت اعلامی فروشنده") + tg("bars", "نمودار میله‌ای") + tg("table", "جدول شناسنامه") + "</div></div>" +
      '<div class="pst__sec"><b>یادداشت کارشناسی این ملک</b><textarea data-note rows="3" maxlength="600" placeholder="مثلاً: بازدید شد؛ نورگیر جنوبی، نیاز به نوسازی آشپزخانه.">' + esc(note) + "</textarea></div>" +
      '<div class="pst__sec"><b>کارت ویزیت مشاور</b>' + (vip ? "" : '<small class="pst__vip">کارت ویزیت با نام و تماس شما ویژهٔ طرح VIP است.</small>') +
      '<div class="pst__fs">' + inp("name", "نام مشاور", "نام و نام خانوادگی") + inp("role", "سمت", "مثلاً کارشناس فروش") + inp("dept", "نام دپارتمان / املاک", "نام مجموعه") +
      inp("phone", "تلفن", "0912…", true) + inp("social", "آیدی شبکهٔ اجتماعی یا آدرس", "@id یا نشانی") + "</div></div>" +
      "</div></div></div>";
    document.body.appendChild(d);
    var cv = d.querySelector("#appraisalSheetPreview"), msg = d.querySelector("[data-msg]"), tmr = null;
    var say = function (h) { msg.innerHTML = h; };
    var draw = function () { render(cv, info, opt, note.trim()); };
    var later = function () { clearTimeout(tmr); tmr = setTimeout(function () { save(LS, opt); save(noteKey(info), note); draw(); }, 160); };
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load("900 20px Vazirmatn"), document.fonts.load("500 13px Vazirmatn")]).catch(function () {}) : Promise.resolve();
    ready.then(draw);
    var close = function () { d.remove(); if (FM && FM.startScroll) FM.startScroll(); };
    if (window.FM && FM.stopScroll) FM.stopScroll();
    var fname = function () { return "forsatmelk-gozaresh-" + new Date().toISOString().slice(0, 10) + ".png"; };
    d.addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-k");
      if (k) { opt[k] = e.target.value.slice(0, 80); later(); }
      if (e.target.hasAttribute("data-note")) { note = e.target.value.slice(0, 600); later(); }
    });
    d.addEventListener("change", function (e) { var k = e.target.getAttribute("data-t"); if (k) { opt[k] = e.target.checked; later(); } });
    d.addEventListener("click", function (e) {
      if (e.target === d || e.target.closest("[data-x]")) return close();
      var th = e.target.closest("[data-pst-theme] button");
      if (th) { opt.theme = th.dataset.v; d.querySelectorAll("[data-pst-theme] button").forEach(function (b) { b.classList.toggle("is-on", b === th); }); later(); return; }
      if (e.target.closest("[data-save]")) { draw(); blobOf(cv).then(function (b) { download(b, fname()); say("تصویر با کیفیت بالا ذخیره شد ✓"); }); return; }
      if (e.target.closest("[data-print]")) { draw(); printA4(cv); return; }
      if (e.target.closest("[data-copy]")) {
        draw();
        blobOf(cv).then(function (b) {
          if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext) {
            navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).then(function () { say("تصویر کپی شد ✓ در گفت‌وگو بچسبانید."); },
              function () { download(b, fname()); say("کپی تصویر در این مرورگر ممکن نشد؛ تصویر ذخیره شد."); });
          } else { download(b, fname()); say("کپی تصویر در این مرورگر ممکن نیست؛ تصویر ذخیره شد."); }
        });
        return;
      }
      var app = e.target.closest("[data-app]");
      if (app || e.target.closest("[data-share]")) {
        draw();
        blobOf(cv).then(function (b) {
          var cap = "گزارش تحلیل آماری قیمت ملک" + (info.place ? " — " + info.place : "") + "\nhttps://forsatmelk.ir";
          if (app && window.FM && FM.sendImage) return FM.sendImage(app.dataset.app, { png: b }, "gozaresh", cap, say);
          var file = window.File ? new File([b], fname(), { type: "image/png" }) : null;
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            return navigator.share({ files: [file], title: "گزارش تحلیل قیمت ملک" }).catch(function (err) {
              if (err && err.name === "AbortError") return;
              download(b, fname()); say("اشتراک مستقیم ممکن نشد؛ تصویر ذخیره شد.");
            });
          }
          download(b, fname()); say("این مرورگر ارسال مستقیم فایل ندارد؛ تصویر ذخیره شد. از دکمه‌های واتساپ، تلگرام یا بله هم می‌توانید استفاده کنید.");
        });
      }
    });
    document.addEventListener("keydown", function esc2(e) { if (e.key === "Escape" && document.body.contains(d)) { document.removeEventListener("keydown", esc2); close(); } });
  }

  /* بدون اشتراک: همان پیش‌نمایش گرافیکی، تار، با دعوت به اشتراک (هیچ عددی کشیده نمی‌شود) */
  function teaser(info, onSub) {
    var d = document.createElement("div");
    d.className = "psheet"; d.setAttribute("data-lenis-prevent", "");
    d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true"><b class="psheet__t">📄 استودیوی گزارش تحلیل قیمت</b>' +
      '<div class="pst__blur"><canvas aria-hidden="true"></canvas></div>' +
      '<p style="margin:.4rem 0;line-height:1.9">گزارش گرافیکی این تحلیل (گیج ارزیابی، نمودار مقایسه با همسایه‌ها، شناسنامهٔ قیمت) با خروجی تصویر، ارسال در پیام‌رسان و چاپ A4 ویژهٔ مشترکان است؛ مشاوران VIP نام و کارت ویزیت خود را هم پای آن می‌گذارند.</p>' +
      '<button type="button" class="btn btn--gold" data-sub style="min-height:46px">💎 فعال‌سازی اشتراک</button><button type="button" class="psheet__x" data-x>بستن</button></div>';
    document.body.appendChild(d);
    // نمونهٔ ساختار بدون عدد: فقط سربرگ و قالب
    render(d.querySelector("canvas"), { title: info.title, place: info.place, rows: [["…", "۰۰۰"], ["…", "۰۰۰"], ["…", "۰۰۰"]] }, { theme: "light", table: true, bars: false, ask: false, card: false }, "");
    d.addEventListener("click", function (e) {
      if (e.target === d || e.target.closest("[data-x]")) d.remove();
      if (e.target.closest("[data-sub]")) { d.remove(); onSub && onSub(); }
    });
  }

  /* info: {id, title, place, ask, fair, fairLow, fairHigh, delta, levelName, ppm, basePpm, n, rows:[[label, value]],
            compare:[[label, ppm, "me"|"base"|""]], effects:[[label, pct]]}
     me: کاربر فعلی ({active, plan}); onSub: تابع باز کردن خرید اشتراک */
  function open(info, me, onSub) {
    me = me || {};
    if (!me.active) return teaser(info || {}, onSub);
    studio(info || {}, me, onSub);
  }
  window.FMPriceSheet = { open: open, render: render };
})();
