"""اجرای هر مجموعه آزمون در فرایند جداگانه (برای pytest در CI).

هر فایل tests/test_*.py یک اسکریپت مستقل است که با خطا خروجی غیرصفر می‌دهد.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SUITES = sorted(p.name for p in HERE.glob("test_*.py") if p.name != Path(__file__).name)


@pytest.mark.parametrize("suite", SUITES)
def test_suite(suite):
    env = {**os.environ, "ARA_OTP_PER_IP_HOUR": os.environ.get("ARA_OTP_PER_IP_HOUR", "999")}
    r = subprocess.run([sys.executable, str(HERE / suite)], cwd=HERE.parent, env=env, capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, f"{suite} failed:\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}"
