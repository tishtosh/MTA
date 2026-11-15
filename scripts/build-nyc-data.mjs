// Build js/cities/nyc-data.js from the MTA NYCT static GTFS feed.
//
//   node scripts/build-nyc-data.mjs                 # download + regenerate
//   node scripts/build-nyc-data.mjs path/to/gtfs.zip
//
// No dependencies: the zip reader uses zlib.inflateRawSync, and the CSV reader
// is a small state machine (GTFS fields are quoted and may contain commas).
// The page itself never unzips anything — it loads the generated classic
// script, so a file:// copy works without fetch/CORS.
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
const URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";

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
// Central-directory walk; entries are stored (0) or deflated (8), which is
// all the MTA feeds use.
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

// ── build ─────────────────────────────────────────────────────────────
async function main() {
    const arg = process.argv[2];
    const zipPath = arg || path.join(os.tmpdir(), "mta-gtfs-subway.zip");
    let buf;
    if (arg) buf = fs.readFileSync(path.resolve(arg));
    else {
        if (!fs.existsSync(zipPath)) {
            console.log("downloading", URL);
            fs.writeFileSync(zipPath, await fetchBuffer(URL));
        }
        buf = fs.readFileSync(zipPath);
    }
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

    // route_id → order (for the bullet order) and display name/colour.
    const routeSort = new Map();
    const routeOut = {};
    for (const r of routes) {
        const id = r.route_id;
        routeSort.set(id, Number(r.route_sort_order) || 999);
        const color = /^[0-9a-f]{6}$/i.test(r.route_color || "")
            ? "#" + r.route_color.toUpperCase() : "#5d4037";
        // MTA bullets use the short name; SIR is a single blue route.
        routeOut[id] = [r.route_short_name || id, color];
    }

    // Platforms → parent station.
    const platform = {};
    const stations = {};
    for (const s of stops) {
        const id = s.stop_id;
        if (!id) continue;
        if (s.parent_station) platform[id] = s.parent_station;
        else platform[id] = id;
        if (s.location_type === "1") {
            const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            stations[id] = [s.stop_name || id, lat, lon, []];
        }
    }

    // Lines per station, from the trips that actually call there.
    const routeOfTrip = new Map();
    for (const t of trips) routeOfTrip.set(t.trip_id, t.route_id);
    const linesByStation = new Map();
    for (const st of stopTimes) {
        const route = routeOfTrip.get(st.trip_id);
        if (!route) continue;
        const parent = platform[st.stop_id];
        if (!parent) continue;
        let set = linesByStation.get(parent);
        if (!set) linesByStation.set(parent, set = new Set());
        set.add(route);
    }
    for (const [code, station] of Object.entries(stations)) {
        const set = linesByStation.get(code);
        station[3] = set
            ? [...set].sort((a, b) => (routeSort.get(a) ?? 999) - (routeSort.get(b) ?? 999))
            : [];
    }

    // Drop stations with no service (defensive: GTFS should not have them).
    for (const code of Object.keys(stations))
        if (!stations[code][3].length) delete stations[code];

    const out = {
        built: new Date().toISOString().slice(0, 10),
        source: "MTA NYCT gtfs_subway.zip",
        routes: routeOut,
        stations,
        platform,
    };
    const js = "// Generated by scripts/build-nyc-data.mjs — do not edit by hand.\n"
        + "// Source: " + out.source + " (" + out.built + ").\n"
        + "window.MTA_NYC_DATA = " + JSON.stringify(out) + ";\n";
    fs.writeFileSync(OUT, js);
    const kb = (Buffer.byteLength(js) / 1024).toFixed(1);
    console.log(`wrote ${path.relative(ROOT, OUT)} — ${Object.keys(stations).length} stations, `
        + `${Object.keys(routeOut).length} routes, ${kb} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
