# like a bus 🚌

A tiny, single-page web app (no backend, no build step) that shows **live DC Metrobus
arrival predictions** for a handful of bus stops around **Cleveland Park (20010)** — the
Park Rd NW / 19 St NW corner — and now also supports **Boston** (MBTA bus, subway, light rail, and commuter rail) and **London** (TfL Tube, bus, Overground, DLR, Elizabeth line, tram, and river bus). It's
a static HTML page hosted on **GitHub Pages**, so it costs nothing to run.

Open it: **https://tishtosh.github.io/MTA/mta26.html**

> `mta26.html` is the current version (rewritten Nov 2026). The older `Design/mta4a.html` and
> `Design/mta2.html` are kept in the repo for reference/comparison.

---

## What it does

- On load it shows the **Likes** view: each saved stop/station is a **bookmark card**
  in the main panel. Each city seeds its airport stops as the default likes (see the
  city sections below). Selecting Likes, Home, or Work always shows that view; the
  icons are not toggles.
- The top bar holds the **city mark** (opens the city menu: choose a city or open
  Settings), **Nearby** (map-pin-question), **Search** (magnifier), **Find** (chevron),
  **Back**, **Home**, **Work**, and **Airport**; the **Likes** heart sits snug to the
  left of the refresh meter. A timer ring drains as the next auto-refresh approaches.
  All action icons are always enabled.
- Home, Work, and Airport are multi-bookmark categories: each can hold several bus stops
  and Metro stations. Adding one also adds it to likes; removing a like removes
  it from Home, Work, and Airport too.
- Bookmark cards can be dragged by their bus/train/commuter icon to reorder them. Likes, Home,
  Work, and Airport each keep their own order per city.
- Airports are seeded per city with a bus stop and a rail station.
- **Search** (magnifier) opens a main page with **Bus**, the city's rail section
  (**Metro** / **Subway** / **Tube**) and **Commuter rail** tabs, a stop-or-line
  filter, the matching line list and a detail pane with the selected line's stops.
- **Find** (chevron) opens the quick dropdown with the same Bus / rail / commuter
  sections. Settings is only reachable from the city menu: the **Maps app** choice
  (**Apple Maps** or **Google Maps**, default Google), the **Nearby radius**
  (1,000 feet, 1 mile, 10 miles, or 100 miles), auto-refresh, and Delete all likes.
- **Nearby** (person icon) lists bus stops and Metro/subway/commuter-rail stations
  within the chosen radius of the current location, ordered by distance (first 25;
  miles from 0.5 mi). Rows use the same bookmark cards as Likes/Home/Work/Airport,
  with the distance in the title line. It auto-selects the nearest city; Likes and
  Home/Work bookmarks are stored separately per city.
- The **Bus** filter matches route numbers and stop names; at 3+ characters it expands
  each matching route to only the matching stops.
- A selected stop opens a compact **hero card** plus **route/departure rows**; the first departure is the first row, so every departure uses the same format. Other stops
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
| **Hero card** | The primary card for the selected stop/station: name, ID, shortcuts, connections, and the colored top strip. Departures live in the rows below. Class `.hero-card`. |
| **Nearby stop cards** | Cards for other stops within walking distance, below the hero card. They reuse the hero header line and top strip on a lighter tint of the same mode color, with their own departure rows underneath. Class `.nearby-stop-card`. |
| **Route/departure rows** | The repeated rows inside a stop card: line badge, destination/headsign, and ETAs. Class `.board-row`. |
| **Route / line badge** | The colored rectangle before a destination. It is a bus route number or a rail line name. In the hero it is also the disclosure button for the route's stop list. |
| **Commuter-rail icon** | A train icon inside a circle, using the line's color. Subway and light rail use the Tabler train mark in the same line color. |
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

The **city menu** (top-left city mark) selects the transport system:

| City | Data source | Modes |
|------|-------------|-------|
| **Washington DC** | WMATA (`api.wmata.com`) | Metrobus + Metrorail |
| **Boston** | MBTA v3 (`api-v3.mbta.com`) | MBTA bus + subway/light rail + commuter rail |
| **London** | TfL Unified API (`api.tfl.gov.uk`) | Tube, bus, Overground, DLR, Elizabeth line, tram, river bus |
| **New York City** | MTA GTFS-Realtime (`api-endpoint.mta.info`) | Subway, Staten Island Railway, LIRR, Metro-North (buses deferred) |

- The choice is stored in the `mta_city` cookie and can be forced with `?city=dc|boston|london|nyc`.
- Likes and Home/Work bookmarks are per city (separate storage keys), so switching
  cities swaps the saved lists while keeping the current view and the last location point.
- **Near me** uses the device location, asks before switching to a different city's
  provider, then lists stops/stations within the radius chosen in Settings.

### Washington DC

- **Source / key:** WMATA, `api.wmata.com`; the key is decrypted into `API_KEY` (see
  *API key handling*).
- **IDs:** 7-digit bus stops (`1002135`), station codes (`C10`, `N10`), rail line codes
  (`RD BL OR SV GR YL`).
- **Modes:** Metrobus + Metrorail. The rail section is named **Metro**; there is no
  commuter section.
- **Theme:** accent `#2e7d32`, 5 px badge radius; hero bus `#d8d8d8` / `#2f2f2f`,
  hero rail `#ece1cd` / `#46301a`.
- **Defaults:** `1002135` (Park Rd NW + 19 St NW); the default like is Dulles (`N10`,
  `SV`). Airports: Crystal Dr (`6000892`, `A1X`), DCA (`C10`, `BL`), IAD (`N10`, `SV`).
- **Quirks:** one prediction request per stop; route details + schedules feed the track
  rows and patterns; the terminal filter reads the route-details cache (best effort —
  a cold cache keeps the rows); bus positions are not used.

### Boston

- **Source / key:** MBTA v3, `api-v3.mbta.com`; key decrypted into `MBTA_KEY`.
  Predictions are batched into one request per stop cluster.
- **IDs:** `place-…` stations, `Red`/`Orange`/`Blue`/`Green-B`… lines, commuter `CR-…`
  routes, bus stops such as `17091`.
- **Modes:** bus + subway/light rail + commuter rail. The rail sections are **Subway**
  and **Commuter rail**.
- **Theme:** accent `#8a1c1c`, 4 px badges; hero bus `#e7ddd2` / `#3f3027`, hero rail
  `#d9e3ef` / `#1d3550`.
- **Defaults:** `17091` (Logan Terminal A, `SL1`); the Airport Blue Line station.
- **Quirks:** route colours come from the route directory; terminals are dropped using
  `mbtaTerminalsForRoutes`; trip stops power "Next stops…"; commuter names get air
  around slashes (`Framingham / Worcester`); commuter bands use the railcar gaps.

### London

- **Source / key:** TfL Unified API, `api.tfl.gov.uk`; an optional registered key lives
  in `TFL_KEY_BLOB` (500 req/min vs the keyless 50 req/min).
- **IDs:** NaPTAN (`940GZZLUOXC` stations, `490…` bus stops); TfL line ids
  (`victoria`, `elizabeth`, `overground`, `dlr`, `hammersmith-city`, …).
- **Modes:** Tube, bus, Overground, DLR, Elizabeth line, tram, river bus. The rail
  section is named **Tube** and includes the rail-family lines; no commuter section.
- **Theme:** accent `#0019a8`, 2 px badges; hero bus `#f2d7d5` / `#5a1a16`, hero rail
  `#dbe4f7` / `#14225c`.
- **Defaults:** Oxford Circus (`940GZZLUOXC`); Heathrow Terminals 2 & 3 (Piccadilly).
- **Quirks:** per-station `Arrivals`; rows are deduped by vehicle; trains terminating at
  the station are dropped using `destinationNaptanId`; there is no whole-mode bus dump
  (line stop lists are fetched on demand); branch segments are stitched into a stop
  graph for "Next stops…"; Overground bands use the railcar gaps.

### New York City

- **Source:** keyless MTA GTFS-Realtime (`api-endpoint.mta.info`); protobuf decoded in
  `js/core/gtfsrt.js`. Static data is generated by `scripts/build-nyc-data.mjs` from the
  subway, LIRR and Metro-North zips into `js/cities/nyc-data.js` — 735 stations,
  48 routes, ~1,000 ordered patterns.
- **IDs:** subway/SIR parent stations (`127`, `S09`) with `N`/`S` platform ids; rail is
  namespaced (`LIRR:102`, `MNR:46`) because the raw numeric ids collide with the subway;
  routes are `1…7`, `A…W`, `SI`, `LIRR:1`, `MNR:5`.
- **Modes:** subway + Staten Island Railway + LIRR + Metro-North. The rail sections
  are **Subway** and **Commuter rail**. Buses (MTA Bus Time) are deferred; NJ Transit, PATH,
  AirTrain and NY Waterway are out of scope.
- **Theme:** NYC Core Framework palette — accent `#181A7B`, light `#e6ecf7`, ink
  `#0A1438`; line colours come from the GTFS `route_color`.
- **Defaults:** Times Sq-42 St (`127`); likes are LGA/Terminal B (`904417`, M60 — the
  bus feed is deferred, so the card says so), Howard Beach-JFK (`H03`, `A`) and Jamaica
  (`LIRR:102`).
- **Quirks:** feed groups do not follow the bullets (B rides with A/C/E, GS with 1-7,
  FS with D/F/M, H with A/C/E); the path slash must be `%2F`; headsigns come from the
  trip's last stop; terminating trains are dropped; feeds are cached 45 s; stations
  outside the NYC bbox get an "Outside NYC" chip; there is no schedule fallback.

## Style guide

### Colour and themes

Each city sets CSS variables from `js/cities/*.js`; nothing branches on a city name.

| City | Accent | Badge radius | Hero bus | Hero rail |
|------|--------|--------------|----------|-----------|
| Washington DC | `#2e7d32` | 5 px | `#d8d8d8` / `#2f2f2f` | `#ece1cd` / `#46301a` |
| Boston | `#8a1c1c` | 4 px | `#e7ddd2` / `#3f3027` | `#d9e3ef` / `#1d3550` |
| London | `#0019a8` | 2 px | `#f2d7d5` / `#5a1a16` | `#dbe4f7` / `#14225c` |
| New York City | `#181A7B` | 4 px | `#e6ecf7` / `#0A1438` | `#e6ecf7` / `#0A1438` |

- Badge text is picked by WCAG relative luminance (dark `#111` above L ≈ 0.19), so
  yellow and pink lines (Circle, Hammersmith & City, N/Q/R/W) get dark text.
- The top-left city mark is a button (city menu + Settings) using local brand files:
  `img/dc.svg`, `img/MBTA.svg`, `img/london.svg`, `img/nyc.png`. In-app mode icons stay
  neutral SVGs (`js/ui/icons.js`) — no MTA marks inside rows.

### Cards and line bands

- Hero cards carry the stop name (1.3 rem bold) with the mode icon at the same 1.3 rem,
  the connection row and any status note. The first departure is a normal board row.
- The 7 px line band follows the mode: **buses** use a 45° slice whose right third is
  transparent (the card background shows); **Metro/Subway/Tube/rail** are full width;
  **Overground and commuter** add two evenly spaced gaps so the strip reads as
  railcars.
- The hero's right gutter (150 px, 108 px on bookmark cards) is reserved for the
  shortcut icons; the arrival line cancels it so its columns line up with the rows.

### Row anatomy

- Three columns: route badge | arrival times (wrapping, left-aligned) | final stop
  (content-sized, right-aligned). Times use tabular numerals.
- A first arrival ≤ 2 min gets the wash + 3 px rail, starting at the badge; nearby
  sections stay plain. `row-focus` keeps its yellow tint and accent rail.
- Scheduled fallback rows keep the normal surface; departed rows are muted. Status
  chips (`Arriving`, `Boarding`, `Departed`) carry text, not colour alone.
- Route shapes: DC/Boston/London use pills sized by `--badge-radius`. New York uses
  bullets — circle (local), diamond (express `6X`/`7X`/`FX`) and rectangle (commuter,
  name inside, three standard widths: 72 / 100 / 128 px).

### Connections and dropdowns

- Connection chips sit on the stop row and are right-aligned; they wrap inside their
  own block, never underneath the star. Numbered bullets remain 20 px; commuter
  rectangles keep their width tier.
- The connection list is the station's served lines minus the route being expanded.
- The hero "Next stops…" list uses the same row format as board stop rows, and the
  Nearby view puts the favourite star first (star, line badge, name, distance).

### Settings and labels

- Search dropdown order: Bus (hidden for bus-less cities), the rail section
  (**Metro** / **Subway** / **Tube**), Commuter rail (Boston/NYC only). Nearby and
  the city picker live in the top bar; the settings submenu lives under the city mark.
- Route labels keep the city noun where it adds meaning (`Red Line`, `Jubilee Line`)
  but never say "train". Named commuter rectangles carry the name inside the shape.
- Nearby radius: 1,000 ft / 1 mile / 10 miles / 100 miles; distances switch to miles
  from 0.5 mi. The Nearby view shows the first 25 by distance as bookmark cards.
- Station names get air around separators (`Flatbush Av - Brooklyn College`,
  `Park Rd NW and 19 St NW`); line names too (`Framingham / Worcester`).
- The city mark is a button: its menu lists the cities (current one checked) and a
  Settings entry that expands the settings submenu in place. Settings is not present
  anywhere else in the UI.

### Accessibility

- One focus ring (`2px #0056b3`) for buttons, form controls and marker stops; SVG
  markers use a stroke ring. `prefers-reduced-motion` disables smooth centring and the
  pulse dot. All icon-only controls carry `aria-label`/`title`; the outside-NYC chip is
  text, not colour.

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
js/cities/nyc.js       MTA config + provider + theme (subway, SIR, LIRR, MNR; buses deferred)
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
local bus/tram/ferry marks). Generic chrome uses **Tabler Icons** (MIT): individual
24px files in `img/icons/`, painted through a CSS mask so they inherit `currentColor`.

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

### MTA (New York City)

GTFS-Realtime, protobuf, **no key** for subway/SIR/LIRR/Metro-North. The feed name's
slash must be percent-encoded (`%2F`) or the gateway returns 403.

| Feed | Lines |
|------|-------|
| `nyct%2Fgtfs` | 1 2 3 4 5 6 7, GS, 6X, 7X |
| `nyct%2Fgtfs-ace` | A C E, B, H |
| `nyct%2Fgtfs-bdfm` | D F M, FX, FS |
| `nyct%2Fgtfs-g` | G |
| `nyct%2Fgtfs-jz` | J Z |
| `nyct%2Fgtfs-l` | L |
| `nyct%2Fgtfs-nqrw` | N Q R W |
| `nyct%2Fgtfs-si` | Staten Island Railway |
| `lirr%2Fgtfs-lirr` | Long Island Rail Road |
| `mnr%2Fgtfs-mnr` | Metro-North |

- Base URL: `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/`.
- Only the NYCT subway groups have an undocumented `.json` mirror; LIRR/MNR are
  protobuf-only, hence `js/core/gtfsrt.js`. CORS is `*`, so the page calls them directly.
- Static GTFS: `gtfs_subway.zip`, `gtfslirr.zip`, `gtfsmnr.zip` from
  `rrgtfsfeeds.s3.amazonaws.com`; `scripts/build-nyc-data.mjs` turns them into
  `js/cities/nyc-data.js`.
- MTA Bus Time (buses) needs a free key and is not wired yet.

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
| `scripts/build-nyc-data.mjs` | Regenerates `nyc-data.js` from the subway, LIRR and Metro-North GTFS zips. |
| `js/ui/icons.js` | Standalone SVG transit marks per city. |
| `img/icons/` | Selected **Tabler Icons** (MIT) for UI chrome; see `LICENSE` there. |
| `img/dc.svg`, `img/MBTA.svg`, `img/london.svg`, `img/nyc.png` | Top-bar city marks: WMATA Metro logo, MBTA T, TfL roundel (no text) from Wikimedia Commons; MTA icon from Flaticon (free licence, attribution required). |
| `Design/dropdown-options.html` | Design review: four options for the Bus / Metro / Commuter dropdown summaries, with per-city examples. |
| `Design/` | Sample/preview pages: older versions, icon and refresh-cue demos. |
| `Design/mta4a.html` | Previous version (kept for reference). |
| `Design/mta2.html` | Earlier iteration (kept for reference). |
| `Design/refresh-cues-demo.html` | Countdown ring, hairline, and liveness cue demo. |
| `Design/scratchpad.html` | Scratch / experiments. |
| `css/all.css`, `webfonts/` | Self-hosted **Font Awesome Free 7.3.1** (legacy `Design/` pages only). |
| `.github/workflows/static.yml` | GitHub Pages deploy (uploads the whole repo from `main`). |

Bootstrap **5.3.3** (SRI-hashed) loads from CDN; Tabler icons are local SVG files.
There's no map and no Leaflet.

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
