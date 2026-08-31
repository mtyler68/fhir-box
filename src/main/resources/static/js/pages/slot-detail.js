window.CadminSlotDetail = (function () {
    let slot = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function renderBasics() {
        $("#sld-title").text(CadminScheduling.windowLabel(slot.start, slot.end));
        $("#sld-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    CadminScheduling.statusBadge(slot.status, CadminScheduling.slotStatus) + "</dd>" +
                '<dt class="col-sm-3">When</dt><dd class="col-sm-9">' +
                    esc(CadminScheduling.windowLabel(slot.start, slot.end)) + "</dd>" +
                '<dt class="col-sm-3">Schedule</dt><dd class="col-sm-9">' +
                    CadminScheduling.refHtml(slot.schedule) + "</dd>" +
                '<dt class="col-sm-3">Service</dt><dd class="col-sm-9">' +
                    esc(CadminScheduling.conceptLabel(slot.serviceType)) + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(slot.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function loadAppointments() {
        CadminApi.fhir("/Appointment?slot=" + encodeURIComponent(slot.id) + "&_sort=-date&_count=20")
            .done(function (bundle) {
                const rows = CadminApi.bundleResources(bundle, "Appointment");
                if (!rows.length) {
                    $("#sld-appt-rows").html('<tr><td colspan="4" class="text-muted">No appointments use this slot.</td></tr>');
                    return;
                }
                $("#sld-appt-rows").html(rows.map(function (appointment) {
                    const href = CadminApi.detailHref("Appointment", appointment.id);
                    return "<tr><td>" + CadminApi.resourceLink(href,
                        CadminScheduling.windowLabel(appointment.start, appointment.end)) +
                        "</td><td>" + CadminScheduling.statusBadge(appointment.status, CadminScheduling.appointmentStatus) +
                        "</td><td>" + CadminScheduling.refHtml(CadminScheduling.appointmentSubject(appointment)) +
                        '</td><td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                        '"><i class="bi bi-eye"></i></a></td></tr>';
                }).join(""));
            });
    }

    function render(resource) {
        slot = resource;
        $(CadminWorkspace.root()).html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/slots">' +
                        '<i class="bi bi-arrow-left me-1"></i>Slots</a>' +
                    '<h1 class="h3 mb-0 page-title" id="sld-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    (slot.status === "free"
                        ? '<a class="btn btn-primary" href="#/appointment-book?slot=' +
                            encodeURIComponent(slot.id) + '">Book this slot</a>'
                        : "") +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Slot</h6></div>' +
                '<div class="card-body" id="sld-basics"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Appointments</h6></div>' +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>When</th><th>Status</th><th>Subject</th><th></th></tr></thead>" +
                        '<tbody id="sld-appt-rows"><tr><td colspan="4" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table></div></div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card()
        );
        CadminResourceSource.mount(function () { return slot; });
        CadminResourceGraph.mount(slot);
        CadminResourceHistory.mount(slot);
        renderBasics();
        loadAppointments();
    }

    return { render: render };
}());
