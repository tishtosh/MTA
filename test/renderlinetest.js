// Node test for the piece 7b pipeline: anchorStop (no directory hard-gate)
// + heroCardHtml (stop name + Next bus). Extracts the real code from
// the page's <script> (from mta26.html, via lib/extract) into a VM sandbox;
// state vars are sandbox globals.
const fs = require("fs");
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

function extractConst(name) {
  const start = src.indexOf("const " + name + " =");
  if (start < 0) throw new Error("not found: " + name);
  const i = src.indexOf("[", start);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "[") depth++;
    else if (src[j] === "]") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, j + 2);   // include the `;`
}

const sandbox = { console, JSON, Date, Number, String, Math, Object, Array, Set, Map };
sandbox.stops = [];
sandbox.pickedStop = null;
sandbox.pickedStopObj = null;
sandbox.allStopsCache = null;
sandbox.stopListFromURL = null;
sandbox.forceNearby = false;
sandbox.DEFAULT_STOP_ID = "1002135";
sandbox.mode = "bus";
sandbox.likes = [];
vm.createContext(sandbox);
vm.runInContext(
  ['const ROUTE_COLORS = ["#c62828","#1565c0","#2e7d32","#ef6c00","#6a1b9a","#00838f","#ad1457","#5d4037","#455a64","#827717","#37474f","#9e9d24"];', "const stopScheduleCache = {};", "let shortcuts = {};",
   'const SHORTCUT_SLOTS = ["home", "work", "airport", "fav"];',
   extractFn("shortcutLabel"), extractFn("isLike"),
   "function slotHas(kind, slot, id){ const v = shortcuts[slot]; const list = !v ? [] : (Array.isArray(v) ? v : (v.id ? [v] : [])); return list.some(e => String(e.id) === String(id)); }",
   extractFn("shortcutButtonsHtml"),
   "function cityCfg(){ return { defaultStopId: '1002135' }; }",
   "function cityTheme(){ return { routeColor: (id) => { let h=0; for (const c of String(id||\'\')) h=(h*31+c.charCodeAt(0))>>>0; return ROUTE_COLORS[h % ROUTE_COLORS.length]; }, routeTextColor: () => \'#fff\', badgeClass: () => \'\', metroColor: () => \'#c62828\', metroName: (l) => l, isCommuter: () => false }; }",
   extractFn("busBandClass"), extractFn("routeColor"), extractFn("esc"), extractFn("stopName"),
   "var metroRoutesCache = null;",
   extractFn("isCommuterRoute"),
   extractFn("etaAtOf"), extractFn("etaMinutes"), extractFn("refreshEtaMinutes"),
   extractFn("fmtEta"), extractFn("normHeads"), extractFn("scheduleDayKey"),
   extractFn("nextScheduledFor"), extractFn("fmtScheduleTime"),
   extractFn("shownStops"), extractFn("anchorStop"),
   extractFn("modeMark"), extractFn("modeIconHtml"), extractFn("heroVerbHtml"), extractFn("heroModeIcon"), extractFn("statusChipHtml"), extractFn("statusReplacesDue"), extractFn("etaToken"), extractFn("predictionRank"), extractFn("busBandAttr"), extractFn("busBadgeClass"),
   extractFn("busTextColor"), extractFn("badgeTextColor"), extractFn("cityCapability"), extractFn("isImminentMin"), extractFn("heroCardHtml")].join("\n")
   + "\nglobalThis.__stopScheduleCache = stopScheduleCache;"
   + "\nglobalThis.__shortcuts = shortcuts;",
  sandbox);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name); }
}
const run = (code) => vm.runInContext(code, sandbox);

// ---- anchorStop: the directory is never a hard gate (plan §2) ----
sandbox.stops = [{ StopID: "1002130", Name: null, Arrivals: [] }];
sandbox.pickedStop = "1002130";
sandbox.allStopsCache = null;   // directory FAILED to load
check("deep link, dead directory → still resolves the list stop",
  run("anchorStop()") && run("anchorStop()").StopID === "1002130");

sandbox.allStopsCache = [{ StopID: "1002130", Name: "Park Rd & 19th St NW", Lat: 1, Lon: 2, Routes: [] }];
check("directory loaded → canonical entry wins",
  run("anchorStop()").Name === "Park Rd & 19th St NW");

sandbox.pickedStop = null;                       // nearby mode
sandbox.stops = [{ StopID: "A1", Name: "a", Arrivals: [] }, { StopID: "A2", Name: "b", Arrivals: [] }];
check("no pick → first nearby stop", run("anchorStop()").StopID === "A1");

sandbox.stops = [{ StopID: "A1", Name: "a", Arrivals: [] },
                 { StopID: "1002135", Name: "default", Arrivals: [] }];
check("no pick → default stop 1002135 preferred", run("anchorStop()").StopID === "1002135");

sandbox.stops = [{ StopID: "A1", Name: "a", Arrivals: [] }, { StopID: "A2", Name: "b", Arrivals: [] }];

sandbox.allStopsCache = [{ StopID: "A2", Name: "canonical b" }];   // A1 not in the directory
check("no pick, partial directory → falls back to the list stop",
  run("anchorStop()").StopID === "A1");

sandbox.stops = [];                              // nothing at all
sandbox.pickedStop = null;
check("no stops anywhere → null (the view says so)", run("anchorStop()") === null);

// ---- heroCardHtml ----
sandbox.allStopsCache = null;
const h1 = sandbox.heroCardHtml(
  { StopID: "1002130", Name: "Park Rd & 19th St NW", Arrivals: [], Error: null },
  [{ min: 14, route: "D72", dir: "North to Van Ness", heads: "North to Van Ness" }]);
check("header: name", h1.includes("Park Rd &amp; 19th St NW"));
check("header: stop reference not shown", !/#1002130/.test(h1));
check("header: 'Selected boarding stop' removed", !h1.includes("Selected boarding stop"));
check("header: home/work/like shortcuts",
  h1.includes('data-shortcut="home"') && h1.includes('data-shortcut="work"') && h1.includes('data-shortcut="fav"'));
sandbox.__shortcuts.home = { id: "1002130", name: "Park Rd & 19th St NW" };
const hActive = sandbox.heroCardHtml(
  { StopID: "1002130", Name: "Park Rd & 19th St NW", Arrivals: [], Error: null }, []);
delete sandbox.__shortcuts.home;
check("header: saved shortcut shows checked",
  /data-shortcut="home"[^>]*aria-pressed="true"/.test(hActive));
sandbox.likes = [{ kind: "bus", id: "1002130", name: "Park Rd & 19th St NW" }];
const hFav = sandbox.heroCardHtml(
  { StopID: "1002130", Name: "Park Rd & 19th St NW", Arrivals: [], Error: null }, []);
sandbox.likes = [];
check("header: like star shows selected",
  /data-shortcut="fav"[^>]*aria-pressed="true"/.test(hFav));
check("header: first departure lives on the board, not the hero", !h1.includes("bt-next-eta") && !h1.includes("data-hero-route"));

const h2 = sandbox.heroCardHtml(
  { StopID: "1002130", Name: null, Arrivals: [], Error: null },
  [{ min: 0, route: "C87", dir: "TENLEYTOWN", heads: "TENLEYTOWN" }]);
check("header: no name → #id only, no doubled id", (h2.match(/#1002130/g) || []).length === 1);
check("header: no duplicate departure in the hero", !h2.includes("TENLEYTOWN"));

const h3 = sandbox.heroCardHtml({ StopID: "X", Name: "x", Error: { rateLimited: false }, Arrivals: [] }, []);
check("header: failed predictions → 'arrivals unavailable'", h3.includes("arrivals unavailable"));

const h4 = sandbox.heroCardHtml({ StopID: "X", Name: "x", Error: null, Arrivals: [] }, []);
check("header: no predictions → 'no arrival or departure'", h4.includes("no arrival or departure"));

// Scheduled fallback also lives on the board, not in the hero.
sandbox.__stopScheduleCache["1002130"] = {
  day: sandbox.scheduleDayKey(), ok: true, at: Date.now(),
  arrivals: [{ at: Date.now() + 3600000, route: "D60", dirNum: "1",
               heads: "North to Silver Spring", dirText: "NORTH" }],
};
const hSched = sandbox.heroCardHtml(
  { StopID: "1002130", Name: "x", Error: null, Arrivals: [] }, []);
delete sandbox.__stopScheduleCache["1002130"];
check("header: scheduled fallback is not repeated in the hero",
  !hSched.includes("not seen") && !hSched.includes("D60"));

// ---- against the locked live capture (1002130) ----
const raw = JSON.parse(fs.readFileSync(require("path").join(__dirname, "fixtures", "pred_1002130.json"), "utf8"));
const preds = [];
for (const p of raw.Predictions) {
  const min = Number(p.Minutes);
  if (!Number.isFinite(min) || min < 0) continue;
  const route = String(p.RouteID || "").toUpperCase();
  if (!route) continue;
  preds.push({ min, route, dir: String(p.DirectionText || ""),
               heads: String(p.TripHeadsign || "") || String(p.DirectionText || "") });
}
preds.sort((a, b) => a.min - b.min || a.route.localeCompare(b.route));
check("live pred130: at least one prediction", preds.length > 0);
if (preds.length) {
  const h5 = sandbox.heroCardHtml(
    { StopID: "1002130", Name: raw.StopName || null, Error: null, Arrivals: preds }, preds);
  check("live header: departure rows are not duplicated in the hero",
    !h5.includes("bt-next-eta") && !h5.includes("data-hero-route"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
