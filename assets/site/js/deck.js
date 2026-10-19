/* ═══════════════════════════════════════════════════════════
   ویترین فرصت‌ها — دستهٔ واحدِ جمع‌شده که با اسکرول، پین‌شده
   و وسط صفحه باز می‌شود؛ هر کارت → صفحهٔ فرعی property.html?id=
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var section = document.querySelector("[data-golden]");
  var pinWrap = document.querySelector("[data-deck-pin]");
  var stage = document.querySelector("[data-deck-stage]");
  var hint = document.querySelector("[data-deck-hint]");
  if (!section || !stage) return;

  var props = (FM.data.properties || []).slice(0, 5);
  if (!props.length) { section.hidden = true; return; }
  var E = FM.esc;
  var cards = [];

  function cardEl(p) {
    var a = document.createElement("a");
    a.className = "dcard";
    a.href = FM.propUrl(p.id);
    a.dataset.status = p.status;
    a.setAttribute("aria-label", p.title + " — " + p.loc);
    if (p.noimg) a.classList.add("is-noimg");
    a.innerHTML =
      '<span class="dcard__img"><img src="' + E(p.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG"><img class="alt" src="' + E(p.img2) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=FM.NOIMG"></span>' +
      '<span class="dcard__grade"></span>' +
      FM.badge(p, "dcard__tag") + FM.cardActs(p) +
      (p.score != null ? '<span class="dcard__score">' + FM.fa(p.score) + "</span>" : "") +
      '<span class="dcard__info"><b>' + E(p.title) + "</b><small>" + E(p.loc) + "</small>" +
      '<span class="dcard__row"><span class="dcard__price">' + E(p.priceText) + '</span><span class="dcard__diff st-text" data-status="' + p.status + '">' + E(p.diffText) + "</span></span></span>" +
      '<span class="dcard__go">مشاهدهٔ ملک <svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    return a;
  }

  /* هدف‌های باز شدن — حول مرکز فیزیکی stage */
  function fanTarget(i, n) {
    var mid = (n - 1) / 2;
    var off = i - mid;
    if (matchMedia("(max-width: 860px)").matches) {   // گوشی: بادبزن فشرده که در عرض صفحه جا می‌شود
      var cw = (cards[0] && cards[0].offsetWidth) || 150;
      var step = Math.max(24, (stage.clientWidth - cw - 20) / Math.max(1, n - 1));
      return { x: off * step, y: Math.abs(off) * 8 - 6, rotation: off * -4.5, scale: 1.04 - Math.abs(off) * 0.06, z: 10 - Math.abs(off) };
    }
    var shrink = Math.min(1, stage.clientWidth / 1240);
    return {
      x: off * 248 * shrink,
      y: Math.abs(off) * 12 - 10,
      rotation: off * -3.4,
      scale: 1.07 - Math.abs(off) * 0.05,
      z: 10 - Math.abs(off),
    };
  }

  function build() {
    stage.innerHTML = "";
    cards = props.map(function (p) {
      var el = cardEl(p);
      stage.appendChild(el);
      return el;
    });
    var n = cards.length;

    if (FM.lite) {
      stage.classList.add("is-row");
      cards.forEach(function (c) { gsap.set(c, { clearProps: "all" }); });
      return;
    }

    /* حالت دسته: همه روی هم، دقیقاً وسط */
    function poseDeck() {
      cards.forEach(function (c, i) {
        var off = i - (n - 1) / 2;
        gsap.set(c, {
          left: "50%", top: "50%",
          xPercent: -50, yPercent: -50,
          x: off * 8, y: Math.abs(off) * 10,
          rotation: off * 3.2,
          scale: 1 - Math.abs(off) * 0.012,
          zIndex: 10 - Math.abs(off),
        });
      });
    }
    poseDeck();

    /* گوشی: کارت‌ها یکی‌یکی جلو می‌آیند (چرخ‌فلک)؛ هر کارت کامل دیده می‌شود و همسایه‌ها پشتش پیداست */
    if (matchMedia("(max-width: 860px)").matches) {
      var place = function (a) {
        var cw = (cards[0] && cards[0].offsetWidth) || 200;
        var step = Math.min(cw * 0.58, (stage.clientWidth - cw) / 2 + cw * 0.12);
        cards.forEach(function (c, i) {
          var d = i - a, ad = Math.abs(d);
          gsap.set(c, { x: d * step, y: ad * 10, rotation: d * -5, scale: Math.max(0.7, 1 - ad * 0.14),
            zIndex: 100 - Math.round(ad * 10), autoAlpha: ad > 2.4 ? 0 : 1 - Math.max(0, ad - 1.2) * 0.5 });
        });
      };
      place(0);
      ScrollTrigger.create({
        trigger: section || pinWrap, start: "top top", end: "+=" + innerHeight * 0.42 * n,
        pin: true, scrub: 0.4, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: function (self) { place(self.progress * (n - 1)); },
      });
      return;
    }

    /* باز شدن پین‌شده: بخش تا پایان بازشدن سر جایش می‌ماند */
    var tl = gsap.timeline({
      scrollTrigger: {
        // کل بخش (عنوان + کارت‌ها) با هم ثابت می‌ماند تا عنوان و کارت‌های بادبزنی در یک نگاه دیده شوند
        trigger: section || pinWrap,
        start: "top top",
        end: "+=" + innerHeight * (matchMedia("(max-width: 860px)").matches ? 0.8 : 1.35),
        pin: true,
        scrub: 0.65,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onEnter: function () { hint && gsap.to(hint, { autoAlpha: 0, duration: 0.4 }); },
        onEnterBack: function () { hint && gsap.to(hint, { autoAlpha: 0, duration: 0.4 }); },
        onLeaveBack: function () { hint && gsap.to(hint, { autoAlpha: 1, duration: 0.4 }); },
      },
    });
    cards.forEach(function (c, i) {
      var t = fanTarget(i, n);
      tl.to(c, {
        x: t.x, y: t.y, rotation: t.rotation, scale: t.scale, zIndex: t.z,
        ease: "power3.out", duration: 1,
      }, 0);
    });

    /* هاور بدون پرش */
    cards.forEach(function (c, i) {
      c.addEventListener("pointerenter", function () {
        gsap.to(c, { y: "-=26", scale: "+=0.045", duration: 0.5, ease: "power3.out", overwrite: "auto" });
        var img = c.querySelector(".dcard__img img");
        img && gsap.to(img, { scale: 1.08, duration: 0.7, ease: "power3.out" });
      });
      c.addEventListener("pointerleave", function () {
        var t = fanTarget(i, n);
        gsap.to(c, { y: t.y, scale: t.scale, duration: 0.6, ease: "power3.out", overwrite: "auto" });
        var img = c.querySelector(".dcard__img img");
        img && gsap.to(img, { scale: 1, duration: 0.6 });
      });
    });
  }

  build();
})();
