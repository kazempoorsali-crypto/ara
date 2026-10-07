#!/usr/bin/env bash
# به‌روزرسانی برنامه از گیت‌هاب بدون از دست رفتن داده‌ها (داده‌ها در /var/lib/forsatyab است).
set -euo pipefail
cd /opt/forsatyab
sudo -u forsatyab git pull --ff-only
systemctl restart forsatyab
# یک‌بار: پیکربندی تازهٔ Caddy (تغییر مسیر www به نشانی اصلی، فشرده‌سازی بهتر)؛ اگر نامعتبر بود، نسخهٔ قبلی برمی‌گردد
if [ -f /etc/caddy/Caddyfile ] && grep -q ', www\.' /etc/caddy/Caddyfile; then
  DOMAIN=$(grep -m1 -oE '^[a-z0-9.-]+\.[a-z]{2,}' /etc/caddy/Caddyfile || true)
  if [ -n "$DOMAIN" ]; then
    cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
    sed "s/__DOMAIN__/$DOMAIN/g" /opt/forsatyab/deploy/Caddyfile.template > /etc/caddy/Caddyfile
    if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
      systemctl reload caddy && echo "پیکربندی Caddy به‌روز شد (www ← $DOMAIN)."
    else
      cp /etc/caddy/Caddyfile.bak /etc/caddy/Caddyfile && echo "پیکربندی تازهٔ Caddy معتبر نبود؛ نسخهٔ قبلی ماند."
    fi
  fi
fi
systemctl --no-pager --lines=5 status forsatyab
echo
echo "نسخهٔ نصب‌شده (باید با پایین سایت یکی باشد):"
sudo -u forsatyab git log -1 --format='  v %h  —  %cd  —  %s' --date=format:'%Y-%m-%d %H:%M'
