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
    let savedJson = "";
    let headerRows = [];
    let headerDragFrom = -1;
    let headerDropBefore = -1;
    let queryRows = [];
    let queryDragFrom = -1;
    let queryDropBefore = -1;

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

    function syncUnsavedFlag() {
        CadminApi.setUnsavedFlag("#app-content", editorText() !== savedJson);
    }

    function markEditorClean() {
        savedJson = editorText();
        syncUnsavedFlag();
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
        headerRows = wm().headerEntries(response.headers);
        renderHeaderList();
        queryRows = wm().queryParamEntries(request.queryParameters);
        renderQueryList();
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

    function flushHeaderRows() {
        const rows = [];
        $("#wmd-header-rows tr[data-header-index]").each(function () {
            rows.push({
                name: ($(this).find("[data-header-name]").val() || "").trim(),
                value: $(this).find("[data-header-value]").val() || ""
            });
        });
        if (rows.length || !$("#wmd-header-rows").length) {
            headerRows = rows.length ? rows : headerRows;
        }
        return headerRows;
    }

    function isContentTypeHeader(name) {
        return String(name || "").trim().toLowerCase() === "content-type";
    }

    function headerValueListAttr(name) {
        return isContentTypeHeader(name) ? ' list="wmd-header-content-types"' : "";
    }

    function datalistHtml(id, values) {
        return '<datalist id="' + esc(id) + '">' +
            (values || []).map(function (item) {
                return '<option value="' + esc(item) + '">';
            }).join("") +
            "</datalist>";
    }

    function syncHeaderValueSuggest(nameInput) {
        const $name = $(nameInput);
        const $value = $name.closest("tr").find("[data-header-value]");
        if (!$value.length) {
            return;
        }
        if (isContentTypeHeader($name.val())) {
            $value.attr("list", "wmd-header-content-types");
        } else {
            $value.removeAttr("list");
        }
    }

    function renderHeaderList() {
        const $rows = $("#wmd-header-rows");
        if (!$rows.length) {
            return;
        }
        if (!headerRows.length) {
            $rows.html(
                '<tr class="wmd-header-empty"><td colspan="4" class="text-muted">No response headers.</td></tr>'
            );
            return;
        }
        $rows.html(headerRows.map(function (row, index) {
            return '<tr draggable="true" data-header-index="' + index + '">' +
                '<td class="cadmin-list-grip-col">' +
                    '<span class="cadmin-list-grip" title="Drag to reorder" aria-hidden="true">' +
                        '<i class="bi bi-grip-vertical"></i></span></td>' +
                '<td><input class="form-control form-control-sm font-monospace" data-header-name ' +
                    'list="wmd-header-names" value="' + esc(row.name) +
                    '" placeholder="Content-Type" autocomplete="off" spellcheck="false"></td>' +
                '<td><input class="form-control form-control-sm font-monospace" data-header-value ' +
                    headerValueListAttr(row.name) + ' value="' + esc(row.value) +
                    '" placeholder="application/json" autocomplete="off" spellcheck="false"></td>' +
                '<td class="text-end text-nowrap">' +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-header="' +
                        index + '" title="Remove" aria-label="Remove">' +
                        '<i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function addHeaderRow() {
        flushHeaderRows();
        headerRows.push({ name: "", value: "" });
        renderHeaderList();
        const el = document.querySelector("#wmd-header-rows tr:last-child [data-header-name]");
        if (el) {
            el.focus();
        }
        lastEdited = "form";
        refreshJsonFromForm();
        syncUnsavedFlag();
    }

    function removeHeaderRow(index) {
        flushHeaderRows();
        if (index < 0 || index >= headerRows.length) {
            return;
        }
        headerRows.splice(index, 1);
        renderHeaderList();
        lastEdited = "form";
        refreshJsonFromForm();
        syncUnsavedFlag();
    }

    function moveHeaderRow(from, to) {
        flushHeaderRows();
        if (from < 0 || to < 0 || from >= headerRows.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const item = headerRows.splice(from, 1)[0];
        const dest = to > from ? to - 1 : to;
        headerRows.splice(dest, 0, item);
        renderHeaderList();
        lastEdited = "form";
        refreshJsonFromForm();
        syncUnsavedFlag();
    }

    function clearHeaderDrag() {
        headerDragFrom = -1;
        headerDropBefore = -1;
        $("#wmd-header-rows tr").removeClass("is-dragging drop-before drop-after");
    }

    function flushQueryRows() {
        const rows = [];
        $("#wmd-query-rows tr[data-query-index]").each(function () {
            rows.push({
                name: ($(this).find("[data-query-name]").val() || "").trim(),
                matcher: $(this).find("[data-query-matcher]").val() || "equalTo",
                value: $(this).find("[data-query-value]").val() || "",
                caseInsensitive: $(this).find("[data-query-case]").prop("checked")
            });
        });
        if (rows.length || !$("#wmd-query-rows").length) {
            queryRows = rows.length ? rows : queryRows;
        }
        return queryRows;
    }

    function queryValueListAttr(name) {
        const listId = wm().queryParamValueListId(name);
        return listId ? ' list="' + esc(listId) + '"' : "";
    }

    function queryValuePlaceholder(matcher) {
        if (matcher === "absent") {
            return "";
        }
        if (matcher === "custom") {
            return '{ "or": [{ "equalTo": "value" }, { "absent": true }] }';
        }
        if (matcher === "matches" || matcher === "doesNotMatch") {
            return ".*pattern.*";
        }
        if (matcher === "contains" || matcher === "doesNotContain") {
            return "substring";
        }
        return "value";
    }

    function syncQueryValueSuggest(nameInput) {
        const $name = $(nameInput);
        const $value = $name.closest("tr").find("[data-query-value]");
        if (!$value.length) {
            return;
        }
        const listId = wm().queryParamValueListId($name.val());
        if (listId) {
            $value.attr("list", listId);
        } else {
            $value.removeAttr("list");
        }
    }

    function syncQueryRowControls(rowEl) {
        const $row = $(rowEl);
        const matcher = $row.find("[data-query-matcher]").val() || "equalTo";
        const $value = $row.find("[data-query-value]");
        const $case = $row.find("[data-query-case]").closest(".form-check");
        const absent = matcher === "absent";
        $value.prop("disabled", absent)
            .attr("placeholder", queryValuePlaceholder(matcher));
        if (absent) {
            $value.val("");
        }
        $case.toggleClass("d-none", !wm().queryParamSupportsCase(matcher));
    }

    function queryValueDatalistsHtml() {
        const suggest = wm().QUERY_PARAM_VALUE_SUGGEST || {};
        return Object.keys(suggest).map(function (name) {
            return datalistHtml(wm().queryParamValueListId(name), suggest[name]);
        }).join("");
    }

    function renderQueryList() {
        const $rows = $("#wmd-query-rows");
        if (!$rows.length) {
            return;
        }
        if (!queryRows.length) {
            $rows.html(
                '<tr class="wmd-query-empty"><td colspan="6" class="text-muted">' +
                    "No query parameter matchers. The stub matches any query string.</td></tr>"
            );
            return;
        }
        $rows.html(queryRows.map(function (row, index) {
            const matcher = row.matcher || "equalTo";
            const absent = matcher === "absent";
            const caseClass = wm().queryParamSupportsCase(matcher) ? "" : " d-none";
            return '<tr draggable="true" data-query-index="' + index + '">' +
                '<td class="cadmin-list-grip-col">' +
                    '<span class="cadmin-list-grip" title="Drag to reorder" aria-hidden="true">' +
                        '<i class="bi bi-grip-vertical"></i></span></td>' +
                '<td><input class="form-control form-control-sm font-monospace" data-query-name ' +
                    'list="wmd-query-names" value="' + esc(row.name) +
                    '" placeholder="_count" autocomplete="off" spellcheck="false"></td>' +
                '<td><select class="form-select form-select-sm" data-query-matcher>' +
                    optionsHtml(wm().QUERY_PARAM_MATCHERS, matcher) + "</select></td>" +
                '<td><input class="form-control form-control-sm font-monospace" data-query-value ' +
                    queryValueListAttr(row.name) + ' value="' + esc(absent ? "" : row.value) +
                    '" placeholder="' + esc(queryValuePlaceholder(matcher)) +
                    '"' + (absent ? " disabled" : "") +
                    ' autocomplete="off" spellcheck="false"></td>' +
                '<td class="wmd-query-case-col">' +
                    '<div class="form-check mb-0 d-flex justify-content-center' + caseClass + '">' +
                        '<input class="form-check-input" type="checkbox" data-query-case' +
                            (row.caseInsensitive ? " checked" : "") +
                            ' title="Case insensitive" aria-label="Case insensitive"></div></td>' +
                '<td class="text-end text-nowrap">' +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-query="' +
                        index + '" title="Remove" aria-label="Remove">' +
                        '<i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function addQueryRow() {
        flushQueryRows();
        queryRows.push({ name: "", matcher: "equalTo", value: "", caseInsensitive: false });
        renderQueryList();
        const el = document.querySelector("#wmd-query-rows tr:last-child [data-query-name]");
        if (el) {
            el.focus();
        }
        lastEdited = "form";
        refreshJsonFromForm();
        syncUnsavedFlag();
    }

    function removeQueryRow(index) {
        flushQueryRows();
        if (index < 0 || index >= queryRows.length) {
            return;
        }
        queryRows.splice(index, 1);
        renderQueryList();
        lastEdited = "form";
        refreshJsonFromForm();
        syncUnsavedFlag();
    }

    function moveQueryRow(from, to) {
        flushQueryRows();
        if (from < 0 || to < 0 || from >= queryRows.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const item = queryRows.splice(from, 1)[0];
        const dest = to > from ? to - 1 : to;
        queryRows.splice(dest, 0, item);
        renderQueryList();
        lastEdited = "form";
        refreshJsonFromForm();
        syncUnsavedFlag();
    }

    function clearQueryDrag() {
        queryDragFrom = -1;
        queryDropBefore = -1;
        $("#wmd-query-rows tr").removeClass("is-dragging drop-before drop-after");
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
        const headers = wm().headersFromEntries(flushHeaderRows());
        if (Object.keys(headers).length) {
            next.response.headers = headers;
        } else {
            delete next.response.headers;
        }
        const queryParameters = wm().queryParamsFromEntries(flushQueryRows());
        if (Object.keys(queryParameters).length) {
            next.request.queryParameters = queryParameters;
        } else {
            delete next.request.queryParameters;
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
                markEditorClean();
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
        if (!id) {
            return;
        }
        CadminApi.confirm("Delete this stub mapping?").done(function () {
            CadminApi.wiremock("/__admin/mappings/" + encodeURIComponent(id), "DELETE").done(function () {
                CadminApi.showToast("success", "Mapping deleted.");
                window.location.hash = "#/wiremock-mappings";
            }).fail(function (xhr) {
                CadminApi.showToast("danger", wm().fail("Delete mapping", xhr));
            });
        });
    }

    function bind() {
        const $root = $("#app-content");
        $root.off(".wmdetail");
        $root.on("submit.wmdetail", "#wmd-form", function (event) {
            event.preventDefault();
        });
        $root.on("input.wmdetail change.wmdetail", "#wmd-form :input", function () {
            if (syncing) {
                return;
            }
            lastEdited = "form";
            if (this.id === "wmd-body-kind") {
                syncBodyPlaceholder();
            }
            if ($(this).is("[data-query-matcher]")) {
                syncQueryRowControls($(this).closest("tr"));
            }
            refreshJsonFromForm();
            syncUnsavedFlag();
        });
        $root.on("input.wmdetail", "[data-header-name]", function () {
            syncHeaderValueSuggest(this);
        });
        $root.on("click.wmdetail", "#wmd-header-add", function () {
            addHeaderRow();
        });
        $root.on("click.wmdetail", "[data-remove-header]", function () {
            removeHeaderRow(Number($(this).attr("data-remove-header")));
        });
        $root.on("dragstart.wmdetail", "#wmd-header-rows tr[data-header-index]", function (event) {
            if ($(event.target).closest("button, input, textarea, a").length) {
                event.preventDefault();
                return;
            }
            headerDragFrom = Number($(this).attr("data-header-index"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", String(headerDragFrom));
            }
            $(this).addClass("is-dragging");
        });
        $root.on("dragover.wmdetail", "#wmd-header-rows tr[data-header-index]", function (event) {
            if (headerDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $("#wmd-header-rows tr").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            headerDropBefore = Number($(this).attr("data-header-index")) + (before ? 0 : 1);
        });
        $root.on("drop.wmdetail", "#wmd-header-rows tr[data-header-index]", function (event) {
            if (headerDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const from = headerDragFrom;
            const to = headerDropBefore;
            clearHeaderDrag();
            moveHeaderRow(from, to);
        });
        $root.on("dragend.wmdetail", "#wmd-header-rows tr[data-header-index]", function () {
            clearHeaderDrag();
        });
        $root.on("input.wmdetail", "[data-query-name]", function () {
            syncQueryValueSuggest(this);
        });
        $root.on("click.wmdetail", "#wmd-query-add", function () {
            addQueryRow();
        });
        $root.on("click.wmdetail", "[data-remove-query]", function () {
            removeQueryRow(Number($(this).attr("data-remove-query")));
        });
        $root.on("dragstart.wmdetail", "#wmd-query-rows tr[data-query-index]", function (event) {
            if ($(event.target).closest("button, input, textarea, select, a").length) {
                event.preventDefault();
                return;
            }
            queryDragFrom = Number($(this).attr("data-query-index"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", String(queryDragFrom));
            }
            $(this).addClass("is-dragging");
        });
        $root.on("dragover.wmdetail", "#wmd-query-rows tr[data-query-index]", function (event) {
            if (queryDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $("#wmd-query-rows tr").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            queryDropBefore = Number($(this).attr("data-query-index")) + (before ? 0 : 1);
        });
        $root.on("drop.wmdetail", "#wmd-query-rows tr[data-query-index]", function (event) {
            if (queryDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const from = queryDragFrom;
            const to = queryDropBefore;
            clearQueryDrag();
            moveQueryRow(from, to);
        });
        $root.on("dragend.wmdetail", "#wmd-query-rows tr[data-query-index]", function () {
            clearQueryDrag();
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
                syncUnsavedFlag();
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
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="h3 mb-0 page-title" id="wmd-title">Stub mapping</h1>' +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
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
                                '<div class="mb-0">' +
                                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                                        '<label class="form-label mb-0">Headers</label>' +
                                        '<button class="btn btn-sm btn-outline-primary" type="button" id="wmd-header-add">' +
                                            "Add</button>" +
                                    "</div>" +
                                    '<div class="table-responsive">' +
                                        '<table class="table table-sm align-middle mb-0" id="wmd-header-table">' +
                                            '<thead><tr><th class="cadmin-list-grip-col"></th><th>Name</th>' +
                                                "<th>Value</th><th></th></tr></thead>" +
                                            '<tbody id="wmd-header-rows"></tbody>' +
                                        "</table>" +
                                        datalistHtml("wmd-header-names", wm().RESPONSE_HEADER_NAMES) +
                                        datalistHtml("wmd-header-content-types", wm().CONTENT_TYPE_VALUES) +
                                    "</div>" +
                                "</div>" +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</div>" +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                        '<h6 class="m-0">Query parameters</h6>' +
                        '<button class="btn btn-sm btn-outline-primary" type="button" id="wmd-query-add">' +
                            "Add</button>" +
                    "</div>" +
                    '<div class="card-body">' +
                        '<p class="text-muted small mb-3">Match individual query string fields. Prefer Path URL match when these constraints should apply independently of a full URL.</p>' +
                        '<div class="table-responsive">' +
                            '<table class="table table-sm align-middle mb-0" id="wmd-query-table">' +
                                '<thead><tr><th class="cadmin-list-grip-col"></th><th>Name</th>' +
                                    "<th>Matcher</th><th>Value</th>" +
                                    '<th class="wmd-query-case-col" title="Case insensitive">Case</th>' +
                                    "<th></th></tr></thead>" +
                                '<tbody id="wmd-query-rows"></tbody>' +
                            "</table>" +
                            datalistHtml("wmd-query-names", wm().QUERY_PARAM_NAMES) +
                            queryValueDatalistsHtml() +
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

    function sanitizeMappingResponseHeaders(resource) {
        const next = resource || {};
        next.response = next.response || {};
        next.request = next.request || {};
        const headers = wm().headersFromEntries(wm().headerEntries(next.response.headers));
        if (Object.keys(headers).length) {
            next.response.headers = headers;
        } else {
            delete next.response.headers;
        }
        try {
            const queryParameters = wm().queryParamsFromEntries(
                wm().queryParamEntries(next.request.queryParameters)
            );
            if (Object.keys(queryParameters).length) {
                next.request.queryParameters = queryParameters;
            } else {
                delete next.request.queryParameters;
            }
        } catch (error) {
            /* keep recorded queryParameters when they cannot be normalized */
        }
        return next;
    }

    function render(id) {
        destroyEditor();
        mapping = null;
        lastEdited = "form";
        const $root = $("#app-content");
        $root.html('<div class="text-muted py-5 text-center">Loading…</div>');
        CadminApi.wiremock("/__admin/mappings/" + encodeURIComponent(id)).done(function (resource) {
            mapping = sanitizeMappingResponseHeaders(resource || {});
            renderShell();
            fillForm(mapping);
            setEditorText(pretty(mapping));
            renderSummary();
            CadminResourceSource.mount(function () { return mapping; });
            bind();
            markEditorClean();
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
