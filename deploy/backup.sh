#!/usr/bin/env bash
# پشتیبان روزانهٔ پایگاه داده و رسیدها؛ ۱۴ نسخهٔ آخر نگه داشته می‌شود.
set -euo pipefail
SRC=/var/lib/forsatyab
DST=/var/backups/forsatyab
mkdir -p "$DST"
STAMP=$(date +%Y%m%d-%H%M)
sqlite3 "$SRC/ara.db" ".backup '$DST/ara-$STAMP.db'"
[ -d "$SRC/receipts" ] && tar -czf "$DST/receipts-$STAMP.tgz" -C "$SRC" receipts
ls -1t "$DST"/ara-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DST"/receipts-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
