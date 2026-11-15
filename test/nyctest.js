// NYC (MTA) phase-0 contract tests: GTFS-RT decoding and the rail provider.
// The feeds are protobuf, so the fixtures are built here with a tiny encoder
// (varint + length-delimited) rather than committed as binary blobs.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const MODULES = [
  "js/core/http.js", "js/core/gtfsrt.js", "js/cities/index.js",
  "js/cities/dc.js", "js/cities/boston.js", "js/cities/london.js",
  "js/cities/nyc-data.js", "js/cities/nyc.js", "js/ui/icons.js",
];
const source = MODULES.map(m => fs.readFileSync(path.join(ROOT, m), "utf8")).join("\n;\n");

// ── protobuf writer (test-side) ───────────────────────────────────────
const { feedBytes } = require("./lib/gtfsrt");

// ── sandbox ───────────────────────────────────────────────────────────
let feedBytesByUrl = {};
let calls = [];
function urlKey(url) {
  const m = /mtagtfsfeeds\/([^?]+)/.exec(String(url));
  return m ? decodeURIComponent(m[1]) : String(url);
}
const sandbox = {
  console, JSON, Date, Number, String, Boolean, Math, Object, Array, Set, Map,
  Promise, Symbol, RegExp, Error, TypeError, parseInt, parseFloat,
  URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Buffer,
  location: { search: "" },
  document: { cookie: "" },
  fetch: async (url) => {
    calls.push(String(url));
    const key = urlKey(url);
    const body = feedBytesByUrl[key];
    if (!body) throw new Error("unstubbed feed: " + key);
    return {
      ok: true, status: 200,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
    };
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "nyc-modules.js" });

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name + (extra ? "  " + extra : "")); }
  else { fail++; console.log("FAIL " + name + (extra ? "  " + extra : "")); }
}

const D = sandbox.window.MTA_NYC_DATA;
const nyc = sandbox.MTA.cities.nyc;
const feed = id => "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/" + id;

// ── GTFS-RT decoder ───────────────────────────────────────────────────
{
  const now = Date.now();
  const bytes = feedBytes([{
    tripId: "T1", routeId: "1", dir: 1,
    stops: [
      { stopId: "127S", at: now + 120000 },
      { stopId: "128S", at: now + 180000 },
      { stopId: "142S", at: now + 600000 },
    ],
  }, {
    tripId: "T2", routeId: "2", dir: 0,
    stops: [{ stopId: "127N", at: now + 240000, skipped: true }],
  }], now);
  const out = sandbox.MTA.gtfsrt.parse(new Uint8Array(bytes));
  check("gtfsrt: one entity per trip", out.trips.length === 2);
  check("gtfsrt: trip descriptor", out.trips[0].tripId === "T1" &&
    out.trips[0].routeId === "1" && out.trips[0].directionId === 1);
  check("gtfsrt: stop times from arrival.time",
    out.trips[0].stops.length === 3 && out.trips[0].stops[2].stopId === "142S" &&
    Math.abs(out.trips[0].stops[2].at - (now + 600000)) < 2000);
  check("gtfsrt: skipped flag", out.trips[1].stops[0].skipped === true);
  check("gtfsrt: feed timestamp", Math.abs(out.timestamp - now) < 2000);
}

// ── static data ───────────────────────────────────────────────────────
check("nyc: registry entry", !!nyc && nyc.name === "New York City");
check("nyc: per-city storage key", nyc.storageKey === "nyc");
check("nyc: default airports are LGA and JFK",
  nyc.airportDefaults.bus.some(e => e.id === "904417" && /LGA/.test(e.name)) &&
  nyc.airportDefaults.metro.some(e => e.id === "H03" && /JFK/.test(e.name)));
check("nyc: static data loaded", Object.keys(D.stations).length > 450);
check("nyc: Times Sq-42 St station", !!D.stations["127"] &&
  D.stations["127"][0] === "Times Sq-42 St" &&
  D.stations["127"][3].join(",") === "1,2,3");
check("nyc: platform suffix map", D.platform["127N"] === "127" && D.platform["127S"] === "127");
check("nyc: SIR stations present",
  Object.values(D.stations).filter(s => s[3].includes("SI")).length === 21);
check("nyc: route colours", nyc.theme.metroColor("N") === "#F6BC26" &&
  nyc.theme.metroColor("SI") === "#08179C");
check("nyc: express variants show the parent bullet",
  nyc.theme.metroName("FX") === "F" && nyc.theme.metroName("6X") === "6");
check("nyc: icon is neutral, not an MTA mark",
  sandbox.MTA.icons.html("nyc", "subway").includes("<svg") &&
  !/MTA/.test(sandbox.MTA.icons.html("nyc", "subway")));

// ── metroLive ─────────────────────────────────────────────────────────
(async () => {
  const now = Date.now();
  const term = D.stations["142"] ? "142S" : null;
  const lastStop = Object.keys(D.stations).find(k => D.stations[k][3].includes("1") &&
    !D.stations[k][3].includes("2") && !D.stations[k][3].includes("3")) || "142";
  feedBytesByUrl = {
    "nyct/gtfs": feedBytes([{
      // Uptown 1 to the far end: kept, headsign = terminus name.
      tripId: "T1", routeId: "1", dir: 1,
      stops: [
        { stopId: "127S", at: now + 185000 },
        { stopId: lastStop + "S", at: now + 900000 },
      ],
    }, {
      // Terminates at this station: dropped.
      tripId: "T2", routeId: "2", dir: 0,
      stops: [{ stopId: "127S", at: now + 300000 }],
    }, {
      // Same line, but does not call at 127.
      tripId: "T3", routeId: "3", dir: 1,
      stops: [
        { stopId: "128N", at: now + 240000 },
        { stopId: "129N", at: now + 300000 },
      ],
    }], now),
  };
  calls = [];
  const live = await nyc.provider.metroLive(["127"]);
  const rows = live["127"] || [];
  check("nyc live: one prediction for the station",
    rows.length === 1 && rows[0].route === "1");
  check("nyc live: minutes from arrival.time",
    rows[0] && rows[0].min === 3, rows[0] && ("min=" + rows[0].min));
  check("nyc live: headsign is the terminus name",
    rows[0] && rows[0].heads === D.stations[lastStop][0],
    rows[0] && rows[0].heads);
  check("nyc live: terminating train is not shown",
    rows.every(r => r.trip !== "T2"));
  check("nyc live: one feed covers 1/2/3", calls.length === 1 &&
    calls[0].includes("nyct%2Fgtfs") && !calls[0].includes("nqrw"));

  // Second call inside the TTL must not refetch.
  calls = [];
  await nyc.provider.metroLive(["127"]);
  check("nyc live: feed cached across board ticks", calls.length === 0);

  // Two stations on the same feed still cost one request after an expiry.
  nyc.provider.resetCaches();
  calls = [];
  const two = await nyc.provider.metroLive(["127", "128"]);
  check("nyc live: nearby stations share one feed fetch", calls.length === 1 &&
    (two["127"] || []).length === 1 && (two["128"] || []).length === 1);

  // An outage keeps the previous feed instead of blanking the board.
  feedBytesByUrl = {};
  nyc.provider.resetCaches();
  const stale = await nyc.provider.metroLive(["127"]).catch(e => ({ error: e }));
  check("nyc live: a cold outage reports an error",
    !!stale.error || (stale["127"] || []).length === 0);

  check("nyc: buses inert", (await nyc.provider.departures(["1"])).get("1").predictions.length === 0 &&
    (await nyc.provider.nearbyStops()).length === 0);
  check("nyc: capabilities mark bus deferred", nyc.capabilities.bus === false &&
    nyc.capabilities.metroGtfs === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
