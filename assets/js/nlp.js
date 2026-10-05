/* موتور فهم زبان فارسی آرا (قاعده‌محور، سمت کاربر)
   ورودی: جمله آزاد کاربر — خروجی: شیء فیلتر + برچسب‌های قابل نمایش.
   برای اتصال به مدل زبانی واقعی، کافی است تابع parseQuery با پاسخ JSON مدل جایگزین شود. */

const NLP = (() => {
  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹", AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

  function toEn(s) {
    return String(s)
      .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d))
      .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d));
  }

  function normalize(s) {
    return toEn(s)
      .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا")
      .replace(/(\d)[\/٫](\d)/g, "$1.$2")
      .replace(/(\d),(\d)/g, "$1$2")
      .replace(/‌/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const squash = (s) => normalize(s).replace(/\s/g, "");

  const WORD_NUM = { "نیم": 0.5, "یک": 1, "یه": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6, "شیش": 6, "هفت": 7, "هشت": 8, "نه": 9, "ده": 10, "پونزده": 15, "پانزده": 15, "بیست": 20, "سی": 30, "چهل": 40, "پنجاه": 50, "صد": 100, "دویست": 200, "سیصد": 300, "پانصد": 500, "پونصد": 500 };
  const UNIT = { "میلیارد": 1e9, "میلیون": 1e6, "هزار": 1e3, "تومن": 1, "تومان": 1 };

  const CITY_ALIASES = {
    anzali: ["انزلی", "بندرانزلی"], talesh: ["هشتپر", "تالش"], gonbad: ["گنبد"], torkaman: ["ترکمن"],
    bandargaz: ["بندرگز"], aliabad: ["علی اباد", "علی آباد", "علیاباد"], astaneh: ["آستانه", "استانه"],
    someh: ["صومعه سرا", "صومعهسرا"], fereydunkenar: ["فریدون کنار", "فریدونکنار"], qaemshahr: ["قائمشهر", "قایمشهر"],
    abbasabad: ["عباس اباد", "عباساباد"], babolsar: ["بابلسر"], kelardasht: ["کلاردشت"],
  };

  const TYPE_WORDS = [
    ["villa", /ویلا/], ["apartment", /آپارتمان|اپارتمان|واحد مسکونی|برج/], ["land", /زمین/],
    ["garden", /باغ(?!چه)/], ["suite", /سوئیت|سوییت|سویت/], ["shop", /مغازه|تجاری|دفتر کار|اداری/],
  ];
  const AMEN_WORDS = [
    ["beach", /ساحل (اختصاصی|خصوصی)|ساحل دار|ساحلدار/], ["seaview", /دریا|ساحل/], ["forest", /جنگل/],
    ["pool", /استخر/], ["jacuzzi", /جکوزی/], ["parking", /پارکینگ/], ["elevator", /آسانسور|اسانسور/],
    ["gated", /شهرک|نگهبان/], ["deed", /سند/], ["furnished", /مبله|مبلمان/], ["barbecue", /باربیکیو|آلاچیق|الاچیق/],
    ["mountain", /کوه|ییلاق|ییلاقی/],
  ];

  function readNumber(token) {
    if (token == null) return NaN;
    const t = token.trim();
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    return WORD_NUM[t] ?? NaN;
  }

  // استخراج مبالغ پولی: «۲.۵ میلیارد»، «دو میلیارد و پانصد میلیون»، «۸۰۰ میلیون»
  function findMoney(q) {
    const re = /(\d+(?:\.\d+)?|نیم|یک|یه|دو|سه|چهار|پنج|شش|شیش|هفت|هشت|نه|ده|پانزده|پونزده|بیست|سی|چهل|پنجاه|صد|دویست|سیصد|پانصد|پونصد)\s*(میلیارد|میلیون)(?:\s*و\s*(\d+(?:\.\d+)?|صد|دویست|سیصد|پانصد|پونصد)\s*(میلیون))?(?:\s*(تومان|تومن))?/g;
    const out = [];
    let m;
    while ((m = re.exec(q))) {
      let v = readNumber(m[1]) * UNIT[m[2]];
      if (m[3]) v += readNumber(m[3]) * UNIT[m[4]];
      out.push({ value: v, index: m.index, end: re.lastIndex });
    }
    return out;
  }

  function qualifierBefore(q, idx) {
    const before = q.slice(Math.max(0, idx - 18), idx);
    if (/(زیر|کمتر از|کمتراز|تا سقف|حداکثر|نهایتا|نهایت|تا)\s*$/.test(before)) return "max";
    if (/(بالای|بالاتر از|بیشتر از|بیش از|حداقل|از)\s*$/.test(before)) return "min";
    return null;
  }

  function parseQuery(raw, base = {}) {
    const q = normalize(raw);
    const sq = q.replace(/\s/g, "");
    const f = { ...base, types: [], amenities: [] };
    const tags = [];

    // شهر و استان
    // طولانی‌ترین نام منطبق برنده است (بابلسر بر بابل)؛ نام‌های کوتاه مثل «نور» باید واژه مستقل باشند
    const words = q.split(" ");
    let cityHit = null, best = 0;
    CITIES.forEach((c) => {
      [c.name, ...(CITY_ALIASES[c.id] || [])].forEach((n) => {
        const k = squash(n);
        const ok = k.length <= 3 ? words.includes(normalize(n)) : sq.includes(k);
        if (ok && k.length > best) { best = k.length; cityHit = c; }
      });
    });
    if (cityHit) { f.city = cityHit.id; f.province = cityHit.province; tags.push("📍 " + cityHit.name); }
    else {
      const p = PROVINCES.find((p) => q.includes(p.name));
      if (p) { f.province = p.id; f.city = ""; tags.push("🗺️ استان " + p.name); }
    }

    // نوع معامله
    if (/روزانه|شبی|شبانه|آخر هفته|اخر هفته|تعطیلات|نوروز|مسافرت|سفر|چند شب/.test(q)) f.deal = "daily";
    else if (/اجاره|رهن|رهنی|کرایه/.test(q)) f.deal = "rent";
    else if (/خرید|بخرم|فروش|فروشی|سرمایه گذاری|سرمایهگذاری|تملک/.test(q)) f.deal = "sale";
    if (f.deal) tags.push("🤝 " + DEAL_TYPES.find((d) => d.id === f.deal).name);

    // نوع ملک
    TYPE_WORDS.forEach(([id, re]) => { if (re.test(q)) f.types.push(id); });
    f.types.forEach((t) => { const p = PROPERTY_TYPES.find((x) => x.id === t); tags.push(p.icon + " " + p.name); });

    // امکانات
    AMEN_WORDS.forEach(([id, re]) => {
      if (id === "seaview" && f.amenities.includes("beach")) return;
      if (re.test(q)) f.amenities.push(id);
    });
    f.amenities.forEach((a) => tags.push("✓ " + AMENITIES.find((x) => x.id === a).name));

    // بودجه
    const money = findMoney(q);
    const between = q.match(/بین\s*(.+?)\s*(?:و|تا)\s*(.+?(?:میلیارد|میلیون))/);
    if (between && money.length >= 2) {
      // «بین ۲ تا ۵ میلیارد» → واحد عدد اول از دومی گرفته می‌شود
      const first = findMoney(between[1]);
      const second = money[money.length - 1].value;
      const unit = second >= 1e9 ? 1e9 : 1e6;
      f.min = first.length ? first[0].value : readNumber(between[1]) * unit;
      f.max = second;
    } else if (between && money.length === 1) {
      const unit = money[0].value >= 1e9 ? 1e9 : 1e6;
      const a = readNumber(between[1].replace(/\s.*$/, ""));
      if (!isNaN(a)) { f.min = a * unit; f.max = money[0].value; }
      else f.max = money[0].value;
    } else {
      money.forEach((m) => {
        const k = qualifierBefore(q, m.index);
        if (k === "min") f.min = m.value; else f.max = m.value;
      });
    }
    if (f.min) tags.push("⬆ از " + fmtShort(f.min));
    if (f.max) tags.push("⬇ تا " + fmtShort(f.max));

    // متراژ
    const am = q.match(/(\d+)\s*(?:متر|متری|مترمربع)/);
    if (am) {
      const v = +am[1], k = qualifierBefore(q, am.index);
      if (k === "max") f.areaMax = v;
      else if (k === "min") f.areaMin = v;
      else { f.areaMin = Math.round(v * 0.85); f.areaMax = Math.round(v * 1.2); }
      tags.push("📐 " + (k === "max" ? "تا " : k === "min" ? "از " : "حدود ") + v + " متر");
    }

    // تعداد خواب
    const rm = q.match(/(\d+|یک|یه|دو|سه|چهار|پنج)\s*(?:خواب|خوابه)/);
    if (rm) { f.rooms = Math.min(4, readNumber(rm[1])); tags.push("🛏 " + f.rooms.toLocaleString("fa-IR") + (f.rooms >= 4 ? "+" : "") + " خواب"); }

    // صفت‌ها
    if (/ارزون|ارزان|اقتصادی|قیمت مناسب|مقرون/.test(q)) { f.sort = "cheap"; tags.push("💸 ارزان‌ترین"); }
    else if (/لوکس|لاکچری|خاص|vip/i.test(q)) { f.sort = "exp"; tags.push("💎 لوکس"); }
    else if (/بزرگ|وسیع|جادار/.test(q)) { f.sort = "area"; tags.push("📏 بزرگ‌ترین"); }
    if (/نوساز|نو ساز|تازه ساز/.test(q)) { f.newBuild = true; tags.push("🆕 نوساز"); }
    if (/تایید|تأیید|مطمئن|معتبر/.test(q)) { f.verified = true; tags.push("🛡️ تأییدشده"); }

    return { filters: f, tags, understood: tags.length > 0 };
  }

  function fmtShort(v) {
    if (v >= 1e9) return (+(v / 1e9).toFixed(2)).toLocaleString("fa-IR") + " میلیارد";
    if (v >= 1e6) return (+(v / 1e6).toFixed(1)).toLocaleString("fa-IR") + " میلیون";
    return Math.round(v).toLocaleString("fa-IR");
  }

  // شناسایی پرسش‌های غیرجست‌وجویی برای دستیار
  function intent(raw) {
    const q = normalize(raw);
    if (/^(سلام|درود|هی|hi|hello)/i.test(q)) return "greet";
    if (/وام|قسط/.test(q)) return "loan";
    if (/قیمت(.*)چند|ارزش|چقدر می ارزه|میانگین قیمت|قیمت هر متر|متری چند/.test(q)) return "value";
    if (/مقایسه|کدوم بهتره|کدام بهتر/.test(q)) return "compare";
    if (/ثبت آگهی|آگهی بدم|اگهی بدم|بفروشم|بسپارم/.test(q)) return "post";
    if (/راهنما|کمک|چی کار می کنی|چه کار/.test(q)) return "help";
    return "search";
  }

  return { parseQuery, normalize, toEn, fmtShort, intent, squash };
})();
