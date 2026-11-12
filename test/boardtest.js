// Node test for buildBoardRows (piece 4) against the locked live captures.
// Extracts the PURE functions from the page script and runs them in a VM
// sandbox so no copy-drift: only allStopsName is stubbed (it reads DOM state).
const fs = require("fs");
const vm = require("vm");

function extractFn(src, name) {
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

const src = require("./lib/extract").pageScript();
const names = ["parseFeedTime", "normalizeRouteDetails", "normHeads", "posDirFor",
               "matchPattern", "containsStopId", "buildBoardRows",
               "predKey", "updateDeparted"];
const sandbox = { allStopsName: () => "", console, JSON, Date, Number, String,
                  Math, Object, Array, Set, Map };
vm.createContext(sandbox);
vm.runInContext("const DEPARTED_WINDOW_MS = 2 * 60000;\n"
  + names.map(n => extractFn(src, n)).join("\n"), sandbox);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name); }
}

// ---- fixtures from locked captures ----
function asItems(x) { return Array.isArray(x) ? x : (x && (x.Predictions || x.BusPositions)) || []; }

const rtC87 = JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "route_C87.json"), "utf8"));
const rtD72 = JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "route_D72.json"), "utf8"));
const c87 = Array.isArray(rtC87) ? rtC87.find(x => x.RouteID === "C87") : rtC87;
const d72 = Array.isArray(rtD72) ? rtD72.find(x => x.RouteID === "D72") : rtD72;
const rd = { C87: sandbox.normalizeRouteDetails("C87", c87),
             D72: sandbox.normalizeRouteDetails("D72", d72) };
check("C87 normalized, 2 directions", rd.C87 && rd.C87.directions.length === 2);
check("D72 normalized, 2 directions", rd.D72 && rd.D72.directions.length === 2);
check("C87 dir0 contains 1002130", sandbox.containsStopId(rd.C87.directions.find(d => d.dirNum === "0"), "1002130"));
check("C87 dir0 lacks 1002135", !sandbox.containsStopId(rd.C87.directions.find(d => d.dirNum === "0"), "1002135"));
check("D72 dir0 lacks both corners",
  !sandbox.containsStopId(rd.D72.directions.find(d => d.dirNum === "0"), "1002130") &&
  !sandbox.containsStopId(rd.D72.directions.find(d => d.dirNum === "0"), "1002135"));

function normPos(b) {
  const at = sandbox.parseFeedTime(b.DateTime);
  if (!Number.isFinite(at) || !Number.isFinite(Number(b.Lat))) return null;
  return { vehicle: b.VehicleID != null ? String(b.VehicleID) : "",
           lat: Number(b.Lat), lon: Number(b.Lon),
           trip: b.TripID != null ? String(b.TripID) : "",
           route: String(b.RouteID || "").toUpperCase(),
           dirNum: b.DirectionNum != null ? String(b.DirectionNum) : "",
           heads: String(b.TripHeadsign || ""), dirText: String(b.DirectionText || ""), at };
}
const posRows = asItems(JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "pos.json"), "utf8")))
  .map(normPos).filter(Boolean);
check("pos feed rows parsed: " + posRows.length, posRows.length > 100);

function normPred(p) {
  const min = Number(p.Minutes);
  if (!Number.isFinite(min) || min < 0) return null;
  const route = String(p.RouteID || "").toUpperCase();
  if (!route) return null;
  return { min, route, dir: String(p.DirectionText || ""),
           dirNum: p.DirectionNum != null ? String(p.DirectionNum) : "",
           heads: String(p.TripHeadsign || "") || String(p.DirectionText || ""),
           vehicle: p.VehicleID != null ? String(p.VehicleID) : null,
           trip: p.TripID != null ? String(p.TripID) : null };
}
const preds130 = asItems(JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "pred_1002130.json"), "utf8")))
  .map(normPred).filter(Boolean);
const preds135 = asItems(JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "pred_1002135.json"), "utf8")))
  .map(normPred).filter(Boolean);
console.log("preds130:", preds130.map(p => p.route + p.dirNum + " " + p.min + " '" + p.heads + "'"));
console.log("preds135:", preds135.map(p => p.route + p.dirNum + " " + p.min + " '" + p.heads + "'"));

// ---- A: anchor 1002130 (corner A) ----
const r130 = sandbox.buildBoardRows("1002130", preds130, rd, posRows);
console.log("rows130:", r130.map(r => r.kind + " " + r.route + " " + r.dirNum + " '" + r.dest + "' " + JSON.stringify(r.mins) + (r.note ? " [" + r.note + "]" : "")));
check("130: no track rows (no live geometry expected)", !r130.some(r => r.kind === "track"));
const c87svc = r130.filter(r => r.route === "C87");
check("130: exactly one C87 service row (dir0 contains anchor)",
  c87svc.length === 1 && c87svc[0].kind === "service" && c87svc[0].dirNum === "0" &&
  c87svc[0].anchorIdx >= 0 && c87svc[0].anchorPatStop && c87svc[0].anchorPatStop.id === "1002130");
const d72rows = r130.filter(r => r.route === "D72");
check("130: D72 rows all compact, dir0 (live feed is northbound)",
  d72rows.length >= 1 && d72rows.every(r => r.kind === "compact" && r.dirNum === "0"));
check("130: D72 mins are [14,40]",
  JSON.stringify(d72rows.flatMap(r => r.mins).sort((a, b) => a - b)) === "[14,40]");
check("130: row order compact (real ETAs) before service",
  r130.findIndex(r => r.kind === "service") > r130.findIndex(r => r.kind === "compact"));

// ---- B: anchor 1002135 (corner B) ----
const r135 = sandbox.buildBoardRows("1002135", preds135, rd, posRows);
console.log("rows135:", r135.map(r => r.kind + " " + r.route + " " + r.dirNum + " '" + r.dest + "' " + JSON.stringify(r.mins) + (r.note ? " [" + r.note + "]" : "")));
check("135: no track rows", !r135.some(r => r.kind === "track"));
check("135: no service rows (no pattern contains 1002135)", !r135.some(r => r.kind === "service"));
check("135: all rows D72 dir1 compact",
  r135.length >= 1 && r135.every(r => r.kind === "compact" && r.route === "D72" && r.dirNum === "1"));
check("135: mins are [2,17,39]",
  JSON.stringify(r135.flatMap(r => r.mins).sort((a, b) => a - b)) === "[2,17,39]");

// ---- C: synthetic — exact dirNum stage → track ----
function mkEntry(route, dirs) {
  return { route, name: "Test " + route,
           directions: dirs.map(d => ({ route, dirNum: d.dirNum, heads: d.heads,
                                        dirText: d.dirNum === "0" ? "NORTH" : "SOUTH",
                                        stops: d.stops,
                                        shape: d.stops.map(s => ({ lat: s.lat, lon: s.lon })),
                                        byId: Object.fromEntries(d.stops.map(s => [s.id, s])) })) };
}
const S = (id, lat, lon) => ({ id, name: "Stop " + id, lat, lon });
const rdX = { X01: mkEntry("X01", [
  { dirNum: "0", heads: "To X", stops: [S("1", 38.9, -77.1), S("9999", 38.91, -77.11)] },
  { dirNum: "1", heads: "To Y", stops: [S("2", 38.92, -77.12), S("3", 38.93, -77.13)] }]) };
const rX = sandbox.buildBoardRows("9999",
  [{ min: 5, route: "X01", dir: "North to X", dirNum: "0", heads: "To X", vehicle: "10", trip: "90" }],
  rdX, []);
check("syn C: one track row anchored at idx 1",
  rX.length === 1 && rX[0].kind === "track" && rX[0].dirNum === "0" &&
  rX[0].anchorIdx === 1 && rX[0].anchorPatStop && rX[0].anchorPatStop.id === "9999" &&
  rX[0].dest === "To X" && rX[0].first === 5);

// ---- D: synthetic — position-row direction fallback → track ----
const rY = sandbox.buildBoardRows("9999",
  [{ min: 7, route: "X01", dir: "North to X", dirNum: "", heads: "To X", vehicle: "10", trip: "90" }],
  rdX, [{ route: "X01", trip: "90", vehicle: "10", dirNum: "0", lat: 38.9, lon: -77.1, at: Date.now(), heads: "", dirText: "" }]);
check("syn D: pos-fallback resolves to dir0 track",
  rY.length === 1 && rY[0].kind === "track" && rY[0].dirNum === "0" && rY[0].first === 7);

// ---- E: synthetic — prediction dir1 + pattern dir0 → compact + service ----
const rdE = { X02: mkEntry("X02", [
  { dirNum: "0", heads: "To N", stops: [S("9999", 1, 1)] },
  { dirNum: "1", heads: "To S", stops: [S("8888", 2, 2)] }]) };
const rE = sandbox.buildBoardRows("9999",
  [{ min: 3, route: "X02", dir: "South to S", dirNum: "1", heads: "To S", vehicle: "20", trip: "95" }],
  rdE, []);
check("syn E: compact (dir1) + service (dir0)",
  rE.length === 2 &&
  rE.some(r => r.kind === "compact" && r.dirNum === "1") &&
  rE.some(r => r.kind === "service" && r.dirNum === "0" && r.anchorIdx === 0));

// ---- F: synthetic — details unavailable → compact note ----
const rZ = sandbox.buildBoardRows("9999",
  [{ min: 4, route: "Q99", dir: "To Q", dirNum: "0", heads: "To Q", vehicle: "30", trip: "99" }],
  {}, []);
check("syn F: compact 'route details unavailable'",
  rZ.length === 1 && rZ[0].kind === "compact" && /unavailable/.test(rZ[0].note));

// ---- G: synthetic — no predictions, both directions contain anchor → 2 service ----
const rdG = { X03: mkEntry("X03", [
  { dirNum: "0", heads: "To N", stops: [S("9999", 1, 1), S("1", 2, 2)] },
  { dirNum: "1", heads: "To S", stops: [S("3", 3, 3), S("9999", 1, 1)] }]) };
const rW = sandbox.buildBoardRows("9999", [], rdG, []);
check("syn G: two service rows, sorted",
  rW.length === 2 && rW.every(r => r.kind === "service") &&
  rW[0].dirNum === "0" && rW[1].dirNum === "1" && rW[1].anchorIdx === 1);

// ---- H: duplicate vehicle predictions collapse to one dot list ----
const rH = sandbox.buildBoardRows("9999", [
  { min: 4, route: "X01", dir: "North to X", dirNum: "0", heads: "To X", vehicle: "10", trip: "90" },
  { min: 9, route: "X01", dir: "North to X", dirNum: "0", heads: "To X", vehicle: "10", trip: "91" }],
  rdX, []);
check("syn H: same vehicle + heads = one row, both mins, one vehicle",
  rH.length === 1 && JSON.stringify(rH[0].mins) === "[4,9]" && rH[0].vehicles.length === 1);

// ---- I: recently departed buses ----
const stopI = {
  Arrivals: [
    { min: 1, route: "X01", dirNum: "0", heads: "To X", vehicle: "10", trip: "90" },
    { min: 20, route: "X02", dirNum: "0", heads: "To Y", vehicle: "11", trip: "91" },
  ],
  ArrivalsAt: 1000000, Departed: [],
};
sandbox.updateDeparted(stopI, [], 1060000);
check("syn I: a 1-min bus that vanishes becomes departed",
  stopI.Departed.length === 1 && stopI.Departed[0].route === "X01" &&
  stopI.Departed[0].departedAt === 1060000);
sandbox.updateDeparted(stopI, [], 1300000);
check("syn I: departed entry expires after 2 minutes", stopI.Departed.length === 0);
const stopJ = {
  Arrivals: [{ min: 20, route: "X02", dirNum: "0", heads: "To Y", vehicle: "11", trip: "91" }],
  ArrivalsAt: 1000000, Departed: [],
};
sandbox.updateDeparted(stopJ, [], 1030000);
check("syn I: a far-future vanished prediction is not marked departed",
  stopJ.Departed.length === 0);

// ---- J: no duplicate scheduled row for a live route+headsign ----
const rdDup = { D44: mkEntry("D44", [
  { dirNum: "0", heads: "FORT TOTTEN", stops: [S("9999", 1, 1)] },
  { dirNum: "1", heads: "FEDERAL TRIANGLE", stops: [S("9999", 1, 1)] }]) };
const rDup = sandbox.buildBoardRows("9999",
  [{ min: 4, route: "D44", dir: "South to Federal Triangle", dirNum: "0",
     heads: "South to Federal Triangle", vehicle: "44", trip: "440" }], rdDup, []);
check("syn J: live route+headsign suppresses duplicate service row",
  rDup.length === 1 && rDup[0].mins[0] === 4);

// ---- K: cross-route rows sort by soonest ETA ----
const rSort = sandbox.buildBoardRows("9999", [
  { min: 3, route: "D72", dirNum: "0", heads: "North to Van Ness" },
  { min: 13, route: "D72", dirNum: "0", heads: "North to Mt Pleasant" },
  { min: 14, route: "D74", dirNum: "0", heads: "East to Rhode Island Av" },
  { min: 7, route: "C53", dirNum: "1", heads: "South to Congress Hts" },
  { min: 17, route: "C51", dirNum: "1", heads: "South to Anacostia" },
  { min: 1, route: "C53", dirNum: "0", heads: "North to Woodley Park" },
  { min: 22, route: "C51", dirNum: "0", heads: "North to Tenleytown" },
  { min: 6, route: "C53", dirNum: "1", heads: "South to Congress Hts" },
  { min: 15, route: "C51", dirNum: "1", heads: "South to Anacostia" },
], {}, []);
check("syn K: rows sorted by soonest ETA across routes",
  rSort.every((r, i) => i === 0 || rSort[i - 1].first <= r.first) &&
  rSort[0].route === "C53" && rSort[0].first === 1 &&
  JSON.stringify(rSort.find(r => r.route === "C53" && r.dirNum === "1").mins) === "[6,7]");

// ---- L: service row with empty headsign but matching direction text ----
const rdDup2 = { D44: mkEntry("D44", [
  { dirNum: "0", heads: "FORT TOTTEN", stops: [S("9999", 1, 1)] },
  { dirNum: "1", heads: "", stops: [S("9999", 1, 1)] }]) };
const rDup2 = sandbox.buildBoardRows("9999",
  [{ min: 4, route: "D44", dir: "South to Federal Triangle", dirNum: "0",
     heads: "South to Federal Triangle", vehicle: "44", trip: "441" }], rdDup2, []);
check("syn L: service row matching a live direction text is removed",
  rDup2.length === 1 && rDup2[0].mins[0] === 4);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
