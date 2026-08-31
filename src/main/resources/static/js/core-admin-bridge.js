window.CadminCoreAdminBridge = (function () {
    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function fail(action, xhr) {
        const status = xhr && xhr.status ? xhr.status : "error";
        return action + " failed (" + status + "). Is Core Admin Bridge running on port 8280?";
    }

    function routeHref(id) {
        return "#/core-admin-bridge/" + encodeURIComponent(id || "");
    }

    function matchesQuery(text, query) {
        if (!query) {
            return true;
        }
        return String(text || "").toLowerCase().indexOf(query.toLowerCase()) >= 0;
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
    }

    function payload(body, key) {
        if (!body || typeof body !== "object") {
            return {};
        }
        const nested = body[key];
        return nested && typeof nested === "object" ? nested : body;
    }

    function consoleRoutes(body) {
        const data = payload(body, "route");
        if (Array.isArray(data.routes)) {
            return data.routes;
        }
        return Array.isArray(data) ? data : [];
    }

    function consoleProcessors(body) {
        const data = payload(body, "processor");
        if (Array.isArray(data.processors)) {
            return data.processors;
        }
        return Array.isArray(data) ? data : [];
    }

    function consoleSources(body) {
        const data = payload(body, "source");
        if (Array.isArray(data.routes)) {
            return data.routes;
        }
        return Array.isArray(data) ? data : [];
    }

    function findByRouteId(items, id) {
        const wanted = String(id || "");
        return (items || []).find(function (item) {
            return String(item.routeId || item.id || "") === wanted;
        }) || null;
    }

    function sourceYaml(source) {
        const lines = (source && source.code) || [];
        if (!lines.length) {
            return "";
        }
        return lines.map(function (line) {
            return line && line.code != null ? String(line.code) : "";
        }).join("\n");
    }

    function formatTs(value) {
        if (value == null || value === "" || value < 0) {
            return "—";
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    function formatDuration(ms) {
        if (ms == null || ms < 0) {
            return "—";
        }
        if (ms < 1000) {
            return ms + " ms";
        }
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) {
            return seconds + "s";
        }
        const minutes = Math.floor(seconds / 60);
        const rem = seconds % 60;
        if (minutes < 60) {
            return rem ? minutes + "m" + rem + "s" : minutes + "m";
        }
        const hours = Math.floor(minutes / 60);
        const minRem = minutes % 60;
        return minRem ? hours + "h" + minRem + "m" : hours + "h";
    }

    function formatNumber(value) {
        if (value == null || value === "" || value < 0) {
            return "—";
        }
        return String(value);
    }

    function formatMs(value) {
        if (value == null || value === "" || value < 0) {
            return "—";
        }
        return value + " ms";
    }

    function stateKind(state) {
        const value = String(state || "").toLowerCase();
        if (value === "started") {
            return "success";
        }
        if (value === "stopped" || value === "stoppedforced") {
            return "secondary";
        }
        if (value === "suspended") {
            return "warning";
        }
        if (value === "error" || value === "failed") {
            return "danger";
        }
        return "info";
    }

    function stateBadge(state) {
        const label = state || "—";
        return '<span class="badge text-bg-' + stateKind(state) + '">' + esc(label) + "</span>";
    }

    function statCard(border, label, value, icon) {
        return '<div class="col-xl-3 col-md-6 mb-4">' +
            '<div class="card border-left-' + border + ' shadow h-100 py-2">' +
                '<div class="card-body">' +
                    '<div class="row align-items-center no-gutters">' +
                        '<div class="col me-2">' +
                            '<div class="text-xs text-uppercase text-' + border + ' mb-1">' + esc(label) + "</div>" +
                            '<div class="h5 mb-0 stat-value">' + esc(value) + "</div>" +
                        "</div>" +
                        '<div class="col-auto text-gray-400"><i class="bi ' + icon + ' fs-2"></i></div>' +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    return {
        esc: esc,
        fail: fail,
        routeHref: routeHref,
        matchesQuery: matchesQuery,
        emptyRow: emptyRow,
        payload: payload,
        consoleRoutes: consoleRoutes,
        consoleProcessors: consoleProcessors,
        consoleSources: consoleSources,
        findByRouteId: findByRouteId,
        sourceYaml: sourceYaml,
        formatTs: formatTs,
        formatDuration: formatDuration,
        formatNumber: formatNumber,
        formatMs: formatMs,
        stateBadge: stateBadge,
        statCard: statCard
    };
}());
