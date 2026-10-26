// واسط ربات تلگرام فرصت ملک روی اسکریپت گوگل (Google Apps Script)؛ رایگان و از سرورهای ایران در دسترس.
// توکن ربات در این فایل نیست؛ سرور سایت مسیر را در پارامتر path می‌فرستد: .../exec?path=bot<token>/<method>
// راه‌اندازی: script.google.com ← New project ← این کد ← Deploy ← New deployment ← Web app،
// Execute as: Me و Who has access: Anyone ← نشانی /exec را در پنل، «نشانی واسط تلگرام» بگذارید.
// پس از هر تغییر کد: Deploy ← Manage deployments ← مداد ← Version: New version ← Deploy (نشانی عوض نمی‌شود).

function doPost(e) { return relay(e, "post"); }
function doGet(e) { return relay(e, "get"); }

function relay(e, method) {
  var path = (e && e.parameter && e.parameter.path) || (e && e.pathInfo) || "";
  if (!/^bot\d+:[\w-]+\/\w+$/.test(path)) {
    return ContentService.createTextOutput('{"ok":false,"description":"not found"}')
      .setMimeType(ContentService.MimeType.JSON);
  }
  var opt = { method: method, muteHttpExceptions: true };
  if (method === "post") {
    opt.contentType = "application/json";
    opt.payload = (e.postData && e.postData.contents) || "{}";
  }
  var res = UrlFetchApp.fetch("https://api.telegram.org/" + path, opt);
  return ContentService.createTextOutput(res.getContentText())
    .setMimeType(ContentService.MimeType.JSON);
}
