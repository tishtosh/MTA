// Piece 8: vehicle-marker tests (vm-extracted pure functions).
// pointOnTrack (arbitrary lat/lon -> signed ft on the row's track axis),
// posRowFor (prediction -> position row), buildBusMarkers (row -> markers).
const fs = require("fs");
const vm = require("vm");
const script = require("./lib/extract").pageScript();
const ctx = { console, Date };
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
const consts = script.split("\n")
  .filter((l) => /^(const (BUS_|BOARD_|LAT_))/.test(l)).join("\n");
const src = [consts, extractFn("distance"), extractFn("localXY"),
  extractFn("projArcOnShape"), extractFn("trackArcs"),
  extractFn("rowLayout"), extractFn("boardScale"), extractFn("boardGeometry"),
  extractFn("pointOnTrack"), extractFn("posRowFor"),
  extractFn("buildBusMarkers")].join("\n");
vm.runInContext(src, ctx);

let pass = 0, fail = 0;
function t(label, ok, extra) {
  if (ok) { pass++; console.log("PASS  " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("FAIL  " + label + (extra ? "  " + extra : "")); }
}

// ── fixtures: a straight north-south corridor, 0.01° lat legs ──────────
const LON = -77.0;
const S = (i, lat) => ({ id: "s" + i, name: "Stop " + i, lat, lon: LON });
const stops = [S(0, 38.900), S(1, 38.910), S(2, 38.920), S(3, 38.930), S(4, 38.940)];
const leg = ctx.distance(38.900, LON, 38.910, LON, "f");   // haversine feet per leg
console.log("  leg = " + leg + " ft");
const dlatPerFt = 0.01 / leg;                               // latitude degrees per foot
const patA = { stops, shape: [] };                         // mode "stops"
const shape = [];
for (let lat = 38.898; lat <= 38.942 + 1e-9; lat += 0.002) shape.push({ lat, lon: LON });
const patB = { stops: stops.map(s => ({ ...s })), shape }; // mode "shape"

// ── P: pointOnTrack, stops mode ────────────────────────────────────────
{
  const p = ctx.pointOnTrack(patA, 2, "stops", 38.915, LON);
  t("P1 mid-leg point -> ft = -leg/2", p && Math.abs(p.ft + leg / 2) <= 5, "ft=" + (p && p.ft));
  t("P1 on-corridor point -> off ≈ 0", p && p.off <= 2, "off=" + (p && p.off));
  const q = ctx.pointOnTrack(patA, 2, "stops", 38.915, LON + 0.00005);
  t("P2 14 ft off-corridor -> off in range", q && q.off > 10 && q.off < 20, "off=" + q.off);
  t("P2 off-corridor keeps same ft", q && Math.abs(q.ft - p.ft) <= 5, "ft=" + q.ft);
  const a = ctx.pointOnTrack(patA, 2, "stops", 38.920, LON);
  t("P3 at the anchor -> ft 0", a && Math.abs(a.ft) <= 1 && a.off <= 1, "ft=" + a.ft);
  t("P4 bad coords -> null", ctx.pointOnTrack(patA, 2, "stops", NaN, LON) === null);
}

// ── Q: pointOnTrack, shape mode ─────────────────────────────────────────
{
  const arcAnchor = ctx.distance(38.898, LON, 38.920, LON, "f"); // cum at the anchor
  const lat5k = 38.920 - dlatPerFt * 5000;
  const p = ctx.pointOnTrack(patB, 2, "shape", lat5k, LON);
  t("Q1 shape: bus 5000 ft upstream -> ft ≈ -5000", p && Math.abs(p.ft + 5000) <= 15, "ft=" + (p && p.ft));
  t("Q1 shape: on-shape -> off ≈ 0", p && p.off <= 2, "off=" + (p && p.off));
  // a stop 20 ft east of the shape still projects to the same arc
  const stops2 = stops.map(s => ({ ...s }));
  stops2[2].lon = LON + 20 / (364000 * Math.cos(38.92 * Math.PI / 180));
  const patC = { stops: stops2, shape };
  const p2 = ctx.pointOnTrack(patC, 2, "shape", lat5k, LON);
  t("Q2 jittered anchor stop -> ft unchanged (±25)", p2 && Math.abs(p2.ft + 5000) <= 25, "ft=" + (p2 && p2.ft));
  // consistency with rowLayout: markers share the dots' scale
  const rl = ctx.rowLayout(patB, 2);
  const worst = Math.max(...rl.signed.map((v, j) =>
    Math.abs(ctx.pointOnTrack(patB, 2, "shape", stops[j].lat, stops[j].lon).ft - v)));
  t("Q3 pointOnTrack matches rowLayout at every stop", worst <= 5, "worft=" + worst.toFixed(2));
  t("Q3b patB is mode shape (fixture sanity)", rl.mode === "shape");
}

// ── M: buildBusMarkers ──────────────────────────────────────────────────
const mkRow = (pattern, preds) => ({ kind: "track", route: "D72", dirNum: "0",
  heads: "VILLAGE", dest: "VILLAGE", pattern, anchorIdx: 2,
  anchorPatStop: pattern.stops[2], mins: preds.map(p => p.min), preds });
const mkGeo = rows => { const geo = ctx.boardGeometry(rows); return { g: geo.rows[0], scale: geo.scale }; };
const mkPred = (min, vehicle, trip) => ({ min, route: "D72", dirNum: "0", heads: "VILLAGE",
  vehicle: vehicle || null, trip: trip || null });
const mkSample = (lat, vehicle, trip) => ({ vehicle: vehicle || "V1", route: "D72",
  trip: trip || "T1", dirNum: "0", heads: "", dirText: "", lat, lon: LON, at: 0 });
const NOW = 1760000000000;
const sampleAt = (ftUp, ageMs, vehicle, trip) =>
  Object.assign(mkSample(38.920 - dlatPerFt * ftUp, vehicle, trip), { at: NOW - ageMs });
const ftMin = -2 * leg;   // leftmost stop (s0) signed ft
{
  // M1 fresh sample 200 ft upstream -> filled marker on the track
  const row = mkRow(patA, [mkPred(14, "V1", "T1")]);
  const { g, scale } = mkGeo([row]);
  const ms = ctx.buildBusMarkers(row, g, scale, [sampleAt(200, 5 * 60000, "V1", "T1")], NOW);
  t("M1 one marker", ms.length === 1, JSON.stringify(ms));
  t("M1 live + min 14", ms[0].live === true && ms[0].min === 14);
  t("M1 x ≈ -200 ft * scale", Math.abs(ms[0].x + 200 * scale) <= 1, "x=" + ms[0].x);
  // M2 stale sample (130 min) -> estimate, clamped to the first upstream stop
  const ms2 = ctx.buildBusMarkers(row, g, scale, [sampleAt(200, 130 * 60000, "V1", "T1")], NOW);
  t("M2 stale -> estimated", ms2.length === 1 && ms2[0].live === false);
  t("M2 clamped to leftmost stop", Math.abs(ms2[0].x - ftMin * scale) <= 1, "x=" + ms2[0].x);
  // M3 no sample at all -> same estimate
  const ms3 = ctx.buildBusMarkers(row, g, scale, [], NOW);
  t("M3 no sample -> estimate, clamped", ms3.length === 1 && ms3[0].live === false &&
    Math.abs(ms3[0].x - ftMin * scale) <= 1);
  // M4 short ETA stays inside the window
  const row4 = mkRow(patA, [mkPred(1, "V1", "T1")]);
  const ms4 = ctx.buildBusMarkers(row4, g, scale, [], NOW);
  t("M4 1 min -> -704 ft, unclamped", ms4.length === 1 && ms4[0].live === false &&
    Math.abs(ms4[0].x + 704 * scale) <= 1, "x=" + ms4[0].x);
  // M5 0 min sits on the guide
  const row5 = mkRow(patA, [mkPred(0, "V1", "T1")]);
  const ms5 = ctx.buildBusMarkers(row5, g, scale, [], NOW);
  t("M5 0 min -> x = 0 (on the guide)", ms5.length === 1 && Math.abs(ms5[0].x) < 0.01, "x=" + ms5[0].x);
  // M6 sample 500 ft off the corridor -> falls back to the estimate
  const ms6 = ctx.buildBusMarkers(row, g, scale,
    [Object.assign(mkSample(38.915, "V1", "T1"), { lon: LON + 500 / (364000 * Math.cos(38.9 * Math.PI / 180)), at: NOW - 60000 })], NOW);
  t("M6 off-line sample (500 ft) -> estimated", ms6.length === 1 && ms6[0].live === false);
  // M7 live sample PAST the anchor -> marker on the far side of the guide
  const ms7 = ctx.buildBusMarkers(row, g, scale,
    [Object.assign(mkSample(38.920 + dlatPerFt * 500, "V1", "T1"), { at: NOW - 60000 })], NOW);
  t("M7 past-anchor sample -> live, +500 ft", ms7.length === 1 && ms7[0].live === true &&
    Math.abs(ms7[0].x - 500 * scale) <= 1, "x=" + ms7[0].x);
  // M8 live sample beyond the pattern end -> clamped to the terminal stop
  const ms8 = ctx.buildBusMarkers(row, g, scale,
    [Object.assign(mkSample(38.920 + dlatPerFt * 9000, "V1", "T1"), { at: NOW - 60000 })], NOW);
  t("M8 beyond the pattern -> live, clamped to +2*leg", ms8.length === 1 && ms8[0].live === true &&
    Math.abs(ms8[0].x - 2 * leg * scale) <= 1, "x=" + ms8[0].x);
  // M9 two predictions: one live, one estimated
  const row9 = mkRow(patA, [mkPred(14, "V1", "T1"), mkPred(40, "V2", "T2")]);
  const ms9 = ctx.buildBusMarkers(row9, g, scale, [sampleAt(200, 60000, "V1", "T1")], NOW);
  t("M9 two markers", ms9.length === 2);
  t("M9 first live @ -200 ft", ms9[0].live === true && Math.abs(ms9[0].x + 200 * scale) <= 1);
  t("M9 second estimated + clamped (40 min)", ms9[1].live === false &&
    Math.abs(ms9[1].x - ftMin * scale) <= 1);
}

// ── R: posRowFor ────────────────────────────────────────────────────────
{
  const rows = [
    { route: "D72", trip: "T1", vehicle: "V1", dirNum: "0" },
    { route: "D72", trip: "T2", vehicle: "V2", dirNum: "0" },
    { route: "D72", trip: "T3", vehicle: "V3", dirNum: "1" },
    { route: "C87", trip: "T1", vehicle: "V8", dirNum: "0" }
  ];
  t("R1 trip match wins over vehicle", ctx.posRowFor({ route: "D72", trip: "T1", vehicle: "V9", dirNum: "" }, rows).vehicle === "V1");
  t("R2 vehicle fallback when no trip", ctx.posRowFor({ route: "D72", trip: "", vehicle: "V2", dirNum: "" }, rows).vehicle === "V2");
  t("R3 route mismatch -> null", ctx.posRowFor({ route: "C87", trip: "T9", vehicle: "V1", dirNum: "" }, rows) === null);
  t("R4 dirNum conflict -> null", ctx.posRowFor({ route: "D72", trip: "T3", vehicle: "", dirNum: "0" }, rows) === null);
  t("R5 empty rows -> null", ctx.posRowFor({ route: "D72", trip: "T1", vehicle: "V1", dirNum: "" }, []) === null);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
