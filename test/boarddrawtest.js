// Piece 7a: board drawing tests (vm-extracted pure functions).
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
// One full const declaration (single- or multi-line), comments tolerated.
function constBlock(name) {
  const lines = script.split("\n");
  const re = new RegExp("^(const|let) " + name + "\\b");
  const i = lines.findIndex((l) => re.test(l));
  if (i < 0) throw new Error("const not found: " + name);
  let j = i;
  while (j < lines.length && !lines[j].replace(/\/\/.*$/, "").trimEnd().endsWith(";")) j++;
  if (j >= lines.length) throw new Error("unterminated const: " + name);
  return lines.slice(i, j + 1).join("\n");
}
const names = ["BOARD_MAX_SIDE_PX", "BOARD_MIN_EXTENT_FT", "BOARD_MIN_EXTENT_PX",
  "LAT_FT_PER_DEG", "B_PAD_L", "B_PAD_R", "B_TRACK_H", "B_RH", "ROUTE_COLORS",
  "expandedStops", "rowKey"];
let src = [names.map(constBlock).join("\n"),
  extractFn("distance"), extractFn("localXY"), extractFn("projArcOnShape"),
  extractFn("trackArcs"), extractFn("rowLayout"), extractFn("boardScale"),
  extractFn("boardGeometry"), extractFn("esc"), extractFn("routeColor"),
  extractFn("fmtEta"), extractFn("boardEtasHtml"),
  extractFn("trackRowSvg"), extractFn("boardRowHead"), extractFn("boardHtml")].join("\n");
// const/let bindings stay in the script's lexical scope, not on ctx — expose
// the two piece-11 ones so the tests can poke them.
src += "\nglobalThis.__expandedStops = expandedStops;\nglobalThis.__rowKey = rowKey;";
vm.runInContext(src, ctx);

let pass = 0, fail = 0;
function t(label, ok, extra) {
  if (ok) { pass++; console.log("PASS  " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("FAIL  " + label + (extra ? "  " + extra : "")); }
}
const S = (id, name, lat, lon) => ({ id, name, lat, lon });
const dlon = (ft) => ft / (Number(script.match(/const LAT_FT_PER_DEG = (\d+)/)[1]) * Math.cos(40 * Math.PI / 180));
// Mirror of the page's routeColor hash, for an independent expectation.
const palette = eval(constBlock("ROUTE_COLORS").replace(/^const ROUTE_COLORS = /, "").replace(/;\s*$/, ""));
const expectColor = (r) => { let h = 0; for (const c of String(r)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return palette[h % palette.length]; };

// ── routeColor / fmtEta / boardEtasHtml ───────────────────────────────
t("R1 routeColor deterministic palette member",
  ctx.routeColor("C87") === expectColor("C87") && /^#[0-9a-f]{6}$/.test(ctx.routeColor("C87")), ctx.routeColor("C87"));
t("R2 distinct routes land on stable colors",
  ctx.routeColor("D72") === expectColor("D72") && ctx.routeColor("M1") === ctx.routeColor("M1"));
t("A1 0 min = Due", ctx.fmtEta(0) === "Due");
t("A2 plain minutes", ctx.fmtEta(3) === "3 min" && ctx.fmtEta(17.4) === "17 min");
t("A3 empty list", ctx.boardEtasHtml([]).includes("no upcoming predictions"));
{
  const h = ctx.boardEtasHtml([3, 14, 40]);
  t("A4 first emphasized, rest ascending",
    h.includes('class="board-eta-first">3 min') && h.includes("14 min · 40 min"), h.slice(0, 90));
}

// ── trackRowSvg ───────────────────────────────────────────────────────
{
  const d = 1000 * dlon(1);
  const pat = { stops: [S("a","A<1>",40,-77), S("b","B",40,-77+d), S("c","C",40,-77+2*d), S("term","Terminal X",40,-77+3*d)], shape: [] };
  const row = { kind: "track", route: "C87", dest: "Terminal X", mins: [0],
                pattern: pat, anchorIdx: 0, anchorPatStop: pat.stops[0] };
  const g = ctx.boardGeometry([row]).rows[0];
  const originX = 16 + g.negPx, W = Math.ceil(originX + g.posPx + 30);
  const n1 = (v) => v.toFixed(1);   // how the page emits X()
  const svg = ctx.trackRowSvg(g, originX, W, "#c62828",
    [{ x: -60, min: 3, live: true }, { x: -100, min: 9, live: false }]);
  t("B1 guide at originX, full height",
    svg.includes(`<line class="bt-guide" x1="${originX}" y1="3" x2="${originX}" y2="${34 - 3}"/>`));
  t("B2 baseline spans both sides",
    svg.includes(`x1="${n1(originX - g.negPx)}"`) && svg.includes(`x2="${n1(originX + g.posPx)}"`));
  t("B3 direction arrow at right end, numeric tip",
    svg.includes('class="bt-arrow"') && svg.includes(`L ${originX + g.posPx + 1} ${34 / 2}`));
  t("B4 two plain dots (anchor+terminal excluded)", (svg.match(/class="bt-dot bt-stop"/g) || []).length === 2);
  t("B5 terminal diamond present", svg.includes('class="bt-term bt-stop"'));
  t("B6 anchor diamond on guide", svg.includes(`x="${originX - 5.5}"`) && svg.includes(`transform="rotate(45 ${originX} ${34 / 2})"`));
  t("B7 anchor title escaped", svg.includes("A&lt;1&gt; (#a) — boarding"));
  t("B8 bus markers: live filled, est hollow",
    svg.includes('class="bt-bus bt-bus-live"') && svg.includes('class="bt-bus"') &&
    svg.includes('fill="none" stroke="#c62828"'));
  t("B9 bus ETA labels above markers",
    svg.includes(`translate(${n1(originX - 60)},17)`) && svg.includes(">3<") && svg.includes(">9<"));
  t("B10 zero-min bus reads Due", (() => {
    const s = ctx.trackRowSvg(g, originX, W, "#c62828", [{ x: 0, min: 0, live: true }]);
    return s.includes(">Due<") && s.includes(`translate(${n1(originX)},17)`);
  })());
  t("B11 svg sized W × 34", svg.includes(`width="${W}" height="34"`));
  // every emitted coordinate inside the viewport
  const xs = [...svg.matchAll(/(?:cx|x1|x2)="([\d.]+)/g)].map(m => +m[1]);
  t("B12 all x within [0, W]", xs.every(x => x >= 0 && x <= W), `min=${Math.min(...xs)} max=${Math.max(...xs)} W=${W}`);
  // Piece 11 a11y: markers are the selectable reveal targets.
  t("B13 dots tabbable with data-stop + name/ID label",
    svg.includes('data-stop="b"') && svg.includes('data-stop="c"') &&
    svg.includes('tabindex="0"') && svg.includes('aria-label="Stop: B (b)"'));
  t("B14 track svg exposed to AT; bus group hidden",
    !svg.slice(0, svg.indexOf(">")).includes("aria-hidden") &&
    (svg.match(/aria-hidden="true"/g) || []).length === 2);   // one per bus marker
  t("B15 terminal + anchor carry data-stop and are tabbable",
    svg.includes('data-stop="term"') && svg.includes('data-stop="a"') &&
    svg.includes('class="bt-term bt-stop"') && svg.includes('class="bt-anchor bt-stop"'));
  t("B16 terminal aria-label has name + ID",
    svg.includes('aria-label="Terminal: Terminal X (#term)"'));
}

// terminal coincides with the anchor (single-stop pattern) -> markers offset
{
  const pat = { stops: [S("t","The End",40,-77)], shape: [] };
  const row = { kind: "track", route: "S1", dest: "The End", mins: [2],
                pattern: pat, anchorIdx: 0, anchorPatStop: pat.stops[0] };
  const g = ctx.boardGeometry([row]).rows[0];
  const originX = 16 + g.negPx;
  const svg = ctx.trackRowSvg(g, originX, Math.ceil(originX + g.posPx + 30), "#1565c0", []);
  const termX = originX + 12, anchorX = originX;   // |termX-0|<10 -> +12 nudge
  t("C1 single stop: terminal nudged right of anchor",
    svg.includes(`rotate(45 ${termX} 17)`) && svg.includes(`rotate(45 ${anchorX} 17)`));
}

// ── boardHtml: shared origin + width across rows, compact rows ────────
{
  const d15 = 15000 * dlon(1), d1 = 1000 * dlon(1);
  const longPat = { stops: [S("a","A",40,-77), S("b","B",40,-77+d15), S("tb","TerB",40,-77+2*d15)], shape: [] };
  const shortPat = { stops: [S("c","C",40,-77), S("c2","C2",40,-77+d1), S("tc","TerC",40,-77+2*d1)], shape: [] };
  const rows = [
    { kind: "track", route: "M1", dest: "TerB", mins: [4, 12], pattern: longPat, anchorIdx: 0, anchorPatStop: longPat.stops[0] },
    { kind: "track", route: "M2", dest: "TerC", mins: [7], pattern: shortPat, anchorIdx: 0, anchorPatStop: shortPat.stops[0] },
    { kind: "compact", route: "M3", dest: "Somewhere", dir: "North", mins: [1], note: "route details unavailable" },
  ];
  const html = ctx.boardHtml(ctx.boardGeometry(rows), rows);
  const guides = [...html.matchAll(/class="bt-guide" x1="([\d.]+)"/g)].map(m => m[1]);
  const widths = [...html.matchAll(/board-tracksvg" width="(\d+)"/g)].map(m => +m[1]);
  t("D1 one guide x, shared by both tracks", new Set(guides).size === 1 && guides.length === 2, guides.join(","));
  t("D2 identical svg width across rows", new Set(widths).size === 1, widths.join(","));
  t("D3 header: code + toward + first ETA",
    html.includes('toward TerB') && html.includes('class="board-eta-first">4 min') && html.includes("12 min"));
  t("D4 compact row: header only, with note",
    html.includes("route details unavailable") && (html.match(/board-tracksvg/g) || []).length === 2);
  t("D5 row min-height + board width fixed", html.includes(`min-height:${64}px`) && /class="board" style="width:\d+px"/.test(html));
  t("D6 'View all stops' button + hidden list, boarding/terminal marked",
    html.includes('class="bt-allstops" aria-expanded="false">View all stops</button>') &&
    html.includes('<ol class="bt-stoplist" hidden>') &&
    html.includes('<b class="bt-mark">your stop</b>') && html.includes('<b class="bt-mark">terminal</b>'));
  {
    const k1 = ctx.__rowKey({ route: "M1", dest: "TerB" });   // dirNum absent, like these rows
    ctx.__expandedStops.add(k1);
    const html2 = ctx.boardHtml(ctx.boardGeometry(rows), rows);
    ctx.__expandedStops.delete(k1);
    t("D7 expansion remembered across re-renders",
      (html.match(/<ol class="bt-stoplist" hidden>/g) || []).length === 2 &&
      (html2.match(/<ol class="bt-stoplist" hidden>/g) || []).length === 1 &&
      html2.includes('aria-expanded="true"') && html2.includes('<ol class="bt-stoplist">'));
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
