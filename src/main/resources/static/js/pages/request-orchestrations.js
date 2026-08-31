CadminApp.register("request-orchestrations", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("request-orchestrations", token, function (resource) {
            CadminRequestOrchestrationDetail.render(resource);
        }, function () {
            renderRequestOrchestrationList();
        });
        return;
    }
    renderRequestOrchestrationList();
});

function renderRequestOrchestrationList() {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Request orchestrations</h1>' +
            '<a class="btn btn-primary" href="#/plan-apply">' +
                '<i class="bi bi-play-circle me-1"></i>Apply plan</a>' +
        "</div>" +
        '<div id="orch-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Orchestration search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<form class="d-flex flex-wrap gap-2" id="orch-search-form">' +
                        '<select class="form-select form-select-sm" id="orch-status-filter" style="max-width:10rem">' +
                            '<option value="">Any status</option>' +
                            CadminWorkflow.optionsHtml(CadminWorkflow.request, "") +
                        "</select>" +
                        '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                    "</form>" +
                    CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Status</th><th>Plan</th><th>Subject</th><th>Based on</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="orch-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="orch-pager"></div>' +
            "</div>" +
        "</div>"
    );

    let listPage = 0;

    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/RequestOrchestration?_sort=-_lastUpdated";
        const status = $("#orch-status-filter").val();
        if (status) {
            path += "&status=" + encodeURIComponent(status);
        }
        const pageSize = CadminApi.listPageSize("request-orchestrations");
        CadminDeletedList.query({ type: "RequestOrchestration", path: path, page: listPage, size: pageSize })
            .done(function (bundle) {
                const entries = CadminApi.bundleResources(bundle, "RequestOrchestration");
                CadminApi.renderPager("#orch-pager", {
                    page: listPage, size: pageSize, pageSizeKey: "request-orchestrations",
                    returned: entries.length, total: bundle.total, bundle: bundle,
                    onPage: function (next) { load(next); }
                });
                if (!entries.length) {
                    $("#orch-rows").html(CadminDeletedList.emptyRow(6, "RequestOrchestration",
                        "No orchestrations yet. Apply a plan from an appointment or the apply wizard."));
                    return;
                }
                $("#orch-rows").html(entries.map(function (item) {
                    const href = CadminApi.detailHref("RequestOrchestration", item.id);
                    const plan = ((item.instantiatesCanonical || [])[0] || "").split("/").pop();
                    const based = ((item.basedOn || [])[0] || {}).reference || "—";
                    return "<tr>" +
                        "<td>" + CadminWorkflow.requestBadge(item.status) + "</td>" +
                        "<td>" + CadminApi.escapeHtml(plan || "—") + "</td>" +
                        "<td>" + CadminScheduling.refHtml(item.subject) + "</td>" +
                        "<td>" + CadminApi.escapeHtml(based) + "</td>" +
                        "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
                        '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                            '" title="Open"><i class="bi bi-eye"></i></a></td></tr>';
                }).join(""));
            }).fail(function (xhr) {
                $("#orch-pager").empty();
                $("#orch-rows").html('<tr><td colspan="6" class="text-danger">Unable to load orchestrations from /fhir.</td></tr>');
                CadminApi.showAlert("#orch-alert", "danger",
                    "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
            });
    }

    $("#orch-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });
    CadminDeletedList.bind({ type: "RequestOrchestration", reload: function () { load(0); } });
    load(0);
}
