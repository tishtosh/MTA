# like a bus 🚌

A tiny, single-page web app (no backend, no build step) that shows **live DC Metrobus
arrival predictions** for a handful of bus stops around **Cleveland Park (20010)** — the
Park Rd NW / 19 St NW corner — and now also supports **Boston** (MBTA bus, subway, light rail, and commuter rail) and **London** (TfL Tube, bus, Overground, DLR, Elizabeth line, tram, and river bus). It's
a static HTML page hosted on **GitHub Pages**, so it costs nothing to run.

Open it: **https://tishtosh.github.io/MTA/mta26.html**

> `mta26.html` is the current version (rewritten Nov 2026). The older `mta4a.html` and
> `mta2.html` are kept in the repo for reference/comparison.

---

## What it does

- On load it shows the **Likes** view: each saved stop/station is a **bookmark card**
  in the main panel. Defaults are N10 (Washington Dulles International Airport) for DC and
  Boston Logan Airport Terminal A (`#17091`) for Boston. Selecting Likes, Home, or
  Work always shows that view; the icons are not toggles.
- The top bar holds **Search**, **Likes**, **Home**, **Work**, and **Airport**, with the
  clock at the right showing the last data-refresh time. All icons are always enabled.
- Home, Work, and Airport are multi-bookmark categories: each can hold several bus stops
  and Metro stations. Adding one also adds it to likes; removing a like removes
  it from Home, Work, and Airport too.
- Bookmark cards can be dragged by their bus/train/commuter icon to reorder them. Likes, Home,
  Work, and Airport each keep their own order per city.
- Airports are seeded per city with a bus stop and a rail station.
- **Search** opens a dropdown with **Likes**, **Near me**, **Bus**, **Rail**, and
  **Settings**. Settings includes the **City** selector (**Washington DC**, **Boston**, or **London**),
  the **Maps app** choice (**Apple Maps** or **Google Maps**, default Google, used by the
  hero map button and route actions), auto-refresh, and Delete all likes.
- **Near me** lists bus stops and Metro/subway/commuter-rail stations within 1,000 ft of the current
  location, and auto-selects Boston or Washington DC from that location. Likes and
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
| **Route / line badge** | The colored rectangle before a destination. It is a bus route number or a rail line name. In the hero it is also the disclosure button for the route's stop list. |
| **Commuter-rail icon** | A train icon inside a circle, using the line's color. Subway and light rail use the `train-subway` icon in the same line color. |
| **Status chip** | The small pill before the ETA showing **Arriving**, **Boarding**, **Departing**, **NOW**, or **Departed**. `NOW` is the red uppercase chip at zero minutes; the row switches to `DEPARTING` when no live status exists. |
| **Connection chips** | Small route or line badges at a stop in an expanded route list. The current route/line is excluded so the chips mean "you can transfer here". |
| **Next stops…** | The label at the end of the **See route** line. The current stop is not repeated; only upcoming stops are listed, each with its own star and connection chips. |
| **See route** | The share-icon action at the top of a route expansion. It opens transit directions from the selected stop to that direction's terminal. |
| **Selected-stop map button** | The share/arrow button in the hero card. It opens the selected stop/station in the configured Maps app. |
| **Bookmark cards** | The cards shown in the Likes / Home / Work / Airport views (saved locations). Class `.bookmark-card`. |
| **Bookmark list view** | The main-panel view that replaces the board when Likes, Home, Work, or Airport is selected. |

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
| **Boston** | MBTA v3 (`api-v3.mbta.com`) | MBTA bus + subway/light rail + commuter rail |
| **London** | TfL Unified API (`api.tfl.gov.uk`) | Tube, bus, Overground, DLR, Elizabeth line, tram, river bus |
| **New York City** | MTA GTFS-Realtime (`api-endpoint.mta.info`) | Subway + Staten Island Railway (phase 0) |

- The choice is stored in the `mta_city` cookie and can be forced with `?city=dc|boston|london|nyc`.
- Likes and Home/Work bookmarks are per city (separate storage keys), so switching
  cities swaps the saved lists.
- **Near me** uses the device location to pick the nearer city automatically before
  listing nearby stops and stations.
- Boston uses the MBTA stop IDs (`place-…` for stations) and line IDs (`Red`, `Orange`,
  `Green-B`, …); DC uses WMATA stop/station codes; London uses NaPTAN IDs
  (`940GZZLUOXC` for Tube stations, `490…` for bus stops) and TfL line IDs
  (`victoria`, `elizabeth`, `overground`, …).
- London uses a registered TfL key (500 requests/minute) stored encrypted in
  `TFL_KEY_BLOB` in `mta26.html`; the provider appends `app_key` automatically. If the
  blob is cleared, the keyless 50 requests/minute limit still applies.
- **New York City** is a rail-only phase 0: subway + Staten Island Railway from the
  keyless MTA GTFS-Realtime feeds (protobuf, decoded in `js/core/gtfsrt.js`). Station,
  route and platform data come from the generated `js/cities/nyc-data.js`
  (`node scripts/build-nyc-data.mjs`). Default likes are LGA (M60 at Terminal B — the
  bus feed is deferred, so the card says so) and JFK (A to Howard Beach). MTA Bus Time
  needs a free key and is deferred; NJ Transit, PATH, AirTrain and NY Waterway are out
  of scope. The MTA logo/roundel is licensed, so the city uses the neutral subway glyph.
  Feed ids need `%2F` in the path, and LIRR/Metro-North have no JSON mirror — hence the
  protobuf reader.
- Nearby stop cards show stops/stations within **1,000 ft**, nearest first. Bus hero
  stripes use the route color (MBTA route color in Boston, TfL red in London, the app
  palette in DC) sliced at 45° into medium grey.

## Code layout

`mta26.html` is still the only page and needs no build step. The city-specific code now
lives in classic scripts under `js/`, loaded before the inline app:

```
js/core/http.js        shared GET: timeout, one retry, 429 backoff, 6 s memo, binary feeds
js/core/gtfsrt.js      dependency-free GTFS-Realtime protobuf reader (MTA)
js/cities/index.js     registry, active-city state, cookie/city switching
js/cities/dc.js        WMATA config + provider + theme
js/cities/boston.js    MBTA config + provider + theme
js/cities/london.js    TfL config + provider + theme
js/cities/nyc-data.js  generated NYC stations/routes/platform map (build script)
js/cities/nyc.js       MTA config + provider + theme (phase 0: subway + SIR)
js/ui/icons.js         standalone SVG transit marks per city
```

Each city registers one object with:

- **config** — name, agency, center, labels, default like/airport stops, storage key.
- **provider** — `nearbyStops`, `allStops`, `departures`, `stopSchedule`, `routeDetails`,
  `metroStations`, `metroRoutes`, `metroLive`, `metroPath`, `busRouteDirectory`,
  `connections`, plus optional `place`/`tripStops`/`routeStops`/`heroStops`.
- **theme** — route/line colors, badge class, commuter detection, metro line IDs, and CSS
  variables for the hero/badge styling.

The page keeps the caches, refresh tiers, and rendering. It asks for
`cityProvider()` / `cityTheme()` instead of branching on a city name; there are no
`isBoston()` checks left in the app. Live endpoints are never memoized; static topology
stays on the existing 24 h stale-while-revalidate caches.

Transit icons are standalone SVGs (the WMATA **M**, the MBTA **T**, the TfL roundel,
local bus/tram/ferry marks), not Font Awesome. Generic chrome (star, home, share) stays
Font Awesome.

Tests: `node test/run.js` runs all suites, including `providertest.js` (endpoint/
normalization contract for DC, Boston and London), `nyctest.js` (GTFS-RT decoding + MTA
rail provider) and `citypagetest.js` (full-page Boston, London and NYC smoke tests with
stubbed feeds).



## URL parameters

| Param | Meaning | Default |
|-------|---------|---------|
| `busstop` | Comma-separated explicit stop IDs. **When set, `lat`/`lon`/`radius` are ignored.** | — |
| `lat`, `lon` | Search for stops near this GPS point (both required to take effect). | — |
| `radius` | Nearby-search radius, meters. | `300` |
| `refresh` | Prediction refresh interval, seconds (clamped to 15–600). | `30` |

Examples:

```
/mta26.html                                          # Likes view (no stop fetched)
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

- Caches are stored in `localStorage` per city under `mta_cache_v2_<city>_<name>` and fall back to
  memory if storage is unavailable or full.
- **Stale-while-revalidate:** a cached stop/route/terminal/connection is rendered first; if it is
  older than its TTL, a background refresh updates it for the next paint.
- Route expansions are loaded on first open, then reused. The first open may still fetch one trip
  stop list and per-stop connection data; later opens and reloads use the 24 h caches.
- The stop directory is fetched lazily — when the Bus filter, a stop lookup, or **Near me**
  needs it — never on initial load.
- Like and bookmark cards fetch their own next arrival when the view opens.

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
6. **Keep absolute times** — providers return `etaAt` (epoch ms); the board recomputes
   `min` from it at every paint, so a 30 s poll still counts down correctly between requests.


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

### TfL (London)

The TfL Unified API is JSON and browser-callable. The key is optional at low volume;
the provider adds `app_key` when one is configured.

| Endpoint | Purpose |
|----------|---------|
| `GET https://api.tfl.gov.uk/StopPoint?lat=&lon=&radius=` | Nearby stops/stations |
| `GET https://api.tfl.gov.uk/StopPoint/{naptanId}/Arrivals` | Live arrivals for every mode at a station |
| `GET https://api.tfl.gov.uk/Line/{lineId}/Route/Sequence/{direction}` | Ordered pattern |
| `GET https://api.tfl.gov.uk/Line/Mode/{modes}` | Line metadata |
| `GET https://api.tfl.gov.uk/Line/Mode/bus` | Bus route directory |

- **Developer portal / docs:** <https://api.tfl.gov.uk> (register for an `app_key`).
- `?city=london` forces the city; the default like is Oxford Circus.
- A User-Agent header is sent because TfL's edge rejects some default client strings.
- TfL's whole-mode stop dumps are tens of MB, so London does **not** preload a bus
  directory. The route picker requests one line's stops on demand
  (`/Line/{id}/StopPoints`) and Tube/Overground/DLR stations are merged from per-line
  stop lists (about 500 stations, one cached fetch per line per day).
- TfL returns Tube branches as separate route-sequence segments. London builds a small
  stop graph and stitches them, so "Next stops…" works across Heathrow/Uxbridge
  branches instead of stopping at the Acton Town junction.
- The Bus filter also accepts stop names. London queries `/StopPoint/Search` and
  batch-fetches the matching stop details, so a stop-name query shows the routes and
  the matching stops; route expansion is fetched per line on demand.
- Connection chips are buttons. A click navigates to that connection's stop/station
  (switching bus/metro mode when needed) and highlights the matching row on the board.

### MBTA (Boston)

The MBTA v3 API uses JSON:API and an `api_key` query parameter:

| Endpoint | Purpose |
|----------|---------|
| `GET https://api-v3.mbta.com/stops` | Stops/stations; supports `filter[latitude]`, `filter[longitude]`, `filter[radius]` (degrees), `filter[route]`, `filter[route_type]`, `filter[location_type]` |
| `GET https://api-v3.mbta.com/routes` | Route metadata (short name, long name, color, type) |
| `GET https://api-v3.mbta.com/predictions` | Live predictions by stop, route type, or location; `include=route,trip,stop` supplies line names and headsigns |

- **Developer portal / docs / key sign-up:** <https://www.mbta.com/developers/v3-api>
- Boston bus mode uses `route_type=3`; subway/light rail uses `route_type=0,1`; commuter rail uses `route_type=2`.
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
| `mta26.html` | **Current app shell.** Inline CSS + the page app; no build step. |
| `js/core/http.js` | Shared transport (timeout, retry, 429, memo, binary feeds). |
| `js/core/gtfsrt.js` | GTFS-Realtime protobuf reader (MTA feeds). |
| `js/cities/*.js` | City providers, config, and themes for DC, Boston, London, NYC. |
| `js/cities/nyc-data.js` | Generated NYC stations/routes/platform map. |
| `scripts/build-nyc-data.mjs` | Regenerates `nyc-data.js` from the MTA static GTFS zip. |
| `js/ui/icons.js` | Standalone SVG transit marks per city. |
| `mta4a.html` | Previous version (kept for reference). |
| `mta2.html` | Earlier iteration (kept for reference). |
| `scratchpad.html` | Scratch / experiments. |
| `css/all.css`, `webfonts/` | Self-hosted **Font Awesome Free 7.3.1** icons. |
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
