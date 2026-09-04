window.CadminJoltDetail = (function () {
    const libraryType = "jolt";
    const specContentType = "application/jolt+json";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const templates = [
        {
            id: "identity",
            label: "Identity shift",
            json: JSON.stringify([{ operation: "shift", spec: { "*": "&" } }], null, 2) + "\n"
        },
        {
            id: "ratings",
            label: "Shift ratings (classic)",
            json: JSON.stringify([
                {
                    operation: "shift",
                    spec: {
                        rating: {
                            primary: {
                                value: "Rating",
                                max: "RatingRange"
                            },
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
                        SecondaryRatings: {
                            "*": { Range: 5 }
                        }
                    }
                }
            ], null, 2) + "\n"
        },
        {
            id: "remove",
            label: "Remove fields",
            json: JSON.stringify([
                {
                    operation: "remove",
                    spec: {
                        password: "",
                        ssn: ""
                    }
                }
            ], null, 2) + "\n"
        },
        {
            id: "cardinality",
            label: "Cardinality",
            json: JSON.stringify([
                {
                    operation: "cardinality",
                    spec: {
                        identifier: "MANY",
                        name: { "*": "ONE" }
                    }
                }
            ], null, 2) + "\n"
        },
        {
            id: "modify",
            label: "Modify overwrite",
            json: JSON.stringify([
                {
                    operation: "modify-overwrite-beta",
                    spec: {
                        fullName: "=concat(@(1,given),' ',@(1,family))",
                        id: "=toLower"
                    }
                }
            ], null, 2) + "\n"
        },
        {
            id: "sort",
            label: "Sort keys",
            json: JSON.stringify([{ operation: "sort" }], null, 2) + "\n"
        }
    ];
    const hintWords = [
        "operation", "spec", "shift", "default", "remove", "cardinality", "sort",
        "modify-overwrite-beta", "modify-default-beta", "modify-define-beta"
    ];
    let library = null;
    let editor = null;
    let hintRegistered = false;
    let savedJson = "";

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

    function isJoltJson(item) {
        const type = ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
        return type === specContentType || type === "application/json" || type === "text/json"
            || type === "application/javascript";
    }

    function findSpecAttachment() {
        return (library.content || []).find(isJoltJson) || (library.content || [])[0] || null;
    }

    function readJson() {
        const attachment = findSpecAttachment();
        return attachment && attachment.data ? decodeText(attachment.data) : "";
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

    function destroyEditor() {
        if (editor) {
            editor.toTextArea();
            editor = null;
        }
    }

    function editorValue() {
        return editor ? editor.getValue() : ($("#bjd-json").val() || "");
    }

    function syncUnsavedFlag() {
        CadminApi.setUnsavedFlag(CadminWorkspace.root(), editorValue() !== savedJson);
    }

    function markEditorClean() {
        savedJson = editorValue();
        syncUnsavedFlag();
    }

    function validateJolt(text) {
        const source = String(text || "").trim();
        if (!source) {
            return "Jolt specification is empty.";
        }
        let parsed;
        try {
            parsed = JSON.parse(source);
        } catch (err) {
            return "Jolt specification is not valid JSON.";
        }
        const steps = Array.isArray(parsed) ? parsed : [parsed];
        if (!steps.length) {
            return "Jolt specification should be a non-empty array of operations.";
        }
        let i;
        for (i = 0; i < steps.length; i += 1) {
            const step = steps[i];
            if (!step || typeof step !== "object" || Array.isArray(step)) {
                return "Step " + (i + 1) + " must be an object with an operation.";
            }
            if (!step.operation) {
                return "Step " + (i + 1) + " is missing operation.";
            }
        }
        return "";
    }

    function mountEditor(text) {
        destroyEditor();
        const textarea = document.getElementById("bjd-json");
        if (!textarea) {
            return;
        }
        textarea.value = text || "";
        if (typeof CodeMirror === "undefined") {
            return;
        }
        registerHint();
        editor = CodeMirror.fromTextArea(textarea, {
            mode: { name: "javascript", json: true },
            theme: "material-darker",
            lineNumbers: true,
            lineWrapping: false,
            indentUnit: 2,
            tabSize: 2,
            indentWithTabs: false,
            matchBrackets: true,
            autoCloseBrackets: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            highlightSelectionMatches: { minChars: 2, showToken: /\w/ },
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                "Ctrl-F": "findPersistent",
                "Cmd-F": "findPersistent",
                "Ctrl-H": "replace",
                "Cmd-Alt-F": "replace",
                "Ctrl-G": "findNext",
                "Cmd-G": "findNext",
                "Shift-Ctrl-G": "findPrev",
                "Shift-Cmd-G": "findPrev",
                "Alt-G": "jumpToLine",
                "Ctrl-/": "toggleComment",
                "Cmd-/": "toggleComment",
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
        });
        editor.getWrapperElement().classList.add("camel-route-editor");
        editor.setSize("100%", "36rem");
        editor.on("change", syncUnsavedFlag);
        editor.on("inputRead", function (cm, change) {
            if (change.text.length !== 1 || !/^[A-Za-z]$/.test(change.text[0])) {
                return;
            }
            CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
        });
        requestAnimationFrame(function () {
            if (editor) {
                editor.refresh();
            }
        });
    }

    function applyMeta() {
        library.title = $("#bjd-title-input").val().trim();
        const name = $("#bjd-name").val().trim();
        const version = $("#bjd-version").val().trim();
        const description = $("#bjd-description").val().trim();
        library.status = $("#bjd-status").val() || "draft";
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

    function saveLibrary(next, withMeta) {
        if (withMeta) {
            applyMeta();
        } else {
            library.type = {
                coding: [{ code: libraryType, display: "Jolt" }],
                text: libraryType
            };
        }
        const json = editorValue();
        const problem = validateJolt(json);
        if (problem) {
            CadminApi.showToast("danger", problem);
            return;
        }
        upsertJson(json);
        CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "PUT", library).done(function (updated) {
            library = updated || library;
            renderMeta();
            CadminResourceSource.mount(function () { return library; });
            CadminResourceGraph.mount(library);
            markEditorClean();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update Jolt spec failed (" + xhr.status + ").");
        });
    }

    function render(resource) {
        destroyEditor();
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
        library = resource;
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
                    '<button class="btn btn-primary" type="button" id="bjd-save">' +
                        '<i class="bi bi-check2 me-1"></i>Save</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="bjd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Identity</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#bjd-meta-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="bjd-meta"></div>' +
            "</div>" +
            '<div class="card shadow mb-4" id="jolt-json-card">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                    "<div>" +
                        '<h6 class="m-0">Jolt transform specification</h6>' +
                        '<div class="small text-muted mt-1"><code>' + esc(specContentType) + "</code>" +
                            " · Jolt Chainr operations</div>" +
                    "</div>" +
                    '<div class="d-flex flex-nowrap align-items-center gap-2">' +
                        '<select class="form-select form-select-sm" id="bjd-template" style="max-width:16rem">' +
                            '<option value="">Insert template…</option>' +
                            templates.map(function (item) {
                                return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
                            }).join("") +
                        "</select>" +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" id="bjd-find">' +
                            '<i class="bi bi-search me-1"></i>Find</button>' +
                    "</div>" +
                "</div>" +
                '<div class="card-body p-0">' +
                    '<textarea id="bjd-json" class="d-none"></textarea>' +
                "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
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
        mountEditor(readJson() || templates[0].json);
        markEditorClean();
        bind();
        $("#bjd-meta-modal").on("show.bs.modal", populateMetaForm);
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        const pane = document.getElementById("app-content-detail") || document;
        const wrap = pane.querySelector("#jolt-json-card .CodeMirror");
        if (wrap && wrap.CodeMirror) {
            editor = wrap.CodeMirror;
            function refreshEditor() {
                if (!editor) {
                    return;
                }
                editor.setSize("100%", "36rem");
                editor.refresh();
            }
            refreshEditor();
            requestAnimationFrame(function () {
                requestAnimationFrame(refreshEditor);
            });
        } else {
            const textarea = pane.querySelector("#bjd-json");
            if (textarea) {
                mountEditor(textarea.value);
            }
        }
        syncUnsavedFlag();
    }

    function renderMeta() {
        $("#bjd-title").text(library.title || library.name || "Jolt spec");
        $("#bjd-meta").html(
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
        $("#bjd-title-input").val(library.title || "");
        $("#bjd-name").val(library.name || "");
        $("#bjd-status").val(library.status || "draft");
        $("#bjd-version").val(library.version || "");
        $("#bjd-description").val(library.description || "");
        CadminApi.fillValueSetSelect("#bjd-status", CadminApi.valueSets.publicationStatus, {
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
            if (editor) {
                editor.setValue(match.json);
                editor.focus();
            } else {
                $("#bjd-json").val(match.json);
            }
        }
        if (editor && editor.getValue().trim()) {
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
        $root.on("click.bjdetail", "#bjd-save", function () {
            saveLibrary(function () {
                CadminApi.showToast("success", "Jolt spec saved.");
            });
        });
        $root.on("click.bjdetail", "#bjd-delete", function () {
            CadminApi.confirm("Delete this Jolt spec?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    destroyEditor();
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
        $root.on("click.bjdetail", "#bjd-find", function () {
            if (editor && CodeMirror.commands.findPersistent) {
                CodeMirror.commands.findPersistent(editor);
            } else if (editor && CodeMirror.commands.find) {
                CodeMirror.commands.find(editor);
            }
        });
        $("#bjd-meta-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                const el = document.getElementById("bjd-meta-modal");
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
        editorValue: editorValue
    };
}());
