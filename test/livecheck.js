// Piece 14: live re-verification. Hits the real WMATA feed with the shipped
// key and checks the structural expectations the page depends on (ETAs are
// volatile by nature — assert presence/shape, not exact minutes).
const K = process.argv[2];
const base = "https://api.wmata.com/";
const get = async (u) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(u + " -> HTTP " + r.status);
  return r.json();
};
const rows = (x) => (Array.isArray(x) ? x : x.Predictions || x.BusPositions || []);
const inDir = (r, k, id) => {
  const d = r[k];
  return !!d && (d.Stops || []).some((s) => String(s.StopID) === id);
};
const fmt = (p) =>
  [p.RouteID || p.Route || "?", p.DirectionText || "", (p.Minutes != null ? p.Minutes : p.RelativeTime ?? p.Min ?? "?") + "min"].filter(Boolean).join(": ");
let fail = 0;
const t = (label, ok) => {
  if (!ok) fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label);
};
(async () => {
  const [c87, d72, p130, p135, pos] = await Promise.all([
    get(base + `Bus.svc/json/jRouteDetails?api_key=${K}&RouteID=C87`),
    get(base + `Bus.svc/json/jRouteDetails?api_key=${K}&RouteID=D72`),
    get(base + `NextBusService.svc/json/jPredictions?api_key=${K}&StopID=1002130`),
    get(base + `NextBusService.svc/json/jPredictions?api_key=${K}&StopID=1002135`),
    get(base + `Bus.svc/json/jBusPositions?api_key=${K}`),
  ]);
  const a130 = rows(p130), a135 = rows(p135), posRows = rows(pos);
  console.log("C87 dir0 stops:", c87.Direction0.Stops.length, "| C87 dir1 stops:", (c87.Direction1?.Stops || []).length);
  console.log("D72 dir0 stops:", (d72.Direction0?.Stops || []).length, "| D72 dir1 stops:", (d72.Direction1?.Stops || []).length);
  console.log("preds 130:", a130.map(fmt).join(" | ") || "(none)");
  console.log("preds 135:", a135.map(fmt).join(" | ") || "(none)");
  console.log("bus positions rows:", posRows.length);
  t("C87 dir0 still contains 1002130 (service row for the anchor)", inDir(c87, "Direction0", "1002130"));
  t("1002135 sits on no C87 pattern (no service row, no across)", !inDir(c87, "Direction0", "1002135") && !inDir(c87, "Direction1", "1002135"));
  t("1002130/1002135 sit on no D72 pattern (D72 rows stay compact)", !inDir(d72, "Direction0", "1002130") && !inDir(d72, "Direction1", "1002130") && !inDir(d72, "Direction0", "1002135") && !inDir(d72, "Direction1", "1002135"));
  t("both stops still have D72 predictions (header Next bus + compact row)", a130.some((p) => String(p.RouteID ?? p.Route) === "D72") && a135.some((p) => String(p.RouteID ?? p.Route) === "D72"));
  t("bus position feed non-empty (live/estimated markers)", posRows.length > 0);
  console.log(fail ? `\n${fail} check(s) FAILED` : "\nall live checks passed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("LIVE CHECK ERROR:", e.message); process.exit(2); });
