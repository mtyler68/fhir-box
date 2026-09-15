CadminApp.register("feedback", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("feedback", token, function (resource, $root) {
            CadminFeedbackDetail.render(resource, $root);
        }, function () {
            renderFeedbackList();
        });
        return;
    }
    renderFeedbackList();
});

function renderFeedbackList() {
    const statusOptions = [
        { code: "preparation", display: "Preparation" },
        { code: "in-progress", display: "In progress" },
        { code: "on-hold", display: "On hold" },
        { code: "completed", display: "Completed" },
        { code: "not-done", display: "Not done" },
        { code: "stopped", display: "Stopped" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Feedback</h1>' +
        "</div>" +
        '<div id="feedback-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Feedback search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex flex-wrap gap-2" id="feedback-search-form">' +
                    '<select class="form-select form-select-sm" id="feedback-status-filter" style="max-width:10rem"></select>' +
                    '<select class="form-select form-select-sm" id="feedback-category-filter" style="max-width:14rem"></select>' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Subject</th><th>Type</th><th>Status</th><th>Sender</th>" +
                        "<th>Sent</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="feedback-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="feedback-pager"></div>' +
            "</div>" +
        "</div>"
    );

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function statusBadge(status) {
        const kind = status === "completed" ? "success"
            : status === "in-progress" ? "info"
                : status === "preparation" ? "warning"
                    : status === "entered-in-error" ? "danger"
                        : "secondary";
        return '<span class="badge text-bg-' + kind + '">' +
            esc(CadminApi.valueSetDisplay(statusOptions, status)) + "</span>";
    }

    function subjectOf(item) {
        const attachment = CadminFeedback.payloadAttachment(item);
        return attachment.title || (item.topic && item.topic.text) || "Untitled";
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        return ref.display || (ref.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function sentLabel(value) {
        if (!value) {
            return "—";
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    CadminApi.fillSelectOptions("#feedback-status-filter", statusOptions, { prepend: [{ code: "", display: "Any status" }] });
    CadminApi.fillSelectOptions("#feedback-category-filter", CadminFeedback.categories, {
        prepend: [{ code: "", display: "Any type" }]
    });

    let listPage = 0;

    function load(page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/Communication?_sort=-sent,-_lastUpdated";
        const status = $("#feedback-status-filter").val();
        const category = $("#feedback-category-filter").val();
        if (status) {
            path += "&status=" + encodeURIComponent(status);
        }
        if (category) {
            path += "&category=" + encodeURIComponent(CadminFeedback.CATEGORY_SYSTEM + "|" + category);
        }
        const pageSize = CadminApi.listPageSize("feedback");
        CadminDeletedList.query({ type: "Communication", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Communication").filter(function (item) {
                if (category) {
                    return true;
                }
                const coding = ((((item.category || [])[0] || {}).coding || [])[0] || {});
                return coding.system === CadminFeedback.CATEGORY_SYSTEM;
            });
            CadminApi.renderPager("#feedback-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "feedback",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(nextPage); }
            });
            if (!entries.length) {
                $("#feedback-rows").html(CadminDeletedList.emptyRow(7, "Communication",
                    "No feedback found."));
                return;
            }
            const rows = entries.map(function (item) {
                const title = subjectOf(item);
                const senderId = CadminApi.referenceId(item.sender);
                const senderHtml = senderId
                    ? CadminApi.resourceLink("#/practitioners/" + encodeURIComponent(senderId), refLabel(item.sender))
                    : esc(refLabel(item.sender));
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/feedback/" + encodeURIComponent(item.id), title) + "</td>" +
                    "<td>" + esc(CadminFeedback.categoryLabel(CadminFeedback.categoryOf(item))) + "</td>" +
                    "<td>" + statusBadge(item.status) + "</td>" +
                    "<td>" + senderHtml + "</td>" +
                    "<td>" + esc(sentLabel(item.sent)) + "</td>" +
                    "<td><code>" + esc(item.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' + CadminWorkspace.listBookmarkButton(item) +
                    '<a class="btn btn-sm btn-outline-primary" href="#/feedback/' +
                        encodeURIComponent(item.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td>' +
                    "</tr>";
            });
            $("#feedback-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#feedback-pager").empty();
            $("#feedback-rows").html('<tr><td colspan="7" class="text-danger">Unable to load feedback from /fhir.</td></tr>');
            CadminApi.showAlert("#feedback-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#feedback-search-form").on("submit", function (event) {
        event.preventDefault();
        load(0);
    });

    CadminDeletedList.bind({
        type: "Communication",
        reload: function () { load(listPage); }
    });
    load(0);
}
