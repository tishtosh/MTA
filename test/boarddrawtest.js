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
  "LAT_FT_PER_DEG", "ROUTE_COLORS", "stopScheduleCache",
  "expandedStops", "rowKey"];
let src = [names.map(constBlock).join("\n"),
  extractFn("distance"), extractFn("localXY"), extractFn("projArcOnShape"),
  extractFn("trackArcs"), extractFn("rowLayout"), extractFn("boardScale"),
  extractFn("boardGeometry"), extractFn("esc"), extractFn("routeColor"),
  extractFn("fmtEta"), extractFn("boardEtasHtml"), extractFn("normHeads"),
  extractFn("scheduleDayKey"), extractFn("nextScheduledFor"), extractFn("fmtScheduleTime"),
  "let selectionVersion = 0, acrossStop = null, boardUserScrolled = false, boardAuto = {};",
  extractFn("noteSelectionChange"),
  extractFn("boardRowHead"), extractFn("boardHtml")].join("\n");
// const/let bindings stay in the script's lexical scope, not on ctx — expose
// the two piece-11 ones so the tests can poke them.
src += "\nglobalThis.__expandedStops = expandedStops;\nglobalThis.__rowKey = rowKey;\nglobalThis.__stopScheduleCache = stopScheduleCache;";
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
t("A3 empty list", ctx.boardEtasHtml([]).includes("no arrival or departure"));
t("A3b no prediction + schedule → time + not predicted", (() => {
  const h = ctx.boardEtasHtml([], { at: new Date(2099, 0, 1, 9, 15).getTime() });
  return h.includes("not predicted") && /\d{1,2}:\d{2}/.test(h);
})());
{
  const h = ctx.boardEtasHtml([3, 14, 40]);
  t("A4 first emphasized, rest ascending",
    h.includes('class="board-eta-first">3 min') && h.includes("then 14 min, 40 min"), h.slice(0, 90));
}

// ── boardHtml: header layout + compact rows + stop list ──────────────
{
  const d15 = 15000 * dlon(1), d1 = 1000 * dlon(1);
  const longPat = { stops: [S("a","A",40,-77), S("b","B",40,-77+d15), S("tb","TerB",40,-77+2*d15)], shape: [] };
  const shortPat = { stops: [S("c","C",40,-77), S("c2","C2",40,-77+d1), S("tc","TerC",40,-77+2*d1)], shape: [] };
  const rows = [
    { kind: "track", route: "M1", dest: "TerB", mins: [4, 12], pattern: longPat, anchorIdx: 0, anchorPatStop: longPat.stops[0] },
    { kind: "track", route: "M2", dest: "TerC", mins: [7], pattern: shortPat, anchorIdx: 0, anchorPatStop: shortPat.stops[0] },
    { kind: "compact", route: "M3", dest: "Somewhere", dir: "North", mins: [1], note: "route details unavailable" },
    { kind: "service", route: "M4", dirNum: "0", heads: "Sched End", dest: "Sched End", mins: [],
      pattern: shortPat, anchorIdx: 0, anchorPatStop: shortPat.stops[0] },
  ];
  ctx.__stopScheduleCache["c"] = {
    day: ctx.scheduleDayKey(), ok: true, at: Date.now(),
    arrivals: [{ at: Date.now() + 3600000, route: "M4", dirNum: "0", heads: "Sched End" }],
  };
  const html = ctx.boardHtml(ctx.boardGeometry(rows), rows);
  delete ctx.__stopScheduleCache["c"];
  t("D1 no SVG track graphic", !html.includes("board-tracksvg") && !html.includes("<svg"));
  t("D2 badge, destination below it, then ETAs",
    /row-badge[^]*?board-dest[^]*?board-etas/.test(html) &&
    html.includes('class="board-eta-first">4 min'));
  t("D3 destination is the final headsign", html.includes("TerB") && html.includes("TerC"));
  t("D3b service row with no prediction shows schedule + not predicted",
    html.includes("not predicted") && /\d{1,2}:\d{2}/.test(html) &&
    html.includes('class="board-row is-scheduled"'));
  t("D4 compact row hides its route-details note", !html.includes("route details unavailable"));
  t("D5 stop lists are unnumbered and each stop is selectable",
    html.includes('<ul class="bt-stoplist" hidden>') && !html.includes("<ol") &&
    html.includes('class="bt-stop-item" role="button" tabindex="0" data-stop="a"') &&
    !/\d+\.\s/.test(html));
  t("D6 'View all stops' button with chevron + boarding/terminal marked",
    html.includes('class="bt-allstops" aria-expanded="false">View all stops') &&
    html.includes('class="fa-solid fa-chevron-down bt-chevron"') &&
    html.includes('<b class="bt-mark">your stop</b>') && html.includes('<b class="bt-mark">terminal</b>'));
  {
    const k1 = ctx.__rowKey({ route: "M1", dest: "TerB" });   // dirNum absent, like these rows
    ctx.__expandedStops.add(k1);
    const html2 = ctx.boardHtml(ctx.boardGeometry(rows), rows);
    ctx.__expandedStops.delete(k1);
    t("D7 expansion remembered across re-renders",
      (html.match(/<ul class="bt-stoplist" hidden>/g) || []).length === 3 &&
      (html2.match(/<ul class="bt-stoplist" hidden>/g) || []).length === 2 &&
      html2.includes('aria-expanded="true"') && html2.includes('<ul class="bt-stoplist">'));
  }
  ctx.__expandedStops.add("stale-key");
  ctx.noteSelectionChange();
  t("D8 changing stops collapses every stop list", ctx.__expandedStops.size === 0);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
