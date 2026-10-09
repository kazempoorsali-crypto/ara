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
    applyTheme(store.get("theme_v2", "light"));
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
    document.body.dataset.page = page || "home";
    $$("[data-nav]").forEach((a) => a.classList.remove("is-on"));
    document.body.classList.remove("has-mcta");
    if (page === "s") {
      const key = params.opp || params.ranked ? "top" : "estate-" + (params.deal || "sale");
      $(`[data-nav="${key}"]`)?.classList.add("is-on");
      if (lastPath === "s") { searchPage.update(params); return; }
      searchPage.render(params);
    } else if (page === "ad" && arg) adPage(decodeURIComponent(arg));
    else if (page === "saved") savedPage();
    else if (page === "market") { $('[data-nav="market"]').classList.add("is-on"); marketPage(params); }
    else if (page === "method") { $('[data-nav="method"]').classList.add("is-on"); methodPage(); }
    else if (page === "account") accountPage(params);
    else if (page === "faq") faqPage();
    else if (page === "support") supportPage(params);
    else if (page === "p") contentPage("/" + path.split("/").slice(1).join("/"));
    else homePage();
    // متن «دربارهٔ بازار» که سرور برای همین نشانی ساخته، فقط روی همان صفحه دیده می‌شود
    const st = $("#seoText");
    if (st) st.hidden = (st.dataset.hash || "#/").replace(/^#?\/?$/, "#/") !== (location.hash || "#/").replace(/^#?\/?$/, "#/");
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
          <span class="kicker">ملک زیر قیمت، محله به محله</span>
          <h1>ملکی که <span class="accent">زیر قیمت</span> است،<br>پیش از بقیه پیدا کن.</h1>
          <p class="hero__lead">همهٔ آگهی‌های ملک ${fa(CITIES.length)} شهر در ${fa(PROVINCES.length)} استان را می‌خوانیم و هر کدام را فقط با <b>محلهٔ خودش</b> می‌سنجیم، با همان سن بنا، متراژ، طبقه، آسانسور، پارکینگ و سند. فرصت یعنی دست‌کم ${pct(cfg.thresholds?.opp || 0.15)} زیر قیمت محله و بیرون از پراکندگی عادی آن؛ قیمت‌های مشکوک و اشتباه جدا می‌شوند.</p>
          <form class="search-card" id="heroForm" autocomplete="off">
            <div class="search-card__tabs">
              <div class="search-card__deals" id="heroDeals" style="margin-inline-start:0">
                <button type="button" class="is-on" data-d="">همه</button><button type="button" data-d="sale">خرید</button><button type="button" data-d="rent">رهن و اجاره</button><button type="button" data-d="daily">روزانه</button>
              </div>
            </div>
            <div class="loc-row" aria-label="انتخاب محدوده">
              <label class="loc-row__f"><span>استان</span><div id="hProv"></div></label>
              <label class="loc-row__f"><span>شهر</span><div id="hCity"></div></label>
              <label class="loc-row__f"><span>محله</span><div id="hDist"></div></label>
            </div>
            <label class="loc-opp"><input type="checkbox" id="hOpp" checked> فقط فرصت‌های زیر قیمت محله</label>
            <div class="search-row">
              <span class="search-row__ai">${icon("spark")}</span>
              <input id="heroQ" placeholder="جزئیات دلخواه (اختیاری)؛ مثلاً: ۲ خوابه زیر ۸ میلیارد" aria-label="جست‌وجو" />
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
            <div class="kpi"><b>${fa(st.deals || 0)}</b><span>فرصت زیر قیمت محله</span></div>
            <div class="kpi"><b>${fa(st.excluded || 0)}</b><span>مشکوک یا کنار رفت</span></div>
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
          <div><span class="kicker">رادار فرصت</span><h2>بهترین فرصت‌ها، همین حالا</h2><p>امتیاز ۰ تا ۱۰۰ رتبهٔ آگهی در محلهٔ خودش است: بهترین فرصت هر محله ۱۰۰، آگهی هم‌قیمت محله ۵۰ و آگهی‌ای که فرصت نیست حداکثر ۶۴.</p></div>
          <div class="seg" id="feedS"><button class="is-on" data-s="score">بهترین فرصت</button><button data-s="deal">بیشترین فاصله</button><button data-s="new">تازه‌ترین</button><button data-s="drop">کاهش قیمت</button></div>
        </div>
        <div class="cards" id="feed"></div>
        <div style="text-align:center;margin-top:28px"><a class="btn btn--line" id="feedMore" href="#/s?sort=score&opp=1">همه فرصت‌ها ${icon("arrow")}</a></div>
      </div>
    </section>
    <section class="section section--sunk" id="glance"></section>
    <section class="section" id="showcase" hidden>
      <div class="wrap"><div class="sec-head"><div><span class="kicker">ویترین</span><h2>فرصت‌های عکس‌دار، بی‌پرچم احتیاط</h2><p>آگهی‌های زیر قیمت محله که عکس دارند و در متنشان نشانهٔ سند ناقص، مستأجر یا عکس غیرواقعی نیست.</p></div></div>
      <div class="cards" id="showGrid"></div></div>
    </section>
    ${methodTeaser()}
    <section class="section section--sunk">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">راهنمای محلی</span><h2>شهر به شهر، استان به استان</h2><p>تعداد آگهی و میانه قیمت هر متر در هر شهر، از آگهی‌های پاک‌سازی‌شده همین سامانه. استان‌های تازه به‌تدریج اضافه می‌شوند.</p></div><a class="btn btn--line" href="#/market">بازار محله‌ها</a></div>
        <div class="prov">${provinceColumns(st)}</div>
      </div>
    </section>
    ${plansSection()}
    <section class="section section--sunk"><div class="wrap faq-wrap"><div class="sec-head"><div><span class="kicker">پرسش‌ها و پاسخ‌ها</span><h2>پیش از اشتراک بدانید</h2></div><a class="btn btn--line" href="#/faq">همهٔ پرسش‌ها</a></div>${faqHTML(5)}</div></section>
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
      if (H.prov) { f.province = H.prov; delete f.city; delete f.district; }
      if (H.city) f.city = H.city;
      if (H.dist) f.district = H.dist;
      if ($("#hOpp").checked) f.opp = 1;
      go("#/s?" + toQuery({ sort: "score", ...f }));
    });
    const H = { prov: "", city: "", dist: "" };
    const hCities = () => CITIES.filter((c) => !H.prov || c.province === H.prov).map((c) => ({ id: c.id, label: c.name, hint: H.prov ? "" : (PROVINCES.find((p) => p.id === c.province) || {}).name }));
    UI.combo($("#hProv"), { items: PROVINCES.map((p) => ({ id: p.id, label: p.name })), value: null, allLabel: "همهٔ استان‌ها", placeholder: "همهٔ استان‌ها",
      onChange: ({ id }) => { H.prov = id || ""; H.city = ""; H.dist = ""; hCity.setItems(hCities(), null); hDist.setItems([], null); setTimeout(() => hCity.focus(), 0); } });
    const hCity = UI.combo($("#hCity"), { items: hCities(), value: null, allLabel: "همهٔ شهرها", placeholder: "نام شهر را بنویس",
      onChange: async ({ id }) => {
        H.city = id || ""; H.dist = "";
        const c = UI.cityOf(H.city); if (c) H.prov = c.province;
        hDist.setItems([], null);
        if (!H.city) return;
        const r = await DataLayer.districts(H.city, deal === "sale" || deal === "" ? "sale" : deal).catch(() => ({ items: [] }));
        hDist.setItems(r.items.map((x) => ({ id: x.name, label: x.name, hint: fa(x.n) + " آگهی" })), null);
        if (!$("#hDist input")) return;
        $("#hDist input").placeholder = r.items.length ? "همهٔ محله‌ها" : "هنوز محله‌ای ثبت نشده";
      } });
    const hDist = UI.combo($("#hDist"), { items: [], value: null, allLabel: "همهٔ محله‌ها", placeholder: "اول شهر را انتخاب کن", onChange: ({ id }) => { H.dist = id || ""; } });
    $("#heroQuick").addEventListener("click", (e) => { const c = e.target.closest("[data-q]"); if (c) { $("#heroQ").value = c.dataset.q; $("#heroForm").requestSubmit(); } });

    const top = (await DataLayer.search({ sort: "score", ranked: 1, limit: 15 })).items;
    let off = 0;
    const drawBoard = () => {
      if (!$("#boardList")) return;
      const rows = top.slice(off, off + 5);
      if (rows.length < 5) rows.push(...top.slice(0, Math.min(top.length, 5 - rows.length)));
      $("#boardList").innerHTML = rows.length ? rows.map((l, i) => `<li><a class="board__row" style="animation-delay:${i * 60}ms" href="#/ad/${encodeURIComponent(l.id)}"><b>${UI.tt(l.title)}</b><span class="board__price">${l.score != null ? fa(Math.round(l.score)) + " امتیاز" : ""}</span><span>${esc(l.city_name || UI.cityOf(l.city_key)?.name || "")}${l.district ? "، " + esc(l.district) : ""}، ${esc(UI.pinLabel(l))}</span><span style="text-align:left">${l.verdict && l.verdict.delta < 0 ? UI.gapPct(l.verdict) + " زیر قیمت" : ""}</span></a></li>`).join("")
        : `<li class="board__row"><span>با جمع شدن آگهی کافی، فرصت‌ها اینجا نمایش داده می‌شوند.</span></li>`;
      off = (off + 5) % Math.max(5, top.length);
    };
    drawBoard();
    if (top.length > 5) boardTimer = setInterval(() => { if (!$("#boardList")) clearInterval(boardTimer); else if (!document.hidden) drawBoard(); }, 6000);

    let fs = "score";
    const drawFeed = async () => {
      $("#feed").innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join("");
      const f = { sort: fs, ...(fs === "drop" ? { drop: 1 } : {}), ...(fs === "score" ? { opp: 1 } : fs === "deal" ? { ranked: 1 } : {}) };
      const r = await DataLayer.search({ ...f, limit: 8 });
      if (!$("#feed")) return;
      $("#feed").innerHTML = r.items.length ? r.items.map((l) => UI.card(l)).join("") : `<div class="empty" style="grid-column:1/-1"><h3>فعلاً موردی نیست</h3><p>با دریافت آگهی‌های بیشتر این بخش پر می‌شود.</p></div>`;
      $("#feedMore").href = "#/s?" + toQuery(f);
    };
    $("#feedS").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fs = b.dataset.s; $$("#feedS button").forEach((x) => x.classList.toggle("is-on", x === b)); drawFeed(); });
    drawFeed();
    bindTools();
    bindPlans();
    drawGlance(st);
    DataLayer.search({ opp: 1, photo: 1, limit: 16, sort: "score" }).then((r) => {
      const ok = r.items.filter((l) => !(l.signals && (l.signals.caution || l.signals.fake))).slice(0, 4);
      if (!ok.length || !$("#showGrid")) return;
      $("#showcase").hidden = false;
      $("#showGrid").innerHTML = ok.map((l) => UI.card(l)).join("");
    });
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
        return `<a class="city-row" href="/melk/${c.id}"><b>${c.name}</b><span class="n">${fa(s.n)}</span><small>${c.tags.join("، ")}${ppm ? `، میانه متری ${money(ppm)}` : ""}</small><span class="bar"><i style="width:${Math.max(3, (s.n / max) * 100)}%"></i></span></a>`;
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
          <li><div><b>گردآوری پیوسته</b><span>آگهی‌های ملک ${fa(CITIES.length)} شهر به‌تدریج و شبانه‌روزی دریافت و تغییر قیمت‌ها ثبت می‌شود.</span></div></li>
          <li><div><b>پاک‌سازی</b><span>قیمت نمادین، اشتباه صفر، پیش‌فروش، مشارکت، فروش دانگی، آگهی تکراری و قیمت‌های پرت آماری کنار گذاشته می‌شوند.</span></div></li>
          <li><div><b>قیمت محله برای همین خانه</b><span>میانهٔ قیمت هر متر محله، تعدیل‌شده با سن بنا، طبقه، متراژ، آسانسور، پارکینگ، انباری، سند، دید دریا و ده‌ها ویژگی دیگر؛ هرگز با میانهٔ کل شهر مقایسه نمی‌کنیم.</span></div></li>
          <li><div><b>حکم، اطمینان و امتیاز</b><span>فرصت طلایی، زیر قیمت بازار، منصفانه، بالاتر از بازار یا مشکوک؛ کنار هر حکم تعداد آگهی‌های مقایسه و میزان اطمینان آمده است.</span></div></li>
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
  async function buy(plan) {
    if (!DataLayer.me) { loginDialog(() => buy(plan)); return; }
    if (!cfg.payable) { toast("پرداخت هنوز فعال نشده است"); return; }
    try {
      const r = await DataLayer.startPayment(plan);
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.card) { cardDialog(r); return; }
      if (r.activated) { await DataLayer.refreshMe(); updateAccount(); toast(r.test ? "اشتراک در حالت آزمایشی فعال شد" : "اشتراک فعال شد"); route(); }
    } catch (err) { toast(err.message); }
  }
  /* کارت‌به‌کارت: مبلغ یکتا، رسید یا کد پیگیری، فعال‌سازی فوری */
  function cardDialog(r) {
    const num16 = r.card.number.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1-");
    openDialog(`<div class="dlg__head"><h2>پرداخت کارت‌به‌کارت</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <ol class="pay-steps">
        <li><span>دقیقاً همین مبلغ را واریز کن، نه بیشتر و نه کمتر. این مبلغ فقط برای تو رزرو شده و پرداختت با آن شناخته می‌شود${r.price && r.price !== r.amount ? ` (قیمت طرح ${fa(r.price)} تومان است)` : ""}.</span><b class="pay-amt">${fa(r.amount)} <small>تومان</small></b></li>
        <li><span>به این کارت${r.card.bank ? " (" + esc(r.card.bank) + ")" : ""}:</span><button class="pay-card" id="cpCard" type="button"><bdi dir="ltr">${num16}</bdi> ${icon("copy", 'width="16"')}</button>${r.card.holder ? `<span class="pay-holder">به نام <b>${esc(r.card.holder)}</b></span>` : ""}</li>
        <li><span>عکس رسید یا کد پیگیری را همین‌جا بفرست (یا بعداً از بخش <a href="#/support">پشتیبانی</a>). ${r.auto ? `اشتراک ${esc(r.plan)} همان لحظه باز می‌شود و واریز بعداً بررسی می‌شود.` : `پس از تطبیق واریز، اشتراک ${esc(r.plan)} باز می‌شود.`} پس از فعال‌سازی پیامک «دسترسی شما باز شد» می‌گیری.</span></li>
      </ol>
      <form class="form-grid" id="rcForm">
        <label class="field"><span>کد پیگیری یا شمارهٔ مرجع</span><input class="input input--ltr" id="rcTrack" inputmode="numeric" autocomplete="off"></label>
        <label class="field"><span>عکس رسید (اختیاری، تا ۵ مگابایت)</span><input class="input" type="file" id="rcFile" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
        <button class="btn btn--hot btn--lg" id="rcBtn">${icon("upload")} ${r.auto ? "ثبت رسید و فعال‌سازی" : "ثبت رسید"}</button>
        <p class="small muted">اگر واریز با مبلغ و رسید نخواند، روزهای اشتراک پس گرفته می‌شود. تمدید خودکار نداریم.</p>
      </form>`);
    $("#cpCard").addEventListener("click", async () => { try { await navigator.clipboard.writeText(r.card.number.replace(/\D/g, "")); toast("شماره کارت کپی شد"); } catch { /* */ } });
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
        toast(res.activated ? "رسید ثبت شد و اشتراک فعال شد" : "رسید ثبت شد؛ پس از بررسی فعال می‌شود");
        route();
      } catch (err) { toast(err.message); }
      btn.disabled = false;
    });
  }

  /* ---------- پرسش‌ها و پاسخ‌ها ---------- */
  function faqItems() {
    const name = esc(cfg.site.name), th = cfg.thresholds || {};
    return [
      ["«قیمت محله» یعنی چه؟", `میانهٔ قیمت هر متر آگهی‌های معتبر همان محله، تعدیل‌شده برای همین خانه: سن بنا، متراژ، طبقه، آسانسور، پارکینگ، انباری، سند و ویژگی‌های دیگر. هیچ آگهی‌ای با میانهٔ کل شهر مقایسه نمی‌شود؛ اگر محله کمتر از ۵ آگهی معتبر هم‌نوع داشته باشد، آگهی «در انتظار داده» می‌ماند و حکمی نمی‌گیرد.`],
      ["کدام آگهی «فرصت» است؟", `آگهی‌ای که دست‌کم ${pct(th.opp || 0.15)} زیر قیمت محلهٔ خودش باشد و این فاصله بیرون از پراکندگی عادی قیمت‌های همان محله باشد. «فرصت طلایی» دست‌کم ${pct(th.gold || 0.22)} فاصله دارد. در محله‌ای که قیمت‌ها خیلی پراکنده‌اند، همان فاصله ممکن است «منصفانه» حساب شود.`],
      ["امتیاز ۰ تا ۱۰۰ یعنی چه؟", "رتبهٔ آگهی در محلهٔ خودش: بهترین فرصت هر محله نزدیک ۱۰۰، آگهی هم‌قیمت محله ۵۰ و آگهی‌ای که فرصت نیست حداکثر ۶۴. امتیاز ۱۰۰ یعنی بهترین فرصت همین محله، نه اطمینان کامل؛ میزان اطمینان و تعداد مقایسه‌ها کنار هر حکم آمده است."],
      ["چرا بعضی آگهی‌ها «مشکوک»اند؟", `آگهی‌ای که بیش از ${pct(th.sus || 0.4)} ارزان‌تر از محلهٔ خودش باشد، یا خیلی ارزان باشد و در متنش آمده باشد عکس‌ها مال این ملک نیست یا چند قیمت داده باشد، یا متن مشکوک داشته باشد (مثل بیعانه پیش از بازدید). این آگهی‌ها امتیاز نمی‌گیرند، در محاسبهٔ قیمت محله نمی‌آیند و فقط برای مشترکان، همراه با دلیل، نشان داده می‌شوند.`],
      ["آگهی‌های قدیمی چطور حساب می‌شوند؟", `قیمت هر آگهی قیمت روز درج آن است. آگهی‌های قدیمی‌تر از ${fa(th.max_age_days || 90)} روز در قیمت محله نمی‌آیند، آگهی‌های تازه‌تر وزن بیشتری دارند و قیمت آگهی‌های قدیمی‌تر با روند ماهانهٔ بازار، که از خود آگهی‌ها برآورد می‌شود، به نرخ امروز آورده می‌شود. زمان درج هر آگهی روی کارت آن آمده است.`],
      ["شهری و روستایی را چطور تشخیص می‌دهید؟", "از نام محله و متن آگهی: اشاره به روستا، دهستان، ییلاق یا خارج از محدودهٔ شهر، آگهی را «روستایی» می‌کند. این تشخیص خودکار است و ممکن است گاهی اشتباه کند."],
      ["داده‌ها از کجاست و چقدر تازه است؟", `از آگهی‌های عمومی سایت‌های آگهی در ${fa(CITIES.length)} شهر از استان‌های ${PROVINCES.map((p) => p.name).join("، ")} که به‌تدریج و شبانه‌روزی خوانده می‌شوند؛ استان‌های دیگر هم یکی‌یکی اضافه می‌شوند. ${name} مستقل است و وابسته به هیچ سایت آگهی نیست.${cfg.updated ? " آخرین به‌روزرسانی: " + UI.ago(cfg.updated) + "." : ""}`],
      ["آیا این قیمت کارشناسی است؟", `نه. قیمت‌های آگهی‌ها قیمت پیشنهادی فروشنده‌اند، نه قیمت معامله‌شده؛ «زیر قیمت محله» یعنی ارزان‌تر از آگهی‌های مشابه همان محله. ${name} مشاور املاک نیست و خانه‌ها را ندیده است؛ پیش از هر معامله ملک را ببینید و سند، پایان‌کار و بدهی را استعلام کنید.`],
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
      view().innerHTML = `<div class="wrap empty"><h3>این صفحه پیدا نشد</h3><a class="btn btn--ink" href="#/">صفحهٔ اصلی</a></div>`;
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

  /* ---------- ورود با کد پیامکی ---------- */
  function loginDialog(after) {
    openDialog(`<div class="dlg__head"><h2>ورود یا ثبت‌نام</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <p class="muted" style="margin-bottom:16px">شماره موبایل را وارد کنید؛ کد پنج‌رقمی برایتان پیامک می‌شود. ثبت‌نام همزمان انجام می‌شود.${cfg.trial_days ? ` <b>با ثبت‌نام، همهٔ امکانات سایت ${fa(cfg.trial_days)} روز رایگان برایتان باز می‌شود.</b>` : ""}</p>
      <form class="form-grid" id="otpForm">
        <label class="field"><span>شماره موبایل</span><input class="input input--ltr" id="otpPhone" name="phone" inputmode="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹" required autocomplete="tel"></label>
        <div id="otpStep2" hidden><label class="field"><span>کد تأیید</span><input class="input input--ltr" id="otpCode" inputmode="numeric" maxlength="5" autocomplete="one-time-code" placeholder="-----"></label><p class="small muted" id="otpNote" style="margin-top:6px"></p></div>
        <button class="btn btn--hot btn--lg" type="submit" id="otpBtn">دریافت کد</button>
        <p class="small muted">کد نمی‌رسد؟ <a href="#/support?cat=sms" data-close>تیکت پشتیبانی بفرستید</a>.</p>
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
          const u = await DataLayer.verifyOtp($("#otpPhone").value, $("#otpCode").value);
          $("#dlg").close(); updateAccount(); toast(u.trial_started ? `خوش آمدید؛ همهٔ امکانات تا ${fa(u.trial_started)} روز برایتان رایگان باز است` : "وارد شدید");
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
          <div><span class="muted small">وضعیت اشتراک</span><b class="${me.active ? "ok-text" : ""}">${me.active ? `${me.trial ? "دورهٔ رایگان" : "فعال"}، ${fa(me.days_left)} روز باقی‌مانده` : "بدون اشتراک فعال"}</b></div>
          ${me.active ? `<div><span class="muted small">پایان اشتراک</span><b>${new Date(me.sub_until * 1000).toLocaleDateString("fa-IR", { dateStyle: "long" })}</b></div>` : ""}
          <a class="btn btn--line" href="#/support">پشتیبانی و تیکت‌ها</a>
          <button class="btn btn--line" id="logoutBtn">خروج</button>
        </div>` : `<div class="empty"><h3>با شماره موبایل وارد شوید</h3><p>ثبت‌نام و ورود با یک کد پیامکی انجام می‌شود.</p><button class="btn btn--hot btn--lg" id="loginBtn">ورود یا ثبت‌نام</button><p class="small muted" style="margin-top:12px">کد ورود نمی‌رسد؟ <a href="#/support?cat=sms">تیکت پشتیبانی بفرستید</a>.</p></div>`}
    </div></section>${plansSection()}`;
    $("#loginBtn")?.addEventListener("click", () => loginDialog());
    $("#logoutBtn")?.addEventListener("click", async () => { await DataLayer.logout(); updateAccount(); route(); });
    bindPlans();
  }

  /* ---------- ابزارها ---------- */
  function toolsHTML() {
    return `
      <div class="tool tool--wide"><h3>تخمین ارزش ملک در محلهٔ خودش</h3><p>میانه و بازهٔ معمول قیمت هر متر آگهی‌های فروش همان محله، به نرخ امروز</p>
        <div class="row3"><div class="field"><span>استان</span><div id="vProv"></div></div>
        <div class="field"><span>شهر</span><div id="vCity"></div></div>
        <div class="field"><span>محله</span><div id="vDist"></div></div></div>
        <div class="row3"><label class="field"><span>نوع</span><select class="select" id="vKind">${PROPERTY_TYPES.map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
        <label class="field"><span>متراژ (متر مربع)</span><input class="input" id="vArea" inputmode="numeric" value="100"></label>
        <label class="field"><span>سال ساخت (اختیاری)</span><input class="input" id="vYear" inputmode="numeric" placeholder="مثلاً ۱۳۹۸"></label></div>
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
    let mrows = { city: null, rows: [] };
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
    ["#vKind", "#vArea", "#vYear"].forEach((s) => $(s).addEventListener("input", val));
    ["#lAmt", "#lRate", "#lYears"].forEach((s) => $(s).addEventListener("input", loan));
    ["#cDep", "#cRent", "#cRate"].forEach((s) => $(s).addEventListener("input", conv));
    ["#lAmt", "#cDep", "#cRent"].forEach((s) => $(s).addEventListener("blur", (e) => { const v = num(e.target.value); e.target.value = v ? v.toLocaleString("en-US") : ""; }));
    loan(); conv();
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
      const c = UI.cityOf(F.city), p = UI.provOf(F.province);
      const where = F.district ? `در ${F.district.split(",").join("، ")}، ${c ? c.name : ""}` : c ? `در ${c.name}` : p ? `در استان ${p.name}` : "در همهٔ شهرها";
      const kinds = (F.kinds || "").split(",").filter(Boolean).map(UI.kindName).join(" و ") || "ملک";
      return `${F.ranked || F.opp ? "فرصت‌های " : ""}${kinds}${F.deal ? " برای " + UI.dealName(F.deal) : ""} ${where}`;
    }

    async function loadDistricts() {
      districts = [];
      if (!F.city) return;
      const r = await DataLayer.districts(F.city, F.deal);
      districts = r.items.map((x) => ({ d: x.name, n: x.n, opp: x.opp, rural: x.rural }));
    }

    function dropdowns() {
      const cityLabel = UI.cityOf(F.city)?.name || (F.province ? "استان " + UI.provOf(F.province).name : "همه شهرها");
      const priceSet = F.min || F.max;
      const priceLabel = priceSet ? [F.min && "از " + money(+F.min), F.max && "تا " + money(+F.max)].filter(Boolean).join(" ") : "قیمت";
      const kinds = (F.kinds || "").split(",").filter(Boolean);
      const am = (F.amenities || "").split(",").filter(Boolean);
      const dd = (id, label, on, body) => `<div class="dd" data-dd="${id}"><button type="button" class="${on ? "is-set" : ""}">${esc(label)}</button><div class="dd__panel">${body}<div class="dd__foot"><button type="button" class="btn btn--ghost btn--sm" data-clear="${id}">پاک کردن</button><button type="button" class="btn btn--ink btn--sm" data-apply="${id}">اعمال</button></div></div></div>`;
      let html = dd("city", cityLabel, F.city || F.province, `<div class="dd__label">استان و شهر؛ نام شهر را تایپ کن یا اول استان را انتخاب کن</div><div id="ddCityPick"></div>`);
      const dsel = (F.district || "").split(",").filter(Boolean);
      const settle = F.settle || "";
      const shown = districts.filter((x) => !settle || (settle === "rural") === !!x.rural);
      html += dd("district", dsel.length ? (dsel.length > 2 ? fa(dsel.length) + " محله" : dsel.join("، ")) : "محله", dsel.length,
        F.city ? (districts.length ? `<div class="dd__label">محله‌های ${esc(UI.cityOf(F.city)?.name || "")}؛ چند محله هم می‌شود</div><input class="input" id="ddDistQ" placeholder="نام محله را بنویس">
          <div class="dd__grid dd__grid--scroll" id="ddDists">${shown.map((x) => `<button type="button" class="chip ${dsel.includes(x.d) ? "is-on" : ""}" data-toggle="district" data-val="${esc(x.d)}">${esc(x.d)} <small>${fa(x.n)} آگهی${x.opp ? "، " + fa(x.opp) + " فرصت" : ""}</small></button>`).join("") || '<p class="small muted">محله‌ای با این نوع سکونتگاه نیست.</p>'}</div>`
          : `<p class="small muted">برای این شهر هنوز آگهی با محلهٔ مشخص جمع نشده است.</p>`)
          : `<p class="small muted">اول شهر را انتخاب کن تا فهرست محله‌هایش بیاید.</p>`);
      html += dd("settle", settle === "urban" ? "شهری" : settle === "rural" ? "روستایی" : "شهری / روستایی", settle,
        `<div class="dd__grid">${[["", "همه"], ["urban", "شهری"], ["rural", "روستایی و خارج از محدوده"]].map(([v, n]) => `<button type="button" class="chip ${settle === v ? "is-on" : ""}" data-pick="settle" data-val="${v}">${n}</button>`).join("")}</div><p class="small muted" style="margin-top:8px">از محله و متن آگهی تشخیص داده می‌شود: اشاره به روستا، دهستان یا خارج از محدودهٔ شهر.</p>`);
      html += dd("deal", F.deal ? UI.dealName(F.deal) : "نوع معامله", F.deal, `<div class="dd__grid">${[{ id: "", name: "همه" }, ...DEAL_TYPES].map((d) => `<button type="button" class="chip ${(F.deal || "") === d.id ? "is-on" : ""}" data-pick="deal" data-val="${d.id}">${d.name}</button>`).join("")}</div>`);
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
        <div class="mode-switcher" style="display:inline-flex;gap:4px;background:var(--sunk);padding:2px 4px;border-radius:999px;border:1px solid var(--line);align-items:center;">
          <button type="button" class="chip ${F.opp ? "is-on" : ""}" id="oppChip" style="border:0">🎯 فقط فرصت‌ها</button>
          <button type="button" class="chip ${!F.opp ? "is-on" : ""}" id="allAdsChip" style="border:0">📋 همه آگهی‌ها</button>
        </div>
        <button type="button" class="chip ${F.drop ? "is-on" : ""}" id="dropChip">کاهش قیمت</button><button type="button" class="chip chip--sus ${F.sus ? "is-on" : ""}" id="susChip" title="فقط برای مشترکان، همراه با دلیل مشکوک بودن">${icon("lock", 'width="14"')} آگهی‌های مشکوک</button>`;
      $("#dds").innerHTML = html;
      UI.cityPicker($("#ddCityPick"), { value: F.city || null, groupValue: F.province || "", groupLabel: "استان ", allLabel: "همه شهرها", groupPick: true,
        onChange: ({ id, group }) => set(id ? { city: id, province: group, district: "" } : group ? { province: group, city: "", district: "" } : { city: "", province: "", district: "" }) });
      $('[data-dd="city"] > button').addEventListener("click", () => setTimeout(() => $("#ddCityPick input")?.focus(), 30));
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
          if (t.dataset.prov) { set({ province: t.dataset.prov, city: "", district: "" }); return; }
          if (t.dataset.pick) {
            $$(`[data-pick="${t.dataset.pick}"]`, panel).forEach((x) => x.classList.toggle("is-on", x === t));
            pending[t.dataset.pick] = t.dataset.val;
            if (d.dataset.dd === "deal") set({ deal: t.dataset.val });
            if (d.dataset.dd === "settle") set({ settle: t.dataset.val, district: "" });
            if (d.dataset.dd === "fresh") set({ fresh: t.dataset.val });
            return;
          }
          if (t.dataset.toggle) { t.classList.toggle("is-on"); return; }
          if (t.dataset.clear) {
            set({ city: { city: "", province: "", district: "" }, deal: { deal: "" }, kinds: { kinds: "" }, price: { min: "", max: "", depMax: "", rentMax: "" }, district: { district: "" }, settle: { settle: "" }, fresh: { fresh: "" }, rooms: { rooms: "" }, age: { ageMax: "", yearMin: "", yearMax: "" }, more: { areaMin: "", areaMax: "", amenities: "" } }[t.dataset.clear]);
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
          const q = UI.fold(e.target.value);
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
      if (F.city) t.push(["city", UI.cityOf(F.city)?.name]); else if (F.province) t.push(["province", "استان " + UI.provOf(F.province)?.name]);
      (F.district || "").split(",").filter(Boolean).forEach((d) => t.push(["district:" + d, d]));
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
      if (F.opp) t.push(["opp", "فقط فرصت‌ها"]);
      if (F.sus) t.push(["sus", "با آگهی‌های مشکوک"]);
      (F.amenities || "").split(",").filter(Boolean).forEach((a) => t.push(["amenities:" + a, AMENITIES.find((x) => x.id === a)?.name || a]));
      if (F.ranked) t.push(["ranked", "دارای امتیاز"]);
      if (F.drop) t.push(["drop", "کاهش قیمت"]);
      $("#atags").innerHTML = t.map(([k, v]) => `<button class="atag" data-rm="${esc(k)}">${esc(v)} <i>✕</i></button>`).join("");
    }

    async function update(params) {
      const cityChanged = params.city !== F.city || params.deal !== F.deal;
      F = { ...params };
      page = +F.page || 0; delete F.page;
      if (cityChanged) await loadDistricts();
      dropdowns(); activeTags(); applyView();
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
      const r = await DataLayer.search({ ...F, limit: PER, offset: page * PER });
      if (id !== reqId || !$("#grid")) return;
      $("#sTitle").innerHTML = `${esc(titleOf())}<small>${fa(r.total)} آگهی</small>`;
      document.title = `${titleOf()} | ${cfg.site.name}`;
      $("#grid").innerHTML = r.items.length || r.locked_more ? r.items.map((l) => UI.card(l)).join("") + (r.locked_more ? UI.lockCard(r.locked_more) : "")
        : `<div class="empty" style="grid-column:1/-1">${icon("search")}<h3>آگهی‌ای با این مشخصات نیست</h3><p>چند فیلتر را بردارید یا از دستیار بخواهید گزینه نزدیک پیدا کند.</p><a class="btn btn--ink" href="#/s?sort=score">نمایش همه</a></div>`;
      if (!r.items.length && !r.locked_more) relaxHints(id);
      const pages = r.locked_more ? 1 : Math.ceil(r.total / PER);
      $("#pager").innerHTML = pages > 1 ? `${page > 0 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page - 1 })}">قبلی</a>` : ""}<span class="btn btn--ghost">صفحه ${fa(page + 1)} از ${fa(pages)}</span>${page < pages - 1 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page + 1 })}">بعدی</a>` : ""}` : "";
      lastPoints = r.points;
      drawMap(r.points, true);
    }
    async function relaxHints(id) {
      const names = { fresh: "هر زمان درج", settle: "شهری و روستایی", opp: "همهٔ آگهی‌ها، نه فقط فرصت‌ها", ageMax: "هر سن بنا", depMax: "بدون سقف ودیعه", rentMax: "بدون سقف اجاره", amenities: "بدون امکانات انتخابی", rooms: "هر تعداد خواب", areaMin: "هر متراژ", areaMax: "هر متراژ", kinds: "همه انواع ملک", max: "بدون سقف قیمت", min: "بدون کف قیمت", deal: "همه معامله‌ها", drop: "همه آگهی‌ها", ranked: "شامل آگهی‌های بی‌امتیاز", district: "همه محله‌ها", city: "کل استان" };
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
    const v = l.verdict, ex = l.explain || {};
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
    if (!v) {
      return `<div class="vcard"><h3>${UI.labelPill({ label: "pending" })} هنوز سنجیده نشده</h3><p class="muted small">در این محله و شهر هنوز آگهی کافی برای مقایسه نیست. با دریافت آگهی‌های بیشتر، این آگهی خودکار سنجیده می‌شود.</p></div>`;
    }
    const ask = l.deal === "daily" ? l.price : l.pp;
    const meM = l.deal === "daily" ? ask : l.area ? ask / l.area : null;
    // برای غیرمشترک فاصله فقط بازه‌ای است؛ قیمت مورد انتظار و مبلغ اختلاف از آن ساخته نمی‌شود
    const expM = meM && v.delta != null && !v.approx ? meM / (1 + v.delta) : null;
    const diff = ask && v.delta != null && !v.approx ? ask - ask / (1 + v.delta) : null;
    return `<div class="vcard">
      <div class="vcard__top">
        ${l.score != null ? `<span class="score score--${l.score >= 85 ? "hi" : l.score >= 65 ? "mid" : "lo"} score--big"><b>${fa(Math.round(l.score))}</b><i>از ۱۰۰</i></span>` : ""}
        <div><h3>${UI.dealPill(v)}</h3><p class="small muted">${UI.confLine(v)}${v.rank ? `، رتبهٔ ${fa(v.rank)} از ${fa(v.rank_n)} فرصت این محله` : ""}</p></div>
      </div>
      ${claimNote(l, v)}
      ${expM ? UI.priceBar(meM, expM) : ""}
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
    const ours = !v ? "هنوز سنجیده نشده است" : v.label === "gold" || v.label === "good" ? "در سنجش ما هم زیر قیمت محله است" : v.label === "high" ? "در سنجش ما بالاتر از قیمت محله است" : v.label === "sus" ? "در سنجش ما قیمتش مشکوک است" : "در سنجش ما هم‌قیمت محله است، نه فرصت";
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
    if (ex.district_median) html += row(`میانهٔ قیمت هر متر در ${esc(l.district || "این محله")}، به نرخ امروز`, "متری " + money(ex.district_median), `از ${fa(ex.district_raw_n)} آگهی معتبر همین محله؛ آگهی‌های تازه‌تر وزن بیشتری دارند${ex.trend ? ` و قیمت آگهی‌های قدیمی‌تر با روند ماهانهٔ ${ex.trend > 0 ? "+" : "−"}${pct(ex.trend)} به امروز آورده شده` : ""}`);
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
    const caution = [...(ex.sus || []), ...(ex.caution || [])];

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
        <span class="cmps__bar"><i class="pbar__gap pbar__gap--${x.verdict.delta < 0 ? "below" : "above"}" style="right:${Math.min(X(ppm(x)), X(exp(x)))}%;width:${Math.abs(X(ppm(x)) - X(exp(x)))}%"></i><b class="pbar__exp" style="right:${X(exp(x))}%"></b><b class="pbar__me" style="right:${X(ppm(x))}%"></b></span>
        <span>${UI.labelPill(x.verdict)}</span></li>`).join("")}</ol>
      <p class="fn">نقطهٔ پررنگ قیمت هر متر آگهی است و خط عمودی قیمت محله برای همان خانه.</p></section>`;
  }

  async function adPage(id) {
    view().innerHTML = `<div class="wrap ad"><div class="skeleton" style="height:440px"></div></div>`;
    const l = await DataLayer.get(id);
    if (!l) { view().innerHTML = `<div class="wrap ad"><div class="empty"><h3>این آگهی پیدا نشد</h3><p>ممکن است آگهی اصلی حذف شده باشد.</p><a class="btn btn--ink" href="#/">بازگشت به خانه</a></div></div>`; return; }
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
      <nav class="crumbs"><a href="#/">خانه</a>${c ? `<span><a href="#/s?city=${c.id}&sort=score">${c.name}</a></span>` : ""}${l.district && c ? `<span><a href="#/s?city=${c.id}&district=${encodeURIComponent(l.district)}&sort=score">${esc(l.district)}</a></span>` : ""}<span>${UI.tt(l.title)}</span></nav>
      <div class="gallery" id="gal">${gal}</div>
      ${l.detail_pending && !imgs.length ? `<p class="note-soft small" style="margin-top:10px">${icon("info", 'width="16"')} عکس‌ها و مشخصات کامل این آگهی در نوبت اول دریافت قرار گرفت؛ چند دقیقه دیگر صفحه را تازه کنید.</p>` : ""}
      <div class="ad__grid">
        <div>
          ${/انواع فایل|چند مورد|چندواحد|چند واحد|مواردی دیگر|فایل فروش در|فایل های مشابه|واحد های مختلف|شروع قیمت از/.test(((l.title || "") + " " + (l.description || "")).toLowerCase()) ? `<div class="note-soft" style="margin-bottom:12px;background:rgba(79,70,229,0.12);border:1px solid rgba(79,70,229,0.3);color:var(--forest);padding:10px 14px;border-radius:var(--r);font-size:13px;display:flex;align-items:center;gap:8px">${icon("layers")} <b>توجه:</b> این آگهی شرکتی شامل چند فایل یا واحد مختلف است؛ قیمت و متراژ درج‌شده ممکن است فقط مربوط به یکی از گزینه‌ها باشد.</div>` : ""}
          <header class="ad__head">
            <div class="ad__badges">${UI.typePill(l)}${l.price_drop ? `<span class="pill pill--drop">${fa(Math.round(l.price_drop * 100))}٪ کاهش قیمت</span>` : ""}${l.source === "sample" ? '<span class="pill pill--demo">آگهی نمونه</span>' : ""}</div>
            <h1>${UI.tt(l.title)}</h1>
            <p class="muted">${esc([c && "استان " + UI.provOf(c.province).name, c ? c.name : l.city_name, l.district].filter(Boolean).join("، "))}${l.first_seen ? "، ثبت در سامانه " + UI.ago(l.first_seen) : ""}</p>
            <div class="ad__price">${UI.priceHTML(l, true)}</div>
          </header>
          <div class="facts">${facts.filter(([, x]) => x).map(([k, x]) => `<div><span>${k}</span><b>${esc(x)}</b></div>`).join("")}</div>
          <div class="mobile-only">${valuationCard(l)}</div>
          ${l.history && l.history.length > 1 ? `<section class="block"><h2>تاریخچه قیمت</h2>${UI.spark(l.history)}</section>` : ""}
          ${priceIdCard(l)}
          ${whySection(l)}
          ${l.description ? `<section class="block"><h2>متن آگهی<small>نقل از آگهی اصلی</small></h2><blockquote class="quote">${esc(l.description).replace(/\n+/g, "<br>")}</blockquote><p class="quote-src">متن آگهی‌دهنده؛ این نوشتهٔ فروشنده است، نه حکم ${esc(cfg.site.name)}.</p></section>` : ""}
          <section class="block"><h2>امکانات</h2><ul class="amen-list">${amen}</ul><p class="small muted" style="margin-top:10px">امکانات از متن آگهی استخراج شده است؛ در بازدید تأیید کنید.</p></section>
          ${attrs.length ? `<section class="block"><h2>مشخصات</h2><div class="attrs">${attrs.map(([k, x]) => `<div><span>${esc(k)}</span><b>${UI.tt(x)}</b></div>`).join("")}</div></section>` : ""}
          <section class="block"><h2>موقعیت تقریبی</h2><div class="minimap-wrap"><div class="minimap" id="mini"></div></div><p class="map-note">${l.latlng_exact ? "این موقعیت را آگهی‌دهنده روی نقشه ثبت کرده است." : "آگهی مختصات دقیق ندارد؛ دایره فقط محدودهٔ شهر را نشان می‌دهد، نه محل ملک."} موقعیت بر اساس اطلاعات ثبت‌شده توسط آگهی‌دهنده است و ممکن است دقیق نباشد؛ نشانی را پیش از بازدید از خود آگهی‌دهنده بپرسید.</p></section>
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
          <p class="agent__note">فرصت‌یاب موتور مستقل پالایش و رتبه‌بندی آماری آگهی‌های املاک است. کلیه آگهی‌ها از منابع معتبر عمومی گردآوری و تحلیل می‌شوند و جهت جزئیات و استعلام به سایت اصلی هدایت می‌شوید. فرصت‌یاب مشاور املاک نیست و قیمت محله برآورد آماری است؛ پیش از معامله، بازدید حضوری و استعلام سند الزامی است.</p>
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
    $("#adFav").addEventListener("click", (e) => { toggleFav(l.id); e.currentTarget.querySelector("span").textContent = state.favs.has(l.id) ? "ذخیره شد" : "ذخیره"; });
    $("#adReport")?.addEventListener("click", () => openReportDialog(l.id));
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
    let zoomLevel = 1;
    const el = document.createElement("div");
    el.className = "lightbox";

    const draw = () => {
      el.innerHTML = `
        <div class="lightbox__viewport" style="display:flex;align-items:center;justify-content:center;height:calc(100vh - 84px);overflow:hidden;cursor:${zoomLevel > 1 ? "grab" : "zoom-in"}">
          <div id="lbWrap" style="transform:scale(${zoomLevel});transition:transform 0.2s cubic-bezier(0.2,0,0,1);max-width:92vw;max-height:84vh;display:flex;align-items:center;justify-content:center;user-select:none">
            ${UI.media(l, i)}
          </div>
        </div>
        <div class="lightbox__bar">
          <button class="btn btn--line btn--sm" data-d="-1">${icon("arrow", 'style="transform:rotate(180deg)"')} قبلی</button>
          <span style="font-size:13px;font-weight:700">${fa(i + 1)} از ${fa(n)}</span>
          <button class="btn btn--line btn--sm" data-d="1">بعدی ${icon("arrow")}</button>
          <div style="display:inline-flex;gap:4px;margin-inline:10px;align-items:center">
            <button class="btn btn--line btn--sm" data-zoom="in" title="بزرگ‌نمایی">＋ زوم</button>
            <button class="btn btn--line btn--sm" data-zoom="out" title="کوچک‌نمایی">－ کوچک</button>
            <button class="btn btn--line btn--sm" data-zoom="reset" title="اندازه اولیه">${fa(Math.round(zoomLevel * 100))}٪</button>
          </div>
          <button class="btn btn--line btn--sm" data-x>✕ بستن</button>
        </div>`;
    };

    const close = () => { el.remove(); document.removeEventListener("keydown", key); };
    const key = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") { i = (i + 1) % n; zoomLevel = 1; draw(); }
      if (e.key === "ArrowRight") { i = (i - 1 + n) % n; zoomLevel = 1; draw(); }
      if (e.key === "+" || e.key === "=") { zoomLevel = Math.min(3.2, +(zoomLevel + 0.3).toFixed(1)); draw(); }
      if (e.key === "-") { zoomLevel = Math.max(1, +(zoomLevel - 0.3).toFixed(1)); draw(); }
    };

    draw();

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b?.dataset.d) { i = (i + +b.dataset.d + n) % n; zoomLevel = 1; draw(); }
      else if (b?.dataset.zoom === "in") { zoomLevel = Math.min(3.2, +(zoomLevel + 0.4).toFixed(1)); draw(); }
      else if (b?.dataset.zoom === "out") { zoomLevel = Math.max(1, +(zoomLevel - 0.4).toFixed(1)); draw(); }
      else if (b?.dataset.zoom === "reset") { zoomLevel = 1; draw(); }
      else if (b?.hasAttribute("data-x") || e.target.classList.contains("lightbox__viewport") || e.target === el) close();
      else if (e.target.closest("#lbWrap")) {
        zoomLevel = zoomLevel === 1 ? 2.2 : 1;
        draw();
      }
    });

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.deltaY < 0) zoomLevel = Math.min(3.5, +(zoomLevel + 0.25).toFixed(2));
      else zoomLevel = Math.max(1, +(zoomLevel - 0.25).toFixed(2));
      draw();
    }, { passive: false });

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
      $("#mBody").innerHTML = `<div class="empty"><h3>هنوز داده‌ای برای ${KG[kind]} ${UI.dealName(deal)} ${esc(cname)} جمع نشده</h3><p>آگهی‌ها به‌تدریج دریافت می‌شوند؛ کمی بعد دوباره سر بزنید.</p><a class="btn btn--ink" href="#/">بازگشت به صفحهٔ اول</a></div>`;
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
          <div><b>${fa(o.opportunities)}</b><span>فرصت زیر قیمت محله${o.gold ? `، ${fa(o.gold)} طلایی` : ""}</span></div>
          ${o.median_year ? `<div><b>${faY(Math.round(o.median_year))}</b><span>میانهٔ سال ساخت</span></div>` : ""}
          <div><b>${fa(o.fresh_7d)}</b><span>آگهی تازه در ۷ روز${o.fresh_24h ? `، ${fa(o.fresh_24h)} در ۲۴ ساعت` : ""}</span></div>
        </div>
        ${o.per100 != null ? `<p class="mkt-note">از هر ۱۰۰ آگهی سنجیده‌شده، <b>${fa(Math.round(o.per100))}</b> تا فرصت‌اند${o.opp_median_discount != null ? `؛ فرصت‌ها در میانه ${pct(o.opp_median_discount)} زیر قیمت محلهٔ خودشان‌اند` : ""}. هر آگهی فقط با آگهی‌های محلهٔ خودش سنجیده شده است.</p>` : ""}
      </header>
      <nav class="mkt-toc"><a href="#budgetH" data-jump>بودجه</a><a href="#hotH" data-jump>کجا فرصت هست</a><a href="#ppmH" data-jump>خواب، سن و متراژ</a><a href="#amenH" data-jump>آسانسور و پارکینگ</a><a href="#cheapH" data-jump>ارزان و گران</a><a href="#ledgerH" data-jump>همهٔ محله‌ها</a><a href="#funnelH" data-jump>روش</a></nav>
      <section class="block" id="budgetH"><h2>با هر بودجه چند آگهی و چند فرصت هست</h2><p class="muted small">آگهی‌های هر بازهٔ قیمت و بخشی که فرصت است.</p>
        <div class="legend"><span><i class="lg lg--all"></i>همهٔ آگهی‌ها</span><span><i class="lg lg--gold"></i>فرصت طلایی</span><span><i class="lg lg--good"></i>زیر قیمت بازار</span></div>
        <div class="bud">${R.budget.map((b) => `<a class="bud__row" href="${link({ max: "" })}"><span>${esc(b.label)}</span><span class="bud__track"><i style="width:${(b.n / bmax) * 100}%"><em class="g" style="width:${(b.gold / b.n) * 100}%"></em><em class="d" style="width:${(b.good / b.n) * 100}%"></em></i></span><b>${fa(b.n)}<small>${b.gold + b.good ? fa(b.gold + b.good) + " فرصت" : "بی‌فرصت"}</small></b></a>`).join("")}</div></section>
      <section class="block" id="hotH"><h2>کجا فرصت بیشتر است</h2><p class="muted small">محله‌هایی با بیشترین آگهی زیر قیمت محلهٔ خودش.</p>
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
          <p><b>فرصت</b> یعنی برچسب «فرصت طلایی» یا «زیر قیمت بازار»: دست‌کم ${pct(cfg.thresholds?.opp || 0.15)} زیر قیمت محلهٔ خود آگهی و بیرون از پراکندگی عادی قیمت‌های آن، بی‌قیمت مشکوک. <b>فرصت طلایی</b> فاصلهٔ بیشتری دارد (دست‌کم ${pct(cfg.thresholds?.gold || 0.22)}).</p>
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
      <p>قیمت نمادین یا توافقی، پیش‌فروش، مشارکت در ساخت، معاوضه، فروش دانگی، هم‌خانه و آگهی تکراری کنار می‌روند. قیمت‌هایی که با محلهٔ خودشان نمی‌خوانند (فاصلهٔ لگاریتمی با معیار MAD بیش از ۳٫۵) یا احتمالاً یک صفر کم یا زیاد دارند، یا قیمت هر متر را به جای قیمت کل نوشته‌اند، «مشکوک» می‌شوند. هیچ‌کدام در محاسبهٔ قیمت محله شرکت داده نمی‌شوند.</p>
      <h2>۳. قیمت محله برای همین خانه</h2>
      <p>قیمت هر متر به متراژ، سن بنا، طبقه، آسانسور، پارکینگ، انباری، سند و ویژگی‌های دیگر بستگی دارد؛ پس میانهٔ خام آگهی‌های یک محله کافی نیست. اگر بیشتر آگهی‌های یک محله نوساز باشند، میانهٔ خام برای یک خانهٔ قدیمی بیش از حد بالاست و آن را به اشتباه «ارزان» نشان می‌دهد. برای همین، اثر هر ویژگی با یک مدل آماری از خود آگهی‌ها برآورد می‌شود (رگرسیون مقاوم که آگهی‌های غیرعادی ضریب‌ها را منحرف نکنند؛ اثر متراژ و سن غیرخطی است و طبقهٔ بالا بدون آسانسور جدا سنجیده می‌شود). «قیمت محله» میانهٔ قیمت‌هایی است که برای ویژگی‌ها تعدیل شده‌اند؛ مدل و قیمت محله چند دور به‌تناوب از نو ساخته می‌شوند تا به هم برسند. قیمت منصفانهٔ هر آگهی یعنی قیمت محله به‌اضافهٔ اثر ویژگی‌های همان خانه. محله‌ای که کمتر از ۵ آگهی معتبر هم‌نوع دارد سنجیده نمی‌شود و هیچ آگهی با میانهٔ شهر مقایسه نمی‌شود.</p>
      <p><b>بدون خوداثری:</b> قیمت محلهٔ هر آگهی بدون خود آن آگهی ساخته می‌شود تا قیمت خودش در معیار سنجش خودش اثر نگذارد.</p>
      <p><b>تأیید دوگانه:</b> علاوه بر مدل، نزدیک‌ترین آگهی‌های مشابه همان محله (از نظر متراژ، سن، طبقه، تعداد خواب، آسانسور و پارکینگ) جداگانه مقایسه می‌شوند. فرصت فقط وقتی اعلام می‌شود که هر دو روش فاصلهٔ کافی نشان دهند و این فاصله از عدم‌قطعیت برآورد (پراکندگی قیمت‌های محله به‌اضافهٔ خطای خود قیمت محله که با تعداد آگهی‌ها کم می‌شود) بزرگ‌تر باشد.</p>
      <p><b>مقاوم در برابر قیمت‌سازی:</b> ${esc(cfg.site.name)} قیمت تعیین نمی‌کند و نباید مبنای قیمت‌گذاری فروشنده شود. در ساختن قیمت محله، افزایش قیمتِ پس از درج آگهی نادیده گرفته می‌شود؛ پس اگر فروشنده‌ای پس از دیدن سایت قیمتش را بالا ببرد، قیمت محله برای بقیه بالا نمی‌رود و خود آن آگهی «بالاتر از قیمت محله» دیده می‌شود. قیمت محله میانه است، نه میانگین، و یک یا چند آگهی نمی‌توانند آن را جابه‌جا کنند. درصد دقیق فاصله و قیمت مورد انتظار فقط برای مشترکان نمایش داده می‌شود و دیگران بازهٔ ۵ درصدی می‌بینند.</p>
      <p><b>سنجش دقت:</b> برای هر گروه، قیمت منصفانهٔ هر آگهی بدون خودش برآورد و با قیمت درخواستی‌اش مقایسه می‌شود و میانهٔ این خطا در پنل گزارش می‌شود تا دقت فرمول همیشه قابل وارسی باشد.</p>
      <h2>۴. حکم</h2>
      <p><b>فرصت طلایی</b>: دست‌کم ${pct(th.gold || 0.22)} زیر قیمت محله و بیرون از پراکندگی عادی آن. <b>زیر قیمت بازار</b>: دست‌کم ${pct(th.opp || 0.15)} زیر قیمت محله و بیرون از پراکندگی عادی. <b>منصفانه</b>: نزدیک قیمت محله، یا فاصله‌ای که در محله‌های پرپراکندگی هنوز عادی است. <b>بالاتر از بازار</b>: دست‌کم ${pct(th.opp || 0.15)} گران‌تر. <b>مشکوک</b>: بیش از ${pct(th.sus || 0.4)} ارزان‌تر، یا دست‌کم ${pct(th.sus_flagged || 0.25)} ارزان‌تر همراه با «عکس‌ها مال این ملک نیست» یا چند قیمت در متن، یا ارزان با متن مشکوک.</p>
      <h2>۵. امتیاز و اطمینان</h2>
      <p>امتیاز رتبهٔ آگهی در محلهٔ خودش است: فرصت‌ها بین ۶۵ تا ۱۰۰، بر پایهٔ رتبه در میان فرصت‌های همان محله و عمق فاصله؛ آگهی هم‌قیمت محله ۵۰ و آگهی‌ای که فرصت نیست حداکثر ۶۴. اطمینان «بالا» یعنی دست‌کم ۱۵ آگهی مقایسه در همان محله و مشخصات کافی؛ «متوسط» یعنی ۸ تا ۱۴ آگهی و «کم» یعنی ۵ تا ۷ آگهی در محله.</p>
      <h2>۶. زمان آگهی</h2>
      <p>قیمت هر آگهی قیمت روزی است که درج شده؛ آگهی دو ماه پیش ممکن است دیگر با بازار امروز نخواند. برای همین سه کار انجام می‌شود: آگهی‌های قدیمی‌تر از ${fa(th.max_age_days || 90)} روز در قیمت محله شرکت داده نمی‌شوند؛ در میانهٔ محله آگهی‌های تازه‌تر وزن بیشتری دارند (وزن هر آگهی هر ${fa(th.half_life_days || 45)} روز نصف می‌شود)؛ و روند ماهانهٔ قیمت از خود آگهی‌ها برآورد می‌شود و قیمت آگهی‌های قدیمی‌تر با آن به نرخ امروز آورده می‌شود. اطمینان حکم آگهی‌ای که بیش از ۳۰ روز از درجش گذشته یک درجه پایین می‌آید.</p>
      <h2>۷. نشانه‌های متن</h2>
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
      <p class="muted" style="margin-bottom:14px">اگر این آگهی فروخته شده، قیمتش دروغین است یا دلال است، گزارش دهید تا بررسی و از فهرست فرصت‌ها حذف شود:</p>
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
          if (DataLayer.server) {
            await fetch(`api/listing/${encodeURIComponent(id)}/flag`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason })
            });
          }
          $("#dlg").close();
          toast("گزارش شما با موفقیت ثبت شد و بررسی می‌شود");
        } catch (err) {
          toast("خطا در ارسال گزارش");
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
    const mini = (ls) => `<div class="mini">${ls.map((l) => `<a href="#/ad/${encodeURIComponent(l.id)}"><span class="mini__img">${UI.media(l)}</span><span><b>${UI.tt(l.title)}</b><small>${l.score != null ? fa(Math.round(l.score)) + " امتیاز، " : ""}${esc(UI.pinLabel(l))}${l.verdict && l.verdict.delta < 0 ? "، " + UI.gapPct(l.verdict) + " زیر قیمت" : ""}</small></span></a>`).join("")}</div>`;
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
  function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  function bindGlobal() {
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
    addEventListener("resize", measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
    $("#menuBtn").addEventListener("click", () => { const on = top.classList.toggle("is-menu"); $("#menuBtn").setAttribute("aria-expanded", on); });
    $$(".nav a").forEach((a) => a.addEventListener("click", () => { top.classList.remove("is-menu"); $("#menuBtn").setAttribute("aria-expanded", "false"); }));
    document.addEventListener("click", (e) => { if (!e.target.closest(".top")) top.classList.remove("is-menu"); });
    $("#themeBtn").addEventListener("click", () => {
      const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; applyTheme(t); store.set("theme_v2", t);
    });
    $("#dlg").addEventListener("click", (e) => { if (e.target.id === "dlg" || e.target.closest("[data-close]")) $("#dlg").close(); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".dd")) $$(".dd.is-open").forEach((d) => d.classList.remove("is-open")); });
    view().addEventListener("click", (e) => {
      const f = e.target.closest("[data-fav]"); if (f) { e.preventDefault(); e.stopPropagation(); toggleFav(f.dataset.fav); }
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
