// Piece 6: board geometry tests (vm-extracted pure functions).
const fs = require("fs");
const vm = require("vm");
const script = require("./lib/extract").pageScript();
const ctx = { console };
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
const consts = script.split("\n").filter((l) => /^const (BOARD_|LAT_)/.test(l)).join("\n");
const src = [consts, extractFn("distance"), extractFn("localXY"),
  extractFn("projArcOnShape"), extractFn("trackArcs"),
  extractFn("rowLayout"), extractFn("boardScale"), extractFn("boardGeometry")].join("\n");
vm.runInContext(src, ctx);
const LAT = Number(script.match(/const LAT_FT_PER_DEG = (\d+)/)[1]);

let pass = 0, fail = 0;
function t(label, ok, extra) {
  if (ok) { pass++; console.log("PASS  " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("FAIL  " + label + (extra ? "  " + extra : "")); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const S = (id, name, lat, lon) => ({ id, name, lat, lon });

// ── A: projArcOnShape basics ──────────────────────────────────────────
{
  const shape = [S("s0","",40,-77), S("s1","",40.01,-77), S("s2","",40.02,-77)];
  const cum = [0];
  for (let i = 1; i < shape.length; i++)
    cum.push(cum[i-1] + ctx.distance(shape[i-1].lat, shape[i-1].lon, shape[i].lat, shape[i].lon, "f"));
  t("A1 empty shape -> null", ctx.projArcOnShape(S("x","",40,-77.1), [], [0], shape[0]) === null);
  t("A2 missing coords -> null", ctx.projArcOnShape(S("x","",null,null), shape, cum, shape[0]) === null);
  const on = ctx.projArcOnShape(S("x","",40.01,-77), shape, cum, shape[0]);
  t("A3 stop on shape -> exact arc", near(on, cum[1], 1), "arc=" + on + " cum[1]=" + cum[1]);
  const off = ctx.projArcOnShape(S("x","",40.01,-76.99), shape, cum, shape[0]);
  t("A4 off-shape stop -> projects to nearest (same arc as on-shape)", near(off, cum[1], 1), "arc=" + off);
}

// ── B: monotonic projections -> mode "shape" ──────────────────────────
{
  const shape = [S("s0","",40,-77), S("s1","",40.01,-77), S("s2","",40.02,-77)];
  const pat = { stops: [S("a","A",40,-77), S("b","B",40.01,-77), S("c","C",40.02,-77)], shape };
  const r = ctx.trackArcs(pat);
  t("B1 monotonic on-shape -> mode shape", r.mode === "shape");
  const cum = [0];
  for (let i = 1; i < shape.length; i++)
    cum.push(cum[i-1] + ctx.distance(shape[i-1].lat, shape[i-1].lon, shape[i].lat, shape[i].lon, "f"));
  t("B2 arcs match shape projections",
    r.arc.every((v, i) => near(v, cum[i], 1)), JSON.stringify(r.arc.map(v => Math.round(v))));
}

// ── C: reversed order -> non-monotonic -> mode "stops" ────────────────
{
  const shape = [S("s0","",40,-77), S("s1","",40.01,-77), S("s2","",40.02,-77)];
  const pat = { stops: [S("c","C",40.02,-77), S("b","B",40.01,-77), S("a","A",40,-77)], shape };
  const r = ctx.trackArcs(pat);
  t("C1 reversed stops -> mode stops", r.mode === "stops");
  const leg1 = ctx.distance(40.02, -77, 40.01, -77, "f");
  const leg2 = ctx.distance(40.01, -77, 40, -77, "f");
  t("C2 arcs = straight-line legs", near(r.arc[0], 0, 1) && near(r.arc[1], leg1, 2) && near(r.arc[2], leg1 + leg2, 2),
    JSON.stringify(r.arc.map(v => Math.round(v))));
}

// ── D: no shape -> straight legs, mode "stops" ─────────────────────────
{
  const dlon = 1000 / (LAT * Math.cos(40 * Math.PI / 180));
  const pat = { stops: [S("a","A",40,-77), S("b","B",40,-77+dlon), S("c","C",40,-77+2*dlon)], shape: [] };
  const r = ctx.trackArcs(pat);
  const lay = ctx.rowLayout(pat, 1);
  t("D1 empty shape -> mode stops", r.mode === "stops");
  t("D2 anchor mid: signed [-1000,0,1000]",
    near(lay.signed[0], -1000, 3) && lay.signed[1] === 0 && near(lay.signed[2], 1000, 3),
    JSON.stringify(lay.signed.map(v => Math.round(v))));
  t("D3 extents", near(lay.negFt, 1000, 3) && near(lay.posFt, 1000, 3), "neg=" + Math.round(lay.negFt) + " pos=" + Math.round(lay.posFt));
  t("D4 termIdx = last", lay.termIdx === 2);
}

// ── E: rowLayout on live C87 dir0 (anchor 1002130 @ idx 2 of 15) ──────
{
  function norm(entry) {
    const dirs = [];
    for (const key of ["Direction0", "Direction1"]) {
      const d = entry[key];
      if (!d) continue;
      dirs.push({ route: entry.RouteID, dirNum: d.DirectionNum, heads: d.TripHeadsign, dirText: d.DirectionText,
        stops: (d.Stops || []).map((s) => ({ id: s.StopID, name: s.Name, lat: s.Lat, lon: s.Lon })),
        shape: (d.Shape || []).map((p) => ({ lat: p.Lat, lon: p.Lon })) });
    }
    return { route: entry.RouteID, name: entry.Name, directions: dirs };
  }
  const rtC87 = JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "route_C87.json"), "utf8"));
  const d0 = norm(rtC87).directions[0];
  const idx = d0.stops.findIndex(s => s.id === "1002130");
  const tr = ctx.trackArcs(d0);
  let mono = true;
  for (let i = 1; i < tr.arc.length; i++) if (tr.arc[i] < tr.arc[i-1] - 50) mono = false;
  const lay = ctx.rowLayout(d0, idx);
  console.log("  (live) C87 dir0 mode=" + tr.mode + " stops=" + d0.stops.length +
    " totalArc=" + Math.round(tr.arc[tr.arc.length-1]) + "ft mono=" + mono);
  t("E1 15 stops, anchor idx 2", d0.stops.length === 15 && idx === 2);
  t("E2 mode is shape|stops and consistent", (tr.mode === "shape") === mono, "mode=" + tr.mode + " mono=" + mono);
  t("E3 anchor at 0, extents nonneg", lay.signed[idx] === 0 && lay.negFt >= 0 && lay.posFt >= 0,
    "neg=" + Math.round(lay.negFt) + " pos=" + Math.round(lay.posFt));
  t("E4 terminal = last occurrence", lay.termIdx === d0.stops.length - 1);
}

// ── F: boardGeometry — shared scale, min extent, flags ────────────────
{
  const dlon15k = 15000 / (LAT * Math.cos(40 * Math.PI / 180));
  const longPat = { stops: [S("a","A",40,-77), S("b","B",40,-77+dlon15k)], shape: [] };   // 15000 ft one side
  const dlon1k = 1000 / (LAT * Math.cos(40 * Math.PI / 180));
  const shortPat = { stops: [S("c","C",40,-77), S("d","D",40,-77+dlon1k)], shape: [] };  // 1000 ft
  const long = { kind: "track", route: "M1", anchorIdx: 0, pattern: longPat };
  const short = { kind: "service", route: "M2", anchorIdx: 0, pattern: shortPat };
  const compact = { kind: "compact", route: "M3" };
  const g = ctx.boardGeometry([long, short, compact]);

  t("F1 scale from longest path (280px / 15000ft)", near(g.scale, 280 / 15000, 1e-4), "scale=" + g.scale);
  t("F2 long row posPx = 280", near(g.rows[0].posPx, 280, 0.5), "posPx=" + g.rows[0].posPx.toFixed(1));
  t("F3 short row: shared scale but 120px floor", near(g.rows[1].posPx, 120, 0.01) && g.rows[1].stops[1].x < 120,
    "posPx=" + g.rows[1].posPx.toFixed(1) + " lastX=" + g.rows[1].stops[1].x.toFixed(1));
  t("F4 anchor at x=0, terminal right", g.rows[0].stops[0].x === 0 && g.rows[0].stops[0].anchor === true &&
    g.rows[0].stops[1].x === 280 && g.rows[0].stops[1].terminal === true, "termX=" + g.rows[0].termX.toFixed(1));
  t("F5 service row gets a track too", g.rows[1].hasTrack === true && g.rows[1].mode === "stops");
  t("F6 compact row -> hasTrack false", g.rows[2].hasTrack === false && g.rows[2].stops === undefined);
  t("F7 termX/termId of long row", near(g.rows[0].termX, 280, 0.5) && g.rows[0].termId === "b");
}

// ── G: single-stop pattern -> floors only, scale = 280/3000 ──────────
{
  const one = { kind: "track", route: "S1", anchorIdx: 0, pattern: { stops: [S("t","T",40,-77)], shape: [] } };
  const g = ctx.boardGeometry([one]);
  t("G1 scale = 280/3000 (min extent)", near(g.scale, 280 / 3000, 1e-5), "scale=" + g.scale);
  t("G2 both sides floored to 120px, x=0", near(g.rows[0].negPx, 120, 0.01) && near(g.rows[0].posPx, 120, 0.01) &&
    g.rows[0].stops[0].x === 0 && g.rows[0].termX === 0 && g.rows[0].termId === "t");
}

// ── H: loop repeat — terminal is the LAST occurrence ──────────────────
{
  const dlon = 500 / (LAT * Math.cos(40 * Math.PI / 180));
  const A = S("a","A",40,-77), B = S("b","B",40,-77+dlon), A2 = S("a","A",40,-77);
  const loop = { kind: "track", route: "L1", anchorIdx: 0, pattern: { stops: [A, B, A2], shape: [] } };
  const g = ctx.boardGeometry([loop]);
  const row = g.rows[0];
  t("H1 terminal = last occurrence (loop back)", row.termId === "a" && row.stops[2].terminal === true &&
    near(row.termX, 1000 * g.scale, 0.5), "termX=" + row.termX.toFixed(1) + " (loop maps to full arc)");
  t("H2 extent = full loop arc (1000ft), floored 120px", near(row.posPx, Math.max(1000 * g.scale, 120), 0.01),
    "posPx=" + row.posPx.toFixed(1) + " scale=" + g.scale);
}

// ── I: no trackable rows -> scale floor, all hasTrack false ──────────
{
  const g = ctx.boardGeometry([{ kind: "compact", route: "M9" }]);
  t("I1 scale = 280/3000", near(g.scale, 280 / 3000, 1e-5));
  t("I2 compact row untouched", g.rows[0].hasTrack === false);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
