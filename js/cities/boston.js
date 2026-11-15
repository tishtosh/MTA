// ── Boston adapter (MBTA v3) ─────────────────────────────────────────
// All MBTA JSON:API shape handling lives here. The page supplies caches,
// refresh tiers, and rendering; it reaches these methods via the registry.
(function () {
    "use strict";
    window.MTA = window.MTA || {};

    const API = "https://api-v3.mbta.com";

    function mbtaGet(path, query, timeoutMs) {
        return MTA.http.get({
            url: API + path,
            query: query || {},
            key: typeof MBTA_KEY !== "undefined" ? MBTA_KEY : "",
            keyParam: "api_key",
            timeoutMs: timeoutMs || 15000,
            memoize: !/\/predictions/i.test(path),
        });
    }

    // MBTA's nearby radius is in degrees: 0.02° ≈ 1 mile.
    function mbtaRadiusDeg(meters) {
        return Math.max(0.001, (meters / 1609.344) * 0.02);
    }

    function mbtaIncluded(data) {
        const by = new Map();
        for (const item of (data && data.included) || [])
            by.set(item.type + ":" + item.id, item);
        return by;
    }

    function mbtaStop(s) {
        return {
            StopID: String(s.id),
            Name: (s.attributes && s.attributes.name) || "",
            Lat: Number(s.attributes && s.attributes.latitude),
            Lon: Number(s.attributes && s.attributes.longitude),
            Routes: [],
        };
    }

    function mbtaRouteShort(route, fallback) {
        const a = (route && route.attributes) || {};
        return String(a.short_name || (route && route.id) || fallback || "");
    }

    // ── Static prediction support (terminals + representative trips) ──
    const mbtaTerminalCache = new Map();
    const mbtaTerminalAt = new Map();
    const mbtaPatternCache = new Map();
    const mbtaTripStopCache = new Map();
    const mbtaRouteStopsCache = new Map();
    let mbtaStaticLoaded = false;

    function ensureMbtaStaticCache() {
        if (mbtaStaticLoaded) return;
        mbtaStaticLoaded = true;
        const terminals = typeof readCache === "function" && readCache("terminals");
        if (terminals && Array.isArray(terminals.v)) {
            for (const row of terminals.v) {
                if (!Array.isArray(row) || row.length < 2) continue;
                const key = String(row[0] || "");
                const stops = Array.isArray(row[1]) ? row[1] : [];
                if (!key || !stops.length) continue;
                mbtaTerminalCache.set(key, new Set(stops.map(String)));
                mbtaTerminalAt.set(key, Number(row[2]) || terminals.at || 0);
            }
        }
        const routeStops = typeof readCache === "function" && readCache("mbta_route_stops");
        if (routeStops && Array.isArray(routeStops.v)) {
            for (const row of routeStops.v) {
                if (!Array.isArray(row) || row.length < 2) continue;
                const key = String(row[0] || "");
                const rec = row[1] || {};
                if (!key || !Array.isArray(rec.v) || !rec.v.length) continue;
                mbtaRouteStopsCache.set(key, {
                    at: Number(rec.at) || routeStops.at || 0,
                    groups: rec.v,
                });
            }
        }
    }

    function persistMbtaTerminals() {
        if (typeof writeCache !== "function") return;
        const rows = [];
        for (const [key, set] of mbtaTerminalCache) {
            if (!set || !set.size) continue;
            rows.push([key, [...set], mbtaTerminalAt.get(key) || 0]);
        }
        writeCache("terminals", rows);
    }

    function persistMbtaRouteStops() {
        if (typeof writeCache !== "function") return;
        const rows = [];
        for (const [key, rec] of mbtaRouteStopsCache) {
            if (!rec.groups || !rec.groups.length) continue;
            rows.push([key, { at: rec.at || 0, v: rec.groups }]);
        }
        writeCache("mbta_route_stops", rows);
    }

    function mbtaPredictionStatus(a, now) {
        const st = String((a && a.status) || "").toLowerCase();
        if (/departing|leaving/.test(st)) return "Departing";
        if (/all aboard|boarding|stopped/.test(st)) return "Boarding";
        if (/incoming|arriving|approaching/.test(st)) return "Arriving";
        const arr = Date.parse((a && a.arrival_time) || "");
        const dep = Date.parse((a && a.departure_time) || "");
        if (Number.isFinite(arr) && Number.isFinite(dep) && arr <= now && now <= dep)
            return "Boarding";
        if (Number.isFinite(dep) && dep <= now) return "Departing";
        if (Number.isFinite(arr) && arr <= now) return "Arriving";
        return "";
    }

    async function mbtaPatternsForRoutes(routeIds) {
        ensureMbtaStaticCache();
        const missing = [...new Set((routeIds || []).map(String).filter(Boolean))]
            .filter(id => !mbtaPatternCache.has(id));
        if (!missing.length) return;
        const { data, error } = await mbtaGet("/route_patterns", {
            "filter[route]": missing.join(","),
        });
        if (error) throw error;
        const grouped = new Map(missing.map(id => [id, []]));
        for (const p of (data && data.data) || []) {
            const rel = p.relationships || {};
            const routeId = rel.route && rel.route.data && rel.route.data.id;
            if (!grouped.has(routeId)) continue;
            grouped.get(routeId).push({
                dir: p.attributes.direction_id,
                canonical: !!(p.attributes && p.attributes.canonical),
                name: (p.attributes && p.attributes.name) || "",
                tripId: rel.representative_trip && rel.representative_trip.data
                    ? rel.representative_trip.data.id : null,
            });
        }
        for (const id of missing) mbtaPatternCache.set(id, grouped.get(id) || []);
    }

    async function buildMbtaTerminals(routeIds, useParent) {
        ensureMbtaStaticCache();
        const ids = [...new Set((routeIds || []).map(String).filter(Boolean))];
        const out = new Map();
        if (!ids.length) return out;
        await mbtaPatternsForRoutes(ids);
        const plan = [];
        for (const id of ids) {
            const byDir = new Map();
            for (const p of mbtaPatternCache.get(id) || []) {
                const cur = byDir.get(p.dir);
                if (!cur || (p.canonical && !cur.canonical)) byDir.set(p.dir, p);
            }
            for (const [dir, p] of byDir) {
                if (p.tripId) plan.push({ route: id, dir, tripId: p.tripId });
            }
        }
        const tripIds = [...new Set(plan.map(p => p.tripId))];
        let stopMap = new Map();
        if (tripIds.length) {
            try {
                stopMap = await mbtaTripStopsMany(tripIds, useParent);
            } catch (e) { /* fall back below */ }
        }
        for (const p of plan) {
            if (stopMap.has(p.tripId)) continue;
            const stops = await mbtaTripStops(p.tripId, useParent);
            stopMap.set(p.tripId, stops);
        }
        for (const id of ids) {
            const terminals = new Set();
            for (const p of plan) {
                if (p.route !== id) continue;
                const stops = stopMap.get(p.tripId) || [];
                if (stops.length)
                    terminals.add(`${p.dir}|${stops[stops.length - 1].StopID}`);
            }
            const key = id + ":" + (useParent ? "p" : "s");
            if (terminals.size) {
                mbtaTerminalCache.set(key, terminals);
                mbtaTerminalAt.set(key, Date.now());
            } else {
                mbtaTerminalCache.delete(key);
                mbtaTerminalAt.delete(key);
            }
            out.set(id, terminals);
        }
        persistMbtaTerminals();
        return out;
    }

    async function mbtaTerminalsForRoutes(routeIds, useParent) {
        ensureMbtaStaticCache();
        const ids = [...new Set((routeIds || []).map(String).filter(Boolean))];
        const out = new Map();
        if (!ids.length) return out;
        const ttl = typeof TOPOLOGY_TTL_MS !== "undefined" ? TOPOLOGY_TTL_MS : 86400000;
        const missing = [], stale = [];
        for (const id of ids) {
            const key = id + ":" + (useParent ? "p" : "s");
            const set = mbtaTerminalCache.get(key);
            if (!set) { missing.push(id); continue; }
            out.set(id, set);
            if (Date.now() - (mbtaTerminalAt.get(key) || 0) > ttl) stale.push(id);
        }
        if (missing.length) {
            const built = await buildMbtaTerminals(missing, useParent);
            for (const [id, set] of built) out.set(id, set);
        }
        if (stale.length)
            buildMbtaTerminals(stale, useParent).catch(() => {});
        return out;
    }

    async function mbtaTerminals(routeId, useParent) {
        const map = await mbtaTerminalsForRoutes([routeId], useParent);
        return map.get(String(routeId)) || new Set();
    }

    function mbtaPredictionRow(p, inc, now) {
        const a = p.attributes || {};
        const at = Date.parse(a.departure_time || a.arrival_time || "");
        if (!Number.isFinite(at)) return null;
        const rels = p.relationships || {};
        const routeRel = rels.route && rels.route.data;
        const tripRel = rels.trip && rels.trip.data;
        const stopRel = rels.stop && rels.stop.data;
        const route = inc.get("route:" + (routeRel && routeRel.id));
        const trip = inc.get("trip:" + (tripRel && tripRel.id));
        const dir = Number(a.direction_id) || 0;
        const heads = (trip && trip.attributes && trip.attributes.headsign) ||
            ((route && route.attributes && (route.attributes.direction_destinations || [])[dir]) || "");
        return {
            stopId: (stopRel && stopRel.id) || null,
            pred: {
                min: Math.max(0, Math.round((at - now) / 60000)),
                at,
                route: mbtaRouteShort(route).toUpperCase(),
                routeRef: (routeRel && routeRel.id) || "",
                dir, dirNum: String(dir), heads, dirText: heads,
                vehicle: null,
                trip: (tripRel && tripRel.id) || null,
                status: mbtaPredictionStatus(a, now),
                etaAt: at,
                observedAt: now,
            },
        };
    }

    // MBTA accepts multiple stop IDs in one predictions request.
    async function departures(stopIds) {
        const ids = [...new Set((stopIds || []).map(String).filter(Boolean))];
        const out = new Map();
        if (!ids.length) return out;
        const { data, error } = await mbtaGet("/predictions", {
            "filter[stop]": ids.join(","),
            "filter[route_type]": 3,
            "include": "route,trip,stop",
            "sort": "departure_time",
            "page[limit]": Math.min(1000, Math.max(200, ids.length * 80)),
        });
        if (error) throw error;
        const inc = mbtaIncluded(data);
        const now = Date.now();
        const by = new Map(ids.map(id => [id, []]));
        for (const p of (data && data.data) || []) {
            const row = mbtaPredictionRow(p, inc, now);
            if (!row) continue;
            const sid = row.stopId;
            if (!sid || !by.has(sid)) continue;
            by.get(sid).push(row.pred);
        }
        const routeIds = [...new Set([...by.values()].flat()
            .map(p => p.routeRef).filter(Boolean))];
        let terminals = new Map();
        try {
            terminals = await mbtaTerminalsForRoutes(routeIds, false);
        } catch (e) { /* keep predictions even if terminal filtering fails */ }
        for (const id of ids) {
            const kept = by.get(id).filter(p =>
                !(terminals.get(p.routeRef) || new Set()).has(`${p.dirNum}|${id}`));
            kept.sort((a, b) => a.min - b.min || a.route.localeCompare(b.route));
            out.set(id, { name: allStopsName(id) || "", predictions: kept });
        }
        return out;
    }

    async function nearbyStops(lat, lon, radius) {
        const { data, error } = await mbtaGet("/stops", {
            "filter[latitude]": lat,
            "filter[longitude]": lon,
            "filter[radius]": mbtaRadiusDeg(radius),
            "filter[route_type]": 3,
            "filter[location_type]": "0",
            "page[limit]": 200,
        });
        if (error) throw error;
        return ((data && data.data) || []).map(mbtaStop);
    }

    async function allStops() {
        const out = [];
        for (let offset = 0; offset < 12000; offset += 1000) {
            const { data, error } = await mbtaGet("/stops", {
                "filter[route_type]": 3,
                "filter[location_type]": "0",
                "page[limit]": 1000,
                "page[offset]": offset,
            }, 30000);
            if (error) throw error;
            out.push(...((data && data.data) || []).map(mbtaStop));
            if (!(data && data.links && data.links.next)) break;
        }
        return out;
    }

    async function metroRoutes() {
        const { data, error } = await mbtaGet("/routes", {
            "filter[type]": "0,1,2", "page[limit]": 100,
        });
        if (error) throw error;
        const map = {};
        for (const r of (data && data.data) || []) {
            const type = Number(r.attributes.type);
            const crName = String(r.attributes.long_name || "")
                .replace(/\s+Line$/i, "").trim();
            map[r.id] = {
                name: /^Green-/.test(r.id)
                    ? "Green " + (r.attributes.short_name || r.id.replace(/^Green-/, ""))
                    : type === 2
                        ? (crName || r.id.replace(/^CR-/, ""))
                        : (r.attributes.short_name || r.id),
                color: r.attributes.color || "5d4037",
                type,
                destinations: r.attributes.direction_destinations || [],
            };
        }
        return map;
    }

    async function metroStations() {
        const lines = await metroRoutes();
        const found = new Map();
        await Promise.all(Object.keys(lines).map(async line => {
            const { data, error } = await mbtaGet("/stops", {
                "filter[route]": line,
                "filter[location_type]": 1,
                "page[limit]": 300,
            });
            if (error) return;
            for (const s of (data && data.data) || []) {
                let st = found.get(s.id);
                if (!st) {
                    st = {
                        Code: s.id, Name: s.attributes.name || "",
                        Lat: Number(s.attributes.latitude),
                        Lon: Number(s.attributes.longitude),
                        Lines: [], distFt: null,
                    };
                    found.set(s.id, st);
                }
                if (!st.Lines.includes(line)) st.Lines.push(line);
            }
        }));
        const order = Object.keys(lines);
        const list = [...found.values()]
            .filter(s => s.Code && Number.isFinite(s.Lat) && Number.isFinite(s.Lon));
        for (const st of list)
            st.Lines.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        return list;
    }

    async function metroLive(codes) {
        const { data, error } = await mbtaGet("/predictions", {
            "filter[stop]": codes.join(","),
            "filter[route_type]": "0,1,2",
            "include": "route,trip,stop",
            "page[limit]": 500,
        });
        if (error) throw error;
        const inc = mbtaIncluded(data);
        const now = Date.now();
        const by = {};
        for (const c of codes) by[c] = [];
        for (const p of (data && data.data) || []) {
            const a = p.attributes || {};
            const at = Date.parse(a.departure_time || a.arrival_time || "");
            if (!Number.isFinite(at)) continue;
            const rels = p.relationships || {};
            const stopRel = rels.stop && rels.stop.data;
            const stop = inc.get("stop:" + (stopRel && stopRel.id));
            const parent = stop && stop.relationships && stop.relationships.parent_station
                && stop.relationships.parent_station.data;
            const code = (parent && parent.id) || (stopRel && stopRel.id);
            if (!by[code]) continue;
            const routeRel = rels.route && rels.route.data;
            const route = inc.get("route:" + (routeRel && routeRel.id));
            const tripRel = rels.trip && rels.trip.data;
            const trip = inc.get("trip:" + (tripRel && tripRel.id));
            const heads = (trip && trip.attributes && trip.attributes.headsign) ||
                ((route && route.attributes && (route.attributes.direction_destinations || [])[a.direction_id]) || "");
            by[code].push({
                min: Math.max(0, Math.round((at - Date.now()) / 60000)),
                at,
                route: (routeRel && routeRel.id) || "",
                routeRef: (routeRel && routeRel.id) || "",
                dir: heads, heads, dirNum: String(a.direction_id == null ? "" : a.direction_id),
                vehicle: null, trip: (tripRel && tripRel.id) || null,
                status: mbtaPredictionStatus(a, Date.now()),
                etaAt: at,
                observedAt: now,
            });
        }
        const routes = [...new Set(Object.values(by).flat()
            .map(t => t.route).filter(Boolean))];
        let terminals = new Map();
        try {
            terminals = await mbtaTerminalsForRoutes(routes, true);
        } catch (e) { /* keep predictions even if terminal filtering fails */ }
        for (const c of codes) {
            by[c] = by[c].filter(t =>
                !(terminals.get(t.route) || new Set()).has(`${t.dirNum}|${c}`));
            by[c].sort((a, b) => a.min - b.min);
        }
        return by;
    }

    function mbtaTripStopsFromTrip(tr, useParent) {
        if (!tr || !tr.data) return [];
        const inc = new Map(((tr.included) || [])
            .filter(i => i.type === "stop").map(s => [s.id, s]));
        const rel = tr.data.relationships && tr.data.relationships.stops;
        const out = [], seen = new Set();
        for (const x of ((rel && rel.data) || [])) {
            const s = inc.get(x.id);
            const p = useParent && s && s.relationships && s.relationships.parent_station
                && s.relationships.parent_station.data;
            const id = p ? p.id : x.id;
            if (seen.has(id)) continue;
            seen.add(id);
            const station = useParent && (metroStationsCache || []).find(st => st.Code === id);
            out.push({
                StopID: id,
                Name: (station && station.Name) ||
                    (s && s.attributes && s.attributes.name) || allStopsName(id) || id,
            });
        }
        return out;
    }

    async function fetchMbtaTripStopsRemote(tripId, useParent) {
        const { data: tr, error } = await mbtaGet(`/trips/${tripId}`, { include: "stops" });
        if (error || !tr) return [];
        const out = mbtaTripStopsFromTrip(tr, useParent);
        mbtaTripStopCache.set(`${tripId}:${useParent ? "p" : "s"}`,
            { at: Date.now(), stops: out });
        return out;
    }

    async function mbtaTripStopsMany(tripIds, useParent) {
        ensureMbtaStaticCache();
        const ttl = typeof TOPOLOGY_TTL_MS !== "undefined" ? TOPOLOGY_TTL_MS : 86400000;
        const ids = [...new Set((tripIds || []).map(String).filter(Boolean))];
        const out = new Map();
        const need = [];
        for (const id of ids) {
            const hit = mbtaTripStopCache.get(`${id}:${useParent ? "p" : "s"}`);
            if (hit && Date.now() - hit.at <= ttl) out.set(id, hit.stops);
            else need.push(id);
        }
        if (!need.length) return out;
        let batch = null;
        try {
            const { data, error } = await mbtaGet("/trips", {
                "filter[id]": need.join(","),
                "include": "stops",
            });
            if (!error && data)
                batch = { rows: data.data || [], included: data.included || [] };
        } catch (e) { /* fall back to one trip at a time */ }
        if (batch) {
            const wanted = new Set(need);
            for (const tr of batch.rows) {
                const id = tr && tr.id;
                if (!id || !wanted.has(id)) continue;
                const stops = mbtaTripStopsFromTrip(
                    { data: tr, included: batch.included }, useParent);
                if (!stops.length) continue;
                out.set(id, stops);
                mbtaTripStopCache.set(`${id}:${useParent ? "p" : "s"}`,
                    { at: Date.now(), stops });
            }
        }
        for (const id of need) {
            if (out.has(id)) continue;
            out.set(id, await fetchMbtaTripStopsRemote(id, useParent));
        }
        return out;
    }

    async function mbtaTripStops(tripId, useParent) {
        if (!tripId) return [];
        const map = await mbtaTripStopsMany([tripId], useParent);
        return map.get(String(tripId)) || [];
    }

    async function refreshMbtaRouteStops(routeKey, useParent) {
        ensureMbtaStaticCache();
        const routeId = (typeof busRouteMbtaIds !== "undefined" && busRouteMbtaIds[routeKey]) || routeKey;
        const key = routeId + ":" + (useParent ? "p" : "s");
        await mbtaPatternsForRoutes([routeId]);
        const byDir = new Map();
        for (const p of mbtaPatternCache.get(routeId) || []) {
            const cur = byDir.get(p.dir);
            if (!cur || (p.canonical && !cur.canonical)) byDir.set(p.dir, p);
        }
        const plan = [...byDir.entries()]
            .sort((a, b) => a[0] - b[0])
            .filter(([, p]) => p.tripId);
        const stopMap = await mbtaTripStopsMany(
            plan.map(([, p]) => p.tripId), !!useParent).catch(() => new Map());
        const groups = [];
        for (const [dir, p] of plan) {
            const stops = stopMap.get(p.tripId) || [];
            if (stops.length)
                groups.push({ dir, name: p.name || "", stops });
        }
        if (groups.length) {
            mbtaRouteStopsCache.set(key, { at: Date.now(), groups });
            persistMbtaRouteStops();
        }
        return groups;
    }

    async function routeStops(routeKey, useParent) {
        ensureMbtaStaticCache();
        const ttl = typeof TOPOLOGY_TTL_MS !== "undefined" ? TOPOLOGY_TTL_MS : 86400000;
        const routeId = (typeof busRouteMbtaIds !== "undefined" && busRouteMbtaIds[routeKey]) || routeKey;
        const key = routeId + ":" + (useParent ? "p" : "s");
        const hit = mbtaRouteStopsCache.get(key);
        if (hit && hit.groups && hit.groups.length) {
            if (Date.now() - (hit.at || 0) > ttl)
                refreshMbtaRouteStops(routeKey, useParent).catch(() => {});
            return hit.groups;
        }
        return refreshMbtaRouteStops(routeKey, useParent);
    }

    function resetCaches() {
        mbtaTerminalCache.clear();
        mbtaTerminalAt.clear();
        mbtaPatternCache.clear();
        mbtaTripStopCache.clear();
        mbtaRouteStopsCache.clear();
        mbtaStaticLoaded = false;
    }

    // "Next stops…" for a Boston row: prefer the row's representative trip,
    // then the route's per-direction stop groups.
    async function heroStops(ds) {
        const data = ds || {};
        if (data.heroTrip) {
            const stops = await mbtaTripStops(data.heroTrip, data.heroKind === "metro");
            if (stops.length) return stops;
        }
        const groups = await routeStops(data.heroRoute, data.heroKind === "metro");
        if (!groups.length) return [];
        const heads = normHeads(data.heroHeads || "");
        const g = groups.find(x => {
            const n = normHeads(x.name || "");
            return n && (n.includes(heads) || heads.includes(n));
        }) || groups[0];
        return (g.stops || []).map(s => ({ StopID: s.StopID, Name: s.Name }));
    }

    async function metroPath(from, to, line) {
        await mbtaPatternsForRoutes([line]);
        const patterns = mbtaPatternCache.get(String(line)) || [];
        const tripIds = [...new Set(patterns.map(p => p.tripId).filter(Boolean))];
        const stopMap = await mbtaTripStopsMany(tripIds, true).catch(() => new Map());
        for (const p of patterns) {
            if (!p.tripId) continue;
            const stops = stopMap.get(p.tripId) || [];
            const ids = stops.map(s => String(s.StopID));
            const a = ids.indexOf(String(from)), b = ids.indexOf(String(to));
            if (a < 0 || b < 0) continue;
            const slice = a <= b ? ids.slice(a, b + 1) : ids.slice(b, a + 1).reverse();
            return slice.map(id => {
                const st = (metroStationsCache || []).find(s => s.Code === id);
                return {
                    StationCode: id,
                    StationName: (st && st.Name) || allStopsName(id) || id,
                };
            });
        }
        return [];
    }

    async function busRouteDirectory() {
        const { data, error } = await mbtaGet("/routes", {
            "filter[type]": 3, "page[limit]": 500,
        });
        if (error) throw error;
        const seen = new Set();
        return ((data && data.data) || []).map(r => {
            const id = String(r.attributes.short_name || r.id).toUpperCase();
            return {
                id,
                name: r.attributes.long_name || r.id,
                desc: r.attributes.long_name || r.attributes.description || "",
                mbtaId: r.id,
                color: r.attributes.color || "",
            };
        }).filter(r => r.id && !seen.has(r.id) && seen.add(r.id))
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }

    async function place(id) {
        const { data } = await mbtaGet(`/stops/${encodeURIComponent(id)}`).catch(() => ({ data: null }));
        const a = data && data.data && data.data.attributes;
        if (!a) return null;
        return { id: String(id), name: a.name || "", lat: Number(a.latitude), lon: Number(a.longitude) };
    }

    async function connections(kind, id) {
        const out = { bus: [], metro: [], places: {} };
        const current = (allStopsCache || []).find(s => String(s.StopID) === String(id))
            || (metroStationsCache || []).find(s => String(s.Code) === String(id)) || null;
        const mark = (k, route, stopId, name) => {
            if (route) out.places[k + ":" + String(route).toUpperCase()] = {
                stopId: String(stopId || ""), name: name || "",
            };
        };
        try {
            if (!Object.keys(busRouteColors).length)
                await loadBusRouteDirectory().catch(() => null);
            const { data } = await mbtaGet("/routes", { "filter[stop]": String(id) });
            for (const r of (data && data.data) || []) {
                const type = r.attributes.type;
                if (type === 3) {
                    const route = String(r.attributes.short_name || r.id).toUpperCase();
                    out.bus.push(route);
                    mark("bus", route, id, current && current.Name);
                } else if (type === 0 || type === 1 || type === 2) {
                    const route = String(r.id);
                    out.metro.push(route);
                    mark("metro", route, id, current && current.Name);
                }
            }
            if (kind === "bus") {
                let lat = null, lon = null;
                const st = (allStopsCache || []).find(s => String(s.StopID) === String(id));
                if (st && st.Lat != null && st.Lon != null) { lat = st.Lat; lon = st.Lon; }
                else {
                    const one = await mbtaGet(`/stops/${encodeURIComponent(id)}`).catch(() => null);
                    const a = one && one.data && one.data.data && one.data.data.attributes;
                    if (a) { lat = a.latitude; lon = a.longitude; }
                }
                if (lat != null && lon != null) {
                    const stations = await loadMetroStations().catch(() => []);
                    for (const s of stations) {
                        const ft = distance(lat, lon, s.Lat, s.Lon, "f");
                        if (ft <= CROSS_CONNECTION_FT) {
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

    const ROUTE_COLORS = ["#c62828", "#1565c0", "#2e7d32", "#ef6c00", "#6a1b9a", "#00838f",
        "#ad1457", "#5d4037", "#455a64", "#827717", "#37474f", "#9e9d24"];

    function routeColor(routeId) {
        const key = String(routeId || "").toUpperCase();
        if (typeof busRouteColors !== "undefined" && busRouteColors[key]) {
            const raw = String(busRouteColors[key]).replace(/^#/, "");
            if (/^[0-9a-f]{6}$/i.test(raw)) return "#" + raw;
        }
        let h = 0;
        for (const c of String(routeId)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return ROUTE_COLORS[h % ROUTE_COLORS.length];
    }

    function routeTextColor(routeId) {
        const key = String(routeId || "").toUpperCase();
        const raw = typeof busRouteColors !== "undefined" && busRouteColors[key];
        const hex = String(raw || "").replace(/^#/, "");
        if (!/^[0-9a-f]{6}$/i.test(hex)) return "#fff";
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#000" : "#fff";
    }

    function metroMeta(line) {
        const key = String(line || "");
        const meta = (typeof metroRoutesCache !== "undefined" && metroRoutesCache)
            ? metroRoutesCache[key] : null;
        return meta || null;
    }

    function metroColor(line) {
        const m = metroMeta(line);
        if (!m) return "#5d4037";
        return String(m.color || "").startsWith("#") ? m.color : "#" + m.color;
    }

    function metroName(line) {
        const m = metroMeta(line);
        return m ? m.name : String(line || "");
    }

    function isCommuter(line) {
        const key = String(line || "");
        if (!key) return false;
        if (/^CR-/i.test(key)) return true;
        const m = metroMeta(key);
        return !!(m && Number(m.type) === 2);
    }

    MTA.registerCity({
        id: "boston",
        name: "Boston",
        agency: "MBTA",
        locale: "en-US",
        timezone: "America/New_York",
        center: { lat: 42.3601, lon: -71.0589 },
        metroCenter: { lat: 42.3564, lon: -71.0624 },
        nearbyLabel: "downtown Boston",
        nearbyByDefault: true,
        defaultStopId: "17091",
        storageKey: "boston",
        defaultLike: {
            kind: "bus", id: "17091",
            name: "Boston Logan Airport Terminal A", route: "SL1",
        },
        airportDefaults: {
            bus: [{ id: "17091", name: "Boston Logan Airport Terminal A", route: "SL1" }],
            metro: [{ id: "place-aport", name: "Airport", route: "Blue" }],
        },
        labels: { nextBus: "Next bus", nextTrain: "Next train", stop: "stop", station: "station", railSection: "Subway", commuterSection: "Commuter rail" },
        capabilities: {
            commuter: true,
            batchDepartures: true,
            scheduleFallback: false,
            patterns: false,
            rail: true,
            railPath: true,
            metroRoutes: true,
            metroGtfs: false,
            routeColorsFromDirectory: true,
            routeSearchByStop: true,
            preloadBookmarks: true,
            vehicles: false,
        },
        provider: {
            http: mbtaGet,
            nearbyStops, allStops, departures,
            stopSchedule: async () => [],
            routeDetails: async () => null,
            metroStations, metroRoutes, metroLive, metroPath,
            busRouteDirectory, place, connections, connectionsReady: () => true, resetCaches,
            tripStops: mbtaTripStops,
            routeStops, heroStops,
        },
        theme: {
            icons: "boston",
            cssVars: {
                "--city-accent": "#8a1c1c",
                "--badge-radius": "4px",
                "--hero-bus-bg": "#e7ddd2",
                "--hero-bus-color": "#3f3027",
                "--hero-metro-bg": "#d9e3ef",
                "--hero-metro-color": "#1d3550",
            },
            routeColor,
            routeTextColor,
            badgeClass: () => " boston-bus",
            metroColor,
            metroName,
            isCommuter,
            metroLineIds: () => Object.keys(
                (typeof metroRoutesCache !== "undefined" && metroRoutesCache) || {}),
        },
    });
})();
