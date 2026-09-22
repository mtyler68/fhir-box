window.CadminIcgRouteDetail = (function () {
    const libraryType = "gateway-route";
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
        },
        {
            id: "jolt",
            label: "Jolt JSON response",
            yaml: "- id: jolt_ratings\n  uri: https://httpbin.org\n  predicates:\n    - Path=/ratings/**\n  filters:\n    - StripPrefix=1\n    - name: JoltTransform\n      args:\n        name: ratings\n        version: \"^1.0.0\"\n"
        },
        {
            id: "rate-limit",
            label: "Client rate limit",
            yaml: "- id: patient_read\n  uri: https://httpbin.org\n  predicates:\n    - Path=/Patient/**\n  filters:\n    - StripPrefix=0\n    - ClientRateLimit=patient_read,30,2000\n"
        }
    ];
    const hintWords = [
        "id", "uri", "predicates", "filters", "order", "metadata",
        "Path", "Host", "Method", "Header", "Query", "Cookie", "After", "Before",
        "Between", "RemoteAddr", "Weight", "ReadBody",
        "StripPrefix", "PrefixPath", "SetPath", "RewritePath", "AddRequestHeader",
        "AddResponseHeader", "RemoveRequestHeader", "RemoveResponseHeader",
        "SetStatus", "Retry", "PreserveHostHeader", "RequestRateLimiter",
        "JoltTransform", "version",
        "ClientRateLimit", "endpoint", "requestsPerMinute", "requestsPerDay", "requestsPerSecond",
        "name", "args", "pattern", "parts", "regexp", "replacement"
    ];
    const markdownFields = ["ird-description", "ird-purpose", "ird-usage", "ird-copyright"];
    const markdownFieldKeys = {
        "ird-description": "description",
        "ird-purpose": "purpose",
        "ird-usage": "usage",
        "ird-copyright": "copyright"
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
        return library.title || library.name || library.id || "ICG route";
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
        setMarkdownValue("ird-description", library && library.description);
        setMarkdownValue("ird-purpose", library && library.purpose);
        setMarkdownValue("ird-usage", library && library.usage);
        setMarkdownValue("ird-copyright", library && library.copyright);
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
    }

    function editorValue() {
        return editor ? editor.getValue() : ($("#ird-yaml").val() || "");
    }

    function domainSnapshot() {
        return CadminApi.selectCodings("#ird-domains").map(function (item) {
            return (item.system || "") + "|" + item.code;
        }).sort().join(",");
    }

    function basicsSnapshot() {
        return [
            $("#ird-title-input").val() || "",
            $("#ird-status").val() || "",
            $("#ird-experimental").is(":checked") ? "1" : "0",
            domainSnapshot(),
            markdownValue("ird-description"),
            markdownValue("ird-purpose"),
            markdownValue("ird-usage"),
            markdownValue("ird-copyright"),
            $("#ird-url").val() || "",
            $("#ird-name").val() || "",
            $("#ird-version").val() || "",
            $("#ird-publisher").val() || "",
            $("#ird-date").val() || "",
            $("#ird-approval").val() || "",
            $("#ird-review").val() || "",
            $("#ird-period-start").val() || "",
            $("#ird-period-end").val() || ""
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
        destroyYamlEditor();
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
        setOrDelete(library, "title", $("#ird-title-input").val());
        library.status = $("#ird-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Gateway Route" }],
            text: libraryType
        };
        if ($("#ird-experimental").is(":checked")) {
            library.experimental = true;
        } else {
            delete library.experimental;
        }
        CadminApi.applyLibraryDomainCodings(library, CadminApi.selectCodings("#ird-domains"));
        setOrDelete(library, "description", htmlToMarkdown(markdownValue("ird-description")));
        setOrDelete(library, "purpose", htmlToMarkdown(markdownValue("ird-purpose")));
        setOrDelete(library, "usage", htmlToMarkdown(markdownValue("ird-usage")));
        setOrDelete(library, "copyright", htmlToMarkdown(markdownValue("ird-copyright")));
        setOrDelete(library, "url", $("#ird-url").val());
        setOrDelete(library, "name", $("#ird-name").val());
        setOrDelete(library, "version", $("#ird-version").val());
        setOrDelete(library, "publisher", $("#ird-publisher").val());
        setOrDelete(library, "date", $("#ird-date").val());
        setOrDelete(library, "approvalDate", $("#ird-approval").val());
        setOrDelete(library, "lastReviewDate", $("#ird-review").val());
        const start = ($("#ird-period-start").val() || "").trim();
        const end = ($("#ird-period-end").val() || "").trim();
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
                coding: [{ code: libraryType, display: "Gateway Route" }],
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
                fillMarkdownFields();
                markBasicsClean();
            }
            CadminResourceSource.mount(function () { return library; });
            CadminResourceGraph.mount(library);
            CadminLibraryRelated.mount(library);
            if (withYaml) {
                markEditorClean();
            } else {
                syncUnsavedFlag();
            }
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update ICG route failed (" + xhr.status + ").");
        });
    }

    function render(resource) {
        destroyEditor();
        CadminApi.destroySelects(CadminWorkspace.root());
        if (CadminApi.isLibraryType(resource, "pds-policies")) {
            window.location.hash = "#/pds-policies/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "camel-route")) {
            window.location.hash = "#/camel-routes/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "easy-rule")) {
            window.location.hash = "#/easy-rules/" + encodeURIComponent(resource.id);
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
            '<select class="form-select form-select-sm" id="ird-template" style="max-width:14rem">' +
                '<option value="">Insert template…</option>' +
                templates.map(function (item) {
                    return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
                }).join("") +
            "</select>" +
            '<button class="btn btn-sm btn-outline-secondary" type="button" id="ird-find">' +
                '<i class="bi bi-search me-1"></i>Find</button>' +
            '<button class="btn btn-sm btn-outline-secondary" type="button" id="ird-replace">' +
                "Replace</button>" +
            '<div class="btn-group btn-group-sm" role="group" aria-label="Fold YAML">' +
                '<button class="btn btn-outline-secondary" type="button" id="ird-fold" ' +
                    'title="Fold all" aria-label="Fold all">' +
                    '<i class="bi bi-arrows-collapse" aria-hidden="true"></i></button>' +
                '<button class="btn btn-outline-secondary" type="button" id="ird-unfold" ' +
                    'title="Unfold all" aria-label="Unfold all">' +
                    '<i class="bi bi-arrows-expand" aria-hidden="true"></i></button>' +
            "</div>" +
            '<button class="btn btn-sm btn-primary" type="button" id="ird-save">' +
                '<i class="bi bi-check2 me-1"></i>Save</button>';
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/icg-routes">' +
                        '<i class="bi bi-arrow-left me-1"></i>ICG Routes</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="ird-title">' + label + "</h1>" +
                        '<span id="ird-status-badge">' + statusBadge(library.status) + "</span>" +
                        (library.id
                            ? '<code class="small" id="ird-fhir-id">' + esc(library.id) + "</code>"
                            : '<code class="small d-none" id="ird-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<a class="btn btn-outline-secondary" href="#/icg">' +
                        '<i class="bi bi-router me-1"></i>Live ICG</a>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="ird-settings-nav" role="tablist">' +
                        navButton("ird-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("ird-pane-identity", "bi bi-person-vcard", "Identity and version") +
                        navButton("ird-pane-details", "bi bi-journal-text", "Details") +
                        navButton("ird-pane-route", "bi bi-file-earmark-code", "Route") +
                        navButton("ird-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("ird-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("ird-pane-history", "bi bi-clock-history", "History") +
                        navButton("ird-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("ird-pane-basics",
                            '<form id="ird-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="ird-title-input">') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="ird-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>"),
                                            field("Type",
                                                '<input class="form-control font-monospace" id="ird-type" value="' +
                                                    esc(typeCode()) + '" readonly disabled>')) +
                                        fieldRow(
                                            '<div class="mb-3">' +
                                                '<label class="form-label d-none d-md-block">&nbsp;</label>' +
                                                '<div class="form-check d-flex align-items-center gap-2" ' +
                                                    'style="min-height:calc(1.5em + .75rem + 2px)">' +
                                                    '<input class="form-check-input" type="checkbox" id="ird-experimental">' +
                                                    '<label class="form-check-label" for="ird-experimental">Experimental</label>' +
                                                "</div>" +
                                            "</div>",
                                            field("Domain",
                                                '<select class="form-select" id="ird-domains" multiple></select>')) +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("ird-pane-identity",
                            '<form id="ird-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Identity and version</h3></div>' +
                                    '<div class="card-body">' +
                                        field("URL", '<input class="form-control font-monospace" id="ird-url">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="ird-name">'),
                                            field("Version", '<input class="form-control" id="ird-version" autocomplete="off">')) +
                                        fieldRow(
                                            field("Publisher", '<input class="form-control" id="ird-publisher">'),
                                            field("Date", '<input type="date" class="form-control" id="ird-date">')) +
                                        fieldRow(
                                            field("Approved date", '<input type="date" class="form-control" id="ird-approval">'),
                                            field("Last review date", '<input type="date" class="form-control" id="ird-review">')) +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Effective date range</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="ird-period-start" ' +
                                                        'aria-label="Effective start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="ird-period-end" ' +
                                                        'aria-label="Effective end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("ird-pane-details",
                            '<form id="ird-details-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Details</h3></div>' +
                                    '<div class="card-body">' +
                                        markdownField("Description", "ird-description") +
                                        markdownField("Purpose", "ird-purpose") +
                                        markdownField("Usage", "ird-usage") +
                                        markdownField("Copyright", "ird-copyright") +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("ird-pane-route",
                            '<div class="d-flex flex-column gap-3">' +
                                '<div class="card" id="icg-route-yaml-card">' +
                                    '<div class="card-header flex-wrap gap-2">' +
                                        "<div>" +
                                            '<h3 class="card-title mb-0">Gateway route YAML</h3>' +
                                            '<div class="small text-muted"><code>' + esc(routeContentType) + "</code>" +
                                                " · Ctrl-Space complete · Ctrl-F find · Ctrl-/ comment · Ctrl-Q fold</div>" +
                                        "</div>" +
                                        '<div class="card-tools d-flex flex-nowrap align-items-center gap-2 camel-route-yaml-tools">' +
                                            yamlTools +
                                        "</div>" +
                                    "</div>" +
                                    '<div class="card-body p-0">' +
                                        '<textarea id="ird-yaml" class="d-none"></textarea>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                        tabPane("ird-pane-related", CadminLibraryRelated.cards()) +
                        tabPane("ird-pane-graph", CadminResourceGraph.card()) +
                        tabPane("ird-pane-history", CadminResourceHistory.card()) +
                        tabPane("ird-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this ICG route</p>' +
                                            '<small class="text-secondary">' +
                                                "This permanently deletes the Library that stores the gateway YAML." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="ird-delete">Delete</button>' +
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
        markEditorClean();
        markBasicsClean();
        bind();
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
        refreshMarkdownEditors();
        syncUnsavedFlag();
    }

    function renderHeader() {
        const label = routeLabel();
        $("#ird-title").text(label);
        $("#ird-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $("#ird-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $("#ird-fhir-id").text("").addClass("d-none");
        }
    }

    function bindDomainSelect() {
        CadminApi.bindConceptSelect("#ird-domains", CadminApi.valueSets.gatewayRouteDomains, {
            placeholder: "Select domains…",
            multiple: true,
            preload: true,
            selected: CadminApi.libraryDomainCodings(library),
            onChange: syncUnsavedFlag
        });
    }

    function fillBasicsForm() {
        const period = library.effectivePeriod || {};
        $("#ird-title-input").val(library.title || "");
        $("#ird-status").val(library.status || "draft");
        $("#ird-type").val(typeCode());
        $("#ird-experimental").prop("checked", !!library.experimental);
        bindDomainSelect();
        $("#ird-url").val(library.url || "");
        $("#ird-name").val(library.name || "");
        $("#ird-version").val(library.version || "");
        $("#ird-publisher").val(library.publisher || "");
        $("#ird-date").val(dateInputValue(library.date));
        $("#ird-approval").val(dateInputValue(library.approvalDate));
        $("#ird-review").val(dateInputValue(library.lastReviewDate));
        $("#ird-period-start").val(dateInputValue(period.start));
        $("#ird-period-end").val(dateInputValue(period.end));
    }

    function refreshRoutePane() {
        if (editor) {
            editor.setSize("100%", "36rem");
            editor.refresh();
        }
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
        $root.on("shown.bs.tab.irdetail", "#ird-pane-details-btn", refreshMarkdownEditors);
        $root.on("shown.bs.tab.irdetail", "#ird-pane-route-btn", refreshRoutePane);
        $root.on("shown.bs.tab.irdetail", "#ird-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.irdetail change.irdetail",
            "#ird-basic-form :input, #ird-identity-form :input, #ird-details-form :input", syncUnsavedFlag);
        CadminApi.fillValueSetSelect("#ird-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: library.status || "draft",
            onConcepts: function () {
                syncUnsavedFlag();
            }
        });
        $root.on("click.irdetail", "#ird-save", function () {
            saveLibrary(function () {
                CadminApi.showToast("success", "ICG route saved.");
            });
        });
        $("#ird-basic-form, #ird-identity-form, #ird-details-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "ICG route updated.");
            }, { withMeta: true, withYaml: false });
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
        $root.on("click.irdetail", "#ird-replace", function () {
            if (editor && CodeMirror.commands.replace) {
                CodeMirror.commands.replace(editor);
            }
        });
        $root.on("click.irdetail", "#ird-fold", function () {
            if (!editor) {
                return;
            }
            editor.operation(function () {
                for (let i = editor.firstLine(); i <= editor.lastLine(); i += 1) {
                    editor.foldCode(CodeMirror.Pos(i, 0), null, "fold");
                }
            });
        });
        $root.on("click.irdetail", "#ird-unfold", function () {
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
