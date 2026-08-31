window.CadminAppointmentDetail = (function () {
    let appointment = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function renderBasics() {
        $("#ad-title").text(CadminScheduling.windowLabel(appointment.start, appointment.end));
        $("#ad-book").toggleClass("d-none", appointment.status !== "pending" && appointment.status !== "proposed");
        $("#ad-cancel").toggleClass("d-none", appointment.status === "cancelled"
            || appointment.status === "entered-in-error");
        $("#ad-reschedule").toggleClass("d-none", appointment.status === "cancelled"
            || appointment.status === "entered-in-error");
        $("#ad-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    CadminScheduling.statusBadge(appointment.status, CadminScheduling.appointmentStatus) + "</dd>" +
                '<dt class="col-sm-3">When</dt><dd class="col-sm-9">' +
                    esc(CadminScheduling.windowLabel(appointment.start, appointment.end)) + "</dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' +
                    esc(appointment.description || "—") + "</dd>" +
                '<dt class="col-sm-3">Service</dt><dd class="col-sm-9">' +
                    esc(CadminScheduling.conceptLabel(appointment.serviceType)) + "</dd>" +
                '<dt class="col-sm-3">Slots</dt><dd class="col-sm-9">' +
                    ((appointment.slot || []).map(CadminScheduling.refHtml).join(", ") || "—") + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(appointment.id) + "</code></dd>" +
            "</dl>"
        );
        $("#ad-participants").html(((appointment.participant || []).map(function (item) {
            return "<tr><td>" + CadminScheduling.refHtml(item.actor) + "</td><td>" +
                CadminScheduling.statusBadge(item.status, CadminScheduling.responseStatus) + "</td></tr>";
        }).join("")) || '<tr><td colspan="2" class="text-muted">No participants.</td></tr>');
    }

    function reload() {
        CadminApi.fhir("/Appointment/" + encodeURIComponent(appointment.id)).done(function (updated) {
            appointment = updated;
            renderBasics();
            CadminResourceSource.mount(function () { return appointment; });
            CadminResourceGraph.mount(appointment);
        });
    }

    function loadResponses() {
        CadminApi.fhir("/AppointmentResponse?appointment=Appointment/" + encodeURIComponent(appointment.id) +
            "&_count=20").done(function (bundle) {
            const rows = CadminApi.bundleResources(bundle, "AppointmentResponse");
            if (!rows.length) {
                $("#ad-response-rows").html('<tr><td colspan="3" class="text-muted">No responses.</td></tr>');
                return;
            }
            $("#ad-response-rows").html(rows.map(function (item) {
                const href = CadminApi.detailHref("AppointmentResponse", item.id);
                return "<tr><td>" + CadminScheduling.refHtml(item.actor) + "</td><td>" +
                    CadminScheduling.statusBadge(item.participantStatus, CadminScheduling.responseStatus) +
                    '</td><td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                    '"><i class="bi bi-eye"></i></a></td></tr>';
            }).join(""));
        });
    }

    function fail(action, xhr) {
        CadminApi.showAlert("#appointment-detail-alert", "danger",
            action + " failed (" + xhr.status + "). Is FHIR Chief running?");
    }

    function render(resource) {
        appointment = resource;
        $(CadminWorkspace.root()).html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/appointments">' +
                        '<i class="bi bi-arrow-left me-1"></i>Appointments</a>' +
                    '<h1 class="h3 mb-0 page-title" id="ad-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-primary" type="button" id="ad-book">Book</button>' +
                    '<button class="btn btn-outline-primary" type="button" id="ad-reschedule">Reschedule</button>' +
                    '<button class="btn btn-outline-warning" type="button" id="ad-cancel">Cancel</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div id="appointment-detail-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Appointment</h6></div>' +
                '<div class="card-body" id="ad-basics"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Participants</h6></div>' +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Actor</th><th>Status</th></tr></thead>" +
                        '<tbody id="ad-participants"></tbody></table></div></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Responses</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#ad-response-modal">Add response</button>' +
                "</div>" +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Actor</th><th>Status</th><th></th></tr></thead>" +
                        '<tbody id="ad-response-rows"><tr><td colspan="3" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table></div></div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="ad-reschedule-modal" tabindex="-1">' +
                '<div class="modal-dialog"><form class="modal-content" id="ad-reschedule-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Reschedule</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="text-muted">FHIR Chief finds a free slot and moves this appointment.</p>' +
                        '<div class="mb-0"><label class="form-label">Replacement slot</label>' +
                            '<select class="form-select" id="ad-next-slot" required></select></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Reschedule</button>' +
                    "</div>" +
                "</form></div>" +
            "</div>" +
            '<div class="modal fade" id="ad-response-modal" tabindex="-1">' +
                '<div class="modal-dialog"><form class="modal-content" id="ad-response-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Add response</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Actor</label>' +
                            '<select class="form-select" id="ad-response-actor" required></select></div>' +
                        '<div class="mb-0"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="ad-response-status"></select></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form></div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return appointment; });
        CadminResourceGraph.mount(appointment);
        CadminResourceHistory.mount(appointment);
        renderBasics();
        loadResponses();
        CadminApi.fillSelectOptions("#ad-response-status", CadminScheduling.responseStatus, { selected: "accepted" });
        const $root = $(CadminWorkspace.root());
        $root.off(".apptdetail");
        $root.on("click.apptdetail", "#ad-book", function () {
            CadminFhirChief.book({ appointment: { reference: "Appointment/" + appointment.id } }).done(function () {
                CadminApi.showToast("success", "Appointment booked.");
                reload();
            }).fail(function (xhr) { fail("Book", xhr); });
        });
        $root.on("click.apptdetail", "#ad-cancel", function () {
            CadminApi.confirm("Cancel this appointment and free its slot?").done(function () {
                CadminFhirChief.cancel({ appointment: { reference: "Appointment/" + appointment.id } }).done(function () {
                    CadminApi.showToast("success", "Appointment cancelled.");
                    reload();
                }).fail(function (xhr) { fail("Cancel", xhr); });
            });
        });
        $root.on("click.apptdetail", "#ad-reschedule", function () {
            const values = { start: new Date().toISOString() };
            const practitioner = CadminScheduling.participantOfType(appointment, "Practitioner");
            const location = CadminScheduling.participantOfType(appointment, "Location");
            const service = CadminScheduling.participantOfType(appointment, "HealthcareService");
            if (practitioner) {
                values.practitioner = practitioner;
            }
            if (location) {
                values.location = location;
            }
            if (service) {
                values.service = service;
            }
            CadminFhirChief.find(values).done(function (bundle) {
                const slots = CadminApi.bundleResources(bundle, "Slot");
                const options = ['<option value="">Select a free slot…</option>'].concat(slots.map(function (slot) {
                    return '<option value="' + esc(slot.id) + '">' +
                        esc(CadminScheduling.windowLabel(slot.start, slot.end)) + "</option>";
                }));
                $("#ad-next-slot").html(options.join(""));
                bootstrap.Modal.getOrCreateInstance(document.getElementById("ad-reschedule-modal")).show();
            }).fail(function (xhr) { fail("Find slots", xhr); });
        });
        $("#ad-reschedule-form").on("submit", function (event) {
            event.preventDefault();
            const slotId = $("#ad-next-slot").val();
            if (!slotId) {
                return;
            }
            CadminFhirChief.reschedule({
                appointment: { reference: "Appointment/" + appointment.id },
                slot: { reference: "Slot/" + slotId }
            }).done(function () {
                hideModal("ad-reschedule-modal");
                CadminApi.showToast("success", "Appointment rescheduled.");
                reload();
            }).fail(function (xhr) { fail("Reschedule", xhr); });
        });
        $("#ad-response-modal").on("show.bs.modal", function () {
            const options = (appointment.participant || []).map(function (item) {
                const id = CadminApi.referenceId(item.actor);
                const type = CadminApi.referenceType(item.actor);
                if (!id || !type) {
                    return "";
                }
                return '<option value="' + esc(type + "/" + id) + '">' +
                    esc(CadminScheduling.refLabel(item.actor)) + "</option>";
            }).filter(Boolean);
            $("#ad-response-actor").html(options.join("") || '<option value="">No participants</option>');
        });
        $("#ad-response-form").on("submit", function (event) {
            event.preventDefault();
            const actor = $("#ad-response-actor").val();
            if (!actor) {
                return;
            }
            CadminApi.fhir("/AppointmentResponse", "POST", {
                resourceType: "AppointmentResponse",
                appointment: { reference: "Appointment/" + appointment.id },
                actor: { reference: actor },
                participantStatus: $("#ad-response-status").val() || "accepted",
                start: appointment.start,
                end: appointment.end
            }).done(function () {
                hideModal("ad-response-modal");
                CadminApi.showToast("success", "Response recorded.");
                loadResponses();
            });
        });
    }

    return { render: render };
}());
