/* ماشین‌حساب «قیمت منصفانه ملک» صفحهٔ اول: استان ← شهر ← محله، نوع ملک، مشخصات و امکانات؛
   برآورد از /api/estimate (همان مدل ارزش‌گذاری سایت). هیچ عددی این‌جا ساخته نمی‌شود. */
(function () {
  "use strict";
  var form = document.getElementById("quickEstForm");
  if (!form || !window.FM || !FM.data) return;
  var $ = function (id) { return document.getElementById(id); };
  var selP = $("qeProv"), selC = $("qeCity"), selD = $("qeDist"), res = $("qeResult");
  var E = FM.esc, fa = FM.fa;
  var regions = (FM.data.regions || []).filter(function (p) { return (p.cities || []).length; });
  var kind = "apartment";

  function opt(v, t, sel) { return '<option value="' + E(v) + '"' + (sel ? " selected" : "") + ">" + E(t) + "</option>"; }
  function provinces() {
    var list = regions.slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
    var cur = (FM.region && FM.region.province) || (list[0] && list[0].id);
    selP.innerHTML = list.map(function (p) { return opt(p.id, p.name, p.id === cur); }).join("");
    cities();
  }
  function cities() {
    var p = regions.filter(function (x) { return x.id === selP.value; })[0] || { cities: [] };
    var list = p.cities.slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
    var cur = FM.region && FM.region.city && String(FM.region.city).split(",")[0];
    selC.innerHTML = list.map(function (c) { return opt(c.id, c.name + (c.n ? " (" + fa(c.n) + " آگهی)" : ""), c.id === cur); }).join("");
    districts();
  }
  function districts() {
    var p = regions.filter(function (x) { return x.id === selP.value; })[0] || { cities: [] };
    var c = p.cities.filter(function (x) { return x.id === selC.value; })[0];
    var ds = ((c && c.districts) || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "fa"); });
    selD.innerHTML = ds.length ? opt("", "انتخاب محله…") + ds.map(function (d) { return opt(d.name, d.name); }).join("") : opt("", "برای این شهر محله‌ای ثبت نشده");
  }
  selP.addEventListener("change", cities);
  selC.addEventListener("change", districts);

  // نوع ملک: برای زمین و مغازه فیلدهای ساختمانی (سال، طبقه، آسانسور…) پنهان می‌شوند؛ ویلا سال و خواب دارد، نه طبقه
  var SHOW = { apartment: ["year", "rooms", "floor", "floors", "elevator"], office: ["year", "floor", "floors", "elevator"], villa: ["year", "rooms"], shop: ["floor"], land: [] };
  $("qeKind").addEventListener("click", function (e) {
    var b = e.target.closest("[data-k]"); if (!b) return;
    kind = b.dataset.k;
    this.querySelectorAll("[data-k]").forEach(function (x) { x.classList.toggle("is-on", x === b); x.setAttribute("aria-checked", x === b); });
    form.querySelectorAll("[data-apt]").forEach(function (el) { el.hidden = SHOW[kind].indexOf(el.dataset.apt) < 0; });
  });
  $("qeOpts").addEventListener("click", function (e) {
    var b = e.target.closest("[data-o]"); if (!b) return;
    b.classList.toggle("is-on");
    b.setAttribute("aria-pressed", b.classList.contains("is-on"));
  });

  function val(id) { var el = $(id); return el && !el.closest("[hidden]") ? String(el.value || "").trim() : ""; }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!selD.value) { res.hidden = false; res.innerHTML = '<p class="est__err">محله را انتخاب کنید؛ برآورد بر پایهٔ آگهی‌های همان محله است.</p>'; selD.focus(); return; }
    var q = { city: selC.value, district: selD.value, kind: kind, area: val("qeArea"), year: val("qeYear"), rooms: val("qeRooms"), floor: val("qeFloor"), floors_total: val("qeFloors") };
    $("qeOpts").querySelectorAll("[data-o]").forEach(function (b) { if (!b.hidden) q[b.dataset.o] = b.classList.contains("is-on") ? 1 : 0; });
    var qs = Object.keys(q).filter(function (k) { return q[k] !== "" && q[k] != null; }).map(function (k) { return k + "=" + encodeURIComponent(q[k]); }).join("&");
    res.hidden = false;
    res.innerHTML = '<div class="est__wait"><i></i>در حال محاسبه با آگهی‌های ' + E(selD.value) + "…</div>";
    var go = form.querySelector(".est__go"); go.disabled = true;
    fetch("/api/estimate?" + qs).then(function (r) { return r.json(); }).then(function (d) {
      go.disabled = false;
      if (d.error) { res.innerHTML = '<p class="est__err">' + E(d.error) + "</p>"; return; }
      var area = +q.area || 0;
      var fx = (d.effects || []).map(function (e) {
        var up = e[1] >= 0;
        return '<li class="' + (up ? "up" : "down") + '"><span>' + E(e[0]) + '</span><b dir="ltr">' + (up ? "+" : "−") + fa(Math.round(Math.abs(e[1]) * 1000) / 10) + "٪</b></li>";
      }).join("");
      res.innerHTML =
        '<div class="est__out">' +
          '<div class="est__big"><span>ارزش منصفانهٔ این ملک</span><b>' + E(FM.money(Math.round(d.total))) + "</b>" +
            "<small>" + (area ? fa(area) + " متر × متری " + E(FM.money(Math.round(d.ppm))) : "") + "</small></div>" +
          '<div class="est__facts">' +
            "<div><span>میانهٔ هر متر در " + E(q.district) + "</span><b>" + E(FM.money(Math.round(d.base_ppm))) + "</b></div>" +
            "<div><span>پشتوانهٔ برآورد</span><b>" + fa(d.n || 0) + " آگهی معتبر محله</b></div>" +
          "</div>" +
        "</div>" +
        (fx ? '<div class="est__fx"><b>اثر مشخصات این ملک بر قیمت</b><ul>' + fx + "</ul></div>" : "") +
        '<p class="est__note">' + (d.method === "rule" ? "برای این شهر مدل آماری کافی نیست؛ اثر ویژگی‌ها با ضریب‌های عرف بازار و تقریبی حساب شد. " : d.model ? "مدل قیمت با " + fa(d.model.n) + " آگهی ساخته شده است. " : "") +
          "این برآورد آماری است، نه قیمت قطعی؛ پیش از معامله بازدید و استعلام لازم است.</p>" +
        '<a class="est__link" href="/app.html#/s?city=' + encodeURIComponent(q.city) + "&district=" + encodeURIComponent(q.district) + '&opp=1">مشاهدهٔ املاک زیر قیمت همین محله ←</a>';
    }).catch(function () { go.disabled = false; res.innerHTML = '<p class="est__err">ارتباط با سرور برقرار نشد؛ دوباره امتحان کنید.</p>'; });
  });

  provinces();
})();
