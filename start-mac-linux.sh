#!/usr/bin/env sh
# اجرای سرور محلی آرا (macOS / Linux)
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 server/app.py "$@"; fi
if command -v python >/dev/null 2>&1; then exec python server/app.py "$@"; fi
echo "Python 3 لازم است: https://www.python.org/downloads/"
exit 1
