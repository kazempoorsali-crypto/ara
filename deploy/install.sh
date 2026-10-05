#!/usr/bin/env bash
# نصب فرصت‌یاب روی سرور اوبونتو ۲۲٫۰۴ یا ۲۴٫۰۴
# استفاده:  sudo bash install.sh example.ir https://github.com/USER/REPO.git BRANCH
#    یا اگر پوشهٔ پروژه را خودتان در /opt/forsatyab بارگذاری کرده‌اید:  sudo bash install.sh example.ir local
set -euo pipefail
DOMAIN="${1:-}"; REPO="${2:-}"; BRANCH="${3:-main}"
if [ -z "$DOMAIN" ] || [ -z "$REPO" ]; then
  echo "استفاده: sudo bash install.sh <دامنه> <نشانی مخزن گیت> [شاخه]"; exit 1
fi
echo "==> نصب پیش‌نیازها"
apt-get update
apt-get install -y python3 git sqlite3 curl ufw
if ! command -v caddy >/dev/null; then
  apt-get install -y caddy || {
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update && apt-get install -y caddy
  }
fi
echo "==> کاربر و پوشه‌ها"
id forsatyab >/dev/null 2>&1 || useradd --system --home /opt/forsatyab --shell /usr/sbin/nologin forsatyab
mkdir -p /var/lib/forsatyab
if [ "$REPO" = "local" ]; then
  [ -f /opt/forsatyab/server/app.py ] || { echo "پوشهٔ پروژه در /opt/forsatyab پیدا نشد"; exit 1; }
elif [ ! -d /opt/forsatyab/.git ]; then
  git clone --branch "$BRANCH" "$REPO" /opt/forsatyab
fi
chown -R forsatyab:forsatyab /opt/forsatyab /var/lib/forsatyab
echo "==> سرویس برنامه"
cp /opt/forsatyab/deploy/forsatyab.service /etc/systemd/system/forsatyab.service
systemctl daemon-reload
systemctl enable --now forsatyab
echo "==> وب‌سرور و HTTPS"
sed "s/__DOMAIN__/$DOMAIN/g" /opt/forsatyab/deploy/Caddyfile.template > /etc/caddy/Caddyfile
systemctl enable caddy && systemctl restart caddy
echo "==> دیوار آتش"
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
echo "==> پشتیبان روزانه (ساعت ۴ بامداد)"
install -m 755 /opt/forsatyab/deploy/backup.sh /usr/local/bin/forsatyab-backup
echo "0 4 * * * root /usr/local/bin/forsatyab-backup" > /etc/cron.d/forsatyab-backup
systemctl --no-pager --lines=5 status forsatyab || true
echo ""
echo "تمام شد. اکنون https://$DOMAIN/admin.html را باز کنید و رمز مدیر را تعیین کنید."
