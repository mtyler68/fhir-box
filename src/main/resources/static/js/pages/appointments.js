CadminApp.register("appointments", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("appointments", token, function (resource) {
            CadminAppointmentDetail.render(resource);
        }, function () {
            renderAppointmentList();
        });
        return;
    }
    renderAppointmentList();
});

function renderAppointmentList() {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Appointments</h1>' +
            '<a class="btn btn-primary" href="#/appointment-book">' +
                '<i class="bi bi-calendar-plus me-1"></i>Find and book</a>' +
        "</div>" +
        '<div id="appointment-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Appointment worklist</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<form class="d-flex flex-wrap gap-2" id="appointment-search-form">' +
                        '<select class="form-select form-select-sm" id="appointment-status-filter" style="max-width:12rem">' +
                            '<option value="">Any status</option></select>' +
                        '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                    "</form>" +
                    CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>When</th><th>Status</th><th>Subject</th><th>Service</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="appointment-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="appointment-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3"><h6 class="m-0">Waitlists</h6></div>' +
            '<div class="card-body"><div class="table-responsive">' +
                '<table class="table table-hover align-middle mb-0">' +
                    "<thead><tr><th>Title</th><th>Entries</th><th>ID</th><th></th></tr></thead>" +
                    '<tbody id="waitlist-rows"><tr><td colspan="4" class="text-muted">Loading…</td></tr></tbody>' +
                "</table></div></div>" +
        "</div>"
    );
    CadminApi.fillSelectOptions("#appointment-status-filter", CadminScheduling.appointmentStatus, {
        prepend: [{ code: "", display: "Any status" }]
    });
    let listPage = 0;
    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/Appointment?_sort=-date";
        const status = $("#appointment-status-filter").val();
        if (status) {
            path += "&status=" + encodeURIComponent(status);
        }
        const pageSize = CadminApi.listPageSize("appointments");
        CadminDeletedList.query({ type: "Appointment", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Appointment");
            CadminApi.renderPager("#appointment-pager", {
                page: listPage, size: pageSize, pageSizeKey: "appointments",
                returned: entries.length, total: bundle.total, bundle: bundle,
                onPage: function (next) { load(next); }
            });
            if (!entries.length) {
                $("#appointment-rows").html(CadminDeletedList.emptyRow(6, "Appointment",
                    "No appointments. Use Find and book — do not POST Appointment directly."));
                return;
            }
            $("#appointment-rows").html(entries.map(function (appointment) {
                const href = CadminApi.detailHref("Appointment", appointment.id);
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink(href, CadminScheduling.windowLabel(appointment.start, appointment.end)) + "</td>" +
                    "<td>" + CadminScheduling.statusBadge(appointment.status, CadminScheduling.appointmentStatus) + "</td>" +
                    "<td>" + CadminScheduling.refHtml(CadminScheduling.appointmentSubject(appointment)) + "</td>" +
                    "<td>" + CadminApi.escapeHtml(CadminScheduling.conceptLabel(appointment.serviceType)) + "</td>" +
                    "<td><code>" + CadminApi.escapeHtml(appointment.id) + "</code></td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                        '"><i class="bi bi-eye"></i></a></td></tr>';
            }).join(""));
        }).fail(function (xhr) {
            $("#appointment-pager").empty();
            $("#appointment-rows").html('<tr><td colspan="6" class="text-danger">Unable to load appointments from /fhir.</td></tr>');
            CadminApi.showAlert("#appointment-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }
    function loadWaitlists() {
        CadminApi.fhir("/List?code=https://cadmin.io/fhir/CodeSystem/schedule-list|waitlist&status=current&_count=20")
            .done(function (bundle) {
                const lists = CadminApi.bundleResources(bundle, "List");
                if (!lists.length) {
                    $("#waitlist-rows").html('<tr><td colspan="4" class="text-muted">No waitlist Lists.</td></tr>');
                    return;
                }
                $("#waitlist-rows").html(lists.map(function (item) {
                    const href = CadminApi.detailHref("List", item.id);
                    return "<tr><td>" + CadminApi.resourceLink(href, item.title || "Waitlist") +
                        "</td><td>" + CadminApi.escapeHtml(String((item.entry || []).length)) +
                        "</td><td><code>" + CadminApi.escapeHtml(item.id) +
                        '</code></td><td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' +
                        href + '"><i class="bi bi-eye"></i></a></td></tr>';
                }).join(""));
            }).fail(function () {
                $("#waitlist-rows").html('<tr><td colspan="4" class="text-muted">Unable to load waitlists.</td></tr>');
            });
    }
    $("#appointment-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });
    CadminDeletedList.bind({ type: "Appointment", reload: function () { load(0); } });
    load(0);
    loadWaitlists();
}
