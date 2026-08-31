CadminApp.register("activity-definitions", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("activity-definitions", token, function (resource) {
            CadminActivityDefinitionDetail.render(resource);
        }, function () {
            renderActivityDefinitionList();
        });
        return;
    }
    renderActivityDefinitionList();
});

function renderActivityDefinitionList() {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Activity definitions</h1>' +
            CadminResourceDocument.splitButton({
                label: "New activity",
                modalTarget: "#create-activity-modal",
                resourceType: "ActivityDefinition"
            }) +
        "</div>" +
        '<div id="activity-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Activity search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<form class="d-flex flex-wrap gap-2" id="activity-search-form">' +
                        '<input class="form-control form-control-sm" id="activity-query" placeholder="Title or name" style="max-width:16rem">' +
                        '<select class="form-select form-select-sm" id="activity-status-filter" style="max-width:10rem">' +
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
                        "<thead><tr><th>Title</th><th>Kind</th><th>Code</th><th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="activity-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="activity-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-activity-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-activity-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create activity</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Title</label>' +
                            '<input class="form-control" id="ad-title" required></div>' +
                        '<div class="mb-3"><label class="form-label">Name</label>' +
                            '<input class="form-control font-monospace" id="ad-name"></div>' +
                        '<div class="mb-3"><label class="form-label">Kind</label>' +
                            '<select class="form-select" id="ad-kind">' +
                                CadminWorkflow.optionsHtml(CadminWorkflow.kinds, "Task") +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label">Code</label>' +
                            '<input class="form-control" id="ad-code" placeholder="collect-information"></div>' +
                        '<div class="mb-3"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="ad-status">' +
                                CadminWorkflow.optionsHtml(CadminWorkflow.publication, "active") +
                            "</select></div>" +
                        '<div class="mb-0"><label class="form-label">URL</label>' +
                            '<input class="form-control font-monospace" id="ad-url"></div>' +
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
        let path = "/ActivityDefinition?_sort=-_lastUpdated";
        const query = $("#activity-query").val().trim();
        const status = $("#activity-status-filter").val();
        if (query) {
            path += (/^[a-z][a-z0-9+.-]*:/i.test(query) ? "&url=" : "&title:contains=")
                + encodeURIComponent(query);
        }
        if (status) {
            path += "&status=" + encodeURIComponent(status);
        }
        const pageSize = CadminApi.listPageSize("activity-definitions");
        CadminDeletedList.query({ type: "ActivityDefinition", path: path, page: listPage, size: pageSize })
            .done(function (bundle) {
                const entries = CadminApi.bundleResources(bundle, "ActivityDefinition");
                CadminApi.renderPager("#activity-pager", {
                    page: listPage, size: pageSize, pageSizeKey: "activity-definitions",
                    returned: entries.length, total: bundle.total, bundle: bundle,
                    onPage: function (next) { load(next); }
                });
                if (!entries.length) {
                    $("#activity-rows").html(CadminDeletedList.emptyRow(6, "ActivityDefinition",
                        "No activity definitions found."));
                    return;
                }
                $("#activity-rows").html(entries.map(function (item) {
                    const href = CadminApi.detailHref("ActivityDefinition", item.id);
                    return "<tr>" +
                        "<td>" + CadminApi.resourceLink(href, item.title || item.name || item.id) + "</td>" +
                        "<td>" + CadminApi.escapeHtml(item.kind || "—") + "</td>" +
                        "<td>" + CadminApi.escapeHtml(CadminWorkflow.conceptCode(item.code) || "—") + "</td>" +
                        "<td>" + CadminWorkflow.publicationBadge(item.status) + "</td>" +
                        "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
                        '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                            '" title="Open"><i class="bi bi-eye"></i></a></td></tr>';
                }).join(""));
            }).fail(function (xhr) {
                $("#activity-pager").empty();
                $("#activity-rows").html('<tr><td colspan="6" class="text-danger">Unable to load activities from /fhir.</td></tr>');
                CadminApi.showAlert("#activity-alert", "danger",
                    "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
            });
    }

    $("#activity-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });
    $("#create-activity-form").on("submit", function (event) {
        event.preventDefault();
        const resource = {
            resourceType: "ActivityDefinition",
            title: $("#ad-title").val().trim(),
            status: $("#ad-status").val() || "active",
            kind: $("#ad-kind").val() || "Task"
        };
        const name = $("#ad-name").val().trim();
        const url = $("#ad-url").val().trim();
        const code = $("#ad-code").val().trim();
        if (name) {
            resource.name = name;
        }
        if (url) {
            resource.url = url;
        }
        if (code) {
            resource.code = { coding: [{ system: "https://cadmin.io/fhir/CodeSystem/schedule-task", code: code }] };
        }
        CadminApi.fhir("/ActivityDefinition", "POST", resource).done(function (created, _status, xhr) {
            const id = CadminApi.createdResourceId(created, xhr, "ActivityDefinition");
            bootstrap.Modal.getInstance(document.getElementById("create-activity-modal")).hide();
            CadminApi.showToast("success", "Activity created.");
            window.location.hash = id ? CadminApi.detailHref("ActivityDefinition", id) : "#/activity-definitions";
        });
    });
    CadminDeletedList.bind({ type: "ActivityDefinition", reload: function () { load(0); } });
    load(0);
}
