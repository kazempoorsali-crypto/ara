/* پنل مدیریت آرا — فقط روی سرور محلی کار می‌کند */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fa = (n) => Number(n || 0).toLocaleString("fa-IR");
  const when = (t) => (t ? new Date(t * 1000).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : "—");
  const money = (v) => (!v ? "—" : v >= 1e9 ? fa(+(v / 1e9).toFixed(2)) + " میلیارد" : v >= 1e6 ? fa(Math.round(v / 1e6)) + " میلیون" : fa(v));
  let token = sessionStorage.getItem("ara-admin") || "";
  let S = null, tab = location.hash.slice(1) || "dash", timer = null;

  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("is-on"), 2800); }
  async function api(path, body) {
    const r = await fetch("api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-admin-token": token }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { token = ""; sessionStorage.removeItem("ara-admin"); login(); throw new Error("401"); }
    if (!r.ok) throw new Error(j.error || "خطا");
    return j;
  }

  /* ---------- ورود ---------- */
  async function login() {
    clearInterval(timer);
    let cfg;
    try { cfg = await (await fetch("api/config")).json(); }
    catch { $("#root").innerHTML = `<div class="login"><div class="panel" style="max-width:520px"><h2>پنل مدیریت فقط با سرور محلی کار می‌کند</h2><p class="muted">فایل <b>start-windows.bat</b> (ویندوز) یا <b>start-mac-linux.sh</b> را اجرا کنید؛ سپس نشانی <code>http://127.0.0.1:8000/admin.html</code> باز می‌شود.</p></div></div>`; return; }
    const setup = !cfg.admin_ready;
    $("#root").innerHTML = `<div class="login"><form id="lf">
      <div class="brand"><svg class="brand__mark" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#13201c"/><path d="M10 31c4.5-3.4 9-3.4 13.5 0s9 3.4 13.5 0" stroke="#7fc7a6" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M14 25l10-10 10 10" stroke="#fffdf9" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="13" r="3.4" fill="#df5a2c"/></svg><span class="brand__txt"><b>پنل مدیریت</b><small>${esc(cfg.site.name)}</small></span></div>
      <h2 style="font-size:20px">${setup ? "تعیین رمز مدیر" : "ورود"}</h2>
      ${setup ? '<p class="muted small">اولین ورود است. رمزی دست‌کم ۶ نویسه انتخاب کنید و آن را جایی نگه دارید.</p>' : ""}
      <input class="input" type="password" name="pw" placeholder="رمز" required minlength="6" autocomplete="${setup ? "new-password" : "current-password"}">
      ${setup ? '<input class="input" type="password" name="pw2" placeholder="تکرار رمز" required minlength="6" autocomplete="new-password">' : ""}
      <button class="btn btn--ink btn--lg">${setup ? "ذخیره و ورود" : "ورود"}</button>
      <a class="btn btn--ghost" href="./">بازگشت به سایت</a>
    </form></div>`;
    $("#lf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      if (setup && f.pw.value !== f.pw2.value) { toast("رمزها یکسان نیستند"); return; }
      try {
        const r = await fetch("api/admin/" + (setup ? "setup" : "login"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: f.pw.value }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        token = j.token; sessionStorage.setItem("ara-admin", token); load();
      } catch (err) { toast(err.message || "ورود ناموفق"); }
    });
  }

  /* ---------- اسکلت ---------- */
  const TABS = [["dash", "داشبورد"], ["ingest", "دریافت از دیوار"], ["leads", "درخواست مشتریان"], ["site", "اطلاعات تماس"], ["pay", "پرداخت و خدمات"], ["listings", "آگهی‌ها"], ["own", "ثبت آگهی خودم"], ["security", "رمز عبور"]];
  async function load() {
    try { S = await api("admin/state"); } catch (e) { if (e.message !== "401") toast(e.message); return; }
    const newLeads = S.leads.filter((l) => l.status === "new").length;
    $("#root").innerHTML = `<div class="adm">
      <aside class="side">
        <a class="brand" href="./" target="_blank"><svg class="brand__mark" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#fffdf9" fill-opacity=".08"/><path d="M10 31c4.5-3.4 9-3.4 13.5 0s9 3.4 13.5 0" stroke="#7fc7a6" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M14 25l10-10 10 10" stroke="#fffdf9" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="13" r="3.4" fill="#df5a2c"/></svg><span class="brand__txt"><b>${esc(S.site.name)}</b><small>پنل مدیریت</small></span></a>
        ${TABS.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}${k === "leads" && newLeads ? `<span class="badge">${fa(newLeads)}</span>` : ""}</button>`).join("")}
        <div class="side__foot"><a href="./" target="_blank">مشاهده سایت ↗</a><a href="#" id="logout">خروج</a></div>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
    $$(".side [data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; location.hash = tab; load(); }));
    $("#logout").addEventListener("click", (e) => { e.preventDefault(); token = ""; sessionStorage.removeItem("ara-admin"); login(); });
    ({ dash, ingest, leads, site, pay, listings, own, security }[tab] || dash)();
    clearInterval(timer);
    if (tab === "dash" || tab === "ingest") timer = setInterval(refreshLive, 15000);
  }
  async function refreshLive() {
    if (document.hidden || document.activeElement?.matches("input,select,textarea")) return;
    try { S = await api("admin/state"); ({ dash, ingest }[tab])?.(); } catch { /* سکوت */ }
  }
  const main = () => $("#main");
  const statusLine = () => {
    const st = S.status, cfg = S.ingest;
    const cls = st.error ? "err" : cfg.enabled ? "on" : "";
    const next = st.next_at ? Math.max(0, st.next_at - Date.now() / 1000) : null;
    return `<div class="status ${cls}"><i></i><b>${cfg.enabled ? (st.error ? "خطا در دریافت" : "دریافت فعال است") : "دریافت خاموش است"}</b>
      <span class="muted">${st.error ? esc(st.error) : st.last ? "آخرین کار: " + esc(st.last) + " · " + when(st.last_at) : ""}</span>
      ${cfg.enabled && next != null && !st.error ? `<span class="muted">نوبت بعد: ${fa(Math.round(next))} ثانیه دیگر</span>` : ""}</div>`;
  };

  /* ---------- داشبورد ---------- */
  function dash() {
    const st = S.stats, cfg = S.ingest;
    const missing = [];
    if (!S.site.phone) missing.push("شماره تماس");
    if (!S.payment.card && !S.payment.sheba) missing.push("شماره کارت یا شبا");
    main().innerHTML = `<h1>داشبورد</h1><p class="muted">نمای کلی سایت و موتور دریافت آگهی</p>
      ${missing.length ? `<div class="note" style="margin-bottom:18px">برای شروع: ${missing.join(" و ")} را در بخش‌های «اطلاعات تماس» و «پرداخت و خدمات» وارد کنید.</div>` : ""}
      <div class="kpis">
        <div><b>${fa(st.total)}</b><span>آگهی فعال</span></div>
        <div><b>${fa(st.estate)}</b><span>ملک</span></div>
        <div><b>${fa(st.car)}</b><span>خودرو</span></div>
        <div><b>${fa(st.today)}</b><span>جدید در ۲۴ ساعت</span></div>
        <div><b>${fa(st.detailed)}</b><span>دارای جزئیات کامل</span></div>
        <div><b>${fa(S.pending_details)}</b><span>در صف جزئیات</span></div>
        <div><b>${fa(S.hour)} / ${fa(cfg.hourly_limit)}</b><span>درخواست در ساعت گذشته</span></div>
        <div><b>${fa(S.leads.filter((l) => l.status === "new").length)}</b><span>درخواست مشتری جدید</span></div>
      </div>
      <div class="panel"><h2>وضعیت دریافت <button class="btn btn--line btn--sm" data-go="ingest">تنظیمات دریافت</button></h2>${statusLine()}
        <p class="hint">با سقف ${fa(cfg.hourly_limit)} درخواست در ساعت، هر ${fa(Math.round(3600 / cfg.hourly_limit))} ثانیه یک درخواست به دیوار ارسال می‌شود. هر درخواست فهرست تا ۲۴ تا ۳۰ آگهی خلاصه، و هر درخواست جزئیات یک آگهی کامل (عکس‌ها، متراژ، توضیحات) می‌آورد.</p></div>
      <div class="panel"><h2>آخرین رویدادها</h2><div class="tbl-scroll"><table class="tbl"><thead><tr><th>زمان</th><th>نوع</th><th>نتیجه</th><th>شرح</th></tr></thead><tbody>
        ${S.log.slice(0, 20).map((r) => `<tr><td>${when(r.at)}</td><td>${{ search: "فهرست", detail: "جزئیات", test: "آزمون", discover: "کشف شناسه" }[r.kind] || r.kind}</td><td class="${r.ok ? "ok" : "bad"}">${r.ok ? "موفق" : "خطا"}</td><td>${esc(r.note)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">هنوز درخواستی ارسال نشده است.</td></tr>'}
      </tbody></table></div></div>`;
    $$("[data-go]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.go; location.hash = tab; load(); }));
  }

  /* ---------- دریافت ---------- */
  function ingest() {
    const cfg = S.ingest, cat = S.catalog;
    const totalFeeds = S.feeds.length;
    main().innerHTML = `<h1>دریافت تدریجی از دیوار</h1><p class="muted">آگهی‌های شهرهای انتخابی با سقف درخواست ساعتی، به‌تدریج و پیوسته دریافت می‌شوند و با خاموش و روشن شدن رایانه از همان‌جا ادامه می‌یابند.</p>
      ${statusLine()}<br>
      <form id="ingForm">
      <div class="panel"><h2>روشن / خاموش</h2>
        <label class="switch"><input type="checkbox" name="enabled" ${cfg.enabled ? "checked" : ""}><i></i>دریافت خودکار آگهی</label>
        <p class="hint">تا وقتی این برنامه روی رایانه باز است، دریافت ادامه دارد. بستن پنجره سیاه سرور، دریافت را متوقف می‌کند.</p></div>
      <div class="panel"><h2>منبع و سرعت</h2>
        <div class="grid2">
          <label class="field"><span>روش اتصال</span><select class="select" name="mode">
            <option value="mcp" ${cfg.mode === "mcp" ? "selected" : ""}>سرور MCP دیوار (پیشنهادی)</option>
            <option value="direct" ${cfg.mode === "direct" ? "selected" : ""}>اتصال مستقیم به API دیوار</option></select>
            <span class="hint">MCP: سرور عمومی divar-mcp (بدون کلید؛ سقف خود سرور ۲۰ درخواست در دقیقه). مستقیم: همان نقاط پایانی وب دیوار؛ به شناسه عددی شهر نیاز دارد.</span></label>
          <label class="field"><span>نشانی سرور MCP</span><input class="input input--ltr" name="mcp_url" value="${esc(cfg.mcp_url)}" placeholder="https://divar-mcp.mmdju2.workers.dev/mcp"><span class="hint">خالی بماند تا نشانی پیش‌فرض استفاده شود.</span></label>
          <label class="field"><span>سقف درخواست در ساعت</span><input class="input" name="hourly_limit" type="number" min="1" max="1200" value="${cfg.hourly_limit}"><span class="hint">پیش‌فرض ۶۰ (یک درخواست در دقیقه). اگر خطای «تعداد درخواست زیاد» دیدید، کمترش کنید.</span></label>
          <label class="field"><span>تازه‌سازی صفحه اول هر فهرست (ساعت)</span><input class="input" name="refresh_hours" type="number" min="1" max="72" value="${cfg.refresh_hours}"><span class="hint">برای گرفتن آگهی‌های تازه و تغییر قیمت‌ها.</span></label>
          <label class="field"><span>تعداد جزئیات به ازای هر صفحه فهرست</span><input class="input" name="detail_ratio" type="number" min="0" max="30" value="${cfg.detail_ratio}"><span class="hint">بیشتر = عکس و مشخصات کامل‌تر؛ کمتر = پوشش سریع‌تر تعداد آگهی.</span></label>
          <label class="field"><span>بازبینی آگهی‌های قدیمی (روز)</span><input class="input" name="recheck_days" type="number" min="1" max="60" value="${cfg.recheck_days}"><span class="hint">برای تشخیص آگهی‌های حذف‌شده.</span></label>
        </div></div>
      <div class="panel"><h2>دسته‌ها</h2><div class="checks">${cat.categories.map((c) => `<label><input type="checkbox" name="cat" value="${c.slug}" ${cfg.categories.includes(c.slug) ? "checked" : ""}><span>${c.name}</span></label>`).join("")}</div>
        <p class="hint">«همه املاک» و «خودرو سواری و وانت» کل بازار را پوشش می‌دهند؛ زیردسته‌ها فقط برای تمرکز بیشتر هستند.</p></div>
      <div class="panel"><h2>شهرها <span><button type="button" class="btn btn--ghost btn--sm" id="allC">همه</button><button type="button" class="btn btn--ghost btn--sm" id="noneC">هیچ‌کدام</button></span></h2>
        ${Object.entries(cat.provinces).map(([pid, p]) => `<p style="font-weight:800;margin:10px 0 8px">${p.name}</p><div class="checks">${cat.cities.filter((c) => c.province === pid).map((c) => `<label><input type="checkbox" name="city" value="${c.key}" ${cfg.cities.includes(c.key) ? "checked" : ""}><span>${c.name}${cfg.mode === "direct" && !S.city_ids[c.key] ? " ⚠" : ""}</span></label>`).join("")}</div>`).join("")}
        <p class="hint">با ${fa(cfg.cities.length)} شهر × ${fa(cfg.categories.length)} دسته = ${fa(cfg.cities.length * cfg.categories.length)} فهرست. شهرهای پرآگهی (رشت، ساری، گرگان) چند روز طول می‌کشند تا کامل شوند.</p></div>
      ${cfg.mode === "direct" ? `<div class="panel"><h2>شناسه عددی شهرها در دیوار <button type="button" class="btn btn--line btn--sm" id="discover">کشف خودکار شناسه‌ها</button></h2>
        <p class="hint" style="margin-bottom:12px">فقط برای حالت اتصال مستقیم. شناسه رشت (۱۲)، گرگان (۲۱) و ساری (۲۲) معلوم است. کشف خودکار شناسه‌ها هر ۲٫۵ ثانیه یک شناسه را بررسی می‌کند (حدود یک ساعت). ${S.status.discover ? "<b>" + esc(S.status.discover) + "</b>" : ""}</p>
        <div class="grid3">${cat.cities.map((c) => `<label class="field"><span>${c.name}</span><input class="input" name="cid_${c.key}" inputmode="numeric" value="${S.city_ids[c.key] || ""}" ${c.divar_id ? "readonly" : ""}></label>`).join("")}</div></div>` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px"><button class="btn btn--hot btn--lg">ذخیره تنظیمات</button><button type="button" class="btn btn--line btn--lg" id="test">آزمون اتصال</button></div>
      </form>
      <div class="panel" id="testOut" hidden></div>
      <div class="panel"><h2>پیشرفت هر فهرست <button class="btn btn--ghost btn--sm" id="resetFeeds">شروع دوباره همه فهرست‌ها</button></h2>
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>شهر</th><th>دسته</th><th>صفحه</th><th>آگهی جدید</th><th>وضعیت</th><th>آخرین تازه‌سازی</th></tr></thead><tbody>
        ${S.feeds.map((f) => { const c = cat.cities.find((x) => x.key === f.city_key); return `<tr><td>${c ? c.name : f.city_key}</td><td>${(cat.categories.find((x) => x.slug === f.category) || {}).name || f.category}</td><td>${fa(f.pages_done)}</td><td>${fa(f.items)}</td><td>${f.last_error ? `<span class="bad">${esc(f.last_error.slice(0, 60))}</span>` : f.has_next ? (f.pages_done ? "در حال پیمایش" : "در صف") : '<span class="ok">کامل</span>'}</td><td>${when(f.last_page1)}</td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">پس از روشن کردن دریافت، ${fa(totalFeeds || cfg.cities.length * cfg.categories.length)} فهرست ساخته می‌شود.</td></tr>`}
        </tbody></table></div></div>`;
    const form = $("#ingForm");
    $("#allC").addEventListener("click", () => $$("[name=city]", form).forEach((i) => (i.checked = true)));
    $("#noneC").addEventListener("click", () => $$("[name=city]", form).forEach((i) => (i.checked = false)));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {
        enabled: form.enabled.checked, mode: form.mode.value, mcp_url: form.mcp_url.value.trim(),
        hourly_limit: +form.hourly_limit.value, refresh_hours: +form.refresh_hours.value, detail_ratio: +form.detail_ratio.value, recheck_days: +form.recheck_days.value,
        categories: $$("[name=cat]:checked", form).map((i) => i.value), cities: $$("[name=city]:checked", form).map((i) => i.value),
      };
      if (!body.cities.length || !body.categories.length) { toast("دست‌کم یک شهر و یک دسته انتخاب کنید"); return; }
      const ids = {};
      $$("[name^=cid_]", form).forEach((i) => { if (i.value.trim()) ids[i.name.slice(4)] = i.value.trim().replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)); });
      if (Object.keys(ids).length) body.city_ids = ids;
      try { await api("admin/ingest", body); toast("ذخیره شد"); load(); } catch (err) { toast(err.message); }
    });
    form.mode.addEventListener("change", async () => { await api("admin/ingest", { mode: form.mode.value }); load(); });
    $("#test").addEventListener("click", async (e) => {
      const b = e.target; b.disabled = true; b.textContent = "در حال آزمون…";
      try {
        const r = await api("admin/test", {});
        const out = $("#testOut"); out.hidden = false;
        out.innerHTML = r.ok ? `<h2 class="ok">اتصال برقرار است (${fa(r.ms)} میلی‌ثانیه)</h2><p>${fa(r.count)} آگهی در صفحه اول دریافت شد. نمونه:</p><ul>${r.sample.map((s) => `<li>${esc(s.title)} — ${money(s.price || s.deposit)}</li>`).join("")}</ul><pre class="raw">${esc(JSON.stringify(r.info, null, 1))}</pre>`
          : `<h2 class="bad">اتصال برقرار نشد</h2><pre class="raw">${esc(r.error)}</pre><p class="hint">اگر از خارج ایران یا با فیلترشکن خاص وصل هستید، روش دیگر (MCP یا مستقیم) را امتحان کنید. متن خطا را برای پشتیبانی بفرستید.</p>`;
      } catch (err) { toast(err.message); }
      b.disabled = false; b.textContent = "آزمون اتصال";
    });
    $("#discover")?.addEventListener("click", async () => { await api("admin/discover", {}); toast("کشف شناسه‌ها آغاز شد"); setTimeout(load, 1500); });
    $("#resetFeeds").addEventListener("click", async () => { if (!confirm("پیمایش همه فهرست‌ها از صفحه اول شروع شود؟ آگهی‌های ذخیره‌شده حذف نمی‌شوند.")) return; await api("admin/reset-feeds", {}); load(); });
  }

  /* ---------- درخواست‌ها ---------- */
  function leads() {
    const kinds = { visit: "بازدید", consign: "سپردن", advice: "مشاوره", contact: "تماس" };
    main().innerHTML = `<h1>درخواست مشتریان</h1><p class="muted">درخواست‌های بازدید، مشاوره و سپردن ملک یا خودرو</p>
      <div class="panel"><h2>${fa(S.leads.length)} درخواست <a class="btn btn--line btn--sm" href="#" id="csv">خروجی اکسل (CSV)</a></h2>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>زمان</th><th>نام</th><th>موبایل</th><th>نوع</th><th>پیام</th><th>وضعیت</th></tr></thead><tbody>
      ${S.leads.map((l) => `<tr><td>${when(l.at)}</td><td>${esc(l.name)}</td><td><a href="tel:${esc(l.phone)}" style="direction:ltr;display:inline-block;font-weight:700">${esc(l.phone)}</a></td><td>${kinds[l.kind] || esc(l.kind)}</td><td>${esc(l.message)}${l.listing_id ? `<br><a class="small" style="color:var(--narenj-2)" href="./#/ad/${encodeURIComponent(l.listing_id)}" target="_blank">مشاهده آگهی</a>` : ""}</td>
        <td><select class="select" data-lead="${l.id}" style="min-height:36px">${[["new", "جدید"], ["called", "تماس گرفته شد"], ["done", "انجام شد"], ["lost", "منصرف"]].map(([v, n]) => `<option value="${v}" ${l.status === v ? "selected" : ""}>${n}</option>`).join("")}</select></td></tr>`).join("") || '<tr><td colspan="6" class="muted">هنوز درخواستی ثبت نشده است.</td></tr>'}
      </tbody></table></div></div>`;
    $$("[data-lead]").forEach((s) => s.addEventListener("change", async () => { await api("admin/lead", { id: +s.dataset.lead, status: s.value }); toast("به‌روز شد"); }));
    $("#csv").addEventListener("click", async (e) => {
      e.preventDefault();
      const r = await fetch("api/admin/leads.csv", { headers: { "x-admin-token": token } });
      const blob = await r.blob(); const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "leads.csv"; a.click();
    });
  }

  /* ---------- اطلاعات تماس ---------- */
  function site() {
    const s = S.site;
    const f = (k, label, hint = "", ltr = false, type = "text") => `<label class="field"><span>${label}</span><input class="input ${ltr ? "input--ltr" : ""}" name="${k}" type="${type}" value="${esc(s[k])}">${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
    main().innerHTML = `<h1>اطلاعات تماس و معرفی</h1><p class="muted">این اطلاعات روی همه صفحه‌ها، دکمه‌های تماس و فرم‌ها نمایش داده می‌شود.</p>
      <form id="sf"><div class="panel"><h2>نام و معرفی</h2><div class="grid2">
        ${f("name", "نام سایت / برند")}${f("tagline", "شعار کوتاه")}${f("owner_name", "نام مشاور یا دفتر", "روی کارت تماس صفحه هر آگهی")}${f("hours", "ساعت پاسخ‌گویی")}
      </div><label class="field" style="margin-top:14px"><span>درباره ما</span><textarea class="textarea" name="about">${esc(s.about)}</textarea></label></div>
      <div class="panel"><h2>راه‌های تماس</h2><div class="grid2">
        ${f("phone", "شماره تماس اصلی", "دکمه «تماس» در همه صفحه‌ها", true, "tel")}${f("whatsapp", "شماره واتس‌اپ", "اگر خالی بماند، شماره اصلی استفاده می‌شود", true, "tel")}
        ${f("telegram", "نام کاربری تلگرام", "بدون @", true)}${f("instagram", "اینستاگرام", "بدون @", true)}
        ${f("email", "ایمیل", "", true, "email")}${f("address", "نشانی دفتر")}
      </div></div>
      <div class="panel"><h2>تنظیمات نمایش</h2><label class="switch"><input type="checkbox" id="showSamples" ${S.display.show_samples ? "checked" : ""}><i></i>نمایش آگهی‌های نمونه تا وقتی آگهی واقعی دریافت نشده</label></div>
      <button class="btn btn--hot btn--lg">ذخیره</button></form>`;
    $("#sf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try { await api("admin/settings", { site: data, display: { show_samples: $("#showSamples").checked } }); toast("ذخیره شد"); S = await api("admin/state"); } catch (err) { toast(err.message); }
    });
  }

  /* ---------- پرداخت ---------- */
  function pay() {
    const p = S.payment;
    const svcRow = (x = {}) => `<div class="svc-row"><input class="input" placeholder="عنوان خدمت" value="${esc(x.title || "")}" data-k="title"><input class="input" placeholder="تعرفه" value="${esc(x.price || "")}" data-k="price"><input class="input" placeholder="توضیح" value="${esc(x.desc || "")}" data-k="desc"><button type="button" class="btn btn--ghost" data-rm>حذف</button></div>`;
    main().innerHTML = `<h1>پرداخت و خدمات</h1><p class="muted">در صفحه «خدمات و پرداخت» سایت نمایش داده می‌شود؛ بازدیدکننده می‌تواند شماره‌ها را کپی کند.</p>
      <form id="pf"><div class="panel"><h2>اطلاعات حساب</h2><div class="grid2">
        <label class="field"><span>شماره کارت</span><input class="input input--ltr" name="card" inputmode="numeric" value="${esc(p.card)}" placeholder="6037 9900 0000 0000"></label>
        <label class="field"><span>شماره شبا</span><input class="input input--ltr" name="sheba" value="${esc(p.sheba)}" placeholder="IR00 0000 0000 0000 0000 0000 00"></label>
        <label class="field"><span>نام صاحب حساب</span><input class="input" name="holder" value="${esc(p.holder)}"></label>
        <label class="field"><span>نام بانک</span><input class="input" name="bank" value="${esc(p.bank)}"></label>
      </div><label class="field" style="margin-top:14px"><span>یادداشت پرداخت</span><input class="input" name="note" value="${esc(p.note)}" placeholder="مثلاً: پیش از واریز با مشاور هماهنگ کنید"></label>
      <p class="hint">برای امنیت، فقط شماره کارت و شبا را وارد کنید؛ رمز، CVV2 یا تاریخ انقضا را هرگز اینجا ننویسید. درگاه پرداخت آنلاین (مثل زرین‌پال) در مرحله بعد قابل افزودن است.</p></div>
      <div class="panel"><h2>تعرفه خدمات <button type="button" class="btn btn--line btn--sm" id="addSvc">افزودن خدمت</button></h2><div id="svcs">${(p.services || []).map(svcRow).join("")}</div>
        <p class="hint">مثال: «کارشناسی و بازدید» — «۵۰۰ هزار تومان». هیچ تعرفه‌ای از پیش تعیین نشده است.</p></div>
      <button class="btn btn--hot btn--lg">ذخیره</button></form>`;
    $("#addSvc").addEventListener("click", () => $("#svcs").insertAdjacentHTML("beforeend", svcRow()));
    $("#svcs").addEventListener("click", (e) => { if (e.target.closest("[data-rm]")) e.target.closest(".svc-row").remove(); });
    $("#pf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const card = f.card.value.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/\D/g, "");
      if (card && card.length !== 16) { toast("شماره کارت باید ۱۶ رقم باشد"); return; }
      const sheba = f.sheba.value.toUpperCase().replace(/\s/g, "");
      if (sheba && !/^IR\d{24}$/.test(sheba)) { toast("شبا باید با IR و ۲۴ رقم باشد"); return; }
      const services = $$("#svcs .svc-row").map((r) => Object.fromEntries($$("[data-k]", r).map((i) => [i.dataset.k, i.value.trim()]))).filter((x) => x.title);
      try { await api("admin/settings", { payment: { card, sheba, holder: f.holder.value, bank: f.bank.value, note: f.note.value, services } }); toast("ذخیره شد"); S = await api("admin/state"); } catch (err) { toast(err.message); }
    });
  }

  /* ---------- آگهی‌ها ---------- */
  async function listings(q = "") {
    const r = await api("admin/listings?q=" + encodeURIComponent(q));
    main().innerHTML = `<h1>آگهی‌ها</h1><p class="muted">پنهان کردن آگهی نامناسب یا ویژه کردن آگهی‌های مهم (در صدر فهرست)</p>
      <div class="panel"><form id="lq" style="display:flex;gap:8px;margin-bottom:14px"><input class="input" name="q" value="${esc(q)}" placeholder="جست‌وجو در عنوان یا کد"><button class="btn btn--ink">جست‌وجو</button></form>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>عنوان</th><th>شهر</th><th>قیمت</th><th>منبع</th><th>ثبت</th><th>ویژه</th><th>پنهان</th></tr></thead><tbody>
      ${r.items.map((l) => `<tr><td><a href="./#/ad/${encodeURIComponent(l.id)}" target="_blank">${esc(l.title)}</a>${l.status === "removed" ? ' <span class="bad small">(حذف‌شده در منبع)</span>' : ""}</td><td>${esc(l.city_name)}</td><td>${money(l.pp)}</td><td>${l.source === "divar" ? `<a href="${esc(l.url)}" target="_blank">دیوار</a>` : l.source === "owner" ? "آگهی خودم" : esc(l.source)}</td><td>${when(l.first_seen)}</td>
        <td><input type="checkbox" data-f="featured" data-id="${esc(l.id)}" ${l.featured ? "checked" : ""}></td><td><input type="checkbox" data-f="hidden" data-id="${esc(l.id)}" ${l.hidden ? "checked" : ""}></td></tr>`).join("") || '<tr><td colspan="7" class="muted">آگهی‌ای نیست.</td></tr>'}
      </tbody></table></div></div>`;
    $("#lq").addEventListener("submit", (e) => { e.preventDefault(); listings(e.target.q.value); });
    $$("[data-f]").forEach((c) => c.addEventListener("change", async () => { await api("admin/listing", { id: c.dataset.id, [c.dataset.f]: c.checked }); toast("ذخیره شد"); }));
  }

  /* ---------- ثبت آگهی خودم ---------- */
  function own() {
    const cat = S.catalog;
    main().innerHTML = `<h1>ثبت آگهی اختصاصی</h1><p class="muted">ملک یا خودرویی که مستقیماً به شما سپرده شده؛ با نشان «ویژه» در صدر نتایج نمایش داده می‌شود.</p>
      <form id="of" class="panel"><div class="grid3">
        <label class="field"><span>نوع</span><select class="select" name="vertical"><option value="estate">ملک</option><option value="car">خودرو</option></select></label>
        <label class="field"><span>شهر</span><select class="select" name="city_key">${cat.cities.map((c) => `<option value="${c.key}">${c.name}</option>`).join("")}</select></label>
        <label class="field"><span>محله</span><input class="input" name="district"></label>
        <label class="field" data-v="estate"><span>نوع ملک</span><select class="select" name="kind">${[["apartment", "آپارتمان"], ["villa", "ویلا"], ["land", "زمین"], ["garden", "باغ"], ["suite", "سوئیت"], ["shop", "مغازه"], ["office", "اداری"]].map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></label>
        <label class="field" data-v="estate"><span>معامله</span><select class="select" name="deal"><option value="sale">فروش</option><option value="rent">رهن و اجاره</option><option value="daily">اجاره روزانه</option></select></label>
        <label class="field"><span>قیمت کل / هر شب (تومان)</span><input class="input input--ltr" name="price" inputmode="numeric"></label>
        <label class="field" data-v="estate"><span>ودیعه (تومان)</span><input class="input input--ltr" name="deposit" inputmode="numeric"></label>
        <label class="field" data-v="estate"><span>اجاره ماهانه (تومان)</span><input class="input input--ltr" name="rent" inputmode="numeric"></label>
        <label class="field" data-v="estate"><span>متراژ</span><input class="input" name="area" inputmode="numeric"></label>
        <label class="field" data-v="estate"><span>اتاق</span><input class="input" name="rooms" inputmode="numeric"></label>
        <label class="field"><span>سال ساخت / تولید</span><input class="input" name="year" inputmode="numeric" placeholder="۱۴۰۰"></label>
        <label class="field" data-v="car" hidden><span>برند و مدل</span><input class="input" name="brand"></label>
        <label class="field" data-v="car" hidden><span>کارکرد (کیلومتر)</span><input class="input" name="mileage" inputmode="numeric"></label>
        <label class="field" data-v="car" hidden><span>گیربکس</span><select class="select" name="gearbox"><option>دنده‌ای</option><option>اتوماتیک</option></select></label>
      </div>
      <label class="field" style="margin-top:14px"><span>عنوان</span><input class="input" name="title" required maxlength="120"></label>
      <label class="field" style="margin-top:14px"><span>توضیحات</span><textarea class="textarea" name="description"></textarea></label>
      <label class="field" style="margin-top:14px"><span>نشانی عکس‌ها (هر خط یک نشانی)</span><textarea class="textarea input--ltr" name="images" placeholder="https://..."></textarea><span class="hint">عکس را در هر سرویس میزبانی تصویر بارگذاری و نشانی آن را اینجا بگذارید.</span></label>
      <div data-v="estate" style="margin-top:14px"><span style="font-size:13px;font-weight:700;color:var(--ink-2)">امکانات</span><div class="checks" style="margin-top:8px">${[["seaview", "دید دریا"], ["forest", "جنگلی"], ["pool", "استخر"], ["jacuzzi", "جکوزی"], ["parking", "پارکینگ"], ["elevator", "آسانسور"], ["warehouse", "انباری"], ["balcony", "بالکن"], ["gated", "شهرکی"], ["deed", "سند تک‌برگ"], ["furnished", "مبله"], ["barbecue", "آلاچیق"], ["mountain", "دید کوهستان"]].map(([v, n]) => `<label><input type="checkbox" name="am" value="${v}"><span>${n}</span></label>`).join("")}</div></div>
      <button class="btn btn--hot btn--lg" style="margin-top:18px">انتشار آگهی</button></form>`;
    const form = $("#of");
    const sync = () => $$("[data-v]", form).forEach((el) => (el.hidden = el.dataset.v !== form.vertical.value));
    form.vertical.addEventListener("change", sync); sync();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      d.images = (d.images || "").split(/\s+/).filter((u) => /^https?:\/\//.test(u));
      d.amenities = $$("[name=am]:checked", form).map((i) => i.value);
      if (d.vertical === "car") { d.kind = "car"; d.deal = "sale"; }
      try { const r = await api("admin/own-listing", d); toast("منتشر شد"); window.open("./#/ad/" + r.id, "_blank"); form.reset(); sync(); } catch (err) { toast(err.message); }
    });
  }

  /* ---------- رمز ---------- */
  function security() {
    main().innerHTML = `<h1>رمز عبور</h1><p class="muted">رمز ورود به این پنل</p>
      <form id="pw" class="panel" style="max-width:460px;display:grid;gap:12px"><input class="input" type="password" name="a" placeholder="رمز جدید" minlength="6" required autocomplete="new-password"><input class="input" type="password" name="b" placeholder="تکرار رمز جدید" minlength="6" required autocomplete="new-password"><button class="btn btn--ink">تغییر رمز</button></form>`;
    $("#pw").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (e.target.a.value !== e.target.b.value) { toast("رمزها یکسان نیستند"); return; }
      try { await api("admin/settings", { new_password: e.target.a.value }); toast("رمز تغییر کرد"); e.target.reset(); } catch (err) { toast(err.message); }
    });
  }

  token ? load() : login();
})();
