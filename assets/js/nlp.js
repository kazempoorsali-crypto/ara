/* موتور فهم جمله فارسی آرا (قاعده‌محور، در مرورگر)
   ورودی: «ویلای استخردار رامسر زیر ۲۰ میلیارد» یا «پژو ۲۰۶ مدل ۹۸ به بالا کارکرد زیر ۱۰۰ هزار»
   خروجی: { filters, tags } با همان نام پارامترهای API جست‌وجو. */
const NLP = (() => {
  const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
  const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
  const normalize = (s) => toEn(s).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإ]/g, "ا")
    .replace(/(\d)[\/٫](\d)/g, "$1.$2").replace(/(\d)[,٬](\d)/g, "$1$2").replace(/‌/g, " ").replace(/\s+/g, " ").trim();
  const squash = (s) => normalize(s).replace(/\s/g, "").replace(/آ/g, "ا");

  const WORD_NUM = { "نیم": 0.5, "یک": 1, "یه": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6, "شیش": 6, "هفت": 7, "هشت": 8, "نه": 9, "ده": 10, "پانزده": 15, "پونزده": 15, "بیست": 20, "سی": 30, "چهل": 40, "پنجاه": 50, "صد": 100, "دویست": 200, "سیصد": 300, "پانصد": 500, "پونصد": 500 };
  const NUMW = "(\\d+(?:\\.\\d+)?|" + Object.keys(WORD_NUM).join("|") + ")";
  const readNum = (t) => (/^\d/.test(t) ? parseFloat(t) : WORD_NUM[t] ?? NaN);

  const CITY_ALIASES = { anzali: ["انزلی"], talesh: ["هشتپر"], gonbad: ["گنبد"], torkaman: ["ترکمن"], aliabad: ["علی اباد"], astaneh: ["آستانه"] };

  const TYPE_WORDS = [["villa", /ویلا/], ["apartment", /آپارتمان|اپارتمان|واحد مسکونی|برج/], ["land", /زمین|کلنگی/],
    ["garden", /باغ(?!چه)/], ["suite", /سوئیت|سوییت|سویت/], ["shop", /مغازه|تجاری|غرفه/], ["office", /دفتر|اداری|مطب/]];
  const AMEN_WORDS = [["seaview", /دریا|ساحل/], ["forest", /جنگل/], ["pool", /استخر/], ["jacuzzi", /جکوزی/], ["parking", /پارکینگ/],
    ["elevator", /آسانسور|اسانسور/], ["warehouse", /انباری/], ["balcony", /بالکن|تراس/], ["gated", /شهرک|نگهبان/], ["deed", /سند/],
    ["furnished", /مبله|مبلمان/], ["barbecue", /باربیکیو|آلاچیق|الاچیق/], ["mountain", /کوه|ییلاق/]];
  const CAR_WORDS = /ماشین|خودرو|اتومبیل|سواری|وانت|پژو|پراید|سمند|دنا|تارا|رانا|تیبا|کوییک|ساینا|شاهین|ری ?را|هایما|تیگو|چری|جک|کیا|هیوندای|تویوتا|نیسان|ام ?وی ?ام|ال ?90|موتور ?سیکلت|کارکرد|گیربکس|دنده/;

  function money(q) {
    const re = new RegExp(NUMW + "\\s*(میلیارد|میلیون)(?:\\s*و\\s*" + NUMW + "\\s*(میلیون))?", "g");
    const out = []; let m;
    while ((m = re.exec(q))) {
      let v = readNum(m[1]) * (m[2] === "میلیارد" ? 1e9 : 1e6);
      if (m[3]) v += readNum(m[3]) * 1e6;
      out.push({ v, i: m.index });
    }
    return out;
  }
  function qualifier(q, i) {
    const b = q.slice(Math.max(0, i - 16), i);
    if (/(زیر|کمتر از|تا سقف|حداکثر|نهایتا|تا)\s*$/.test(b)) return "max";
    if (/(بالای|بالاتر از|بیشتر از|بیش از|حداقل|از)\s*$/.test(b)) return "min";
    return null;
  }
  const fmtShort = (v) => v >= 1e9 ? (+(v / 1e9).toFixed(2)).toLocaleString("fa-IR") + " میلیارد" : (+(v / 1e6).toFixed(1)).toLocaleString("fa-IR") + " میلیون";
  const faN = (n) => Number(n).toLocaleString("fa-IR", { useGrouping: false });

  function parseQuery(raw, base = {}) {
    const q = normalize(raw), sq = squash(raw), words = q.split(" ");
    const f = { ...base };
    const tags = [];
    const estateWords = /ویلا|آپارتمان|زمین|باغ|سوئیت|اجاره|رهن|متری|خواب/;
    f.vertical = CAR_WORDS.test(q) && !estateWords.test(q) ? "car" : base.vertical === "car" && !estateWords.test(q) ? "car" : "estate";

    let best = null, size = 0;
    CITIES.forEach((c) => [c.name, ...(CITY_ALIASES[c.id] || [])].forEach((n) => {
      const k = squash(n);
      const ok = k.length <= 3 ? words.includes(normalize(n)) : sq.includes(k);
      if (ok && k.length > size) { best = c; size = k.length; }
    }));
    if (best) { f.city = best.id; f.province = best.province; tags.push(best.name); }
    else { const p = PROVINCES.find((p) => q.includes(p.name)); if (p) { f.province = p.id; f.city = ""; tags.push("استان " + p.name); } }

    if (f.vertical === "estate") {
      if (/روزانه|شبی|شبانه|آخر هفته|تعطیلات|نوروز|سفر|چند شب|اقامت/.test(q)) f.deal = "daily";
      else if (/اجاره|رهن|کرایه/.test(q)) f.deal = "rent";
      else if (/خرید|بخرم|فروش|فروشی|سرمایه گذاری/.test(q)) f.deal = "sale";
      if (f.deal) tags.push(DEAL_TYPES.find((d) => d.id === f.deal).name);
      const kinds = TYPE_WORDS.filter(([, re]) => re.test(q)).map(([id]) => id);
      if (kinds.length) { f.kinds = kinds.join(","); kinds.forEach((k) => tags.push(PROPERTY_TYPES.find((t) => t.id === k).name)); }
      const am = AMEN_WORDS.filter(([, re]) => re.test(q)).map(([id]) => id);
      if (am.length) { f.amenities = am.join(","); am.forEach((a) => tags.push(AMENITIES.find((x) => x.id === a).name)); }
      const ar = q.match(/(\d+)\s*(?:متر|متری)/);
      if (ar) {
        const v = +ar[1], k = qualifier(q, ar.index);
        if (k === "max") f.areaMax = v; else if (k === "min") f.areaMin = v; else { f.areaMin = Math.round(v * 0.85); f.areaMax = Math.round(v * 1.2); }
        tags.push((k === "max" ? "تا " : k === "min" ? "از " : "حدود ") + faN(v) + " متر");
      }
      const rm = q.match(/(\d+|یک|یه|دو|سه|چهار|پنج)\s*(?:خواب|خوابه)/);
      if (rm) { f.rooms = Math.min(4, readNum(rm[1])); tags.push(faN(f.rooms) + (f.rooms >= 4 ? "+" : "") + " خواب"); }
    } else {
      f.deal = "sale";
      const brand = [...CAR_BRANDS].sort((a, b) => b.length - a.length).find((b) => sq.includes(squash(b)));
      const b0 = brand || CAR_BRANDS.map((b) => b.split(" ")[0]).find((b) => sq.includes(squash(b)));
      if (b0) { f.brand = b0; tags.push(b0); }
      if (/موتور ?سیکلت/.test(q)) { f.kinds = "motorcycle"; tags.push("موتورسیکلت"); }
      const ym = q.match(/مدل\s*(\d{2,4})/);
      if (ym) {
        let y = +ym[1]; if (y < 100) y += 1300;
        const after = q.slice(ym.index + ym[0].length, ym.index + ym[0].length + 12);
        if (/به بالا|بالاتر|به بعد/.test(after)) { f.yearMin = y; tags.push("مدل " + faN(y) + " به بالا"); }
        else if (/به پایین|پایین تر|قبل/.test(after)) { f.yearMax = y; tags.push("مدل تا " + faN(y)); }
        else { f.yearMin = y; f.yearMax = y; tags.push("مدل " + faN(y)); }
      }
      const km = q.match(/کارکرد\s*(?:زیر|کمتر از|تا)?\s*(\d+)\s*(هزار)?/);
      if (km) { f.mileageMax = +km[1] * (km[2] || +km[1] < 1000 ? 1000 : 1); tags.push("کارکرد تا " + (f.mileageMax / 1000).toLocaleString("fa-IR") + " هزار"); }
      if (/اتومات/.test(q)) { f.gearbox = "اتوماتیک"; tags.push("اتوماتیک"); }
      else if (/دنده ای|دستی/.test(q)) { f.gearbox = "دنده‌ای"; tags.push("دنده‌ای"); }
    }

    const btw = q.match(new RegExp("بین\\s*" + NUMW + "\\s*(?:میلیارد|میلیون)?\\s*(?:و|تا)\\s*" + NUMW + "\\s*(میلیارد|میلیون)"));
    if (btw) { const u = btw[3] === "میلیارد" ? 1e9 : 1e6; f.min = readNum(btw[1]) * u; f.max = readNum(btw[2]) * u; }
    else money(q).forEach((m) => { if (qualifier(q, m.i) === "min") f.min = m.v; else f.max = m.v; });
    if (f.min) tags.push("از " + fmtShort(f.min));
    if (f.max) tags.push("تا " + fmtShort(f.max));

    if (/ارزون|ارزان|اقتصادی|مقرون/.test(q)) { f.sort = "cheap"; tags.push("ارزان‌ترین"); }
    else if (/لوکس|لاکچری|خاص/.test(q)) { f.sort = "exp"; tags.push("لوکس"); }
    else if (/زیر قیمت|معامله خوب|فرصت|زیر بازار/.test(q)) { f.sort = "deal"; tags.push("بهترین معامله"); }
    if (/تخفیف|کاهش قیمت|ارزون شده/.test(q)) { f.drop = 1; tags.push("کاهش قیمت"); }
    return { filters: f, tags };
  }

  function intent(raw) {
    const q = normalize(raw);
    if (/^(سلام|درود|hi|hello)/i.test(q)) return "greet";
    if (/وام|قسط/.test(q)) return "loan";
    if (/قیمت هر متر|متری چند|میانگین قیمت|ارزش|چقدر می ارزه|قیمت روز/.test(q)) return "value";
    if (/ثبت آگهی|بفروشم|بسپارم|آگهی بدم|اگهی بدم/.test(q)) return "post";
    if (/تماس|شماره|مشاور|بازدید/.test(q)) return "contact";
    return "search";
  }

  return { parseQuery, intent, normalize, toEn, fmtShort, squash };
})();
