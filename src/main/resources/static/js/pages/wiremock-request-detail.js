window.CadminWiremockRequestDetail = (function () {
    const wm = function () { return CadminWiremock; };

    let logged = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function requestOf() {
        return (logged && logged.request) || {};
    }

    function responseOf() {
        return (logged && (logged.response || logged.responseDefinition)) || {};
    }

    function prettyBody(text) {
        if (text == null || text === "") {
            return "";
        }
        const raw = String(text);
        try {
            return JSON.stringify(JSON.parse(raw), null, 2);
        } catch (error) {
            return raw;
        }
    }

    function headerEntries(headers) {
        return Object.keys(headers || {}).map(function (name) {
            const value = headers[name];
            return {
                name: name,
                value: value != null && typeof value === "object" ? JSON.stringify(value) : String(value)
            };
        });
    }

    function headerTable(headers, emptyText) {
        const rows = headerEntries(headers);
        if (!rows.length) {
            return '<p class="text-muted mb-0">' + esc(emptyText) + "</p>";
        }
        return '<div class="table-responsive">' +
            '<table class="table table-sm table-hover align-middle mb-0">' +
                "<thead><tr><th>Name</th><th>Value</th></tr></thead>" +
                "<tbody>" + rows.map(function (row) {
                    return "<tr><td><code>" + esc(row.name) + "</code></td>" +
                        "<td><code>" + esc(row.value) + "</code></td></tr>";
                }).join("") + "</tbody>" +
            "</table></div>";
    }

    function bodyBlock(text, emptyText) {
        const pretty = prettyBody(text);
        if (!pretty) {
            return '<p class="text-muted mb-0">' + esc(emptyText) + "</p>";
        }
        return '<pre class="mb-0 font-monospace small">' + esc(pretty) + "</pre>";
    }

    function queryTable(params) {
        const keys = Object.keys(params || {});
        if (!keys.length) {
            return "";
        }
        return '<div class="table-responsive">' +
            '<table class="table table-sm table-hover align-middle mb-0">' +
                "<thead><tr><th>Name</th><th>Value</th></tr></thead>" +
                "<tbody>" + keys.map(function (name) {
                    const value = params[name];
                    const text = value != null && typeof value === "object" ? JSON.stringify(value) : String(value);
                    return "<tr><td><code>" + esc(name) + "</code></td>" +
                        "<td><code>" + esc(text) + "</code></td></tr>";
                }).join("") + "</tbody>" +
            "</table></div>";
    }

    function matchedBadge() {
        return logged && logged.wasMatched
            ? '<span class="badge text-bg-success">Yes</span>'
            : '<span class="badge text-bg-warning">No</span>';
    }

    function stubHtml() {
        const stub = wm().matchedMapping(logged);
        if (!stub) {
            return "—";
        }
        return CadminApi.resourceLink(wm().mappingHref(stub.id), wm().mappingLabel(stub));
    }

    function titleText() {
        const request = requestOf();
        const method = request.method || "Request";
        const url = wm().requestUrl(logged);
        return method + " " + url;
    }

    function remove() {
        const id = logged && logged.id;
        if (!id) {
            return;
        }
        CadminApi.confirm("Delete this logged request?").done(function () {
            CadminApi.wiremock("/__admin/requests/" + encodeURIComponent(id), "DELETE").done(function () {
                CadminApi.showToast("success", "Request deleted.");
                window.location.hash = "#/wiremock-requests";
            }).fail(function (xhr) {
                CadminApi.showToast("danger", wm().fail("Delete request", xhr));
            });
        });
    }

    function openCreated(mapping) {
        if (mapping && mapping.id) {
            CadminApi.showToast("success", "Stub mapping created.");
            window.location.hash = wm().mappingHref(mapping.id);
            return true;
        }
        return false;
    }

    function postFallbackMapping() {
        const mapping = wm().mappingFromLogged(logged);
        CadminApi.wiremock("/__admin/mappings", "POST", mapping).done(function (created) {
            if (!openCreated(created)) {
                CadminApi.showToast("success", "Stub mapping created.");
                window.location.hash = "#/wiremock-mappings";
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", wm().fail("Create stub", xhr));
        });
    }

    function createStub() {
        const id = logged && logged.id;
        if (!id) {
            CadminApi.showToast("danger", "This request has no ID.");
            return;
        }
        $("#wrd-stub").prop("disabled", true);
        CadminApi.wiremock("/__admin/recordings/snapshot", "POST", {
            filters: {
                ids: [id],
                allowNonProxied: true
            },
            persist: false,
            repeatsAsScenarios: false,
            outputFormat: "FULL",
            captureHeaders: {
                Accept: {},
                "Content-Type": { caseInsensitive: true }
            }
        }).done(function (body) {
            const created = ((body && body.mappings) || [])[0];
            if (openCreated(created)) {
                return;
            }
            postFallbackMapping();
        }).fail(function () {
            postFallbackMapping();
        }).always(function () {
            $("#wrd-stub").prop("disabled", false);
        });
    }

    function bind() {
        const $root = $("#app-content");
        $root.off(".wrd");
        $root.on("click.wrd", "#wrd-delete", remove);
        $root.on("click.wrd", "#wrd-stub", createStub);
        $root.on("click.wrd", "#wrd-json", function () {
            wm().showJson(logged, "Logged request");
        });
    }

    function renderSummary() {
        const request = requestOf();
        const timing = (logged && logged.timing) || {};
        $("#wrd-crumb").text(titleText());
        $("#wrd-title").text(titleText());
        $("#wrd-subtitle").html(
            esc(wm().formatTime(logged)) + " · " +
            esc(String(wm().requestStatus(logged))) + " · " +
            (logged && logged.wasMatched ? "Matched" : "Unmatched")
        );
        $("#wrd-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">When</dt><dd class="col-sm-9">' + esc(wm().formatTime(logged)) + "</dd>" +
                '<dt class="col-sm-3">Method</dt><dd class="col-sm-9"><code>' +
                    esc(request.method || "—") + "</code></dd>" +
                '<dt class="col-sm-3">URL</dt><dd class="col-sm-9"><code>' +
                    esc(wm().requestUrl(logged)) + "</code></dd>" +
                (request.absoluteUrl
                    ? '<dt class="col-sm-3">Absolute URL</dt><dd class="col-sm-9"><code>' +
                        esc(request.absoluteUrl) + "</code></dd>"
                    : "") +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    esc(String(wm().requestStatus(logged))) + "</dd>" +
                '<dt class="col-sm-3">Matched</dt><dd class="col-sm-9">' + matchedBadge() + "</dd>" +
                '<dt class="col-sm-3">Stub</dt><dd class="col-sm-9">' + stubHtml() + "</dd>" +
                '<dt class="col-sm-3">Client IP</dt><dd class="col-sm-9">' +
                    esc(request.clientIp || "—") + "</dd>" +
                '<dt class="col-sm-3">Protocol</dt><dd class="col-sm-9">' +
                    esc(request.protocol || "—") + "</dd>" +
                (timing.totalTime != null
                    ? '<dt class="col-sm-3">Serve time</dt><dd class="col-sm-9">' +
                        esc(String(timing.totalTime)) + " ms</dd>"
                    : "") +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' +
                    esc(logged.id || "—") + "</code></dd>" +
            "</dl>"
        );
    }

    function renderPayloads() {
        const request = requestOf();
        const response = responseOf();
        const queryHtml = queryTable(request.queryParams);
        $("#wrd-req-headers").html(headerTable(request.headers, "No request headers."));
        $("#wrd-req-query-card").toggleClass("d-none", !queryHtml);
        if (queryHtml) {
            $("#wrd-req-query").html(queryHtml);
        }
        $("#wrd-req-body").html(bodyBlock(request.body, "Empty request body."));
        $("#wrd-res-headers").html(headerTable(response.headers, "No response headers."));
        $("#wrd-res-body").html(bodyBlock(response.body, "Empty response body."));
    }

    function renderShell() {
        const $root = $("#app-content");
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<nav aria-label="breadcrumb">' +
                        '<ol class="breadcrumb mb-1">' +
                            '<li class="breadcrumb-item"><a href="#/wiremock-requests">Requests</a></li>' +
                            '<li class="breadcrumb-item active" aria-current="page" id="wrd-crumb">Request</li>' +
                        "</ol>" +
                    "</nav>" +
                    '<h1 class="h3 mb-0 page-title" id="wrd-title">Logged request</h1>' +
                    '<p class="text-muted mb-0" id="wrd-subtitle"></p>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-primary" type="button" id="wrd-stub">' +
                        '<i class="bi bi-signpost-split me-1"></i>Create stub</button>' +
                    '<button class="btn btn-outline-primary" type="button" id="wrd-json">' +
                        '<i class="bi bi-code-slash me-1"></i>JSON</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="wrd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                "</div>" +
            "</div>" +
            '<div id="wrd-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Summary</h6></div>' +
                '<div class="card-body" id="wrd-basics"></div>' +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Request headers</h6></div>' +
                        '<div class="card-body" id="wrd-req-headers"></div>' +
                    "</div>" +
                    '<div class="card shadow mb-4 d-none" id="wrd-req-query-card">' +
                        '<div class="card-header py-3"><h6 class="m-0">Query parameters</h6></div>' +
                        '<div class="card-body" id="wrd-req-query"></div>' +
                    "</div>" +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Request body</h6></div>' +
                        '<div class="card-body" id="wrd-req-body"></div>' +
                    "</div>" +
                "</div>" +
                '<div class="col-lg-6">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Response headers</h6></div>' +
                        '<div class="card-body" id="wrd-res-headers"></div>' +
                    "</div>" +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Response body</h6></div>' +
                        '<div class="card-body" id="wrd-res-body"></div>' +
                    "</div>" +
                "</div>" +
            "</div>"
        );
    }

    function render(id) {
        logged = null;
        const $root = $("#app-content");
        $root.html('<div class="text-muted py-5 text-center">Loading…</div>');
        CadminApi.wiremock("/__admin/requests/" + encodeURIComponent(id)).done(function (resource) {
            logged = resource || {};
            renderShell();
            renderSummary();
            renderPayloads();
            bind();
        }).fail(function (xhr) {
            $root.html(
                '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                    "<div>" +
                        '<a class="small text-decoration-none" href="#/wiremock-requests">' +
                            '<i class="bi bi-arrow-left me-1"></i>Requests</a>' +
                        '<h1 class="h3 mb-0 page-title">Logged request</h1>' +
                    "</div>" +
                "</div>" +
                '<div class="alert alert-danger">' + esc(wm().fail("Load request", xhr)) + "</div>"
            );
        });
    }

    return {
        render: render
    };
}());
