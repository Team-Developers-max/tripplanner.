# QuietJourney backend

A tiny Node.js server that scrapes real train data from **erail.in** and exposes
it to the QuietJourney frontend as JSON.

## What it returns (live)

- Real train numbers and names
- Real departure / arrival times and dates
- Real duration and distance
- Train category (Rajdhani / Duranto / Garib Rath / Mail & Express / Special / …)
- Running days

## What it does NOT return

- **Live fares** — erail does not expose a simple fare endpoint. The frontend
  estimates fares from real distance + class. Look for the "LIVE" badge on
  options: the train itself is real, the rupee figure is indicative.
- **Seat availability** — needs an IRCTC login session.

## Run

```
cd travel-site/backend
npm install
npm start
```

Server listens on `http://localhost:3001`. Leave it running while you use the
site. If you stop it, the frontend silently falls back to its built-in estimates.

## Endpoints

- `GET /api/health` — `{ ok: true }`
- `GET /api/cities` — list of supported cities (drives the frontend dropdowns)
- `GET /api/trains?from=Mumbai&to=Jaipur` — returns a JSON list of real trains

## Adding more cities

Edit `stationCodes.js` and add `cityname: "STATION_CODE"` (lowercase city, IRCTC
station code). You can find codes on erail.in or Wikipedia.

## Why erail and not IRCTC directly?

IRCTC requires login and runs behind Cloudflare with CAPTCHAs — the kind of
scraping that needs a headless browser, proxy rotation, and breaks every week.
erail.in aggregates the same data with clean, scraper-friendly HTML.

Be courteous: the scraper caches per-route on the frontend so you only hit erail
once per (from, to) pair per browser session.
