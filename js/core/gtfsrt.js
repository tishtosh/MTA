// ── GTFS-Realtime (protobuf) reader ──────────────────────────────────
// MTA's subway/rail feeds are protobuf; only some NYCT groups also publish an
// (undocumented, 8× larger) JSON mirror, and LIRR/Metro-North have none. This
// module decodes just the subset the app needs, with no dependencies:
//
//   FeedMessage.entity(2) → FeedEntity.trip_update(3)
//   TripUpdate.trip(1) → TripDescriptor { trip_id(1), route_id(5), direction_id(6) }
//   TripUpdate.stop_time_update(2) → { stop_id(4), arrival(2), departure(3),
//                                      schedule_relationship(5) }
//   StopTimeEvent.time(2) = epoch seconds
//
// Everything else (vehicle positions, alerts, NYCT track extensions) is skipped
// by wire type, so feed extensions never break the reader.
"use strict";
(function () {
    "use strict";
    window.MTA = window.MTA || {};

    const utf8 = new TextDecoder();

    function varint(b, p) {
        let v = 0, mul = 1, x;
        do {
            x = b[p++];
            v += (x & 0x7f) * mul;
            mul *= 128;
        } while (x & 0x80);
        return [v, p];
    }

    function skip(b, p, wire) {
        if (wire === 0) { while (b[p++] & 0x80); return p; }
        if (wire === 1) return p + 8;
        if (wire === 5) return p + 4;
        if (wire === 2) { const [n, q] = varint(b, p); return q + n; }
        throw new Error("gtfs-rt: unsupported wire type " + wire);
    }

    function parseTripDescriptor(b, start, end) {
        const trip = { tripId: "", routeId: "", directionId: 0 };
        let p = start;
        while (p < end) {
            let key;
            [key, p] = varint(b, p);
            const field = key >>> 3, wire = key & 7;
            if (wire === 2 && (field === 1 || field === 5)) {
                let n;
                [n, p] = varint(b, p);
                const s = utf8.decode(b.subarray(p, p + n));
                p += n;
                if (field === 1) trip.tripId = s;
                else trip.routeId = s;
            } else if (wire === 0 && field === 6) {
                let v;
                [v, p] = varint(b, p);
                trip.directionId = v;
            } else p = skip(b, p, wire);
        }
        return trip;
    }

    // StopTimeEvent → epoch ms, or null when the event carries no absolute time.
    function parseTime(b, start, end) {
        let p = start;
        while (p < end) {
            let key;
            [key, p] = varint(b, p);
            const field = key >>> 3, wire = key & 7;
            if (wire === 0 && field === 2) {
                let v;
                [v, p] = varint(b, p);
                return v * 1000;
            }
            p = skip(b, p, wire);
        }
        return null;
    }

    // SCHEDULED = 0, SKIPPED = 1, NO_DATA = 2, UNSCHEDULED = 3.
    function parseStopUpdate(b, start, end) {
        const su = { stopId: "", at: null, skipped: false };
        let p = start;
        while (p < end) {
            let key;
            [key, p] = varint(b, p);
            const field = key >>> 3, wire = key & 7;
            if (wire === 2 && field === 4) {
                let n;
                [n, p] = varint(b, p);
                su.stopId = utf8.decode(b.subarray(p, p + n));
                p += n;
            } else if (wire === 2 && (field === 2 || field === 3)) {
                let n;
                [n, p] = varint(b, p);
                const at = parseTime(b, p, p + n);
                p += n;
                // Arrival wins; departure is the fallback for terminal stops.
                if (at != null && (field === 2 || su.at == null)) su.at = at;
            } else if (wire === 0 && field === 5) {
                let v;
                [v, p] = varint(b, p);
                su.skipped = v === 1 || v === 2;
            } else p = skip(b, p, wire);
        }
        return su;
    }

    function parseTripUpdate(b, start, end) {
        const row = { trip: null, stops: [] };
        let p = start;
        while (p < end) {
            let key;
            [key, p] = varint(b, p);
            const field = key >>> 3, wire = key & 7;
            if (wire === 2 && field === 1) {
                let n;
                [n, p] = varint(b, p);
                row.trip = parseTripDescriptor(b, p, p + n);
                p += n;
            } else if (wire === 2 && field === 2) {
                let n;
                [n, p] = varint(b, p);
                row.stops.push(parseStopUpdate(b, p, p + n));
                p += n;
            } else p = skip(b, p, wire);
        }
        return row.trip ? row : null;
    }

    function parseHeader(b, start, end) {
        let p = start, timestamp = 0;
        while (p < end) {
            let key;
            [key, p] = varint(b, p);
            const field = key >>> 3, wire = key & 7;
            if (wire === 0 && field === 3) {
                let v;
                [v, p] = varint(b, p);
                timestamp = v * 1000;
            } else p = skip(b, p, wire);
        }
        return timestamp;
    }

    // FeedMessage → { timestamp, trips: [...] }
    function parse(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const trips = [];
        let timestamp = 0;
        let p = 0;
        while (p < b.length) {
            let key;
            [key, p] = varint(b, p);
            const field = key >>> 3, wire = key & 7;
            if (wire === 2 && field === 1) {
                let n;
                [n, p] = varint(b, p);
                timestamp = parseHeader(b, p, p + n);
                p += n;
            } else if (wire === 2 && field === 2) {
                let n;
                [n, p] = varint(b, p);
                const end = p + n;
                let q = p, tu = null;
                while (q < end) {
                    let k2;
                    [k2, q] = varint(b, q);
                    const f2 = k2 >>> 3, w2 = k2 & 7;
                    if (w2 === 2 && f2 === 3) {
                        let n2;
                        [n2, q] = varint(b, q);
                        tu = parseTripUpdate(b, q, q + n2);
                        q += n2;
                    } else q = skip(b, q, w2);
                }
                if (tu) trips.push({
                    tripId: tu.trip.tripId,
                    routeId: tu.trip.routeId,
                    directionId: tu.trip.directionId,
                    stops: tu.stops,
                });
                p = end;
            } else p = skip(b, p, wire);
        }
        return { timestamp, trips };
    }

    MTA.gtfsrt = { parse };
})();
