window.CadminIcg = (function () {
    const POLL_MS = 2000;
    const polls = {};
    const pollBusy = {};

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

    function clientHref(clientId) {
        return "#/icg/clients/" + encodeURIComponent(clientId || "");
    }

    function documentHref(documentId) {
        const id = String(documentId || "").replace(/^DocumentReference\//, "");
        return id ? "#/rate-limit-tiers/" + encodeURIComponent(id) : "#/rate-limit-plans";
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

    function formatWindow(window) {
        if (!window || window.limit == null) {
            return "—";
        }
        if (window.remaining == null) {
            return String(window.limit);
        }
        return window.remaining + " / " + window.limit;
    }

    function formatUsage(usage, name) {
        const window = usage && usage[name];
        return formatWindow(window);
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

    function stopPoll(name) {
        if (polls[name]) {
            window.clearInterval(polls[name]);
            delete polls[name];
        }
        delete pollBusy[name];
    }

    function startPoll(name, tick) {
        stopPoll(name);
        polls[name] = window.setInterval(function () {
            if (document.hidden || pollBusy[name]) {
                return;
            }
            const result = tick();
            if (result && typeof result.always === "function") {
                pollBusy[name] = true;
                result.always(function () {
                    pollBusy[name] = false;
                });
            }
        }, POLL_MS);
    }

    $(window).on("hashchange.icgPoll", function () {
        const path = (window.location.hash || "").replace(/^#\/?/, "").split("?")[0];
        const parts = path.split("/").filter(Boolean);
        if (parts[0] !== "icg") {
            stopPoll("list");
            stopPoll("client");
        }
    });

    return {
        POLL_MS: POLL_MS,
        esc: esc,
        fail: fail,
        routeHref: routeHref,
        clientHref: clientHref,
        documentHref: documentHref,
        libraryHref: libraryHref,
        matchesQuery: matchesQuery,
        emptyRow: emptyRow,
        formatDuration: formatDuration,
        formatNumber: formatNumber,
        formatMs: formatMs,
        formatPercent: formatPercent,
        formatWindow: formatWindow,
        formatUsage: formatUsage,
        successRate: successRate,
        metricsOf: metricsOf,
        statCard: statCard,
        findRoute: findRoute,
        startPoll: startPoll,
        stopPoll: stopPoll
    };
}());
