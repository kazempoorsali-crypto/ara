/* آرا — مسیریابی و صفحات */
const App = (() => {
  "use strict";
  const { $, $$, esc, fa, faY, num, store, money, toast, icon } = UI;
  const state = { favs: new Set(store.get("favs", [])), compare: [], map: null, layer: null, markers: {} };
  const view = () => $("#view");
  let cfg = null;

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
        : "<b>پیش‌نمایش طراحی:</b> همه آگهی‌ها و قیمت‌ها نمونه و ساختگی‌اند. نسخه کامل با آگهی‌های واقعی دیوار روی رایانه شما اجرا می‌شود.";
    }
    updateFavCount();
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
    const items = [];
    if (s.phone) items.push(`<li><a href="tel:${esc(tel(s.phone))}"><bdi dir="ltr">${esc(s.phone)}</bdi></a></li>`);
    if (s.whatsapp) items.push(`<li><a href="${waLink()}" target="_blank" rel="noopener">واتس‌اپ</a></li>`);
    if (s.telegram) items.push(`<li><a href="https://t.me/${esc(s.telegram.replace(/^@/, ""))}" target="_blank" rel="noopener">تلگرام</a></li>`);
    if (s.instagram) items.push(`<li><a href="https://instagram.com/${esc(s.instagram.replace(/^@/, ""))}" target="_blank" rel="noopener">اینستاگرام</a></li>`);
    if (s.address) items.push(`<li>${esc(s.address)}</li>`);
    if (s.hours) items.push(`<li class="muted">${esc(s.hours)}</li>`);
    $("#footContact").innerHTML = items.join("");
  }
  const tel = (p) => NLP.toEn(p || "").replace(/[^\d+]/g, "");
  function waLink(text = "") {
    const p = tel(cfg.site.whatsapp || cfg.site.phone).replace(/^0/, "98").replace(/^\+/, "");
    return `https://wa.me/${p}${text ? "?text=" + encodeURIComponent(text) : ""}`;
  }

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
      const key = params.vertical === "car" ? "car" : "estate-" + (params.deal || "sale");
      $(`[data-nav="${key}"]`)?.classList.add("is-on");
      if (lastPath === "s") { searchPage.update(params); return; }
      searchPage.render(params);
    } else if (page === "ad" && arg) adPage(decodeURIComponent(arg));
    else if (page === "saved") savedPage();
    else if (page === "market") { $('[data-nav="market"]').classList.add("is-on"); marketPage(); }
    else if (page === "pay") payPage();
    else homePage();
    if (page !== lastPath || page === "ad") scrollTo({ top: 0 });
    lastPath = page;
  }
  const go = (hash) => { location.hash = hash; };
  const toQuery = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "" && v != null && v !== 0 && v !== false)).toString();

  /* ---------- صفحه اصلی ---------- */
  let boardTimer = null;
  async function homePage() {
    clearInterval(boardTimer);
    const st = DataLayer.stats;
    let vertical = "estate", deal = "";
    view().innerHTML = `
    <section class="hero">
      <div class="wrap hero__grid">
        <div>
          <span class="kicker">گیلان · مازندران · گلستان</span>
          <h1>خانه‌ای میان <span class="soft">جنگل</span> و <span class="accent">دریا</span>،<br>خودرویی برای جاده‌اش.</h1>
          <p class="hero__lead">آگهی‌های ${fa(CITIES.length)} شهر شمال یک‌جا؛ هرچه می‌خواهی به فارسی بنویس. قیمت هر آگهی را با میانه بازار همان شهر می‌سنجیم و برای بازدید و معامله کنارت هستیم.</p>
          <form class="search-card" id="heroForm" autocomplete="off">
            <div class="search-card__tabs">
              <button type="button" class="vtab is-on" data-v="estate">${icon("home")}املاک</button>
              <button type="button" class="vtab" data-v="car">${icon("car")}خودرو</button>
              <div class="search-card__deals" id="heroDeals">
                <button type="button" class="is-on" data-d="">همه</button><button type="button" data-d="sale">خرید</button><button type="button" data-d="rent">رهن و اجاره</button><button type="button" data-d="daily">روزانه</button>
              </div>
            </div>
            <div class="search-row">
              <span class="search-row__ai">${icon("spark")}</span>
              <input id="heroQ" placeholder="مثلاً: ویلای استخردار رامسر با دید دریا زیر ۲۰ میلیارد" aria-label="جست‌وجو" />
              <button class="btn btn--hot btn--lg">جست‌وجو</button>
            </div>
            <div class="parsed" id="heroParsed" aria-live="polite"></div>
          </form>
          <div class="hero__quick" id="heroQuick"></div>
        </div>
        <aside class="board" aria-label="تابلوی زنده بازار">
          <div class="board__head"><b>تابلوی بازار شمال</b><span class="live">${DataLayer.samples ? "داده نمونه" : "به‌روز"}</span></div>
          <div class="board__kpis">
            <div class="kpi"><b>${fa(st.total || 0)}</b><span>آگهی فعال</span></div>
            <div class="kpi"><b>${fa(st.today || 0)}</b><span>جدید در ۲۴ ساعت</span></div>
            <div class="kpi"><b>${fa(st.drops || 0)}</b><span>کاهش قیمت</span></div>
          </div>
          <ul class="board__list" id="boardList"></ul>
        </aside>
      </div>
      <div class="hero__art" aria-hidden="true">${heroArt()}</div>
    </section>
    <section class="wrap">
      <div class="strip">
        <div><b>${fa(st.estate || 0)}</b><span>آگهی ملک</span></div>
        <div><b>${fa(st.car || 0)}</b><span>آگهی خودرو</span></div>
        <div><b>${fa(CITIES.length)}</b><span>شهر در ۳ استان</span></div>
        <div><b>${fa(Object.keys(st.cities || {}).length)}</b><span>شهر دارای آگهی</span></div>
      </div>
    </section>
    <section class="section">
      <div class="wrap">
        <div class="sec-head">
          <div><span class="kicker">رادار معامله</span><h2>فرصت‌هایی که ارزش دیدن دارند</h2><p>هر آگهی با میانه قیمت آگهی‌های مشابه همان شهر مقایسه می‌شود؛ «معامله عالی» یعنی دست‌کم ۱۵٪ زیر میانه.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div class="seg" id="feedV"><button class="is-on" data-v="estate">املاک</button><button data-v="car">خودرو</button></div>
            <div class="seg" id="feedS"><button class="is-on" data-s="deal">زیر قیمت</button><button data-s="new">تازه‌ترین</button><button data-s="drop">کاهش قیمت</button></div>
          </div>
        </div>
        <div class="cards" id="feed"></div>
        <div style="text-align:center;margin-top:28px"><a class="btn btn--line" id="feedMore" href="#/s?vertical=estate&sort=deal">دیدن همه ${icon("arrow")}</a></div>
      </div>
    </section>
    <section class="section section--sunk">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">راهنمای محلی</span><h2>از آستارا تا کلاله</h2><p>تعداد آگهی و میانه قیمت هر متر، محاسبه‌شده از آگهی‌های همین سامانه.</p></div><a class="btn btn--line" href="#/market">گزارش بازار شهرها</a></div>
        <div class="prov">${provinceColumns(st)}</div>
      </div>
    </section>
    ${brokerSection()}
    <section class="section" id="tools">
      <div class="wrap">
        <div class="sec-head"><div><span class="kicker">ابزارها</span><h2>پیش از تصمیم، حساب کن</h2></div></div>
        <div class="tools">${toolsHTML()}</div>
      </div>
    </section>`;

    const quick = { estate: ["ویلای ساحلی نوشهر", "آپارتمان ۲ خوابه رشت رهن", "ویلای جنگلی کلاردشت استخردار", "زمین سنددار لاهیجان", "اجاره روزانه رامسر"], car: ["پژو ۲۰۶ مدل ۹۸ به بالا", "دنا پلاس ساری", "ماشین اتوماتیک تا ۲ میلیارد", "خودروی زیر قیمت گرگان"] };
    const drawQuick = () => { $("#heroQuick").innerHTML = quick[vertical].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join(""); };
    drawQuick();
    $$(".vtab").forEach((b) => b.addEventListener("click", () => {
      vertical = b.dataset.v;
      $$(".vtab").forEach((x) => x.classList.toggle("is-on", x === b));
      $("#heroDeals").style.visibility = vertical === "car" ? "hidden" : "visible";
      $("#heroQ").placeholder = vertical === "car" ? "مثلاً: دنا پلاس مدل ۱۴۰۰ به بالا کارکرد زیر ۵۰ هزار در ساری" : "مثلاً: ویلای استخردار رامسر با دید دریا زیر ۲۰ میلیارد";
      drawQuick();
    }));
    $("#heroDeals").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; deal = b.dataset.d; $$("#heroDeals button").forEach((x) => x.classList.toggle("is-on", x === b)); });
    $("#heroQ").addEventListener("input", (e) => {
      const v = e.target.value.trim();
      const { tags } = v.length > 2 ? NLP.parseQuery(v, { vertical }) : { tags: [] };
      $("#heroParsed").innerHTML = tags.length ? `<span>برداشت دستیار:</span>${tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join("")}` : "";
    });
    $("#heroForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#heroQ").value.trim();
      const base = { vertical, ...(deal && vertical === "estate" ? { deal } : {}) };
      const f = v ? NLP.parseQuery(v, base).filters : base;
      go("#/s?" + toQuery(f));
    });
    $("#heroQuick").addEventListener("click", (e) => { const c = e.target.closest("[data-q]"); if (c) { $("#heroQ").value = c.dataset.q; $("#heroForm").requestSubmit(); } });

    // تابلوی زنده
    const latest = (await DataLayer.search({ sort: "new", limit: 18 })).items;
    let off = 0;
    const drawBoard = () => {
      if (!$("#boardList")) return;
      const rows = latest.slice(off, off + 5);
      if (rows.length < 5) rows.push(...latest.slice(0, Math.min(latest.length, 5 - rows.length)));
      $("#boardList").innerHTML = rows.map((l, i) => `<li><a class="board__row" style="animation-delay:${i * 60}ms" href="#/ad/${encodeURIComponent(l.id)}"><b>${UI.tt(l.title)}</b><span class="board__price">${esc(UI.pinLabel(l))}</span><span>${esc(l.city_name || UI.cityOf(l.city_key)?.name || "")}${l.district ? "، " + esc(l.district) : ""}</span><span style="text-align:left">${l.verdict ? DEAL_BANDS[l.verdict.band].name : ""}</span></a></li>`).join("");
      off = (off + 5) % Math.max(5, latest.length);
    };
    drawBoard();
    if (latest.length > 5) boardTimer = setInterval(() => { if (!$("#boardList")) clearInterval(boardTimer); else if (!document.hidden) drawBoard(); }, 6000);

    // رادار معامله
    let fv = "estate", fs = "deal";
    const drawFeed = async () => {
      $("#feed").innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join("");
      const f = { vertical: fv, sort: fs, ...(fs === "drop" ? { drop: 1 } : {}), ...(fv === "estate" && fs === "deal" ? { deal: "sale" } : {}) };
      const r = await DataLayer.search({ ...f, limit: 8 });
      if (!$("#feed")) return;
      $("#feed").innerHTML = r.items.length ? r.items.map((l) => UI.card(l)).join("") : `<div class="empty" style="grid-column:1/-1"><h3>فعلاً موردی نیست</h3><p>با دریافت آگهی‌های بیشتر این بخش پر می‌شود.</p></div>`;
      $("#feedMore").href = "#/s?" + toQuery(f);
    };
    $("#feedV").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fv = b.dataset.v; $$("#feedV button").forEach((x) => x.classList.toggle("is-on", x === b)); drawFeed(); });
    $("#feedS").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fs = b.dataset.s; $$("#feedS button").forEach((x) => x.classList.toggle("is-on", x === b)); drawFeed(); });
    drawFeed();
    bindTools();
    $$("[data-lead]").forEach((b) => b.addEventListener("click", () => leadDialog(b.dataset.lead)));
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
        const ppm = s.ppm && (s.ppm.villa || s.ppm.apartment);
        return `<a class="city-row" href="#/s?city=${c.id}"><b>${c.name}</b><span class="n">${fa(s.n)}</span><small>${c.tags.join("، ")}${ppm ? ` · میانه متری ${money(ppm)}` : ""}</small><span class="bar"><i style="width:${Math.max(3, (s.n / max) * 100)}%"></i></span></a>`;
      }).join("")}${cs.length > 8 ? `<a class="btn btn--ghost btn--sm" href="#/market" style="margin-top:8px">${fa(cs.length - 8)} شهر دیگر</a>` : ""}</div>`;
    }).join("");
  }

  function brokerSection() {
    const s = cfg.site;
    return `<section class="section section--ink">
      <div class="wrap broker">
        <div>
          <span class="kicker">معامله با مشاور</span>
          <h2>آگهی را پیدا کن؛ بازدید، استعلام و قرارداد با ما.</h2>
          <p>${esc(s.about || "آگهی‌های شمال را گردآوری می‌کنیم و قیمت هرکدام را با بازار می‌سنجیم. برای هر آگهی که پسندیدی، بازدید را هماهنگ و مدارک را پیش از قرارداد بررسی می‌کنیم.")}</p>
          <div class="broker__cta">
            ${s.phone ? `<a class="btn btn--hot btn--lg" href="tel:${esc(tel(s.phone))}">${icon("phone")} <bdi dir="ltr">${esc(s.phone)}</bdi></a>` : ""}
            ${s.whatsapp || s.phone ? `<a class="btn btn--line btn--lg" href="${waLink("سلام، برای مشاوره پیام می‌دهم.")}" target="_blank" rel="noopener">${icon("chat")} واتس‌اپ</a>` : ""}
            <button class="btn ${s.phone ? "btn--line" : "btn--hot"} btn--lg" data-lead="advice">درخواست تماس مشاور</button>
          </div>
        </div>
        <ol class="steps">
          <li><div><b>جست‌وجو و مقایسه</b><span>به فارسی بنویس چه می‌خواهی؛ رتبه قیمت هر آگهی کنارش است.</span></div></li>
          <li><div><b>درخواست بازدید</b><span>از صفحه هر آگهی وقت بگیر؛ هماهنگی با فروشنده با ماست.</span></div></li>
          <li><div><b>استعلام و کارشناسی</b><span>سند، کد رهگیری و وضعیت حقوقی ملک، یا خلافی و کارشناسی خودرو پیش از پرداخت.</span></div></li>
          <li><div><b>قرارداد و تحویل</b><span>تنظیم قرارداد و همراهی تا پایان کار.</span></div></li>
        </ol>
      </div>
    </section>`;
  }

  /* ---------- ابزارها ---------- */
  function toolsHTML() {
    const cityOpts = PROVINCES.map((p) => `<optgroup label="${p.name}">${CITIES.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}" ${c.id === "ramsar" ? "selected" : ""}>${c.name}</option>`).join("")}</optgroup>`).join("");
    return `
      <div class="tool"><h3>تخمین ارزش ملک</h3><p>میانه قیمت هر متر آگهی‌های فروش مشابه</p>
        <div class="row2"><label class="field"><span>شهر</span><select class="select" id="vCity">${cityOpts}</select></label>
        <label class="field"><span>نوع</span><select class="select" id="vKind">${PROPERTY_TYPES.map((t) => `<option value="${t.id}" ${t.id === "villa" ? "selected" : ""}>${t.name}</option>`).join("")}</select></label></div>
        <label class="field"><span>متراژ (متر مربع)</span><input class="input" id="vArea" inputmode="numeric" value="200"></label>
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
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
  function bindTools() {
    const val = async () => {
      const city = $("#vCity").value, kind = $("#vKind").value, area = num($("#vArea").value);
      let r = await DataLayer.search({ vertical: "estate", deal: "sale", city, kinds: kind, limit: 60 });
      let pool = r.items.map((l) => l.ppm).filter(Boolean), basis = `${fa(pool.length)} آگهی در ${UI.cityOf(city).name}`;
      if (pool.length < 3) {
        const prov = UI.cityOf(city).province;
        r = await DataLayer.search({ vertical: "estate", deal: "sale", province: prov, kinds: kind, limit: 60 });
        pool = r.items.map((l) => l.ppm).filter(Boolean);
        basis = `داده شهر کافی نبود؛ ${fa(pool.length)} آگهی در استان ${UI.provOf(prov).name}`;
      }
      const m = median(pool);
      if (!$("#vOut")) return;
      $("#vOut").innerHTML = m && area ? `<b>${money(m * area * 0.9)} تا ${money(m * area * 1.1)}</b><span>میانه هر متر ${money(m)} · مبنا: ${basis}${DataLayer.samples ? " (داده نمونه)" : ""}</span>` : `<span>برای این ترکیب هنوز آگهی فروش کافی نیست.</span>`;
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
    const isCar = () => F.vertical === "car";

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
        set(NLP.parseQuery(v, { vertical: F.vertical }).filters, true);
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
        else set(k === "province" ? { province: "", city: "" } : { [k]: "" });
      });
      update(params);
    }
    function set(patch, replace = false) {
      F = replace ? { ...patch } : { ...F, ...patch };
      if (F.vertical === "car") { ["kinds", "amenities", "rooms", "areaMin", "areaMax"].forEach((k) => { if (k !== "kinds" || F.kinds !== "motorcycle") delete F[k]; }); if (F.deal !== "sale") delete F.deal; }
      go("#/s?" + toQuery(F));
    }
    function applyView() {
      $("#split").className = "split is-" + viewMode;
      $$("#viewSeg button").forEach((b) => b.classList.toggle("is-on", b.dataset.v === viewMode));
      setTimeout(() => state.map && state.map.invalidateSize(), 60);
    }
    function titleOf() {
      const c = UI.cityOf(F.city), p = UI.provOf(F.province);
      const where = c ? `در ${c.name}` : p ? `در استان ${p.name}` : "در شمال";
      if (isCar()) return `${F.brand || (F.kinds === "motorcycle" ? "موتورسیکلت" : "خودرو")} ${where}`;
      const kinds = (F.kinds || "").split(",").filter(Boolean).map(UI.kindName).join(" و ") || "ملک";
      return `${kinds}${F.deal ? " برای " + UI.dealName(F.deal) : ""} ${where}`;
    }

    function dropdowns() {
      const cityLabel = UI.cityOf(F.city)?.name || (F.province ? "استان " + UI.provOf(F.province).name : "همه شهرها");
      const priceSet = F.min || F.max;
      const priceLabel = priceSet ? [F.min && "از " + money(+F.min), F.max && "تا " + money(+F.max)].filter(Boolean).join(" ") : "قیمت";
      const kinds = (F.kinds || "").split(",").filter(Boolean);
      const am = (F.amenities || "").split(",").filter(Boolean);
      const dd = (id, label, on, body) => `<div class="dd" data-dd="${id}"><button type="button" class="${on ? "is-set" : ""}">${esc(label)}</button><div class="dd__panel">${body}<div class="dd__foot"><button type="button" class="btn btn--ghost btn--sm" data-clear="${id}">پاک کردن</button><button type="button" class="btn btn--ink btn--sm" data-apply="${id}">اعمال</button></div></div></div>`;
      let html = `<div class="seg" id="vSeg"><button class="${!isCar() ? "is-on" : ""}" data-v="estate">املاک</button><button class="${isCar() ? "is-on" : ""}" data-v="car">خودرو</button></div>`;
      html += dd("city", cityLabel, F.city || F.province, `<div class="dd__label">استان</div><div class="dd__grid">${PROVINCES.map((p) => `<button type="button" class="chip ${F.province === p.id && !F.city ? "is-on" : ""}" data-prov="${p.id}">${p.name}</button>`).join("")}</div>
        <div class="dd__label">شهر</div><select class="select" id="ddCity"><option value="">همه شهرها</option>${PROVINCES.map((p) => `<optgroup label="${p.name}">${CITIES.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}" ${F.city === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</optgroup>`).join("")}</select>`);
      if (!isCar()) {
        html += dd("deal", F.deal ? UI.dealName(F.deal) : "نوع معامله", F.deal, `<div class="dd__grid">${[{ id: "", name: "همه" }, ...DEAL_TYPES].map((d) => `<button type="button" class="chip ${(F.deal || "") === d.id ? "is-on" : ""}" data-pick="deal" data-val="${d.id}">${d.name}</button>`).join("")}</div>`);
        html += dd("kinds", kinds.length ? kinds.map(UI.kindName).join("، ") : "نوع ملک", kinds.length, `<div class="dd__grid">${PROPERTY_TYPES.map((t) => `<button type="button" class="chip ${kinds.includes(t.id) ? "is-on" : ""}" data-toggle="kinds" data-val="${t.id}">${t.name}</button>`).join("")}</div>`);
      } else {
        html += dd("car", [F.brand, F.yearMin && "از " + faY(F.yearMin), F.gearbox].filter(Boolean).join("، ") || "برند و مدل", F.brand || F.yearMin || F.yearMax || F.gearbox || F.mileageMax,
          `<div class="dd__label">برند</div><input class="input" id="ddBrand" list="brandList" value="${esc(F.brand || "")}" placeholder="مثلاً پژو ۲۰۶"><datalist id="brandList">${CAR_BRANDS.map((b) => `<option value="${b}">`).join("")}</datalist>
          <div class="dd__label">سال تولید</div><div class="range"><input class="input" id="ddYMin" inputmode="numeric" placeholder="از ۱۳۹۰" value="${F.yearMin ? faY(F.yearMin) : ""}"><input class="input" id="ddYMax" inputmode="numeric" placeholder="تا ۱۴۰۴" value="${F.yearMax ? faY(F.yearMax) : ""}"></div>
          <div class="dd__label">حداکثر کارکرد (کیلومتر)</div><input class="input input--ltr" id="ddKm" inputmode="numeric" value="${F.mileageMax ? (+F.mileageMax).toLocaleString("en-US") : ""}">
          <div class="dd__label">گیربکس</div><div class="dd__grid">${["", "دنده‌ای", "اتوماتیک"].map((g) => `<button type="button" class="chip ${(F.gearbox || "") === g ? "is-on" : ""}" data-pick="gearbox" data-val="${g}">${g || "همه"}</button>`).join("")}</div>`);
      }
      html += dd("price", priceLabel, priceSet, `<div class="dd__label">${F.deal === "rent" ? "ودیعه معادل (ودیعه + اجاره ÷ ۳٪)" : F.deal === "daily" ? "اجاره هر شب" : "قیمت کل"} به تومان</div><div class="range"><input class="input" id="ddMin" placeholder="از" value="${F.min ? money(+F.min) : ""}"><input class="input" id="ddMax" placeholder="تا" value="${F.max ? money(+F.max) : ""}"></div><p class="small muted" style="margin-top:8px">عدد یا عبارت بنویسید: «۲ میلیارد»، «۸۰۰ میلیون».</p>`);
      if (!isCar()) {
        const moreOn = am.length || F.rooms || F.areaMin || F.areaMax;
        html += dd("more", "متراژ و امکانات", moreOn,
          `<div class="dd__label">متراژ (متر مربع)</div><div class="range"><input class="input" id="ddAMin" inputmode="numeric" placeholder="از" value="${F.areaMin || ""}"><input class="input" id="ddAMax" inputmode="numeric" placeholder="تا" value="${F.areaMax || ""}"></div>
          <div class="dd__label">اتاق خواب</div><div class="dd__grid">${[0, 1, 2, 3, 4].map((r) => `<button type="button" class="chip ${(+F.rooms || 0) === r ? "is-on" : ""}" data-pick="rooms" data-val="${r || ""}">${r ? fa(r) + (r === 4 ? "+" : "") : "همه"}</button>`).join("")}</div>
          <div class="dd__label">امکانات</div><div class="dd__grid">${AMENITIES.map((a) => `<button type="button" class="chip ${am.includes(a.id) ? "is-on" : ""}" data-toggle="amenities" data-val="${a.id}">${a.name}</button>`).join("")}</div>`);
      }
      html += `<button type="button" class="chip ${F.drop ? "is-on" : ""}" id="dropChip">کاهش قیمت</button>`;
      $("#dds").innerHTML = html;

      $("#vSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.dataset.v !== F.vertical) set({ vertical: b.dataset.v, city: F.city, province: F.province }, true); });
      $("#dropChip").addEventListener("click", () => set({ drop: F.drop ? "" : 1 }));
      $$(".dd").forEach((d) => {
        d.firstElementChild.addEventListener("click", (e) => { e.stopPropagation(); const open = d.classList.contains("is-open"); $$(".dd.is-open").forEach((x) => x.classList.remove("is-open")); d.classList.toggle("is-open", !open); });
        const panel = d.querySelector(".dd__panel");
        const pending = {};
        panel.addEventListener("click", (e) => {
          e.stopPropagation();
          const t = e.target.closest("button"); if (!t) return;
          if (t.dataset.prov) { set({ province: t.dataset.prov, city: "" }); return; }
          if (t.dataset.pick) {
            $$(`[data-pick="${t.dataset.pick}"]`, panel).forEach((x) => x.classList.toggle("is-on", x === t));
            pending[t.dataset.pick] = t.dataset.val;
            if (d.dataset.dd === "deal") set({ deal: t.dataset.val });
            return;
          }
          if (t.dataset.toggle) { t.classList.toggle("is-on"); return; }
          if (t.dataset.clear) {
            set({ city: { city: "", province: "" }, deal: { deal: "" }, kinds: { kinds: "" }, price: { min: "", max: "" }, more: { areaMin: "", areaMax: "", rooms: "", amenities: "" }, car: { brand: "", yearMin: "", yearMax: "", mileageMax: "", gearbox: "" } }[t.dataset.clear]);
            return;
          }
          if (t.dataset.apply) {
            const id = t.dataset.apply, p = { ...pending };
            const toggles = (k) => $$(`[data-toggle="${k}"].is-on`, panel).map((x) => x.dataset.val).join(",");
            if (id === "city") { const c = UI.cityOf($("#ddCity").value); Object.assign(p, c ? { city: c.id, province: c.province } : { city: "" }); }
            if (id === "kinds") p.kinds = toggles("kinds");
            if (id === "price") { p.min = moneyIn($("#ddMin").value); p.max = moneyIn($("#ddMax").value); }
            if (id === "more") { p.areaMin = num($("#ddAMin").value) || ""; p.areaMax = num($("#ddAMax").value) || ""; p.amenities = toggles("amenities"); }
            if (id === "car") { p.brand = $("#ddBrand").value.trim(); p.yearMin = yearIn($("#ddYMin").value); p.yearMax = yearIn($("#ddYMax").value); p.mileageMax = num($("#ddKm").value) || ""; }
            set(p);
          }
        });
        panel.addEventListener("change", (e) => { if (e.target.id === "ddCity") panel.querySelector("[data-apply]").click(); });
      });
    }
    const yearIn = (v) => { let y = num(v); if (y && y < 100) y += 1300; return y || ""; };
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
      if (F.deal && !isCar()) t.push(["deal", UI.dealName(F.deal)]);
      (F.kinds || "").split(",").filter(Boolean).forEach((k) => t.push(["kinds:" + k, UI.kindName(k)]));
      if (F.brand) t.push(["brand", F.brand]);
      if (F.yearMin) t.push(["yearMin", "از مدل " + faY(F.yearMin)]);
      if (F.yearMax) t.push(["yearMax", "تا مدل " + faY(F.yearMax)]);
      if (F.mileageMax) t.push(["mileageMax", "کارکرد تا " + fa(F.mileageMax)]);
      if (F.gearbox) t.push(["gearbox", F.gearbox]);
      if (F.min) t.push(["min", "از " + money(+F.min)]);
      if (F.max) t.push(["max", "تا " + money(+F.max)]);
      if (F.areaMin) t.push(["areaMin", "از " + fa(F.areaMin) + " متر"]);
      if (F.areaMax) t.push(["areaMax", "تا " + fa(F.areaMax) + " متر"]);
      if (F.rooms) t.push(["rooms", fa(F.rooms) + " خواب"]);
      (F.amenities || "").split(",").filter(Boolean).forEach((a) => t.push(["amenities:" + a, AMENITIES.find((x) => x.id === a)?.name || a]));
      if (F.q) t.push(["q", "«" + F.q + "»"]);
      if (F.drop) t.push(["drop", "کاهش قیمت"]);
      $("#atags").innerHTML = t.map(([k, v]) => `<button class="atag" data-rm="${esc(k)}">${esc(v)} <i>✕</i></button>`).join("");
    }

    async function update(params) {
      F = { ...params };
      page = +F.page || 0; delete F.page;
      if (!F.vertical) F.vertical = "estate";
      dropdowns(); activeTags(); applyView();
      const sorts = isCar() ? [["new", "جدیدترین"], ["deal", "بهترین معامله"], ["cheap", "ارزان‌ترین"], ["exp", "گران‌ترین"], ["drop", "بیشترین کاهش"]]
        : [["new", "جدیدترین"], ["deal", "بهترین معامله"], ["cheap", "ارزان‌ترین"], ["exp", "گران‌ترین"], ["ppm", "ارزان‌ترین هر متر"], ["area", "بزرگ‌ترین"], ["drop", "بیشترین کاهش"]];
      $("#sort").innerHTML = sorts.map(([v, n]) => `<option value="${v}" ${(F.sort || "new") === v ? "selected" : ""}>${n}</option>`).join("");
      $("#grid").innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join("");
      const id = ++reqId;
      const r = await DataLayer.search({ ...F, limit: PER, offset: page * PER });
      if (id !== reqId || !$("#grid")) return;
      $("#sTitle").innerHTML = `${esc(titleOf())}<small>${fa(r.total)} آگهی</small>`;
      document.title = `${titleOf()} | ${cfg.site.name}`;
      $("#grid").innerHTML = r.items.length ? r.items.map((l) => UI.card(l)).join("")
        : `<div class="empty" style="grid-column:1/-1">${icon("search")}<h3>آگهی‌ای با این مشخصات نیست</h3><p>چند فیلتر را بردارید یا از دستیار بخواهید گزینه نزدیک پیدا کند.</p><a class="btn btn--ink" href="#/s?vertical=${F.vertical}">نمایش همه</a></div>`;
      if (!r.items.length) relaxHints(id);
      const pages = Math.ceil(r.total / PER);
      $("#pager").innerHTML = pages > 1 ? `${page > 0 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page - 1 })}">قبلی</a>` : ""}<span class="btn btn--ghost">صفحه ${fa(page + 1)} از ${fa(pages)}</span>${page < pages - 1 ? `<a class="btn btn--line" href="#/s?${toQuery({ ...F, page: page + 1 })}">بعدی</a>` : ""}` : "";
      lastPoints = r.points;
      drawMap(r.points, true);
    }

    // پیشنهاد حذف یک قید با نمایش تعداد نتیجه هرکدام (به سبک Zillow)
    async function relaxHints(id) {
      const keys = ["amenities", "rooms", "areaMin", "areaMax", "kinds", "max", "min", "yearMin", "yearMax", "mileageMax", "gearbox", "brand", "deal", "drop", "city"].filter((k) => F[k]);
      const names = { amenities: "بدون امکانات انتخابی", rooms: "هر تعداد خواب", areaMin: "هر متراژ", areaMax: "هر متراژ", kinds: "همه انواع ملک", max: "بدون سقف قیمت", min: "بدون کف قیمت", yearMin: "هر سال تولید", yearMax: "هر سال تولید", mileageMax: "هر کارکرد", gearbox: "هر گیربکس", brand: "همه برندها", deal: "همه معامله‌ها", drop: "همه آگهی‌ها", city: "کل استان" };
      const opts = [];
      for (const k of keys) {
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
      const pin = (p) => {
        const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "pin-wrap", html: `<span class="pin pin--${p.vertical === "car" ? "car" : p.deal}">${esc(UI.pinLabel(p))}</span>`, iconSize: null }) }).addTo(state.layer);
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
  async function adPage(id) {
    view().innerHTML = `<div class="wrap ad"><div class="skeleton" style="height:440px"></div></div>`;
    const l = await DataLayer.get(id);
    if (!l) { view().innerHTML = `<div class="wrap ad"><div class="empty"><h3>این آگهی پیدا نشد</h3><p>ممکن است در منبع حذف شده باشد.</p><a class="btn btn--ink" href="#/">بازگشت به خانه</a></div></div>`; return; }
    const c = UI.cityOf(l.city_key), s = cfg.site;
    const imgs = l.images && l.images.length ? l.images : l.image ? [l.image] : [];
    const gal = Array.from({ length: 5 }, (_, i) => `<button data-img="${i}" aria-label="تصویر ${fa(i + 1)}">${UI.media(l, imgs.length ? Math.min(i, imgs.length - 1) : i)}${i === 4 && imgs.length > 5 ? `<span class="more">+${fa(imgs.length - 5)} عکس</span>` : ""}</button>`).join("");
    const facts = l.vertical === "car"
      ? [["سال تولید", l.year && faY(l.year)], ["کارکرد", l.mileage != null && fa(l.mileage) + " کیلومتر"], ["گیربکس", l.gearbox], ["سوخت", l.fuel], ["رنگ", l.color], ["وضعیت بدنه", l.body]]
      : [["نوع", UI.kindName(l.kind)], ["متراژ", l.area && fa(l.area) + " متر"], ["اتاق", l.rooms != null && fa(l.rooms)], ["سال ساخت", l.year && faY(l.year)], ["طبقه", l.floor != null && fa(l.floor)], ["قیمت هر متر", l.ppm && money(l.ppm)]];
    const v = l.verdict;
    const markPos = v ? Math.max(2, Math.min(98, ((v.delta + 0.25) / 0.5) * 100)) : 50;
    const checklist = l.vertical === "car"
      ? ["استعلام خلافی و پلاک", "بیمه‌نامه و سال‌های تخفیف", "کارشناسی بدنه، شاسی و موتور", "تطبیق شماره موتور و شاسی با سند", "استعلام توقیف و رهن"]
      : ["دیدن اصل سند و تطبیق مشخصات با ملک", "استعلام وضعیت حقوقی و توقیف", "پایان‌کار و پروانه ساخت (ملک نوساز)", "بدهی عوارض، آب، برق و گاز", l.deal === "rent" ? "دریافت کد رهگیری اجاره‌نامه" : "تنظیم قرارداد با کد رهگیری"];
    const has = (a) => (l.amenities || []).includes(a);
    const amen = l.vertical === "estate" ? AMENITIES.map((a) => `<li class="${has(a.id) ? "" : "is-off"}">${icon(has(a.id) ? "check" : "x")}${a.name}</li>`).join("") : "";
    const attrs = Object.entries(l.attributes || {}).filter(([, val]) => val && String(val).length < 80);
    const share = location.href;
    view().innerHTML = `
    <article class="wrap ad">
      <nav class="crumbs"><a href="#/">خانه</a><span><a href="#/s?vertical=${l.vertical}">${l.vertical === "car" ? "خودرو" : "املاک"}</a></span>${c ? `<span><a href="#/s?vertical=${l.vertical}&city=${c.id}">${c.name}</a></span>` : ""}<span>${UI.tt(l.title)}</span></nav>
      <div class="gallery" id="gal">${gal}</div>
      <div class="ad__grid">
        <div>
          <header class="ad__head">
            <div class="ad__badges">${UI.typePill(l)}${UI.dealPill(v)}${l.price_drop ? `<span class="pill pill--drop">${fa(Math.round(l.price_drop * 100))}٪ کاهش قیمت</span>` : ""}${l.source === "sample" ? '<span class="pill pill--demo">آگهی نمونه</span>' : ""}</div>
            <h1>${UI.tt(l.title)}</h1>
            <p class="muted">${esc([c && "استان " + UI.provOf(c.province).name, c ? c.name : l.city_name, l.district].filter(Boolean).join("، "))}${l.first_seen ? " · ثبت در سامانه " + UI.ago(l.first_seen) : ""}</p>
            <div class="ad__price">${UI.priceHTML(l, true)}</div>
          </header>
          <div class="facts">${facts.filter(([, x]) => x).map(([k, x]) => `<div><span>${k}</span><b>${esc(x)}</b></div>`).join("")}</div>
          ${v ? `<div class="verdict-box"><h3>${UI.dealPill(v)} ${v.delta < 0 ? fa(Math.round(-v.delta * 100)) + "٪ زیر" : fa(Math.round(v.delta * 100)) + "٪ بالای"} میانه بازار</h3>
            <p>میانه ${l.vertical === "car" ? "قیمت" : "قیمت هر متر"} ${fa(v.n)} آگهی مشابه ${l.vertical === "car" ? "(همین برند و سال)" : "در " + (c ? c.name : "این شهر")}: <b>${money(v.median)} تومان</b>${DataLayer.samples ? " (داده نمونه)" : ""}</p>
            <div class="gauge"><div class="gauge__bar"><span></span><span></span><span></span><span></span><span></span><i class="gauge__mark" style="right:${markPos}%"></i></div>
            <div class="gauge__labels"><span>عالی</span><span>خوب</span><span>منصفانه</span><span>گران</span><span>خیلی گران</span></div></div></div>` : ""}
          ${l.history && l.history.length > 1 ? `<section class="block"><h2>تاریخچه قیمت</h2>${UI.spark(l.history)}</section>` : ""}
          ${l.description ? `<section class="block"><h2>توضیحات آگهی‌دهنده</h2><p>${esc(l.description)}</p></section>` : ""}
          ${amen ? `<section class="block"><h2>امکانات</h2><ul class="amen-list">${amen}</ul><p class="small muted" style="margin-top:10px">امکانات از متن آگهی استخراج شده است؛ در بازدید تأیید کنید.</p></section>` : ""}
          ${attrs.length ? `<section class="block"><h2>مشخصات</h2><div class="attrs">${attrs.map(([k, x]) => `<div><span>${esc(k)}</span><b>${esc(x)}</b></div>`).join("")}</div></section>` : ""}
          <section class="block"><h2>موقعیت تقریبی</h2><div class="minimap-wrap"><div class="minimap" id="mini"></div></div><p class="small muted" style="margin-top:8px">${l.latlng_exact ? "موقعیت اعلام‌شده در آگهی." : "نقطه تقریبی در محدوده شهر؛ نشانی دقیق هنگام هماهنگی بازدید."}</p></section>
          <section class="block"><h2>پیش از معامله</h2><ul class="check">${checklist.map((x) => `<li>${x}</li>`).join("")}</ul></section>
          ${l.url ? `<div class="source"><span>منبع آگهی: دیوار</span><a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">مشاهده آگهی اصلی ←</a></div>` : ""}
          ${l.similar && l.similar.length ? `<section class="block"><h2>آگهی‌های مشابه</h2><div class="cards">${l.similar.slice(0, 3).map((x) => UI.card(x, { compare: false })).join("")}</div></section>` : ""}
        </div>
        <aside class="agent" id="agent">
          <div class="agent__who"><span class="agent__ava">${esc((s.owner_name || s.name || "آ").trim()[0])}</span><div><b>${esc(s.owner_name || "مشاور " + s.name)}</b><span>${esc(s.hours || "")}</span></div></div>
          ${s.phone ? `<a class="btn btn--hot btn--block btn--lg" href="tel:${esc(tel(s.phone))}">${icon("phone")} <bdi dir="ltr">${esc(s.phone)}</bdi></a>` : ""}
          <div class="agent__row">
            ${s.whatsapp || s.phone ? `<a class="btn btn--line" href="${waLink("درباره این آگهی: " + l.title + "\n" + share)}" target="_blank" rel="noopener">${icon("chat")} واتس‌اپ</a>` : ""}
            ${s.telegram ? `<a class="btn btn--line" href="https://t.me/${esc(s.telegram.replace(/^@/, ""))}" target="_blank" rel="noopener">${icon("tg")} تلگرام</a>` : ""}
            <button class="btn btn--line" id="adFav">${icon("heart")}<span>${state.favs.has(l.id) ? "ذخیره شد" : "ذخیره"}</span></button>
            <button class="btn btn--line" id="adShare">${icon("share")} اشتراک</button>
          </div>
          <form id="visitForm">
            <h3>درخواست بازدید یا مشاوره</h3>
            <input class="input" name="name" placeholder="نام شما" maxlength="80" required>
            <input class="input input--ltr" name="phone" placeholder="۰۹۱۲۳۴۵۶۷۸۹" inputmode="tel" required>
            <select class="select" name="when"><option>هر چه زودتر</option><option>امروز عصر</option><option>فردا</option><option>آخر هفته</option></select>
            <button class="btn btn--ink btn--block" type="submit">ثبت درخواست</button>
            <p class="agent__note">شماره شما فقط برای هماهنگی همین آگهی استفاده می‌شود.${l.source === "divar" ? " آگهی‌دهنده اصلی شخص دیگری است؛ هماهنگی با فروشنده از طریق ما انجام می‌شود." : ""}</p>
          </form>
        </aside>
      </div>
    </article>
    <div class="mobile-cta">${s.phone ? `<a class="btn btn--hot" href="tel:${esc(tel(s.phone))}">${icon("phone")} تماس</a>` : ""}<a class="btn btn--ink" href="#agent" id="mctaVisit">درخواست بازدید</a></div>`;
    document.body.classList.add("has-mcta");
    document.title = `${l.title} | ${s.name}`;
    const mini = UI.makeMap($("#mini"), { center: [l.lat, l.lng], zoom: 13, wheel: false });
    if (mini) L.circle([l.lat, l.lng], { radius: l.latlng_exact ? 120 : 900, color: "#df5a2c", weight: 2, fillOpacity: 0.12 }).addTo(mini);
    $("#gal").addEventListener("click", (e) => { const b = e.target.closest("[data-img]"); if (b) lightbox(l, imgs.length ? Math.min(+b.dataset.img, imgs.length - 1) : +b.dataset.img); });
    $("#adFav").addEventListener("click", (e) => { toggleFav(l.id); e.currentTarget.querySelector("span").textContent = state.favs.has(l.id) ? "ذخیره شد" : "ذخیره"; });
    $("#adShare").addEventListener("click", async () => {
      try { if (navigator.share) await navigator.share({ title: l.title, url: share }); else { await navigator.clipboard.writeText(share); toast("پیوند آگهی کپی شد"); } } catch { /* لغو کاربر */ }
    });
    $("#mctaVisit").addEventListener("click", (e) => { e.preventDefault(); $("#agent").scrollIntoView({ behavior: "smooth" }); setTimeout(() => $("#visitForm input")?.focus(), 400); });
    $("#visitForm").addEventListener("submit", (e) => submitLead(e, { listing_id: l.id, kind: "visit", message: `بازدید: ${l.title} — زمان: ${e.target.when.value}` }));
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

  /* ---------- درخواست مشتری ---------- */
  async function submitLead(e, extra) {
    e.preventDefault();
    const f = e.target;
    const phone = NLP.toEn(f.phone.value).replace(/\s/g, "");
    if (!/^(\+98|0)?9\d{9}$/.test(phone)) { toast("شماره موبایل را درست وارد کنید"); f.phone.focus(); return; }
    const btn = f.querySelector("[type=submit]");
    btn.disabled = true;
    const r = await DataLayer.lead({ name: f.name.value, phone, ...extra, message: (extra.message || "") + (f.desc && f.desc.value ? "\n" + f.desc.value : "") }).catch(() => ({ ok: false }));
    btn.disabled = false;
    if (r.ok) f.innerHTML = `<div class="empty" style="padding:24px">${icon("check")}<h3>درخواست شما ثبت شد</h3><p>${r.preview ? "در پیش‌نمایش ذخیره نمی‌شود؛ در نسخه اجراشده، در پنل مدیریت دیده می‌شود." : "به‌زودی با شما تماس می‌گیریم."}</p></div>`;
    else toast(r.error || "ثبت نشد؛ دوباره تلاش کنید");
  }
  function leadDialog(kind = "consign") {
    const consign = kind === "consign";
    openDialog(`<div class="dlg__head"><h2>${consign ? "سپردن ملک یا خودرو" : "درخواست تماس مشاور"}</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <p class="muted" style="margin-bottom:16px">${consign ? "مشخصات را بنویسید؛ کارشناس ما برای قیمت‌گذاری بر پایه بازار و انتشار آگهی تماس می‌گیرد." : "شماره‌تان را بگذارید تا مشاور با شما تماس بگیرد."}</p>
      <form class="form-grid" id="leadForm">
        ${consign ? `<div class="seg" id="lfType"><button type="button" class="is-on" data-t="ملک">ملک</button><button type="button" data-t="خودرو">خودرو</button></div>
        <label class="field"><span>شهر</span><select class="select" name="city">${CITIES.map((c) => `<option>${c.name}</option>`).join("")}</select></label>` : ""}
        <div class="row2"><label class="field"><span>نام</span><input class="input" name="name" required maxlength="80"></label>
        <label class="field"><span>موبایل</span><input class="input input--ltr" name="phone" required inputmode="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹"></label></div>
        <label class="field"><span>${consign ? "توضیح کوتاه (متراژ، مدل، قیمت مدنظر)" : "موضوع"}</span><textarea class="textarea" name="desc" maxlength="1000"></textarea></label>
        <button class="btn btn--hot btn--lg" type="submit">ثبت درخواست</button>
      </form>`);
    let type = "ملک";
    $("#lfType")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; type = b.dataset.t; $$("#lfType button").forEach((x) => x.classList.toggle("is-on", x === b)); });
    $("#leadForm").addEventListener("submit", (e) => submitLead(e, { kind, message: consign ? `سپردن ${type} در ${e.target.city.value}` : "درخواست مشاوره" }));
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
    if (!ids.length) { $("#favGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">${icon("heart")}<h3>هنوز آگهی‌ای ذخیره نشده</h3><p>روی قلب هر کارت بزنید تا اینجا بماند.</p><a class="btn btn--ink" href="#/s?vertical=estate">دیدن آگهی‌ها</a></div>`; return; }
    const r = await DataLayer.search({ ids: ids.join(","), limit: 60 });
    $("#favGrid").innerHTML = r.items.map((l) => UI.card(l)).join("") || '<p class="muted">آگهی‌های ذخیره‌شده دیگر در دسترس نیستند.</p>';
  }

  /* ---------- بازار شهرها ---------- */
  function marketPage() {
    const st = DataLayer.stats;
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      <div class="sec-head"><div><span class="kicker">گزارش بازار</span><h2>بازار ${fa(CITIES.length)} شهر شمال</h2><p>شاخص‌ها از آگهی‌های فعال همین سامانه محاسبه و با هر دور دریافت به‌روز می‌شوند${DataLayer.samples ? "؛ اکنون داده نمونه است" : ""}. میانه فقط وقتی نمایش داده می‌شود که دست‌کم ۵ آگهی مشابه وجود داشته باشد.</p></div></div>
      ${PROVINCES.map((p) => `<div class="block"><h2>${p.name}</h2><div class="tbl-wrap"><table class="cmp-tbl"><thead><tr><th>شهر</th><th>ویژگی</th><th>آگهی ملک</th><th>آگهی خودرو</th><th>میانه متری ویلا</th><th>میانه متری آپارتمان</th><th></th></tr></thead><tbody>
        ${CITIES.filter((c) => c.province === p.id).map((c) => { const s = (st.cities || {})[c.id] || {}; return `<tr><th><b style="color:var(--ink)">${c.name}</b></th><td class="muted">${c.tags.join("، ")}</td><td>${fa(s.estate || 0)}</td><td>${fa(s.car || 0)}</td><td>${s.ppm?.villa ? money(s.ppm.villa) : "—"}</td><td>${s.ppm?.apartment ? money(s.ppm.apartment) : "—"}</td><td><a class="btn btn--ghost btn--sm" href="#/s?city=${c.id}">آگهی‌ها</a></td></tr>`; }).join("")}
      </tbody></table></div></div>`).join("")}
    </div></section>`;
  }

  /* ---------- خدمات و پرداخت ---------- */
  function payPage() {
    const p = cfg.payment, s = cfg.site;
    const card = NLP.toEn(p.card || "").replace(/\D/g, "");
    const fmtCard = card.replace(/(\d{4})(?=\d)/g, "$1 ");
    view().innerHTML = `<section class="section--tight"><div class="wrap">
      <div class="sec-head"><div><span class="kicker">خدمات و پرداخت</span><h2>تعرفه خدمات و اطلاعات حساب</h2><p>${esc(p.note || "پیش از واریز با مشاور هماهنگ کنید و تصویر رسید را بفرستید.")}</p></div></div>
      <div class="pay">
        <div class="svc">${(p.services || []).length ? p.services.map((x) => `<div><b>${esc(x.title)}</b><b style="color:var(--forest)">${esc(x.price || "")}</b>${x.desc ? `<small>${esc(x.desc)}</small>` : ""}</div>`).join("") : `<div><b>تعرفه خدمات</b><span class="muted">هنوز در پنل مدیریت ثبت نشده است</span></div>`}
          ${s.phone ? `<a class="btn btn--hot btn--lg" href="tel:${esc(tel(s.phone))}" style="margin-top:8px">${icon("phone")} هماهنگی: <bdi dir="ltr">${esc(s.phone)}</bdi></a>` : ""}</div>
        <div>
          ${card || p.sheba ? `<div class="bankcard"><div style="display:flex;justify-content:space-between"><b>${esc(p.bank || "")}</b><b>${esc(s.name)}</b></div><div class="bankcard__no">${esc(fmtCard || "—")}</div><div>${esc(p.holder || "")}</div></div>
          ${card ? `<div class="copy-row"><div><span>شماره کارت</span><code>${esc(fmtCard)}</code></div><button class="btn btn--line btn--sm" data-copy="${esc(card)}">${icon("copy")} کپی</button></div>` : ""}
          ${p.sheba ? `<div class="copy-row"><div><span>شماره شبا</span><code>${esc(p.sheba)}</code></div><button class="btn btn--line btn--sm" data-copy="${esc(p.sheba)}">${icon("copy")} کپی</button></div>` : ""}`
          : `<div class="empty"><h3>اطلاعات حساب هنوز ثبت نشده</h3><p>شماره کارت و شبا را از پنل مدیریت، بخش «تنظیمات»، وارد کنید.</p><a class="btn btn--ink" href="admin.html">ورود به پنل</a></div>`}
        </div>
      </div>
    </div></section>`;
    $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("کپی شد"); } catch { toast(b.dataset.copy); } }));
  }

  /* ---------- علاقه‌مندی و مقایسه ---------- */
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
    const car = ls.every((l) => l.vertical === "car");
    const best = (fn, low = true) => { const v = ls.map(fn).filter((x) => x > 0); return v.length ? (low ? Math.min(...v) : Math.max(...v)) : null; };
    const row = (label, fn, b = null, fmt = (x) => x ?? "—") => `<tr><th>${label}</th>${ls.map((l) => { const x = fn(l); return `<td class="${b !== null && x === b ? "is-best" : ""}">${fmt(x, l)}</td>`; }).join("")}</tr>`;
    openDialog(`<div class="dlg__head"><h2>مقایسه</h2><button class="icon-btn" data-close aria-label="بستن">${icon("x")}</button></div>
      <div class="tbl-wrap"><table class="cmp-tbl"><thead><tr><th></th>${ls.map((l) => `<th><div class="cmp-img">${UI.media(l)}</div><a href="#/ad/${encodeURIComponent(l.id)}" data-close>${UI.tt(l.title)}</a></th>`).join("")}</tr></thead><tbody>
      ${row("شهر", (l) => l.city_name || UI.cityOf(l.city_key)?.name)}
      ${row(car ? "قیمت" : "قیمت / ودیعه معادل", (l) => l.pp, best((l) => l.pp), (x) => (x ? money(x) + " تومان" : "توافقی"))}
      ${row("رتبه قیمت", (l) => l.verdict, null, (x) => (x ? UI.dealPill(x) : "—"))}
      ${car ? row("سال", (l) => l.year, best((l) => l.year, false), (x) => (x ? faY(x) : "—")) + row("کارکرد", (l) => l.mileage, best((l) => l.mileage), (x) => (x != null ? fa(x) : "—")) + row("گیربکس", (l) => l.gearbox) + row("بدنه", (l) => l.body)
        : row("متراژ", (l) => l.area, best((l) => l.area, false), (x) => (x ? fa(x) + " متر" : "—")) + row("قیمت هر متر", (l) => l.ppm, best((l) => l.ppm), (x) => (x ? money(x) : "—")) + row("خواب", (l) => l.rooms, null, (x) => (x != null ? fa(x) : "—")) + AMENITIES.map((a) => row(a.name, (l) => (l.amenities || []).includes(a.id), null, (x) => (x ? "✓" : "—"))).join("")}
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
        say(`سلام! من دستیار ${esc(cfg.site.name)} هستم. بنویس دنبال چه هستی؛ مثلاً «ویلای جنگلی تو نور با استخر تا ۱۵ میلیارد» یا «پژو ۲۰۶ مدل ۹۸ به بالا در رشت». قیمت هر متر را هم حساب می‌کنم.`);
        sugs(["ویلای ساحلی محمودآباد", "آپارتمان ۲ خوابه رشت رهن", "دنا پلاس ساری", "قیمت هر متر ویلا در رامسر"]);
      }
      setTimeout(() => $("#aiInput").focus(), 50);
    }
    const mini = (ls) => `<div class="mini">${ls.map((l) => `<a href="#/ad/${encodeURIComponent(l.id)}"><span class="mini__img">${UI.media(l)}</span><span><b>${UI.tt(l.title)}</b><small>${esc(UI.pinLabel(l))}${l.verdict ? " · " + DEAL_BANDS[l.verdict.band].name : ""}</small></span></a>`).join("")}</div>`;
    async function respond(v) {
      const it = NLP.intent(v);
      if (it === "greet") { say("درود! کدام شهر و چه نوع ملک یا خودرویی؟ بودجه را هم بگو."); return; }
      if (it === "post") { say("فرم سپردن ملک یا خودرو را باز می‌کنم؛ کارشناس ما برای قیمت‌گذاری تماس می‌گیرد."); setTimeout(() => leadDialog("consign"), 600); return; }
      if (it === "contact") { const s = cfg.site; say(s.phone ? `برای مشاوره با <a href="tel:${esc(tel(s.phone))}"><b><bdi dir="ltr">${esc(s.phone)}</bdi></b></a> تماس بگیر${s.whatsapp ? ` یا در <a href="${waLink()}" target="_blank" rel="noopener">واتس‌اپ</a> پیام بده` : ""}.` : "فرم درخواست تماس را باز می‌کنم."); if (!s.phone) setTimeout(() => leadDialog("advice"), 600); return; }
      if (it === "loan") {
        const m = NLP.parseQuery(v).filters.max || 1e9, yr = +(NLP.normalize(v).match(/(\d+)\s*سال/) || [])[1] || 5;
        const r = 0.23 / 12, n = yr * 12, pay = (m * r) / (1 - Math.pow(1 + r, -n));
        say(`قسط وام ${money(m)} تومان با سود ۲۳٪ در ${fa(yr)} سال: حدود <b>${fa(Math.round(pay))} تومان</b> در ماه (استهلاک یکنواخت). نرخ را در بخش ابزارها تغییر بده.`);
        return;
      }
      const { filters, tags } = NLP.parseQuery(v);
      if (it === "value") {
        if (!filters.city) { say("برای کدام شهر؟ مثلاً «قیمت هر متر آپارتمان در بابلسر»."); return; }
        const kind = (filters.kinds || "villa").split(",")[0];
        const r = await DataLayer.search({ vertical: "estate", deal: "sale", city: filters.city, kinds: kind, limit: 60 });
        const p = r.items.map((l) => l.ppm).filter(Boolean);
        say(p.length >= 3 ? `میانه قیمت هر متر ${UI.kindName(kind)} در ${UI.cityOf(filters.city).name}، از ${fa(p.length)} آگهی فروش: <b>${money(median(p))} تومان</b>${DataLayer.samples ? " (داده نمونه است)" : ""}.` : `آگهی فروش کافی برای ${UI.kindName(kind)} در ${UI.cityOf(filters.city).name} نداریم (${fa(p.length)} مورد).`);
        return;
      }
      if (!tags.length) { say("متوجه نشدم. نام شهر، نوع ملک یا خودرو و بودجه را بنویس."); return; }
      const f = { ...filters }, dropped = [];
      let r = await DataLayer.search({ ...f, limit: 3, sort: f.sort || "deal" });
      for (const [k, name] of [["amenities", "امکانات"], ["rooms", "تعداد خواب"], ["areaMin", "متراژ"], ["areaMax", "متراژ"], ["mileageMax", "کارکرد"], ["yearMin", "سال"], ["yearMax", "سال"], ["max", "سقف بودجه"], ["city", "شهر"]]) {
        if (r.total || !f[k]) continue;
        delete f[k]; dropped.push(name);
        r = await DataLayer.search({ ...f, limit: 3, sort: f.sort || "deal" });
      }
      go("#/s?" + toQuery(f));
      say(`${tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join(" ")}<br>${dropped.length ? `مورد کاملاً منطبق نبود؛ «${[...new Set(dropped)].join("، ")}» را کنار گذاشتم و ` : ""}${r.total ? `<b>${fa(r.total)}</b> آگهی پیدا کردم. بهترین‌ها از نظر قیمت:` : "چیزی پیدا نشد."}`);
      if (r.items.length) say(mini(r.items));
      sugs(["فقط کاهش قیمت‌خورده‌ها", "ارزان‌ترین‌ها", "تماس با مشاور"]);
    }
    function bind() {
      $("#aiFab").addEventListener("click", open);
      $("#aiClose").addEventListener("click", () => { $("#ai").hidden = true; $("#aiFab").classList.remove("is-hidden"); });
      $("#aiSugs").addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        const t = b.textContent;
        if (t === "فقط کاهش قیمت‌خورده‌ها" || t === "ارزان‌ترین‌ها") {
          const { params } = parseHash();
          go("#/s?" + toQuery({ ...params, ...(t === "ارزان‌ترین‌ها" ? { sort: "cheap" } : { drop: 1 }) }));
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
    $("#consignBtn").addEventListener("click", () => leadDialog("consign"));
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
