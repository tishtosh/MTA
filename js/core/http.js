// ── Shared JSON transport ────────────────────────────────────────────
// One GET helper for every city adapter. It owns the cross-city concerns
// (timeout, one retry after a 429/network failure, short-lived memo) so
// providers only describe endpoints and response shapes.
//
// Classic script (no build step): it attaches to window.MTA and is loaded
// before the providers and the page app.
(function () {
    "use strict";
    window.MTA = window.MTA || {};

    const MEMO_MS = 6000;
    const memo = new Map();

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function memoKey(url, qs) {
        return url + "?" + qs.toString();
    }

    function memoGet(key) {
        const hit = memo.get(key);
        if (!hit) return null;
        if (Date.now() - hit.at > MEMO_MS) {
            memo.delete(key);
            return null;
        }
        return hit.data;
    }

    function memoSet(key, data) {
        memo.set(key, { at: Date.now(), data });
        if (memo.size <= 200) return;
        const cutoff = Date.now() - MEMO_MS;
        for (const [k, v] of memo)
            if (v.at < cutoff) memo.delete(k);
    }

    // Returns { data, error } and never throws, so callers can choose the
    // failure surface. `memoize:false` is for live endpoints. Protocol-buffer
    // feeds (MTA GTFS-RT) ask for `responseType:"arraybuffer"`.
    async function get(options) {
        const {
            url, query, timeoutMs = 12000, retries = 1,
            key, keyParam = "api_key", memoize = true, headers = null,
            responseType = "json",
        } = options;

        const binary = responseType === "arraybuffer";
        const qs = new URLSearchParams(query || {});
        if (key && keyParam) qs.set(keyParam, key);
        const mk = memoize && !binary ? memoKey(url, qs) : "";
        if (mk) {
            const hit = memoGet(mk);
            if (hit) return { data: hit, error: null };
        }

        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), timeoutMs);
            try {
                const res = await fetch(`${url}?${qs}`, {
                    signal: ctl.signal,
                    headers: headers || undefined,
                });
                if (binary) {
                    const buf = await res.arrayBuffer();
                    if (!res.ok) return {
                        data: null,
                        error: Object.assign(new Error(`HTTP ${res.status}`),
                            { status: res.status, rateLimited: res.status === 429 }),
                    };
                    return { data: new Uint8Array(buf), error: null };
                }
                const data = await res.json().catch(() => ({}));
                if (res.status === 429 && attempt < retries) {
                    await sleep(1500);
                    continue;
                }
                const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
                const error = res.ok ? null : Object.assign(
                    new Error(detail || data.Message || `HTTP ${res.status}`),
                    { status: res.status, rateLimited: res.status === 429 });
                if (!error && mk) memoSet(mk, data);
                return { data, error };
            } catch (e) {
                lastError = e;
                if (attempt < retries) {
                    await sleep(1500);
                    continue;
                }
                return { data: null, error: e };
            } finally {
                clearTimeout(timer);
            }
        }
        return { data: null, error: lastError };
    }

    MTA.http = {
        get,
        sleep,
        clearMemo: () => memo.clear(),
    };
})();
