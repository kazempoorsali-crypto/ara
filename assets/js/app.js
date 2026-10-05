/* فرصت‌یاب — مسیریابی و صفحات */
const App = (() => {
  "use strict";
  const { $, $$, esc, fa, faY, num, store, money, toast, icon, pct } = UI;
  const state = { favs: new Set(store.get("favs", [])), compare: [], map: null, layer: null, markers: {} };
  const view = () => $("#view");
  let cfg = null;
  const CONF = { high: "اطمینان زیاد", medium: "اطمینان متوسط", low: "اطمینان کم" };

  /* ---------- راه‌اندازی ---------- */
  async function boot() {
    applyTheme(store.get("theme", ""));
    const info = await DataLayer.init();
    cfg = info.config;
    applySite();
    if (info.useSamples) {
      const bar = $("#demoBar");
      bar.hidden = false;
      bar.innerHTML = info.server
        ? "<b>هنوز آگهی واقعی دریافت نشده است.</b> فعلاً آگهی‌های نمونه نمایش داده می‌شود؛ دریافت از دیوار را در <a href='admin.html' style='text-decoration:underline'>پنل مدیریت</a> روشن کنید."
        : "<b>پیش‌نمایش طراحی:</b> آگهی‌ها، قیمت‌ها و امتیازها نمونه و ساختگی‌اند. نسخه کامل با آگهی‌های واقعی دیوار روی سرور اجرا می‌شود.";
    }
    updateFavCount();
    updateAccount();
    window.addEventListener("hashchange", route);
    window.addEventListener("scroll", () => $("#top").classList.toggle("is-scrolled", scrollY > 8), { passive: true });
    bindGlobal();
    route();
  }
  function applySite() {
    const s = cfg.site;
    $$("[data-site]").forEach((el) => { if (s[el.dataset.site]) el.textContent = s[el.dataset.site]; });
    document.title = `${s.name} | ${s.tagline}`;
    if (s.about) $("#footAbout").textContent = s.about;
  }
  function updateAccount() {
    const me = DataLayer.me;
    $("#accountLabel").textContent = me ? (me.active ? `اشتراک فعال · ${fa(me.days_left)} روز` : "حساب من") : "ورود و اشتراک";
  }
  const active = () => !!(DataLayer.me && DataLayer.me.active);

  /* ---------- مسیریابی ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, query] = h.split("?");
    return { path: path || "", params: Object.fromEntries(new URLSearchParams(query || "")) };
  }
  let lastPath = null;
  function route() {
    const { path, params } = parseHash();
    const [page, arg] = path.split("/");
    $$("[data-nav]").forEach((a) => a.classList.remove("is-on"));
    document.body.classList.remove("has-mcta");
    if (page === "s") {
      const key = params.ranked ? "top" : "estate-" + (params.deal || "sale");
      $(`[data-nav="${key}"]`)?.classList.add("is-on");
      if (lastPath === "s") { searchPage.update(params); return; }
      searchPage.render(params);
    } else if (page === "ad" && arg) adPage(decodeURIComponent(arg));
    else if (page === "saved") savedPage();
    else if (page === "market") { $('[data-nav="market"]').classList.add("is-on"); marketPage(params); }
    else if (page === "method") { $('[data-nav="method"]').classList.add("is-on"); methodPage(); }
    else if (page === "account") accountPage(params);
    else homePage();
    if (page !== lastPath || page === "ad") scrollTo({ top: 0 });
    lastPath = page;
  }
  const go = (hash) => { location.hash = hash; };
  const toQuery = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "" && v != null && v !== 0 && v !== false)).toString();
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

  /* ---------- صفحه اصلی ---------- */
  let boardTimer = null;
  async function homePage() {
    clearInterval(boardTimer);
    const st = DataLayer.stats;
    let deal = "";
    view().innerHTML = `
    <section class="hero">
      <div class="wrap hero__grid">
        <div>
          <span class="kicker">گیلان · مازندران · گلستان</span>
          <h1>ملکی که <span class="accent">زیر قیمت</span> است،<br>پیش از بقیه پیدا کن.</h1>
          <p class="hero__lead">هر روز آگهی‌های ملک ${fa(CITIES.length)} شهر شمال را از دیوار جمع می‌کنیم، آگهی‌های مشکوک و تکراری را کنار می‌گذاریم و قیمت هرکدام را با قیمت منصفانه همان محله، با درنظرگرفتن سن بنا، طبقه، متراژ و امکانات، می‌سنجیم.</p>
          <form class="search-card" id="heroForm" autocomplete="off">
            <div class="search-card__tabs">
              <div class="search-card__deals" id="heroDeals" style="margin-inline-start:0">
                <button type="button" class="is-on" data-d="">همه</button><button type="button" data-d="sale">خرید</button><button type="button" data-d="rent">رهن و اجاره</button><button type="button" data-d="daily">روزانه</button>
              </div>
            </div>
            <div class="search-row">
              <span class="search-row__ai">${icon("spark")}</span>
              <input id="heroQ" placeholder="مثلاً: آپارتمان ۲ خوابه گلسار رشت زیر ۸ میلیارد" aria-label="جست‌وجو" />
              <button class="btn btn--hot btn--lg">یافتن فرصت‌ها</button>
            </div>
            <div class="parsed" id="heroParsed" aria-live="polite"></div>
          </form>
          <div class="hero__quick" id="heroQuick">${["آپارتمان زیر قیمت رشت", "ویلای ساحلی نوشهر", "آپارتمان رهن ساری", "زمین سنددار لاهیجان", "ویلا کلاردشت"].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        </div>
        <aside class="board" aria-label="برترین فرصت‌ها">
          <div class="board__head"><b>برترین فرصت‌های امروز</b><span class="live">${DataLayer.samples ? "داده نمونه" : "به‌روز"}</span></div>
          <div class="board__kpis">
            <div class="kpi"><b>${fa(st.total || 0)}</b><span>آگهی بررسی‌شده</span></div>
            <div class="kpi"><b>${fa(st.deals || 0)}</b><span>دست‌کم ۱۰٪ زیر قیمت</span></div>
            <div class="kpi"><b>${fa(st.excluded || 0)}</b><span>کنار گذاشته شد</span></div>
          </div>
          <ul class="board__list" id="boardList"></ul>
        </aside>
      </div>
      <div class="hero__art" aria-hidden="true">${heroArt()}</div>
    </section>
    <section class="wrap">
      <div class="strip">
        <div><b>${fa(st.ranked || 0)}</b><span>آگهی دارای امتیاز</span></div>
        <div><b>${fa(st.today || 0)}</b><span>آگهی تازه در ۲۴ ساعت</span></div>
        <div><b>${fa(st.drops || 0)}</b><span>کاهش قیمت ثبت‌شده</span></div>
        <div><b>${fa(Object.keys(st.cities || {}).length)}</b><span>شهر دارای آگهی از ${fa(CITIES.length)}</span></div>
      </div>
    </section>
    <section class="section">
      <div class="wrap">
        <div class="sec-head">
          <div><span class="kicker">رادار فرصت</span><h2>بیشترین امتیاز، همین حالا</h2><p>امتیاز ۰ تا ۱۰۰ از فاصله قیمت تا قیمت منصفانه، میزان اطمینان برآورد، کامل بودن آگهی و تحولات قیمت ساخته می‌شود.</p></div>
          <div class="seg" id="feedS"><button class="is-on" data-s="score">امتیاز</button><button data-s="deal">بیشترین تخفیف</button><button data-s="new">تازه‌ترین</button><button data-s="drop">کاهش قیمت</button></div>
        </div>
        <div class="cards" id="feed"></div>
        <div style="text-align:center;margin-top:28px"><a class="btn btn--line" id="feedMore" href="#/s?sort=score&ranked=1">همه فرصت‌ها ${icon("arrow")}</a></div>
      </div>
    </section>
    ${methodTeaser()}
    <section class="section section--sunk">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">راهنمای محلی</span><h2>از آستارا تا کلاله</h2><p>تعداد آگهی و میانه قیمت هر متر در هر شهر، از آگهی‌های پاک‌سازی‌شده همین سامانه.</p></div><a class="btn btn--line" href="#/market">بازار محله‌ها</a></div>
        <div class="prov">${provinceColumns(st)}</div>
      </div>
    </section>
    ${plansSection()}
    <section class="section" id="tools">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">ابزارها</span><h2>پیش از تصمیم، حساب کن</h2></div></div>
        <div class="tools">${toolsHTML()}</div>
      </div>
    </section>`;

    $("#heroDeals").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; deal = b.dataset.d; $$("#heroDeals button").forEach((x) => x.classList.toggle("is-on", x === b)); });
    $("#heroQ").addEventListener("input", (e) => {
      const v = e.target.value.trim();
      const { tags } = v.length > 2 ? NLP.parseQuery(v) : { tags: [] };
      $("#heroParsed").innerHTML = tags.length ? `<span>برداشت:</span>${tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join("")}` : "";
    });
    $("#heroForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#heroQ").value.trim();
      const f = v ? NLP.parseQuery(v, deal ? { deal } : {}).filters : (deal ? { deal } : {});
      go("#/s?" + toQuery({ sort: "score", ...f }));
    });
    $("#heroQuick").addEventListener("click", (e) => { const c = e.target.closest("[data-q]"); if (c) { $("#heroQ").value = c.dataset.q; $("#heroForm").requestSubmit(); } });

    const top = (await DataLayer.search({ sort: "score", ranked: 1, limit: 15 })).items;
    let off = 0;
    const drawBoard = () => {
      if (!$("#boardList")) return;
      const rows = top.slice(off, off + 5);
      if (rows.length < 5) rows.push(...top.slice(0, Math.min(top.length, 5 - rows.length)));
      $("#boardList").innerHTML = rows.length ? rows.map((l, i) => `<li><a class="board__row" style="animation-delay:${i * 60}ms" href="#/ad/${encodeURIComponent(l.id)}"><b>${UI.tt(l.title)}</b><span class="board__price">${l.score != null ? fa(Math.round(l.score)) + " امتیاز" : ""}</span><span>${esc(l.city_name || UI.cityOf(l.city_key)?.name || "")}${l.district ? "، " + esc(l.district) : ""} · ${esc(UI.pinLabel(l))}</span><span style="text-align:left">${l.verdict && l.verdict.delta < 0 ? pct(l.verdict.delta) + " زیر قیمت" : ""}</span></a></li>`).join("")
        : `<li class="board__row"><span>با جمع شدن آگهی کافی، فرصت‌ها اینجا نمایش داده می‌شوند.</span></li>`;
      off = (off + 5) % Math.max(5, top.length);
    };
    drawBoard();
    if (top.length > 5) boardTimer = setInterval(() => { if (!$("#boardList")) clearInterval(boardTimer); else if (!document.hidden) drawBoard(); }, 6000);

    let fs = "score";
    const drawFeed = async () => {
      $("#feed").innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join("");
      const f = { sort: fs, ...(fs === "drop" ? { drop: 1 } : {}), ...(fs === "score" || fs === "deal" ? { ranked: 1 } : {}) };
      const r = await DataLayer.search({ ...f, limit: 8 });
      if (!$("#feed")) return;
      $("#feed").innerHTML = r.items.length ? r.items.map((l) => UI.card(l)).join("") : `<div class="empty" style="grid-column:1/-1"><h3>فعلاً موردی نیست</h3><p>با دریافت آگهی‌های بیشتر این بخش پر می‌شود.</p></div>`;
      $("#feedMore").href = "#/s?" + toQuery(f);
    };
    $("#feedS").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fs = b.dataset.s; $$("#feedS button").forEach((x) => x.classList.toggle("is-on", x === b)); drawFeed(); });
    drawFeed();
    bindTools();
    bindPlans();
  }

  function heroArt() {
    return `<svg viewBox="0 0 1440 220" preserveAspectRatio="none">
      <path d="M0 120 L110 70 L210 104 L330 46 L470 112 L600 60 L760 118 L880 64 L1010 108 L1150 52 L1300 100 L1440 70 V220 H0Z" fill="var(--line)" opacity=".7"/>
      <path d="M0 150 Q120 116 240 140 T480 136 T720 148 T960 128 T1200 146 T1440 132 V220 H0Z" fill="var(--forest)" opacity=".18"/>
      <g fill="var(--forest)" opacity=".35"><path d="M70 150 l14-46 14 46z M108 154 l18-58 18 58z M1268 148 l14-48 14 48z M1306 154 l18-60 18 60z M1350 150 l12-40 12 40z"/></g>
      <path d="M0 172 Q360 158 720 170 T1440 166 V220 H0Z" fill="var(--sea)" opacity=".28"/>
      <path d="M0 190 Q60 184 120 190 T240 190 T360 190 T480 190 T600 190 T720 190 T840 190 T960 190 T1080 190 T1200 190 T1320 190 T1440 190" stroke="var(--sea)" stroke-opacity=".45" stroke-width="1.5" fill="none"/>
      <path d="M0 205 Q360 196 720 204 T1440 200 V220 H0Z" fill="var(--sea)" opacity=".35"/>
    </svg>`;
  }

  function provinceColumns(st) {
    const max = Math.max(1, ...Object.values(st.cities || {}).map((c) => c.n));
    return PROVINCES.map((p) => {
      const cs = CITIES.filter((c) => c.province === p.id).map((c) => ({ c, s: (st.cities || {})[c.id] || { n: 0 } })).sort((a, b) => b.s.n - a.s.n);
      const total = cs.reduce((a, x) => a + x.s.n, 0);
      return `<div class="prov__col"><h3>${p.name}<small>${fa(total)} آگهی</small></h3>${cs.slice(0, 8).map(({ c, s }) => {
        const ppm = s.ppm && (s.ppm.apartment || s.ppm.villa);
        return `<a class="city-row" href="#/market?city=${c.id}"><b>${c.name}</b><span class="n">${fa(s.n)}</span><small>${c.tags.join("، ")}${ppm ? ` · میانه متری ${money(ppm)}` : ""}</small><span class="bar"><i style="width:${Math.max(3, (s.n / max) * 100)}%"></i></span></a>`;
      }).join("")}${cs.length > 8 ? `<a class="btn btn--ghost btn--sm" href="#/market" style="margin-top:8px">${fa(cs.length - 8)} شهر دیگر</a>` : ""}</div>`;
    }).join("");
  }

  function methodTeaser() {
    return `<section class="section section--ink">
      <div class="wrap broker">
        <div>
          <span class="kicker">روش کار</span>
          <h2>قیمت منصفانه را از داده می‌سازیم، نه از حدس.</h2>
          <p>هیچ انسانی آگهی‌ها را دستی امتیاز نمی‌دهد. همه مراحل خودکار و با قاعده‌های ثابت انجام می‌شود و برای هر آگهی دلیل امتیازش را نشان می‌دهیم.</p>
          <div class="broker__cta"><a class="btn btn--hot btn--lg" href="#/method">جزئیات روش ارزش‌گذاری</a><a class="btn btn--line btn--lg" href="#/account">خرید اشتراک</a></div>
        </div>
        <ol class="steps">
          <li><div><b>گردآوری پیوسته</b><span>آگهی‌های ملک ${fa(CITIES.length)} شهر به‌تدریج و شبانه‌روزی از دیوار دریافت و تغییر قیمت‌ها ثبت می‌شود.</span></div></li>
          <li><div><b>پاک‌سازی</b><span>قیمت نمادین، اشتباه صفر، پیش‌فروش، مشارکت، فروش دانگی، آگهی تکراری و قیمت‌های پرت آماری کنار گذاشته می‌شوند.</span></div></li>
          <li><div><b>قیمت منصفانه چندمعیاره</b><span>میانه قیمت هر متر محله، تعدیل‌شده با سن بنا، طبقه، متراژ، آسانسور، پارکینگ، انباری، سند، دید دریا و ده‌ها ویژگی دیگر.</span></div></li>
          <li><div><b>امتیاز و رتبه</b><span>فاصله تا قیمت منصفانه، اطمینان برآورد، کیفیت آگهی و تحولات قیمت، در یک امتیاز ۰ تا ۱۰۰.</span></div></li>
        </ol>
      </div>
    </section>`;
  }

  function plansSection() {
    const plans = cfg.plans || [];
    const free = cfg.free_preview || 0;
    return `<section class="section" id="plans">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">اشتراک</span><h2>دسترسی کامل به فرصت‌ها</h2><p>همه می‌توانند امتیاز و رتبه آگهی‌ها را ببینند. با اشتراک، جزئیات کامل ارزش‌گذاری و پیوند مستقیم آگهی در دیوار باز می‌شود.</p></div></div>
        <div class="plans">
          <div class="plan"><h3>رایگان</h3><b class="plan__price">۰</b><ul class="check-list">
            <li>فهرست آگهی‌ها با امتیاز و رتبه</li><li>درصد زیر یا بالای قیمت منصفانه</li><li>بازار محله‌ها و ابزارهای محاسبه</li>${free ? `<li>${fa(free)} فرصت برتر با جزئیات کامل</li>` : ""}
          </ul></div>
          ${plans.length ? plans.map((p, i) => `<div class="plan ${i === plans.length - 1 ? "plan--hot" : ""}"><h3>${esc(p.name)}</h3><b class="plan__price">${fa(p.price)} <small>تومان / ${fa(p.days)} روز</small></b><ul class="check-list">
            <li>پیوند مستقیم هر آگهی در دیوار</li><li>قیمت منصفانه دقیق و اثر هر ویژگی</li><li>همه فرصت‌ها بدون محدودیت</li><li>فعال‌سازی خودکار پس از پرداخت</li>
          </ul><button class="btn ${i === plans.length - 1 ? "btn--hot" : "btn--ink"} btn--block" data-buy="${p.id}">خرید اشتراک ${esc(p.name)}</button></div>`).join("")
          : `<div class="plan plan--hot"><h3>اشتراک</h3><b class="plan__price">به‌زودی</b><p class="muted">تعرفه اشتراک هنوز تعیین نشده است.</p></div>`}
        </div>
      </div>
    </section>`;
  }
  function bindPlans() { $$("[data-buy]").forEach((b) => b.addEventListener("click", () => buy(b.dataset.buy))); }
  async function buy(plan) {
    if (!DataLayer.me) { loginDialog(() => buy(plan)); return; }
    if (!cfg.payable) { toast("پرداخت آنلاین هنوز فعال نشده است"); return; }
    try {
      const r = await DataLayer.startPayment(plan);
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.activated) { await DataLayer.refreshMe(); updateAccount(); toast(r.test ? "اشتراک در حالت آزمایشی فعال شد" : "اشتراک فعال شد"); route(); }
    } catch (err) { toast(err.message); }
  }

  /* ---------- ورود با کد پیامکی ---------- */
  function loginDialog(after) {
    openDialog(`<div class="dlg__head"><h2>ورود یا ثبت‌نام</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <p class="muted" style="margin-bottom:16px">شماره موبایل را وارد کنید؛ کد پنج‌رقمی برایتان پیامک می‌شود. ثبت‌نام همزمان انجام می‌شود.</p>
      <form class="form-grid" id="otpForm">
        <label class="field"><span>شماره موبایل</span><input class="input input--ltr" id="otpPhone" name="phone" inputmode="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹" required autocomplete="tel"></label>
        <div id="otpStep2" hidden><label class="field"><span>کد تأیید</span><input class="input input--ltr" id="otpCode" inputmode="numeric" maxlength="5" autocomplete="one-time-code" placeholder="-----"></label><p class="small muted" id="otpNote" style="margin-top:6px"></p></div>
        <button class="btn btn--hot btn--lg" type="submit" id="otpBtn">دریافت کد</button>
      </form>`);
    let sent = false;
    $("#otpForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#otpBtn"); btn.disabled = true;
      try {
        if (!sent) {
          const r = await DataLayer.requestOtp($("#otpPhone").value);
          sent = true;
          $("#otpStep2").hidden = false; $("#otpPhone").readOnly = true;
          $("#otpNote").innerHTML = r.dev_code ? `سامانه پیامک هنوز تنظیم نشده؛ کد آزمایشی: <b dir="ltr">${esc(r.dev_code)}</b>` : "کد تا ۳ دقیقه معتبر است.";
          btn.textContent = "ورود"; $("#otpCode").focus();
        } else {
          await DataLayer.verifyOtp($("#otpPhone").value, $("#otpCode").value);
          $("#dlg").close(); updateAccount(); toast("وارد شدید");
          if (after) after(); else route();
        }
      } catch (err) { toast(err.message); }
      btn.disabled = false;
    });
  }

  /* ---------- حساب کاربری ---------- */
  async function accountPage(params) {
    if (DataLayer.server) await DataLayer.refreshMe().catch(() => {});
    updateAccount();
    const me = DataLayer.me;
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      ${params.paid ? `<div class="note-ok">پرداخت موفق بود و اشتراک شما فعال شد.</div>` : params.failed ? `<div class="note-bad">پرداخت تکمیل نشد. اگر مبلغی کسر شده باشد، طبق قوانین درگاه ظرف ۷۲ ساعت بازمی‌گردد.</div>` : ""}
      <div class="sec-head"><div><span class="kicker">حساب من</span><h2>${me ? "اشتراک و حساب کاربری" : "ورود و اشتراک"}</h2></div></div>
      ${me ? `<div class="account">
          <div><span class="muted small">شماره موبایل</span><b dir="ltr">${esc(me.phone)}</b></div>
          <div><span class="muted small">وضعیت اشتراک</span><b class="${me.active ? "ok-text" : ""}">${me.active ? `فعال · ${fa(me.days_left)} روز باقی‌مانده` : "بدون اشتراک فعال"}</b></div>
          ${me.active ? `<div><span class="muted small">پایان اشتراک</span><b>${new Date(me.sub_until * 1000).toLocaleDateString("fa-IR", { dateStyle: "long" })}</b></div>` : ""}
          <button class="btn btn--line" id="logoutBtn">خروج</button>
        </div>` : `<div class="empty"><h3>با شماره موبایل وارد شوید</h3><p>ثبت‌نام و ورود با یک کد پیامکی انجام می‌شود.</p><button class="btn btn--hot btn--lg" id="loginBtn">ورود یا ثبت‌نام</button></div>`}
    </div></section>${plansSection()}`;
    $("#loginBtn")?.addEventListener("click", () => loginDialog());
    $("#logoutBtn")?.addEventListener("click", async () => { await DataLayer.logout(); updateAccount(); route(); });
    bindPlans();
  }

  /* ---------- ابزارها ---------- */
  function toolsHTML() {
    const cityOpts = PROVINCES.map((p) => `<optgroup label="${p.name}">${CITIES.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}" ${c.id === "rasht" ? "selected" : ""}>${c.name}</option>`).join("")}</optgroup>`).join("");
    return `
      <div class="tool"><h3>تخمین ارزش ملک</h3><p>میانه قیمت منصفانه هر متر آگهی‌های فروش مشابه</p>
        <div class="row2"><label class="field"><span>شهر</span><select class="select" id="vCity">${cityOpts}</select></label>
        <label class="field"><span>نوع</span><select class="select" id="vKind">${PROPERTY_TYPES.map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}</select></label></div>
        <label class="field"><span>متراژ (متر مربع)</span><input class="input" id="vArea" inputmode="numeric" value="120"></label>
        <div class="tool__out" id="vOut"></div></div>
      <div class="tool"><h3>اقساط وام</h3><p>روش استهلاک یکنواخت (قسط ثابت ماهانه)</p>
        <label class="field"><span>مبلغ وام (تومان)</span><input class="input input--ltr" id="lAmt" inputmode="numeric" value="1,000,000,000"></label>
        <div class="row2"><label class="field"><span>سود سالانه ٪</span><input class="input" id="lRate" inputmode="decimal" value="23"></label>
        <label class="field"><span>مدت (سال)</span><input class="input" id="lYears" inputmode="numeric" value="5"></label></div>
        <div class="tool__out" id="lOut"></div></div>
      <div class="tool"><h3>تبدیل رهن و اجاره</h3><p>نرخ تبدیل قابل تنظیم (عرف رایج ۳٪ ماهانه)</p>
        <div class="row2"><label class="field"><span>ودیعه (تومان)</span><input class="input input--ltr" id="cDep" inputmode="numeric" value="500,000,000"></label>
        <label class="field"><span>اجاره ماهانه</span><input class="input input--ltr" id="cRent" inputmode="numeric" value="10,000,000"></label></div>
        <label class="field"><span>نرخ تبدیل ماهانه ٪</span><input class="input" id="cRate" inputmode="decimal" value="3"></label>
        <div class="tool__out" id="cOut"></div></div>`;
  }
  function bindTools() {
    const val = async () => {
      const city = $("#vCity").value, kind = $("#vKind").value, area = num($("#vArea").value);
      let r = await DataLayer.search({ deal: "sale", city, kinds: kind, limit: 60, ranked: 1 });
      let pool = r.items.map((l) => l.fair_ppm).filter(Boolean), basis = `${fa(pool.length)} آگهی در ${UI.cityOf(city).name}`;
      if (pool.length < 3) {
        const prov = UI.cityOf(city).province;
        r = await DataLayer.search({ deal: "sale", province: prov, kinds: kind, limit: 60, ranked: 1 });
        pool = r.items.map((l) => l.fair_ppm).filter(Boolean);
        basis = `داده شهر کافی نبود؛ ${fa(pool.length)} آگهی در استان ${UI.provOf(prov).name}`;
      }
      const m = median(pool);
      if (!$("#vOut")) return;
      $("#vOut").innerHTML = m && area && pool.length >= 3 ? `<b>${money(m * area * 0.9)} تا ${money(m * area * 1.1)}</b><span>میانه هر متر ${money(m)} · مبنا: ${basis}${DataLayer.samples ? " (داده نمونه)" : ""}</span>` : `<span>برای این ترکیب هنوز آگهی فروش کافی نیست.</span>`;
    };
    const loan = () => {
      const P = num($("#lAmt").value), r = num($("#lRate").value) / 1200, n = num($("#lYears").value) * 12;
      if (!P || !n) { $("#lOut").innerHTML = ""; return; }
      const pay = r ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
      $("#lOut").innerHTML = `<b>${fa(Math.round(pay))} تومان</b><span>قسط ماهانه · کل بازپرداخت ${money(pay * n)} · سود ${money(pay * n - P)}</span>`;
    };
    const conv = () => {
      const d = num($("#cDep").value), rent = num($("#cRent").value), r = num($("#cRate").value) / 100;
      if (!r) { $("#cOut").innerHTML = ""; return; }
      $("#cOut").innerHTML = `<b>${money(d + rent / r)} رهن کامل</b><span>یا اجاره کامل بدون ودیعه: ${money(rent + d * r)} تومان در ماه</span>`;
    };
    ["#vCity", "#vKind", "#vArea"].forEach((s) => $(s).addEventListener("input", val));
    ["#lAmt", "#lRate", "#lYears"].forEach((s) => $(s).addEventListener("input", loan));
    ["#cDep", "#cRent", "#cRate"].forEach((s) => $(s).addEventListener("input", conv));
    ["#lAmt", "#cDep", "#cRent"].forEach((s) => $(s).addEventListener("blur", (e) => { const v = num(e.target.value); e.target.value = v ? v.toLocaleString("en-US") : ""; }));
    val(); loan(); conv();
  }

  /* ---------- صفحه جست‌وجو ---------- */
  const searchPage = (() => {
    let F = {}, page = 0, viewMode = store.get("view", "split"), lastPoints = [], reqId = 0;
    const PER = 24;
    let districts = [];

    function render(params) {
      view().innerHTML = `
      <div class="search-page">
        <div class="sbar"><div class="wrap">
          <div class="sbar__row">
            <form class="sbar__q" id="sq" autocomplete="off">${icon("spark")}<input id="sqInput" placeholder="جمله‌ات را بنویس؛ مثلاً «ویلای استخردار نور زیر ۱۵ میلیارد»" aria-label="جست‌وجو"><button class="btn btn--ink btn--sm" aria-label="جست‌وجو">${icon("search")}</button></form>
            <div id="dds" class="sbar__row"></div>
          </div>
          <div class="atags" id="atags"></div>
          <div class="sbar__meta">
            <h1 id="sTitle"></h1>
            <div class="sbar__tools">
              <button class="btn btn--line btn--sm" id="saveSearch">${icon("bell")} ذخیره</button>
              <select class="select" id="sort" aria-label="مرتب‌سازی"></select>
              <div class="seg" id="viewSeg"><button data-v="split" title="فهرست و نقشه">${icon("split", 'width="18"')}</button><button data-v="list" title="فهرست">${icon("list", 'width="18"')}</button><button data-v="map" title="نقشه">${icon("map", 'width="18"')}</button></div>
            </div>
          </div>
        </div></div>
        <div class="wrap">
          <div class="split" id="split">
            <div class="results"><div class="cards" id="grid"></div><div class="pager" id="pager"></div></div>
            <div class="mapbox"><div id="map"></div></div>
          </div>
        </div>
      </div>`;
      state.map = UI.makeMap($("#map"));
      state.markers = {};
      if (state.map) { state.layer = L.layerGroup().addTo(state.map); state.map.on("zoomend", () => drawMap(lastPoints, false)); }
      $("#sq").addEventListener("submit", (e) => {
        e.preventDefault();
        const v = $("#sqInput").value.trim();
        if (!v) return;
        set({ sort: F.sort, ...NLP.parseQuery(v).filters }, true);
        $("#sqInput").value = "";
      });
      $("#sort").addEventListener("change", (e) => set({ sort: e.target.value }));
      $("#viewSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; viewMode = b.dataset.v; store.set("view", viewMode); applyView(); });
      $("#saveSearch").addEventListener("click", () => {
        const list = store.get("searches", []);
        list.unshift({ q: toQuery(F), title: titleOf(), at: Date.now() });
        store.set("searches", list.slice(0, 12));
        toast("جست‌وجو در «ذخیره‌شده‌ها» نگه داشته شد");
      });
      $("#atags").addEventListener("click", (e) => {
        const b = e.target.closest("[data-rm]"); if (!b) return;
        const [k, v] = b.dataset.rm.split(":");
        if (v) set({ [k]: F[k].split(",").filter((x) => x !== v).join(",") });
        else set(k === "province" ? { province: "", city: "", district: "" } : k === "city" ? { city: "", district: "" } : { [k]: "" });
      });
      update(params);
    }
    function set(patch, replace = false) { F = replace ? { ...patch } : { ...F, ...patch }; go("#/s?" + toQuery(F)); }
    function applyView() {
      $("#split").className = "split is-" + viewMode;
      $$("#viewSeg button").forEach((b) => b.classList.toggle("is-on", b.dataset.v === viewMode));
      setTimeout(() => state.map && state.map.invalidateSize(), 60);
    }
    function titleOf() {
      const c = UI.cityOf(F.city), p = UI.provOf(F.province);
      const where = F.district ? `در ${F.district}، ${c ? c.name : ""}` : c ? `در ${c.name}` : p ? `در استان ${p.name}` : "در شمال";
      const kinds = (F.kinds || "").split(",").filter(Boolean).map(UI.kindName).join(" و ") || "ملک";
      return `${F.ranked ? "فرصت‌های " : ""}${kinds}${F.deal ? " برای " + UI.dealName(F.deal) : ""} ${where}`;
    }

    async function loadDistricts() {
      districts = [];
      if (!F.city) return;
      const r = await DataLayer.market(F.city);
      const agg = {};
      r.rows.forEach((x) => { if (x.district) agg[x.district] = (agg[x.district] || 0) + x.n; });
      districts = Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([d, n]) => ({ d, n }));
    }

    function dropdowns() {
      const cityLabel = F.district || UI.cityOf(F.city)?.name || (F.province ? "استان " + UI.provOf(F.province).name : "همه شهرها");
      const priceSet = F.min || F.max;
      const priceLabel = priceSet ? [F.min && "از " + money(+F.min), F.max && "تا " + money(+F.max)].filter(Boolean).join(" ") : "قیمت";
      const kinds = (F.kinds || "").split(",").filter(Boolean);
      const am = (F.amenities || "").split(",").filter(Boolean);
      const dd = (id, label, on, body) => `<div class="dd" data-dd="${id}"><button type="button" class="${on ? "is-set" : ""}">${esc(label)}</button><div class="dd__panel">${body}<div class="dd__foot"><button type="button" class="btn btn--ghost btn--sm" data-clear="${id}">پاک کردن</button><button type="button" class="btn btn--ink btn--sm" data-apply="${id}">اعمال</button></div></div></div>`;
      let html = dd("city", cityLabel, F.city || F.province, `<div class="dd__label">استان</div><div class="dd__grid">${PROVINCES.map((p) => `<button type="button" class="chip ${F.province === p.id && !F.city ? "is-on" : ""}" data-prov="${p.id}">${p.name}</button>`).join("")}</div>
        <div class="dd__label">شهر</div><select class="select" id="ddCity"><option value="">همه شهرها</option>${PROVINCES.map((p) => `<optgroup label="${p.name}">${CITIES.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}" ${F.city === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</optgroup>`).join("")}</select>
        ${F.city && districts.length ? `<div class="dd__label">محله</div><select class="select" id="ddDist"><option value="">همه محله‌ها</option>${districts.map((x) => `<option value="${esc(x.d)}" ${F.district === x.d ? "selected" : ""}>${esc(x.d)} (${fa(x.n)})</option>`).join("")}</select>` : ""}`);
      html += dd("deal", F.deal ? UI.dealName(F.deal) : "نوع معامله", F.deal, `<div class="dd__grid">${[{ id: "", name: "همه" }, ...DEAL_TYPES].map((d) => `<button type="button" class="chip ${(F.deal || "") === d.id ? "is-on" : ""}" data-pick="deal" data-val="${d.id}">${d.name}</button>`).join("")}</div>`);
      html += dd("kinds", kinds.length ? kinds.map(UI.kindName).join("، ") : "نوع ملک", kinds.length, `<div class="dd__grid">${PROPERTY_TYPES.map((t) => `<button type="button" class="chip ${kinds.includes(t.id) ? "is-on" : ""}" data-toggle="kinds" data-val="${t.id}">${t.name}</button>`).join("")}</div>`);
      html += dd("price", priceLabel, priceSet, `<div class="dd__label">${F.deal === "rent" ? "ودیعه معادل (ودیعه + اجاره ÷ ۳٪)" : F.deal === "daily" ? "اجاره هر شب" : "قیمت کل"} به تومان</div><div class="range"><input class="input" id="ddMin" placeholder="از" value="${F.min ? money(+F.min) : ""}"><input class="input" id="ddMax" placeholder="تا" value="${F.max ? money(+F.max) : ""}"></div><p class="small muted" style="margin-top:8px">عدد یا عبارت بنویسید: «۲ میلیارد»، «۸۰۰ میلیون».</p>`);
      const moreOn = am.length || F.rooms || F.areaMin || F.areaMax;
      html += dd("more", "متراژ و امکانات", moreOn,
        `<div class="dd__label">متراژ (متر مربع)</div><div class="range"><input class="input" id="ddAMin" inputmode="numeric" placeholder="از" value="${F.areaMin || ""}"><input class="input" id="ddAMax" inputmode="numeric" placeholder="تا" value="${F.areaMax || ""}"></div>
        <div class="dd__label">اتاق خواب</div><div class="dd__grid">${[0, 1, 2, 3, 4].map((r) => `<button type="button" class="chip ${(+F.rooms || 0) === r ? "is-on" : ""}" data-pick="rooms" data-val="${r || ""}">${r ? fa(r) + (r === 4 ? "+" : "") : "همه"}</button>`).join("")}</div>
        <div class="dd__label">امکانات</div><div class="dd__grid">${AMENITIES.map((a) => `<button type="button" class="chip ${am.includes(a.id) ? "is-on" : ""}" data-toggle="amenities" data-val="${a.id}">${a.name}</button>`).join("")}</div>`);
      html += `<button type="button" class="chip ${F.ranked ? "is-on" : ""}" id="rankChip">فقط دارای امتیاز</button><button type="button" class="chip ${F.drop ? "is-on" : ""}" id="dropChip">کاهش قیمت</button>`;
      $("#dds").innerHTML = html;
      $("#rankChip").addEventListener("click", () => set({ ranked: F.ranked ? "" : 1 }));
      $("#dropChip").addEventListener("click", () => set({ drop: F.drop ? "" : 1 }));
      $$(".dd").forEach((d) => {
        d.firstElementChild.addEventListener("click", (e) => { e.stopPropagation(); const open = d.classList.contains("is-open"); $$(".dd.is-open").forEach((x) => x.classList.remove("is-open")); d.classList.toggle("is-open", !open); });
        const panel = d.querySelector(".dd__panel");
        const pending = {};
        panel.addEventListener("click", (e) => {
          e.stopPropagation();
          const t = e.target.closest("button"); if (!t) return;
          if (t.dataset.prov) { set({ province: t.dataset.prov, city: "", district: "" }); return; }
          if (t.dataset.pick) {
            $$(`[data-pick="${t.dataset.pick}"]`, panel).forEach((x) => x.classList.toggle("is-on", x === t));
            pending[t.dataset.pick] = t.dataset.val;
            if (d.dataset.dd === "deal") set({ deal: t.dataset.val });
            return;
          }
          if (t.dataset.toggle) { t.classList.toggle("is-on"); return; }
          if (t.dataset.clear) {
            set({ city: { city: "", province: "", district: "" }, deal: { deal: "" }, kinds: { kinds: "" }, price: { min: "", max: "" }, more: { areaMin: "", areaMax: "", rooms: "", amenities: "" } }[t.dataset.clear]);
            return;
          }
          if (t.dataset.apply) {
            const id = t.dataset.apply, p = { ...pending };
            const toggles = (k) => $$(`[data-toggle="${k}"].is-on`, panel).map((x) => x.dataset.val).join(",");
            if (id === "city") {
              const c = UI.cityOf($("#ddCity").value);
              Object.assign(p, c ? { city: c.id, province: c.province } : { city: "" });
              p.district = c && c.id === F.city && $("#ddDist") ? $("#ddDist").value : "";
            }
            if (id === "kinds") p.kinds = toggles("kinds");
            if (id === "price") { p.min = moneyIn($("#ddMin").value); p.max = moneyIn($("#ddMax").value); }
            if (id === "more") { p.areaMin = num($("#ddAMin").value) || ""; p.areaMax = num($("#ddAMax").value) || ""; p.amenities = toggles("amenities"); }
            set(p);
          }
        });
        panel.addEventListener("change", (e) => { if (e.target.id === "ddCity" || e.target.id === "ddDist") panel.querySelector("[data-apply]").click(); });
      });
    }
    function moneyIn(v) {
      const t = NLP.normalize(v || "");
      if (!t) return "";
      const n = parseFloat(t.replace(/[^\d.]/g, ""));
      if (isNaN(n)) return "";
      return /میلیارد/.test(t) ? n * 1e9 : /میلیون/.test(t) ? n * 1e6 : n;
    }
    function activeTags() {
      const t = [];
      if (F.city) t.push(["city", UI.cityOf(F.city)?.name]); else if (F.province) t.push(["province", "استان " + UI.provOf(F.province)?.name]);
      if (F.district) t.push(["district", F.district]);
      if (F.deal) t.push(["deal", UI.dealName(F.deal)]);
      (F.kinds || "").split(",").filter(Boolean).forEach((k) => t.push(["kinds:" + k, UI.kindName(k)]));
      if (F.min) t.push(["min", "از " + money(+F.min)]);
      if (F.max) t.push(["max", "تا " + money(+F.max)]);
      if (F.areaMin) t.push(["areaMin", "از " + fa(F.areaMin) + " متر"]);
      if (F.areaMax) t.push(["areaMax", "تا " + fa(F.areaMax) + " متر"]);
      if (F.rooms) t.push(["rooms", fa(F.rooms) + " خواب"]);
      (F.amenities || "").split(",").filter(Boolean).forEach((a) => t.push(["amenities:" + a, AMENITIES.find((x) => x.id === a)?.name || a]));
      if (F.ranked) t.push(["ranked", "دارای امتیاز"]);
      if (F.drop) t.push(["drop", "کاهش قیمت"]);
      $("#atags").innerHTML = t.map(([k, v]) => `<button class="atag" data-rm="${esc(k)}">${esc(v)} <i>✕</i></button>`).join("");
    }

    async function update(params) {
      const cityChanged = params.city !== F.city;
      F = { ...params };
      page = +F.page || 0; delete F.page;
      if (cityChanged) await loadDistricts();
      dropdowns(); activeTags(); applyView();
      const sorts = [["score", "بیشترین امتیاز"], ["deal", "بیشترین تخفیف"], ["new", "جدیدترین"], ["cheap", "ارزان‌ترین"], ["exp", "گران‌ترین"], ["ppm", "ارزان‌ترین هر متر"], ["area", "بزرگ‌ترین"], ["drop", "بیشترین کاهش"]];
      $("#sort").innerHTML = sorts.map(([v, n]) => `<option value="${v}" ${(F.sort || "score") === v ? "selected" : ""}>${n}</option>`).join("");
      $("#grid").innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join("");
      const id = ++reqId;
      const r = await DataLayer.search({ ...F, limit: PER, offset: page * PER });
      if (id !== reqId || !$("#grid")) return;
      $("#sTitle").innerHTML = `${esc(titleOf())}<small>${fa(r.total)} آگهی</small>`;
      document.title = `${titleOf()} | ${cfg.site.name}`;
      $("#grid").innerHTML = r.items.length ? r.items.map((l) => UI.card(l)).join("")
        : `<div class="empty" style="grid-column:1/-1">${icon("search")}<h3>آگهی‌ای با این مشخصات نیست</h3><p>چند فیلتر را بردارید یا از دستیار بخواهید گزینه نزدیک پیدا کند.</p><a class="btn btn--ink" href="#/s?sort=score">نمایش همه</a></div>`;
      if (!r.items.length) relaxHints(id);
      const pages = Math.ceil(r.total / PER);
      $("#pager").innerHTML = pages > 1 ? `${page > 0 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page - 1 })}">قبلی</a>` : ""}<span class="btn btn--ghost">صفحه ${fa(page + 1)} از ${fa(pages)}</span>${page < pages - 1 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page + 1 })}">بعدی</a>` : ""}` : "";
      lastPoints = r.points;
      drawMap(r.points, true);
    }
    async function relaxHints(id) {
      const names = { amenities: "بدون امکانات انتخابی", rooms: "هر تعداد خواب", areaMin: "هر متراژ", areaMax: "هر متراژ", kinds: "همه انواع ملک", max: "بدون سقف قیمت", min: "بدون کف قیمت", deal: "همه معامله‌ها", drop: "همه آگهی‌ها", ranked: "شامل آگهی‌های بی‌امتیاز", district: "همه محله‌ها", city: "کل استان" };
      const opts = [];
      for (const k of Object.keys(names).filter((k) => F[k])) {
        const f = { ...F }; delete f[k];
        const r = await DataLayer.search({ ...f, limit: 1 });
        if (r.total) opts.push([k, r.total]);
      }
      if (id !== reqId || !opts.length) return;
      const box = $("#grid .empty"); if (!box) return;
      box.querySelector("p").insertAdjacentHTML("afterend", `<div class="relax">${opts.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `<button class="chip" data-relax="${k}">${names[k]} <b>${fa(n)}</b></button>`).join("")}</div>`);
      $$("[data-relax]", box).forEach((b) => b.addEventListener("click", () => set({ [b.dataset.relax]: "" })));
    }
    function drawMap(points, fit) {
      const map = state.map; if (!map) return;
      state.layer.clearLayers(); state.markers = {};
      const z = map.getZoom(), single = F.city && points.every((p) => p.city_key === F.city);
      const level = single || z >= 10 ? "pin" : z < 8 && !F.province ? "province" : "city";
      const dense = level === "pin" && points.length > 40;
      const pin = (p) => {
        const label = p.score != null ? `${fa(Math.round(p.score))} · ${UI.pinLabel(p)}` : UI.pinLabel(p);
        const html = dense
          ? `<span class="pin-dot pin-dot--${p.score == null ? "na" : p.score >= 75 ? "hi" : p.score >= 55 ? "mid" : "lo"}" title="${esc(label)}">${p.score != null ? fa(Math.round(p.score)) : "–"}</span>`
          : `<span class="pin pin--${p.deal}">${esc(label)}</span>`;
        const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "pin-wrap", html, iconSize: null }) }).addTo(state.layer);
        m.on("click", () => go("#/ad/" + encodeURIComponent(p.id)));
        state.markers[p.id] = m;
      };
      if (level === "pin") points.forEach(pin);
      else {
        const g = {};
        points.forEach((p) => { const k = level === "city" ? p.city_key : UI.cityOf(p.city_key)?.province; (g[k] = g[k] || []).push(p); });
        Object.entries(g).forEach(([k, ps]) => {
          if (ps.length === 1) return pin(ps[0]);
          const o = level === "city" ? UI.cityOf(k) : UI.provOf(k);
          if (!o) return;
          const pos = level === "city" ? [o.lat, o.lng] : o.center;
          L.marker(pos, { icon: L.divIcon({ className: "pin-wrap", html: `<span class="cluster"><b>${fa(ps.length)}</b>${o.name}</span>`, iconSize: null }) })
            .addTo(state.layer).on("click", () => map.setView(pos, level === "city" ? 12 : 9));
        });
      }
      if (fit && points.length) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 12 });
    }
    return { render, update };
  })();

  /* ---------- صفحه آگهی ---------- */
  function valuationCard(l) {
    const v = l.verdict, ex = l.explain || {};
    const locked = l.locked;
    if (l.excluded) {
      return `<div class="vcard vcard--warn"><h3>این آگهی در رتبه‌بندی نیامده است</h3><ul class="check-list">${(l.excluded_reasons || []).map((r) => `<li>${esc(r)}</li>`).join("") || "<li>اطلاعات قیمت برای مقایسه کافی نیست</li>"}</ul><p class="small muted">این آگهی در محاسبه میانگین‌ها هم شرکت داده نشده است.</p></div>`;
    }
    if (!v) {
      return `<div class="vcard"><h3>هنوز داده کافی برای ارزش‌گذاری نیست</h3><p class="muted small">برای مقایسه قابل اتکا دست‌کم ۵ آگهی مشابه در همین شهر لازم است. با دریافت آگهی‌های بیشتر، امتیاز این آگهی خودکار محاسبه می‌شود.</p></div>`;
    }
    const markPos = Math.max(2, Math.min(98, ((v.delta + 0.25) / 0.5) * 100));
    const ask = l.deal === "daily" ? l.price : l.pp;
    return `<div class="vcard">
      <div class="vcard__top">
        ${l.score != null ? `<span class="score score--${l.score >= 75 ? "hi" : l.score >= 55 ? "mid" : "lo"} score--big"><b>${fa(Math.round(l.score))}</b><i>از ۱۰۰</i></span>` : ""}
        <div><h3>${UI.dealPill(v)}</h3><p class="small muted">${CONF[l.confidence] || ""} · مبنا: ${ex.district_n ? `${fa(ex.district_n)} آگهی در همین محله و ` : ""}${fa(ex.city_n || v.n)} آگهی در شهر</p></div>
      </div>
      <div class="vcard__nums">
        <div><span>قیمت آگهی${l.deal === "rent" ? " (ودیعه معادل)" : ""}</span><b>${money(ask) || "—"}</b></div>
        <div><span>قیمت منصفانه برآوردی</span><b class="${locked ? "blur" : ""}">${locked ? "۰٫۰ میلیارد" : money(l.fair_price)}</b></div>
      </div>
      <div class="gauge"><div class="gauge__bar"><span></span><span></span><span></span><span></span><span></span><i class="gauge__mark" style="right:${markPos}%"></i></div>
      <div class="gauge__labels"><span>خیلی ارزان</span><span>ارزان</span><span>منصفانه</span><span>گران</span><span>خیلی گران</span></div></div>
      <div class="vcard__fx">
        <b>اثر ویژگی‌ها بر قیمت منصفانه این ملک</b>
        ${locked ? `<p class="small muted">${ex.effects_count ? `${fa(ex.effects_count)} ویژگی در برآورد این آگهی اثر داشته است.` : ""} جزئیات با اشتراک نمایش داده می‌شود.</p>`
          : (ex.effects || []).length ? `<ul class="fx">${ex.effects.map(([name, e]) => `<li><span>${esc(name)}</span><b class="${e >= 0 ? "up" : "down"}">${e >= 0 ? "+" : "−"}${pct(e)}</b></li>`).join("")}</ul>${ex.model ? `<p class="small muted">مدل قیمت با ${fa(ex.model.n)} آگهی ساخته شده است (ضریب تعیین ${fa(ex.model.r2)}).</p>` : ""}`
          : `<p class="small muted">${ex.sample ? "در پیش‌نمایش، فقط میانه استان مبناست." : "داده هنوز برای مدل چندمعیاره کافی نیست؛ مبنا میانه محله و شهر است."}</p>`}
      </div>
    </div>`;
  }

  async function adPage(id) {
    view().innerHTML = `<div class="wrap ad"><div class="skeleton" style="height:440px"></div></div>`;
    const l = await DataLayer.get(id);
    if (!l) { view().innerHTML = `<div class="wrap ad"><div class="empty"><h3>این آگهی پیدا نشد</h3><p>ممکن است در دیوار حذف شده باشد.</p><a class="btn btn--ink" href="#/">بازگشت به خانه</a></div></div>`; return; }
    const c = UI.cityOf(l.city_key);
    const imgs = l.images && l.images.length ? l.images : l.image ? [l.image] : [];
    const gal = Array.from({ length: 5 }, (_, i) => `<button data-img="${i}" aria-label="تصویر ${fa(i + 1)}">${UI.media(l, imgs.length ? Math.min(i, imgs.length - 1) : i)}${i === 4 && imgs.length > 5 ? `<span class="more">+${fa(imgs.length - 5)} عکس</span>` : ""}</button>`).join("");
    const ft = l.feat || {};
    const facts = [["نوع", UI.kindName(l.kind)], ["متراژ", l.area && fa(l.area) + " متر"], ["اتاق", l.rooms != null && fa(l.rooms)],
      ["سال ساخت", l.year && faY(l.year)], ["طبقه", ft.floor != null ? fa(ft.floor) + (ft.floors_total ? " از " + fa(ft.floors_total) : "") : l.floor != null && fa(l.floor)],
      ["قیمت هر متر", l.ppm && money(l.ppm)]];
    const has = (a) => (l.amenities || []).includes(a);
    const amen = AMENITIES.map((a) => `<li class="${has(a.id) ? "" : "is-off"}">${icon(has(a.id) ? "check" : "x")}${a.name}</li>`).join("");
    const attrs = Object.entries(l.attributes || {}).filter(([, val]) => val && String(val).length < 80);
    const divarBtn = l.locked
      ? `<button class="btn btn--hot btn--block btn--lg" id="divarBtn">${icon("arrow")} مشاهده آگهی در دیوار</button><p class="agent__note">پیوند مستقیم آگهی در دیوار و جزئیات کامل ارزش‌گذاری برای مشترکان فعال است.</p>`
      : l.url ? `<a class="btn btn--hot btn--block btn--lg" href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${icon("arrow")} مشاهده آگهی در دیوار</a><p class="agent__note">اطلاعات تماس و جزئیات بیشتر در صفحه دیوار است.</p>` : "";
    view().innerHTML = `
    <article class="wrap ad">
      <nav class="crumbs"><a href="#/">خانه</a>${c ? `<span><a href="#/s?city=${c.id}&sort=score">${c.name}</a></span>` : ""}${l.district && c ? `<span><a href="#/s?city=${c.id}&district=${encodeURIComponent(l.district)}&sort=score">${esc(l.district)}</a></span>` : ""}<span>${UI.tt(l.title)}</span></nav>
      <div class="gallery" id="gal">${gal}</div>
      <div class="ad__grid">
        <div>
          <header class="ad__head">
            <div class="ad__badges">${UI.typePill(l)}${l.price_drop ? `<span class="pill pill--drop">${fa(Math.round(l.price_drop * 100))}٪ کاهش قیمت</span>` : ""}${l.source === "sample" ? '<span class="pill pill--demo">آگهی نمونه</span>' : ""}</div>
            <h1>${UI.tt(l.title)}</h1>
            <p class="muted">${esc([c && "استان " + UI.provOf(c.province).name, c ? c.name : l.city_name, l.district].filter(Boolean).join("، "))}${l.first_seen ? " · ثبت در سامانه " + UI.ago(l.first_seen) : ""}</p>
            <div class="ad__price">${UI.priceHTML(l, true)}</div>
          </header>
          <div class="facts">${facts.filter(([, x]) => x).map(([k, x]) => `<div><span>${k}</span><b>${esc(x)}</b></div>`).join("")}</div>
          <div class="mobile-only">${valuationCard(l)}</div>
          ${l.history && l.history.length > 1 ? `<section class="block"><h2>تاریخچه قیمت</h2>${UI.spark(l.history)}</section>` : ""}
          ${l.description ? `<section class="block"><h2>توضیحات آگهی</h2><p>${esc(l.description)}</p></section>` : ""}
          <section class="block"><h2>امکانات</h2><ul class="amen-list">${amen}</ul><p class="small muted" style="margin-top:10px">امکانات از متن آگهی استخراج شده است؛ در بازدید تأیید کنید.</p></section>
          ${attrs.length ? `<section class="block"><h2>مشخصات</h2><div class="attrs">${attrs.map(([k, x]) => `<div><span>${esc(k)}</span><b>${UI.tt(x)}</b></div>`).join("")}</div></section>` : ""}
          <section class="block"><h2>موقعیت تقریبی</h2><div class="minimap-wrap"><div class="minimap" id="mini"></div></div><p class="small muted" style="margin-top:8px">${l.latlng_exact ? "موقعیت اعلام‌شده در آگهی." : "نقطه تقریبی در محدوده شهر."}</p></section>
          <section class="block"><h2>پیش از معامله</h2><ul class="check">${["دیدن اصل سند و تطبیق مشخصات با ملک", "استعلام وضعیت حقوقی، رهن و توقیف", "پایان‌کار و پروانه ساخت (ملک نوساز)", "بدهی عوارض، آب، برق و گاز", l.deal === "rent" ? "دریافت کد رهگیری اجاره‌نامه" : "تنظیم قرارداد با کد رهگیری"].map((x) => `<li>${x}</li>`).join("")}</ul></section>
          ${l.similar && l.similar.length ? `<section class="block"><h2>فرصت‌های مشابه</h2><div class="cards">${l.similar.slice(0, 3).map((x) => UI.card(x, { compare: false })).join("")}</div></section>` : ""}
        </div>
        <aside class="agent" id="agent">
          <div class="desktop-only">${valuationCard(l)}</div>
          ${divarBtn}
          <div class="agent__row">
            <button class="btn btn--line" id="adFav">${icon("heart")}<span>${state.favs.has(l.id) ? "ذخیره شد" : "ذخیره"}</span></button>
            <button class="btn btn--line" id="adShare">${icon("share")} اشتراک‌گذاری</button>
          </div>
          <p class="agent__note">قیمت منصفانه برآوردی آماری از قیمت‌های پیشنهادی آگهی‌های مشابه است، نه کارشناسی رسمی.</p>
        </aside>
      </div>
    </article>
    <div class="mobile-cta">${l.locked ? `<button class="btn btn--hot" id="divarBtnM">مشاهده در دیوار</button>` : l.url ? `<a class="btn btn--hot" href="${esc(l.url)}" target="_blank" rel="noopener nofollow">مشاهده در دیوار</a>` : ""}</div>`;
    document.body.classList.add("has-mcta");
    document.title = `${l.title} | ${cfg.site.name}`;
    const mini = UI.makeMap($("#mini"), { center: [l.lat, l.lng], zoom: 13, wheel: false });
    if (mini) L.circle([l.lat, l.lng], { radius: l.latlng_exact ? 120 : 900, color: "#df5a2c", weight: 2, fillOpacity: 0.12 }).addTo(mini);
    $("#gal").addEventListener("click", (e) => { const b = e.target.closest("[data-img]"); if (b) lightbox(l, imgs.length ? Math.min(+b.dataset.img, imgs.length - 1) : +b.dataset.img); });
    $("#adFav").addEventListener("click", (e) => { toggleFav(l.id); e.currentTarget.querySelector("span").textContent = state.favs.has(l.id) ? "ذخیره شد" : "ذخیره"; });
    $("#adShare").addEventListener("click", async () => {
      try { if (navigator.share) await navigator.share({ title: l.title, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast("پیوند کپی شد"); } } catch { /* لغو */ }
    });
    const paywall = () => (DataLayer.me ? go("#/account") : loginDialog(() => go("#/account")));
    $("#divarBtn")?.addEventListener("click", paywall);
    $("#divarBtnM")?.addEventListener("click", paywall);
  }

  function lightbox(l, i) {
    const imgs = l.images && l.images.length ? l.images : l.image ? [l.image] : [null, null, null, null, null];
    const n = imgs.length;
    const el = document.createElement("div");
    el.className = "lightbox";
    const draw = () => { el.innerHTML = `<div style="display:grid">${UI.media(l, i)}</div><div class="lightbox__bar"><button class="btn btn--line" data-d="-1">قبلی</button><span>${fa(i + 1)} از ${fa(n)}</span><button class="btn btn--line" data-d="1">بعدی</button><button class="btn btn--line" data-x>بستن</button></div>`; };
    const close = () => { el.remove(); document.removeEventListener("keydown", key); };
    const key = (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowLeft") { i = (i + 1) % n; draw(); } if (e.key === "ArrowRight") { i = (i - 1 + n) % n; draw(); } };
    draw();
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b?.dataset.d) { i = (i + +b.dataset.d + n) % n; draw(); }
      else if (b?.hasAttribute("data-x") || e.target === el) close();
    });
    document.addEventListener("keydown", key);
    document.body.appendChild(el);
  }

  /* ---------- ذخیره‌شده‌ها ---------- */
  async function savedPage() {
    const ids = [...state.favs];
    const searches = store.get("searches", []);
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      <div class="sec-head"><div><span class="kicker">ذخیره‌شده‌ها</span><h2>آگهی‌ها و جست‌وجوهای من</h2><p>در همین مرورگر نگه داشته می‌شوند.</p></div></div>
      <div class="cards" id="favGrid"></div>
      <div class="block"><h2>جست‌وجوهای ذخیره‌شده</h2>${searches.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${searches.map((s, i) => `<span style="display:inline-flex;gap:4px"><a class="chip" href="#/s?${esc(s.q)}">${esc(s.title)}</a><button class="chip" data-del="${i}" aria-label="حذف">✕</button></span>`).join("")}</div>` : '<p class="muted">هنوز جست‌وجویی ذخیره نکرده‌اید.</p>'}</div>
    </div></section>`;
    $$("[data-del]").forEach((b) => b.addEventListener("click", () => { searches.splice(+b.dataset.del, 1); store.set("searches", searches); savedPage(); }));
    if (!ids.length) { $("#favGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">${icon("heart")}<h3>هنوز آگهی‌ای ذخیره نشده</h3><p>روی قلب هر کارت بزنید تا اینجا بماند.</p><a class="btn btn--ink" href="#/s?sort=score">دیدن فرصت‌ها</a></div>`; return; }
    const r = await DataLayer.search({ ids: ids.join(","), limit: 60 });
    $("#favGrid").innerHTML = r.items.map((l) => UI.card(l)).join("") || '<p class="muted">آگهی‌های ذخیره‌شده دیگر در دسترس نیستند.</p>';
  }

  /* ---------- بازار محله‌ها ---------- */
  async function marketPage(params) {
    const city = params.city || "rasht";
    const KG = { apartment: "آپارتمان", villa: "ویلا", land: "زمین و باغ", commercial: "تجاری و اداری" };
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      <div class="sec-head"><div><span class="kicker">بازار محله‌ها</span><h2>قیمت هر متر، محله به محله</h2><p>میانه و بازه معمول (چارک اول تا سوم) قیمت هر متر آگهی‌های پاک‌سازی‌شده${DataLayer.samples ? "؛ اکنون داده نمونه است" : ""}. محله‌هایی که کمتر از ۵ آگهی دارند کم‌اطمینان‌اند.</p></div>
      <label class="field" style="min-width:220px"><span>شهر</span><select class="select" id="mCity">${PROVINCES.map((p) => `<optgroup label="${p.name}">${CITIES.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}" ${c.id === city ? "selected" : ""}>${c.name}</option>`).join("")}</optgroup>`).join("")}</select></label></div>
      <div id="mBody"><div class="skeleton" style="height:240px"></div></div>
    </div></section>`;
    $("#mCity").addEventListener("change", (e) => go("#/market?city=" + e.target.value));
    const { rows } = await DataLayer.market(city);
    const groups = {};
    rows.filter((r) => r.deal === "sale" || r.deal === "rent").forEach((r) => (groups[r.kind + "|" + r.deal] = groups[r.kind + "|" + r.deal] || []).push(r));
    const keys = Object.keys(groups).sort((a, b) => groups[b].reduce((s, r) => s + r.n, 0) - groups[a].reduce((s, r) => s + r.n, 0));
    $("#mBody").innerHTML = keys.length ? keys.map((k) => {
      const [kind, deal] = k.split("|");
      const rs = groups[k].sort((a, b) => b.n - a.n);
      const max = Math.max(...rs.map((r) => r.p75));
      return `<div class="block"><h2>${KG[kind] || kind} · ${UI.dealName(deal)}</h2><div class="tbl-wrap"><table class="cmp-tbl mkt"><thead><tr><th>محله</th><th>آگهی</th><th>میانه ${deal === "rent" ? "ودیعه معادل" : "قیمت"} هر متر</th><th>بازه معمول</th><th></th></tr></thead><tbody>
        ${rs.map((r) => `<tr class="${r.n < 5 ? "low-n" : ""}"><th><b style="color:var(--ink)">${esc(r.district || "بدون محله")}</b></th><td>${fa(r.n)}</td><td><b>${money(r.median)}</b></td><td><span class="rangebar"><i style="right:${(r.p25 / max) * 100}%;width:${Math.max(2, ((r.p75 - r.p25) / max) * 100)}%"></i><em style="right:${(r.median / max) * 100}%"></em></span><small class="muted">${money(r.p25)} تا ${money(r.p75)}</small></td><td>${r.district ? `<a class="btn btn--ghost btn--sm" href="#/s?city=${city}&district=${encodeURIComponent(r.district)}&deal=${deal}&sort=score">فرصت‌ها</a>` : ""}</td></tr>`).join("")}
      </tbody></table></div></div>`;
    }).join("") : `<div class="empty"><h3>هنوز داده کافی برای این شهر نیست</h3><p>با ادامه دریافت آگهی‌ها، جدول محله‌ها ساخته می‌شود.</p></div>`;
  }

  /* ---------- روش ارزش‌گذاری ---------- */
  function methodPage() {
    view().innerHTML = `<article class="section--tight"><div class="wrap method">
      <span class="kicker">روش ارزش‌گذاری</span>
      <h1>فرصت‌یاب چطور قیمت منصفانه و امتیاز را حساب می‌کند</h1>
      <p class="lead">همه مراحل خودکار است و هر روز با آگهی‌های تازه از نو انجام می‌شود. هدف، مقایسه منصفانه هر آگهی با آگهی‌های واقعاً مشابه است.</p>
      <h2>۱. گردآوری</h2>
      <p>آگهی‌های ملک ۳۹ شهر گیلان، مازندران و گلستان از دیوار، به‌تدریج و با رعایت سقف درخواست، دریافت می‌شوند. صفحه کامل هر آگهی برای استخراج مشخصات خوانده می‌شود و هر تغییر قیمت در تاریخچه ثبت می‌شود.</p>
      <h2>۲. پاک‌سازی</h2>
      <p>این آگهی‌ها در محاسبه میانگین و رتبه‌بندی شرکت داده نمی‌شوند: قیمت نمادین یا توافقی؛ اشتباه در تعداد صفرهای قیمت (حدود ۱۰ یا ۱۰۰ برابر عرف محله)؛ درج قیمت هر متر به جای قیمت کل؛ پیش‌فروش، مشارکت در ساخت، معاوضه و فروش دانگی که بازار جداگانه‌ای دارند؛ آگهی تکراری یک ملک از چند آگهی‌دهنده؛ و قیمت‌های پرت آماری. پرت‌ها با فاصله لگاریتم قیمت هر متر از میانه محله، به مقیاس «انحراف مطلق میانه» (MAD) سنجیده می‌شوند و مرز آن ۳٫۵ است.</p>
      <h2>۳. خط پایه مکانی</h2>
      <p>برای هر نوع ملک و هر نوع معامله، میانه قیمت هر متر در هر محله محاسبه می‌شود. وقتی آگهی‌های یک محله کم است، این میانه به‌تدریج به سمت میانه شهر و سپس استان کشیده می‌شود تا از سه یا چهار آگهی نتیجه قطعی گرفته نشود.</p>
      <h2>۴. تعدیل چندمعیاره</h2>
      <p>وقتی آگهی کافی جمع شود (دست‌کم ۶۰ آگهی در شهر یا استان)، یک مدل رگرسیون ریج اثر هر ویژگی را بر قیمت هر متر، جدا از اثر محله، برآورد می‌کند. ویژگی‌ها برای آپارتمان: سن بنا، طبقه، همکف یا طبقه آخر بودن، متراژ، تعداد اتاق نسبت به متراژ، آسانسور، پارکینگ، انباری، بالکن، نوع سند، بازسازی، لابی و سرایدار، امکانات مجتمع، جهت شمالی، دید دریا، تعداد واحد در طبقه و نوع آگهی‌دهنده. برای ویلا متراژ زمین، فاصله و دید دریا، استخر، شهرکی بودن، دوبلکس و دید جنگل هم وارد می‌شوند و برای زمین کاربری، عرض بر و داخل بافت بودن. اثر هر ویژگی از داده همان منطقه به دست می‌آید، نه از عدد ثابت.</p>
      <h2>۵. امتیاز ۰ تا ۱۰۰</h2>
      <p>امتیاز ترکیب وزنی چهار جزء است: فاصله قیمت آگهی تا قیمت منصفانه (وزن اصلی)، اطمینان برآورد (تعداد آگهی مشابه محله و کامل بودن مشخصات)، کیفیت آگهی (عکس، توضیحات، مشخصات) و تحولات قیمت (کاهش قیمت و تازگی). تخفیف‌های بیش از ۴۰٪ با احتیاط امتیاز می‌گیرند، چون اغلب نشانه خطا یا شرایط خاص‌اند.</p>
      <h2>محدودیت‌ها</h2>
      <p>قیمت‌های دیوار قیمت پیشنهادی فروشنده‌اند، نه قیمت معامله‌شده؛ بنابراین «زیر قیمت منصفانه» یعنی ارزان‌تر از آگهی‌های مشابه، نه لزوماً زیر ارزش کارشناسی. در شهرهای کوچک و محله‌های کم‌آگهی اطمینان پایین‌تر است و این در کنار هر برآورد نمایش داده می‌شود. ویژگی‌ها از متن آگهی استخراج می‌شوند و ممکن است ناقص باشند.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px"><a class="btn btn--hot btn--lg" href="#/s?sort=score&ranked=1">دیدن فرصت‌های برتر</a><a class="btn btn--line btn--lg" href="#/market">بازار محله‌ها</a></div>
    </div></article>`;
  }

  /* ---------- علاقه‌مندی ---------- */
  function toggleFav(id) {
    state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
    store.set("favs", [...state.favs]);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle("is-on", state.favs.has(id)));
    updateFavCount();
    toast(state.favs.has(id) ? "ذخیره شد" : "از ذخیره‌شده‌ها حذف شد");
  }
  function updateFavCount() { const c = $("#favCount"); c.textContent = fa(state.favs.size); c.hidden = !state.favs.size; }
  function toggleCompare(id, input) {
    if (state.compare.includes(id)) state.compare = state.compare.filter((x) => x !== id);
    else if (state.compare.length >= 3) { toast("حداکثر سه آگهی"); if (input) input.checked = false; return; }
    else state.compare.push(id);
    $("#cmpbar").hidden = !state.compare.length;
    $("#cmpText").textContent = `${fa(state.compare.length)} آگهی برای مقایسه`;
  }
  async function compareDialog() {
    if (state.compare.length < 2) { toast("دست‌کم دو آگهی انتخاب کنید"); return; }
    const r = await DataLayer.search({ ids: state.compare.join(","), limit: 3 });
    const ls = state.compare.map((id) => r.items.find((x) => x.id === id)).filter(Boolean);
    const best = (fn, low = true) => { const v = ls.map(fn).filter((x) => x > 0); return v.length ? (low ? Math.min(...v) : Math.max(...v)) : null; };
    const row = (label, fn, b = null, fmt = (x) => x ?? "—") => `<tr><th>${label}</th>${ls.map((l) => { const x = fn(l); return `<td class="${b !== null && x === b ? "is-best" : ""}">${fmt(x, l)}</td>`; }).join("")}</tr>`;
    openDialog(`<div class="dlg__head"><h2>مقایسه</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <div class="tbl-wrap"><table class="cmp-tbl"><thead><tr><th></th>${ls.map((l) => `<th><div class="cmp-img">${UI.media(l)}</div><a href="#/ad/${encodeURIComponent(l.id)}" data-close>${UI.tt(l.title)}</a></th>`).join("")}</tr></thead><tbody>
      ${row("امتیاز", (l) => l.score, best((l) => l.score, false), (x) => (x != null ? fa(Math.round(x)) : "—"))}
      ${row("نسبت به قیمت منصفانه", (l) => l.verdict, null, (x) => (x ? UI.dealPill(x) : "—"))}
      ${row("شهر و محله", (l) => [l.city_name || UI.cityOf(l.city_key)?.name, l.district].filter(Boolean).join("، "))}
      ${row("قیمت / ودیعه معادل", (l) => l.pp, best((l) => l.pp), (x) => (x ? money(x) + " تومان" : "توافقی"))}
      ${row("متراژ", (l) => l.area, best((l) => l.area, false), (x) => (x ? fa(x) + " متر" : "—"))}
      ${row("قیمت هر متر", (l) => l.ppm, best((l) => l.ppm), (x) => (x ? money(x) : "—"))}
      ${row("خواب", (l) => l.rooms, null, (x) => (x != null ? fa(x) : "—"))}
      ${row("سال ساخت", (l) => l.year, best((l) => l.year, false), (x) => (x ? faY(x) : "—"))}
      ${AMENITIES.map((a) => row(a.name, (l) => (l.amenities || []).includes(a.id), null, (x) => (x ? "✓" : "—"))).join("")}
      </tbody></table></div><p class="small muted" style="margin-top:12px">خانه‌های سبز بهترین مقدار هر ردیف‌اند.</p>`, true);
  }
  function openDialog(html, wide = false) {
    const d = $("#dlg");
    $("#dlgBody").innerHTML = html;
    d.className = "dlg" + (wide ? " dlg--wide" : "");
    if (!d.open) d.showModal();
  }

  /* ---------- دستیار ---------- */
  const ai = (() => {
    const log = () => $("#aiLog");
    const say = (html, who = "bot") => { const d = document.createElement("div"); d.className = "msg msg--" + who; d.innerHTML = html; log().appendChild(d); log().scrollTop = 1e9; return d; };
    const sugs = (l) => { $("#aiSugs").innerHTML = l.map((s) => `<button class="chip">${esc(s)}</button>`).join(""); };
    function open() {
      $("#ai").hidden = false; $("#aiFab").classList.add("is-hidden");
      if (!log().children.length) {
        say("سلام! بنویس دنبال چه ملکی هستی؛ مثلاً «آپارتمان ۲ خوابه گلسار رشت زیر ۸ میلیارد» یا «ویلای ساحلی نوشهر». فرصت‌ها را به ترتیب امتیاز برایت پیدا می‌کنم و قیمت هر متر محله‌ها را هم می‌گویم.");
        sugs(["ویلای ساحلی محمودآباد", "آپارتمان رهن ساری", "قیمت هر متر آپارتمان در رشت", "امتیاز چطور حساب می‌شود؟"]);
      }
      setTimeout(() => $("#aiInput").focus(), 50);
    }
    const mini = (ls) => `<div class="mini">${ls.map((l) => `<a href="#/ad/${encodeURIComponent(l.id)}"><span class="mini__img">${UI.media(l)}</span><span><b>${UI.tt(l.title)}</b><small>${l.score != null ? fa(Math.round(l.score)) + " امتیاز · " : ""}${esc(UI.pinLabel(l))}${l.verdict && l.verdict.delta < 0 ? " · " + pct(l.verdict.delta) + " زیر قیمت" : ""}</small></span></a>`).join("")}</div>`;
    async function respond(v) {
      const it = NLP.intent(v);
      if (it === "greet") { say("درود! کدام شهر و چه نوع ملکی؟ بودجه را هم بگو."); return; }
      if (it === "method") { say(`امتیاز از فاصله قیمت آگهی تا قیمت منصفانه محله (با درنظرگرفتن سن بنا، طبقه، متراژ، آسانسور، پارکینگ، سند و ویژگی‌های دیگر)، اطمینان برآورد، کیفیت آگهی و تحولات قیمت ساخته می‌شود. <a href="#/method">توضیح کامل روش</a>`); return; }
      if (it === "plans") { const p = cfg.plans || []; say(p.length ? `اشتراک‌ها: ${p.map((x) => `${esc(x.name)} ${fa(x.price)} تومان`).join("، ")}. با اشتراک، پیوند مستقیم دیوار و جزئیات کامل ارزش‌گذاری باز می‌شود. <a href="#/account">خرید اشتراک</a>` : "تعرفه اشتراک به‌زودی اعلام می‌شود."); return; }
      if (it === "loan") {
        const m = NLP.parseQuery(v).filters.max || 1e9, yr = +(NLP.normalize(v).match(/(\d+)\s*سال/) || [])[1] || 5;
        const r = 0.23 / 12, n = yr * 12, pay = (m * r) / (1 - Math.pow(1 + r, -n));
        say(`قسط وام ${money(m)} تومان با سود ۲۳٪ در ${fa(yr)} سال: حدود <b>${fa(Math.round(pay))} تومان</b> در ماه. نرخ را در بخش ابزارها تغییر بده.`);
        return;
      }
      const { filters, tags } = NLP.parseQuery(v);
      if (it === "value") {
        if (!filters.city) { say("برای کدام شهر؟ مثلاً «قیمت هر متر آپارتمان در بابلسر»."); return; }
        const kind = (filters.kinds || "apartment").split(",")[0];
        const r = await DataLayer.search({ deal: "sale", city: filters.city, kinds: kind, limit: 60, ranked: 1 });
        const p = r.items.map((l) => l.fair_ppm).filter(Boolean);
        say(p.length >= 3 ? `میانه قیمت منصفانه هر متر ${UI.kindName(kind)} در ${UI.cityOf(filters.city).name}، از ${fa(p.length)} آگهی: <b>${money(median(p))} تومان</b>${DataLayer.samples ? " (داده نمونه است)" : ""}. <a href="#/market?city=${filters.city}">جدول محله‌ها</a>` : `آگهی فروش کافی برای ${UI.kindName(kind)} در ${UI.cityOf(filters.city).name} نداریم (${fa(p.length)} مورد).`);
        return;
      }
      if (!tags.length) { say("متوجه نشدم. نام شهر، نوع ملک و بودجه را بنویس."); return; }
      const f = { ...filters, sort: filters.sort || "score" }, dropped = [];
      let r = await DataLayer.search({ ...f, limit: 3 });
      for (const [k, name] of [["amenities", "امکانات"], ["rooms", "تعداد خواب"], ["areaMin", "متراژ"], ["areaMax", "متراژ"], ["max", "سقف بودجه"], ["city", "شهر"]]) {
        if (r.total || !f[k]) continue;
        delete f[k]; dropped.push(name);
        r = await DataLayer.search({ ...f, limit: 3 });
      }
      go("#/s?" + toQuery(f));
      say(`${tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join(" ")}<br>${dropped.length ? `مورد کاملاً منطبق نبود؛ «${[...new Set(dropped)].join("، ")}» را کنار گذاشتم و ` : ""}${r.total ? `<b>${fa(r.total)}</b> آگهی پیدا کردم. بهترین‌ها از نظر امتیاز:` : "چیزی پیدا نشد."}`);
      if (r.items.length) say(mini(r.items));
      sugs(["فقط کاهش قیمت‌خورده‌ها", "بیشترین تخفیف", "امتیاز چطور حساب می‌شود؟"]);
    }
    function bind() {
      $("#aiFab").addEventListener("click", open);
      $("#aiClose").addEventListener("click", () => { $("#ai").hidden = true; $("#aiFab").classList.remove("is-hidden"); });
      $("#aiSugs").addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        const t = b.textContent;
        if (t === "فقط کاهش قیمت‌خورده‌ها" || t === "بیشترین تخفیف") {
          const { params } = parseHash();
          go("#/s?" + toQuery({ ...params, ...(t === "بیشترین تخفیف" ? { sort: "deal", ranked: 1 } : { drop: 1 }) }));
          say(esc(t), "me"); say("فهرست را به‌روز کردم.");
          return;
        }
        $("#aiInput").value = t; $("#aiForm").requestSubmit();
      });
      $("#aiForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const v = $("#aiInput").value.trim(); if (!v) return;
        say(esc(v), "me"); $("#aiInput").value = "";
        const t = say('<span class="dots"><i></i><i></i><i></i></span>');
        setTimeout(async () => { t.remove(); await respond(v); }, 450);
      });
    }
    return { bind };
  })();

  /* ---------- رویدادهای سراسری ---------- */
  function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  function bindGlobal() {
    $("#themeBtn").addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const t = cur === "dark" ? "light" : "dark"; applyTheme(t); store.set("theme", t);
    });
    $("#dlg").addEventListener("click", (e) => { if (e.target.id === "dlg" || e.target.closest("[data-close]")) $("#dlg").close(); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".dd")) $$(".dd.is-open").forEach((d) => d.classList.remove("is-open")); });
    view().addEventListener("click", (e) => { const f = e.target.closest("[data-fav]"); if (f) { e.preventDefault(); e.stopPropagation(); toggleFav(f.dataset.fav); } });
    view().addEventListener("change", (e) => { if (e.target.dataset.cmp) toggleCompare(e.target.dataset.cmp, e.target); });
    const hot = (e, on) => { const c = e.target.closest(".card"); const m = c && state.markers[c.dataset.id]; if (m) { const el = m.getElement(); if (el) el.classList.toggle("is-hot", on); m.setZIndexOffset(on ? 1000 : 0); } };
    view().addEventListener("mouseover", (e) => hot(e, true));
    view().addEventListener("mouseout", (e) => hot(e, false));
    $("#cmpGo").addEventListener("click", compareDialog);
    $("#cmpClear").addEventListener("click", () => { state.compare = []; $("#cmpbar").hidden = true; $$("[data-cmp]").forEach((i) => (i.checked = false)); });
    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-scroll]"); if (!a) return;
      e.preventDefault();
      const to = () => document.getElementById(a.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
      if (parseHash().path) { go("#/"); setTimeout(to, 500); } else to();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); ($("#heroQ") || $("#sqInput"))?.focus(); } });
    ai.bind();
  }

  document.addEventListener("DOMContentLoaded", boot);
  return { get favs() { return state.favs; }, get compare() { return state.compare; } };
})();
