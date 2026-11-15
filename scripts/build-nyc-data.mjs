// Build js/cities/nyc-data.js from the MTA static GTFS feeds (subway + SIR,
// LIRR, Metro-North).
//
//   node scripts/build-nyc-data.mjs                 # download + regenerate
//   node scripts/build-nyc-data.mjs <subway.zip> <lirr.zip> <mnr.zip>
//
// No dependencies: the zip reader uses zlib.inflateRawSync and the CSV reader
// is a small state machine. LIRR/MNR stop ids are numeric and collide with the
// subway's, so every rail id is namespaced ("LIRR:1", "MNR:46"). The page never
// unzips anything — it loads the generated classic script, so file:// works.
"use strict";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import zlib from "node:zlib";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const OUT = path.join(ROOT, "js", "cities", "nyc-data.js");

const FEEDS = [
    { name: "subway", prefix: "", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip" },
    { name: "lirr", prefix: "LIRR:", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip" },
    { name: "mnr", prefix: "MNR:", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip" },
];

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200)
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            const chunks = [];
            res.on("data", c => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        }).on("error", reject);
    });
}

// ── zip ───────────────────────────────────────────────────────────────
function readZip(buf) {
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error("not a zip: no end-of-central-directory");
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50)
            throw new Error("corrupt central directory at " + p);
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOff = buf.readUInt32LE(p + 42);
        const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
        entries.set(name, { method, compSize, localOff });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return {
        names: [...entries.keys()],
        read(name) {
            const e = entries.get(name);
            if (!e) return null;
            const nameLen = buf.readUInt16LE(e.localOff + 26);
            const extraLen = buf.readUInt16LE(e.localOff + 28);
            const start = e.localOff + 30 + nameLen + extraLen;
            const raw = buf.subarray(start, start + e.compSize);
            return e.method === 0 ? raw : zlib.inflateRawSync(raw);
        },
    };
}

// ── csv ───────────────────────────────────────────────────────────────
function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else quoted = false;
            } else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (ch !== "\r") field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
}

function table(text) {
    const rows = parseCsv(text.replace(/^\uFEFF/, ""));
    const head = rows.shift() || [];
    return rows.filter(r => r.length === head.length).map(r => {
        const o = {};
        head.forEach((h, i) => { o[h.trim()] = r[i]; });
        return o;
    });
}

function readFeed(buf, prefix) {
    const zip = readZip(buf);
    const read = name => {
        const b = zip.read(name);
        if (!b) throw new Error("missing zip entry " + name);
        return b.toString("utf8");
    };
    const routes = table(read("routes.txt"));
    const stops = table(read("stops.txt"));
    const trips = table(read("trips.txt"));
    const stopTimes = table(read("stop_times.txt"));

    const routeSort = new Map();
    const routeOut = {};
    for (const r of routes) {
        const id = prefix + r.route_id;
        routeSort.set(id, Number(r.route_sort_order) || 999);
        const color = /^[0-9a-f]{6}$/i.test(r.route_color || "")
            ? "#" + r.route_color.toUpperCase() : "#5d4037";
        const isRail = prefix !== "";
        const name = isRail
            ? String(r.route_long_name || r.route_short_name || r.route_id)
                .replace(/\s+(Branch|Line)$/i, "").trim()
            : String(r.route_short_name || r.route_id);
        routeOut[id] = [name, color];
    }

    const platform = {};
    const stations = {};
    for (const s of stops) {
        const id = s.stop_id;
        if (!id) continue;
        const parent = s.parent_station ? prefix + s.parent_station : prefix + id;
        platform[prefix + id] = parent;
        if (s.location_type === "1" || !s.parent_station) {
            const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            stations[prefix + id] = [s.stop_name || id, lat, lon, []];
        }
    }

    const linesByStation = new Map();
    const routeOfTrip = new Map();
    for (const t of trips) routeOfTrip.set(t.trip_id, prefix + t.route_id);
    for (const st of stopTimes) {
        const route = routeOfTrip.get(st.trip_id);
        if (!route) continue;
        const parent = platform[prefix + st.stop_id];
        if (!parent) continue;
        let set = linesByStation.get(parent);
        if (!set) linesByStation.set(parent, set = new Set());
        set.add(route);
    }
    for (const [code, station] of Object.entries(stations)) {
        station[3] = [...(linesByStation.get(code) || [])]
            .sort((a, b) => (routeSort.get(a) ?? 999) - (routeSort.get(b) ?? 999));
        if (!station[3].length) delete stations[code];
    }

    // Ordered station sequences per route for "Next stops…" and route maps.
    const byTrip = new Map();
    for (const st of stopTimes) {
        let arr = byTrip.get(st.trip_id);
        if (!arr) byTrip.set(st.trip_id, arr = []);
        arr.push([Number(st.stop_sequence) || 0, st.stop_id]);
    }
    const patterns = {};
    const seenPattern = new Set();
    for (const [tripId, arr] of byTrip) {
        const route = routeOfTrip.get(tripId);
        if (!route) continue;
        arr.sort((a, b) => a[0] - b[0]);
        const ids = [];
        for (const [, stopId] of arr) {
            const parent = platform[prefix + stopId];
            if (!parent || !stations[parent]) continue;
            if (ids[ids.length - 1] !== parent) ids.push(parent);
        }
        if (ids.length < 2) continue;
        const key = route + "|" + ids.join(",");
        if (seenPattern.has(key)) continue;
        seenPattern.add(key);
        (patterns[route] || (patterns[route] = [])).push(ids);
    }
    for (const route of Object.keys(patterns))
        patterns[route].sort((a, b) => b.length - a.length);

    return { routeOut, stations, platform, patterns };
}

async function main() {
    const args = process.argv.slice(2);
    const out = {
        built: new Date().toISOString().slice(0, 10),
        source: "MTA NYCT + LIRR + Metro-North static GTFS",
        routes: {}, stations: {}, platform: {}, patterns: {},
    };
    for (let i = 0; i < FEEDS.length; i++) {
        const feed = FEEDS[i];
        const zipPath = args[i] || path.join(os.tmpdir(), `mta-gtfs-${feed.name}.zip`);
        if (!args[i] && !fs.existsSync(zipPath)) {
            console.log("downloading", feed.url);
            fs.writeFileSync(zipPath, await fetchBuffer(feed.url));
        }
        const buf = args[i] ? fs.readFileSync(path.resolve(args[i])) : fs.readFileSync(zipPath);
        const part = readFeed(buf, feed.prefix);
        Object.assign(out.routes, part.routeOut);
        Object.assign(out.stations, part.stations);
        Object.assign(out.platform, part.platform);
        for (const [route, list] of Object.entries(part.patterns))
            out.patterns[route] = list;
    }

    const js = "// Generated by scripts/build-nyc-data.mjs — do not edit by hand.\n"
        + "// Source: " + out.source + " (" + out.built + ").\n"
        + "window.MTA_NYC_DATA = " + JSON.stringify(out) + ";\n";
    fs.writeFileSync(OUT, js);
    const patternCount = Object.values(out.patterns).reduce((n, l) => n + l.length, 0);
    const kb = (Buffer.byteLength(js) / 1024).toFixed(1);
    console.log(`wrote ${path.relative(ROOT, OUT)} — ${Object.keys(out.stations).length} stations, `
        + `${Object.keys(out.routes).length} routes, ${patternCount} patterns, ${kb} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
