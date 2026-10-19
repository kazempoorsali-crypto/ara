/* ═══════════════════════════════════════════════════════════
   «هر طبقه، یک داستان» — روی برش سه‌بعدی ساختمان
   نشانگر با اسکرول روی برج بالا می‌رود و ۵ وضعیت طبقه
   (اول، دوم، میانی، یکی‌مانده به آخر، آخر) با مزایا/معایب
   روشن می‌شود.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var section = document.querySelector("[data-floors]");
  var panelsBox = document.querySelector("[data-floors-panels]");
  var cursor = document.querySelector("[data-floors-cursor]");
  var cursorLabel = document.querySelector("[data-cursor-label]");
  var bar = document.querySelector("[data-floors-bar]");
  if (!section || !panelsBox || !cursor) return;

  var floors = FM.data.floors || [];
  /* جایگاه نشانگر روی تصویر برج (درصد از پایین) برای هر وضعیت */
  var POS = [90, 78, 64, 51, 39];
  var current = -1;

  function panelEl(f) {
    var el = document.createElement("article");
    el.className = "fpanel";
    el.innerHTML =
      '<header class="fpanel__head">' +
      '<div><h3>' + f.name + "</h3><p>" + f.summary + "</p></div>" +
      "</header>" +
      '<div class="fpanel__cols">' +
      '<div class="fpanel__col is-pro"><b>مزایا</b><ul>' +
      f.pros.map(function (x) { return "<li>" + x + "</li>"; }).join("") +
      "</ul></div>" +
      '<div class="fpanel__col is-con"><b>معایب</b><ul>' +
      f.cons.map(function (x) { return "<li>" + x + "</li>"; }).join("") +
      "</ul></div></div>";
    return el;
  }

  /* ترتیب معکوس: از پنت‌هاوس شروع و پایین می‌آییم */
  var view = floors.slice().reverse();
  var panels = view.map(function (f) {
    var el = panelEl(f);
    panelsBox.appendChild(el);
    return el;
  });

  function show(i) {
    if (i === current) return;
    current = i;
    if (bar) bar.style.width = ((i + 1) / floors.length) * 100 + "%";
    panels.forEach(function (p, pi) { p.classList.toggle("is-active", pi === i); });
    if (cursorLabel) cursorLabel.textContent = view[i].name;
    if (!FM.lite) {
      gsap.to(cursor, { bottom: POS[i] + "%", duration: 0.7, ease: "power3.inOut" });
      gsap.to(cursorLabel, { bottom: "calc(" + POS[i] + "% + 18px)", duration: 0.7, ease: "power3.inOut" });
      var active = panels[i];
      var items = active.querySelectorAll(".fpanel__head, .fpanel__col");
      gsap.fromTo(items, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out", overwrite: true });
    } else {
      cursor.style.bottom = POS[i] + "%";
    }
  }

  var mobile = matchMedia("(max-width: 860px)").matches;
  if (mobile) section.classList.add("is-mob");   // چیدمان فشردهٔ گوشی: برج بالا، پنل طبقه پایین
  if (FM.lite) {
    // دستگاه ضعیف یا «کاهش حرکت»: بدون انیمیشن اسکرول؛ با دکمهٔ هر طبقه، همان طبقه روی برج نشان داده می‌شود
    var tabs = document.createElement("div");
    tabs.className = "floors__tabs";
    tabs.innerHTML = view.map(function (f, i) { return '<button type="button" data-fi="' + i + '">' + f.name + "</button>"; }).join("");
    panelsBox.parentNode.insertBefore(tabs, panelsBox);
    var paint = function (i) { tabs.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-on", +b.dataset.fi === i); }); };
    tabs.addEventListener("click", function (e) { var b = e.target.closest("[data-fi]"); if (b) { show(+b.dataset.fi); paint(+b.dataset.fi); } });
    show(0); paint(0);
    return;
  }

  gsap.set(cursor, { bottom: POS[0] + "%" });
  if (cursorLabel) gsap.set(cursorLabel, { bottom: "calc(" + POS[0] + "% + 18px)" });

  var inkPath = section.querySelector(".ink-path-f");
  var bp = section.querySelector(".ink-bp");
  var fsun = section.querySelector(".floors__sun");
  if (inkPath) gsap.set(inkPath, { attr: { d: inkPath.getAttribute("d") } });

  var D = innerHeight * (mobile ? 0.6 : 1.1);
  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: section.querySelector("[data-floors-pin]"),
      start: "top top",
      end: "+=" + D * floors.length,
      pin: true,
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) {
        var idx = Math.min(floors.length - 1, Math.floor(self.progress * floors.length));
        show(idx);
      },
    },
  });
  floors.forEach(function () { tl.to({}, { duration: 1 }); });

  /* افکت جوهر: بلوپرینت → رندر واقعی، همگام با اسکرول */
  if (inkPath && bp) {
    tl.to(inkPath, { attr: { d: inkPath.dataset.final }, duration: 1.5, ease: "power1.inOut" }, 0);
    tl.to(bp, { opacity: 0.16, duration: 1.5 }, 0);
    if (fsun) tl.fromTo(fsun, { scale: 0, rotation: -40, transformOrigin: "50% 50%" }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2.2)" }, 0.4);
  }

  show(0);
})();
