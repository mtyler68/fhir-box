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
    const markdownFields = ["crd-description", "crd-purpose", "crd-usage", "crd-copyright"];
    const markdownFieldKeys = {
        "crd-description": "description",
        "crd-purpose": "purpose",
        "crd-usage": "usage",
        "crd-copyright": "copyright"
    };
    let library = null;
    let editor = null;
    let markdownEditors = {};
    let turndown = null;
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
            const C = window.CadminCamelYamlCatalog;
            const words = hintWords.concat(
                C ? Object.keys(C.processors || {}) : [],
                C ? Object.keys(C.documents || {}) : [],
                C ? (C.expressions || []) : [],
                C ? (C.dataFormats || []) : []
            );
            const seen = {};
            const list = words.filter(function (item) {
                if (seen[item]) {
                    return false;
                }
                seen[item] = true;
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

    function field(label, control, hint) {
        const idMatch = String(control).match(/\sid="([^"]+)"/);
        const forAttr = idMatch ? ' for="' + idMatch[1] + '"' : "";
        return '<div class="mb-3"><label class="form-label"' + forAttr + ">" + label + "</label>" + control +
            (hint ? '<div class="form-text">' + hint + "</div>" : "") + "</div>";
    }

    function fieldRow(left, right) {
        return '<div class="row">' +
            '<div class="col-md-6">' + left + "</div>" +
            '<div class="col-md-6">' + right + "</div>" +
            "</div>";
    }

    function markdownField(label, id) {
        return field(label,
            '<div class="crd-markdown-host">' +
                '<textarea class="form-control" id="' + id + '" rows="6"></textarea>' +
            "</div>");
    }

    function dateInputValue(value) {
        return String(value || "").slice(0, 10);
    }

    function setOrDelete(obj, key, value) {
        const trimmed = String(value == null ? "" : value).trim();
        if (trimmed) {
            obj[key] = trimmed;
        } else {
            delete obj[key];
        }
    }

    function typeCode() {
        const coding = ((library && library.type && library.type.coding) || []).find(function (item) {
            return item && item.code;
        });
        return (coding && coding.code) || libraryType;
    }

    function looksLikeHtml(value) {
        return /^<(p|div|h[1-6]|ul|ol|li|blockquote|pre|span|strong|em|br|a)\b/i.test(String(value || "").trim());
    }

    function htmlToMarkdown(value) {
        const text = String(value == null ? "" : value);
        if (!text.trim()) {
            return "";
        }
        if (!looksLikeHtml(text)) {
            return text;
        }
        if (typeof TurndownService === "undefined") {
            return text;
        }
        if (!turndown) {
            turndown = new TurndownService({
                headingStyle: "atx",
                codeBlockStyle: "fenced",
                bulletListMarker: "-"
            });
        }
        return String(turndown.turndown(text) || "").trim();
    }

    function markdownToolbar() {
        function tool(name, action, icon, title) {
            return { name: name, action: action, className: icon, title: title };
        }
        return [
            tool("bold", EasyMDE.toggleBold, "bi bi-type-bold", "Bold"),
            tool("italic", EasyMDE.toggleItalic, "bi bi-type-italic", "Italic"),
            tool("strikethrough", EasyMDE.toggleStrikethrough, "bi bi-type-strikethrough", "Strikethrough"),
            tool("heading", EasyMDE.toggleHeadingSmaller, "bi bi-type-h1", "Heading"),
            "|",
            tool("quote", EasyMDE.toggleBlockquote, "bi bi-quote", "Quote"),
            tool("code", EasyMDE.toggleCodeBlock, "bi bi-code-slash", "Code"),
            tool("unordered-list", EasyMDE.toggleUnorderedList, "bi bi-list-ul", "Bulleted list"),
            tool("ordered-list", EasyMDE.toggleOrderedList, "bi bi-list-ol", "Numbered list"),
            "|",
            tool("link", EasyMDE.drawLink, "bi bi-link-45deg", "Link"),
            "|",
            tool("preview", EasyMDE.togglePreview, "bi bi-eye no-disable", "Preview"),
            tool("guide", "https://www.markdownguide.org/basic-syntax/", "bi bi-question-circle no-disable", "Markdown guide")
        ];
    }

    function markdownWrapper(mde) {
        return mde && mde.codemirror && typeof mde.codemirror.getWrapperElement === "function"
            ? mde.codemirror.getWrapperElement()
            : null;
    }

    function destroyMarkdownEditors() {
        Object.keys(markdownEditors).forEach(function (id) {
            const mde = markdownEditors[id];
            if (mde && typeof mde.toTextArea === "function") {
                try {
                    mde.toTextArea();
                } catch (ignored) {
                    /* editor already detached */
                }
            }
        });
        markdownEditors = {};
    }

    function markdownValue(id) {
        const mde = markdownEditors[id];
        if (!mde) {
            const el = document.getElementById(id);
            if (el) {
                return el.value || "";
            }
            return (library && library[markdownFieldKeys[id]]) || "";
        }
        return mde.value() || "";
    }

    function setMarkdownValue(id, value) {
        const next = htmlToMarkdown(value || "");
        const mde = markdownEditors[id];
        if (!mde) {
            const el = document.getElementById(id);
            if (el) {
                el.value = next;
            }
            return;
        }
        if (mde.value() === next) {
            return;
        }
        mde.value(next);
    }

    function mountMarkdownEditors() {
        if (typeof EasyMDE === "undefined") {
            return;
        }
        markdownFields.forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) {
                return;
            }
            const existing = markdownEditors[id];
            const wrap = markdownWrapper(existing);
            if (existing && wrap && document.body.contains(wrap)) {
                return;
            }
            if (existing && typeof existing.toTextArea === "function") {
                try {
                    existing.toTextArea();
                } catch (ignored) {
                    /* editor already detached */
                }
            }
            const textarea = document.getElementById(id);
            if (!textarea) {
                return;
            }
            const mde = new EasyMDE({
                element: textarea,
                autofocus: false,
                autoDownloadFontAwesome: false,
                spellChecker: false,
                status: false,
                forceSync: true,
                minHeight: "12rem",
                placeholder: "Write markdown…",
                toolbar: markdownToolbar()
            });
            mde.codemirror.on("change", syncUnsavedFlag);
            markdownEditors[id] = mde;
        });
    }

    function fillMarkdownFields() {
        setMarkdownValue("crd-description", library && library.description);
        setMarkdownValue("crd-purpose", library && library.purpose);
        setMarkdownValue("crd-usage", library && library.usage);
        setMarkdownValue("crd-copyright", library && library.copyright);
    }

    function refreshMarkdownEditors() {
        const live = markdownFields.every(function (id) {
            const wrap = markdownWrapper(markdownEditors[id]);
            return wrap && document.body.contains(wrap);
        });
        if (live) {
            markdownFields.forEach(function (id) {
                markdownEditors[id].codemirror.refresh();
            });
            return;
        }
        destroyMarkdownEditors();
        mountMarkdownEditors();
        fillMarkdownFields();
    }

    function destroyYamlEditor() {
        if (editor) {
            editor.toTextArea();
            editor = null;
        }
    }

    function destroyEditor() {
        destroyMarkdownEditors();
        destroyYamlEditor();
        if (window.CadminCamelRouteDesigner) {
            CadminCamelRouteDesigner.destroy();
        }
    }

    function editorValue() {
        return editor ? editor.getValue() : ($("#crd-yaml").val() || "");
    }

    function setRouteYaml(text) {
        if (editor) {
            editor.setValue(text || "");
        } else {
            $("#crd-yaml").val(text || "");
        }
    }

    function applyDesignerYaml() {
        if (window.CadminCamelRouteDesigner && typeof CadminCamelRouteDesigner.applyToYaml === "function") {
            CadminCamelRouteDesigner.applyToYaml();
        }
    }

    function domainSnapshot() {
        return CadminApi.selectCodings("#crd-domains").map(function (item) {
            return (item.system || "") + "|" + item.code;
        }).sort().join(",");
    }

    function basicsSnapshot() {
        return [
            $("#crd-title-input").val() || "",
            $("#crd-status").val() || "",
            $("#crd-experimental").is(":checked") ? "1" : "0",
            domainSnapshot(),
            markdownValue("crd-description"),
            markdownValue("crd-purpose"),
            markdownValue("crd-usage"),
            markdownValue("crd-copyright"),
            $("#crd-url").val() || "",
            $("#crd-name").val() || "",
            $("#crd-version").val() || "",
            $("#crd-publisher").val() || "",
            $("#crd-date").val() || "",
            $("#crd-approval").val() || "",
            $("#crd-review").val() || "",
            $("#crd-period-start").val() || "",
            $("#crd-period-end").val() || ""
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
        if (window.CadminCamelRouteDesigner && typeof CadminCamelRouteDesigner.syncFromYaml === "function") {
            try {
                if (typeof jsyaml !== "undefined") {
                    jsyaml.load(source);
                }
            } catch (err) {
                return (err && err.message) || "Invalid YAML.";
            }
        }
        return "";
    }

    function mountEditor(text) {
        destroyYamlEditor();
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
        editor.on("change", function () {
            if (window.CadminCamelRouteDesigner && CadminCamelRouteDesigner.isApplying()) {
                return;
            }
            syncUnsavedFlag();
        });
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
        setOrDelete(library, "title", $("#crd-title-input").val());
        library.status = $("#crd-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Camel Route" }],
            text: libraryType
        };
        if ($("#crd-experimental").is(":checked")) {
            library.experimental = true;
        } else {
            delete library.experimental;
        }
        CadminApi.applyLibraryDomainCodings(library, CadminApi.selectCodings("#crd-domains"));
        setOrDelete(library, "description", htmlToMarkdown(markdownValue("crd-description")));
        setOrDelete(library, "purpose", htmlToMarkdown(markdownValue("crd-purpose")));
        setOrDelete(library, "usage", htmlToMarkdown(markdownValue("crd-usage")));
        setOrDelete(library, "copyright", htmlToMarkdown(markdownValue("crd-copyright")));
        setOrDelete(library, "url", $("#crd-url").val());
        setOrDelete(library, "name", $("#crd-name").val());
        setOrDelete(library, "version", $("#crd-version").val());
        setOrDelete(library, "publisher", $("#crd-publisher").val());
        setOrDelete(library, "date", $("#crd-date").val());
        setOrDelete(library, "approvalDate", $("#crd-approval").val());
        setOrDelete(library, "lastReviewDate", $("#crd-review").val());
        const start = ($("#crd-period-start").val() || "").trim();
        const end = ($("#crd-period-end").val() || "").trim();
        if (start || end) {
            library.effectivePeriod = {};
            if (start) {
                library.effectivePeriod.start = start;
            }
            if (end) {
                library.effectivePeriod.end = end;
            }
        } else {
            delete library.effectivePeriod;
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
            applyDesignerYaml();
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
                fillMarkdownFields();
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
        CadminApi.destroySelects(CadminWorkspace.root());
        if (CadminApi.isLibraryType(resource, "pds-policies")) {
            window.location.hash = "#/pds-policies/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isGatewayRouteLibrary(resource)) {
            window.location.hash = "#/icg-routes/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "easy-rule")) {
            window.location.hash = "#/easy-rules/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "rule-set")) {
            window.location.hash = "#/rule-sets/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "jolt")) {
            window.location.hash = "#/jolts/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "rate-limit-plan")) {
            window.location.hash = "#/rate-limit-plans/" + encodeURIComponent(resource.id);
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
                    '<a class="small text-decoration-none" href="#/camel-routes">' +
                        '<i class="bi bi-arrow-left me-1"></i>Camel Routes</a>' +
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
                        navButton("crd-pane-identity", "bi bi-person-vcard", "Identity and version") +
                        navButton("crd-pane-details", "bi bi-journal-text", "Details") +
                        navButton("crd-pane-designer", "bi bi-sliders", "Route Designer") +
                        navButton("crd-pane-route", "bi bi-file-earmark-code", "Route") +
                        navButton("crd-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("crd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("crd-pane-history", "bi bi-clock-history", "History") +
                        navButton("crd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("crd-pane-basics",
                            '<form id="crd-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="crd-title-input">') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="crd-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>"),
                                            field("Type",
                                                '<input class="form-control font-monospace" id="crd-type" value="' +
                                                    esc(typeCode()) + '" readonly disabled>')) +
                                        fieldRow(
                                            '<div class="mb-3">' +
                                                '<label class="form-label d-none d-md-block">&nbsp;</label>' +
                                                '<div class="form-check d-flex align-items-center gap-2" ' +
                                                    'style="min-height:calc(1.5em + .75rem + 2px)">' +
                                                    '<input class="form-check-input" type="checkbox" id="crd-experimental">' +
                                                    '<label class="form-check-label" for="crd-experimental">Experimental</label>' +
                                                "</div>" +
                                            "</div>",
                                            field("Domain",
                                                '<select class="form-select" id="crd-domains" multiple></select>')) +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("crd-pane-identity",
                            '<form id="crd-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Identity and version</h3></div>' +
                                    '<div class="card-body">' +
                                        field("URL", '<input class="form-control font-monospace" id="crd-url">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="crd-name">'),
                                            field("Version", '<input class="form-control" id="crd-version" autocomplete="off">')) +
                                        fieldRow(
                                            field("Publisher", '<input class="form-control" id="crd-publisher">'),
                                            field("Date", '<input type="date" class="form-control" id="crd-date">')) +
                                        fieldRow(
                                            field("Approved date", '<input type="date" class="form-control" id="crd-approval">'),
                                            field("Last review date", '<input type="date" class="form-control" id="crd-review">')) +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Effective date range</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="crd-period-start" ' +
                                                        'aria-label="Effective start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="crd-period-end" ' +
                                                        'aria-label="Effective end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("crd-pane-details",
                            '<form id="crd-details-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Details</h3></div>' +
                                    '<div class="card-body">' +
                                        markdownField("Description", "crd-description") +
                                        markdownField("Purpose", "crd-purpose") +
                                        markdownField("Usage", "crd-usage") +
                                        markdownField("Copyright", "crd-copyright") +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("crd-pane-designer",
                            '<div id="crd-designer-host" class="camel-route-designer"></div>' +
                            (window.CadminCamelRouteGraph
                                ? CadminCamelRouteGraph.card({ prefix: "crd-designer", editable: true })
                                : "") +
                            '<p class="small text-muted mt-2 mb-0">' +
                                "Designer writes Camel YAML DSL from Apache Camel 4.10 " +
                                "(processors, REST, expressions, and component URIs). " +
                                "Click the graph to select a node; use graph buttons to add, move, or remove steps.</p>") +
                        tabPane("crd-pane-route",
                            '<div class="d-flex flex-column gap-3">' +
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
                                "</div>" +
                                CadminCamelRouteGraph.card() +
                            "</div>") +
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
        mountMarkdownEditors();
        fillMarkdownFields();
        mountEditor(readYaml() || templates[0].yaml);
        if (window.CadminCamelRouteDesigner) {
            CadminCamelRouteDesigner.mount("#crd-designer-host", {
                getYaml: editorValue,
                setYaml: setRouteYaml,
                onChange: syncUnsavedFlag,
                onSave: function () {
                    saveLibrary(function () {
                        CadminApi.showToast("success", "Camel route saved.");
                    });
                }
            });
        }
        mountRouteGraph();
        markEditorClean();
        markBasicsClean();
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
        refreshMarkdownEditors();
        syncUnsavedFlag();
    }

    function renderHeader() {
        const label = routeLabel();
        $("#crd-title").text(label);
        $("#crd-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $("#crd-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $("#crd-fhir-id").text("").addClass("d-none");
        }
    }

    function bindDomainSelect() {
        CadminApi.bindConceptSelect("#crd-domains", CadminApi.valueSets.camelRouteDomains, {
            placeholder: "Select domains…",
            multiple: true,
            preload: true,
            selected: CadminApi.libraryDomainCodings(library),
            onChange: syncUnsavedFlag
        });
    }

    function fillBasicsForm() {
        const period = library.effectivePeriod || {};
        $("#crd-title-input").val(library.title || "");
        $("#crd-status").val(library.status || "draft");
        $("#crd-type").val(typeCode());
        $("#crd-experimental").prop("checked", !!library.experimental);
        bindDomainSelect();
        $("#crd-url").val(library.url || "");
        $("#crd-name").val(library.name || "");
        $("#crd-version").val(library.version || "");
        $("#crd-publisher").val(library.publisher || "");
        $("#crd-date").val(dateInputValue(library.date));
        $("#crd-approval").val(dateInputValue(library.approvalDate));
        $("#crd-review").val(dateInputValue(library.lastReviewDate));
        $("#crd-period-start").val(dateInputValue(period.start));
        $("#crd-period-end").val(dateInputValue(period.end));
    }

    function refreshRoutePane() {
        if (editor) {
            editor.setSize("100%", "36rem");
            editor.refresh();
        }
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
            if (window.CadminCamelRouteDesigner) {
                CadminCamelRouteDesigner.syncFromYaml(match.yaml);
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
        $root.on("shown.bs.tab.crdetail", "#crd-pane-details-btn", refreshMarkdownEditors);
        $root.on("shown.bs.tab.crdetail", "#crd-pane-designer-btn", function () {
            if (window.CadminCamelRouteDesigner) {
                CadminCamelRouteDesigner.syncFromYaml(editorValue());
                CadminCamelRouteDesigner.mountGraph();
            }
        });
        $root.on("shown.bs.tab.crdetail", "#crd-pane-route-btn", function () {
            applyDesignerYaml();
            mountRouteGraph();
            refreshRoutePane();
        });
        $root.on("shown.bs.tab.crdetail", "#crd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.crdetail change.crdetail",
            "#crd-basic-form :input, #crd-identity-form :input, #crd-details-form :input", syncUnsavedFlag);
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
        $("#crd-basic-form, #crd-identity-form, #crd-details-form").on("submit", function (event) {
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
