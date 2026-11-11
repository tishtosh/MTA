// Runs every vm suite in test/ against the live mta26.html <script>.
// Usage: node test/run.js
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

// Each entry: [file, ...argv]. The full-page harness runs three times:
// both live-capture anchors (expect NO across section) and the synthesized
// across variant (route_C87_across.json — see fullpagetest.js header).
const SUITES = [
  ["markertest.js"],       // piece 2: marker math
  ["geombtest.js"],        // piece 3: board geometry
  ["boardtest.js"],        // piece 4: board row model
  ["renderlinetest.js"],   // piece 5: line rendering pipeline
  ["acrosstest.js"],       // piece 5: across-the-street resolver
  ["boarddrawtest.js"],    // piece 7a: SVG board drawing
  ["centeringtest.js"],    // piece 12: narrow-screen centering
  ["fullpagetest.js", "1002130"],   // piece 13: whole page, live C87/D72 captures
  ["fullpagetest.js", "1002135"],   // piece 13: whole page, opposite corner
  ["fullpagetest.js", "1002130", "across"]  // piece 13: synthesized across section
];

let failed = 0;
for (const s of SUITES) {
  const label = s[0] + (s.length > 1 ? " (" + s.slice(1).join(" ") + ")" : "");
  console.log("── " + label + " " + "─".repeat(Math.max(0, 52 - label.length)));
  const r = spawnSync(process.execPath, [path.join(__dirname, s[0])].concat(s.slice(1)), { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
console.log("\n" + (failed ? failed + " suite(s) FAILED" : "all " + SUITES.length + " suites passed"));
process.exit(failed ? 1 : 0);
