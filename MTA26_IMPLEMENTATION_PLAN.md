# mta26.html bus arrival board

Implement this plan in the existing single-file page. Read `mta26.html` first and use the README for URL examples. The current page has one view with a route diagram, a ticker and an arrivals table. Make the route diagram the primary waiting view. Keep stop search, Home, Locate, explicit stop IDs and the arrivals table working. Use inline CSS, vanilla JavaScript and the existing static hosting setup.

## What the rider should see

Put the chosen stop name and stop ID above the board, followed by a compact “Next bus” summary with route, minutes and destination. Choose the earliest current prediction at the selected stop. Keep the earliest across-street arrival in its own section so a rider waiting at the selected curb can identify their bus immediately. Retire the moving ticker once this summary covers its information.

Draw a horizontal track for each route, direction and destination variant that boards at the stop. Read each row from left to right in the direction of travel. Align every boarding marker to a shared x-coordinate, with a vertical guide through the rows. Put the approaching bus to the left, the boarding stop on the guide, and the terminal on the right. Use an arrow to indicate direction. Put the destination and the next ETA in readable text above the track so both are visible even when the route diagram is scrolled. When there are multiple approaching buses, emphasize the first and list later ETAs in ascending order. Display zero minutes as “Due”.

Illustrative layout. All names and times below are examples.

```text
Selected stop · Park Rd NW + 19 St NW · #1002135
Next bus   C87   3 min   toward Terminal A

C87 toward Terminal A                       3 min · then 14 min
   ○────○────[bus 3 min]────│●│────○────○────◆ Terminal A
D72 toward Terminal B                       8 min
   ○────[bus 8 min]────○────│●│────○─────────◆ Terminal B

Across the street · Park Rd NW + 19 St NW · #1002130
C87 toward Terminal C                       5 min
   ○────○────[bus 5 min]────│●│────○─────────◆ Terminal C
```

Use a quiet, high-contrast surface, saturated route accents, muted stop dots and large tabular ETA numerals. Use one scale and boarding x-coordinate across both curb sections. On narrow screens show the boarding marker and immediate approach by default, with a shared horizontal scroll area for the tracks. Keep route, ETA and destination readable in the viewport. Use the existing SVG rendering approach. Each stop dot represents an ordered stop occurrence. Selecting a dot by tap, click or keyboard should reveal the stop name and ID. Add a “View all stops” disclosure for each pattern with an ordered list, marking the boarding stop and terminal. Keep every stop accessible when dots overlap. Use a clear focus indicator and respect reduced motion.

## 1. Verify and normalize the data

- Keep `fetchPredictions` as the ETA source. Retain `TripID` alongside `VehicleID`, route, destination and minutes. Normalize IDs as strings and preserve legitimate zero-minute arrivals. Treat missing or malformed minutes as unavailable. Index predictions by exact boarding `StopID`. Deduplicate within a stop and trip, using vehicle plus route and destination when the trip is missing. Keep predictions with missing IDs eligible for the ETA list.
- Verify the WMATA Bus Route and Stop Methods operations for route details and vehicle positions. Test the route-details JSON endpoint commonly named `/Bus.svc/json/jRouteDetails` and the positions endpoint commonly named `/Bus.svc/json/jBusPositions`. Check the actual field names, current route IDs, stop ordering, timestamps, browser CORS and key access on localhost using the existing `apiGet` wrapper. Save small sanitized fixtures for local verification if needed. WMATA documents bus positions and GTFS feeds, but browser access and payloads for these operations have yet to be verified in this workspace. [WMATA API catalog](https://developer.wmata.com/apis) · [WMATA developer resources](https://www.wmata.com/about/developers.html)
- Normalize ordered route paths into records containing route ID, direction, headsign, stable pattern key, stop occurrences and optional shape points. Use exact stop ID membership and retain repeated occurrences on loops. Treat `jStops` as a stop directory and nearby lookup. Retire `collapse`, `twoSidedWalk` and `destMatch` from the boarding diagram. If route details lack a needed branch, use official trip-level GTFS data if already available to the page, or show the live destination and ETA in a compact row with “Route details unavailable”. Keep the first implementation on the existing browser API path.
- Match each prediction to a pattern serving the boarding stop by authoritative trip mapping where available, then by a unique exact route and normalized headsign match. Use `DirectionText` for the live destination when supplied. Keep a short turn or unresolved variant as its own ETA row when the exact path is unknown. Use the matched path terminal for the terminal marker and route-service rows with no predictions.

## 2. Resolve the boarding stops

- In `anchorStop` and `renderLines`, start with the selected stop ID, including a single-stop deep link. Use the existing nearest-stop default when there is no selection. Resolve stop metadata from the nearby results or the directory. A failed directory request must still allow the selected stop's arrival summary to render.
- Look for opposite-side candidates within about 100 m of the boarding stop using the nearby results or one cached nearby lookup centered on that stop. Require a matching street or intersection, at least one shared route, and evidence from the ordered paths that the stops board opposing directions on the same corridor. Use travel bearings from adjacent path points when needed. Exclude same-direction bays, successive stops along the same street, and unrelated stops at a nearby intersection. Validate the example pair in the README against the actual feed before using it as a live example.
- When a single opposite-side stop is supported by the data, label it “Across the street” and give it its own named section, exact ID, route rows and prediction requests. Include every route that boards there, including routes absent from the primary stop. If the evidence is ambiguous, retain the primary board and let riders select the other stop through the existing lookup. Treat multiple IDs in a URL as explicit requests and preserve their arrivals in the table. Keep the first explicit ID as the default board anchor when nothing is selected.

## 3. Draw stop and bus positions

- In `linesSvg` and `lineRow`, replace the fixed time bands with a schematic of signed along-route distance from the boarding occurrence. Use cumulative shape distance when stop projections follow the published stop order. Otherwise accumulate straight-line distances between consecutive ordered stops. Use the same pixels-per-distance scale on all rows and a shared x-origin for the boarding marker. Derive the horizontal extent from the longest approach and onward path. Give short or terminal-only routes a minimum visual extent around the marker. Put a distinct terminal diamond at the actual terminal occurrence and label its destination in the row header. Keep the boarding and terminal markers legible when they refer to the same stop.
- Fetch positions in a shared request for the relevant routes where supported, with the same bounded cadence as predictions. Join positions to upcoming predictions using vehicle ID and verify route and trip when supplied. Reject stale samples and ambiguous matches. Project a fresh position to the matched route shape or consecutive stop segments, then interpolate its x-coordinate using the same distance scale as the dots. Require a plausible match to an upstream segment. Use the previous matched segment to disambiguate a loop only when the vehicle and trip still match. If a feed reports a reliable downstream position, retain the ETA as a status item and avoid drawing an approaching marker for that sample.
- If a position is missing and the upstream path is known, a hollow “Estimated position” marker may use ETA × the existing 8 mph approximation, clamped to the first upstream stop. A zero-minute estimate sits on the boarding guide. If the path is unknown, show ETA and headsign alone. Live ETA always comes from the boarding stop's prediction. Report approximate spacing and estimated bus positions in a short legend where applicable.
- Keep the diagram and focused stop controls stable during refreshes. Update marker positions by trip or vehicle key and animate only between accepted samples. Allow an ETA correction to move an estimate back. Remove predictions that disappear from a successful refresh without animating those buses past the stop. Stack overlapping bus labels or keep only the first ETA on the track and show the remaining values in the row header.

## 4. Integrate refresh and failure states

- Extend `refreshPredictions` to build a deduplicated request set from `shownStops()` plus the confirmed opposite-side ID. Feed the table from `shownStops()` and the board from the exact primary and opposite-side stop IDs. Cache route metadata per route for the session and share in-flight metadata requests. Reuse `apiGet`, the refresh interval and the existing rate-limit backoff for new calls. Stop-dot interactions can reuse cached metadata and should require no arrival polling.
- Use a selection version or equivalent guard across stop changes, clearing search, Home and Locate. Ignore late results from older selections. Coalesce simultaneous timer, visibility and selection refreshes for the same selection. A newly confirmed counterpart should get its first predictions promptly.
- Distinguish loading, a successful empty response (“No upcoming predictions”), an unavailable prediction, and a last-known prediction with a stale timestamp. On a partial failure keep the other stop usable. Suppress movement for stale data and avoid ranking stale ETAs in “Next bus”. Render feed strings with `textContent` or the existing `esc` helper as appropriate.

## Acceptance checks for OpenCode and Qwen

1. Serve with `python3 -m http.server 8000` and open `http://localhost:8000/mta26.html`. Inspect the board at a desktop width and a 360 px viewport. Confirm that the chosen stop, next ETA and destination are visible immediately and the tracks share a boarding column.
2. Test selecting a stop, clearing it, Home, Locate and single- and multiple-stop deep links. Use `?busstop=1002135` and `?busstop=1002135,1002130` if those IDs still resolve. Verify the opposite-side grouping against a confirmed pair. Also test a nearby same-direction stop and an ambiguous intersection.
3. Check with controlled responses for two approaching buses, a due bus, an ETA increase, a bus that disappears, a branch or short turn, a repeated stop ID and a missing vehicle ID. Check that stop order matches the data and the same route at two curbs receives the correct independent ETAs. Tab to a stop, open its details with the keyboard, and confirm focus survives a refresh.
4. Simulate unavailable route details, missing and stale positions, empty predictions, a one-sided failure, a 429, and switching stops while old requests are pending. Confirm the board remains readable and no prior stop's data leaks into the new selection.
5. Verify from the Network panel that prediction requests are deduplicated per stop, route metadata is reused, and position requests stay bounded. Report which WMATA payloads were verified in the browser and which fallback paths were exercised with fixtures.
