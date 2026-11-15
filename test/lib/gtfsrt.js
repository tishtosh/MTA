// Tiny GTFS-Realtime protobuf writer for tests (varint + length-delimited).
// Produces the subset the app decodes: trip descriptor, stop time updates and
// the feed header timestamp.
"use strict";

function varint(n) {
    const out = [];
    while (n > 127) { out.push((n & 127) | 128); n >>>= 7; }
    out.push(n);
    return out;
}
function tag(field, wire) { return varint(field * 8 + wire); }
function vi(field, value) { return [...tag(field, 0), ...varint(value)]; }
function ld(field, bytes) {
    const b = Array.isArray(bytes) ? bytes : [...Buffer.from(bytes)];
    return [...tag(field, 2), ...varint(b.length), ...b];
}
function text(field, s) { return ld(field, Buffer.from(String(s), "utf8")); }

function tripBytes(t) {
    const trip = [...text(1, t.tripId), ...text(5, t.routeId), ...vi(6, t.dir || 0)];
    const stops = (t.stops || []).map(s => [
        ...text(4, s.stopId),
        ...(s.at != null ? ld(2, vi(2, Math.floor(s.at / 1000))) : []),
        ...(s.skipped ? vi(5, 1) : []),
    ].flat());
    return [...ld(1, trip), ...stops.flatMap(s => ld(2, s))];
}

// trips: [{ tripId, routeId, dir, stops: [{ stopId, at, skipped }] }]
function feedBytes(trips, timestamp) {
    const header = timestamp ? ld(1, vi(3, Math.floor(timestamp / 1000))) : [];
    const entities = trips.flatMap(t => ld(2, ld(3, tripBytes(t))));
    return Buffer.from([...header, ...entities]);
}

module.exports = { varint, tag, vi, ld, text, tripBytes, feedBytes };
