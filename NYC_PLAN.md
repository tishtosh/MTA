# NYC as a city — implementation plan

Status: **phase 0 implemented** (subway + Staten Island Railway, live and keyless).
Buses, LIRR and Metro-North remain later phases; NJ Transit, PATH, AirTrain and
NY Waterway are out of scope. See README for the shipped surface.

## 1. Scope

City id `nyc`, MTA only.

| In scope | Out of scope (v1) |
|---|---|
| NYC subway (incl. Staten Island Railway) | NJ Transit (no public realtime feed) |
| MTA regional buses (NYCT + MTA Bus) | PATH (no open GTFS-RT) |
| Long Island Rail Road | NY Waterway / NYC Ferry (no open feed) |
| Metro-North Railroad | AirTrain JFK/EWR (Port Authority; static only) |

MTA data is free to use; the MTA logo/roundel is **not** — use the existing neutral
subway glyph from `js/ui/icons.js` and route bullets (colour + number/letter) for
wayfinding, never the MTA mark.

## 2. What the APIs actually require (verified)

* **Rail realtime is keyless.** `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/...`
  returns `access-control-allow-origin: *`, so the page can call it from the browser.
  `api.mta.info` states accounts/API keys are no longer required.
* **The feed path slash must be `%2F`.** `nyct/gtfs` → HTTP 403; `nyct%2Fgtfs` → 200.
* **Subway groups have an undocumented `.json` mirror** (`nyct%2Fgtfs.json`, ~951 KB vs
  116 KB protobuf). **LIRR/MNR have protobuf only** (`.json` → S3 `NoSuchKey`).
  Therefore ship a protobuf reader and treat `.json` as a debug aid.
* **Buses need a key.** `bustime.mta.info` without `key` → 401; free registration at
  `bt.mta.info`. It also sends `access-control-allow-origin: *`, so the same
  encrypted-key mechanism as WMATA/MBTA/TfL works.
* Measured payloads (protobuf): subway `gtfs` 116 KB, `gtfs-ace` 766 KB, `gtfs-si`
  40 KB; LIRR 69 KB; MNR 132 KB. Bus Time: `stop-monitoring` 23 KB/stop,
  `stops-for-location` 120 KB/500 m, `stops-for-route` 235 KB, `routes-for-location` 4 KB.
* Static GTFS zips: subway 5.6 MB, LIRR 1.8 MB, MNR 4.4 MB, per-borough bus 8.4 MB.

## 3. Feed map (route → feed, verified against the live feeds)

| Lines | Feed id |
|---|---|
| 1 2 3 4 5 6 7, GS (42 St shuttle), 6X 7X | `nyct%2Fgtfs` |
| A C E, B, H (Rockaway Park shuttle) | `nyct%2Fgtfs-ace` |
| D F M, FX, FS (Franklin shuttle) | `nyct%2Fgtfs-bdfm` |
| G | `nyct%2Fgtfs-g` |
| J Z | `nyct%2Fgtfs-jz` |
| L | `nyct%2Fgtfs-l` |
| N Q R W | `nyct%2Fgtfs-nqrw` |
| SIR | `nyct%2Fgtfs-si` |
| LIRR (all branches) | `lirr%2Fgtfs-lirr` |
| MNR (all lines) | `mnr%2Fgtfs-mnr` |
| Alerts (optional) | `camsys%2Fsubway-alerts.json`, `camsys%2Fbus-alerts.json` |

The groups do not follow the printed bullets: B rides with A/C/E, GS with 1-7,
FS with D/F/M, H with A/C/E. Only the groups covering the visible station's lines
(plus nearby) are fetched — never all ten. Cache each feed 45–60 s even though
the board ticks at 30 s.

## 4. Wire format

Add `js/core/gtfsrt.js` (classic script, no dependencies, ~120 lines):
varint + length-delimited reader for the GTFS-RT subset we need:

```
FeedMessage.entity = 2
FeedEntity.trip_update = 3
TripUpdate.trip = 1, stop_time_update = 2
TripDescriptor.trip_id = 1, route_id = 5, direction_id = 6
StopTimeUpdate.stop_sequence = 1, arrival = 2, departure = 3, stop_id = 4
```

Skip unknown fields (property 3/4 extensions, `nyct_trip_descriptor`, tracks).
Verified shape: one entity per trip, remaining stops only, e.g.

```
MNR  trip 3268264 route "1"  7 stops  first "1"  last "46"
LIRR trip GO203_26_6720 route "2" 14 stops first "349" last "84"
SIR  trip 066600_SI.S03R route "SI" 1 stop  "S09S"
```

Normalise to the app's prediction shape:

```js
{ min, at, route, routeRef, dir, heads, dirNum, trip, vehicle, status,
  etaAt, observedAt }
```

* `min = round((arrival.time*1000 - now)/60000)`; `status = min === 0 ? "Arriving" : ""`.
* `dirNum` ← `direction_id` (0/1) for subway, branch for rail.
* `heads` ← **name of the last `stop_time_update` stop** (the feed lists only the
  remaining stops, so its tail is the terminus). This avoids a 50k-row static
  trip table.
* Drop a trip whose terminus is the station being shown (same rule already added
  for London: nobody boards a terminating train). For the subway that means
  `last stop parent === station id`.
* Group rows by `route|direction|heads` exactly like `metroRowsFor`.

## 5. IDs and static data

Add `scripts/build-nyc-data.mjs` (node, no deps: `https` + `zlib.inflateRaw` to read
the zips) that writes `js/cities/nyc-data.js` as `window.MTA_NYC_DATA = {...}` — a
classic script, so it works from `file://` with no fetch/CORS.

Contents (small, tens of KB):

* `stations` — parent id → `{name, lat, lon, lines[]}` (subway + SIR + MNR + LIRR).
* `platform` — `"127N"` → `"127"` direction-suffix map (subway feeds use `127N`).
* `routes` — id → `{name, color, kind}`. Subway colours from the MTA colour sheet:
  `123 #EE352E`, `456 #00933C`, `7 #B933AD`, `ACE #0039A6`, `BDFM #FF6319`,
  `G #6CBE45`, `JZ #996633`, `L #A7A9AC`, `NQRW #FCCC0A`, S grey, SIR blue.
  MNR/LIRR route ids are numeric in GTFS; map to "Hudson", "Harlem", "New Haven",
  "Babylon", "Montauk", … and mark `kind: "commuter"`.
* `patterns` — `route|direction` → ordered parent ids, for `metroPath()` and
  "Next stops…". Subway ~60 entries; rail ~40.

Bus stops are **not** prebuilt: Bus Time provides `stops-for-location`,
`stops-for-route`, `routes-for-location` and `stop-monitoring`; follow London's
on-demand model rather than a full directory dump.

## 6. Provider (`js/cities/nyc.js`)

```js
MTA.registerCity({
  id: "nyc", name: "New York City",
  center: { lat: 40.7580, lon: -73.9855 },   // Times Sq
  defaultStopId: "127",                      // Times Sq–42 St (parent)
  nearbyByDefault: true,
  storageKey: "nyc",
  defaultLike: { kind: "metro", id: "127", name: "Times Sq–42 St", route: "123" },
  airportDefaults: {
    bus:   [{ id: "MTA_…", name: "LGA/Marine Air Terminal", route: "M60" }],
    metro: [{ id: "<A-train JFK stop>", name: "Howard Beach–JFK Airport", route: "A" },
            { id: "<Jamaica>", name: "Jamaica Station", route: "LIRR" }],
  },
  capabilities: { batchDepartures: false, scheduleFallback: false,
                  patterns: true, rail: true, railPath: true,
                  metroRoutes: true, metroGtfs: true, vehicles: false,
                  routeStopsOnDemand: true, stopSearch: true },
  provider: {
    http: nycGet,                    // routes to api-endpoint / bustime
    nearbyStops, allStops,           // Bus Time /api/where/stops-for-location
    departures,                      // Bus Time stop-monitoring per stop
    stopSchedule: async () => [],    // phase 3
    routeDetails: async () => null,
    metroStations,                   // MTA_NYC_DATA.stations + lines
    metroLive,                       // GTFS-RT decode + group (below)
    metroPath,                       // patterns
    metroRoutes,                     // MTA_NYC_DATA.routes
    busRouteDirectory,               // routes-for-location (near point), cached
    stopsForRoute, busRoutesForQuery,
    place, connections, connectionsReady: () => true, resetCaches,
  },
  theme: { icons: "nyc", cssVars: { … }, routeColor, routeTextColor: () => "#fff",
           badgeClass: () => "",
           metroColor, metroName, isCommuter },
});
```

* `departures()` = Bus Time SIRI → `{min, route, dir/heads, dirNum, trip}`.
  Reuse DC's dedupe-by-trip/vehicle and the **terminating-at-this-stop drop**
  (destination == `MonitoringRef`).
* `metroLive(codes)` = for each station, collect its lines → set of feeds → fetch
  each feed once (cached), scan `trip_update.stop_time_update` for the station's
  parent id, emit predictions. One feed serves every station on its lines.
* `metroStations()` returns parent stations with their line bullets; MNR/LIRR
  stations get `commuter: true` so the existing orange "Next train" style applies.

## 7. NYC vs Metro-North / LIRR (the geographic question)

Recommendation: **one city, geographic scoping — not a separate "Metro-North" city.**

1. MNR/LIRR are MTA feeds that share the same GTFS-RT host and stop model; a
   separate city would duplicate the subway at Grand Central/Penn/Atlantic and
   force the user to switch cities to ride one railroad.
2. Model them as **commuter lines in `metro` mode** (`isCommuter()` true), exactly
   as Boston does with commuter rail. The hero already says "Next train" and the
   commuter circle icon exists.
3. Keep the **whole** MNR/LIRR network in `MTA_NYC_DATA` so patterns and
   "Next stops…" resolve to Poughkeepsie, New Haven, Montauk, etc. but scope the
   *surfaces*:
   * `nearbyStops()` radius stays 1,000 ft — a user physically in Yonkers or
     White Plains still gets their station; a Manhattan user never sees
     Westchester in "Near me".
   * the station search lists everything, sorted by distance from the current
     point; stations outside the NYC bbox (40.477–40.917 N, −74.26–−73.70 W) get
     an "Outside NYC" chip when they are far from the centre.
   * airport defaults and the default like are NYC-core only.
4. Do **not** pull in NJT/PATH to "complete" the region: NJT publishes no realtime
   API, PATH has no open GTFS-RT. If that changes, the city registry can later grow
   a `region` concept (multi-provider), which is a bigger change than NYC itself.
5. Shared complexes (Penn, Grand Central, Atlantic Av–Barclays) stay separate stop
   ids; the existing 1,000 ft nearby/connection logic already models the walking
   transfer, and the connection chips make it visible.

## 8. Performance budget

A board at Times Sq touches 4 subway feeds (123, 7, NQRW, ACE) ≈ 1.5 MB/refresh if
naive. Mitigate:

* fetch per feed with a 45–60 s TTL + in-flight dedupe (`MTA.http` memo is 6 s;
  add a per-provider `feedCache`), so the 30 s board tick usually re-parses
  nothing or one group;
* abort superseded requests (`boardToken` pattern already used);
* prefer one feed per nearby complex, not per station;
* add `responseType: "arraybuffer"` to `MTA.http.get` (`js/core/http.js` is
  JSON-only today) and decode with `js/core/gtfsrt.js`;
* optional later: protobuf gzip is already handled by the browser's
  `content-encoding`; no manual inflate needed.

## 9. Files

| File | Change |
|---|---|
| `js/cities/nyc.js` | new adapter + theme (~600 lines) |
| `js/cities/nyc-data.js` | generated stations/routes/patterns |
| `js/core/gtfsrt.js` | new protobuf wire decoder |
| `js/core/http.js` | binary response mode |
| `js/cities/index.js` | registered city appears automatically; no change beyond load order |
| `mta26.html` | add `<script>` tags, `NYC_BUS_KEY_BLOB` + decrypt in `unlockAccess`, city `<option>` is generated from the registry |
| `js/ui/icons.js` | `nyc` mode icon (neutral subway glyph; no MTA roundel) |
| `scripts/build-nyc-data.mjs` | static GTFS → `nyc-data.js` |
| `test/nyctest.js` | provider contract + GTFS-RT decode + terminus headsign + terminating drop |
| `test/citypagetest.js` | `?city=nyc` full-page smoke (stubbed feeds) |
| `README.md`, `TODO.md` | NYC section, data/key notes, brand note |

## 10. Phases

1. **P0 — subway board (done).** GTFS-RT decoder, static data script, `metroLive`
   for subway + SIR, station list, nearest-station default. Keyless; no bus.
   Shipped as: `js/core/gtfsrt.js`, `js/cities/nyc-data.js` (496 stations, 29 routes,
   214 ordered patterns), `js/cities/nyc.js`, `scripts/build-nyc-data.mjs`,
   `test/nyctest.js`, plus a `?city=nyc` smoke in `citypagetest.js`. The Bus section
   hides and the city starts in Metro mode; route badges and the hero badge expand
   "Next stops…" from the stored patterns.
2. **P1 — buses.** Bus Time key blob + `departures`, nearby stops, route panel,
   terminating drop.
3. **P2 — LIRR + MNR (done).** Rail route names and colours from the static GTFS,
   namespaced station/route ids (`LIRR:`/`MNR:`), commuter styling (circular mode icon,
   railcar-gapped band, "train" phrasing), ordered patterns for "Next stops…", the
   "Outside NYC" chip on stations beyond the bbox, and JFK airport links (A to Howard
   Beach, LIRR to Jamaica). Verified against the live feeds: Grand Central, Jamaica and
   Poughkeepsie all return typed rows with terminus headsigns.
4. **P3 — polish.** Alerts feed as a board banner, scheduled fallback from static
   GTFS, `place()` for maps, elevator/accessibility notes.

## 11. Acceptance tests

* `?city=nyc&busstop=…` renders hero + rows from a stubbed subway feed, with
  route bullets in the MTA colours and `#111` text on the yellow N/Q/R/W badge.
* A trip whose last stop is the shown station is not displayed.
* Headsign equals the terminus name (e.g. "Van Cortlandt Park–242 St"), not a
  trip descriptor field.
* Times Sq board fetches only the four relevant feeds (assert fetch count).
* MNR/LIRR station outside the bbox is searchable, not in a Manhattan "Near me".
* No MTA key required for rails; a missing Bus Time key surfaces as an error state,
  not a broken page.

## 12. Open questions

1. Register the Bus Time key now or ship P0 rail-only? (Rail needs no key.)
2. Is 60 s polling acceptable for NYC, or keep 30 s and accept ~1.5 MB/refresh at
   the busiest complexes?
3. Include the full MNR/LIRR network in search, or clip static data to the NYC
   bbox and lose through-service patterns?
