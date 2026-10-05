/* لایه داده فرصت‌یاب: اگر سرور در دسترس باشد از API آن می‌خواند،
   وگرنه (پیش‌نمایش آنلاین یا باز کردن مستقیم فایل) با آگهی‌های نمونه و ارزش‌گذاری ساده کار می‌کند. */
const DataLayer = (() => {
  const RENT_RATE = 0.03;
  const DEFAULT_CONFIG = {
    mode: "preview",
    site: { name: "فرصت‌یاب", tagline: "قیمت منصفانه ملک در شمال", about: "", email: "" },
    display: { show_samples: true },
    plans: [], payable: false, free_preview: 3, sms_live: false,
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

  /* ---------- حالت نمونه: ارزش‌گذاری ساده با میانه شهر و استان ---------- */
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const valueOf = (l) => (l.deal === "daily" ? l.price : l.area ? l.pp / l.area : null);
  let prepared = false;
  function prepare() {
    if (prepared) return;
    prepared = true;
    const g = {};
    SAMPLE_LISTINGS.forEach((l) => { const v = valueOf(l); if (v) (g[l.province + l.kind + l.deal] = g[l.province + l.kind + l.deal] || []).push(v); });
    SAMPLE_LISTINGS.forEach((l) => {
      const pool = g[l.province + l.kind + l.deal] || [], v = valueOf(l);
      if (pool.length < 3 || !v) return;
      const fv = median(pool);
      l.fair_ppm = fv; l.fair_price = l.deal === "daily" ? fv : fv * l.area;
      l.discount = +((fv - v) / fv).toFixed(3);
      l.confidence = pool.length >= 15 ? "medium" : "low";
      l.score = Math.round(Math.max(0, Math.min(100, 50 + l.discount * 250)) * 0.7 + (l.confidence === "medium" ? 65 : 30) * 0.15 + 40 * 0.15);
      l.explain = { district_n: 0, city_n: pool.length, effects: [], sample: true };
    });
  }
  function verdict(l) {
    if (l.discount == null) return null;
    const d = -l.discount;
    const band = d <= -0.15 ? "great" : d <= -0.05 ? "good" : d < 0.05 ? "fair" : d < 0.15 ? "high" : "over";
    return { band, delta: d, fair: l.fair_price, n: (l.explain || {}).city_n || 0, confidence: l.confidence, score: l.score };
  }
  function localSearch(f) {
    prepare();
    let list = SAMPLE_LISTINGS.filter((l) => {
      if (f.city && l.city_key !== f.city) return false;
      if (!f.city && f.province && l.province !== f.province) return false;
      if (f.district && l.district !== f.district) return false;
      if (f.deal && l.deal !== f.deal) return false;
      if (f.kinds && !f.kinds.split(",").includes(l.kind)) return false;
      if (f.min && !(l.pp >= +f.min)) return false;
      if (f.max && !(l.pp <= +f.max)) return false;
      if (f.areaMin && !(l.area >= +f.areaMin)) return false;
      if (f.areaMax && !(l.area <= +f.areaMax)) return false;
      if (f.rooms && (+f.rooms >= 4 ? !(l.rooms >= 4) : l.rooms !== +f.rooms)) return false;
      if (f.amenities && !f.amenities.split(",").every((a) => l.amenities.includes(a))) return false;
      if (f.drop && !l.price_drop) return false;
      if (f.ranked && l.score == null) return false;
      if (f.minScore && !(l.score >= +f.minScore)) return false;
      if (f.ids && !f.ids.split(",").includes(l.id)) return false;
      if (f.q && !f.q.split(/\s+/).every((w) => (l.title + " " + (l.district || "")).includes(w))) return false;
      return true;
    });
    const by = {
      score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
      deal: (a, b) => (b.discount ?? -9) - (a.discount ?? -9),
      new: (a, b) => b.first_seen - a.first_seen,
      cheap: (a, b) => (a.pp ?? 1e18) - (b.pp ?? 1e18),
      exp: (a, b) => (b.pp ?? 0) - (a.pp ?? 0),
      ppm: (a, b) => (a.ppm ?? 1e18) - (b.ppm ?? 1e18),
      area: (a, b) => (b.area ?? 0) - (a.area ?? 0),
      drop: (a, b) => b.price_drop - a.price_drop,
    }[f.sort || "score"] || ((a, b) => (b.score ?? -1) - (a.score ?? -1));
    list = [...list].sort(by);
    const off = +f.offset || 0, lim = +f.limit || 24;
    return {
      total: list.length,
      items: list.slice(off, off + lim).map((l) => ({ ...l, verdict: verdict(l), locked: true })),
      points: list.map(({ id, lat, lng, deal, pp, price, deposit, rent, city_key, score }) => ({ id, lat, lng, deal, pp, price, deposit, rent, city_key, score })),
    };
  }
  function localStats() {
    prepare();
    const day = Date.now() / 1000 - 86400, cities = {};
    SAMPLE_LISTINGS.forEach((l) => { const c = (cities[l.city_key] = cities[l.city_key] || { n: 0, estate: 0, ranked: 0 }); c.n++; c.estate++; if (l.score != null) c.ranked++; });
    return {
      total: SAMPLE_LISTINGS.length, estate: SAMPLE_LISTINGS.length, today: SAMPLE_LISTINGS.filter((l) => l.first_seen > day).length,
      drops: SAMPLE_LISTINGS.filter((l) => l.price_drop).length, ranked: SAMPLE_LISTINGS.filter((l) => l.score != null).length,
      excluded: 0, deals: SAMPLE_LISTINGS.filter((l) => l.discount >= 0.1).length, detailed: 0, cities,
    };
  }
  function localMarket(city) {
    const cells = {};
    SAMPLE_LISTINGS.filter((l) => (!city || l.city_key === city) && valueOf(l)).forEach((l) => {
      const k = [l.city_key, l.district || "", l.kind === "garden" ? "land" : l.kind === "suite" ? "apartment" : ["shop", "office"].includes(l.kind) ? "commercial" : l.kind, l.deal].join("|");
      (cells[k] = cells[k] || []).push(valueOf(l));
    });
    return Object.entries(cells).map(([k, v]) => { const [city_key, district, kind, deal] = k.split("|"); v.sort((a, b) => a - b); return { city_key, district, kind, deal, n: v.length, median: median(v), p25: v[Math.floor(v.length * 0.25)], p75: v[Math.min(v.length - 1, Math.floor(v.length * 0.75))] }; });
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
      const sim = localSearch({ province: l.province, deal: l.deal, kinds: l.kind, limit: 8 }).items.filter((x) => x.id !== id).slice(0, 6);
      const hist = l.price_drop ? [{ at: l.first_seen, price: Math.round(l.pp / (1 - l.price_drop)) }, { at: l.first_seen + 5 * 86400, price: l.pp }] : [{ at: l.first_seen, price: l.pp }];
      return { ...l, verdict: verdict(l), history: hist, similar: sim, description: null, attributes: {}, locked: true };
    }
    const r = await fetch("api/listing/" + encodeURIComponent(id), { headers: H() });
    return r.ok ? r.json() : null;
  }
  async function market(city) {
    if (useSamples) return { rows: localMarket(city) };
    return json(await fetch("api/market" + (city ? "?city=" + city : "")));
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
  async function startPayment(plan) {
    return json(await fetch("api/pay/start", { method: "POST", headers: H(), body: JSON.stringify({ plan }) }));
  }

  return { init, search, get, market, verdict, requestOtp, verifyOtp, refreshMe, logout, startPayment,
    get config() { return config; }, get server() { return server; }, get samples() { return useSamples; }, get stats() { return stats; }, get me() { return me; }, RENT_RATE };
})();
