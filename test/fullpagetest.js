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
const jRoute = {
  C87: JSON.parse(fs.readFileSync(FX(ACROSS ? "route_C87_across.json" : "route_C87.json"), "utf8")),
  D72: JSON.parse(fs.readFileSync(FX("route_D72.json"), "utf8"))
};
const jPred = {
  "1002130": JSON.parse(fs.readFileSync(FX("pred_1002130.json"), "utf8")),
  "1002135": JSON.parse(fs.readFileSync(FX("pred_1002135.json"), "utf8"))
};
const jStopSchedule = JSON.parse(fs.readFileSync(FX("stop_schedule.json"), "utf8"));
let fetchCount = 0;
const predFetches = {};   // StopID → prediction request count
const fetch = async (url) => {
  fetchCount++;
  if (process.env.DEBUG) console.log("FETCH", url);
  const u = new URL(url);
  if (u.pathname.endsWith("/jPredictions")) {
    const id = u.searchParams.get("StopID");
    predFetches[id] = (predFetches[id] || 0) + 1;
  }
  const body =
    u.pathname.endsWith("/jStops")
      ? (u.searchParams.has("Lat") ? jStopsNear : jStopsAll)
      : u.pathname.endsWith("/jPredictions")
        ? jPred[u.searchParams.get("StopID")]
        : u.pathname.endsWith("/jRouteDetails")
          ? jRoute[u.searchParams.get("RouteID")]
          : u.pathname.endsWith("/jStopSchedule")
            ? jStopSchedule
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
    querySelector(sel) {
      if (sel === ".bt-guide") return this._guide;
      return null;
    },
    querySelectorAll: () => [],
    clientWidth: 0, clientHeight: 0, scrollWidth: 0,
    focus() {}, blur() {}, click() {}, scrollTo() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    offsetWidth: 100, offsetHeight: 50, scrollTop: 0, scrollLeft: 0
  };
}
const document = {
  cookie: "",
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  addEventListener() {},
  createElement: (tag) => makeEl(tag),
  querySelector(sel) {
    if (sel === "#linesScroll") return els.linesScroll;
    return null;
  },
  querySelectorAll: () => []
};

const sandbox = {
  console, JSON, Date, Number, String, Boolean, Math, Object, Array, Set, Map,
  Promise, Symbol, RegExp, Error, TypeError, RangeError, parseInt, parseFloat, isNaN,
  URL, URLSearchParams, AbortController,
  setTimeout, clearTimeout, setInterval, clearInterval,
  btoa, atob, TextDecoder, Uint8Array,
  crypto, TextEncoder,
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
  // Unlock the access gate (AES-GCM/PBKDF2) before waiting for the board.
  await sandbox.unlockAccess("bus");
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
  check("header: canonical directory name", h.includes("Park Rd NW and 19 St NW"));
  check("header: Next bus line", h.includes("Next bus"));
  check("header: 'Selected boarding stop' removed", !h.includes("Selected boarding stop"));
  check("header: home/work/favorite shortcut icons",
    h.includes('data-shortcut="home"') && h.includes('data-shortcut="work"') && h.includes('data-shortcut="fav"'));
  check("header: no stop-count line", !/^\d+ stops?/.test(els.statusmessage.textContent));

  check("board painted into linesScroll", b !== "");
  check("board: no SVG track graphic", !b.includes("board-tracksvg"));
  check("board: route badge, destination, then ETAs",
    /row-badge[^]*?board-dest[^]*?board-etas/.test(b));
  check("board: anchor stop list is selectable",
    !b.includes("bt-stop-item") || /class="bt-stop-item"[^>]*data-stop="/.test(b));

  if (ACROSS) {
    // the across section: counterpart label, both curb labels, both routes
    check("across: section rendered", b.includes("Across the street"));
    // substring check (not a regex): node's engine rejects some quantified
    // character-class patterns; the sub must name the counterpart within ~60 chars
    const acrossIdx = b.indexOf("Across the street");
    check("across: counterpart named in label", acrossIdx > -1 && b.slice(acrossIdx, acrossIdx + 80).includes("#1002135"));
    check("across: heading bar has no ETA summary", !b.includes("curb-etas"));
    check("across: no redundant selected-stop section heading", !b.includes("At the selected stop"));
    check("across: both C87 patterns listed", (b.match(/>C87<\/span>/g) || []).length === 2);
    check("across: C87 dir0 still the main service row", /C87[\s\S]{0,120}TENLEYTOWN/.test(b));
  } else if (ANCHOR === "1002130") {
    check("130: next bus D72 @14 min", h.includes("Next bus") && h.includes("D72") && h.includes("14 min"));
    check("130: D72 compact row hides the route-details note", !b.includes("route details unavailable"));
    check("130: D72 compact keeps its live headsign", b.includes("North to Van Ness"));
    check("130: C87 service row toward TENLEYTOWN", /C87[\s\S]{0,120}TENLEYTOWN/.test(b));
    check("130: compact row before service row", b.indexOf("North to Van Ness") < b.indexOf("TENLEYTOWN"));
    check("130: no track graphic on the compact row", !b.includes("board-tracksvg"));
    check("130: no live prediction → next scheduled, not seen",
      b.includes("not seen") && /\d{1,2}:\d{2}\s?[AP]M/.test(b));
  } else {
    check("135: next bus D72 @2 min", h.includes("Next bus") && h.includes("D72") && h.includes("2 min"));
    check("135: D72 row compact, no route-details note",
      b.includes("D72") && !b.includes("route details unavailable"));
    // The nearby section (within 500 ft) carries the C87 stop on the other
    // side of Park Rd, so "no service rows" now means: none in the PRIMARY
    // section — its board ends where that stop's own nearby bar begins.
    const nearIdx = b.indexOf('data-nearby="1"');
    const mainOnly = nearIdx > -1 ? b.slice(0, nearIdx) : b;
    check("135: no service rows in the primary section", !mainOnly.includes("TENLEYTOWN"));
    check("135: nearby stop gets its own heading bar",
      nearIdx > -1 && b.slice(nearIdx, nearIdx + 400).includes("#1002130"));
    check("135: three ETAs on the compact row (2 · 17 · 39)", h.includes("2 min") && b.includes("then 17 min, 39 min"));
  }

  if (MULTI) {
    const hIds = h.match(/#\d{7}/g) || [];
    check("multi: board anchors on the FIRST id", hIds.length >= 1 && hIds.every(x => x.slice(1) === ANCHOR));
    check("multi: stop count line removed", !/\d+ stops?/.test(els.statusmessage?.textContent || ""));
  }

  check("no across section with live fixtures", !ACROSS ? !b.includes("Across the street") : true);
  check("ticker retired (no #tickerHost in DOM)", els.tickerHost === undefined);

  // Clock block: current time, last updated time, and the refresh countdown.
  check("clock: current time + updated + countdown",
    !!els.clock.textContent &&
    /updated \d{1,2}:\d{2}:\d{2}/.test(els.clockMeta.textContent) &&
    /refresh in \d+s/.test(els.clockMeta.textContent));
  check("nearby: distance or across-street label",
    !b.includes('data-nearby="1"') || /\d+ ft away|Across the street/.test(b));

  // The entry field re-filters its dropdown on every keystroke.
  check("bus dropdown prepopulated with all stops",
    (els.busSelect.innerHTML.match(/<option/g) || []).length > 50 &&
    /Park/i.test(els.busSelect.innerHTML));

  // The header shortcut checkboxes persist to a cookie.
  {
    const btn = { dataset: { shortcut: "work" }, classList: { toggle() {} },
                  setAttribute() {}, title: "" };
    const ev = { target: { closest: sel => sel === ".board-shortcut" ? btn : null } };
    (els.boardHeader._l.click || []).forEach(f => f(ev));
    check("shortcuts: header icon saves work stop to cookie",
      /mta_shortcuts_bus=/.test(document.cookie) &&
      decodeURIComponent(document.cookie.split("=")[1]).includes('"work"'));
  }

  if (ACROSS) {
    await wait(800);   // let the counterpart's prompt refresh settle
    check("across: prompt refresh re-fetches both in-scope stops",
      (predFetches["1002130"] || 0) >= 2 && (predFetches["1002135"] || 0) >= 2);
  }

  if (process.env.DEBUG) { console.log("HEADER>>> " + h); console.log("BOARD>>> " + b.slice(0, 3000)); }

  console.log(`\nfetches: ${fetchCount}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
