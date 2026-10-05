/* پنل مدیریت فرصت‌یاب — فقط روی سرور کار می‌کند */
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
  const TABS = [["dash", "داشبورد"], ["ingest", "دریافت آگهی‌ها"], ["valuation", "ارزش‌گذاری و امتیاز"], ["excluded", "آگهی‌های کنارگذاشته"], ["users", "کاربران و پرداخت‌ها"], ["billing", "اشتراک، درگاه و پیامک"], ["site", "تنظیمات سایت"], ["security", "رمز عبور"]];
  async function load() {
    try { S = await api("admin/state"); } catch (e) { if (e.message !== "401") toast(e.message); return; }
    $("#root").innerHTML = `<div class="adm">
      <aside class="side">
        <a class="brand" href="./" target="_blank"><svg class="brand__mark" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#fffdf9" fill-opacity=".08"/><path d="M10 31c4.5-3.4 9-3.4 13.5 0s9 3.4 13.5 0" stroke="#7fc7a6" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M14 25l10-10 10 10" stroke="#fffdf9" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="13" r="3.4" fill="#df5a2c"/></svg><span class="brand__txt"><b>${esc(S.site.name)}</b><small>پنل مدیریت</small></span></a>
        ${TABS.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? "is-on" : ""}">${n}${k === "excluded" && S.stats.excluded ? `<span class="badge">${fa(S.stats.excluded)}</span>` : ""}</button>`).join("")}
        <div class="side__foot"><a href="./" target="_blank">مشاهده سایت ↗</a><a href="#" id="logout">خروج</a></div>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
    $$(".side [data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; location.hash = tab; load(); }));
    $("#logout").addEventListener("click", (e) => { e.preventDefault(); token = ""; sessionStorage.removeItem("ara-admin"); login(); });
    ({ dash, ingest, valuation: valuationTab, excluded, users, billing, site, security }[tab] || dash)();
    clearInterval(timer);
    if (tab === "dash" || tab === "ingest" || tab === "valuation") timer = setInterval(refreshLive, 15000);
  }
  async function refreshLive() {
    if (document.hidden || document.activeElement?.matches("input,select,textarea")) return;
    try { S = await api("admin/state"); ({ dash, ingest, valuation: valuationTab }[tab])?.(); } catch { /* سکوت */ }
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
    if (!S.plans.length) missing.push("تعرفه اشتراک");
    if (!S.billing.merchant_id && !S.billing.card_number && !S.billing.test_mode) missing.push("درگاه پرداخت یا شمارهٔ کارت");
    if (!S.sms_live) missing.push("سامانه پیامک (فعلاً کد ورود روی صفحه نمایش داده می‌شود)");
    main().innerHTML = `<h1>داشبورد</h1><p class="muted">نمای کلی سایت و موتور دریافت آگهی</p>
      ${missing.length ? `<div class="note" style="margin-bottom:18px">برای شروع: ${missing.join("، ")} را در بخش «اشتراک، درگاه و پیامک» تنظیم کنید.</div>` : ""}
      <div class="kpis">
        <div><b>${fa(st.total)}</b><span>آگهی فعال</span></div>
        <div><b>${fa(st.today)}</b><span>جدید در ۲۴ ساعت</span></div>
        <div><b>${fa(st.detailed)}</b><span>دارای جزئیات کامل</span></div>
        <div><b>${fa(S.pending_details)}</b><span>در صف جزئیات</span></div>
        <div><b>${fa(S.hour)} / ${fa(cfg.hourly_limit)}</b><span>درخواست در ساعت گذشته</span></div>
        <div><b>${fa(st.ranked)}</b><span>آگهی دارای امتیاز</span></div>
        <div><b>${fa(st.excluded)}</b><span>کنارگذاشته (پرت، تکراری، ...)</span></div>
        <div><b>${fa(S.users.total)}</b><span>کاربر ثبت‌نام‌کرده</span></div>
        <div><b>${fa(S.users.active)}</b><span>اشتراک فعال</span></div>
      </div>
      <div class="panel"><h2>وضعیت دریافت <button class="btn btn--line btn--sm" data-go="ingest">تنظیمات دریافت</button></h2>${statusLine()}
        <p class="hint">با سقف ${fa(cfg.hourly_limit)} درخواست در ساعت، هر ${fa(Math.round(3600 / cfg.hourly_limit))} ثانیه یک درخواست به دیوار ارسال می‌شود. هر درخواست فهرست تا ۲۴ تا ۳۰ آگهی خلاصه، و هر درخواست جزئیات یک آگهی کامل (عکس‌ها، متراژ، توضیحات) می‌آورد.</p></div>
      <div class="panel"><h2>آخرین رویدادها</h2><div class="tbl-scroll"><table class="tbl"><thead><tr><th>زمان</th><th>نوع</th><th>نتیجه</th><th>شرح</th></tr></thead><tbody>
        ${S.log.slice(0, 20).map((r) => `<tr><td>${when(r.at)}</td><td>${{ search: "فهرست", detail: "جزئیات", test: "آزمون", discover: "کشف شناسه", sms: "پیامک" }[r.kind] || r.kind}</td><td class="${r.ok ? "ok" : "bad"}">${r.ok ? "موفق" : "خطا"}</td><td>${esc(r.note)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">هنوز درخواستی ارسال نشده است.</td></tr>'}
      </tbody></table></div></div>`;
    $$("[data-go]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.go; location.hash = tab; load(); }));
  }

  /* ---------- دریافت ---------- */
  function ingest() {
    const cfg = S.ingest, cat = S.catalog;
    const totalFeeds = S.feeds.length;
    main().innerHTML = `<h1>دریافت تدریجی آگهی‌ها (دیوار و شیپور)</h1>
      <div class="kpis"><div><b>${fa((S.by_source || {}).divar || 0)}</b><span>آگهی فعال از دیوار</span></div><div><b>${fa((S.by_source || {}).sheypoor || 0)}</b><span>آگهی فعال از شیپور</span></div></div><p class="muted">آگهی‌های شهرهای انتخابی با سقف درخواست ساعتی، به‌تدریج و پیوسته دریافت می‌شوند و با خاموش و روشن شدن رایانه از همان‌جا ادامه می‌یابند.</p>
      ${statusLine()}<br>
      <form id="ingForm">
      <div class="panel"><h2>روشن / خاموش</h2>
        <label class="switch"><input type="checkbox" name="enabled" ${cfg.enabled ? "checked" : ""}><i></i>دریافت خودکار آگهی</label>
        <p class="hint">تا وقتی این برنامه روی رایانه باز است، دریافت ادامه دارد. بستن پنجره سیاه سرور، دریافت را متوقف می‌کند.</p></div>
      <div class="panel"><h2>منبع و سرعت</h2>
        <div class="grid2">
          <label class="field"><span>روش اتصال</span><select class="select" name="mode">
            <option value="mcp" ${cfg.mode === "mcp" || cfg.mode === "auto" ? "selected" : ""}>خودکار: سرور MCP دیوار، و اگر سهمیه‌اش تمام شد یا نرسید اتصال مستقیم (پیشنهادی)</option>
            <option value="mcp_only" ${cfg.mode === "mcp_only" ? "selected" : ""}>فقط سرور MCP دیوار</option>
            <option value="direct" ${cfg.mode === "direct" ? "selected" : ""}>فقط اتصال مستقیم به API دیوار</option></select>
            <span class="hint">MCP: سرور عمومی divar-mcp (بدون کلید؛ سقف خود سرور ۲۰ درخواست در دقیقه). مستقیم: همان نقاط پایانی وب دیوار؛ به شناسه عددی شهر نیاز دارد.</span></label>
          <label class="field"><span>نشانی سرور MCP</span><input class="input input--ltr" name="mcp_url" value="${esc(cfg.mcp_url)}" placeholder="https://divar-mcp.mmdju2.workers.dev/mcp"><span class="hint">خالی بماند تا نشانی پیش‌فرض استفاده شود.</span></label>
          <label class="field"><span>پروکسی</span><select class="select" name="proxy_sel">
            <option value="auto" ${!cfg.proxy || cfg.proxy === "auto" ? "selected" : ""}>خودکار (پروکسی سیستم؛ اگر خاموش بود، بدون پروکسی)</option>
            <option value="none" ${cfg.proxy === "none" ? "selected" : ""}>بدون پروکسی</option>
            <option value="custom" ${cfg.proxy && !["auto", "none"].includes(cfg.proxy) ? "selected" : ""}>پروکسی دلخواه</option></select>
            <input class="input input--ltr" name="proxy_url" placeholder="http://127.0.0.1:10809" value="${cfg.proxy && !["auto", "none"].includes(cfg.proxy) ? esc(cfg.proxy) : ""}" style="margin-top:6px">
            <span class="hint">اگر فیلترشکن خاموش است ولی ویندوز هنوز پروکسی آن را دارد، «خودکار» یا «بدون پروکسی» مشکل را حل می‌کند.</span></label>
          <label class="field"><span>سقف درخواست در ساعت</span><input class="input" name="hourly_limit" type="number" min="1" max="1200" value="${cfg.hourly_limit}"><span class="hint">پیش‌فرض ۶۰ (یک درخواست در دقیقه). اگر خطای «تعداد درخواست زیاد» دیدید، کمترش کنید.</span></label>
          <label class="field"><span>تازه‌سازی صفحه اول هر فهرست (ساعت)</span><input class="input" name="refresh_hours" type="number" min="1" max="72" value="${cfg.refresh_hours}"><span class="hint">برای گرفتن آگهی‌های تازه و تغییر قیمت‌ها.</span></label>
          <label class="field"><span>تعداد جزئیات به ازای هر صفحه فهرست</span><input class="input" name="detail_ratio" type="number" min="0" max="30" value="${cfg.detail_ratio}"><span class="hint">بیشتر = عکس و مشخصات کامل‌تر؛ کمتر = پوشش سریع‌تر تعداد آگهی.</span></label>
          <label class="field"><span>بازبینی آگهی‌های قدیمی (روز)</span><input class="input" name="recheck_days" type="number" min="1" max="60" value="${cfg.recheck_days}"><span class="hint">برای تشخیص آگهی‌های حذف‌شده.</span></label>
        </div></div>
      <div class="panel"><h2>منبع دوم: شیپور</h2>
        <label class="switch"><input type="checkbox" name="sheypoor" ${cfg.sheypoor ? "checked" : ""}><i></i>دریافت آگهی‌های ملک شیپور در کنار دیوار</label>
        <div class="grid2" style="margin-top:12px">
          <label class="field"><span>روش اتصال شیپور</span><select class="select" name="sheypoor_mode">
            <option value="auto" ${!cfg.sheypoor_mode || cfg.sheypoor_mode === "auto" ? "selected" : ""}>خودکار: اول سرور MCP، اگر نرسید اتصال مستقیم (پیشنهادی)</option>
            <option value="mcp" ${cfg.sheypoor_mode === "mcp" ? "selected" : ""}>فقط سرور MCP شیپور</option>
            <option value="direct" ${cfg.sheypoor_mode === "direct" ? "selected" : ""}>فقط اتصال مستقیم به شیپور</option></select></label>
          <label class="field"><span>نشانی سرور MCP شیپور</span><input class="input input--ltr" name="sheypoor_url" value="${esc(cfg.sheypoor_url || "")}" placeholder="https://sheypoor-mcp.farhamaghdasi.workers.dev/"><span class="hint">خالی بماند تا نشانی عمومی sheypoor-mcp استفاده شود.</span></label></div>
        <p class="hint">سقف درخواست ساعتی بین دو منبع مشترک است. دسته‌های ملک و شهرهای شمال یک‌بار خودکار کشف می‌شوند. آگهی تکراری که در هر دو سایت آمده، با تطبیق شهر، متراژ و قیمت یک‌بار شمرده می‌شود. شیپور گاهی شمارهٔ آگهی‌دهنده را عمومی برمی‌گرداند؛ نمایش آن تابع تنظیم «اطلاعات تماس» در بخش تنظیمات سایت است.</p>
        <button type="button" class="btn btn--line" id="testSp" style="margin-top:10px">آزمون اتصال شیپور</button></div>
      <div class="panel"><h2>دسته‌های دیوار</h2><div class="checks">${cat.categories.map((c) => `<label><input type="checkbox" name="cat" value="${c.slug}" ${cfg.categories.includes(c.slug) ? "checked" : ""}><span>${c.name}</span></label>`).join("")}</div>
        <p class="hint">«همه املاک» کل بازار ملک را پوشش می‌دهد؛ زیردسته‌ها فقط برای تمرکز بیشتر هستند.</p></div>
      <div class="panel"><h2>شهرها <span><button type="button" class="btn btn--ghost btn--sm" id="allC">همه</button><button type="button" class="btn btn--ghost btn--sm" id="noneC">هیچ‌کدام</button></span></h2>
        ${Object.entries(cat.provinces).map(([pid, p]) => `<p style="font-weight:800;margin:10px 0 8px">${p.name}</p><div class="checks">${cat.cities.filter((c) => c.province === pid).map((c) => `<label><input type="checkbox" name="city" value="${c.key}" ${cfg.cities.includes(c.key) ? "checked" : ""}><span>${c.name}${cfg.mode === "direct" && !S.city_ids[c.key] ? " ⚠" : ""}</span></label>`).join("")}</div>`).join("")}
        <p class="hint">با ${fa(cfg.cities.length)} شهر × ${fa(cfg.categories.length)} دسته = ${fa(cfg.cities.length * cfg.categories.length)} فهرست. شهرهای پرآگهی (رشت، ساری، گرگان) چند روز طول می‌کشند تا کامل شوند.</p></div>
      ${cfg.mode !== "mcp_only" ? `<div class="panel"><h2>شناسه عددی شهرها در دیوار <button type="button" class="btn btn--line btn--sm" id="discover">کشف خودکار شناسه‌ها</button></h2>
        <p class="hint" style="margin-bottom:12px">فقط برای حالت اتصال مستقیم. شناسه رشت (۱۲)، گرگان (۲۱) و ساری (۲۲) معلوم است. کشف خودکار شناسه‌ها هر ۲٫۵ ثانیه یک شناسه را بررسی می‌کند (حدود یک ساعت). ${S.status.discover ? "<b>" + esc(S.status.discover) + "</b>" : ""}</p>
        <div class="grid3">${cat.cities.map((c) => `<label class="field"><span>${c.name}</span><input class="input" name="cid_${c.key}" inputmode="numeric" value="${S.city_ids[c.key] || ""}" ${c.divar_id ? "readonly" : ""}></label>`).join("")}</div></div>` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px"><button class="btn btn--hot btn--lg">ذخیره تنظیمات</button><button type="button" class="btn btn--line btn--lg" id="test">آزمون اتصال</button></div>
      </form>
      <div class="panel" id="testOut" hidden></div>
      <div class="panel"><h2>پیشرفت هر فهرست <button class="btn btn--ghost btn--sm" id="resetFeeds">شروع دوباره همه فهرست‌ها</button></h2>
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>شهر</th><th>دسته</th><th>صفحه</th><th>آگهی جدید</th><th>وضعیت</th><th>آخرین تازه‌سازی</th></tr></thead><tbody>
        ${S.feeds.map((f) => { const c = cat.cities.find((x) => x.key === f.city_key); return `<tr><td>${c ? c.name : f.city_key}</td><td>${f.category.startsWith("sheypoor:") ? "شیپور: " + esc(((S.sheypoor_cats || []).find((c) => "sheypoor:" + c.id === f.category) || {}).name || f.category.slice(9)) : "دیوار: " + ((cat.categories.find((x) => x.slug === f.category) || {}).name || f.category)}</td><td>${fa(f.pages_done)}</td><td>${fa(f.items)}</td><td>${f.last_error ? `<span class="bad">${esc(f.last_error.slice(0, 60))}</span>` : f.has_next ? (f.pages_done ? "در حال پیمایش" : "در صف") : '<span class="ok">کامل</span>'}</td><td>${when(f.last_page1)}</td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">پس از روشن کردن دریافت، ${fa(totalFeeds || cfg.cities.length * cfg.categories.length)} فهرست ساخته می‌شود.</td></tr>`}
        </tbody></table></div></div>`;
    const form = $("#ingForm");
    $("#allC").addEventListener("click", () => $$("[name=city]", form).forEach((i) => (i.checked = true)));
    $("#noneC").addEventListener("click", () => $$("[name=city]", form).forEach((i) => (i.checked = false)));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {
        enabled: form.enabled.checked, mode: form.mode.value, mcp_url: form.mcp_url.value.trim(),
        sheypoor: form.sheypoor.checked, sheypoor_url: form.sheypoor_url.value.trim(), sheypoor_mode: form.sheypoor_mode.value,
        proxy: form.proxy_sel.value === "custom" ? form.proxy_url.value.trim() : form.proxy_sel.value,
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
    const runTest = async (e, source) => {
      const b = e.target, label = b.textContent; b.disabled = true; b.textContent = "در حال آزمون…";
      try {
        const r = await api("admin/test", { source });
        const out = $("#testOut"); out.hidden = false;
        out.innerHTML = r.ok ? `<h2 class="ok">اتصال برقرار است (${fa(r.ms)} میلی‌ثانیه)</h2><p>${fa(r.count)} آگهی در صفحه اول دریافت شد. نمونه:</p><ul>${r.sample.map((s) => `<li>${esc(s.title)} — ${money(s.price || s.deposit)}</li>`).join("")}</ul><pre class="raw">${esc(JSON.stringify(r.info, null, 1))}</pre>`
          : `<h2 class="bad">اتصال برقرار نشد</h2><pre class="raw">${esc(r.error)}</pre><p class="hint">پیام بالا علت را می‌گوید (فیلتر دامنه، پروکسی خاموش یا رد اتصال). اگر یک روش وصل نشد، روش دیگر (MCP یا مستقیم) را امتحان کنید. متن خطا را برای پشتیبانی بفرستید.</p>`;
      } catch (err) { toast(err.message); }
      b.disabled = false; b.textContent = label;
    };
    $("#test").addEventListener("click", (e) => runTest(e, "divar"));
    $("#testSp").addEventListener("click", (e) => runTest(e, "sheypoor"));
    $("#discover")?.addEventListener("click", async () => { await api("admin/discover", {}); toast("کشف شناسه‌ها آغاز شد"); setTimeout(load, 1500); });
    $("#resetFeeds").addEventListener("click", async () => { if (!confirm("پیمایش همه فهرست‌ها از صفحه اول شروع شود؟ آگهی‌های ذخیره‌شده حذف نمی‌شوند.")) return; await api("admin/reset-feeds", {}); load(); });
  }

  /* ---------- ارزش‌گذاری ---------- */
  function valuationTab() {
    const v = S.valuation_full || {}, th = S.thresholds, lb = v.labels || {};
    const KG = { apartment: "آپارتمان", villa: "ویلا", land: "زمین و باغ", commercial: "تجاری" };
    const DEAL = { sale: "فروش", rent: "رهن و اجاره", daily: "روزانه" };
    const cityName = (k) => (S.catalog.cities.find((c) => c.key === k) || {}).name || (S.catalog.provinces[k] || {}).name || k;
    main().innerHTML = `<h1>ارزش‌گذاری و امتیاز</h1><p class="muted">قیمت منصفانه و امتیاز همه آگهی‌ها هر ۱۰ دقیقه یا پس از هر ۲۵ تغییر، خودکار از نو محاسبه می‌شود.</p>
      <div class="kpis">
        <div><b>${fa(v.listings)}</b><span>آگهی بررسی‌شده</span></div>
        <div><b>${fa(v.ranked)}</b><span>دارای امتیاز</span></div>
        <div><b>${fa(v.excluded)}</b><span>کنار گذاشته</span></div>
        <div><b>${v.at ? when(v.at) : "—"}</b><span>آخرین محاسبه (${fa(v.seconds || 0)} ثانیه)</span></div>
      </div>
      <div class="kpis">${[["gold", "فرصت طلایی"], ["good", "زیر قیمت بازار"], ["fair", "منصفانه"], ["high", "بالاتر از بازار"], ["pending", "در انتظار داده (محلهٔ کم‌آگهی)"], ["sus", "مشکوک"], ["excluded", "کنار رفت"]].map(([k, n]) => `<div><b>${fa(lb[k] || 0)}</b><span>${n}</span></div>`).join("")}</div>
      <div class="panel"><h2>آستانه‌های حکم <button class="btn btn--line btn--sm" id="revalue">محاسبه دوباره اکنون</button></h2>
        <form id="wf" class="grid2">
          ${[["opp", "فرصت: دست‌کم چند درصد زیر قیمت محله", 100], ["gold", "فرصت طلایی: دست‌کم چند درصد", 100], ["sus", "مشکوک: بیش از چند درصد ارزان‌تر", 100], ["sus_flagged", "مشکوک همراه با نشانهٔ متنی: بیش از چند درصد", 100], ["disp_k", "ضریب پراکندگی محله (۱ = یک انحراف معیار مقاوم)", 1], ["max_age_days", "آگهی قدیمی‌تر از چند روز کنار برود", 1], ["half_life_days", "نیمه‌عمر وزن آگهی (روز)", 1], ["trend_fixed", "روند ماهانهٔ قیمت ٪ (خالی = برآورد خودکار از داده)", 100]].map(([k, n, m]) => `<label class="field"><span>${n}</span><input class="input" type="number" step="${k === "disp_k" ? "0.1" : k === "trend_fixed" ? "0.1" : "1"}" ${k === "trend_fixed" ? "" : 'min="0"'} name="${k}" data-m="${m}" value="${th[k] == null ? "" : +(th[k] * m).toFixed(2)}"></label>`).join("")}
          <div><button class="btn btn--hot">ذخیره آستانه‌ها</button></div>
        </form>
        <p class="hint">قیمت محله فقط از آگهی‌های همان محله ساخته می‌شود (دست‌کم ۵ آگهی معتبر هم‌نوع) و هرگز با میانهٔ شهر جایگزین نمی‌شود. پیش‌فرض: ۱۵، ۲۲، ۴۰، ۲۵ و ۱. برای زمان: آگهی‌های قدیمی‌تر از ۹۰ روز کنار می‌روند، وزن هر آگهی هر ۴۵ روز نصف می‌شود و قیمت آگهی‌های قدیمی‌تر با روند ماهانهٔ برآوردشده به نرخ امروز آورده می‌شود.</p></div>
      <div class="panel"><h2>روند ماهانهٔ قیمت (برای به‌روز کردن قیمت آگهی‌های قدیمی‌تر)</h2>
        ${(v.trends || []).length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>استان</th><th>نوع</th><th>معامله</th><th>روند ماهانه</th><th>نمونه</th><th>منبع</th></tr></thead><tbody>
          ${v.trends.map((t) => `<tr><td>${esc(cityName(t.scope))}</td><td>${KG[t.kind] || t.kind}</td><td>${DEAL[t.deal] || t.deal}</td><td>${t.monthly >= 0 ? "+" : "−"}${fa(Math.abs(t.monthly * 100).toFixed(1))}٪</td><td>${fa(t.n)}</td><td class="small">${esc(t.source)}</td></tr>`).join("")}
        </tbody></table></div>` : '<p class="muted">پس از اولین محاسبه نمایش داده می‌شود.</p>'}
        <p class="hint">روند از خود آگهی‌ها برآورد می‌شود: آگهی‌ای که دو ماه پیش درج شده با قیمت آن روز است؛ اگر قیمت‌ها ماهانه رشد کنند، آگهی‌های قدیمی‌تر نسبت به محله ارزان‌تر به نظر می‌رسند و شیب همین فاصله، روند است. با کمتر از ۸۰ آگهی پاک یا وقتی همهٔ آگهی‌ها تازه‌اند، روند صفر گرفته می‌شود مگر عدد ثابت بدهید.</p></div>
      <div class="panel"><h2>مدل‌های قیمت ساخته‌شده</h2>
        ${(v.models || []).length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>محدوده</th><th>نوع</th><th>معامله</th><th>نمونه</th><th>R²</th><th>اثر ویژگی‌ها (ضریب استانداردشده لگاریتمی)</th></tr></thead><tbody>
          ${v.models.map((m) => `<tr><td>${esc(cityName(m.scope))}</td><td>${KG[m.kind] || m.kind}</td><td>${DEAL[m.deal] || m.deal}</td><td>${fa(m.n)}</td><td>${fa(m.r2)}</td><td class="small">${Object.entries(m.effects).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8).map(([k, e]) => `<span style="display:inline-block;margin:2px 6px" class="${e >= 0 ? "ok" : "bad"}">${esc(k)} ${e >= 0 ? "+" : "−"}${fa(Math.abs(e).toFixed(3))}</span>`).join("")}</td></tr>`).join("")}
        </tbody></table></div>` : '<p class="muted">هنوز هیچ شهر یا استانی ۶۰ آگهی پاک‌سازی‌شده هم‌نوع ندارد؛ فعلاً قیمت محله بدون تعدیل ویژگی‌ها، فقط میانهٔ همان محله است.</p>'}</div>`;
    $("#revalue").addEventListener("click", async (e) => { e.target.disabled = true; try { await api("admin/revalue", {}); toast("محاسبه شد"); load(); } catch (err) { toast(err.message); } });
    $("#wf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const thresholds = Object.fromEntries($$("#wf input").map((i) => [i.name, i.value === "" ? null : +i.value / +i.dataset.m]));
      try { await api("admin/settings", { thresholds }); toast("ذخیره شد؛ حکم‌ها از نو محاسبه می‌شوند"); setTimeout(load, 1500); } catch (err) { toast(err.message); }
    });
  }

  /* ---------- آگهی‌های کنارگذاشته ---------- */
  async function excluded(q = "") {
    const r = await api("admin/listings?excluded=1&q=" + encodeURIComponent(q));
    main().innerHTML = `<h1>آگهی‌های کنارگذاشته</h1><p class="muted">این آگهی‌ها خودکار از محاسبه و رتبه‌بندی حذف شده‌اند. اگر موردی به اشتباه حذف شده، «تأیید دستی» را بزنید تا در محاسبه بیاید. سایت بدون این بازبینی هم کار می‌کند.</p>
      <div class="panel"><form id="lq" style="display:flex;gap:8px;margin-bottom:14px"><input class="input" name="q" value="${esc(q)}" placeholder="جست‌وجو در عنوان"><button class="btn btn--ink">جست‌وجو</button></form>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>عنوان</th><th>شهر و محله</th><th>قیمت</th><th>متراژ</th><th>دلیل</th><th>تأیید دستی</th></tr></thead><tbody>
      ${r.items.map((l) => `<tr><td><a href="./#/ad/${encodeURIComponent(l.id)}" target="_blank">${esc(l.title)}</a>${l.url ? ` <a class="small" href="${esc(l.url)}" target="_blank">آگهی اصلی</a>` : ""}</td><td>${esc([l.city_name, l.district].filter(Boolean).join("، "))}</td><td>${money(l.pp)}</td><td>${l.area ? fa(l.area) : "—"}</td><td class="small bad">${esc(((l.explain || {}).flags || []).join("، "))}</td>
        <td><input type="checkbox" data-ov="${esc(l.id)}" ${l.override ? "checked" : ""}></td></tr>`).join("") || '<tr><td colspan="6" class="muted">آگهی کنارگذاشته‌ای نیست.</td></tr>'}
      </tbody></table></div></div>`;
    $("#lq").addEventListener("submit", (e) => { e.preventDefault(); excluded(e.target.q.value); });
    $$("[data-ov]").forEach((c) => c.addEventListener("change", async () => { await api("admin/listing", { id: c.dataset.ov, override: c.checked }); toast("ذخیره شد؛ محاسبه از نو انجام می‌شود"); }));
  }

  /* ---------- کاربران و پرداخت‌ها ---------- */
  async function users() {
    const r = await api("admin/users");
    const now = Date.now() / 1000;
    const ST = { paid: "موفق", pending: "در انتظار", failed: "ناموفق", review: "رسید ثبت شد؛ در انتظار بررسی", rejected: "رد شد" };
    const GW = { test: "آزمایشی", card: "کارت‌به‌کارت", zarinpal: "زرین‌پال", idpay: "آیدی‌پی" };
    const rv = r.payments.filter((p) => p.status === "review");
    main().innerHTML = `<h1>کاربران و پرداخت‌ها</h1><p class="muted">ثبت‌نام، پرداخت و فعال‌سازی اشتراک کاملاً خودکار است.</p>
      <div class="kpis"><div><b>${fa(S.users.total)}</b><span>کاربر</span></div><div><b>${fa(S.users.active)}</b><span>اشتراک فعال</span></div><div><b>${money(S.revenue)}</b><span>درآمد واقعی (تومان)</span></div><div><b>${fa(r.payments.filter((p) => p.status === "paid").length)}</b><span>پرداخت موفق</span></div></div>
      ${rv.length ? `<div class="panel"><h2>رسیدهای کارت‌به‌کارت در انتظار بررسی (${fa(rv.length)})</h2><p class="hint">مبلغ را با واریزهای حساب تطبیق دهید؛ سه رقم آخر هر مبلغ یکتاست. رد کردن، روزهای فعال‌شده را پس می‌گیرد.</p>
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>زمان</th><th>موبایل</th><th>مبلغ دقیق</th><th>کد پیگیری</th><th>یادداشت</th><th></th></tr></thead><tbody>
        ${rv.map((p) => `<tr><td>${when(p.created)}</td><td dir="ltr">${esc(p.phone)}</td><td><b>${fa(p.amount)}</b></td><td dir="ltr">${esc(p.ref_id || "")}</td><td class="small">${esc(p.note || "")}</td><td style="white-space:nowrap">${/رسید تصویری/.test(p.note || "") ? `<button class="btn btn--line btn--sm" data-rc="${p.id}">رسید</button> ` : ""}<button class="btn btn--ink btn--sm" data-ok="${p.id}">تأیید</button> <button class="btn btn--line btn--sm" data-no="${p.id}">رد</button></td></tr>`).join("")}
        </tbody></table></div></div>` : ""}
      <div class="panel"><h2>فعال‌سازی دستی اشتراک</h2><form id="gf" style="display:flex;gap:8px;flex-wrap:wrap"><input class="input input--ltr" name="phone" placeholder="09123456789" style="max-width:220px"><select class="select" name="plan" style="max-width:160px"><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option></select><button class="btn btn--ink">فعال کن</button></form><p class="hint">فقط برای موارد استثنایی (مثلاً جبران خطای درگاه).</p></div>
      <div class="panel"><h2>پرداخت‌ها</h2><div class="tbl-scroll"><table class="tbl"><thead><tr><th>زمان</th><th>موبایل</th><th>طرح</th><th>مبلغ</th><th>درگاه</th><th>وضعیت</th><th>کد پیگیری</th></tr></thead><tbody>
        ${r.payments.map((p) => `<tr><td>${when(p.created)}</td><td dir="ltr">${esc(p.phone)}</td><td>${p.plan === "monthly" ? "ماهانه" : "هفتگی"}</td><td>${fa(p.amount)}</td><td>${GW[p.gateway] || esc(p.gateway)}</td><td class="${p.status === "paid" ? "ok" : p.status === "failed" ? "bad" : ""}">${ST[p.status] || p.status}</td><td>${esc(p.ref_id || "")}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">پرداختی ثبت نشده است.</td></tr>'}
      </tbody></table></div></div>
      <div class="panel"><h2>کاربران</h2><div class="tbl-scroll"><table class="tbl"><thead><tr><th>موبایل</th><th>ثبت‌نام</th><th>آخرین ورود</th><th>اشتراک تا</th></tr></thead><tbody>
        ${r.users.map((u) => `<tr><td dir="ltr">${esc(u.phone)}</td><td>${when(u.created)}</td><td>${when(u.last_login)}</td><td class="${u.sub_until > now ? "ok" : ""}">${u.sub_until > now ? when(u.sub_until) : "—"}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">هنوز کاربری ثبت‌نام نکرده است.</td></tr>'}
      </tbody></table></div></div>`;
    $$("[data-ok],[data-no]").forEach((b) => b.addEventListener("click", async () => { try { await api("admin/review", { id: +(b.dataset.ok || b.dataset.no), approve: !!b.dataset.ok }); toast("ثبت شد"); S = await api("admin/state"); users(); } catch (err) { toast(err.message); } }));
    $$("[data-rc]").forEach((b) => b.addEventListener("click", async () => {
      const res = await fetch("api/admin/receipt/" + b.dataset.rc, { headers: { "x-admin-token": token } });
      if (!res.ok) return toast("رسید پیدا نشد");
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    }));
    $("#gf").addEventListener("submit", async (e) => { e.preventDefault(); try { await api("admin/grant", { phone: e.target.phone.value.trim(), plan: e.target.plan.value }); toast("فعال شد"); users(); } catch (err) { toast(err.message); } });
  }

  /* ---------- اشتراک، درگاه و پیامک ---------- */
  function billing() {
    const b = S.billing, sm = S.sms;
    main().innerHTML = `<h1>اشتراک، درگاه و پیامک</h1><p class="muted">تا تعرفه و درگاه تنظیم نشود، دکمه خرید غیرفعال است. هیچ مبلغی از پیش تعیین نشده است.</p>
      <form id="bf">
      <div class="panel"><h2>تعرفه اشتراک (تومان)</h2><div class="grid2">
        <label class="field"><span>اشتراک هفتگی</span><input class="input" name="weekly_price" type="number" min="0" value="${b.weekly_price || ""}" placeholder="مثلاً ۲۰۰۰۰۰"></label>
        <label class="field"><span>مدت هفتگی (روز)</span><input class="input" name="weekly_days" type="number" min="1" value="${b.weekly_days}"></label>
        <label class="field"><span>اشتراک ماهانه</span><input class="input" name="monthly_price" type="number" min="0" value="${b.monthly_price || ""}"></label>
        <label class="field"><span>مدت ماهانه (روز)</span><input class="input" name="monthly_days" type="number" min="1" value="${b.monthly_days}"></label>
        <label class="field"><span>تعداد نتیجهٔ رایگان هر جست‌وجو (بدون اشتراک)</span><input class="input" name="free_results" type="number" min="0" max="100" value="${b.free_results}"></label>
        <label class="field"><span>تعداد فرصت برتر رایگان با جزئیات کامل</span><input class="input" name="free_preview" type="number" min="0" max="50" value="${b.free_preview}"></label>
      </div><p class="hint">خالی یا صفر = آن طرح نمایش داده نمی‌شود.</p></div>
      <div class="panel"><h2>درگاه پرداخت</h2><div class="grid2">
        <label class="field"><span>درگاه</span><select class="select" name="gateway"><option value="">انتخاب نشده</option><option value="zarinpal" ${b.gateway === "zarinpal" ? "selected" : ""}>زرین‌پال</option><option value="idpay" ${b.gateway === "idpay" ? "selected" : ""}>آیدی‌پی</option><option value="card" ${b.gateway === "card" ? "selected" : ""}>کارت‌به‌کارت (مبلغ یکتا و رسید)</option></select></label>
        <label class="field"><span>کد پذیرنده (زرین‌پال: Merchant ID؛ آیدی‌پی: API Key)</span><input class="input input--ltr" name="merchant_id" value="${esc(b.merchant_id)}"></label>
      </div>
      <h3 style="margin-top:16px">کارت‌به‌کارت</h3><div class="grid2">
        <label class="field"><span>شمارهٔ کارت ۱۶ رقمی</span><input class="input input--ltr" name="card_number" value="${esc(b.card_number)}" placeholder="شمارهٔ کارت شما"></label>
        <label class="field"><span>نام دارندهٔ کارت</span><input class="input" name="card_holder" value="${esc(b.card_holder)}"></label>
        <label class="field"><span>بانک</span><input class="input" name="card_bank" value="${esc(b.card_bank)}"></label>
      </div>
      <label class="switch" style="margin-top:10px"><input type="checkbox" name="card_auto_activate" ${b.card_auto_activate ? "checked" : ""}><i></i>اشتراک با ثبت رسید فوراً فعال شود (بررسی بعدی در «کاربران و پرداخت‌ها»)</label><br>
      <label class="switch" style="margin-top:14px"><input type="checkbox" name="sandbox" ${b.sandbox ? "checked" : ""}><i></i>محیط آزمایشی درگاه (Sandbox)</label><br><br>
      <label class="switch"><input type="checkbox" name="test_mode" ${b.test_mode ? "checked" : ""}><i></i>حالت آزمایشی پرداخت: اشتراک بدون پرداخت فعال شود</label>
      <p class="hint" style="color:var(--over)">حالت آزمایشی پرداخت فقط برای آزمون است؛ پیش از انتشار عمومی حتماً خاموشش کنید.</p></div>
      <div class="panel"><h2>سامانه پیامک برای کد ورود (کاوه‌نگار)</h2><div class="grid2">
        <label class="field"><span>کلید API</span><input class="input input--ltr" name="api_key" value="${esc(sm.api_key)}" placeholder="از پنل کاوه‌نگار"></label>
        <label class="field"><span>نام قالب Verify</span><input class="input input--ltr" name="template" value="${esc(sm.template)}" placeholder="مثلاً forsatyab-otp"></label>
      </div>
      <label class="switch" style="margin-top:14px"><input type="checkbox" name="dev_mode" ${sm.dev_mode ? "checked" : ""}><i></i>تا تنظیم پیامک، کد ورود روی صفحه نمایش داده شود (آزمایشی)</label>
      <p class="hint">در قالب Verify کاوه‌نگار، متغیر کد را %token قرار دهید.</p></div>
      <button class="btn btn--hot btn--lg">ذخیره</button></form>`;
    $("#bf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = {
        billing: { weekly_price: +f.weekly_price.value || 0, weekly_days: +f.weekly_days.value || 7, monthly_price: +f.monthly_price.value || 0, monthly_days: +f.monthly_days.value || 30,
          free_preview: +f.free_preview.value || 0, free_results: +f.free_results.value || 0,
          card_number: f.card_number.value.trim(), card_holder: f.card_holder.value.trim(), card_bank: f.card_bank.value.trim(), card_auto_activate: f.card_auto_activate.checked, gateway: f.gateway.value, merchant_id: f.merchant_id.value.trim(), sandbox: f.sandbox.checked, test_mode: f.test_mode.checked },
        sms: { api_key: f.api_key.value.trim(), template: f.template.value.trim(), dev_mode: f.dev_mode.checked },
      };
      try { await api("admin/settings", body); toast("ذخیره شد"); S = await api("admin/state"); } catch (err) { toast(err.message); }
    });
  }

  /* ---------- تنظیمات سایت ---------- */
  function site() {
    const s = S.site;
    main().innerHTML = `<h1>تنظیمات سایت</h1><p class="muted">نام و معرفی سایت روی همه صفحه‌ها نمایش داده می‌شود.</p>
      <form id="sf"><div class="panel"><div class="grid2">
        <label class="field"><span>نام سایت</span><input class="input" name="name" value="${esc(s.name)}"></label>
        <label class="field"><span>شعار کوتاه</span><input class="input" name="tagline" value="${esc(s.tagline)}"></label>
        <label class="field"><span>ایمیل پشتیبانی (اختیاری)</span><input class="input input--ltr" name="email" type="email" value="${esc(s.email)}"></label>
      </div><label class="field" style="margin-top:14px"><span>درباره سایت</span><textarea class="textarea" name="about">${esc(s.about)}</textarea></label></div>
      <div class="panel"><h2>نمایش</h2><label class="switch"><input type="checkbox" id="showSamples" ${S.display_full.show_samples ? "checked" : ""}><i></i>نمایش آگهی‌های نمونه تا وقتی آگهی واقعی دریافت نشده</label></div>
      <div class="panel"><h2>اطلاعات تماس آگهی برای مشترکان</h2>
        <label class="field"><span>شمارهٔ تلفن آگهی</span><select class="select" id="contactMode">
          <option value="none" ${S.display_full.contact_mode === "none" ? "selected" : ""}>نمایش داده نشود</option>
          <option value="owner" ${S.display_full.contact_mode === "owner" ? "selected" : ""}>فقط شمارهٔ مالک (آگهی‌های شخصی، نه مشاور املاک)</option>
          <option value="all" ${S.display_full.contact_mode === "all" ? "selected" : ""}>شمارهٔ هر آگهی‌دهنده</option></select></label>
        <label class="switch" style="margin-top:12px"><input type="checkbox" id="showAddress" ${S.display_full.show_address ? "checked" : ""}><i></i>نمایش نشانی تقریبی و موقعیت دقیق نقشه برای مشترکان</label>
        <p class="hint">شماره فقط وقتی ذخیره و نمایش داده می‌شود که منبع آگهی آن را بدون ورود به حساب کاربری برگرداند. برای کاربران بدون اشتراک، شماره و نشانی هرگز ارسال نمی‌شود و موقعیت نقشه حدود یک کیلومتر گرد می‌شود.</p></div>
      <div class="panel"><h2>هویت و پشتیبانی</h2><p class="hint">تا خالی است، سطر مربوط در سایت نمایش داده نمی‌شود.</p><div class="grid2">
        <label class="field"><span>پیوند پشتیبانی (https:// یا tel: یا mailto:)</span><input class="input input--ltr" id="o_support_url" value="${esc(S.owner.support_url)}"></label>
        <label class="field"><span>متن پیوند پشتیبانی</span><input class="input" id="o_support_label" value="${esc(S.owner.support_label)}"></label>
        <label class="field"><span>نام حقوقی و شناسه</span><input class="input" id="o_legal_name" value="${esc(S.owner.legal_name)}"></label>
        <label class="field"><span>پیوند نماد اعتماد الکترونیکی</span><input class="input input--ltr" id="o_enamad_url" value="${esc(S.owner.enamad_url)}"></label>
      </div><label class="field" style="margin-top:12px"><span>سیاست بازگشت وجه (یک یا دو جمله)</span><textarea class="textarea" id="o_refund_text">${esc(S.owner.refund_text)}</textarea></label></div>
      <button class="btn btn--hot btn--lg">ذخیره</button></form>`;
    $("#sf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      const owner = Object.fromEntries(["support_url", "support_label", "legal_name", "enamad_url", "refund_text"].map((k) => [k, $("#o_" + k).value.trim()]));
      ["support_url", "support_label", "legal_name", "enamad_url", "refund_text"].forEach((k) => delete data[k]);
      try { await api("admin/settings", { site: data, owner, display: { show_samples: $("#showSamples").checked, contact_mode: $("#contactMode").value, show_address: $("#showAddress").checked } }); toast("ذخیره شد"); S = await api("admin/state"); } catch (err) { toast(err.message); }
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
