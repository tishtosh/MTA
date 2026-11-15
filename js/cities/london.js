// ── London adapter (TfL Unified API) ─────────────────────────────────
// The TfL key is optional for low-volume use; add it later by setting
// TFL_KEY (or TFL_KEY_BLOB) in mta26.html. Endpoints used here:
//   /StopPoint?lat=&lon=&radius=       nearby stops
//   /StopPoint/{id}                    one stop/station
//   /StopPoint/{id}/Arrivals           all modes at a station
//   /Line/{id}/Route/Sequence/{dir}    ordered pattern
//   /Line/Mode/{modes}                 line metadata
//   /Line/Mode/bus                     bus route directory
//   /StopPoint/Mode/{modes}            rail stations
(function () {
    "use strict";
    window.MTA = window.MTA || {};

    const API = "https://api.tfl.gov.uk";

    function tflGet(path, query, timeoutMs) {
        return MTA.http.get({
            url: API + path,
            query: query || {},
            key: typeof TFL_KEY !== "undefined" ? TFL_KEY : "",
            keyParam: "app_key",
            timeoutMs: timeoutMs || 15000,
            memoize: !/\/Arrivals/i.test(path),
            headers: { "User-Agent": "like-a-bus/1.0" },
        });
    }

    const LINE_COLORS = {
        bakerloo: "#B36305", central: "#E32017", circle: "#FFD300",
        district: "#00782A", "hammersmith-city": "#F3A9BB", jubilee: "#A0A5A9",
        metropolitan: "#9B0056", northern: "#000000", piccadilly: "#003688",
        victoria: "#0098D4", "waterloo-city": "#95CDBA",
        elizabeth: "#6950A1", "elizabeth-line": "#6950A1",
        overground: "#EE7C0E", "london-overground": "#EE7C0E",
        dlr: "#00A4A7", tram: "#84B817",
    };
    const LINE_NAMES = {
        bakerloo: "Bakerloo", central: "Central", circle: "Circle",
        district: "District", "hammersmith-city": "Hammersmith & City",
        jubilee: "Jubilee", metropolitan: "Metropolitan", northern: "Northern",
        piccadilly: "Piccadilly", victoria: "Victoria",
        "waterloo-city": "Waterloo & City", elizabeth: "Elizabeth line",
        "elizabeth-line": "Elizabeth line", overground: "Overground",
        "london-overground": "Overground", dlr: "DLR", tram: "Tram",
    };
    const RAIL_MODES = new Set([
        "tube", "overground", "dlr", "elizabeth-line", "tram", "national-rail",
    ]);

    function parseTflTime(value) {
        if (!value) return NaN;
        return Date.parse(String(value).replace(/(\.\d{3})\d+/, "$1"));
    }

    function placeFromStop(s) {
        return {
            StopID: String(s.naptanId || s.id || s.stopPointId || ""),
            Name: s.commonName || s.name || s.stopName || "",
            Lat: Number(s.lat),
            Lon: Number(s.lon),
            Routes: ((s.lines || []).map(l => l.name || l.id).filter(Boolean)),
            modes: (s.modes || []).slice(),
        };
    }

    async function nearbyStops(lat, lon, radius) {
        const { data, error } = await tflGet("/StopPoint", {
            lat, lon, radius,
            stopTypes: "NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation",
        });
        if (error) throw error;
        return ((data && data.stopPoints) || [])
            .map(placeFromStop)
            .filter(s => s.StopID && Number.isFinite(s.Lat) && Number.isFinite(s.Lon));
    }

    // TfL has ~20k bus stops and no compact dump; a whole-mode request is
    // tens of MB. The directory stays empty and the route picker asks for a
    // single line's stops on demand.
    async function allStops() {
        return [];
    }

    const routeStopCache = new Map();

    async function stopsForRoute(routeId) {
        const key = String(routeId || "");
        if (!key) return [];
        const hit = routeStopCache.get(key);
        const ttl = typeof TOPOLOGY_TTL_MS !== "undefined" ? TOPOLOGY_TTL_MS : 86400000;
        if (hit && Date.now() - hit.at <= ttl) return hit.stops;
        const { data, error } = await tflGet(
            `/Line/${encodeURIComponent(key)}/StopPoints`, {}, 30000);
        if (error) throw error;
        const stops = (Array.isArray(data) ? data : [])
            .map(s => ({
                StopID: String(s.naptanId || s.id || ""),
                Name: s.commonName || s.name || "",
                Lat: Number(s.lat), Lon: Number(s.lon),
                Routes: [key.toUpperCase()],
            }))
            .filter(s => s.StopID && Number.isFinite(s.Lat) && Number.isFinite(s.Lon));
        routeStopCache.set(key, { at: Date.now(), stops });
        return stops;
    }

    function toPrediction(a) {
        const at = parseTflTime(a.expectedArrival)
            || parseTflTime(a.timestamp) + Number(a.timeToStation || 0) * 1000;
        if (!Number.isFinite(at)) return null;
        const route = String(a.lineName || a.lineId || "").trim();
        const heads = String(a.destinationName || a.towards || "").trim();
        if (!route) return null;
        return {
            min: Math.max(0, Math.round((at - Date.now()) / 60000)),
            at,
            route,
            routeRef: String(a.lineId || route),
            dir: heads,
            heads,
            dirNum: String(a.direction || a.platformName || ""),
            vehicle: a.vehicleId != null ? String(a.vehicleId) : null,
            trip: a.vehicleId != null ? String(a.vehicleId) : null,
            status: a.timeToStation === 0 ? "Arriving" : "",
            mode: String(a.modeName || ""),
            platform: a.platformName || "",
        };
    }

    async function departures(stopIds) {
        const ids = [...new Set((stopIds || []).map(String).filter(Boolean))];
        const out = new Map();
        await Promise.all(ids.map(async (id) => {
            const { data, error } = await tflGet(
                `/StopPoint/${encodeURIComponent(id)}/Arrivals`);
            if (error) throw error;
            const seen = new Set();
            const preds = [];
            for (const a of (data || [])) {
                const row = toPrediction(a);
                if (!row) continue;
                const key = row.routeRef + "|" + (row.vehicle || row.at);
                if (seen.has(key)) continue;
                seen.add(key);
                preds.push(row);
            }
            preds.sort((a, b) => a.min - b.min || a.route.localeCompare(b.route));
            out.set(id, { name: (data && data[0] && data[0].stationName) || "", predictions: preds });
        }));
        return out;
    }

    async function stopSchedule() {
        return [];
    }

    async function routeDetails(routeId) {
        const line = String(routeId || "");
        if (!line) return null;
        const { data, error } = await tflGet(
            `/Line/${encodeURIComponent(line)}/Route/Sequence/all`);
        if (error || !data) return null;
        const dirs = [];
        const seen = new Set();
        for (const seq of (data.stopPointSequences || [])) {
            const dirNum = String(seq.direction || seq.name || dirs.length);
            if (seen.has(dirNum)) continue;
            const stops = [];
            const seenIds = new Set();
            for (const s of (seq.stopPoint || [])) {
                const id = String(s.naptanId || s.id || s.stopPointId || "");
                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);
                stops.push({
                    id,
                    name: s.name || s.commonName || s.stopName || "",
                    lat: Number(s.lat), lon: Number(s.lon),
                });
            }
            if (!stops.length) continue;
            seen.add(dirNum);
            const last = stops[stops.length - 1];
            dirs.push({
                route: line, dirNum,
                heads: last.name, dirText: seq.name || seq.direction || "",
                stops, shape: [],
                byId: Object.fromEntries(stops.map(s => [s.id, s])),
            });
        }
        if (!dirs.length) return null;
        return { route: line, name: themeName(line), directions: dirs };
    }

    async function busRouteDirectory() {
        const { data, error } = await tflGet("/Line/Mode/bus", {}, 30000);
        if (error) throw error;
        return (Array.isArray(data) ? data : [])
            .map(r => ({
                id: String(r.id || "").toUpperCase(),
                name: r.name || r.id || "",
                desc: r.name || "Bus route",
            }))
            .filter(r => r.id)
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }

    async function metroRoutes() {
        const { data, error } = await tflGet(
            "/Line/Mode/tube,overground,dlr,elizabeth-line,tram");
        if (error) throw error;
        const map = {};
        for (const r of (Array.isArray(data) ? data : [])) {
            map[r.id] = {
                name: r.name || themeName(r.id),
                color: String(LINE_COLORS[r.id] || "#5d4037").replace(/^#/, ""),
                type: 0,
                destinations: [],
            };
        }
        return map;
    }

    async function metroStations() {
        // The whole-mode StopPoint dump is >16 MB for the Tube alone. Ask
        // each line for its own (small) stop list instead and merge them.
        const lines = await metroRoutes();
        const order = Object.keys(lines);
        const found = new Map();
        let next = 0;
        async function worker() {
            while (next < order.length) {
                const line = order[next++];
                const { data, error } = await tflGet(
                    `/Line/${encodeURIComponent(line)}/StopPoints`, {}, 30000);
                if (error) continue;
                for (const s of (Array.isArray(data) ? data : [])) {
                    if (s.stopType && !/Station$/i.test(String(s.stopType))) continue;
                    const code = String(s.naptanId || s.id || "");
                    if (!code) continue;
                    let st = found.get(code);
                    if (!st) {
                        st = {
                            Code: code,
                            Name: s.commonName || s.name || "",
                            Lat: Number(s.lat), Lon: Number(s.lon),
                            Lines: [], distFt: null,
                        };
                        found.set(code, st);
                    }
                    if (!st.Lines.includes(line)) st.Lines.push(line);
                }
            }
        }
        // Keep the burst under the keyless per-minute budget.
        await Promise.all([0, 1, 2, 3].map(worker));
        const list = [...found.values()]
            .filter(s => s.Code && Number.isFinite(s.Lat) && Number.isFinite(s.Lon));
        for (const st of list)
            st.Lines.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        return list;
    }

    async function metroLive(codes) {
        const out = {};
        await Promise.all((codes || []).map(async (code) => {
            const { data, error } = await tflGet(
                `/StopPoint/${encodeURIComponent(code)}/Arrivals`);
            if (error) return;
            out[code] = (data || [])
                .filter(a => RAIL_MODES.has(String(a.modeName || "")))
                .map(toPrediction)
                .filter(Boolean)
                .sort((a, b) => a.min - b.min);
        }));
        return out;
    }

    async function metroPath(from, to, line) {
        const details = await routeDetails(line);
        for (const dir of (details && details.directions) || []) {
            const ids = dir.stops.map(s => String(s.id));
            const a = ids.indexOf(String(from)), b = ids.indexOf(String(to));
            if (a < 0 || b < 0) continue;
            const slice = a <= b ? ids.slice(a, b + 1) : ids.slice(b, a + 1).reverse();
            return slice.map(id => {
                const s = dir.byId[id] || {};
                return { StationCode: id, StationName: s.name || id };
            });
        }
        return [];
    }

    async function place(id) {
        const { data } = await tflGet(`/StopPoint/${encodeURIComponent(id)}`)
            .catch(() => ({ data: null }));
        if (!data) return null;
        const s = Array.isArray(data) ? data[0] : data;
        return {
            id: String(id),
            name: s.commonName || s.name || "",
            lat: Number(s.lat), lon: Number(s.lon),
        };
    }

    async function connections(kind, id) {
        const out = { bus: [], metro: [] };
        const { data } = await tflGet(`/StopPoint/${encodeURIComponent(id)}`)
            .catch(() => ({ data: null }));
        if (!data) return out;
        const s = Array.isArray(data) ? data[0] : data;
        for (const l of (s.lines || [])) {
            const modes = (l.modes || []).map(String);
            if (modes.includes("bus")) out.bus.push(String(l.name || l.id).toUpperCase());
            else out.metro.push(String(l.id || l.name));
        }
        // TfL does not attach bus routes to rail stations in every response:
        // fall back to the arrival feed's line names.
        if (!out.bus.length) {
            const { data: arrivals } = await tflGet(
                `/StopPoint/${encodeURIComponent(id)}/Arrivals`).catch(() => ({ data: null }));
            for (const a of (arrivals || []))
                if (String(a.modeName) === "bus") out.bus.push(String(a.lineName || "").toUpperCase());
        }
        out.bus = [...new Set(out.bus)].slice(0, 6);
        out.metro = [...new Set(out.metro)].slice(0, 6);
        return out;
    }

    function themeName(lineId) {
        const key = String(lineId || "").toLowerCase();
        return LINE_NAMES[key] || String(lineId || "");
    }

    function metroColor(line) {
        return LINE_COLORS[String(line || "").toLowerCase()] || "#5d4037";
    }

    function routeColor(routeId) {
        const key = String(routeId || "").toLowerCase();
        if (LINE_COLORS[key]) return LINE_COLORS[key];
        return "#DC241F";                       // London bus red
    }

    MTA.registerCity({
        id: "london",
        name: "London",
        agency: "TfL",
        locale: "en-GB",
        timezone: "Europe/London",
        center: { lat: 51.5074, lon: -0.1278 },
        metroCenter: { lat: 51.5154, lon: -0.1410 },
        nearbyLabel: "central London",
        nearbyByDefault: true,
        defaultStopId: "940GZZLUOXC",
        storageKey: "london",
        keyOptional: true,
        defaultFavorite: {
            kind: "metro", id: "940GZZLUOXC",
            name: "Oxford Circus Underground Station", route: "victoria",
        },
        airportDefaults: {
            bus: [],
            metro: [{ id: "940GZZLUHRC", name: "Heathrow Terminals 2 & 3", route: "piccadilly" }],
        },
        labels: {
            nextBus: "Next bus", nextTrain: "Next train",
            stop: "stop", station: "station", towards: "towards", platform: "Platform",
        },
        capabilities: {
            batchDepartures: false,
            scheduleFallback: false,
            patterns: true,
            rail: true,
            railPath: true,
            metroRoutes: true,
            metroGtfs: false,
            vehicles: false,
            routeStopsOnDemand: true,
        },
        provider: {
            http: tflGet,
            nearbyStops, allStops, stopsForRoute, departures, stopSchedule, routeDetails,
            metroStations, metroRoutes, metroLive, metroPath,
            busRouteDirectory, place, connections, connectionsReady: () => true,
        },
        theme: {
            icons: "london",
            cssVars: {
                "--city-accent": "#0019a8",
                "--badge-radius": "2px",
                "--hero-bus-bg": "#f2d7d5",
                "--hero-bus-color": "#5a1a16",
                "--hero-metro-bg": "#dbe4f7",
                "--hero-metro-color": "#14225c",
            },
            routeColor,
            routeTextColor: () => "#fff",
            badgeClass: () => " london-bus",
            metroColor,
            metroName: themeName,
            isCommuter: () => false,
            metroLineIds: () => [
                "bakerloo", "central", "circle", "district", "hammersmith-city",
                "jubilee", "metropolitan", "northern", "piccadilly", "victoria",
                "waterloo-city", "elizabeth", "overground", "dlr", "tram",
            ],
        },
    });
})();
