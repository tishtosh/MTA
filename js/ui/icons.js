// ── Per-city transit marks ───────────────────────────────────────────
// Font Awesome stays for generic UI chrome (star, home, share…). Transit
// modes use these standalone SVGs so each city can carry its own brand:
// the WMATA M, the MBTA T, the TfL roundel, and local bus/tram/ferry marks.
//
// Usage: MTA.icons.html("london", "subway", { color: "#0019a8" })
// The caller supplies the accessible wrapper (role/aria-label/title).
(function () {
    "use strict";
    window.MTA = window.MTA || {};

    const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" '
        + 'stroke-linecap="round" stroke-linejoin="round"';

    // Generic modes, used when a city has no override.
    const GENERIC = {
        bus: `<g ${STROKE}>
            <rect x="3" y="3" width="18" height="14" rx="3"/>
            <path d="M3 8.5h18M7 3v5.5M17 3v5.5"/>
            <path d="M6.5 13.5h2M15.5 13.5h2"/>
            <circle cx="7" cy="19.5" r="1.8"/>
            <circle cx="17" cy="19.5" r="1.8"/>
        </g>`,
        subway: `<g ${STROKE}>
            <rect x="4" y="2.5" width="16" height="15" rx="4"/>
            <path d="M4 9h16M7.5 5.5h2M14.5 5.5h2"/>
            <path d="M7 20.5l2-3M17 20.5l-2-3M6 17h12"/>
            <circle cx="8.5" cy="13" r="1.4" fill="currentColor" stroke="none"/>
            <circle cx="15.5" cy="13" r="1.4" fill="currentColor" stroke="none"/>
        </g>`,
        rail: `<g ${STROKE}>
            <rect x="3" y="3" width="18" height="13" rx="3"/>
            <path d="M3 9.5h18M7 6.5h3M14 6.5h3"/>
            <path d="M6 20.5l2.5-4.5M18 20.5L15.5 16M5 18.5h14"/>
            <circle cx="7" cy="19.5" r="1.6"/>
            <circle cx="17" cy="19.5" r="1.6"/>
        </g>`,
        commuter: `<g ${STROKE}>
            <rect x="3.5" y="4" width="17" height="12" rx="2.5"/>
            <path d="M3.5 10h17M7 7h2.5M14.5 7h2.5"/>
            <path d="M8 20l1.5-4M16 20l-1.5-4M6 20h12"/>
        </g>`,
        tram: `<g ${STROKE}>
            <rect x="4" y="5" width="16" height="12" rx="3"/>
            <path d="M4 10.5h16M12 5V2M9 2h6"/>
            <path d="M7 20.5l1.5-3M17 20.5l-1.5-3M6.5 17h11"/>
            <circle cx="8" cy="19.5" r="1.5"/>
            <circle cx="16" cy="19.5" r="1.5"/>
        </g>`,
        ferry: `<g ${STROKE}>
            <path d="M4 15.5h16l-2.5 5h-11z"/>
            <path d="M7 15.5V7h10v8.5M12 7V3M9 10.5h6"/>
            <path d="M2.5 20.5c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1"/>
        </g>`,
        plane: `<g ${STROKE}>
            <path d="M10.5 3.5a1.5 1.5 0 0 1 3 0V9l7 4v2l-7-2v3.5l2 1.5V20l-3.5-1-3.5 1v-2l2-1.5V13l-7 2v-2l7-4z"/>
        </g>`,
    };

    function roundel(glyph) {
        const mark = glyph
            ? `<text x="12" y="15.2" text-anchor="middle" font-family="system-ui,sans-serif" `
              + `font-size="8.5" font-weight="700" fill="currentColor" stroke="none">${glyph}</text>`
            : "";
        return `<g ${STROKE}>
            <circle cx="12" cy="12" r="8.5"/>
            <path d="M3.5 12h17" stroke-width="2.6"/>
            ${mark}
        </g>`;
    }

    // London buses are the recognizable double-decker.
    const LONDON_BUS = `<g ${STROKE}>
        <rect x="3" y="2.5" width="18" height="16" rx="2.4"/>
        <path d="M3 8.5h18M3 13.5h18M7 2.5v11M17 2.5v11"/>
        <path d="M9.5 13.5v3.2M14.5 13.5v3.2"/>
        <circle cx="7" cy="20" r="1.7"/>
        <circle cx="17" cy="20" r="1.7"/>
    </g>`;

    const CITY = {
        dc: {
            bus: GENERIC.bus,
            subway: roundel("M"),
            rail: roundel("M"),
            commuter: GENERIC.commuter,
            tram: GENERIC.tram,
            ferry: GENERIC.ferry,
        },
        boston: {
            bus: GENERIC.bus,
            subway: roundel("T"),
            rail: roundel("T"),
            commuter: GENERIC.commuter,
            tram: GENERIC.tram,
            ferry: GENERIC.ferry,
        },
        london: {
            bus: LONDON_BUS,
            subway: roundel(""),
            rail: roundel(""),
            overground: roundel("O"),
            elizabeth: roundel("E"),
            dlr: roundel("D"),
            tram: GENERIC.tram,
            ferry: GENERIC.ferry,
        },
    };

    function body(cityId, mode) {
        const city = CITY[cityId] || {};
        return city[mode] || GENERIC[mode] || GENERIC.bus;
    }

    function html(cityId, mode, opts) {
        const options = opts || {};
        const cls = ["mode-svg"].concat(options.className || []).join(" ");
        const style = options.color ? ` style="color:${options.color}"` : "";
        const size = options.size ? ` width="${options.size}" height="${options.size}"` : "";
        const mark = body(cityId, mode).replace(/\s{2,}/g, " ").trim();
        return `<svg class="${cls}" viewBox="0 0 24 24"${size}${style} `
            + `aria-hidden="true" focusable="false">${mark}</svg>`;
    }

    MTA.icons = { html, body, has: (cityId, mode) => !!((CITY[cityId] || {})[mode]) };
})();
