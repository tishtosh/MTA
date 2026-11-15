// Metro-mode pure helpers: live min parsing, headsign matching, GTFS CSV,
// and merging live + scheduled rows.
const vm = require("vm");
const src = require("./lib/extract").pageScript();

function extractFn(name) {
  const marker = "function " + name + "(";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("not found: " + name);
  const i = src.indexOf("{", start);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, j + 1);
}

const sandbox = { console, Date, Number, String, Math, Object, Array, Set, Map };
vm.createContext(sandbox);
vm.runInContext([
  "var metroLive = {}; var metroSchedule = {}; var metroStationsCache = [];",
  "var city = 'dc'; var metroRoutesCache = null; function isBoston() { return city === 'boston'; }",
  "var METRO_LINE_NAMES = {RD:'Red',BL:'Blue',OR:'Orange',SV:'Silver',GR:'Green',YL:'Yellow'};",
  "function cityTheme(){ return { metroName: (l) => METRO_LINE_NAMES[l] || l, metroColor: () => '#c62828', isCommuter: () => false, routeColor: () => '#c62828', routeTextColor: () => '#fff', badgeClass: () => '' }; }",
  "function ensureMbtaStaticCache() {}",
  "function nextScheduledFor() { return null; }",
  extractFn("normHeads"),
  extractFn("metroMin"),
  extractFn("metroHeadsMatch"),
  extractFn("metroDestCode"),
  extractFn("metroLineName"),
  extractFn("sortRowsBySoonest"),
  extractFn("metroRowsFor"),
  extractFn("gtfsCsvFields"),
  extractFn("gtfsTimeToMs"),
  extractFn("mbtaTripStopsFromTrip"),
  "async " + extractFn("mbtaTripStopsMany"),
  "const mbtaTripStopCache = new Map();",
  "const TOPOLOGY_TTL_MS = 86400000;",
  "function allStopsName() { return ''; }",
  "var __batch = null;",
  "async function mbtaGet() { return { data: __batch, error: null }; }",
  "async function fetchMbtaTripStopsRemote() { return []; }"
].join("\n"), sandbox);

let pass = 0, fail = 0;
function t(label, ok) {
  if (ok) { pass++; console.log("PASS  " + label); }
  else { fail++; console.log("FAIL  " + label); }
}

t("M1 BRD/ARR parse as 0", sandbox.metroMin("BRD") === 0 && sandbox.metroMin("ARR") === 0);
t("M2 numeric and unknown minutes", sandbox.metroMin("5") === 5 && sandbox.metroMin("---") === null);
t("M3 abbreviated destinations match",
  sandbox.metroHeadsMatch("Shady Grv", "Shady Grove") &&
  !sandbox.metroHeadsMatch("Glenmont", "Shady Grove"));
t("M4 full line names", sandbox.metroLineName("RD") === "Red" &&
  sandbox.metroLineName("GR") === "Green" && sandbox.metroLineName("YL") === "Yellow");
t("M4b quoted GTFS CSV", (() => {
  const f = sandbox.gtfsCsvFields('RED,50_R,123,"Shady Grove, DC",0');
  return f.length === 5 && f[3] === "Shady Grove, DC";
})());

sandbox.metroStationsCache = [
  { Code: "B11", Name: "Glenmont" },
  { Code: "A15", Name: "Shady Grove" },
  { Code: "E10", Name: "Greenbelt" }
];

const now = Date.now();
sandbox.metroLive = {
  A05: [
    { min: 1, route: "RD", heads: "Glenmont", dirNum: "1" },
    { min: 9, route: "RD", heads: "Glenmont", dirNum: "1" },
    { min: 2, route: "RD", heads: "Shady Grv", dirNum: "2" }
  ]
};
sandbox.metroSchedule = {
  A05: [
    { at: now + 5 * 60000, route: "RD", heads: "Shady Grove", dirNum: "1" },
    { at: now + 3 * 60000, route: "GR", heads: "Greenbelt", dirNum: "0" }
  ]
};
const rows = sandbox.metroRowsFor({ Code: "A05" });
t("M5 live rows grouped and sorted", rows.length === 3 && rows[0].mins[0] === 1);
t("M6 scheduled duplicate suppressed, missing line added",
  rows.some(r => r.scheduled && r.route === "GR") &&
  !rows.some(r => r.scheduled && r.route === "RD"));
t("M7 scheduled row sorts by its time", rows[2].route === "GR" && !!rows[2].scheduled);

(async () => {
  const trip = {
    id: "t1",
    relationships: { stops: { data: [{ id: "s1" }, { id: "s2" }] } }
  };
  sandbox.__batch = {
    data: [trip],
    included: [
      { type: "stop", id: "s1", attributes: { name: "child one" },
        relationships: { parent_station: { data: { id: "A15" } } } },
      { type: "stop", id: "s2", attributes: { name: "child two" },
        relationships: { parent_station: { data: { id: "E10" } } } }
    ]
  };
  const batched = await sandbox.mbtaTripStopsMany(["t1"], true);
  const stops = batched.get("t1") || [];
  t("M8 batched trip response yields ordered parent stations",
    stops.length === 2 && stops[0].StopID === "A15" &&
    stops[1].StopID === "E10" && stops[0].Name === "Shady Grove");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
