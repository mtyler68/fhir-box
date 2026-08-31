window.CadminCoreAdminBridgeDetail = (function () {
    const cab = function () { return CadminCoreAdminBridge; };

    let routeId = "";
    let snapshot = null;

    function esc(value) {
        return cab().esc(value);
    }

    function field(label, value) {
        return '<dt class="col-sm-3">' + esc(label) + '</dt><dd class="col-sm-9">' + value + "</dd>";
    }

    function propertyFields(properties) {
        const keys = Object.keys(properties || {}).filter(function (key) {
            return properties[key] != null && properties[key] !== "";
        });
        if (!keys.length) {
            return "";
        }
        return field("Properties", keys.map(function (key) {
            return '<div><span class="text-muted">' + esc(key) + ":</span> " +
                "<code>" + esc(String(properties[key])) + "</code></div>";
        }).join(""));
    }

    function destroy() {
        if (window.CadminCamelRouteGraph) {
            CadminCamelRouteGraph.destroy();
        }
        snapshot = null;
        routeId = "";
    }

    function titleText() {
        return (snapshot && snapshot.route && (snapshot.route.routeId || snapshot.route.id)) || routeId || "Route";
    }

    function stateOf() {
        const route = snapshot && snapshot.route;
        const detail = snapshot && snapshot.detail;
        return (route && route.state) || (detail && detail.status) || "";
    }

    function runAction(action, label) {
        if (!routeId) {
            return;
        }
        const proceed = action === "reset"
            ? CadminApi.confirm("Reset statistics for " + routeId + "?")
            : action === "stop" || action === "suspend"
                ? CadminApi.confirm(label + " route " + routeId + "?")
                : $.Deferred().resolve().promise();
        proceed.done(function () {
            CadminApi.coreAdminBridge(
                "/actuator/camelroutes/" + encodeURIComponent(routeId) + "/" + action,
                "POST"
            ).done(function () {
                CadminApi.showToast("success", label + " succeeded.");
                load(routeId);
            }).fail(function (xhr) {
                CadminApi.showToast("danger", cab().fail(label, xhr));
            });
        });
    }

    function bind() {
        const $root = $("#app-content");
        $root.off(".cabd");
        $root.on("click.cabd", "#cabd-refresh", function () {
            load(routeId);
        });
        $root.on("click.cabd", "#cabd-start", function () { runAction("start", "Start"); });
        $root.on("click.cabd", "#cabd-stop", function () { runAction("stop", "Stop"); });
        $root.on("click.cabd", "#cabd-suspend", function () { runAction("suspend", "Suspend"); });
        $root.on("click.cabd", "#cabd-resume", function () { runAction("resume", "Resume"); });
        $root.on("click.cabd", "#cabd-reset", function () { runAction("reset", "Reset statistics"); });
        $root.on("click.cabd", "#cabd-json", function () {
            CadminResourceSource.show(snapshot, " · " + titleText());
        });
    }

    function actionButtons(state) {
        const value = String(state || "").toLowerCase();
        const started = value === "started";
        const suspended = value === "suspended";
        const stopped = value === "stopped" || value === "stoppedforced";
        return '<button class="btn btn-outline-secondary" type="button" id="cabd-refresh">' +
                '<i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>' +
            (started || suspended
                ? '<button class="btn btn-outline-warning" type="button" id="cabd-stop">' +
                    '<i class="bi bi-stop-circle me-1"></i>Stop</button>'
                : "") +
            (started
                ? '<button class="btn btn-outline-secondary" type="button" id="cabd-suspend">' +
                    '<i class="bi bi-pause-circle me-1"></i>Suspend</button>'
                : "") +
            (suspended
                ? '<button class="btn btn-outline-primary" type="button" id="cabd-resume">' +
                    '<i class="bi bi-play-circle me-1"></i>Resume</button>'
                : "") +
            (stopped
                ? '<button class="btn btn-outline-primary" type="button" id="cabd-start">' +
                    '<i class="bi bi-play-circle me-1"></i>Start</button>'
                : "") +
            '<button class="btn btn-outline-secondary" type="button" id="cabd-reset">' +
                '<i class="bi bi-eraser me-1"></i>Reset stats</button>' +
            '<button class="btn btn-outline-primary" type="button" id="cabd-json">' +
                '<i class="bi bi-code-slash me-1"></i>JSON</button>';
    }

    function renderShell() {
        const $root = $("#app-content");
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<nav aria-label="breadcrumb">' +
                        '<ol class="breadcrumb mb-1">' +
                            '<li class="breadcrumb-item"><a href="#/core-admin-bridge">Core Admin Bridge</a></li>' +
                            '<li class="breadcrumb-item active" aria-current="page" id="cabd-crumb">Route</li>' +
                        "</ol>" +
                    "</nav>" +
                    '<h1 class="h3 mb-0 page-title" id="cabd-title">Camel route</h1>' +
                    '<p class="text-muted mb-0" id="cabd-subtitle"></p>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2" id="cabd-actions"></div>' +
            "</div>" +
            '<div id="cabd-alert" class="alert d-none"></div>' +
            '<div class="row" id="cabd-stats"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Summary</h6></div>' +
                '<div class="card-body" id="cabd-basics"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Processors</h6></div>' +
                '<div class="card-body">' +
                    '<div class="table-responsive">' +
                        '<table class="table table-hover align-middle mb-0">' +
                            "<thead><tr><th>ID</th><th>Processor</th><th>URI</th><th>State</th>" +
                            "<th>Exchanges</th><th>Failed</th><th>Mean</th></tr></thead>" +
                            '<tbody id="cabd-processors"></tbody>' +
                        "</table>" +
                    "</div>" +
                "</div>" +
            "</div>" +
            '<div class="row" id="cabd-source-row">' +
                '<div class="col-lg-6" id="cabd-source-col">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Source</h6></div>' +
                        '<div class="card-body" id="cabd-source"></div>' +
                    "</div>" +
                "</div>" +
                '<div class="col-lg-6" id="cabd-graph-col"></div>' +
            "</div>"
        );
    }

    function renderSummary() {
        const helper = cab();
        const route = (snapshot && snapshot.route) || {};
        const detail = (snapshot && snapshot.detail) || {};
        const properties = detail.properties || route.properties || {};
        const source = (snapshot && snapshot.source) || {};
        const state = stateOf();
        $("#cabd-title").text(titleText());
        $("#cabd-crumb").text(titleText());
        $("#cabd-subtitle").text(route.description || detail.description || "");
        $("#cabd-actions").html(actionButtons(state));
        const stats = route.statistics || detail.details || {};
        $("#cabd-basics").html(
            "<dl class=\"row mb-0\">" +
                field("Route ID", "<code>" + esc(route.routeId || detail.id || routeId) + "</code>") +
                field("State", helper.stateBadge(state)) +
                field("From", "<code>" + esc(route.from || "—") + "</code>") +
                field("Uptime", esc(route.uptime || detail.uptime || "—")) +
                field("Source", esc(route.source || source.source || "—")) +
                field("Coverage", esc(stats.coverage || "—")) +
                field("Remote", esc(route.remote === true ? "Yes" : route.remote === false ? "No" : "—")) +
                field("Last completed", esc(helper.formatTs(
                    stats.lastCompletedExchangeTimestamp ||
                    (detail.details && detail.details.lastExchangeCompletedTimestamp)))) +
                propertyFields(properties) +
            "</dl>"
        );
    }

    function renderStats() {
        const helper = cab();
        const route = (snapshot && snapshot.route) || {};
        const detail = ((snapshot && snapshot.detail) || {}).details || {};
        const stats = route.statistics || detail;
        $("#cabd-stats").html(
            helper.statCard("info", "Exchanges", helper.formatNumber(stats.exchangesTotal), "bi-arrow-left-right") +
            helper.statCard(stats.exchangesFailed ? "danger" : "success", "Failed",
                helper.formatNumber(stats.exchangesFailed != null ? stats.exchangesFailed : 0),
                "bi-exclamation-triangle") +
            helper.statCard("warning", "Inflight", helper.formatNumber(stats.exchangesInflight), "bi-hourglass-split") +
            helper.statCard("primary", "Mean time", helper.formatMs(stats.meanProcessingTime), "bi-stopwatch")
        );
    }

    function renderProcessors() {
        const helper = cab();
        const processors = (snapshot && snapshot.processors) || [];
        if (!processors.length) {
            $("#cabd-processors").html(helper.emptyRow(7, "No processor metrics reported for this route."));
            return;
        }
        $("#cabd-processors").html(processors.map(function (item) {
            const stats = item.statistics || {};
            let indent = "";
            let depth = item.level > 1 ? item.level - 1 : 0;
            while (depth > 0) {
                indent += "— ";
                depth -= 1;
            }
            indent = indent
                ? '<span class="text-muted">' + indent + "</span>"
                : "";
            return "<tr>" +
                "<td><code>" + esc(item.id || "—") + "</code></td>" +
                "<td>" + indent + esc(item.processor || "—") + "</td>" +
                "<td><code>" + esc(item.uri || "—") + "</code></td>" +
                "<td>" + helper.stateBadge(item.state) + "</td>" +
                "<td>" + esc(helper.formatNumber(stats.exchangesTotal)) + "</td>" +
                "<td>" + esc(helper.formatNumber(stats.exchangesFailed)) + "</td>" +
                "<td>" + esc(helper.formatMs(stats.meanProcessingTime)) + "</td>" +
            "</tr>";
        }).join(""));
    }

    function renderSource() {
        const helper = cab();
        const yaml = helper.sourceYaml(snapshot && snapshot.source);
        const sourceLabel = (snapshot && snapshot.source && snapshot.source.source) || "";
        if (!yaml) {
            $("#cabd-source").html(
                '<p class="text-muted mb-0">' +
                    (sourceLabel
                        ? "Source is referenced as <code>" + esc(sourceLabel) + "</code> but the console did not return YAML."
                        : "No YAML source is available from the Camel developer console.") +
                "</p>"
            );
            $("#cabd-graph-col").empty();
            $("#cabd-source-col").removeClass("col-lg-6").addClass("col-lg-12");
            if (window.CadminCamelRouteGraph) {
                CadminCamelRouteGraph.destroy();
            }
            return;
        }
        $("#cabd-source-col").removeClass("col-lg-12").addClass("col-lg-6");
        $("#cabd-source").html(
            (sourceLabel ? '<p class="small text-muted">' + esc(sourceLabel) + "</p>" : "") +
            '<pre class="mb-0 font-monospace small">' + esc(yaml) + "</pre>"
        );
        if (window.CadminCamelRouteGraph) {
            $("#cabd-graph-col").html(CadminCamelRouteGraph.card());
            CadminCamelRouteGraph.mount(function () { return yaml; });
        }
    }

    function missingHtml(xhr) {
        return '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            "<div>" +
                '<a class="small text-decoration-none" href="#/core-admin-bridge">' +
                    '<i class="bi bi-arrow-left me-1"></i>Core Admin Bridge</a>' +
                '<h1 class="h3 mb-0 page-title">Camel route</h1>' +
            "</div>" +
        "</div>" +
        '<div class="alert alert-danger">' + esc(cab().fail("Load route", xhr)) + "</div>";
    }

    function load(id) {
        if (window.CadminCamelRouteGraph) {
            CadminCamelRouteGraph.destroy();
        }
        routeId = id;
        const helper = cab();
        const $root = $("#app-content");
        $root.html('<div class="text-muted py-5 text-center">Loading…</div>');
        $.when(
            CadminApi.coreAdminBridge("/actuator/camelroutes/" + encodeURIComponent(id) + "/detail"),
            CadminApi.coreAdminBridge("/actuator/camel/routes"),
            CadminApi.coreAdminBridge("/actuator/camel/source"),
            CadminApi.coreAdminBridge("/actuator/camel/processor")
        ).done(function (detailXhr, routesXhr, sourceXhr, processorXhr) {
            const detail = detailXhr[0] || {};
            const route = helper.findByRouteId(helper.consoleRoutes(routesXhr[0]), id);
            if (!detail.id && !route) {
                $root.html(missingHtml({ status: 404 }));
                return;
            }
            snapshot = {
                detail: detail,
                route: route || { routeId: detail.id, description: detail.description, state: detail.status },
                source: helper.findByRouteId(helper.consoleSources(sourceXhr[0]), id),
                processors: helper.consoleProcessors(processorXhr[0]).filter(function (item) {
                    return String(item.routeId || "") === String(id);
                })
            };
            renderShell();
            renderSummary();
            renderStats();
            renderProcessors();
            renderSource();
            bind();
        }).fail(function (xhr) {
            $root.html(missingHtml(xhr));
        });
    }

    function render(id) {
        destroy();
        load(id);
    }

    return {
        render: render,
        destroy: destroy
    };
}());
