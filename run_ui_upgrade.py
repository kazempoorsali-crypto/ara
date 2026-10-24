import pathlib, re

print("🚀 شروع اعمال ارتقاهای بصری: رنگ امتیاز، خطوط کف/سقف نمودار، و فیلتر آسمان...")

# ==============================================================================
# 1. اصلاح رنگ دایره امتیاز و نمودار قیمت در property.js
# ==============================================================================
prop_files = list(pathlib.Path(".").rglob("property.js"))
if not prop_files:
    prop_files = [pathlib.Path("assets/site/js/property.js"), pathlib.Path("assets/js/property.js")]

for prop_path in prop_files:
    if prop_path.exists():
        p_txt = prop_path.read_text(encoding="utf-8")
        original_txt = p_txt

        # الف) هماهنگی رنگ دایره امتیاز با برچسب فرصت (طلایی برای ۹۷ و فرصت طلایی، سبز برای فرصت مناسب)
        old_score_pattern = r'ring\.style\.setProperty\([\'"]--sp[\'"],\s*p\.score\);'
        new_score_code = '''ring.style.setProperty("--sp", p.score);
      // هماهنگی رنگ دایره امتیاز با وضعیت ملک
      var scColor = { gold: "#D5A626", ok: "#20976A", good: "#20976A", mid: "#E59B32", warm: "#CE7439", bad: "#CF4751" }[p.status] || "#20976A";
      ring.style.backgroundColor = scColor;
      ring.style.color = (p.status === "gold") ? "#0f172a" : "#ffffff";
      if (p.status === "gold") {
          ring.style.boxShadow = "0 0 16px rgba(213, 166, 38, 0.45)";
          ring.style.border = "2px solid #F59E0B";
      }'''
        if "scColor =" not in p_txt and re.search(old_score_pattern, p_txt):
            p_txt = re.sub(old_score_pattern, new_score_code, p_txt, count=1)

        # ب) نمودار محور افقی: گرادیان طلایی زیر کف + خطوط عمودی اتصال برای سقف و کف قیمت + جایابی نشانگر طلایی
        old_gauge_pattern = r'(var\s+dot\s*=\s*\$?\(\s*[\'"]\[data-gdot\][\'"]\s*\);)'
        new_gauge_code = r'''\1
          // ۱. گرادیان افقی: قرمز (سقف/گران) -> نارنجی -> سبز -> طلایی براق (زیر کف قیمت)
          var track = gauge.querySelector(".pgauge__track") || gauge.querySelector(".track");
          if (track) {
              track.style.background = "linear-gradient(to left, #CF4751 0%, #E59B32 30%, #20976A 65%, #D5A626 100%)";
              track.style.height = "12px";
              track.style.borderRadius = "6px";
          }
          
          // ۲. خطوط اتصال عمودی برای سقف و کف قیمت به متن‌های راهنما (رفع ابهام موقعیت)
          var gMinEl = document.querySelector("[data-gmin]") ? document.querySelector("[data-gmin]").parentElement : null;
          var gMaxEl = document.querySelector("[data-gmax]") ? document.querySelector("[data-gmax]").parentElement : null;
          if (gMinEl) {
              gMinEl.style.position = "absolute";
              gMinEl.style.right = (typeof pos === "function" ? pos(q25) : 30) + "%";
              gMinEl.style.top = "100%";
              gMinEl.style.borderRight = "2px dashed #20976A";
              gMinEl.style.paddingRight = "6px";
              gMinEl.style.paddingTop = "6px";
              gMinEl.style.color = "#20976A";
              gMinEl.style.fontWeight = "bold";
          }
          if (gMaxEl) {
              gMaxEl.style.position = "absolute";
              gMaxEl.style.right = (typeof pos === "function" ? pos(q75) : 75) + "%";
              gMaxEl.style.top = "100%";
              gMaxEl.style.borderRight = "2px dashed #CF4751";
              gMaxEl.style.paddingRight = "6px";
              gMaxEl.style.paddingTop = "6px";
              gMaxEl.style.color = "#CF4751";
              gMaxEl.style.fontWeight = "bold";
          }

          // ۳. تنظیم نشانگر طلایی این ملک در جایگاه دقیق زیر کف
          if (dot) {
              var dotEl = dot.length ? dot[0] : dot;
              if (p.status === "gold" || p.score >= 90) {
                  dotEl.style.backgroundColor = "#D5A626";
                  dotEl.style.boxShadow = "0 0 14px #D5A626, 0 0 2px #fff";
                  dotEl.style.borderColor = "#ffffff";
                  dotEl.style.zIndex = "10";
              }
          }'''
        if "pgauge__track" not in p_txt and re.search(old_gauge_pattern, p_txt):
            p_txt = re.sub(old_gauge_pattern, new_gauge_code, p_txt, count=1)

        if p_txt != original_txt:
            prop_path.write_text(p_txt, encoding="utf-8")
            print(f"  [OK] اصلاحات دایره امتیاز و نمودار در {prop_path} اعمال شد.")

# ==============================================================================
# 2. افزودن نوار فیلتر هوشمند صفحه اول به نمای آسمان در sky.html
# ==============================================================================
sky_files = list(pathlib.Path(".").rglob("sky.html"))
for sky_path in sky_files:
    if sky_path.exists():
        s_txt = sky_path.read_text(encoding="utf-8")
        if "sky-filter-bar" not in s_txt:
            filter_html = '''
  <!-- نوار فیلتر هوشمند متصل به کره زمین (برگرفته از طراحی صفحه اول) -->
  <div id="sky-filter-bar" class="sky-filter-container" style="position: sticky; top: 12px; z-index: 999; margin: 0 auto 16px auto; max-width: 1200px; padding: 0 16px; width: 100%;">
    <div style="background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 18px; padding: 10px 16px; box-shadow: 0 12px 32px rgba(0,0,0,0.4); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;">
      
      <!-- تب‌های دسته‌بندی و مناطق -->
      <div class="sky-tabs" style="display: flex; align-items: center; gap: 8px; overflow-x: auto; padding-bottom: 2px;">
        <button type="button" class="sky-tab active" data-filter="all" style="background: #20976A; color: #fff; border: none; border-radius: 12px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
          <span>🔥</span><span>همهٔ فرصت‌ها</span>
        </button>
        <button type="button" class="sky-tab" data-filter="gold" style="background: rgba(213, 166, 38, 0.18); color: #D5A626; border: 1px solid rgba(213, 166, 38, 0.4); border-radius: 12px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
          <span>✨</span><span>فقط طلایی (اکازیون)</span>
        </button>
        <button type="button" class="sky-tab" data-filter="north" style="background: rgba(255, 255, 255, 0.06); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
          <span>🌊</span><span>سواحل و مازندران</span>
        </button>
        <button type="button" class="sky-tab" data-filter="gilan" style="background: rgba(255, 255, 255, 0.06); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
          <span>🌧️</span><span>گیلان و رشت</span>
        </button>
        <button type="button" class="sky-tab" data-filter="tehran" style="background: rgba(255, 255, 255, 0.06); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
          <span>🏙️</span><span>تهران و البرز</span>
        </button>
      </div>

      <!-- فیلترهای سریع استان و شهر + دکمه فیلتر پیشرفته -->
      <div style="display: flex; align-items: center; gap: 8px;">
        <select id="sky-province-select" style="background: rgba(30, 41, 59, 0.9); color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 6px 10px; font-size: 12px; font-family: inherit; outline: none; cursor: pointer;">
          <option value="">همهٔ استان‌ها</option>
          <option value="مازندران">مازندران</option>
          <option value="گیلان">گیلان</option>
          <option value="تهران">تهران</option>
          <option value="البرز">البرز</option>
          <option value="گلستان">گلستان</option>
          <option value="اصفهان">اصفهان</option>
          <option value="فارس">فارس</option>
          <option value="خراسان رضوی">خراسان رضوی</option>
        </select>
        <button id="sky-adv-btn" type="button" style="background: rgba(255, 255, 255, 0.08); color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <span>⚙️</span><span>فیلتر پیشرفته</span>
        </button>
      </div>
    </div>
  </div>

  <script>
    (function(){
      var tabs = document.querySelectorAll(".sky-tab");
      var provSelect = document.getElementById("sky-province-select");
      
      function triggerSkyFilter(filterType, provName) {
        if (window.FM && typeof window.FM.filterGlobe === "function") {
          window.FM.filterGlobe({ type: filterType, province: provName });
        } else if (window.skyApply && typeof window.skyApply === "function") {
          window.skyApply({ type: filterType, province: provName });
        } else {
          var ev = new CustomEvent("skyFilterChange", { detail: { type: filterType, province: provName } });
          window.dispatchEvent(ev);
        }
      }

      tabs.forEach(function(btn){
        btn.addEventListener("click", function(){
          tabs.forEach(function(b){ 
            b.classList.remove("active"); 
            b.style.background = (b.dataset.filter === "gold") ? "rgba(213, 166, 38, 0.18)" : "rgba(255, 255, 255, 0.06)";
            b.style.color = (b.dataset.filter === "gold") ? "#D5A626" : "#cbd5e1";
          });
          btn.classList.add("active");
          btn.style.background = (btn.dataset.filter === "gold") ? "#D5A626" : "#20976A";
          btn.style.color = (btn.dataset.filter === "gold") ? "#0f172a" : "#fff";
          triggerSkyFilter(btn.dataset.filter, provSelect ? provSelect.value : "");
        });
      });

      if (provSelect) {
        provSelect.addEventListener("change", function(){
          var activeTab = document.querySelector(".sky-tab.active");
          var fType = activeTab ? activeTab.dataset.filter : "all";
          triggerSkyFilter(fType, provSelect.value);
        });
      }
    })();
  </script>
'''
            if '<div class="sky__head">' in s_txt:
                s_txt = s_txt.replace('<div class="sky__head">', filter_html + '\n  <div class="sky__head">')
            elif '<div class="sky"' in s_txt:
                s_txt = re.sub(r'(<div class="sky"[^>]*>)', r'\1\n' + filter_html, s_txt, count=1)
            elif '<body' in s_txt:
                s_txt = re.sub(r'(<body[^>]*>)', r'\1\n' + filter_html, s_txt, count=1)

            sky_path.write_text(s_txt, encoding="utf-8")
            print(f"  [OK] نوار فیلتر هوشمند آسمان به {sky_path} اضافه شد.")

print("✨ کلیه تغییرات با موفقیت در فایل‌های محلی ریپازیتوری اعمال شد!")
