CadminApp.register("plan-definitions", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("plan-definitions", token, function (resource) {
            CadminPlanDefinitionDetail.render(resource);
        }, function () {
            renderPlanDefinitionList();
        });
        return;
    }
    renderPlanDefinitionList();
});

function renderPlanDefinitionList() {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Plan definitions</h1>' +
            '<div class="d-flex flex-wrap gap-2">' +
                '<a class="btn btn-outline-primary" href="#/plan-apply">' +
                    '<i class="bi bi-play-circle me-1"></i>Apply plan</a>' +
                CadminResourceDocument.splitButton({
                    label: "New plan",
                    modalTarget: "#create-plan-modal",
                    resourceType: "PlanDefinition"
                }) +
            "</div>" +
        "</div>" +
        '<div id="plan-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Plan search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<form class="d-flex flex-wrap gap-2" id="plan-search-form">' +
                        '<input class="form-control form-control-sm" id="plan-query" placeholder="Title or name" style="max-width:16rem">' +
                        '<select class="form-select form-select-sm" id="plan-status-filter" style="max-width:10rem">' +
                            '<option value="">Any status</option>' +
                            CadminWorkflow.optionsHtml(CadminWorkflow.publication, "") +
                        "</select>" +
                        '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                    "</form>" +
                    CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Title</th><th>Status</th><th>Actions</th><th>URL</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="plan-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="plan-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-plan-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-plan-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create plan</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Title</label>' +
                            '<input class="form-control" id="pl-title" required></div>' +
                        '<div class="mb-3"><label class="form-label">Name</label>' +
                            '<input class="form-control font-monospace" id="pl-name" placeholder="intakePlan"></div>' +
                        '<div class="mb-3"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="pl-status">' +
                                CadminWorkflow.optionsHtml(CadminWorkflow.publication, "active") +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label">URL</label>' +
                            '<input class="form-control font-monospace" id="pl-url" placeholder="https://cadmin.io/fhir/PlanDefinition/"></div>' +
                        '<div class="mb-0"><label class="form-label">Description</label>' +
                            '<textarea class="form-control" id="pl-description" rows="2"></textarea></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>"
    );

    let listPage = 0;

    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/PlanDefinition?_sort=-_lastUpdated";
        const query = $("#plan-query").val().trim();
        const status = $("#plan-status-filter").val();
        if (query) {
            path += (/^[a-z][a-z0-9+.-]*:/i.test(query) ? "&url=" : "&title:contains=")
                + encodeURIComponent(query);
        }
        if (status) {
            path += "&status=" + encodeURIComponent(status);
        }
        const pageSize = CadminApi.listPageSize("plan-definitions");
        CadminDeletedList.query({ type: "PlanDefinition", path: path, page: listPage, size: pageSize })
            .done(function (bundle) {
                const entries = CadminApi.bundleResources(bundle, "PlanDefinition");
                CadminApi.renderPager("#plan-pager", {
                    page: listPage, size: pageSize, pageSizeKey: "plan-definitions",
                    returned: entries.length, total: bundle.total, bundle: bundle,
                    onPage: function (next) { load(next); }
                });
                if (!entries.length) {
                    $("#plan-rows").html(CadminDeletedList.emptyRow(6, "PlanDefinition",
                        "No plans found. Seeded plans appear after FHIR Chief starts."));
                    return;
                }
                $("#plan-rows").html(entries.map(function (item) {
                    const href = CadminApi.detailHref("PlanDefinition", item.id);
                    return "<tr>" +
                        "<td>" + CadminApi.resourceLink(href, item.title || item.name || item.id) + "</td>" +
                        "<td>" + CadminWorkflow.publicationBadge(item.status) + "</td>" +
                        "<td>" + ((item.action || []).length) + "</td>" +
                        "<td><code class=\"small\">" + CadminApi.escapeHtml(item.url || "—") + "</code></td>" +
                        "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
                        '<td class="text-end text-nowrap">' +
                            '<a class="btn btn-sm btn-outline-primary" href="#/plan-apply/' +
                                encodeURIComponent(item.id) + '" title="Apply">' +
                                '<i class="bi bi-play-circle"></i></a> ' +
                            '<a class="btn btn-sm btn-outline-primary" href="' + href +
                                '" title="Open"><i class="bi bi-eye"></i></a></td></tr>';
                }).join(""));
            }).fail(function (xhr) {
                $("#plan-pager").empty();
                $("#plan-rows").html('<tr><td colspan="6" class="text-danger">Unable to load plans from /fhir.</td></tr>');
                CadminApi.showAlert("#plan-alert", "danger",
                    "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
            });
    }

    $("#plan-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });
    $("#create-plan-form").on("submit", function (event) {
        event.preventDefault();
        const resource = {
            resourceType: "PlanDefinition",
            title: $("#pl-title").val().trim(),
            status: $("#pl-status").val() || "active"
        };
        const name = $("#pl-name").val().trim();
        const url = $("#pl-url").val().trim();
        const description = $("#pl-description").val().trim();
        if (name) {
            resource.name = name;
        }
        if (url) {
            resource.url = url;
        }
        if (description) {
            resource.description = description;
        }
        CadminApi.fhir("/PlanDefinition", "POST", resource).done(function (created, _status, xhr) {
            const id = CadminApi.createdResourceId(created, xhr, "PlanDefinition");
            bootstrap.Modal.getInstance(document.getElementById("create-plan-modal")).hide();
            CadminApi.showToast("success", "Plan created.");
            window.location.hash = id ? CadminApi.detailHref("PlanDefinition", id) : "#/plan-definitions";
        });
    });
    CadminDeletedList.bind({ type: "PlanDefinition", reload: function () { load(0); } });
    load(0);
}
