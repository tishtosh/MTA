# like a bus 🚌

A tiny, single-file web app (no backend, no build step) that shows **live DC Metrobus
arrival predictions** for a handful of bus stops around **Cleveland Park (20010)** — the
Park Rd NW / 19 St NW corner. It's a static HTML page hosted on **GitHub Pages**, so it
costs nothing to run.

Open it: **https://tishtosh.github.io/MTA/mta26.html**

> `mta26.html` is the current version (rewritten Nov 2026). The older `mta4a.html` and
> `mta2.html` are kept in the repo for reference/comparison.

---

## What it does

- On load it finds the bus stops near a location and lists their next arrivals, refreshing
  automatically (default every 30 s).
- Three buttons in the top bar:
  - **🚌 (bus)** — reload the page.
  - **🏠 (house)** — show stops near the *home* location (the 20010 corner, or whatever
    `?lat`/`?lon` you passed).
  - **📍 (location)** — use your browser's **geolocation** to find the stops nearest *you*.
- Distances are shown from the point actually searched, so the geolocation view is honest.
- A **stop lookup field** above the tabs (autocomplete over the full ~7,500-stop DC
  directory) lets you jump to any stop; the **✕** next to it returns to the nearby list.
  It drives **both** tabs at once.
- Two tabs:
  - **Arrivals** — the predictions table. With a stop picked, it tracks *just that stop*.
  - **Lines** — one banded "track" per route through the picked stop, with live 🚌 icons
    and hover cards. Details under [Lines tab](#lines-tab).
- If one stop's prediction request fails (e.g. a stop that no longer exists), the page
  still renders the others and shows a muted "predictions unavailable" row instead of
  going blank.

## URL parameters

| Param | Meaning | Default |
|-------|---------|---------|
| `busstop` | Comma-separated explicit stop IDs. **When set, `lat`/`lon`/`radius` are ignored.** | — |
| `lat`, `lon` | Search for stops near this GPS point (both required to take effect). | the 20010 corner |
| `radius` | Nearby-search radius, meters. | `300` |
| `refresh` | Prediction refresh interval, seconds (clamped to 15–600). | `30` |

Examples:

```
/mta26.html                                          # stops near the 20010 corner
/mta26.html?busstop=1002135,1002130                  # just these two stops
/mta26.html?lat=38.934&lon=-77.045&radius=500        # stops within 500 m of a point
/mta26.html?refresh=45                               # refresh every 45 s (default: 30)
```

The current 20010 corner stops (useful for building `?busstop=` links):

| Stop ID | Location | Routes |
|---------|----------|--------|
| `1002135` / `1002130` | Park Rd NW + 19 St NW | C87, D72 |
| `1002118` | Adams Mill Rd NW + Klingle Rd NW | C61 |
| `1002127` / `1002120` | Park Rd NW + Mt Pleasant St NW | C87, D72 |

---

## Lines tab

The **Lines** tab draws one row per route that serves the picked stop. There's no map:
WMATA publishes no line geometry, so each row is a *synthetic* track, not a drawn route:

- Each stop on the route is placed on a horizontal axis of **travel time from the picked
  stop**: five equal-width bands (0–5, 5–15, 15–30, 30–60, 60–120 min) on each side of
  the picked stop, which sits at the same fixed center in every row, so the rows line up
  vertically. Stops whose cumulative travel time passes 120 min are clipped.
- Travel time is **haversine distance ÷ 8 mph**, accumulated segment by segment along
  the chain. 8 mph is a field calibration (median of 83 live vehicle samples was
  7.5 mph, per route 6.9–7.6), so the positions are estimates, not survey-grade.
- The chain is the route's stops ordered by a 150-ft collapse (busbays) plus a two-sided
  nearest-neighbor walk from the picked stop. It's approximate in shape and self-heals
  if WMATA renumbers stops again (see [Maintenance](#maintenance)).
- A **🚌** marks each live prediction — one per unique `VehicleID`, positioned by its
  predicted minutes from the picked stop, on the arm opposite its stated destination.
  WMATA has no live vehicle-locations feed, so this is derived from the same 30 s
  per-stop `jPredictions` polls that feed the Arrivals tab; the icons move as the
  predictions move.
- **Hover any stop dot** for a floating card with that stop's name, routes, and live
  arrivals. The card's arrivals are fetched on first hover and cached for the page
  load, so re-hovering is free.
- The full ~800 KB `jStops` dump that powers the lookup field's autocomplete (and the
  route→stop list) is fetched **lazily — only when you first type in the lookup field** —
  never on page load, and fetched once per load.

---

## The WMATA API

WMATA (the Washington Metropolitan Area Transit Authority) runs DC's bus system
(**Metrobus**) and exposes a small public JSON API. The app uses two endpoints:

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `GET https://api.wmata.com/Bus.svc/json/jStops` | Nearby stops: `?Lat=&Lon=&Radius=` → `{ Stops: [{ StopID, Name, Lat, Lon, Routes }] }` | `jStops?Lat=38.93468&Lon=-77.04512&Radius=300` |
| `GET https://api.wmata.com/NextBusService.svc/json/jPredictions` | Arrivals for one stop: `?StopID=` → `{ StopName, Predictions: [{ Minutes, RouteID, DirectionText, VehicleID, TripID }] }` | `jPredictions?StopID=1002135` |

Both require an `api_key` query parameter. Both are verified working (CORS allows any
origin, so the browser page can call them directly).

- **Developer portal / docs / key sign-up:** <https://developer.wmata.com>
- **Support:** `api-support@wmata.com`
- **⚠ GTFS cutover:** On **2025-06-29** WMATA's "Better Bus" redesign renumbered stops and
  migrated the data. The pre-2025 stop IDs used by the old pages (`1002141`, `1002148`)
  no longer exist and now return HTTP 400. See [Maintenance](#maintenance).

---

## API key handling

This is the one part that needs care, so it's called out explicitly.

### The hard truth

`mta26.html` is a **public static page**. There is **no way to keep an API key secret in a
client-side page** — anyone who opens the page, inspects the network tab, or clones the repo
can read the key. Treat any key used here as **public and disposable**. (The key currently
shipped in `mta26.html` has been public in the page and in git history for a long time and
should be considered burned.)

The code keeps the key in **one place** — `const API_KEY` at the top of the `<script>` — so
swapping or rotating it is a one-line edit.

### Get your own key

1. Sign in / create an account at **<https://developer.wmata.com>**.
2. Request a key for the Metro/Bus API (free).
3. Paste it into `mta26.html` → `const API_KEY = "..."`.

Because it's a personal page, the simplest and recommended approach is a **dedicated
throwaway key**: use a key you only use for this app so a scrape of it can't affect anything
else, and rotate it whenever it seems compromised.

### Rate limits & self-throttling

WMATA enforces per-key request limits (the exact number isn't published). The app behaves
politely on its own:

- Each request retries **once** after a 1.5 s backoff on a `429` or timeout.
- If a `429` is still returned, the refresh interval stretches **5×** for the next cycle
  (150 s at the 30 s default) and the status line shows "API rate limit hit, slowing
  refresh".
- Keep `?refresh` reasonable. Don't run a 15 s interval against many stops with a shared
  key. The Lines tab adds a little on top: each *first* hover on a stop dot costs one
  `jPredictions` fetch (cached for the page load after), so working down a long line is
  a one-time cost per stop, not a per-tick one.

### If you'd rather the key never be public

Use a **tiny serverless proxy** that holds the key server-side and forwards the request. The
browser then never sees the key. Overkill for one page, but the "correct" architecture:

```js
// e.g. a Cloudflare Worker / GitHub Actions Function / any serverless function
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const api = new URL("https://api.wmata.com" + url.pathname + url.search);
    api.searchParams.set("api_key", env.WMATA_API_KEY);   // secret, server-side only
    return fetch(api);
  },
};
```

…and point `const WMATA_API = "https://your-proxy.example"` in `mta26.html` at it (drop the
`API_KEY` usage). Pick whichever matches how much you trust the key.

---

## Files

| Path | What |
|------|------|
| `mta26.html` | **Current app.** Single-file: inline CSS + vanilla JS, no build step. |
| `mta4a.html` | Previous version (kept for reference). |
| `mta2.html` | Earlier iteration (kept for reference). |
| `scratchpad.html` | Scratch / experiments. |
| `css/all.css`, `webfonts/` | Self-hosted **Font Awesome** icons. |
| `.github/workflows/static.yml` | GitHub Pages deploy (uploads the whole repo from `main`). |

Bootstrap **5.3.3** (SRI-hashed) and the Orbitron clock font load from CDN in the page;
Font Awesome is self-hosted. There's no map and no Leaflet.

## Run it locally

There's no build step. Serve the repo over HTTP (more reliable for geolocation than
`file://`):

```bash
python3 -m http.server 8000
# → http://localhost:8000/mta26.html
```

## Deploy

Push to **`main`** — the `static.yml` workflow uploads the entire repo to GitHub Pages
automatically. There's no `index.html`, so open the page directly at `/<file>.html`.

## Maintenance

- **Stop IDs change.** WMATA renumbered stops in the 2025 "Better Bus" redesign. The
  no-params view does a **live nearby search** (not a fixed ID list), so it self-heals if
  IDs shift again. Only hand-built `?busstop=` links need refreshing.
- **Re-look-up a stop** if one starts showing "predictions unavailable":

  ```bash
  curl "https://api.wmata.com/Bus.svc/json/jStops?api_key=YOUR_API_KEY&Lat=38.93468&Lon=-77.04512&Radius=300"
  ```

  and use the current `StopID` values from the response.
- **Invalid stop →** the API returns `400` with
  `{"Message":"Stop Id not specified, invalid, or does not exist."}`; the app shows a muted
  error row for that stop and keeps the rest.
