/* داده‌های پایه سامانه «آرا» — شهرهای شمال ایران و آگهی‌های نمونه
   توجه: مختصات شهرها تقریبی و صرفاً برای نمایش روی نقشه است.
   همه آگهی‌ها و قیمت‌ها «نمایشی» هستند و باید با داده واقعی (API) جایگزین شوند. */

const PROVINCES = [
  { id: "gilan", name: "گیلان", center: [37.28, 49.58] },
  { id: "mazandaran", name: "مازندران", center: [36.56, 52.68] },
  { id: "golestan", name: "گلستان", center: [36.95, 54.6] },
];

const CITIES = [
  // گیلان
  { id: "rasht", name: "رشت", province: "gilan", lat: 37.2808, lng: 49.5832, tags: ["شهری", "مرکز استان"] },
  { id: "anzali", name: "بندر انزلی", province: "gilan", lat: 37.4727, lng: 49.4622, tags: ["ساحلی", "تالاب"] },
  { id: "lahijan", name: "لاهیجان", province: "gilan", lat: 37.2071, lng: 50.0039, tags: ["کوهپایه", "چای"] },
  { id: "langarud", name: "لنگرود", province: "gilan", lat: 37.197, lng: 50.1539, tags: ["ساحلی"] },
  { id: "astara", name: "آستارا", province: "gilan", lat: 38.4296, lng: 48.8721, tags: ["مرزی", "ساحلی"] },
  { id: "talesh", name: "تالش", province: "gilan", lat: 37.8016, lng: 48.9047, tags: ["جنگلی", "ییلاقی"] },
  { id: "rudsar", name: "رودسر", province: "gilan", lat: 37.1371, lng: 50.2876, tags: ["ساحلی"] },
  { id: "chaboksar", name: "چابکسر", province: "gilan", lat: 36.9733, lng: 50.5725, tags: ["ساحلی", "جنگلی"] },
  { id: "kiashahr", name: "کیاشهر", province: "gilan", lat: 37.4211, lng: 49.9396, tags: ["ساحلی"] },
  { id: "astaneh", name: "آستانه اشرفیه", province: "gilan", lat: 37.2597, lng: 49.9441, tags: ["شهری"] },
  { id: "fuman", name: "فومن", province: "gilan", lat: 37.224, lng: 49.3125, tags: ["جنگلی"] },
  { id: "masal", name: "ماسال", province: "gilan", lat: 37.3621, lng: 49.1312, tags: ["ییلاقی", "جنگلی"] },
  { id: "someh", name: "صومعه‌سرا", province: "gilan", lat: 37.3117, lng: 49.3219, tags: ["روستایی"] },
  { id: "rudbar", name: "رودبار", province: "gilan", lat: 36.8237, lng: 49.4237, tags: ["کوهستانی", "زیتون"] },
  // مازندران
  { id: "sari", name: "ساری", province: "mazandaran", lat: 36.5633, lng: 53.0601, tags: ["شهری", "مرکز استان"] },
  { id: "babol", name: "بابل", province: "mazandaran", lat: 36.5513, lng: 52.679, tags: ["شهری"] },
  { id: "amol", name: "آمل", province: "mazandaran", lat: 36.4696, lng: 52.3507, tags: ["شهری"] },
  { id: "qaemshahr", name: "قائم‌شهر", province: "mazandaran", lat: 36.4631, lng: 52.8601, tags: ["شهری"] },
  { id: "babolsar", name: "بابلسر", province: "mazandaran", lat: 36.7025, lng: 52.6576, tags: ["ساحلی", "دانشگاهی"] },
  { id: "fereydunkenar", name: "فریدونکنار", province: "mazandaran", lat: 36.6836, lng: 52.5225, tags: ["ساحلی"] },
  { id: "mahmudabad", name: "محمودآباد", province: "mazandaran", lat: 36.632, lng: 52.263, tags: ["ساحلی", "شهرکی"] },
  { id: "nur", name: "نور", province: "mazandaran", lat: 36.573, lng: 52.0139, tags: ["ساحلی", "جنگلی"] },
  { id: "nowshahr", name: "نوشهر", province: "mazandaran", lat: 36.649, lng: 51.496, tags: ["ساحلی", "بندری"] },
  { id: "chalus", name: "چالوس", province: "mazandaran", lat: 36.6459, lng: 51.421, tags: ["ساحلی", "جنگلی"] },
  { id: "kelardasht", name: "کلاردشت", province: "mazandaran", lat: 36.4986, lng: 51.1441, tags: ["ییلاقی", "کوهستانی"] },
  { id: "abbasabad", name: "عباس‌آباد", province: "mazandaran", lat: 36.7213, lng: 51.115, tags: ["ساحلی", "شهرکی"] },
  { id: "tonekabon", name: "تنکابن", province: "mazandaran", lat: 36.8163, lng: 50.874, tags: ["ساحلی", "جنگلی"] },
  { id: "ramsar", name: "رامسر", province: "mazandaran", lat: 36.9031, lng: 50.6583, tags: ["ساحلی", "جنگلی", "لوکس"] },
  { id: "neka", name: "نکا", province: "mazandaran", lat: 36.6508, lng: 53.299, tags: ["شهری"] },
  { id: "behshahr", name: "بهشهر", province: "mazandaran", lat: 36.6923, lng: 53.5526, tags: ["جنگلی"] },
  // گلستان
  { id: "gorgan", name: "گرگان", province: "golestan", lat: 36.8427, lng: 54.4353, tags: ["شهری", "مرکز استان"] },
  { id: "gonbad", name: "گنبد کاووس", province: "golestan", lat: 37.25, lng: 55.1672, tags: ["شهری"] },
  { id: "torkaman", name: "بندر ترکمن", province: "golestan", lat: 36.9015, lng: 54.0708, tags: ["ساحلی"] },
  { id: "bandargaz", name: "بندر گز", province: "golestan", lat: 36.7732, lng: 53.9474, tags: ["ساحلی"] },
  { id: "kordkuy", name: "کردکوی", province: "golestan", lat: 36.7943, lng: 54.1101, tags: ["جنگلی"] },
  { id: "aliabad", name: "علی‌آباد کتول", province: "golestan", lat: 36.9083, lng: 54.869, tags: ["کوهپایه"] },
  { id: "azadshahr", name: "آزادشهر", province: "golestan", lat: 37.0866, lng: 55.1738, tags: ["جنگلی"] },
  { id: "minudasht", name: "مینودشت", province: "golestan", lat: 37.2289, lng: 55.3747, tags: ["جنگلی"] },
  { id: "kalaleh", name: "کلاله", province: "golestan", lat: 37.3807, lng: 55.4916, tags: ["روستایی"] },
];

const PROPERTY_TYPES = [
  { id: "villa", name: "ویلا", icon: "🏡" },
  { id: "apartment", name: "آپارتمان", icon: "🏢" },
  { id: "land", name: "زمین", icon: "🌾" },
  { id: "garden", name: "باغ", icon: "🌳" },
  { id: "suite", name: "سوئیت", icon: "🛏️" },
  { id: "shop", name: "تجاری", icon: "🏪" },
];

const DEAL_TYPES = [
  { id: "sale", name: "خرید" },
  { id: "rent", name: "رهن و اجاره" },
  { id: "daily", name: "اجاره روزانه" },
];

const AMENITIES = [
  { id: "seaview", name: "دید دریا" },
  { id: "beach", name: "ساحل اختصاصی" },
  { id: "forest", name: "جنگلی" },
  { id: "pool", name: "استخر" },
  { id: "jacuzzi", name: "جکوزی" },
  { id: "parking", name: "پارکینگ" },
  { id: "elevator", name: "آسانسور" },
  { id: "gated", name: "شهرکی/نگهبانی" },
  { id: "deed", name: "سند تک‌برگ" },
  { id: "furnished", name: "مبله" },
  { id: "barbecue", name: "آلاچیق و باربیکیو" },
  { id: "mountain", name: "دید کوهستان" },
];

/* ------- تولید آگهی‌های نمونه با بذر ثابت (تکرارپذیر) ------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LISTINGS = (() => {
  const rnd = mulberry32(1405);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const titles = {
    villa: ["ویلای دوبلکس", "ویلای مدرن", "ویلای شهرکی", "ویلای جنگلی", "ویلای ساحلی", "ویلای نوساز"],
    apartment: ["آپارتمان نوساز", "آپارتمان فول‌امکانات", "آپارتمان دید ابدی", "آپارتمان برج‌باغ"],
    land: ["زمین مسکونی", "زمین با پروانه ساخت", "قطعه زمین ساحلی", "زمین کشاورزی"],
    garden: ["باغ مرکبات", "باغ چای", "باغ ویلا", "باغ کیوی"],
    suite: ["سوئیت ساحلی", "سوئیت دنج", "سوئیت مبله"],
    shop: ["مغازه بر اصلی", "دفتر تجاری", "واحد تجاری پاساژ"],
  };
  const hoods = ["بلوار ساحلی", "جاده جنگل", "مرکز شهر", "شهرک ساحلی", "کمربندی", "خیابان امام", "دامنه کوه", "نزدیک دریا", "جاده ییلاقی"];
  const out = [];
  CITIES.forEach((city) => {
    // هر شهر دست‌کم یک ویلای فروشی، یک آپارتمان فروشی، یک اجاره‌ای و یک اقامتگاه روزانه دارد
    const fixed = [["villa", "sale"], ["apartment", "sale"], [pick(["apartment", "villa"]), "rent"], [pick(["villa", "suite", "apartment"]), "daily"]];
    const n = fixed.length + 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const type = fixed[i] ? fixed[i][0] : pick(["villa", "villa", "villa", "apartment", "apartment", "land", "garden", "suite", "shop"]);
      const deal = fixed[i] ? fixed[i][1] : type === "land" || type === "garden" ? "sale" : type === "shop" ? pick(["sale", "rent"]) : pick(["sale", "sale", "rent", "daily"]);
      const coastal = city.tags.includes("ساحلی");
      const forest = city.tags.some((t) => ["جنگلی", "ییلاقی", "کوهستانی"].includes(t));
      const area = Math.round(
        type === "land" ? between(200, 2000) : type === "garden" ? between(1000, 8000)
        : type === "villa" ? between(120, 450) : type === "suite" ? between(35, 70) : between(65, 220)
      );
      const rooms = type === "land" || type === "garden" || type === "shop" ? 0
        : type === "suite" ? 1 : Math.max(1, Math.round(area / 70));
      const am = new Set();
      const built = type !== "land" && type !== "garden";
      if (coastal && (built || rnd() > 0.6) && rnd() > 0.35) am.add("seaview");
      if (coastal && type === "villa" && rnd() > 0.7) am.add("beach");
      if (forest && rnd() > 0.3) am.add("forest");
      if (forest && rnd() > 0.5) am.add("mountain");
      if (type === "villa" && rnd() > 0.5) am.add("pool");
      if (type === "villa" && rnd() > 0.7) am.add("jacuzzi");
      if (type === "villa" && rnd() > 0.4) am.add("barbecue");
      if (type !== "land" && type !== "garden" && rnd() > 0.3) am.add("parking");
      if (type === "apartment" && rnd() > 0.35) am.add("elevator");
      if ((type === "villa" || type === "apartment") && rnd() > 0.55) am.add("gated");
      if (rnd() > 0.45) am.add("deed");
      if ((deal === "daily" || type === "suite") && rnd() > 0.2) am.add("furnished");

      // قیمت نمایشی بر حسب تومان (ضریب نسبی، نه داده بازار)
      const lux = city.tags.includes("لوکس") ? 1.6 : coastal ? 1.25 : 1;
      const perM = { villa: 45e6, apartment: 38e6, land: 9e6, garden: 3.5e6, suite: 40e6, shop: 90e6 }[type] * lux * between(0.7, 1.4);
      let price = 0, deposit = 0, rent = 0, nightly = 0;
      if (deal === "sale") price = Math.round((area * perM) / 1e7) * 1e7;
      if (deal === "rent") {
        deposit = Math.round((area * perM * 0.12) / 1e7) * 1e7;
        rent = Math.round((area * perM * 0.0015) / 1e5) * 1e5;
      }
      if (deal === "daily") nightly = Math.round(between(1.2e6, 9e6) * (type === "villa" ? 1.6 : 1) / 1e5) * 1e5;

      out.push({
        id: `${city.id}-${i + 1}`,
        title: `${pick(titles[type])} در ${city.name}`,
        city: city.id,
        type,
        deal,
        area,
        rooms,
        year: 1385 + Math.floor(rnd() * 20),
        price, deposit, rent, nightly,
        amenities: [...am],
        hood: pick(hoods),
        lat: city.lat + between(-0.03, 0.03),
        lng: city.lng + between(-0.04, 0.04),
        daysAgo: Math.floor(rnd() * 30),
        verified: rnd() > 0.45,
        agency: rnd() > 0.5 ? pick(["مشاور املاک ساحل", "املاک سبز شمال", "مشاور املاک خزر", "املاک پرنیان"]) : "مالک",
        scene: type === "land" || type === "garden" ? "field" : am.has("seaview") ? "sea" : am.has("forest") ? "forest" : am.has("mountain") ? "mountain" : "city",
        sample: true,
      });
    }
  });
  return out;
})();
