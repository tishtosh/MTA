// Piece 12: boarding-centered scroller on narrow screens + reduced motion +
// user-scroll precedence (vm-extracted, no copy drift).
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

// controllable clock + media query
let fakeNow = 0;
let reduce = false;
ctx.Date = { now: () => fakeNow };
ctx.matchMedia = (q) => ({ get matches() { return reduce; }, media: q, addEventListener() {}, removeEventListener() {} });

// scroller stub: 344 px viewport (a phone), 600 px board, guide at x=296
const guide = { getAttribute: () => "296" };
const scroller = {
  clientWidth: 344, scrollWidth: 600, scrollLeft: 0,
  _guide: guide, _scrollTo: null,
  querySelector(sel) { return sel === ".bt-guide" ? this._guide : null; },
  scrollTo(o) { this._scrollTo = o; }
};
ctx.gLinesScroll = scroller;

let src = [constBlock("REDUCE_MOTION"), constBlock("boardUserScrolled"), constBlock("boardAuto"),
  extractFn("centerBoard"), extractFn("onBoardScroll")].join("\n");
// the lets/consts stay in the script's lexical scope — peek/poke for the tests
src += "\nglobalThis.__peek = () => ({ user: boardUserScrolled, auto: boardAuto });";
src += "\nglobalThis.__poke = (user, auto) => { if (user !== undefined) boardUserScrolled = user; boardAuto = auto || { at: 0, left: null }; };";
vm.runInContext(src, ctx);

let pass = 0, fail = 0;
function t(label, ok, extra) {
  if (ok) { pass++; console.log("PASS  " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("FAIL  " + label + (extra ? "  " + extra : "")); }
}
const TARGET = 296 - 344 / 2;   // 124

// E1: narrow + overflowing, nobody scrolled, motion allowed → smooth center
reduce = false; fakeNow = 1000;
ctx.centerBoard();
t("E1 smooth scroll to centered guide", scroller._scrollTo && scroller._scrollTo.left === TARGET && scroller._scrollTo.behavior === "smooth", `left=${scroller._scrollTo && scroller._scrollTo.left}`);
t("E2 page scroll during settling is not user scroll",
  (() => { scroller.scrollLeft = TARGET; ctx.onBoardScroll(); return ctx.__peek().user === false; })());
t("E3 no user flag after the settling window closes (still at target)",
  (() => { fakeNow += 2000; scroller.scrollLeft = TARGET; ctx.onBoardScroll(); return ctx.__peek().user === false; })());

// E4: reduced motion → instant jump, no smooth animation
reduce = true; fakeNow = 3000;
scroller.scrollLeft = 0; scroller._scrollTo = null;
t("E4 reduced motion sets scrollLeft directly",
  (() => { ctx.centerBoard(); return scroller.scrollLeft === TARGET && scroller._scrollTo === null; })());

// E5: user scrolled away after the window → centering stands down
fakeNow += 5000; scroller.scrollLeft = 300; ctx.onBoardScroll();
reduce = false;
t("E5 user scroll takes precedence on later refreshes",
  (() => { const before = scroller._scrollTo; ctx.centerBoard(); return scroller._scrollTo === before && scroller.scrollLeft === 300; })());

// E6: no overflow (desktop, short board) → no-op, flag untouched
ctx.__poke(false, { at: 0, left: null });
scroller.scrollLeft = 0; scroller._scrollTo = null; scroller.scrollWidth = 300;
t("E6 no overflow → no scroll", (() => { ctx.centerBoard(); return scroller._scrollTo === null; })());

// E7: already at the target → no-op
scroller.scrollWidth = 600; scroller.scrollLeft = TARGET;
t("E7 at target → no scroll", (() => { ctx.centerBoard(); return scroller._scrollTo === null; })());

// E8: no guide in the scroller (empty board) → no-op
scroller.scrollLeft = 0; scroller._guide = null;
t("E8 no guide → no-op", (() => { ctx.centerBoard(); return scroller._scrollTo === null && ctx.__peek().user === false; })());

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
