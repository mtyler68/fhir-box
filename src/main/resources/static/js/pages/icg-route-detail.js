window.CadminIcgRouteDetail = (function () {
    const libraryType = "icg-route";
    const routeContentType = "application/gateway+yaml";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const templates = [
        {
            id: "httpbin",
            label: "Path proxy (httpbin)",
            yaml: "- id: httpbin\n  uri: https://httpbin.org\n  predicates:\n    - Path=/httpbin/**\n  filters:\n    - StripPrefix=1\n"
        },
        {
            id: "wiremock",
            label: "WireMock path",
            yaml: "- id: wiremock_proxy\n  uri: http://localhost:9090\n  predicates:\n    - Path=/icg-wire/**\n  filters:\n    - StripPrefix=1\n"
        },
        {
            id: "host",
            label: "Host + method",
            yaml: "- id: host_api\n  uri: https://httpbin.org\n  predicates:\n    - Host=api.example.com\n    - Method=GET,POST\n    - Path=/api/**\n"
        },
        {
            id: "rewrite",
            label: "Rewrite path",
            yaml: "- id: rewrite_api\n  uri: http://localhost:9090\n  predicates:\n    - name: Path\n      args:\n        pattern: /legacy/**\n  filters:\n    - name: RewritePath\n      args:\n        regexp: /legacy/(?<segment>.*)\n        replacement: /${segment}\n"
        }
    ];
    const hintWords = [
        "id", "uri", "predicates", "filters", "order", "metadata",
        "Path", "Host", "Method", "Header", "Query", "Cookie", "After", "Before",
        "Between", "RemoteAddr", "Weight", "ReadBody",
        "StripPrefix", "PrefixPath", "SetPath", "RewritePath", "AddRequestHeader",
        "AddResponseHeader", "RemoveRequestHeader", "RemoveResponseHeader",
        "SetStatus", "Retry", "PreserveHostHeader", "RequestRateLimiter",
        "name", "args", "pattern", "parts", "regexp", "replacement"
    ];
    let library = null;
    let editor = null;
    let hintRegistered = false;
    let savedYaml = "";

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

    function isRouteYaml(item) {
        const type = ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
        return type === routeContentType || type === "text/yaml" || type === "application/x-yaml"
            || type === "text/x-yaml" || type === "application/yaml";
    }

    function findRouteAttachment() {
        return (library.content || []).find(isRouteYaml) || (library.content || [])[0] || null;
    }

    function readYaml() {
        const attachment = findRouteAttachment();
        return attachment && attachment.data ? decodeText(attachment.data) : "";
    }

    function upsertYaml(text) {
        const attachment = {
            contentType: routeContentType,
            title: "ICG route",
            data: encodeText(text || "")
        };
        library.content = library.content || [];
        let found = false;
        library.content = library.content.map(function (item) {
            if (!isRouteYaml(item)) {
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

    function isYamlPropertyPosition(line, wordStart) {
        return /^\s*(-\s+)?$/.test(String(line || "").slice(0, wordStart));
    }

    function emptyYamlPropertyIndent(line, indentUnit) {
        const match = /^(\s*(?:-\s+)?)([A-Za-z][A-Za-z0-9_-]*)\s*:\s*$/.exec(line || "");
        if (!match) {
            return null;
        }
        return match[1].length + (indentUnit || 2);
    }

    function insertEmptyPropertyNewline(cm) {
        if (cm.somethingSelected()) {
            return CodeMirror.Pass;
        }
        const cursor = cm.getCursor();
        const line = cm.getLine(cursor.line) || "";
        const indent = emptyYamlPropertyIndent(line, cm.getOption("indentUnit") || 2);
        if (indent == null) {
            return CodeMirror.Pass;
        }
        const colonAt = line.indexOf(":");
        if (colonAt < 0 || cursor.ch < colonAt) {
            return CodeMirror.Pass;
        }
        cm.replaceSelection("\n" + new Array(indent + 1).join(" "), "end");
    }

    function registerHint() {
        if (hintRegistered || typeof CodeMirror === "undefined") {
            return;
        }
        hintRegistered = true;
        CodeMirror.registerHelper("hint", "icg-yaml", function (cm) {
            const cursor = cm.getCursor();
            const line = cm.getLine(cursor.line) || "";
            const before = line.slice(0, cursor.ch);
            const match = before.match(/[A-Za-z][A-Za-z0-9_-]*$/);
            const word = match ? match[0] : "";
            const start = cursor.ch - word.length;
            const prefix = word.toLowerCase();
            const asProperty = isYamlPropertyPosition(line, start);
            const colonAlready = /^\s*:/.test(line.slice(cursor.ch));
            const list = hintWords.filter(function (item) {
                return !prefix || item.toLowerCase().indexOf(prefix) === 0;
            }).map(function (item) {
                if (!asProperty || colonAlready) {
                    return item;
                }
                return { text: item + ": ", displayText: item };
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
        return editor ? editor.getValue() : ($("#ird-yaml").val() || "");
    }

    function syncUnsavedFlag() {
        CadminApi.setUnsavedFlag(CadminWorkspace.root(), editorValue() !== savedYaml);
    }

    function markEditorClean() {
        savedYaml = editorValue();
        syncUnsavedFlag();
    }

    function validateYaml(text) {
        const source = String(text || "");
        if (!source.trim()) {
            return "Route YAML is empty.";
        }
        const lines = source.split(/\r?\n/);
        let i;
        for (i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            if (!line.trim() || /^\s*#/.test(line)) {
                continue;
            }
            if (/^\t/.test(line)) {
                return "Line " + (i + 1) + " uses a tab. Indent gateway YAML with spaces.";
            }
            if (/^\s+[^ \t].*:/.test(line) && (line.length - line.trimStart().length) % 2 !== 0) {
                return "Line " + (i + 1) + " is not indented in 2-space steps.";
            }
        }
        if (!/(^|\n)\s*-?\s*(id|uri|predicates|routes)\s*:/.test(source)) {
            return "YAML should define a Spring Cloud Gateway route with id, uri, and predicates.";
        }
        return "";
    }

    function mountEditor(text) {
        destroyEditor();
        const textarea = document.getElementById("ird-yaml");
        if (!textarea) {
            return;
        }
        textarea.value = text || "";
        if (typeof CodeMirror === "undefined") {
            return;
        }
        registerHint();
        editor = CodeMirror.fromTextArea(textarea, {
            mode: "yaml",
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
                Enter: insertEmptyPropertyNewline,
                Tab: function (cm) {
                    if (cm.somethingSelected()) {
                        cm.indentSelection("add");
                    } else {
                        cm.replaceSelection("  ", "end");
                    }
                }
            },
            hintOptions: { hint: CodeMirror.hint["icg-yaml"], completeSingle: false }
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
        library.title = $("#ird-title-input").val().trim();
        const name = $("#ird-name").val().trim();
        const version = $("#ird-version").val().trim();
        const description = $("#ird-description").val().trim();
        library.status = $("#ird-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "ICG Route" }],
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
                coding: [{ code: libraryType, display: "ICG Route" }],
                text: libraryType
            };
        }
        const yaml = editorValue();
        const problem = validateYaml(yaml);
        if (problem) {
            CadminApi.showToast("danger", problem);
            return;
        }
        upsertYaml(yaml);
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
            CadminApi.showToast("danger", "Update ICG route failed (" + xhr.status + ").");
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
        library = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/icg-routes">' +
                        '<i class="bi bi-arrow-left me-1"></i>ICG Routes</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="h3 mb-0 page-title" id="ird-title"></h1>' +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<a class="btn btn-outline-secondary" href="#/icg">' +
                        '<i class="bi bi-router me-1"></i>Live ICG</a>' +
                    '<button class="btn btn-primary" type="button" id="ird-save">' +
                        '<i class="bi bi-check2 me-1"></i>Save</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="ird-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Identity</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#ird-meta-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="ird-meta"></div>' +
            "</div>" +
            '<div class="card shadow mb-4" id="icg-route-yaml-card">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                    "<div>" +
                        '<h6 class="m-0">Gateway route YAML</h6>' +
                        '<div class="small text-muted mt-1"><code>' + esc(routeContentType) + "</code>" +
                            " · Active libraries are deployed by Integrator Connect Gateway</div>" +
                    "</div>" +
                    '<div class="d-flex flex-nowrap align-items-center gap-2">' +
                        '<select class="form-select form-select-sm" id="ird-template" style="max-width:16rem">' +
                            '<option value="">Insert template…</option>' +
                            templates.map(function (item) {
                                return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
                            }).join("") +
                        "</select>" +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" id="ird-find">' +
                            '<i class="bi bi-search me-1"></i>Find</button>' +
                    "</div>" +
                "</div>" +
                '<div class="card-body p-0">' +
                    '<textarea id="ird-yaml" class="d-none"></textarea>' +
                "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="ird-meta-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="ird-meta-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Edit identity</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Title", '<input class="form-control" id="ird-title-input">') +
                            field("Name", '<input class="form-control font-monospace" id="ird-name">') +
                            field("Status", '<select class="form-select" id="ird-status">' +
                                optionsHtml(statusOptions, "") + "</select>") +
                            field("Version", '<input class="form-control" id="ird-version">') +
                            field("Description", '<textarea class="form-control" id="ird-description" rows="3"></textarea>') +
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
        mountEditor(readYaml() || templates[0].yaml);
        markEditorClean();
        bind();
        $("#ird-meta-modal").on("show.bs.modal", populateMetaForm);
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        const pane = document.getElementById("app-content-detail") || document;
        const wrap = pane.querySelector("#icg-route-yaml-card .CodeMirror");
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
            const textarea = pane.querySelector("#ird-yaml");
            if (textarea) {
                mountEditor(textarea.value);
            }
        }
        syncUnsavedFlag();
    }

    function renderMeta() {
        $("#ird-title").text(library.title || library.name || "ICG route");
        $("#ird-meta").html(
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
        $("#ird-title-input").val(library.title || "");
        $("#ird-name").val(library.name || "");
        $("#ird-status").val(library.status || "draft");
        $("#ird-version").val(library.version || "");
        $("#ird-description").val(library.description || "");
        CadminApi.fillValueSetSelect("#ird-status", CadminApi.valueSets.publicationStatus, {
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
                editor.setValue(match.yaml);
                editor.focus();
            } else {
                $("#ird-yaml").val(match.yaml);
            }
        }
        if (editor && editor.getValue().trim()) {
            CadminApi.confirm({
                title: "Replace the current YAML with this template?",
                confirmText: "Replace",
                icon: "warning"
            }).done(apply);
            return;
        }
        apply();
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".irdetail");
        $root.on("click.irdetail", "#ird-save", function () {
            saveLibrary(function () {
                CadminApi.showToast("success", "ICG route saved.");
            });
        });
        $root.on("click.irdetail", "#ird-delete", function () {
            CadminApi.confirm("Delete this ICG route?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    destroyEditor();
                    CadminApi.showToast("success", "ICG route deleted.");
                    window.location.hash = "#/icg-routes";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete ICG route failed (" + xhr.status + ").");
                });
            });
        });
        $root.on("change.irdetail", "#ird-template", function () {
            const id = $(this).val();
            $(this).val("");
            insertTemplate(id);
        });
        $root.on("click.irdetail", "#ird-find", function () {
            if (editor && CodeMirror.commands.findPersistent) {
                CodeMirror.commands.findPersistent(editor);
            } else if (editor && CodeMirror.commands.find) {
                CodeMirror.commands.find(editor);
            }
        });
        $("#ird-meta-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                const el = document.getElementById("ird-meta-modal");
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
