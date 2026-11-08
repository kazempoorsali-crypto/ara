/* برگهٔ تحلیل آماری قیمت ملک (قابل چاپ و ذخیره به PDF با «چاپ ← ذخیره به‌صورت PDF»)
   ورودی فقط اعداد واقعی همان برآورد/آگهی است؛ هیچ عددی این‌جا ساخته نمی‌شود.
   مشترکان: برگهٔ کامل؛ مشاوران (VIP): با نام و تماس خود مشاور در پانویس؛ بدون اشتراک: پیش‌نمایش تار و دعوت به اشتراک.
   برآورد آماری است و کارشناسی رسمی نیست؛ این جمله روی خود برگه هم چاپ می‌شود. */
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
  var LS = "fmAgent";
  function agent() { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } }

  /* info: {title, place, rows:[[label, value]], ppm, basePpm, n, effects:[[label, pct]], note} */
  function html(info, ag) {
    var rows = (info.rows || []).map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("");
    var fx = (info.effects || []).map(function (e) { return "<li>" + esc(e[0]) + ": <b dir=\"ltr\">" + (e[1] >= 0 ? "+" : "−") + fa(Math.round(Math.abs(e[1]) * 1000) / 10).replace(".", "٫") + "٪</b></li>"; }).join("");
    var bar = "";
    if (info.ppm && info.basePpm) {
      var mx = Math.max(info.ppm, info.basePpm) * 1.1;
      bar = '<div class="bars"><div><span>قیمت هر متر این ملک</span><i style="width:' + (info.ppm / mx * 100).toFixed(1) + '%;background:#20976A"></i><b>' + money(info.ppm) + "</b></div>" +
        '<div><span>میانهٔ هر متر محله</span><i style="width:' + (info.basePpm / mx * 100).toFixed(1) + '%;background:#D5A626"></i><b>' + money(info.basePpm) + "</b></div></div>";
    }
    var d = new Date().toLocaleDateString("fa-IR", { dateStyle: "long" });
    return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>برگهٔ تحلیل قیمت ملک</title>' +
      '<style>@font-face{font-family:V;src:url(/assets/fonts/Vazirmatn-Variable.woff2) format("woff2-variations");font-weight:100 900}' +
      'body{font-family:V,Tahoma,sans-serif;color:#16241f;margin:0;padding:28px;background:#fff}.sh{max-width:760px;margin:auto;border:1.5px solid #15231e;border-radius:14px;padding:26px}' +
      'h1{margin:0 0 4px;font-size:22px}.sub{color:#5a6b63;margin:0 0 16px;font-size:13px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #d9dfdb;padding:8px 10px;text-align:right;font-size:14px}th{background:#f4f1e9;width:42%}' +
      '.bars{margin:14px 0}.bars div{display:grid;grid-template-columns:150px 1fr 140px;gap:10px;align-items:center;margin:6px 0;font-size:13px}.bars i{display:block;height:14px;border-radius:7px}' +
      'ul{margin:6px 0;padding-inline-start:18px;font-size:13.5px;line-height:2}.note{font-size:12px;color:#5a6b63;line-height:1.9;border-top:1px dashed #c9d1cc;padding-top:10px;margin-top:14px}' +
      '.ft{margin-top:14px;padding:10px 12px;border-radius:10px;background:#f4f1e9;font-size:13.5px}.brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:12px;color:#5a6b63}' +
      '@media print{body{padding:0}.noprint{display:none}}</style></head><body><div class="sh">' +
      '<div class="brand"><b>فرصت ملک · forsatmelk.ir</b><span>تاریخ: ' + d + "</span></div>" +
      "<h1>برگهٔ تحلیل آماری قیمت ملک</h1><p class=\"sub\">" + esc(info.title || "") + (info.place ? " — " + esc(info.place) : "") + "</p>" +
      "<table>" + rows + "</table>" + bar +
      (fx ? "<b>اثر مشخصات ملک بر قیمت هر متر</b><ul>" + fx + "</ul>" : "") +
      '<p class="note">این برگه بر پایهٔ ' + (info.n ? fa(info.n) + " آگهی معتبر همین محله و " : "") + "مدل آماری فرصت ملک تهیه شده است. برآورد آماری است و کارشناسی رسمی یا قیمت قطعی نیست؛ پیش از معامله بازدید، استعلام سند و مشورت با کارشناس رسمی لازم است." + (info.note ? " " + esc(info.note) : "") + "</p>" +
      (ag && ag.name ? '<div class="ft">ارائه‌دهندهٔ گزارش: <b>' + esc(ag.name) + "</b>" + (ag.phone ? " | شماره تماس: <b dir=\"ltr\">" + esc(ag.phone) + "</b>" : "") + "</div>" : "") +
      '<p class="noprint" style="text-align:center;margin-top:16px"><button onclick="print()" style="font:inherit;padding:10px 22px;border-radius:999px;border:0;background:#D5A626;font-weight:800;cursor:pointer">چاپ یا ذخیره به‌صورت PDF</button></p>' +
      "</div></body></html>";
  }

  function show(info, ag) {
    var w = window.open("", "_blank");
    if (!w) { alert("پنجرهٔ برگه باز نشد؛ اجازهٔ باز شدن پنجرهٔ تازه را بدهید."); return; }
    w.document.open(); w.document.write(html(info, ag)); w.document.close();
  }

  /* me: کاربر فعلی ({active, plan}); onSub: تابع باز کردن خرید اشتراک */
  function open(info, me, onSub) {
    me = me || {};
    if (!me.active) {
      var d = document.createElement("div");
      d.className = "psheet"; d.setAttribute("data-lenis-prevent", "");
      d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true"><b class="psheet__t">📄 برگهٔ تحلیل قیمت</b>' +
        '<div style="filter:blur(5px);pointer-events:none;user-select:none;padding:12px;border-radius:12px;border:1px solid rgba(127,127,127,.3);line-height:2">' +
        "<b>برگهٔ تحلیل آماری قیمت ملک</b><br>ارزش برآوردی: ۰٫۰ میلیارد تومان<br>قیمت هر متر: ۰۰ میلیون<br>میانهٔ محله: ۰۰ میلیون<br>اثر سن بنا، طبقه، آسانسور…</div>" +
        '<p style="margin:.4rem 0;line-height:1.9">برگهٔ قابل چاپ این تحلیل (و برای مشاوران، با نام و شمارهٔ خودشان) ویژهٔ مشترکان است.</p>' +
        '<button type="button" class="btn btn--gold" data-sub style="min-height:46px">💎 فعال‌سازی اشتراک</button><button type="button" class="psheet__x" data-x>بستن</button></div>';
      document.body.appendChild(d);
      d.addEventListener("click", function (e) {
        if (e.target === d || e.target.closest("[data-x]")) d.remove();
        if (e.target.closest("[data-sub]")) { d.remove(); onSub && onSub(); }
      });
      return;
    }
    if (me.plan !== "vip") return show(info, null);
    var ag = agent();
    var f = document.createElement("div");
    f.className = "psheet"; f.setAttribute("data-lenis-prevent", "");
    f.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true"><b class="psheet__t">📄 برگهٔ تحلیل قیمت با نام شما</b>' +
      '<label style="display:grid;gap:4px">نام مشاور یا دپارتمان املاک<input data-n value="' + esc(ag.name || "") + '" style="font:inherit;padding:10px;border-radius:10px;border:1px solid rgba(127,127,127,.4)"></label>' +
      '<label style="display:grid;gap:4px">شماره تماس<input data-p dir="ltr" value="' + esc(ag.phone || "") + '" style="font:inherit;padding:10px;border-radius:10px;border:1px solid rgba(127,127,127,.4)"></label>' +
      '<button type="button" class="btn btn--gold" data-go style="min-height:46px">ساخت برگه</button><button type="button" class="psheet__x" data-x>بستن</button></div>';
    document.body.appendChild(f);
    f.addEventListener("click", function (e) {
      if (e.target === f || e.target.closest("[data-x]")) f.remove();
      if (e.target.closest("[data-go]")) {
        var a = { name: f.querySelector("[data-n]").value.trim().slice(0, 80), phone: f.querySelector("[data-p]").value.trim().slice(0, 20) };
        try { localStorage.setItem(LS, JSON.stringify(a)); } catch (er) { /* */ }
        f.remove(); show(info, a);
      }
    });
  }
  window.FMPriceSheet = { open: open };
})();
