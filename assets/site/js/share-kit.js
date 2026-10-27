/* اشتراک‌گذاری مطمئن برای هر دو بخش سایت (صفحه‌های تازه و موتور جست‌وجو/صفحهٔ ملک):
   - پنجرهٔ «اشتراک پیوند»: کپی پیوند (با روش جایگزین وقتی Clipboard در دسترس نیست)، اشتراک خود گوشی، تلگرام، واتساپ
   - اگر FM (صفحه‌های تازه) نیست، ابزارهای لازم پوستر از روی UI موتور قدیمی ساخته می‌شوند */
(function () {
  "use strict";
  var FM = window.FM = window.FM || {};
  var U = window.UI || (typeof UI !== "undefined" ? UI : null);   // UI موتور قدیمی با const تعریف شده
  var DIG = "۰۱۲۳۴۵۶۷۸۹";
  if (!FM.fa) FM.fa = function (n) { return String(n).replace(/\d/g, function (d) { return DIG[d]; }); };
  if (!FM.esc) FM.esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  if (!FM.money) FM.money = function (v) { var m = U && U.money ? U.money(v) : null; return m ? m + " تومان" : ""; };
  if (!FM.propUrl) FM.propUrl = function (id) { return "/ad/" + encodeURIComponent(id); };
  /* وضعیت اشتراک از هر منبعی که در صفحه هست (صفحه‌های تازه، موتور قدیمی، نشانهٔ is-sub روی html) تا قفل‌ها در موبایل و دسکتاپ یکسان باشد */
  /* DataLayer موتور قدیمی با const تعریف شده و روی window نیست؛ با نامش خوانده می‌شود */
  function DL() { try { return typeof DataLayer !== "undefined" ? DataLayer : null; } catch (e) { return null; } }
  FM.isSub = function () {
    var dl = DL(), a = dl && dl.me, b = FM.api && FM.api.me;
    return !!((a && a.active) || (b && b.active) || document.documentElement.classList.contains("is-sub"));
  };
  /* اگر حساب هنوز از سرور نیامده، کمی صبر می‌کنیم تا پوستر با قفل اشتباه باز نشود */
  FM.meReady = function () {
    if (FM.isSub()) return Promise.resolve();
    var jobs = [];
    try { if (FM.api && FM.api.refreshMe && FM.api.token && FM.api.token.get && FM.api.token.get() && !FM.api.me) jobs.push(FM.api.refreshMe()); } catch (e) {}
    try { var dl = DL(); if (dl && dl.refreshMe && !dl.me) jobs.push(dl.refreshMe()); } catch (e) {}
    if (!jobs.length) return Promise.resolve();
    return Promise.race([Promise.all(jobs).catch(function () {}), new Promise(function (ok) { setTimeout(ok, 2500); })]);
  };
  function toast(m) {
    if (FM.toast) return FM.toast(m);
    if (U && U.toast) return U.toast(m);
    var t = document.createElement("div"); t.className = "fm-toast is-on"; t.textContent = m;
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1300;background:#13201c;color:#fff;padding:.6rem 1.1rem;border-radius:999px;font:inherit;font-size:.9rem";
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }

  /* کپی متن: Clipboard API و اگر نشد textarea + execCommand (مرورگرهای داخل برنامه‌ها) */
  FM.copyText = function (text) {
    function legacy() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0"; document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove(); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
  };

  /* دکمهٔ «برگشت» گوشی/مرورگر هر پنجرهٔ باز را می‌بندد (نه صفحهٔ زیر آن را):
     هر پنجره یک قدم در تاریخچه می‌گذارد؛ برگشت فقط بالاترین پنجره را می‌بندد و بستن با دکمه هم آن قدم را برمی‌دارد */
  var stack = [], ignore = 0, seq = 0, leaving = false;
  window.addEventListener("pagehide", function () { leaving = true; });
  function popOurs(ids) {   // اگر هنوز روی قدم همین پنجره‌ایم، برمی‌گردیم (اگر صفحه در حال رفتن یا نشانی عوض شده باشد، نه)
    setTimeout(function () {
      var cur = history.state && history.state.fmSheet;
      if (leaving || !cur || ids.indexOf(cur) < 0) return;
      ignore++; history.go(-(ids.indexOf(cur) + 1));
    }, 0);
  }
  FM.backable = function (el, close) {
    var it = { el: el, close: close, done: false, id: ++seq + "." + Date.now() };
    stack.push(it);
    try { history.pushState({ fmSheet: it.id }, "", location.href); } catch (e) { it.id = null; }
    return function dismiss() {
      if (it.done) return; it.done = true;
      var i = stack.indexOf(it); if (i >= 0) stack.splice(i, 1);
      close();
      if (it.id) popOurs([it.id]);
    };
  };
  FM.modalOpen = function () { return stack.length > 0; };
  /* تمام‌صفحهٔ ویدیو (صفحهٔ اول، مقاله‌ها): دکمهٔ «برگشت» گوشی فقط از تمام‌صفحه بیرون می‌آید و از سایت خارج نمی‌شود؛
     با ورود به تمام‌صفحه یک قدم در تاریخچهٔ همین صفحه ثبت می‌شود و اگر کاربر خودش بیرون آمد، همان قدم برداشته می‌شود */
  (function () {
    var fsDismiss = null;
    function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function onFs() {
      if (fsEl() && !fsDismiss) {
        fsDismiss = FM.backable(fsEl(), function () {
          fsDismiss = null;
          if (!fsEl()) return;
          if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        });
      } else if (!fsEl() && fsDismiss) {
        var d = fsDismiss; fsDismiss = null; d();
      }
    }
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
  })();
  /* بستن همهٔ پنجره‌های روی هم (مثلاً بعد از کپی موفق پیوند) */
  FM.closeSheets = function () {
    var ids = [];
    while (stack.length) { var it = stack.shift(); it.done = true; it.close(true); if (it.id) ids.push(it.id); }
    if (ids.length) popOurs(ids);
  };
  window.addEventListener("popstate", function (e) {
    if (ignore > 0) { ignore--; e.stopImmediatePropagation(); return; }
    var it = stack.pop();
    if (it) { it.done = true; it.close(); e.stopImmediatePropagation(); return; }
    // قدم باقی‌ماندهٔ پنجره‌ای که قبلاً بسته شده: بی‌اثر رد می‌شود تا یک «برگشت» هدر نرود
    if (e.state && e.state.fmSheet) { e.stopImmediatePropagation(); history.back(); }
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && stack.length && !document.querySelector("dialog[open]")) { e.preventDefault(); history.back(); }
  });

  /* پنجرهٔ پایین‌صفحه (psheet) با پشتیبانی برگشت؛ onClosed وقتی صدا زده می‌شود که پنجره بسته شد (برای نشان دادن دوبارهٔ منوی قبلی) */
  FM.sheet = function (html, onClosed) {
    var d = document.createElement("div"); d.className = "psheet"; d.innerHTML = '<div class="psheet__box" role="dialog" aria-modal="true" data-lenis-prevent>' + html + "</div>";
    document.body.appendChild(d);
    d.close = FM.backable(d, function (all) { d.remove(); if (onClosed && !all) onClosed(); });
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-x]")) d.close(); });
    return d;
  };
  /* زیرمنو: منوی فعلی پنهان می‌شود و با «برگشت» یا «بستن» زیرمنو دوباره دیده می‌شود */
  FM.subSheet = function (parent) {
    parent.style.display = "none";
    return function () { if (document.body.contains(parent)) parent.style.display = ""; };
  };
  var sheet = FM.sheet;
  FM.isMobile = function () { return mobile(); };
  var mobile = function () { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent); };
  /* پیام‌رسان‌ها: تلگرام و واتساپ پیوند اشتراک مستقیم دارند (در گوشی پیوند خودشان، در دسکتاپ برنامهٔ نصب‌شده چون نسخهٔ وب اغلب باز نمی‌شود)؛
     بله، روبیکا و اینستاگرام پیوند اشتراک عمومی ندارند: در گوشی فهرست اشتراک خود گوشی (با انتخاب همان برنامه)،
     در دسکتاپ متن و پیوند کپی می‌شود و نسخهٔ وب همان برنامه باز می‌شود تا در گفت‌وگو بچسبانید */
  var APPS = [
    ["ig", "اینستاگرام", "#d6297a", "IG"],
    ["tg", "تلگرام", "#2aa3df", "TG"],
    ["wa", "واتساپ", "#25b45b", "WA"],
    ["bale", "بله", "#2bb3a3", "ب"],
    ["eitaa", "ایتا", "#f08a24", "ا"],
    ["rubika", "روبیکا", "#7b4bd6", "ر"],
  ];
  var WEB = { bale: "https://web.bale.ai/", eitaa: "https://web.eitaa.com/", rubika: "https://web.rubika.ir/", ig: "https://www.instagram.com/direct/inbox/",
    tg: "https://web.telegram.org/", wa: "https://web.whatsapp.com/" };
  FM.appGrid = function () {
    return '<div class="psheet__apps">' + APPS.map(function (a) {
      return '<button type="button" class="psheet__app" data-app="' + a[0] + '"><i style="background:' + a[2] + '">' + a[3] + "</i><span>" + a[1] + "</span></button>";
    }).join("") + "</div>";
  };
  FM.appName = function (app) { return (APPS.filter(function (a) { return a[0] === app; })[0] || [])[1] || ""; };
  /* فرستادن پوستر (و متن و پیوند آگهی) به یک برنامه. img = { png, jpg }
     گوشی: فهرست اشتراک خود گوشی با فایل تصویر (JPEG که اینستاگرام، استوری و دایرکت راحت‌تر می‌پذیرند)؛
       در اندروید متن و پیوند هم همراه عکس می‌رود (تلگرام، واتساپ، بله و ایتا آن را زیر عکس می‌گذارند)؛
       در آیفون متن همراه فایل باعث می‌شود فایل نادیده گرفته شود، پس فقط فایل می‌رود و متن کپی می‌شود.
     دسکتاپ: تصویر (همراه متن) در حافظه کپی می‌شود تا در گفت‌وگو با Ctrl+V بچسبد؛ تلگرام و واتساپ اول برنامهٔ نصب‌شده
       (با متن و پیوند آماده) و اگر باز نشد نسخهٔ وب؛ بقیه نسخهٔ وب */
  FM.sendImage = function (app, img, id, caption, say) {
    var label = FM.appName(app) || "برنامهٔ موردنظر";
    if (mobile()) {
      var jpg = img.jpg || img.png, file = window.File && jpg ? new File([jpg], "forsatmelk-" + id + (img.jpg ? ".jpg" : ".png"), { type: jpg.type }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent), data = { files: [file], title: "" };
        if (!ios) data.text = caption;
        if (!data.text || !navigator.canShare(data)) delete data.text;
        FM.copyText(caption);
        say("برنامه را از فهرست گوشی انتخاب کنید؛ در اینستاگرام «دایرکت/Chats»، «استوری» یا «پست» را همان‌جا بزنید. متن و پیوند آگهی هم کپی شد.");
        return navigator.share(data).catch(function (err) {
          if (err && err.name === "AbortError") return;
          if (err && err.name === "NotAllowedError") return say("پوستر آماده شد؛ یک بار دیگر روی دکمه بزنید.");
          dl(jpg, file.name); say("اشتراک مستقیم ممکن نشد؛ تصویر در گالری ذخیره شد و متن کپی شد.");
        });
      }
      dl(jpg, "forsatmelk-" + id + ".jpg"); FM.copyText(caption);
      return say("تصویر ذخیره شد و متن کپی شد؛ " + label + " را باز کنید و تصویر را از گالری بفرستید.");
    }
    // فقط خود تصویر در حافظه (اگر متن هم کنارش باشد، بعضی برنامه‌ها با Ctrl+V متن را می‌چسبانند نه عکس را)
    var copied = false;
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext && img.png) {
        navigator.clipboard.write([new ClipboardItem({ "image/png": img.png })]).then(function () { copied = true; }, function () {});
      }
    } catch (e) {}
    var opened = openDesk(app, caption), withText = app === "tg" || app === "wa" || app === "eitaa";
    setTimeout(function () {
      if (!copied && img.png) dl(img.png, "forsatmelk-" + id + ".png");
      // مرورگر نمی‌تواند خودش عکس را در گفت‌وگوی برنامه بگذارد؛ قدم‌ها روشن و درشت نوشته می‌شود
      say('<b class="share-steps__t">' + (copied ? "پوستر کپی شد ✓" : "پوستر ذخیره شد ✓") + " حالا در " + label + ":</b>" +
        '<ol class="share-steps">' +
        "<li>مخاطب، گروه یا کانال را انتخاب کنید" + (withText ? " (متن و پیوند آگهی در کادر پیام آماده است)" : "") + "</li>" +
        (copied ? "<li>در کادر پیام <kbd>Ctrl</kbd>+<kbd>V</kbd> بزنید تا <b>پوستر</b> بیاید" + (withText ? "؛ متن و پیوند زیر عکس می‌رود" : "") + "</li>"
          : "<li>فایل پوستر ذخیره‌شده را در گفت‌وگو بکشید یا پیوست کنید</li>") +
        "<li>ارسال را بزنید</li></ol>" +
        (withText ? '<small class="share-steps__s">اگر بدون چسباندن پوستر «ارسال» را بزنید، فقط پیوند فرستاده می‌شود.</small>' : "") +
        (WEB[app] && !opened ? ' <a href="' + WEB[app] + '" target="_blank" rel="noopener">باز کردن ' + label + " وب</a>" : ""));
    }, 450);
    function dl(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  };
  /* دسکتاپ: تلگرام و واتساپ اول برنامهٔ نصب‌شده؛ اگر پنجره فوکوس را از دست نداد (برنامه باز نشد) نسخهٔ وب */
  function openDesk(app, caption) {
    if (!app) return false;
    var lines = caption.split("\n"), url = lines.pop(), title = lines.join(" ");
    // تلگرام، ایتا (نسخهٔ دسکتاپ آن هم برنامهٔ نصبی دارد) و واتساپ: اول برنامهٔ نصب‌شده با متن و پیوند آماده؛ اگر باز نشد نسخهٔ وب
    var NATIVE = {
      tg: "tg://msg_url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title),
      eitaa: "eitaa://msg_url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title),
      wa: "whatsapp://send?text=" + encodeURIComponent(caption),
    };
    if (NATIVE[app]) {
      var web = app === "wa" ? "https://web.whatsapp.com/send?text=" + encodeURIComponent(caption) : WEB[app];
      var left = false, onBlur = function () { left = true; };
      window.addEventListener("blur", onBlur);
      location.href = NATIVE[app];
      setTimeout(function () {
        window.removeEventListener("blur", onBlur);
        if (!left && !document.hidden) window.open(web, "_blank");
      }, 1600);
      return true;
    }
    return !!(WEB[app] && window.open(WEB[app], "_blank"));
  }
  function hint(d, html) {
    var h = d.querySelector(".psheet__hint");
    if (!h) { h = document.createElement("p"); h.className = "psheet__hint"; var at = d.querySelector(".psheet__apps") || d.querySelector(".psheet__url"); if (at) at.after(h); else d.querySelector(".psheet__box").appendChild(h); }
    h.innerHTML = html;
  }
  /* opts.onInstagram: برای آگهی، اینستاگرام یعنی پوستر تصویری (پیوند در پست اینستاگرام کار نمی‌کند) */
  FM.shareApp = function (d, app, url, title, opts) {
    var text = title + "\n" + url, name = (APPS.filter(function (a) { return a[0] === app; })[0] || [])[1] || "";
    if (app === "ig" && opts && opts.onInstagram) return opts.onInstagram();
    if (app === "tg" || app === "wa") {
      var web = app === "tg" ? "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title)
        : (mobile() ? "https://wa.me/?text=" : "https://web.whatsapp.com/send?text=") + encodeURIComponent(text);
      if (mobile()) { location.href = web; return; }
      location.href = app === "tg" ? "tg://msg_url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title) : "whatsapp://send?text=" + encodeURIComponent(text);
      return hint(d, "اگر برنامهٔ " + name + " روی این رایانه باز نشد: <a href=\"" + FM.esc(web) + "\" target=\"_blank\" rel=\"noopener\">" + name + " وب</a>");
    }
    // بله، روبیکا، اینستاگرام (بدون پوستر)
    if (mobile() && navigator.share) {
      FM.copyText(text);
      toast("در فهرست باز شده «" + name + "» را انتخاب کنید");
      return navigator.share({ title: title, text: title, url: url }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        toast("پیوند کپی شد؛ در " + name + " بچسبانید");
      });
    }
    if (app === "eitaa") {   // ایتای دسکتاپ برنامهٔ نصبی دارد: اول همان (با متن و پیوند)، وگرنه نسخهٔ وب
      openDesk("eitaa", text);
      return hint(d, "ایتا با متن و پیوند آماده باز شد؛ مخاطب را انتخاب و ارسال کنید. اگر برنامه نصب نباشد، نسخهٔ وب باز می‌شود.");
    }
    FM.copyText(text).then(function (ok) {
      var w = window.open(WEB[app], "_blank", "noopener");
      hint(d, (ok ? "متن و پیوند کپی شد ✓ " : "") + "در " + name + " گفت‌وگوی موردنظر را باز کنید و بچسبانید (Ctrl+V)." +
        (w ? "" : " <a href=\"" + WEB[app] + "\" target=\"_blank\" rel=\"noopener\">باز کردن " + name + " وب</a>"));
    });
  };
  function copyRow(url, poster) {
    return '<div class="psheet__opts">' +
      (navigator.share && mobile() ? '<button type="button" class="psheet__opt psheet__opt--main" data-l="native"><i>📤</i><span><b>اشتراک با برنامه‌های گوشی</b><small>' + (poster ? "پوستر آگهی همراه متن و پیوند؛ اینستاگرام، تلگرام، واتساپ، بله، ایتا، روبیکا و…" : "اینستاگرام، تلگرام، واتساپ، بله، ایتا، روبیکا و…") + "</small></span></button>" : "") +
      '<button type="button" class="psheet__opt" data-l="copy"><i>📋</i><span><b>کپی پیوند</b><small>برای چسباندن در هر جا</small></span></button>' +
      "</div>";
  }
  /* رفتار مشترک گزینه‌ها؛ هم پنجرهٔ «اشتراک پیوند» و هم منوی اشتراک آگهی از آن استفاده می‌کنند */
  FM.bindShare = function (d, url, title, opts) {
    d.addEventListener("click", function (e) {
      var ap = e.target.closest("[data-app]");
      if (ap) {   // آگهی با پوستر آماده: خود پوستر همراه متن و پیوند به همان برنامه می‌رود
        var img = opts && opts.image && opts.image();
        if (img) return FM.sendImage(ap.dataset.app, img, opts.id, title + "\n" + url, function (t) { hint(d, t); });
        return FM.shareApp(d, ap.dataset.app, url, title, opts);
      }
      var o = e.target.closest("[data-l]"); if (!o) return;
      if (o.dataset.l === "copy") {
        FM.copyText(url).then(function (ok) {
          if (ok) { toast("پیوند کپی شد ✓"); FM.closeSheets(); }
          else {
            var u = d.querySelector(".psheet__url");
            if (u) { var r = document.createRange(); r.selectNodeContents(u); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
            toast("پیوند را انتخاب کردیم؛ نگه دارید و «کپی» را بزنید");
          }
        });
      } else if (o.dataset.l === "native") {
        if (opts && opts.onNative) return opts.onNative(o);
        navigator.share({ title: title, url: url }).then(function () { FM.closeSheets(); }).catch(function (err) {
          if (err && err.name === "AbortError") return;   // کاربر خودش بست
          FM.copyText(url).then(function (ok) { toast(ok ? "اشتراک گوشی در دسترس نبود؛ پیوند کپی شد ✓" : "اشتراک گوشی در دسترس نبود"); });
        });
      }
    });
  };
  /* گوشی: ردیف برنامه‌ها لازم نیست (فهرست اشتراک خود گوشی همهٔ برنامه‌ها را دارد)؛ فقط «اشتراک با برنامه‌های گوشی» و «کپی پیوند» */
  FM.shareBody = function (url, poster) {
    return (mobile() && navigator.share ? "" : FM.appGrid()) + '<div class="psheet__url" dir="ltr">' + FM.esc(url) + "</div>" + copyRow(url, poster);
  };
  FM.linkSheet = function (url, title, onClosed) {
    url = url || location.href; title = title || document.title;
    var d = sheet('<b class="psheet__t">اشتراک‌گذاری</b>' + FM.shareBody(url) +
      '<button type="button" class="psheet__x" data-x>' + (onClosed ? "برگشت" : "بستن") + '</button>', onClosed);
    FM.bindShare(d, url, title);
    return d;
  };
  /* همهٔ دکمه‌های «اشتراک این صفحه» این پنجره را باز می‌کنند (به‌جای اتکا فقط به اشتراک گوشی که گاهی بی‌صدا شکست می‌خورد) */
  FM.share = function (url, title, onClosed) { return FM.linkSheet(url, title, onClosed); };
})();
