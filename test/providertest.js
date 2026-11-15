// Provider contract tests: endpoint selection + normalization for DC,
// Boston, and London without a DOM. The page modules are classic scripts,
// so they can be evaluated together in a VM.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const MODULES = [
  "js/core/http.js", "js/cities/index.js", "js/cities/dc.js",
  "js/cities/boston.js", "js/cities/london.js", "js/ui/icons.js",
];
const source = MODULES.map(m => fs.readFileSync(path.join(ROOT, m), "utf8")).join("\n;\n");

let calls = [];
const responses = [];
const sandbox = {
  console, JSON, Date, Number, String, Boolean, Math, Object, Array,
  Set, Map, Promise, Symbol, RegExp, Error, TypeError, parseInt, parseFloat,
  URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  location: { search: "" },
  document: { cookie: "" },
  fetch: async (url) => {
    calls.push(String(url));
    const hit = responses.find(r => r.match(String(url)));
    if (!hit) throw new Error("unstubbed URL: " + url);
    return { ok: true, status: 200, json: async () => hit.body };
  },
  allStopsName: id => ({ "17091": "Boston Logan Airport Terminal A",
    "940GZZLUOXC": "Oxford Circus Underground Station" }[String(id)] || ""),
  TOPOLOGY_TTL_MS: 86400000,
  metroStationsCache: [],
  readCache: () => null,
  writeCache: () => {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "providers.js" });

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name + (extra ? "  " + extra : "")); }
  else { fail++; console.log("FAIL " + name + (extra ? "  " + extra : "")); }
}
const cities = sandbox.MTA.cities;

check("registry has dc, boston, london",
  !!cities.dc && !!cities.boston && !!cities.london);
check("london is keyless by default", !!cities.london.keyOptional);

// ── Boston: one batched predictions request ─────────────────────────
responses.push({
  match: u => u.includes("/predictions") && u.includes("filter%5Bstop%5D=17091"),
  body: {
    data: [{
      id: "p1",
      attributes: {
        arrival_time: new Date(Date.now() + 4 * 60000).toISOString(),
        departure_time: new Date(Date.now() + 4 * 60000).toISOString(),
        direction_id: 0,
      },
      relationships: {
        route: { data: { id: "741" } },
        trip: { data: { id: "t1" } },
        stop: { data: { id: "17091" } },
      },
    }],
    included: [
      { type: "route", id: "741", attributes: { short_name: "SL1", direction_destinations: ["Logan Airport"] } },
      { type: "trip", id: "t1", attributes: { headsign: "Logan Airport" } },
      { type: "stop", id: "17091", attributes: { name: "Boston Logan Airport Terminal A" } },
    ],
  },
});

(async () => {
  const bos = cities.boston.provider;
  const dep = await bos.departures(["17091"]);
  const row = (dep.get("17091") || {}).predictions || [];
  check("boston: batched departures returns SL1", dep.has("17091") && row.length === 1 && row[0].route === "SL1");
  check("boston: headsign + minutes normalized", row[0] && row[0].heads === "Logan Airport" && row[0].min === 4);
  check("boston: one request for the stop cluster",
    calls.filter(u => u.includes("/predictions")).length === 1);

  // ── London: per-station arrivals, absolute time + dedupe ─────────
  const now = Date.now();
  responses.push({
    match: u => u.includes("/StopPoint/940GZZLUOXC/Arrivals"),
    body: [{
      lineId: "victoria", lineName: "Victoria", modeName: "tube",
      direction: "inbound", destinationName: "Brixton",
      expectedArrival: new Date(now + 3 * 60000).toISOString(),
      timeToStation: 180, vehicleId: "v1", stationName: "Oxford Circus",
    }, {
      lineId: "victoria", lineName: "Victoria", modeName: "tube",
      direction: "inbound", destinationName: "Brixton",
      expectedArrival: new Date(now + 3 * 60000).toISOString(),
      timeToStation: 180, vehicleId: "v1", stationName: "Oxford Circus",
    }],
  });
  const lon = cities.london.provider;
  const ldep = await lon.departures(["940GZZLUOXC"]);
  const lrow = (ldep.get("940GZZLUOXC") || {}).predictions || [];
  check("london: arrivals normalized to Victoria", lrow.length === 1 && lrow[0].route === "Victoria");
  check("london: absolute ETA + headsign", lrow[0] && lrow[0].at > now && lrow[0].heads === "Brixton");
  check("london: app_key omitted when no key", calls.every(u => !u.includes("app_key=")));

  // ── London: ordered pattern from Route/Sequence ──────────────────
  responses.push({
    match: u => u.includes("/Line/victoria/Route/Sequence/all"),
    body: { stopPointSequences: [{
      direction: "inbound", name: "Brixton",
      stopPoint: [
        { naptanId: "940GZZLUOXC", name: "Oxford Circus", lat: 51.515, lon: -0.141 },
        { naptanId: "940GZZLUGPK", name: "Green Park", lat: 51.506, lon: -0.142 },
      ],
    }] },
  });
  const details = await lon.routeDetails("victoria");
  check("london: pattern has both stops",
    details && details.directions.length === 1 && details.directions[0].stops.length === 2);
  check("london: pattern terminal is the headsign",
    details && details.directions[0].heads === "Green Park");

  // ── Theme + icons ────────────────────────────────────────────────
  check("london: Victoria line color", cities.london.theme.metroColor("victoria") === "#0098D4");
  check("london: bus badge is TfL red", cities.london.theme.routeColor("38") === "#DC241F");
  check("boston: badge class", cities.boston.theme.badgeClass().includes("boston-bus"));
  check("dc: metro color", cities.dc.theme.metroColor("RD") === "#c62828");

  const iconL = sandbox.MTA.icons.html("london", "subway");
  const iconB = sandbox.MTA.icons.html("boston", "subway");
  const iconD = sandbox.MTA.icons.html("dc", "bus");
  check("london icon is a roundel SVG", iconL.includes("<svg") && iconL.includes("<circle"));
  check("boston icon uses the T", iconB.includes(">T<"));
  check("dc bus icon is standalone SVG", iconD.includes("<svg") && !iconD.includes("fa-"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
