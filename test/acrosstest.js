// Piece 5: across-the-street resolver tests (vm-extracted pure functions).
const fs = require("fs");
const vm = require("vm");
const script = require("./lib/extract").pageScript();
const ctx = { console, allStopsName: () => "" };
vm.createContext(ctx);
function extractFn(name) {
  const i = script.indexOf("function " + name);
  if (i < 0) throw new Error("not found: " + name);
  const brace = script.indexOf("{", i);
  let depth = 0;
  for (let j = brace; j < script.length; j++) {
    if (script[j] === "{") depth++;
    else if (script[j] === "}") { depth--; if (!depth) return script.slice(i, j + 1); }
  }
  throw new Error("unbalanced: " + name);
}
const consts = script.split("\n").filter((l) => /^const ACROSS_/.test(l)).join("\n");
const src = [consts,
  extractFn("distance"), extractFn("streetTokens"), extractFn("namesMatch"),
  extractFn("bearing"), extractFn("angleDiffDeg"), extractFn("localBearing"),
  extractFn("acrossTheStreet")].join("\n");
vm.runInContext(src, ctx);
let pass = 0, fail = 0;
function t(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log("PASS  " + label); }
  else { fail++; console.log("FAIL  " + label + "\n  got:  " + JSON.stringify(got) + "\n  want: " + JSON.stringify(want)); }
}
const C = (o) => ({ id: o.id, name: o.name, lat: o.lat, lon: o.lon });
// Build the patterns map: stopId -> [normalized direction entries that list it].
function patternsOf(routeEntries) {
  const map = {};
  for (const entry of routeEntries)
    for (const d of entry.directions)
      for (const s of d.stops) (map[s.id] = map[s.id] || []).push(d);
  return map;
}

// --- A: live jstops300 vs C87+D72 patterns: expect null for both anchors.
function norm(entry) {
  const dirs = [];
  for (const key of ["Direction0", "Direction1"]) {
    const d = entry[key];
    if (!d) continue;
    dirs.push({ route: entry.RouteID, dirNum: d.DirectionNum, heads: d.TripHeadsign, dirText: d.DirectionText,
      stops: (d.Stops || []).map((s) => ({ id: s.StopID, name: s.Name, lat: s.Lat, lon: s.Lon })),
      shape: (d.Shape || []).map((p) => ({ lat: p.Lat, lon: p.Lon })),
      byId: Object.fromEntries((d.Stops || []).map((s) => [s.StopID, s])) });
  }
  return { route: entry.RouteID, name: entry.Name, directions: dirs };
}
const rtC87 = JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "route_C87.json"), "utf8"));
const rtD72 = JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "route_D72.json"), "utf8"));
const jstops = JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "jstops_near.json"), "utf8")).Stops;
const patterns = patternsOf([norm(rtC87), norm(rtD72)]);
const nearby = jstops.map((s) => C({ id: s.StopID, name: s.Name, lat: s.Lat, lon: s.Lon }));
const byId = Object.fromEntries(nearby.map((s) => [s.id, s]));
const near130 = nearby.filter((s) => s.id !== "1002130");
console.log("  (live) 1002135 in any pattern? " + (1002135 in patterns || "no") + " | 1002118 name/overlap: " + byId["1002118"].name);
t("live 1002130 -> null", ctx.acrossTheStreet(byId["1002130"], near130, patterns), null);
t("live 1002135 -> null (not in any pattern)", ctx.acrossTheStreet(byId["1002135"], nearby.filter((s) => s.id !== "1002135"), patterns), null);

// --- B: synthetic accepted pair (opposing dir0/dir1 of same route, ~194 ft, same name).
const a1 = C({ id: "S1", name: "Park Rd NW+19 St NW", lat: 38.932654, lon: -77.043927 });
const a2 = C({ id: "S2", name: "Park Rd NW+19 St NW", lat: 38.933100, lon: -77.044300 });
const eW = C({ id: "EW1", name: "down", lat: 38.932700, lon: -77.042900 }); // east of S1 (dir0 continues east)
const wW = C({ id: "WW1", name: "down", lat: 38.933100, lon: -77.045300 }); // west of S2 (dir1 continues west)
const dirs0 = { route: "R1", dirNum: "0", stops: [a1, eW], shape: [] };
const dirs1 = { route: "R1", dirNum: "1", stops: [a2, wW], shape: [] };
console.log("  (sanity) dist S1-S2 = " + ctx.distance(a1.lat, a1.lon, a2.lat, a2.lon, "f") + " ft");
t("synthetic opposing pair accepted", ctx.acrossTheStreet(a1, [a2, eW], patternsOf([{ route: "R1", directions: [dirs0, dirs1] }])), a2);

// --- C: successive stop on the SAME pattern / same-name same-pattern -> rejected.
const s3 = C({ id: "S3", name: "Park Rd NW+20 St NW", lat: 38.932700, lon: -77.042900 }); // after S1, diff cross street
const s4 = C({ id: "S4", name: "Park Rd NW+19 St NW", lat: 38.932700, lon: -77.042900 }); // same name, same pattern
const pSame = { route: "R1", dirNum: "0", stops: [a1, s3, s4, eW], shape: [] };
t("successive stop (different cross street) rejected", ctx.acrossTheStreet(a1, [s3, s4], patternsOf([{ route: "R1", directions: [pSame] }])), null);
t("same-name stop on same pattern rejected", ctx.acrossTheStreet(a1, [s4], patternsOf([{ route: "R1", directions: [dirs0, { route: "R1", dirNum: "0", stops: [a1, s4, eW], shape: [] }] }])), null);

// --- D: same-direction continuation on the opposite side (same bearing) -> rejected.
const s5 = C({ id: "S5", name: "Park Rd NW+19 St NW", lat: 38.932700, lon: -77.042500 }); // east of S1
const d0s5 = { route: "R1", dirNum: "0", stops: [s5, eW], shape: [] };
t("same-direction continuation rejected", ctx.acrossTheStreet(a1, [s5], patternsOf([{ route: "R1", directions: [dirs0, dirs1, d0s5] }])), null);

// --- E: two valid candidates -> ambiguous -> null.
const a3 = C({ id: "S3B", name: "Park Rd NW+19 St NW", lat: 38.932200, lon: -77.044300 }); // S of S1, ~198 ft
const wW2 = C({ id: "WW2", name: "down", lat: 38.932200, lon: -77.045300 });
const d1a3 = { route: "R1", dirNum: "1", stops: [a3, wW2], shape: [] };
t("two candidates -> ambiguous -> null", ctx.acrossTheStreet(a1, [a2, a3, eW], patternsOf([{ route: "R1", directions: [dirs0, dirs1, d1a3] }])), null);

// --- F: same name, no shared route -> rejected.
const a4 = C({ id: "S4B", name: "Park Rd NW+19 St NW", lat: 38.933100, lon: -77.044300 });
t("no shared route -> rejected", ctx.acrossTheStreet(a1, [a4], patternsOf([{ route: "R1", directions: [dirs0, dirs1] }, { route: "R2", directions: [{ route: "R2", dirNum: "1", stops: [a4, wW], shape: [] }] }])), null);

// --- G: suffix normalization in names.
t("tokens: 'Park Rd NW' == 'Park Road NW'", JSON.stringify([...ctx.streetTokens("Park Rd NW")]), JSON.stringify([...ctx.streetTokens("Park Road NW")]));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
