// واسط ربات تلگرام فرصت ملک برای Cloudflare Workers (رایگان)
//
// چرا؟ سرورهای داخل ایران به api.telegram.org دسترسی ندارند (خطای «Network is unreachable»).
// این واسط بیرون از ایران اجرا می‌شود و درخواست‌های ربات را بی‌کم‌وکاست به تلگرام می‌رساند.
// توکن ربات در این فایل نیست؛ همان توکنِ پنل مدیریت در هر درخواست می‌آید.
//
// راه‌اندازی (حدود ۵ دقیقه):
// ۱. در dash.cloudflare.com حساب رایگان بسازید و وارد شوید.
// ۲. Workers & Pages ← Create ← Create Worker (Hello World) ← یک نام بدهید (مثلاً forsatmelk-tg) ← Deploy.
// ۳. Edit code را بزنید، همهٔ کد را پاک کنید، کل این فایل را جای‌گذاری و Deploy کنید.
// ۴. نشانی Worker (مثلاً https://forsatmelk-tg.yourname.workers.dev) را در پنل مدیریت سایت،
//    بخش «ربات تلگرام»، در «نشانی واسط تلگرام» بگذارید، ذخیره و «آزمون اتصال» را بزنید.
// اگر نشانی workers.dev از سرور ایران هم باز نشد، در همان Worker از Settings ← Domains & Routes
// یک دامنهٔ اختصاصی (که در Cloudflare دارید) اضافه کنید و همان را در پنل بگذارید.

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // فقط مسیرهای API ربات (/bot<token>/<method>)؛ هر درخواست دیگری رد می‌شود
    if (!/^\/bot\d+:[\w-]+\/\w+$/.test(url.pathname)) {
      return new Response("not found", { status: 404 });
    }
    const init = {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") || "application/json" },
    };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
    const res = await fetch("https://api.telegram.org" + url.pathname + url.search, init);
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  },
};
