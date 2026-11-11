// Runs every vm suite in test/ against the live mta26.html <script>.
// Usage: node test/run.js
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const SUITES = [
  "markertest.js",     // piece 2: marker math
  "geombtest.js",      // piece 3: board geometry
  "boardtest.js",      // piece 4: board row model
  "renderlinetest.js", // piece 5: line rendering pipeline
  "acrosstest.js",     // piece 5: across-the-street resolver
  "boarddrawtest.js",  // piece 7a: SVG board drawing
  "centeringtest.js"   // piece 12: narrow-screen centering
];

let failed = 0;
for (const s of SUITES) {
  console.log("── " + s + " " + "─".repeat(Math.max(0, 52 - s.length)));
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
console.log("\n" + (failed ? failed + " suite(s) FAILED" : "all " + SUITES.length + " suites passed"));
process.exit(failed ? 1 : 0);
