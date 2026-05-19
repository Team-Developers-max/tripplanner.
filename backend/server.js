import express from "express";
import cors from "cors";
import { codesFor, STATION_CODES } from "./stationCodes.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------- erail.in scraper ----------
// erail.in renders a "trains between stations" page at
//   https://erail.in/trains-between-stations/<FROM>/<TO>
// Each train row carries its full data in a single HTML attribute:
//   data-train='12239_HISAR DURONTO_MMCT_JP_21-Apr-2026_23:10_22-Apr-2026_13:40_14.30 hr_1159 km_0 min_10 min_13280_0100001_111000110000000_Duranto_First_23.10_'
// Fields are split by `_`:
//   [0] train no  [1] name  [2] from code  [3] to code
//   [4] dep date  [5] dep time  [6] arr date  [7] arr time
//   [8] duration  [9] distance  [10] halt  [11] avg delay
//   [12] row id   [13] days code  [14] class availability bitmap
//   [15] category (Rajdhani/Duranto/Mail & Express/Special/Super Fast/...)
function parseTrainsFromHtml(html) {
  const trains = [];
  const seen = new Set();
  const re = /data-train='([^']+)'/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const p = m[1].split("_");
    if (p.length < 16) continue;
    const trainNo = p[0];
    if (!/^\d{4,5}$/.test(trainNo)) continue;
    if (seen.has(trainNo)) continue;
    seen.add(trainNo);

    trains.push({
      trainNo,
      trainName: p[1],
      fromCode:   p[2],
      toCode:     p[3],
      departDate: p[4],
      departTime: p[5],
      arriveDate: p[6],
      arriveTime: p[7],
      duration:   p[8],
      distance:   p[9],
      haltMin:    p[10],
      avgDelay:   p[11],
      daysCode:   p[13],
      category:   p[15] || null,
    });
  }
  return trains;
}

async function fetchErailTrains(fromCode, toCode) {
  const url = `https://erail.in/trains-between-stations/${encodeURIComponent(fromCode)}/${encodeURIComponent(toCode)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    const err = new Error(`erail.in returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const html = await res.text();
  return { html, trains: parseTrainsFromHtml(html) };
}

// ---------- Routes ----------
app.get("/api/health", (req, res) => res.json({ ok: true, service: "quietjourney-backend" }));

app.get("/api/cities", (req, res) => {
  // De-dupe aliases (e.g. "new delhi" -> "delhi", "bengaluru" -> "bangalore")
  // by grouping entries that share the same station-code set.
  const seenCodeKey = new Set();
  const cities = [];
  for (const [key, codes] of Object.entries(STATION_CODES)) {
    const codeList = Array.isArray(codes) ? codes : [codes];
    const codeKey = codeList.join(",");
    if (seenCodeKey.has(codeKey)) continue;
    seenCodeKey.add(codeKey);
    const display = key.replace(/\b\w/g, c => c.toUpperCase());
    cities.push({ key, display, codes: codeList });
  }
  cities.sort((a, b) => a.display.localeCompare(b.display));
  res.json({ count: cities.length, cities });
});

app.get("/api/trains", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "query params 'from' and 'to' are required" });
  }

  const fromCodes = codesFor(from);
  const toCodes = codesFor(to);
  if (!fromCodes.length || !toCodes.length) {
    return res.status(404).json({
      error: "unknown station code",
      from, to, fromCodes, toCodes,
      hint: "Add the city to backend/stationCodes.js",
    });
  }

  // Try every (from-terminal × to-terminal) pairing in parallel,
  // then merge and dedupe by train number. This handles multi-terminal cities
  // like Mumbai (MMCT/CSMT/LTT) cleanly.
  const pairs = [];
  for (const f of fromCodes) for (const t of toCodes) pairs.push([f, t]);

  try {
    const results = await Promise.allSettled(
      pairs.map(([f, t]) => fetchErailTrains(f, t))
    );

    const merged = [];
    const seen = new Set();
    const perPair = [];
    results.forEach((r, i) => {
      const [f, t] = pairs[i];
      if (r.status !== "fulfilled") {
        perPair.push({ from: f, to: t, count: 0, error: String(r.reason) });
        return;
      }
      perPair.push({ from: f, to: t, count: r.value.trains.length });
      for (const tr of r.value.trains) {
        if (seen.has(tr.trainNo)) continue;
        seen.add(tr.trainNo);
        merged.push(tr);
      }
    });

    // Sort by departure time for a stable, usable order
    merged.sort((a, b) => (a.departTime || "").localeCompare(b.departTime || ""));

    res.json({
      from, to,
      fromCodes, toCodes,
      count: merged.length,
      trains: merged,
      source: "erail.in",
      perPair,
    });
  } catch (e) {
    console.error("erail fetch failed:", e);
    res.status(502).json({ error: "upstream fetch failed", message: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`QuietJourney backend listening on http://localhost:${PORT}`);
  console.log(`Try: http://localhost:${PORT}/api/trains?from=Mumbai&to=Jaipur`);
});
