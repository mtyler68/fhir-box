window.CadminWiremockMappingDetail = (function () {
    const wm = function () { return CadminWiremock; };
    const METHODS = [
        "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "ANY", "GET_OR_HEAD"
    ];
    const URL_KINDS = [
        { code: "urlPath", display: "Path" },
        { code: "url", display: "URL (with query)" },
        { code: "urlPathPattern", display: "Path regex" },
        { code: "urlPattern", display: "URL regex" },
        { code: "urlPathTemplate", display: "Path template" }
    ];
    const BODY_KINDS = [
        { code: "json", display: "JSON" },
        { code: "text", display: "Text" },
        { code: "base64", display: "Base64" },
        { code: "proxy", display: "Proxy" },
        { code: "empty", display: "Empty" }
    ];
    const BODY_MATCHERS = [
        { code: "equalTo", display: "Equal to" },
        { code: "equalToJson", display: "Equal to JSON" },
        { code: "equalToXml", display: "Equal to XML" },
        { code: "contains", display: "Contains" },
        { code: "doesNotContain", display: "Does not contain" },
        { code: "matches", display: "Matches regex" },
        { code: "doesNotMatch", display: "Does not match regex" },
        { code: "matchesJsonPath", display: "JSONPath" },
        { code: "matchesXPath", display: "XPath" },
        { code: "binaryEqualTo", display: "Binary (Base64)" },
        { code: "absent", display: "Absent" },
        { code: "custom", display: "Custom JSON" }
    ];
    const MATCHER_CODES = BODY_MATCHERS.map(function (item) { return item.code; })
        .filter(function (code) { return code !== "custom"; });

    let mapping = null;
    let editor = null;
    let lastEdited = "form";
    let syncing = false;
    let editingPatternIndex = -1;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const code = item.code != null ? item.code : item;
            const display = item.display != null ? item.display : item;
            return '<option value="' + esc(code) + '"' + (code === selected ? " selected" : "") + ">" +
                esc(display) + "</option>";
        }).join("");
    }

    function field(label, control) {
        return '<div class="mb-3"><label class="form-label">' + label + "</label>" + control + "</div>";
    }

    function destroyEditor() {
        if (editor) {
            editor.toTextArea();
            editor = null;
        }
    }

    function editorText() {
        return editor ? editor.getValue() : ($("#wmd-json").val() || "");
    }

    function setEditorText(text) {
        if (editor) {
            editor.setValue(text);
        } else {
            $("#wmd-json").val(text);
        }
    }

    function pretty(value) {
        return JSON.stringify(value || {}, null, 2);
    }

    function parseEditor() {
        try {
            const value = JSON.parse(editorText());
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                return null;
            }
            return value;
        } catch (error) {
            return null;
        }
    }

    function fillForm(resource) {
        const request = (resource && resource.request) || {};
        const response = (resource && resource.response) || {};
        const urlField = wm().mappingUrlField(request);
        const bodyKind = wm().responseBodyKind(response);
        $("#wmd-name").val(resource.name || "");
        $("#wmd-priority").val(resource.priority != null ? resource.priority : "");
        $("#wmd-persistent").prop("checked", !!resource.persistent);
        $("#wmd-method").val(request.method || "GET");
        $("#wmd-url-kind").val(urlField);
        $("#wmd-url").val(request[urlField] || "");
        $("#wmd-status").val(response.status != null ? response.status : 200);
        $("#wmd-body-kind").val(bodyKind);
        $("#wmd-body").val(wm().responseBodyText(response));
        $("#wmd-headers").val(wm().formatHeaders(response.headers));
        $("#wmd-scenario-name").val(resource.scenarioName || "");
        $("#wmd-scenario-required").val(resource.requiredScenarioState || "");
        $("#wmd-scenario-new").val(resource.newScenarioState || "");
        syncBodyPlaceholder();
        renderBodyPatterns();
    }

    function syncBodyPlaceholder() {
        const kind = $("#wmd-body-kind").val();
        const placeholders = {
            json: '{ "ok": true }',
            text: "Response body",
            base64: "base64 payload",
            proxy: "http://example.org",
            empty: ""
        };
        $("#wmd-body").prop("disabled", kind === "empty")
            .attr("placeholder", placeholders[kind] || "");
    }

    function applyForm(resource) {
        const next = JSON.parse(JSON.stringify(resource || {}));
        next.request = next.request || {};
        next.response = next.response || {};
        const name = $("#wmd-name").val().trim();
        if (name) {
            next.name = name;
        } else {
            delete next.name;
        }
        const priority = $("#wmd-priority").val().trim();
        if (priority !== "" && !isNaN(Number(priority))) {
            next.priority = Number(priority);
        } else {
            delete next.priority;
        }
        if ($("#wmd-persistent").prop("checked")) {
            next.persistent = true;
        } else {
            delete next.persistent;
        }
        next.request.method = $("#wmd-method").val() || "GET";
        wm().URL_FIELDS.forEach(function (fieldName) {
            delete next.request[fieldName];
        });
        const urlField = $("#wmd-url-kind").val() || "urlPath";
        const url = $("#wmd-url").val().trim();
        if (url) {
            next.request[urlField] = url;
        }
        const status = Number($("#wmd-status").val());
        next.response.status = isNaN(status) ? 200 : status;
        delete next.response.jsonBody;
        delete next.response.body;
        delete next.response.base64Body;
        delete next.response.proxyBaseUrl;
        const bodyKind = $("#wmd-body-kind").val();
        const bodyText = $("#wmd-body").val();
        if (bodyKind === "json") {
            try {
                next.response.jsonBody = bodyText.trim() ? JSON.parse(bodyText) : {};
            } catch (error) {
                throw new Error("Response JSON is not valid.");
            }
        } else if (bodyKind === "text") {
            next.response.body = bodyText;
        } else if (bodyKind === "base64") {
            next.response.base64Body = bodyText.trim();
        } else if (bodyKind === "proxy") {
            next.response.proxyBaseUrl = bodyText.trim();
        }
        const headers = wm().parseHeaders($("#wmd-headers").val());
        if (Object.keys(headers).length) {
            next.response.headers = headers;
        } else {
            delete next.response.headers;
        }
        const scenario = $("#wmd-scenario-name").val().trim();
        const required = $("#wmd-scenario-required").val().trim();
        const nextState = $("#wmd-scenario-new").val().trim();
        if (scenario) {
            next.scenarioName = scenario;
        } else {
            delete next.scenarioName;
        }
        if (required) {
            next.requiredScenarioState = required;
        } else {
            delete next.requiredScenarioState;
        }
        if (nextState) {
            next.newScenarioState = nextState;
        } else {
            delete next.newScenarioState;
        }
        if (next.request.bodyPatterns && !next.request.bodyPatterns.length) {
            delete next.request.bodyPatterns;
        }
        return next;
    }

    function currentMapping() {
        if (lastEdited === "json") {
            const parsed = parseEditor();
            if (!parsed) {
                throw new Error("Mapping JSON is not valid.");
            }
            return parsed;
        }
        return applyForm(mapping);
    }

    function refreshJsonFromForm() {
        if (syncing) {
            return;
        }
        try {
            mapping = applyForm(mapping);
        } catch (error) {
            return;
        }
        syncing = true;
        setEditorText(pretty(mapping));
        syncing = false;
    }

    function refreshFormFromJson() {
        const parsed = parseEditor();
        if (!parsed) {
            return false;
        }
        mapping = parsed;
        syncing = true;
        fillForm(mapping);
        syncing = false;
        return true;
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function bodyPatterns() {
        const list = mapping && mapping.request && mapping.request.bodyPatterns;
        return Array.isArray(list) ? list : [];
    }

    function setBodyPatterns(list) {
        mapping = mapping || {};
        mapping.request = mapping.request || {};
        if (list && list.length) {
            mapping.request.bodyPatterns = list;
        } else {
            delete mapping.request.bodyPatterns;
        }
    }

    function matcherLabel(code) {
        const match = BODY_MATCHERS.find(function (item) { return item.code === code; });
        return match ? match.display : (code || "Custom JSON");
    }

    function patternMatcher(pattern) {
        if (!pattern || typeof pattern !== "object") {
            return "custom";
        }
        const keys = Object.keys(pattern).filter(function (key) {
            return MATCHER_CODES.indexOf(key) >= 0;
        });
        return keys.length === 1 ? keys[0] : "custom";
    }

    function patternValueText(pattern, matcher) {
        if (!pattern || matcher === "absent" || matcher === "custom") {
            return "";
        }
        const value = pattern[matcher];
        if (value == null) {
            return "";
        }
        if (typeof value === "object") {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    }

    function patternFlags(pattern, matcher) {
        const flags = [];
        if (!pattern) {
            return flags;
        }
        if (matcher === "equalToJson") {
            if (pattern.ignoreArrayOrder) {
                flags.push("ignore order");
            }
            if (pattern.ignoreExtraElements) {
                flags.push("ignore extra");
            }
        } else if (matcher === "equalToXml") {
            if (pattern.enablePlaceholders) {
                flags.push("placeholders");
            }
        } else if (pattern.caseInsensitive) {
            flags.push("case insensitive");
        }
        return flags;
    }

    function previewText(text) {
        const oneLine = String(text || "").replace(/\s+/g, " ").trim();
        if (!oneLine) {
            return "—";
        }
        return oneLine.length > 80 ? oneLine.slice(0, 77) + "…" : oneLine;
    }

    function renderBodyPatterns() {
        const patterns = bodyPatterns();
        if (!patterns.length) {
            $("#wmd-pattern-rows").html(
                '<tr><td colspan="4" class="text-muted">No body patterns. The stub matches any request body.</td></tr>'
            );
            return;
        }
        $("#wmd-pattern-rows").html(patterns.map(function (pattern, index) {
            const matcher = patternMatcher(pattern);
            const value = matcher === "custom"
                ? pretty(pattern)
                : matcher === "absent" ? "" : patternValueText(pattern, matcher);
            const flags = patternFlags(pattern, matcher);
            return "<tr>" +
                "<td>" + esc(matcherLabel(matcher)) + "</td>" +
                "<td><code>" + esc(previewText(value)) + "</code></td>" +
                "<td>" + (flags.length ? esc(flags.join(", ")) : "—") + "</td>" +
                '<td class="text-end text-nowrap">' +
                    '<button class="btn btn-sm btn-outline-primary me-1" type="button" data-edit-pattern="' +
                        index + '" title="Edit"><i class="bi bi-pencil"></i></button>' +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-pattern="' +
                        index + '" title="Remove"><i class="bi bi-trash"></i></button>' +
                "</td></tr>";
        }).join(""));
    }

    function syncPatternFields() {
        const matcher = $("#wmd-bp-matcher").val();
        const isCustom = matcher === "custom";
        const isAbsent = matcher === "absent";
        $("#wmd-bp-value-wrap").toggleClass("d-none", isCustom || isAbsent);
        $("#wmd-bp-json-wrap").toggleClass("d-none", !isCustom);
        $("#wmd-bp-json-flags").toggleClass("d-none", matcher !== "equalToJson");
        $("#wmd-bp-xml-flags").toggleClass("d-none", matcher !== "equalToXml");
        $("#wmd-bp-case-flags").toggleClass("d-none",
            matcher !== "equalTo" && matcher !== "contains" && matcher !== "doesNotContain"
                && matcher !== "matches" && matcher !== "doesNotMatch");
        const placeholders = {
            equalTo: "Exact request body",
            equalToJson: '{ "id": "123" }',
            equalToXml: "<root/>",
            contains: "substring",
            doesNotContain: "substring",
            matches: ".*pattern.*",
            doesNotMatch: ".*pattern.*",
            matchesJsonPath: "$.patient.id",
            matchesXPath: "/root/id",
            binaryEqualTo: "base64 payload"
        };
        $("#wmd-bp-value").attr("placeholder", placeholders[matcher] || "");
    }

    function fillPatternForm(pattern) {
        pattern = pattern || {};
        const matcher = patternMatcher(pattern);
        $("#wmd-bp-matcher").val(matcher === "custom" || MATCHER_CODES.indexOf(matcher) >= 0 ? matcher : "custom");
        $("#wmd-bp-value").val(patternValueText(pattern, matcher));
        $("#wmd-bp-json").val(matcher === "custom" ? pretty(pattern) : "{}");
        $("#wmd-bp-ignore-order").prop("checked", !!pattern.ignoreArrayOrder);
        $("#wmd-bp-ignore-extra").prop("checked", !!pattern.ignoreExtraElements);
        $("#wmd-bp-placeholders").prop("checked", !!pattern.enablePlaceholders);
        $("#wmd-bp-case").prop("checked", !!pattern.caseInsensitive);
        $("#wmd-pattern-modal .modal-title").text(editingPatternIndex >= 0 ? "Edit body pattern" : "Add body pattern");
        syncPatternFields();
    }

    function readPatternForm() {
        const matcher = $("#wmd-bp-matcher").val() || "equalTo";
        if (matcher === "custom") {
            const parsed = JSON.parse($("#wmd-bp-json").val() || "{}");
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error("Body pattern JSON must be an object.");
            }
            return parsed;
        }
        const pattern = {};
        if (matcher === "absent") {
            pattern.absent = true;
            return pattern;
        }
        const text = $("#wmd-bp-value").val();
        const trimmed = text.trim();
        if ((matcher === "equalToJson" || matcher === "matchesJsonPath" || matcher === "matchesXPath")
                && (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[")) {
            try {
                pattern[matcher] = JSON.parse(trimmed);
            } catch (error) {
                pattern[matcher] = text;
            }
        } else {
            pattern[matcher] = text;
        }
        if (matcher === "equalToJson") {
            if ($("#wmd-bp-ignore-order").prop("checked")) {
                pattern.ignoreArrayOrder = true;
            }
            if ($("#wmd-bp-ignore-extra").prop("checked")) {
                pattern.ignoreExtraElements = true;
            }
        } else if (matcher === "equalToXml") {
            if ($("#wmd-bp-placeholders").prop("checked")) {
                pattern.enablePlaceholders = true;
            }
        } else if ($("#wmd-bp-case").prop("checked")) {
            pattern.caseInsensitive = true;
        }
        return pattern;
    }

    function commitPatterns() {
        lastEdited = "form";
        refreshJsonFromForm();
        renderBodyPatterns();
    }

    function renderSummary() {
        const title = mapping.name || wm().mappingUrl(mapping) || mapping.id || "Stub mapping";
        $("#wmd-crumb").text(title);
        $("#wmd-title").text(title);
        $("#wmd-subtitle").html(
            '<code>' + esc(wm().mappingMethod(mapping)) + "</code> " +
            "<code>" + esc(wm().mappingUrl(mapping)) + "</code> → " +
            esc(String(wm().mappingStatus(mapping)))
        );
    }

    function save() {
        let next;
        try {
            next = currentMapping();
        } catch (error) {
            CadminApi.showToast("danger", error.message || "Unable to read mapping.");
            return;
        }
        if (mapping && mapping.id && !next.id) {
            next.id = mapping.id;
        }
        const id = next.id || (mapping && mapping.id);
        if (!id) {
            CadminApi.showToast("danger", "Mapping id is required to save.");
            return;
        }
        $("#wmd-save").prop("disabled", true);
        CadminApi.wiremock("/__admin/mappings/" + encodeURIComponent(id), "PUT", next)
            .done(function (updated) {
                mapping = updated && typeof updated === "object" ? updated : next;
                lastEdited = "form";
                fillForm(mapping);
                setEditorText(pretty(mapping));
                renderSummary();
                CadminApi.showToast("success", "Mapping saved.");
            })
            .fail(function (xhr) {
                CadminApi.showToast("danger", wm().fail("Save mapping", xhr));
            })
            .always(function () {
                $("#wmd-save").prop("disabled", false);
            });
    }

    function remove() {
        const id = mapping && mapping.id;
        if (!id || !window.confirm("Delete this stub mapping?")) {
            return;
        }
        CadminApi.wiremock("/__admin/mappings/" + encodeURIComponent(id), "DELETE").done(function () {
            CadminApi.showToast("success", "Mapping deleted.");
            window.location.hash = "#/wiremock-mappings";
        }).fail(function (xhr) {
            CadminApi.showToast("danger", wm().fail("Delete mapping", xhr));
        });
    }

    function bind() {
        const $root = $("#app-content");
        $root.off(".wmdetail");
        $root.on("input.wmdetail change.wmdetail", "#wmd-form :input", function () {
            if (syncing) {
                return;
            }
            lastEdited = "form";
            if (this.id === "wmd-body-kind") {
                syncBodyPlaceholder();
            }
            refreshJsonFromForm();
        });
        $root.on("click.wmdetail", "#wmd-save", save);
        $root.on("click.wmdetail", "#wmd-delete", remove);
        $root.on("click.wmdetail", "#wmd-beautify", function () {
            const parsed = parseEditor();
            if (!parsed) {
                CadminApi.showToast("danger", "Mapping JSON is not valid.");
                return;
            }
            lastEdited = "json";
            setEditorText(pretty(parsed));
            refreshFormFromJson();
        });
        $root.on("click.wmdetail", "#wmd-apply-json", function () {
            lastEdited = "json";
            if (!refreshFormFromJson()) {
                CadminApi.showToast("danger", "Mapping JSON is not valid.");
                return;
            }
            CadminApi.showToast("success", "Form updated from JSON.");
        });
        $root.on("click.wmdetail", "[data-edit-pattern]", function () {
            editingPatternIndex = Number($(this).attr("data-edit-pattern"));
            fillPatternForm(bodyPatterns()[editingPatternIndex] || {});
            bootstrap.Modal.getOrCreateInstance(document.getElementById("wmd-pattern-modal")).show();
        });
        $root.on("click.wmdetail", "[data-remove-pattern]", function () {
            const index = Number($(this).attr("data-remove-pattern"));
            const next = bodyPatterns().slice();
            next.splice(index, 1);
            setBodyPatterns(next);
            commitPatterns();
        });
        $root.on("change.wmdetail", "#wmd-bp-matcher", syncPatternFields);
        $("#wmd-pattern-modal").on("show.bs.modal", function (event) {
            const related = event.relatedTarget;
            if (related && $(related).attr("data-edit-pattern") != null) {
                return;
            }
            if (related) {
                editingPatternIndex = -1;
                fillPatternForm({
                    equalToJson: "",
                    ignoreArrayOrder: true,
                    ignoreExtraElements: true
                });
            }
        });
        $("#wmd-pattern-form").on("submit", function (event) {
            event.preventDefault();
            let pattern;
            try {
                pattern = readPatternForm();
            } catch (error) {
                CadminApi.showToast("danger", error.message || "Body pattern JSON is not valid.");
                return;
            }
            const next = bodyPatterns().slice();
            if (editingPatternIndex >= 0 && editingPatternIndex < next.length) {
                next[editingPatternIndex] = pattern;
            } else {
                next.push(pattern);
            }
            setBodyPatterns(next);
            commitPatterns();
            hideModal("wmd-pattern-modal");
        });
        if (editor) {
            editor.on("changes", function () {
                if (syncing) {
                    return;
                }
                lastEdited = "json";
            });
        }
    }

    function renderShell() {
        destroyEditor();
        const $root = $("#app-content");
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<nav aria-label="breadcrumb">' +
                        '<ol class="breadcrumb mb-1">' +
                            '<li class="breadcrumb-item"><a href="#/wiremock-mappings">Mappings</a></li>' +
                            '<li class="breadcrumb-item active" aria-current="page" id="wmd-crumb">Mapping</li>' +
                        "</ol>" +
                    "</nav>" +
                    '<h1 class="h3 mb-0 page-title" id="wmd-title">Stub mapping</h1>' +
                    '<p class="text-muted mb-0" id="wmd-subtitle"></p>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="wmd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                    '<button class="btn btn-primary" type="button" id="wmd-save">' +
                        '<i class="bi bi-check-lg me-1"></i>Save</button>' +
                "</div>" +
            "</div>" +
            '<div id="wmd-alert" class="alert d-none"></div>' +
            '<form id="wmd-form">' +
                '<div class="row">' +
                    '<div class="col-lg-6">' +
                        '<div class="card shadow mb-4">' +
                            '<div class="card-header py-3"><h6 class="m-0">Request</h6></div>' +
                            '<div class="card-body">' +
                                field("Name", '<input class="form-control" id="wmd-name" placeholder="Optional display name">') +
                                field("Method", '<select class="form-select" id="wmd-method">' +
                                    optionsHtml(METHODS) + "</select>") +
                                '<div class="row">' +
                                    '<div class="col-md-5 mb-3"><label class="form-label">URL match</label>' +
                                        '<select class="form-select" id="wmd-url-kind">' +
                                            optionsHtml(URL_KINDS) + "</select></div>" +
                                    '<div class="col-md-7 mb-3"><label class="form-label">Value</label>' +
                                        '<input class="form-control font-monospace" id="wmd-url" required></div>' +
                                "</div>" +
                                '<div class="row">' +
                                    '<div class="col-md-6 mb-0"><label class="form-label">Priority</label>' +
                                        '<input class="form-control" id="wmd-priority" type="number" min="1" placeholder="5"></div>' +
                                    '<div class="col-md-6 mb-0 d-flex align-items-end">' +
                                        '<div class="form-check mb-2">' +
                                            '<input class="form-check-input" type="checkbox" id="wmd-persistent">' +
                                            '<label class="form-check-label" for="wmd-persistent">Persistent</label>' +
                                        "</div></div>" +
                                "</div>" +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                    '<div class="col-lg-6">' +
                        '<div class="card shadow mb-4">' +
                            '<div class="card-header py-3"><h6 class="m-0">Response</h6></div>' +
                            '<div class="card-body">' +
                                '<div class="row">' +
                                    '<div class="col-md-4 mb-3"><label class="form-label">Status</label>' +
                                        '<input class="form-control" id="wmd-status" type="number" min="100" max="599"></div>' +
                                    '<div class="col-md-8 mb-3"><label class="form-label">Body</label>' +
                                        '<select class="form-select" id="wmd-body-kind">' +
                                            optionsHtml(BODY_KINDS) + "</select></div>" +
                                "</div>" +
                                field("Body content",
                                    '<textarea class="form-control font-monospace" id="wmd-body" rows="8"></textarea>') +
                                field("Headers",
                                    '<textarea class="form-control font-monospace" id="wmd-headers" rows="4" ' +
                                    'placeholder="Content-Type: application/json"></textarea>') +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</div>" +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                        '<h6 class="m-0">Body patterns</h6>' +
                        '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#wmd-pattern-modal">Add</button>' +
                    "</div>" +
                    '<div class="card-body">' +
                        '<div class="table-responsive">' +
                            '<table class="table table-hover align-middle mb-0">' +
                                "<thead><tr><th>Matcher</th><th>Value</th><th>Options</th><th></th></tr></thead>" +
                                '<tbody id="wmd-pattern-rows"></tbody>' +
                            "</table>" +
                        "</div>" +
                    "</div>" +
                "</div>" +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3"><h6 class="m-0">Scenario</h6></div>' +
                    '<div class="card-body">' +
                        '<div class="row">' +
                            '<div class="col-md-4 mb-3 mb-md-0"><label class="form-label">Name</label>' +
                                '<input class="form-control" id="wmd-scenario-name" placeholder="Optional"></div>' +
                            '<div class="col-md-4 mb-3 mb-md-0"><label class="form-label">Required state</label>' +
                                '<input class="form-control" id="wmd-scenario-required" placeholder="Started"></div>' +
                            '<div class="col-md-4 mb-0"><label class="form-label">New state</label>' +
                                '<input class="form-control" id="wmd-scenario-new"></div>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</form>" +
            '<div class="modal fade" id="wmd-pattern-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="wmd-pattern-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Add body pattern</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Matcher", '<select class="form-select" id="wmd-bp-matcher">' +
                                optionsHtml(BODY_MATCHERS) + "</select>") +
                            '<div class="mb-3" id="wmd-bp-value-wrap"><label class="form-label">Value</label>' +
                                '<textarea class="form-control font-monospace" id="wmd-bp-value" rows="6"></textarea></div>' +
                            '<div class="mb-3 d-none" id="wmd-bp-json-wrap"><label class="form-label">Pattern JSON</label>' +
                                '<textarea class="form-control font-monospace" id="wmd-bp-json" rows="8"></textarea></div>' +
                            '<div id="wmd-bp-json-flags" class="d-none">' +
                                '<div class="form-check">' +
                                    '<input class="form-check-input" type="checkbox" id="wmd-bp-ignore-order">' +
                                    '<label class="form-check-label" for="wmd-bp-ignore-order">Ignore array order</label></div>' +
                                '<div class="form-check mb-0">' +
                                    '<input class="form-check-input" type="checkbox" id="wmd-bp-ignore-extra">' +
                                    '<label class="form-check-label" for="wmd-bp-ignore-extra">Ignore extra elements</label></div>' +
                            "</div>" +
                            '<div id="wmd-bp-xml-flags" class="d-none">' +
                                '<div class="form-check mb-0">' +
                                    '<input class="form-check-input" type="checkbox" id="wmd-bp-placeholders">' +
                                    '<label class="form-check-label" for="wmd-bp-placeholders">Enable placeholders</label></div>' +
                            "</div>" +
                            '<div id="wmd-bp-case-flags" class="d-none">' +
                                '<div class="form-check mb-0">' +
                                    '<input class="form-check-input" type="checkbox" id="wmd-bp-case">' +
                                    '<label class="form-check-label" for="wmd-bp-case">Case insensitive</label></div>' +
                            "</div>" +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Save</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Stub mapping JSON</h6>' +
                    '<div class="d-flex gap-2">' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" id="wmd-beautify">Beautify</button>' +
                        '<button class="btn btn-sm btn-outline-primary" type="button" id="wmd-apply-json">Apply to form</button>' +
                    "</div>" +
                "</div>" +
                '<div class="card-body p-0">' +
                    '<textarea id="wmd-json" class="d-none"></textarea>' +
                "</div>" +
            "</div>"
        );
        const textarea = document.getElementById("wmd-json");
        if (typeof CodeMirror !== "undefined" && textarea) {
            editor = CodeMirror.fromTextArea(textarea, {
                mode: { name: "javascript", json: true },
                theme: "material-darker",
                lineNumbers: true,
                lineWrapping: false,
                matchBrackets: true,
                foldGutter: true,
                gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
                extraKeys: {
                    "Ctrl-Q": function (cm) {
                        cm.foldCode(cm.getCursor());
                    }
                }
            });
            editor.getWrapperElement().classList.add("wiremock-mapping-editor");
            editor.setSize("100%", "28rem");
        }
    }

    function render(id) {
        destroyEditor();
        mapping = null;
        lastEdited = "form";
        const $root = $("#app-content");
        $root.html('<div class="text-muted py-5 text-center">Loading…</div>');
        CadminApi.wiremock("/__admin/mappings/" + encodeURIComponent(id)).done(function (resource) {
            mapping = resource || {};
            renderShell();
            fillForm(mapping);
            setEditorText(pretty(mapping));
            renderSummary();
            CadminResourceSource.mount(function () { return mapping; });
            bind();
            if (editor) {
                window.setTimeout(function () {
                    editor.refresh();
                }, 50);
            }
        }).fail(function (xhr) {
            $root.html(
                '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                    "<div>" +
                        '<a class="small text-decoration-none" href="#/wiremock-mappings">' +
                            '<i class="bi bi-arrow-left me-1"></i>Mappings</a>' +
                        '<h1 class="h3 mb-0 page-title">Stub mapping</h1>' +
                    "</div>" +
                "</div>" +
                '<div class="alert alert-danger">' + esc(wm().fail("Load mapping", xhr)) + "</div>"
            );
        });
    }

    return {
        render: render,
        destroy: destroyEditor
    };
}());
