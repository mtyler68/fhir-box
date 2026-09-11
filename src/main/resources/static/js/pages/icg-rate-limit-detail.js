window.CadminIcgRateLimitDetail = (function () {
    let clientId = "";
    let painted = false;

    function esc(value) {
        return CadminIcg.esc(value);
    }

    function destroy() {
        CadminIcg.stopPoll("client");
        clientId = "";
        painted = false;
    }

    function field(label, value) {
        return '<dt class="col-sm-3">' + esc(label) + '</dt><dd class="col-sm-9">' + value + "</dd>";
    }

    function usageBadge(usage) {
        if (!usage) {
            return "";
        }
        if (usage.unavailable) {
            return ' <span class="badge text-bg-danger">Store unavailable</span>';
        }
        if (usage.unused) {
            return ' <span class="badge text-bg-secondary">Unused</span>';
        }
        return "";
    }

    function routeLinks(routes) {
        if (!routes || !routes.length) {
            return "—";
        }
        return routes.map(function (id) {
            return CadminApi.resourceLink(CadminIcg.routeHref(id), id);
        }).join("<br>");
    }

    function usageCells(usage) {
        return "<td>" + esc(CadminIcg.formatUsage(usage, "requestsPerSecond")) + "</td>" +
            "<td>" + esc(CadminIcg.formatUsage(usage, "requestsPerMinute")) + "</td>" +
            "<td>" + esc(CadminIcg.formatUsage(usage, "requestsPerDay")) + "</td>";
    }

    function render(id) {
        clientId = id;
        painted = false;
        const $root = $("#app-content");
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/icg">' +
                        '<i class="bi bi-arrow-left me-1"></i>Integrator Connect Gateway</a>' +
                    '<h1 class="h3 mb-0 page-title">' + esc(id) + "</h1>" +
                    '<p class="text-muted mb-0">Live rate-limit remaining for this OIDC client. Updates every 2 seconds.</p>' +
                "</div>" +
                '<button class="btn btn-outline-secondary" type="button" id="icgrl-refresh">' +
                    '<i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>' +
            "</div>" +
            '<div id="icgrl-alert" class="alert d-none"></div>' +
            '<div class="row" id="icgrl-stats"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Cached policy</h6></div>' +
                '<div class="card-body" id="icgrl-body"><p class="text-muted mb-0">Loading…</p></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Buckets</h6></div>' +
                '<div class="card-body" id="icgrl-buckets"><p class="text-muted mb-0">Loading…</p></div>' +
            "</div>"
        );
        $root.off(".icgrl");
        $root.on("click.icgrl", "#icgrl-refresh", function () {
            load();
        });
        load();
        CadminIcg.startPoll("client", function () {
            return load({ silent: true });
        });
    }

    function paint(detail) {
        const defaults = (detail && detail.defaults) || {};
        const buckets = (detail && detail.buckets) || [];
        const documentId = detail.documentId || "";
        $("#icgrl-stats").html(
            CadminIcg.statCard("primary", "Tier", detail.tier || "—", "bi-speedometer2") +
            CadminIcg.statCard("info", "Version", detail.policyVersion || "—", "bi-hash") +
            CadminIcg.statCard("success", "Buckets",
                CadminIcg.formatNumber(buckets.length), "bi-collection") +
            CadminIcg.statCard("warning", "Default /min",
                CadminIcg.formatNumber(defaults.requestsPerMinute), "bi-clock")
        );
        $("#icgrl-body").html(
            '<dl class="row mb-0">' +
                field("Client", "<code>" + esc(detail.clientId || clientId) + "</code>") +
                field("Tier", esc(detail.tier || "—")) +
                field("Policy version", "<code>" + esc(detail.policyVersion || "—") + "</code>") +
                field("Document", documentId
                    ? CadminApi.resourceLink(CadminIcg.documentHref(documentId), documentId)
                    : "—") +
                field("Default /s", esc(CadminIcg.formatNumber(defaults.requestsPerSecond))) +
                field("Default /min", esc(CadminIcg.formatNumber(defaults.requestsPerMinute))) +
                field("Default /day", esc(CadminIcg.formatNumber(defaults.requestsPerDay))) +
            "</dl>"
        );
        if (!buckets.length) {
            $("#icgrl-buckets").html('<p class="text-muted mb-0">This policy has no group, dedicated, or unlisted route buckets.</p>');
            return;
        }
        $("#icgrl-buckets").html(
            '<div class="table-responsive">' +
                '<table class="table table-hover align-middle mb-0">' +
                    "<thead><tr><th>Bucket</th><th>Kind</th><th>Routes</th><th>/s</th><th>/min</th><th>/day</th></tr></thead>" +
                    "<tbody>" +
                    buckets.map(function (bucket) {
                        const id = bucket.id || "";
                        const kind = bucket.kind || "endpoint";
                        return "<tr>" +
                            "<td><code>" + esc(id) + "</code>" + usageBadge(bucket.usage) + "</td>" +
                            "<td>" + esc(kind) + "</td>" +
                            "<td>" + routeLinks(bucket.routes) + "</td>" +
                            usageCells(bucket.usage) +
                            "</tr>";
                    }).join("") +
                    "</tbody></table></div>"
        );
    }

    function load(options) {
        const silent = !!(options && options.silent);
        if (!clientId) {
            return $.Deferred().reject().promise();
        }
        return CadminApi.icg("/status/rate-limits/" + encodeURIComponent(clientId)).done(function (detail) {
            painted = true;
            CadminApi.showAlert("#icgrl-alert");
            paint(detail);
        }).fail(function (xhr) {
            if (xhr && xhr.status === 404) {
                painted = false;
                $("#icgrl-stats").empty();
                $("#icgrl-body").html('<p class="text-muted mb-0">No current rate-limit policy is cached for this client.</p>');
                $("#icgrl-buckets").html('<p class="text-muted mb-0">Assign a current rate-limit tier, then wait for ICG to poll FHIR.</p>');
                CadminApi.showAlert("#icgrl-alert", "warning",
                    "OIDC client " + clientId + " is not in the live ICG rate-limit cache.");
                return;
            }
            if (silent && painted) {
                return;
            }
            $("#icgrl-stats").empty();
            $("#icgrl-body").html('<p class="text-danger mb-0">' +
                esc(CadminIcg.fail("Load rate-limit client", xhr)) + "</p>");
            $("#icgrl-buckets").html('<p class="text-muted mb-0">Unable to load remaining tokens.</p>');
            CadminApi.showAlert("#icgrl-alert", "danger", CadminIcg.fail("Load rate-limit client", xhr));
        });
    }

    return {
        render: render,
        destroy: destroy
    };
}());
