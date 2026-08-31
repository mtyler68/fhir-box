CadminApp.register("core-admin-bridge", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminCoreAdminBridgeDetail.render(token);
        return;
    }
    if (window.CadminCoreAdminBridgeDetail) {
        CadminCoreAdminBridgeDetail.destroy();
    }
    renderCoreAdminBridge();
});

function renderCoreAdminBridge() {
    const cab = CadminCoreAdminBridge;
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            "<div>" +
                '<h1 class="h3 mb-1 page-title">Core Admin Bridge</h1>' +
                '<p class="text-muted mb-0">Live Camel engine stats and routes from the actuator and developer console.</p>' +
            "</div>" +
            '<button class="btn btn-outline-secondary" type="button" id="cab-refresh">' +
                '<i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>' +
        "</div>" +
        '<div id="cab-alert" class="alert d-none"></div>' +
        '<div class="row" id="cab-stats"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3"><h6 class="m-0">Camel context</h6></div>' +
            '<div class="card-body" id="cab-context">' +
                '<p class="text-muted mb-0">Loading…</p>' +
            "</div>" +
        "</div>" +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Routes</h6>' +
                '<form class="d-flex" id="cab-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="cab-query" placeholder="Route, URI, or description">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Route</th><th>From</th><th>State</th><th>Uptime</th>" +
                        "<th>Exchanges</th><th>Failed</th><th>Mean</th><th></th></tr></thead>" +
                        '<tbody id="cab-rows">' + cab.emptyRow(8, "Loading…") + "</tbody>" +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="cab-pager"></div>' +
            "</div>" +
        "</div>"
    );

    let listPage = 0;
    let query = "";
    let routes = [];

    function contextOf(info, consoleCtx) {
        const camel = (consoleCtx && consoleCtx.context) || consoleCtx || {};
        const stats = camel.statistics || {};
        return {
            appName: (info && info.app && info.app.name) || "Core Admin Bridge",
            acronym: (info && info.app && info.app.acronym) || "CAB",
            description: (info && info.app && info.app.description) || "",
            name: camel.name || (info && info["camel.name"]) || "—",
            version: camel.version || (info && info["camel.version"]) || "—",
            state: camel.state || (info && info["camel.status"]) || "—",
            uptime: (info && info["camel.uptime"]) || cab.formatDuration(camel.uptime),
            jvm: info && info.java && info.java.runtime
                ? (info.java.runtime.name || "") + " " + (info.java.runtime.version || "")
                : "",
            stats: stats
        };
    }

    function renderStats(ctx, health) {
        const stats = ctx.stats || {};
        const healthUp = health && (health.up === true || health.status === "UP");
        const statusLabel = ctx.state + (healthUp ? " · healthy" : "");
        $("#cab-stats").html(
            cab.statCard("success", "Status", statusLabel || "—", "bi-activity") +
            cab.statCard("primary", "Routes",
                cab.formatNumber(stats.routesStarted) + " / " + cab.formatNumber(stats.routesTotal),
                "bi-signpost-split") +
            cab.statCard("info", "Exchanges", cab.formatNumber(stats.exchangesTotal), "bi-arrow-left-right") +
            cab.statCard(stats.exchangesFailed ? "danger" : "warning", "Failed",
                cab.formatNumber(stats.exchangesFailed), "bi-exclamation-triangle")
        );
    }

    function renderContext(ctx, health) {
        const stats = ctx.stats || {};
        const healthUp = health && (health.up === true || health.status === "UP");
        $("#cab-context").html(
            "<dl class=\"row mb-0\">" +
                '<dt class="col-sm-3">Application</dt><dd class="col-sm-9">' +
                    cab.esc(ctx.appName) +
                    (ctx.acronym ? ' <span class="badge text-bg-secondary">' + cab.esc(ctx.acronym) + "</span>" : "") +
                "</dd>" +
                (ctx.description
                    ? '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' + cab.esc(ctx.description) + "</dd>"
                    : "") +
                '<dt class="col-sm-3">Camel context</dt><dd class="col-sm-9"><code>' + cab.esc(ctx.name) + "</code></dd>" +
                '<dt class="col-sm-3">Camel version</dt><dd class="col-sm-9">' + cab.esc(ctx.version) + "</dd>" +
                '<dt class="col-sm-3">State</dt><dd class="col-sm-9">' + cab.stateBadge(ctx.state) + "</dd>" +
                '<dt class="col-sm-3">Health</dt><dd class="col-sm-9">' +
                    (healthUp
                        ? '<span class="badge text-bg-success">Up</span>'
                        : '<span class="badge text-bg-danger">Down</span>') +
                "</dd>" +
                '<dt class="col-sm-3">Uptime</dt><dd class="col-sm-9">' + cab.esc(ctx.uptime || "—") + "</dd>" +
                '<dt class="col-sm-3">Inflight</dt><dd class="col-sm-9">' +
                    cab.esc(cab.formatNumber(stats.exchangesInflight)) + "</dd>" +
                '<dt class="col-sm-3">Mean processing</dt><dd class="col-sm-9">' +
                    cab.esc(cab.formatMs(stats.meanProcessingTime)) + "</dd>" +
                (ctx.jvm
                    ? '<dt class="col-sm-3">JVM</dt><dd class="col-sm-9">' + cab.esc(ctx.jvm) + "</dd>"
                    : "") +
            "</dl>"
        );
    }

    function paintRows() {
        const pageSize = CadminApi.listPageSize("core-admin-bridge");
        const filtered = query
            ? routes.filter(function (route) {
                return cab.matchesQuery([
                    route.routeId,
                    route.description,
                    route.from,
                    route.state,
                    route.source
                ].join(" "), query);
            })
            : routes.slice();
        const page = query ? 0 : listPage;
        const start = page * pageSize;
        const slice = query ? filtered : filtered.slice(start, start + pageSize);
        CadminApi.renderPager("#cab-pager", {
            page: page,
            size: pageSize,
            pageSizeKey: "core-admin-bridge",
            returned: slice.length,
            total: filtered.length,
            onPage: function (nextPage) {
                listPage = nextPage;
                paintRows();
            }
        });
        if (!slice.length) {
            $("#cab-rows").html(cab.emptyRow(8, query ? "No routes match this search." : "No Camel routes found."));
            return;
        }
        $("#cab-rows").html(slice.map(function (route) {
            const id = route.routeId || route.id || "";
            const href = id ? cab.routeHref(id) : "#/core-admin-bridge";
            const stats = route.statistics || {};
            return "<tr>" +
                "<td>" + (id
                    ? CadminApi.resourceLink(href, id)
                    : cab.esc("Untitled")) +
                    (route.description
                        ? '<div class="small text-muted">' + cab.esc(route.description) + "</div>"
                        : "") +
                "</td>" +
                "<td><code>" + cab.esc(route.from || "—") + "</code></td>" +
                "<td>" + cab.stateBadge(route.state) + "</td>" +
                "<td>" + cab.esc(route.uptime || "—") + "</td>" +
                "<td>" + cab.esc(cab.formatNumber(stats.exchangesTotal)) + "</td>" +
                "<td>" + cab.esc(cab.formatNumber(stats.exchangesFailed)) + "</td>" +
                "<td>" + cab.esc(cab.formatMs(stats.meanProcessingTime)) + "</td>" +
                '<td class="text-end text-nowrap">' +
                    '<a class="btn btn-sm btn-outline-primary" href="' + cab.esc(href) +
                        '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                "</td></tr>";
        }).join(""));
    }

    function load() {
        $("#cab-rows").html(cab.emptyRow(8, "Loading…"));
        $.when(
            CadminApi.coreAdminBridge("/actuator/info"),
            CadminApi.coreAdminBridge("/actuator/camel/context"),
            CadminApi.coreAdminBridge("/actuator/camel/health"),
            CadminApi.coreAdminBridge("/actuator/camel/routes")
        ).done(function (infoXhr, ctxXhr, healthXhr, routesXhr) {
            const info = infoXhr[0] || {};
            const consoleCtx = cab.payload(ctxXhr[0], "context");
            const health = cab.payload(healthXhr[0], "health");
            const ctx = contextOf(info, consoleCtx);
            routes = cab.consoleRoutes(routesXhr[0]);
            renderStats(ctx, health);
            renderContext(ctx, health);
            paintRows();
        }).fail(function (xhr) {
            $("#cab-stats").empty();
            $("#cab-pager").empty();
            $("#cab-context").html('<p class="text-danger mb-0">' + cab.esc(cab.fail("Load Camel context", xhr)) + "</p>");
            $("#cab-rows").html(cab.emptyRow(8, "Unable to load routes from Core Admin Bridge."));
            CadminApi.showAlert("#cab-alert", "danger", cab.fail("Load Core Admin Bridge", xhr));
        });
    }

    $root.off(".cab");
    $root.on("submit.cab", "#cab-search-form", function (event) {
        event.preventDefault();
        query = $("#cab-query").val();
        listPage = 0;
        paintRows();
    });
    $root.on("click.cab", "#cab-refresh", function () {
        load();
    });

    load();
}
