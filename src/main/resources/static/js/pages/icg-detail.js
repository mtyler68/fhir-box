window.CadminIcgDetail = (function () {
    let routeId = "";

    function esc(value) {
        return CadminIcg.esc(value);
    }

    function destroy() {
        routeId = "";
    }

    function codes(values) {
        if (!values || !values.length) {
            return "—";
        }
        return values.map(function (value) {
            return "<div><code>" + esc(value) + "</code></div>";
        }).join("");
    }

    function field(label, value) {
        return '<dt class="col-sm-3">' + esc(label) + '</dt><dd class="col-sm-9">' + value + "</dd>";
    }

    function tagTable(rows) {
        if (!rows || !rows.length) {
            return '<p class="text-muted mb-0">No traffic recorded yet.</p>';
        }
        return '<div class="table-responsive">' +
            '<table class="table table-sm align-middle mb-0">' +
                "<thead><tr><th>Value</th><th>Requests</th></tr></thead>" +
                "<tbody>" +
                rows.map(function (row) {
                    return "<tr><td><code>" + esc(row.name || "—") + "</code></td>" +
                        "<td>" + esc(CadminIcg.formatNumber(row.count)) + "</td></tr>";
                }).join("") +
                "</tbody></table></div>";
    }

    function render(id) {
        routeId = id;
        const $root = $("#app-content");
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/icg">' +
                        '<i class="bi bi-arrow-left me-1"></i>Integrator Connect Gateway</a>' +
                    '<h1 class="h3 mb-0 page-title">' + esc(id) + "</h1>" +
                "</div>" +
                '<button class="btn btn-outline-secondary" type="button" id="icgd-refresh">' +
                    '<i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>' +
            "</div>" +
            '<div id="icgd-alert" class="alert d-none"></div>' +
            '<div class="row" id="icgd-stats"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Live route</h6></div>' +
                '<div class="card-body" id="icgd-body"><p class="text-muted mb-0">Loading…</p></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Compiled route</h6></div>' +
                '<div class="card-body" id="icgd-compiled"><p class="text-muted mb-0">Loading…</p></div>' +
            "</div>" +
            '<div class="row" id="icgd-breakdown">' +
                '<div class="col-lg-4">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Methods</h6></div>' +
                        '<div class="card-body" id="icgd-methods"></div>' +
                    "</div>" +
                "</div>" +
                '<div class="col-lg-4">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Outcomes</h6></div>' +
                        '<div class="card-body" id="icgd-outcomes"></div>' +
                    "</div>" +
                "</div>" +
                '<div class="col-lg-4">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Statuses</h6></div>' +
                        '<div class="card-body" id="icgd-statuses"></div>' +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        $root.off(".icgd");
        $root.on("click.icgd", "#icgd-refresh", function () {
            load();
        });
        load();
    }

    function paint(detail) {
        const route = (detail && detail.route) || {};
        const metrics = (detail && detail.metrics) || CadminIcg.metricsOf(route);
        const libraryId = route.libraryId || "";
        $("#icgd-stats").html(
            CadminIcg.statCard("info", "Requests",
                CadminIcg.formatNumber(metrics.requests != null ? metrics.requests : 0),
                "bi-arrow-left-right") +
            CadminIcg.statCard(metrics.errors ? "danger" : "success", "Failed",
                CadminIcg.formatNumber(metrics.errors != null ? metrics.errors : 0),
                "bi-exclamation-triangle") +
            CadminIcg.statCard("warning", "Success rate", CadminIcg.successRate(metrics), "bi-check2-circle") +
            CadminIcg.statCard("primary", "Mean", CadminIcg.formatMs(metrics.meanMs), "bi-stopwatch")
        );
        $("#icgd-body").html(
            '<dl class="row mb-0">' +
                field("ID", "<code>" + esc(route.id || routeId) + "</code>") +
                field("URI", "<code>" + esc(route.uri || "—") + "</code>") +
                field("Order", esc(String(route.order == null ? 0 : route.order))) +
                field("Predicates", codes(route.predicates)) +
                field("Filters", codes(route.filters)) +
                field("Library", libraryId
                    ? CadminApi.resourceLink(CadminIcg.libraryHref(libraryId), libraryId)
                    : "—") +
                field("Client errors", esc(CadminIcg.formatNumber(
                    metrics.clientErrors != null ? metrics.clientErrors : 0))) +
                field("Max", esc(CadminIcg.formatMs(metrics.maxMs))) +
            "</dl>"
        );
        const compiledPredicate = detail && detail.compiledPredicate;
        const compiledFilters = (detail && detail.compiledFilters) || [];
        $("#icgd-compiled").html(
            compiledPredicate || compiledFilters.length
                ? '<dl class="row mb-0">' +
                    field("Predicate", compiledPredicate
                        ? "<code>" + esc(compiledPredicate) + "</code>"
                        : "—") +
                    field("Filters", codes(compiledFilters)) +
                "</dl>"
                : '<p class="text-muted mb-0">Compiled predicate and filters are not available for this route.</p>'
        );
        $("#icgd-methods").html(tagTable(detail && detail.methods));
        $("#icgd-outcomes").html(tagTable(detail && detail.outcomes));
        $("#icgd-statuses").html(tagTable(detail && detail.statuses));
    }

    function clearExtras(message) {
        $("#icgd-stats").empty();
        $("#icgd-compiled").html('<p class="text-muted mb-0">' + esc(message || "—") + "</p>");
        $("#icgd-methods, #icgd-outcomes, #icgd-statuses").html(
            '<p class="text-muted mb-0">No traffic recorded yet.</p>');
    }

    function load() {
        CadminApi.icg("/status/routes/" + encodeURIComponent(routeId)).done(function (detail) {
            CadminApi.showAlert("#icgd-alert");
            paint(detail);
        }).fail(function (xhr) {
            if (xhr && xhr.status === 404) {
                $("#icgd-body").html('<p class="text-muted mb-0">Route is not currently deployed.</p>');
                clearExtras("Route is not currently deployed.");
                CadminApi.showAlert("#icgd-alert", "warning",
                    "Route " + routeId + " is not in the live ICG snapshot.");
                return;
            }
            $("#icgd-body").html('<p class="text-danger mb-0">' +
                esc(CadminIcg.fail("Load ICG route", xhr)) + "</p>");
            clearExtras("Unable to load compiled route details.");
            CadminApi.showAlert("#icgd-alert", "danger", CadminIcg.fail("Load ICG route", xhr));
        });
    }

    return {
        render: render,
        destroy: destroy
    };
}());
