CadminApp.register("wiremock-requests", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWiremockRequestDetail.render(token);
        return;
    }
    renderWiremockRequestList();
});

function renderWiremockRequestList() {
    const wm = CadminWiremock;
    const $root = $("#app-content");
    $root.off(".wmreq");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">WireMock requests</h1>' +
            '<button class="btn btn-outline-danger" type="button" id="wm-req-clear">' +
                '<i class="bi bi-trash me-1"></i>Clear journal</button>' +
        "</div>" +
        '<div id="wm-req-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                "<h6 class=\"m-0\">Request journal</h6>" +
                '<form class="d-flex align-items-center gap-2" id="wm-req-search-form">' +
                    '<div class="form-check mb-0">' +
                        '<input class="form-check-input" type="checkbox" id="wm-req-unmatched">' +
                        '<label class="form-check-label small" for="wm-req-unmatched">Unmatched only</label>' +
                    "</div>" +
                    '<input class="form-control form-control-sm" id="wm-req-query" placeholder="Method or URL">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>When</th><th>Method</th><th>URL</th><th>Status</th>" +
                        "<th>Matched</th><th>Stub</th><th></th></tr></thead>" +
                        '<tbody id="wm-req-rows">' + wm.emptyRow(7, "Loading…") + "</tbody>" +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="wm-req-pager"></div>' +
            "</div>" +
        "</div>"
    );

    let listPage = 0;
    let query = "";

    function unmatchedOnly() {
        return $("#wm-req-unmatched").prop("checked");
    }

    function load(nextQuery, page) {
        query = nextQuery == null ? query : String(nextQuery).trim();
        listPage = typeof page === "number" ? page : 0;
        const pageSize = CadminApi.listPageSize("wiremock-requests");
        let path = "/__admin/requests?limit=500";
        if (unmatchedOnly()) {
            path += "&unmatched=true";
        }
        CadminApi.wiremock(path).done(function (body) {
            if (body && body.requestJournalDisabled) {
                CadminApi.showAlert("#wm-req-alert", "warning",
                    "The WireMock request journal is disabled on this server.");
            } else {
                $("#wm-req-alert").addClass("d-none");
            }
            let requests = (body && body.requests) || [];
            if (query) {
                requests = requests.filter(function (item) {
                    const request = item.request || {};
                    const stub = wm.matchedMapping(item);
                    return wm.matchesQuery([
                        request.method,
                        wm.requestUrl(item),
                        item.id,
                        stub && stub.name,
                        stub && stub.id
                    ].join(" "), query);
                });
            }
            const total = requests.length;
            const page = Math.min(listPage, Math.max(0, Math.ceil(total / pageSize) - 1));
            listPage = page < 0 ? 0 : page;
            const start = listPage * pageSize;
            requests = requests.slice(start, start + pageSize);
            CadminApi.renderPager("#wm-req-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "wiremock-requests",
                returned: requests.length,
                total: total,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!requests.length) {
                $("#wm-req-rows").html(wm.emptyRow(7, "No recorded requests."));
                return;
            }
            $("#wm-req-rows").html(requests.map(function (item) {
                const id = item.id || "";
                const href = id ? wm.requestHref(id) : "#/wiremock-requests";
                const method = ((item.request || {}).method) || "—";
                const matched = item.wasMatched;
                const stub = wm.matchedMapping(item);
                const stubCell = stub
                    ? CadminApi.resourceLink(wm.mappingHref(stub.id), wm.mappingLabel(stub))
                    : '<span class="text-muted">—</span>';
                return "<tr>" +
                    "<td>" + (id
                        ? CadminApi.resourceLink(href, wm.formatTime(item))
                        : wm.esc(wm.formatTime(item))) + "</td>" +
                    "<td><code>" + wm.esc(method) + "</code></td>" +
                    "<td><code>" + wm.esc(wm.requestUrl(item)) + "</code></td>" +
                    "<td>" + wm.esc(String(wm.requestStatus(item))) + "</td>" +
                    "<td>" + (matched
                        ? '<span class="badge text-bg-success">Yes</span>'
                        : '<span class="badge text-bg-warning">No</span>') + "</td>" +
                    "<td>" + stubCell + "</td>" +
                    '<td class="text-end">' +
                        '<a class="btn btn-sm btn-outline-primary" href="' + wm.esc(href) +
                            '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                    "</td></tr>";
            }).join(""));
        }).fail(function (xhr) {
            $("#wm-req-pager").empty();
            $("#wm-req-rows").html(wm.emptyRow(7, "Unable to load requests from WireMock."));
            CadminApi.showAlert("#wm-req-alert", "danger", wm.fail("Load requests", xhr));
        });
    }

    $root.on("submit.wmreq", "#wm-req-search-form", function (event) {
        event.preventDefault();
        load($("#wm-req-query").val(), 0);
    });

    $root.on("change.wmreq", "#wm-req-unmatched", function () {
        load(query, 0);
    });

    $root.on("click.wmreq", "#wm-req-clear", function () {
        if (!window.confirm("Clear the entire WireMock request journal?")) {
            return;
        }
        CadminApi.wiremock("/__admin/requests", "DELETE").done(function () {
            CadminApi.showToast("success", "Request journal cleared.");
            load();
        }).fail(function (xhr) {
            CadminApi.showToast("danger", wm.fail("Clear journal", xhr));
        });
    });

    load("", 0);
}
