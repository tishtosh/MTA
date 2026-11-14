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
  in the main panel. Defaults are N10 (Washington Dulles International Airport) for DC and
  Boston Logan Airport Terminal A (`#17091`) for Boston. Selecting Favorites, Home, or
  Work always shows that view; the icons are not toggles.
- The top bar holds **Search**, **Favorites**, **Home**, **Work**, and **Airport**, with the
  clock at the right showing the last data-refresh time. All icons are always enabled.
- Home, Work, and Airport are multi-bookmark categories: each can hold several bus stops
  and Metro stations. Adding one also adds it to favorites, but removing a favorite does
  not remove the Home/Work/Airport bookmark. Airports are seeded per city with a bus stop
  and a rail station.
- **Search** opens a dropdown with **Favorites**, **Near me**, **Bus**, **Subway**, and
  **Settings**. Settings includes the **City** selector (**Washington DC** or **Boston**),
  the **Maps app** choice (**Apple Maps** or **Google Maps**, default Google, used by the
  hero map button and route actions), auto-refresh, and Delete all favorites.
- **Near me** lists bus stops and Metro/subway stations within 1,000 ft of the current
  location, and auto-selects Boston or Washington DC from that location. Favorites and
  Home/Work bookmarks are stored separately per city.
- The **Bus** filter matches route numbers and stop names; at 3+ characters it expands
  each matching route to only the matching stops.
- A selected stop opens its **hero card** plus **route/departure rows**; other stops
  within walking distance appear below as **nearby stop cards** with their own rows.
- Each route row expands to **Next stops…**, with connection chips and a **See route**
  action that opens transit directions from the selected stop to that route's terminal.
- Live arrivals refresh automatically (default every 30 s), with a manual auto-refresh
  pause/resume in Settings. Nearby stops refresh on slower tiers and hidden tabs pause
  fully.
- If one stop's prediction request fails (e.g. a stop that no longer exists), the page
  still renders the others and shows a muted "predictions unavailable" row instead of
  going blank.

## UI terminology

| Term | What it means in this app |
|------|---------------------------|
| **Hero card** | The primary card for the selected stop/station: name, ID, and next bus/train with the colored top strip. Class `.hero-card`. |
| **Nearby stop cards** | Cards for other stops within walking distance, below the hero card. They reuse the hero header line and top strip on a lighter tint of the same mode color, with their own departure rows underneath. Class `.nearby-stop-card`. |
| **Route/departure rows** | The repeated rows inside a stop card: line badge, destination/headsign, and ETAs. Class `.board-row`. |
| **Route / line badge** | The colored rectangle before a destination. It is a bus route number or a subway line name. In the hero it is also the disclosure button for the route's stop list. |
| **Status chip** | The small pill before the ETA showing **Arriving**, **Boarding**, **Departing**, **NOW**, or **Departed**. `NOW` is the red uppercase chip at zero minutes; the row switches to `DEPARTING` when no live status exists. |
| **Connection chips** | Small route or line badges at a stop in an expanded route list. The current route/line is excluded so the chips mean "you can transfer here". |
| **Next stops…** | The label at the end of the **See route** line. The current stop is not repeated; only upcoming stops are listed, each with its own star and connection chips. |
| **See route** | The share-icon action at the top of a route expansion. It opens transit directions from the selected stop to that direction's terminal. |
| **Selected-stop map button** | The share/arrow button in the hero card. It opens the selected stop/station in the configured Maps app. |
| **Bookmark cards** | The cards shown in the Favorites / Home / Work / Airport views (saved locations). Class `.bookmark-card`. |
| **Bookmark list view** | The main-panel view that replaces the board when Favorites, Home, Work, or Airport is selected. |

### Maps launching

- **Google Maps** is the default. The selected-stop button opens the place/search URL; **See route** opens
  `/maps/dir/?api=1&origin=…&destination=…&travelmode=transit`.
- **Apple Maps** uses the transit frame view:
  `/frame?map=transit&center=…&span=…`. The route action frames both the selected stop and the
  terminal; the selected-stop button frames the stop itself. If coordinates are unavailable, it falls
  back to the nearest known point or a plain transit frame.
- Route actions start at the **selected stop** and end at the **terminal stop of that direction**, not
  at the vehicle's current position.


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
- Nearby stop cards show stops/stations within **1,000 ft**, nearest first. Bus hero
  stripes use the bus route color (MBTA route color in Boston; the app palette in DC)
  sliced at 45° into medium grey.


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

The page separates **live data** from **topology** so it can stay current without spending the
API budget on static lookups.

### Live refresh tiers

| Data | Default cadence | Notes |
|------|-----------------|-------|
| Selected stop/station | Every `refresh` seconds (30 s default) | Always refreshed, even when its cached ETA is recent. |
| Across-street stop | Same as selected | Part of the priority set. |
| Nearest nearby stops (up to 3) | 60 s | `max(60 s, 2 × refresh)`. |
| Remaining nearby stops | 180 s | `max(180 s, 4 × refresh)`. |
| Hidden tab | Paused | Refresh resumes immediately when the tab becomes visible again. |
| MBTA bus cluster | One batched request per cycle | MBTA accepts multiple stop IDs in `/predictions`. |
| Metro nearby stations | One batched request per nearby tier | WMATA and MBTA both accept multiple station/stop codes. |
| WMATA bus | One request per stop | No multi-stop prediction endpoint; tiering is the main saving. |

### Topology and schedule cache

| Data | Cache lifetime | Refresh behavior |
|------|----------------|------------------|
| Stop directory, stations, bus routes | 24 h | Cached copy paints immediately; stale copy refreshes in the background. |
| Route details and stop sequences | 24 h | Stale-while-revalidate. |
| MBTA route patterns and terminal stops | 24 h | One bulk route-pattern request, then cached; representative trip stops are batched. |
| Connections at a stop | 24 h | Cached per stop/mode. |
| Bus stop schedules | Per service day | Fetched only for priority stops, or nearby stops with no live prediction. |
| Metro schedules | Per service day | Built from the rail GTFS feed and then cached. |
| Repeated GETs | 6 s | In-memory memo for static resources; live prediction endpoints are excluded. |

- Caches are stored in `localStorage` per city under `mta_cache_v1_<city>_<name>` and fall back to
  memory if storage is unavailable or full.
- **Stale-while-revalidate:** a cached stop/route/terminal/connection is rendered first; if it is
  older than its TTL, a background refresh updates it for the next paint.
- Route expansions are loaded on first open, then reused. The first open may still fetch one trip
  stop list and per-stop connection data; later opens and reloads use the 24 h caches.
- The stop directory is fetched lazily — when the Bus filter, a stop lookup, or **Near me**
  needs it — never on initial load.
- Favorite and bookmark cards fetch their own next arrival when the view opens.

### API call strategy

1. **Batch what the API supports** — MBTA bus predictions, MBTA route patterns, MBTA trip stops,
   and Metro station predictions.
2. **Tier what it does not** — WMATA bus predictions are polled at selected / near / far cadences.
3. **Persist static topology** — a warm reload makes no stop/route/terminal/connection calls until
   the 24 h TTL expires.
4. **Revalidate rather than block** — stale topology renders immediately while a background request
   refreshes it.
5. **Coalesce and back off** — in-flight requests are deduped, identical static GETs are memoized for
   6 s, a 429 stretches the next cycle 5×, and polling stops in hidden tabs.


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
- The MBTA key is encrypted in `MBTA_KEY_BLOB` and decrypted into `MBTA_KEY` after unlock
  (same client-side caveat as the WMATA key).
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

The code keeps each key in **one encrypted place** — `KEY_BLOB` for WMATA and
`MBTA_KEY_BLOB` for MBTA — decrypted into `API_KEY` / `MBTA_KEY` only after the access
password is entered. Rotating a key means replacing its blob.

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
  key. The selected stop stays on that interval; nearby stops are polled at 60 s / 180 s
  tiers, and hidden tabs stop polling entirely.
- Static topology is reused for 24 h, so reloading the page or reopening a board does not
  re-fetch stop lists, route details, terminal stops, or connection chips.
- MBTA bus predictions and Metro station predictions are batched; a larger stop cluster
  does not multiply the request count.

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
