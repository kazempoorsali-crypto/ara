#!/usr/bin/env bash
# به‌روزرسانی برنامه از گیت‌هاب بدون از دست رفتن داده‌ها (داده‌ها در /var/lib/forsatyab است).
set -euo pipefail
cd /opt/forsatyab
# اگر کسی با root دستور git زده باشد، فایل‌های .git مال root می‌شوند و pull با «insufficient permission» شکست می‌خورد
chown -R forsatyab:forsatyab /opt/forsatyab
# همیشه شاخهٔ پیش‌فرض گیت‌هاب نصب می‌شود (حتی اگر نامش عوض شده باشد) و تغییر دستی روی سرور مانع نمی‌شود
G="sudo -u forsatyab git"
$G fetch --prune origin
$G remote set-head origin -a >/dev/null
BR=$($G symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##')
$G checkout -q -B "$BR" "origin/$BR"
$G reset -q --hard "origin/$BR"
echo "شاخهٔ نصب‌شده: $BR"
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
sleep 2
LIVE=$(curl -s -m 10 http://127.0.0.1:8000/ | grep -o '[?&]v=[0-9a-f]\{7\}' | head -1 | cut -c4-)
echo "نسخه‌ای که سایت همین الان می‌دهد: ${LIVE:-نامشخص}"
