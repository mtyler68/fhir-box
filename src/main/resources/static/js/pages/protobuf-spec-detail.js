window.CadminProtobufSpecDetail = (function () {
    const libraryType = "proto-spec";
    const protoContentType = "text/x-protobuf";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const templates = [
        {
            id: "proto3",
            label: "proto3 message",
            proto: 'syntax = "proto3";\n\npackage example;\n\noption java_package = "com.example";\noption java_multiple_files = true;\n\nmessage Example {\n  string id = 1;\n  string name = 2;\n}\n'
        },
        {
            id: "proto2",
            label: "proto2 message",
            proto: 'syntax = "proto2";\n\npackage example;\n\nmessage Example {\n  required string id = 1;\n  optional string name = 2;\n  repeated string tags = 3;\n}\n'
        },
        {
            id: "edition2024",
            label: "Edition 2024",
            proto: 'edition = "2024";\n\npackage example;\n\noption features.field_presence = EXPLICIT;\n\nmessage Example {\n  string id = 1;\n  string name = 2;\n}\n'
        },
        {
            id: "service",
            label: "Service and RPC",
            proto: 'syntax = "proto3";\n\npackage example.v1;\n\nimport "google/protobuf/empty.proto";\nimport "google/protobuf/timestamp.proto";\n\nservice ExampleService {\n  rpc GetExample(GetExampleRequest) returns (Example);\n  rpc WatchExamples(WatchExamplesRequest) returns (stream Example);\n}\n\nmessage GetExampleRequest {\n  string id = 1;\n}\n\nmessage WatchExamplesRequest {\n  google.protobuf.Timestamp since = 1;\n}\n\nmessage Example {\n  string id = 1;\n  string name = 2;\n}\n'
        },
        {
            id: "enum-oneof",
            label: "Enum, oneof, and map",
            proto: 'syntax = "proto3";\n\npackage example;\n\nenum Status {\n  STATUS_UNSPECIFIED = 0;\n  STATUS_ACTIVE = 1;\n  STATUS_INACTIVE = 2;\n}\n\nmessage Example {\n  string id = 1;\n  Status status = 2;\n  map<string, string> labels = 3;\n  oneof payload {\n    string text = 10;\n    bytes data = 11;\n  }\n}\n'
        }
    ];
    const markdownFields = ["psd-description", "psd-purpose", "psd-usage", "psd-copyright"];
    const markdownFieldKeys = {
        "psd-description": "description",
        "psd-purpose": "purpose",
        "psd-usage": "usage",
        "psd-copyright": "copyright"
    };
    let library = null;
    let editor = null;
    let markdownEditors = {};
    let turndown = null;
    let savedProto = "";
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

    function specLabel() {
        return library.title || library.name || library.id || "Protobuf spec";
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

    function isProtoAttachment(item) {
        const type = ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
        const title = String((item && item.title) || "").toLowerCase();
        return type === protoContentType || type === "text/protobuf"
            || /\.proto$/i.test(title) || title.indexOf("protobuf") >= 0;
    }

    function findProtoAttachment() {
        return (library.content || []).find(isProtoAttachment) || (library.content || [])[0] || null;
    }

    function readProto() {
        const attachment = findProtoAttachment();
        return attachment && attachment.data ? decodeText(attachment.data) : "";
    }

    function upsertProto(text) {
        const attachment = {
            contentType: protoContentType,
            title: "Protobuf spec",
            data: encodeText(text || "")
        };
        library.content = library.content || [];
        let found = false;
        library.content = library.content.map(function (item) {
            if (!isProtoAttachment(item)) {
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
        setMarkdownValue("psd-description", library && library.description);
        setMarkdownValue("psd-purpose", library && library.purpose);
        setMarkdownValue("psd-usage", library && library.usage);
        setMarkdownValue("psd-copyright", library && library.copyright);
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

    function destroyProtoEditor() {
        if (editor) {
            editor.toTextArea();
            editor = null;
        }
    }

    function destroyEditor() {
        destroyMarkdownEditors();
        destroyProtoEditor();
    }

    function editorValue() {
        const cm = protoEditorInstance();
        return cm ? cm.getValue() : ($("#psd-proto").val() || "");
    }

    function protoEditorInstance() {
        const root = window.CadminWorkspace && typeof CadminWorkspace.root === "function"
            ? CadminWorkspace.root()
            : document;
        const wrap = root && root.querySelector
            ? root.querySelector("#protobuf-spec-editor-card .CodeMirror")
            : document.querySelector("#protobuf-spec-editor-card .CodeMirror");
        if (wrap && wrap.CodeMirror) {
            editor = wrap.CodeMirror;
            return editor;
        }
        return editor;
    }

    function domainSnapshot() {
        return CadminApi.selectCodings("#psd-domains").map(function (item) {
            return (item.system || "") + "|" + item.code;
        }).sort().join(",");
    }

    function basicsSnapshot() {
        return [
            $("#psd-title-input").val() || "",
            $("#psd-status").val() || "",
            $("#psd-experimental").is(":checked") ? "1" : "0",
            domainSnapshot(),
            markdownValue("psd-description"),
            markdownValue("psd-purpose"),
            markdownValue("psd-usage"),
            markdownValue("psd-copyright"),
            $("#psd-url").val() || "",
            $("#psd-name").val() || "",
            $("#psd-version").val() || "",
            $("#psd-publisher").val() || "",
            $("#psd-date").val() || "",
            $("#psd-approval").val() || "",
            $("#psd-review").val() || "",
            $("#psd-period-start").val() || "",
            $("#psd-period-end").val() || ""
        ].join("\n");
    }

    function syncUnsavedFlag() {
        CadminApi.setUnsavedFlag(CadminWorkspace.root(),
            editorValue() !== savedProto || basicsSnapshot() !== savedBasics);
    }

    function markEditorClean() {
        savedProto = editorValue();
        syncUnsavedFlag();
    }

    function markBasicsClean() {
        savedBasics = basicsSnapshot();
        syncUnsavedFlag();
    }

    function validateProto(text) {
        const source = String(text || "");
        if (!source.trim()) {
            return "Protobuf source is empty.";
        }
        const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        if (!/\b(?:syntax|edition|message|enum|service)\b/.test(stripped)) {
            return "Protobuf should declare a syntax, edition, message, enum, or service.";
        }
        return "";
    }

    function mountEditor(text) {
        destroyProtoEditor();
        const textarea = document.getElementById("psd-proto");
        if (!textarea) {
            return;
        }
        textarea.value = text || "";
        if (typeof CodeMirror === "undefined") {
            return;
        }
        editor = CodeMirror.fromTextArea(textarea, {
            mode: "protobuf",
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
            hintOptions: {
                hint: CodeMirror.hint.protobuf,
                completeSingle: false
            }
        });
        editor.getWrapperElement().classList.add("protobuf-spec-editor");
        editor.setSize("100%", "36rem");
        editor.on("change", function () {
            syncUnsavedFlag();
        });
        editor.on("inputRead", function (cm, change) {
            if (change.text.length !== 1 || !/^[A-Za-z.]$/.test(change.text[0])) {
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
        setOrDelete(library, "title", $("#psd-title-input").val());
        library.status = $("#psd-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Protobuf Spec" }],
            text: libraryType
        };
        if ($("#psd-experimental").is(":checked")) {
            library.experimental = true;
        } else {
            delete library.experimental;
        }
        CadminApi.applyLibraryDomainCodings(library, CadminApi.selectCodings("#psd-domains"));
        setOrDelete(library, "description", htmlToMarkdown(markdownValue("psd-description")));
        setOrDelete(library, "purpose", htmlToMarkdown(markdownValue("psd-purpose")));
        setOrDelete(library, "usage", htmlToMarkdown(markdownValue("psd-usage")));
        setOrDelete(library, "copyright", htmlToMarkdown(markdownValue("psd-copyright")));
        setOrDelete(library, "url", $("#psd-url").val());
        setOrDelete(library, "name", $("#psd-name").val());
        setOrDelete(library, "version", $("#psd-version").val());
        setOrDelete(library, "publisher", $("#psd-publisher").val());
        setOrDelete(library, "date", $("#psd-date").val());
        setOrDelete(library, "approvalDate", $("#psd-approval").val());
        setOrDelete(library, "lastReviewDate", $("#psd-review").val());
        const start = ($("#psd-period-start").val() || "").trim();
        const end = ($("#psd-period-end").val() || "").trim();
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
        const withProto = opts.withProto !== false;
        if (withMeta) {
            applyMeta();
        } else {
            library.type = {
                coding: [{ code: libraryType, display: "Protobuf Spec" }],
                text: libraryType
            };
        }
        if (withProto) {
            const proto = editorValue();
            const problem = validateProto(proto);
            if (problem) {
                CadminApi.showToast("danger", problem);
                return;
            }
            upsertProto(proto);
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
            if (withProto) {
                markEditorClean();
            } else {
                syncUnsavedFlag();
            }
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update Protobuf spec failed (" + xhr.status + ").");
        });
    }

    function setProtoText(text) {
        if (editor) {
            editor.setValue(text);
            editor.focus();
        } else {
            $("#psd-proto").val(text);
        }
    }

    function applyProtoText(text, confirmTitle) {
        function apply() {
            setProtoText(text);
        }
        if (editorValue().trim()) {
            CadminApi.confirm({
                title: confirmTitle,
                confirmText: "Replace",
                icon: "warning"
            }).done(apply);
            return;
        }
        apply();
    }

    function insertTemplate(id) {
        const match = templates.find(function (item) { return item.id === id; });
        if (!match) {
            return;
        }
        applyProtoText(match.proto, "Replace the current Protobuf with this template?");
    }

    function loadLocalFile(file) {
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = function () {
            applyProtoText(String(reader.result || ""), "Replace the current Protobuf with this file?");
        };
        reader.onerror = function () {
            CadminApi.showToast("danger", "Unable to read the selected file.");
        };
        reader.readAsText(file);
    }

    function redirectIfOtherLibrary(resource) {
        if (CadminApi.isLibraryType(resource, "pds-policies")) {
            window.location.hash = "#/pds-policies/" + encodeURIComponent(resource.id);
            return true;
        }
        if (CadminApi.isLibraryType(resource, "camel-route")) {
            window.location.hash = "#/camel-routes/" + encodeURIComponent(resource.id);
            return true;
        }
        if (CadminApi.isGatewayRouteLibrary(resource)) {
            window.location.hash = "#/icg-routes/" + encodeURIComponent(resource.id);
            return true;
        }
        if (CadminApi.isLibraryType(resource, "easy-rule")) {
            window.location.hash = "#/easy-rules/" + encodeURIComponent(resource.id);
            return true;
        }
        if (CadminApi.isLibraryType(resource, "rule-set")) {
            window.location.hash = "#/rule-sets/" + encodeURIComponent(resource.id);
            return true;
        }
        if (CadminApi.isLibraryType(resource, "jolt")) {
            window.location.hash = "#/jolts/" + encodeURIComponent(resource.id);
            return true;
        }
        if (CadminApi.isLibraryType(resource, "rate-limit-plan")) {
            window.location.hash = "#/rate-limit-plans/" + encodeURIComponent(resource.id);
            return true;
        }
        return false;
    }

    function render(resource) {
        destroyEditor();
        CadminApi.destroySelects(CadminWorkspace.root());
        if (redirectIfOtherLibrary(resource)) {
            return;
        }
        library = resource;
        const $root = $(CadminWorkspace.root());
        const label = esc(specLabel());
        const protoTools =
            '<select class="form-select form-select-sm" id="psd-template" style="max-width:14rem">' +
                '<option value="">Insert template…</option>' +
                templates.map(function (item) {
                    return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
                }).join("") +
            "</select>" +
            '<input type="file" class="d-none" id="psd-file" accept=".proto,.txt,text/x-protobuf,text/plain">' +
            '<button class="btn btn-sm btn-outline-secondary" type="button" id="psd-load-file">' +
                '<i class="bi bi-folder2-open me-1"></i>Load file</button>' +
            '<button class="btn btn-sm btn-outline-secondary" type="button" id="psd-find">' +
                '<i class="bi bi-search me-1"></i>Find</button>' +
            '<button class="btn btn-sm btn-outline-secondary" type="button" id="psd-replace">' +
                "Replace</button>" +
            '<div class="btn-group btn-group-sm" role="group" aria-label="Fold Protobuf">' +
                '<button class="btn btn-outline-secondary" type="button" id="psd-fold" ' +
                    'title="Fold all" aria-label="Fold all">' +
                    '<i class="bi bi-arrows-collapse" aria-hidden="true"></i></button>' +
                '<button class="btn btn-outline-secondary" type="button" id="psd-unfold" ' +
                    'title="Unfold all" aria-label="Unfold all">' +
                    '<i class="bi bi-arrows-expand" aria-hidden="true"></i></button>' +
            "</div>" +
            '<button class="btn btn-sm btn-primary" type="button" id="psd-save">' +
                '<i class="bi bi-check2 me-1"></i>Save</button>';
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/proto-specs">' +
                        '<i class="bi bi-arrow-left me-1"></i>Protobuf Specs</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="psd-title">' + label + "</h1>" +
                        '<span id="psd-status-badge">' + statusBadge(library.status) + "</span>" +
                        (library.id
                            ? '<code class="small" id="psd-fhir-id">' + esc(library.id) + "</code>"
                            : '<code class="small d-none" id="psd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="psd-settings-nav" role="tablist">' +
                        navButton("psd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("psd-pane-identity", "bi bi-person-vcard", "Identity and version") +
                        navButton("psd-pane-details", "bi bi-journal-text", "Details") +
                        navButton("psd-pane-protobuf", "bi bi-file-earmark-code", "Protobuf") +
                        navButton("psd-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("psd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("psd-pane-history", "bi bi-clock-history", "History") +
                        navButton("psd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("psd-pane-basics",
                            '<form id="psd-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="psd-title-input">') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="psd-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>"),
                                            field("Type",
                                                '<input class="form-control font-monospace" id="psd-type" value="' +
                                                    esc(typeCode()) + '" readonly disabled>')) +
                                        fieldRow(
                                            '<div class="mb-3">' +
                                                '<label class="form-label d-none d-md-block">&nbsp;</label>' +
                                                '<div class="form-check d-flex align-items-center gap-2" ' +
                                                    'style="min-height:calc(1.5em + .75rem + 2px)">' +
                                                    '<input class="form-check-input" type="checkbox" id="psd-experimental">' +
                                                    '<label class="form-check-label" for="psd-experimental">Experimental</label>' +
                                                "</div>" +
                                            "</div>",
                                            field("Domain",
                                                '<select class="form-select" id="psd-domains" multiple></select>')) +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("psd-pane-identity",
                            '<form id="psd-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Identity and version</h3></div>' +
                                    '<div class="card-body">' +
                                        field("URL", '<input class="form-control font-monospace" id="psd-url">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="psd-name">'),
                                            field("Version", '<input class="form-control" id="psd-version" autocomplete="off">')) +
                                        fieldRow(
                                            field("Publisher", '<input class="form-control" id="psd-publisher">'),
                                            field("Date", '<input type="date" class="form-control" id="psd-date">')) +
                                        fieldRow(
                                            field("Approved date", '<input type="date" class="form-control" id="psd-approval">'),
                                            field("Last review date", '<input type="date" class="form-control" id="psd-review">')) +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Effective date range</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="psd-period-start" ' +
                                                        'aria-label="Effective start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="psd-period-end" ' +
                                                        'aria-label="Effective end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("psd-pane-details",
                            '<form id="psd-details-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Details</h3></div>' +
                                    '<div class="card-body">' +
                                        markdownField("Description", "psd-description") +
                                        markdownField("Purpose", "psd-purpose") +
                                        markdownField("Usage", "psd-usage") +
                                        markdownField("Copyright", "psd-copyright") +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("psd-pane-protobuf",
                            '<div class="card" id="protobuf-spec-editor-card">' +
                                '<div class="card-header flex-wrap gap-2">' +
                                    "<div>" +
                                        '<h3 class="card-title mb-0">Protobuf</h3>' +
                                        '<div class="small text-muted"><code>' + esc(protoContentType) + "</code>" +
                                            " · Ctrl-Space complete · Ctrl-F find · Ctrl-/ comment · Ctrl-Q fold</div>" +
                                    "</div>" +
                                    '<div class="card-tools d-flex flex-nowrap align-items-center gap-2 protobuf-spec-tools">' +
                                        protoTools +
                                    "</div>" +
                                "</div>" +
                                '<div class="card-body p-0">' +
                                    '<textarea id="psd-proto" class="d-none"></textarea>' +
                                "</div>" +
                            "</div>") +
                        tabPane("psd-pane-related", CadminLibraryRelated.cards()) +
                        tabPane("psd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("psd-pane-history", CadminResourceHistory.card()) +
                        tabPane("psd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this Protobuf spec</p>' +
                                            '<small class="text-secondary">' +
                                                "This permanently deletes the Library that stores the Protobuf source." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="psd-delete">Delete</button>' +
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
        mountEditor(readProto() || templates[0].proto);
        markEditorClean();
        markBasicsClean();
        bind();
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        const pane = document.getElementById("app-content-detail") || document;
        const wrap = pane.querySelector("#protobuf-spec-editor-card .CodeMirror");
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
            const textarea = pane.querySelector("#psd-proto");
            if (textarea) {
                mountEditor(textarea.value);
            }
        }
        refreshMarkdownEditors();
        syncUnsavedFlag();
    }

    function renderHeader() {
        const label = specLabel();
        $("#psd-title").text(label);
        $("#psd-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $("#psd-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $("#psd-fhir-id").text("").addClass("d-none");
        }
    }

    function bindDomainSelect() {
        CadminApi.bindConceptSelect("#psd-domains", CadminApi.valueSets.protoSpecDomains, {
            placeholder: "Select domains…",
            multiple: true,
            preload: true,
            selected: CadminApi.libraryDomainCodings(library),
            onChange: syncUnsavedFlag
        });
    }

    function fillBasicsForm() {
        const period = library.effectivePeriod || {};
        $("#psd-title-input").val(library.title || "");
        $("#psd-status").val(library.status || "draft");
        $("#psd-type").val(typeCode());
        $("#psd-experimental").prop("checked", !!library.experimental);
        bindDomainSelect();
        $("#psd-url").val(library.url || "");
        $("#psd-name").val(library.name || "");
        $("#psd-version").val(library.version || "");
        $("#psd-publisher").val(library.publisher || "");
        $("#psd-date").val(dateInputValue(library.date));
        $("#psd-approval").val(dateInputValue(library.approvalDate));
        $("#psd-review").val(dateInputValue(library.lastReviewDate));
        $("#psd-period-start").val(dateInputValue(period.start));
        $("#psd-period-end").val(dateInputValue(period.end));
    }

    function refreshProtobufPane() {
        if (editor) {
            editor.setSize("100%", "36rem");
            editor.refresh();
        }
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".psdetail");
        $root.on("shown.bs.tab.psdetail", "#psd-pane-details-btn", refreshMarkdownEditors);
        $root.on("shown.bs.tab.psdetail", "#psd-pane-protobuf-btn", refreshProtobufPane);
        $root.on("shown.bs.tab.psdetail", "#psd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.psdetail change.psdetail",
            "#psd-basic-form :input, #psd-identity-form :input, #psd-details-form :input", syncUnsavedFlag);
        CadminApi.fillValueSetSelect("#psd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: library.status || "draft",
            onConcepts: function () {
                syncUnsavedFlag();
            }
        });
        $root.on("click.psdetail", "#psd-save", function () {
            saveLibrary(function () {
                CadminApi.showToast("success", "Protobuf spec saved.");
            });
        });
        $("#psd-basic-form, #psd-identity-form, #psd-details-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Protobuf spec updated.");
            }, { withMeta: true, withProto: false });
        });
        $root.on("click.psdetail", "#psd-delete", function () {
            CadminApi.confirm("Delete this Protobuf spec?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    destroyEditor();
                    CadminApi.showToast("success", "Protobuf spec deleted.");
                    window.location.hash = "#/proto-specs";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete Protobuf spec failed (" + xhr.status + ").");
                });
            });
        });
        $root.on("change.psdetail", "#psd-template", function () {
            const id = $(this).val();
            $(this).val("");
            insertTemplate(id);
        });
        $root.on("click.psdetail", "#psd-load-file", function () {
            const input = document.getElementById("psd-file");
            if (input) {
                input.click();
            }
        });
        $root.on("change.psdetail", "#psd-file", function () {
            const file = this.files && this.files[0];
            this.value = "";
            loadLocalFile(file);
        });
        $root.on("click.psdetail", "#psd-find", function () {
            if (editor && CodeMirror.commands.findPersistent) {
                CodeMirror.commands.findPersistent(editor);
            } else if (editor && CodeMirror.commands.find) {
                CodeMirror.commands.find(editor);
            }
        });
        $root.on("click.psdetail", "#psd-replace", function () {
            if (editor && CodeMirror.commands.replace) {
                CodeMirror.commands.replace(editor);
            }
        });
        $root.on("click.psdetail", "#psd-fold", function () {
            if (!editor) {
                return;
            }
            editor.operation(function () {
                for (let i = editor.firstLine(); i <= editor.lastLine(); i += 1) {
                    editor.foldCode(CodeMirror.Pos(i, 0), null, "fold");
                }
            });
        });
        $root.on("click.psdetail", "#psd-unfold", function () {
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
