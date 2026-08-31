CadminApp.register("lists", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("lists", token, function (resource, $root) {
            CadminListDetail.render(resource, $root);
        }, function () {
            renderFhirListIndex();
        });
        return;
    }
    renderFhirListIndex();
});

function renderFhirListIndex() {
    let statusOptions = [
        { code: "current", display: "Current" },
        { code: "retired", display: "Retired" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    let modeOptions = [
        { code: "working", display: "Working" },
        { code: "snapshot", display: "Snapshot" },
        { code: "changes", display: "Changes" }
    ];
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Lists</h1>' +
            CadminResourceDocument.splitButton({
                label: "New list",
                modalTarget: "#create-list-modal",
                resourceType: "List"
            }) +
        "</div>" +
        '<div id="list-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">List search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex flex-wrap gap-2" id="list-search-form">' +
                    '<select class="form-select form-select-sm" id="list-status-filter" style="max-width:10rem">' +
                        '<option value="">Any status</option></select>' +
                    '<input class="form-control form-control-sm" id="list-query" placeholder="Title">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Title</th><th>Status</th><th>Mode</th><th>Subject</th>" +
                        "<th>Entries</th><th>Date</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="list-rows"><tr><td colspan="8" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="list-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-list-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-list-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create list</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="lst-title">Title</label>' +
                            '<input class="form-control" id="lst-title" required></div>' +
                        '<div class="mb-3"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="lst-status"></select></div>' +
                        '<div class="mb-3"><label class="form-label">Mode</label>' +
                            '<select class="form-select" id="lst-mode"></select></div>' +
                        '<div class="mb-3"><label class="form-label" for="lst-code">Purpose</label>' +
                            '<input class="form-control" id="lst-code" placeholder="Optional list purpose"></div>' +
                        '<div class="mb-0"><label class="form-label">Subject</label>' +
                            '<select class="form-select" id="lst-subject">' +
                                '<option value="">None</option></select></div>' +
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

    function listSubjects(resource) {
        const subject = resource && resource.subject;
        if (!subject) {
            return [];
        }
        return Array.isArray(subject) ? subject : [subject];
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        return ref.display || (ref.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function statusBadge(status) {
        const kind = status === "current" ? "success"
            : status === "entered-in-error" ? "danger"
                : "secondary";
        return '<span class="badge text-bg-' + kind + '">' +
            esc(CadminApi.valueSetDisplay(statusOptions, status) || status || "—") + "</span>";
    }

    function modeLabel(mode) {
        return CadminApi.valueSetDisplay(modeOptions, mode) || mode || "—";
    }

    let listPage = 0;

    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/List?_sort=-date,-_lastUpdated";
        const status = $("#list-status-filter").val();
        const query = $("#list-query").val().trim();
        if (status) {
            path += "&status=" + encodeURIComponent(status);
        }
        if (query) {
            path += "&title=" + encodeURIComponent(query);
        }
        const pageSize = CadminApi.listPageSize("lists");
        CadminDeletedList.query({ type: "List", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "List");
            CadminApi.renderPager("#list-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "lists",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(nextPage); }
            });
            if (!entries.length) {
                $("#list-rows").html(CadminDeletedList.emptyRow(8, "List", "No lists found. Create one or start HAPI FHIR."));
                return;
            }
            $("#list-rows").html(entries.map(function (item) {
                const subjects = listSubjects(item);
                const subject = subjects[0];
                const href = CadminApi.detailHref("List", item.id);
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink(href, item.title || item.id || "Untitled") + "</td>" +
                    "<td>" + statusBadge(item.status) + "</td>" +
                    "<td>" + esc(modeLabel(item.mode)) + "</td>" +
                    "<td>" + esc(refLabel(subject)) + "</td>" +
                    "<td>" + esc(String((item.entry || []).length)) + "</td>" +
                    "<td>" + esc(item.date ? String(item.date).replace("T", " ").replace(/Z$/, "") : "—") + "</td>" +
                    "<td><code>" + esc(item.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        CadminTargetList.chooserButton(item.id) +
                        '<a class="btn btn-sm btn-outline-primary ms-1" href="' +
                        esc(href) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td>' +
                    "</tr>";
            }).join(""));
        }).fail(function (xhr) {
            $("#list-pager").empty();
            $("#list-rows").html('<tr><td colspan="8" class="text-danger">Unable to load lists from /fhir.</td></tr>');
            CadminApi.showAlert("#list-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#list-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });

    $("#create-list-modal").on("show.bs.modal", function () {
        $("#lst-title").val("");
        $("#lst-code").val("");
        $("#lst-status").val("current");
        $("#lst-mode").val("working");
        CadminApi.bindPatientSelect("#lst-subject", { placeholder: "None" });
    });

    $("#create-list-form").on("submit", function (event) {
        event.preventDefault();
        const title = $("#lst-title").val().trim();
        if (!title) {
            CadminApi.showToast("danger", "Enter a list title.");
            return;
        }
        const resource = {
            resourceType: "List",
            status: $("#lst-status").val() || "current",
            mode: $("#lst-mode").val() || "working",
            title: title,
            date: new Date().toISOString()
        };
        const purpose = $("#lst-code").val().trim();
        if (purpose) {
            resource.code = { text: purpose };
        }
        const subjectId = CadminApi.selectValue("#lst-subject");
        if (subjectId) {
            resource.subject = [{
                reference: "Patient/" + subjectId,
                display: CadminApi.selectLabel("#lst-subject")
            }];
        }
        CadminApi.fhir("/List", "POST", resource).done(function (created, _status, xhr) {
            const id = CadminApi.createdResourceId(created, xhr, "List");
            const modal = bootstrap.Modal.getInstance(document.getElementById("create-list-modal"));
            if (modal) {
                modal.hide();
            }
            CadminApi.showToast("success", "List created.");
            if (id) {
                window.location.hash = CadminApi.detailHref("List", id);
                return;
            }
            load(0);
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
        });
    });

    CadminApi.fillValueSetSelect("#list-status-filter", CadminApi.valueSets.listStatus, {
        fallback: statusOptions,
        prepend: [{ code: "", display: "Any status" }],
        selected: "",
        onConcepts: function (concepts) { statusOptions = concepts; }
    });
    CadminApi.expandValueSet(CadminApi.valueSets.listMode).done(function (concepts) {
        modeOptions = concepts;
    });
    CadminApi.fillValueSetSelect("#lst-status", CadminApi.valueSets.listStatus, {
        fallback: statusOptions,
        selected: "current"
    });
    CadminApi.fillValueSetSelect("#lst-mode", CadminApi.valueSets.listMode, {
        fallback: modeOptions,
        selected: "working"
    });

    CadminDeletedList.bind({
        type: "List",
        reload: function () { load(0); }
    });

    load(0);
}
