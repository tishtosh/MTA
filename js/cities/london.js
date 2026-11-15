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

    // TfL colour references (RGB values from the London Underground and
    // mode colour sheets). Keep these in sync with the brand guide.
    const LINE_COLORS = {
        bakerloo: "#B26300", central: "#DC241F", circle: "#FFC80A",
        district: "#007D32", "hammersmith-city": "#F589A6", jubilee: "#838D93",
        metropolitan: "#9B0058", northern: "#000000", piccadilly: "#0019A8",
        victoria: "#039BE5", "waterloo-city": "#76D0BD",
        elizabeth: "#60399E", overground: "#FA7B05", dlr: "#00AFAD",
        tram: "#5FB526",
        bus: "#DC241F", "cable-car": "#DC241F", coaches: "#FFA600",
        "dial-a-ride": "#C028B9", "river-services": "#039BE5",
        "santander-cycles": "#EC0000", underground: "#0019A8",
    };
    const LINE_NAMES = {
        bakerloo: "Bakerloo", central: "Central", circle: "Circle",
        district: "District", "hammersmith-city": "Hammersmith & City",
        jubilee: "Jubilee", metropolitan: "Metropolitan", northern: "Northern",
        piccadilly: "Piccadilly", victoria: "Victoria",
        "waterloo-city": "Waterloo & City", elizabeth: "Elizabeth line",
        overground: "London Overground", dlr: "DLR", tram: "London Trams",
        bus: "London Buses", "cable-car": "London Cable Car",
        coaches: "London Coaches", "dial-a-ride": "London Dial-a-Ride",
        "river-services": "London River Services",
        "santander-cycles": "Santander Cycles", underground: "London Underground",
    };
    const LINE_ALIASES = {
        "london overground": "overground",
        "docklands light railway": "dlr",
        "elizabeth": "elizabeth",
        "elizabeth line": "elizabeth",
        "london trams": "tram",
        "london buses": "bus",
        "london river services": "river-services",
        "london cable car": "cable-car",
        "london coaches": "coaches",
        "london dial-a-ride": "dial-a-ride",
        "santander cycles": "santander-cycles",
        "hammersmith & city": "hammersmith-city",
        "waterloo & city": "waterloo-city",
        "london underground": "underground",
    };

    function lineKey(lineId) {
        let key = String(lineId || "").toLowerCase().trim();
        if (!key) return "";
        key = key.replace(/\s+underground station$/, "").replace(/\s+line$/, "");
        return LINE_ALIASES[key] || key;
    }

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

    // Bus stop-name search: TfL's search returns stop ids without routes, so
    // batch-fetch the stop details and group their bus routes.
    async function busRoutesForQuery(query) {
        const q = String(query || "").trim();
        const byRoute = new Map();
        if (q.length < 3) return byRoute;
        const { data, error } = await tflGet(
            `/StopPoint/Search/${encodeURIComponent(q)}`, { modes: "bus" });
        if (error) return byRoute;
        const matches = (data && data.matches) || [];
        const ids = matches.slice(0, 12).map(m => m.id).filter(Boolean);
        if (!ids.length) return byRoute;
        const { data: details } = await tflGet(
            `/StopPoint/${ids.map(encodeURIComponent).join(",")}`);
        const stops = Array.isArray(details) ? details : (details ? [details] : []);
        for (const s of stops) {
            const stopModes = new Set((s.modes || []).map(m => String(m).toLowerCase()));
            const stop = {
                StopID: String(s.naptanId || s.id || ""),
                Name: s.commonName || s.name || "",
                Lat: Number(s.lat), Lon: Number(s.lon), Routes: [],
            };
            if (!stop.StopID) continue;
            for (const l of (s.lines || [])) {
                if (!isBusLine(l, stopModes)) continue;
                const route = String(l.name || l.id).toUpperCase();
                if (!route) continue;
                if (!byRoute.has(route)) byRoute.set(route, []);
                const list = byRoute.get(route);
                if (!list.some(x => x.StopID === stop.StopID)) {
                    stop.Routes = [route];
                    list.push({ ...stop, Routes: [route] });
                }
            }
        }
        return byRoute;
    }

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
            etaAt: at,
            observedAt: parseTflTime(a.timestamp) || Date.now(),
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
        // Route/Sequence returns branches as separate segments, and the
        // current routeDetails() keeps one per direction. Build a small
        // stop graph from the raw segments and BFS so Heathrow/Uxbridge
        // branches still resolve.
        const { data, error } = await tflGet(
            `/Line/${encodeURIComponent(line)}/Route/Sequence/all`);
        if (error || !data) return [];
        const adj = new Map();
        const nodes = new Map();
        for (const seq of (data.stopPointSequences || [])) {
            const stops = seq.stopPoint || [];
            for (let i = 0; i < stops.length; i++) {
                const cur = stops[i];
                const id = String(cur.id || cur.naptanId || cur.stationId || "");
                if (!id) continue;
                nodes.set(id, cur);
                if (i === 0) continue;
                const prev = stops[i - 1];
                const pid = String(prev.id || prev.naptanId || prev.stationId || "");
                if (!pid) continue;
                if (!adj.has(pid)) adj.set(pid, new Set());
                if (!adj.has(id)) adj.set(id, new Set());
                adj.get(pid).add(id);
                adj.get(id).add(pid);
            }
        }
        if (!adj.has(from) || !adj.has(to)) return [];
        const prev = new Map([[from, null]]);
        const queue = [from];
        while (queue.length) {
            const cur = queue.shift();
            if (cur === to) break;
            for (const next of adj.get(cur) || []) {
                if (prev.has(next)) continue;
                prev.set(next, cur);
                queue.push(next);
            }
        }
        if (!prev.has(to)) return [];
        const ids = [];
        for (let cur = to; cur != null; cur = prev.get(cur)) ids.push(cur);
        ids.reverse();
        return ids.map(id => ({
            StationCode: id,
            StationName: (nodes.get(id) && (nodes.get(id).name || nodes.get(id).commonName)) || id,
        }));
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

    // /StopPoint/{id} often returns bus lines without a `modes` array, so
    // classify by the stop's own modes, the known rail line ids, and the
    // numeric/alphanumeric shape of a London bus route.
    function isBusLine(line, stopModes) {
        const modes = (line.modes || []).map(m => String(m).toLowerCase());
        if (modes.includes("bus")) return true;
        if (modes.some(m => RAIL_MODES.has(m))) return false;
        const id = String(line.id || "").toLowerCase();
        if (LINE_COLORS[id]) return false;
        const busShape = /^[a-z]{0,3}\d+[a-z]?$/i;
        if (busShape.test(id) || busShape.test(String(line.name || ""))) return true;
        return stopModes.has("bus") && ![...RAIL_MODES].some(m => stopModes.has(m));
    }

    async function connections(kind, id) {
        const out = { bus: [], metro: [], places: {} };
        const { data } = await tflGet(`/StopPoint/${encodeURIComponent(id)}`)
            .catch(() => ({ data: null }));
        if (!data) return out;
        const s = Array.isArray(data) ? data[0] : data;
        const stopModes = new Set((s.modes || []).map(m => String(m).toLowerCase()));
        const where = { stopId: String(id), name: s.commonName || s.name || "" };
        const mark = (k, route) => {
            if (route) out.places[k + ":" + String(route).toUpperCase()] = where;
        };
        for (const l of (s.lines || [])) {
            if (isBusLine(l, stopModes)) {
                const route = String(l.name || l.id).toUpperCase();
                out.bus.push(route);
                mark("bus", route);
            } else {
                const line = String(l.id || l.name);
                out.metro.push(line);
                mark("metro", line);
            }
        }
        // TfL does not attach bus routes to rail stations in every response:
        // fall back to the arrival feed's line names.
        if (!out.bus.length) {
            const { data: arrivals } = await tflGet(
                `/StopPoint/${encodeURIComponent(id)}/Arrivals`).catch(() => ({ data: null }));
            for (const a of (arrivals || []))
                if (String(a.modeName) === "bus") {
                    const route = String(a.lineName || "").toUpperCase();
                    out.bus.push(route);
                    mark("bus", route);
                }
        }
        out.bus = [...new Set(out.bus)].slice(0, 6);
        out.metro = [...new Set(out.metro)].slice(0, 6);
        return out;
    }

    function themeName(lineId) {
        const key = lineKey(lineId);
        return LINE_NAMES[key] || String(lineId || "");
    }

    function metroColor(line) {
        return LINE_COLORS[lineKey(line)] || "#5d4037";
    }

    function routeColor(routeId) {
        const key = lineKey(routeId);
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
        defaultLike: {
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
            stopSearch: true,
        },
        provider: {
            http: tflGet,
            nearbyStops, allStops, stopsForRoute, busRoutesForQuery, departures, stopSchedule, routeDetails,
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
            bandStyle: "solid",
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
