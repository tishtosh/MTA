// ── City registry and active-city state ──────────────────────────────
// Providers register themselves here (dc.js, boston.js, london.js).
// Everything else (UI, caches, refresh tiers) asks for the active city's
// provider/theme instead of branching on a city name.
(function () {
    "use strict";
    window.MTA = window.MTA || {};

    MTA.cityRegistry = {};
    MTA.registerCity = function (city) {
        if (!city || !city.id) throw new Error("city registration needs an id");
        MTA.cityRegistry[city.id] = city;
    };

    const CITIES = MTA.cityRegistry;
    MTA.cities = CITIES;
    const CITY_COOKIE = "mta_city";

    function readCityCookie() {
        try {
            const hit = String(document.cookie || "").split("; ")
                .find(p => p.startsWith(CITY_COOKIE + "="));
            const v = hit ? decodeURIComponent(hit.slice(CITY_COOKIE.length + 1)) : "";
            return v || "dc";
        } catch (e) { return "dc"; }
    }

    function applyCityChrome(cityId) {
        if (!CITIES[cityId] && CITIES.dc) {
            cityId = "dc";
            city = "dc";
        }
        const cfg = CITIES[cityId] || CITIES.dc;
        if (!cfg) return;
        if (document.body && document.body.dataset)
            document.body.dataset.city = cfg.id;
        const vars = (cfg.theme && cfg.theme.cssVars) || {};
        const root = document.documentElement;
        if (root && root.style) {
            for (const [key, value] of Object.entries(vars))
                root.style.setProperty(key, value);
        }
    }

    function writeCityCookie() {
        try {
            document.cookie = `${CITY_COOKIE}=${city}; max-age=31536000; path=/; SameSite=Lax`;
        } catch (e) { /* session-only */ }
        applyCityChrome(city);
    }

    let urlCity = null;
    try {
        urlCity = new URLSearchParams(location.search).get("city");
    } catch (e) { /* no location (tests) */ }
    let city = urlCity || readCityCookie();

    function cityCfg() {
        return CITIES[city] || CITIES.dc || Object.values(CITIES)[0] || null;
    }

    function cityProvider() {
        const cfg = cityCfg();
        return cfg ? cfg.provider : null;
    }

    function cityTheme() {
        const cfg = cityCfg();
        return cfg ? cfg.theme : null;
    }

    function isBoston() { return city === "boston"; }
    function isLondon() { return city === "london"; }
    function cityHome() { return cityCfg().center; }
    function defaultFavorite() { return Object.assign({}, cityCfg().defaultFavorite); }

    function nearestCity(lat, lon) {
        let best = city, bestD = Infinity;
        for (const key of Object.keys(CITIES)) {
            const c = CITIES[key].center;
            if (!c) continue;
            const d = distance(lat, lon, c.lat, c.lon, "m");
            if (d < bestD) { best = key; bestD = d; }
        }
        return best;
    }

    function populateCitySelect(select) {
        if (!select) return;
        select.innerHTML = Object.keys(CITIES)
            .map(id => `<option value="${id}">${CITIES[id].name}</option>`)
            .join("");
        select.value = city;
    }

    const api = {
        CITIES,
        CITY_COOKIE,
        readCityCookie,
        writeCityCookie,
        applyCityChrome,
        cityCfg,
        cityProvider,
        cityTheme,
        cityHome,
        defaultFavorite,
        nearestCity,
        populateCitySelect,
        isBoston,
        isLondon,
    };
    Object.assign(MTA, api);

    // The page script is a classic script too, so it shares these globals.
    Object.assign(window, api);
    Object.defineProperty(window, "city", {
        configurable: true,
        get() { return city; },
        set(next) { if (CITIES[next]) city = next; },
    });
})();
