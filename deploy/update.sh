#!/usr/bin/env bash
# به‌روزرسانی برنامه از گیت‌هاب بدون از دست رفتن داده‌ها (داده‌ها در /var/lib/forsatyab است).
set -euo pipefail
cd /opt/forsatyab
sudo -u forsatyab git pull --ff-only
systemctl restart forsatyab
systemctl --no-pager --lines=5 status forsatyab
