/* فرصت ملک — مسیریابی و صفحات */
const App = (() => {
  "use strict";
  const { $, $$, esc, fa, faY, num, store, money, toast, icon, pct } = UI;
  // عکس‌های ثابت سایت با WebP (سبک‌تر و سریع‌تر)؛ مرورگرهای خیلی قدیمی همان JPG را می‌گیرند
  const IMGX = (() => { try { return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp") ? "webp" : "jpg"; } catch { return "jpg"; } })();
  const state = { favs: new Set(store.get("favs", [])), compare: [], map: null, layer: null, markers: {} };
  const view = () => $("#view");
  let cfg = null;
  const CONF = { high: "اطمینان زیاد", medium: "اطمینان متوسط", low: "اطمینان کم" };

  /* ---------- راه‌اندازی ---------- */
  async function boot() {
    depthFX();
    navSpotlight();
    applyTheme(window.FMTheme ? FMTheme.current() : store.get("theme_v2", "dark"));   // خودکار روز/شب ایران
    const info = await DataLayer.init();
    cfg = info.config;
    // استان‌هایی که به‌تدریج اضافه می‌شوند (تهران، خراسان رضوی و ...) از سرور می‌آیند
    const R = (cfg && cfg.regions) || {};
    (R.provinces || []).forEach((p) => { if (!PROVINCES.some((x) => x.id === p.id)) PROVINCES.push(p); });
    (R.cities || []).forEach((c) => { if (!CITIES.some((x) => x.id === c.id)) CITIES.push(c); });
    applySite();
    if (info.useSamples) {
      const bar = $("#demoBar");
      bar.hidden = false;
      bar.innerHTML = info.server
        ? "<b>هنوز آگهی واقعی دریافت نشده است.</b> فعلاً آگهی‌های نمونه نمایش داده می‌شود؛ دریافت آگهی‌ها را در <a href='admin.html' style='text-decoration:underline'>پنل مدیریت</a> روشن کنید."
        : "<b>پیش‌نمایش طراحی:</b> آگهی‌ها، قیمت‌ها و امتیازها نمونه و ساختگی‌اند. نسخه کامل با آگهی‌های واقعی روی سرور اجرا می‌شود.";
    }
    updateFavCount();
    updateAccount();
    liveNumbers();
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
    if (cfg.version && $("#siteVer")) $("#siteVer").textContent = "v " + cfg.version.split("|")[0];
    const o = cfg.owner || {}, rows = [];
    if (o.support_url) rows.push(`<li>پشتیبانی: <a href="${esc(o.support_url)}" rel="noopener">${esc(o.support_label || o.support_url.replace(/^(https:\/\/|tel:|mailto:)/, ""))}</a></li>`);
    if (o.legal_name) rows.push(`<li>${esc(o.legal_name)}</li>`);
    if (o.enamad_url && o.legal_name) rows.push(`<li><a href="${esc(o.enamad_url)}" target="_blank" rel="noopener">نماد اعتماد الکترونیکی</a></li>`);
    if (rows.length) { $("#footOwnerList").innerHTML = rows.join(""); $("#footOwner").hidden = false; }
  }
  function updateAccount() {
    const me = DataLayer.me;
    $("#accountLabel").textContent = me ? (me.active ? `اشتراک فعال، ${fa(me.days_left)} روز` : "حساب من") : "ورود و اشتراک";
  }
  const active = () => !!(DataLayer.me && DataLayer.me.active);

  /* منوی «حساب من»: با ورود، دکمهٔ حساب یک منوی کوچک باز می‌کند؛ بدون اشتراک فعال، «فعال‌سازی اشتراک» بالای منوست */
  function closeAcctMenu() { const m = $("#acctMenu"); if (!m) return; m.remove(); $("#accountBtn")?.setAttribute("aria-expanded", "false"); }
  function acctMenu() {
    const me = DataLayer.me, btn = $("#accountBtn");
    if ($("#acctMenu")) { closeAcctMenu(); return; }
    const m = document.createElement("div");
    m.id = "acctMenu"; m.className = "amenu"; m.setAttribute("role", "menu");
    m.innerHTML = `<div class="amenu__head"><b dir="ltr">${esc(me.phone || "")}</b><span class="${me.active ? "ok-text" : ""}">${me.active ? `${me.trial ? "دورهٔ رایگان" : "اشتراک فعال"}، ${fa(me.days_left)} روز باقی‌مانده` : "بدون اشتراک فعال"}</span></div>
      ${me.active ? "" : `<button type="button" class="amenu__sub" role="menuitem" data-a="sub">${icon("spark")}<span><b>فعال‌سازی اشتراک</b><small>هفتگی یا ماهانه، با بله‌پی یا بزن به کارت</small></span></button>`}
      <a role="menuitem" href="#/account">${icon("user")} حساب من</a>
      <a role="menuitem" href="#/support">${icon("chat")} پشتیبانی و تیکت‌ها</a>
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
      else if (t.dataset.a === "out") { await DataLayer.logout(); updateAccount(); route(); }
    });
    setTimeout(() => {
      const off = (e) => { if (!e.target.closest("#acctMenu, #accountBtn")) { closeAcctMenu(); document.removeEventListener("pointerdown", off); } };
      document.addEventListener("pointerdown", off);
    });
  }
  /* خرید اشتراک در یک پنجره: انتخاب طرح (هفتگی/ماهانه) و سپس پرداخت با بله‌پی یا بزن به کارت */
  function subscribeDialog(planId) {
    if (!DataLayer.me) { loginDialog(() => subscribeDialog(planId)); return; }
    const plans = cfg.plans || [];
    if (!plans.length) { toast("تعرفهٔ اشتراک هنوز تعیین نشده است"); return; }
    const all = cfg.pay_methods || [];
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
      $("#dlg").close(); buy(sel, cfg.test_payments ? undefined : m.id);
    }));
  }

  /* ---------- مسیریابی ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, query] = h.split("?");
    return { path: path || "", params: Object.fromEntries(new URLSearchParams(query || "")) };
  }
  let lastPath = null;
  function route() {
    document.querySelectorAll(".lightbox").forEach((m) => m.remove());
    const { path, params } = parseHash();
    const [page, arg] = path.split("/");
    document.body.dataset.page = page || "home";
    $$("[data-nav]").forEach((a) => a.classList.remove("is-on"));
    document.body.classList.remove("has-mcta");
    if (page === "s") {
      const key = params.opp || params.ranked ? "top" : String(params.presale) === "1" ? "estate-presale" : "estate-" + (params.deal || "sale");
      $(`[data-nav="${key}"]`)?.classList.add("is-on");
      if (lastPath === "s") { searchPage.update(params); return; }
      searchPage.render(params);
    } else if (page === "ad" && arg) adPage(decodeURIComponent(arg));
    else if (page === "saved") savedPage();
    else if (page === "tools") toolsPage();
    else if (page === "market") { $('[data-nav="market"]').classList.add("is-on"); marketPage(params); }
    else if (page === "method") { $('[data-nav="method"]').classList.add("is-on"); methodPage(); }
    else if (page === "account") accountPage(params);
    else if (page === "invoice") invoicePage(arg);
    else if (page === "reset") resetPage(params);
    else if (page === "faq") faqPage();
    else if (page === "support") supportPage(params);
    else if (page === "p") contentPage("/" + path.split("/").slice(1).join("/"));
    else if (page === "sky") skyPage();
    // صفحهٔ اصلیِ سایت قبلی دیگر نمایش داده نمی‌شود: مستقیم به صفحهٔ اصلی سایت جدید (بدون بار شدن دوبارهٔ نسخهٔ قدیمی)
    else if (!document.documentElement.classList.contains("embed") && (location.pathname === "/app.html" || location.hash === "#/" || !location.hash)) { location.replace("/"); return; }
    else homePage();
    // متن «دربارهٔ بازار» که سرور برای همین نشانی ساخته، فقط روی همان صفحه دیده می‌شود
    const st = $("#seoText");
    if (st) st.hidden = (st.dataset.hash || "#/").replace(/^#?\/?$/, "#/") !== (location.hash || "#/").replace(/^#?\/?$/, "#/");
    // متن کامل برای موتورهای جست‌وجو می‌ماند، ولی برای کاربر جمع است تا صفحه شلوغ نشود
    if (st && !st.dataset.fold) {
      st.dataset.fold = "1";
      st.classList.add("seo-text--fold");
      const btn = document.createElement("button");
      btn.className = "btn btn--line btn--sm seo-text__more";
      btn.type = "button";
      btn.textContent = "ادامهٔ توضیحات";
      btn.addEventListener("click", () => { const open = st.classList.toggle("is-open"); btn.textContent = open ? "بستن توضیحات" : "ادامهٔ توضیحات"; });
      st.appendChild(btn);
    }
    if (page !== lastPath || page === "ad") scrollTo({ top: 0 });
    lastPath = page;
    setTimeout(applyScrollReveals, 100);
    setTimeout(scrambleScan, 400);
    $$(".dock a").forEach((a) => a.classList.toggle("is-on", a.dataset.dock === (page || "home") || (a.dataset.dock === "s" && page === "s")));
  }
  const go = (hash) => { location.hash = hash; };
  const toQuery = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "" && v != null && v !== 0 && v !== false)).toString();
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

  /* ---------- کرهٔ زمین و نقشهٔ محله‌ها به‌تنهایی (برای صفحهٔ «قیمت از دید آسمان») ---------- */
  function skyPage() {
    clearInterval(boardTimer);
    const st = DataLayer.stats;
    view().innerHTML = `<section class="skypage">
      <aside class="sky sky--wide" id="sky" aria-label="کرهٔ زمین و نقشهٔ قیمت محله‌ها">
        <div class="sky__head"><span class="sky__live"><i></i>زنده</span><b id="skyTitle">بازار ملک ایران، از نگاه ماهواره</b><small id="skySub">روی نقطهٔ نورانی هر شهر بزنید تا به آن پرواز کنیم؛ ارتفاع هر ستون میانهٔ قیمت هر متر محله است و ستون سبز یعنی فرصت شناسایی‌شده دارد.</small></div>
        <div class="sky__stage" id="skyStage"><svg id="skySvg" viewBox="-300 -230 600 420" role="img" aria-label="برج‌های قیمت محله‌ها"></svg></div>
        <div class="sky__tip" id="skyTip" hidden></div>
        <div class="sky__kpis">
          <div><b data-live="total">${fa(st.total || 0)}</b><span>آگهی بررسی‌شده</span></div>
          <div class="is-hot"><b data-live="deals">${fa(st.deals || 0)}</b><span>فرصت شناسایی‌شده</span></div>
          <div><b data-live="excluded">${fa(st.excluded || 0)}</b><span>مشکوک یا کنار رفت</span></div>
        </div>
      </aside></section>`;
    initLive(st, skyOpts);
  }
  /* صفحهٔ «از دید آسمان» سایت اصلی این کادر را جاسازی می‌کند و فیلتر استان/شهر/محله‌اش را با پیام می‌فرستد:
     کره به همان شهرها پرواز می‌کند و نقشه روی همان محله می‌رود */
  const skyOpts = {};
  function skyApply(m) {
    const cs = (m.cities && m.cities.length ? m.cities : m.city ? [m.city] : []);
    const sel = cs.length ? { cities: cs } : m.province ? { provs: [m.province] } : {};
    skyOpts.sel = sel;
    skyOpts.query = m.district ? { district: m.district, dcity: m.city } : {};
    if (!live || !live.globe) { if (!webglOK() && $("#skySvg")) drawSky(DataLayer.stats, sel); return; }
    live.dsel = new Set(m.district ? [m.district] : []); live.dselFor = cs.join(",");
    if (!liveIds(live.st, sel).length) return liveHome(live);
    liveSelect(live.st, sel);
  }
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.fmSky) return;
    skyApply(e.data);
  });

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
          <span class="kicker">تحلیل هوشمند ارزش ملک</span>
          <h1>هر ملک یک قیمت دارد؛<br>ما <span class="accent">ارزش واقعی</span> آن را پیدا می‌کنیم.</h1>
          <p class="hero__lead"><b>آیا این ملک واقعاً ارزش خرید دارد؟</b> پیش از یک تصمیم چندمیلیاردی، قیمت هر آگهی را با محلهٔ خودش، سن بنا، متراژ، طبقه و امکانات می‌سنجیم و نشان می‌دهیم کجا فرصت است و کجا گران.</p>
          <div class="hero__cta"><a class="btn btn--gold btn--lg" href="#/tools">ارزیابی یک ملک</a><a class="btn btn--line btn--lg" href="#/s?sort=score&opp=1">مشاهدهٔ فرصت‌های بازار ${icon("arrow")}</a></div>
          <form class="search-card" id="heroForm" autocomplete="off">
            <div class="search-card__tabs">
              <div class="search-card__deals" id="heroDeals" style="margin-inline-start:0">
                <button type="button" class="is-on" data-d="">همه</button><button type="button" data-d="sale">خرید</button><button type="button" data-d="presale">پیش‌فروش</button><button type="button" data-d="rent">رهن و اجاره</button><button type="button" data-d="daily">روزانه</button>
              </div>
            </div>
            <div class="loc-row" aria-label="انتخاب محدوده">
              <label class="loc-row__f"><span>استان (چند انتخابی)</span><div id="hProv"></div></label>
              <label class="loc-row__f"><span>شهر (چند انتخابی)</span><div id="hCity"></div></label>
              <label class="loc-row__f"><span>محله</span><div id="hDist"></div></label>
            </div>
            <div class="atags" id="hTags" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>
            <label class="loc-opp"><input type="checkbox" id="hOpp" checked> فقط فرصت‌ها</label>
            <div class="search-row">
              <span class="search-row__ai">${icon("spark")}</span>
              <input id="heroQ" placeholder="جزئیات دلخواه (اختیاری)؛ مثلاً: ۲ خوابه زیر ۸ میلیارد" aria-label="جست‌وجو" />
              <button class="btn btn--hot btn--lg">یافتن فرصت‌ها</button>
            </div>
            <div class="parsed" id="heroParsed" aria-live="polite"></div>
          </form>
          <div class="hero__quick" id="heroQuick">${["فرصت‌های آپارتمان رشت", "ویلای ساحلی نوشهر", "آپارتمان رهن ساری", "زمین سنددار لاهیجان", "ویلا کلاردشت"].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        </div>
        <aside class="sky" id="sky" aria-label="نقشهٔ سه‌بعدی قیمت محله‌ها">
          <div class="sky__head"><span class="sky__live"><i></i>${DataLayer.samples ? "داده نمونه" : "زنده"}</span><b id="skyTitle">قیمت محله‌ها، سه‌بعدی</b><small id="skySub">شهرهای دارای آگهی نقطه‌های نورانی‌اند. شهری را در جست‌وجو انتخاب کنید یا روی نقطه‌اش بزنید تا به آن پرواز کنیم؛ ارتفاع هر ستون میانهٔ قیمت هر متر محله است و ستون سبز یعنی فرصت شناسایی‌شده دارد.</small></div>
          <div class="sky__stage" id="skyStage"><svg id="skySvg" viewBox="-300 -230 600 420" role="img" aria-label="برج‌های قیمت محله‌ها"></svg></div>
          <div class="sky__tip" id="skyTip" hidden></div>
          <div class="sky__kpis">
            <div><b data-live="total">${fa(st.total || 0)}</b><span>آگهی بررسی‌شده</span></div>
            <div class="is-hot"><b data-live="deals">${fa(st.deals || 0)}</b><span>فرصت شناسایی‌شده</span></div>
            <div><b data-live="excluded">${fa(st.excluded || 0)}</b><span>مشکوک یا کنار رفت</span></div>
          </div>
          <p class="sky__hint">بکشید تا بچرخد. با انتخاب یک یا چند شهر یا استان در جست‌وجو، کادر همان‌جا را نشان می‌دهد.</p>
        </aside>
      </div>
    </section>
    <section class="wrap">
      <div class="strip">
        <div><b data-live="ranked">${fa(st.ranked || 0)}</b><span>آگهی دارای امتیاز</span></div>
        <div><b data-live="today">${fa(st.today || 0)}</b><span>آگهی تازه در ۲۴ ساعت</span></div>
        <div><b data-live="drops">${fa(st.drops || 0)}</b><span>کاهش قیمت ثبت‌شده</span></div>
        <div><b data-live="cities">${fa(Object.keys(st.cities || {}).length)}</b><span>شهر دارای آگهی از <i data-live="citiesAll">${fa(CITIES.length)}</i></span></div>
      </div>
    </section>
    <section class="scene" id="pinScene" aria-label="فرصت ملک در یک نگاه">
      <div class="scene__stage">
        <div class="scene__pic scene__pic--house" aria-hidden="true"><img class="dim" src="/assets/img/scene/house-dim.${IMGX}" alt="" decoding="async"><img class="ph" src="/assets/img/scene/house-1280.${IMGX}" srcset="/assets/img/scene/house-1280.${IMGX} 1280w, /assets/img/scene/house.${IMGX} 2400w" sizes="100vw" alt="" decoding="async"><i class="scene__sweep"></i></div>
        <div class="scene__pic scene__pic--living" aria-hidden="true"><img class="dim" src="/assets/img/scene/living-dim.${IMGX}" alt="" loading="lazy" decoding="async"><img class="ph" src="/assets/img/scene/living-1280.${IMGX}" srcset="/assets/img/scene/living-1280.${IMGX} 1280w, /assets/img/scene/living.${IMGX} 2400w" sizes="100vw" alt="" loading="lazy" decoding="async"><i class="scene__sweep"></i></div>
        <div class="scene__shade" aria-hidden="true"></div>
        <div class="scene__mark" aria-hidden="true"><div class="scene__rot">${Array.from({ length: 12 }, (_, i) => `<svg viewBox="0 0 48 48" style="--z:${i}"><path class="r" d="M10 25l13-13 13 13"/><path class="w" d="M6 33c5-3.8 10-3.8 15 0s10 3.8 15 0"/><circle cx="39" cy="10" r="4.2"/></svg>`).join("")}</div></div>
        <p class="scene__hint" aria-hidden="true">اسکرول کنید تا چراغ‌ها روشن شوند؛ نشانگر را روی تصویر بکشید</p>
        <div class="scene__step" data-step="0"><b data-live="total">${fa(st.total || 0)}</b><span>آگهی که قیمتش را با محلهٔ خودش سنجیده‌ایم</span></div>
        <div class="scene__step scene__step--end" data-step="1"><b data-live="deals">${fa(st.deals || 0)}</b><span>فرصت شناسایی‌شده با فاصلهٔ معنادار از برآورد بازار</span></div>
        <div class="scene__step" data-step="2"><b data-live="cities">${fa(Object.keys(st.cities || {}).length)}</b><span>شهر زیر پوشش، محله به محله</span></div>
        <div class="scene__step scene__step--why" data-step="3"><h2>چرا فرصت ملک؟</h2><p>قیمت آگهی، پیشنهاد فروشنده است، نه ارزش بازار. ما هر آگهی را با محلهٔ خودش، سن بنا، متراژ و امکانات می‌سنجیم، اثر تبانی و قیمت‌سازی را کنار می‌گذاریم و دلیل هر عدد را نشان می‌دهیم.</p></div>
        <div class="scene__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>
    </section>
    <section class="section unified-market-sec">
      <div class="wrap unified-grid">
        <!-- ستون راست: مشکل بازار مسکن -->
        <div class="market-col-problem">
          <span class="kicker">چالش بازار مسکن</span>
          <h2>قیمت اعلام‌شده،<br>همیشه ارزش واقعی نیست.</h2>
          <p class="unified-desc">خرید ملک تصمیمی چندمیلیاردی است، اما ابزار تصمیم‌گیری علمی کمتر در دسترس خریدار است.</p>

          <div class="problem-cards-list">
            <div class="prob-card">
              <span class="prob-num">۱</span>
              <div><b>قیمت مالک</b><p>ممکن است احساسی باشد یا از آگهی‌های گران‌تر الگو گرفته باشد.</p></div>
            </div>
            <div class="prob-card">
              <span class="prob-num">۲</span>
              <div><b>قیمت مشاور</b><p>ممکن است زیر اثر شرایط معامله و درصد کمیسیون باشد.</p></div>
            </div>
            <div class="prob-card">
              <span class="prob-num">۳</span>
              <div><b>قیمت آگهی‌ها</b><p>قیمت پیشنهادی است نه ارزش بازار؛ گاهی چند دلال هماهنگ آن را بالا می‌برند.</p></div>
            </div>
            <div class="prob-card">
              <span class="prob-num">۴</span>
              <div><b>مقایسهٔ دستی</b><p>بدون در نظر گرفتن سن بنا، طبقه، متراژ و امکانات، مقایسه گمراه‌کننده است.</p></div>
            </div>
          </div>
        </div>

        <!-- ستون چپ: راه‌حل و ۵ حکم فرصت ملک با دیزاین ۳ بعدی سه‌لایه -->
        <div class="market-col-solution">
          <div class="sol-header">
            <span class="kicker">پاسخ هوشمند فرصت ملک</span>
            <h2>هر آگهی، یک حکم روشن</h2>
            <p>امتیاز ۰ تا ۱۰۰ بر پایه مدل آماری محله، سن بنا، طبقه و الگوریتم‌های ضدتبانی</p>
          </div>

          <div class="tiers-stack">
            <!-- ۱. فرصت طلایی -->
            <div class="tier-card tier-card--gold">
              <div class="tier-badge">فرصت طلایی</div>
              <div class="tier-info"><b>نمره ۸۵ تا ۱۰۰</b><span>دست‌کم ۲۲٪ زیر قیمت کارشناسی محله، با اطمینان کافی و فول‌امکانات</span></div>
            </div>

            <!-- ۲. فرصت مناسب -->
            <div class="tier-card tier-card--good">
              <div class="tier-badge">فرصت مناسب</div>
              <div class="tier-info"><b>نمره ۶۵ تا ۸۴</b><span>دست‌کم ۱۵٪ فاصله با برآورد بازار (یا قیمت عالی با کسر برخی امکانات)</span></div>
            </div>

            <!-- ۳. قیمت متعادل -->
            <div class="tier-card tier-card--fair">
              <div class="tier-badge">قیمت متعادل</div>
              <div class="tier-info"><b>نمره ۵۰ تا ۶۴</b><span>هم‌سطح ارزش کارشناسی و عرف منصفانه محله</span></div>
            </div>

            <!-- ۴. بالاتر از ارزش واقعی -->
            <div class="tier-card tier-card--high">
              <div class="tier-badge">بالاتر از ارزش واقعی</div>
              <div class="tier-info"><b>نمره ۳۵ تا ۴۹</b><span>دست‌کم ۱۵٪ گران‌تر از ارزش واقعی محله</span></div>
            </div>

            <!-- ۵. قیمت غیرمنطقی -->
            <div class="tier-card tier-card--over">
              <div class="tier-badge">قیمت غیرمنطقی</div>
              <div class="tier-info"><b>نمره زیر ۳۵</b><span>دست‌کم ۳۰٪ حباب قیمتی یا ارزانی غیرعادی و مشکوک</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="wrap">
        <div class="sec-head">
          <div><span class="kicker">فرصت‌های طلایی بازار</span><h2>املاکی که بالاترین امتیاز فرصت را گرفته‌اند</h2><p>امتیاز ۰ تا ۱۰۰ رتبهٔ آگهی در محلهٔ خودش است: بهترین فرصت هر محله ۱۰۰، آگهی هم‌قیمت محله ۵۰ و آگهی‌ای که فرصت نیست حداکثر ۶۴.</p></div>
          <div class="seg" id="feedS"><button class="is-on" data-s="score">بهترین فرصت</button><button data-s="deal">بیشترین فاصله</button><button data-s="new">تازه‌ترین</button><button data-s="drop">کاهش قیمت</button></div>
        </div>
        <div class="cards" id="feed"></div>
        <div style="text-align:center;margin-top:28px"><a class="btn btn--line" id="feedMore" href="#/s?sort=score&opp=1">همه فرصت‌ها ${icon("arrow")}</a></div>
      </div>
    </section>
    <section class="section section--sunk" id="glance"></section>
    <section class="section" id="showcase" hidden>
      <div class="wrap"><div class="sec-head"><div><span class="kicker">ویترین</span><h2>فرصت‌های عکس‌دار، بی‌پرچم احتیاط</h2><p>فرصت‌هایی که عکس دارند و در متنشان نشانهٔ سند ناقص، مستأجر یا عکس غیرواقعی نیست.</p></div></div>
      <div class="cards" id="showGrid"></div></div>
    </section>
    ${methodTeaser()}
    <section class="section section--sunk">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">راهنمای محلی</span><h2>شهر به شهر، استان به استان</h2><p>تعداد آگهی و میانه قیمت هر متر در هر شهر، از آگهی‌های پاک‌سازی‌شده همین سامانه. استان‌های تازه به‌تدریج اضافه می‌شوند.</p></div><a class="btn btn--line" href="#/market">بازار محله‌ها</a></div>
        <div class="rail" id="provRail">
          <button type="button" class="rail__btn rail__btn--prev" data-rail="-1" aria-label="استان‌های قبلی">${icon("arrow")}</button>
          <div class="prov prov--rail" id="provList">${provinceColumns(st)}</div>
          <button type="button" class="rail__btn rail__btn--next" data-rail="1" aria-label="استان‌های بعدی">${icon("arrow")}</button>
        </div>
        <div class="rail__foot"><button type="button" class="btn btn--line btn--sm" id="provAll" aria-expanded="false">نمایش همهٔ استان‌ها</button></div>
      </div>
    </section>
    <section class="section trust">
      <div class="wrap trust__grid">
        <div><span class="kicker">چرا به عددها اعتماد کنیم؟</span><h2>شفاف، مستقل، قابل وارسی</h2></div>
        <div class="trust__items">
          <div><b>بدون کمیسیون و بدون فروش</b><span>رتبهٔ آگهی‌ها خریدنی نیست و هیچ انسانی امتیاز را دستی تغییر نمی‌دهد.</span></div>
          <div><b>هر عدد، دلیلش را دارد</b><span>برای هر آگهی شناسنامهٔ قیمت، اثر هر ویژگی و تعداد آگهی‌های مقایسه نشان داده می‌شود.</span></div>
          <div><b>ضد تبانی و ضد قیمت‌سازی</b><span>آگهی‌های یک فروشنده یک رأی دارند، قیمت محله با محله‌های مجاور سنجیده می‌شود و افزایش قیمت پس از درج اثری ندارد.</span></div>
          <div><b>دقت سنجیده‌شده</b><span>خطای برآورد هر آگهی بدون خود آن اندازه‌گیری و در روش ارزش‌گذاری گزارش می‌شود.</span></div>
        </div>
      </div>
    </section>
    <section class="section consult">
      <div class="wrap consult__box">
        <div class="beams" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div><span class="kicker">درخواست مشاوره</span><h2>برای یک تصمیم مشخص کمک می‌خواهید؟</h2><p>هدف‌تان را بگویید: سکونت، سرمایه‌گذاری یا اجاره‌داری. آگهی یا محلهٔ موردنظر را بفرستید تا تحلیلش را با شما مرور کنیم.</p></div>
        <div class="consult__act"><a class="btn btn--gold btn--lg" href="#/support">ثبت درخواست مشاوره</a><a class="btn btn--line btn--lg" href="#/tools">ارزیابی سریع یک ملک</a></div>
      </div>
    </section>
    ${plansSection()}
    <section class="section section--sunk"><div class="wrap faq-wrap"><div class="sec-head"><div><span class="kicker">پرسش‌ها و پاسخ‌ها</span><h2>پیش از اشتراک بدانید</h2></div><a class="btn btn--line" href="#/faq">همهٔ پرسش‌ها</a></div>${faqHTML(5)}</div></section>`;

    $("#heroDeals").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; deal = b.dataset.d; $$("#heroDeals button").forEach((x) => x.classList.toggle("is-on", x === b)); });
    $("#heroQ").addEventListener("input", (e) => {
      const v = e.target.value.trim();
      const { tags } = v.length > 2 ? NLP.parseQuery(v) : { tags: [] };
      $("#heroParsed").innerHTML = tags.length ? `<span>برداشت:</span>${tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join("")}` : "";
    });
    const H = { provs: [], cities: [], dist: "", dq: "" };
    const drawHTags = () => {
      const el = $("#hTags");
      if (!el) return;
      const tags = [];
      H.provs.forEach((p) => tags.push({ k: "prov", id: p, label: "استان " + (PROVINCES.find((x) => x.id === p)?.name || p) }));
      H.cities.forEach((c) => tags.push({ k: "city", id: c, label: UI.cityOf(c)?.name || c }));
      el.innerHTML = tags.map((t) => `<button type="button" class="atag" data-k="${t.k}" data-id="${t.id}"><span>${esc(t.label)}</span>${icon("x", 'width="12" aria-hidden="true"')}</button>`).join("");
      clearTimeout(drawHTags.t);
      drawHTags.t = setTimeout(() => liveSelect(st, { provs: H.provs, cities: H.cities }), 250);  // کادر زنده هم‌گام با فیلتر
    };

    $("#hTags")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      if (b.dataset.k === "prov") H.provs = H.provs.filter((x) => x !== b.dataset.id);
      if (b.dataset.k === "city") H.cities = H.cities.filter((x) => x !== b.dataset.id);
      if (b.dataset.k === "prov") refreshCities();
      drawHTags();
    });

    $("#heroForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#heroQ").value.trim();
      const dl = deal === "presale" ? { deal: "sale", presale: 1 } : deal ? { deal } : {};
      const f = v ? { ...NLP.parseQuery(v, dl).filters, ...(deal === "presale" ? dl : {}) } : dl;
      if (H.provs.length) f.province = H.provs.join(",");
      if (H.cities.length) f.city = H.cities.join(",");
      if (H.dist) f.district = H.dist;
      if (H.dq) f.dq = H.dq;
      if ($("#hOpp").checked) f.opp = 1;
      go("#/s?" + toQuery({ sort: "score", ...f }));
    });

    // فهرست شهرها فقط شهرهای استان‌های انتخاب‌شده (یک یا چند استان)؛ بدون استان، همهٔ شهرها
    const hCities = () => CITIES.filter((c) => !H.provs.length || H.provs.includes(c.province))
      .map((c) => ({ id: c.id, label: c.name, hint: (PROVINCES.find((p) => p.id === c.province) || {}).name }));
    const refreshCities = () => {
      // شهرهای انتخابی که در استان‌های انتخاب‌شده نیستند کنار می‌روند
      if (H.provs.length) H.cities = H.cities.filter((id) => H.provs.includes(UI.cityOf(id)?.province));
      {
        hCity.setItems(hCities(), null);
        const inp = $("#hCity input");
        if (inp) inp.placeholder = H.provs.length ? `افزودن شهر از ${H.provs.map((p) => PROVINCES.find((x) => x.id === p)?.name || p).join(" و ")}...` : "افزودن شهر...";
      }
    };
    UI.combo($("#hProv"), { items: PROVINCES.map((p) => ({ id: p.id, label: p.name })), value: null, allLabel: "انتخاب استان", placeholder: "افزودن استان...",
      onChange: ({ id }) => { if (id && !H.provs.includes(id)) { H.provs.push(id); refreshCities(); drawHTags(); } } });
    const hCity = UI.combo($("#hCity"), { items: hCities(), value: null, allLabel: "انتخاب شهر", placeholder: "افزودن شهر...",
      onChange: async ({ id }) => {
        if (!id) return;
        if (!H.cities.includes(id)) { H.cities.push(id); drawHTags(); }
        H.dist = "";
        const r = await DataLayer.districts(id, ["sale", "", "presale"].includes(deal) ? "sale" : deal).catch(() => ({ items: [] }));
        hDist.setItems(r.items.map((x) => ({ id: x.name, label: x.name, hint: fa(x.n) + " آگهی" })), null);
        if ($("#hDist input")) $("#hDist input").placeholder = r.items.length ? "همهٔ محله‌ها" : "محله‌ها";
      } });
    const hDist = UI.combo($("#hDist"), { items: [], value: null, allLabel: "همهٔ محله‌ها", placeholder: "انتخاب یا نوشتن نام محله",
      // محله‌ای که در فهرست نیست: در متن آگهی‌های شهر انتخابی جست‌وجو می‌شود
      freeText: (q) => `جست‌وجوی «${q}» در آگهی‌های ${H.cities.length ? H.cities.map((c) => UI.cityOf(c)?.name || c).join(" و ") : "همهٔ شهرها"}`,
      onChange: ({ id, free }) => { H.dist = id || ""; H.dq = free || ""; } });
    $("#heroQuick").addEventListener("click", (e) => { const c = e.target.closest("[data-q]"); if (c) { $("#heroQ").value = c.dataset.q; $("#heroForm").requestSubmit(); } });

    const top = (await DataLayer.search({ sort: "score", ranked: 1, limit: 15 })).items;
    let off = 0;
    const drawBoard = () => {
      if (!$("#boardList")) return;
      const rows = top.slice(off, off + 5);
      if (rows.length < 5) rows.push(...top.slice(0, Math.min(top.length, 5 - rows.length)));
      $("#boardList").innerHTML = rows.length ? rows.map((l, i) => `<li><a class="board__row" style="animation-delay:${i * 60}ms" href="#/ad/${encodeURIComponent(l.id)}"><b>${UI.tt(l.title)}</b><span class="board__price">${l.score != null ? fa(Math.round(l.score)) + " امتیاز" : ""}</span><span>${esc(l.city_name || UI.cityOf(l.city_key)?.name || "")}${l.district ? "، " + esc(l.district) : ""}، ${esc(UI.pinLabel(l))}</span><span style="text-align:left">${l.verdict && l.verdict.delta < 0 ? UI.gapPct(l.verdict) + " فاصله با برآورد" : ""}</span></a></li>`).join("")
        : `<li class="board__row"><span>با جمع شدن آگهی کافی، فرصت‌ها اینجا نمایش داده می‌شوند.</span></li>`;
      off = (off + 5) % Math.max(5, top.length);
    };
    drawBoard();
    if (top.length > 5) boardTimer = setInterval(() => { if (!$("#boardList")) clearInterval(boardTimer); else if (!document.hidden) drawBoard(); }, 6000);

    let fs = "score";
    const drawFeed = async () => {
      $("#feed").innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join("");
      const f = { sort: fs, ...(fs === "drop" ? { drop: 1 } : {}), ...(fs === "score" ? { opp: 1 } : fs === "deal" ? { ranked: 1 } : {}) };
      const r = await DataLayer.search({ ...f, limit: 4 });
      if (!$("#feed")) return;
      $("#feed").innerHTML = r.items.length ? r.items.map((l) => UI.card(l)).join("") : `<div class="empty" style="grid-column:1/-1"><h3>فعلاً موردی نیست</h3><p>با دریافت آگهی‌های بیشتر این بخش پر می‌شود.</p></div>`;
      $("#feedMore").href = "#/s?" + toQuery(f);
    };
    $("#feedS").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fs = b.dataset.s; $$("#feedS button").forEach((x) => x.classList.toggle("is-on", x === b)); drawFeed(); });
    drawFeed();
    // انتخاب شهر روی کره، فیلتر شهر جست‌وجو را هم پر می‌کند
    initLive(st, { onCities: (ids) => { H.cities = ids.slice(); H.provs = []; H.dist = ""; refreshCities(); if (!ids.length) hCity.set(null); else if (ids.length === 1) hCity.set(ids[0]); drawHTags(); },
      // محله‌های روشن در فهرست زیر نقشه = فیلتر محلهٔ جست‌وجو
      onDistricts: (names) => { H.dist = names.join(","); H.dq = ""; hDist.set(names.length === 1 ? names[0] : null); } });
    // راهنمای استان‌ها: یک ردیف با پیمایش افقی؛ دکمهٔ «همه» باز و بسته می‌کند
    const rail = $("#provList");
    if (rail) {
      const sync = () => {
        const max = rail.scrollWidth - rail.clientWidth, x = Math.abs(rail.scrollLeft);
        $("#provRail").classList.toggle("can-prev", x > 8);
        $("#provRail").classList.toggle("can-next", x < max - 8);
      };
      rail.addEventListener("scroll", sync, { passive: true });
      requestAnimationFrame(sync);
      $("#provRail").addEventListener("click", (e) => {
        const b = e.target.closest("[data-rail]"); if (!b) return;
        // راست‌به‌چپ: «بعدی» یعنی رفتن به سمت چپ
        rail.scrollBy({ left: -(+b.dataset.rail) * (rail.clientWidth * 0.85), behavior: "smooth" });
      });
      $("#provAll").addEventListener("click", (e) => {
        const open = rail.classList.toggle("is-open");
        $("#provRail").classList.toggle("is-open", open);
        e.currentTarget.setAttribute("aria-expanded", open);
        e.currentTarget.textContent = open ? "جمع کردن در یک ردیف" : "نمایش همهٔ استان‌ها";
        requestAnimationFrame(sync);
      });
      if (PROVINCES.length <= 3) $("#provAll").parentElement.hidden = rail.scrollWidth <= rail.clientWidth + 4;
    }
    drawSample();
    if (window.Ribbons) { Ribbons.mount($(".solution")); Ribbons.mount($(".hero"), { count: 3, alpha: 0.35 }); }
    scrollScenes();
    bindPlans();
    drawGlance(st);
    DataLayer.search({ opp: 1, photo: 1, limit: 16, sort: "score" }).then((r) => {
      const ok = r.items.filter((l) => !(l.signals && (l.signals.caution || l.signals.fake))).slice(0, 4);
      if (!ok.length || !$("#showGrid")) return;
      $("#showcase").hidden = false;
      $("#showGrid").innerHTML = ok.map((l) => UI.card(l)).join("");
    });
  }
  /* کادر زنده: کرهٔ زمین واقعی (WebGL) که به شهرهای انتخابی پرواز می‌کند و سپس نقشهٔ باکیفیت و تعاملی شهرها
     (جابه‌جایی، بزرگ‌نمایی با چرخ موس، پرش بین شهرها) با ستون سه‌بعدی قیمت هر محله؛ در صفحهٔ فرصت‌ها عکس آگهی‌ها هم
     روی نقشه می‌آید. اگر WebGL یا «کاهش حرکت» مانع باشد، برج‌های سه‌بعدی SVG جایگزین می‌شوند. */
  let live = null;
  const dark = () => document.documentElement.dataset.theme === "dark";
  function webglOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
  const liveIds = (st, sel) => {
    const withData = (c) => (st.cities || {})[c] && (st.cities[c].n || 0) > 0;
    return [...new Set([...(sel.cities || []), ...CITIES.filter((c) => (sel.provs || []).includes(c.province)).map((c) => c.id)])]
      .filter(withData).sort((a, b) => (st.cities[b]?.n || 0) - (st.cities[a]?.n || 0)).slice(0, 8);
  };
  const liveTitle = (names, pre = "قیمت محله‌های ") => pre + (names.length > 3 ? names.slice(0, 3).join("، ") + " و " + fa(names.length - 3) + " شهر دیگر" : names.join("، "));
  // opts: { mode: "home" | "search", sel, onCities(ids) }
  async function initLive(st, opts = {}) {
    if (live && live.globe) { try { live.globe.destroy(); } catch (e) {} }
    live = null;
    if (!$("#sky")) return;
    const mode = opts.mode || "home";
    if (!webglOK() || matchMedia("(prefers-reduced-motion: reduce)").matches) { drawSky(st, opts.sel || {}); return; }
    const V = (($('script[src*="assets/js/app.js"]') || {}).src || "").split("?v=")[1] || "";
    // نمایش آنی: تا کرهٔ سه‌بعدی آماده شود، تصویر سبک همان کره (۱۰۲۴ پیکسلی) با چرخش آرام نشان داده می‌شود
    const tone = dark() ? "night" : "day", liteGlobe = document.documentElement.classList.contains("lite");
    const posterUrl = `/assets/vendor/globe/earth-${tone}-1024.${IMGX}`;
    const putPoster = () => { const st0 = $("#skyStage"); if (st0 && !st0.querySelector(".globe-poster")) st0.insertAdjacentHTML("beforeend", `<div class="globe-poster" aria-hidden="true"><i style="background-image:url('${posterUrl}')"></i></div>`); };
    putPoster();
    try {
      const mod = await import("/assets/js/globe.js" + (V ? "?v=" + V : ""));
      if (!$("#sky")) return;
      const stage = $("#skyStage");
      stage.innerHTML = `<div class="sky__globe" id="skyGlobe"></div>
        <div class="sky__map" id="skyMap" aria-hidden="true"></div>
        <div class="sky__bar" id="skyBar" hidden></div>
        <button type="button" class="sky__back" id="skyBack" hidden>${icon("arrow")} کرهٔ زمین</button>
        <button type="button" class="sky__full" id="skyFull" title="نمایش تمام صفحه" aria-label="نمایش تمام صفحه">${icon("expand")}</button>`;
      stage.classList.add("is-globe");
      putPoster();
      skyFullInit();
      const cities = CITIES.filter((c) => (st.cities || {})[c.id]?.n).map((c) => ({ ...c, n: st.cities[c.id].n }));
      const L0 = { st, mode, opts, sel: null, map: null, token: 0, listings: [] };
      live = L0;
      L0.globe = await mod.mountGlobe($("#skyGlobe"), {
        cities, day: !dark(), lite: liteGlobe,
        // صفحهٔ کوچک یا سیستم ضعیف: بافت ۲۰۴۸ پیکسلی (سبک‌تر)؛ دسکتاپ: بافت کامل
        textureUrl: liteGlobe || innerWidth < 760 || document.documentElement.classList.contains("embed") ? `/assets/vendor/globe/earth-${tone}-2048.${IMGX}` : `/assets/vendor/globe/earth-${tone}.${IMGX}`,
        // بار اول: شهر انتخاب و فیلتر می‌شود و نقشه‌اش همین‌جا باز می‌شود؛ زدن دوباره روی همان شهر: صفحهٔ فرصت‌های آن شهر
        onPick: (c) => {
          if (L0.sel && L0.sel.ids.length === 1 && L0.sel.ids[0] === c.id) return liveOpenCity(L0, c.id);
          return opts.onCities ? opts.onCities([c.id]) : liveSelect(st, { cities: [c.id] });
        },
        onArrive: () => liveShowMap(L0),
      });
      $("#skyBack").addEventListener("click", () => liveHome(L0));
      $("#sky").classList.add("is-ready");
      const pst = stage.querySelector(".globe-poster"); if (pst) { pst.classList.add("is-out"); setTimeout(() => pst.remove(), 700); }
      if (opts.sel && liveIds(st, opts.sel).length) liveSelect(st, opts.sel);
      else $("#skyTitle").textContent = "بازار ملک ایران، از نگاه ماهواره";
    } catch (e) {
      console.warn("globe", e);
      live = null;
      $("#skyStage").classList.remove("is-globe");
      $("#skyStage").innerHTML = `<svg id="skySvg" viewBox="-300 -230 600 420" role="img" aria-label="برج‌های قیمت محله‌ها"></svg>`;
      drawSky(st, opts.sel || {});
    }
  }
  /* نقشهٔ تمام صفحه: با دکمهٔ بزرگ‌نمایی باز می‌شود؛ با دکمهٔ کوچک‌نمایی، Esc یا دکمهٔ «بازگشت» مرورگر جمع می‌شود.
     انتخاب یک آگهی یا محله در حالت تمام صفحه، اول نقشه را جمع می‌کند و بعد صفحه را با همان مورد باز می‌کند. */
  const skyFS = { on: false, pushed: false, after: null };
  function skyFullSet(on) {
    const sky = $("#sky"), b = $("#skyFull");
    skyFS.on = on;
    document.documentElement.classList.toggle("sky-fs", on);
    // کادر در حالت تمام صفحه به body منتقل می‌شود تا هیچ والدِ دارای transform (انیمیشن ورود، کج‌شدن) آن را در خودش حبس نکند
    if (sky && on && !skyFS.ph) { skyFS.ph = document.createComment("sky"); sky.before(skyFS.ph); document.body.appendChild(sky); }
    if (sky && !on && skyFS.ph) { if (skyFS.ph.isConnected) skyFS.ph.replaceWith(sky); else sky.remove(); skyFS.ph = null; }
    if (sky) sky.classList.toggle("is-full", on);
    if (b) { b.innerHTML = icon(on ? "shrink" : "expand"); b.title = on ? "کوچک‌نمایی و بازگشت" : "نمایش تمام صفحه"; b.setAttribute("aria-label", b.title); }
    const fix = () => { if (live && live.map) live.map.invalidateSize(); if (live && live.globe && live.globe.refresh) live.globe.refresh(); };
    setTimeout(fix, 80); setTimeout(fix, 400);
  }
  function skyFullExit(after) {
    if (!skyFS.on) { after && after(); return; }
    if (skyFS.pushed) { skyFS.after = after || null; history.back(); return; }
    skyFullSet(false); after && after();
  }
  // اجرای یک ناوبری؛ اگر نقشه تمام صفحه است اول جمع می‌شود
  const skyGo = (fn) => skyFullExit(fn);
  function skyFullInit() {
    const b = $("#skyFull");
    if (!b) return;
    b.addEventListener("click", () => {
      if (skyFS.on) return skyFullExit();
      history.pushState({ skyFull: 1 }, "", location.href); skyFS.pushed = true;
      skyFullSet(true);
    });
    if (!skyFullInit.bound) {
      skyFullInit.bound = true;
      window.addEventListener("popstate", () => {
        if (!skyFS.on) return;
        skyFS.pushed = false; skyFullSet(false);
        const fn = skyFS.after; skyFS.after = null; fn && setTimeout(fn, 0);
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && skyFS.on) skyFullExit(); });
      window.addEventListener("hashchange", () => { if (skyFS.on && !skyFS.pushed) skyFullSet(false); });
    }
  }
  async function liveSelect(st, sel) {
    if (!live || !live.globe) { drawSky(st, sel); return; }
    const L0 = live, token = ++L0.token;
    const ids = liveIds(st, sel);
    if (!ids.length) { liveHome(L0); return; }
    const pts = ids.map((id) => CITIES.find((c) => c.id === id)).filter(Boolean);
    const names = pts.map((c) => c.name);
    // اگر نقشه همین حالا باز است، بدون برگشت به کره فقط روی شهرهای تازه می‌رود
    const mapOpen = $("#skyMap")?.classList.contains("is-on");
    // همهٔ محله‌های هر شهر (همهٔ نوع‌ها)، با مرکز واقعی محله؛ محلهٔ کم‌آگهی هم ستون کم‌رنگ می‌گیرد
    L0.pending = Promise.all(ids.map((c) => DataLayer.districtMap(c).then((r) => ({ c, ds: (r.districts || []) })).catch(() => ({ c, ds: [] }))));
    L0.sel = { ids, pts, names, token };
    if (mapOpen && L0.map) { liveShowMap(L0); return; }
    $("#skyTitle").textContent = liveTitle(names, "در حال پرواز به ");
    L0.globe.focus(pts.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng })), { zoom: pts.length > 1 ? 1.55 : 1.3 });
  }
  function liveOpenCity(L0, id) {
    skyGo(() => {
      if (L0.mode === "search") { const r = $("#focusBox") || $("#grid"); r && r.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      go("#/s?" + toQuery({ city: id, sort: "score", opp: 1 }));
    });
  }
  function liveHideMap() {
    $("#skyMap")?.classList.remove("is-on");
    $("#skyStage")?.classList.remove("map-on");
    if (live && live.globe && live.globe.pause) live.globe.pause(false);
    if ($("#skyMore")) $("#skyMore").hidden = true;
    if ($("#skyBack")) $("#skyBack").hidden = true;
    if ($("#skyBar")) $("#skyBar").hidden = true;
  }
  // پس از خروج از شهر، دکمهٔ همان شهر (روشن) روی کره می‌ماند؛ زدن دوباره، فیلتر را برمی‌گرداند و نقشه روی شهر متمرکز می‌شود
  function liveRecent(L0) {
    const bar = $("#skyBar"), ids = L0.recent || [];
    if (!bar || !ids.length) return;
    bar.innerHTML = ids.map((id) => `<button type="button" data-re="${id}" title="بازگشت به ${esc(UI.cityOf(id)?.name || id)}">${esc(UI.cityOf(id)?.name || id)}</button>`).join("");
    bar.hidden = false;
    bar.onclick = (e) => {
      const b = e.target.closest("[data-re]"); if (!b) return;
      const pick = L0.recent.length > 1 ? [b.dataset.re] : L0.recent.slice();
      L0.recent = null;
      if (L0.mode === "home" && L0.opts.onCities) L0.opts.onCities(pick);
      else liveSelect(L0.st, { cities: pick });
    };
  }
  function liveHome(L0) {
    liveHideMap();
    L0.sel = null; L0.token++;
    L0.globe.home();
    $("#skyTitle").textContent = "بازار ملک ایران، از نگاه ماهواره";
  }
  // آگهی‌های صفحهٔ فرصت‌ها روی نقشهٔ زنده (عکس + فاصله با قیمت محله)
  function liveListings(items) {
    if (!live) return;
    live.listings = (items || []).filter((l) => l.lat && l.lng).slice(0, 40);
    if (live.map && $("#skyMap")?.classList.contains("is-on")) drawLiveListings(live);
  }
  function drawLiveListings(L0) {
    if (!L0.adLayer) L0.adLayer = L.layerGroup().addTo(L0.map);
    L0.adLayer.clearLayers();
    L0.listings.forEach((l) => {
      const img = (l.images && l.images[0]) || l.image;
      const v = l.verdict || {}, d = v.delta != null ? -v.delta : null;
      const picked = L0.opts.query && L0.opts.query.pick === l.id;
      const html = `<div class="adpin${["gold", "good"].includes(l.label) ? " is-hot" : ""}${picked ? " is-picked" : ""}">${img ? `<img src="${esc(UI.imgUrl(img))}" alt="" onerror="this.parentNode.classList.add('noimg')">` : ""}<i>${icon("home")}</i>${d != null && d > 0.005 ? `<b>${fa(Math.round(d * 100))}٪</b>` : ""}</div>`;
      L.marker([l.lat, l.lng], { icon: L.divIcon({ className: "", iconSize: [0, 0], html }), zIndexOffset: 500 })
        .bindTooltip(`<b>${esc(UI.tt(l.title))}</b><br>${l.pp ? money(l.pp) + " تومان" : ""}${d != null && d > 0.005 ? "، " + fa(Math.round(d * 100)) + "٪ فاصله با برآورد بازار" : ""}`, { direction: "top", offset: [0, -46], className: "sky__tt" })
        .on("click", () => skyGo(() => (L0.opts.onPick ? L0.opts.onPick(l.id) : go("#/ad/" + encodeURIComponent(l.id)))))
        .addTo(L0.adLayer);
    });
  }
  async function liveShowMap(L0) {
    const sel = L0.sel;
    if (!sel || !$("#skyMap")) return;
    const reps = await L0.pending;
    if (sel.token !== L0.token || !$("#skyMap")) return;
    const multi = reps.filter((r) => r.ds.length).length > 1;
    const ds = reps.flatMap((r) => r.ds.map((d) => ({ ...d, city: r.c }))).sort((a, b) => b.n - a.n).slice(0, 160);
    $("#skyTitle").textContent = liveTitle(sel.names);
    const box = $("#skyMap");
    if (!L0.map) {
      L0.map = L.map(box, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, wheelPxPerZoomLevel: 90, zoomSnap: 0.5 });
      L0.map.attributionControl.setPrefix(false);
      L.control.zoom({ position: "bottomleft", zoomInTitle: "بزرگ‌نمایی", zoomOutTitle: "کوچک‌نمایی" }).addTo(L0.map);
      // نقشه از سرور خود سایت (بدون کلید و مقاوم در قطع اینترنت بین‌الملل): اوپن‌استریت‌مپ با برچسب فارسی؛
      // در تم تیره با فیلتر تیره؛ لایهٔ ماهواره‌ای اسری
      const dark = L.tileLayer(UI.tileUrl("osm"), { maxZoom: 19, attribution: "© OpenStreetMap", className: "sky__tiles" });
      const sat = L.tileLayer(UI.tileUrl("sat"), { maxZoom: 19, maxNativeZoom: 18, attribution: "تصویر ماهواره‌ای", keepBuffer: 1, updateWhenIdle: true });
      UI.tileRetry(dark); UI.tileRetry(sat);
      dark.addTo(L0.map);
      L0.base = { dark, sat, osm: dark };
      L0.layer = L.layerGroup().addTo(L0.map);
      // برچسب‌های قیمت فقط از بزرگ‌نمایی ۱۲ به بعد (در نمای دور شلوغ نشود)
      const zc = () => L0.map.getContainer().classList.toggle("sky-zlo", L0.map.getZoom() < 12);
      L0.map.on("zoomend", zc); zc();
    }
    L0.layer.clearLayers();
    // محله‌ای که مختصات ندارد، دور مرکز شهرش روی مارپیچ طلایی چیده می‌شود
    const byCity = {}, bounds = {};
    const pv = ds.map((d) => d.median_ppm).filter(Boolean);
    const lo = pv.length ? Math.min(...pv) : 0, hi = pv.length ? Math.max(...pv) : 0;
    const all = [], posOf = {}, unplaced = [];
    L0.cols = {};
    // محله‌های روشن (انتخاب با فهرست پایین نقشه): در صفحهٔ فرصت‌ها از فیلتر محله خوانده می‌شود
    if (L0.mode === "search") L0.dsel = new Set(String((L0.opts.query || {}).district || "").split(",").filter(Boolean));
    else if (!L0.dsel || L0.dselFor !== sel.ids.join(",")) L0.dsel = new Set();
    L0.dselFor = sel.ids.join(",");
    ds.forEach((d) => {
      // محله‌ای که مکانش معلوم نیست روی نقشه گذاشته نمی‌شود (قبلاً دور مرکز شهر چیده می‌شد و روستاهای دور را داخل شهر نشان می‌داد)
      const lat = d.lat, lng = d.lng;
      if (!lat || !lng) { unplaced.push(d); return; }
      all.push([lat, lng]); (bounds[d.city] = bounds[d.city] || []).push([lat, lng]); posOf[d.city + "|" + d.name] = [lat, lng];
      const isSel = L0.dsel.has(d.name), isDim = L0.dsel.size > 0 && !isSel;
      const h = d.median_ppm ? Math.round(18 + 62 * (hi > lo ? (d.median_ppm - lo) / (hi - lo) : 0.5)) : 12;
      // برچسب شناور قیمت هر متر (میانهٔ واقعی محله، میلیون تومان)؛ رنگ از سبز (ارزان‌تر از بقیهٔ محله‌ها) تا قرمز (گران‌تر)
      const heat = d.median_ppm && hi > lo ? (d.median_ppm - lo) / (hi - lo) : 0.5;
      const bub = d.median_ppm && !d.low ? `<b class="col__p" style="--hc:hsl(${Math.round(140 - 132 * heat)} 70% 42%)">${fa(Math.round(d.median_ppm / 1e6))}<small>م/متر</small></b>` : "";
      const mk = L.marker([lat, lng], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div class="col${d.opportunities ? " is-hot" : ""}${isSel ? " is-sel" : ""}${isDim ? " is-dim" : ""}${d.low || !d.median_ppm ? " is-low" : ""}${d.rural ? " is-rural" : ""}" style="--h:${h}px">${bub}<i></i><span>${esc(d.name)}</span></div>` }), title: d.name })
        .bindTooltip(`<b>${esc(d.name)}</b>${multi ? " · " + esc(UI.cityOf(d.city)?.name || "") : ""}<br>${d.median_ppm ? "میانهٔ هر متر " + money(d.median_ppm) + (d.ppm_kind === "mixed" ? " (آپارتمان و ویلا)" : "") : "قیمت هر متر: دادهٔ کافی نیست"}<br>${fa(d.n)} آگهی${d.opportunities ? "، " + fa(d.opportunities) + " فرصت" : ""}${d.rural ? "<br><small>روستا یا ناحیهٔ خارج از شهر</small>" : d.approx && d.lat ? "<br><small>مکان تقریبی محله</small>" : ""}`, { direction: "top", offset: [0, -h - 6], className: "sky__tt" })
        .on("click", () => skyGo(() => {
          // محلهٔ انتخابی اول می‌آید و دکمهٔ «فرصت‌های بیشتر» همهٔ شهرهای انتخابی را باز می‌کند
          const base = L0.mode === "search" ? { ...(L0.opts.query || {}) } : { sort: "score" };
          delete base.pick; delete base.page;
          go("#/s?" + toQuery({ ...base, city: sel.ids.join(","), province: "", district: d.name, dcity: d.city, focus: 1 }));
        }))
        .addTo(L0.layer);
      L0.cols[d.name] = mk;
    });
    sel.pts.forEach((c) => { if (!bounds[c.id]) { bounds[c.id] = [[c.lat, c.lng]]; all.push([c.lat, c.lng]); } });
    // برچسب هر شهر روی نقشه: زدن روی آن، فرصت‌های همان شهر را باز می‌کند
    sel.pts.forEach((c) => {
      const n = reps.find((r) => r.c === c.id)?.ds.reduce((a, d) => a + (d.opportunities || 0), 0) || 0;
      L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<button type="button" class="citytag">${esc(c.name)}${n ? `<small>${fa(n)} فرصت</small>` : ""}${icon("arrow")}</button>` }), zIndexOffset: 800, title: "فرصت‌های " + c.name })
        .on("click", () => liveOpenCity(L0, c.id)).addTo(L0.layer);
    });
    // نوار بالای نقشه: پرش بین شهرها، «همه»، لایهٔ ماهواره، و رفتن به فرصت‌ها
    const bar = $("#skyBar");
    bar.innerHTML = (sel.pts.length > 1 ? `<button type="button" data-fly="*" class="is-on">همه</button>` : "") + sel.pts.map((c) => `<button type="button" data-fly="${c.id}"${sel.pts.length === 1 ? ' class="is-on"' : ""} title="بار اول: رفتن به ${esc(c.name)}؛ بار دوم: خروج و بازگشت به کرهٔ زمین">${esc(c.name)}</button>`).join("")
      + `<span class="sky__sep"></span><button type="button" data-layer="sat" title="نمای ماهواره‌ای">ماهواره</button>`
      + (L0.mode === "home" ? `<a class="sky__go" href="#/s?${toQuery({ city: sel.ids.join(","), sort: "score", opp: 1 })}">فرصت‌های ${sel.pts.length > 1 ? "این شهرها" : esc(sel.pts[0].name)} ${icon("arrow")}</a>` : "");
    bar.hidden = false;
    bar.onclick = (e) => {
      const f = e.target.closest("[data-fly]"), ly = e.target.closest("[data-layer]");
      // زدن دوباره روی شهری که روشن است: خروج از آن شهر (صفحهٔ اصلی: از فیلتر هم برداشته می‌شود) و بازگشت به کره یا شهرهای دیگر
      if (f && f.dataset.fly !== "*" && f.classList.contains("is-on")) {
        const rest = sel.ids.filter((id) => id !== f.dataset.fly);
        f.classList.remove("is-on");
        L0.recent = sel.ids.slice();
        if (L0.mode === "home" && L0.opts.onCities) { L0.opts.onCities(rest); if (!rest.length) { liveHome(L0); liveRecent(L0); } return; }
        if (rest.length && L0.opts.onCities) { L0.opts.onCities(rest); return; }
        liveHome(L0); liveRecent(L0); return;
      }
      if (f) {
        $$("[data-fly]", bar).forEach((b) => b.classList.toggle("is-on", b === f));
        const b = f.dataset.fly === "*" ? all : bounds[f.dataset.fly];
        L0.map.flyToBounds(b, { padding: [50, 50], maxZoom: 14, duration: 1.4 });
      }
      if (ly) {
        const on = ly.classList.toggle("is-on");
        // نقشهٔ خیابان زیر لایهٔ ماهواره می‌ماند: اگر کاشی ماهواره دیر برسد یا نرسد، صفحه خاکستری نمی‌شود
        if (on) L0.base.sat.addTo(L0.map).bringToFront();
        else L0.map.removeLayer(L0.base.sat);
      }
    };
    // فهرست همهٔ محله‌های شهر زیر نقشه: هر نام یک کلید روشن/خاموش است؛ محلهٔ روشن ستونش برجسته می‌شود
    // و فرصت‌هایش در فهرست صفحه می‌آید. محله‌ای که هنوز مکان دقیق ندارد علامت «بی‌مکان» دارد.
    let more = $("#skyMore");
    if (!more) { more = document.createElement("div"); more.id = "skyMore"; more.className = "sky__more"; box.parentNode.appendChild(more); }
    const chips = ds.slice().sort((a, b) => (b.opportunities || 0) - (a.opportunities || 0) || b.n - a.n).slice(0, 200);
    more.hidden = !chips.length;
    more.innerHTML = chips.length ? `<span class="sky__more-h">محله‌های ${multi ? "این شهرها" : esc(sel.pts[0].name)} <small>${fa(chips.length)}</small></span><div class="sky__more-list" id="skyMoreList">` + chips.map((d, i) => `<button type="button" data-um="${i}" aria-pressed="false" class="${d.opportunities ? "is-hot" : ""}${d.rural ? " is-rural" : ""}${d.lat ? "" : " is-nopin"}" title="${d.lat ? "روشن/خاموش کردن این محله" : "مکان دقیق این محله هنوز روی نقشه معلوم نیست؛ با روشن کردن، آگهی‌هایش در فهرست می‌آید"}">${esc(d.name)}<small>${fa(d.n)}${d.opportunities ? "، " + fa(d.opportunities) + " فرصت" : ""}</small></button>`).join("") + `</div><button type="button" class="sky__more-x" id="skyMoreX" title="نمایش همه یا جمع کردن">${icon("down", 'width="16"')}</button>` : "";
    if (chips.length) UI.hscroll($("#skyMoreList"));
    const paintSel = () => {
      const on = L0.dsel;
      $$("[data-um]", more).forEach((b) => { const v = on.has(chips[+b.dataset.um].name); b.classList.toggle("is-on", v); b.setAttribute("aria-pressed", v); });
      Object.entries(L0.cols || {}).forEach(([name, mk]) => { const el = mk.getElement() && mk.getElement().querySelector(".col"); if (el) { el.classList.toggle("is-sel", on.has(name)); el.classList.toggle("is-dim", on.size > 0 && !on.has(name)); } });
    };
    paintSel();
    more.onclick = (e) => {
      if (e.target.closest("#skyMoreX")) { more.classList.toggle("is-open"); return; }
      const b = e.target.closest("[data-um]"); if (!b) return;
      const d = chips[+b.dataset.um];
      L0.dsel.has(d.name) ? L0.dsel.delete(d.name) : L0.dsel.add(d.name);
      paintSel();
      const names = [...L0.dsel];
      if (L0.opts.onDistricts) L0.opts.onDistricts(names, sel.ids);
      // روی نقشه به محلهٔ تازه‌روشن برو
      if (L0.dsel.has(d.name) && L0.cols[d.name]) L0.map.flyTo(L0.cols[d.name].getLatLng(), Math.max(L0.map.getZoom(), 14), { duration: 0.8 });
      const go_ = $(".sky__go", $("#skyBar"));
      if (go_) go_.href = "#/s?" + toQuery({ city: sel.ids.join(","), sort: "score", opp: names.length ? "" : 1, district: names.join(",") });
    };
    // چرخ موس روی فهرست: پیمایش افقی
    const ml = $("#skyMoreList");
    box.classList.add("is-on");
    $("#skyStage")?.classList.add("map-on");
    if (L0.globe && L0.globe.pause) L0.globe.pause(true);
    $("#skyBack").hidden = false;
    if (L0.listings.length) drawLiveListings(L0);
    setTimeout(() => {
      L0.map.invalidateSize();
      const q = L0.opts.query || {}, pk = q.pick && L0.listings.find((l) => l.id === q.pick);
      const dk = q.district && Object.keys(posOf).find((k) => k.split("|")[1] === String(q.district).split(",")[0] && (!q.dcity || k.split("|")[0] === q.dcity));
      if (pk) L0.map.setView([pk.lat, pk.lng], 15);
      else if (dk) L0.map.setView(posOf[dk], 14);
      else if (all.length) L0.map.fitBounds(all, { padding: [50, 50], maxZoom: 14 });
    }, 60);
  }

  /* برج‌های سه‌بعدی قیمت محله‌ها: دادهٔ واقعی؛ با فیلتر استان و شهر کادر جست‌وجو هم‌گام می‌شود
     (یک شهر: محله‌هایش؛ چند شهر یا استان: محله‌های همهٔ شهرهای انتخابی کنار هم) */
  let skyToken = 0;
  async function drawSky(st, sel = {}) {
    const token = ++skyToken;
    if (!$("#skySvg")) return;
    const withData = (c) => (st.cities || {})[c] && (st.cities[c].n || 0) > 0;
    let cities = [...new Set([...(sel.cities || []), ...CITIES.filter((c) => (sel.provs || []).includes(c.province)).map((c) => c.id)])].filter(withData);
    const picked = cities.length > 0;
    if (!picked) cities = Object.entries(st.cities || {}).sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([c]) => c);
    cities = cities.sort((a, b) => (st.cities[b]?.n || 0) - (st.cities[a]?.n || 0)).slice(0, picked ? 6 : 3);
    $("#sky").classList.add("is-loading");
    const reps = await Promise.all(cities.map((c) => DataLayer.market(c, "sale", "apartment").then((r) => ({ c, ds: ((r.report && r.report.districts) || []).filter((d) => d.median_ppm) })).catch(() => ({ c, ds: [] }))));
    if (token !== skyToken || !$("#skySvg")) return;
    $("#sky").classList.remove("is-loading");
    let use = reps.filter((x) => x.ds.length);
    if (!picked) use = use.sort((a, b) => b.ds.length - a.ds.length).slice(0, 1);
    const multi = use.length > 1;
    const ds = use.flatMap((x) => x.ds.map((d) => ({ ...d, city: x.c }))).sort((a, b) => b.n - a.n).slice(0, 40);
    const names = use.map((x) => UI.cityOf(x.c)?.name || x.c);
    // گره را تازه می‌سازیم تا شنونده‌ها و حلقهٔ قبلی رها شوند
    const old = $("#skyStage"), stage = old.cloneNode(false);
    stage.innerHTML = `<svg id="skySvg" viewBox="-300 -230 600 420" role="img" aria-label="برج‌های قیمت محله‌ها"></svg>`;
    old.replaceWith(stage);
    const svg = $("#skySvg");
    if (ds.length < 3) {
      $("#skyTitle").textContent = picked ? `قیمت محله‌های ${names.join("، ") || "شهرهای انتخابی"}` : "قیمت محله‌ها، سه‌بعدی";
      svg.innerHTML = `<text x="0" y="0" text-anchor="middle" class="sky__empty">${picked ? "برای شهرهای انتخابی هنوز محلهٔ سنجیده‌شدهٔ کافی نیست" : "با جمع شدن آگهی کافی، برج‌های قیمت محله‌ها این‌جا ساخته می‌شوند"}</text>`;
      return;
    }
    $("#skyTitle").textContent = `قیمت محله‌های ${names.length > 3 ? names.slice(0, 3).join("، ") + " و " + fa(names.length - 3) + " شهر دیگر" : names.join("، ")}، سه‌بعدی`;
    const sorted = [...ds].sort((a, b) => b.median_ppm - a.median_ppm);   // چیدمان مارپیچی: گران‌ترین در مرکز
    const cells = [], seen = new Set();
    let x = 0, y = 0, dx = 1, dy = 0, run = 1, k = 0;
    while (cells.length < sorted.length && k++ < 400) {
      for (let r = 0; r < 2 && cells.length < sorted.length; r++) {
        for (let q = 0; q < run && cells.length < sorted.length; q++) { const key = x + "," + y; if (!seen.has(key)) { seen.add(key); cells.push([x, y]); } x += dx; y += dy; }
        [dx, dy] = [-dy, dx];
      }
      run++;
    }
    const lo = sorted[sorted.length - 1].median_ppm, hi = sorted[0].median_ppm;
    const T = sorted.map((d, i) => ({ d, x: cells[i][0] * 1.35, y: cells[i][1] * 1.35, h: 0.5 + 3.4 * (hi > lo ? (d.median_ppm - lo) / (hi - lo) : 0.5), hot: d.opportunities > 0, g: 0 }));
    const C = Math.cos(Math.PI / 6), w = 0.95;
    const ext = Math.max(...T.map((t) => Math.hypot(t.x, t.y))) + 0.8;
    const U = Math.min(42, 250 / (ext * 2 * C));
    let theta = -0.6, drag = null, hover = null, born = performance.now();
    const auto = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const render = (now) => {
      const cs = Math.cos(theta), sn = Math.sin(theta);
      const P = (px, py, pz) => { const rx = px * cs - py * sn, ry = px * sn + py * cs; return [(rx - ry) * C * U, (rx + ry) * 0.5 * U - pz * U, rx + ry]; };
      const pts = (arr) => arr.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
      const items = T.map((t, ti) => {
        // رشد برج‌ها هنگام ورود، پلکانی از مرکز
        const grow = auto ? Math.min(1, Math.max(0, ((now || born) - born - ti * 35) / 700)) : 1;
        const h = t.h * (1 - Math.pow(1 - grow, 3));
        const c = [[t.x - w / 2, t.y - w / 2], [t.x + w / 2, t.y - w / 2], [t.x + w / 2, t.y + w / 2], [t.x - w / 2, t.y + w / 2]];
        const bot = c.map(([a, b]) => P(a, b, 0)), topv = c.map(([a, b]) => P(a, b, h));
        const sides = [0, 1, 2, 3].map((i) => ({ i, z: (bot[i][2] + bot[(i + 1) % 4][2]) / 2 })).sort((a, b) => b.z - a.z).slice(0, 2);
        const walls = sides.map(({ i }, n) => `<polygon class="sky__w${n}" points="${pts([topv[i], topv[(i + 1) % 4], bot[(i + 1) % 4], bot[i]])}"/>`).join("");
        return { depth: P(t.x, t.y, 0)[2], html: `<g class="sky__t${t.hot ? " is-hot" : ""}${hover === t ? " is-on" : ""}" data-i="${ti}">${walls}<polygon class="sky__top" points="${pts(topv)}"/></g>` };
      }).sort((a, b) => a.depth - b.depth);
      svg.innerHTML = `<ellipse class="sky__shadow" cx="0" cy="40" rx="250" ry="90"/>` + items.map((o) => o.html).join("");
    };
    const loop = (now) => { if (token !== skyToken || !$("#skySvg")) return; if (auto && !drag && !document.hidden) { theta += 0.0025; render(now); } requestAnimationFrame(loop); };
    render(auto ? born : 0); requestAnimationFrame(loop);
    const tip = $("#skyTip");
    stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, t: theta, moved: false }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener("pointermove", (e) => {
      if (drag) { const dxp = e.clientX - drag.x; if (Math.abs(dxp) > 3) drag.moved = true; theta = drag.t - dxp / 160; render(performance.now()); return; }
      const g = e.target.closest && e.target.closest(".sky__t");
      const t = g ? T[+g.dataset.i] : null;
      if (t !== hover) { hover = t; render(performance.now()); }
      if (!t) { tip.hidden = true; return; }
      const r = $("#sky").getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = (e.clientX - r.left) + "px"; tip.style.top = (e.clientY - r.top - 14) + "px";
      tip.innerHTML = `<b>${esc(t.d.name)}${multi ? `<small> · ${esc(UI.cityOf(t.d.city)?.name || "")}</small>` : ""}</b><span>میانهٔ هر متر ${money(t.d.median_ppm)}</span><span>${fa(t.d.n)} آگهی${t.d.opportunities ? "، <em>" + fa(t.d.opportunities) + " فرصت</em>" : ""}</span>`;
    });
    stage.addEventListener("pointerup", (e) => {
      if (drag && !drag.moved) { const el = document.elementFromPoint(e.clientX, e.clientY), g = el && el.closest && el.closest(".sky__t"); if (g) { const d = T[+g.dataset.i].d; go("#/s?" + toQuery({ city: d.city, district: d.name, sort: "score" })); } }
      drag = null;
    });
    stage.addEventListener("pointerleave", () => { hover = null; tip.hidden = true; render(performance.now()); });
  }

  /* بازار در یک نگاه: شهری که بیشترین آگهی معتبر را دارد */
  async function drawGlance(st) {
    const top = Object.entries(st.cities || {}).sort((a, b) => b[1].n - a[1].n)[0];
    if (!top) return;
    const city = top[0], name = UI.cityOf(city)?.name || "";
    const { report: R } = await DataLayer.market(city, "sale", "apartment");
    if (!R || !R.overview.valid || !$("#glance")) return;
    const o = R.overview, best = R.hotspots[0];
    $("#glance").innerHTML = `<div class="wrap"><div class="sec-head"><div><span class="kicker">بازار ${esc(name)} در یک نگاه</span><h2>آپارتمان فروشی ${esc(name)}، از ${fa(o.valid)} آگهی معتبر</h2><p>${DataLayer.samples ? "داده نمونه و ساختگی است. " : ""}همهٔ عددها میانه‌اند و هر محله فقط با آگهی‌های خودش حساب شده است.</p></div><a class="btn btn--line" href="#/market?city=${city}">صفحهٔ بازار ${esc(name)}</a></div>
      <div class="glance">
        <div><b>${money(o.median_ppm) || "—"}</b><span>میانهٔ قیمت هر متر، تومان</span></div>
        <div><b>${money(o.median_price) || "—"}</b><span>میانهٔ قیمت کل، تومان</span></div>
        <div><b>${fa(o.n_districts)}</b><span>محلهٔ دارای دست‌کم ۳ آگهی</span></div>
        <div><b>${best ? esc(best.name) : "—"}</b><span>${best ? `پرفرصت‌ترین محله، ${fa(best.opportunities)} فرصت` : "هنوز فرصتی ثبت نشده"}</span></div>
      </div>
      <div class="funnel funnel--mini">${R.funnel.map((f) => `<div class="funnel__row funnel__row--${f.k}"><span>${esc(f.label)}</span><span class="funnel__track"><i style="width:${Math.max(1, (f.n / Math.max(1, R.funnel[0].n)) * 100)}%"></i></span><b>${fa(f.n)}</b></div>`).join("")}</div></div>`;
  }

  /* شهر ایزومتریک سه‌بعدی (SVG ساخته‌شده در مرورگر، بدون کتابخانه)؛ یک ساختمان نارنجی = «فرصت» */
  function heroArt() {
    const C = Math.cos(Math.PI / 6), S = 0.5, u = 26;
    const P = (x, y, z) => `${((x - y) * C * u).toFixed(1)},${((x + y) * S * u - z * u).toFixed(1)}`;
    const box = (x, y, w, d, h, cls) => {
      const top = [P(x, y, h), P(x + w, y, h), P(x + w, y + d, h), P(x, y + d, h)];
      const left = [P(x, y + d, h), P(x + w, y + d, h), P(x + w, y + d, 0), P(x, y + d, 0)];
      const right = [P(x + w, y, h), P(x + w, y + d, h), P(x + w, y + d, 0), P(x + w, y, 0)];
      let win = "";
      for (let k = 0.6; k < h - 0.3; k += 0.7) win += `<path d="M${P(x + 0.2, y + d, k)} L${P(x + w - 0.2, y + d, k)}" class="iso__win"/>`;
      return `<g class="iso__b ${cls || ""}"><path d="M${left.join(" L")}Z" class="iso__l"/><path d="M${right.join(" L")}Z" class="iso__r"/><path d="M${top.join(" L")}Z" class="iso__t"/>${win}</g>`;
    };
    const lots = [];
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let gx = 0; gx < 9; gx++) for (let gy = 0; gy < 4; gy++) {
      if (rnd() < 0.18) continue;
      lots.push({ x: gx * 2.2, y: gy * 2.2, w: 1.4 + rnd() * 0.4, d: 1.4 + rnd() * 0.4, h: 0.8 + rnd() * (gy === 0 ? 1.6 : 3.2) });
    }
    const dist = (l) => Math.abs(l.x - 11) + Math.abs(l.y - 6.6);
    const hot = lots.reduce((b, l, k) => (dist(l) < dist(lots[b]) ? k : b), 0);
    lots[hot].h = 4.6; lots[hot].hot = true;
    lots.sort((a, b) => (a.x + a.y) - (b.x + b.y));  // ترتیب رسم: دور به نزدیک
    const body = lots.map((l) => box(l.x, l.y, l.w, l.d, l.h, l.hot ? "iso__b--hot" : "")).join("");
    const h = lots.find((q) => q.hot), pin = P(h.x + h.w / 2, h.y + h.d / 2, h.h + 0.9).split(",");
    return `<div class="iso" aria-hidden="true"><div class="iso__floor"></div>
      <svg class="iso__city" viewBox="-200 -150 820 530" preserveAspectRatio="xMidYMax meet">
        <ellipse cx="210" cy="300" rx="380" ry="90" class="iso__shadow"/>${body}
        <g class="iso__pin" transform="translate(${pin[0]} ${pin[1]})"><rect x="-80" y="-44" width="160" height="40" rx="20"/><text x="0" y="-18" text-anchor="middle">فرصت</text><path d="M-6 -4 L0 6 L6 -4Z"/></g>
      </svg></div>`;
  }

  /* نوار ناوبری با نورافکن: یک قرص نرم زیر گزینه‌ای که نشانگر رویش است می‌لغزد */
  function navSpotlight() {
    const nav = $(".nav");
    if (!nav || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const spot = document.createElement("span");
    spot.className = "nav__spot";
    nav.prepend(spot);
    const to = (a) => {
      if (!a) { spot.style.opacity = "0"; return; }
      const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
      spot.style.opacity = "1";
      spot.style.transform = `translateX(${r.left - n.left}px)`;
      spot.style.width = r.width + "px";
    };
    nav.addEventListener("pointerover", (e) => { const a = e.target.closest("a"); if (a && !a.classList.contains("nav__more")) to(a); });
    nav.addEventListener("pointerleave", () => to(null));
  }
  /* عددهای آمار با رمزگشایی ارقام ظاهر می‌شوند (یک بار، وقتی دیده شوند) */
  function scrambleScan() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const DIG = "۰۱۲۳۴۵۶۷۸۹";
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const el = en.target, final = el.textContent, t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / 900);
        el.textContent = [...final].map((ch, i) => (DIG.includes(ch) && i / final.length > p ? DIG[(Math.random() * 10) | 0] : ch)).join("");
        if (p < 1) requestAnimationFrame(tick); else el.textContent = final;
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.6 });
    $$(".sky__kpis b, .strip b, .glance b").forEach((el) => { if (!el.dataset.scr) { el.dataset.scr = "1"; io.observe(el); } });
  }
  /* عددهای زندهٔ سایت: هر دقیقه از سرور خوانده می‌شوند (و با برگشتن به برگه)، بدون بارگذاری دوبارهٔ صفحه.
     استان‌ها و شهرهایی که در پنل فعال می‌شوند هم همین‌جا به فهرست سایت اضافه می‌شوند. */
  function liveNumbers() {
    if (!DataLayer.server) return;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const [st, conf] = await Promise.all([fetch("api/stats", { cache: "no-store" }).then((r) => r.json()), fetch("api/config", { cache: "no-store" }).then((r) => r.json())]);
        const R = conf.regions || {};
        (R.provinces || []).forEach((p) => { if (!PROVINCES.some((x) => x.id === p.id)) PROVINCES.push(p); });
        (R.cities || []).forEach((c) => { if (!CITIES.some((x) => x.id === c.id)) CITIES.push(c); });
        DataLayer.stats = st;
        const val = { total: st.total, deals: st.deals, excluded: st.excluded, ranked: st.ranked, today: st.today, drops: st.drops,
          cities: Object.keys(st.cities || {}).length, citiesAll: CITIES.length };
        $$("[data-live]").forEach((el) => { const v = val[el.dataset.live]; if (v != null && el.textContent !== fa(v)) { el.textContent = fa(v); el.classList.add("is-bump"); setTimeout(() => el.classList.remove("is-bump"), 900); } });
      } catch (e) { /* شبکه */ }
    };
    setInterval(pull, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
  }
  /* عمق و سه‌بعدی: کج شدن کارت با نشانگر و نور دنبال‌کننده؛ فقط دستگاه دارای نشانگر و بدون «کاهش حرکت» */
  /* صحنه‌های وابسته به اسکرول (الهام از سایت‌های سینمایی): صحنهٔ ثابتی که با اسکرول عوض می‌شود،
     و متنی که واژه به واژه با اسکرول پررنگ می‌شود. با «کاهش حرکت» همه‌چیز ساکن و کامل دیده می‌شود. */
  function scrollScenes() {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    $$("[data-scrub]").forEach((el) => {
      if (el.dataset.scrubbed) return;
      el.dataset.scrubbed = "1";
      el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span>${esc(w)}</span>`).join(" ");
    });
    if (reduced) { $$(".scene").forEach((p) => p.classList.add("is-static")); return; }
    if (scrollScenes.bound) { scrollScenes.tick(); return; }
    scrollScenes.bound = true;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = innerHeight;
      $$(".scene").forEach((sec) => {
        const r = sec.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
        const steps = $$(".scene__step", sec), n = steps.length, k = Math.min(n - 1, Math.floor(p * n));
        const cl = (x) => Math.min(1, Math.max(0, x));
        sec.style.setProperty("--p", p.toFixed(4));
        // نما: طرح خطی خانه، با اسکرول از راست به عکس واقعی تبدیل می‌شود؛ سپس فضای داخلی
        sec.style.setProperty("--w1", (cl((p - 0.05) / 0.4) * 140).toFixed(1) + "%");
        sec.style.setProperty("--s1", cl((p - 0.05) / 0.4).toFixed(3));
        sec.style.setProperty("--s2", cl((p - 0.76) / 0.2).toFixed(3));
        sec.style.setProperty("--liv", cl((p - 0.68) / 0.08).toFixed(3));
        sec.style.setProperty("--w2", (cl((p - 0.76) / 0.2) * 140).toFixed(1) + "%");
        sec.style.setProperty("--logo", (1 - cl((p - 0.07) / 0.13)).toFixed(3));
        steps.forEach((s, i) => s.classList.toggle("is-on", i === k));
        $$(".scene__dots i", sec).forEach((d, i) => d.classList.toggle("is-on", i === k));
      });
      $$("[data-scrub]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.55)));
        const ws = el.children, lit = Math.round(p * ws.length);
        for (let i = 0; i < ws.length; i++) ws[i].classList.toggle("is-lit", i < lit);
      });
    };
    scrollScenes.tick = tick;
    // نورافکن نشانگر: زیر نشانگر، عکس واقعی از دل طرح خطی پیدا می‌شود
    document.addEventListener("pointermove", (e) => {
      const st = e.target.closest && e.target.closest(".scene__stage");
      $$(".scene__stage.is-hover").forEach((x) => x !== st && x.classList.remove("is-hover"));
      if (!st) return;
      const r = st.getBoundingClientRect();
      st.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px"); st.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
      st.classList.add("is-hover");
    }, { passive: true });
    addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
    addEventListener("resize", () => { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
    tick();
  }
  function depthFX() {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, last = null, ev = null;
    const SEL = ".card:not(.card--lock), .board, .sky, .plan, .tilt";
    const reset = (el) => { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); el.classList.remove("is-tilt"); };
    document.addEventListener("pointermove", (e) => {
      ev = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = ev.target.closest && ev.target.closest(SEL);
        if (last && last !== el) reset(last);
        last = el;
        const hero = ev.target.closest && ev.target.closest(".hero");
        if (hero) { const r = hero.getBoundingClientRect(); hero.style.setProperty("--px", ((ev.clientX - r.left) / r.width - 0.5).toFixed(3)); hero.style.setProperty("--py", ((ev.clientY - r.top) / r.height - 0.5).toFixed(3)); }
        if (!el) return;
        const r = el.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        const k = el.classList.contains("sky") ? 2.2 : el.classList.contains("board") ? 5 : 7;
        el.classList.add("is-tilt");
        el.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        el.style.setProperty("--rx", ((0.5 - y) * k).toFixed(2) + "deg");
        el.style.setProperty("--ry", ((x - 0.5) * k).toFixed(2) + "deg");
      });
    }, { passive: true });
    document.addEventListener("pointerleave", () => last && reset(last));
  }

  function provinceColumns(st) {
    const max = Math.max(1, ...Object.values(st.cities || {}).map((c) => c.n));
    return PROVINCES.map((p) => {
      const cs = CITIES.filter((c) => c.province === p.id).map((c) => ({ c, s: (st.cities || {})[c.id] || { n: 0 } })).sort((a, b) => b.s.n - a.s.n);
      const total = cs.reduce((a, x) => a + x.s.n, 0);
      return `<div class="prov__col"><h3>${p.name}<small>${fa(total)} آگهی</small></h3>${cs.slice(0, 5).map(({ c, s }) => {
        const ppm = s.ppm && (s.ppm.apartment || s.ppm.villa);
        return `<a class="city-row" href="/melk/${c.id}"><b>${c.name}</b><span class="n">${fa(s.n)}</span><small>${c.tags.join("، ")}${ppm ? `، میانه متری ${money(ppm)}` : ""}</small><span class="bar"><i style="width:${Math.max(3, (s.n / max) * 100)}%"></i></span></a>`;
      }).join("")}${cs.length > 5 ? `<a class="btn btn--ghost btn--sm" href="#/market" style="margin-top:8px">${fa(cs.length - 5)} شهر دیگر</a>` : ""}</div>`;
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
          <li><div><b>گردآوری پیوسته</b><span>آگهی‌های ملک ${fa(CITIES.length)} شهر به‌تدریج و شبانه‌روزی دریافت و تغییر قیمت‌ها ثبت می‌شود.</span></div></li>
          <li><div><b>پاک‌سازی</b><span>قیمت نمادین، اشتباه صفر، پیش‌فروش، مشارکت، فروش دانگی، آگهی تکراری و قیمت‌های پرت آماری کنار گذاشته می‌شوند.</span></div></li>
          <li><div><b>قیمت محله برای همین خانه</b><span>میانهٔ قیمت هر متر محله، تعدیل‌شده با سن بنا، طبقه، متراژ، آسانسور، پارکینگ، انباری، سند، دید دریا و ده‌ها ویژگی دیگر؛ هرگز با میانهٔ کل شهر مقایسه نمی‌کنیم.</span></div></li>
          <li><div><b>حکم، اطمینان و امتیاز</b><span>فرصت طلایی، فرصت مناسب، منصفانه، بالاتر از بازار یا مشکوک؛ کنار هر حکم تعداد آگهی‌های مقایسه و میزان اطمینان آمده است.</span></div></li>
        </ol>
      </div>
    </section>`;
  }

  function plansSection() {
    const plans = cfg.plans || [];
    const free = cfg.free_results || 10;
    return `<section class="section" id="plans">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">اشتراک</span><h2>رایگان یا ${esc(cfg.site.name)} پرو</h2><p>همه می‌توانند حکم قیمت، امتیاز و بازار محله‌ها را ببینند. با اشتراک، همهٔ نتیجه‌ها، آگهی‌های مشکوک همراه با دلیل و پیوند مستقیم هر آگهی اصلی باز می‌شود.${cfg.trial_days ? ` <b>ثبت‌نام با شماره موبایل، ${fa(cfg.trial_days)} روز دسترسی کامل و رایگان می‌دهد.</b>` : ""}</p></div></div>
        <div class="plans">
          <div class="plan"><h3>رایگان</h3><b class="plan__price">۰</b><ul class="check-list">
            <li>${fa(free)} نتیجهٔ اول هر جست‌وجو، بدون ورود</li><li>حکم قیمت، درصد زیر یا بالای قیمت محله و امتیاز</li><li>شناسنامهٔ قیمت و «چرا این قیمت؟»</li><li>صفحهٔ بازار همهٔ شهرها</li><li class="is-off">آگهی‌های مشکوک پنهان‌اند</li><li class="is-off">بدون پیوند مستقیم آگهی اصلی</li>
          </ul></div>
          ${plans.length ? plans.map((p, i) => `<div class="plan ${i === plans.length - 1 ? "plan--hot" : ""}"><h3>پرو ${esc(p.name)}</h3><b class="plan__price">${fa(p.price)} <small>تومان / ${fa(p.days)} روز</small></b><ul class="check-list">
            <li>همهٔ نتیجه‌ها، بدون محدودیت</li><li>آگهی‌های مشکوک، همراه با دلیل مشکوک بودن</li><li>پیوند مستقیم هر آگهی اصلی، نامحدود</li><li>قیمت مورد انتظار دقیق و اثر هر ویژگی</li><li>بدون تمدید خودکار</li>
          </ul><button class="btn ${i === plans.length - 1 ? "btn--hot" : "btn--ink"} btn--block" data-buy="${p.id}">خرید اشتراک ${esc(p.name)}</button></div>`).join("")
          : `<div class="plan plan--hot"><h3>پرو</h3><b class="plan__price">به‌زودی</b><p class="muted">تعرفهٔ اشتراک هنوز تعیین نشده است.</p></div>`}
        </div>
        ${cfg.owner?.refund_text ? `<p class="small muted" style="margin-top:14px">${esc(cfg.owner.refund_text)}</p>` : ""}
      </div>
    </section>`;
  }
  function bindPlans() { $$("[data-buy]").forEach((b) => b.addEventListener("click", () => buy(b.dataset.buy))); }
  async function buy(plan, method) {
    if (!DataLayer.me) { loginDialog(() => buy(plan)); return; }
    const methods = cfg.pay_methods || [];
    // انتخاب روش پرداخت: همهٔ روش‌ها دیده می‌شوند؛ روش آماده‌نشده پیام «فعلاً فعال نیست» می‌دهد
    if (!method && !cfg.test_payments) { payMethodDialog(plan); return; }
    // اگر درگاه پاسخ ندهد یا صفحهٔ پرداخت باز نشود، کاربر بی‌خبر نمی‌ماند
    payFail.plan = plan;
    const name = ((cfg.pay_methods || []).find((x) => x.id === method) || {}).name || "درگاه پرداخت";
    const fail = () => payFail(`پاسخی از «${name}» نرسید. لطفاً روش پرداخت دیگری را انتخاب کنید، یا اگر فیلترشکن (VPN) روشن است خاموشش کنید و دوباره امتحان کنید.`);
    toast("در حال اتصال به درگاه پرداخت…");
    try {
      const r = await Promise.race([DataLayer.startPayment(plan, method), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 20000))]);
      if (r.redirect) {
        location.href = r.redirect;
        setTimeout(() => { if (!document.hidden) fail(); }, 9000);   // صفحهٔ درگاه باز نشد
        return;
      }
      if (r.card || r.link) { cardDialog(r); return; }
      if (r.bale) { balePayDialog(r.bale); return; }
      if (!r.activated) { fail(); return; }
      if (r.activated) { await DataLayer.refreshMe(); updateAccount(); if (r.payment_id) go("#/invoice/" + r.payment_id); else { toast(r.test ? "اشتراک در حالت آزمایشی فعال شد" : "اشتراک فعال شد"); route(); } }
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
    const ms = cfg.pay_methods || [];
    const p = (cfg.plans || []).find((x) => x.id === plan);
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
        const inv = await DataLayer.invoice(b.payment_id);
        if (inv.status === "paid") { clearInterval(t); $("#dlg").close(); await DataLayer.refreshMe(); updateAccount(); go("#/invoice/" + b.payment_id); }
      } catch (e) { /* شبکه */ }
    }, 3000);
  }
  /* فاکتور پرداخت: بلافاصله پس از پرداخت، تا خریدار از دریافت پول و فعال شدن اشتراک مطمئن باشد */
  async function invoicePage(pid) {
    view().innerHTML = `<section class="section--tight"><div class="wrap"><div class="skeleton" style="height:360px;max-width:560px;margin:auto"></div></div></section>`;
    if (DataLayer.server) await DataLayer.refreshMe().catch(() => {});
    updateAccount();
    let inv;
    try { inv = await DataLayer.invoice(pid); } catch (err) {
      view().innerHTML = `<section class="section--tight"><div class="wrap"><div class="empty"><h3>فاکتور پیدا نشد</h3><p>${esc(err.message)}</p><a class="btn btn--ink" href="#/account">حساب کاربری</a></div></div></section>`; return;
    }
    const paid = inv.status === "paid", review = inv.status === "review", ok = paid || review;
    const jd = (t) => (t ? new Date(t * 1000).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" }) : "—");
    const jt = (t) => (t ? new Date(t * 1000).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) : "");
    const notice = (() => { const bale = (cfg.login_channels || []).concat(cfg.pay_methods || []).some((x) => x.id === "bale" && x.ready); const ch = [cfg.sms_live && "پیامک", bale && "بله"].filter(Boolean); return ch.length ? "رسید با " + ch.join(" و ") + " هم ارسال شد" : "این رسید را چاپ یا ذخیره کنید"; })();
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
      <div class="invoice__act"><a class="btn btn--gold btn--lg" href="#/s?sort=score&opp=1">دیدن فرصت‌ها ${icon("arrow")}</a><button class="btn btn--line" onclick="window.print()">چاپ یا ذخیرهٔ رسید</button><button class="btn btn--ghost" id="rpReplay">${icon("arrow")} چاپ دوباره</button><a class="btn btn--ghost" href="#/support?cat=payment">پشتیبانی پرداخت</a></div>
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
        <li><span>عکس رسید یا کد پیگیری را همین‌جا بفرست (یا بعداً از بخش <a href="#/support">پشتیبانی</a>). ${r.auto ? `اشتراک ${esc(r.plan)} همان لحظه باز می‌شود و واریز بعداً بررسی می‌شود.` : `پس از تطبیق واریز، اشتراک ${esc(r.plan)} باز می‌شود.`} پس از فعال‌سازی پیامک «دسترسی شما باز شد» می‌گیری.</span></li>
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
        const res = await DataLayer.submitReceipt(r.payment_id, $("#rcTrack").value, img);
        $("#dlg").close();
        await DataLayer.refreshMe(); updateAccount();
        if (res.activated) go("#/invoice/" + r.payment_id);
        else { toast("رسید ثبت شد؛ پس از بررسی فعال می‌شود"); route(); }
      } catch (err) { toast(err.message); }
      btn.disabled = false;
    });
  }

  /* ---------- پرسش‌ها و پاسخ‌ها ---------- */
  function faqItems() {
    const name = esc(cfg.site.name), th = cfg.thresholds || {};
    return [
      ["«قیمت محله» یعنی چه؟", `میانهٔ قیمت هر متر آگهی‌های معتبر همان محله، تعدیل‌شده برای همین خانه: سن بنا، متراژ، طبقه، آسانسور، پارکینگ، انباری، سند و ویژگی‌های دیگر. هیچ آگهی‌ای با میانهٔ کل شهر مقایسه نمی‌شود؛ اگر محله کمتر از ۵ آگهی معتبر هم‌نوع یا کمتر از ۳ فروشندهٔ مستقل داشته باشد، آگهی «در انتظار داده» می‌ماند و حکمی نمی‌گیرد.`],
      ["اگر دلال‌ها در یک محله آگهی گران بگذارند، قیمت محله بالا نمی‌رود؟", `نه به‌سادگی. آگهی‌های یک فروشنده (همان شمارهٔ تماس یا همان متن الگو با عددهای متفاوت) در هر محله روی هم فقط یک رأی دارند، آگهی‌های هم‌فروشندهٔ یک آگهی در قیمت محلهٔ خودش حساب نمی‌شوند، و افزایش قیمت پس از درج نادیده گرفته می‌شود. پس ده‌ها آگهی گران از چند دلال، میانهٔ وزنی محله را جابه‌جا نمی‌کند و آگهی‌های واقعی به اشتباه «فرصت» نمی‌شوند.`],
      ["کدام آگهی «فرصت» است؟", `آگهی‌ای که دست‌کم ${pct(th.opp || 0.15)} فاصله با برآورد بازار محلهٔ خودش باشد و این فاصله بیرون از پراکندگی عادی قیمت‌های همان محله باشد. «فرصت طلایی» دست‌کم ${pct(th.gold || 0.22)} فاصله دارد. در محله‌ای که قیمت‌ها خیلی پراکنده‌اند، همان فاصله ممکن است «منصفانه» حساب شود.`],
      ["امتیاز ۰ تا ۱۰۰ یعنی چه؟", "رتبهٔ آگهی در محلهٔ خودش: بهترین فرصت هر محله نزدیک ۱۰۰، آگهی هم‌قیمت محله ۵۰ و آگهی‌ای که فرصت نیست حداکثر ۶۴. امتیاز ۱۰۰ یعنی بهترین فرصت همین محله، نه اطمینان کامل؛ میزان اطمینان و تعداد مقایسه‌ها کنار هر حکم آمده است."],
      ["چرا بعضی آگهی‌ها «مشکوک»اند؟", `آگهی‌ای که بیش از ${pct(th.sus || 0.4)} ارزان‌تر از محلهٔ خودش باشد، یا خیلی ارزان باشد و در متنش آمده باشد عکس‌ها مال این ملک نیست یا چند قیمت داده باشد، یا متن مشکوک داشته باشد (مثل بیعانه پیش از بازدید). این آگهی‌ها امتیاز نمی‌گیرند، در محاسبهٔ قیمت محله نمی‌آیند و فقط برای مشترکان، همراه با دلیل، نشان داده می‌شوند.`],
      ["آگهی‌های قدیمی چطور حساب می‌شوند؟", `قیمت هر آگهی قیمت روز درج آن است. آگهی‌های قدیمی‌تر از ${fa(th.max_age_days || 90)} روز در قیمت محله نمی‌آیند، آگهی‌های تازه‌تر وزن بیشتری دارند و قیمت آگهی‌های قدیمی‌تر با روند ماهانهٔ بازار، که از خود آگهی‌ها برآورد می‌شود، به نرخ امروز آورده می‌شود. زمان درج هر آگهی روی کارت آن آمده است.`],
      ["شهری و روستایی را چطور تشخیص می‌دهید؟", "از نام محله و متن آگهی: اشاره به روستا، دهستان، ییلاق یا خارج از محدودهٔ شهر، آگهی را «روستایی» می‌کند. این تشخیص خودکار است و ممکن است گاهی اشتباه کند."],
      ["داده‌ها از کجاست و چقدر تازه است؟", `از آگهی‌های عمومی سایت‌های آگهی در ${fa(CITIES.length)} شهر از استان‌های ${PROVINCES.map((p) => p.name).join("، ")} که به‌تدریج و شبانه‌روزی خوانده می‌شوند؛ استان‌های دیگر هم یکی‌یکی اضافه می‌شوند. ${name} مستقل است و وابسته به هیچ سایت آگهی نیست.${cfg.updated ? " آخرین به‌روزرسانی: " + UI.ago(cfg.updated) + "." : ""}`],
      ["چطور ملک ارزان یا زیر قیمت بازار پیدا کنم؟", `ملک ارزان یعنی ارزان‌تر از ملک‌های مشابه همان محله، نه فقط قیمت کل پایین. شهر را انتخاب کنید، «فقط فرصت‌ها» را بزنید و بر اساس «بهترین فرصت» یا «بیشترین کاهش قیمت» مرتب کنید؛ آگهی‌های بیش از حد ارزان «مشکوک» علامت می‌خورند. <a href="/rahnama/melk-arzan">راهنمای پیدا کردن ملک زیر قیمت بازار</a>`],
      ["آیا این قیمت کارشناسی است؟", `نه. قیمت‌های آگهی‌ها قیمت پیشنهادی فروشنده‌اند، نه قیمت معامله‌شده؛ «فرصت» یعنی ارزان‌تر از آگهی‌های مشابه همان محله. ${name} مشاور املاک نیست و خانه‌ها را ندیده است؛ پیش از هر معامله ملک را ببینید و سند، پایان‌کار و بدهی را استعلام کنید.`],
      ["اشتراک چه چیزی را باز می‌کند و چطور پرداخت کنم؟", `بدون اشتراک ${fa(cfg.free_results || 10)} نتیجهٔ اول هر جست‌وجو را می‌بینید. اشتراک همهٔ نتیجه‌ها، آگهی‌های مشکوک با دلیل و پیوند مستقیم آگهی اصلی را باز می‌کند. ورود با کد پیامکی است، اشتراک بلافاصله پس از پرداخت فعال می‌شود و تمدید خودکار ندارد.`],
    ];
  }
  function faqHTML(n) {
    return `<div class="faq">${faqItems().slice(0, n || 99).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join("")}</div>`;
  }
  function faqPage() {
    view().innerHTML = `<section class="section--tight"><div class="wrap method"><span class="kicker">راهنما</span><h1>پرسش‌ها و پاسخ‌ها</h1>${faqHTML()}
      ${cfg.owner?.support_url ? `<p style="margin-top:20px">پاسخ پرسشت را پیدا نکردی؟ <a href="${esc(cfg.owner.support_url)}" rel="noopener">${esc(cfg.owner.support_label || "پشتیبانی")}</a></p>` : ""}</div></section>`;
  }

  /* ---------- راهنماها و مقاله‌ها (متن از سرور) ---------- */
  async function contentPage(path) {
    const pre = view().querySelector(".seo-page");
    if (!pre) view().innerHTML = `<section class="section--tight"><div class="wrap"><div class="skeleton" style="height:300px"></div></div></section>`;
    try {
      const r = await (await fetch("api/page?path=" + encodeURIComponent(path))).json();
      if (r.error) throw new Error(r.error);
      view().innerHTML = `<article class="wrap seo-page">${r.body}</article>`;
      document.title = r.title;
    } catch {
      view().innerHTML = `<div class="wrap empty"><h3>این صفحه پیدا نشد</h3><a class="btn btn--ink" href="/">صفحهٔ اصلی</a></div>`;
    }
  }

  /* ---------- پشتیبانی ---------- */
  const readFile = (f) => new Promise((ok, no) => { if (!f) return ok(null); if (f.size > 5e6) return no(new Error("حجم فایل زیاد است: حداکثر ۵ مگابایت")); const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(f); });
  async function supportPage(params) {
    if (DataLayer.server) await DataLayer.refreshMe().catch(() => {});
    const me = DataLayer.me;
    const CATS = [["payment", "پرداخت و اشتراک"], ["sms", "پیامک و کد ورود"], ["listing", "آگهی‌ها و قیمت‌ها"], ["other", "سایر"]];
    view().innerHTML = `<section class="section--tight"><div class="wrap support">
      <div class="sec-head"><div><span class="kicker">پشتیبانی</span><h1>درخواست پشتیبانی</h1><p>مشکل پرداخت، نرسیدن پیامک یا هر پرسش دیگری را بنویسید. برای پرداخت کارت‌به‌کارت، عکس رسید را پیوست کنید تا با مبلغ یکتای شما تطبیق داده شود.</p></div></div>
      <div class="support__grid">
        <form class="panel-card form-grid" id="tkForm">
          <h2>تیکت تازه</h2>
          <label class="field"><span>موضوع</span><select class="select" id="tkCat">${CATS.map(([k, n]) => `<option value="${k}" ${params.cat === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          ${me ? `<p class="small muted">با شمارهٔ <bdi dir="ltr">${esc(me.phone)}</bdi> ثبت می‌شود.</p>` : `<label class="field"><span>شمارهٔ موبایل (برای پیگیری)</span><input class="input input--ltr" id="tkPhone" inputmode="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹" autocomplete="tel"></label><p class="small muted">وارد نشده‌اید؛ پاسخ‌ها در همین مرورگر نمایش داده می‌شوند.</p>`}
          <label class="field"><span>پیام</span><textarea class="input" id="tkBody" rows="5" maxlength="3000" placeholder="مشکل را با جزئیات بنویسید؛ مثلاً زمان و مبلغ واریز"></textarea></label>
          <label class="field"><span>پیوست تصویر یا PDF (اختیاری، تا ۵ مگابایت)</span><input class="input" type="file" id="tkFile" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
          <button class="btn btn--hot btn--lg" id="tkBtn">ارسال تیکت</button>
        </form>
        <div><h2 style="margin-bottom:12px">تیکت‌های من</h2><div id="tkList"><div class="skeleton" style="height:120px"></div></div></div>
      </div></div></section>`;
    const draw = async () => {
      const r = await DataLayer.tickets().catch(() => ({ items: [] }));
      if (!$("#tkList")) return;
      $("#tkList").innerHTML = r.items.length ? r.items.map((t) => `<details class="ticket ${t.user_unread ? "is-new" : ""}" data-t="${t.id}" ${t.user_unread ? "open" : ""}>
          <summary><b>#${fa(t.id)}، ${esc(t.category_name)}</b><span class="tk-st tk-st--${t.status}">${esc(t.status_name)}</span><small>${UI.ago(t.updated)}</small></summary>
          <div class="ticket__msgs">${t.messages.map((m) => `<div class="tmsg tmsg--${m.sender}"><small>${m.sender === "user" ? "شما" : m.sender === "auto" ? "پاسخ خودکار" : "پشتیبانی"}، ${UI.ago(m.created)}</small><p>${esc(m.body || "")}</p>${m.has_image ? `<button type="button" class="btn btn--line btn--sm" data-img="${m.id}">نمایش پیوست</button>` : ""}</div>`).join("")}</div>
          ${t.status !== "closed" ? `<form class="ticket__reply" data-r="${t.id}"><textarea class="input" rows="2" maxlength="3000" placeholder="پاسخ یا توضیح بیشتر"></textarea><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><button class="btn btn--ink btn--sm">ارسال</button></form>` : `<p class="small muted">این تیکت بسته شده است؛ برای مشکل تازه، تیکت تازه ثبت کنید.</p>`}
        </details>`).join("") : `<div class="empty"><p>هنوز تیکتی ثبت نکرده‌اید.</p></div>`;
      r.items.filter((t) => t.user_unread).forEach((t) => DataLayer.seenTicket(t.id));
    };
    $("#tkList").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-img]"); if (!b) return;
      try { window.open(await DataLayer.ticketImage(b.dataset.img), "_blank"); } catch (err) { toast(err.message); }
    });
    $("#tkList").addEventListener("submit", async (e) => {
      const f = e.target.closest("[data-r]"); if (!f) return;
      e.preventDefault();
      try { await DataLayer.replyTicket(f.dataset.r, f.querySelector("textarea").value, await readFile(f.querySelector("input[type=file]").files[0])); toast("ارسال شد"); draw(); } catch (err) { toast(err.message); }
    });
    $("#tkForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#tkBtn"); btn.disabled = true;
      try {
        await DataLayer.createTicket({ category: $("#tkCat").value, phone: $("#tkPhone")?.value, body: $("#tkBody").value, image: await readFile($("#tkFile").files[0]) });
        $("#tkBody").value = ""; $("#tkFile").value = "";
        toast("تیکت ثبت شد"); await DataLayer.refreshMe().catch(() => {}); updateAccount(); draw();
      } catch (err) { toast(err.message); }
      btn.disabled = false;
    });
    draw();
  }

  /* ---------- ورود، ثبت‌نام و بازیابی رمز ----------
     نام کاربری = شمارهٔ موبایل؛ رمز دست‌کم ۷ نویسه و ترکیب حرف و عدد.
     تأیید شماره با کد بله (یا پیامک وقتی فعال شود) در یک گام جدا انجام می‌شود. */
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
    const chs = cfg.login_channels || [{ id: "sms", ready: true }];
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
          try { done(await DataLayer.login(id, $("#liPw").value)); } catch (err) { $("#liErr").textContent = err.message; }
          b.disabled = false;
        });
        setTimeout(() => $("#liPhone")?.focus(), 30);
      } else if (t === "register" || t === "reset") {
        const reg = t === "register";
        sub(reg ? `شماره موبایل نام کاربری شماست${cfg.trial_days ? `؛ ${fa(cfg.trial_days)} روز استفادهٔ رایگان` : ""}` : "کد بازیابی با بله یا پیامک می‌آید");
        body.innerHTML = `<form class="auth__form" id="pwForm" novalidate>${reg ? "" : `<a href="#" class="auth__back" data-go="login">${icon("arrow")} بازگشت به ورود</a>`}
          ${phoneField("fPhone")}${pwField("fPw", reg ? "رمز عبور" : "رمز تازه", "new-password")}${pwField("fPw2", "تکرار رمز", "new-password")}${rulesRow()}
          <p class="auth__err" id="fErr" role="alert"></p>
          <button class="btn btn--hot auth__go" id="fBtn">${reg ? "ثبت‌نام" : "دریافت کد بازیابی"}</button>
          ${reg ? `<div class="auth__links"><span class="muted">حساب دارید؟</span><a href="#" data-go="login">وارد شوید</a></div>`
            : cfg.email_ready ? `<div class="auth__links"><span class="muted">ایمیل ثبت کرده‌اید؟ به‌جای شماره ایمیل را بنویسید تا لینک بیاید.</span></div>` : ""}</form>`;
        bindEyes(body); links(body);
        const ok = bindRules(body, "#fPw", "#fPw2");
        if (!reg && cfg.email_ready) $("#fPhone").setAttribute("type", "text");
        $("#pwForm").addEventListener("submit", async (e) => {
          e.preventDefault();
          const raw = $("#fPhone").value.trim(), phone = normPhone(raw), err = $("#fErr");
          if (!reg && cfg.email_ready && raw.includes("@")) {   // بازیابی با لینک ایمیلی (پاسخ یکسان برای ایمیل ثبت‌شده و نشده)
            try { await DataLayer.resetRequest(raw, "email"); $("#dlg").close(); toast("اگر این ایمیل در سایت ثبت شده باشد، لینک تعیین رمز تازه برایش ارسال شد"); } catch (x) { err.textContent = x.message; }
            return;
          }
          if (!phone) { err.textContent = "شمارهٔ موبایل را درست وارد کنید (مثل 09123456789)"; $("#fPhone").focus(); return; }
          if (!ok()) { err.textContent = "رمز باید دست‌کم ۷ نویسه، شامل حرف و عدد و با تکرارش یکسان باشد"; return; }
          err.textContent = "";
          const pw = $("#fPw").value;
          codeStep({
            phone, title: reg ? "تأیید شماره و ساخت حساب" : "بازیابی رمز", back: t,
            send: (ch) => (reg ? DataLayer.requestOtp(phone, ch) : DataLayer.resetRequest(phone, ch)),
            verify: async (code) => { const u = reg ? await DataLayer.register({ phone, password: pw, code }) : await DataLayer.resetCode(phone, code, pw);
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
          codeStep({ phone, title: "ورود با رمز یک‌بارمصرف", back: "otp", send: (ch) => DataLayer.requestOtp(phone, ch), verify: async (code) => done(await DataLayer.verifyOtp(phone, code)) });
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
      try { await DataLayer.resetToken(params.token, $("#rpPw").value); updateAccount(); toast("رمز تازه ثبت شد و وارد شدید"); go("#/account"); }
      catch (err) { $("#rpErr").textContent = err.message; }
    });
  }

  /* ---------- حساب کاربری ---------- */
  async function accountPage(params) {
    if (DataLayer.server) await DataLayer.refreshMe().catch(() => {});
    updateAccount();
    const me = DataLayer.me;
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      ${params.pending ? `<div class="note-ok" id="payPending" aria-live="polite">واریز شما در حال تطبیق خودکار است؛ معمولاً چند ثانیه تا چند دقیقه طول می‌کشد و همین صفحه خودش به‌روز می‌شود. اگر هنوز کارت‌به‌کارت نکرده‌اید، به صفحهٔ پرداخت برگردید و <b>دقیقاً همان مبلغ یکتا</b> را واریز کنید.</div>` : ""}
      ${params.paid ? `<div class="note-ok">پرداخت موفق بود و اشتراک شما فعال شد.</div>` : params.failed ? `<div class="note-bad">پرداخت تکمیل نشد. اگر مبلغی کسر شده باشد، طبق قوانین درگاه ظرف ۷۲ ساعت بازمی‌گردد.</div>` : ""}
      <div class="sec-head"><div><span class="kicker">حساب من</span><h2>${me ? "اشتراک و حساب کاربری" : "ورود و اشتراک"}</h2></div></div>
      ${me ? `<div class="account">
          <div><span class="muted small">شماره موبایل</span><b dir="ltr">${esc(me.phone)}</b></div>
          <div><span class="muted small">وضعیت اشتراک</span><b class="${me.active ? "ok-text" : ""}">${me.active ? `${me.trial ? "دورهٔ رایگان" : "فعال"}، ${fa(me.days_left)} روز باقی‌مانده` : "بدون اشتراک فعال"}</b></div>
          ${me.active ? `<div><span class="muted small">پایان اشتراک</span><b>${new Date(me.sub_until * 1000).toLocaleDateString("fa-IR", { dateStyle: "long" })}</b></div>` : ""}
          ${me.active ? "" : `<button class="btn btn--hot" id="subBtn">فعال‌سازی اشتراک</button>`}
          <a class="btn btn--line" href="#/support">پشتیبانی و تیکت‌ها</a>
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
        </form>` : `<div class="empty"><h3>وارد حساب خود شوید</h3><p>با شمارهٔ موبایل و رمز وارد شوید، یا با همین شماره در چند ثانیه ثبت‌نام کنید.</p><button class="btn btn--hot btn--lg" id="loginBtn">ورود یا ثبت‌نام</button><p class="small muted" style="margin-top:12px">کد ورود نمی‌رسد؟ <a href="#/support?cat=sms">تیکت پشتیبانی بفرستید</a>.</p></div>`}
    </div></section>${plansSection()}`;
    $("#loginBtn")?.addEventListener("click", () => loginDialog());
    $("#subBtn")?.addEventListener("click", () => subscribeDialog());
    // کارت‌به‌کارت خودکار: تا تطبیق واریز، هر ۸ ثانیه (حداکثر ۴۵ دقیقه) وضعیت پرسیده می‌شود
    if (params.pending && me) {
      const pid = params.pending, t0 = Date.now();
      const poll = async () => {
        if (!$("#payPending")) return;
        try {
          const r = await DataLayer.payCheck(pid);
          if (r.status === "paid") { await DataLayer.refreshMe(); updateAccount(); go("#/invoice/" + pid); return; }
          if (r.status === "expired") { $("#payPending").className = "note-bad"; $("#payPending").textContent = "مهلت واریز تمام شد و پرداختی تطبیق نشد. اگر مبلغی واریز کرده‌اید، از «پشتیبانی» تیکت بفرستید."; return; }
          if (r.status === "needs_review") $("#payPending").textContent = "واریز شما رسید ولی مبلغ یا کارت با سفارش کاملاً نخواند و برای بررسی دستی ثبت شد؛ پس از تأیید، اشتراک خودکار فعال می‌شود.";
        } catch { /* */ }
        if (Date.now() - t0 < 45 * 60e3) setTimeout(poll, 8000);
      };
      setTimeout(poll, 1500);
    }
    $("#logoutBtn")?.addEventListener("click", async () => { await DataLayer.logout(); updateAccount(); route(); });
    $("#profForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      if (!f.new_password) { delete f.new_password; delete f.password; }
      if (!me.has_password && !f.new_password) { UI.toast("یک رمز عبور برای حساب بگذارید"); return; }
      const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      try { await DataLayer.saveProfile(f); UI.toast("مشخصات ذخیره شد"); updateAccount(); accountPage({}); }
      catch (err) { UI.toast(err.message || "ذخیره نشد"); btn.disabled = false; }
    });
    bindPlans();
  }

  /* ---------- ابزارها ---------- */
  function toolsPage() {
    view().innerHTML = `<section class="section"><div class="wrap">
      <div class="sec-head"><div><span class="kicker">ارزیابی یک ملک</span><h1>پیش از تصمیم، حساب کن</h1><p>ارزش تقریبی ملک را در محلهٔ خودش ببینید، قسط وام را حساب کنید و رهن و اجاره را به هم تبدیل کنید. برای ارزیابی دقیق یک آگهی مشخص، آن را در فرصت‌ها پیدا کنید و شناسنامهٔ قیمتش را ببینید.</p></div></div>
      <div class="tools">${toolsHTML()}</div></div></section>`;
    bindTools();
  }
  /* نمونهٔ تحلیل ارزش: بهترین فرصت واقعی همین حالا، با حکم پنج‌سطحی و امتیاز */
  async function drawSample() {
    const r = await DataLayer.search({ sort: "score", opp: 1, limit: 1 }).catch(() => ({ items: [] }));
    const box = $("#sample");
    if (!box) return;
    const l = r.items[0];
    if (!l) { box.innerHTML = `<div class="analysis__empty">با جمع شدن آگهی کافی، نمونهٔ تحلیل یک فرصت واقعی این‌جا نمایش داده می‌شود.</div>`; return; }
    const v = l.verdict || {}, ask = l.deal === "daily" ? l.price : l.pp;
    const fair = !v.approx && v.fair ? v.fair : null;
    const sc = Math.max(0, Math.min(100, Math.round(l.score || 0)));
    const a = Math.PI * (1 - sc / 100), nx = 100 + 78 * Math.cos(a), ny = 100 - 78 * Math.sin(a);
    box.innerHTML = `<div class="analysis__head"><span class="kicker">نمونهٔ تحلیل، از دادهٔ همین امروز</span><b>${esc(UI.tt(l.title))}</b><small>${esc([l.city_name || UI.cityOf(l.city_key)?.name, l.district].filter(Boolean).join("، "))}</small></div>
      <div class="analysis__rows">
        <div><span>قیمت پیشنهادی</span><b>${ask ? money(ask) + " تومان" : "—"}</b></div>
        <div><span>ارزش تخمینی بازار</span><b>${fair ? money(fair) + " تومان" : `<em class="blur">۰۰ میلیارد</em> <small>با اشتراک</small>`}</b></div>
        <div><span>نتیجه</span><b>${UI.labelPill(v)} <small class="analysis__gap">${UI.gapText(v)}</small></b></div>
      </div>
      <div class="analysis__score"><svg viewBox="0 0 200 116" aria-hidden="true"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#bf3a2b"/><stop offset=".35" stop-color="#c97a1f"/><stop offset=".55" stop-color="#b9b29a"/><stop offset=".8" stop-color="#3ccf8e"/><stop offset="1" stop-color="#d4b46a"/></linearGradient></defs>
        <path d="M22 100a78 78 0 01156 0" fill="none" stroke="url(#gg)" stroke-width="12" stroke-linecap="round"/><line x1="100" y1="100" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="currentColor"/></svg>
        <div><b>${fa(sc)}</b><span>امتیاز فرصت از ۱۰۰</span></div></div>
      <a class="btn btn--line btn--block" href="#/ad/${encodeURIComponent(l.id)}">دیدن شناسنامهٔ کامل قیمت ${icon("arrow")}</a>`;
  }
  function toolsHTML() {
    return `
      <div class="tool tool--wide"><h3>تخمین ارزش ملک در محلهٔ خودش</h3><p>میانه و بازهٔ معمول قیمت هر متر آگهی‌های فروش همان محله، به نرخ امروز</p>
        <div class="row3"><div class="field"><span>استان</span><div id="vProv"></div></div>
        <div class="field"><span>شهر</span><div id="vCity"></div></div>
        <div class="field"><span>محله</span><div id="vDist"></div></div></div>
        <div class="row3"><label class="field"><span>نوع</span><select class="select" id="vKind">${PROPERTY_TYPES.map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
        <label class="field"><span>متراژ (متر مربع)</span><input class="input" id="vArea" inputmode="numeric" value="100"></label>
        <label class="field"><span>سال ساخت</span><input class="input" id="vYear" inputmode="numeric" placeholder="مثلاً ۱۳۹۸"></label></div>
        <div class="row4" id="vExtra"><label class="field"><span>طبقه</span><input class="input" id="vFloor" inputmode="numeric" placeholder="مثلاً ۳"></label>
        <label class="field"><span>آسانسور</span><select class="select" id="vElev"><option value="">نامشخص</option><option value="1">دارد</option><option value="0">ندارد</option></select></label>
        <label class="field"><span>پارکینگ</span><select class="select" id="vPark"><option value="">نامشخص</option><option value="1">دارد</option><option value="0">ندارد</option></select></label>
        <label class="field"><span>انباری</span><select class="select" id="vWare"><option value="">نامشخص</option><option value="1">دارد</option><option value="0">ندارد</option></select></label></div>
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
    const KG = (k) => ({ garden: "land", suite: "apartment", shop: "commercial", office: "commercial" }[k] || k);
    const V = { prov: "gilan", city: "rasht", dist: "" };
    const provBox = UI.combo($("#vProv"), { items: PROVINCES.map((p) => ({ id: p.id, label: p.name })), value: V.prov, placeholder: "نام استان را بنویس",
      onChange: async ({ id }) => { V.prov = id; V.city = ""; V.dist = ""; cityBox.setItems(cities(), null); distBox.setItems([], null); val(); setTimeout(() => cityBox.focus(), 0); } });
    const cities = () => CITIES.filter((c) => c.province === V.prov).map((c) => ({ id: c.id, label: c.name }));
    const cityBox = UI.combo($("#vCity"), { items: cities(), value: V.city, placeholder: "نام شهر را بنویس",
      onChange: async ({ id }) => { V.city = id; V.dist = ""; await fillDists(); val(); setTimeout(() => distBox.focus(), 0); } });
    const distBox = UI.combo($("#vDist"), { items: [], value: null, placeholder: "اول شهر را انتخاب کن",
      onChange: ({ id }) => { V.dist = id; val(); } });
    let distReq = 0;
    const fillDists = async () => {
      const id = ++distReq;
      if (!V.city) { distBox.setItems([], null); return; }
      const r = await DataLayer.districts(V.city, "sale").catch(() => ({ items: [] }));
      if (id !== distReq) return;
      distBox.setItems(r.items.map((x) => ({ id: x.name, label: x.name, hint: fa(x.n) + " آگهی" })), null);
      $("#vDist input").placeholder = r.items.length ? "نام محله را بنویس" : "برای این شهر هنوز آگهی فروش با محلهٔ مشخص نیست";
    };
    let mrows = { city: null, rows: [] }, estReq = 0;
    const val = async () => {
      const city = V.city, dist = V.dist, kg = KG($("#vKind").value), area = num($("#vArea").value), year = num($("#vYear").value);
      if (!city) { $("#vOut").innerHTML = "<span>شهر را انتخاب کن.</span>"; return; }
      if (mrows.city !== city) mrows = { city, rows: (await DataLayer.market(city).catch(() => ({ rows: [] }))).rows || [] };
      if (!$("#vOut")) return;
      const cname = UI.cityOf(city)?.name || "";
      if (!dist) { $("#vOut").innerHTML = `<span>محله را انتخاب کن؛ تخمین فقط با آگهی‌های همان محله ساخته می‌شود، نه با میانگین ${esc(cname)}.</span>`; return; }
      const norm = (x) => (x || "").replace(/[\s\u200c]/g, "");
      const row = mrows.rows.find((r) => r.deal === "sale" && r.kind === kg && norm(r.district) === norm(dist));
      if (!row || row.n < 5) { $("#vOut").innerHTML = `<span>در ${esc(dist)} هنوز ${row ? "فقط " + fa(row.n) + " آگهی معتبر" : "آگهی معتبری"} از این نوع هست؛ برای تخمین قابل اتکا دست‌کم ۵ آگهی هم‌محله لازم است.</span>`; return; }
      if (!area) { $("#vOut").innerHTML = "<span>متراژ را وارد کن.</span>"; return; }
      // روی سرور: همان مدل ارزش‌گذاری سایت (قیمت پایهٔ محله × اثر سن بنا، طبقه، آسانسور، پارکینگ، انباری و …)
      if (DataLayer.server) {
        const id = ++estReq;
        try {
          const apt = !$("#vExtra").hidden;
          const qs = new URLSearchParams({ city, district: dist, kind: $("#vKind").value, area, year: year || "", floor: apt && $("#vFloor").value.trim() ? num($("#vFloor").value) : "", elevator: apt ? $("#vElev").value : "", parking: apt ? $("#vPark").value : "", warehouse: apt ? $("#vWare").value : "" });
          const r = await (await fetch("api/estimate?" + qs)).json();
          if (id !== estReq || !$("#vOut")) return;
          if (r.error) throw new Error(r.error);
          const lo = row.p25 / row.median, hi = row.p75 / row.median;
          $("#vOut").innerHTML = `<b>حدود ${money(r.total)} تومان</b><span>متری ${money(r.ppm)}؛ بازهٔ معمول ${money(r.total * lo)} تا ${money(r.total * hi)}. قیمت پایهٔ ${esc(dist)} برای خانهٔ میانگین: متری ${money(r.base_ppm)} از ${fa(r.n)} آگهی معتبر.</span>
            ${r.effects.length ? `<ul class="est-fx">${r.effects.map(([lab, p]) => `<li><span>${esc(lab)}</span><b class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "+" : "−"}${fa(Math.abs(Math.round(p * 1000) / 10))}٪</b></li>`).join("")}</ul>` : ""}
            <span class="small muted">${r.method === "model" ? `اثر هر ویژگی از مدل آماری آگهی‌های همین منطقه برآورد شده (${fa(r.model.n)} آگهی).` : "برای این شهر هنوز دادهٔ کافی برای مدل آماری نیست؛ اثر ویژگی‌ها با ضریب‌های تقریبی عرف بازار حساب شده."} قیمت آگهی‌ها پیشنهادی است، نه معامله‌شده.</span>`;
          return;
        } catch (err) { if (id !== estReq) return; /* داده نیست: روش ساده */ }
      }
      $("#vOut").innerHTML = `<b>حدود ${money(row.median * area)} تومان</b><span>بازهٔ معمول ${money(row.p25 * area)} تا ${money(row.p75 * area)}، میانهٔ هر متر در ${esc(dist)} ${money(row.median)} از ${fa(row.n)} آگهی معتبر، به نرخ امروز${DataLayer.samples ? " (داده نمونه)" : ""}</span>${year ? `<span class="small">سن بنا در این بازه لحاظ نشده؛ برای اثر دقیق سال ساخت، آگهی‌های همین محله را در <a href="#/market?city=${city}">صفحهٔ بازار</a> ببین.</span>` : ""}`;
    };
    fillDists().then(val);
    const loan = () => {
      const P = num($("#lAmt").value), r = num($("#lRate").value) / 1200, n = num($("#lYears").value) * 12;
      if (!P || !n) { $("#lOut").innerHTML = ""; return; }
      const pay = r ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
      $("#lOut").innerHTML = `<b>${fa(Math.round(pay))} تومان</b><span>قسط ماهانه، کل بازپرداخت ${money(pay * n)}، سود ${money(pay * n - P)}</span>`;
    };
    const conv = () => {
      const d = num($("#cDep").value), rent = num($("#cRent").value), r = num($("#cRate").value) / 100;
      if (!r) { $("#cOut").innerHTML = ""; return; }
      $("#cOut").innerHTML = `<b>${money(d + rent / r)} رهن کامل</b><span>یا اجاره کامل بدون ودیعه: ${money(rent + d * r)} تومان در ماه</span>`;
    };
    // طبقه، آسانسور، پارکینگ و انباری فقط برای آپارتمان
    const extra = () => { $("#vExtra").hidden = !["apartment", "suite", "office"].includes($("#vKind").value); };
    $("#vKind").addEventListener("input", extra); $("#vKind").addEventListener("change", extra); extra();
    ["#vKind", "#vArea", "#vYear", "#vFloor", "#vElev", "#vPark", "#vWare"].forEach((s) => { $(s).addEventListener("input", val); $(s).addEventListener("change", val); });
    ["#lAmt", "#lRate", "#lYears"].forEach((s) => $(s).addEventListener("input", loan));
    ["#cDep", "#cRent", "#cRate"].forEach((s) => $(s).addEventListener("input", conv));
    ["#lAmt", "#cDep", "#cRent"].forEach((s) => $(s).addEventListener("blur", (e) => { const v = num(e.target.value); e.target.value = v ? v.toLocaleString("en-US") : ""; }));
    loan(); conv();
  }

  /* ---------- صفحه جست‌وجو ---------- */
  const searchPage = (() => {
    let F = {}, page = 0, viewMode = store.get("view", "split"), lastPoints = [], reqId = 0, multiPick = false;
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
        <section class="live-wide" id="liveWide" hidden><div class="wrap">
          <aside class="sky sky--wide" id="sky" aria-label="نقشهٔ زندهٔ فرصت‌ها">
            <div class="sky__head"><span class="sky__live"><i></i>زنده</span><b id="skyTitle">نقشهٔ زندهٔ فرصت‌ها</b>
              <small id="skySub">عکس هر فرصت روی محله‌اش آمده و ستون‌ها میانهٔ قیمت هر متر محله‌اند؛ ستون سبز یعنی محله فرصت دارد. با چرخ موس بزرگ‌نمایی کنید و با دکمه‌های بالای نقشه بین شهرها جابه‌جا شوید.</small></div>
            <div class="sky__cities" id="skyCities"></div>
            <div class="sky__stage" id="skyStage"><svg id="skySvg" viewBox="-300 -230 600 420" role="img" aria-label="برج‌های قیمت محله‌ها"></svg></div>
            <div class="sky__tip" id="skyTip" hidden></div>
          </aside>
        </div></section>
        <div class="wrap"><div id="focusBox"></div>
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
        if (v !== undefined) set({ [k]: String(F[k]).split(",").filter((x) => x !== v).join(",") });
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
      const cities = (F.city || "").split(",").filter(Boolean);
      const provs = (F.province || "").split(",").filter(Boolean);
      let where = "در همهٔ شهرها";
      if (F.dq) {
        where = `در «${F.dq}»${cities.length ? "، " + cities.map((c) => UI.cityOf(c)?.name || c).join(" و ") : ""}`;
      } else if (F.district) {
        where = `در ${F.district.split(",").join("، ")}`;
      } else if (cities.length) {
        where = cities.length === 1 ? `در ${UI.cityOf(cities[0])?.name || cities[0]}` : `در ${cities.map((c) => UI.cityOf(c)?.name || c).join(" و ")}`;
      } else if (provs.length) {
        where = provs.length === 1 ? `در استان ${UI.provOf(provs[0])?.name || provs[0]}` : `در استان‌های ${provs.map((p) => UI.provOf(p)?.name || p).join(" و ")}`;
      }
      const kinds = (F.kinds || "").split(",").filter(Boolean).map(UI.kindName).join(" و ") || "ملک";
      if (String(F.presale) === "1") return `${F.ranked || F.opp ? "فرصت‌های " : ""}پیش‌فروش ${kinds} ${where}`;
      return `${F.ranked || F.opp ? "فرصت‌های " : ""}${kinds}${F.deal ? " برای " + UI.dealName(F.deal) : ""} ${where}`;
    }

    async function loadDistricts() {
      districts = [];
      if (!F.city) return;
      const r = await DataLayer.districts(F.city, F.deal);
      districts = r.items.map((x) => ({ d: x.name, n: x.n, opp: x.opp, rural: x.rural }));
    }

    function dropdowns() {
      const priceSet = F.min || F.max;
      const priceLabel = priceSet ? [F.min && "از " + money(+F.min), F.max && "تا " + money(+F.max)].filter(Boolean).join(" ") : "قیمت";
      const kinds = (F.kinds || "").split(",").filter(Boolean);
      const am = (F.amenities || "").split(",").filter(Boolean);
      const dd = (id, label, on, body) => `<div class="dd" data-dd="${id}"><button type="button" class="${on ? "is-set" : ""}">${esc(label)}</button><div class="dd__panel">${body}<div class="dd__foot"><button type="button" class="btn btn--ghost btn--sm" data-clear="${id}">پاک کردن</button><button type="button" class="btn btn--ink btn--sm" data-apply="${id}">اعمال</button></div></div></div>`;
      const citiesSel = (F.city || "").split(",").filter(Boolean);
      const provsSel = (F.province || "").split(",").filter(Boolean);
      let cityLabel = "استان و شهر";
      if (citiesSel.length) {
        cityLabel = citiesSel.length === 1 ? (UI.cityOf(citiesSel[0])?.name || citiesSel[0]) : `${fa(citiesSel.length)} شهر`;
      } else if (provsSel.length) {
        cityLabel = provsSel.length === 1 ? ("استان " + (UI.provOf(provsSel[0])?.name || provsSel[0])) : `${fa(provsSel.length)} استان`;
      }

      const provChips = PROVINCES.map((p) => `<button type="button" class="chip ${provsSel.includes(p.id) ? "is-on" : ""}" data-toggle="province" data-val="${p.id}">${p.name}</button>`).join("");
      // با انتخاب استان، فقط شهرهای همان استان(ها) نمایش داده می‌شوند (به‌علاوهٔ شهرهای از قبل انتخاب‌شده)
      const cityChips = CITIES.filter((c) => !provsSel.length || provsSel.includes(c.province) || citiesSel.includes(c.id)).map((c) => `<button type="button" class="chip ${citiesSel.includes(c.id) ? "is-on" : ""}" data-toggle="city" data-val="${c.id}" data-prov="${c.province}">${c.name}</button>`).join("");

      let html = dd("city", cityLabel, citiesSel.length || provsSel.length, `
        <div class="dd__label">استان</div>
        <div class="dd__grid" style="margin-bottom:12px">${provChips}</div>
        <div class="dd__label">${provsSel.length ? `شهرهای ${provsSel.map((p) => UI.provOf(p)?.name || p).join(" و ")}` : "شهر"}</div>
        <input class="input" id="ddCityQ" placeholder="جست‌وجوی شهر..." style="margin-bottom:8px">
        <div class="dd__grid dd__grid--scroll" id="ddCityGrid" style="max-height:200px;overflow-y:auto">${cityChips}</div>
        <label class="dd__multi"><input type="checkbox" id="ddMulti" ${multiPick || citiesSel.length > 1 || provsSel.length > 1 ? "checked" : ""}> انتخاب همزمان چند شهر یا چند استان</label>
      `);
      const dsel = (F.district || "").split(",").filter(Boolean);
      const settle = F.settle || "";
      const shown = districts.filter((x) => !settle || (settle === "rural") === !!x.rural);
      html += dd("district", dsel.length ? (dsel.length > 2 ? fa(dsel.length) + " محله" : dsel.join("، ")) : "محله", dsel.length,
        F.city ? (districts.length ? `<div class="dd__label">محله‌های ${esc(UI.cityOf(F.city)?.name || "")}؛ چند محله هم می‌شود</div><input class="input" id="ddDistQ" placeholder="نام محله را بنویس؛ اگر در فهرست نبود، در متن آگهی‌ها جست‌وجو می‌شود">
          <button type="button" class="dq-btn" id="ddDq" hidden></button>
          <div class="dd__grid dd__grid--scroll" id="ddDists">${shown.map((x) => `<button type="button" class="chip ${dsel.includes(x.d) ? "is-on" : ""}" data-toggle="district" data-val="${esc(x.d)}">${esc(x.d)} <small>${fa(x.n)} آگهی${x.opp ? "، " + fa(x.opp) + " فرصت" : ""}</small></button>`).join("") || '<p class="small muted">محله‌ای با این نوع سکونتگاه نیست.</p>'}</div>`
          : `<input class="input" id="ddDistQ" placeholder="نام محله یا کلیدواژه را بنویس"><button type="button" class="dq-btn" id="ddDq" hidden></button><p class="small muted">برای این شهر هنوز آگهی با محلهٔ مشخص جمع نشده؛ نام محله در متن آگهی‌ها جست‌وجو می‌شود.</p>`)
          : `<p class="small muted">اول شهر را انتخاب کن تا فهرست محله‌هایش بیاید.</p>`);
      html += dd("settle", settle === "urban" ? "شهری" : settle === "rural" ? "روستایی" : "شهری / روستایی", settle,
        `<div class="dd__grid">${[["", "همه"], ["urban", "شهری"], ["rural", "روستایی و خارج از محدوده"]].map(([v, n]) => `<button type="button" class="chip ${settle === v ? "is-on" : ""}" data-pick="settle" data-val="${v}">${n}</button>`).join("")}</div><p class="small muted" style="margin-top:8px">از محله و متن آگهی تشخیص داده می‌شود: اشاره به روستا، دهستان یا خارج از محدودهٔ شهر.</p>`);
      const ps = String(F.presale ?? "");
      // پیش‌فروش گزینهٔ جداگانهٔ نوع معامله است (فروش + فقط پیش‌فروش) و با فرمول خودش سنجیده می‌شود
      const dealOn = (id) => (id === "presale" ? ps === "1" : id === "sale" ? F.deal === "sale" && ps !== "1" : (F.deal || "") === id);
      const dealOpts = [{ id: "", name: "همه" }, ...DEAL_TYPES.flatMap((d) => (d.id === "sale" ? [d, { id: "presale", name: "پیش‌فروش" }] : [d]))];
      html += dd("deal", ps === "1" ? "پیش‌فروش" : F.deal ? UI.dealName(F.deal) : "نوع معامله", F.deal || ps, `<div class="dd__grid">${dealOpts.map((d) => `<button type="button" class="chip ${dealOn(d.id) ? "is-on" : ""}" data-pick="deal" data-val="${d.id}">${d.name}</button>`).join("")}</div>
        <div class="dd__label" style="margin-top:12px">پیش‌فروش</div><div class="dd__grid">${[["", "همه"], ["1", "فقط پیش‌فروش"], ["0", "بدون پیش‌فروش"]].map(([v, n]) => `<button type="button" class="chip ${ps === v ? "is-on" : ""}" data-pick="presale" data-val="${v}">${n}</button>`).join("")}</div>
        <p class="small muted" style="margin-top:8px">پیش‌فروش با قیمت پیش‌فروش‌های دیگر و قیمت واحد نوساز آمادهٔ همان محله سنجیده می‌شود، با در نظر گرفتن زمان تا تحویل.</p>`);
      html += dd("kinds", kinds.length ? kinds.map(UI.kindName).join("، ") : "نوع ملک", kinds.length, `<div class="dd__grid">${PROPERTY_TYPES.map((t) => `<button type="button" class="chip ${kinds.includes(t.id) ? "is-on" : ""}" data-toggle="kinds" data-val="${t.id}">${t.name}</button>`).join("")}</div>`);
      const rent = F.deal === "rent";
      const presets = rent ? [[5e8, "تا ۵۰۰ میلیون"], [1e9, "تا ۱ میلیارد"], [2e9, "تا ۲ میلیارد"], [5e9, "تا ۵ میلیارد"]]
        : F.deal === "daily" ? [[2e6, "تا ۲ میلیون"], [4e6, "تا ۴ میلیون"], [8e6, "تا ۸ میلیون"]]
        : [[3e9, "تا ۳ میلیارد"], [5e9, "تا ۵ میلیارد"], [8e9, "تا ۸ میلیارد"], [12e9, "تا ۱۲ میلیارد"], [20e9, "تا ۲۰ میلیارد"]];
      const capKey = rent ? "depMax" : "max";
      html += dd("price", priceLabel === "قیمت" ? (rent ? "سقف ودیعه" : "سقف بودجه") : priceLabel, priceSet || F.depMax || F.rentMax,
        `<div class="dd__label">${rent ? "سقف ودیعه" : F.deal === "daily" ? "سقف اجارهٔ هر شب" : "سقف بودجه"}</div><div class="dd__grid">${presets.map(([v, n]) => `<button type="button" class="chip ${+F[capKey] === v ? "is-on" : ""}" data-pick="${capKey}" data-val="${v}">${n}</button>`).join("")}</div>
        ${rent ? `<div class="dd__label">سقف اجارهٔ ماهانه</div><div class="dd__grid">${[[1e7, "تا ۱۰ میلیون"], [2e7, "تا ۲۰ میلیون"], [4e7, "تا ۴۰ میلیون"]].map(([v, n]) => `<button type="button" class="chip ${+F.rentMax === v ? "is-on" : ""}" data-pick="rentMax" data-val="${v}">${n}</button>`).join("")}</div>` : ""}
        <div class="dd__label">${rent ? "یا رهن کامل (ودیعه + اجاره ÷ ۳٪)" : "یا بازهٔ دلخواه"}، تومان</div><div class="range"><input class="input" id="ddMin" placeholder="از" value="${F.min ? money(+F.min) : ""}"><input class="input" id="ddMax" placeholder="تا" value="${F.max && !presets.some(([v]) => v === +F.max) ? money(+F.max) : ""}"></div><p class="small muted" style="margin-top:8px">عدد یا عبارت بنویسید: «۲ میلیارد»، «۸۰۰ میلیون».</p>`);
      const roomsSel = String(F.rooms ?? "").split(",").filter((x) => x !== "");
      html += dd("rooms", roomsSel.length ? roomsSel.map((r) => (r === "0" ? "استودیو" : fa(r) + (r === "4" ? "+" : ""))).join("، ") + " خواب" : "خواب", roomsSel.length,
        `<div class="dd__grid">${[["0", "استودیو"], ["1", "۱"], ["2", "۲"], ["3", "۳"], ["4", "۴ و بیشتر"]].map(([v, n]) => `<button type="button" class="chip ${roomsSel.includes(v) ? "is-on" : ""}" data-toggle="rooms" data-val="${v}">${n}</button>`).join("")}</div><p class="small muted" style="margin-top:8px">چند گزینه را می‌شود با هم انتخاب کرد.</p>`);
      const ageLabel = F.ageMax ? (+F.ageMax <= 2 ? "نوساز" : "تا " + fa(F.ageMax) + " سال") : F.yearMin || F.yearMax ? "سال ساخت" : "سن بنا";
      html += dd("age", ageLabel, F.ageMax || F.yearMin || F.yearMax,
        `<div class="dd__grid">${[["2", "نوساز (تا ۲ سال)"], ["5", "تا ۵ سال"], ["10", "تا ۱۰ سال"], ["20", "تا ۲۰ سال"]].map(([v, n]) => `<button type="button" class="chip ${F.ageMax === v ? "is-on" : ""}" data-pick="ageMax" data-val="${v}">${n}</button>`).join("")}</div>
        <div class="dd__label">یا سال ساخت</div><div class="range"><input class="input" id="ddYMin" inputmode="numeric" placeholder="از سال" value="${F.yearMin ? faY(F.yearMin) : ""}"><input class="input" id="ddYMax" inputmode="numeric" placeholder="تا سال" value="${F.yearMax ? faY(F.yearMax) : ""}"></div><p class="small muted" style="margin-top:8px">سال شمسی، مثل ۱۳۹۵.</p>`);
      html += dd("fresh", F.fresh ? "درج در " + fa(F.fresh) + " روز اخیر" : "تازگی آگهی", F.fresh,
        `<div class="dd__grid">${[["", "همه"], ["1", "۲۴ ساعت اخیر"], ["7", "۷ روز اخیر"], ["30", "۳۰ روز اخیر"], ["60", "۶۰ روز اخیر"]].map(([v, n]) => `<button type="button" class="chip ${(F.fresh || "") === v ? "is-on" : ""}" data-pick="fresh" data-val="${v}">${n}</button>`).join("")}</div><p class="small muted" style="margin-top:8px">بر پایهٔ زمان درج آگهی در سایت اصلی. آگهی‌های قدیمی‌تر از ${fa(cfg.thresholds?.max_age_days || 90)} روز در محاسبهٔ قیمت محله نمی‌آیند.</p>`);
      const moreOn = am.length || F.areaMin || F.areaMax;
      html += dd("more", "متراژ و امکانات", moreOn,
        `<div class="dd__label">متراژ (متر مربع)</div><div class="range"><input class="input" id="ddAMin" inputmode="numeric" placeholder="از" value="${F.areaMin || ""}"><input class="input" id="ddAMax" inputmode="numeric" placeholder="تا" value="${F.areaMax || ""}"></div>
        <div class="dd__label">امکانات</div><div class="dd__grid">${AMENITIES.map((a) => `<button type="button" class="chip ${am.includes(a.id) ? "is-on" : ""}" data-toggle="amenities" data-val="${a.id}">${a.name}</button>`).join("")}</div>`);
      html += `
        <div class="mode-switcher" role="group" aria-label="نمایش">
          <button type="button" class="chip ${F.opp ? "is-on" : ""}" id="oppChip" aria-pressed="${!!F.opp}">${icon("spark", 'width="14"')} فقط فرصت‌ها</button>
          <button type="button" class="chip ${!F.opp ? "is-on" : ""}" id="allAdsChip" aria-pressed="${!F.opp}">${icon("list", 'width="14"')} همه آگهی‌ها</button>
        </div>
        <button type="button" class="chip ${F.drop ? "is-on" : ""}" id="dropChip">کاهش قیمت</button><button type="button" class="chip chip--sus ${F.sus ? "is-on" : ""}" id="susChip" title="فقط برای مشترکان، همراه با دلیل مشکوک بودن">${icon("lock", 'width="14"')} آگهی‌های مشکوک</button>`;
      $("#dds").innerHTML = html;
      UI.hscroll($("#dds"));
      $("#ddMulti")?.addEventListener("change", (e) => { multiPick = e.target.checked; });
      $("#ddCityQ")?.addEventListener("input", (e) => {
        const q = NLP.toEn(e.target.value.trim().toLowerCase());
        $$("#ddCityGrid button").forEach((b) => {
          b.hidden = q && !b.textContent.toLowerCase().includes(q);
        });
      });
      $("#oppChip").addEventListener("click", () => set({ opp: 1, ranked: "" }));
      $("#allAdsChip")?.addEventListener("click", () => set({ opp: "", ranked: "" }));
      $("#dropChip").addEventListener("click", () => set({ drop: F.drop ? "" : 1 }));
      $("#susChip").addEventListener("click", () => {
        if (!active()) { toast("نمایش آگهی‌های مشکوک فقط برای مشترکان است"); return go("#/account"); }
        set({ sus: F.sus ? "" : 1 });
      });
      $$(".dd").forEach((d) => {
        d.firstElementChild.addEventListener("click", (e) => {
          e.stopPropagation();
          const open = d.classList.contains("is-open");
          $$(".dd.is-open").forEach((x) => x.classList.remove("is-open"));
          const sb = $(".sbar");  // نوار جمع‌شده باز می‌شود تا پنل فیلتر بریده نشود
          if (!open && sb && sb.classList.contains("is-compact")) { sb.classList.remove("is-compact"); sb.style.marginBottom = ""; }
          d.classList.toggle("is-open", !open);
        });
        const panel = d.querySelector(".dd__panel");
        const pending = {};
        panel.addEventListener("click", (e) => {
          e.stopPropagation();
          const t = e.target.closest("button"); if (!t) return;
          // پیش‌فرض: انتخاب یک شهر یا استان جای قبلی را می‌گیرد؛ با تیک «چند شهر» به فهرست اضافه می‌شود
          const multi = $("#ddMulti", panel)?.checked;
          if (t.dataset.toggle === "province") {
            const cur = (F.province || "").split(",").filter(Boolean);
            const next = multi ? (cur.includes(t.dataset.val) ? cur.filter((x) => x !== t.dataset.val) : [...cur, t.dataset.val])
              : (cur.length === 1 && cur[0] === t.dataset.val ? [] : [t.dataset.val]);
            set({ province: next.join(","), city: "", district: "" });
            return;
          }
          if (t.dataset.toggle === "city") {
            const cur = (F.city || "").split(",").filter(Boolean);
            const next = multi ? (cur.includes(t.dataset.val) ? cur.filter((x) => x !== t.dataset.val) : [...cur, t.dataset.val])
              : (cur.length === 1 && cur[0] === t.dataset.val ? [] : [t.dataset.val]);
            set({ city: next.join(","), province: "", district: "" });
            return;
          }
          if (t.dataset.prov) { set({ province: t.dataset.prov, city: "", district: "" }); return; }
          if (t.dataset.pick) {
            $$(`[data-pick="${t.dataset.pick}"]`, panel).forEach((x) => x.classList.toggle("is-on", x === t));
            pending[t.dataset.pick] = t.dataset.val;
            if (d.dataset.dd === "deal") set(t.dataset.pick === "presale" ? { presale: t.dataset.val, ...(t.dataset.val === "1" ? { deal: "sale" } : {}) }
              : t.dataset.val === "presale" ? { deal: "sale", presale: "1" } : { deal: t.dataset.val, presale: "" });
            if (d.dataset.dd === "settle") set({ settle: t.dataset.val, district: "" });
            if (d.dataset.dd === "fresh") set({ fresh: t.dataset.val });
            return;
          }
          if (t.dataset.toggle) { t.classList.toggle("is-on"); return; }
          if (t.dataset.clear) {
            set({ city: { city: "", province: "", district: "" }, deal: { deal: "", presale: "" }, kinds: { kinds: "" }, price: { min: "", max: "", depMax: "", rentMax: "" }, district: { district: "" }, settle: { settle: "" }, fresh: { fresh: "" }, rooms: { rooms: "" }, age: { ageMax: "", yearMin: "", yearMax: "" }, more: { areaMin: "", areaMax: "", amenities: "" } }[t.dataset.clear]);
            return;
          }
          if (t.dataset.apply) {
            const id = t.dataset.apply, p = { ...pending };
            const toggles = (k) => $$(`[data-toggle="${k}"].is-on`, panel).map((x) => x.dataset.val).join(",");
            if (id === "city") { d.classList.remove("is-open"); return; }
            if (id === "kinds") p.kinds = toggles("kinds");
            if (id === "price") {
              const mn = moneyIn($("#ddMin").value), mx = moneyIn($("#ddMax").value);
              p.min = mn;
              if (mx) { p.max = mx; if (rent) p.depMax = ""; }
            }
            if (id === "rooms") p.rooms = toggles("rooms");
            if (id === "district") p.district = toggles("district");
            if (id === "age") { const a = num($("#ddYMin").value), b = num($("#ddYMax").value); if (a || b) { p.yearMin = a || ""; p.yearMax = b || ""; p.ageMax = ""; } else if (p.ageMax) { p.yearMin = ""; p.yearMax = ""; } }
            if (id === "more") { p.areaMin = num($("#ddAMin").value) || ""; p.areaMax = num($("#ddAMax").value) || ""; p.amenities = toggles("amenities"); }
            set(p);
          }
        });
        panel.addEventListener("change", (e) => { if (e.target.id === "ddCity") panel.querySelector("[data-apply]").click(); });
        panel.addEventListener("input", (e) => {
          if (e.target.id !== "ddDistQ") return;
          const q = UI.fold(e.target.value), raw = e.target.value.trim();
          const dqb = panel.querySelector("#ddDq");
          if (dqb) { dqb.hidden = raw.length < 2; dqb.innerHTML = `${icon("search", 'width="15"')} جست‌وجوی «${esc(raw)}» در آگهی‌های ${esc(UI.cityOf(String(F.city).split(",")[0])?.name || "این شهر")}`; dqb.onclick = () => set({ district: "", dq: raw }); }
          const btns = $$("#ddDists [data-val]", panel);
          btns.forEach((b) => { b.hidden = q && !UI.fold(b.dataset.val).includes(q); });
          btns.filter((b) => q && UI.fold(b.dataset.val).startsWith(q)).reverse().forEach((b) => b.parentNode.prepend(b));
        });
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
      if (F.province) {
        String(F.province).split(",").filter(Boolean).forEach((p) => {
          t.push(["province:" + p, "استان " + (UI.provOf(p)?.name || p)]);
        });
      }
      if (F.city) {
        String(F.city).split(",").filter(Boolean).forEach((c) => {
          t.push(["city:" + c, (UI.cityOf(c)?.name || c)]);
        });
      }
      (F.district || "").split(",").filter(Boolean).forEach((d) => t.push(["district:" + d, d]));
      if (F.dq) t.push(["dq", "محله یا کلیدواژه: " + F.dq]);
      if (F.deal) t.push(["deal", UI.dealName(F.deal)]);
      (F.kinds || "").split(",").filter(Boolean).forEach((k) => t.push(["kinds:" + k, UI.kindName(k)]));
      if (F.min) t.push(["min", "از " + money(+F.min)]);
      if (F.max) t.push(["max", "تا " + money(+F.max)]);
      if (F.areaMin) t.push(["areaMin", "از " + fa(F.areaMin) + " متر"]);
      if (F.areaMax) t.push(["areaMax", "تا " + fa(F.areaMax) + " متر"]);
      String(F.rooms ?? "").split(",").filter((x) => x !== "").forEach((r) => t.push(["rooms:" + r, r === "0" ? "استودیو" : fa(r) + (r === "4" ? "+" : "") + " خواب"]));
      if (F.depMax) t.push(["depMax", "ودیعه تا " + money(+F.depMax)]);
      if (F.rentMax) t.push(["rentMax", "اجاره تا " + money(+F.rentMax)]);
      if (F.ageMax) t.push(["ageMax", +F.ageMax <= 2 ? "نوساز" : "تا " + fa(F.ageMax) + " سال ساخت"]);
      if (F.yearMin) t.push(["yearMin", "ساخت از " + faY(F.yearMin)]);
      if (F.yearMax) t.push(["yearMax", "ساخت تا " + faY(F.yearMax)]);
      if (F.fresh) t.push(["fresh", "درج در " + fa(F.fresh) + " روز اخیر"]);
      if (F.settle) t.push(["settle", F.settle === "rural" ? "روستایی" : "شهری"]);
      if (String(F.presale ?? "") !== "") t.push(["presale", F.presale === "1" ? "فقط پیش‌فروش" : "بدون پیش‌فروش"]);
      if (F.opp) t.push(["opp", "فقط فرصت‌ها"]);
      if (F.sus) t.push(["sus", "با آگهی‌های مشکوک"]);
      (F.amenities || "").split(",").filter(Boolean).forEach((a) => t.push(["amenities:" + a, AMENITIES.find((x) => x.id === a)?.name || a]));
      if (F.ranked) t.push(["ranked", "دارای امتیاز"]);
      if (F.drop) t.push(["drop", "کاهش قیمت"]);
      $("#atags").innerHTML = t.map(([k, v]) => `<button class="atag" data-rm="${esc(k)}">${esc(v)} ${icon("x", 'width="12" aria-hidden="true"')}</button>`).join("");
    }

    // کادر زندهٔ بالای صفحه: شهرهای فیلتر را نشان می‌دهد و داخل خودش هم می‌شود شهرها را عوض کرد
    function liveCities() {
      const host = $("#skyCities");
      if (!host) return;
      const cur = String(F.city || "").split(",").filter(Boolean);
      host.innerHTML = cur.map((c) => `<button type="button" class="atag" data-rmcity="${esc(c)}">${esc(UI.cityOf(c)?.name || c)} ${icon("x", 'width="12" aria-hidden="true"')}</button>`).join("") + `<div class="sky__add" id="skyAdd"></div>`;
      UI.combo($("#skyAdd"), { items: CITIES.filter((c) => !cur.includes(c.id)).map((c) => ({ id: c.id, label: c.name, hint: (PROVINCES.find((p) => p.id === c.province) || {}).name })), value: null, allLabel: "افزودن شهر", placeholder: cur.length ? "افزودن شهر دیگر…" : "انتخاب شهر…",
        onChange: ({ id }) => { if (id) set({ city: [...cur, id].join(","), province: "", district: "" }); } });
      host.onclick = (e) => { const b = e.target.closest("[data-rmcity]"); if (b) set({ city: cur.filter((x) => x !== b.dataset.rmcity).join(","), district: "" }); };
    }
    function liveSync(changed) {
      const sel = { cities: String(F.city || "").split(",").filter(Boolean), provs: String(F.province || "").split(",").filter(Boolean) };
      const wide = $("#liveWide");
      if (!wide) return;
      wide.hidden = !(sel.cities.length || sel.provs.length);
      liveCities();
      if (wide.hidden) return;
      const onCities = (ids) => set({ city: ids.join(","), province: "", district: "", dcity: "", focus: "", pick: "" });
      const onPick = (id) => set({ pick: id });
      const onDistricts = (names) => set({ district: names.join(","), dcity: "", focus: names.length ? 1 : "", pick: "", dq: "" });
      if (!live || live.mode !== "search" || !$("#skyGlobe")) initLive(DataLayer.stats, { mode: "search", sel, onCities, onPick, onDistricts, query: F });
      else { live.opts.query = F; if (changed) liveSelect(DataLayer.stats, sel); }
    }
    async function update(params) {
      const cityChanged = params.city !== F.city || params.deal !== F.deal || params.province !== F.province;
      F = { ...params };
      page = +F.page || 0; delete F.page;
      if (cityChanged) await loadDistricts();
      dropdowns(); activeTags(); applyView();
      liveSync(cityChanged);
      const sorts = [
        ["score", "بهترین فرصت"],
        ["cheap", "کمترین قیمت کل"],
        ["exp", "بالاترین قیمت کل"],
        ["ppm", "کمترین قیمت هر متر"],
        ["new", "تازه‌ترین زمان ثبت"],
        ["deal", "بیشترین فاصله تا میانگین محله"],
        ["area", "بیشترین متراژ"],
        ["area_asc", "کمترین متراژ"],
        ["age_asc", "نوسازترین (کمترین سن بنا)"],
        ["drop", "بیشترین کاهش قیمت"]
      ];
      $("#sort").innerHTML = sorts.map(([v, n]) => `<option value="${v}" ${(F.sort || "score") === v ? "selected" : ""}>${n}</option>`).join("");
      $("#grid").innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join("");
      const id = ++reqId;
      const { pick, focus, dcity, ...Q } = F;
      const [r, picked] = await Promise.all([DataLayer.search({ ...Q, limit: PER, offset: page * PER }), pick ? DataLayer.get(pick).catch(() => null) : null]);
      if (id !== reqId || !$("#grid")) return;
      focusBox(picked);
      if (picked) r.items = r.items.filter((l) => l.id !== picked.id);
      $("#sTitle").innerHTML = `${esc(titleOf())}<small>${fa(r.total)} آگهی</small>`;
      document.title = `${titleOf()} | ${cfg.site.name}`;
      $("#grid").innerHTML = r.items.length || r.locked_more ? r.items.map((l) => UI.card(l)).join("") + (r.locked_more ? UI.lockCard(r.locked_more) : "")
        : `<div class="empty" style="grid-column:1/-1">${icon("search")}<h3>آگهی‌ای با این مشخصات نیست</h3><p>چند فیلتر را بردارید یا از دستیار بخواهید گزینه نزدیک پیدا کند.</p><a class="btn btn--ink" href="#/s?sort=score">نمایش همه</a></div>`;
      if (!r.items.length && !r.locked_more) relaxHints(id);
      const pages = r.locked_more ? 1 : Math.ceil(r.total / PER);
      $("#pager").innerHTML = pages > 1 ? `${page > 0 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page - 1 })}">قبلی</a>` : ""}<span class="btn btn--ghost">صفحه ${fa(page + 1)} از ${fa(pages)}</span>${page < pages - 1 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page + 1 })}">بعدی</a>` : ""}` : "";
      lastPoints = r.points;
      drawMap(r.points, true);
      liveListings(r.items);
    }
    // بالای فهرست: آگهی انتخاب‌شده روی نقشه، یا محلهٔ انتخاب‌شده، و دکمهٔ فرصت‌های بیشتر
    function focusBox(picked) {
      const box = $("#focusBox"); if (!box) return;
      const cities = String(F.city || "").split(",").filter(Boolean).map((c) => UI.cityOf(c)?.name || c);
      const where = cities.length ? cities.join(" و ") : "همهٔ شهرها";
      const moreQ = { ...F, district: "", dcity: "", focus: "", pick: "", opp: 1 };
      let html = "";
      if (picked) {
        const v = picked.verdict || {}, specs = UI.specs(picked);
        html = `<section class="picked" id="pickedBox">
          <div class="picked__head"><span class="kicker">ملکی که روی نقشه انتخاب کردید</span><button type="button" class="btn btn--ghost btn--sm" data-unpick>${icon("x", 'width="14"')} بستن</button></div>
          <div class="picked__body">${UI.card(picked)}
            <div class="picked__side">
              <h2>${UI.tt(picked.title)}</h2>
              <p class="muted">${esc([UI.cityOf(picked.city_key)?.name, picked.district].filter(Boolean).join("، "))}</p>
              <div class="picked__price">${UI.priceHTML(picked)}</div>
              ${v.label ? `<p>${UI.dealPill(v)}</p>` : ""}
              ${picked.deal === "sale" && picked.ppm && v.delta != null && !v.approx ? UI.priceBar(picked.ppm, picked.ppm / (1 + v.delta), { label: v.label }) : ""}
              <div class="card__specs">${specs.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
              <div class="picked__act"><a class="btn btn--gold" href="#/ad/${encodeURIComponent(picked.id)}">شناسنامهٔ کامل قیمت ${icon("arrow")}</a>
                <a class="btn btn--line" href="#/s?${toQuery(moreQ)}">فرصت‌های بیشتر در ${esc(where)}</a></div>
            </div>
          </div>
          <h3 class="picked__more">آگهی‌های دیگر</h3>
        </section>`;
      } else if (F.focus && F.district) {
        html = `<div class="focusbar"><div><span class="kicker">محلهٔ انتخابی روی نقشه</span><b>${esc(String(F.district).split(",").join("، "))}${F.dcity ? "، " + esc(UI.cityOf(F.dcity)?.name || "") : ""}</b><small>آگهی‌های این محله به ترتیب امتیاز فرصت</small></div>
          <a class="btn btn--gold" href="#/s?${toQuery(moreQ)}">فرصت‌های بیشتر در ${esc(where)} ${icon("arrow")}</a></div>`;
      }
      box.innerHTML = html;
      const un = box.querySelector("[data-unpick]"); if (un) un.onclick = () => set({ pick: "" });
      if (picked) requestAnimationFrame(() => box.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    }
    async function relaxHints(id) {
      const names = { presale: "با و بدون پیش‌فروش", fresh: "هر زمان درج", settle: "شهری و روستایی", opp: "همهٔ آگهی‌ها، نه فقط فرصت‌ها", ageMax: "هر سن بنا", depMax: "بدون سقف ودیعه", rentMax: "بدون سقف اجاره", amenities: "بدون امکانات انتخابی", rooms: "هر تعداد خواب", areaMin: "هر متراژ", areaMax: "هر متراژ", kinds: "همه انواع ملک", max: "بدون سقف قیمت", min: "بدون کف قیمت", deal: "همه معامله‌ها", drop: "همه آگهی‌ها", ranked: "شامل آگهی‌های بی‌امتیاز", district: "همه محله‌ها", city: "کل استان" };
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
        const label = p.score != null ? `${fa(Math.round(p.score))}، ${UI.pinLabel(p)}` : UI.pinLabel(p);
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
    const v = l.verdict || {}, ex = l.explain || {}, ask = l.price;
    const score = l.score;   // امتیاز و برچسب هر دو از سرور می‌آیند و با هم هماهنگ‌اند
    const locked = l.locked;
    if (l.label === "sus") {
      return `<div class="vcard vcard--sus"><h3>${UI.labelPill({ label: "sus" })} امتیاز فرصت نمی‌گیرد</h3>
        <p><b>چرا مشکوک:</b> ${esc((l.excluded_reasons || ex.flags || []).join("، ") || "قیمت با محلهٔ خودش نمی‌خواند")}.</p>
        ${v ? `<p class="small">${UI.gapText(v)}؛ آگهی‌هایی که خیلی ارزان‌تر از محلهٔ خودشان‌اند معمولاً اشتباه تایپی، قیمت بیعانه، یا آگهی غیرواقعی‌اند.</p>` : ""}
        <p class="small muted">این آگهی در محاسبهٔ قیمت محله شرکت داده نشده است.</p></div>`;
    }
    if (l.excluded) {
      return `<div class="vcard vcard--warn"><h3>این آگهی کنار رفت</h3><ul class="check-list">${(l.excluded_reasons || []).map((r) => `<li>${esc(r)}</li>`).join("") || "<li>اطلاعات قیمت برای مقایسه کافی نیست</li>"}</ul><p class="small muted">این آگهی در محاسبهٔ قیمت محله هم شرکت داده نشده است.</p></div>`;
    }
    if (!v || !v.label) {
      return `<div class="vcard"><h3>${UI.labelPill({ label: "pending" })} هنوز سنجیده نشده</h3><p class="muted small">در این محله و شهر هنوز آگهی کافی برای مقایسه نیست. با دریافت آگهی‌های بیشتر، این آگهی خودکار سنجیده می‌شود.</p></div>`;
    }
    const askVal = l.deal === "daily" ? l.price : l.pp;
    const meM = l.deal === "daily" ? askVal : l.area ? askVal / l.area : null;
    // برای غیرمشترک فاصله فقط بازه‌ای است؛ قیمت مورد انتظار و مبلغ اختلاف از آن ساخته نمی‌شود
    const expM = meM && v.delta != null ? meM / (1 + v.delta) : (meM ? meM * 1.25 : null);
    const diff = askVal && v.delta != null && !v.approx ? askVal - askVal / (1 + v.delta) : null;
    return `<div class="vcard">
      <div class="vcard__top">
        ${score != null ? `<span class="score score--${score >= 85 ? "hi" : score >= 65 ? "mid" : "lo"} score--big"><b>${fa(Math.round(score))}</b><i>از ۱۰۰</i></span>` : ""}
        <div><h3>${UI.dealPill(v)}</h3><p class="small muted">${UI.confLine(v)}${v.rank ? `، رتبهٔ ${fa(v.rank)} از ${fa(v.rank_n)} فرصت این محله` : ""}</p></div>
      </div>
      ${claimNote(l, v)}
      ${expM ? UI.priceBar(meM, expM, { label: v.approx ? null : v.label, lo: ex.fair_low && !v.approx ? ex.fair_low / (l.deal === "daily" ? 1 : l.area || 1) : 0, hi: ex.fair_high && !v.approx ? ex.fair_high / (l.deal === "daily" ? 1 : l.area || 1) : 0 }) : ""}
      ${ex.fair_low && ex.fair_high && !v.approx ? `<p class="small">بازهٔ قیمت منصفانه برای همین خانه: <b>${money(ex.fair_low)}</b> تا <b>${money(ex.fair_high)}</b> تومان (با در نظر گرفتن پراکندگی قیمت‌های این محله).</p>` : ""}
      ${ex.disagree ? `<p class="small note-soft">${icon("info", 'width="16"')} فرصت اعلام نشد: مدل قیمت فاصلهٔ زیادی نشان می‌دهد، ولی نزدیک‌ترین آگهی‌های مشابه همین محله این فاصله را تأیید نمی‌کنند.</p>` : ""}
      ${v.wide ? `<p class="small note-soft">${icon("info", 'width="16"')} منصفانه با این فاصله: قیمت‌های این محله خیلی پراکنده‌اند و این فاصله هنوز در دامنهٔ عادی محله است.</p>` : ""}
      <p class="small">${v.approx ? "قیمت مورد انتظار، بازهٔ قیمت منصفانه و درصد دقیق برای مشترکان نمایش داده می‌شود." : diff != null && Math.abs(v.delta) > 0.005 ? `یعنی حدود <b>${money(Math.abs(diff))} تومان ${diff < 0 ? "کمتر" : "بیشتر"}</b> از قیمتی که برای همین خانه در همین محله انتظار می‌رود.` : "تقریباً همان قیمتی است که برای همین خانه در همین محله انتظار می‌رود."}</p>
      <p class="small muted">امتیاز ۰ تا ۱۰۰ رتبهٔ آگهی در محلهٔ خودش است؛ ۱۰۰ یعنی بهترین فرصت همین محله، نه اطمینان کامل.</p>
    </div>`;
  }
  /* ادعای آگهی‌دهنده («فرصت طلایی»، «زیر قیمت») در برابر سنجش سایت؛ عنوان نمایشی بدون این ادعاهاست */
  function claimNote(l, v) {
    const c = l.claims || [];
    if (!c.length) return "";
    const said = c.includes("opportunity") ? "«فرصت» یا «فرصت طلایی»" : c.includes("cheap") ? "«زیر قیمت» یا «ارزان»" : "با صفت‌هایی مثل «استثنایی» و «بی‌نظیر»";
    const ours = !v ? "هنوز سنجیده نشده است" : v.label === "gold" || v.label === "good" ? "در سنجش ما هم فرصت است" : v.label === "high" || v.label === "over" ? "در سنجش ما بالاتر از قیمت محله است" : v.label === "sus" ? "در سنجش ما قیمتش مشکوک است" : "در سنجش ما هم‌قیمت محله است، نه فرصت";
    return `<p class="small note-soft">${icon("info", 'width="16"')} آگهی‌دهنده این ملک را ${said} معرفی کرده؛ ${ours}. برچسب‌های ${esc(cfg.site.name)} فقط از مقایسه با آگهی‌های مشابه همان محله می‌آیند، نه از متن آگهی.${l.title_raw ? ` عنوان اصلی آگهی: «${UI.tt(l.title_raw)}»` : ""}</p>`;
  }
  /* نشانی تقریبی و راه تماس: فقط برای مشترکان؛ نمایش شماره به تصمیم مدیر در پنل */
  function contactBox(l, c) {
    const place = [c ? c.name : l.city_name, l.district].filter(Boolean).join("، ");
    if (l.locked) return `<div class="contact contact--lock">${icon("lock", 'width="18"')}<div><b>نشانی تقریبی و راه تماس</b><span>برای مشترکان: نشانی تقریبی، موقعیت دقیق روی نقشه${cfg.display?.show_address === false ? "" : ""} و، اگر در دسترس باشد، شمارهٔ آگهی‌دهنده.</span></div></div>`;
    const tel = l.phone ? String(l.phone).replace(/[^\d+]/g, "") : "";
    return `<div class="contact">
      <div><span class="muted small">نشانی تقریبی</span><b>${esc(l.address || place || "نامشخص")}</b></div>
      ${tel ? `<a class="btn btn--ink btn--block" href="tel:${esc(tel)}">${icon("phone")} تماس با آگهی‌دهنده <bdi dir="ltr">${esc(l.phone)}</bdi></a>`
        : l.contact_mode && l.contact_mode !== "none" ? `<p class="small muted">شمارهٔ این آگهی در دسترس نیست؛ از آگهی اصلی تماس بگیرید.</p>` : ""}
    </div>`;
  }
  /* شناسنامهٔ قیمت: این آگهی در برابر محلهٔ خودش */
  function priceIdCard(l) {
    const v = l.verdict, ex = l.explain || {};
    if (!v || l.excluded) return "";
    const rent = l.deal === "rent";
    const ask = l.deal === "daily" ? l.price : l.pp;
    const meM = l.deal === "daily" ? ask : l.area ? ask / l.area : null;
    const expM = meM && !v.approx ? meM / (1 + v.delta) : null;
    const row = (k, val, sub = "") => `<div class="pid__row"><span>${k}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    let html = "";
    const ps = ex.presale;
    if (ps) {
      const tparts = [ps.months != null && (ps.months_assumed ? `زمان تحویل در آگهی نیامده؛ ${fa(ps.months)} ماه فرض شد` : `حدود ${fa(ps.months)} ماه تا تحویل`), ps.progress != null && `پیشرفت ساخت ${fa(Math.round(ps.progress * 100))}٪`, ps.installments && "فروش قسطی"].filter(Boolean);
      html += row("پیش‌فروش", tparts.join("، ") || "مشخصات تحویل در آگهی نیامده", "مرجع: همین واحد اگر نوساز و آماده بود در همین محله، منهای تخفیف معمول پیش‌فروش (برآورد از آگهی‌های پیش‌فروش) برای زمان باقی‌مانده تا تحویل");
      if (!l.locked && ps.new_ppm) html += row("قیمت واحد نوساز و آماده در این محله", "متری " + money(ps.new_ppm), `نسبت معمول پیش‌فروش: ${ps.ratio >= 0 ? "+" : "−"}${pct(ps.ratio)} از ${fa(ps.n)} آگهی پیش‌فروش ${esc(ps.scope)}`);
    }
    if (ex.district_median) html += row(`میانهٔ قیمت هر متر در ${esc(l.district || "این محله")}، به نرخ امروز`, "متری " + money(ex.district_median), `از ${fa(ex.district_raw_n)} آگهی معتبر همین محله${ex.sellers ? ` و ${fa(ex.sellers)} فروشندهٔ مستقل` : ""}؛ آگهی‌های تازه‌تر وزن بیشتری دارند و چند آگهی از یک فروشنده یا با متن یکسان روی هم یک رأی حساب می‌شوند${ex.trend ? ` و قیمت آگهی‌های قدیمی‌تر با روند ماهانهٔ ${ex.trend > 0 ? "+" : "−"}${pct(ex.trend)} به امروز آورده شده` : ""}`);
    if (ex.spatial) html += row("سازگاری با محله‌های مجاور", `${ex.spatial[1] >= 0 ? "+" : "−"}${pct(ex.spatial[1])} با مجاورها`, `قیمت این محله با محله‌های اطرافش فاصلهٔ غیرعادی دارد و پشتوانهٔ فروشندگان مستقل کافی ندارد؛ ${pct(Math.abs(ex.spatial[0]))} به سمت قیمت مجاورها تعدیل شد${ex.nb_disc != null ? ` و فرصت بودن در برابر قیمت مجاورها هم سنجیده شد` : ""}.`);
    if (expM) html += row("قیمت مورد انتظار برای همین خانه", "متری " + money(expM), l.area && l.deal !== "daily" ? `برای ${fa(l.area)} متر حدود ${money(expM * l.area)} تومان` : "");
    else if (v.approx) html += row("قیمت مورد انتظار برای همین خانه", `<span class="blur">متری ۰۰ میلیون</span>`, "با اشتراک");
    if (!l.locked && ex.comp_n) html += row("تأیید با آگهی‌های مشابه", `${fa(ex.comp_n)} آگهی`, ex.comp_disc != null ? `نزدیک‌ترین آگهی‌های همین محله از نظر متراژ، سن، طبقه و امکانات؛ فاصله از آن‌ها ${ex.comp_disc >= 0 ? pct(ex.comp_disc) + " ارزان‌تر" : pct(ex.comp_disc) + " گران‌تر"}` : "");
    if (l.locked) html += row("تعدیل برای این خانه", `<span class="blur">+۰٪</span>`, ex.effects_count ? `${fa(ex.effects_count)} ویژگی اثر داشته؛ جزئیات با اشتراک` : "سن، متراژ، طبقه، آسانسور و پارکینگ این خانه لحاظ شده");
    else if (ex.adj != null) html += row("تعدیل برای این خانه", (ex.adj >= 0 ? "+" : "−") + pct(ex.adj), ex.adj ? "نسبت به خط پایهٔ محله" : "بدون تعدیل");
    if (meM) html += row("این آگهی", "متری " + money(meM), ex.age_days ? `قیمتی که ${fa(ex.age_days)} روز پیش در آگهی درج شده` : "");
    html += row("اختلاف با قیمت محله", UI.gapText(v));
    const fx = !l.locked && (ex.effects || []).length ? `<div class="pid__fx"><b>مهم‌ترین اثرها:</b><ul class="fx">${ex.effects.map(([name, e]) => `<li><span>${esc(name)}</span><b class="${e >= 0 ? "up" : "down"}"><bdi dir="ltr">${e >= 0 ? "+" : "−"}${pct(e)}</bdi></b></li>`).join("")}</ul>${ex.model ? `<p class="small muted">مدل قیمت با ${fa(ex.model.n)} آگهی ساخته شده است (ضریب تعیین ${fa(ex.model.r2)}).</p>` : ""}</div>` : "";
    return `<section class="block pid"><div class="pid__head"><h2>شناسنامهٔ قیمت</h2><span>این آگهی در برابر محلهٔ خودش</span></div>${html}${fx}
      <p class="pid__foot">«میانهٔ محله» یعنی نیمی از آگهی‌های محله گران‌ترند و نیمی ارزان‌تر. ${rent ? "«رهن کامل» یعنی ودیعه به‌اضافهٔ اجارهٔ ماهانه که به ودیعه تبدیل شده؛ هر ۱ میلیون تومان اجارهٔ ماهانه حدود ۳۳ میلیون تومان ودیعه حساب شده و همهٔ آگهی‌های اجاره با همین حساب مقایسه می‌شوند." : ""}</p></section>`;
  }
  /* تحلیل قیمت و عوامل مؤثر: جایگزینی حرفه‌ای واژه ارزانی و تشریح دلایل اقتصادی */
  function whySection(l) {
    const ex = l.explain || {}, ft = l.feat || {};
    const yn = (k, a, b, c) => (ft[k] == null ? c : ft[k] ? a : b);
    const done = [
      l.area && fa(l.area) + " متر",
      l.rooms != null && (l.rooms ? fa(l.rooms) + " خواب" : "استودیو"),
      l.year && "ساخت " + faY(l.year),
      ft.floor != null && "طبقهٔ " + fa(ft.floor),
      yn("elevator", "آسانسور دارد", "بی‌آسانسور", "آسانسور نامشخص"),
      yn("parking", "پارکینگ دارد", "بی‌پارکینگ", "پارکینگ نامشخص"),
      yn("warehouse", "انباری دارد", "بی‌انباری", null)
    ].filter(Boolean);
    const list = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    const isMulti = /انواع فایل|چند مورد|چندواحد|چند واحد|مواردی دیگر|فایل فروش در|فایل های مشابه|واحد های مختلف|شروع قیمت از/.test(((l.title || "") + " " + (l.description || "")).toLowerCase());
    const caution = [...(ex.sus || []), ...(ex.caution || [])];
    if (isMulti) {
      caution.unshift("توجه به آگهی چندموردی: این آگهی شرکتی شامل چند فایل یا واحد مختلف است؛ مشخصات و قیمت ثبت‌شده ممکن است تنها به یکی از گزینه‌ها اختصاص داشته باشد.");
    }

    // دلایل احتمالی قیمت پایین‌تر
    const sellerReasons = (ex.ctx || []);
    let priceReasonsHtml = "";
    if (sellerReasons.length) {
      priceReasonsHtml = `<div style="font-weight:700;margin-bottom:6px;color:var(--ink)">${icon("check")} نکات ذکرشده توسط فروشنده:</div>${list(sellerReasons)}`;
    } else {
      priceReasonsHtml = `
        <p class="muted small" style="margin-bottom:8px">مالک در متن آگهی دلیل خاصی برای قیمت پیشنهادی ذکر نکرده است؛ با این حال در بازار مسکن معمولاً این تفاوت قیمت ناشی از یکی از موارد زیر است:</p>
        <ul class="why__market-reasons small" style="display:grid;gap:5px;line-height:1.7;padding-inline-start:18px">
          <li>نیاز فوری فروشنده به نقدینگی و تبدیل تعهدات مالی یا خرید ملک دیگر</li>
          <li>وضعیت خاص سندی (قولنامه‌ای، اوقافی، مشاع، یا در دست اقدام بودن تک‌برگ)</li>
          <li>مشخصات نقشه، طبقه یا نورگیر (طبقه بدون آسانسور، نورگیر پاسیو، برِ کم)</li>
          <li>سن بنای واقعی متفاوت از سن بازسازی‌شده یا نیاز به بازسازی اساسی داخلی</li>
          <li>اعلام قیمت پایه در آگهی‌های چندواحدی، پیش‌فروش یا پروژه‌ای مشاوران</li>
          <li>استراتژی بازاریابی مشاور جهت ترغیب خریدار به تماس اولیه</li>
        </ul>
      `;
    }

    return `<section class="block why"><h2>تحلیل قیمت و عوامل مؤثر<small>آنچه در محاسبه لحاظ شده، دلایل احتمالی قیمت مناسب، و نکات نیازمند استعلام</small></h2>
      <div class="why__grid">
        <div class="why__col"><h3>${icon("check")} در این برآورد لحاظ شده</h3>${l.verdict ? list(done) : "<p>این آگهی هنوز سنجیده نشده؛ در این محله آگهی کافی برای مقایسه نیست.</p>"}</div>
        <div class="why__col"><h3>${icon("info")} دلایل قیمت پیشنهادی مناسب</h3>${priceReasonsHtml}</div>
        <div class="why__col why__col--warn"><h3>${icon("alert")} پیش از خرید استعلام کن</h3>${caution.length ? list(caution) : "<p>پرچمی پیدا نشد؛ در متن آگهی نشانهٔ سند ناقص، مستأجر یا عکس غیرواقعی نبود. سند، پایان‌کار و بدهی را باز هم استعلام کن.</p>"}</div>
      </div></section>`;
  }
  /* مشابه‌ها: همه روی یک مقیاس، هر ردیف با قیمت محلهٔ خودش */
  function similarSection(l) {
    const sim = (l.similar || []);
    const me = { ...l, _self: true };
    const rows = [me, ...sim].filter((x) => x.verdict && x.area && x.deal !== "daily");
    if (rows.length < 2) return sim.length ? `<section class="block"><h2>مشابه‌ها</h2><div class="cards">${sim.slice(0, 3).map((x) => UI.card(x, { compare: false })).join("")}</div></section>` : `<section class="block"><h2>مشابه‌ها</h2><p class="fn">در این محله و با همین تعداد خواب، آگهی مشابه دیگری نیست.</p></section>`;
    const ppm = (x) => x.pp / x.area, exp = (x) => ppm(x) / (1 + x.verdict.delta);
    const all = rows.flatMap((x) => [ppm(x), exp(x)]), lo = Math.min(...all) * 0.9, hi = Math.max(...all) * 1.08;
    const X = (val) => ((val - lo) / (hi - lo)) * 100;
    return `<section class="block"><h2>مشابه‌ها<small>هم‌محله، هم‌خواب و نزدیک‌ترین متراژ؛ همه روی یک مقیاس، هر ردیف با قیمت محلهٔ خودش</small></h2>
      <div class="cmps-head" aria-hidden="true"><span>آگهی</span><span>قیمت هر متر</span><span>در برابر قیمت محلهٔ خودش</span><span>حکم</span></div>
      <ol class="cmps">${rows.slice(0, 7).map((x) => `<li class="${x._self ? "is-self" : ""}">
        <span>${x._self ? "<b>همین آگهی</b>" : `<a href="#/ad/${encodeURIComponent(x.id)}">${fa(x.area)} متر، ${money(x.pp)}</a>`}<small>${esc(x.district || "")}${x.rooms != null ? "، " + (x.rooms ? fa(x.rooms) + " خواب" : "استودیو") : ""}</small></span>
        <span>متری ${money(ppm(x))}</span>
        <span class="cmps__bar" style="position:relative;height:10px;border-radius:999px;background:linear-gradient(to left, #10b981 0%, #d4a017 50%, #ef4444 100%);opacity:0.9;border:1px solid var(--line);display:block;width:100%;">
          <b class="pbar__exp" style="position:absolute;top:-3px;bottom:-3px;width:3px;background:#fff;box-shadow:0 0 2px rgba(0,0,0,0.6);border-radius:1px;right:${X(exp(x))}%;" title="قیمت محله: متری ${money(exp(x))}"></b>
          <b class="pbar__me" style="position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:${({ gold: "#f5c542", good: "#22c55e", fair: "#a8743f", high: "#ef4444", over: "#dc2626" })[x.verdict.label] || "#94a3b8"};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.6);transform:translate(50%, -50%);right:${X(ppm(x))}%;" title="این آگهی: متری ${money(ppm(x))}"></b>
        </span>
        <span>${UI.labelPill(x.verdict)}</span></li>`).join("")}</ol>
      <p class="fn">نقطهٔ پررنگ قیمت هر متر آگهی است و خط عمودی قیمت محله برای همان خانه.</p></section>`;
  }

  async function adPage(id) {
    view().innerHTML = `<div class="wrap ad"><div class="skeleton" style="height:440px"></div></div>`;
    const l = await DataLayer.get(id);
    if (!l) { view().innerHTML = `<div class="wrap ad"><div class="empty"><h3>این آگهی پیدا نشد</h3><p>ممکن است آگهی اصلی حذف شده باشد.</p><a class="btn btn--ink" href="/">بازگشت به خانه</a></div></div>`; return; }
    const c = UI.cityOf(l.city_key);
    UI.seen.add(l.id);
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
      ? `<button class="btn btn--hot btn--block btn--lg" id="divarBtn">${icon("arrow")} مشاهده آگهی اصلی</button><p class="agent__note">پیوند مستقیم آگهی اصلی و جزئیات کامل ارزش‌گذاری برای مشترکان فعال است.</p>`
      : l.url ? `<a class="btn btn--hot btn--block btn--lg" href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${icon("arrow")} مشاهده آگهی اصلی</a><p class="agent__note">اطلاعات تماس و جزئیات بیشتر در آگهی اصلی است.</p>` : "";
    view().innerHTML = `
    <article class="wrap ad">
      <nav class="crumbs"><a href="/">خانه</a>${c ? `<span><a href="#/s?city=${c.id}&sort=score">${c.name}</a></span>` : ""}${l.district && c ? `<span><a href="#/s?city=${c.id}&district=${encodeURIComponent(l.district)}&sort=score">${esc(l.district)}</a></span>` : ""}<span>${UI.tt(l.title)}</span></nav>
      <div class="gallery" id="gal">${gal}</div>
      ${l.detail_pending && !imgs.length ? `<p class="note-soft small" style="margin-top:10px">${icon("info", 'width="16"')} عکس‌ها و مشخصات کامل این آگهی در نوبت اول دریافت قرار گرفت؛ چند دقیقه دیگر صفحه را تازه کنید.</p>` : ""}
      <div class="ad__grid">
        <div>
          <header class="ad__head">
            <div class="ad__badges">${UI.typePill(l)}${/انواع فایل|چند مورد|چندواحد|چند واحد|مواردی دیگر|فایل فروش در|فایل های مشابه|واحد های مختلف|شروع قیمت از/.test(((l.title || "") + " " + (l.description || "")).toLowerCase()) ? `<span class="pill pill--multi" title="آگهی شامل چند واحد یا فایل مختلف است">${icon("layers")} چندموردی / شرکتی</span>` : ""}${l.price_drop ? `<span class="pill pill--drop">${fa(Math.round(l.price_drop * 100))}٪ کاهش قیمت</span>` : ""}${l.source === "sample" ? '<span class="pill pill--demo">آگهی نمونه</span>' : ""}<button type="button" class="ad__sharem" data-adshare>${icon("share")}<span>اشتراک / پوستر</span></button></div>
            <h1 class="ad__title-row"><span class="ad__title">${UI.tt(l.title)}</span><button type="button" class="ad__sharei" data-adshare aria-label="اشتراک‌گذاری یا پوستر" title="اشتراک‌گذاری یا پوستر">${icon("share")}</button></h1>
            <p class="muted">${esc([c && "استان " + UI.provOf(c.province).name, c ? c.name : l.city_name, l.district].filter(Boolean).join("، "))}${l.first_seen ? "، ثبت در سامانه " + UI.ago(l.first_seen) : ""}</p>
            <div class="ad__price">${UI.priceHTML(l, true)}</div>
          </header>
          <div class="facts">${facts.filter(([, x]) => x).map(([k, x]) => `<div><span>${k}</span><b>${esc(x)}</b></div>`).join("")}</div>
          <div class="mobile-only">${valuationCard(l)}</div>
          ${l.history && l.history.length > 1 ? `<section class="block"><h2>تاریخچه قیمت</h2>${UI.spark(l.history, l.deal)}</section>` : ""}
          ${priceIdCard(l)}
          ${whySection(l)}
          ${l.description ? `<section class="block"><h2>متن آگهی<small>نقل از آگهی اصلی</small></h2><blockquote class="quote">${esc(l.description).replace(/\n+/g, "<br>")}</blockquote><p class="quote-src">متن آگهی‌دهنده؛ این نوشتهٔ فروشنده است، نه حکم ${esc(cfg.site.name)}.</p></section>` : ""}
          <section class="block"><h2>امکانات</h2><ul class="amen-list">${amen}</ul><p class="small muted" style="margin-top:10px">امکانات از متن آگهی استخراج شده است؛ در بازدید تأیید کنید.</p></section>
          ${attrs.length ? `<section class="block"><h2>مشخصات</h2><div class="attrs">${attrs.map(([k, x]) => `<div><span>${esc(k)}</span><b>${UI.tt(x)}</b></div>`).join("")}</div></section>` : ""}
          <section class="block"><h2>موقعیت تقریبی</h2><div class="minimap-wrap" style="position:relative"><div class="minimap" id="mini"></div><button class="minimap-expand-btn" id="openMapBtn" type="button" title="بزرگ‌نمایی نقشه"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg> بزرگ‌نمایی نقشه</button></div><p class="map-note">${l.latlng_exact ? "این موقعیت را آگهی‌دهنده روی نقشه ثبت کرده است." : "آگهی مختصات دقیق ندارد؛ دایره فقط محدودهٔ شهر را نشان می‌دهد، نه محل ملک."} موقعیت بر اساس اطلاعات ثبت‌شده توسط آگهی‌دهنده است و ممکن است دقیق نباشد؛ نشانی را پیش از بازدید از خود آگهی‌دهنده بپرسید.</p></section>
          <section class="block"><h2>پیش از معامله</h2><ul class="check">${["دیدن اصل سند و تطبیق مشخصات با ملک", "استعلام وضعیت حقوقی، رهن و توقیف", "پایان‌کار و پروانه ساخت (ملک نوساز)", "بدهی عوارض، آب، برق و گاز", l.deal === "rent" ? "دریافت کد رهگیری اجاره‌نامه" : "تنظیم قرارداد با کد رهگیری"].map((x) => `<li>${x}</li>`).join("")}</ul></section>
          ${similarSection(l)}
        </div>
        <aside class="agent" id="agent">
          <div class="desktop-only">${valuationCard(l)}</div>
          ${divarBtn}
          ${contactBox(l, c)}
          <div class="agent__row">
            <button class="btn btn--line" id="adFav">${icon("heart")}<span>${state.favs.has(l.id) ? "ذخیره شد" : "ذخیره"}</span></button>
            <button class="btn btn--line" id="adShare">${icon("share")} اشتراک‌گذاری</button>
            <button class="btn btn--line" id="adReport" style="color:var(--over)">${icon("alert")} گزارش تخلف</button>
          </div>
          <p class="agent__note">فرصت ملک موتور مستقل پالایش و رتبه‌بندی آماری آگهی‌های املاک است. کلیه آگهی‌ها از منابع معتبر عمومی گردآوری و تحلیل می‌شوند و جهت جزئیات و استعلام به سایت اصلی هدایت می‌شوید. فرصت ملک مشاور املاک نیست و قیمت محله برآورد آماری است؛ پیش از معامله، بازدید حضوری و استعلام سند الزامی است.</p>
        </aside>
      </div>
    </article>
    <div class="mobile-cta">${l.locked ? `<button class="btn btn--hot" id="divarBtnM">مشاهده آگهی اصلی</button>` : l.url ? `<a class="btn btn--hot" href="${esc(l.url)}" target="_blank" rel="noopener nofollow">مشاهده آگهی اصلی</a>` : ""}</div>`;
    document.body.classList.add("has-mcta");
    document.title = `${l.title} | ${cfg.site.name}`;
    const cc = UI.cityOf(l.city_key), pos = l.latlng_exact || !cc ? [l.lat, l.lng] : [cc.lat, cc.lng];
    const mini = UI.makeMap($("#mini"), { center: pos, zoom: l.latlng_exact ? 14 : 12, wheel: false });
    if (mini) L.circle(pos, { radius: l.latlng_exact ? 150 : 2200, color: "#e0531f", weight: 2, fillOpacity: 0.1, dashArray: l.latlng_exact ? null : "6 6" }).addTo(mini);
    $("#gal").addEventListener("click", (e) => { const b = e.target.closest("[data-img]"); if (b) lightbox(l, imgs.length ? Math.min(+b.dataset.img, imgs.length - 1) : +b.dataset.img); });
    $("#openMapBtn")?.addEventListener("click", () => openMapModal(l, pos, cc));
    $("#mini")?.addEventListener("dblclick", () => openMapModal(l, pos, cc));
    $("#adFav").addEventListener("click", (e) => { toggleFav(l.id); e.currentTarget.querySelector("span").textContent = state.favs.has(l.id) ? "ذخیره شد" : "ذخیره"; });
    $("#adReport")?.addEventListener("click", () => openReportDialog(l.id));
    const handleShare = async () => {
      // پنجرهٔ اشتراک مشترک سایت: پیوند (کپی، گوشی، تلگرام، واتساپ) یا پوستر استوری/پست
      if (window.FM && FM.shareSheet) return FM.shareSheet(posterCard(l), location.origin + "/ad/" + encodeURIComponent(l.id));
      const url = window.location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          UI.toast("پیوند آگهی در حافظه کپی شد");
        } else {
          const ta = document.createElement("textarea");
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          UI.toast("پیوند آگهی در حافظه کپی شد");
        }
      } catch (e) {
        UI.toast("پیوند صفحه کپی شد");
      }
    };
    $("#adShare")?.addEventListener("click", handleShare);
    window.__fmAdShare = handleShare;   // دکمه‌های اشتراک کنار عنوان، روی عکس و در نمای بزرگ عکس
    $("#topShareBtn")?.addEventListener("click", handleShare);
    const paywall = () => (DataLayer.me ? go("#/account") : loginDialog(() => go("#/account")));
    $("#divarBtn")?.addEventListener("click", paywall);
    $("#divarBtnM")?.addEventListener("click", paywall);
  }

  /* ---------- بزرگ‌نمایی تصویر (لایت‌باکس با اسکرول کامل و مدیریت دکمه بازگشت) ---------- */
  /* نمایش بزرگ عکس‌ها: بزرگ‌نمایی نرم با transform (بدون نوار پیمایش و بدون پرش تصویر)
     دکمه‌ها و صفحه‌کلید: از مرکز آنچه دیده می‌شود؛ چرخ موس، دوبار کلیک و دو انگشت: از همان نقطهٔ زیر نشانگر/انگشت.
     در حالت بزرگ‌شده با کشیدن موس یا انگشت جابه‌جا می‌شود و لبه‌های تصویر هیچ‌وقت از کادر جدا نمی‌شوند. */
  /* دادهٔ کارت پوستر از روی آگهی (فقط داده‌های واقعی همان آگهی) */
  function posterCard(l) {
    const im = (l.images && l.images[0]) || l.image;
    const u = im ? UI.imgUrl(im) : "";
    const v = l.verdict || (l.label ? { label: l.label, delta: l.discount != null ? -l.discount : null, approx: l.locked } : null);
    const m = (x) => (UI.money(x) ? UI.money(x) + " تومان" : "");
    return {
      id: l.id, title: l.title || "", loc: [l.district, l.city_name].filter(Boolean).join("، "), area: l.area, rooms: l.rooms,
      priceText: l.deal === "rent" && l.deposit != null ? "ودیعه " + m(l.deposit) + (l.rent ? "، اجاره " + m(l.rent) : "") : m(l.price || l.pp),
      diffText: v && v.delta != null ? UI.gapText(v) : "", label: l.label, score: l.score != null ? Math.round(l.score) : null,
      img: !u ? "" : /^(https?:|\/)/.test(u) ? u : "/" + u, raw: l,
    };
  }

  function lightbox(l, i) {
    document.querySelectorAll(".lightbox").forEach((node) => node.remove());
    const imgs = l.images && l.images.length ? l.images : l.image ? [l.image] : [null, null, null, null, null];
    const n = imgs.length;
    const MIN = 1, MAX = 5;
    let z = 1, tx = 0, ty = 0, isClosed = false;
    history.pushState({ modal: "lightbox", t: Date.now() }, "", location.hash);
    const el = document.createElement("div");
    el.className = "lightbox lightbox--photo";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "نمایش بزرگ عکس");

    const close = (fromPopState = false) => {
      if (isClosed) return;
      isClosed = true;
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("keydown", onKeyDown);
      el.remove();
      if (!fromPopState && history.state && history.state.modal === "lightbox") history.back();
    };
    const onPopState = () => close(true);
    window.addEventListener("popstate", onPopState);

    const vp = () => el.querySelector(".lbz");
    const box = () => el.querySelector(".lbz__img");
    // جابه‌جایی مجاز: تصویر بزرگ‌تر از کادر هرگز لبه‌اش از کادر جدا نمی‌شود؛ تصویر کوچک‌تر وسط می‌ماند
    const clamp = () => {
      const v = vp(), b = box(); if (!v || !b) return;
      const mx = Math.max(0, (b.offsetWidth * z - v.clientWidth) / 2), my = Math.max(0, (b.offsetHeight * z - v.clientHeight) / 2);
      tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
    };
    const paint = (smooth) => {
      const b = box(); if (!b) return;
      clamp();
      b.style.transition = smooth ? "transform .28s cubic-bezier(.16,1,.3,1)" : "none";
      b.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;
      vp().classList.toggle("is-zoomed", z > 1.001);
      const zv = el.querySelector("#lbZoomVal"); if (zv) zv.textContent = fa(Math.round(z * 100)) + "٪";
    };
    // بزرگ‌نمایی حول یک نقطه از کادر (px نسبت به مرکز کادر)؛ همان نقطه زیر نشانگر می‌ماند
    const zoomAt = (nz, px = 0, py = 0, smooth = true) => {
      nz = Math.max(MIN, Math.min(MAX, nz));
      const k = nz / z;
      tx = px - (px - tx) * k; ty = py - (py - ty) * k; z = nz;
      if (z <= 1.001) { z = 1; tx = 0; ty = 0; }
      paint(smooth);
    };
    const local = (cx, cy) => { const r = vp().getBoundingClientRect(); return [cx - r.left - r.width / 2, cy - r.top - r.height / 2]; };

    const draw = () => {
      z = 1; tx = 0; ty = 0;
      el.innerHTML = `
        <button class="lightbox__top-close" data-x aria-label="بستن" title="بستن (Esc)">✕</button>
        <div class="lbz" id="lbVp"><div class="lbz__img" id="lbStage">${UI.media(l, i, "lb-active-img")}</div></div>
        <div class="lightbox__bar">
          <button class="btn btn--line btn--sm" data-d="-1" title="تصویر قبلی">${icon("arrow", 'style="transform:rotate(180deg)"')} قبلی</button>
          <span style="font-size:13px;font-weight:700">${fa(i + 1)} از ${fa(n)}</span>
          <button class="btn btn--line btn--sm" data-d="1" title="تصویر بعدی">بعدی ${icon("arrow")}</button>
          <div class="lbz__tools">
            <button class="btn btn--line btn--sm" data-zoom="out" title="کوچک‌نمایی (−)" aria-label="کوچک‌نمایی">${icon("minus", 'width="15"')}</button>
            <button class="btn btn--line btn--sm lbz__val" data-zoom="reset" title="اندازهٔ اولیه"><span id="lbZoomVal">${fa(100)}٪</span></button>
            <button class="btn btn--line btn--sm" data-zoom="in" title="بزرگ‌نمایی (+)" aria-label="بزرگ‌نمایی">${icon("plus", 'width="15"')}</button>
          </div>
          <button class="btn btn--line btn--sm" data-x title="بستن">${icon("x", 'width="15"')} بستن</button>
        </div>
        <p class="lbz__hint">چرخ موس یا دو انگشت: بزرگ‌نمایی · کشیدن: جابه‌جایی · دوبار کلیک: بزرگ/اولیه</p>`;
      bindStage();
      paint(false);
    };

    const bindStage = () => {
      const v = vp(); if (!v) return;
      const ptrs = new Map();
      let drag = null, pinch = null, moved = false, lastTap = 0;
      v.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        v.setPointerCapture(e.pointerId);
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        moved = false;
        if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, tx, ty };
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          const [mx, my] = local((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z, mx, my, tx, ty };
          drag = null;
        }
      });
      v.addEventListener("pointermove", (e) => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        if (pinch && ptrs.size >= 2) {
          const [a, b] = [...ptrs.values()];
          const nz = Math.max(MIN, Math.min(MAX, pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
          const k = nz / pinch.z;
          z = nz; tx = pinch.mx - (pinch.mx - pinch.tx) * k; ty = pinch.my - (pinch.my - pinch.ty) * k;
          moved = true; paint(false);
        } else if (drag && z > 1) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          tx = drag.tx + dx; ty = drag.ty + dy; paint(false);
        } else if (drag && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) moved = true;
      });
      const up = (e) => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinch = null;
        if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: p[0], y: p[1], tx, ty }; }
        if (ptrs.size) return;
        // کشیدن افقی در اندازهٔ اولیه روی موبایل: عکس بعدی/قبلی
        if (drag && z <= 1 && e.pointerType !== "mouse") {
          const dx = e.clientX - drag.x;
          if (Math.abs(dx) > 60) { i = (i + (dx < 0 ? 1 : -1) + n) % n; drag = null; draw(); return; }
        }
        drag = null;
        if (moved) return;
        // با گرفتن نشانگر، هدف رویداد همیشه کادر است؛ پس روی عکس بودن از روی مختصات سنجیده می‌شود
        const ir = box().getBoundingClientRect();
        const onImg = e.clientX >= ir.left && e.clientX <= ir.right && e.clientY >= ir.top && e.clientY <= ir.bottom;
        const now = Date.now();
        if (now - lastTap < 300 && onImg) { // دوبار کلیک/لمس: بزرگ‌نمایی در همان نقطه یا بازگشت
          const [px, py] = local(e.clientX, e.clientY);
          zoomAt(z > 1.05 ? 1 : 2.5, px, py); lastTap = 0; return;
        }
        lastTap = now;
        if (!onImg && z <= 1) close(false);   // کلیک روی فضای خالی دور عکس: بستن
      };
      v.addEventListener("pointerup", up);
      v.addEventListener("pointercancel", up);
      v.addEventListener("wheel", (e) => {
        e.preventDefault();
        const [px, py] = local(e.clientX, e.clientY);
        const f = Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0022);
        zoomAt(z * f, px, py, true);
      }, { passive: false });
      v.addEventListener("dblclick", (e) => e.preventDefault());
      // تصویر پس از بارگذاری اندازهٔ تازه می‌گیرد
      el.querySelectorAll(".lbz__img img").forEach((im) => im.addEventListener("load", () => paint(false), { once: true }));
      v.querySelectorAll("img").forEach((im) => { im.draggable = false; });
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") { close(false); e.preventDefault(); return; }
      if (e.key === "+" || e.key === "=") { zoomAt(z * 1.4); e.preventDefault(); return; }
      if (e.key === "-") { zoomAt(z / 1.4); e.preventDefault(); return; }
      if (e.key === "0") { zoomAt(1); e.preventDefault(); return; }
      if (z > 1) {
        const step = 90, m = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [step, 0], ArrowRight: [-step, 0] }[e.key];
        if (m) { tx += m[0]; ty += m[1]; paint(true); e.preventDefault(); }
      } else if (e.key === "ArrowLeft") { i = (i + 1) % n; draw(); }
      else if (e.key === "ArrowRight") { i = (i - 1 + n) % n; draw(); }
    };

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.matches("[data-x]")) close(false);
      else if (b.dataset.d) { i = (i + +b.dataset.d + n) % n; draw(); }
      else if (b.dataset.zoom === "in") zoomAt(z * 1.5);            // از مرکز کادر
      else if (b.dataset.zoom === "out") zoomAt(z / 1.5);
      else if (b.dataset.zoom === "reset") zoomAt(1);
    });
    addEventListener("resize", () => !isClosed && paint(false));
    document.addEventListener("keydown", onKeyDown);
    document.body.appendChild(el);
    draw();
  }

  /* ---------- مدال نقشه تعاملی با کنترل کامل زوم، اسکرول و دکمه بازگشت ---------- */
  function openMapModal(l, pos, cc) {
    document.querySelectorAll(".lightbox").forEach((node) => node.remove());

    let isClosed = false;
    history.pushState({ modal: "map", t: Date.now() }, "", location.hash);

    const el = document.createElement("div");
    el.className = "lightbox lightbox--map";
    el.innerHTML = `
      <button class="lightbox__top-close" data-x aria-label="بستن" title="بستن (Esc)">✕</button>
      <div class="lightbox__viewport" style="display:flex;flex-direction:column;flex:1 1 auto;width:100%;position:relative;overflow:hidden;padding:0">
        <div id="fullMapModal" style="width:100%;height:100%"></div>
        <div class="map-hud-overlay">
          <div class="map-hud-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${esc(l.title)}</div>
          <div class="map-hud-actions">
            <button class="btn btn--line btn--sm" id="hudZoomIn" title="بزرگ‌نمایی">${icon("plus", 'width="15"')} بزرگ‌نمایی</button>
            <button class="btn btn--line btn--sm" id="hudZoomOut" title="کوچک‌نمایی">${icon("minus", 'width="15"')} کوچک‌نمایی</button>
            <button class="btn btn--line btn--sm" id="hudReset" title="مرکز موقعیت">${icon("target", 'width="15"')} مرکز</button>
          </div>
        </div>
      </div>
      <div class="lightbox__bar">
        <span style="font-size:13.5px;font-weight:700">${esc(l.city_name || (cc && cc.name) || "نقشه موقعیت ملک")}</span>
        <div style="display:inline-flex;gap:6px;align-items:center">
          <button class="btn btn--line btn--sm" id="barZoomIn">${icon("plus", 'width="15"')} بزرگ‌نمایی</button>
          <button class="btn btn--line btn--sm" id="barZoomOut">${icon("minus", 'width="15"')} کوچک‌نمایی</button>
          <button class="btn btn--line btn--sm" id="barReset">${icon("target", 'width="15"')} مرکز</button>
        </div>
        <button class="btn btn--line btn--sm" id="barClose" data-x title="بستن">${icon("x", 'width="15"')} بستن</button>
      </div>`;

    const close = (fromPopState = false) => {
      if (isClosed) return;
      isClosed = true;

      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("keydown", onKeyDown);

      el.remove();

      if (!fromPopState) {
        if (history.state && history.state.modal === "map") {
          history.back();
        }
      }
    };

    const onPopState = () => {
      close(true);
    };
    window.addEventListener("popstate", onPopState);

    let map = null;
    const onKeyDown = (e) => {
      if (e.key === "Escape") { close(false); e.preventDefault(); return; }
      if (!map) return;
      if (e.key === "ArrowUp") { map.panBy([0, -80]); e.preventDefault(); }
      else if (e.key === "ArrowDown") { map.panBy([0, 80]); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { map.panBy([-80, 0]); e.preventDefault(); }
      else if (e.key === "ArrowRight") { map.panBy([80, 0]); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") { map.zoomIn(); e.preventDefault(); }
      else if (e.key === "-") { map.zoomOut(); e.preventDefault(); }
    };

    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-x]")) {
        close(false);
      }
    });

    document.addEventListener("keydown", onKeyDown);
    document.body.appendChild(el);

    const mapEl = el.querySelector("#fullMapModal");
    map = UI.makeMap(mapEl, { center: pos, zoom: l.latlng_exact ? 15 : 13, scrollWheelZoom: true, dragging: true });
    if (map) {
      L.circle(pos, { radius: l.latlng_exact ? 150 : 2200, color: "#e0531f", weight: 2.5, fillOpacity: 0.15, dashArray: l.latlng_exact ? null : "6 6" }).addTo(map);
      L.marker(pos).addTo(map).bindPopup(`<b>${esc(l.title)}</b><br>${money(l.price || l.deposit)} تومان`).openPopup();
    }

    el.querySelector("#hudZoomIn")?.addEventListener("click", () => map?.zoomIn());
    el.querySelector("#hudZoomOut")?.addEventListener("click", () => map?.zoomOut());
    el.querySelector("#hudReset")?.addEventListener("click", () => map?.setView(pos, l.latlng_exact ? 15 : 13));
    el.querySelector("#barZoomIn")?.addEventListener("click", () => map?.zoomIn());
    el.querySelector("#barZoomOut")?.addEventListener("click", () => map?.zoomOut());
    el.querySelector("#barReset")?.addEventListener("click", () => map?.setView(pos, l.latlng_exact ? 15 : 13));
  }

  /* ---------- ذخیره‌شده‌ها ---------- */
  async function savedPage() {
    const ids = [...state.favs];
    const searches = store.get("searches", []);
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      <div class="sec-head"><div><span class="kicker">ذخیره‌شده‌ها</span><h2>آگهی‌ها و جست‌وجوهای من</h2><p>در همین مرورگر نگه داشته می‌شوند.</p></div></div>
      <div class="cards" id="favGrid"></div>
      <div class="block"><h2>جست‌وجوهای ذخیره‌شده</h2>${searches.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${searches.map((s, i) => `<span style="display:inline-flex;gap:4px"><a class="chip" href="#/s?${esc(s.q)}">${esc(s.title)}</a><button class="chip" data-del="${i}" aria-label="حذف">${icon("x", 'width="13"')}</button></span>`).join("")}</div>` : '<p class="muted">هنوز جست‌وجویی ذخیره نکرده‌اید.</p>'}</div>
    </div></section>`;
    $$("[data-del]").forEach((b) => b.addEventListener("click", () => { searches.splice(+b.dataset.del, 1); store.set("searches", searches); savedPage(); }));
    if (!ids.length) { $("#favGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">${icon("heart")}<h3>هنوز آگهی‌ای ذخیره نشده</h3><p>روی قلب هر کارت بزنید تا اینجا بماند.</p><a class="btn btn--ink" href="#/s?sort=score">دیدن فرصت‌ها</a></div>`; return; }
    const r = await DataLayer.search({ ids: ids.join(","), limit: 60 });
    $("#favGrid").innerHTML = r.items.map((l) => UI.card(l)).join("") || '<p class="muted">آگهی‌های ذخیره‌شده دیگر در دسترس نیستند.</p>';
  }

  /* ---------- بازار محله‌ها ---------- */
  const mln = (v) => (v == null ? "—" : fa(+(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)));
  function hbars(groups, cityMed, unit = "") {
    if (!groups.length) return `<p class="muted small">دادهٔ کافی نیست.</p>`;
    const max = Math.max(...groups.map((g) => g.median_ppm), cityMed || 0) * 1.08;
    return `<div class="hb">${groups.map((g) => `<div class="hb__row"><span class="hb__lab">${esc(g.label)}<small>${fa(g.n)} آگهی${g.low ? "، دادهٔ کم" : ""}</small></span><span class="hb__track"><i style="width:${(g.median_ppm / max) * 100}%"></i>${cityMed ? `<em style="right:${(cityMed / max) * 100}%"></em>` : ""}</span><b>${mln(g.median_ppm)}${unit}</b></div>`).join("")}</div>`;
  }
  async function marketPage(params) {
    const city = params.city || "rasht", deal = params.deal === "rent" ? "rent" : "sale", kind = params.kind || "apartment";
    const KG = { apartment: "آپارتمان", villa: "ویلا", land: "زمین و باغ", commercial: "تجاری و اداری" };
    const cname = UI.cityOf(city)?.name || "";
    const link = (extra) => "#/s?" + toQuery({ city, deal, kinds: kind === "land" ? "land,garden" : kind === "commercial" ? "shop,office" : kind === "villa" ? "villa" : "apartment,suite", sort: "score", ...extra });
    view().innerHTML = `<section class="section--tight"><div class="wrap mkt-page">
      <div class="mkt-bar">
        <div class="field"><span>شهر</span><div id="mCity"></div></div>
        <div class="seg" id="mDeal"><button data-v="sale" class="${deal === "sale" ? "is-on" : ""}">خرید</button><button data-v="rent" class="${deal === "rent" ? "is-on" : ""}">رهن و اجاره</button></div>
        <div class="seg" id="mKind">${Object.entries(KG).map(([k, n]) => `<button data-v="${k}" class="${kind === k ? "is-on" : ""}">${n}</button>`).join("")}</div>
      </div>
      <section class="mkt-opps" id="mOpps"><div class="sec-head"><div><span class="kicker">فرصت‌های ${esc(cname)}</span><h2>بهترین فرصت‌های ${UI.dealName(deal)} ${esc(cname)}</h2><p>آگهی‌هایی که از قیمت محلهٔ خودشان پایین‌ترند، به ترتیب امتیاز.</p></div><a class="btn btn--hot" href="#/s?${toQuery({ city, deal, sort: "score", opp: 1 })}">همهٔ فرصت‌های ${esc(cname)} ${icon("arrow")}</a></div>
        <div class="cards" id="mOppGrid">${Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join("")}</div></section>
      <div id="mBody"><div class="skeleton" style="height:320px"></div></div>
    </div></section>`;
    DataLayer.search({ city, deal, opp: 1, sort: "score", limit: 8 }).then((r) => {
      if (!$("#mOppGrid")) return;
      $("#mOppGrid").innerHTML = r.items.length ? r.items.map((l) => UI.card(l)).join("")
        : `<div class="empty" style="grid-column:1/-1"><h3>فعلاً فرصتی در ${esc(cname)} ثبت نشده</h3><p>با دریافت آگهی‌های بیشتر این بخش پر می‌شود. <a href="#/s?${toQuery({ city, deal, sort: "score" })}">همهٔ آگهی‌های ${esc(cname)}</a></p></div>`;
    }).catch(() => { if ($("#mOppGrid")) $("#mOppGrid").innerHTML = ""; });
    const nav = (patch) => go("#/market?" + toQuery({ city, deal, kind, ...patch }));
    UI.cityPicker($("#mCity"), { value: city, showGroup: true, onChange: ({ id }) => id && nav({ city: id }) });
    $("#mDeal").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) nav({ deal: b.dataset.v }); });
    $("#mKind").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) nav({ kind: b.dataset.v }); });
    const { report: R } = await DataLayer.market(city, deal, kind);
    if (!$("#mBody")) return;
    const o = R && R.overview;
    if (!R || !o.valid) {
      $("#mBody").innerHTML = `<div class="empty"><h3>هنوز داده‌ای برای ${KG[kind]} ${UI.dealName(deal)} ${esc(cname)} جمع نشده</h3><p>آگهی‌ها به‌تدریج دریافت می‌شوند؛ کمی بعد دوباره سر بزنید.</p><a class="btn btn--ink" href="/">بازگشت به صفحهٔ اول</a></div>`;
      return;
    }
    const rentWord = deal === "rent" ? "رهن کامل " : "";
    const fmax = Math.max(...R.funnel.map((f) => f.n), 1);
    const bmax = Math.max(...R.budget.map((b) => b.n), 1);
    const amenTxt = (a) => a.premium == null ? `<p class="muted small">دادهٔ کافی نیست؛ هیچ محله‌ای دست‌کم ۳ آگهی با و ۳ آگهی بی ${a.name} ندارد.</p>`
      : `<b class="amen__pct">${a.premium >= 0 ? "+" : "−"}${pct(a.premium)}</b><p>درون یک محله، ${a.name} هر متر را حدود ${pct(a.premium)} ${a.premium >= 0 ? "گران‌تر" : "ارزان‌تر"} می‌کند؛ در ${fa(a.higher)} از ${fa(a.districts)} محله گران‌تر است.${a.share != null ? ` ${pct(a.share)} آگهی‌ها ${a.name} دارند.` : ""}</p>`;
    $("#mBody").innerHTML = `
      <header class="mkt-hero">
        <span class="kicker">بازار ${KG[kind]} ${esc(cname)}${DataLayer.samples ? "، داده نمونه و ساختگی" : ""}</span>
        <h1>${rentWord}هر متر ${KG[kind]} در ${esc(cname)}، میانه <span class="hl">${mln(o.median_ppm)}</span> میلیون تومان${o.spread && o.n_districts >= 2 ? `؛ محله‌ها تا <span class="hl">${fa(+o.spread.toFixed(1))}</span> برابر فرق دارند` : ""}</h1>
        <p class="lead">قیمت هر متر، بودجه، خواب، سن بنا و محله‌به‌محله؛ همه از آگهی‌های معتبر ${UI.dealName(deal)} ${KG[kind]} ${esc(cname)} در سایت‌های آگهی. روی هر ردیف بزن تا همان آگهی‌ها را ببینی.</p>
        <div class="mkt-kpis">
          <div><b>${fa(o.valid)}</b><span>آگهی معتبر</span></div>
          <div><b>${money(o.median_price) || "—"}</b><span>${deal === "rent" ? "میانهٔ رهن کامل" : "میانهٔ قیمت کل"}، تومان</span></div>
          <div><b>${o.median_area ? fa(Math.round(o.median_area)) : "—"}</b><span>میانهٔ متراژ، متر</span></div>
          <div><b>${fa(o.opportunities)}</b><span>فرصت شناسایی‌شده${o.gold ? `، ${fa(o.gold)} طلایی` : ""}</span></div>
          ${o.median_year ? `<div><b>${faY(Math.round(o.median_year))}</b><span>میانهٔ سال ساخت</span></div>` : ""}
          <div><b>${fa(o.fresh_7d)}</b><span>آگهی تازه در ۷ روز${o.fresh_24h ? `، ${fa(o.fresh_24h)} در ۲۴ ساعت` : ""}</span></div>
        </div>
        ${o.per100 != null ? `<p class="mkt-note">از هر ۱۰۰ آگهی سنجیده‌شده، <b>${fa(Math.round(o.per100))}</b> تا فرصت‌اند${o.opp_median_discount != null ? `؛ فرصت‌ها در میانه ${pct(o.opp_median_discount)} فاصله با برآورد بازار محلهٔ خودشان دارند` : ""}. هر آگهی فقط با آگهی‌های محلهٔ خودش سنجیده شده است.</p>` : ""}
      </header>
      <nav class="mkt-toc"><a href="#budgetH" data-jump>بودجه</a><a href="#hotH" data-jump>کجا فرصت هست</a><a href="#ppmH" data-jump>خواب، سن و متراژ</a><a href="#amenH" data-jump>آسانسور و پارکینگ</a><a href="#cheapH" data-jump>ارزان و گران</a><a href="#ledgerH" data-jump>همهٔ محله‌ها</a><a href="#funnelH" data-jump>روش</a></nav>
      <section class="block" id="budgetH"><h2>با هر بودجه چند آگهی و چند فرصت هست</h2><p class="muted small">آگهی‌های هر بازهٔ قیمت و بخشی که فرصت است.</p>
        <div class="legend"><span><i class="lg lg--all"></i>همهٔ آگهی‌ها</span><span><i class="lg lg--gold"></i>فرصت طلایی</span><span><i class="lg lg--good"></i>فرصت مناسب</span></div>
        <div class="bud">${R.budget.map((b) => `<a class="bud__row" href="${link({ max: "" })}"><span>${esc(b.label)}</span><span class="bud__track"><i style="width:${(b.n / bmax) * 100}%"><em class="g" style="width:${(b.gold / b.n) * 100}%"></em><em class="d" style="width:${(b.good / b.n) * 100}%"></em></i></span><b>${fa(b.n)}<small>${b.gold + b.good ? fa(b.gold + b.good) + " فرصت" : "بی‌فرصت"}</small></b></a>`).join("")}</div></section>
      <section class="block" id="hotH"><h2>کجا فرصت بیشتر است</h2><p class="muted small">محله‌هایی با بیشترین فرصت شناسایی‌شده.</p>
        ${R.hotspots.length ? `<div class="hot">${R.hotspots.map((d) => `<a class="hot__cell" href="${link({ district: d.name, opp: 1 })}"><b>${esc(d.name)}</b><span class="hot__dots">${Array.from({ length: Math.min(d.opportunities, 24) }, (_, k) => `<i class="${k < d.gold ? "g" : ""}"></i>`).join("")}</span><small>${fa(d.opportunities)} فرصت${d.gold ? `، ${fa(d.gold)} طلایی` : ""}؛ ${fa(d.scored)} آگهی امتیازدار</small></a>`).join("")}</div>` : `<p class="muted">فعلاً فرصتی ثبت نشده است.</p>`}</section>
      <section class="block" id="ppmH"><h2>قیمت هر متر بر اساس خواب، سن بنا و متراژ</h2><p class="muted small">میانهٔ قیمت هر متر هر گروه، میلیون تومان؛ هر سه نمودار روی یک مقیاس‌اند و خط عمودی میانهٔ کل شهر است.</p>
        <div class="tri"><div><h3>خواب</h3>${hbars(R.by_rooms, o.median_ppm)}</div><div><h3>سن بنا</h3>${hbars(R.by_age, o.median_ppm)}</div><div><h3>متراژ</h3>${hbars(R.by_area, o.median_ppm)}</div></div></section>
      <section class="block" id="amenH"><h2>آسانسور، پارکینگ و انباری چقدر می‌ارزند</h2><p class="muted small">اختلاف میانهٔ قیمت هر متر خانه‌های با و بی این امکان، جدا درون هر محله تا اثر محله‌های گران و ارزان حذف شود.</p>
        <div class="amen">${R.amenities.map((a) => `<div class="amen__cell"><h3>${a.name}</h3>${amenTxt(a)}</div>`).join("")}</div>
        <p class="fn">این اختلاف بخشی از اثر نوساز بودن را هم دارد؛ ساختمان‌های نو معمولاً آسانسور و پارکینگ دارند.</p></section>
      <section class="block" id="cheapH"><h2>ارزان و گران</h2><p class="muted small">بر اساس میانهٔ قیمت هر متر؛ «دادهٔ کم» یعنی کمتر از ۱۰ آگهی.</p>
        <div class="two"><div><h3>ارزان‌ترین محله‌ها</h3>${hbars(R.cheap.map((d) => ({ ...d, label: d.name })), o.median_ppm)}</div><div><h3>گران‌ترین محله‌ها</h3>${hbars(R.pricey.map((d) => ({ ...d, label: d.name })), o.median_ppm)}</div></div></section>
      <section class="block" id="ledgerH"><h2>دفتر محله‌ها<small>همهٔ محله‌ها، هر کدام با آگهی‌های خودش</small></h2>
        <div class="ledger-tools"><input class="input" id="lgQ" placeholder="پیدا کردن محله"><select class="select" id="lgSort"><option value="ppm">گران‌ترین</option><option value="ppm_a">ارزان‌ترین</option><option value="opp">بیشترین فرصت</option><option value="n">بیشترین آگهی</option><option value="price">قیمت کل کمتر</option><option value="area">متراژ بیشتر</option><option value="gold">بیشترین طلایی</option>${deal === "sale" ? '<option value="elev">بیشترین آسانسور</option>' : ""}<option value="abc">الفبا</option></select></div>
        <div class="tbl-wrap"><table class="cmp-tbl mkt"><thead><tr><th>محله</th><th>آگهی</th><th>هر متر<small>میلیون تومان</small></th><th>${deal === "rent" ? "رهن کامل" : "قیمت کل"}<small>میانه، تومان</small></th><th>متراژ<small>میانه</small></th><th>فرصت</th><th>طلایی</th>${deal === "sale" ? "<th>آسانسور</th>" : ""}<th>در برابر شهر</th></tr></thead><tbody id="lgBody"></tbody></table></div>
        <p class="fn">محله‌هایی با دست‌کم ۳ آگهی معتبر. روی نام هر محله بزن تا آگهی‌هایش را ببینی.</p></section>
      <section class="block" id="funnelH"><h2>از آگهی خوانده‌شده تا فرصت<small>قیف همین داده؛ ستون‌ها هم‌مقیاس‌اند</small></h2>
        <div class="funnel">${R.funnel.map((f) => `<div class="funnel__row funnel__row--${f.k}"><span>${esc(f.label)}</span><span class="funnel__track"><i style="width:${Math.max(1, (f.n / fmax) * 100)}%"></i></span><b>${fa(f.n)}</b></div>`).join("")}</div>
        <div class="method-mini">
          <p><b>قیمت هر متر</b> یعنی قیمت کل تقسیم بر متراژ${deal === "rent" ? "؛ برای اجاره، رهن کامل (ودیعه + اجاره ÷ ۳٪) تقسیم بر متراژ" : ""}. همهٔ عددها <b>میانه</b>‌اند، نه میانگین: نیمی از آگهی‌ها گران‌تر و نیمی ارزان‌ترند و چند آگهی عجیب نتیجه را خراب نمی‌کند. گروه‌هایی با کمتر از ۳ آگهی نشان داده نمی‌شوند.</p>
          <p><b>فرصت</b> یعنی برچسب «فرصت طلایی» یا «فرصت مناسب»: دست‌کم ${pct(cfg.thresholds?.opp || 0.15)} فاصله با برآورد بازار و بیرون از پراکندگی عادی قیمت‌های آن، بی‌قیمت مشکوک. <b>فرصت طلایی</b> فاصلهٔ بیشتری دارد (دست‌کم ${pct(cfg.thresholds?.gold || 0.22)}).</p>
          <p class="muted small">منبع: آگهی‌های عمومی ${UI.dealName(deal)} ${KG[kind]} ${esc(cname)}${cfg.updated ? `، به‌روزرسانی ${UI.ago(cfg.updated)}` : ""}.</p>
        </div></section>`;
    const drawLedger = () => {
      const q = UI.fold($("#lgQ").value || "");
      const k = $("#lgSort").value;
      const by = { ppm: (a, b) => b.median_ppm - a.median_ppm, ppm_a: (a, b) => a.median_ppm - b.median_ppm, opp: (a, b) => b.opportunities - a.opportunities, n: (a, b) => b.n - a.n,
        price: (a, b) => a.median_price - b.median_price, area: (a, b) => b.median_area - a.median_area, gold: (a, b) => b.gold - a.gold, elev: (a, b) => (b.elevator_share || 0) - (a.elevator_share || 0), abc: (a, b) => a.name.localeCompare(b.name, "fa") }[k];
      const rows = R.districts.filter((d) => !q || UI.fold(d.name).includes(q)).sort((a, b) => (q ? (UI.fold(b.name).startsWith(q) ? 1 : 0) - (UI.fold(a.name).startsWith(q) ? 1 : 0) : 0) || by(a, b));
      $("#lgBody").innerHTML = rows.length ? rows.map((d) => `<tr class="${d.low ? "low-n" : ""}"><th><a href="${link({ district: d.name })}"><b>${esc(d.name)}</b></a>${d.low ? ' <small class="muted">دادهٔ کم</small>' : ""}</th><td>${fa(d.n)}</td><td><b>${mln(d.median_ppm)}</b></td><td>${money(d.median_price)}</td><td>${fa(Math.round(d.median_area))}</td><td>${d.opportunities ? `<a href="${link({ district: d.name, opp: 1 })}">${fa(d.opportunities)}</a>` : "—"}</td><td>${d.gold ? fa(d.gold) : "—"}</td>${deal === "sale" ? `<td>${d.elevator_share != null ? pct(d.elevator_share) : "—"}</td>` : ""}<td><span class="${d.vs_city > 0 ? "up" : "down"}">${d.vs_city == null || Math.abs(d.vs_city) < 0.01 ? "هم‌قیمت" : pct(d.vs_city) + (d.vs_city > 0 ? " گران‌تر" : " ارزان‌تر")}</span></td></tr>`).join("")
        : `<tr><td colspan="9" class="muted">محله‌ای با «${esc($("#lgQ").value)}» پیدا نشد.</td></tr>`;
    };
    $("#lgQ").addEventListener("input", drawLedger);
    $("#lgSort").addEventListener("change", drawLedger);
    $$("[data-jump]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" }); }));
    drawLedger();
  }

  /* ---------- روش ارزش‌گذاری ---------- */
  function methodPage() {
    const th = cfg.thresholds || {};
    view().innerHTML = `<article class="section--tight"><div class="wrap method">
      <span class="kicker">روش ارزش‌گذاری</span>
      <h1>${esc(cfg.site.name)} هر آگهی را چطور با محلهٔ خودش می‌سنجد</h1>
      <p class="lead">همهٔ مراحل خودکار است و با هر دستهٔ تازه از آگهی‌ها از نو انجام می‌شود. هیچ انسانی آگهی‌ها را دستی امتیاز نمی‌دهد.</p>
      <h2>۱. گردآوری</h2>
      <p>آگهی‌های ملک ${fa(CITIES.length)} شهر از استان‌های ${PROVINCES.map((p) => p.name).join("، ")}، به‌تدریج و با رعایت سقف درخواست، خوانده می‌شوند. صفحهٔ کامل هر آگهی برای استخراج مشخصات خوانده و هر تغییر قیمت ثبت می‌شود. هر آگهی از روی محله و متنش «شهری» یا «روستایی» برچسب می‌خورد.</p>
      <h2>۲. کنار گذاشتن</h2>
      <p>قیمت نمادین یا توافقی، مشارکت در ساخت، معاوضه، فروش دانگی، هم‌خانه و آگهی تکراری کنار می‌روند. قیمت‌هایی که با محلهٔ خودشان نمی‌خوانند (فاصلهٔ لگاریتمی با معیار MAD بیش از ۳٫۵) یا احتمالاً یک صفر کم یا زیاد دارند، یا قیمت هر متر را به جای قیمت کل نوشته‌اند، «مشکوک» می‌شوند. هیچ‌کدام در محاسبهٔ قیمت محله شرکت داده نمی‌شوند.</p>
      <h2>۳. قیمت محله برای همین خانه</h2>
      <p>قیمت هر متر به متراژ، سن بنا، طبقه، آسانسور، پارکینگ، انباری، سند و ویژگی‌های دیگر بستگی دارد؛ پس میانهٔ خام آگهی‌های یک محله کافی نیست. اگر بیشتر آگهی‌های یک محله نوساز باشند، میانهٔ خام برای یک خانهٔ قدیمی بیش از حد بالاست و آن را به اشتباه «ارزان» نشان می‌دهد. برای همین، اثر هر ویژگی با یک مدل آماری از خود آگهی‌ها برآورد می‌شود (رگرسیون مقاوم که آگهی‌های غیرعادی ضریب‌ها را منحرف نکنند؛ اثر متراژ و سن غیرخطی است و طبقهٔ بالا بدون آسانسور جدا سنجیده می‌شود). «قیمت محله» میانهٔ قیمت‌هایی است که برای ویژگی‌ها تعدیل شده‌اند؛ مدل و قیمت محله چند دور به‌تناوب از نو ساخته می‌شوند تا به هم برسند. قیمت منصفانهٔ هر آگهی یعنی قیمت محله به‌اضافهٔ اثر ویژگی‌های همان خانه. محله‌ای که کمتر از ۵ آگهی معتبر هم‌نوع دارد سنجیده نمی‌شود و هیچ آگهی با میانهٔ شهر مقایسه نمی‌شود.</p>
      <p><b>بدون خوداثری:</b> قیمت محلهٔ هر آگهی بدون خود آن آگهی ساخته می‌شود تا قیمت خودش در معیار سنجش خودش اثر نگذارد.</p>
      <p><b>تأیید دوگانه:</b> علاوه بر مدل، نزدیک‌ترین آگهی‌های مشابه همان محله (از نظر متراژ، سن، طبقه، تعداد خواب، آسانسور و پارکینگ) جداگانه مقایسه می‌شوند. فرصت فقط وقتی اعلام می‌شود که هر دو روش فاصلهٔ کافی نشان دهند و این فاصله از عدم‌قطعیت برآورد (پراکندگی قیمت‌های محله به‌اضافهٔ خطای خود قیمت محله که با تعداد آگهی‌ها کم می‌شود) بزرگ‌تر باشد.</p>
      <p><b>مقاوم در برابر قیمت‌سازی:</b> ${esc(cfg.site.name)} قیمت تعیین نمی‌کند و نباید مبنای قیمت‌گذاری فروشنده شود. در ساختن قیمت محله، افزایش قیمتِ پس از درج آگهی نادیده گرفته می‌شود؛ پس اگر فروشنده‌ای پس از دیدن سایت قیمتش را بالا ببرد، قیمت محله برای بقیه بالا نمی‌رود و خود آن آگهی «بالاتر از قیمت محله» دیده می‌شود. قیمت محله میانه است، نه میانگین، و یک یا چند آگهی نمی‌توانند آن را جابه‌جا کنند. درصد دقیق فاصله و قیمت مورد انتظار فقط برای مشترکان نمایش داده می‌شود و دیگران بازهٔ ۵ درصدی می‌بینند.</p>
      <p><b>مقاوم در برابر تبانی:</b> اگر چند دلال در یک محله آگهی‌های گران بگذارند تا قیمت محله بالا برود، اثرش خنثی می‌شود: آگهی‌های یک فروشنده (همان شمارهٔ تماس یا همان متن الگو با عددهای متفاوت) در هر محله روی هم فقط یک رأی دارند، قیمت محله دست‌کم از ۳ فروشندهٔ مستقل ساخته می‌شود، قیمت هر محله با محله‌های مجاورش سنجیده می‌شود و فاصلهٔ غیرعادیِ کم‌پشتوانه به سمت آن‌ها برمی‌گردد، آگهی‌های هم‌فروشندهٔ یک آگهی در قیمت محلهٔ خودش و در مقایسه با مشابه‌ها شرکت نمی‌کنند، و تعداد مؤثر نمونه (که عدم‌قطعیت را تعیین می‌کند) هم از همین وزن‌ها می‌آید.</p>
      <p><b>گزارش کاربران:</b> هیچ آگهی‌ای با گزارش خودکار حذف نمی‌شود. وقتی گزارش‌ها از دست‌کم ۳ کاربر واردشدهٔ متفاوت باشد و در دست‌کم ۱۲ ساعت پخش شده باشد، آگهی «در حال بررسی» می‌شود و تا تصمیم مدیر در قیمت محله شرکت نمی‌کند؛ گزارش مهمان وزن کمتری دارد و گزارش‌دهنده‌ای که گزارش‌هایش رد شده، اعتبار کمتری می‌گیرد.</p>
      <p><b>سنجش دقت:</b> برای هر گروه، قیمت منصفانهٔ هر آگهی بدون خودش برآورد و با قیمت درخواستی‌اش مقایسه می‌شود و میانهٔ این خطا در پنل گزارش می‌شود تا دقت فرمول همیشه قابل وارسی باشد.</p>
      <h2>۴. حکم</h2>
      <p><b>فرصت طلایی</b>: دست‌کم ${pct(th.gold || 0.22)} فاصله با برآورد بازار و بیرون از پراکندگی عادی آن. <b>فرصت مناسب</b>: دست‌کم ${pct(th.opp || 0.15)} فاصله با برآورد بازار و بیرون از پراکندگی عادی. <b>منصفانه</b>: نزدیک قیمت محله، یا فاصله‌ای که در محله‌های پرپراکندگی هنوز عادی است. <b>بالاتر از بازار</b>: دست‌کم ${pct(th.opp || 0.15)} گران‌تر. <b>مشکوک</b>: بیش از ${pct(th.sus || 0.4)} ارزان‌تر، یا دست‌کم ${pct(th.sus_flagged || 0.25)} ارزان‌تر همراه با «عکس‌ها مال این ملک نیست» یا چند قیمت در متن، یا ارزان با متن مشکوک.</p>
      <h2>۵. امتیاز و اطمینان</h2>
      <p>امتیاز رتبهٔ آگهی در محلهٔ خودش است: فرصت‌ها بین ۶۵ تا ۱۰۰، بر پایهٔ رتبه در میان فرصت‌های همان محله و عمق فاصله؛ آگهی هم‌قیمت محله ۵۰ و آگهی‌ای که فرصت نیست حداکثر ۶۴. اطمینان «بالا» یعنی دست‌کم ۱۵ آگهی مقایسه در همان محله و مشخصات کافی؛ «متوسط» یعنی ۸ تا ۱۴ آگهی و «کم» یعنی ۵ تا ۷ آگهی در محله.</p>
      <h2>۶. زمان آگهی</h2>
      <p>قیمت هر آگهی قیمت روزی است که درج شده؛ آگهی دو ماه پیش ممکن است دیگر با بازار امروز نخواند. برای همین سه کار انجام می‌شود: آگهی‌های قدیمی‌تر از ${fa(th.max_age_days || 90)} روز در قیمت محله شرکت داده نمی‌شوند؛ در میانهٔ محله آگهی‌های تازه‌تر وزن بیشتری دارند (وزن هر آگهی هر ${fa(th.half_life_days || 45)} روز نصف می‌شود)؛ و روند ماهانهٔ قیمت از خود آگهی‌ها برآورد می‌شود و قیمت آگهی‌های قدیمی‌تر با آن به نرخ امروز آورده می‌شود. اطمینان حکم آگهی‌ای که بیش از ۳۰ روز از درجش گذشته یک درجه پایین می‌آید.</p>
      <h2>۷. پیش‌فروش</h2>
      <p>پیش‌فروش بازار جداست و با آگهی‌های آماده قاطی نمی‌شود. مرجع هر پیش‌فروش، قیمت منصفانهٔ «همین واحد اگر نوساز و آماده بود» در همان محله است. سپس نسبت معمول قیمت پیش‌فروش به آماده از خود آگهی‌های پیش‌فروش برآورد می‌شود و هرچه زمان تحویل دورتر باشد تخفیف بیشتری دارد (زمان تحویل از متن آگهی خوانده می‌شود: تاریخ تحویل، چند ماه تا تحویل، یا مرحله و درصد پیشرفت ساخت). اگر محله دست‌کم ۵ پیش‌فروش از ۳ فروشنده داشته باشد، نسبت از همان محله می‌آید وگرنه از استان. عدم‌قطعیت پیش‌فروش بیشتر است و آستانهٔ فرصتش ${pct(th.presale_extra ?? 0.05)} سخت‌تر.</p>
      <h2>۸. نشانه‌های متن</h2>
      <p>متن هر آگهی برای «شاید دلیل ارزانی» (فروشندهٔ عجول، معاوضه، آگهی خود مالک، قیمت سازنده، کوچهٔ باریک یا بافت فرسوده، واحد جدا در خانهٔ حیاط‌دار) و «پیش از خرید استعلام کن» (سند قول‌نامه‌ای یا وکالتی، زمین وقفی، سند یا پایان‌کار ناقص، نوع سند نامشخص، مستأجر، رهن یا وام) خوانده می‌شود.</p>
      <h2>محدودیت‌ها</h2>
      <p>قیمت‌های آگهی‌ها قیمت پیشنهادی‌اند، نه قیمت معامله‌شده. تشخیص نشانه‌ها و شهری یا روستایی بودن از روی متن است و ممکن است خطا کند. در محله‌های کم‌آگهی اطمینان پایین‌تر است و همین روی هر آگهی نشان داده می‌شود.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px"><a class="btn btn--hot btn--lg" href="#/s?sort=score&opp=1">دیدن فرصت‌ها</a><a class="btn btn--line btn--lg" href="#/market">بازار محله‌ها</a></div>
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
  function openReportDialog(id) {
    openDialog(`<div class="dlg__head"><h2>گزارش اشکال در آگهی</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <p class="muted" style="margin-bottom:14px">اگر این آگهی فروخته شده یا قیمت و عکسش واقعی نیست، گزارش دهید. هیچ آگهی‌ای با گزارش خودکار حذف نمی‌شود؛ وقتی چند کاربر مستقل در زمان‌های مختلف گزارش دهند، آگهی بررسی می‌شود. گزارش کاربران واردشده وزن بیشتری دارد.</p>
      <form class="form-grid" id="flagForm">
        <label class="field" style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="radio" name="flagReason" value="sold" checked> ملک قبلاً فروخته یا اجاره داده شده است</label>
        <label class="field" style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="radio" name="flagReason" value="fake_price"> قیمت واقعی نیست (قیمت دروغین برای جلب تماس)</label>
        <label class="field" style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="radio" name="flagReason" value="fake_photos"> عکس‌ها غیرواقعی یا دانلودی است</label>
        <label class="field" style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="radio" name="flagReason" value="scam"> مشکوک به کلاهبرداری یا نقص سندی معارض</label>
        <button class="btn btn--hot btn--lg" type="submit" id="flagBtn" style="margin-top:8px">ثبت گزارش</button>
      </form>`);
    const f = $("#flagForm");
    if (f) {
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const reason = $('input[name="flagReason"]:checked')?.value || "fake_price";
        const btn = $("#flagBtn");
        btn.disabled = true;
        try {
          let msg = "گزارش شما ثبت شد";
          if (DataLayer.server) {
            const r = await DataLayer.flag(id, reason);
            msg = r.message || msg;
          }
          $("#dlg").close();
          toast(msg);
        } catch (err) {
          toast(err.message || "خطا در ارسال گزارش");
        }
        btn.disabled = false;
      });
    }
  }

  window.openReportDialog = openReportDialog;

  function openDialog(html, wide = false) {
    const d = $("#dlg");
    $("#dlgBody").innerHTML = html;
    d.className = "dlg" + (wide ? " dlg--wide" : "");
    if (!d.open) {
      history.pushState({ modal: "dialog" }, "", location.hash);
      d.showModal();
      const onPop = () => {
        if (d.open) d.close();
        window.removeEventListener("popstate", onPop);
      };
      window.addEventListener("popstate", onPop);
      d.addEventListener("close", () => {
        window.removeEventListener("popstate", onPop);
      }, { once: true });
    }
  }

  /* ---------- دستیار ---------- */
  const ai = (() => {
    const log = () => $("#aiLog");
    const say = (html, who = "bot") => { const d = document.createElement("div"); d.className = "msg msg--" + who; d.innerHTML = html; log().appendChild(d); log().scrollTop = 1e9; return d; };
    const sugs = (l) => { $("#aiSugs").innerHTML = l.map((s) => `<button class="chip">${esc(s)}</button>`).join(""); };
    function open() {
      $("#ai").hidden = false; $("#aiFab").classList.add("is-hidden");
      if (!log().children.length) {
        const { path } = parseHash();
        say("سلام! من تحلیلگر فرصت ملکم و با دادهٔ زندهٔ همین سایت جواب می‌دهم. می‌توانی جست‌وجو کنی («آپارتمان ۲ خوابه رشت زیر ۸ میلیارد»)، شهرها را مقایسه کنی، ارزان‌ترین یا پرفرصت‌ترین محله‌ها را بپرسی، با بودجه‌ات بپرسی کجا بخری، یا دربارهٔ یک آگهی بپرسی «ارزش خرید دارد؟».");
        sugs(path.startsWith("ad/") ? ["این ملک ارزش خرید دارد؟", "آگهی‌های مشابه ارزان‌تر", "امتیاز چطور حساب می‌شود؟"]
          : ["رشت یا ساری؟", "ارزان‌ترین محله‌های رشت", "با ۵ میلیارد کجا آپارتمان بخرم؟", "پرفرصت‌ترین محله‌های گرگان"]);
      }
      setTimeout(() => $("#aiInput").focus(), 50);
    }
    const mini = (ls) => `<div class="mini">${ls.map((l) => `<a href="#/ad/${encodeURIComponent(l.id)}"><span class="mini__img">${UI.media(l)}</span><span><b>${UI.tt(l.title)}</b><small>${l.score != null ? fa(Math.round(l.score)) + " امتیاز، " : ""}${esc(UI.pinLabel(l))}${l.verdict && l.verdict.delta < 0 ? "، " + UI.gapPct(l.verdict) + " فاصله با برآورد" : ""}</small></span></a>`).join("")}</div>`;
    const nz = (t) => UI.fold(t);
    const citiesIn = (t) => { const f = nz(t); return CITIES.filter((c) => f.includes(nz(c.name))).sort((a, b) => f.indexOf(nz(a.name)) - f.indexOf(nz(b.name))); };
    const rep = async (c) => (await DataLayer.market(c, "sale", "apartment").catch(() => ({}))).report;
    const bars = (rows, val, lab, fmt) => {
      const mx = Math.max(...rows.map(val), 1);
      return `<div class="abars">${rows.map((r) => `<div><span>${esc(lab(r))}</span><i style="--w:${Math.max(4, (val(r) / mx) * 100).toFixed(0)}%"></i><b>${fmt(r)}</b></div>`).join("")}</div>`;
    };
    const budgetOf = (t) => {
      const f = NLP.normalize(t), m = f.match(/(\d+(?:[.,/]\d+)?)\s*(میلیارد|میلیون)/);
      return m ? parseFloat(m[1].replace(/[,/]/, ".")) * (m[2] === "میلیارد" ? 1e9 : 1e6) : 0;
    };
    async function analyst(v) {
      const f = nz(v), cs = citiesIn(v);
      const { path } = parseHash(), [pg, arg] = path.split("/");
      // ۱) «این ملک ارزش خرید دارد؟» در صفحهٔ آگهی، یا با پیوند آگهی
      const link = v.match(/\/ad\/([\w-]+)/);
      if (link || (pg === "ad" && arg && /(ارزش|بخرم|خوبه|خوب\s*است|منصفانه|گرون|گران|ارزون|ارزان|این\s*(ملک|آگهی|خونه|خانه))/.test(v))) {
        const l = await DataLayer.get(decodeURIComponent(link ? link[1] : arg)).catch(() => null);
        if (!l) { say("این آگهی را پیدا نکردم."); return true; }
        const vd = l.verdict || {}, ex = l.explain || {};
        const verdictTxt = !vd.label ? "هنوز داده کافی برای سنجش این آگهی نیست." : vd.label === "gold" || vd.label === "good" ? "بله، در سنجش ما فرصت مناسبی است." : vd.label === "fair" ? "قیمتش نزدیک ارزش واقعی است؛ فرصت ویژه‌ای نیست ولی گران هم نیست." : vd.label === "sus" ? "احتیاط: ارزانی‌اش باورپذیر نیست؛ پیش از هر اقدامی استعلام کنید." : "خیر؛ در سنجش ما بالاتر از ارزش واقعی است و جای چانه‌زنی دارد.";
        say(`<b>${esc(UI.tt(l.title))}</b><br>${UI.labelPill(vd)} ${esc(UI.gapText(vd))}<br>${verdictTxt}${l.score != null ? `<br>امتیاز فرصت: <b>${fa(Math.round(l.score))}</b> از ۱۰۰` : ""}${vd.fair && !vd.approx ? `<br>ارزش تخمینی: <b>${money(vd.fair)} تومان</b>` : ""}${ex.district_n ? `<br>مقایسه با ${fa(ex.district_n)} آگهی همین محله${ex.sellers ? ` از ${fa(ex.sellers)} فروشندهٔ مستقل` : ""}.` : ""}${(ex.caution || []).length ? `<br><small>پیش از خرید: ${esc(ex.caution.slice(0, 2).join("؛ "))}</small>` : ""}<br><a href="#/ad/${encodeURIComponent(l.id)}">شناسنامهٔ کامل قیمت</a>`);
        sugs(["آگهی‌های مشابه ارزان‌تر", "قیمت هر متر این محله"]);
        return true;
      }
      // ۲) مقایسهٔ دو یا چند شهر
      if (cs.length >= 2 && /(مقایسه|یا|بهتر|فرق|تفاوت|کدام|کدوم)/.test(v)) {
        const rs = (await Promise.all(cs.slice(0, 4).map(async (c) => ({ c, R: await rep(c.id) })))).filter((x) => x.R && x.R.overview.valid);
        if (rs.length < 2) { say("برای مقایسه، دادهٔ کافی از دست‌کم دو شهر لازم است."); return true; }
        const o = (x) => x.R.overview;
        const cheap = [...rs].sort((a, b) => o(a).median_ppm - o(b).median_ppm)[0], opp = [...rs].sort((a, b) => (o(b).per100 || 0) - (o(a).per100 || 0))[0];
        say(`<b>مقایسهٔ آپارتمان فروشی</b>${bars(rs, (x) => o(x).median_ppm, (x) => x.c.name, (x) => "متری " + money(o(x).median_ppm))}
          ارزان‌تر: <b>${esc(cheap.c.name)}</b>. سهم فرصت‌ها بیشتر در <b>${esc(opp.c.name)}</b> (${fa(Math.round(o(opp).per100 || 0))} فرصت در هر ۱۰۰ آگهی سنجیده).<br>
          ${rs.map((x) => `<a href="#/s?${toQuery({ city: x.c.id, sort: "score", opp: 1 })}">فرصت‌های ${esc(x.c.name)}</a>`).join(" · ")}`);
        return true;
      }
      // ۳) با بودجهٔ مشخص کجا بخرم؟
      const budget = budgetOf(v);
      if (budget && /(کجا|کدام|کدوم|چه\s*محله|چه\s*شهر|پیشنهاد|بخرم|بگیرم)/.test(v)) {
        const pool = (cs.length ? cs : Object.entries(DataLayer.stats.cities || {}).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([id]) => CITIES.find((c) => c.id === id)).filter(Boolean));
        const rows = [];
        for (const c of pool) { const R = await rep(c.id); (R?.districts || []).forEach((d) => { if (d.median_price && d.median_price <= budget) rows.push({ ...d, c }); }); }
        rows.sort((a, b) => (b.opportunities - a.opportunities) || (b.median_area - a.median_area));
        if (!rows.length) { say(`با ${money(budget)} تومان، در محله‌های سنجیده‌شده میانهٔ قیمت آپارتمان بالاتر است. محله‌های ارزان‌تر یا متراژ کمتر را امتحان کنید. <a href="#/s?${toQuery({ max: budget, sort: "score" })}">آگهی‌های تا این بودجه</a>`); return true; }
        const top = rows.slice(0, 6);
        say(`<b>با ${money(budget)} تومان</b>، محله‌هایی که میانهٔ قیمت آپارتمانشان در بودجهٔ شماست (پرفرصت‌ترها اول):${bars(top, (d) => d.median_area || 1, (d) => d.name + "، " + d.c.name, (d) => fa(Math.round(d.median_area || 0)) + " متر · " + fa(d.opportunities) + " فرصت")}
          <a href="#/s?${toQuery({ city: [...new Set(top.map((d) => d.c.id))].join(","), max: budget, sort: "score", opp: 1 })}">فرصت‌های تا این بودجه</a>`);
        return true;
      }
      // ۴) ارزان‌ترین، گران‌ترین یا پرفرصت‌ترین محله‌های یک شهر
      const ext = /(ارزان|ارزون)/.test(v) ? "cheap" : /(گران|گرون|لوکس|بالاشهر)/.test(v) ? "pricey" : /(فرصت|پرفرصت|بهترین)/.test(v) && /محله/.test(v) ? "opp" : null;
      if (ext && /محله/.test(v) && cs.length) {
        const R = await rep(cs[0].id);
        const ds = (R?.districts || []).filter((d) => !d.low);
        if (!ds.length) { say(`برای محله‌های ${esc(cs[0].name)} هنوز دادهٔ کافی نیست.`); return true; }
        const sorted = ext === "cheap" ? [...ds].sort((a, b) => a.median_ppm - b.median_ppm) : ext === "pricey" ? [...ds].sort((a, b) => b.median_ppm - a.median_ppm) : [...ds].sort((a, b) => b.opportunities - a.opportunities);
        const top = sorted.slice(0, 6);
        say(`<b>${ext === "cheap" ? "ارزان‌ترین" : ext === "pricey" ? "گران‌ترین" : "پرفرصت‌ترین"} محله‌های ${esc(cs[0].name)}</b> (آپارتمان، قیمت هر متر):${bars(top, (d) => ext === "opp" ? d.opportunities || 0 : d.median_ppm, (d) => d.name, (d) => ext === "opp" ? fa(d.opportunities) + " فرصت" : "متری " + money(d.median_ppm))}<a href="#/market?city=${cs[0].id}">همهٔ محله‌های ${esc(cs[0].name)}</a>`);
        return true;
      }
      // ۵) قیمت هر متر یک محلهٔ مشخص (با یا بدون نام شهر)
      if (/(قیمت|متری|هر\s*متر|چند)/.test(v)) {
        const pool = cs.length ? cs : Object.entries(DataLayer.stats.cities || {}).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([id]) => CITIES.find((c) => c.id === id)).filter(Boolean);
        for (const c of pool) {
          const R = await rep(c.id);
          const d = (R?.districts || []).find((x) => x.name && nz(x.name).length > 2 && f.includes(nz(x.name)));
          if (d) {
            say(`میانهٔ قیمت هر متر آپارتمان در <b>${esc(d.name)}، ${esc(c.name)}</b>: <b>${money(d.median_ppm)} تومان</b> از ${fa(d.n)} آگهی${d.vs_city != null ? `؛ ${d.vs_city >= 0 ? fa(Math.round(d.vs_city * 100)) + "٪ بالاتر" : fa(Math.round(-d.vs_city * 100)) + "٪ پایین‌تر"} از میانهٔ شهر` : ""}. ${d.opportunities ? `${fa(d.opportunities)} فرصت شناسایی‌شده دارد.` : ""}<br><a href="#/s?${toQuery({ city: c.id, district: d.name, sort: "score" })}">آگهی‌های ${esc(d.name)}</a>`);
            return true;
          }
        }
      }
      if (/روند/.test(v) && cs.length) { say(`روند قیمت و جدول محله‌های ${esc(cs[0].name)} را در <a href="#/market?city=${cs[0].id}">صفحهٔ بازار ${esc(cs[0].name)}</a> ببینید.`); return true; }
      return false;
    }
    async function respond(v) {
      const it = NLP.intent(v);
      if (it === "greet") { say("درود! کدام شهر و چه نوع ملکی؟ بودجه را هم بگو."); return; }
      if (it === "method") { say(`امتیاز از فاصله قیمت آگهی تا قیمت منصفانه محله (با درنظرگرفتن سن بنا، طبقه، متراژ، آسانسور، پارکینگ، سند و ویژگی‌های دیگر)، اطمینان برآورد، کیفیت آگهی و تحولات قیمت ساخته می‌شود. <a href="#/method">توضیح کامل روش</a>`); return; }
      if (it === "plans") { const p = cfg.plans || []; say(p.length ? `اشتراک‌ها: ${p.map((x) => `${esc(x.name)} ${fa(x.price)} تومان`).join("، ")}. با اشتراک، پیوند مستقیم آگهی اصلی و جزئیات کامل ارزش‌گذاری باز می‌شود. <a href="#/account">خرید اشتراک</a>` : "تعرفه اشتراک به‌زودی اعلام می‌شود."); return; }
      if (it === "loan") {
        const m = NLP.parseQuery(v).filters.max || 1e9, yr = +(NLP.normalize(v).match(/(\d+)\s*سال/) || [])[1] || 5;
        const r = 0.23 / 12, n = yr * 12, pay = (m * r) / (1 - Math.pow(1 + r, -n));
        say(`قسط وام ${money(m)} تومان با سود ۲۳٪ در ${fa(yr)} سال: حدود <b>${fa(Math.round(pay))} تومان</b> در ماه. نرخ را در بخش ابزارها تغییر بده.`);
        return;
      }
      // پرسش‌های تحلیلی از دادهٔ زندهٔ خود سایت (بدون سرویس خارجی؛ در قطع اینترنت بین‌الملل هم کار می‌کند)
      if (await analyst(v)) return;
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
      $("#aiLog").addEventListener("click", (e) => {
        const a = e.target.closest("a");
        if (a && a.getAttribute("href")?.startsWith("#/")) {
          $("#ai").hidden = true;
          $("#aiFab")?.classList.remove("is-hidden");
        }
      });
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
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("fmTheme", t === "dark" ? "dark" : "light"); } catch (e) { /* حالت خصوصی */ }
    const isDark = document.documentElement.dataset.theme === "dark";
    const btn = $("#themeBtn") || document.querySelector(".theme-btn, [data-theme-btn]");
    if (btn) {
      btn.innerHTML = isDark ? UI.icon("moon") : UI.icon("sun");
      btn.setAttribute("title", isDark ? "حالت روشن" : "حالت تاریک");
    }
    // کادر زنده با تم عوض می‌شود (کرهٔ روز یا شب)
    if (live && live.globe && $("#sky")) { const o = live.opts, sel = live.sel; initLive(DataLayer.stats, { ...o, sel: sel ? { cities: sel.ids } : o.sel }); }
  }
  /* ---------- انیمیشن ورود تدریجی و تعاملات بصری (مشکل ۳) ---------- */
  function applyScrollReveals() {
    if (!("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: "0px 0px -30px 0px" });

    document.querySelectorAll(".card, .block, .section, .strip > div, .trust__item, .how__card, .hero__grid > div").forEach((elem) => {
      if (!elem.classList.contains("reveal-on-scroll")) {
        elem.classList.add("reveal-on-scroll");
        obs.observe(elem);
      }
    });
  }

  function bindGlobal() {
    // دکمهٔ حساب: پیش از ورود به صفحهٔ حساب می‌رود؛ پس از ورود منوی حساب را باز می‌کند
    const ab = $("#accountBtn");
    ab.setAttribute("aria-haspopup", "menu"); ab.setAttribute("aria-expanded", "false");
    ab.addEventListener("click", (e) => { if (!DataLayer.me) return; e.preventDefault(); acctMenu(); });
    addEventListener("keydown", (e) => { if (e.key === "Escape") closeAcctMenu(); });
    addEventListener("hashchange", closeAcctMenu);
    addEventListener("resize", closeAcctMenu);
    const top = document.querySelector(".top");
    // نوار جست‌وجوی جمع‌شونده و اندازهٔ نقشه بر پایهٔ ارتفاع واقعی نوارها
    const measure = () => {
      const sb = document.querySelector(".sbar");
      document.documentElement.style.setProperty("--top-h", top.offsetHeight + "px");
      if (sb) document.documentElement.style.setProperty("--sbar-h", sb.offsetHeight + "px");
    };
    // فضای آزادشده با حاشیهٔ پایین جبران می‌شود تا ارتفاع صفحه و جای پیمایش نپرد (در صفحه‌های کوتاه هم کار کند)
    const onScroll = () => {
      const sb = document.querySelector(".sbar");
      if (!sb || sb.querySelector(".dd.is-open")) return;
      const compact = sb.classList.contains("is-compact"), want = scrollY > (compact ? 20 : 60);
      if (want === compact) return;
      if (want) {
        const full = sb.offsetHeight;
        sb.classList.add("is-compact");
        sb.style.marginBottom = Math.max(0, full - sb.offsetHeight) + "px";
      } else {
        sb.classList.remove("is-compact");
        sb.style.marginBottom = "";
      }
      measure();
      setTimeout(() => state.map && state.map.invalidateSize(), 260);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", measure, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
    $("#menuBtn").addEventListener("click", () => { const on = top.classList.toggle("is-menu"); $("#menuBtn").setAttribute("aria-expanded", on); });
    // منوی پویا: اگر سربرگ در عرض واقعی صفحه (با هر بزرگ‌نمایی مرورگر) جا نشود، منو به دکمهٔ «منو» جمع می‌شود
    const fitNav = () => {
      const inner = $(".top__in"), nav = $(".nav");
      if (!inner || !nav) return;
      top.classList.remove("top--collapse");
      if (getComputedStyle(nav).display === "none") return;   // موبایل: از قبل جمع است
      // جمع پهنای طبیعی برند، پیوندها و دکمه‌ها با فاصله‌ها، در برابر پهنای واقعی سربرگ
      const gap = parseFloat(getComputedStyle(inner).columnGap) || 0;
      const need = [...inner.children].reduce((w, c) => w + (c === nav ? nav.scrollWidth : c.getBoundingClientRect().width), 0) + gap * (inner.children.length - 1);
      const over = need > inner.clientWidth - 8;
      top.classList.toggle("top--collapse", over);
      if (!over) top.classList.remove("is-menu");
    };
    let fitT = 0;
    addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(fitNav, 60); });
    document.fonts?.ready.then(fitNav);
    new MutationObserver(() => { clearTimeout(fitT); fitT = setTimeout(fitNav, 60); }).observe($("#accountLabel") || top, { childList: true, characterData: true, subtree: true });
    fitNav();
    $$(".nav a").forEach((a) => a.addEventListener("click", () => { top.classList.remove("is-menu"); $("#menuBtn").setAttribute("aria-expanded", "false"); }));
    document.addEventListener("click", (e) => { if (!e.target.closest(".top")) top.classList.remove("is-menu"); });
    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) {
      shareBtn.onclick = async () => {
        const data = { title: document.title, url: window.location.href };
        if (navigator.share) {
          try { await navigator.share(data); } catch(e) {}
        } else {
          await navigator.clipboard.writeText(window.location.href);
          if (typeof toast === "function") toast("لینک صفحه در حافظه کپی شد");
        }
      };
    }
    $("#themeBtn").addEventListener("click", () => {
      const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; applyTheme(t); store.set("theme_v2", t); window.FMTheme && FMTheme.choose(t);
    });
    $("#dlg").addEventListener("click", (e) => { if (e.target.id === "dlg" || e.target.closest("[data-close]")) $("#dlg").close(); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".dd")) $$(".dd.is-open").forEach((d) => d.classList.remove("is-open")); });
    view().addEventListener("click", (e) => {
      const f = e.target.closest("[data-fav]"); if (f) { e.preventDefault(); e.stopPropagation(); toggleFav(f.dataset.fav); }
      const sh = e.target.closest("[data-adshare]"); if (sh) { e.preventDefault(); e.stopPropagation(); window.__fmAdShare && window.__fmAdShare(); return; }
      const cs = e.target.closest("[data-cshare]");
      if (cs) {
        e.preventDefault(); e.stopPropagation();
        const cl = UI.cards && UI.cards[cs.dataset.cshare];
        if (cl && window.FM && FM.shareSheet) FM.shareSheet(posterCard(cl), location.origin + "/ad/" + encodeURIComponent(cl.id));
      }
      const fl = e.target.closest("[data-flag]"); if (fl) { e.preventDefault(); e.stopPropagation(); openReportDialog(fl.dataset.flag); }
    });
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

function renderPriceSpectrumGauge(data) {
  /*
    data شامل: price_per_sqm (این آگهی)، fair_sqm (منصفانه)، median_sqm (میانه محله)،
    min_sqm (کف محله)، max_sqm (سقف محله) و state ('opportunity' | 'balanced' | 'overpriced')
  */
  const min = data.min_sqm || (data.median_sqm * 0.65);
  const max = data.max_sqm || (data.median_sqm * 1.35);
  const current = data.price_per_sqm || 48;
  const fair = data.fair_sqm || 50.8;
  const median = data.median_sqm || 68.6;

  // محاسبه درصد موقعیت روی محور (بین ۵٪ تا ۹۵٪)
  const range = Math.max(1, max - min);
  const currentPct = Math.min(95, Math.max(5, ((current - min) / range) * 100));
  const fairPct = Math.min(95, Math.max(5, ((fair - min) / range) * 100));
  const medianPct = Math.min(95, Math.max(5, ((median - min) / range) * 100));

  // رنگ و پیام نشانگر بر اساس وضعیت ملک
  let badgeColor = 'bg-emerald-600 text-white';
  let badgeTitle = 'زیر قیمت منصفانه';
  if (data.state === 'balanced') {
    badgeColor = 'bg-blue-600 text-white';
    badgeTitle = 'قیمت منصفانه عرف';
  } else if (data.state === 'overpriced') {
    badgeColor = 'bg-rose-600 text-white';
    badgeTitle = 'بالاتر از ارزش واقعی';
  } else if (data.state === 'opportunity_defective') {
    badgeColor = 'bg-sky-600 text-white';
    badgeTitle = 'مناسب با کسر امکانات';
  }

  return `
    <div class="spectrum-gauge-box p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-right my-3" dir="rtl">
      <div class="flex items-center justify-between text-xs mb-3">
        <span class="font-bold text-slate-200">طیف قیمت کارشناسی در مقایسه با محله</span>
        <span class="px-2 py-0.5 rounded text-[11px] font-bold ${badgeColor}">
          ${badgeTitle}
        </span>
      </div>

      <!-- نوار طیف ۳ رنگ استاندارد -->
      <div class="relative w-full h-3 rounded-full bg-slate-800 overflow-visible my-5">
        <div class="absolute inset-0 rounded-full bg-gradient-to-l from-rose-500 via-sky-500 to-emerald-500 opacity-80"></div>

        <!-- نشانگر آگهی فعلی -->
        <div class="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-20 pointer-events-none" style="right: ${currentPct}%;">
          <div class="w-4 h-4 rounded-full bg-white border-2 border-slate-950 shadow-md"></div>
          <span class="absolute -top-6 whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-950 text-white border border-slate-700 shadow">
            این آگهی: ${current} م
          </span>
        </div>

        <!-- نشانگر ارزش عادلانه کارشناسی همین ملک -->
        <div class="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-10 opacity-75" style="right: ${fairPct}%;">
          <div class="w-2 h-5 bg-sky-300 rounded-sm"></div>
          <span class="absolute -bottom-5 whitespace-nowrap text-[9px] text-sky-300">
            کارشناسی: ${fair} م
          </span>
        </div>
      </div>

      <!-- برچسب‌های راهنما در زیر نوار -->
      <div class="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-3 border-t border-slate-800/80">
        <span>کف محله: ${Math.round(min)} م</span>
        <span>میانه فول: ${Math.round(median)} م</span>
        <span>سقف محله: ${Math.round(max)} م</span>
      </div>
    </div>
  `;
}
