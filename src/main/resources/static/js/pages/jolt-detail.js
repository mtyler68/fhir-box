window.CadminJoltDetail = (function () {
    const libraryType = "jolt";
    const specContentType = "application/jolt+json";
    const sampleContentType = "application/jolt-samples+json";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const operationOptions = [
        { code: "shift", display: "shift" },
        { code: "default", display: "default" },
        { code: "remove", display: "remove" },
        { code: "cardinality", display: "cardinality" },
        { code: "sort", display: "sort" },
        { code: "modify-overwrite-beta", display: "modify-overwrite-beta" },
        { code: "modify-default-beta", display: "modify-default-beta" },
        { code: "modify-define-beta", display: "modify-define-beta" }
    ];
    const templates = [
        {
            id: "identity",
            label: "Identity shift",
            steps: [{ operation: "shift", spec: { "*": "&" } }]
        },
        {
            id: "ratings",
            label: "Shift ratings (classic)",
            steps: [
                {
                    operation: "shift",
                    spec: {
                        rating: {
                            primary: { value: "Rating", max: "RatingRange" },
                            "*": {
                                value: "SecondaryRatings.&1.Value",
                                max: "SecondaryRatings.&1.Range",
                                $: "SecondaryRatings.&1.Id"
                            }
                        }
                    }
                },
                {
                    operation: "default",
                    spec: {
                        RatingRange: 5,
                        SecondaryRatings: { "*": { Range: 5 } }
                    }
                }
            ]
        },
        {
            id: "remove",
            label: "Remove fields",
            steps: [{ operation: "remove", spec: { password: "", ssn: "" } }]
        },
        {
            id: "cardinality",
            label: "Cardinality",
            steps: [{ operation: "cardinality", spec: { identifier: "MANY", name: { "*": "ONE" } } }]
        },
        {
            id: "modify",
            label: "Modify overwrite",
            steps: [{
                operation: "modify-overwrite-beta",
                spec: {
                    fullName: "=concat(@(1,given),' ',@(1,family))",
                    id: "=toLower"
                }
            }]
        },
        {
            id: "sort",
            label: "Sort keys",
            steps: [{ operation: "sort" }]
        }
    ];
    const hintWords = [
        "operation", "spec", "shift", "default", "remove", "cardinality", "sort",
        "modify-overwrite-beta", "modify-default-beta", "modify-define-beta"
    ];
    let library = null;
    let hintRegistered = false;
    let jsonPreviewEditor = null;
    let savedSnapshot = "";
    let ops = [];
    let selectedOp = -1;
    let dragFrom = -1;
    let dropBefore = -1;
    let samples = [];
    let selectedSample = -1;
    let sampleDragFrom = -1;
    let sampleDropBefore = -1;
    const sessions = {};
    let sessionId = "";

    function pageRoot() {
        if (window.CadminWorkspace && typeof CadminWorkspace.root === "function") {
            return CadminWorkspace.root() || document;
        }
        return document;
    }

    function $page(selector) {
        const $root = $(pageRoot());
        return selector ? $root.find(selector) : $root;
    }

    function pageEl(id) {
        const root = pageRoot();
        if (root && root.querySelector) {
            return root.querySelector("#" + id);
        }
        return document.getElementById(id);
    }

    function sessionKey(resource) {
        return resource && resource.id ? String(resource.id) : "";
    }

    function captureSession() {
        if (!sessionId) {
            return;
        }
        sessions[sessionId] = {
            library: library,
            ops: ops,
            selectedOp: selectedOp,
            samples: samples,
            selectedSample: selectedSample,
            savedSnapshot: savedSnapshot
        };
    }

    function restoreSession(id, resource) {
        const saved = id && sessions[id];
        sessionId = id;
        dragFrom = -1;
        dropBefore = -1;
        sampleDragFrom = -1;
        sampleDropBefore = -1;
        jsonPreviewEditor = null;
        if (!saved) {
            library = resource;
            ops = [];
            selectedOp = -1;
            samples = [];
            selectedSample = -1;
            savedSnapshot = "";
            return false;
        }
        library = resource || saved.library;
        ops = saved.ops;
        selectedOp = saved.selectedOp;
        samples = saved.samples;
        selectedSample = saved.selectedSample;
        savedSnapshot = saved.savedSnapshot;
        return true;
    }

    function activateSession(resource) {
        const id = sessionKey(resource);
        if (sessionId && sessionId !== id) {
            teardownJsonPreview();
            captureSession();
        }
        if (id && sessionId === id) {
            if (resource) {
                library = resource;
            }
            return;
        }
        restoreSession(id, resource);
    }

    function dropSession(id) {
        const key = id ? String(id) : "";
        if (key) {
            delete sessions[key];
        }
        if (sessionId === key) {
            sessionId = "";
        }
    }

    function hidePageModals() {
        $page(".modal.show").each(function () {
            if (typeof bootstrap === "undefined" || !bootstrap.Modal) {
                return;
            }
            const inst = bootstrap.Modal.getInstance(this);
            if (inst) {
                inst.hide();
            }
        });
    }

    function suspend() {
        teardownJsonPreview();
        hidePageModals();
        captureSession();
    }

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function field(label, control) {
        return '<div class="mb-3"><label class="form-label">' + label + "</label>" + control + "</div>";
    }

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const mark = item.code === selected ? " selected" : "";
            return '<option value="' + esc(item.code) + '"' + mark + ">" + esc(item.display) + "</option>";
        }).join("");
    }

    function operationSelectHtml(selected) {
        const value = selected || "shift";
        let html = optionsHtml(operationOptions, value);
        if (value && !operationOptions.some(function (item) { return item.code === value; })) {
            html += '<option value="' + esc(value) + '" selected>' + esc(value) + "</option>";
        }
        return html;
    }

    function statusLabel(code) {
        const match = statusOptions.find(function (option) { return option.code === code; });
        return match ? match.display : (code || "—");
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success"
            : status === "retired" ? "secondary"
                : status === "draft" ? "warning"
                    : "info";
        return '<span class="badge text-bg-' + kind + '">' + esc(statusLabel(status)) + "</span>";
    }

    function encodeText(value) {
        try {
            return btoa(unescape(encodeURIComponent(value || "")));
        } catch (err) {
            return btoa(value || "");
        }
    }

    function decodeText(value) {
        if (!value) {
            return "";
        }
        try {
            return decodeURIComponent(escape(atob(value)));
        } catch (err) {
            try {
                return atob(value);
            } catch (ignored) {
                return "";
            }
        }
    }

    function attachmentType(item) {
        return ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
    }

    function isSampleJson(item) {
        return attachmentType(item) === sampleContentType;
    }

    function isJoltJson(item) {
        if (isSampleJson(item)) {
            return false;
        }
        const type = attachmentType(item);
        return type === specContentType || type === "application/json" || type === "text/json"
            || type === "application/javascript";
    }

    function findSpecAttachment() {
        return (library.content || []).find(isJoltJson) || null;
    }

    function findSampleAttachment() {
        return (library.content || []).find(isSampleJson) || null;
    }

    function readJson() {
        const attachment = findSpecAttachment();
        return attachment && attachment.data ? decodeText(attachment.data) : "";
    }

    function pretty(value) {
        return JSON.stringify(value, null, 2) + "\n";
    }

    function emptyStep() {
        return { operation: "shift", spec: { "*": "&" } };
    }

    function extraOf(step) {
        const extra = Object.assign({}, step || {});
        delete extra.operation;
        delete extra.spec;
        return extra;
    }

    function stepsFromText(text) {
        const source = String(text || "").trim();
        if (!source) {
            return [emptyStep()];
        }
        try {
            const parsed = JSON.parse(source);
            const list = Array.isArray(parsed) ? parsed : [parsed];
            const steps = list.filter(function (step) {
                return step && typeof step === "object" && !Array.isArray(step);
            });
            return steps.length ? steps : [emptyStep()];
        } catch (err) {
            return null;
        }
    }

    function flushSelectedOp() {
        if (selectedOp < 0 || !ops[selectedOp] || !$page("#bjd-op-spec-host").length) {
            return "";
        }
        const operation = ($page("#bjd-op-type").val() || "").trim();
        const step = Object.assign({}, $page("#bjd-op-editor").data("extra") || {});
        if (!operation) {
            return "Operation " + (selectedOp + 1) + " is missing an operation type.";
        }
        step.operation = operation;
        const text = jsonTextOf($page("#bjd-op-spec-host")).trim();
        if (text) {
            try {
                step.spec = JSON.parse(text);
            } catch (err) {
                return "Operation spec is not valid JSON.";
            }
        } else if (operation !== "sort") {
            step.spec = {};
        } else {
            delete step.spec;
        }
        ops[selectedOp] = step;
        return "";
    }

    function collectSteps() {
        const error = flushSelectedOp();
        if (error) {
            return { steps: ops.slice(), error: error };
        }
        if (!ops.length) {
            return { steps: [], error: "Add at least one Jolt operation." };
        }
        let i;
        for (i = 0; i < ops.length; i += 1) {
            if (!ops[i] || !ops[i].operation) {
                return { steps: ops.slice(), error: "Operation " + (i + 1) + " is missing an operation type." };
            }
        }
        return { steps: ops.slice(), error: "" };
    }

    function collectSpecJson() {
        const collected = collectSteps();
        if (collected.error) {
            return "";
        }
        return pretty(collected.steps);
    }

    function upsertJson(text) {
        const attachment = {
            contentType: specContentType,
            title: "Jolt spec",
            data: encodeText(text || "")
        };
        library.content = library.content || [];
        let found = false;
        library.content = library.content.map(function (item) {
            if (!isJoltJson(item)) {
                return item;
            }
            found = true;
            attachment.title = item.title || attachment.title;
            return attachment;
        });
        if (!found) {
            library.content.push(attachment);
        }
    }

    function emptySample(title) {
        return { title: title || "", input: {}, expected: {} };
    }

    function sampleTitleOf(sample, index) {
        const title = sample && String(sample.title || "").trim();
        return title || ("Untitled" + (index >= 0 ? " " + (index + 1) : ""));
    }

    function nextSampleTitle() {
        return "Sample " + (samples.length + 1);
    }

    function normalizeSample(item) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            return emptySample();
        }
        const expected = item.expected !== undefined ? item.expected
            : (item.output !== undefined ? item.output : {});
        return {
            title: String(item.title || "").trim(),
            input: item.input !== undefined ? item.input : {},
            expected: expected
        };
    }

    function readSamples() {
        const attachment = findSampleAttachment();
        if (!attachment || !attachment.data) {
            return [];
        }
        try {
            const parsed = JSON.parse(decodeText(attachment.data));
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.map(normalizeSample);
        } catch (err) {
            return [];
        }
    }

    function upsertSamples(samples) {
        library.content = (library.content || []).filter(function (item) {
            return !isSampleJson(item);
        });
        if (!samples.length) {
            return;
        }
        library.content.push({
            contentType: sampleContentType,
            title: "Jolt samples",
            data: encodeText(pretty(samples))
        });
    }

    function jsonTextOf($host) {
        const cm = $host.data("cm");
        if (cm) {
            return cm.getValue();
        }
        return $host.find("textarea").val() || "";
    }

    function parseJsonField($host, label) {
        const text = jsonTextOf($host).trim();
        if (!text) {
            return { value: {} };
        }
        try {
            return { value: JSON.parse(text) };
        } catch (err) {
            return { error: label + " is not valid JSON." };
        }
    }

    function setJsonHostText($host, text) {
        const cm = $host.data("cm");
        if (cm) {
            cm.setValue(text);
            cm.focus();
            return;
        }
        $host.find("textarea").val(text);
    }

    function beautifyJsonHost($host, label) {
        const parsed = parseJsonField($host, label || "JSON");
        if (parsed.error) {
            CadminApi.showToast("danger", parsed.error);
            return;
        }
        setJsonHostText($host, pretty(parsed.value));
        syncUnsavedFlag();
    }

    function flushSelectedSample() {
        if (selectedSample < 0 || !samples[selectedSample] || !$page("#bjd-sample-input-host").length) {
            return "";
        }
        const n = selectedSample + 1;
        const input = parseJsonField($page("#bjd-sample-input-host"), "Sample " + n + " input");
        const expected = parseJsonField($page("#bjd-sample-expected-host"), "Sample " + n + " expected output");
        if (input.error || expected.error) {
            return input.error || expected.error;
        }
        samples[selectedSample] = {
            title: ($page("#bjd-sample-title").val() || "").trim(),
            input: input.value,
            expected: expected.value
        };
        return "";
    }

    function collectSamples() {
        const error = flushSelectedSample();
        if (error) {
            return { samples: samples.slice(), error: error };
        }
        return { samples: samples.slice(), error: "" };
    }

    function registerHint() {
        if (hintRegistered || typeof CodeMirror === "undefined") {
            return;
        }
        hintRegistered = true;
        CodeMirror.registerHelper("hint", "jolt-json", function (cm) {
            const cursor = cm.getCursor();
            const line = cm.getLine(cursor.line) || "";
            const before = line.slice(0, cursor.ch);
            const match = before.match(/[A-Za-z][A-Za-z0-9_-]*$/);
            const word = match ? match[0] : "";
            const start = cursor.ch - word.length;
            const prefix = word.toLowerCase();
            const list = hintWords.filter(function (item) {
                return !prefix || item.toLowerCase().indexOf(prefix) === 0;
            });
            return {
                list: list,
                from: CodeMirror.Pos(cursor.line, Math.max(0, start)),
                to: cursor
            };
        });
    }

    function jsonEditorOptions(readOnly) {
        return {
            mode: { name: "javascript", json: true },
            theme: "default",
            lineNumbers: true,
            lineWrapping: false,
            readOnly: !!readOnly,
            indentUnit: 2,
            tabSize: 2,
            indentWithTabs: false,
            matchBrackets: true,
            autoCloseBrackets: !readOnly,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                "Ctrl-Q": function (cm) {
                    cm.foldCode(cm.getCursor());
                },
                Tab: function (cm) {
                    if (cm.somethingSelected()) {
                        cm.indentSelection("add");
                    } else {
                        cm.replaceSelection("  ", "end");
                    }
                }
            },
            hintOptions: { hint: CodeMirror.hint["jolt-json"], completeSingle: false }
        };
    }

    function destroyJsonHost($host) {
        const cm = $host.data("cm");
        if (cm) {
            cm.toTextArea();
            $host.removeData("cm");
        }
    }

    function destroySampleEditors(root) {
        const $scope = $(root || pageRoot());
        destroyJsonHost($scope.find("#bjd-sample-input-host"));
        destroyJsonHost($scope.find("#bjd-sample-expected-host"));
        destroyJsonHost($scope.find("#bjd-sample-actual-host"));
    }

    function destroySpecEditors(root) {
        const $scope = $(root || pageRoot());
        destroyJsonHost($scope.find("#bjd-op-spec-host"));
        destroyJsonHost($scope.find("#bjd-load-host"));
        destroySampleEditors($scope);
        teardownJsonPreview();
    }

    function attachJsonHost($host, height, readOnly) {
        const textarea = $host.find("textarea")[0];
        if (!textarea || typeof CodeMirror === "undefined") {
            return;
        }
        destroyJsonHost($host);
        registerHint();
        const cm = CodeMirror.fromTextArea(textarea, jsonEditorOptions(!!readOnly));
        cm.getWrapperElement().classList.add("jolt-spec-editor");
        cm.setSize("100%", height || "14rem");
        if (!readOnly) {
            cm.on("change", syncUnsavedFlag);
            cm.on("inputRead", function (editor, change) {
                if (change.text.length !== 1 || !/^[A-Za-z]$/.test(change.text[0])) {
                    return;
                }
                CodeMirror.commands.autocomplete(editor, null, { completeSingle: false });
            });
        }
        $host.data("cm", cm);
        requestAnimationFrame(function () {
            if ($host.data("cm") === cm) {
                cm.refresh();
            }
        });
    }

    function refreshJsonHosts(selector, height) {
        $page(selector).each(function () {
            const cm = $(this).data("cm");
            if (cm) {
                cm.setSize("100%", height);
                cm.refresh();
            }
        });
    }

    function refreshSpecEditors() {
        refreshJsonHosts("#bjd-op-spec-host", "22rem");
        refreshJsonHosts("#bjd-sample-input-host, #bjd-sample-expected-host, #bjd-sample-actual-host", "24rem");
    }

    function specSnapshot() {
        try {
            const collected = collectSteps();
            if (collected.error) {
                return collected.error + "\n" + collected.steps.length;
            }
            return JSON.stringify(collected.steps);
        } catch (err) {
            return "";
        }
    }

    function samplesSnapshot() {
        try {
            const collected = collectSamples();
            if (collected.error) {
                return collected.error + "\n" + collected.samples.length;
            }
            return JSON.stringify(collected.samples);
        } catch (err) {
            return "";
        }
    }

    function editorSnapshot() {
        return specSnapshot() + "\n---\n" + samplesSnapshot();
    }

    function syncUnsavedFlag() {
        CadminApi.setUnsavedFlag(CadminWorkspace.root(), editorSnapshot() !== savedSnapshot);
    }

    function markEditorClean() {
        savedSnapshot = editorSnapshot();
        syncUnsavedFlag();
    }

    function editorValue() {
        return collectSpecJson();
    }

    function renderOpList() {
        if (!ops.length) {
            $page("#bjd-ops").empty();
            $page("#bjd-ops-empty").removeClass("d-none");
            return;
        }
        $page("#bjd-ops-empty").addClass("d-none");
        $page("#bjd-ops").html(ops.map(function (step, index) {
            const selected = index === selectedOp ? " active" : "";
            return '<div class="list-group-item list-group-item-action jolt-op-item' + selected +
                '" draggable="true" data-op-index="' + index + '" role="button">' +
                '<span class="cadmin-list-grip" title="Drag to reorder" aria-hidden="true">' +
                    '<i class="bi bi-grip-vertical"></i></span>' +
                '<span class="jolt-op-index">' + (index + 1) + "</span>" +
                '<code class="jolt-op-name">' + esc(step.operation || "operation") + "</code>" +
                '<button class="btn btn-sm btn-outline-danger ms-auto" type="button" data-op-remove="' +
                    index + '" title="Remove operation" aria-label="Remove operation">' +
                    '<i class="bi bi-trash"></i></button>' +
            "</div>";
        }).join(""));
    }

    function renderOpEditor() {
        destroyJsonHost($page("#bjd-op-spec-host"));
        if (selectedOp < 0 || !ops[selectedOp]) {
            $page("#bjd-op-editor").html(
                '<div class="text-muted py-5 text-center">Select or add an operation.</div>');
            return;
        }
        const step = ops[selectedOp];
        const specText = step.spec === undefined ? "" : pretty(step.spec);
        $page("#bjd-op-editor").html(
            field("Operation", '<select class="form-select" id="bjd-op-type">' +
                operationSelectHtml(step.operation) + "</select>" +
                '<div class="form-text">Jolt Chainr transform applied in list order.</div>') +
            '<div class="mb-0">' +
                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                    '<label class="form-label mb-0">Spec</label>' +
                    '<button class="btn btn-sm btn-outline-secondary" type="button" data-op-beautify>' +
                        "Beautify</button>" +
                "</div>" +
                '<div class="jolt-spec-host" id="bjd-op-spec-host">' +
                    '<textarea class="form-control font-monospace" rows="12" placeholder="{ }">' +
                        esc(specText) + "</textarea></div>" +
                '<div class="form-text">JSON mapping for this operation. Optional for <code>sort</code>.</div>' +
            "</div>"
        );
        $page("#bjd-op-editor").data("extra", extraOf(step));
        attachJsonHost($page("#bjd-op-spec-host"), "22rem");
    }

    function selectOp(index) {
        if (index === selectedOp && $page("#bjd-op-spec-host").length) {
            renderOpList();
            return true;
        }
        const problem = flushSelectedOp();
        if (problem) {
            CadminApi.showToast("danger", problem);
            return false;
        }
        selectedOp = index;
        renderOpList();
        renderOpEditor();
        syncUnsavedFlag();
        return true;
    }

    function renderOperations(steps) {
        destroyJsonHost($page("#bjd-op-spec-host"));
        ops = (steps && steps.length ? steps : [emptyStep()]).map(function (step) {
            return Object.assign({}, step);
        });
        selectedOp = ops.length ? 0 : -1;
        renderOpList();
        renderOpEditor();
        syncUnsavedFlag();
    }

    function addOperation(step) {
        const problem = flushSelectedOp();
        if (problem) {
            CadminApi.showToast("danger", problem);
            return;
        }
        ops.push(Object.assign({}, step || emptyStep()));
        selectedOp = ops.length - 1;
        renderOpList();
        renderOpEditor();
        syncUnsavedFlag();
    }

    function removeOperation(index) {
        if (index < 0 || index >= ops.length) {
            return;
        }
        if (index === selectedOp) {
            destroyJsonHost($page("#bjd-op-spec-host"));
        } else {
            flushSelectedOp();
        }
        ops.splice(index, 1);
        if (!ops.length) {
            selectedOp = -1;
        } else if (selectedOp >= ops.length) {
            selectedOp = ops.length - 1;
        } else if (index < selectedOp) {
            selectedOp -= 1;
        }
        renderOpList();
        renderOpEditor();
        syncUnsavedFlag();
    }

    function moveOp(from, to) {
        flushSelectedOp();
        if (from < 0 || to < 0 || from >= ops.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const item = ops.splice(from, 1)[0];
        const dest = to > from ? to - 1 : to;
        ops.splice(dest, 0, item);
        if (selectedOp === from) {
            selectedOp = dest;
        } else if (from < selectedOp && dest >= selectedOp) {
            selectedOp -= 1;
        } else if (from > selectedOp && dest <= selectedOp) {
            selectedOp += 1;
        }
        renderOpList();
        syncUnsavedFlag();
    }

    function clearOpDrag() {
        dragFrom = -1;
        dropBefore = -1;
        $page("#bjd-ops .jolt-op-item").removeClass("is-dragging drop-before drop-after");
    }

    function renderSampleList() {
        if (!samples.length) {
            $page("#bjd-sample-list").empty();
            $page("#bjd-samples-empty").removeClass("d-none");
            return;
        }
        $page("#bjd-samples-empty").addClass("d-none");
        $page("#bjd-sample-list").html(samples.map(function (sample, index) {
            const selected = index === selectedSample ? " active" : "";
            return '<div class="list-group-item list-group-item-action jolt-sample-item' + selected +
                '" draggable="true" data-sample-index="' + index + '" role="button">' +
                '<span class="cadmin-list-grip" title="Drag to reorder" aria-hidden="true">' +
                    '<i class="bi bi-grip-vertical"></i></span>' +
                '<span class="jolt-op-index">' + (index + 1) + "</span>" +
                '<span class="jolt-sample-name">' + esc(sampleTitleOf(sample, index)) + "</span>" +
                '<button class="btn btn-sm btn-outline-danger ms-auto" type="button" data-sample-remove="' +
                    index + '" title="Remove sample" aria-label="Remove sample">' +
                    '<i class="bi bi-trash"></i></button>' +
            "</div>";
        }).join(""));
    }

    function pathKey(path) {
        return JSON.stringify(path || []);
    }

    function jsonKind(value) {
        if (value === null) {
            return "null";
        }
        if (Array.isArray(value)) {
            return "array";
        }
        return typeof value;
    }

    function collectJsonDiffs(expected, actual, path, out) {
        path = path || [];
        out = out || [];
        const expectedKind = jsonKind(expected);
        const actualKind = jsonKind(actual);
        if (expectedKind !== actualKind) {
            out.push({ path: path, kind: "changed" });
            return out;
        }
        if (expectedKind === "object") {
            Object.keys(expected).forEach(function (key) {
                if (!Object.prototype.hasOwnProperty.call(actual, key)) {
                    out.push({ path: path.concat([key]), kind: "missing" });
                    return;
                }
                collectJsonDiffs(expected[key], actual[key], path.concat([key]), out);
            });
            Object.keys(actual).forEach(function (key) {
                if (!Object.prototype.hasOwnProperty.call(expected, key)) {
                    out.push({ path: path.concat([key]), kind: "extra" });
                }
            });
            return out;
        }
        if (expectedKind === "array") {
            const n = Math.max(expected.length, actual.length);
            let i;
            for (i = 0; i < n; i += 1) {
                if (i >= expected.length) {
                    out.push({ path: path.concat([i]), kind: "extra" });
                } else if (i >= actual.length) {
                    out.push({ path: path.concat([i]), kind: "missing" });
                } else {
                    collectJsonDiffs(expected[i], actual[i], path.concat([i]), out);
                }
            }
            return out;
        }
        if (expected !== actual) {
            out.push({ path: path, kind: "changed" });
        }
        return out;
    }

    function jsonPathRanges(text) {
        const source = String(text || "");
        const ranges = {};
        let i = 0;

        function skipWs() {
            while (i < source.length && /[ \t\r\n]/.test(source.charAt(i))) {
                i += 1;
            }
        }

        function record(path, start, end) {
            ranges[pathKey(path)] = { start: start, end: end };
        }

        function parseString() {
            if (source.charAt(i) !== "\"") {
                throw new Error("string");
            }
            i += 1;
            while (i < source.length) {
                const ch = source.charAt(i);
                if (ch === "\\") {
                    i += 2;
                    continue;
                }
                i += 1;
                if (ch === "\"") {
                    return;
                }
            }
            throw new Error("string");
        }

        function parseValue(path) {
            skipWs();
            const start = i;
            const ch = source.charAt(i);
            if (ch === "{") {
                parseObject(path);
            } else if (ch === "[") {
                parseArray(path);
            } else if (ch === "\"") {
                parseString();
            } else if (ch === "t") {
                i += 4;
            } else if (ch === "f") {
                i += 5;
            } else if (ch === "n") {
                i += 4;
            } else {
                while (i < source.length && /[0-9eE+.\-]/.test(source.charAt(i))) {
                    i += 1;
                }
            }
            record(path, start, i);
        }

        function parseObject(path) {
            i += 1;
            skipWs();
            if (source.charAt(i) === "}") {
                i += 1;
                return;
            }
            while (i < source.length) {
                skipWs();
                const propStart = i;
                parseString();
                const key = JSON.parse(source.slice(propStart, i));
                skipWs();
                if (source.charAt(i) !== ":") {
                    throw new Error("colon");
                }
                i += 1;
                const child = path.concat([key]);
                parseValue(child);
                ranges[pathKey(child)].start = propStart;
                skipWs();
                if (source.charAt(i) === ",") {
                    i += 1;
                    continue;
                }
                if (source.charAt(i) === "}") {
                    i += 1;
                    return;
                }
                throw new Error("object");
            }
        }

        function parseArray(path) {
            i += 1;
            skipWs();
            if (source.charAt(i) === "]") {
                i += 1;
                return;
            }
            let index = 0;
            while (i < source.length) {
                parseValue(path.concat([index]));
                skipWs();
                if (source.charAt(i) === ",") {
                    i += 1;
                    index += 1;
                    continue;
                }
                if (source.charAt(i) === "]") {
                    i += 1;
                    return;
                }
                throw new Error("array");
            }
        }

        parseValue([]);
        return ranges;
    }

    function clearSampleDiffMarks($host) {
        const hosts = $host ? [$host] : [$page("#bjd-sample-expected-host"), $page("#bjd-sample-actual-host")];
        hosts.forEach(function (target) {
            const marks = target.data("diffMarks") || [];
            marks.forEach(function (mark) {
                mark.clear();
            });
            target.removeData("diffMarks");
        });
        $page("#bjd-sample-diff-status").empty();
    }

    function markJsonDiffs($host, diffs, side) {
        const cm = $host.data("cm");
        if (!cm) {
            return 0;
        }
        let ranges;
        try {
            ranges = jsonPathRanges(jsonTextOf($host));
        } catch (err) {
            return 0;
        }
        const marks = [];
        diffs.forEach(function (diff) {
            const show = (diff.kind === "changed")
                || (diff.kind === "missing" && side === "expected")
                || (diff.kind === "extra" && side === "actual");
            if (!show) {
                return;
            }
            const range = ranges[pathKey(diff.path)];
            if (!range) {
                return;
            }
            const cls = diff.kind === "missing" ? "jolt-diff-missing"
                : (diff.kind === "extra" ? "jolt-diff-extra" : "jolt-diff-changed");
            const title = diff.kind === "missing" ? "Missing from actual"
                : (diff.kind === "extra" ? "Extra in actual" : "Value differs");
            marks.push(cm.markText(cm.posFromIndex(range.start), cm.posFromIndex(range.end), {
                className: cls,
                title: title,
                inclusiveLeft: true,
                inclusiveRight: false
            }));
        });
        $host.data("diffMarks", marks);
        return marks.length;
    }

    function highlightSampleDiff() {
        clearSampleDiffMarks();
        const actualText = jsonTextOf($page("#bjd-sample-actual-host")).trim();
        if (!actualText || !$page("#bjd-sample-actual-host").data("cm")) {
            return;
        }
        const expected = parseJsonField($page("#bjd-sample-expected-host"), "Expected output");
        const actual = parseJsonField($page("#bjd-sample-actual-host"), "Actual output");
        if (expected.error || actual.error) {
            return;
        }
        const diffs = collectJsonDiffs(expected.value, actual.value);
        markJsonDiffs($page("#bjd-sample-expected-host"), diffs, "expected");
        markJsonDiffs($page("#bjd-sample-actual-host"), diffs, "actual");
        const $status = $page("#bjd-sample-diff-status");
        if (!diffs.length) {
            $status.html('<span class="text-success">Actual matches expected.</span>');
            return;
        }
        $status.html(
            '<span class="jolt-diff-swatch jolt-diff-changed"></span>Different value' +
            '<span class="jolt-diff-swatch jolt-diff-missing ms-3"></span>Missing from actual' +
            '<span class="jolt-diff-swatch jolt-diff-extra ms-3"></span>Extra in actual'
        );
    }

    function clearActualOutput() {
        setJsonHostText($page("#bjd-sample-actual-host"), "");
        clearSampleDiffMarks();
    }

    function renderSampleEditor() {
        destroyJsonHost($page("#bjd-sample-input-host"));
        destroyJsonHost($page("#bjd-sample-expected-host"));
        destroyJsonHost($page("#bjd-sample-actual-host"));
        if (selectedSample < 0 || !samples[selectedSample]) {
            $page("#bjd-sample-editor").html(
                '<div class="text-muted py-5 text-center">Select or add a sample.</div>');
            return;
        }
        const item = normalizeSample(samples[selectedSample]);
        $page("#bjd-sample-editor").html(
            field("Title", '<input class="form-control" id="bjd-sample-title" value="' +
                esc(item.title) + '" placeholder="Sample name">') +
            '<div class="mb-3">' +
                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                    '<label class="form-label mb-0">Input document</label>' +
                    '<button class="btn btn-sm btn-outline-secondary" type="button" data-sample-beautify="input">' +
                        "Beautify</button>" +
                "</div>" +
                '<div class="jolt-spec-host" id="bjd-sample-input-host">' +
                    '<textarea class="form-control font-monospace" rows="16" placeholder="{ }">' +
                        esc(pretty(item.input)) + "</textarea></div>" +
            "</div>" +
            '<div class="mb-3">' +
                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                    '<label class="form-label mb-0">Expected output</label>' +
                    '<button class="btn btn-sm btn-outline-secondary" type="button" data-sample-beautify="expected">' +
                        "Beautify</button>" +
                "</div>" +
                '<div class="jolt-spec-host" id="bjd-sample-expected-host">' +
                    '<textarea class="form-control font-monospace" rows="16" placeholder="{ }">' +
                        esc(pretty(item.expected)) + "</textarea></div>" +
            "</div>" +
            '<div class="mb-0">' +
                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                    '<label class="form-label mb-0">Actual output</label>' +
                    '<div class="d-flex gap-2">' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" id="bjd-sample-actual-clear">' +
                            "Clear</button>" +
                        '<button class="btn btn-sm btn-outline-primary" type="button" id="bjd-sample-transform">' +
                            '<i class="bi bi-play me-1"></i>Transform</button>' +
                    "</div>" +
                "</div>" +
                '<div class="jolt-spec-host" id="bjd-sample-actual-host">' +
                    '<textarea class="form-control font-monospace" rows="16" readonly ' +
                        'placeholder="Run Transform to see Chainr output."></textarea></div>' +
                '<div class="form-text mt-2" id="bjd-sample-diff-status"></div>' +
            "</div>"
        );
        attachJsonHost($page("#bjd-sample-input-host"), "24rem");
        attachJsonHost($page("#bjd-sample-expected-host"), "24rem");
        attachJsonHost($page("#bjd-sample-actual-host"), "24rem", true);
        const expectedCm = $page("#bjd-sample-expected-host").data("cm");
        if (expectedCm) {
            expectedCm.on("change", highlightSampleDiff);
        }
    }

    function chiefErrorMessage(xhr) {
        const body = xhr && xhr.responseJSON;
        if (body && body.resourceType === "OperationOutcome") {
            const issue = (body.issue && body.issue[0]) || {};
            const details = (issue.details && issue.details.text) || issue.diagnostics;
            if (details) {
                return details;
            }
        }
        if (xhr && xhr.status === 0) {
            return "Transform failed. Is FHIR Chief running on port 8380?";
        }
        return "Transform failed (" + ((xhr && xhr.status) || "error") + ").";
    }

    function runSampleTransform() {
        const spec = collectSteps();
        if (spec.error) {
            CadminApi.showToast("danger", spec.error);
            return;
        }
        const sampleError = flushSelectedSample();
        if (sampleError) {
            CadminApi.showToast("danger", sampleError);
            return;
        }
        if (selectedSample < 0 || !samples[selectedSample]) {
            CadminApi.showToast("danger", "Select or add a sample.");
            return;
        }
        const $button = $page("#bjd-sample-transform");
        $button.prop("disabled", true);
        CadminFhirChief.transform(samples[selectedSample].input, spec.steps).done(function (output) {
            setJsonHostText($page("#bjd-sample-actual-host"), pretty(output == null ? null : output));
            highlightSampleDiff();
        }).fail(function (xhr) {
            CadminApi.showToast("danger", chiefErrorMessage(xhr));
        }).always(function () {
            $button.prop("disabled", false);
        });
    }

    function selectSample(index) {
        if (index === selectedSample && $page("#bjd-sample-input-host").length) {
            renderSampleList();
            return true;
        }
        const problem = flushSelectedSample();
        if (problem) {
            CadminApi.showToast("danger", problem);
            return false;
        }
        selectedSample = index;
        renderSampleList();
        renderSampleEditor();
        syncUnsavedFlag();
        return true;
    }

    function renderSamples(list) {
        destroyJsonHost($page("#bjd-sample-input-host"));
        destroyJsonHost($page("#bjd-sample-expected-host"));
        destroyJsonHost($page("#bjd-sample-actual-host"));
        samples = (list || []).map(normalizeSample);
        selectedSample = samples.length ? 0 : -1;
        renderSampleList();
        renderSampleEditor();
        syncUnsavedFlag();
    }

    function addSample(sample) {
        const problem = flushSelectedSample();
        if (problem) {
            CadminApi.showToast("danger", problem);
            return;
        }
        const item = normalizeSample(sample || emptySample(nextSampleTitle()));
        if (!item.title) {
            item.title = nextSampleTitle();
        }
        samples.push(item);
        selectedSample = samples.length - 1;
        renderSampleList();
        renderSampleEditor();
        syncUnsavedFlag();
    }

    function removeSample(index) {
        if (index < 0 || index >= samples.length) {
            return;
        }
        if (index === selectedSample) {
            destroyJsonHost($page("#bjd-sample-input-host"));
            destroyJsonHost($page("#bjd-sample-expected-host"));
            destroyJsonHost($page("#bjd-sample-actual-host"));
        } else {
            flushSelectedSample();
        }
        samples.splice(index, 1);
        if (!samples.length) {
            selectedSample = -1;
        } else if (selectedSample >= samples.length) {
            selectedSample = samples.length - 1;
        } else if (index < selectedSample) {
            selectedSample -= 1;
        }
        renderSampleList();
        renderSampleEditor();
        syncUnsavedFlag();
    }

    function moveSample(from, to) {
        flushSelectedSample();
        if (from < 0 || to < 0 || from >= samples.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const item = samples.splice(from, 1)[0];
        const dest = to > from ? to - 1 : to;
        samples.splice(dest, 0, item);
        if (selectedSample === from) {
            selectedSample = dest;
        } else if (from < selectedSample && dest >= selectedSample) {
            selectedSample -= 1;
        } else if (from > selectedSample && dest <= selectedSample) {
            selectedSample += 1;
        }
        renderSampleList();
        syncUnsavedFlag();
    }

    function clearSampleDrag() {
        sampleDragFrom = -1;
        sampleDropBefore = -1;
        $page("#bjd-sample-list .jolt-sample-item").removeClass("is-dragging drop-before drop-after");
    }

    function applyMeta() {
        library.title = $page("#bjd-title-input").val().trim();
        const name = $page("#bjd-name").val().trim();
        const version = $page("#bjd-version").val().trim();
        const description = $page("#bjd-description").val().trim();
        library.status = $page("#bjd-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Jolt" }],
            text: libraryType
        };
        if (name) {
            library.name = name;
        } else {
            delete library.name;
        }
        if (version) {
            library.version = version;
        } else {
            delete library.version;
        }
        if (description) {
            library.description = description;
        } else {
            delete library.description;
        }
    }

    function saveLibrary(next, withMeta, source) {
        if (withMeta) {
            applyMeta();
        } else {
            library.type = {
                coding: [{ code: libraryType, display: "Jolt" }],
                text: libraryType
            };
        }
        const collected = collectSteps();
        const samples = collectSamples();
        if (source === "samples") {
            if (samples.error) {
                CadminApi.showToast("danger", samples.error);
                return;
            }
            upsertSamples(samples.samples);
            if (!collected.error) {
                upsertJson(pretty(collected.steps));
            }
        } else {
            if (collected.error) {
                CadminApi.showToast("danger", collected.error);
                return;
            }
            upsertJson(pretty(collected.steps));
            if (!samples.error) {
                upsertSamples(samples.samples);
            }
        }
        CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "PUT", library).done(function (updated) {
            library = updated || library;
            captureSession();
            renderMeta();
            CadminResourceSource.mount(function () { return library; });
            CadminResourceGraph.mount(library);
            markEditorClean();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update Jolt library failed (" + xhr.status + ").");
        });
    }

    function viewModal(id, title, body) {
        return '<div class="modal fade" id="' + id + '" tabindex="-1">' +
            '<div class="modal-dialog modal-lg">' +
                '<div class="modal-content">' +
                    '<div class="modal-header"><h5 class="modal-title">' + title + "</h5>" +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' + body + "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>' +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function teardownJsonPreview() {
        if (jsonPreviewEditor) {
            jsonPreviewEditor.toTextArea();
            jsonPreviewEditor = null;
        }
    }

    function showLoadJson() {
        flushSelectedOp();
        const textarea = pageEl("bjd-load-json");
        if (!textarea) {
            return;
        }
        destroyJsonHost($page("#bjd-load-host"));
        textarea.value = ops.length ? pretty(ops) : pretty([emptyStep()]);
        attachJsonHost($page("#bjd-load-host"), "28rem");
    }

    function applyLoadedJson() {
        const text = jsonTextOf($page("#bjd-load-host"));
        if (!String(text || "").trim()) {
            CadminApi.showToast("danger", "Specification JSON is empty.");
            return false;
        }
        const steps = stepsFromText(text);
        if (!steps) {
            CadminApi.showToast("danger", "Specification is not valid JSON.");
            return false;
        }
        renderOperations(steps);
        return true;
    }

    function showGeneratedJson() {
        const collected = collectSteps();
        const textarea = pageEl("bjd-json-preview");
        if (!textarea) {
            return;
        }
        teardownJsonPreview();
        textarea.value = collected.error ? collected.error : pretty(collected.steps);
        if (typeof CodeMirror === "undefined") {
            return;
        }
        jsonPreviewEditor = CodeMirror.fromTextArea(textarea, jsonEditorOptions(true));
        jsonPreviewEditor.setSize("100%", "28rem");
        requestAnimationFrame(function () {
            if (jsonPreviewEditor) {
                jsonPreviewEditor.refresh();
            }
        });
    }

    function render(resource) {
        if (CadminApi.isLibraryType(resource, "pds-policies")) {
            window.location.hash = "#/pds-policies/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "camel-route")) {
            window.location.hash = "#/camel-routes/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "icg-route")) {
            window.location.hash = "#/icg-routes/" + encodeURIComponent(resource.id);
            return;
        }
        const newId = sessionKey(resource);
        if (sessionId && sessionId !== newId) {
            teardownJsonPreview();
            captureSession();
        }
        destroySpecEditors(pageRoot());
        sessionId = newId;
        library = resource;
        ops = [];
        selectedOp = -1;
        samples = [];
        selectedSample = -1;
        savedSnapshot = "";
        jsonPreviewEditor = null;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/jolts">' +
                        '<i class="bi bi-arrow-left me-1"></i>Jolt Specs</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="h3 mb-0 page-title" id="bjd-title"></h1>' +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="bjd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card card-success card-outline mb-4">' +
                '<form id="bjd-spec-form">' +
                    '<div class="card-header">' +
                        "<div>" +
                            '<h3 class="card-title">Jolt specification</h3>' +
                            '<div class="small text-muted mt-1"><code>' + esc(specContentType) + "</code></div>" +
                        "</div>" +
                        '<div class="card-tools d-flex flex-wrap align-items-center gap-2">' +
                            '<select class="form-select form-select-sm" id="bjd-template" style="max-width:16rem">' +
                                '<option value="">Insert template…</option>' +
                                templates.map(function (item) {
                                    return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
                                }).join("") +
                            "</select>" +
                            '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#bjd-load-modal">' +
                                '<i class="bi bi-upload me-1"></i>Load JSON</button>' +
                            '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#bjd-json-modal">' +
                                '<i class="bi bi-braces me-1"></i>View JSON</button>' +
                            '<button class="btn btn-sm btn-primary" type="submit">Save</button>' +
                        "</div>" +
                    "</div>" +
                    '<div class="card-body">' +
                        '<div class="row jolt-spec-split">' +
                            '<div class="col-lg-4 mb-3 mb-lg-0">' +
                                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                                    '<label class="form-label mb-0">Operations</label>' +
                                    '<button class="btn btn-sm btn-outline-primary" type="button" id="bjd-op-add">' +
                                        '<i class="bi bi-plus-lg me-1"></i>Add</button>' +
                                "</div>" +
                                '<div class="list-group jolt-op-list" id="bjd-ops"></div>' +
                                '<div class="text-muted small d-none mt-2" id="bjd-ops-empty">No operations.</div>' +
                                '<div class="form-text">Drag to set Chainr order. Select an operation to edit its spec.</div>' +
                            "</div>" +
                            '<div class="col-lg-8">' +
                                '<div id="bjd-op-editor"></div>' +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</form>" +
            "</div>" +
            '<div class="card card-info card-outline mb-4">' +
                '<form id="bjd-samples-form">' +
                    '<div class="card-header">' +
                        "<div>" +
                            '<h3 class="card-title">Samples</h3>' +
                            '<div class="small text-muted mt-1"><code>' + esc(sampleContentType) + "</code></div>" +
                        "</div>" +
                        '<div class="card-tools d-flex flex-wrap align-items-center gap-2">' +
                            '<button class="btn btn-sm btn-primary" type="submit">Save</button>' +
                        "</div>" +
                    "</div>" +
                    '<div class="card-body">' +
                        '<div class="row jolt-spec-split">' +
                            '<div class="col-lg-4 mb-3 mb-lg-0">' +
                                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                                    '<label class="form-label mb-0">Samples</label>' +
                                    '<button class="btn btn-sm btn-outline-primary" type="button" id="bjd-sample-add">' +
                                        '<i class="bi bi-plus-lg me-1"></i>Add</button>' +
                                "</div>" +
                                '<div class="list-group jolt-sample-list" id="bjd-sample-list"></div>' +
                                '<div class="text-muted small d-none mt-2" id="bjd-samples-empty">No samples.</div>' +
                                '<div class="form-text">Drag to set sample order. Select a sample to edit its input and expected output.</div>' +
                            "</div>" +
                            '<div class="col-lg-8">' +
                                '<div id="bjd-sample-editor"></div>' +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</form>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Identity</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#bjd-meta-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="bjd-meta"></div>' +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            viewModal("bjd-json-modal", "Generated JSON",
                '<div class="yaml-preview-host">' +
                    '<textarea id="bjd-json-preview" class="form-control font-monospace" readonly></textarea>' +
                "</div>") +
            '<div class="modal fade" id="bjd-load-modal" tabindex="-1">' +
                '<div class="modal-dialog modal-lg">' +
                    '<form class="modal-content" id="bjd-load-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Load JSON spec</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            '<div class="d-flex justify-content-between align-items-center mb-2">' +
                                '<label class="form-label mb-0" for="bjd-load-json">Specification</label>' +
                                '<button class="btn btn-sm btn-outline-secondary" type="button" id="bjd-load-beautify">' +
                                    "Beautify</button>" +
                            "</div>" +
                            '<div class="jolt-spec-host" id="bjd-load-host">' +
                                '<textarea class="form-control font-monospace" id="bjd-load-json" rows="16" placeholder="[ { &quot;operation&quot;: &quot;shift&quot;, &quot;spec&quot;: { } } ]"></textarea>' +
                            "</div>" +
                            '<div class="form-text">Paste a Jolt Chainr array. Loading replaces the operations in the editor.</div>' +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Load</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>" +
            '<div class="modal fade" id="bjd-meta-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="bjd-meta-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Edit identity</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Title", '<input class="form-control" id="bjd-title-input">') +
                            field("Name", '<input class="form-control font-monospace" id="bjd-name">') +
                            field("Status", '<select class="form-select" id="bjd-status">' +
                                optionsHtml(statusOptions, "") + "</select>") +
                            field("Version", '<input class="form-control" id="bjd-version">') +
                            field("Description", '<textarea class="form-control" id="bjd-description" rows="3"></textarea>') +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Save</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return library; });
        CadminResourceGraph.mount(library);
        CadminResourceHistory.mount(library);
        renderMeta();
        const stored = readJson();
        const steps = stepsFromText(stored);
        if (stored && !steps) {
            CadminApi.showToast("warning", "Stored specification is not valid JSON. Starting from an identity shift.");
        }
        renderOperations(steps || [emptyStep()]);
        renderSamples(readSamples());
        markEditorClean();
        captureSession();
        bind();
    }

    function reveal(resource) {
        activateSession(resource);
        hidePageModals();
        refreshSpecEditors();
        requestAnimationFrame(function () {
            requestAnimationFrame(refreshSpecEditors);
        });
        syncUnsavedFlag();
    }

    function renderMeta() {
        $page("#bjd-title").text(library.title || library.name || "Jolt spec");
        $page("#bjd-meta").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Title</dt><dd class="col-sm-9">' + esc(library.title || "—") + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(library.status) + "</dd>" +
                '<dt class="col-sm-3">Type</dt><dd class="col-sm-9"><code>' + esc(libraryType) + "</code></dd>" +
                '<dt class="col-sm-3">Name</dt><dd class="col-sm-9"><code>' + esc(library.name || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Version</dt><dd class="col-sm-9"><code>' + esc(library.version || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' + esc(library.description || "—") + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(library.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function populateMetaForm() {
        $page("#bjd-title-input").val(library.title || "");
        $page("#bjd-name").val(library.name || "");
        $page("#bjd-status").val(library.status || "draft");
        $page("#bjd-version").val(library.version || "");
        $page("#bjd-description").val(library.description || "");
        CadminApi.fillValueSetSelect($page("#bjd-status"), CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: library.status || "draft"
        });
    }

    function insertTemplate(id) {
        const match = templates.find(function (item) { return item.id === id; });
        if (!match) {
            return;
        }
        function apply() {
            renderOperations(match.steps);
        }
        if (ops.length) {
            CadminApi.confirm({
                title: "Replace the current specification with this template?",
                confirmText: "Replace",
                icon: "warning"
            }).done(apply);
            return;
        }
        apply();
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".bjdetail");
        $root.on("click.bjdetail", "#bjd-delete", function () {
            CadminApi.confirm("Delete this Jolt spec?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    const id = library && library.id;
                    destroySpecEditors(pageRoot());
                    dropSession(id);
                    CadminApi.showToast("success", "Jolt spec deleted.");
                    window.location.hash = "#/jolts";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete Jolt spec failed (" + xhr.status + ").");
                });
            });
        });
        $root.on("change.bjdetail", "#bjd-template", function () {
            const id = $(this).val();
            $(this).val("");
            insertTemplate(id);
        });
        $root.on("click.bjdetail", "#bjd-op-add", function () {
            addOperation();
        });
        $root.on("click.bjdetail", "[data-op-beautify]", function () {
            beautifyJsonHost($page("#bjd-op-spec-host"), "Operation spec");
        });
        $root.on("click.bjdetail", "#bjd-ops .jolt-op-item", function (event) {
            if ($(event.target).closest("[data-op-remove]").length) {
                return;
            }
            selectOp(Number($(this).attr("data-op-index")));
        });
        $root.on("click.bjdetail", "[data-op-remove]", function (event) {
            event.preventDefault();
            event.stopPropagation();
            removeOperation(Number($(this).attr("data-op-remove")));
        });
        $root.on("change.bjdetail", "#bjd-op-type", function () {
            if (selectedOp >= 0 && ops[selectedOp]) {
                ops[selectedOp].operation = $(this).val() || "";
                renderOpList();
            }
            syncUnsavedFlag();
        });
        $root.on("dragstart.bjdetail", "#bjd-ops .jolt-op-item", function (event) {
            if ($(event.target).closest("button").length) {
                event.preventDefault();
                return;
            }
            dragFrom = Number($(this).attr("data-op-index"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", String(dragFrom));
            }
            $(this).addClass("is-dragging");
        });
        $root.on("dragover.bjdetail", "#bjd-ops .jolt-op-item", function (event) {
            if (dragFrom < 0) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $page("#bjd-ops .jolt-op-item").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            dropBefore = Number($(this).attr("data-op-index")) + (before ? 0 : 1);
        });
        $root.on("drop.bjdetail", "#bjd-ops .jolt-op-item", function (event) {
            if (dragFrom < 0) {
                return;
            }
            event.preventDefault();
            const from = dragFrom;
            const to = dropBefore;
            clearOpDrag();
            moveOp(from, to);
        });
        $root.on("dragend.bjdetail", "#bjd-ops .jolt-op-item", function () {
            clearOpDrag();
        });
        $root.on("input.bjdetail change.bjdetail", "#bjd-spec-form :input, #bjd-samples-form :input", syncUnsavedFlag);
        $root.on("input.bjdetail", "#bjd-sample-title", function () {
            if (selectedSample >= 0 && samples[selectedSample]) {
                samples[selectedSample].title = ($(this).val() || "").trim();
                renderSampleList();
            }
            syncUnsavedFlag();
        });
        $root.on("click.bjdetail", "#bjd-sample-add", function () {
            addSample();
        });
        $root.on("click.bjdetail", "#bjd-sample-transform", function () {
            runSampleTransform();
        });
        $root.on("click.bjdetail", "#bjd-sample-actual-clear", function () {
            clearActualOutput();
        });
        $root.on("click.bjdetail", "#bjd-sample-list .jolt-sample-item", function (event) {
            if ($(event.target).closest("[data-sample-remove]").length) {
                return;
            }
            selectSample(Number($(this).attr("data-sample-index")));
        });
        $root.on("click.bjdetail", "[data-sample-beautify]", function () {
            const kind = $(this).attr("data-sample-beautify");
            const $host = kind === "expected" ? $page("#bjd-sample-expected-host") : $page("#bjd-sample-input-host");
            const label = kind === "expected" ? "Sample expected output" : "Sample input";
            beautifyJsonHost($host, label);
        });
        $root.on("click.bjdetail", "[data-sample-remove]", function (event) {
            event.preventDefault();
            event.stopPropagation();
            removeSample(Number($(this).attr("data-sample-remove")));
        });
        $root.on("dragstart.bjdetail", "#bjd-sample-list .jolt-sample-item", function (event) {
            if ($(event.target).closest("button").length) {
                event.preventDefault();
                return;
            }
            sampleDragFrom = Number($(this).attr("data-sample-index"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", String(sampleDragFrom));
            }
            $(this).addClass("is-dragging");
        });
        $root.on("dragover.bjdetail", "#bjd-sample-list .jolt-sample-item", function (event) {
            if (sampleDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $page("#bjd-sample-list .jolt-sample-item").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            sampleDropBefore = Number($(this).attr("data-sample-index")) + (before ? 0 : 1);
        });
        $root.on("drop.bjdetail", "#bjd-sample-list .jolt-sample-item", function (event) {
            if (sampleDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const from = sampleDragFrom;
            const to = sampleDropBefore;
            clearSampleDrag();
            moveSample(from, to);
        });
        $root.on("dragend.bjdetail", "#bjd-sample-list .jolt-sample-item", function () {
            clearSampleDrag();
        });
        $root.on("submit.bjdetail", "#bjd-spec-form", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Jolt spec saved.");
            });
        });
        $root.on("submit.bjdetail", "#bjd-samples-form", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Jolt samples saved.");
            }, false, "samples");
        });
        $root.on("show.bs.modal.bjdetail", "#bjd-meta-modal", populateMetaForm);
        $root.on("shown.bs.modal.bjdetail", "#bjd-json-modal", showGeneratedJson);
        $root.on("hidden.bs.modal.bjdetail", "#bjd-json-modal", teardownJsonPreview);
        $root.on("shown.bs.modal.bjdetail", "#bjd-load-modal", showLoadJson);
        $root.on("hidden.bs.modal.bjdetail", "#bjd-load-modal", function () {
            destroyJsonHost($page("#bjd-load-host"));
        });
        $root.on("click.bjdetail", "#bjd-load-beautify", function () {
            beautifyJsonHost($page("#bjd-load-host"), "Specification");
        });
        $root.on("submit.bjdetail", "#bjd-load-form", function (event) {
            event.preventDefault();
            if (!applyLoadedJson()) {
                return;
            }
            const el = pageEl("bjd-load-modal");
            const modal = el && bootstrap.Modal.getInstance(el);
            if (modal) {
                modal.hide();
            }
            CadminApi.showToast("success", "JSON spec loaded into the editor.");
        });
        $root.on("submit.bjdetail", "#bjd-meta-form", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                const el = pageEl("bjd-meta-modal");
                const modal = el && bootstrap.Modal.getInstance(el);
                if (modal) {
                    modal.hide();
                }
                CadminApi.showToast("success", "Identity updated.");
            }, true);
        });
    }

    return {
        render: render,
        reveal: reveal,
        suspend: suspend,
        drop: dropSession,
        editorValue: editorValue
    };
}());
