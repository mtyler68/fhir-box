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
        "simple", "constant", "fhirJson", "jsonpath", "xpath", "header", "exchangeProperty", "body",
        "timer", "direct", "seda", "vm", "kafka", "jms", "http", "https", "file", "ftp",
        "sftp", "sql", "jdbc", "mongodb", "rest", "platform-http", "vertx", "netty",
        "id", "description", "autoStartup", "startupOrder", "streamCache", "message", "name",
        "expression", "simple", "constant", "datasonnet", "groovy", "javascript", "unpackArray"
    ];
    let library = null;
    let editor = null;
    let hintRegistered = false;
    let savedYaml = "";
    let savedBasics = "";

    function esc(value) {
        return CadminApi.escapeHtml(value);
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

    function routeLabel() {
        return library.title || library.name || library.id || "Camel route";
    }

    function navButton(paneId, icon, label, opts) {
        opts = opts || {};
        const classes = ["list-group-item", "list-group-item-action", "text-start"];
        if (opts.active) {
            classes.push("active");
        }
        if (opts.danger) {
            classes.push("text-danger");
        }
        return '<button type="button" class="' + classes.join(" ") + '" id="' + paneId + '-btn" ' +
            'data-bs-toggle="pill" data-bs-target="#' + paneId + '" role="tab" aria-controls="' + paneId +
            '" aria-selected="' + (opts.active ? "true" : "false") + '">' +
            '<i class="' + icon + ' me-2" aria-hidden="true"></i>' + label +
            "</button>";
    }

    function tabPane(id, body, active) {
        return '<div class="tab-pane fade' + (active ? " show active" : "") + '" id="' + id +
            '" role="tabpanel" aria-labelledby="' + id + '-btn">' + body + "</div>";
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

    function basicsSnapshot() {
        return [
            $("#crd-title-input").val() || "",
            $("#crd-name").val() || "",
            $("#crd-status").val() || "",
            $("#crd-version").val() || "",
            $("#crd-description").val() || ""
        ].join("\n");
    }

    function syncUnsavedFlag() {
        CadminApi.setUnsavedFlag(CadminWorkspace.root(),
            editorValue() !== savedYaml || basicsSnapshot() !== savedBasics);
    }

    function markEditorClean() {
        savedYaml = editorValue();
        syncUnsavedFlag();
    }

    function markBasicsClean() {
        savedBasics = basicsSnapshot();
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

    function saveLibrary(next, opts) {
        opts = opts || {};
        const withMeta = !!opts.withMeta;
        const withYaml = opts.withYaml !== false;
        if (withMeta) {
            applyMeta();
        } else {
            library.type = {
                coding: [{ code: libraryType, display: "Camel Route" }],
                text: libraryType
            };
        }
        if (withYaml) {
            const yaml = editorValue();
            const problem = validateYaml(yaml);
            if (problem) {
                CadminApi.showToast("danger", problem);
                return;
            }
            upsertYaml(yaml);
        }
        CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "PUT", library).done(function (updated) {
            library = updated || library;
            renderHeader();
            if (withMeta) {
                fillBasicsForm();
                markBasicsClean();
            }
            CadminResourceSource.mount(function () { return library; });
            CadminResourceGraph.mount(library);
            CadminLibraryRelated.mount(library);
            if (window.CadminCamelRouteGraph) {
                CadminCamelRouteGraph.refresh();
            }
            if (withYaml) {
                markEditorClean();
            } else {
                syncUnsavedFlag();
            }
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
        if (CadminApi.isLibraryType(resource, "icg-route")) {
            window.location.hash = "#/icg-routes/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "jolt")) {
            window.location.hash = "#/jolts/" + encodeURIComponent(resource.id);
            return;
        }
        library = resource;
        const $root = $(CadminWorkspace.root());
        const label = esc(routeLabel());
        const yamlTools =
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
            '<button class="btn btn-sm btn-primary" type="button" id="crd-save">' +
                '<i class="bi bi-check2 me-1"></i>Save</button>';
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<nav aria-label="breadcrumb">' +
                        '<ol class="breadcrumb mb-1">' +
                            '<li class="breadcrumb-item"><a href="#/camel-routes">Camel Routes</a></li>' +
                            '<li class="breadcrumb-item active" aria-current="page" id="crd-crumb">' + label + "</li>" +
                        "</ol>" +
                    "</nav>" +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="crd-title">' + label + "</h1>" +
                        '<span id="crd-status-badge">' + statusBadge(library.status) + "</span>" +
                        (library.id
                            ? '<code class="small" id="crd-fhir-id">' + esc(library.id) + "</code>"
                            : '<code class="small d-none" id="crd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="crd-settings-nav" role="tablist">' +
                        navButton("crd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("crd-pane-route", "bi bi-file-earmark-code", "Route") +
                        navButton("crd-pane-route-graph", "bi bi-bezier2", "Route graph") +
                        navButton("crd-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("crd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("crd-pane-history", "bi bi-clock-history", "History") +
                        navButton("crd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("crd-pane-basics",
                            '<div class="card">' +
                                '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                '<div class="card-body">' +
                                    '<form class="row g-3" id="crd-basic-form">' +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="crd-title-input">Title</label>' +
                                            '<input class="form-control" id="crd-title-input">' +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="crd-name">Name</label>' +
                                            '<input class="form-control font-monospace" id="crd-name">' +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="crd-status">Status</label>' +
                                            '<select class="form-select" id="crd-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>" +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="crd-version">Version</label>' +
                                            '<input class="form-control" id="crd-version" autocomplete="off">' +
                                        "</div>" +
                                        '<div class="col-12">' +
                                            '<label class="form-label" for="crd-description">Description</label>' +
                                            '<textarea class="form-control" id="crd-description" rows="3"></textarea>' +
                                        "</div>" +
                                        '<div class="col-12">' +
                                            '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                        "</div>" +
                                    "</form>" +
                                "</div>" +
                            "</div>",
                            true) +
                        tabPane("crd-pane-route",
                            '<div class="card" id="camel-route-yaml-card">' +
                                '<div class="card-header flex-wrap gap-2">' +
                                    "<div>" +
                                        '<h3 class="card-title mb-0">Camel route YAML</h3>' +
                                        '<div class="small text-muted"><code>' + esc(routeContentType) + "</code>" +
                                            " · Ctrl-Space complete · Ctrl-F find · Ctrl-/ comment · Ctrl-Q fold</div>" +
                                    "</div>" +
                                    '<div class="card-tools d-flex flex-nowrap align-items-center gap-2 camel-route-yaml-tools">' +
                                        yamlTools +
                                    "</div>" +
                                "</div>" +
                                '<div class="card-body p-0">' +
                                    '<textarea id="crd-yaml" class="d-none"></textarea>' +
                                "</div>" +
                            "</div>") +
                        tabPane("crd-pane-route-graph", CadminCamelRouteGraph.card()) +
                        tabPane("crd-pane-related", CadminLibraryRelated.cards()) +
                        tabPane("crd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("crd-pane-history", CadminResourceHistory.card()) +
                        tabPane("crd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this Camel route</p>' +
                                            '<small class="text-secondary">' +
                                                "This permanently deletes the Library that stores the route YAML." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="crd-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return library; });
        CadminResourceGraph.mount(library);
        CadminResourceHistory.mount(library);
        CadminLibraryRelated.mount(library);
        renderHeader();
        fillBasicsForm();
        mountEditor(readYaml() || templates[0].yaml);
        mountRouteGraph();
        markEditorClean();
        bind();
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        const pane = document.getElementById("app-content-detail") || document;
        const wrap = pane.querySelector("#camel-route-yaml-card .CodeMirror");
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
            const textarea = pane.querySelector("#crd-yaml");
            if (textarea) {
                mountEditor(textarea.value);
            }
        }
        if (window.CadminCamelRouteGraph) {
            mountRouteGraph();
        }
        syncUnsavedFlag();
    }

    function renderHeader() {
        const label = routeLabel();
        $("#crd-crumb").text(label);
        $("#crd-title").text(label);
        $("#crd-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $("#crd-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $("#crd-fhir-id").text("").addClass("d-none");
        }
    }

    function fillBasicsForm() {
        $("#crd-title-input").val(library.title || "");
        $("#crd-name").val(library.name || "");
        $("#crd-status").val(library.status || "draft");
        $("#crd-version").val(library.version || "");
        $("#crd-description").val(library.description || "");
        markBasicsClean();
    }

    function refreshRoutePane() {
        if (editor) {
            editor.setSize("100%", "36rem");
            editor.refresh();
        }
    }

    function refreshRouteGraphPane() {
        if (window.CadminCamelRouteGraph && typeof CadminCamelRouteGraph.resize === "function") {
            CadminCamelRouteGraph.resize();
        }
    }

    function unfoldEditorToLine(lineNo) {
        if (!editor || typeof editor.findMarks !== "function") {
            return;
        }
        const to = CodeMirror.Pos(lineNo, (editor.getLine(lineNo) || "").length);
        editor.findMarks(CodeMirror.Pos(0, 0), to).forEach(function (mark) {
            if (mark && mark.__isFold) {
                mark.clear();
            }
        });
    }

    function applyYamlLine(line) {
        if (!editor || typeof line !== "number" || line < 0) {
            return;
        }
        const lineNo = Math.max(0, Math.min(line, editor.lineCount() - 1));
        unfoldEditorToLine(lineNo);
        refreshRoutePane();
        const text = editor.getLine(lineNo) || "";
        const ch = text.search(/\S/);
        const from = CodeMirror.Pos(lineNo, 0);
        const to = CodeMirror.Pos(lineNo, text.length);
        editor.setCursor({ line: lineNo, ch: ch < 0 ? 0 : ch });
        editor.scrollIntoView({ from: from, to: to }, 80);
        editor.focus();
    }

    function revealYamlLine(line) {
        if (typeof line !== "number" || line < 0) {
            return;
        }
        const btn = document.getElementById("crd-pane-route-btn");
        const pane = document.getElementById("crd-pane-route");
        const already = pane && pane.classList.contains("active") && pane.classList.contains("show");
        if (already || !btn) {
            applyYamlLine(line);
            return;
        }
        $(btn).off("shown.bs.tab.crdetail-reveal").one("shown.bs.tab.crdetail-reveal", function () {
            applyYamlLine(line);
        });
        if (window.bootstrap && bootstrap.Tab) {
            bootstrap.Tab.getOrCreateInstance(btn).show();
        } else {
            btn.click();
        }
    }

    function mountRouteGraph() {
        if (!window.CadminCamelRouteGraph) {
            return;
        }
        CadminCamelRouteGraph.mount(editorValue, { onNodeClick: revealYamlLine });
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
        $root.on("shown.bs.tab.crdetail", "#crd-pane-route-btn", refreshRoutePane);
        $root.on("shown.bs.tab.crdetail", "#crd-pane-route-graph-btn", refreshRouteGraphPane);
        $root.on("shown.bs.tab.crdetail", "#crd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.crdetail change.crdetail", "#crd-basic-form :input", syncUnsavedFlag);
        CadminApi.fillValueSetSelect("#crd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: library.status || "draft",
            onConcepts: function () {
                syncUnsavedFlag();
            }
        });
        $root.on("click.crdetail", "#crd-save", function () {
            saveLibrary(function () {
                CadminApi.showToast("success", "Camel route saved.");
            });
        });
        $("#crd-basic-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Camel route updated.");
            }, { withMeta: true, withYaml: false });
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
    }

    return {
        render: render,
        reveal: reveal,
        editorValue: editorValue
    };
}());
