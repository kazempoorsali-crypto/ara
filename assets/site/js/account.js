/* حساب کاربری فرصت ملک در طراحی تازه: ورود و ثبت‌نام (رمز یا کد یک‌بارمصرف با بله/پیامک)، بازیابی رمز،
   منوی «حساب من»، خرید اشتراک هفتگی و ماهانه با بله‌پی و «بزن به کارت»، کارت‌به‌کارت با رسید، و فاکتور.
   منطق همان سایت قبلی است (همان API و همان قواعد)؛ فقط ظاهر با طراحی تازه هماهنگ شده است. */
(function () {
  "use strict";
  if (!window.FM || !FM.api) return;
  const API = FM.api;
  const CFG = () => API.config || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fa = (n) => String(n == null ? "" : typeof n === "number" ? n.toLocaleString("en-US").replace(/,/g, "٬") : n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const I = {
    x: '<path d="M6 6l12 12M18 6L6 18"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>', arrow: '<path d="M19 12H5m0 0l6-6m-6 6l6 6"/>', spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1z"/>', upload: '<path d="M12 16V4m0 0l-5 5m5-5l5 5M4 20h16"/>',
  };
  const icon = (n, extra = "") => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' + extra + ">" + (I[n] || "") + "</svg>";
  const toast = (m) => (FM.toast ? FM.toast(m) : alert(m));
  const onAccountPage = () => !!document.getElementById("acctView");
  const view = () => document.getElementById("acctView");
  const showInvoice = (pid) => { if (onAccountPage()) { history.replaceState(null, "", "/account.html?invoice=" + encodeURIComponent(pid)); invoicePage(pid); } else location.href = "/account.html?invoice=" + encodeURIComponent(pid); };
  const route = () => { updateAccount(); if (onAccountPage()) accountPage({}); };
  function updateAccount() {
    const me = API.me, el = $("#accountLabel");
    if (el) el.textContent = me ? (me.active ? "اشتراک فعال، " + fa(me.days_left) + " روز" : "حساب من") : "ورود و اشتراک";
    if (me) dispatchEvent(new CustomEvent("fm:me", { detail: me }));
  }
  /* پنجرهٔ مشترک همهٔ گفت‌وگوها (ورود، پرداخت، اشتراک) */
  function openDialog(html, wide = false) {
    let d = $("#dlg");
    if (!d) {
      d = document.createElement("dialog"); d.id = "dlg";
      d.innerHTML = '<div class="dlg__body" id="dlgBody"></div>';
      document.body.appendChild(d);
      d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
      d.addEventListener("close", () => { FM.startScroll && FM.startScroll(); });
    }
    $("#dlgBody").innerHTML = html;
    d.className = "dlg fmx" + (wide ? " dlg--wide" : "");
    if (!d.open) { FM.stopScroll && FM.stopScroll(); d.showModal(); }
  }
  const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.5 10.5 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2"/></svg>`;
  const PW_MIN = 7;
  const faDigits = (s) => String(s || "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  // ۰۹۱۲…، 9121234567، +989121234567 و 00989121234567 همه به 09121234567 تبدیل می‌شوند
  const normPhone = (s) => { let d = faDigits(s).replace(/\D/g, ""); if (d.startsWith("0098")) d = d.slice(4); else if (d.startsWith("98") && d.length === 12) d = d.slice(2); if (d.length === 10 && d[0] === "9") d = "0" + d; return /^09\d{9}$/.test(d) ? d : ""; };
  const toFa = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const maskPhone = (p) => (p ? `\u2066${toFa(p.slice(0, 4))}•••${toFa(p.slice(-3))}\u2069` : "");   // جداسازی جهت تا شماره برعکس نشود
  const pwRules = (pw, pw2) => ({ len: pw.length >= PW_MIN, mix: /\p{L}/u.test(pw) && /[0-9۰-۹٠-٩]/.test(pw), same: !!pw2 && pw === pw2 });
  const pwField = (id, label, auto, ph = "") => `<label class="af"><span class="af__lbl">${label}</span><span class="af__box"><input class="af__in" id="${id}" type="password" dir="ltr" autocomplete="${auto}" placeholder="${ph}" required><button type="button" class="af__eye" data-eye="${id}" aria-label="نمایش رمز" aria-pressed="false">${EYE}</button></span></label>`;
  const phoneField = (id, label = "شمارهٔ موبایل") => `<label class="af"><span class="af__lbl">${label}</span><span class="af__box"><input class="af__in" id="${id}" type="tel" dir="ltr" inputmode="tel" autocomplete="username tel" placeholder="09123456789" required></span></label>`;
  const rulesRow = () => `<div class="pwr" aria-live="polite"><span class="pwr__i" data-rule="len">حداقل ۷ نویسه</span><span class="pwr__i" data-rule="mix">حرف و عدد</span><span class="pwr__i" data-rule="same">تکرار یکسان</span></div>`;
  // چشم رمز: داخل کادر، سمت چپ (ابتدای متن لاتین)، بدون هم‌پوشانی با متن
  function bindEyes(root) {
    $$("[data-eye]", root).forEach((b) => b.addEventListener("click", () => {
      const inp = $("#" + b.dataset.eye), show = inp.type === "password";
      inp.type = show ? "text" : "password"; b.innerHTML = show ? EYE_OFF : EYE;
      b.setAttribute("aria-pressed", show); b.setAttribute("aria-label", show ? "پنهان کردن رمز" : "نمایش رمز"); inp.focus();
    }));
  }
  // گزینه‌های خاکستری با تایپ سبز می‌شوند؛ خروجی: آیا هر سه شرط برقرار است
  function bindRules(root, a, b) {
    const paint = () => {
      const r = pwRules($(a).value, $(b).value);
      $$("[data-rule]", root).forEach((el) => el.classList.toggle("is-ok", r[el.dataset.rule]));
      $(b).closest(".af").classList.toggle("is-bad", !!$(b).value && !r.same && $(b).value.length >= Math.min($(a).value.length, 1));
      return r.len && r.mix && r.same;
    };
    [a, b].forEach((s) => $(s).addEventListener("input", paint));
    return paint;
  }
  const channels = () => {
    const chs = CFG().login_channels || [{ id: "sms", ready: true }];
    return [...chs].sort((x, y) => (x.id === "bale" ? -1 : y.id === "bale" ? 1 : 0));   // بله اول
  };
  const firstReady = () => (channels().find((c) => c.ready) || channels()[0]).id;

  function loginDialog(after, tab = "login") {
    openDialog(`<div class="auth">
      <div class="auth__head"><div><b class="auth__title">حساب فرصت ملک</b><small class="auth__sub" id="authSub"></small></div><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <div class="auth__seg" role="tablist"><button type="button" role="tab" data-tab="login">ورود</button><button type="button" role="tab" data-tab="register">ثبت‌نام</button></div>
      <div class="auth__body" id="authBody"></div></div>`);
    $("#dlg").classList.add("dlg--auth");
    const done = (u, msg) => { $("#dlg").close(); updateAccount(); toast(msg || (u.trial_started ? `خوش آمدید؛ همهٔ امکانات تا ${fa(u.trial_started)} روز برایتان رایگان باز است` : "وارد شدید")); if (after) after(); else route(); };
    const body = $("#authBody");
    const sub = (t) => { $("#authSub").textContent = t; };
    const seg = (t) => { $(".auth__seg").hidden = !["login", "register"].includes(t); $$(".auth__seg button").forEach((b) => { b.classList.toggle("is-on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t); }); };
    const links = (root) => $$("[data-go]", root).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); show(a.dataset.go); }));

    function show(t) {
      seg(t);
      if (t === "login") {
        sub("با شمارهٔ موبایل و رمز وارد شوید");
        body.innerHTML = `<form class="auth__form" id="liForm" novalidate>${phoneField("liPhone")}${pwField("liPw", "رمز عبور", "current-password")}
          <p class="auth__err" id="liErr" role="alert"></p>
          <button class="btn btn--hot auth__go" id="liBtn">ورود</button>
          <div class="auth__links"><a href="#" data-go="otp">ورود با رمز یک‌بارمصرف</a><a href="#" data-go="reset">فراموشی رمز</a></div></form>`;
        bindEyes(body); links(body);
        $("#liForm").addEventListener("submit", async (e) => {
          e.preventDefault(); const b = $("#liBtn"), raw = $("#liPhone").value.trim();
          const id = normPhone(raw) || raw;   // نام کاربری یا ایمیل حساب‌های قدیمی هم پذیرفته می‌شود
          if (!id || !$("#liPw").value) { $("#liErr").textContent = "شماره و رمز را وارد کنید"; return; }
          b.disabled = true; $("#liErr").textContent = "";
          try { done(await API.login(id, $("#liPw").value)); } catch (err) { $("#liErr").textContent = err.message; }
          b.disabled = false;
        });
        setTimeout(() => $("#liPhone")?.focus(), 30);
      } else if (t === "register" || t === "reset") {
        const reg = t === "register";
        sub(reg ? `شماره موبایل نام کاربری شماست${CFG().trial_days ? `؛ ${fa(CFG().trial_days)} روز استفادهٔ رایگان` : ""}` : "کد بازیابی با بله یا پیامک می‌آید");
        body.innerHTML = `<form class="auth__form" id="pwForm" novalidate>${reg ? "" : `<a href="#" class="auth__back" data-go="login">${icon("arrow")} بازگشت به ورود</a>`}
          ${phoneField("fPhone")}${pwField("fPw", reg ? "رمز عبور" : "رمز تازه", "new-password")}${pwField("fPw2", "تکرار رمز", "new-password")}${rulesRow()}
          <p class="auth__err" id="fErr" role="alert"></p>
          <button class="btn btn--hot auth__go" id="fBtn">${reg ? "ثبت‌نام" : "دریافت کد بازیابی"}</button>
          ${reg ? `<div class="auth__links"><span class="muted">حساب دارید؟</span><a href="#" data-go="login">وارد شوید</a></div>`
            : CFG().email_ready ? `<div class="auth__links"><span class="muted">ایمیل ثبت کرده‌اید؟ به‌جای شماره ایمیل را بنویسید تا لینک بیاید.</span></div>` : ""}</form>`;
        bindEyes(body); links(body);
        const ok = bindRules(body, "#fPw", "#fPw2");
        if (!reg && CFG().email_ready) $("#fPhone").setAttribute("type", "text");
        $("#pwForm").addEventListener("submit", async (e) => {
          e.preventDefault();
          const raw = $("#fPhone").value.trim(), phone = normPhone(raw), err = $("#fErr");
          if (!reg && CFG().email_ready && raw.includes("@")) {   // بازیابی با لینک ایمیلی (پاسخ یکسان برای ایمیل ثبت‌شده و نشده)
            try { await API.resetRequest(raw, "email"); $("#dlg").close(); toast("اگر این ایمیل در سایت ثبت شده باشد، لینک تعیین رمز تازه برایش ارسال شد"); } catch (x) { err.textContent = x.message; }
            return;
          }
          if (!phone) { err.textContent = "شمارهٔ موبایل را درست وارد کنید (مثل 09123456789)"; $("#fPhone").focus(); return; }
          if (!ok()) { err.textContent = "رمز باید دست‌کم ۷ نویسه، شامل حرف و عدد و با تکرارش یکسان باشد"; return; }
          err.textContent = "";
          const pw = $("#fPw").value;
          codeStep({
            phone, title: reg ? "تأیید شماره و ساخت حساب" : "بازیابی رمز", back: t,
            send: (ch) => (reg ? API.requestOtp(phone, ch) : API.resetRequest(phone, ch)),
            verify: async (code) => { const u = reg ? await API.register({ phone, password: pw, code }) : await API.resetCode(phone, code, pw);
              done(u, u.existed || !reg ? "رمز تازه ثبت شد و وارد شدید" : null); },
          });
        });
        setTimeout(() => $("#fPhone")?.focus(), 30);
      } else if (t === "otp") {
        sub("کد یک‌بارمصرف با بله یا پیامک");
        body.innerHTML = `<form class="auth__form" id="otpForm" novalidate><a href="#" class="auth__back" data-go="login">${icon("arrow")} ورود با رمز</a>
          ${phoneField("oPhone")}<p class="auth__err" id="oErr" role="alert"></p>
          <button class="btn btn--hot auth__go">دریافت کد</button>
          <p class="auth__fine">اگر هنوز حساب ندارید، با همین کد حساب ساخته می‌شود و بعداً از «حساب من» رمز می‌گذارید.</p></form>`;
        links(body);
        $("#otpForm").addEventListener("submit", (e) => {
          e.preventDefault(); const phone = normPhone($("#oPhone").value);
          if (!phone) { $("#oErr").textContent = "شمارهٔ موبایل را درست وارد کنید"; return; }
          codeStep({ phone, title: "ورود با رمز یک‌بارمصرف", back: "otp", send: (ch) => API.requestOtp(phone, ch), verify: async (code) => done(await API.verifyOtp(phone, code)) });
        });
        setTimeout(() => $("#oPhone")?.focus(), 30);
      }
    }

    /* گام کد تأیید: کانال (بله / پیامک)، پیوند ربات (اپ و وب)، شمارش اعتبار و ارسال دوباره، و حالت‌های کد درست، نادرست و منقضی */
    function codeStep({ phone, title, back, send, verify }) {
      seg("code"); sub(`کد به ${maskPhone(phone)}`);
      const chs = channels();
      let ch = firstReady(), sentAt = 0, expires = 0, timer = 0, busy = false;
      body.innerHTML = `<div class="auth__code">
        <a href="#" class="auth__back" id="cBack">${icon("arrow")} ویرایش شماره یا رمز</a>
        <b class="auth__ctitle">${esc(title)}</b>
        <div class="auth__ch" role="radiogroup" aria-label="روش دریافت کد">${chs.map((c) => `<button type="button" role="radio" data-ch="${c.id}" class="${c.ready ? "" : "is-off"}" ${c.ready ? "" : 'aria-disabled="true"'}>${icon(c.id === "bale" ? "chat" : "phone")}<span>${c.id === "bale" ? "بله" : "پیامک"}</span>${c.ready ? "" : "<em>به‌زودی</em>"}</button>`).join("")}</div>
        <div class="auth__note" id="cNote" aria-live="polite"></div>
        <form id="cForm" novalidate><label class="af"><span class="af__lbl">کد ۵ رقمی</span><input class="af__in af__code" id="cCode" dir="ltr" inputmode="numeric" maxlength="5" autocomplete="one-time-code" placeholder="•••••" aria-describedby="cErr"></label>
          <p class="auth__err" id="cErr" role="alert"></p>
          <button class="btn btn--hot auth__go" id="cBtn">تأیید</button></form>
        <div class="auth__timers"><span id="cLeft"></span><button type="button" class="linkbtn" id="cResend" disabled>ارسال دوباره</button></div></div>`;
      const note = $("#cNote"), err = $("#cErr"), input = $("#cCode"), btn = $("#cBtn"), resend = $("#cResend");
      const paintCh = () => $$("[data-ch]", body).forEach((b) => { b.classList.toggle("is-on", b.dataset.ch === ch); b.setAttribute("aria-checked", b.dataset.ch === ch); });
      const state = (s, msg = "") => {   // idle | wrong | expired | ok
        const box = input.closest(".af"); box.classList.remove("is-bad", "is-ok", "shake");
        err.textContent = msg; err.classList.toggle("is-ok", s === "ok");
        if (s === "wrong") { box.classList.add("is-bad"); void box.offsetWidth; box.classList.add("shake"); input.select(); }
        if (s === "expired") { box.classList.add("is-bad"); btn.disabled = true; resend.disabled = false; resend.classList.add("is-hot"); clearInterval(timer); $("#cLeft").textContent = "کد منقضی شد"; }
        if (s === "ok") box.classList.add("is-ok");
      };
      const tick = () => {
        const now = Date.now() / 1000, left = Math.max(0, Math.round(expires - now)), wait = Math.max(0, Math.round(sentAt + 90 - now));
        const mm = (x) => `\u2066${toFa(Math.floor(x / 60))}:${toFa(String(x % 60).padStart(2, "0"))}\u2069`;
        $("#cLeft").textContent = left ? `اعتبار کد: ${mm(left)}` : "";
        resend.disabled = wait > 0; resend.textContent = wait ? `ارسال دوباره (${mm(wait)})` : "ارسال دوباره";
        if (!left && expires) state("expired", "زمان کد تمام شد؛ «ارسال دوباره» را بزنید");
      };
      const botNote = (r) => {
        if (r.dev_code) return `<div class="auth__dev">سامانهٔ ارسال هنوز تنظیم نشده؛ کد آزمایشی: <b dir="ltr">${esc(r.dev_code)}</b></div>`;
        if ((r.channel || ch) !== "bale") return `${icon("phone")} کد پیامک شد؛ تا ۳ دقیقه معتبر است.`;
        if (r.sent) return `${icon("check")} کد در ربات فرصت ملک در بله ارسال شد. پیام بله را باز کنید.`;
        // بار اول: شماره هنوز به ربات وصل نیست؛ ربات پس از «اشتراک شمارهٔ من» کد را می‌فرستد
        const start = (r.link || "").split("start=")[1] || "", bot = ((r.link || "").match(/ble\.ir\/([\w.]+)/) || [])[1] || "";
        return `<ol class="auth__steps"><li>ربات فرصت ملک را در بله باز کنید</li><li>دکمهٔ «اشتراک شمارهٔ من» را بزنید</li><li>کدی که ربات می‌فرستد را این‌جا وارد کنید</li></ol>
          <div class="auth__bale"><a class="btn btn--line" href="${esc(r.link)}" target="_blank" rel="noopener">${icon("chat")} باز کردن بله</a>
          <a class="btn btn--line" href="https://web.bale.ai/" target="_blank" rel="noopener">بله وب</a></div>
          ${bot ? `<p class="auth__fine">در بله وب، <b dir="ltr">@${esc(bot)}</b> را جست‌وجو کنید و این پیام را بفرستید: <code dir="ltr" class="auth__cmd" title="کپی">/start ${esc(start)}</code></p>` : ""}
          <button type="button" class="linkbtn" id="cLinked">در بله وصل شدم</button>`;
      };
      const doSend = async () => {
        if (busy) return false; busy = true; let sentOk = false; state("idle"); note.innerHTML = `<span class="muted">در حال ارسال کد…</span>`;
        try {
          const r = await send(ch);
          sentAt = Date.now() / 1000; expires = sentAt + 180; btn.disabled = false; resend.classList.remove("is-hot");
          note.innerHTML = botNote(r);
          $("#cLinked")?.addEventListener("click", () => { note.querySelector(".auth__steps")?.remove(); input.focus(); toast("اگر شماره را در ربات به اشتراک گذاشته‌اید، کد همان‌جا آمده است"); });
          note.querySelector(".auth__cmd")?.addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(e.target.textContent); toast("پیام کپی شد"); } catch { /* */ } });
          clearInterval(timer); timer = setInterval(tick, 1000); tick();
          if (r.dev_code || r.sent) input.focus();
          sentOk = true;
        } catch (x) {
          note.innerHTML = ""; err.textContent = x.message;
          const m = /(\d+)\s*ثانیه/.exec(faDigits(x.message));   // کد قبلی هنوز معتبر است
          if (m) { sentAt = Date.now() / 1000 - (90 - +m[1]); if (!expires) expires = sentAt + 180; btn.disabled = false; clearInterval(timer); timer = setInterval(tick, 1000); tick(); }
        }
        busy = false;
        return sentOk;
      };
      $$("[data-ch]", body).forEach((b) => b.addEventListener("click", () => {
        const c = chs.find((x) => x.id === b.dataset.ch);
        if (!c.ready) { toast(c.id === "sms" ? "دریافت کد با پیامک به‌زودی فعال می‌شود" : "دریافت کد در بله فعلاً فعال نیست"); return; }
        if (c.id === ch) return;
        const prev = ch, prevNote = note.innerHTML; ch = c.id; paintCh();
        // اگر مهلت ارسال دوباره نرسیده باشد، کد قبلی (در کانال قبلی) معتبر می‌ماند و انتخاب برمی‌گردد
        doSend().then((okSent) => { if (!okSent && /ثانیه/.test(err.textContent)) { ch = prev; paintCh(); note.innerHTML = prevNote; err.textContent = `برای تغییر روش، ${err.textContent.match(/[\d۰-۹]+\s*ثانیه/)?.[0] || "کمی"} دیگر صبر کنید؛ کد قبلی هنوز معتبر است`; } });
      }));
      resend.addEventListener("click", doSend);
      $("#cBack").addEventListener("click", (e) => { e.preventDefault(); clearInterval(timer); show(back); });
      input.addEventListener("input", () => { input.value = faDigits(input.value).replace(/\D/g, "").slice(0, 5); if (input.closest(".af").classList.contains("is-bad") && !btn.disabled) state("idle"); if (input.value.length === 5) $("#cForm").requestSubmit(); });
      $("#cForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (input.value.length !== 5) { state("wrong", "کد ۵ رقمی را کامل وارد کنید"); return; }
        if (busy || btn.disabled) return; busy = true; btn.disabled = true;
        try { await verify(input.value); state("ok", "تأیید شد"); clearInterval(timer); }
        catch (x) {
          const m = x.message || "";
          if (/منقضی|کد تازه/.test(m)) state("expired", m); else { state("wrong", m); btn.disabled = false; }
        }
        busy = false;
      });
      $("#dlg").addEventListener("close", () => clearInterval(timer), { once: true });
      paintCh(); doSend();
    }

    $$(".auth__seg button").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
    show(tab === "reset" || tab === "otp" ? tab : tab === "register" ? "register" : "login");
  }
  /* لینک بازیابی رمز از ایمیل */
  function resetPage(params) {
    view().innerHTML = `<section class="section--tight"><div class="wrap" style="max-width:420px"><h1>تعیین رمز تازه</h1>
      <form class="auth__form" id="rpForm" novalidate>${pwField("rpPw", "رمز تازه", "new-password")}${pwField("rpPw2", "تکرار رمز", "new-password")}${rulesRow()}
      <p class="auth__err" id="rpErr" role="alert"></p><button class="btn btn--hot auth__go">ثبت رمز و ورود</button></form></div></section>`;
    bindEyes(view()); const ok = bindRules(view(), "#rpPw", "#rpPw2");
    $("#rpForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!ok()) { $("#rpErr").textContent = "رمز باید دست‌کم ۷ نویسه، شامل حرف و عدد و با تکرارش یکسان باشد"; return; }
      try { await API.resetToken(params.token, $("#rpPw").value); updateAccount(); toast("رمز تازه ثبت شد و وارد شدید"); location.href = "/account.html"; }
      catch (err) { $("#rpErr").textContent = err.message; }
    });
  }


  async function buy(plan, method) {
    if (!API.me) { loginDialog(() => buy(plan)); return; }
    const methods = CFG().pay_methods || [];
    // انتخاب روش پرداخت: همهٔ روش‌ها دیده می‌شوند؛ روش آماده‌نشده پیام «فعلاً فعال نیست» می‌دهد
    if (!method && !CFG().test_payments) { payMethodDialog(plan); return; }
    // اگر درگاه پاسخ ندهد یا صفحهٔ پرداخت باز نشود، کاربر بی‌خبر نمی‌ماند
    payFail.plan = plan;
    const name = ((CFG().pay_methods || []).find((x) => x.id === method) || {}).name || "درگاه پرداخت";
    const fail = () => payFail(`پاسخی از «${name}» نرسید. لطفاً روش پرداخت دیگری را انتخاب کنید، یا اگر فیلترشکن (VPN) روشن است خاموشش کنید و دوباره امتحان کنید.`);
    toast("در حال اتصال به درگاه پرداخت…");
    try {
      const r = await Promise.race([API.startPayment(plan, method), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 20000))]);
      if (r.redirect) {
        location.href = r.redirect;
        setTimeout(() => { if (!document.hidden) fail(); }, 9000);   // صفحهٔ درگاه باز نشد
        return;
      }
      if (r.card || r.link) { cardDialog(r); return; }
      if (r.bale) { balePayDialog(r.bale); return; }
      if (!r.activated) { fail(); return; }
      if (r.activated) { await API.refreshMe(); updateAccount(); if (r.payment_id) showInvoice(r.payment_id); else { toast(r.test ? "اشتراک در حالت آزمایشی فعال شد" : "اشتراک فعال شد"); route(); } }
    } catch (err) { if (err.message === "timeout" || /fetch|network|Failed/i.test(err.message)) fail(); else payFail(err.message + " — می‌توانید روش پرداخت دیگری را انتخاب کنید."); }
  }
  function payFail(msg) {
    openDialog(`<div class="dlg__head"><h2>پرداخت انجام نشد</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <p style="line-height:2">${esc(msg)}</p>
      <ul class="small muted" style="line-height:2;padding-inline-start:18px"><li>روش پرداخت دیگری را امتحان کنید.</li><li>اگر فیلترشکن (VPN) روشن است، خاموشش کنید.</li><li>اگر مشکل ماند، از بخش پشتیبانی تیکت ثبت کنید.</li></ul>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn--hot" type="button" id="payOther">انتخاب روش دیگر</button><a class="btn btn--line" href="/app.html#/support">پشتیبانی</a></div>`);
    const b = document.getElementById("payOther"); if (b) b.addEventListener("click", () => { document.getElementById("dlg").close(); if (payFail.plan) payMethodDialog(payFail.plan); });
  }
  const PAY_ICON = { bale: "chat", bezan: "copy", zarinpal: "lock", card: "copy" };
  const PAY_NOTE = { bale: "پرداخت در پیام‌رسان بله؛ تأیید و فعال‌سازی کاملاً خودکار و فوری", bezan: "کارت‌به‌کارت با اپ بانک خودتان؛ مبلغ یکتا، تأیید و فعال‌سازی خودکار", zarinpal: "درگاه بانکی آنلاین؛ فعال‌سازی خودکار پس از پرداخت", card: "واریز مبلغ یکتا و ثبت رسید؛ فعال‌سازی فوری" };
  function payMethodDialog(plan) {
    const ms = CFG().pay_methods || [];
    const p = (CFG().plans || []).find((x) => x.id === plan);
    openDialog(`<div class="dlg__head"><h2>روش پرداخت</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      ${p ? `<p class="muted" style="margin-bottom:14px">اشتراک ${esc(p.name)}، ${fa(p.days)} روز: <b>${fa(p.price)} تومان</b></p>` : ""}
      <div class="paym">${ms.map((m) => `<button type="button" class="paym__opt${m.ready ? "" : " is-off"}" data-m="${m.id}" aria-disabled="${!m.ready}">
        <i>${icon(PAY_ICON[m.id] || "spark")}</i><span><b>${esc(m.name)}</b><small>${m.ready ? PAY_NOTE[m.id] || "" : "فعلاً فعال نیست"}</small></span>${m.ready ? icon("arrow") : '<em>به‌زودی</em>'}</button>`).join("")}</div>
      <p class="small muted" style="margin-top:12px">پس از پرداخت، فاکتور همان لحظه نمایش داده می‌شود و رسید ${ms.some((m) => m.id === "bale" && m.ready) ? "در بله و " : ""}با پیامک برایتان ارسال می‌شود.</p>`);
    $$(".paym__opt").forEach((b) => b.addEventListener("click", () => {
      const m = ms.find((x) => x.id === b.dataset.m);
      if (!m.ready) { toast(`«${m.name}» فعلاً فعال نیست؛ روش دیگری را انتخاب کنید`); return; }
      $("#dlg").close(); buy(plan, m.id);
    }));
  }
  /* بله‌پی: صورت‌حساب در بله ارسال می‌شود؛ این‌جا وضعیت پرداخت پیوسته بررسی و پس از پرداخت فاکتور نمایش داده می‌شود */
  function balePayDialog(b) {
    openDialog(`<div class="dlg__head"><h2>پرداخت با بله‌پی</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <ol class="pay-steps">
        <li><span>${b.sent ? "صورت‌حساب همین حالا در ربات فرصت ملک در بله برایتان ارسال شد." : "دکمهٔ زیر را بزنید تا ربات فرصت ملک در بله باز شود و صورت‌حساب برایتان بیاید."}</span>
          <a class="btn btn--hot btn--lg" href="${esc(b.link)}" target="_blank" rel="noopener">${icon("chat")} ${b.sent ? "باز کردن بله" : "باز کردن ربات و دریافت صورت‌حساب"}</a></li>
        <li><span>در بله روی «پرداخت» بزنید. پرداخت مستقیم از طریق بله انجام و همان لحظه تأیید می‌شود.</span></li>
        <li><span>این صفحه را باز نگه دارید؛ به‌محض تأیید، اشتراک فعال و فاکتور نمایش داده می‌شود. رسید در بله هم می‌آید.</span></li>
      </ol>
      <p class="paywait" id="payWait"><i></i> در انتظار پرداخت…</p>
      <p class="small muted" style="margin-top:10px">اگر بله باز نشد یا صورت‌حساب نیامد، فیلترشکن (VPN) را خاموش کنید یا <button type="button" class="linkbtn" id="payOther2">روش پرداخت دیگری</button> را انتخاب کنید.</p>`);
    const o2 = document.getElementById("payOther2"); if (o2) o2.addEventListener("click", () => { document.getElementById("dlg").close(); if (payFail.plan) payMethodDialog(payFail.plan); });
    let n = 0;
    const t = setInterval(async () => {
      if (!$("#payWait") || ++n > 400) { clearInterval(t); return; }
      try {
        const inv = await API.invoice(b.payment_id);
        if (inv.status === "paid") { clearInterval(t); $("#dlg").close(); await API.refreshMe(); updateAccount(); showInvoice(b.payment_id); }
      } catch (e) { /* شبکه */ }
    }, 3000);
  }
  /* فاکتور پرداخت: بلافاصله پس از پرداخت، تا خریدار از دریافت پول و فعال شدن اشتراک مطمئن باشد */
  async function invoicePage(pid) {
    view().innerHTML = `<section class="section--tight"><div class="wrap"><div class="skeleton" style="height:360px;max-width:560px;margin:auto"></div></div></section>`;
    if (API.server) await API.refreshMe().catch(() => {});
    updateAccount();
    let inv;
    try { inv = await API.invoice(pid); } catch (err) {
      view().innerHTML = `<section class="section--tight"><div class="wrap"><div class="empty"><h3>فاکتور پیدا نشد</h3><p>${esc(err.message)}</p><a class="btn btn--ink" href="/account.html">حساب کاربری</a></div></div></section>`; return;
    }
    const paid = inv.status === "paid", review = inv.status === "review", ok = paid || review;
    const jd = (t) => (t ? new Date(t * 1000).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" }) : "—");
    const jt = (t) => (t ? new Date(t * 1000).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) : "");
    const notice = (() => { const bale = (CFG().login_channels || []).concat(CFG().pay_methods || []).some((x) => x.id === "bale" && x.ready); const ch = [CFG().sms_live && "پیامک", bale && "بله"].filter(Boolean); return ch.length ? "رسید با " + ch.join(" و ") + " هم ارسال شد" : "این رسید را چاپ یا ذخیره کنید"; })();
    // بارکد پایدار از روی شمارهٔ فاکتور
    let h = 2166136261; for (const ch of "FM-" + inv.id + "-" + (inv.ref || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    let x = 0, bars = "";
    for (let i = 0; i < 46; i++) { h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; const w = 1 + (h % 3); if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w + 1; }
    const status = ok ? (paid ? "پرداخت موفق؛ اشتراک شما فعال است" : "رسید ثبت شد؛ اشتراک شما فعال است") : inv.status === "failed" ? "پرداخت انجام نشد" : "در انتظار پرداخت";
    view().innerHTML = `<section class="section--tight"><div class="wrap"><div class="rp" id="rp" data-stage="${ok ? "processing" : "idle"}">
      <div class="rp__printer">
        <div class="rp__top"><svg class="rp__logo" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 33c5-3.8 10-3.8 15 0s10 3.8 15 0" stroke="#3aa37c" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M10 25l13-13 13 13" stroke="#ece6da" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="39" cy="10" r="4.2" fill="#e0531f"/></svg><a class="rp__home" href="/">${icon("home", 'width="14"')} خانه</a></div>
        <div class="rp__panel">
          <div class="rp__row"><div><b>اشتراک ${esc(inv.plan)}</b><small>${inv.days ? fa(inv.days) + " روز دسترسی کامل" : ""}</small></div><div class="rp__total"><small>مبلغ</small><b>${fa(inv.amount)} <i>تومان</i></b></div></div>
          <p class="rp__status"><i class="rp__dot"></i><span id="rpStatus">${ok ? "در حال تأیید پرداخت…" : esc(status)}</span></p>
        </div>
        <div class="rp__slot"></div>
      </div>
      <div class="rp__feed"><article class="rp__paper" aria-label="رسید پرداخت">
        <svg class="rp__plogo" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 33c5-3.8 10-3.8 15 0s10 3.8 15 0" stroke="#2c6a55" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M10 25l13-13 13 13" stroke="#151614" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="39" cy="10" r="4.2" fill="#e0531f"/></svg>
        <p class="rp__brand">فرصت ملک<small>forsatmelk.ir</small></p>
        <hr>
        <div class="rp__line"><b>اشتراک ${esc(inv.plan)}</b><b>${fa(inv.amount)}</b></div>
        <div class="rp__line rp__sub"><span>${inv.days ? fa(inv.days) + " روز" : ""}</span><span>تومان</span></div>
        <hr>
        <div class="rp__line rp__sum"><b>مبلغ پرداخت‌شده</b><b>${fa(inv.amount)} <small>تومان</small></b></div>
        <hr>
        <div class="rp__line"><span>شمارهٔ فاکتور</span><span>FM-${fa(inv.id)}</span></div>
        <div class="rp__line"><span>روش پرداخت</span><span>${esc(inv.gateway)}</span></div>
        ${inv.ref ? `<div class="rp__line"><span>کد پیگیری</span><span dir="ltr">${esc(inv.ref)}</span></div>` : ""}
        <div class="rp__line"><span>تاریخ</span><span>${jd(inv.paid_at || inv.created)} · ${jt(inv.paid_at || inv.created)}</span></div>
        <div class="rp__line"><span>موبایل</span><span dir="ltr">${esc(inv.phone)}</span></div>
        ${ok ? `<div class="rp__line rp__until"><span>اعتبار اشتراک تا</span><b>${jd(inv.sub_until)}</b></div>` : ""}
        <svg class="rp__bar" viewBox="0 0 ${x} 40" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>
        <p class="rp__thanks">${ok ? "از اعتماد شما سپاسگزاریم" : "این رسید پس از پرداخت معتبر است"}</p>
      </article></div>
      <p class="rp__note muted">${ok ? esc(notice) : "اگر مبلغی کم شده و اشتراک فعال نشده، از پشتیبانی پیگیری کنید؛ پرداخت ناموفق معمولاً تا ۷۲ ساعت برمی‌گردد."}</p>
      <div class="invoice__act"><a class="btn btn--hot btn--lg" href="/app.html#/s?sort=score&opp=1">دیدن فرصت‌ها ${icon("arrow")}</a><button class="btn btn--line" onclick="window.print()">چاپ یا ذخیرهٔ رسید</button><button class="btn btn--ghost" id="rpReplay">${icon("arrow")} چاپ دوباره</button><a class="btn btn--ghost" href="/app.html#/support?cat=payment">پشتیبانی پرداخت</a></div>
    </div></div></section>`;
    // مراحل: تأیید پرداخت ← چاپ رسید ← تکمیل؛ با «کاهش حرکت» همه یک‌جا نمایش داده می‌شود
    const rp = $("#rp"), st = $("#rpStatus");
    const run = () => {
      if (!ok) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { rp.dataset.stage = "complete"; st.textContent = status; return; }
      rp.style.setProperty("--H", ($(".rp__paper", rp).offsetHeight || 520) + "px");
      rp.dataset.stage = "processing"; st.textContent = "در حال تأیید پرداخت…";
      setTimeout(() => { if (!rp.isConnected) return; rp.dataset.stage = "printing"; st.textContent = "در حال چاپ رسید…"; }, 1100);
      setTimeout(() => { if (!rp.isConnected) return; rp.dataset.stage = "complete"; st.textContent = status; }, 4300);
    };
    run();
    $("#rpReplay").addEventListener("click", () => { rp.dataset.stage = "idle"; requestAnimationFrame(() => requestAnimationFrame(run)); });
  }
  /* کارت‌به‌کارت: مبلغ یکتا، رسید یا کد پیگیری، فعال‌سازی فوری */
  function cardDialog(r) {
    const num16 = r.card ? r.card.number.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1-") : "";
    openDialog(`<div class="dlg__head"><h2>${r.link ? "پرداخت با بزن به کارت" : "پرداخت کارت‌به‌کارت"}</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      ${r.link ? `<ol class="pay-steps">
        <li><span>مبلغ اشتراک ${esc(r.plan)}:</span><b class="pay-amt">${fa(r.amount)} <small>تومان</small></b></li>
        <li><span>صفحهٔ پرداخت «بزن به کارت» را باز کن و همین مبلغ را بپرداز.</span><a class="btn btn--hot btn--block" href="${esc(r.link)}" target="_blank" rel="noopener">باز کردن صفحهٔ پرداخت ${icon("arrow")}</a><small class="muted">اگر صفحهٔ پرداخت باز نشد، فیلترشکن (VPN) را خاموش کنید یا روش دیگری را انتخاب کنید.</small></li>
        <li><span>بعد از پرداخت، کد پیگیری یا عکس رسید را همین‌جا ثبت کن. ${r.auto ? `اشتراک ${esc(r.plan)} همان لحظه باز می‌شود و پرداخت بعداً بررسی می‌شود.` : `پس از تأیید پرداخت، اشتراک ${esc(r.plan)} باز می‌شود.`}</span></li>
      </ol>` : `<ol class="pay-steps">
        <li><span>دقیقاً همین مبلغ را واریز کن، نه بیشتر و نه کمتر. این مبلغ فقط برای تو رزرو شده و پرداختت با آن شناخته می‌شود${r.price && r.price !== r.amount ? ` (قیمت طرح ${fa(r.price)} تومان است)` : ""}.</span><b class="pay-amt">${fa(r.amount)} <small>تومان</small></b></li>
        <li><span>به این کارت${r.card.bank ? " (" + esc(r.card.bank) + ")" : ""}:</span><button class="pay-card" id="cpCard" type="button"><bdi dir="ltr">${num16}</bdi> ${icon("copy", 'width="16"')}</button>${r.card.holder ? `<span class="pay-holder">به نام <b>${esc(r.card.holder)}</b></span>` : ""}</li>
        <li><span>عکس رسید یا کد پیگیری را همین‌جا بفرست (یا بعداً از بخش <a href="/app.html#/support">پشتیبانی</a>). ${r.auto ? `اشتراک ${esc(r.plan)} همان لحظه باز می‌شود و واریز بعداً بررسی می‌شود.` : `پس از تطبیق واریز، اشتراک ${esc(r.plan)} باز می‌شود.`} پس از فعال‌سازی پیامک «دسترسی شما باز شد» می‌گیری.</span></li>
      </ol>`}
      <form class="form-grid" id="rcForm">
        <label class="field"><span>کد پیگیری یا شمارهٔ مرجع</span><input class="input input--ltr" id="rcTrack" inputmode="numeric" autocomplete="off"></label>
        <label class="field"><span>عکس رسید (اختیاری، تا ۵ مگابایت)</span><input class="input" type="file" id="rcFile" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
        <button class="btn btn--hot btn--lg" id="rcBtn">${icon("upload")} ${r.auto ? "ثبت رسید و فعال‌سازی" : "ثبت رسید"}</button>
        <p class="small muted">اگر واریز با مبلغ و رسید نخواند، روزهای اشتراک پس گرفته می‌شود. تمدید خودکار نداریم.</p>
      </form>`);
    $("#cpCard")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(r.card.number.replace(/\D/g, "")); toast("شماره کارت کپی شد"); } catch { /* */ } });
    $("#rcForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#rcBtn"); btn.disabled = true;
      try {
        const f = $("#rcFile").files[0];
        if (f && f.size > 5e6) throw new Error("حجم فایل زیاد است: حداکثر ۵ مگابایت");
        const img = f ? await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(f); }) : null;
        const res = await API.submitReceipt(r.payment_id, $("#rcTrack").value, img);
        $("#dlg").close();
        await API.refreshMe(); updateAccount();
        if (res.activated) showInvoice(r.payment_id);
        else { toast("رسید ثبت شد؛ پس از بررسی فعال می‌شود"); route(); }
      } catch (err) { toast(err.message); }
      btn.disabled = false;
    });
  }


  /* منوی «حساب من»: با ورود، دکمهٔ حساب یک منوی کوچک باز می‌کند؛ بدون اشتراک فعال، «فعال‌سازی اشتراک» بالای منوست */
  function closeAcctMenu() { const m = $("#acctMenu"); if (!m) return; m.remove(); $("#accountBtn")?.setAttribute("aria-expanded", "false"); }
  function acctMenu() {
    const me = API.me, btn = $("#accountBtn");
    if ($("#acctMenu")) { closeAcctMenu(); return; }
    const m = document.createElement("div");
    m.id = "acctMenu"; m.className = "amenu fmx"; m.setAttribute("role", "menu");
    m.innerHTML = `<div class="amenu__head"><b dir="ltr">${esc(me.phone || "")}</b><span class="${me.active ? "ok-text" : ""}">${me.active ? `${me.trial ? "دورهٔ رایگان" : "اشتراک فعال"}، ${fa(me.days_left)} روز باقی‌مانده` : "بدون اشتراک فعال"}</span></div>
      ${me.active ? "" : `<button type="button" class="amenu__sub" role="menuitem" data-a="sub">${icon("spark")}<span><b>فعال‌سازی اشتراک</b><small>هفتگی یا ماهانه، با بله‌پی یا بزن به کارت</small></span></button>`}
      <a role="menuitem" href="/account.html">${icon("user")} حساب من</a>
      <a role="menuitem" href="/app.html#/support">${icon("chat")} پشتیبانی و تیکت‌ها</a>
      <button type="button" role="menuitem" data-a="out">${icon("logout")} خروج</button>`;
    document.body.append(m);
    const r = btn.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 8) + "px";
    m.style.left = Math.round(Math.max(12, Math.min(r.left, innerWidth - m.offsetWidth - 12))) + "px";
    btn.setAttribute("aria-expanded", "true");
    m.addEventListener("click", async (e) => {
      const t = e.target.closest("a, button"); if (!t) return;
      closeAcctMenu();
      if (t.dataset.a === "sub") subscribeDialog();
      else if (t.dataset.a === "out") { await API.logout(); updateAccount(); route(); }
    });
    setTimeout(() => {
      const off = (e) => { if (!e.target.closest("#acctMenu, #accountBtn")) { closeAcctMenu(); document.removeEventListener("pointerdown", off); } };
      document.addEventListener("pointerdown", off);
    });
  }
  /* خرید اشتراک در یک پنجره: انتخاب طرح (هفتگی/ماهانه) و سپس پرداخت با بله‌پی یا بزن به کارت */
  function subscribeDialog(planId) {
    if (!API.me) { loginDialog(() => subscribeDialog(planId)); return; }
    const plans = CFG().plans || [];
    if (!plans.length) { toast("تعرفهٔ اشتراک هنوز تعیین نشده است"); return; }
    const all = CFG().pay_methods || [];
    let ms = all.filter((x) => x.id === "bale" || x.id === "bezan");
    if (!ms.length) ms = all;
    let sel = plans.some((p) => p.id === planId) ? planId : plans[plans.length - 1].id;
    openDialog(`<div class="dlg__head"><h2>فعال‌سازی اشتراک</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <p class="muted small" style="margin-bottom:12px">همهٔ نتیجه‌ها، آگهی‌های مشکوک همراه با دلیل، پیوند مستقیم هر آگهی اصلی و جزئیات کامل ارزش‌گذاری باز می‌شود. بدون تمدید خودکار.</p>
      <div class="subp" role="radiogroup" aria-label="طرح اشتراک">${plans.map((p) => `<button type="button" class="subp__opt" role="radio" data-p="${p.id}">
        <span><b>${esc(p.name)}</b><small>${fa(p.days)} روز دسترسی کامل</small></span><em>${fa(p.price)} <small>تومان</small></em></button>`).join("")}</div>
      <h3 class="subp__h">روش پرداخت</h3>
      <div class="paym">${ms.map((m) => `<button type="button" class="paym__opt${m.ready ? "" : " is-off"}" data-m="${m.id}" aria-disabled="${!m.ready}">
        <i>${icon(PAY_ICON[m.id] || "spark")}</i><span><b>${esc(m.name)}</b><small>${m.ready ? PAY_NOTE[m.id] || "" : "فعلاً فعال نیست"}</small></span>${m.ready ? icon("arrow") : "<em>به‌زودی</em>"}</button>`).join("") || `<p class="muted small">هنوز روش پرداختی فعال نشده است.</p>`}</div>`);
    const mark = () => $$(".subp__opt").forEach((b) => { const on = b.dataset.p === sel; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on); });
    mark();
    $$(".subp__opt").forEach((b) => b.addEventListener("click", () => { sel = b.dataset.p; mark(); }));
    $$("#dlg .paym__opt").forEach((b) => b.addEventListener("click", () => {
      const m = ms.find((x) => x.id === b.dataset.m);
      if (!m.ready) { toast(`«${m.name}» فعلاً فعال نیست؛ روش دیگری را انتخاب کنید`); return; }
      $("#dlg").close(); buy(sel, CFG().test_payments ? undefined : m.id);
    }));
  }


  async function accountPage(params) {
    await API.refreshMe().catch(() => {});
    updateAccount();
    const me = API.me;
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      ${params.pending ? `<div class="note-ok" id="payPending" aria-live="polite">واریز شما در حال تطبیق خودکار است؛ معمولاً چند ثانیه تا چند دقیقه طول می‌کشد و همین صفحه خودش به‌روز می‌شود. اگر هنوز کارت‌به‌کارت نکرده‌اید، به صفحهٔ پرداخت برگردید و <b>دقیقاً همان مبلغ یکتا</b> را واریز کنید.</div>` : ""}
      ${params.paid ? `<div class="note-ok">پرداخت موفق بود و اشتراک شما فعال شد.</div>` : params.failed ? `<div class="note-bad">پرداخت تکمیل نشد. اگر مبلغی کسر شده باشد، طبق قوانین درگاه ظرف ۷۲ ساعت بازمی‌گردد.</div>` : ""}
      <div class="sec-head"><div><span class="kicker">حساب من</span><h2>${me ? "اشتراک و حساب کاربری" : "ورود و اشتراک"}</h2></div></div>
      ${me && !me.active && (CFG().plans || []).length ? `<div class="subcta"><div><b>اشتراک فعال ندارید</b><small>با اشتراک هفتگی یا ماهانه، همهٔ نتیجه‌ها، آگهی‌های مشکوک با دلیل و پیوند مستقیم هر آگهی اصلی باز می‌شود.</small></div><button class="btn btn--hot btn--lg" id="subBtn2">فعال‌سازی اشتراک</button></div>` : ""}
      ${me ? `<div class="account">
          <div><span class="muted small">شماره موبایل</span><b dir="ltr">${esc(me.phone)}</b></div>
          <div><span class="muted small">وضعیت اشتراک</span><b class="${me.active ? "ok-text" : ""}">${me.active ? `${me.trial ? "دورهٔ رایگان" : "فعال"}، ${fa(me.days_left)} روز باقی‌مانده` : "بدون اشتراک فعال"}</b></div>
          ${me.active ? `<div><span class="muted small">پایان اشتراک</span><b>${new Date(me.sub_until * 1000).toLocaleDateString("fa-IR", { dateStyle: "long" })}</b></div>` : ""}
          ${me.active ? "" : `<button class="btn btn--hot" id="subBtn">فعال‌سازی اشتراک</button>`}
          <a class="btn btn--line" href="/app.html#/support">پشتیبانی و تیکت‌ها</a>
          <button class="btn btn--line" id="logoutBtn">خروج</button>
        </div>
        <form class="tool profile" id="profForm" autocomplete="on">
          <h3>مشخصات و رمز عبور</h3>
          ${me.has_password ? "" : `<p class="note-bad small">برای این حساب هنوز رمز عبور تعیین نشده؛ یک رمز بگذارید تا دفعهٔ بعد با شماره و رمز وارد شوید.</p>`}
          <div class="row2"><label class="field"><span>نام</span><input class="input" name="first_name" value="${esc(me.first_name || "")}"></label>
          <label class="field"><span>نام خانوادگی</span><input class="input" name="last_name" value="${esc(me.last_name || "")}"></label></div>
          <div class="row2"><label class="field"><span>نام کاربری انگلیسی (اختیاری)</span><input class="input input--ltr" name="username" value="${esc(me.username || "")}"></label>
          <label class="field"><span>ایمیل (اختیاری)</span><input class="input input--ltr" type="email" name="email" value="${esc(me.email || "")}"></label></div>
          <div class="row2">${me.has_password ? `<label class="field"><span>رمز فعلی</span><input class="input input--ltr" type="password" name="password" autocomplete="current-password" placeholder="فقط برای تغییر رمز"></label>` : ""}
          <label class="field"><span>${me.has_password ? "رمز جدید" : "رمز عبور"}</span><input class="input input--ltr" type="password" name="new_password" autocomplete="new-password" placeholder="دست‌کم ۷ نویسه، حرف و عدد"></label></div>
          <button class="btn btn--hot" type="submit">ذخیرهٔ مشخصات</button>
        </form>` : `<div class="empty"><h3>وارد حساب خود شوید</h3><p>با شمارهٔ موبایل و رمز وارد شوید، یا با همین شماره در چند ثانیه ثبت‌نام کنید.</p><button class="btn btn--hot btn--lg" id="loginBtn">ورود یا ثبت‌نام</button><p class="small muted" style="margin-top:12px">کد ورود نمی‌رسد؟ <a href="/app.html#/support?cat=sms">تیکت پشتیبانی بفرستید</a>.</p></div>`}
    </div></section>`;
    $("#loginBtn")?.addEventListener("click", () => loginDialog());
    $("#subBtn")?.addEventListener("click", () => subscribeDialog());
    $("#subBtn2")?.addEventListener("click", () => subscribeDialog());
    // کارت‌به‌کارت خودکار: تا تطبیق واریز، هر ۸ ثانیه (حداکثر ۴۵ دقیقه) وضعیت پرسیده می‌شود
    if (params.pending && me) {
      const pid = params.pending, t0 = Date.now();
      const poll = async () => {
        if (!$("#payPending")) return;
        try {
          const r = await API.payCheck(pid);
          if (r.status === "paid") { await API.refreshMe(); updateAccount(); showInvoice(pid); return; }
          if (r.status === "expired") { $("#payPending").className = "note-bad"; $("#payPending").textContent = "مهلت واریز تمام شد و پرداختی تطبیق نشد. اگر مبلغی واریز کرده‌اید، از «پشتیبانی» تیکت بفرستید."; return; }
          if (r.status === "needs_review") $("#payPending").textContent = "واریز شما رسید ولی مبلغ یا کارت با سفارش کاملاً نخواند و برای بررسی دستی ثبت شد؛ پس از تأیید، اشتراک خودکار فعال می‌شود.";
        } catch { /* */ }
        if (Date.now() - t0 < 45 * 60e3) setTimeout(poll, 8000);
      };
      setTimeout(poll, 1500);
    }
    $("#logoutBtn")?.addEventListener("click", async () => { await API.logout(); updateAccount(); route(); });
    $("#profForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      if (!f.new_password) { delete f.new_password; delete f.password; }
      if (!me.has_password && !f.new_password) { toast("یک رمز عبور برای حساب بگذارید"); return; }
      const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      try { await API.saveProfile(f); toast("مشخصات ذخیره شد"); updateAccount(); accountPage({}); }
      catch (err) { toast(err.message || "ذخیره نشد"); btn.disabled = false; }
    });
  }
  /* ---------- راه‌اندازی ---------- */
  FM.account = { login: (after, tab) => loginDialog(after, tab), subscribe: (p) => subscribeDialog(p), update: updateAccount };
  function bindHeader() {
    const ab = $("#accountBtn");
    if (!ab) return;
    ab.setAttribute("aria-haspopup", "menu"); ab.setAttribute("aria-expanded", "false");
    ab.addEventListener("click", (e) => {
      e.preventDefault();
      if (API.me) acctMenu(); else loginDialog();
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape") closeAcctMenu(); });
    addEventListener("resize", closeAcctMenu);
    addEventListener("scroll", closeAcctMenu, { passive: true });
  }
  bindHeader();
  API.init().then(() => {
    updateAccount();
    if (!onAccountPage()) return;
    const q = Object.fromEntries(new URLSearchParams(location.search));
    if (q.invoice) invoicePage(q.invoice);
    else if (q.token) resetPage(q);
    else accountPage(q);
  }).catch(() => { if (onAccountPage()) view().innerHTML = '<div class="empty"><h3>ارتباط با سرور برقرار نشد</h3><p>کمی بعد دوباره امتحان کنید.</p></div>'; });
})();
