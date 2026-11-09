"""به‌روزرسانی خودکار از گیت‌هاب: هر چند دقیقه شاخهٔ پیش‌فرض بررسی می‌شود و اگر کامیت تازه‌ای بود،
کد گرفته می‌شود، سالم بودن فایل‌های پایتون سنجیده می‌شود و برنامه خودش را دوباره راه می‌اندازد
(systemd با Restart=always سرویس را بی‌درنگ بالا می‌آورد). داده‌ها در پوشهٔ جدا هستند و دست نمی‌خورند.
فقط وقتی برنامه زیر systemd اجرا می‌شود (یا ARA_AUTOUPDATE=1) فعال است؛ روی رایانهٔ توسعه کاری نمی‌کند."""
import os
import subprocess
import threading
import time

STATE = {"active": False, "last_check": 0, "last_update": 0, "last_error": "", "local": "", "remote": "", "branch": ""}
DEFAULT = {"enabled": True, "interval": 180}
_lock = threading.Lock()


def _git(root, *args, timeout=90):
    home = os.environ.get("HOME") or ""
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "HOME": home if home and os.access(home, os.W_OK) else "/tmp"}
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, timeout=timeout, env=env)
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout).strip()[:300] or f"git {args[0]} ناموفق")
    return r.stdout.strip()


def _branch(root):
    try:
        _git(root, "remote", "set-head", "origin", "-a", timeout=60)
    except Exception:  # noqa: BLE001
        pass
    try:
        return _git(root, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").split("/", 1)[1]
    except Exception:  # noqa: BLE001
        return _git(root, "rev-parse", "--abbrev-ref", "HEAD")


def check(root, apply=True) -> bool:
    """True یعنی نسخهٔ تازه نصب شد و باید برنامه دوباره راه بیفتد."""
    with _lock:
        STATE["last_check"] = int(time.time())
        _git(root, "fetch", "--prune", "-q", "origin")
        br = _branch(root)
        local, remote = _git(root, "rev-parse", "HEAD"), _git(root, "rev-parse", f"origin/{br}")
        STATE.update(branch=br, local=local[:7], remote=remote[:7], last_error="")
        if local == remote or not apply or remote == STATE.get("bad"):
            return False
        _git(root, "checkout", "-q", "-B", br, f"origin/{br}")
        _git(root, "reset", "-q", "--hard", f"origin/{br}")
        try:  # نسخهٔ خراب نصب نشود: اگر فایلی از سرور ترجمه نشد، به نسخهٔ قبلی برمی‌گردیم
            for f in sorted((root / "server").glob("*.py")):
                compile(f.read_text(encoding="utf-8"), str(f), "exec")
        except (SyntaxError, ValueError) as e:
            _git(root, "reset", "-q", "--hard", local)
            STATE["bad"] = remote   # همین نسخهٔ خراب دوباره امتحان نشود؛ کامیت بعدی بررسی می‌شود
            STATE["last_error"] = f"نسخهٔ {remote[:7]} خطای نحوی داشت و نصب نشد: {str(e)[:200]}"
            return False
        STATE.update(local=remote[:7], last_update=int(time.time()))
        return True


def restart(app=None):
    """خروج تمیز؛ systemd سرویس را با کد تازه بالا می‌آورد."""
    try:
        if app is not None:
            app.ingest.stop.set()
    except Exception:  # noqa: BLE001
        pass
    time.sleep(3)
    os._exit(0)


def cfg(app):
    return {**DEFAULT, **(app.store.get_setting("autoupdate") or {})}


def _loop(app, root):
    time.sleep(45)
    while True:
        c = cfg(app)
        if c["enabled"]:
            try:
                if check(root):
                    print(f"به‌روزرسانی خودکار: نسخهٔ {STATE['local']} نصب شد؛ راه‌اندازی دوباره…", flush=True)
                    restart(app)
            except Exception as e:  # noqa: BLE001
                STATE["last_error"] = str(e)[:300]
        time.sleep(max(60, min(3600, int(c.get("interval") or 180))))


def start(app, root):
    if not (root / ".git").exists():
        return
    flag = os.environ.get("ARA_AUTOUPDATE")
    if flag == "0" or not (os.environ.get("INVOCATION_ID") or flag == "1"):
        return
    STATE["active"] = True
    threading.Thread(target=_loop, args=(app, root), name="autoupdate", daemon=True).start()
