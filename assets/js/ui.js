/* ابزارهای نمایشی مشترک: قالب‌بندی، آیکون، تصویرسازی، کارت آگهی، نمودار و نقشه */
const UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fa = (n) => Number(n).toLocaleString("fa-IR");
  const tt = (s) => esc(String(s ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]));
  const faY = (n) => Number(n).toLocaleString("fa-IR", { useGrouping: false });
  const num = (s) => { const v = parseFloat(NLP.toEn(String(s ?? "")).replace(/[^\d.]/g, "")); return isNaN(v) ? 0 : v; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ara:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ara:" + k, JSON.stringify(v)); } catch { /* حالت خصوصی */ } },
  };
  function money(v) {
    if (v == null || v === 0) return null;
    if (v >= 1e9) return fa(+(v / 1e9).toFixed(v >= 1e10 ? 1 : 2)) + " میلیارد";
    if (v >= 1e6) return fa(+(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)) + " میلیون";
    if (v >= 1e3) return fa(Math.round(v / 1e3)) + " هزار";
    return fa(v);
  }
  function ago(ts) {
    if (!ts) return "";
    const s = Date.now() / 1000 - ts;
    if (s < 3600) return "لحظاتی پیش";
    if (s < 86400) return fa(Math.floor(s / 3600)) + " ساعت پیش";
    if (s < 86400 * 30) return fa(Math.floor(s / 86400)) + " روز پیش";
    return fa(Math.floor(s / 86400 / 30)) + " ماه پیش";
  }
  const cityOf = (k) => CITIES.find((c) => c.id === k);
  const provOf = (k) => PROVINCES.find((p) => p.id === k);
  const kindName = (k) => (PROPERTY_TYPES.find((t) => t.id === k) || { name: "" }).name;
  const dealName = (d) => (DEAL_TYPES.find((x) => x.id === d) || { name: "" }).name;

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("is-on"), 2800);
  }

  /* ---------- آیکون‌ها ---------- */
  const I = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
    car: '<path d="M5 16l1.5-5.2A2 2 0 018.4 9.3h7.2a2 2 0 011.9 1.5L19 16M4 16h16v3a1 1 0 01-1 1h-1.5a1 1 0 01-1-1v-1h-9v1a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><circle cx="7.5" cy="16.5" r=".6"/><circle cx="16.5" cy="16.5" r=".6"/>',
    spark: '<path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" fill="currentColor" stroke="none"/>',
    heart: '<path d="M12 20.5s-7.6-4.6-9.4-9.4C1.4 7.9 3.5 4.5 7 4.5c2 0 3.4 1 5 3 1.6-2 3-3 5-3 3.5 0 5.6 3.4 4.4 6.6-1.8 4.8-9.4 9.4-9.4 9.4z"/>',
    phone: '<path d="M5 3h3l2 5-2.5 1.5a11 11 0 005 5L14 12l5 2v3a2 2 0 01-2 2A15 15 0 013 5a2 2 0 012-2"/>',
    chat: '<path d="M4 5h16v11H8l-4 4z"/>',
    send: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l11-10"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
    arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    tg: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/>',
  };
  const icon = (n, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[n] || ""}</svg>`;

  /* ---------- تصویرسازی برداری برای آگهی بدون عکس ---------- */
  const PAL = {
    sea: ["#cfe4ea", "#f4efe4", "#3d8aa8", "#e9d6a6"], forest: ["#d8e4d4", "#f2efe4", "#2c6a55", "#1d4a3c"],
    mountain: ["#dde2e6", "#f3efe6", "#7d8c94", "#4e5d66"], field: ["#efe6c9", "#f7f2e4", "#9cb65a", "#5c7a2e"],
    city: ["#ecdfd6", "#f6f0e6", "#b9a99a", "#7d6b5d"], road: ["#dfe6ea", "#f4f0e8", "#8a969c", "#3f4a50"],
  };
  function scene(l, v = 0) {
    const [s1, s2, g1, g2] = PAL[l.scene] || PAL.city;
    const id = "s" + String(l.id).replace(/\W/g, "") + v;
    const sx = 60 + ((String(l.id).length * 37 + v * 90) % 260);
    let ground = "", obj = "";
    if (l.scene === "sea") ground = `<path d="M0 150 Q100 142 200 150 T400 148 V240 H0Z" fill="${g1}"/><path d="M0 168 Q50 163 100 168 T200 168 T300 168 T400 168" stroke="#fff" stroke-opacity=".55" fill="none"/><path d="M0 198 Q200 186 400 198 V240 H0Z" fill="${g2}"/>`;
    else if (l.scene === "forest") ground = `<path d="M0 135 L40 88 L70 122 L110 66 L150 128 L200 78 L240 122 L290 72 L330 126 L370 88 L400 116 V240 H0Z" fill="${g2}" opacity=".5"/><path d="M0 178 Q200 156 400 178 V240 H0Z" fill="${g1}"/>`;
    else if (l.scene === "mountain") ground = `<path d="M0 160 L90 64 L150 120 L230 44 L320 132 L400 84 V240 H0Z" fill="${g1}"/><path d="M230 44 l18 22 l-12 -3 l-8 10 l-10 -8 l-6 3z" fill="#fff"/><path d="M0 186 Q200 172 400 186 V240 H0Z" fill="#a9c79a"/>`;
    else if (l.scene === "field") ground = `<path d="M0 150 Q200 132 400 150 V240 H0Z" fill="${g1}"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${i * 66} 240 L${190 + i * 4} 152" stroke="${g2}" stroke-opacity=".25"/>`).join("")}`;
    else if (l.scene === "road") ground = `<path d="M0 150 L120 120 L250 138 L400 112 V240 H0Z" fill="${g1}" opacity=".45"/><rect y="176" width="400" height="64" fill="${g2}"/><path d="M0 208 H400" stroke="#f4f0e8" stroke-width="3" stroke-dasharray="22 18"/>`;
    else ground = `<g fill="${g1}" opacity=".55"><rect x="20" y="92" width="40" height="110"/><rect x="70" y="62" width="50" height="140"/><rect x="300" y="82" width="45" height="120"/><rect x="350" y="108" width="40" height="94"/></g><rect y="196" width="400" height="44" fill="${g2}" opacity=".35"/>`;
    const roof = v % 2 ? "#c24a20" : "#1d4a3c";
    const k = l.kind;
    if (l.vertical === "car") {
      const body = ["#f4f0e8", "#13201c", "#9aa3a8", "#c24a20", "#2a6d8c"][(String(l.id).length + v) % 5];
      obj = `<g transform="translate(110 118)"><path d="M10 58 L28 30 Q34 20 48 20 H128 Q142 20 150 30 L170 56 Q182 58 182 70 V80 H0 V70 Q0 60 10 58Z" fill="${body}" stroke="#13201c" stroke-opacity=".25"/><path d="M40 30 H86 V54 H24Z M94 30 H132 L150 54 H94Z" fill="#cfe4ea" opacity=".9"/><circle cx="40" cy="82" r="16" fill="#13201c"/><circle cx="40" cy="82" r="6" fill="#9aa3a8"/><circle cx="146" cy="82" r="16" fill="#13201c"/><circle cx="146" cy="82" r="6" fill="#9aa3a8"/></g>`;
    } else if (k === "villa") obj = `<g transform="translate(128 90)"><rect y="50" width="144" height="72" rx="3" fill="#fffdf9"/><path d="M-10 54 L72 6 L154 54Z" fill="${roof}"/><rect x="20" y="72" width="26" height="22" rx="2" fill="#a9cfdc"/><rect x="98" y="72" width="26" height="22" rx="2" fill="#a9cfdc"/><rect x="60" y="80" width="24" height="42" rx="2" fill="#7a4a2a"/>${(l.amenities || []).includes("pool") ? '<rect x="152" y="104" width="62" height="16" rx="8" fill="#5fb2cf" stroke="#fff" stroke-width="2"/>' : ""}</g>`;
    else if (k === "apartment" || k === "office") obj = `<g transform="translate(150 40)"><rect width="100" height="162" rx="4" fill="#fffdf9"/>${Array.from({ length: 6 }, (_, r) => [0, 1, 2].map((c) => `<rect x="${12 + c * 28}" y="${12 + r * 24}" width="20" height="14" rx="2" fill="${(r + c + v) % 3 ? "#a9cfdc" : "#f2c48d"}"/>`).join("")).join("")}</g>`;
    else if (k === "suite") obj = `<g transform="translate(150 112)"><rect width="100" height="80" rx="4" fill="#fffdf9"/><rect y="-8" width="100" height="10" rx="3" fill="${roof}"/><rect x="14" y="20" width="30" height="24" rx="2" fill="#a9cfdc"/><rect x="58" y="30" width="26" height="50" rx="2" fill="#7a4a2a"/></g>`;
    else if (k === "shop") obj = `<g transform="translate(130 92)"><rect width="140" height="100" rx="3" fill="#fffdf9"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${i * 20} 0 h20 l-3 16 h-14z" fill="${i % 2 ? "#fffdf9" : roof}"/>`).join("")}<rect x="14" y="40" width="70" height="60" fill="#cfe4ea"/><rect x="94" y="48" width="32" height="52" fill="#45524c"/></g>`;
    else if (k === "garden") obj = Array.from({ length: 9 }, (_, i) => `<g transform="translate(${40 + i * 40} ${166 + (i % 2) * 18})"><rect x="-3" width="6" height="22" fill="#7a4a2a"/><circle r="18" cy="-6" fill="${g2}"/><circle r="4" cx="6" cy="-10" fill="#df5a2c"/></g>`).join("");
    else if (k === "land") obj = `<g stroke="#7a4a2a" stroke-width="3">${Array.from({ length: 11 }, (_, i) => `<line x1="${30 + i * 34}" y1="172" x2="${30 + i * 34}" y2="202"/>`).join("")}<line x1="30" y1="180" x2="370" y2="180"/><line x1="30" y1="194" x2="370" y2="194"/></g>`;
    return `<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(l.title)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="400" height="240" fill="url(#${id})"/><circle cx="${sx}" cy="50" r="20" fill="#f6d27a" opacity=".85"/>${ground}${obj}</svg>`;
  }
  function media(l, i = 0, cls = "") {
    const imgs = l.images && l.images.length ? l.images : l.image ? [l.image] : [];
    if (imgs[i]) return `<img src="${esc(imgs[i])}" alt="${esc(l.title)}" loading="lazy" referrerpolicy="no-referrer" class="${cls}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{innerHTML:UI.scene(${esc(JSON.stringify({ id: l.id, title: l.title, scene: l.scene || (l.vertical === "car" ? "road" : "city"), kind: l.kind, vertical: l.vertical, amenities: l.amenities }))},${i})}).firstChild)">`;
    return scene({ ...l, scene: l.scene || (l.vertical === "car" ? "road" : "city") }, i);
  }

  /* ---------- قیمت ---------- */
  function priceHTML(l, big = false) {
    const m = (v) => money(v);
    if (l.deal === "rent") {
      if (!l.deposit && !l.rent) return `<b>توافقی</b>`;
      return `<b>${m(l.deposit) || "بدون ودیعه"}</b><small>ودیعه</small>${l.rent ? `<span class="sep">|</span><b>${m(l.rent)}</b><small>ماهانه</small>` : ""}`;
    }
    if (!l.price) return `<b>توافقی</b>`;
    return `<b>${m(l.price)}</b><small>${l.deal === "daily" ? "تومان / شب" : "تومان"}</small>`;
  }
  function pinLabel(p) {
    if (p.deal === "rent") return p.deposit ? "ودیعه " + money(p.deposit) : p.rent ? money(p.rent) + "/ماه" : "توافقی";
    if (!p.price) return "توافقی";
    return money(p.price) + (p.deal === "daily" ? "/شب" : "");
  }
  const pct = (d) => fa(Math.abs(Math.round(d * 100))) + "٪";
  const dealPill = (v) => (v ? `<span class="deal deal--${v.band}" title="مقایسه با قیمت منصفانه برآوردشده">${v.delta < -0.005 ? pct(v.delta) + " زیر قیمت" : v.delta > 0.005 ? pct(v.delta) + " بالای قیمت" : "هم‌قیمت بازار"}</span>` : "");
  const scoreBadge = (l) => (l.score != null ? `<span class="score score--${l.score >= 75 ? "hi" : l.score >= 55 ? "mid" : "lo"}" title="امتیاز فرصت از ۱۰۰"><b>${fa(Math.round(l.score))}</b><i>امتیاز</i></span>` : "");
  function typePill(l) {
    return `<span class="pill pill--${l.deal}">${dealName(l.deal)}</span>`;
  }
  function specs(l) {
    return [kindName(l.kind), l.area && fa(l.area) + " متر", l.rooms != null && (l.rooms ? fa(l.rooms) + " خواب" : "بدون اتاق"), l.year && "ساخت " + faY(l.year)].filter(Boolean);
  }

  /* ---------- کارت ---------- */
  function card(l, opts = {}) {
    const favs = App.favs, c = cityOf(l.city_key);
    const loc = [c ? c.name : l.city_name, l.district].filter(Boolean).join("، ");
    return `<article class="card" data-id="${esc(l.id)}">
      <div class="card__media">${media(l)}
        ${scoreBadge(l)}
        <div class="card__badges">${typePill(l)}${dealPill(l.verdict)}${l.price_drop ? `<span class="pill pill--drop">${fa(Math.round(l.price_drop * 100))}٪ کاهش</span>` : ""}${l.featured ? '<span class="pill pill--feat">ویژه</span>' : ""}${l.source === "sample" ? '<span class="pill pill--glass">نمونه</span>' : ""}</div>
        <button class="card__fav ${favs.has(l.id) ? "is-on" : ""}" data-fav="${esc(l.id)}" aria-label="ذخیره">${icon("heart")}</button>
      </div>
      <div class="card__body">
        <div class="card__price">${priceHTML(l)}</div>
        <h3 class="card__title"><a href="#/ad/${encodeURIComponent(l.id)}">${tt(l.title)}</a></h3>
        <p class="card__loc">${esc(loc)}${l.first_seen ? " · " + ago(l.first_seen) : l.time_text ? " · " + esc(l.time_text) : ""}</p>
        <div class="card__specs">${specs(l).map((s) => `<span>${esc(s)}</span>`).join("")}</div>
        ${opts.compare !== false ? `<label class="card__cmp"><input type="checkbox" data-cmp="${esc(l.id)}" ${App.compare.includes(l.id) ? "checked" : ""}> مقایسه</label>` : ""}
      </div>
    </article>`;
  }

  /* ---------- نمودار تاریخچه قیمت ---------- */
  function spark(hist) {
    const pts = hist.filter((h) => h.price || h.deposit).map((h) => ({ at: h.at, v: h.price || h.deposit }));
    if (pts.length < 2) return "";
    const W = 600, H = 120, P = 10;
    const x0 = pts[0].at, x1 = pts[pts.length - 1].at, vs = pts.map((p) => p.v);
    const y0 = Math.min(...vs) * 0.97, y1 = Math.max(...vs) * 1.03;
    const X = (t) => P + ((t - x0) / (x1 - x0 || 1)) * (W - 2 * P); // محور زمان از چپ (قدیمی) به راست (جدید)
    const Y = (v) => H - P - ((v - y0) / (y1 - y0 || 1)) * (H - 2 * P);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.at).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
    const day = (t) => new Date(t * 1000).toLocaleDateString("fa-IR", { month: "long", day: "numeric" });
    const last = pts[pts.length - 1], first = pts[0];
    const ch = (last.v - first.v) / first.v;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="direction:ltr"><path class="area" d="${d} L${X(last.at)} ${H} L${X(first.at)} ${H}Z"/><path class="line" d="${d}" vector-effect="non-scaling-stroke"/>${pts.map((p) => `<circle cx="${X(p.at)}" cy="${Y(p.v)}" r="4.5" vector-effect="non-scaling-stroke"/>`).join("")}</svg>
      <div class="spark-labels"><span>اکنون (${day(last.at)}): <b>${money(last.v)}</b>${ch ? ` · ${ch < 0 ? "کاهش" : "افزایش"} ${fa(Math.abs(Math.round(ch * 100)))}٪` : ""}</span><span>اولین ثبت (${day(first.at)}): <b>${money(first.v)}</b></span></div>`;
  }

  /* ---------- نقشه ---------- */
  function makeMap(el, opts = {}) {
    if (!window.L) { el.innerHTML = '<p class="muted" style="padding:40px;text-align:center">نقشه در دسترس نیست.</p>'; return null; }
    const map = L.map(el, { zoomControl: true, scrollWheelZoom: opts.wheel !== false, attributionControl: true }).setView(opts.center || [36.9, 52.2], opts.zoom || 7);
    let errs = 0;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" })
      .on("tileerror", () => { if (++errs === 4) el.classList.add("no-tiles"); }).addTo(map);
    return map;
  }

  return { pct, scoreBadge, $, $$, esc, tt, fa, faY, num, store, money, ago, cityOf, provOf, kindName, dealName, toast, icon, scene, media, priceHTML, pinLabel, dealPill, typePill, specs, card, spark, makeMap };
})();
