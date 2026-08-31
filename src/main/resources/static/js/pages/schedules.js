CadminApp.register("schedules", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("schedules", token, function (resource) {
            CadminScheduleDetail.render(resource);
        }, function () {
            renderScheduleList();
        });
        return;
    }
    renderScheduleList();
});

function renderScheduleList() {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Schedules</h1>' +
            CadminResourceDocument.splitButton({
                label: "New schedule",
                modalTarget: "#create-schedule-modal",
                resourceType: "Schedule"
            }) +
        "</div>" +
        '<div id="schedule-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Schedule search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<form class="d-flex flex-wrap gap-2" id="schedule-search-form">' +
                        '<select class="form-select form-select-sm" id="schedule-active-filter" style="max-width:10rem">' +
                            '<option value="">Any status</option>' +
                            '<option value="true">Active</option>' +
                            '<option value="false">Inactive</option></select>' +
                        '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                    "</form>" +
                    CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Actors</th><th>Service</th><th>Horizon</th><th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="schedule-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="schedule-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-schedule-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-schedule-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create schedule</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="sch-active" checked>' +
                            '<label class="form-check-label" for="sch-active">Active</label></div>' +
                        '<div class="mb-3"><label class="form-label">Practitioner</label>' +
                            '<select class="form-select" id="sch-practitioner"></select></div>' +
                        '<div class="mb-3"><label class="form-label">Location</label>' +
                            '<select class="form-select" id="sch-location"></select></div>' +
                        '<div class="mb-3"><label class="form-label">Healthcare service</label>' +
                            '<select class="form-select" id="sch-service"></select></div>' +
                        '<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Horizon start</label>' +
                            '<input type="date" class="form-control" id="sch-start"></div>' +
                            '<div class="col-md-6 mb-3"><label class="form-label">Horizon end</label>' +
                            '<input type="date" class="form-control" id="sch-end"></div></div>' +
                        '<div class="mb-0"><label class="form-label">Comment</label>' +
                            '<input class="form-control" id="sch-comment"></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>"
    );

    const sched = CadminScheduling;
    let listPage = 0;

    function actorRef(selector, type) {
        const id = CadminApi.selectValue(selector);
        if (!id) {
            return null;
        }
        return { reference: type + "/" + id, display: CadminApi.selectLabel(selector) };
    }

    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/Schedule?_sort=-_lastUpdated";
        const active = $("#schedule-active-filter").val();
        if (active) {
            path += "&active=" + encodeURIComponent(active);
        }
        const pageSize = CadminApi.listPageSize("schedules");
        CadminDeletedList.query({ type: "Schedule", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Schedule");
            CadminApi.renderPager("#schedule-pager", {
                page: listPage, size: pageSize, pageSizeKey: "schedules",
                returned: entries.length, total: bundle.total, bundle: bundle,
                onPage: function (next) { load(next); }
            });
            if (!entries.length) {
                $("#schedule-rows").html(CadminDeletedList.emptyRow(6, "Schedule",
                    "No schedules found. Create one or start HAPI FHIR."));
                return;
            }
            $("#schedule-rows").html(entries.map(function (item) {
                const href = CadminApi.detailHref("Schedule", item.id);
                const horizon = item.planningHorizon || {};
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink(href, sched.actorsLabel(item)) + "</td>" +
                    "<td>" + CadminApi.escapeHtml(sched.conceptLabel(item.serviceType)) + "</td>" +
                    "<td>" + CadminApi.escapeHtml((horizon.start || "…") + " – " + (horizon.end || "…")) + "</td>" +
                    "<td>" + (item.active !== false
                        ? '<span class="badge text-bg-success">Active</span>'
                        : '<span class="badge text-bg-secondary">Inactive</span>') + "</td>" +
                    "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                        '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td></tr>';
            }).join(""));
        }).fail(function (xhr) {
            $("#schedule-pager").empty();
            $("#schedule-rows").html('<tr><td colspan="6" class="text-danger">Unable to load schedules from /fhir.</td></tr>');
            CadminApi.showAlert("#schedule-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#schedule-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });
    $("#create-schedule-modal").on("show.bs.modal", function () {
        CadminApi.bindPractitionerSelect("#sch-practitioner", { placeholder: "None" });
        CadminApi.bindFhirSelect("#sch-location", "Location", { placeholder: "None" });
        CadminApi.bindFhirSelect("#sch-service", "HealthcareService", { placeholder: "None" });
    });
    $("#create-schedule-form").on("submit", function (event) {
        event.preventDefault();
        const actors = [
            actorRef("#sch-practitioner", "Practitioner"),
            actorRef("#sch-location", "Location"),
            actorRef("#sch-service", "HealthcareService")
        ].filter(Boolean);
        if (!actors.length) {
            CadminApi.showToast("danger", "Select at least one actor.");
            return;
        }
        const resource = { resourceType: "Schedule", active: $("#sch-active").is(":checked"), actor: actors };
        const comment = $("#sch-comment").val().trim();
        if (comment) {
            resource.comment = comment;
        }
        const start = $("#sch-start").val();
        const end = $("#sch-end").val();
        if (start || end) {
            resource.planningHorizon = {};
            if (start) {
                resource.planningHorizon.start = start;
            }
            if (end) {
                resource.planningHorizon.end = end;
            }
        }
        CadminApi.fhir("/Schedule", "POST", resource).done(function (created, _status, xhr) {
            const id = CadminApi.createdResourceId(created, xhr, "Schedule");
            bootstrap.Modal.getInstance(document.getElementById("create-schedule-modal")).hide();
            CadminApi.showToast("success", "Schedule created.");
            window.location.hash = id ? CadminApi.detailHref("Schedule", id) : "#/schedules";
        });
    });
    CadminDeletedList.bind({ type: "Schedule", reload: function () { load(0); } });
    load(0);
}
