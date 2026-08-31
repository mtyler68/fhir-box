window.CadminCamelRouteDetail = (function () {
    const libraryType = "camel-route";
    const routeContentType = "application/camel+yaml";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const templates = [
        {
            id: "timer",
            label: "Timer to log",
            yaml: "- route:\n    id: timer_log\n    from:\n      uri: timer:tick\n      parameters:\n        period: 5000\n      steps:\n        - setBody:\n            simple: \"Hello from Camel\"\n        - log:\n            message: \"${body}\"\n"
        },
        {
            id: "direct",
            label: "Direct to log",
            yaml: "- route:\n    id: direct_log\n    from:\n      uri: direct:start\n      steps:\n        - log:\n            message: \"Received ${body}\"\n        - to:\n            uri: log:done\n"
        },
        {
            id: "rest",
            label: "REST GET",
            yaml: "- rest:\n    path: /say\n    get:\n      - path: /hello\n        to: direct:hello\n- route:\n    id: hello_rest\n    from:\n      uri: direct:hello\n      steps:\n        - setBody:\n            constant: \"Hello Camel\"\n"
        },
        {
            id: "choice",
            label: "Content-based router",
            yaml: "- route:\n    id: choice_route\n    from:\n      uri: direct:in\n      steps:\n        - choice:\n            when:\n              - simple: \"${header.type} == 'ok'\"\n                steps:\n                  - to:\n                      uri: direct:ok\n            otherwise:\n              steps:\n                - to:\n                    uri: direct:other\n"
        },
        {
            id: "kafka",
            label: "Kafka consumer",
            yaml: "- route:\n    id: kafka_consumer\n    from:\n      uri: kafka:events\n      parameters:\n        brokers: localhost:9092\n      steps:\n        - unmarshal:\n            json: {}\n        - log:\n            message: \"Event ${body}\"\n"
        }
    ];
    const hintWords = [
        "route", "from", "uri", "parameters", "steps", "to", "toD", "log", "setBody", "setHeader",
        "setProperty", "removeHeader", "removeHeaders", "choice", "when", "otherwise", "filter",
        "split", "aggregate", "multicast", "recipientList", "routingSlip", "dynamicRouter",
        "marshal", "unmarshal", "convertBodyTo", "transform", "process", "bean", "script",
        "delay", "throttle", "circuitBreaker", "saga", "transacted", "onException",
        "try", "doTry", "doCatch", "doFinally", "intercept", "interceptFrom", "interceptSendToEndpoint",
        "rest", "get", "post", "put", "delete", "patch", "head", "consumes", "produces",
        "simple", "constant", "jsonpath", "xpath", "header", "exchangeProperty", "body",
        "timer", "direct", "seda", "vm", "kafka", "jms", "http", "https", "file", "ftp",
        "sftp", "sql", "jdbc", "mongodb", "rest", "platform-http", "vertx", "netty",
        "id", "description", "autoStartup", "startupOrder", "streamCache", "message", "name",
        "expression", "simple", "constant", "datasonnet", "groovy", "javascript"
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
            || type === "text/x-yaml";
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
            title: "Camel route",
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
        CodeMirror.registerHelper("hint", "camel-yaml", function (cm) {
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
        return editor ? editor.getValue() : ($("#crd-yaml").val() || "");
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
                return "Line " + (i + 1) + " uses a tab. Indent Camel YAML with spaces.";
            }
            if (/^\s+[^ \t].*:/.test(line) && (line.length - line.trimStart().length) % 2 !== 0) {
                return "Line " + (i + 1) + " is not indented in 2-space steps.";
            }
        }
        if (!/(^|\n)\s*-?\s*(route|from|rest)\s*:/.test(source)) {
            return "YAML should define a Camel route, from, or rest block.";
        }
        return "";
    }

    function mountEditor(text) {
        destroyEditor();
        const textarea = document.getElementById("crd-yaml");
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
            hintOptions: { hint: CodeMirror.hint["camel-yaml"], completeSingle: false }
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
        editor.on("change", function () {
            if (window.CadminCamelRouteGraph) {
                CadminCamelRouteGraph.scheduleRefresh();
            }
        });
        requestAnimationFrame(function () {
            if (editor) {
                editor.refresh();
            }
        });
    }

    function applyMeta() {
        library.title = $("#crd-title-input").val().trim();
        const name = $("#crd-name").val().trim();
        const version = $("#crd-version").val().trim();
        const description = $("#crd-description").val().trim();
        library.status = $("#crd-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Camel Route" }],
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
                coding: [{ code: libraryType, display: "Camel Route" }],
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
            if (window.CadminCamelRouteGraph) {
                CadminCamelRouteGraph.refresh();
            }
            markEditorClean();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update Camel route failed (" + xhr.status + ").");
        });
    }

    function render(resource) {
        destroyEditor();
        if (CadminApi.isLibraryType(resource, "pds-policies")) {
            window.location.hash = "#/pds-policies/" + encodeURIComponent(resource.id);
            return;
        }
        library = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/camel-routes">' +
                        '<i class="bi bi-arrow-left me-1"></i>Camel Routes</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="h3 mb-0 page-title" id="crd-title"></h1>' +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-primary" type="button" id="crd-save">' +
                        '<i class="bi bi-check2 me-1"></i>Save</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="crd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Identity</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#crd-meta-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="crd-meta"></div>' +
            "</div>" +
            '<div class="row camel-route-split">' +
                '<div class="col-xl-7 mb-4">' +
                    '<div class="card shadow h-100" id="camel-route-yaml-card">' +
                        '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                            "<div>" +
                                '<h6 class="m-0">Camel route YAML</h6>' +
                                '<div class="small text-muted mt-1"><code>' + esc(routeContentType) + "</code>" +
                                    " · Ctrl-Space complete · Ctrl-F find · Ctrl-/ comment · Ctrl-Q fold</div>" +
                            "</div>" +
                            '<div class="d-flex flex-nowrap align-items-center gap-2 camel-route-yaml-tools">' +
                                '<select class="form-select form-select-sm" id="crd-template" style="max-width:14rem">' +
                                    '<option value="">Insert template…</option>' +
                                    templates.map(function (item) {
                                        return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
                                    }).join("") +
                                "</select>" +
                                '<button class="btn btn-sm btn-outline-secondary" type="button" id="crd-find">' +
                                    '<i class="bi bi-search me-1"></i>Find</button>' +
                                '<button class="btn btn-sm btn-outline-secondary" type="button" id="crd-replace">' +
                                    "Replace</button>" +
                                '<div class="btn-group btn-group-sm" role="group" aria-label="Fold YAML">' +
                                    '<button class="btn btn-outline-secondary" type="button" id="crd-fold" ' +
                                        'title="Fold all" aria-label="Fold all">' +
                                        '<i class="bi bi-arrows-collapse" aria-hidden="true"></i></button>' +
                                    '<button class="btn btn-outline-secondary" type="button" id="crd-unfold" ' +
                                        'title="Unfold all" aria-label="Unfold all">' +
                                        '<i class="bi bi-arrows-expand" aria-hidden="true"></i></button>' +
                                "</div>" +
                            "</div>" +
                        "</div>" +
                        '<div class="card-body p-0">' +
                            '<textarea id="crd-yaml" class="d-none"></textarea>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
                '<div class="col-xl-5 mb-4">' +
                    CadminCamelRouteGraph.card() +
                "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="crd-meta-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="crd-meta-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Edit identity</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Title", '<input class="form-control" id="crd-title-input">') +
                            field("Name", '<input class="form-control font-monospace" id="crd-name">') +
                            field("Status", '<select class="form-select" id="crd-status">' +
                                optionsHtml(statusOptions, "") + "</select>") +
                            field("Version", '<input class="form-control" id="crd-version">') +
                            field("Description", '<textarea class="form-control" id="crd-description" rows="3"></textarea>') +
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
        CadminCamelRouteGraph.mount(editorValue);
        markEditorClean();
        bind();
        $("#crd-meta-modal").on("show.bs.modal", populateMetaForm);
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        const wrap = document.querySelector("#camel-route-yaml-card .CodeMirror");
        if (wrap && wrap.CodeMirror) {
            editor = wrap.CodeMirror;
            editor.refresh();
        } else {
            const textarea = document.getElementById("crd-yaml");
            if (textarea) {
                mountEditor(textarea.value);
            }
        }
        if (window.CadminCamelRouteGraph) {
            CadminCamelRouteGraph.mount(editorValue);
        }
        syncUnsavedFlag();
    }

    function renderMeta() {
        $("#crd-title").text(library.title || library.name || "Camel route");
        $("#crd-meta").html(
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
        $("#crd-title-input").val(library.title || "");
        $("#crd-name").val(library.name || "");
        $("#crd-status").val(library.status || "draft");
        $("#crd-version").val(library.version || "");
        $("#crd-description").val(library.description || "");
        CadminApi.fillValueSetSelect("#crd-status", CadminApi.valueSets.publicationStatus, {
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
                $("#crd-yaml").val(match.yaml);
            }
            if (window.CadminCamelRouteGraph) {
                CadminCamelRouteGraph.refresh();
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
        $root.off(".crdetail");
        $root.on("click.crdetail", "#crd-save", function () {
            saveLibrary(function () {
                CadminApi.showToast("success", "Camel route saved.");
            });
        });
        $root.on("click.crdetail", "#crd-delete", function () {
            CadminApi.confirm("Delete this Camel route?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    destroyEditor();
                    if (window.CadminCamelRouteGraph) {
                        CadminCamelRouteGraph.destroy();
                    }
                    CadminApi.showToast("success", "Camel route deleted.");
                    window.location.hash = "#/camel-routes";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete Camel route failed (" + xhr.status + ").");
                });
            });
        });
        $root.on("change.crdetail", "#crd-template", function () {
            const id = $(this).val();
            $(this).val("");
            insertTemplate(id);
        });
        $root.on("click.crdetail", "#crd-find", function () {
            if (editor && CodeMirror.commands.findPersistent) {
                CodeMirror.commands.findPersistent(editor);
            } else if (editor && CodeMirror.commands.find) {
                CodeMirror.commands.find(editor);
            }
        });
        $root.on("click.crdetail", "#crd-replace", function () {
            if (editor && CodeMirror.commands.replace) {
                CodeMirror.commands.replace(editor);
            }
        });
        $root.on("click.crdetail", "#crd-fold", function () {
            if (!editor) {
                return;
            }
            editor.operation(function () {
                for (let i = editor.firstLine(); i <= editor.lastLine(); i += 1) {
                    editor.foldCode(CodeMirror.Pos(i, 0), null, "fold");
                }
            });
        });
        $root.on("click.crdetail", "#crd-unfold", function () {
            if (!editor) {
                return;
            }
            editor.operation(function () {
                for (let i = editor.firstLine(); i <= editor.lastLine(); i += 1) {
                    editor.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
                }
            });
        });
        $("#crd-meta-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                const el = document.getElementById("crd-meta-modal");
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
