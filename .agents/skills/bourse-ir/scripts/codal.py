#!/usr/bin/env python3
"""Latest Codal (codal.ir) filings for one share, sorted and labelled.

Lists financial statements, monthly activity reports, AGM notices, capital
increases and other announcements with their links, so the report can point to
the primary source. It does not extract figures from the filings: open the
link (or have the user paste the table) and quote numbers only from there.

Usage:
  codal.py فزر [--pages 2] [--kind financial|monthly|agm|capital|forecast|board|other] [--json]
"""
import argparse
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tse  # noqa: E402
from analyze import state_key  # noqa: E402

API = "https://search.codal.ir/api/search/v2/q"

KINDS = [  # first match wins
    ("monthly", "گزارش فعالیت ماهانه", ["فعالیت ماهانه"]),
    ("financial", "صورت‌های مالی", ["صورت‌های مالی", "صورتهای مالی", "صورت های مالی", "اطلاعات و صورت"]),
    ("agm", "مجمع", ["مجمع"]),
    ("capital", "افزایش سرمایه", ["افزایش سرمایه"]),
    ("forecast", "پیش‌بینی درآمد", ["پیش بینی", "پیش‌بینی"]),
    ("board", "تفسیری / گزارش هیئت‌مدیره", ["تفسیری", "هیئت مدیره", "هیات مدیره"]),
]


def classify(title):
    t = tse.norm(title)
    for key, label, words in KINDS:
        if any(tse.norm(w) in t for w in words):
            return key, label
    return "other", "سایر اطلاعیه‌ها"


def fetch(symbol, pages=1):
    out = []
    for page in range(1, pages + 1):
        q = {"Audited": "true", "AuditorRef": "-1", "Category": "-1", "Childs": "true", "CompanyState": "-1",
             "CompanyType": "-1", "Consolidatable": "true", "IsNotAudited": "false", "Length": "-1",
             "LetterType": "-1", "Mains": "true", "NotAudited": "true", "NotConsolidatable": "true",
             "PageNumber": str(page), "Publisher": "false", "Symbol": tse.norm(symbol), "TracingNo": "-1",
             "search": "true"}
        j = tse.get_json(API + "?" + urllib.parse.urlencode(q))
        letters = j.get("Letters")
        if letters is None:
            raise tse.ShapeError("پاسخ کدال فیلد Letters ندارد؛ ساختار API تغییر کرده است")
        for L in letters:
            kind, label = classify(L.get("Title", ""))
            url = L.get("Url") or ""
            pdf = L.get("PdfUrl") or ""
            out.append({
                "symbol": tse.norm(L.get("Symbol")), "company": tse.norm(L.get("CompanyName")),
                "title": tse.norm(L.get("Title")), "code": L.get("LetterCode"), "tracing": L.get("TracingNo"),
                "sent": tse.norm(L.get("SentDateTime")), "published": tse.norm(L.get("PublishDateTime")),
                "kind": kind, "label": label,
                "url": ("https://codal.ir" + url) if url.startswith("/") else url,
                "excel": L.get("ExcelUrl") or None,
                "pdf": ("https://codal.ir/" + pdf.lstrip("/")) if pdf else None,
            })
        if not letters:
            break
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbol")
    ap.add_argument("--pages", type=int, default=1)
    ap.add_argument("--kind", default="all", choices=["all"] + [k for k, _, _ in KINDS] + ["other"])
    ap.add_argument("--n", type=int, default=15)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    try:
        items, _ = tse.cached(f"codal_{tse.norm(a.symbol)}_{a.pages}", tse.TTL_LIVE * 4,
                              lambda: fetch(a.symbol, a.pages), a.offline)
    except (tse.FetchError, tse.ShapeError) as e:
        print(f"⛔ {e}", file=sys.stderr)
        print("اگر کدال از این دستگاه باز نمی‌شود، آخرین صورت مالی یا گزارش ماهانه را از codal.ir بگیرید و جدولش را بفرستید.", file=sys.stderr)
        return 2
    if a.kind != "all":
        items = [i for i in items if i["kind"] == a.kind]
    os.makedirs(tse.STATE_DIR, exist_ok=True)
    with open(os.path.join(tse.STATE_DIR, f"codal-{state_key(a.symbol)}.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    if a.json:
        print(json.dumps(items[:a.n], ensure_ascii=False, indent=1))
        return 0
    print(f"# آخرین اطلاعیه‌های کدال: {tse.norm(a.symbol)}\n")
    print("| تاریخ انتشار | نوع | عنوان | پیوند |\n|---|---|---|---|")
    for i in items[:a.n]:
        print(f"| {i['published']} | {i['label']} | {i['title']} | [مشاهده]({i['url']}) |")
    if not items:
        print("| — | — | اطلاعیه‌ای پیدا نشد | — |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
