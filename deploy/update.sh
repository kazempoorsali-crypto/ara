#!/usr/bin/env bash
# به‌روزرسانی برنامه از گیت‌هاب بدون از دست رفتن داده‌ها (داده‌ها در /var/lib/forsatyab است).
set -euo pipefail
cd /opt/forsatyab
sudo -u forsatyab git pull --ff-only
systemctl restart forsatyab
systemctl --no-pager --lines=5 status forsatyab
echo
echo "نسخهٔ نصب‌شده (باید با پایین سایت یکی باشد):"
sudo -u forsatyab git log -1 --format='  v %h  —  %cd  —  %s' --date=format:'%Y-%m-%d %H:%M'
