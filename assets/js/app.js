/* آرا — منطق رابط کاربری */
(() => {
  "use strict";

  /* ---------- ابزارهای کمکی ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fa = (n) => Number(n).toLocaleString("fa-IR");
  const faY = (n) => Number(n).toLocaleString("fa-IR", { useGrouping: false });
  const num = (s) => { const v = parseFloat(NLP.toEn(String(s ?? "")).replace(/[^\d.]/g, "")); return isNaN(v) ? 0 : v; };
  const cityOf = (id) => CITIES.find((c) => c.id === id);
  const provOf = (id) => PROVINCES.find((p) => p.id === id);
  const typeOf = (id) => PROPERTY_TYPES.find((t) => t.id === id);
  const amenOf = (id) => AMENITIES.find((a) => a.id === id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ara:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ara:" + k, JSON.stringify(v)); } catch { /* حالت خصوصی */ } },
  };
  function money(v) {
    if (!v) return "توافقی";
    if (v >= 1e9) return fa(+(v / 1e9).toFixed(2)) + " میلیارد";
    if (v >= 1e6) return fa(+(v / 1e6).toFixed(1)) + " میلیون";
    return fa(Math.round(v));
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("is-on"), 2600);
  }
  const RENT_RATE = 0.03; // تبدیل اجاره به ودیعه: هر ۱ تومان اجاره ماهانه ≈ ۱/۰.۰۳ تومان ودیعه

  /* ---------- داده ---------- */
  const mine = store.get("mine", []);
  let ALL = [...mine, ...LISTINGS];
  const primaryPrice = (l) => l.deal === "sale" ? l.price : l.deal === "rent" ? l.deposit + l.rent / RENT_RATE : l.nightly;
  const ppm = (l) => l.deal === "sale" && l.area ? l.price / l.area : 0;

  function median(arr) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function medianPPM(cityId, type) {
    const pool = ALL.filter((l) => l.deal === "sale" && (!cityId || l.city === cityId) && (!type || l.type === type)).map(ppm);
    return median(pool);
  }

  /* ---------- وضعیت ---------- */
  const DEFAULT = { province: "", city: "", deal: "", types: [], min: 0, max: 0, areaMin: 0, areaMax: 0, rooms: 0, amenities: [], verified: false, newBuild: false, sort: "new", view: "split" };
  let S = { ...DEFAULT, ...readHash() };
  let favs = new Set(store.get("favs", []));
  let compare = [];

  function readHash() {
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      if (!p.toString()) return {};
      const o = {};
      ["province", "city", "deal", "sort", "view"].forEach((k) => p.get(k) && (o[k] = p.get(k)));
      ["min", "max", "areaMin", "areaMax", "rooms"].forEach((k) => p.get(k) && (o[k] = +p.get(k)));
      ["types", "amenities"].forEach((k) => p.get(k) && (o[k] = p.get(k).split(",")));
      ["verified", "newBuild"].forEach((k) => p.get(k) && (o[k] = true));
      return o;
    } catch { return {}; }
  }
  function writeHash() {
    const p = new URLSearchParams();
    Object.entries(S).forEach(([k, v]) => {
      if (JSON.stringify(v) === JSON.stringify(DEFAULT[k])) return;
      p.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v);
    });
    const h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  /* ---------- فیلتر و امتیاز تطابق ---------- */
  function matches(l) {
    if (S.city && l.city !== S.city) return false;
    if (S.province && cityOf(l.city).province !== S.province) return false;
    if (S.deal && l.deal !== S.deal) return false;
    if (S.types.length && !S.types.includes(l.type)) return false;
    const p = primaryPrice(l);
    if (S.min && p < S.min) return false;
    if (S.max && p > S.max) return false;
    if (S.areaMin && l.area < S.areaMin) return false;
    if (S.areaMax && l.area > S.areaMax) return false;
    if (S.rooms && (S.rooms >= 4 ? l.rooms < 4 : l.rooms !== S.rooms)) return false;
    if (S.verified && !l.verified) return false;
    if (S.newBuild && l.year < 1398) return false;
    if (S.amenities.length && !S.amenities.every((a) => l.amenities.includes(a))) return false;
    return true;
  }
  function score(l) {
    let s = 50 + (l.verified ? 15 : 0) + Math.max(0, 15 - l.daysAgo / 2) + l.amenities.length * 2;
    const med = medianPPM(l.city, l.type);
    if (ppm(l) && med) s += Math.max(-15, Math.min(15, ((med - ppm(l)) / med) * 50));
    return Math.round(Math.min(99, s));
  }
  function results() {
    const list = ALL.filter(matches);
    const by = {
      new: (a, b) => a.daysAgo - b.daysAgo,
      cheap: (a, b) => primaryPrice(a) - primaryPrice(b),
      exp: (a, b) => primaryPrice(b) - primaryPrice(a),
      ppm: (a, b) => (ppm(a) || 1e15) - (ppm(b) || 1e15),
      area: (a, b) => b.area - a.area,
      match: (a, b) => score(b) - score(a),
    }[S.sort] || ((a, b) => a.daysAgo - b.daysAgo);
    return list.sort(by);
  }

  /* ---------- تصویرسازی برداری صحنه هر آگهی ---------- */
  const PALETTE = {
    sea: ["#7dd3fc", "#e0f2fe", "#0ea5e9", "#0369a1"],
    forest: ["#a7f3d0", "#ecfdf5", "#15803d", "#14532d"],
    mountain: ["#c7d2fe", "#eef2ff", "#64748b", "#334155"],
    field: ["#fde68a", "#fffbeb", "#84cc16", "#3f6212"],
    city: ["#fbcfe8", "#fdf2f8", "#94a3b8", "#475569"],
  };
  function sceneSVG(l, variant = 0) {
    const [s1, s2, g1, g2] = PALETTE[l.scene] || PALETTE.city;
    const id = "g" + l.id.replace(/\W/g, "") + variant;
    const sunX = 60 + ((l.area * 7 + variant * 90) % 260);
    let ground = "", building = "";
    if (l.scene === "sea") ground = `<path d="M0 150 Q100 140 200 150 T400 148 V240 H0Z" fill="${g1}" opacity=".85"/><path d="M0 170 Q50 164 100 170 T200 170 T300 170 T400 170" stroke="#fff" stroke-opacity=".6" fill="none"/><path d="M0 200 Q200 185 400 200 V240 H0Z" fill="#fde68a"/>`;
    else if (l.scene === "forest") ground = `<path d="M0 130 L40 80 L70 120 L110 60 L150 125 L200 75 L240 120 L290 70 L330 125 L370 85 L400 115 V240 H0Z" fill="${g2}" opacity=".55"/><path d="M0 175 Q200 150 400 175 V240 H0Z" fill="${g1}"/>`;
    else if (l.scene === "mountain") ground = `<path d="M0 160 L90 60 L150 120 L230 40 L320 130 L400 80 V240 H0Z" fill="${g1}"/><path d="M230 40 l18 22 l-12 -3 l-8 10 l-10 -8 l-6 3z" fill="#fff"/><path d="M0 185 Q200 170 400 185 V240 H0Z" fill="#86efac"/>`;
    else if (l.scene === "field") ground = `<path d="M0 150 Q200 130 400 150 V240 H0Z" fill="${g1}"/>${Array.from({ length: 7 }, (_, i) => `<path d="M${i * 60} 240 L${180 + i * 6} 150" stroke="${g2}" stroke-opacity=".25"/>`).join("")}`;
    else ground = `<g fill="${g1}" opacity=".6"><rect x="20" y="90" width="40" height="110"/><rect x="70" y="60" width="50" height="140"/><rect x="300" y="80" width="45" height="120"/><rect x="350" y="105" width="40" height="95"/></g><rect y="195" width="400" height="45" fill="${g2}" opacity=".4"/>`;

    const roof = variant % 2 ? "#b45309" : "#9f1239";
    if (l.type === "villa") building = `<g transform="translate(130 92)"><rect x="0" y="48" width="140" height="70" rx="3" fill="#fff"/><path d="M-10 52 L70 4 L150 52Z" fill="${roof}"/><rect x="20" y="70" width="26" height="22" rx="2" fill="#7dd3fc"/><rect x="94" y="70" width="26" height="22" rx="2" fill="#7dd3fc"/><rect x="58" y="78" width="24" height="40" rx="2" fill="#78350f"/>${l.amenities.includes("pool") ? `<rect x="150" y="98" width="60" height="18" rx="9" fill="#38bdf8" stroke="#fff" stroke-width="2"/>` : ""}</g>`;
    else if (l.type === "apartment") building = `<g transform="translate(150 40)"><rect width="100" height="160" rx="4" fill="#f8fafc"/>${Array.from({ length: 6 }, (_, r) => [0, 1, 2].map((c) => `<rect x="${12 + c * 28}" y="${12 + r * 24}" width="20" height="14" rx="2" fill="${(r + c + variant) % 3 ? "#93c5fd" : "#fde68a"}"/>`).join("")).join("")}</g>`;
    else if (l.type === "suite") building = `<g transform="translate(150 110)"><rect width="100" height="80" rx="4" fill="#fff"/><rect x="0" y="-8" width="100" height="10" rx="3" fill="${roof}"/><rect x="14" y="20" width="30" height="24" rx="2" fill="#7dd3fc"/><rect x="58" y="30" width="26" height="50" rx="2" fill="#78350f"/></g>`;
    else if (l.type === "shop") building = `<g transform="translate(130 90)"><rect width="140" height="100" rx="3" fill="#fff"/><path d="M0 0 h140 v18 h-140z" fill="${roof}"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${i * 20} 18 h20 l-4 14 h-12z" fill="${i % 2 ? "#fff" : roof}"/>`).join("")}<rect x="14" y="44" width="70" height="56" fill="#bae6fd"/><rect x="94" y="50" width="32" height="50" fill="#475569"/></g>`;
    else if (l.type === "garden") building = Array.from({ length: 9 }, (_, i) => { const x = 40 + i * 40, y = 165 + (i % 2) * 18; return `<g transform="translate(${x} ${y})"><rect x="-3" y="0" width="6" height="22" fill="#78350f"/><circle r="18" cy="-6" fill="${g2}"/><circle r="4" cx="6" cy="-10" fill="#fb923c"/></g>`; }).join("");
    else building = `<g stroke="#78350f" stroke-width="3">${Array.from({ length: 11 }, (_, i) => `<line x1="${30 + i * 34}" y1="170" x2="${30 + i * 34}" y2="200"/>`).join("")}<line x1="30" y1="178" x2="370" y2="178"/><line x1="30" y1="192" x2="370" y2="192"/></g><g transform="translate(300 120)"><rect x="-2" width="4" height="50" fill="#334155"/><rect x="2" y="2" width="44" height="24" rx="3" fill="#fff"/><text x="24" y="19" font-size="12" text-anchor="middle" fill="#0f766e" font-family="Vazirmatn">فروشی</text></g>`;

    return `<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(l.title)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="400" height="240" fill="url(#${id})"/><circle cx="${sunX}" cy="48" r="20" fill="#fef08a" opacity=".9"/>${ground}${building}</svg>`;
  }

  /* ---------- نمایش قیمت ---------- */
  function priceHTML(l) {
    if (l.deal === "sale") return `<b>${money(l.price)}</b><small>تومان</small>`;
    if (l.deal === "rent") return `<b>${money(l.deposit)}</b><small>ودیعه</small><span class="sep">+</span><b>${money(l.rent)}</b><small>ماهانه</small>`;
    return `<b>${money(l.nightly)}</b><small>تومان / شب</small>`;
  }
  function pinLabel(l) {
    return l.deal === "sale" ? money(l.price) : l.deal === "rent" ? "رهن " + money(l.deposit) : money(l.nightly) + "/شب";
  }
  function dealBadge(l) { return `<span class="tag tag--${l.deal}">${DEAL_TYPES.find((d) => d.id === l.deal).name}</span>`; }
  function priceVerdict(l) {
    const m = medianPPM(l.city, l.type), p = ppm(l);
    if (!m || !p || ALL.filter((x) => x.deal === "sale" && x.city === l.city && x.type === l.type).length < 2) return null;
    const d = (p - m) / m;
    if (d < -0.1) return { cls: "good", txt: `${fa(Math.round(-d * 100))}٪ زیر میانه شهر` };
    if (d > 0.1) return { cls: "high", txt: `${fa(Math.round(d * 100))}٪ بالای میانه شهر` };
    return { cls: "fair", txt: "هم‌سطح میانه شهر" };
  }

  /* ---------- کارت آگهی ---------- */
  function cardHTML(l) {
    const c = cityOf(l.city), t = typeOf(l.type), v = priceVerdict(l);
    const amen = l.amenities.slice(0, 3).map((a) => `<li>${amenOf(a).name}</li>`).join("");
    return `<article class="card" data-id="${l.id}" tabindex="0">
      <div class="card__media">${sceneSVG(l)}
        <div class="card__top">${dealBadge(l)}${l.verified ? '<span class="tag tag--ok">✓ تأییدشده</span>' : ""}${l.mine ? '<span class="tag tag--mine">آگهی من</span>' : ""}</div>
        <button class="fav ${favs.has(l.id) ? "is-on" : ""}" data-fav="${l.id}" aria-label="افزودن به علاقه‌مندی‌ها"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.4 5 7 5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.6 0 5.8 3.6 4.5 6.8C19.5 16.4 12 21 12 21z"/></svg></button>
        <span class="card__score" title="امتیاز تطابق">${fa(score(l))}</span>
      </div>
      <div class="card__body">
        <div class="card__price">${priceHTML(l)}</div>
        <h3>${esc(l.title)}</h3>
        <p class="card__loc">📍 ${c.name}، ${esc(l.hood)} <span>· ${l.daysAgo ? fa(l.daysAgo) + " روز پیش" : "امروز"}</span></p>
        <ul class="specs"><li>${t.icon} ${t.name}</li><li>📐 ${fa(l.area)} متر</li>${l.rooms ? `<li>🛏 ${fa(l.rooms)} خواب</li>` : ""}</ul>
        ${amen ? `<ul class="amen">${amen}${l.amenities.length > 3 ? `<li>+${fa(l.amenities.length - 3)}</li>` : ""}</ul>` : ""}
        <div class="card__foot">
          ${v ? `<span class="verdict verdict--${v.cls}">${v.txt}</span>` : `<span class="muted small">${esc(l.agency)}</span>`}
          <label class="cmp"><input type="checkbox" data-cmp="${l.id}" ${compare.includes(l.id) ? "checked" : ""}/> مقایسه</label>
        </div>
      </div>
    </article>`;
  }

  /* ---------- نقشه ---------- */
  let map, layer, markers = {};
  function initMap() {
    if (!window.L) { $("#map").innerHTML = '<p class="map-off">نقشه در دسترس نیست (اتصال اینترنت را بررسی کنید).</p>'; return; }
    map = L.map("map", { zoomControl: true, attributionControl: true }).setView([36.9, 52.2], 7);
    let tileErr = 0;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" })
      .on("tileerror", () => { if (++tileErr === 4) $("#map").classList.add("no-tiles"); })
      .addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("zoomend", () => drawMap(lastList));
  }
  // در بزرگنمایی کم، آگهی‌های هر شهر در یک حباب شمارنده جمع می‌شوند
  let lastList = [], fitNext = true;
  function drawMap(list) {
    if (!map) return;
    if (list !== lastList) { lastList = list; fitNext = true; }
    layer.clearLayers(); markers = {};
    const z = map.getZoom(), single = S.city && list.every((l) => l.city === S.city);
    const level = single || z >= 10 ? "pin" : z < 8 && !S.province ? "province" : "city";
    if (level === "pin") list.forEach(addPin);
    else {
      const groups = {};
      list.forEach((l) => { const k = level === "city" ? l.city : cityOf(l.city).province; (groups[k] = groups[k] || []).push(l); });
      Object.entries(groups).forEach(([k, ls]) => {
        if (ls.length === 1) return addPin(ls[0]);
        const g = level === "city" ? cityOf(k) : provOf(k);
        const pos = level === "city" ? [g.lat, g.lng] : g.center;
        const icon = L.divIcon({ className: "pin-wrap", html: `<span class="cluster"><b>${fa(ls.length)}</b>${g.name}</span>`, iconSize: null });
        L.marker(pos, { icon }).addTo(layer).on("click", () => map.setView(pos, level === "city" ? 12 : 9));
        ls.forEach((l) => (markers[l.id] = { cityGroup: true }));
      });
    }
    if (fitNext && list.length) {
      fitNext = false;
      map.fitBounds(L.latLngBounds(list.map((l) => [l.lat, l.lng])), { padding: [40, 40], maxZoom: 12 });
    }
  }
  function addPin(l) {
    const icon = L.divIcon({ className: "pin-wrap", html: `<span class="pin pin--${l.deal}">${pinLabel(l)}</span>`, iconSize: null });
    const m = L.marker([l.lat, l.lng], { icon }).addTo(layer);
    m.on("click", () => openDetail(l.id));
    markers[l.id] = m;
  }
  function highlight(id, on) {
    const m = markers[id]; if (!m || m.cityGroup) return;
    const el = m.getElement(); if (!el) return;
    el.classList.toggle("is-hot", on);
    m.setZIndexOffset(on ? 1000 : 0);
  }

  /* ---------- رندر اصلی ---------- */
  function render() {
    const list = results();
    $("#grid").innerHTML = list.map(cardHTML).join("");
    $("#empty").hidden = list.length > 0;
    $("#resBody").hidden = list.length === 0;
    const c = cityOf(S.city), p = provOf(S.province);
    const deal = S.deal ? DEAL_TYPES.find((d) => d.id === S.deal).name : "";
    const types = S.types.map((t) => typeOf(t).name).join(" و ");
    $("#resTitle").textContent = [types || "املاک", deal && `برای ${deal}`, c ? `در ${c.name}` : p ? `در استان ${p.name}` : "در شمال کشور"].filter(Boolean).join(" ");
    $("#resCount").textContent = `${fa(list.length)} آگهی یافت شد`;
    renderActiveTags();
    syncControls();
    writeHash();
    if (S.view !== "grid") setTimeout(() => { map && map.invalidateSize(); drawMap(list); }, 0);
  }

  function renderActiveTags() {
    const t = [];
    if (S.city) t.push(["city", "📍 " + cityOf(S.city).name]);
    else if (S.province) t.push(["province", "🗺️ " + provOf(S.province).name]);
    if (S.deal) t.push(["deal", DEAL_TYPES.find((d) => d.id === S.deal).name]);
    S.types.forEach((x) => t.push(["types:" + x, typeOf(x).name]));
    if (S.min) t.push(["min", "از " + money(S.min)]);
    if (S.max) t.push(["max", "تا " + money(S.max)]);
    if (S.areaMin) t.push(["areaMin", "از " + fa(S.areaMin) + " متر"]);
    if (S.areaMax) t.push(["areaMax", "تا " + fa(S.areaMax) + " متر"]);
    if (S.rooms) t.push(["rooms", fa(S.rooms) + (S.rooms >= 4 ? "+" : "") + " خواب"]);
    S.amenities.forEach((x) => t.push(["amenities:" + x, amenOf(x).name]));
    if (S.verified) t.push(["verified", "تأییدشده"]);
    if (S.newBuild) t.push(["newBuild", "نوساز"]);
    $("#activeTags").innerHTML = t.map(([k, v]) => `<button class="atag" data-rm="${k}">${esc(v)} <i>✕</i></button>`).join("");
  }

  /* ---------- کنترل‌های فیلتر ---------- */
  function buildControls() {
    $("#fProvince").innerHTML += PROVINCES.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    $("#fDeal").innerHTML = [{ id: "", name: "همه" }, ...DEAL_TYPES].map((d) => `<button type="button" data-v="${d.id}">${d.name}</button>`).join("");
    $("#fType").innerHTML = PROPERTY_TYPES.map((t) => `<button type="button" data-v="${t.id}"><span>${t.icon}</span>${t.name}</button>`).join("");
    $("#fRooms").innerHTML = [0, 1, 2, 3, 4].map((r) => `<button type="button" data-v="${r}">${r ? fa(r) + (r === 4 ? "+" : "") : "همه"}</button>`).join("");
    $("#fAmen").innerHTML = AMENITIES.map((a) => `<label><input type="checkbox" value="${a.id}"/><span>${a.name}</span></label>`).join("");
    fillCities();
  }
  function fillCities() {
    const list = CITIES.filter((c) => !S.province || c.province === S.province);
    $("#fCity").innerHTML = `<option value="">همه شهرها</option>` + PROVINCES.filter((p) => !S.province || p.id === S.province)
      .map((p) => `<optgroup label="${p.name}">${list.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</optgroup>`).join("");
  }
  const fmtInput = (v) => (v ? fa(v).replace(/٬/g, ",") : "");
  function syncControls() {
    $("#fProvince").value = S.province; fillCities(); $("#fCity").value = S.city;
    $$("#fDeal button").forEach((b) => b.classList.toggle("is-on", b.dataset.v === S.deal));
    $$("#fType button").forEach((b) => b.classList.toggle("is-on", S.types.includes(b.dataset.v)));
    $$("#fRooms button").forEach((b) => b.classList.toggle("is-on", +b.dataset.v === S.rooms));
    $$("#fAmen input").forEach((i) => (i.checked = S.amenities.includes(i.value)));
    [["#fMin", "min"], ["#fMax", "max"], ["#fAreaMin", "areaMin"], ["#fAreaMax", "areaMax"]].forEach(([s, k]) => { if (document.activeElement !== $(s)) $(s).value = fmtInput(S[k]); });
    $("#fVerified").checked = S.verified;
    $("#sort").value = S.sort;
    $$("#viewSeg button").forEach((b) => b.classList.toggle("is-on", b.dataset.view === S.view));
    $("#resBody").className = "results__body view-" + S.view;
    $$(".smart__tabs button").forEach((b) => b.classList.toggle("is-on", b.dataset.deal === S.deal));
    $("#budgetHint").textContent = S.deal === "rent" ? "برای اجاره، ودیعه معادل (ودیعه + اجاره÷۳٪) ملاک است." : S.deal === "daily" ? "مبلغ اجاره هر شب" : "قیمت کل ملک";
  }
  const set = (patch) => { S = { ...S, ...patch }; render(); };
  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  function bindControls() {
    $("#fProvince").onchange = (e) => set({ province: e.target.value, city: "" });
    $("#fCity").onchange = (e) => { const c = cityOf(e.target.value); set({ city: e.target.value, province: c ? c.province : S.province }); };
    $("#fDeal").onclick = (e) => { const b = e.target.closest("button"); b && set({ deal: b.dataset.v }); };
    $("#fType").onclick = (e) => { const b = e.target.closest("button"); b && set({ types: toggleIn(S.types, b.dataset.v) }); };
    $("#fRooms").onclick = (e) => { const b = e.target.closest("button"); b && set({ rooms: +b.dataset.v }); };
    $("#fAmen").onchange = (e) => set({ amenities: toggleIn(S.amenities, e.target.value) });
    $("#fVerified").onchange = (e) => set({ verified: e.target.checked });
    [["#fMin", "min"], ["#fMax", "max"], ["#fAreaMin", "areaMin"], ["#fAreaMax", "areaMax"]].forEach(([s, k]) => {
      let t; $(s).addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => set({ [k]: num(e.target.value) }), 450); });
      $(s).addEventListener("blur", (e) => (e.target.value = fmtInput(S[k])));
    });
    $("#sort").onchange = (e) => set({ sort: e.target.value });
    $("#viewSeg").onclick = (e) => { const b = e.target.closest("button"); b && set({ view: b.dataset.view }); };
    const reset = () => { S = { ...DEFAULT, view: S.view }; $("#smartInput").value = ""; $("#smartParsed").innerHTML = ""; render(); };
    $("#resetBtn").onclick = reset; $("#emptyReset").onclick = reset;
    $("#activeTags").onclick = (e) => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      const [k, v] = b.dataset.rm.split(":");
      if (v) set({ [k]: S[k].filter((x) => x !== v) });
      else if (k === "province") set({ province: "", city: "" });
      else set({ [k]: DEFAULT[k] });
    };
    $("#openFilters").onclick = () => $("#filters").classList.add("is-open");
    document.addEventListener("click", (e) => { const f = $("#filters"); if (f.classList.contains("is-open") && !f.contains(e.target) && !e.target.closest("#openFilters")) f.classList.remove("is-open"); });
    $("#saveSearch").onclick = () => {
      const saved = store.get("searches", []);
      saved.unshift({ hash: location.hash, title: $("#resTitle").textContent, at: Date.now() });
      store.set("searches", saved.slice(0, 10));
      toast("جست‌وجو ذخیره شد؛ آگهی‌های جدید مطابق آن را در علاقه‌مندی‌ها ببینید.");
    };
    $$("[data-deal-link]").forEach((a) => a.addEventListener("click", () => set({ deal: a.dataset.dealLink })));

    // کارت‌ها: باز کردن، علاقه‌مندی، مقایسه، هایلایت نقشه
    const grid = $("#grid");
    grid.addEventListener("click", (e) => {
      const f = e.target.closest("[data-fav]"); if (f) { e.stopPropagation(); toggleFav(f.dataset.fav, f); return; }
      if (e.target.closest(".cmp")) return;
      const c = e.target.closest(".card"); c && openDetail(c.dataset.id);
    });
    grid.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("card")) openDetail(e.target.dataset.id); });
    grid.addEventListener("change", (e) => { if (e.target.dataset.cmp) toggleCompare(e.target.dataset.cmp, e.target); });
    grid.addEventListener("mouseover", (e) => { const c = e.target.closest(".card"); c && highlight(c.dataset.id, true); });
    grid.addEventListener("mouseout", (e) => { const c = e.target.closest(".card"); c && highlight(c.dataset.id, false); });
  }

  // اگر نتیجه‌ای نبود، قیود را به‌ترتیب از کم‌اهمیت به پراهمیت برمی‌داریم
  function relaxIfEmpty() {
    let list = results(), relax = "";
    if (list.length) return { list, relax };
    const order = [["amenities", []], ["rooms", 0], ["areaMin", 0], ["areaMax", 0], ["min", 0], ["max", 0], ["city", ""]];
    const names = { amenities: "امکانات", rooms: "تعداد خواب", areaMin: "متراژ", areaMax: "متراژ", min: "کف بودجه", max: "سقف بودجه", city: "شهر (کل استان)" };
    const dropped = [];
    for (const [k, d] of order) {
      if (JSON.stringify(S[k]) === JSON.stringify(d)) continue;
      S[k] = d; dropped.push(names[k]); list = results();
      if (list.length) break;
    }
    relax = [...new Set(dropped)].join("، ");
    render();
    return { list, relax };
  }

  /* ---------- جست‌وجوی هوشمند بالای صفحه ---------- */
  function applyNL(text, keepDeal) {
    const base = keepDeal && S.deal ? { deal: S.deal } : {};
    const { filters, tags, understood } = NLP.parseQuery(text, base);
    S = { ...DEFAULT, view: S.view, ...filters, types: filters.types, amenities: filters.amenities };
    render();
    return { tags, understood, count: results().length };
  }
  function bindSmart() {
    $("#smartForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#smartInput").value.trim();
      if (!v) { document.getElementById("explore").scrollIntoView({ behavior: "smooth" }); return; }
      const r = applyNL(v, true);
      const { relax } = relaxIfEmpty();
      $("#smartParsed").innerHTML = r.understood
        ? `<span class="muted">برداشت دستیار:</span> ${r.tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join("")}${relax ? `<span class="muted"> · مورد کاملاً منطبق نبود؛ قید «${relax}» برداشته شد.</span>` : ""}`
        : `<span class="muted">عبارت شناخته نشد؛ همه آگهی‌ها نمایش داده می‌شود.</span>`;
      setTimeout(() => document.getElementById("explore").scrollIntoView({ behavior: "smooth" }), 350);
    });
    $(".smart__tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { set({ deal: b.dataset.deal }); } };
    // پیش‌نمایش زنده برداشت
    $("#smartInput").addEventListener("input", (e) => {
      const v = e.target.value.trim();
      if (v.length < 3) { $("#smartParsed").innerHTML = ""; return; }
      const { tags } = NLP.parseQuery(v);
      $("#smartParsed").innerHTML = tags.length ? `<span class="muted">در حال فهم:</span> ${tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join("")}` : "";
    });
    $("#heroChips").onclick = (e) => { const c = e.target.closest("[data-q]"); if (!c) return; $("#smartInput").value = c.dataset.q; $("#smartForm").requestSubmit(); };
  }

  /* ---------- آمار ---------- */
  function renderStats() {
    const s = [
      [fa(ALL.length), "آگهی فعال"],
      [fa(CITIES.length), "شهر در ۳ استان"],
      [fa(ALL.filter((l) => l.verified).length), "آگهی تأییدشده"],
      [fa(ALL.filter((l) => l.deal === "daily").length), "اقامتگاه روزانه"],
    ];
    $("#stats").innerHTML = s.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join("");
  }

  /* ---------- جزئیات آگهی ---------- */
  const dlg = $("#dlg");
  function openDialog(html, cls = "") {
    $("#dlgBody").innerHTML = html; dlg.className = "dlg " + cls;
    if (!dlg.open) dlg.showModal();
    $("#dlgBody").scrollTop = 0;
  }
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });

  function openDetail(id) {
    const l = ALL.find((x) => x.id === id); if (!l) return;
    const c = cityOf(l.city), t = typeOf(l.type), v = priceVerdict(l), med = medianPPM(l.city, l.type);
    const similar = ALL.filter((x) => x.id !== l.id && x.type === l.type && cityOf(x.city).province === c.province).sort((a, b) => Math.abs(primaryPrice(a) - primaryPrice(l)) - Math.abs(primaryPrice(b) - primaryPrice(l))).slice(0, 3);
    const extra = l.deal === "sale"
      ? `<li><span>قیمت هر متر</span><b>${money(ppm(l))}</b></li><li><span>میانه هر متر در ${c.name}</span><b>${med ? money(med) : "—"}</b></li>`
      : l.deal === "rent" ? `<li><span>ودیعه معادل کامل</span><b>${money(primaryPrice(l))}</b></li>` : `<li><span>هزینه آخر هفته (۲ شب)</span><b>${money(l.nightly * 2)}</b></li>`;
    openDialog(`
      <button class="dlg__x" data-close aria-label="بستن">✕</button>
      <div class="gallery" id="gal">
        <div class="gallery__main">${sceneSVG(l, 0)}</div>
        <div class="gallery__thumbs">${[0, 1, 2].map((i) => `<button data-v="${i}" class="${i ? "" : "is-on"}">${sceneSVG(l, i)}</button>`).join("")}</div>
      </div>
      <div class="detail">
        <div class="detail__main">
          <div class="detail__tags">${dealBadge(l)}${l.verified ? '<span class="tag tag--ok">✓ تأییدشده</span>' : ""}${l.sample ? '<span class="tag tag--demo">آگهی نمونه</span>' : ""}</div>
          <h2>${esc(l.title)}</h2>
          <p class="muted">📍 استان ${provOf(c.province).name}، ${c.name}، ${esc(l.hood)} · کد آگهی ${esc(l.id)}</p>
          <div class="detail__price">${priceHTML(l)}</div>
          ${v ? `<p class="verdict verdict--${v.cls} verdict--lg">ارزیابی قیمت: ${v.txt}</p>` : ""}
          <ul class="kv">
            <li><span>نوع ملک</span><b>${t.icon} ${t.name}</b></li>
            <li><span>متراژ</span><b>${fa(l.area)} متر</b></li>
            ${l.rooms ? `<li><span>اتاق خواب</span><b>${fa(l.rooms)}</b></li>` : ""}
            ${l.type !== "land" && l.type !== "garden" ? `<li><span>سال ساخت</span><b>${faY(l.year)}</b></li>` : ""}
            ${extra}
            <li><span>آگهی‌دهنده</span><b>${esc(l.agency)}</b></li>
          </ul>
          <h3>امکانات</h3>
          <ul class="amen amen--lg">${AMENITIES.map((a) => `<li class="${l.amenities.includes(a.id) ? "" : "is-off"}">${l.amenities.includes(a.id) ? "✓" : "—"} ${a.name}</li>`).join("")}</ul>
          <h3>درباره این شهر</h3>
          <p>${c.name} با ویژگی‌های ${c.tags.join("، ")} شناخته می‌شود. ${fa(ALL.filter((x) => x.city === c.id).length)} آگهی فعال در این شهر ثبت شده است.</p>
        </div>
        <aside class="detail__side">
          <div class="contact">
            <b>${esc(l.agency)}</b>
            <button class="btn btn--primary btn--block" id="callBtn">📞 نمایش اطلاعات تماس</button>
            <button class="btn btn--ghost btn--block" id="dFav">${favs.has(l.id) ? "♥ ذخیره شده" : "♡ ذخیره آگهی"}</button>
            <button class="btn btn--ghost btn--block" id="dShare">🔗 اشتراک‌گذاری</button>
            <button class="btn btn--ghost btn--block" id="dAsk">✦ از دستیار درباره این ملک بپرس</button>
            <p class="muted small">پیش از هر پرداخت، ملک و مدارک را حضوری بررسی کنید.</p>
          </div>
        </aside>
      </div>
      ${similar.length ? `<div class="similar"><h3>آگهی‌های مشابه در استان ${provOf(c.province).name}</h3><div class="grid grid--3">${similar.map(cardHTML).join("")}</div></div>` : ""}
    `, "dlg--wide");
    $("#gal .gallery__thumbs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; $$("#gal .gallery__thumbs button").forEach((x) => x.classList.toggle("is-on", x === b)); $("#gal .gallery__main").innerHTML = sceneSVG(l, +b.dataset.v); };
    $("#callBtn").onclick = (e) => { e.target.outerHTML = `<p class="call-info">${l.sample ? "این آگهی نمونه است و شماره تماس واقعی ندارد." : esc(l.phone || "—")}</p>`; };
    $("#dFav").onclick = (e) => { toggleFav(l.id); e.target.textContent = favs.has(l.id) ? "♥ ذخیره شده" : "♡ ذخیره آگهی"; };
    $("#dShare").onclick = () => { const url = location.href.split("#")[0] + "#listing=" + l.id; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("پیوند آگهی کپی شد"), () => toast(url)); };
    $("#dAsk").onclick = () => { dlg.close(); openAI(); aiAnswerAbout(l); };
    $(".similar .grid")?.addEventListener("click", (e) => { const c2 = e.target.closest(".card"); if (c2 && !e.target.closest(".fav,.cmp")) openDetail(c2.dataset.id); });
  }

  /* ---------- علاقه‌مندی ---------- */
  function toggleFav(id, btn) {
    favs.has(id) ? favs.delete(id) : favs.add(id);
    store.set("favs", [...favs]);
    $("#favCount").textContent = fa(favs.size); $("#favCount").hidden = !favs.size;
    $$(`[data-fav="${id}"]`).forEach((b) => b.classList.toggle("is-on", favs.has(id)));
    toast(favs.has(id) ? "به علاقه‌مندی‌ها اضافه شد" : "از علاقه‌مندی‌ها حذف شد");
  }
  $("#favBtn").onclick = () => {
    const list = ALL.filter((l) => favs.has(l.id));
    const saved = store.get("searches", []);
    openDialog(`<button class="dlg__x" data-close>✕</button><h2>علاقه‌مندی‌های من</h2>
      ${list.length ? `<div class="grid grid--3">${list.map(cardHTML).join("")}</div>` : `<p class="muted">هنوز آگهی‌ای ذخیره نکرده‌اید. روی ♡ هر کارت بزنید.</p>`}
      <h3>جست‌وجوهای ذخیره‌شده</h3>
      ${saved.length ? `<ul class="saved">${saved.map((s) => `<li><a href="${esc(s.hash || "#")}" data-close data-hash="${esc(s.hash)}">${esc(s.title)}</a></li>`).join("")}</ul>` : `<p class="muted">جست‌وجویی ذخیره نشده است.</p>`}`, "dlg--wide");
    $("#dlgBody .grid")?.addEventListener("click", (e) => { const c = e.target.closest(".card"); if (!c) return; const f = e.target.closest("[data-fav]"); if (f) { toggleFav(f.dataset.fav); c.remove(); return; } openDetail(c.dataset.id); });
    $$("#dlgBody [data-hash]").forEach((a) => a.addEventListener("click", () => setTimeout(() => { S = { ...DEFAULT, ...readHash() }; render(); }, 0)));
  };

  /* ---------- مقایسه ---------- */
  function toggleCompare(id, input) {
    if (compare.includes(id)) compare = compare.filter((x) => x !== id);
    else if (compare.length >= 3) { toast("حداکثر سه آگهی قابل مقایسه است"); if (input) input.checked = false; return; }
    else compare.push(id);
    renderCompareBar();
  }
  function renderCompareBar() {
    $("#compareBar").hidden = compare.length === 0;
    $("#compareItems").innerHTML = compare.map((id) => { const l = ALL.find((x) => x.id === id); return `<span class="cchip">${esc(l.title)} <button data-uncmp="${id}">✕</button></span>`; }).join("");
    $$("[data-cmp]").forEach((i) => (i.checked = compare.includes(i.dataset.cmp)));
  }
  $("#compareItems").onclick = (e) => { const b = e.target.closest("[data-uncmp]"); b && toggleCompare(b.dataset.uncmp); };
  $("#compareClear").onclick = () => { compare = []; renderCompareBar(); };
  $("#compareGo").onclick = () => {
    if (compare.length < 2) { toast("دست‌کم دو آگهی برای مقایسه انتخاب کنید"); return; }
    const ls = compare.map((id) => ALL.find((x) => x.id === id));
    const best = (fn, low = true) => { const vals = ls.map(fn).filter((v) => v > 0); if (!vals.length) return null; return low ? Math.min(...vals) : Math.max(...vals); };
    const bP = best(primaryPrice), bA = best((l) => l.area, false), bM = best(ppm), bS = best(score, false);
    const row = (label, fn, b, fmt = (x) => x) => `<tr><th>${label}</th>${ls.map((l) => { const v = fn(l); return `<td class="${b !== null && v === b ? "is-best" : ""}">${fmt(v, l)}</td>`; }).join("")}</tr>`;
    openDialog(`<button class="dlg__x" data-close>✕</button><h2>مقایسه آگهی‌ها</h2>
      <div class="tbl-wrap"><table class="cmp-tbl"><thead><tr><th></th>${ls.map((l) => `<th><div class="cmp-img">${sceneSVG(l)}</div>${esc(l.title)}</th>`).join("")}</tr></thead><tbody>
      ${row("شهر", (l) => cityOf(l.city).name, null)}
      ${row("معامله", (l) => DEAL_TYPES.find((d) => d.id === l.deal).name, null)}
      ${row("قیمت / ودیعه معادل", primaryPrice, bP, (v) => money(v) + " تومان")}
      ${row("متراژ", (l) => l.area, bA, (v) => fa(v) + " متر")}
      ${row("قیمت هر متر", ppm, bM, (v) => (v ? money(v) : "—"))}
      ${row("خواب", (l) => l.rooms, null, (v) => (v ? fa(v) : "—"))}
      ${row("سال ساخت", (l) => l.year, null, (v, l) => (l.type === "land" || l.type === "garden" ? "—" : faY(v)))}
      ${row("امتیاز تطابق", score, bS, (v) => fa(v))}
      ${AMENITIES.map((a) => row(a.name, (l) => l.amenities.includes(a.id), null, (v) => (v ? '<span class="yes">✓</span>' : '<span class="no">—</span>'))).join("")}
      </tbody></table></div><p class="muted small">خانه‌های سبز بهترین مقدار هر ردیف را نشان می‌دهند.</p>`, "dlg--wide");
  };

  /* ---------- راهنمای شهرها ---------- */
  let provTab = "gilan";
  function renderCities() {
    $("#provTabs").innerHTML = PROVINCES.map((p) => `<button class="${p.id === provTab ? "is-on" : ""}" data-p="${p.id}">${p.name} <small>${fa(CITIES.filter((c) => c.province === p.id).length)} شهر</small></button>`).join("");
    $("#cityGrid").innerHTML = CITIES.filter((c) => c.province === provTab).map((c) => {
      const ls = ALL.filter((l) => l.city === c.id), m = medianPPM(c.id, "villa") || medianPPM(c.id);
      const scene = c.tags.includes("ساحلی") ? "sea" : c.tags.some((t) => ["جنگلی", "ییلاقی", "کوهستانی"].includes(t)) ? "forest" : c.tags.includes("کوهپایه") ? "mountain" : "city";
      return `<button class="city ${"city--" + scene}" data-city="${c.id}">
        <span class="city__name">${c.name}</span>
        <span class="city__tags">${c.tags.map((t) => `<i>${t}</i>`).join("")}</span>
        <span class="city__meta"><b>${fa(ls.length)}</b> آگهی ${m ? `· میانه متری <b>${money(m)}</b>` : ""}</span>
      </button>`;
    }).join("");
  }
  $("#provTabs").onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) { provTab = b.dataset.p; renderCities(); } };
  $("#cityGrid").onclick = (e) => { const b = e.target.closest("[data-city]"); if (!b) return; const c = cityOf(b.dataset.city); set({ city: c.id, province: c.province }); document.getElementById("explore").scrollIntoView({ behavior: "smooth" }); };

  /* ---------- ابزارها ---------- */
  function bindTools() {
    $("#vCity").innerHTML = PROVINCES.map((p) => `<optgroup label="${p.name}">${CITIES.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</optgroup>`).join("");
    $("#vCity").value = "ramsar";
    $("#vType").innerHTML = PROPERTY_TYPES.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    const val = () => {
      const city = $("#vCity").value, type = $("#vType").value, area = num($("#vArea").value);
      const pool = ALL.filter((l) => l.deal === "sale" && l.city === city && l.type === type);
      let m = median(pool.map(ppm)), basis = `${fa(pool.length)} آگهی مشابه در ${cityOf(city).name}`;
      if (pool.length < 2) {
        const pv = cityOf(city).province, p2 = ALL.filter((l) => l.deal === "sale" && l.type === type && cityOf(l.city).province === pv);
        m = median(p2.map(ppm)); basis = `داده کافی در این شهر نبود؛ میانه ${fa(p2.length)} آگهی در استان ${provOf(pv).name}`;
      }
      if (!m || !area) { $("#vOut").innerHTML = `<p class="muted">داده کافی برای تخمین وجود ندارد.</p>`; return; }
      const est = m * area;
      $("#vOut").innerHTML = `<div class="big">${money(est * 0.9)} تا ${money(est * 1.1)} <small>تومان</small></div><p class="muted small">میانه هر متر: ${money(m)} · مبنا: ${basis}. (داده نمایشی)</p>`;
    };
    ["#vCity", "#vType", "#vArea"].forEach((s) => $(s).addEventListener("input", val)); val();

    const loan = () => {
      const P = num($("#lAmt").value), r = num($("#lRate").value) / 1200, n = +$("#lYears").value * 12;
      $("#lYearsOut").textContent = fa($("#lYears").value) + " سال";
      if (!P || !n) { $("#lOut").innerHTML = ""; return; }
      const pay = r ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
      $("#lOut").innerHTML = `<div class="big">${fa(Math.round(pay))} <small>تومان در ماه</small></div><p class="muted small">مجموع بازپرداخت: ${money(pay * n)} · سود کل: ${money(pay * n - P)}</p>`;
    };
    ["#lAmt", "#lRate", "#lYears"].forEach((s) => $(s).addEventListener("input", loan)); loan();

    const conv = () => {
      const d = num($("#cDep").value), rent = num($("#cRent").value), r = num($("#cRate").value) / 100;
      if (!r) { $("#cOut").innerHTML = ""; return; }
      $("#cOut").innerHTML = `<div class="big">${money(d + rent / r)} <small>رهن کامل</small></div><p class="muted small">یا اجاره کامل بدون ودیعه: ${money(rent + d * r)} تومان در ماه</p>`;
    };
    ["#cDep", "#cRent", "#cRate"].forEach((s) => $(s).addEventListener("input", conv)); conv();
    // جداکننده هزارگان زنده
    ["#lAmt", "#cDep", "#cRent", "#vArea"].forEach((s) => $(s).addEventListener("blur", (e) => { const v = num(e.target.value); e.target.value = v ? v.toLocaleString("en-US") : ""; }));
  }

  /* ---------- ثبت آگهی (سه مرحله) ---------- */
  function openPost() {
    let step = 0;
    const data = { deal: "sale", type: "villa", amenities: [] };
    const steps = [
      () => `<h3>۱. نوع آگهی</h3>
        <div class="fld"><span>معامله</span><div class="seg" data-k="deal">${DEAL_TYPES.map((d) => `<button type="button" data-v="${d.id}" class="${data.deal === d.id ? "is-on" : ""}">${d.name}</button>`).join("")}</div></div>
        <div class="fld"><span>نوع ملک</span><div class="tiles" data-k="type">${PROPERTY_TYPES.map((t) => `<button type="button" data-v="${t.id}" class="${data.type === t.id ? "is-on" : ""}"><span>${t.icon}</span>${t.name}</button>`).join("")}</div></div>
        <label class="fld"><span>شهر</span><select name="city" required>${PROVINCES.map((p) => `<optgroup label="${p.name}">${CITIES.filter((c) => c.province === p.id).map((c) => `<option value="${c.id}" ${data.city === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</optgroup>`).join("")}</select></label>
        <label class="fld"><span>محله / آدرس تقریبی</span><input name="hood" required placeholder="مثلاً بلوار ساحلی" value="${esc(data.hood || "")}"/></label>`,
      () => `<h3>۲. مشخصات و قیمت</h3>
        <label class="fld"><span>عنوان آگهی</span><input name="title" required maxlength="60" placeholder="مثلاً ویلای دوبلکس با دید دریا" value="${esc(data.title || "")}"/></label>
        <div class="tool__grid"><label class="fld"><span>متراژ</span><input name="area" required inputmode="numeric" value="${data.area || ""}"/></label>
        <label class="fld"><span>تعداد خواب</span><input name="rooms" inputmode="numeric" value="${data.rooms ?? ""}"/></label>
        <label class="fld"><span>سال ساخت</span><input name="year" inputmode="numeric" placeholder="۱۴۰۰" value="${data.year || ""}"/></label></div>
        ${data.deal === "sale" ? `<label class="fld"><span>قیمت کل (تومان)</span><input name="price" required inputmode="numeric" value="${data.price || ""}"/></label>`
          : data.deal === "rent" ? `<div class="tool__grid"><label class="fld"><span>ودیعه (تومان)</span><input name="deposit" required inputmode="numeric" value="${data.deposit || ""}"/></label><label class="fld"><span>اجاره ماهانه (تومان)</span><input name="rent" inputmode="numeric" value="${data.rent || ""}"/></label></div>`
          : `<label class="fld"><span>اجاره هر شب (تومان)</span><input name="nightly" required inputmode="numeric" value="${data.nightly || ""}"/></label>`}
        <p class="muted small" id="postHint"></p>`,
      () => `<h3>۳. امکانات و تماس</h3>
        <div class="checks">${AMENITIES.map((a) => `<label><input type="checkbox" name="am" value="${a.id}" ${data.amenities.includes(a.id) ? "checked" : ""}/><span>${a.name}</span></label>`).join("")}</div>
        <label class="fld"><span>نام آگهی‌دهنده</span><input name="agency" required value="${esc(data.agency || "")}"/></label>
        <label class="fld"><span>شماره تماس</span><input name="phone" required inputmode="tel" pattern="[0-9۰-۹]{11}" placeholder="۰۹۱۲۳۴۵۶۷۸۹" value="${esc(data.phone || "")}"/></label>`,
    ];
    const draw = () => {
      openDialog(`<button class="dlg__x" data-close>✕</button><h2>ثبت رایگان آگهی</h2>
        <ol class="stepper">${["نوع", "مشخصات", "امکانات"].map((s, i) => `<li class="${i <= step ? "is-on" : ""}">${s}</li>`).join("")}</ol>
        <form id="postForm" novalidate>${steps[step]()}<div class="dlg__foot">${step ? '<button type="button" class="btn btn--ghost" id="pBack">قبلی</button>' : "<span></span>"}<button class="btn btn--primary">${step === 2 ? "انتشار آگهی" : "ادامه"}</button></div></form>`);
      const form = $("#postForm");
      $$("[data-k]", form).forEach((g) => g.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; data[g.dataset.k] = b.dataset.v; $$("button", g).forEach((x) => x.classList.toggle("is-on", x === b)); }));
      const hint = $("#postHint");
      if (hint) form.addEventListener("input", () => {
        const a = num(form.area?.value), p = num(form.price?.value);
        const m = medianPPM(data.city, data.type);
        hint.textContent = a && p && m ? `قیمت هر متر شما ${money(p / a)} است؛ میانه آگهی‌های مشابه ${money(m)}.` : "";
      });
      $("#pBack")?.addEventListener("click", () => { collect(form); step--; draw(); });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        collect(form);
        if (step < 2) { step++; draw(); return; }
        publish();
      });
    };
    const collect = (form) => {
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) if (k !== "am") data[k] = v;
      if (step === 2) data.amenities = fd.getAll("am");
    };
    const publish = () => {
      const c = cityOf(data.city || "rasht");
      const l = {
        id: "me-" + Date.now().toString(36), title: data.title, city: c.id, type: data.type, deal: data.deal,
        area: num(data.area), rooms: num(data.rooms), year: num(data.year) || 1400,
        price: num(data.price), deposit: num(data.deposit), rent: num(data.rent), nightly: num(data.nightly),
        amenities: data.amenities, hood: data.hood, lat: c.lat + (Math.random() - 0.5) * 0.02, lng: c.lng + (Math.random() - 0.5) * 0.03,
        daysAgo: 0, verified: false, agency: data.agency, phone: NLP.toEn(data.phone), mine: true,
        scene: data.type === "land" || data.type === "garden" ? "field" : data.amenities.includes("seaview") ? "sea" : data.amenities.includes("forest") ? "forest" : "city",
      };
      mine.unshift(l); store.set("mine", mine); ALL = [...mine, ...LISTINGS];
      dlg.close(); renderStats(); renderCities();
      S = { ...DEFAULT, view: S.view, city: l.city, province: c.province }; render();
      toast("آگهی شما منتشر شد (ذخیره در همین مرورگر)");
      document.getElementById("explore").scrollIntoView({ behavior: "smooth" });
    };
    data.city = S.city || "rasht";
    draw();
  }
  $("#postBtn").onclick = openPost;
  $("#footPost").onclick = (e) => { e.preventDefault(); openPost(); };

  /* ---------- دستیار هوشمند ---------- */
  const aiLog = $("#aiLog");
  function aiSay(html, who = "bot") {
    const d = document.createElement("div"); d.className = "msg msg--" + who; d.innerHTML = html;
    aiLog.appendChild(d); aiLog.scrollTop = aiLog.scrollHeight; return d;
  }
  function aiTyping() { return aiSay('<span class="dots"><i></i><i></i><i></i></span>'); }
  function aiSugs(list) { $("#aiSugs").innerHTML = list.map((s) => `<button class="chip chip--sm">${s}</button>`).join(""); }
  function openAI() {
    $("#ai").hidden = false; $("#aiFab").classList.add("is-hidden");
    if (!aiLog.children.length) {
      aiSay("سلام! من دستیار آرا هستم. بگو دنبال چه ملکی در شمال هستی؛ مثلاً «ویلای جنگلی تو نور با استخر تا ۱۵ میلیارد». می‌توانم قیمت‌ها را مقایسه کنم، ارزش ملک را تخمین بزنم و قسط وام را حساب کنم.");
      aiSugs(["ویلای ساحلی محمودآباد", "آپارتمان ۲ خوابه رشت رهن", "قیمت هر متر ویلا در رامسر", "وام ۲ میلیارد ۱۰ ساله"]);
    }
    setTimeout(() => $("#aiInput").focus(), 50);
  }
  $("#aiFab").onclick = openAI;
  $("#aiClose").onclick = () => { $("#ai").hidden = true; $("#aiFab").classList.remove("is-hidden"); };
  $("#aiSugs").onclick = (e) => { const b = e.target.closest("button"); if (b) { $("#aiInput").value = b.textContent; $("#aiForm").requestSubmit(); } };
  $("#aiForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#aiInput").value.trim(); if (!v) return;
    aiSay(esc(v), "me"); $("#aiInput").value = "";
    const t = aiTyping();
    setTimeout(() => { t.remove(); aiRespond(v); }, 500 + Math.random() * 400);
  });
  function miniList(ls) {
    return `<div class="mini">${ls.map((l) => `<button class="mini__i" data-open="${l.id}"><span class="mini__img">${sceneSVG(l)}</span><span><b>${esc(l.title)}</b><small>${pinLabel(l)} · ${fa(l.area)} متر</small></span></button>`).join("")}</div>`;
  }
  aiLog.addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); b && openDetail(b.dataset.open); });
  function aiRespond(v) {
    const it = NLP.intent(v);
    const { filters, tags } = NLP.parseQuery(v);
    if (it === "greet") { aiSay("درود! کدام شهر شمال را در نظر داری؟ بودجه و نوع ملک را هم بگو تا دقیق‌تر پیدا کنم."); aiSugs(PROVINCES.map((p) => "ویلا در " + p.name)); return; }
    if (it === "help") { aiSay("کافی است درخواستت را آزاد بنویسی. من شهر، نوع معامله (خرید، رهن و اجاره، روزانه)، نوع ملک، بودجه، متراژ، تعداد خواب و امکاناتی مثل دید دریا، استخر یا سند تک‌برگ را تشخیص می‌دهم و فیلترها را تنظیم می‌کنم."); return; }
    if (it === "post") { aiSay("برای فروش یا اجاره ملکت، فرم سه‌مرحله‌ای ثبت آگهی را باز می‌کنم. پس از وارد کردن متراژ و قیمت، قیمت هر متر تو را با میانه آگهی‌های مشابه مقایسه می‌کنم."); setTimeout(openPost, 900); return; }
    if (it === "loan") {
      const m = NLP.parseQuery(v).filters.max || 1e9;
      const yr = +(NLP.normalize(v).match(/(\d+)\s*سال/) || [])[1] || 5;
      const r = 0.23 / 12, n = yr * 12, pay = (m * r) / (1 - Math.pow(1 + r, -n));
      aiSay(`برای وام ${money(m)} تومان با نرخ ۲۳٪ و مدت ${fa(yr)} سال، قسط ماهانه حدود <b>${fa(Math.round(pay))} تومان</b> می‌شود (روش استهلاک یکنواخت). نرخ را می‌توانی در بخش ابزارها تغییر دهی.`);
      $("#lAmt").value = m.toLocaleString("en-US"); $("#lYears").value = Math.min(20, yr); $("#lAmt").dispatchEvent(new Event("input"));
      return;
    }
    if (it === "value") {
      const city = filters.city, type = filters.types[0] || "villa";
      if (!city) { aiSay("برای کدام شهر؟ مثلاً «قیمت هر متر آپارتمان در بابلسر»."); return; }
      const m = medianPPM(city, type), n = ALL.filter((l) => l.deal === "sale" && l.city === city && l.type === type).length;
      aiSay(m ? `میانه قیمت هر متر ${typeOf(type).name} در ${cityOf(city).name} بر اساس ${fa(n)} آگهی فروش سامانه حدود <b>${money(m)} تومان</b> است. (در نسخه نمایشی، این عدد از آگهی‌های نمونه محاسبه شده و مبنای تصمیم واقعی نیست.)`
        : `هنوز آگهی فروش ${typeOf(type).name} در ${cityOf(city).name} نداریم که میانه بگیرم.`);
      return;
    }
    if (it === "compare") { aiSay(compare.length >= 2 ? "جدول مقایسه را باز می‌کنم." : "روی گزینه «مقایسه» دو یا سه کارت بزن، سپس دکمه مقایسه در پایین صفحه را بفشار."); if (compare.length >= 2) $("#compareGo").click(); return; }

    // جست‌وجو
    S = { ...DEFAULT, view: S.view, ...filters }; render();
    let list = results();
    if (!tags.length) { aiSay("متوجه نشدم دنبال چه هستی. نام شهر، نوع ملک یا بودجه را بنویس؛ مثلاً «سوئیت در بابلسر برای آخر هفته»."); return; }
    const relaxed = relaxIfEmpty(); list = relaxed.list; const relax = relaxed.relax;
    if (!list.length) { aiSay("با این مشخصات چیزی پیدا نشد. می‌خواهی بودجه یا شهر را تغییر دهیم؟"); return; }
    aiSay(`${tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join(" ")}<br/>${relax ? `مورد دقیقاً منطبقی نبود؛ قید «${relax}» را برداشتم و ` : ""}<b>${fa(list.length)}</b> آگهی پیدا کردم. فیلترها و نقشه به‌روز شدند. بهترین‌ها از نظر امتیاز تطابق:`);
    aiSay(miniList([...list].sort((a, b) => score(b) - score(a)).slice(0, 3)));
    aiSugs(["فقط تأییدشده‌ها", "ارزان‌ترین‌ها", "با استخر", "در کل استان"]);
    aiRespond.last = filters;
  }
  // پیشنهادهای پیگیر روی جست‌وجوی قبلی
  const _origRespond = aiRespond;
  function aiRefine(v) {
    const map2 = { "فقط تأییدشده‌ها": { verified: true }, "ارزان‌ترین‌ها": { sort: "cheap" }, "با استخر": { amenities: [...new Set([...S.amenities, "pool"])] }, "در کل استان": { city: "" } };
    if (!map2[v]) return false;
    set(map2[v]); const list = results();
    aiSay(list.length ? `${fa(list.length)} آگهی باقی ماند.` : "با این قید نتیجه‌ای نماند؛ آن را از برچسب‌های بالای نتایج حذف کن.");
    if (list.length) aiSay(miniList(list.slice(0, 3)));
    return true;
  }
  aiRespond = function (v) { if (!aiRefine(v)) _origRespond(v); }; // eslint-disable-line no-func-assign
  function aiAnswerAbout(l) {
    const c = cityOf(l.city), v = priceVerdict(l);
    aiSay(`<b>${esc(l.title)}</b><br/>${typeOf(l.type).name} ${fa(l.area)} متری در ${c.name} (${c.tags.join("، ")}). ${v ? `قیمت هر متر آن ${v.txt} است.` : ""} ${l.amenities.length ? "امکانات: " + l.amenities.map((a) => amenOf(a).name).join("، ") + "." : ""} پیشنهاد می‌کنم پیش از بازدید، وضعیت سند، کاربری و پروانه ساخت را استعلام کنی.`);
    aiSugs(["آگهی‌های مشابه ارزان‌تر", "قیمت هر متر " + typeOf(l.type).name + " در " + c.name]);
  }

  /* ---------- پوسته ---------- */
  function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  applyTheme(store.get("theme", ""));
  $("#themeBtn").onclick = () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const t = dark ? "light" : "dark"; applyTheme(t); store.set("theme", t);
  };

  /* ---------- پاورقی ---------- */
  $("#footProv").innerHTML = PROVINCES.map((p) => `<li><a href="#explore" data-prov="${p.id}">املاک ${p.name}</a></li>`).join("");
  $("#footProv").onclick = (e) => { const a = e.target.closest("[data-prov]"); a && set({ province: a.dataset.prov, city: "" }); };

  /* ---------- راه‌اندازی ---------- */
  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#smartInput").focus(); } });
  $("#favCount").textContent = fa(favs.size); $("#favCount").hidden = !favs.size;
  buildControls(); bindControls(); bindSmart(); bindTools(); renderStats(); renderCities(); initMap(); render();
  const deep = new URLSearchParams(location.hash.slice(1)).get("listing");
  if (deep) openDetail(deep);
})();
