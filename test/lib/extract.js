// Shared page-script source for the vm suites: reads the <script> block
// straight out of mta26.html on every run, so the suites always test the
// page that ships — no copy-drift between a snapshot and the repo.
"use strict";
const fs = require("fs");
const path = require("path");

const HTML_PATH = path.join(__dirname, "..", "..", "mta26.html");

function pageScript() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("no <script> block in " + HTML_PATH);
  return m[1];
}

module.exports = { pageScript, HTML_PATH };
