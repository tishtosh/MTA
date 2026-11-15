// ── Washington DC adapter (WMATA) ────────────────────────────────────
// Provider = endpoints + response normalization only. The page keeps the
// caches, refresh tiers, and rendering; it calls these methods through the
// city registry.
(function () {
    "use strict";
    window.MTA = window.MTA || {};

    const API = "https://api.wmata.com";

    function dcGet(path, query, timeoutMs) {
        return MTA.http.get({
            url: API + path,
            query,
            key: typeof API_KEY !== "undefined" ? API_KEY : "",
            keyParam: "api_key",
            timeoutMs: timeoutMs || 12000,
            memoize: !/jPredictions|GetPrediction/i.test(path),
        });
    }

    function normalizeMetroStation(s) {
        const lines = [s.LineCode1, s.LineCode2, s.LineCode3, s.LineCode4].filter(Boolean);
        return {
            Code: String(s.Code || ""), Name: s.Name || "",
            Lat: Number(s.Lat), Lon: Number(s.Lon), Lines: lines, distFt: null,
        };
    }

    // WMATA route details → the board's pattern shape. Kept global because
    // the pure board tests extract this function by name.
    function normalizeRouteDetails(routeId, raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const route = String(raw.RouteID || routeId || "").toUpperCase();
        const dirs = [];
        [raw.Direction0, raw.Direction1].forEach((d, i) => {
            (Array.isArray(d) ? d : (d && typeof d === "object" ? [d] : [])).forEach((dd) => {
                if (!dd || typeof dd !== "object") return;
                const stops = [];
                const seenS = new Set();
                (Array.isArray(dd.Stops) ? dd.Stops : []).forEach((s) => {
                    if (!s || !s.StopID) return;
                    const k = String(s.StopID);
                    if (seenS.has(k)) return;
                    seenS.add(k);
                    stops.push({
                        id: k, name: String(s.Name || "") || allStopsName(k),
                        lat: Number(s.Lat), lon: Number(s.Lon),
                    });
                });
                if (!stops.length) return;
                const shape = (Array.isArray(dd.Shape) ? dd.Shape : [])
                    .filter(s => s && Number.isFinite(Number(s.Lat)) && Number.isFinite(Number(s.Lon)))
                    .sort((a, b) => (Number(a.SeqNum) || 0) - (Number(b.SeqNum) || 0));
                const pts = [], seenP = new Set();
                shape.forEach(pt => {
                    const k = pt.Lat + "|" + pt.Lon;
                    if (seenP.has(k)) return;
                    seenP.add(k);
                    pts.push({ lat: Number(pt.Lat), lon: Number(pt.Lon) });
                });
                dirs.push({
                    route,
                    dirNum: dd.DirectionNum != null ? String(dd.DirectionNum) : String(i),
                    heads: String(dd.TripHeadsign || "").trim(),
                    dirText: String(dd.DirectionText || "").trim(),
                    stops, shape: pts,
                    byId: Object.fromEntries(stops.map(s => [s.id, s])),
                });
            });
        });
        const seenD = new Set();
        const out = [];
        dirs.forEach(d => {
            if (!d.dirNum || seenD.has(d.dirNum)) return;
            seenD.add(d.dirNum);
            out.push(d);
        });
        if (!out.length) return null;
        return { route, name: String(raw.Name || "").trim(), directions: out };
    }

    async function nearbyStops(lat, lon, radius) {
        const { data, error } = await dcGet("/Bus.svc/json/jStops", { Lat: lat, Lon: lon, Radius: radius });
        if (error) throw error;
        return (data && data.Stops) || [];
    }

    async function allStops() {
        const { data, error } = await dcGet("/Bus.svc/json/jStops", {}, 30000);
        if (error) throw error;
        return (data && data.Stops) || [];
    }

    // One stop per request: WMATA has no multi-stop prediction endpoint.
    async function departures(stopIds) {
        const out = new Map();
        const fetchedAt = Date.now();
        await Promise.all([...new Set((stopIds || []).map(String))].map(async (stopId) => {
            const { data, error } = await dcGet(
                "/NextBusService.svc/json/jPredictions", { StopID: stopId });
            if (error) throw error;
            if (!data || !Array.isArray(data.Predictions))
                throw new Error("malformed prediction response");
            const preds = [];
            const seen = new Set();
            for (const p of data.Predictions) {
                const min = Number(p.Minutes);
                if (!Number.isFinite(min) || min < 0) continue;
                const route = String(p.RouteID || "").toUpperCase();
                if (!route) continue;
                const dirNum = p.DirectionNum != null ? String(p.DirectionNum) : "";
                const vehicle = p.VehicleID != null ? String(p.VehicleID) : "";
                const trip = p.TripID != null ? String(p.TripID) : "";
                const dir = String(p.DirectionText || "");
                const key = trip ? route + "|" + trip
                    : vehicle ? route + "|" + vehicle + "|" + dirNum
                        : null;
                if (key !== null) {
                    if (seen.has(key)) continue;
                    seen.add(key);
                }
                preds.push({
                    min, route, routeRef: route, dir, dirNum,
                    heads: String(p.TripHeadsign || "") || dir,
                    vehicle: vehicle || null, trip: trip || null,
                    status: min === 0 ? "Arriving" : "",
                    at: fetchedAt + min * 60000,
                    etaAt: fetchedAt + min * 60000,
                    observedAt: fetchedAt,
                });
            }
            preds.sort((a, b) => a.min - b.min || a.route.localeCompare(b.route));
            // Drop arrivals whose published pattern terminates at this stop.
            // Uses the app's route-details cache when it is warm.
            const terminalDirs = new Set();
            const cache = typeof routeDetailsCache !== "undefined" ? routeDetailsCache : null;
            for (const r of new Set(preds.map(p => p.route))) {
                const details = (cache && cache[r]) || null;
                for (const dir of (details && details.directions) || []) {
                    const last = (dir.stops || [])[dir.stops.length - 1];
                    if (last && String(last.id) === String(stopId))
                        terminalDirs.add(String(dir.dirNum));
                }
            }
            const filtered = terminalDirs.size
                ? preds.filter(p => !terminalDirs.has(String(p.dirNum)))
                : preds;
            out.set(stopId, { name: data.StopName || null, predictions: filtered });
        }));
        return out;
    }

    async function stopSchedule(stopId) {
        const { data, error } = await dcGet(
            "/Bus.svc/json/jStopSchedule", { StopID: stopId });
        if (error) throw error;
        const arrivals = ((data && data.ScheduleArrivals) || []).map(s => ({
            at: new Date(s.ScheduleTime).getTime(),
            route: String(s.RouteID || "").toUpperCase(),
            dirNum: s.DirectionNum != null ? String(s.DirectionNum) : "",
            heads: String(s.TripHeadsign || ""),
            dirText: String(s.TripDirectionText || ""),
        })).filter(s => s.route && Number.isFinite(s.at));
        arrivals.sort((a, b) => a.at - b.at);
        return arrivals;
    }

    async function routeDetails(routeId) {
        const id = String(routeId || "").toUpperCase();
        if (!id) return null;
        const { data, error } = await dcGet(
            "/Bus.svc/json/jRouteDetails", { RouteID: id });
        if (error) return null;
        return normalizeRouteDetails(id, data);
    }

    async function metroStations() {
        const { data, error } = await dcGet("/Rail.svc/json/jStations", {});
        if (error) throw error;
        return ((data && data.Stations) || [])
            .map(normalizeMetroStation)
            .filter(s => s.Code && Number.isFinite(s.Lat) && Number.isFinite(s.Lon));
    }

    async function metroRoutes() {
        return null;
    }

    function metroMin(v) {
        if (v === "BRD" || v === "ARR") return 0;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    async function metroLive(codes) {
        const { data, error } = await dcGet(
            "/StationPrediction.svc/json/GetPrediction/" + codes.join(","), {});
        if (error) throw error;
        const by = {};
        const fetchedAt = Date.now();
        for (const t of (data && data.Trains) || []) {
            const min = metroMin(t.Min);
            const rawMin = String(t.Min || "").trim().toUpperCase();
            const status = rawMin === "BRD" ? "Boarding" : rawMin === "ARR" ? "Arriving" : "";
            const code = String(t.LocationCode || "");
            const line = String(t.Line || "").toUpperCase();
            const dest = t.DestinationName || t.Destination || "";
            if (min == null || !code || !line || line === "NO" || /no passenger/i.test(dest))
                continue;
            const stName = (metroStationsCache || []).find(s => s.Code === code);
            if (dest && ((metroDestCode(dest) === code) ||
                (stName && normHeads(dest) === normHeads(stName.Name)))) continue;
            (by[code] || (by[code] = [])).push({
                min, route: line, routeRef: line,
                dir: dest, heads: dest,
                dirNum: t.Group != null ? String(t.Group) : "",
                vehicle: null, trip: null, status,
                at: fetchedAt + min * 60000,
                etaAt: fetchedAt + min * 60000,
                observedAt: fetchedAt,
            });
        }
        for (const code of Object.keys(by)) by[code].sort((a, b) => a.min - b.min);
        return by;
    }

    async function metroPath(from, to) {
        const { data, error } = await dcGet(
            "/Rail.svc/json/jPath", { FromStationCode: from, ToStationCode: to });
        if (error) throw error;
        return (data && data.Path) || [];
    }

    async function connections(kind, id) {
        const out = { bus: [], metro: [], places: {} };
        const mark = (k, route, stopId, name) => {
            if (route) out.places[k + ":" + String(route).toUpperCase()] = {
                stopId: String(stopId || ""), name: name || "",
            };
        };
        try {
            if (kind === "metro") {
                const st = (metroStationsCache || []).find(s => String(s.Code) === String(id));
                out.metro = st ? (st.Lines || []).slice() : [];
                for (const line of out.metro) mark("metro", line, id, st && st.Name);
                if (st && st.Lat != null && st.Lon != null) {
                    let near = null;
                    if (allStopsCache) {
                        near = allStopsCache.filter(s => s.Lat != null && s.Lon != null &&
                            distance(st.Lat, st.Lon, s.Lat, s.Lon, "f") <= CROSS_CONNECTION_FT);
                    } else {
                        near = await fetchStopsNear(st.Lat, st.Lon,
                            CROSS_CONNECTION_FT / 3.28084).catch(() => []);
                    }
                    for (const s of near || []) {
                        const routes = (s.Routes || []).map(r => String(r).toUpperCase());
                        out.bus.push(...routes);
                        for (const route of routes) mark("bus", route, s.StopID, s.Name);
                    }
                }
            } else {
                const st = (allStopsCache || []).find(s => String(s.StopID) === String(id));
                out.bus = ((st && st.Routes) || []).map(r => String(r).toUpperCase());
                for (const route of out.bus) mark("bus", route, id, st && st.Name);
                if (st && st.Lat != null && st.Lon != null) {
                    const stations = await loadMetroStations().catch(() => []);
                    for (const s of stations) {
                        if (distance(st.Lat, st.Lon, s.Lat, s.Lon, "f") <= CROSS_CONNECTION_FT) {
                            out.metro.push(...(s.Lines || []));
                            for (const line of s.Lines || []) mark("metro", line, s.Code, s.Name);
                        }
                    }
                }
            }
        } catch (e) { /* show no connections on failure */ }
        out.bus = [...new Set(out.bus)].slice(0, 6);
        out.metro = [...new Set(out.metro)].slice(0, 6);
        return out;
    }

    function connectionsReady(kind) {
        return kind === "metro" ? !!metroStationsCache : !!allStopsCache;
    }

    async function busRouteDirectory() {
        const { data, error } = await dcGet("/Bus.svc/json/jRoutes", {});
        if (error) throw error;
        return ((data && data.Routes) || [])
            .map(r => ({
                id: String(r.RouteID || "").toUpperCase(),
                name: r.Name || "",
                desc: r.LineDescription || r.Name || "",
            }))
            .filter(r => r.id)
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }

    const ROUTE_COLORS = ["#c62828", "#1565c0", "#2e7d32", "#ef6c00", "#6a1b9a", "#00838f",
        "#ad1457", "#5d4037", "#455a64", "#827717", "#37474f", "#9e9d24"];

    function routeColor(routeId) {
        let h = 0;
        for (const c of String(routeId || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return ROUTE_COLORS[h % ROUTE_COLORS.length];
    }

    const METRO_COLORS = {
        RD: "#c62828", BL: "#1565c0", OR: "#ef6c00",
        SV: "#6c757d", GR: "#2e7d32", YL: "#9e9d24",
    };
    const METRO_NAMES = {
        RD: "Red", BL: "Blue", OR: "Orange",
        SV: "Silver", GR: "Green", YL: "Yellow",
    };

    MTA.registerCity({
        id: "dc",
        name: "Washington DC",
        agency: "WMATA",
        locale: "en-US",
        timezone: "America/New_York",
        center: { lat: 38.93468, lon: -77.04512 },
        metroCenter: { lat: 38.89790, lon: -77.03661 },
        nearbyLabel: "the Cleveland Park / 20010 corner",
        defaultStopId: "1002135",
        storageKey: "",
        defaultLike: {
            kind: "metro", id: "N10",
            name: "Washington Dulles International Airport", route: "SV",
        },
        airportDefaults: {
            bus: [{ id: "6000892", name: "Crystal Dr+23 St S", route: "A1X" }],
            metro: [
                { id: "C10", name: "Ronald Reagan Washington National Airport", route: "BL" },
                { id: "N10", name: "Washington Dulles International Airport", route: "SV" },
            ],
        },
        labels: { nextBus: "Next bus", nextTrain: "Next train", stop: "stop", station: "station", railSection: "Metro" },
        capabilities: {
            batchDepartures: false,
            scheduleFallback: true,
            patterns: true,
            rail: true,
            railPath: true,
            metroRoutes: false,
            metroGtfs: true,
            vehicles: false,
        },
        provider: {
            http: dcGet,
            nearbyStops, allStops, departures, stopSchedule, routeDetails,
            metroStations, metroRoutes, metroLive, metroPath,
            busRouteDirectory, connections, connectionsReady,
        },
        theme: {
            icons: "dc",
            cssVars: {
                "--city-accent": "#2e7d32",
                "--badge-radius": "5px",
                "--hero-bus-bg": "#d8d8d8",
                "--hero-bus-color": "#2f2f2f",
                "--hero-metro-bg": "#ece1cd",
                "--hero-metro-color": "#46301a",
            },
            routeColor,
            routeTextColor: () => "#fff",
            badgeClass: () => "",
            metroColor: line => METRO_COLORS[String(line || "").toUpperCase()] || "#5d4037",
            metroName: line => METRO_NAMES[String(line || "").toUpperCase()] || String(line || ""),
            isCommuter: () => false,
            metroLineIds: () => ["RD", "GR", "YL", "BL", "OR", "SV"],
        },
    });
})();
