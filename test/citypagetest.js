// Full-page smoke tests for the Boston and London adapters. Each city runs
// in a fresh VM with a stubbed network, unlocks the key gate, and renders a
// deep-linked stop, so provider wiring is exercised end to end.
"use strict";
const vm = require("vm");
const { pageScript } = require("./lib/extract");
const { feedBytes } = require("./lib/gtfsrt");

const script = pageScript();
const wait = (ms) => new Promise(r => setTimeout(r, ms));

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
    querySelector() { return null; },
    querySelectorAll: () => [],
    clientWidth: 0, clientHeight: 0, scrollWidth: 0,
    focus() {}, blur() {}, click() {}, scrollTo() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    offsetWidth: 100, offsetHeight: 50, scrollTop: 0, scrollLeft: 0,
  };
}

function harness(city, stop, fetchImpl, search) {
  const els = {};
  const document = {
    cookie: "",
    getElementById: id => (els[id] = els[id] || makeEl(id)),
    addEventListener() {},
    createElement: tag => makeEl(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const sandbox = {
    console, JSON, Date, Number, String, Boolean, Math, Object, Array, Set, Map,
    Promise, Symbol, RegExp, Error, TypeError, RangeError, parseInt, parseFloat, isNaN,
    URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, setInterval, clearInterval,
    btoa, atob, TextDecoder, Uint8Array, crypto, TextEncoder,
    fetch: fetchImpl,
    document,
    location: { search: search || `?city=${city}&busstop=${stop}`, href: "http://localhost/", reload() {} },
    navigator: { geolocation: null },
    matchMedia: q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 2,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: `${city}-page.js` });
  for (const fn of ["renderLines", "refreshPredictions", "renderBoardNow"]) {
    const orig = sandbox[fn];
    if (typeof orig !== "function") continue;
    sandbox[fn] = function (...args) {
      try { return orig.apply(this, args); }
      catch (e) { console.error("ERR " + fn + ":", e && e.stack || e); throw e; }
    };
  }
  return { sandbox, els };
}

function result() {
  return { pass: 0, fail: 0 };
}
function check(r, name, cond) {
  if (cond) { r.pass++; console.log("PASS " + name); }
  else { r.fail++; console.log("FAIL " + name); }
}

async function settle(board) {
  const t0 = Date.now();
  let last = "", quiet = 0;
  for (;;) {
    const cur = board();
    if (cur === last) quiet += 100; else { last = cur; quiet = 0; }
    if (cur && quiet >= 400) break;
    if (Date.now() - t0 > 15000) break;
    await wait(100);
  }
  return board();
}

(async () => {
  // ── Boston ────────────────────────────────────────────────────────
  const bostonCalls = [];
  const boston = harness("boston", "17091", async (url) => {
    bostonCalls.push(String(url));
    const u = new URL(url);
    const p = u.pathname;
    const now = Date.now();
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith("/predictions")) {
      return ok({
        data: [{
          id: "p1",
          attributes: {
            arrival_time: new Date(now + 4 * 60000).toISOString(),
            departure_time: new Date(now + 4 * 60000).toISOString(),
            direction_id: 0,
          },
          relationships: {
            route: { data: { id: "741" } },
            trip: { data: { id: "t1" } },
            stop: { data: { id: "17091" } },
          },
        }],
        included: [
          { type: "route", id: "741", attributes: { short_name: "SL1", direction_destinations: ["Logan Airport"] } },
          { type: "trip", id: "t1", attributes: { headsign: "Logan Airport" } },
          { type: "stop", id: "17091", attributes: { name: "Boston Logan Airport Terminal A" } },
        ],
      });
    }
    if (p === "/stops" && u.searchParams.has("filter[latitude]"))
      return ok({ data: [{ id: "17091", attributes: { name: "Boston Logan Airport Terminal A", latitude: 42.366, longitude: -71.02 } }] });
    if (p === "/stops" && u.searchParams.get("location_type") === "0")
      return ok({ data: [{ id: "17091", attributes: { name: "Boston Logan Airport Terminal A", latitude: 42.366, longitude: -71.02 } }] });
    if (p === "/stops/17091")
      return ok({ data: { id: "17091", attributes: { name: "Boston Logan Airport Terminal A", latitude: 42.366, longitude: -71.02 } } });
    if (p === "/routes" && u.searchParams.get("filter[type]") === "3")
      return ok({ data: [{ id: "741", attributes: { short_name: "SL1", long_name: "Logan Airport", color: "7C878E", type: 3 } }] });
    if (p === "/routes" && u.searchParams.get("filter[type]") === "0,1,2")
      return ok({ data: [
        { id: "Red", attributes: { short_name: "Red", long_name: "Red Line", type: 1, color: "DA291C" } },
        { id: "CR-Framingham", attributes: { short_name: "CR-Framingham", long_name: "Framingham/Worcester Line", type: 2, color: "80276C" } },
      ] });
    if (p === "/routes" && u.searchParams.has("filter[stop]")) return ok({ data: [] });
    if (p === "/routes") return ok({ data: [] });
    if (p === "/route_patterns") return ok({ data: [] });
    if (p === "/trips") return ok({ data: [], included: [] });
    if (p.startsWith("/predictions")) return ok({ data: [], included: [] });
    throw new Error("unstubbed Boston URL: " + url);
  });

  const bres = result();
  await boston.sandbox.unlockAccess("bus");
  const bBoard = await settle(() => boston.els.linesScroll.innerHTML);
  const bHeader = boston.els.boardHeader.innerHTML;
  const bAll = bHeader + bBoard;
  if (process.env.DEBUG) console.log("BHEADER>>>", bHeader);
  check(bres, "boston: hero painted", bHeader.length > 0);
  check(bres, "boston: header names the SL1", bAll.includes("SL1"));
  check(bres, "boston: destination from MBTA headsign", bAll.includes("Logan Airport"));
  check(bres, "boston: standalone SVG mode mark", bAll.includes("<svg"));
  check(bres, "boston: city mark in the top bar", boston.els.cityMark.innerHTML.includes("img/MBTA.svg"));
  check(bres, "boston: commuter band is a railcar strip",
    boston.sandbox.lineBandClass("CR-Framingham") === " railcar" &&
    boston.sandbox.lineBandClass("Red") === "");
  await boston.sandbox.renderFavMetroLines();
  const bPanel = boston.els.favMetroLines.innerHTML;
  const bCommuter = boston.els.favCommuterLines.innerHTML;
  check(bres, "boston: Subway section lists the Red line",
    bPanel.includes('data-fav-line="Red"'));
  check(bres, "boston: Commuter section lists the CR line and spaces the slash",
    bCommuter.includes('data-fav-line="CR-Framingham"') &&
    bCommuter.includes("Framingham / Worcester"));
  check(bres, "boston: rail sections are named per city",
    boston.els.railSectionLabel.textContent === "Subway" &&
    boston.els.commuterSectionLabel.textContent === "Commuter rail" &&
    boston.els.favCommuterHeader.hidden === false);
  check(bres, "boston: no WMATA calls",
    bostonCalls.every(u => !u.includes("api.wmata.com")));

  // ── London ────────────────────────────────────────────────────────
  const londonCalls = [];
  const london = harness("london", "940GZZLUOXC", async (url) => {
    londonCalls.push(String(url));
    const u = new URL(url);
    const p = u.pathname;
    const now = Date.now();
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (p === "/StopPoint/940GZZLUOXC/Arrivals") {
      return ok([{
        lineId: "victoria", lineName: "Victoria", modeName: "tube",
        direction: "inbound", destinationName: "Brixton",
        expectedArrival: new Date(now + 3 * 60000).toISOString(),
        timeToStation: 180, vehicleId: "v1", stationName: "Oxford Circus",
        platformName: "Platform 4",
      }]);
    }
    if (p === "/StopPoint/940GZZLUOXC") {
      return ok({
        naptanId: "940GZZLUOXC", commonName: "Oxford Circus Underground Station",
        lat: 51.515, lon: -0.141,
        modes: ["tube", "bus"],
        lines: [
          { id: "victoria", name: "Victoria", modes: ["tube"] },
          { id: "38", name: "38" },
        ],
      });
    }
    if (p === "/Line/victoria/Route/Sequence/all") {
      return ok({ stopPointSequences: [{
        direction: "inbound", name: "Brixton",
        stopPoint: [
          { naptanId: "940GZZLUOXC", name: "Oxford Circus", lat: 51.515, lon: -0.141 },
          { naptanId: "940GZZLUGPK", name: "Green Park", lat: 51.506, lon: -0.142 },
        ],
      }] });
    }
    if (p === "/StopPoint/Mode/bus") return ok({ stopPoints: [] });
    if (p === "/Line/Mode/bus") return ok([]);
    throw new Error("unstubbed London URL: " + url);
  });

  const lres = result();
  const londonRec = lres;
  await london.sandbox.unlockAccess("bus");
  const lBoard = await settle(() => london.els.linesScroll.innerHTML);
  const lHeader = london.els.boardHeader.innerHTML;
  const lAll = lHeader + lBoard;
  if (process.env.DEBUG) console.log("LHEADER>>>", lHeader);
  check(lres, "london: hero painted", lHeader.length > 0);
  check(lres, "london: header names the Victoria line", lAll.includes("Victoria"));
  check(lres, "london: destination from TfL", lAll.includes("Brixton"));
  check(lres, "london: roundel SVG, not Font Awesome",
    lAll.includes("<circle") && !lAll.includes("fa-train-subway"));
  check(lres, "london: city mark is the local roundel file",
    london.els.cityMark.innerHTML.includes("img/london.svg"));
  check(lres, "london: Overground band is a railcar strip",
    london.sandbox.lineBandClass("overground") === " railcar" &&
    london.sandbox.lineBandClass("victoria") === "");
  await london.sandbox.renderFavMetroLines();
  check(lres, "london: settings name the rail section Tube and hide commuter",
    london.els.railSectionLabel.textContent === "Tube" &&
    london.els.favCommuterHeader.hidden === true);
  check(lres, "london: no WMATA/MBTA calls",
    londonCalls.every(u => !u.includes("api.wmata.com") && !u.includes("api-v3.mbta.com")));
  check(lres, "london: registered app_key is used",
    londonCalls.some(u => u.includes("app_key=")));
  const londonConns = await london.sandbox.MTA.cities.london.provider.connections("bus", "940GZZLUOXC");
  const connHtml = london.sandbox.connectionBadgesHtml(londonConns, "bus", "Victoria");
  check(londonRec, "london: bus connection badge is clickable",
    /<button[^>]*class="[^"]*conn-badge/.test(connHtml));
  check(londonRec, "london: bus connection badge is red",
    /data-conn-route="38"[^>]*background:#DC241F/.test(connHtml));
  const heroStops = await london.sandbox.loadHeroRouteStops({ dataset: {
    heroKind: "metro", heroAnchor: "940GZZLUOXC",
    heroTo: "940GZZLUGPK", heroRoute: "victoria",
  } });
  check(lres, "london: hero stop list resolves",
    heroStops.length === 2 && heroStops[0].StopID === "940GZZLUOXC");

  // Nearby is device-located; a different city needs explicit consent.
  {
    const prompt = london.sandbox.askNearbyCityChange("nyc");
    check(lres, "london: Nearby city change asks before switching",
      london.els.cityConfirm.hidden === false &&
      /London/.test(london.els.cityConfirmText.textContent) &&
      /New York City/.test(london.els.cityConfirmText.textContent));
    (london.els.cityConfirmNo._l.click || []).forEach(f => f());
    check(lres, "london: declining the switch keeps London",
      (await prompt) === false &&
      london.els.cityConfirm.hidden === true &&
      london.sandbox.city === "london");
  }

  // ── New York City (phase 0: subway only, no buses) ────────────────
  const nycCalls = [];
  const nyc = harness("nyc", "", async (url) => {
    nycCalls.push(String(url));
    const m = /mtagtfsfeeds\/([^?]+)/.exec(String(url));
    const id = m ? decodeURIComponent(m[1]) : "";
    const now = Date.now();
    let trips = [];
    if (id === "nyct/gtfs") {
      trips = [{
        tripId: "N1", routeId: "1", dir: 1,
        stops: [
          { stopId: "127N", at: now + 150000 },
          { stopId: "101N", at: now + 900000 },   // Van Cortlandt Park-242 St
        ],
      }];
    }
    const buf = feedBytes(trips, now);
    return {
      ok: true, status: 200,
      json: async () => ({}),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    };
  }, "?city=nyc");

  const nres = result();
  await nyc.sandbox.unlockAccess("bus");
  await wait(300);
  check(nres, "nyc: city mark menu lists every city",
    ["Washington DC", "Boston", "London", "New York City"]
      .every(name => String(nyc.els.cityMenuList.innerHTML).includes(name)));
  check(nres, "nyc: city menu marks the current city",
    /aria-checked="true"[^>]*data-city="nyc"/.test(String(nyc.els.cityMenuList.innerHTML)));
  check(nres, "nyc: city mark is the local MTA icon",
    String(nyc.els.cityMark.innerHTML).includes("img/nyc.png"));
  check(nres, "nyc: refresh countdown formatting",
    nyc.sandbox.fmtCountdown(27000) === "0:27" &&
    nyc.sandbox.fmtCountdown(0) === "0:00");
  check(nres, "nyc: near-me radius defaults to 1,000 ft",
    nyc.sandbox.nearRadius().ft === 1000);
  nyc.sandbox.setNearRadius("mile");
  check(nres, "nyc: near-me radius setting switches to 1 mile",
    nyc.sandbox.nearRadius().ft === 5280);
  nyc.sandbox.setNearRadius("10mi");
  check(nres, "nyc: near-me radius setting switches to 10 miles",
    nyc.sandbox.nearRadius().ft === 52800);
  nyc.sandbox.setNearRadius("100mi");
  check(nres, "nyc: near-me radius setting switches to 100 miles",
    nyc.sandbox.nearRadius().ft === 528000);
  check(nres, "nyc: near-me distance switches to miles after half a mile",
    nyc.sandbox.nearDistanceLabel(1200) === "1200 ft" &&
    nyc.sandbox.nearDistanceLabel(2639) === "2639 ft" &&
    nyc.sandbox.nearDistanceLabel(2640) === "0.5 mi" &&
    nyc.sandbox.nearDistanceLabel(6336) === "1.2 mi");
  check(nres, "nyc: no bus feed → Metro mode",
    nyc.els.btnHome.title === "Nearest Metro station");
  await nyc.sandbox.loadMetroStations();
  nyc.sandbox.setMetroAnchor("127");
  const nBoard = await settle(() => nyc.els.linesScroll.innerHTML);
  const nHeader = nyc.els.boardHeader.innerHTML;
  const nAll = nHeader + nBoard;
  if (process.env.DEBUG) console.log("NHEADER>>>", nHeader, "NBOARD>>>", nBoard);
  check(nres, "nyc: hero painted", nHeader.length > 0);
  check(nres, "nyc: station named from GTFS static",
    nAll.includes("Times Sq - 42 St"));
  check(nres, "nyc: headsign is the terminus name",
    nAll.includes("Van Cortlandt Park - 242 St"));
  check(nres, "nyc: route bullet 1 rendered", nAll.includes(">1<"));
  check(nres, "nyc: bullet is circular", nAll.includes("route-bullet") && nAll.includes("circle"));
  check(nres, "nyc: route drop-downs are available",
    nAll.includes("badge-disclosure") && nAll.includes("bt-allstops"));
  const rowChevron = nyc.sandbox.boardRowHead({
    metro: true, route: "1", routeRef: "1", toCode: "101",
    mins: [3], heads: "Van Cortlandt Park-242 St",
  }, "#EE352E", null, "1|0|Van Cortlandt Park-242 St", null);
  check(nres, "nyc: narrow-screen row chevron rendered",
    rowChevron.includes("badge-row-chevron") && rowChevron.includes("badge-disclosure"));
  const express = nyc.sandbox.themedBullet("6", "6X", "#EE352E", { size: "sm" });
  check(nres, "nyc: express variant uses a diamond",
    express.includes("diamond") && express.includes(">6<"));
  check(nres, "nyc: yellow line gets dark text",
    nyc.sandbox.themeBadge().textColor("N") === "#111");
  const nycStops = await nyc.sandbox.loadHeroRouteStops({ dataset: {
    heroKind: "metro", heroAnchor: "127", heroTo: "101", heroRoute: "1",
  } });
  check(nres, "nyc: route drop-down resolves ordered stops",
    nycStops.length > 2 && nycStops[0].StopID === "127" &&
    nycStops[nycStops.length - 1].StopID === "101");
  nyc.sandbox.setMetroAnchor("MNR:51");
  const outside = await settle(() => nyc.els.boardHeader.innerHTML);
  check(nres, "nyc: outside-NYC station shows the chip and commuter railcar band",
    outside.includes("Outside NYC") && outside.includes("Poughkeepsie") &&
    outside.includes("railcar"));

  // Rail stations must resolve from the directory (stale caches used to make
  // the Jamaica card land on a blank board and commuter lines empty).
  nyc.sandbox.setMetroAnchor("LIRR:102");
  const jamaica = await settle(() => nyc.els.boardHeader.innerHTML);
  check(nres, "nyc: LIRR Jamaica station opens a board",
    jamaica.includes("Jamaica") && jamaica.length > 0);
  const lineStops = nyc.sandbox.document.createElement("div");
  lineStops.dataset = {};
  await nyc.sandbox.populateFavStops(lineStops, "metro", "LIRR:1");
  check(nres, "nyc: commuter line lists its stations",
    /fav-stop/.test(lineStops.innerHTML) && lineStops.innerHTML.includes("Babylon"));
  check(nres, "nyc: subway feed requested, no bus/other cities",
    nycCalls.some(u => u.includes("nyct%2Fgtfs")) &&
    nycCalls.every(u => !u.includes("api.wmata.com") &&
      !u.includes("api-v3.mbta.com") && !u.includes("bustime")));

  // Per-city favorites: a DC round-trip must not leak Dulles into NYC.
  const nycCards = String(nyc.els.bookmarkList.innerHTML);
  await nyc.sandbox.renderFavMetroLines();
  const nLines = nyc.els.favMetroLines.innerHTML;
  const nCommuter = nyc.els.favCommuterLines.innerHTML;
  check(nres, "nyc: rail list reuses the circular bullet",
    nLines.includes("route-bullet") && nLines.includes("sm circle"));
  check(nres, "nyc: rail list omits the train noun",
    !/train/i.test(nLines) && !/train/i.test(nCommuter));
  check(nres, "nyc: settings name the sections Subway and Commuter rail",
    nyc.els.railSectionLabel.textContent === "Subway" &&
    nyc.els.commuterSectionLabel.textContent === "Commuter rail" &&
    nyc.els.favCommuterHeader.hidden === false);
  check(nres, "nyc: commuter lines are named rectangles",
    /route-bullet[^"]*\brect\b/.test(nCommuter) && nCommuter.includes("Babylon"));
  const rb1 = nyc.sandbox.themedBullet("Danbury", "MNR:5", "#EE0034", { size: "sm" });
  const rb2 = nyc.sandbox.themedBullet("New Canaan", "MNR:4", "#EE0034", { size: "sm" });
  const rb3 = nyc.sandbox.themedBullet("City Terminal Zone", "LIRR:12", "#4D5357", { size: "sm" });
  check(nres, "nyc: commuter rectangles snap to three standard widths",
    /\brect\b[^"]*\bw1\b/.test(rb1) && /\brect\b[^"]*\bw2\b/.test(rb2) &&
    /\brect\b[^"]*\bw3\b/.test(rb3));
  check(nres, "nyc: the same line uses the same width everywhere",
    rb1.includes("w1") &&
    nyc.sandbox.themedBullet("Danbury", "MNR:5", "#EE0034", {}).includes("w1"));
  check(nres, "nyc: default favorites are LGA and JFK",
    nycCards.includes("LGA/Terminal B") && nycCards.includes("Howard Beach-JFK Airport"));
  await nyc.sandbox.renderNearbyView();
  await wait(60);
  check(nres, "nyc: Nearby view opens with a title and distance handling",
    nyc.els.bookmarkTitle.textContent === "Nearby" &&
    /location unavailable|nothing within|bookmark-card/.test(nyc.els.bookmarkList.innerHTML));
  const nearCard = nyc.sandbox.bookmarkCardHtml({
    kind: "metro", id: "127", name: "Times Sq-42 St", route: "1", distFt: 3000,
  });
  check(nres, "nyc: Nearby uses the bookmark-card format with distance",
    nearCard.includes("bookmark-card") && nearCard.includes("0.6 mi"));
  nyc.sandbox.setCity("dc");
  await wait(150);
  check(nres, "nyc: city mark follows the switch",
    String(nyc.els.cityMark.innerHTML).includes("img/dc.svg"));
  nyc.sandbox.setCity("nyc");
  // Switching cities keeps the current view, so open Likes explicitly to
  // verify that the per-city saved list swapped.
  await nyc.sandbox.renderBookmarkList("fav");
  const nycCards2 = await settle(() => nyc.els.bookmarkList.innerHTML);
  check(nres, "nyc: switching DC → NYC swaps favorites (no Dulles)",
    nycCards2.includes("Howard Beach-JFK Airport") && !nycCards2.includes("Dulles"));
  await nyc.sandbox.gotoLike("bus", "904417", "LGA/Terminal B");
  check(nres, "nyc: opening a bus place keeps Metro mode and explains",
    nyc.els.btnHome.title === "Nearest Metro station" &&
    /not available/.test(nyc.els.linesNote.textContent));

  const pass = bres.pass + lres.pass + nres.pass;
  const fail = bres.fail + lres.fail + nres.fail;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
