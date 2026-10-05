/* مرجع ثابت فرصت‌یاب + آگهی‌های نمونه برای پیش‌نمایش
   هشدار: همه آگهی‌ها و قیمت‌های این فایل ساختگی‌اند و فقط وقتی نمایش داده می‌شوند که
   هنوز آگهی واقعی از دیوار دریافت نشده باشد (یا سایت بدون سرور باز شده باشد). */

const PROVINCES = [
  { id: "gilan", name: "گیلان", center: [37.28, 49.58] },
  { id: "mazandaran", name: "مازندران", center: [36.56, 52.68] },
  { id: "golestan", name: "گلستان", center: [36.95, 54.6] },
];

const CITIES = [
  ["rasht", "رشت", "gilan", 37.2808, 49.5832, ["شهری", "مرکز استان"]],
  ["anzali", "بندر انزلی", "gilan", 37.4727, 49.4622, ["ساحلی", "تالاب"]],
  ["lahijan", "لاهیجان", "gilan", 37.2071, 50.0039, ["کوهپایه", "چای"]],
  ["langarud", "لنگرود", "gilan", 37.197, 50.1539, ["ساحلی"]],
  ["astara", "آستارا", "gilan", 38.4296, 48.8721, ["مرزی", "ساحلی"]],
  ["talesh", "تالش", "gilan", 37.8016, 48.9047, ["جنگلی", "ییلاقی"]],
  ["rudsar", "رودسر", "gilan", 37.1371, 50.2876, ["ساحلی"]],
  ["chaboksar", "چابکسر", "gilan", 36.9733, 50.5725, ["ساحلی", "جنگلی"]],
  ["kiashahr", "کیاشهر", "gilan", 37.4211, 49.9396, ["ساحلی"]],
  ["astaneh", "آستانه اشرفیه", "gilan", 37.2597, 49.9441, ["شهری"]],
  ["fuman", "فومن", "gilan", 37.224, 49.3125, ["جنگلی"]],
  ["masal", "ماسال", "gilan", 37.3621, 49.1312, ["ییلاقی", "جنگلی"]],
  ["someh", "صومعه‌سرا", "gilan", 37.3117, 49.3219, ["روستایی"]],
  ["rudbar", "رودبار", "gilan", 36.8237, 49.4237, ["کوهستانی", "زیتون"]],
  ["sari", "ساری", "mazandaran", 36.5633, 53.0601, ["شهری", "مرکز استان"]],
  ["babol", "بابل", "mazandaran", 36.5513, 52.679, ["شهری"]],
  ["amol", "آمل", "mazandaran", 36.4696, 52.3507, ["شهری"]],
  ["qaemshahr", "قائم‌شهر", "mazandaran", 36.4631, 52.8601, ["شهری"]],
  ["babolsar", "بابلسر", "mazandaran", 36.7025, 52.6576, ["ساحلی", "دانشگاهی"]],
  ["fereydunkenar", "فریدونکنار", "mazandaran", 36.6836, 52.5225, ["ساحلی"]],
  ["mahmudabad", "محمودآباد", "mazandaran", 36.632, 52.263, ["ساحلی", "شهرکی"]],
  ["nur", "نور", "mazandaran", 36.573, 52.0139, ["ساحلی", "جنگلی"]],
  ["nowshahr", "نوشهر", "mazandaran", 36.649, 51.496, ["ساحلی", "بندری"]],
  ["chalus", "چالوس", "mazandaran", 36.6459, 51.421, ["ساحلی", "جنگلی"]],
  ["kelardasht", "کلاردشت", "mazandaran", 36.4986, 51.1441, ["ییلاقی", "کوهستانی"]],
  ["abbasabad", "عباس‌آباد", "mazandaran", 36.7213, 51.115, ["ساحلی", "شهرکی"]],
  ["tonekabon", "تنکابن", "mazandaran", 36.8163, 50.874, ["ساحلی", "جنگلی"]],
  ["ramsar", "رامسر", "mazandaran", 36.9031, 50.6583, ["ساحلی", "جنگلی", "لوکس"]],
  ["neka", "نکا", "mazandaran", 36.6508, 53.299, ["شهری"]],
  ["behshahr", "بهشهر", "mazandaran", 36.6923, 53.5526, ["جنگلی"]],
  ["gorgan", "گرگان", "golestan", 36.8427, 54.4353, ["شهری", "مرکز استان"]],
  ["gonbad", "گنبد کاووس", "golestan", 37.25, 55.1672, ["شهری"]],
  ["torkaman", "بندر ترکمن", "golestan", 36.9015, 54.0708, ["ساحلی"]],
  ["bandargaz", "بندر گز", "golestan", 36.7732, 53.9474, ["ساحلی"]],
  ["kordkuy", "کردکوی", "golestan", 36.7943, 54.1101, ["جنگلی"]],
  ["aliabad", "علی‌آباد کتول", "golestan", 36.9083, 54.869, ["کوهپایه"]],
  ["azadshahr", "آزادشهر", "golestan", 37.0866, 55.1738, ["جنگلی"]],
  ["minudasht", "مینودشت", "golestan", 37.2289, 55.3747, ["جنگلی"]],
  ["kalaleh", "کلاله", "golestan", 37.3807, 55.4916, ["روستایی"]],
].map(([id, name, province, lat, lng, tags]) => ({ id, name, province, lat, lng, tags }));


const PROPERTY_TYPES = [
  { id: "apartment", name: "آپارتمان" },
  { id: "villa", name: "ویلا" },
  { id: "land", name: "زمین" },
  { id: "garden", name: "باغ" },
  { id: "suite", name: "سوئیت" },
  { id: "shop", name: "مغازه" },
  { id: "office", name: "اداری" },
];

const DEAL_TYPES = [
  { id: "sale", name: "خرید" },
  { id: "rent", name: "رهن و اجاره" },
  { id: "daily", name: "اجاره روزانه" },
];

const AMENITIES = [
  { id: "seaview", name: "دید دریا" },
  { id: "forest", name: "جنگلی" },
  { id: "pool", name: "استخر" },
  { id: "jacuzzi", name: "جکوزی" },
  { id: "parking", name: "پارکینگ" },
  { id: "elevator", name: "آسانسور" },
  { id: "warehouse", name: "انباری" },
  { id: "balcony", name: "بالکن" },
  { id: "gated", name: "شهرکی" },
  { id: "deed", name: "سند تک‌برگ" },
  { id: "furnished", name: "مبله" },
  { id: "barbecue", name: "آلاچیق" },
  { id: "mountain", name: "دید کوهستان" },
];

const DEAL_BANDS = {
  great: { name: "معامله عالی", short: "عالی" },
  good: { name: "معامله خوب", short: "خوب" },
  fair: { name: "قیمت منصفانه", short: "منصفانه" },
  high: { name: "بالاتر از بازار", short: "گران" },
  over: { name: "خیلی گران", short: "خیلی گران" },
};

/* ------- آگهی‌های نمونه (بذر ثابت؛ قیمت‌ها نسبی و ساختگی) ------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_LISTINGS = (() => {
  const rnd = mulberry32(1405);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const now = Math.floor(Date.now() / 1000);
  const hoods = ["بلوار ساحلی", "جاده جنگل", "مرکز شهر", "شهرک دریاکنار", "کمربندی", "دامنه کوه", "جاده ییلاقی", "محله قدیم"];
  const titles = {
    villa: ["ویلای دوبلکس", "ویلای مدرن", "ویلای شهرکی", "ویلای جنگلی", "ویلای ساحلی"],
    apartment: ["آپارتمان نوساز", "آپارتمان فول‌امکانات", "آپارتمان دید ابدی", "آپارتمان برج‌باغ"],
    land: ["زمین مسکونی", "زمین با پروانه ساخت", "قطعه زمین نزدیک دریا"],
    garden: ["باغ مرکبات", "باغ چای", "باغ کیوی"],
    suite: ["سوئیت ساحلی", "سوئیت مبله"],
    shop: ["مغازه بر اصلی", "واحد تجاری پاساژ"],
    office: ["دفتر اداری", "واحد اداری نوساز"],
  };
  const out = [];
  let n = 0;
  CITIES.forEach((city) => {
    const coastal = city.tags.includes("ساحلی");
    const green = city.tags.some((t) => ["جنگلی", "ییلاقی", "کوهستانی"].includes(t));
    const lux = city.tags.includes("لوکس") ? 1.6 : coastal ? 1.25 : 1;
    const plan = [["villa", "sale"], ["apartment", "sale"], ["apartment", "rent"], ["villa", "daily"], [pick(["land", "garden", "suite", "shop", "office", "villa"]), null], [pick(["villa", "apartment", "land"]), null]];
    plan.forEach(([kind, deal0]) => {
      const deal = deal0 || (["land", "garden"].includes(kind) ? "sale" : pick(["sale", "rent"]));
      const area = Math.round(kind === "land" ? between(220, 1500) : kind === "garden" ? between(1200, 6000) : kind === "villa" ? between(130, 420) : kind === "suite" ? between(35, 70) : between(65, 200));
      const rooms = ["land", "garden", "shop", "office"].includes(kind) ? null : kind === "suite" ? 1 : Math.max(1, Math.round(area / 75));
      const am = new Set();
      if (coastal && rnd() > 0.4 && !["land", "garden"].includes(kind)) am.add("seaview");
      if (green && rnd() > 0.35) am.add("forest");
      if (green && rnd() > 0.6) am.add("mountain");
      if (kind === "villa" && rnd() > 0.45) am.add("pool");
      if (kind === "villa" && rnd() > 0.75) am.add("jacuzzi");
      if (kind === "villa" && rnd() > 0.5) am.add("barbecue");
      if (!["land", "garden"].includes(kind) && rnd() > 0.3) am.add("parking");
      if (kind === "apartment" && rnd() > 0.35) am.add("elevator");
      if (kind === "apartment" && rnd() > 0.5) am.add("warehouse");
      if (rnd() > 0.45) am.add("deed");
      if (deal === "daily") am.add("furnished");
      const perM = { villa: 45e6, apartment: 38e6, land: 9e6, garden: 3.5e6, suite: 40e6, shop: 90e6, office: 55e6 }[kind] * lux * between(0.72, 1.35);
      const it = {
        id: "smp-" + (++n), source: "sample", vertical: "estate", kind, deal,
        title: `${pick(titles[kind])} ${fmtArea(area)} متری در ${city.name}`,
        city_key: city.id, city_name: city.name, province: city.province, district: pick(hoods),
        area, rooms, year: ["land", "garden"].includes(kind) ? null : 1385 + Math.floor(rnd() * 19),
        amenities: [...am], image: null, images: [],
        lat: city.lat + between(-0.03, 0.03), lng: city.lng + between(-0.04, 0.04),
        first_seen: now - Math.floor(rnd() * 20 * 86400), price_drop: rnd() > 0.86 ? +between(0.03, 0.12).toFixed(3) : 0,
        featured: rnd() > 0.93 ? 1 : 0, scene: am.has("seaview") ? "sea" : am.has("forest") ? "forest" : ["land", "garden"].includes(kind) ? "field" : am.has("mountain") ? "mountain" : "city",
      };
      if (deal === "sale") it.price = Math.round((area * perM) / 1e7) * 1e7;
      if (deal === "rent") { it.deposit = Math.round((area * perM * 0.1) / 1e7) * 1e7; it.rent = Math.round((area * perM * 0.0014) / 1e5) * 1e5; }
      if (deal === "daily") it.price = Math.round(between(1.5e6, 8e6) * (kind === "villa" ? 1.5 : 1) / 1e5) * 1e5;
      out.push(it);
    });
  });
  out.forEach((l) => {
    l.pp = l.deal === "rent" ? (l.deposit || 0) + (l.rent || 0) / 0.03 : l.price;
    l.ppm = l.vertical === "estate" && l.deal === "sale" && l.area ? l.price / l.area : null;
  });
  return out;
  function fmtArea(a) { return a.toLocaleString("fa-IR"); }
  function fmtYear(y) { return y.toLocaleString("fa-IR", { useGrouping: false }); }
})();
