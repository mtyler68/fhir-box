window.CadminIcg = (function () {
    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function fail(action, xhr) {
        const status = xhr && xhr.status ? xhr.status : "error";
        return action + " failed (" + status + "). Is Integrator Connect Gateway running on port 8480?";
    }

    function routeHref(id) {
        return "#/icg/" + encodeURIComponent(id || "");
    }

    function libraryHref(libraryId) {
        const id = String(libraryId || "").replace(/^Library\//, "");
        return id ? "#/icg-routes/" + encodeURIComponent(id) : "#/icg-routes";
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

    function formatDuration(seconds) {
        if (seconds == null || seconds < 0) {
            return "—";
        }
        return formatDurationMs(seconds * 1000);
    }

    function formatDurationMs(ms) {
        if (ms == null || ms < 0) {
            return "—";
        }
        if (ms < 1000) {
            return ms + " ms";
        }
        const totalSeconds = Math.floor(ms / 1000);
        if (totalSeconds < 60) {
            return totalSeconds + "s";
        }
        const minutes = Math.floor(totalSeconds / 60);
        const rem = totalSeconds % 60;
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

    function formatPercent(part, total) {
        if (total == null || total <= 0 || part == null || part < 0) {
            return "—";
        }
        return (Math.round((part / total) * 1000) / 10) + "%";
    }

    function successRate(metrics) {
        const requests = metrics && metrics.requests;
        const errors = metrics && metrics.errors;
        if (requests == null || requests <= 0) {
            return "—";
        }
        return formatPercent(requests - (errors || 0), requests);
    }

    function metricsOf(route) {
        return (route && route.metrics) || {};
    }

    function statCard(kind, label, value, icon) {
        return '<div class="col-xl-3 col-md-6 mb-4">' +
            '<div class="card border-left-' + kind + ' shadow h-100 py-2">' +
                '<div class="card-body">' +
                    '<div class="row no-gutters align-items-center">' +
                        '<div class="col mr-2">' +
                            '<div class="text-xs font-weight-bold text-' + kind + ' text-uppercase mb-1">' +
                                esc(label) + "</div>" +
                            '<div class="h5 mb-0 font-weight-bold">' + esc(value) + "</div>" +
                        "</div>" +
                        '<div class="col-auto"><i class="bi ' + icon + ' fs-2 text-muted"></i></div>' +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function findRoute(status, id) {
        const wanted = String(id || "");
        return ((status && status.routes) || []).find(function (route) {
            return String(route.id || "") === wanted;
        }) || null;
    }

    return {
        esc: esc,
        fail: fail,
        routeHref: routeHref,
        libraryHref: libraryHref,
        matchesQuery: matchesQuery,
        emptyRow: emptyRow,
        formatDuration: formatDuration,
        formatNumber: formatNumber,
        formatMs: formatMs,
        formatPercent: formatPercent,
        successRate: successRate,
        metricsOf: metricsOf,
        statCard: statCard,
        findRoute: findRoute
    };
}());
