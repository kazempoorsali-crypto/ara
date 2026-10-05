/* لایه داده: اگر سرور محلی آرا در دسترس باشد از API آن می‌خواند،
   وگرنه (باز کردن مستقیم فایل یا پیش‌نمایش آنلاین) با آگهی‌های نمونه کار می‌کند. */
const DataLayer = (() => {
  const RENT_RATE = 0.03;
  const DEFAULT_CONFIG = {
    mode: "preview",
    site: {
      name: "آرا", tagline: "دلال هوشمند املاک و خودروی شمال", owner_name: "", phone: "", whatsapp: "",
      telegram: "", instagram: "", email: "", address: "", hours: "همه روزه ۹ تا ۲۱", about: "",
    },
    payment: { card: "", sheba: "", holder: "", bank: "", note: "", services: [] },
    display: { show_samples: true },
  };
  let config = DEFAULT_CONFIG, server = false, useSamples = true, stats = null;

  async function init() {
    try {
      const r = await fetch("api/config", { cache: "no-store" });
      if (!r.ok) throw 0;
      config = await r.json();
      server = true;
      stats = await (await fetch("api/stats", { cache: "no-store" })).json();
      useSamples = !stats.total && config.display.show_samples;
    } catch {
      server = false; useSamples = true;
    }
    if (useSamples) stats = localStats();
    return { config, server, useSamples, stats };
  }

  /* ---------- حالت نمونه: همان منطق سرور در مرورگر ---------- */
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  let medCache = null;
  function medians() {
    if (medCache) return medCache;
    const est = {}, car = {};
    SAMPLE_LISTINGS.forEach((l) => {
      if (l.ppm) (est[l.city_key + "|" + l.kind] = est[l.city_key + "|" + l.kind] || []).push(l.ppm);
      if (l.vertical === "car" && l.price) {
        (car[l.brand + "|" + l.year] = car[l.brand + "|" + l.year] || []).push(l.price);
        (car[l.brand + "|"] = car[l.brand + "|"] || []).push(l.price);
      }
    });
    // در داده نمونه نمونه‌ها کم است؛ میانه استانی جایگزین می‌شود
    SAMPLE_LISTINGS.forEach((l) => { if (l.ppm) { const k = "P" + l.province + "|" + l.kind; (est[k] = est[k] || []).push(l.ppm); } });
    const red = (o, min) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.length >= min).map(([k, v]) => [k, [median(v), v.length]]));
    medCache = { est: red(est, 3), car: red(car, 3) };
    return medCache;
  }
  function verdict(l) {
    const m = medians();
    let ref, val;
    if (l.vertical === "estate" && l.ppm) { ref = m.est[l.city_key + "|" + l.kind] || m.est["P" + l.province + "|" + l.kind]; val = l.ppm; }
    else if (l.vertical === "car" && l.price) { ref = m.car[l.brand + "|" + l.year] || m.car[l.brand + "|"]; val = l.price; }
    if (!ref) return null;
    const d = (val - ref[0]) / ref[0];
    const band = d <= -0.15 ? "great" : d <= -0.05 ? "good" : d < 0.05 ? "fair" : d < 0.15 ? "high" : "over";
    return { band, delta: +d.toFixed(3), median: ref[0], n: ref[1] };
  }
  function localSearch(f) {
    let list = SAMPLE_LISTINGS.filter((l) => {
      if (f.vertical && l.vertical !== f.vertical) return false;
      if (f.city && l.city_key !== f.city) return false;
      if (!f.city && f.province && l.province !== f.province) return false;
      if (f.deal && l.deal !== f.deal) return false;
      if (f.kinds && !f.kinds.split(",").includes(l.kind)) return false;
      if (f.min && !(l.pp >= +f.min)) return false;
      if (f.max && !(l.pp <= +f.max)) return false;
      if (f.areaMin && !(l.area >= +f.areaMin)) return false;
      if (f.areaMax && !(l.area <= +f.areaMax)) return false;
      if (f.yearMin && !(l.year >= +f.yearMin)) return false;
      if (f.yearMax && !(l.year <= +f.yearMax)) return false;
      if (f.mileageMax && !(l.mileage <= +f.mileageMax)) return false;
      if (f.rooms && (+f.rooms >= 4 ? !(l.rooms >= 4) : l.rooms !== +f.rooms)) return false;
      if (f.amenities && !f.amenities.split(",").every((a) => l.amenities.includes(a))) return false;
      if (f.brand && !(l.brand || l.title).includes(f.brand)) return false;
      if (f.gearbox && l.gearbox !== f.gearbox) return false;
      if (f.drop && !l.price_drop) return false;
      if (f.ids && !f.ids.split(",").includes(l.id)) return false;
      if (f.q && !f.q.split(/\s+/).every((w) => (l.title + " " + (l.district || "")).includes(w))) return false;
      return true;
    });
    const by = {
      new: (a, b) => b.featured - a.featured || b.first_seen - a.first_seen,
      cheap: (a, b) => (a.pp ?? 1e18) - (b.pp ?? 1e18),
      exp: (a, b) => (b.pp ?? 0) - (a.pp ?? 0),
      ppm: (a, b) => (a.ppm ?? 1e18) - (b.ppm ?? 1e18),
      area: (a, b) => (b.area ?? 0) - (a.area ?? 0),
      drop: (a, b) => b.price_drop - a.price_drop,
      deal: (a, b) => (verdict(a)?.delta ?? 9) - (verdict(b)?.delta ?? 9),
    }[f.sort || "new"];
    list = [...list].sort(by);
    const off = +f.offset || 0, lim = +f.limit || 24;
    return {
      total: list.length,
      items: list.slice(off, off + lim).map((l) => ({ ...l, verdict: verdict(l) })),
      points: list.map(({ id, lat, lng, deal, pp, price, deposit, rent, vertical, city_key }) => ({ id, lat, lng, deal, pp, price, deposit, rent, vertical, city_key })),
    };
  }
  function localStats() {
    const day = Date.now() / 1000 - 86400, cities = {};
    SAMPLE_LISTINGS.forEach((l) => {
      const c = (cities[l.city_key] = cities[l.city_key] || { n: 0, estate: 0, car: 0 });
      c.n++; c[l.vertical]++;
    });
    const m = medians().est;
    Object.entries(m).forEach(([k, [v]]) => { const [ck, kind] = k.split("|"); if (cities[ck] && ["villa", "apartment"].includes(kind)) (cities[ck].ppm = cities[ck].ppm || {})[kind] = v; });
    return {
      total: SAMPLE_LISTINGS.length, estate: SAMPLE_LISTINGS.filter((l) => l.vertical === "estate").length,
      car: SAMPLE_LISTINGS.filter((l) => l.vertical === "car").length, today: SAMPLE_LISTINGS.filter((l) => l.first_seen > day).length,
      drops: SAMPLE_LISTINGS.filter((l) => l.price_drop).length, detailed: 0, cities,
    };
  }

  const qs = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "" && v != null && v !== 0 && v !== false)).toString();

  async function search(f) {
    if (useSamples) return localSearch(f);
    const r = await fetch("api/listings?" + qs(f));
    return r.json();
  }
  async function get(id) {
    if (useSamples || id.startsWith("smp-")) {
      const l = SAMPLE_LISTINGS.find((x) => x.id === id);
      if (!l) return null;
      const sim = localSearch({ vertical: l.vertical, province: l.province, deal: l.deal, kinds: l.kind, limit: 8 }).items.filter((x) => x.id !== id).slice(0, 6);
      const hist = l.price_drop ? [{ at: l.first_seen, price: Math.round(l.pp / (1 - l.price_drop)) }, { at: l.first_seen + 5 * 86400, price: l.pp }] : [{ at: l.first_seen, price: l.pp }];
      return { ...l, verdict: verdict(l), history: hist, similar: sim, description: null, attributes: {} };
    }
    const r = await fetch("api/listing/" + encodeURIComponent(id));
    return r.ok ? r.json() : null;
  }
  async function lead(payload) {
    if (!server) return { ok: true, preview: true };
    const r = await fetch("api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return r.json();
  }

  return { init, search, get, lead, verdict, get config() { return config; }, get server() { return server; }, get samples() { return useSamples; }, get stats() { return stats; }, RENT_RATE };
})();
