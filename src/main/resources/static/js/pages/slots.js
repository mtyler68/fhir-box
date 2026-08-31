CadminApp.register("slots", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("slots", token, function (resource) {
            CadminSlotDetail.render(resource);
        }, function () {
            renderSlotList();
        });
        return;
    }
    renderSlotList();
});

function renderSlotList() {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Slots</h1>' +
        "</div>" +
        '<div id="slot-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Slot search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<form class="d-flex flex-wrap gap-2" id="slot-search-form">' +
                        '<select class="form-select form-select-sm" id="slot-status-filter" style="max-width:12rem">' +
                            '<option value="">Any status</option></select>' +
                        '<input type="date" class="form-control form-control-sm" id="slot-date">' +
                        '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                    "</form>" +
                    CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>When</th><th>Status</th><th>Schedule</th><th>Service</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="slot-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="slot-pager"></div>' +
            "</div>" +
        "</div>"
    );
    CadminApi.fillSelectOptions("#slot-status-filter", CadminScheduling.slotStatus, {
        prepend: [{ code: "", display: "Any status" }]
    });
    let listPage = 0;
    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/Slot?_sort=start";
        const status = $("#slot-status-filter").val();
        const date = $("#slot-date").val();
        if (status) {
            path += "&status=" + encodeURIComponent(status);
        }
        if (date) {
            path += "&start=ge" + date + "T00:00:00Z&start=le" + date + "T23:59:59Z";
        }
        const pageSize = CadminApi.listPageSize("slots");
        CadminDeletedList.query({ type: "Slot", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Slot");
            CadminApi.renderPager("#slot-pager", {
                page: listPage, size: pageSize, pageSizeKey: "slots",
                returned: entries.length, total: bundle.total, bundle: bundle,
                onPage: function (next) { load(next); }
            });
            if (!entries.length) {
                $("#slot-rows").html(CadminDeletedList.emptyRow(6, "Slot",
                    "No slots found. Generate them from a schedule."));
                return;
            }
            $("#slot-rows").html(entries.map(function (slot) {
                const href = CadminApi.detailHref("Slot", slot.id);
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink(href, CadminScheduling.windowLabel(slot.start, slot.end)) + "</td>" +
                    "<td>" + CadminScheduling.statusBadge(slot.status, CadminScheduling.slotStatus) + "</td>" +
                    "<td>" + CadminScheduling.refHtml(slot.schedule) + "</td>" +
                    "<td>" + CadminApi.escapeHtml(CadminScheduling.conceptLabel(slot.serviceType)) + "</td>" +
                    "<td><code>" + CadminApi.escapeHtml(slot.id) + "</code></td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + href +
                        '"><i class="bi bi-eye"></i></a></td></tr>';
            }).join(""));
        }).fail(function (xhr) {
            $("#slot-pager").empty();
            $("#slot-rows").html('<tr><td colspan="6" class="text-danger">Unable to load slots from /fhir.</td></tr>');
            CadminApi.showAlert("#slot-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }
    $("#slot-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });
    CadminDeletedList.bind({ type: "Slot", reload: function () { load(0); } });
    load(0);
}
