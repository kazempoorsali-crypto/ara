/* لایه داده فرصت‌یاب: اگر سرور در دسترس باشد از API آن می‌خواند،
   وگرنه (پیش‌نمایش آنلاین یا باز کردن مستقیم فایل) با آگهی‌های نمونه و ارزش‌گذاری ساده کار می‌کند. */
const DataLayer = (() => {
  const RENT_RATE = 0.03;
  const DEFAULT_CONFIG = {
    mode: "preview",
    site: { name: "فرصت‌یاب", tagline: "قیمت منصفانه ملک در شمال", about: "", email: "" },
    display: { show_samples: true },
    plans: [], payable: false, free_preview: 3, free_results: 10, sms_live: false, owner: {},
    thresholds: { opp: 0.15, gold: 0.22, sus: 0.4 },
  };
  let config = DEFAULT_CONFIG, server = false, useSamples = true, stats = null, me = null;
  const tok = { get() { try { return localStorage.getItem("fy:token") || ""; } catch { return ""; } },
                set(v) { try { v ? localStorage.setItem("fy:token", v) : localStorage.removeItem("fy:token"); } catch { /* حالت خصوصی */ } } };
  const H = () => ({ "content-type": "application/json", "x-user-token": tok.get() });

  async function init() {
    try {
      const r = await fetch("api/config", { cache: "no-store" });
      if (!r.ok) throw 0;
      config = await r.json();
      server = true;
      stats = await (await fetch("api/stats", { cache: "no-store" })).json();
      useSamples = !stats.total && config.display.show_samples;
      if (tok.get()) me = (await (await fetch("api/me", { headers: H() })).json()).user;
    } catch {
      server = false; useSamples = true;
    }
    if (useSamples) stats = localStats();
    return { config, server, useSamples, stats, me };
  }

  /* ---------- حالت نمونه: همان قاعده‌های سرور در مقیاس کوچک ---------- */
  const TH = { opp: 0.15, gold: 0.22, sus: 0.4, disp_k: 1.0 };
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mad = (a) => { const m = median(a); return median(a.map((x) => Math.abs(x - m))); };
  const valueOf = (l) => (l.deal === "daily" ? l.price : l.area ? l.pp / l.area : null);
  const kg = (k) => ({ garden: "land", suite: "apartment", shop: "commercial", office: "commercial" }[k] || k);
  const CTX = [[/فوری|عجله/, "فروشنده عجله دارد"], [/از مالک|بدون واسطه/, "آگهی خود مالک"]];
  const CAU = [[/قولنامه|وکالتی/, "سند قول‌نامه‌ای یا وکالتی"], [/مستاجر|مستأجر/, "مستأجر دارد"]];
  const RURAL = /روستا|دهستان|خارج ?از ?(شهر|محدوده|بافت)|حاشیه ?شهر|ییلاق/;
  const settleOf = (l) => (RURAL.test(l.district || "") || /روستای|در روستا|دهستان/.test((l.title || "") + " " + (l.description || "")) ? "rural" : "urban");
  let prepared = false;
  function prepare() {
    if (prepared) return;
    prepared = true;
    SAMPLE_LISTINGS.forEach((l) => { l.settlement = settleOf(l); });
    const cell = (l) => [l.city_key, l.district || "", kg(l.kind), l.deal].join("|");
    const city = (l) => [l.city_key, kg(l.kind), l.deal].join("|");
    const prov = (l) => [l.province, kg(l.kind), l.deal].join("|");
    const G = { cell: {}, city: {}, prov: {} };
    SAMPLE_LISTINGS.forEach((l) => {
      const v = valueOf(l); if (!v) return;
      l._lv = Math.log(v);
      (G.cell[cell(l)] = G.cell[cell(l)] || []).push(l._lv);
      (G.city[city(l)] = G.city[city(l)] || []).push(l._lv);
      (G.prov[prov(l)] = G.prov[prov(l)] || []).push(l._lv);
    });
    SAMPLE_LISTINGS.forEach((l) => {
      if (l._lv == null) return;
      const c = G.city[city(l)] || [], d = l.district ? G.cell[cell(l)] || [] : [];
      if (d.length < 5) return; // قیمت محله فقط از آگهی‌های همان محله؛ محلهٔ کم‌آگهی «در انتظار داده»
      const base = median(d);
      const sig = Math.max(0.06, 1.4826 * mad(d));
      const fv = Math.exp(base), r = l._lv - base;
      l.fair_ppm = fv; l.fair_price = l.deal === "daily" ? fv : fv * l.area;
      l.discount = +(1 - Math.exp(r)).toFixed(3);
      const raw = d.map(Math.exp);
      const text = (l.title || "") + " " + (l.description || "");
      l.explain = { district_n: d.length, city_n: c.length, effects: [], sample: true, base_ppm: fv, district_median: raw.length >= 3 ? median(raw) : null,
        district_raw_n: raw.length, ctx: CTX.filter(([rx]) => rx.test(text)).map(([, t]) => t), caution: CAU.filter(([rx]) => rx.test(text)).map(([, t]) => t), sus: [], flags: [] };
      const out = -r >= TH.disp_k * sig, dd = l.discount;
      if (dd >= TH.sus || (Math.abs(r) / sig > 3.5 * 1.4826 && dd > 0)) { l.label = "sus"; l.excluded = 1; l.explain.flags = [dd >= TH.sus ? "بیش از حد ارزان‌تر از قیمت محله؛ باورپذیر نیست" : "قیمت به‌طور غیرعادی پایین"]; return; }
      l.label = dd >= TH.gold && out ? "gold" : dd >= TH.opp && out ? "good" : dd <= -TH.opp ? "high" : "fair";
      l.explain.wide = dd >= TH.opp && !out;
      l.confidence = d.length >= 15 ? "high" : d.length >= 8 ? "medium" : "low";
      if (!["gold", "good"].includes(l.label)) l.score = Math.round(Math.max(0, Math.min(64, 50 + (dd / TH.opp) * 14)));
    });
    const opp = {};
    SAMPLE_LISTINGS.filter((l) => ["gold", "good"].includes(l.label)).forEach((l) => (opp[cell(l)] = opp[cell(l)] || []).push(l));
    Object.values(opp).forEach((ls) => {
      ls.sort((a, b) => b.discount - a.discount);
      ls.forEach((l, i) => {
        const p = (ls.length - i) / ls.length, depth = Math.max(0, Math.min(1, (l.discount - TH.opp) / (TH.sus - TH.opp)));
        l.score = Math.round(65 + 35 * (0.5 * p + 0.5 * depth));
        l.explain.rank = i + 1; l.explain.rank_n = ls.length;
      });
    });
    SAMPLE_LISTINGS.forEach((l) => { if (!l.label) l.label = "pending"; });
  }
  function verdict(l) {
    if (l.discount == null || (l.excluded && l.label !== "sus")) return null;
    const ex = l.explain || {};
    return { label: l.label, delta: -l.discount, n: ex.district_n || 0, city_n: ex.city_n || 0, confidence: l.confidence, score: l.score, wide: ex.wide, rank: ex.rank, rank_n: ex.rank_n };
  }
  const jYear = () => { const d = new Date(); return d.getFullYear() - 621 - (d.getMonth() < 2 || (d.getMonth() === 2 && d.getDate() < 21) ? 1 : 0); };
  function filterLocal(f) {
    const ds = f.district ? f.district.split(",").map((x) => x.replace(/[\s‌]/g, "")) : null;
    const rooms = f.rooms !== undefined && f.rooms !== "" ? String(f.rooms).split(",").filter((x) => x !== "").map(Number) : null;
    return SAMPLE_LISTINGS.filter((l) => {
      if (l.excluded && !(f.sus && l.label === "sus")) return false;
      if (f.city && l.city_key !== f.city) return false;
      if (!f.city && f.province && l.province !== f.province) return false;
      if (ds && !ds.includes((l.district || "").replace(/[\s‌]/g, ""))) return false;
      if (f.deal && l.deal !== f.deal) return false;
      if (f.settle && l.settlement !== f.settle) return false;
      if (f.fresh && !((l.posted_at || l.first_seen) >= Date.now() / 1000 - +f.fresh * 86400)) return false;
      if (f.kinds && !f.kinds.split(",").includes(l.kind)) return false;
      if (f.min && !(l.pp >= +f.min)) return false;
      if (f.max && !(l.pp <= +f.max)) return false;
      if (f.depMax && !(l.deposit <= +f.depMax)) return false;
      if (f.rentMax && !(l.rent <= +f.rentMax)) return false;
      if (f.areaMin && !(l.area >= +f.areaMin)) return false;
      if (f.areaMax && !(l.area <= +f.areaMax)) return false;
      if (f.ageMax && !(l.year >= jYear() - +f.ageMax)) return false;
      if (rooms && rooms.length && !rooms.some((r) => (r >= 4 ? l.rooms >= 4 : l.rooms === r))) return false;
      if (f.amenities && !f.amenities.split(",").every((a) => l.amenities.includes(a))) return false;
      if (f.drop && !l.price_drop) return false;
      if (f.ranked && l.score == null) return false;
      if (f.opp && !["gold", "good"].includes(l.label)) return false;
      if (f.photo && !l.image) return false;
      if (f.minScore && !(l.score >= +f.minScore)) return false;
      if (f.ids && !f.ids.split(",").includes(l.id)) return false;
      if (f.q && !f.q.split(/\s+/).every((w) => (l.title + " " + (l.district || "")).includes(w))) return false;
      return true;
    });
  }
  function localSearch(f) {
    prepare();
    let list = filterLocal(f);
    const by = {
      score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.discount ?? -9) - (a.discount ?? -9),
      deal: (a, b) => (b.discount ?? -9) - (a.discount ?? -9),
      new: (a, b) => b.first_seen - a.first_seen,
      cheap: (a, b) => (a.pp ?? 1e18) - (b.pp ?? 1e18),
      exp: (a, b) => (b.pp ?? 0) - (a.pp ?? 0),
      ppm: (a, b) => (a.ppm ?? 1e18) - (b.ppm ?? 1e18),
      area: (a, b) => (b.area ?? 0) - (a.area ?? 0),
      drop: (a, b) => b.price_drop - a.price_drop,
    }[f.sort || "score"] || ((a, b) => (b.score ?? -1) - (a.score ?? -1));
    list = [...list].sort(by);
    const off = +f.offset || 0, lim = +f.limit || 24, free = config.free_results || 0;
    let items = list.slice(off, off + lim);
    const res = { total: list.length, points: list.map(({ id, lat, lng, deal, pp, price, deposit, rent, city_key, score, label }) => ({ id, lat, lng, deal, pp, price, deposit, rent, city_key, score, label })) };
    if (free && !f.ids) { items = items.slice(0, Math.max(0, free - off)); res.locked_more = Math.max(0, list.length - free); res.free_results = free; }
    res.items = items.map((l) => ({ ...l, verdict: verdict(l), locked: true, signals: { ctx: (l.explain?.ctx || []).length, caution: (l.explain?.caution || []).length }, sus_reason: l.label === "sus" ? (l.explain?.flags || []).join("، ") : undefined }));
    return res;
  }
  function localStats() {
    prepare();
    const day = Date.now() / 1000 - 86400, cities = {};
    const L = SAMPLE_LISTINGS.filter((l) => !l.excluded);
    L.forEach((l) => { const c = (cities[l.city_key] = cities[l.city_key] || { n: 0, estate: 0, ranked: 0 }); c.n++; c.estate++; if (l.score != null) c.ranked++; });
    return {
      total: SAMPLE_LISTINGS.length, estate: L.length, today: L.filter((l) => l.first_seen > day).length,
      drops: L.filter((l) => l.price_drop).length, ranked: L.filter((l) => l.score != null).length,
      excluded: SAMPLE_LISTINGS.length - L.length, sus: SAMPLE_LISTINGS.filter((l) => l.label === "sus").length,
      deals: L.filter((l) => ["gold", "good"].includes(l.label)).length, gold: L.filter((l) => l.label === "gold").length, detailed: 0, cities,
    };
  }
  function localMarket(city) {
    prepare();
    const cells = {};
    SAMPLE_LISTINGS.filter((l) => !l.excluded && (!city || l.city_key === city) && valueOf(l)).forEach((l) => {
      const k = [l.city_key, l.district || "", kg(l.kind), l.deal].join("|");
      (cells[k] = cells[k] || []).push(valueOf(l));
    });
    return Object.entries(cells).map(([k, v]) => { const [city_key, district, kind, deal] = k.split("|"); v.sort((a, b) => a - b); return { city_key, district, kind, deal, n: v.length, median: median(v), p25: v[Math.floor(v.length * 0.25)], p75: v[Math.min(v.length - 1, Math.floor(v.length * 0.75))] }; });
  }
  /* گزارش بازار (نسخهٔ مرورگری همان server/report.py) */
  function localReport(city, deal = "sale", kind = "apartment") {
    prepare();
    const all = SAMPLE_LISTINGS.filter((l) => l.city_key === city && l.deal === deal && kg(l.kind) === kind);
    const valid = all.filter((l) => !l.excluded && l.pp && l.area).map((l) => ({ ...l, ppm: l.pp / l.area, age: l.year ? jYear() - l.year : null }));
    const scored = valid.filter((l) => l.score != null), opps = scored.filter((l) => ["gold", "good"].includes(l.label));
    const OPP = (l) => ["gold", "good"].includes(l.label);
    const has = (l, a) => (l.amenities || []).includes(a);
    const cityPpm = median(valid.map((l) => l.ppm));
    const byD = {}; valid.forEach((l) => (byD[l.district || ""] = byD[l.district || ""] || []).push(l));
    const districts = Object.entries(byD).filter(([d, rs]) => d && rs.length >= 3).map(([name, rs]) => {
      const ppm = median(rs.map((r) => r.ppm));
      return { name, n: rs.length, median_ppm: ppm, median_price: median(rs.map((r) => r.pp)), median_area: median(rs.map((r) => r.area)),
        opportunities: rs.filter(OPP).length, gold: rs.filter((r) => r.label === "gold").length, scored: rs.filter((r) => r.score != null).length,
        elevator_share: rs.filter((r) => has(r, "elevator")).length / rs.length, vs_city: cityPpm ? ppm / cityPpm - 1 : null, low: rs.length < 10 };
    }).sort((a, b) => b.median_ppm - a.median_ppm);
    const bands = deal === "sale" ? [[0, 1e9, "تا ۱ میلیارد"], [1e9, 2e9, "۱ تا ۲ میلیارد"], [2e9, 3e9, "۲ تا ۳ میلیارد"], [3e9, 5e9, "۳ تا ۵ میلیارد"], [5e9, 8e9, "۵ تا ۸ میلیارد"], [8e9, 12e9, "۸ تا ۱۲ میلیارد"], [12e9, 1e15, "بیش از ۱۲ میلیارد"]]
      : [[0, 3e8, "تا ۳۰۰ میلیون"], [3e8, 6e8, "۳۰۰ تا ۶۰۰ میلیون"], [6e8, 1e9, "۶۰۰ میلیون تا ۱ میلیارد"], [1e9, 1e15, "بیش از ۱ میلیارد"]];
    const budget = bands.map(([lo, hi, label]) => { const rs = valid.filter((r) => r.pp >= lo && r.pp < hi); return { label, n: rs.length, good: rs.filter((r) => r.label === "good").length, gold: rs.filter((r) => r.label === "gold").length }; }).filter((b) => b.n);
    const group = (fn, order) => order.map(([k, label]) => { const v = valid.filter((r) => fn(r) === k).map((r) => r.ppm); return { label, n: v.length, median_ppm: median(v), low: v.length < 10 }; }).filter((g) => g.n >= 3);
    const band = (v, b) => (v == null ? null : b.findIndex(([lo, hi]) => v >= lo && v <= hi));
    const AGE = [[0, 2, "نوساز (تا ۲ سال)"], [3, 5, "۳ تا ۵ سال"], [6, 10, "۶ تا ۱۰ سال"], [11, 20, "۱۱ تا ۲۰ سال"], [21, 999, "بیش از ۲۰ سال"]];
    const AREA = [[0, 60, "تا ۶۰ متر"], [60, 90, "۶۰ تا ۹۰ متر"], [90, 120, "۹۰ تا ۱۲۰ متر"], [120, 160, "۱۲۰ تا ۱۶۰ متر"], [160, 1e9, "بیش از ۱۶۰ متر"]];
    const amen = [["elevator", "آسانسور"], ["parking", "پارکینگ"], ["warehouse", "انباری"]].map(([k, name]) => {
      const ratios = [];
      Object.entries(byD).forEach(([d, rs]) => { const w = rs.filter((r) => has(r, k)).map((r) => r.ppm), wo = rs.filter((r) => !has(r, k)).map((r) => r.ppm); if (d && w.length >= 3 && wo.length >= 3) ratios.push(median(w) / median(wo)); });
      return { key: k, name, premium: ratios.length ? median(ratios) - 1 : null, districts: ratios.length, higher: ratios.filter((x) => x > 1).length, share: valid.length ? valid.filter((r) => has(r, k)).length / valid.length : null };
    });
    const ranked = districts.filter((d) => !d.low).length ? districts.filter((d) => !d.low) : districts;
    const cheap = [...ranked].sort((a, b) => a.median_ppm - b.median_ppm).slice(0, 5), pricey = [...ranked].sort((a, b) => b.median_ppm - a.median_ppm).slice(0, 5);
    const disc = opps.map((l) => l.discount).sort((a, b) => a - b);
    const now = Date.now() / 1000;
    return {
      city, deal, kind, overview: {
        valid: valid.length, scored: scored.length, median_ppm: cityPpm, median_price: median(valid.map((l) => l.pp)), median_area: median(valid.map((l) => l.area)),
        median_year: median(valid.filter((l) => l.year).map((l) => l.year)), n_districts: districts.length,
        spread: cheap.length && pricey.length ? pricey[0].median_ppm / cheap[0].median_ppm : null, opportunities: opps.length, gold: opps.filter((l) => l.label === "gold").length,
        per100: scored.length ? (100 * opps.length) / scored.length : null, opp_median_discount: disc.length ? disc[disc.length >> 1] : null,
        fresh_7d: valid.filter((l) => l.first_seen > now - 7 * 86400).length, fresh_24h: valid.filter((l) => l.first_seen > now - 86400).length },
      funnel: [{ k: "read", label: "خوانده شد", n: all.length }, { k: "dropped", label: "کنار رفت: قدیمی، پیش‌فروش، مشارکت، تکراری، بی‌قیمت", n: all.filter((l) => l.excluded && l.label !== "sus").length },
        { k: "sus", label: "قیمت مشکوک", n: all.filter((l) => l.label === "sus").length }, { k: "pending", label: "در انتظار داده: محله آگهی کافی ندارد", n: valid.length - scored.length },
        { k: "scored", label: "سنجیده شد، هر کدام با محلهٔ خودش", n: scored.length }, { k: "opp", label: "فرصت", n: opps.length }],
      budget, hotspots: districts.filter((d) => d.opportunities).sort((a, b) => b.opportunities - a.opportunities || b.gold - a.gold).slice(0, 10),
      by_rooms: group((r) => (r.rooms == null ? null : Math.min(4, r.rooms)), [[0, "استودیو"], [1, "یک‌خوابه"], [2, "دوخوابه"], [3, "سه‌خوابه"], [4, "چهارخوابه و بیشتر"]]),
      by_age: group((r) => band(r.age, AGE), AGE.map((b, i) => [i, b[2]])), by_area: group((r) => band(r.area, AREA), AREA.map((b, i) => [i, b[2]])),
      amenities: amen, cheap, pricey, districts,
    };
  }

  const qs = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "" && v != null && v !== 0 && v !== false)).toString();
  async function json(r) { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "خطا"); return j; }

  async function search(f) {
    if (useSamples) return localSearch(f);
    return json(await fetch("api/listings?" + qs(f), { headers: H() }));
  }
  async function get(id) {
    if (useSamples || id.startsWith("smp-")) {
      prepare();
      const l = SAMPLE_LISTINGS.find((x) => x.id === id);
      if (!l) return null;
      let pool = filterLocal({ city: l.city_key, district: l.district, deal: l.deal, kinds: l.kind });
      if (pool.length < 4) pool = filterLocal({ city: l.city_key, deal: l.deal, kinds: l.kind });
      if (pool.length < 4) pool = filterLocal({ province: l.province, deal: l.deal, kinds: l.kind });
      const sim = pool.filter((x) => x.id !== id).sort((a, b) => Math.abs((a.area || 0) - (l.area || 0)) - Math.abs((b.area || 0) - (l.area || 0))).slice(0, 6).map((x) => ({ ...x, verdict: verdict(x), locked: true }));
      const hist = l.price_drop ? [{ at: l.first_seen, price: Math.round(l.pp / (1 - l.price_drop)) }, { at: l.first_seen + 5 * 86400, price: l.pp }] : [{ at: l.first_seen, price: l.pp }];
      return { ...l, verdict: verdict(l), history: hist, similar: sim, attributes: {}, locked: true, fair_price: undefined, fair_ppm: undefined, excluded_reasons: l.excluded ? l.explain?.flags : undefined };
    }
    const r = await fetch("api/listing/" + encodeURIComponent(id), { headers: H() });
    return r.ok ? r.json() : null;
  }
  async function districts(city, deal) {
    if (!city) return { items: [] };
    if (useSamples) {
      prepare();
      const g = {};
      SAMPLE_LISTINGS.filter((l) => !l.excluded && l.city_key === city && l.district && (!deal || l.deal === deal)).forEach((l) => {
        const x = (g[l.district] = g[l.district] || { name: l.district, n: 0, opp: 0, r: 0 });
        x.n++; if (["gold", "good"].includes(l.label)) x.opp++; if (l.settlement === "rural") x.r++;
      });
      return { items: Object.values(g).map((x) => ({ name: x.name, n: x.n, opp: x.opp, rural: x.r * 2 > x.n })).sort((a, b) => b.n - a.n) };
    }
    return json(await fetch("api/districts?" + qs({ city, deal })));
  }
  async function market(city, deal, kind) {
    if (useSamples) return { rows: localMarket(city), report: city ? localReport(city, deal, kind) : null };
    return json(await fetch("api/market?" + qs({ city, deal, kind })));
  }

  /* ---------- حساب کاربری ---------- */
  async function requestOtp(phone) {
    if (!server) throw new Error("ورود در پیش‌نمایش فعال نیست؛ نسخه اجراشده روی سرور را باز کنید.");
    return json(await fetch("api/auth/otp", { method: "POST", headers: H(), body: JSON.stringify({ phone }) }));
  }
  async function verifyOtp(phone, code) {
    const r = await json(await fetch("api/auth/verify", { method: "POST", headers: H(), body: JSON.stringify({ phone, code }) }));
    tok.set(r.token); me = r.user;
    return r.user;
  }
  async function refreshMe() {
    if (!server || !tok.get()) return (me = null);
    me = (await json(await fetch("api/me", { headers: H() }))).user;
    if (!me) tok.set("");
    return me;
  }
  async function logout() {
    if (server) await fetch("api/auth/logout", { method: "POST", headers: H(), body: "{}" }).catch(() => {});
    tok.set(""); me = null;
  }
  async function submitReceipt(payment_id, tracking, image) {
    return json(await fetch("api/pay/receipt", { method: "POST", headers: H(), body: JSON.stringify({ payment_id, tracking, image }) }));
  }
  async function startPayment(plan) {
    return json(await fetch("api/pay/start", { method: "POST", headers: H(), body: JSON.stringify({ plan }) }));
  }

  return { init, search, get, market, districts, verdict, requestOtp, verifyOtp, refreshMe, logout, startPayment, submitReceipt,
    get config() { return config; }, get server() { return server; }, get samples() { return useSamples; }, get stats() { return stats; }, get me() { return me; }, RENT_RATE };
})();
