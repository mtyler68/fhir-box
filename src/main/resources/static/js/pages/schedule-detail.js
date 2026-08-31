window.CadminScheduleDetail = (function () {
    let schedule = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function renderHeader() {
        $("#sd-title").text(CadminScheduling.actorsLabel(schedule) !== "—"
            ? CadminScheduling.actorsLabel(schedule)
            : "Schedule");
    }

    function renderBasics() {
        const horizon = schedule.planningHorizon || {};
        $("#sd-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    (schedule.active !== false
                        ? '<span class="badge text-bg-success">Active</span>'
                        : '<span class="badge text-bg-secondary">Inactive</span>') + "</dd>" +
                '<dt class="col-sm-3">Actors</dt><dd class="col-sm-9">' +
                    (schedule.actor || []).map(CadminScheduling.refHtml).join(", ") + "</dd>" +
                '<dt class="col-sm-3">Service</dt><dd class="col-sm-9">' +
                    esc(CadminScheduling.conceptLabel(schedule.serviceType)) + "</dd>" +
                '<dt class="col-sm-3">Horizon</dt><dd class="col-sm-9">' +
                    esc((horizon.start || "…") + " – " + (horizon.end || "…")) + "</dd>" +
                '<dt class="col-sm-3">Comment</dt><dd class="col-sm-9">' + esc(schedule.comment || "—") + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(schedule.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function loadSlots() {
        CadminApi.fhir("/Slot?schedule=Schedule/" + encodeURIComponent(schedule.id) +
            "&_sort=start&_count=12").done(function (bundle) {
            const slots = CadminApi.bundleResources(bundle, "Slot");
            if (!slots.length) {
                $("#sd-slot-rows").html('<tr><td colspan="4" class="text-muted">No slots. Generate them with FHIR Chief.</td></tr>');
                return;
            }
            $("#sd-slot-rows").html(slots.map(function (slot) {
                const href = CadminApi.detailHref("Slot", slot.id);
                return "<tr><td>" + CadminApi.resourceLink(href, CadminScheduling.windowLabel(slot.start, slot.end)) +
                    "</td><td>" + CadminScheduling.statusBadge(slot.status, CadminScheduling.slotStatus) +
                    "</td><td>" + esc(CadminScheduling.conceptLabel(slot.serviceType)) +
                    '</td><td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                    '"><i class="bi bi-eye"></i></a></td></tr>';
            }).join(""));
        }).fail(function () {
            $("#sd-slot-rows").html('<tr><td colspan="4" class="text-muted">Unable to load slots.</td></tr>');
        });
    }

    function actorRef(selector, type) {
        const id = CadminApi.selectValue(selector);
        if (!id) {
            return null;
        }
        return { reference: type + "/" + id, display: CadminApi.selectLabel(selector) };
    }

    function selectedActor(type) {
        const match = (schedule.actor || []).find(function (ref) {
            return CadminApi.referenceType(ref) === type;
        });
        return match || null;
    }

    function populateForm() {
        $("#sd-active").prop("checked", schedule.active !== false);
        $("#sd-comment").val(schedule.comment || "");
        const horizon = schedule.planningHorizon || {};
        $("#sd-start").val((horizon.start || "").slice(0, 10));
        $("#sd-end").val((horizon.end || "").slice(0, 10));
        const practitioner = selectedActor("Practitioner");
        const location = selectedActor("Location");
        const service = selectedActor("HealthcareService");
        CadminApi.bindPractitionerSelect("#sd-practitioner", {
            placeholder: "None",
            selectedId: CadminApi.referenceId(practitioner),
            selectedLabel: CadminScheduling.refLabel(practitioner)
        });
        CadminApi.bindFhirSelect("#sd-location", "Location", {
            placeholder: "None",
            selectedId: CadminApi.referenceId(location),
            selectedLabel: CadminScheduling.refLabel(location)
        });
        CadminApi.bindFhirSelect("#sd-service", "HealthcareService", {
            placeholder: "None",
            selectedId: CadminApi.referenceId(service),
            selectedLabel: CadminScheduling.refLabel(service)
        });
    }

    function save() {
        const actors = [
            actorRef("#sd-practitioner", "Practitioner"),
            actorRef("#sd-location", "Location"),
            actorRef("#sd-service", "HealthcareService")
        ].filter(Boolean);
        if (!actors.length) {
            CadminApi.showToast("danger", "Select at least one actor.");
            return;
        }
        schedule.active = $("#sd-active").is(":checked");
        schedule.actor = actors;
        const comment = $("#sd-comment").val().trim();
        if (comment) {
            schedule.comment = comment;
        } else {
            delete schedule.comment;
        }
        const start = $("#sd-start").val();
        const end = $("#sd-end").val();
        if (start || end) {
            schedule.planningHorizon = {};
            if (start) {
                schedule.planningHorizon.start = start;
            }
            if (end) {
                schedule.planningHorizon.end = end;
            }
        } else {
            delete schedule.planningHorizon;
        }
        CadminApi.fhir("/Schedule/" + encodeURIComponent(schedule.id), "PUT", schedule).done(function (updated) {
            schedule = updated || schedule;
            hideModal("sd-edit-modal");
            renderHeader();
            renderBasics();
            CadminResourceSource.mount(function () { return schedule; });
            CadminResourceGraph.mount(schedule);
            CadminApi.showToast("success", "Schedule updated.");
        });
    }

    function render(resource) {
        schedule = resource;
        $(CadminWorkspace.root()).html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/schedules">' +
                        '<i class="bi bi-arrow-left me-1"></i>Schedules</a>' +
                    '<h1 class="h3 mb-0 page-title" id="sd-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-primary" type="button" id="sd-generate">' +
                        '<i class="bi bi-calendar-plus me-1"></i>Generate slots</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="sd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div id="schedule-detail-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Schedule</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#sd-edit-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="sd-basics"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Slots</h6>' +
                    '<a class="small" href="#/slots">Browse all</a>' +
                "</div>" +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>When</th><th>Status</th><th>Service</th><th></th></tr></thead>" +
                        '<tbody id="sd-slot-rows"><tr><td colspan="4" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table></div></div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="sd-edit-modal" tabindex="-1">' +
                '<div class="modal-dialog"><form class="modal-content" id="sd-edit-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Edit schedule</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="sd-active">' +
                            '<label class="form-check-label" for="sd-active">Active</label></div>' +
                        '<div class="mb-3"><label class="form-label">Practitioner</label>' +
                            '<select class="form-select" id="sd-practitioner"></select></div>' +
                        '<div class="mb-3"><label class="form-label">Location</label>' +
                            '<select class="form-select" id="sd-location"></select></div>' +
                        '<div class="mb-3"><label class="form-label">Healthcare service</label>' +
                            '<select class="form-select" id="sd-service"></select></div>' +
                        '<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Horizon start</label>' +
                            '<input type="date" class="form-control" id="sd-start"></div>' +
                            '<div class="col-md-6 mb-3"><label class="form-label">Horizon end</label>' +
                            '<input type="date" class="form-control" id="sd-end"></div></div>' +
                        '<div class="mb-0"><label class="form-label">Comment</label>' +
                            '<input class="form-control" id="sd-comment"></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form></div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return schedule; });
        CadminResourceGraph.mount(schedule);
        CadminResourceHistory.mount(schedule);
        renderHeader();
        renderBasics();
        loadSlots();
        const $root = $(CadminWorkspace.root());
        $root.off(".scheduledetail");
        $("#sd-edit-modal").on("show.bs.modal", populateForm);
        $("#sd-edit-form").on("submit", function (event) {
            event.preventDefault();
            save();
        });
        $root.on("click.scheduledetail", "#sd-generate", function () {
            CadminFhirChief.generateSlots(schedule.id).done(function (body) {
                const created = ((body && body.parameter) || []).find(function (item) {
                    return item.name === "created";
                });
                CadminApi.showToast("success", "Generated " +
                    ((created && created.valueInteger) || 0) + " slots.");
                loadSlots();
            }).fail(function (xhr) {
                CadminApi.showAlert("#schedule-detail-alert", "danger",
                    "Generate slots failed (" + xhr.status + "). Is FHIR Chief running?");
            });
        });
        $root.on("click.scheduledetail", "#sd-delete", function () {
            CadminApi.confirm("Delete this schedule?").done(function () {
                CadminApi.fhir("/Schedule/" + encodeURIComponent(schedule.id), "DELETE").done(function () {
                    CadminApi.showToast("success", "Schedule deleted.");
                    window.location.hash = "#/schedules";
                });
            });
        });
    }

    return { render: render };
}());
