CadminApp.register("appointment-responses", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("appointment-responses", token, function (resource) {
            CadminAppointmentResponseDetail.render(resource);
        }, function () {
            renderAppointmentResponseList();
        });
        return;
    }
    renderAppointmentResponseList();
});

function renderAppointmentResponseList() {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Appointment responses</h1>' +
        "</div>" +
        '<div id="appointment-response-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Response search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<form class="d-flex flex-wrap gap-2" id="appointment-response-search-form">' +
                        '<select class="form-select form-select-sm" id="appointment-response-status-filter" style="max-width:12rem">' +
                            '<option value="">Any status</option></select>' +
                        '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                    "</form>" +
                    CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Appointment</th><th>Actor</th><th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="appointment-response-rows"><tr><td colspan="5" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="appointment-response-pager"></div>' +
            "</div>" +
        "</div>"
    );
    CadminApi.fillSelectOptions("#appointment-response-status-filter", CadminScheduling.responseStatus, {
        prepend: [{ code: "", display: "Any status" }]
    });
    let listPage = 0;
    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/AppointmentResponse?_sort=-_lastUpdated";
        const status = $("#appointment-response-status-filter").val();
        if (status) {
            path += "&part-status=" + encodeURIComponent(status);
        }
        const pageSize = CadminApi.listPageSize("appointment-responses");
        CadminDeletedList.query({ type: "AppointmentResponse", path: path, page: listPage, size: pageSize })
            .done(function (bundle) {
                const entries = CadminApi.bundleResources(bundle, "AppointmentResponse");
                CadminApi.renderPager("#appointment-response-pager", {
                    page: listPage, size: pageSize, pageSizeKey: "appointment-responses",
                    returned: entries.length, total: bundle.total, bundle: bundle,
                    onPage: function (next) { load(next); }
                });
                if (!entries.length) {
                    $("#appointment-response-rows").html(CadminDeletedList.emptyRow(5, "AppointmentResponse",
                        "No appointment responses found."));
                    return;
                }
                $("#appointment-response-rows").html(entries.map(function (item) {
                    const href = CadminApi.detailHref("AppointmentResponse", item.id);
                    return "<tr>" +
                        "<td>" + CadminScheduling.refHtml(item.appointment) + "</td>" +
                        "<td>" + CadminScheduling.refHtml(item.actor) + "</td>" +
                        "<td>" + CadminScheduling.statusBadge(item.participantStatus, CadminScheduling.responseStatus) + "</td>" +
                        "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
                        '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                            '"><i class="bi bi-eye"></i></a></td></tr>';
                }).join(""));
            }).fail(function (xhr) {
                $("#appointment-response-pager").empty();
                $("#appointment-response-rows").html(
                    '<tr><td colspan="5" class="text-danger">Unable to load appointment responses from /fhir.</td></tr>');
                CadminApi.showAlert("#appointment-response-alert", "danger",
                    "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
            });
    }
    $("#appointment-response-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });
    CadminDeletedList.bind({ type: "AppointmentResponse", reload: function () { load(0); } });
    load(0);
}
