// Full-page vm harness: runs the ENTIRE page script (read live from
// mta26.html via lib/extract) with a DOM stub and a network boundary
// (fetch) backed by sanitized fixtures in test/fixtures/, loads
// ?busstop=<id>, and asserts the board the visitor actually gets.
// Usage: node fullpagetest.js [1002130 | 1002135 | 1002135,1002130] [across]
//   A comma list is a multiple-ID deep link (plan §2): the arrivals table
//   keeps every ID and the FIRST ID is the default board anchor.
//   "across" swaps in route_C87_across.json (live C87 + the opposite
//   corner added to Direction1) so the "Across the street" section
//   renders — the positive path the locked live data cannot show (in
//   live route details, 1002135 sits on no pattern, so the resolver
//   correctly declines it and the section is absent in both live runs).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pageScript } = require("./lib/extract");

const STOP = process.argv[2] || "1002130";
const ANCHOR = String(STOP).split(",")[0];   // multi-ID link: first ID anchors the board
const MULTI = String(STOP).includes(",");
const ACROSS = process.argv[3] === "across";
const script = pageScript();
const FX = (n) => path.join(__dirname, "fixtures", n);

// ---- network boundary: sanitized fixtures (raw API JSON, thinned) ----
const jStopsAll = JSON.parse(fs.readFileSync(FX("jstops_all.json"), "utf8"));
const jStopsNear = JSON.parse(fs.readFileSync(FX("jstops_near.json"), "utf8"));
const jPos = JSON.parse(fs.readFileSync(FX("pos.json"), "utf8"));
const jRoute = {
  C87: JSON.parse(fs.readFileSync(FX(ACROSS ? "route_C87_across.json" : "route_C87.json"), "utf8")),
  D72: JSON.parse(fs.readFileSync(FX("route_D72.json"), "utf8"))
};
const jPred = {
  "1002130": JSON.parse(fs.readFileSync(FX("pred_1002130.json"), "utf8")),
  "1002135": JSON.parse(fs.readFileSync(FX("pred_1002135.json"), "utf8"))
};
let fetchCount = 0;
const fetch = async (url) => {
  fetchCount++;
  if (process.env.DEBUG) console.log("FETCH", url);
  const u = new URL(url);
  const body =
    u.pathname.endsWith("/jStops")
      ? (u.searchParams.has("Lat") ? jStopsNear : jStopsAll)
      : u.pathname.endsWith("/jPredictions")
        ? jPred[u.searchParams.get("StopID")]
        : u.pathname.endsWith("/jRouteDetails")
          ? jRoute[u.searchParams.get("RouteID")]
          : u.pathname.endsWith("/jBusPositions")
            ? jPos
            : undefined;
  if (!body) throw new Error("unstubbed URL: " + url);
  return { ok: true, status: 200, json: async () => body };
};

// ---- DOM stub ----
const els = {};
function makeEl(id) {
  return {
    id, innerHTML: "", textContent: "", value: "", hidden: false,
    children: [], style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    _l: {},
    addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute() { return null; },
    querySelector: () => null, querySelectorAll: () => [],
    clientWidth: 0, clientHeight: 0, scrollWidth: 0,
    focus() {}, blur() {}, click() {}, scrollTo() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    offsetWidth: 100, offsetHeight: 50, scrollTop: 0, scrollLeft: 0
  };
}
const document = {
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  addEventListener() {},
  createElement: (tag) => makeEl(tag),
  querySelector: () => null,
  querySelectorAll: () => []
};

const sandbox = {
  console, JSON, Date, Number, String, Boolean, Math, Object, Array, Set, Map,
  Promise, Symbol, RegExp, Error, TypeError, RangeError, parseInt, parseFloat, isNaN,
  URL, URLSearchParams, AbortController,
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch,
  document,
  location: { search: "?busstop=" + STOP, href: "http://localhost/?busstop=" + STOP, reload() {} },
  navigator: { geolocation: null },
  matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }),
  innerWidth: 1280, innerHeight: 800,
  devicePixelRatio: 2
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: "mta26-script.js" });

// ---- wait for the async pipeline, then assert ----
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name); }
}
const header = () => els.boardHeader.innerHTML;
const board = () => els.linesScroll.innerHTML;

(async () => {
  // Wait for the settled paint: the board is painted and then stops
  // changing for 400 ms; in across mode the across section must be up
  // (confirmAcross' counterpart prediction fetch re-paints the board).
  const t0 = Date.now();
  let last = "", quiet = 0;
  for (;;) {
    const cur = board();
    if (cur === last) quiet += 100; else { last = cur; quiet = 0; }
    const done = cur !== "" && (ACROSS ? cur.includes("Across the street") : true) && quiet >= 400;
    if (done || Date.now() - t0 > 15000) break;   // stub pipeline settles ~2.5 s; 15 s is a load margin
    await wait(100);
  }
  await wait(300);

  const h = header(), b = board();

  check("board header painted", h !== "");
  check("header: stop ID shown", h.includes("#" + ANCHOR));
  check("header: canonical directory name", h.includes("Park Rd NW+19 St NW"));
  check("header: Next bus line", h.includes("Next bus:"));

  check("board painted into linesScroll", b !== "");
  check("board: every row on one shared width", new Set((b.match(/width="\d+\.\d+"/g) || [])).size <= 2);

  const hasTrack = b.includes("board-tracksvg");
  const guides = (b.match(/bt-guide/g) || []).length;
  check("board: a boarding guide per track row", hasTrack ? guides >= 1 : true);
  check("board: anchor diamond present", hasTrack ? b.includes("bt-anchor") : true);

  if (ACROSS) {
    // the across section: counterpart label, both curb labels, two track rows
    check("across: section rendered", b.includes("Across the street"));
    check("across: counterpart named in label", /Across the street[\s\S]{0,80}#1002135/.test(b));
    check("across: primary labeled 'Your side'", b.includes("Your side"));
    check("across: both C87 patterns as track rows", (b.match(/bt-line/g) || []).length === 2);
    check("across: C87 dir0 still the main service row", /C87[\s\S]{0,120}TENLEYTOWN/.test(b));
    check("across: prompt refresh re-fetches in-scope stops (7 fetches)", fetchCount === 7);
  } else if (ANCHOR === "1002130") {
    check("130: next bus D72 @14 min", /Next bus:.*D72[\s\S]*?14 min/.test(h));
    check("130: D72 row is compact (route details unavailable)", b.includes("route details unavailable"));
    check("130: D72 compact keeps its live headsign", b.includes("North to Van Ness"));
    check("130: C87 service row toward TENLEYTOWN", /C87[\s\S]{0,120}TENLEYTOWN/.test(b));
    check("130: compact row before service row", b.indexOf("route details unavailable") < b.indexOf("TENLEYTOWN"));
    check("130: no track on the compact row", (b.match(/bt-line/g) || []).length === 1); // only C87 has a pattern
  } else {
    check("135: next bus D72 @2 min", /Next bus:.*D72[\s\S]*?2 min/.test(h));
    check("135: D72 row compact", b.includes("route details unavailable"));
    check("135: NO service rows (C87 pattern lacks this corner)", !b.includes("TENLEYTOWN") && (b.match(/bt-line/g) || []).length === 0);
    check("135: three ETAs on the compact row (2 · 17 · 39)", /2 min[\s\S]{0,80}17 min[\s\S]{0,80}39 min/.test(h) || /17 min/.test(b) && /39 min/.test(b));
  }

  if (MULTI) {
    const tab = els.tINSERTHERE.innerHTML;
    for (const id of STOP.split(",")) {
      check(`multi: table keeps #${id}`, tab.includes("#" + id));
    }
    const hIds = h.match(/#\d{7}/g) || [];
    check("multi: board anchors on the FIRST id", hIds.length >= 1 && hIds.every(x => x.slice(1) === ANCHOR));
    check("multi: status counts the URL list", (els.statusmessage?.textContent || "").startsWith(STOP.split(",").length + " stops"));
  }

  check("no across section with live fixtures", !ACROSS ? !b.includes("Across the street") : true);
  check("ticker retired (no #tickerHost in DOM)", els.tickerHost === undefined);
  check("arrival table rendered", els.tINSERTHERE.innerHTML.includes("table") || els.tINSERTHERE.innerHTML !== "");

  if (process.env.DEBUG) { console.log("HEADER>>> " + h); console.log("BOARD>>> " + b.slice(0, 3000)); }

  console.log(`\nfetches: ${fetchCount}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
