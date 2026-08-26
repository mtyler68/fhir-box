CadminApp.register("value-sets", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("value-sets", token, function (resource, $root) {
            CadminValueSetDetail.render(resource, $root);
        }, function () {
            renderValueSetList(token);
        });
        return;
    }
    renderValueSetList("");
});

function renderValueSetList(initialQuery) {
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Value sets</h1>' +
            CadminResourceDocument.splitButton({
                label: "New value set",
                modalTarget: "#create-valueset-modal",
                resourceType: "ValueSet"
            }) +
        "</div>" +
        '<div id="valueset-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                '<h6 class="m-0">Value set search</h6>' +
                '<form class="d-flex" id="valueset-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="valueset-query" placeholder="Title, name, or URL" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Title</th><th>URL</th><th>Status</th><th>Includes</th>" +
                        "<th>Version</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="valueset-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="valueset-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-valueset-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-valueset-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create value set</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="vs-title">Title</label>' +
                            '<input class="form-control" id="vs-title" name="title" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="vs-status">Status</label>' +
                            '<select class="form-select" id="vs-status" name="status">' +
                                statusOptions.map(function (option) {
                                    return '<option value="' + option.code + '"' +
                                        (option.code === "draft" ? " selected" : "") + ">" +
                                        CadminApi.escapeHtml(option.display) + "</option>";
                                }).join("") +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label" for="vs-url">URL</label>' +
                            '<input class="form-control font-monospace" id="vs-url" name="url" ' +
                            'placeholder="https://cadmin.io/fhir/ValueSet/example"></div>' +
                        '<div class="mb-3"><label class="form-label" for="vs-version">Version</label>' +
                            '<input class="form-control" id="vs-version" name="version" value="1.0.0" autocomplete="off"></div>' +
                        '<div class="mb-0"><label class="form-label" for="vs-system">Include code system (optional)</label>' +
                            '<select class="form-select" id="vs-system"></select>' +
                            '<div class="form-text">Leave empty to compose includes on the detail page.</div></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>"
    );

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function statusLabel(code) {
        const match = statusOptions.find(function (option) { return option.code === code; });
        return match ? match.display : (code || "—");
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success"
            : status === "retired" ? "secondary"
                : status === "draft" ? "warning"
                    : "info";
        return '<span class="badge text-bg-' + kind + '">' + esc(statusLabel(status)) + "</span>";
    }

    function slugName(title) {
        return String(title || "valueset").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "valueset";
    }

    function includeCount(resource) {
        return ((resource.compose && resource.compose.include) || []).length;
    }

    function defaultUrl(title) {
        return "https://cadmin.io/fhir/ValueSet/" + slugName(title);
    }

    let listPage = 0;
    let urlTouched = false;

    function load(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/ValueSet?_sort=-_lastUpdated";
        const q = String(query || "").trim();
        if (q) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(q)) {
                path += "&url=" + encodeURIComponent(q);
            } else {
                path += "&title=" + encodeURIComponent(q);
            }
        }
        const pageSize = CadminApi.listPageSize("value-sets");
        CadminApi.fhir(CadminApi.pagedPath(path, listPage, pageSize)).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "ValueSet");
            CadminApi.renderPager("#valueset-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "value-sets",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#valueset-rows").html('<tr><td colspan="7" class="text-muted">No value sets found. Create one or start HAPI FHIR.</td></tr>');
                return;
            }
            $("#valueset-rows").html(entries.map(function (vs) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/value-sets/" + encodeURIComponent(vs.id),
                        vs.title || vs.name || "Untitled") + "</td>" +
                    "<td><code class=\"small\">" + esc(vs.url || "—") + "</code></td>" +
                    "<td>" + statusBadge(vs.status) + "</td>" +
                    "<td>" + includeCount(vs) + "</td>" +
                    "<td><code>" + esc(vs.version || "—") + "</code></td>" +
                    "<td><code>" + esc(vs.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        '<a class="btn btn-sm btn-outline-primary" href="#/value-sets/' +
                            encodeURIComponent(vs.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                    "</td></tr>";
            }).join(""));
        }).fail(function (xhr) {
            $("#valueset-pager").empty();
            $("#valueset-rows").html('<tr><td colspan="7" class="text-danger">Unable to load value sets from /fhir.</td></tr>');
            CadminApi.showAlert("#valueset-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#valueset-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#valueset-query").val());
    });

    $("#vs-title").on("input", function () {
        if (!urlTouched) {
            $("#vs-url").val(defaultUrl($(this).val()));
        }
    });
    $("#vs-url").on("input", function () {
        urlTouched = !!$(this).val();
    });

    $("#create-valueset-modal").on("show.bs.modal", function () {
        urlTouched = false;
        $("#vs-title").val("");
        $("#vs-url").val("");
        $("#vs-status").val("draft");
        $("#vs-version").val("1.0.0");
        CadminApi.bindCodeSystemPicker("#vs-system", {
            placeholder: "Optional code system…",
            allowEmpty: true
        });
    });

    $("#create-valueset-form").on("submit", function (event) {
        event.preventDefault();
        const title = $("#vs-title").val().trim();
        const url = $("#vs-url").val().trim() || defaultUrl(title);
        const system = CadminApi.selectValue("#vs-system");
        const resource = {
            resourceType: "ValueSet",
            status: $("#vs-status").val() || "draft",
            title: title,
            name: slugName(title),
            url: url,
            version: $("#vs-version").val().trim() || "1.0.0"
        };
        if (system) {
            resource.compose = { include: [{ system: system }] };
        }
        CadminApi.fhir("/ValueSet", "POST", resource).done(function (created, _status, xhr) {
            const id = CadminApi.createdResourceId(created, xhr, "ValueSet");
            const modal = bootstrap.Modal.getInstance(document.getElementById("create-valueset-modal"));
            if (modal) {
                modal.hide();
            }
            CadminApi.showToast("success", "Value set created.");
            if (id) {
                window.location.hash = "#/value-sets/" + encodeURIComponent(id);
                return;
            }
            load($("#valueset-query").val());
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
        });
    });

    CadminApi.fillValueSetSelect("#vs-status", CadminApi.valueSets.publicationStatus, {
        fallback: statusOptions,
        selected: "draft"
    });

    load(initialQuery);
}
