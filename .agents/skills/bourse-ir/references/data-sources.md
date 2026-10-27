# Data sources and field mapping

All endpoints are public, read-only and unauthenticated. TSETMC and Codal usually
refuse connections from outside Iran; the skill was written and tested offline
against synthetic responses of the shapes below, so the first live run on a
machine in Iran is the real test. If a shape check fails, the scripts stop with
a `ShapeError` naming the endpoint instead of producing wrong numbers. Fix the
mapping here and in `scripts/tse.py`.

## TSETMC, new API (`https://cdn.tsetmc.com/api`), tried first

| purpose | path | list key | fields used |
|---|---|---|---|
| symbol search | `/Instrument/GetInstrumentSearch/{text}` | `instrumentSearch` | `insCode`, `lVal18AFC` (symbol), `lVal30` (name), `flow`, `lastDate` |
| daily history | `/ClosingPrice/GetClosingPriceDailyList/{insCode}/0` | `closingPriceDaily` | `dEven` (yyyymmdd), `priceFirst`, `priceMax`, `priceMin`, `pClosing` (final), `pDrCotVal` (last trade), `priceYesterday`, `qTotTran5J` (volume), `qTotCap` (value), `zTotTran` (count) |
| real / institutional | `/ClientType/GetClientTypeHistory/{insCode}` | `clientType` | `recDate`, `buy_I_*`, `sell_I_*`, `buy_N_*`, `sell_N_*` (`Count`, `Volume`, `Value`) |
| instrument info | `/Instrument/GetInstrumentInfo/{insCode}` | `instrumentInfo` | `zTitad` (shares), `baseVol`, `eps.epsValue`, `eps.estimatedEPS`, `eps.sectorPE`, `sector.lSecVal`, `flowTitle`, `cgrValCotTitle`, `staticThreshold.psGelStaMax/Min` (today's price limits) |
| today | `/ClosingPrice/GetClosingPriceInfo/{insCode}` | `closingPriceInfo` | same price fields as history |
| order book | `/BestLimits/{insCode}` | `bestLimits` | `number`, `pMeDem`/`qTitMeDem` (bid), `pMeOf`/`qTitMeOf` (ask) |

Prices are in rial. Values (`qTotCap`, `*_Value`) are in rial.

## TSETMC, old site (`http://old.tsetmc.com/tsev2/data`), fallback

| purpose | path | format |
|---|---|---|
| search | `search.aspx?skey={text}` | rows `;`, fields `,`: symbol, name, insCode, … |
| history | `InstTradeHistory.aspx?i={insCode}&Top=999999&A=0` | rows `;`, fields `@`: date, high, low, final, last, first, yesterday, value, volume, count |
| real / institutional | `clienttype.aspx?i={insCode}` | rows `;`, fields `,`: date, then buy_I/buy_N/sell_I/sell_N counts, volumes, values (in that order) |
| market universe | `MarketWatchPlus.aspx?h=0&r=0` | sections `@`; section 3 rows `;`, fields `,`: insCode, ISIN, symbol, name, … |

The universe keeps ISINs starting `IRO1` (TSE shares) and `IRO3` (Farabourse
shares); funds (`IRT…`), rights and bonds are excluded.

## Codal

`https://search.codal.ir/api/search/v2/q?Symbol={symbol}&PageNumber=1&…` →
`Letters[]` with `Symbol`, `CompanyName`, `Title`, `LetterCode`, `TracingNo`,
`SentDateTime`, `PublishDateTime` (Jalali text), `Url` (relative, prefix
`https://codal.ir`), `PdfUrl`, `ExcelUrl`. Titles are classified by keywords
(فعالیت ماهانه، صورت‌های مالی، مجمع، افزایش سرمایه، پیش‌بینی، تفسیری).
Figures inside filings are not parsed.

## Price adjustment

TSETMC writes the post-event reference price into the next day's
`priceYesterday`. When `priceYesterday[t] / pClosing[t-1]` differs from 1 by
more than 0.1%, every earlier price is multiplied by that ratio (cumulative,
walking backwards). The latest bar keeps its real price, so today's levels,
stops and targets are in today's rials. Volumes are not adjusted. Each event is
listed in the report with its Jalali date and ratio. An imported CSV without a
"yesterday" column cannot be adjusted.

## Caching

`bourse/cache/<key>.json` = `{"ts": unix_time, "data": …}`. Freshness: live
quotes 15 min, daily data 6 h, search 7 days, Codal 1 h. When a fetch fails, a
stale cache entry is used rather than nothing; `--offline` uses the cache only.
