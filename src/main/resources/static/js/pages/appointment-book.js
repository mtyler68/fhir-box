CadminApp.register("appointment-book", function () {
    CadminAppointmentBook.render();
});

window.CadminAppointmentBook = (function () {
    function isoDate(value, endOfDay) {
        if (!value) {
            return "";
        }
        return value + (endOfDay ? "T23:59:59" : "T00:00:00");
    }

    function valuesFromForm() {
        const values = {
            start: isoDate($("#ab-start").val()),
            end: isoDate($("#ab-end").val(), true),
            duration: parseInt($("#ab-duration").val(), 10) || undefined,
            description: $("#ab-description").val().trim()
        };
        const patient = CadminApi.selectValue("#ab-patient");
        const practitioner = CadminApi.selectValue("#ab-practitioner");
        const location = CadminApi.selectValue("#ab-location");
        const service = CadminApi.selectValue("#ab-service");
        if (patient) {
            values.patient = { reference: "Patient/" + patient, display: CadminApi.selectLabel("#ab-patient") };
        }
        if (practitioner) {
            values.practitioner = {
                reference: "Practitioner/" + practitioner,
                display: CadminApi.selectLabel("#ab-practitioner")
            };
        }
        if (location) {
            values.location = { reference: "Location/" + location, display: CadminApi.selectLabel("#ab-location") };
        }
        if (service) {
            values.service = {
                reference: "HealthcareService/" + service,
                display: CadminApi.selectLabel("#ab-service")
            };
        }
        return values;
    }

    function renderSlots(bundle) {
        const slots = CadminApi.bundleResources(bundle, "Slot");
        if (!slots.length) {
            $("#ab-slot-rows").html('<tr><td colspan="4" class="text-muted">No free slots match those filters.</td></tr>');
            return;
        }
        $("#ab-slot-rows").html(slots.map(function (slot) {
            return "<tr>" +
                "<td>" + CadminApi.escapeHtml(CadminScheduling.windowLabel(slot.start, slot.end)) + "</td>" +
                "<td>" + CadminScheduling.statusBadge(slot.status, CadminScheduling.slotStatus) + "</td>" +
                "<td>" + CadminScheduling.refHtml(slot.schedule) + "</td>" +
                '<td class="text-end text-nowrap">' +
                    '<button class="btn btn-sm btn-outline-warning" type="button" data-hold="' +
                        CadminApi.escapeHtml(slot.id) + '">Hold</button> ' +
                    '<button class="btn btn-sm btn-primary" type="button" data-book="' +
                        CadminApi.escapeHtml(slot.id) + '">Book</button>' +
                "</td></tr>";
        }).join(""));
    }

    function fail(action, xhr) {
        CadminApi.showAlert("#ab-alert", "danger",
            action + " failed (" + xhr.status + "). Is FHIR Chief running on port 8380?");
    }

    function openAppointment(body) {
        const appointment = CadminFhirChief.resourceParam(body, "appointment");
        if (appointment && appointment.id) {
            window.location.hash = CadminApi.detailHref("Appointment", appointment.id);
            return;
        }
        CadminApi.showToast("success", "Request completed.");
        window.location.hash = "#/appointments";
    }

    function render() {
        const today = new Date().toISOString().slice(0, 10);
        const later = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        $("#app-content").html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/appointments">' +
                        '<i class="bi bi-arrow-left me-1"></i>Appointments</a>' +
                    '<h1 class="h3 mb-0 page-title">Find and book</h1>' +
                    '<p class="text-muted mb-0">Search free slots with FHIR Chief. Booking never POSTs Appointment from the browser.</p>' +
                "</div>" +
            "</div>" +
            '<div id="ab-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Search</h6></div>' +
                '<div class="card-body">' +
                    '<form id="ab-form" class="row g-3">' +
                        '<div class="col-md-6"><label class="form-label">Patient</label>' +
                            '<select class="form-select" id="ab-patient"></select>' +
                            '<div class="form-text">Leave empty for a staff-only booking.</div></div>' +
                        '<div class="col-md-6"><label class="form-label">Practitioner</label>' +
                            '<select class="form-select" id="ab-practitioner"></select></div>' +
                        '<div class="col-md-6"><label class="form-label">Location</label>' +
                            '<select class="form-select" id="ab-location"></select></div>' +
                        '<div class="col-md-6"><label class="form-label">Healthcare service</label>' +
                            '<select class="form-select" id="ab-service"></select></div>' +
                        '<div class="col-md-4"><label class="form-label">From</label>' +
                            '<input type="date" class="form-control" id="ab-start" value="' + today + '"></div>' +
                        '<div class="col-md-4"><label class="form-label">To</label>' +
                            '<input type="date" class="form-control" id="ab-end" value="' + later + '"></div>' +
                        '<div class="col-md-4"><label class="form-label">Duration (minutes)</label>' +
                            '<input type="number" min="5" step="5" class="form-control" id="ab-duration" value="30"></div>' +
                        '<div class="col-12"><label class="form-label">Description</label>' +
                            '<input class="form-control" id="ab-description" placeholder="Optional visit reason"></div>' +
                        '<div class="col-12">' +
                            '<button class="btn btn-primary" type="submit">Find slots</button> ' +
                            '<button class="btn btn-outline-secondary" type="button" id="ab-propose">Propose without a slot</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Free slots</h6></div>' +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>When</th><th>Status</th><th>Schedule</th><th></th></tr></thead>" +
                        '<tbody id="ab-slot-rows"><tr><td colspan="4" class="text-muted">Search to see free slots.</td></tr></tbody>' +
                    "</table></div></div>" +
            "</div>"
        );
        CadminApi.bindPatientSelect("#ab-patient", { placeholder: "None (staff booking)" });
        CadminApi.bindPractitionerSelect("#ab-practitioner", { placeholder: "Any practitioner" });
        CadminApi.bindFhirSelect("#ab-location", "Location", { placeholder: "Any location" });
        CadminApi.bindFhirSelect("#ab-service", "HealthcareService", { placeholder: "Any service" });
        $("#ab-form").on("submit", function (event) {
            event.preventDefault();
            CadminFhirChief.find(valuesFromForm()).done(renderSlots).fail(function (xhr) { fail("Find", xhr); });
        });
        $("#ab-propose").on("click", function () {
            const values = valuesFromForm();
            if (!values.start || !values.end) {
                CadminApi.showToast("danger", "Choose a start and end date.");
                return;
            }
            CadminFhirChief.propose(values).done(openAppointment).fail(function (xhr) { fail("Propose", xhr); });
        });
        $("#ab-slot-rows").on("click", "[data-hold]", function () {
            const values = valuesFromForm();
            values.slot = { reference: "Slot/" + $(this).attr("data-hold") };
            CadminFhirChief.hold(values).done(openAppointment).fail(function (xhr) { fail("Hold", xhr); });
        });
        $("#ab-slot-rows").on("click", "[data-book]", function () {
            const values = valuesFromForm();
            values.slot = { reference: "Slot/" + $(this).attr("data-book") };
            CadminFhirChief.book(values).done(openAppointment).fail(function (xhr) { fail("Book", xhr); });
        });
    }

    return { render: render };
}());
