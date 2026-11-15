// Shared page-script source for the vm suites: reads the provider modules
// and the <script> block straight out of mta26.html on every run, so the
// suites always test the page that ships — no copy-drift between a snapshot
// and the repo.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const HTML_PATH = path.join(ROOT, "mta26.html");

// Load order must match mta26.html.
const MODULES = [
  "js/core/http.js",
  "js/core/gtfsrt.js",
  "js/cities/index.js",
  "js/cities/dc.js",
  "js/cities/boston.js",
  "js/cities/london.js",
  "js/cities/nyc-data.js",
  "js/cities/nyc.js",
  "js/ui/icons.js"
];

function pageScript() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("no <script> block in " + HTML_PATH);
  const modules = MODULES.map(rel =>
    `// ── ${rel} ──\n` + fs.readFileSync(path.join(ROOT, rel), "utf8"));
  return modules.join("\n;\n") + "\n;\n" + m[1];
}

module.exports = { pageScript, HTML_PATH, MODULES };
