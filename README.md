# like a bus 🚌

A tiny, single-file web app (no backend, no build step) that shows **live DC Metrobus
arrival predictions** for a handful of bus stops around **Cleveland Park (20010)** — the
Park Rd NW / 19 St NW corner — and now also supports **Boston** (MBTA bus + subway). It's
a static HTML page hosted on **GitHub Pages**, so it costs nothing to run.

Open it: **https://tishtosh.github.io/MTA/mta26.html**

> `mta26.html` is the current version (rewritten Nov 2026). The older `mta4a.html` and
> `mta2.html` are kept in the repo for reference/comparison.

---

## What it does

- On load it shows the **Favorites** view: each saved stop/station is a **bookmark card**
  in the main panel (the default favorite is N10 — Washington Dulles International
  Airport). Selecting Favorites, Home, or Work always shows that view; the icons are not
  toggles.
- The top bar holds **Search**, **Favorites**, **Home**, and **Work**, with the clock at
  the right showing the last data-refresh time. All four icons are always enabled.
- **Search** opens a dropdown with **Favorites**, **Near me**, **Bus**, **Subway**, and
  **Settings**. Settings includes the **City** selector: **Washington DC** or **Boston**.
- **Near me** lists bus stops and Metro/subway stations within 1,000 ft of the current
  location, and auto-selects Boston or Washington DC from that location. Favorites and
  Home/Work bookmarks are stored separately per city.
- The **Bus** filter matches route numbers and stop names; at 3+ characters it expands
  each matching route to only the matching stops.
- A selected stop opens its **hero card** plus **route/departure rows**; other stops
  within walking distance appear below as **nearby stop cards** with their own rows.
- Live arrivals refresh automatically (default every 30 s), with a manual auto-refresh
  pause/resume in Settings.
- If one stop's prediction request fails (e.g. a stop that no longer exists), the page
  still renders the others and shows a muted "predictions unavailable" row instead of
  going blank.

## UI terminology

| Term | What it means in this app |
|------|---------------------------|
| **Hero card** | The primary card for the selected stop/station: name, ID, and next bus/train with the colored top strip. Class `.hero-card`. |
| **Nearby stop cards** | Cards for other stops within walking distance, below the hero card. They reuse the hero header line and top strip on a lighter tint of the same mode color, with their own departure rows underneath. Class `.nearby-stop-card`. |
| **Route/departure rows** | The repeated rows inside a stop card: line badge, destination/headsign, and ETAs. Class `.board-row`. |
| **Bookmark cards** | The cards shown in the Favorites / Home / Work views (saved locations). Class `.bookmark-card`. |
| **Bookmark list view** | The main-panel view that replaces the board when Favorites, Home, or Work is selected. |

## Cities

The **Settings** section of the search dropdown selects the transport system:

| City | Data source | Modes |
|------|-------------|-------|
| **Washington DC** | WMATA (`api.wmata.com`) | Metrobus + Metrorail |
| **Boston** | MBTA v3 (`api-v3.mbta.com`) | MBTA bus + subway/light rail |

- The choice is stored in the `mta_city` cookie; the default is Washington DC.
- Favorites and Home/Work bookmarks are per city (separate storage keys), so switching
  cities swaps the saved lists.
- **Near me** uses the device location to pick the nearer city automatically before
  listing nearby stops and stations.
- Boston uses the MBTA stop IDs (`place-…` for stations) and line IDs (`Red`, `Orange`,
  `Green-B`, …); DC uses WMATA stop/station codes.


## URL parameters

| Param | Meaning | Default |
|-------|---------|---------|
| `busstop` | Comma-separated explicit stop IDs. **When set, `lat`/`lon`/`radius` are ignored.** | — |
| `lat`, `lon` | Search for stops near this GPS point (both required to take effect). | — |
| `radius` | Nearby-search radius, meters. | `300` |
| `refresh` | Prediction refresh interval, seconds (clamped to 15–600). | `30` |

Examples:

```
/mta26.html                                          # Favorites view (no stop fetched)
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

## Data loading

- The ~800 KB `jStops` directory is fetched lazily — when the Bus filter, a stop
  lookup, or **Near me** needs it — never on initial load, and once per page load.
- Live arrivals are fetched per visible stop/station and refreshed on the configured
  cycle (default 30 s).
- Favorite and bookmark cards fetch their own next arrival when the view opens.

---

## APIs

Both data sources are public JSON APIs called directly from the browser (CORS allows it).

### WMATA (Washington DC)

WMATA (the Washington Metropolitan Area Transit Authority) runs DC's bus system
(**Metrobus**) and Metrorail. The app uses:

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `GET https://api.wmata.com/Bus.svc/json/jStops` | Nearby stops: `?Lat=&Lon=&Radius=` → `{ Stops: [{ StopID, Name, Lat, Lon, Routes }] }` | `jStops?Lat=38.93468&Lon=-77.04512&Radius=300` |
| `GET https://api.wmata.com/NextBusService.svc/json/jPredictions` | Arrivals for one stop: `?StopID=` → `{ StopName, Predictions: [{ Minutes, RouteID, DirectionText, VehicleID, TripID }] }` | `jPredictions?StopID=1002135` |

Both require an `api_key` query parameter.

- **Developer portal / docs / key sign-up:** <https://developer.wmata.com>
- **Support:** `api-support@wmata.com`
- **⚠ GTFS cutover:** On **2025-06-29** WMATA's "Better Bus" redesign renumbered stops and
  migrated the data. The pre-2025 stop IDs used by the old pages (`1002141`, `1002148`)
  no longer exist and now return HTTP 400. See [Maintenance](#maintenance).

### MBTA (Boston)

The MBTA v3 API uses JSON:API and an `api_key` query parameter:

| Endpoint | Purpose |
|----------|---------|
| `GET https://api-v3.mbta.com/stops` | Stops/stations; supports `filter[latitude]`, `filter[longitude]`, `filter[radius]` (degrees), `filter[route]`, `filter[route_type]`, `filter[location_type]` |
| `GET https://api-v3.mbta.com/routes` | Route metadata (short name, long name, color, type) |
| `GET https://api-v3.mbta.com/predictions` | Live predictions by stop, route type, or location; `include=route,trip,stop` supplies line names and headsigns |

- **Developer portal / docs / key sign-up:** <https://www.mbta.com/developers/v3-api>
- Boston bus mode uses `route_type=3`; subway/light rail uses `route_type=0,1`.
- The MBTA key is stored as `const MBTA_KEY` in `mta26.html` (same client-side caveat as
  the WMATA key).
- Boston transit data is provided by the MBTA (<https://www.mbta.com>).

---

## API key handling

This is the one part that needs care, so it's called out explicitly.

### The hard truth

`mta26.html` is a **public static page**. There is **no way to keep an API key secret in a
client-side page** — anyone who opens the page, inspects the network tab, or clones the repo
can read the key. Treat any key used here as **public and disposable**. (The key currently
shipped in `mta26.html` has been public in the page and in git history for a long time and
should be considered burned.)

The code keeps the WMATA key in **one place** — the encrypted `KEY_BLOB` decrypted into
`API_KEY` — so swapping or rotating it is a one-line edit. The MBTA key is the plain
`const MBTA_KEY` constant.

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
  key. Each visible stop/station (including nearby cards and bookmark cards) costs one
  prediction request per cycle.

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
