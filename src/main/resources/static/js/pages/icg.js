CadminApp.register("icg", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminIcgDetail.render(token);
        return;
    }
    if (window.CadminIcgDetail) {
        CadminIcgDetail.destroy();
    }
    renderIcg();
});

function renderIcg() {
    const icg = CadminIcg;
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            "<div>" +
                '<h1 class="h3 mb-1 page-title">Integrator Connect Gateway</h1>' +
                '<p class="text-muted mb-0">Live Spring Cloud Gateway routes deployed from <code>icg-route</code> libraries.</p>' +
            "</div>" +
            '<div class="d-flex flex-wrap gap-2">' +
                '<a class="btn btn-outline-primary" href="#/icg-routes">' +
                    '<iconify-icon icon="mdi:routes" aria-hidden="true"></iconify-icon> Manage libraries</a>' +
                '<button class="btn btn-outline-secondary" type="button" id="icg-refresh">' +
                    '<i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>' +
            "</div>" +
        "</div>" +
        '<div id="icg-alert" class="alert d-none"></div>' +
        '<div class="row" id="icg-stats"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3"><h6 class="m-0">Gateway</h6></div>' +
            '<div class="card-body" id="icg-context">' +
                '<p class="text-muted mb-0">Loading…</p>' +
            "</div>" +
        "</div>" +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Deployed routes</h6>' +
                '<form class="d-flex" id="icg-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="icg-query" placeholder="Route, URI, or library">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Route</th><th>URI</th><th>Requests</th><th>Errors</th>" +
                        "<th>Mean</th><th>Max</th><th>Library</th><th></th></tr></thead>" +
                        '<tbody id="icg-rows">' + icg.emptyRow(8, "Loading…") + "</tbody>" +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="icg-pager"></div>' +
            "</div>" +
        "</div>"
    );

    let listPage = 0;
    let query = "";
    let routes = [];

    function renderStats(body, health) {
        const healthUp = health && (health.status === "UP" || health.up === true);
        const totals = (body && body.totals) || {};
        $("#icg-stats").html(
            icg.statCard(healthUp ? "success" : "danger", "Status", healthUp ? "Up" : "Down", "bi-activity") +
            icg.statCard("info", "Requests", icg.formatNumber(totals.requests != null ? totals.requests : 0),
                "bi-arrow-left-right") +
            icg.statCard(totals.errors ? "danger" : "success", "Failed",
                icg.formatNumber(totals.errors != null ? totals.errors : 0),
                "bi-exclamation-triangle") +
            icg.statCard("primary", "Mean", icg.formatMs(totals.meanMs), "bi-stopwatch")
        );
    }

    function renderContext(body, info, health) {
        const app = (body && body.app) || {};
        const infoApp = (info && info.app) || {};
        const totals = (body && body.totals) || {};
        const healthUp = health && (health.status === "UP" || health.up === true);
        const infoJvm = info && info.java && info.java.runtime
            ? (info.java.runtime.name || "") + " " + (info.java.runtime.version || "")
            : "";
        $("#icg-context").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Application</dt><dd class="col-sm-9">' +
                    icg.esc(app.name || infoApp.name || "Integrator Connect Gateway") +
                    ' <span class="badge text-bg-secondary">' +
                        icg.esc(app.acronym || infoApp.acronym || "ICG") + "</span>" +
                "</dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' +
                    icg.esc(app.description || infoApp.description || "—") + "</dd>" +
                '<dt class="col-sm-3">Health</dt><dd class="col-sm-9">' +
                    (healthUp
                        ? '<span class="badge text-bg-success">Up</span>'
                        : '<span class="badge text-bg-danger">Down</span>') +
                "</dd>" +
                '<dt class="col-sm-3">Uptime</dt><dd class="col-sm-9">' +
                    icg.esc(icg.formatDuration(totals.uptimeSeconds)) + "</dd>" +
                '<dt class="col-sm-3">Libraries</dt><dd class="col-sm-9">' +
                    icg.esc(String(((body && body.libraries) || []).length)) + "</dd>" +
                '<dt class="col-sm-3">Routes</dt><dd class="col-sm-9">' +
                    icg.esc(String(((body && body.routes) || []).length)) + "</dd>" +
                (infoJvm
                    ? '<dt class="col-sm-3">JVM</dt><dd class="col-sm-9">' + icg.esc(infoJvm) + "</dd>"
                    : "") +
            "</dl>"
        );
    }

    function paintRows() {
        const pageSize = CadminApi.listPageSize("icg");
        const filtered = query
            ? routes.filter(function (route) {
                return icg.matchesQuery([
                    route.id,
                    route.uri,
                    (route.predicates || []).join(" "),
                    (route.filters || []).join(" "),
                    route.libraryId
                ].join(" "), query);
            })
            : routes.slice();
        const page = query ? 0 : listPage;
        const start = page * pageSize;
        const slice = query ? filtered : filtered.slice(start, start + pageSize);
        CadminApi.renderPager("#icg-pager", {
            page: page,
            size: pageSize,
            pageSizeKey: "icg",
            returned: slice.length,
            total: filtered.length,
            onPage: function (nextPage) {
                listPage = nextPage;
                paintRows();
            }
        });
        if (!slice.length) {
            $("#icg-rows").html(icg.emptyRow(8, query
                ? "No routes match this search."
                : "No ICG routes deployed. Activate an icg-route library."));
            return;
        }
        $("#icg-rows").html(slice.map(function (route) {
            const id = route.id || "";
            const href = id ? icg.routeHref(id) : "#/icg";
            const libraryId = route.libraryId || "";
            const stats = icg.metricsOf(route);
            return "<tr>" +
                "<td>" + (id ? CadminApi.resourceLink(href, id) : icg.esc("Untitled")) + "</td>" +
                "<td><code>" + icg.esc(route.uri || "—") + "</code></td>" +
                "<td>" + icg.esc(icg.formatNumber(stats.requests != null ? stats.requests : 0)) + "</td>" +
                "<td>" + icg.esc(icg.formatNumber(stats.errors != null ? stats.errors : 0)) + "</td>" +
                "<td>" + icg.esc(icg.formatMs(stats.meanMs)) + "</td>" +
                "<td>" + icg.esc(icg.formatMs(stats.maxMs)) + "</td>" +
                "<td>" + (libraryId
                    ? CadminApi.resourceLink(icg.libraryHref(libraryId), libraryId)
                    : icg.esc("—")) + "</td>" +
                '<td class="text-end text-nowrap">' +
                    '<a class="btn btn-sm btn-outline-primary" href="' + icg.esc(href) +
                        '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                "</td></tr>";
        }).join(""));
    }

    function load() {
        $("#icg-rows").html(icg.emptyRow(8, "Loading…"));
        $.when(
            CadminApi.icg("/status"),
            CadminApi.icg("/actuator/info"),
            CadminApi.icg("/actuator/health")
        ).done(function (statusXhr, infoXhr, healthXhr) {
            const status = statusXhr[0] || {};
            const info = infoXhr[0] || {};
            const health = healthXhr[0] || {};
            routes = status.routes || [];
            renderStats(status, health);
            renderContext(status, info, health);
            paintRows();
        }).fail(function (xhr) {
            $("#icg-stats").empty();
            $("#icg-pager").empty();
            $("#icg-context").html('<p class="text-danger mb-0">' + icg.esc(icg.fail("Load ICG status", xhr)) + "</p>");
            $("#icg-rows").html(icg.emptyRow(8, "Unable to load routes from Integrator Connect Gateway."));
            CadminApi.showAlert("#icg-alert", "danger", icg.fail("Load Integrator Connect Gateway", xhr));
        });
    }

    $root.off(".icg");
    $root.on("submit.icg", "#icg-search-form", function (event) {
        event.preventDefault();
        query = $("#icg-query").val();
        listPage = 0;
        paintRows();
    });
    $root.on("click.icg", "#icg-refresh", function () {
        load();
    });

    load();
}
