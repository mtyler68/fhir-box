window.CadminEasyRuleDetail = (function () {
    const libraryType = "easy-rule";
    const routeContentType = "application/easy-rules+yaml";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const templates = [
        {
            id: "simple",
            label: "Simple MVEL rule",
            yaml: "name: adult rule\ndescription: when age is greater than 18, then mark as adult\npriority: 1\nslang: mvel\ncondition: \"person.age > 18\"\nactions:\n  - \"person.setAdult(true);\"\n"
        },
        {
            id: "weather",
            label: "Weather rule",
            yaml: "name: weather rule\ndescription: when it rains, then take an umbrella\npriority: 1\nslang: mvel\ncondition: \"rain == true\"\nactions:\n  - \"System.out.println(\\\"It rains, take an umbrella!\\\");\"\n"
        },
        {
            id: "spel",
            label: "SpEL rule",
            yaml: "name: adult rule\ndescription: when age is greater than 18, then mark as adult\npriority: 1\nslang: spel\ncondition: \"#person.age > 18\"\nactions:\n  - \"#person.setAdult(true)\"\n"
        },
        {
            id: "composite",
            label: "Unit rule group",
            yaml: "name: Movie id rule\ncompositeRuleType: UnitRuleGroup\npriority: 1\ncomposingRules:\n  - name: Time is evening\n    description: If it's later than 7pm\n    priority: 1\n    slang: mvel\n    condition: \"day.hour > 19\"\n    actions:\n      - \"person.shouldProvideId(true);\"\n  - name: Movie is rated R\n    description: If the movie is rated R\n    priority: 1\n    slang: mvel\n    condition: \"movie.rating == R\"\n    actions:\n      - \"person.shouldProvideId(true);\"\n"
        },
        {
            id: "multi",
            label: "Multiple rules",
            yaml: "name: adult rule\ndescription: when age is greater than 18, then mark as adult\npriority: 1\nslang: mvel\ncondition: \"person.age > 18\"\nactions:\n  - \"person.setAdult(true);\"\n---\nname: weather rule\ndescription: when it rains, then take an umbrella\npriority: 2\nslang: mvel\ncondition: \"rain == true\"\nactions:\n  - \"System.out.println(\\\"It rains, take an umbrella!\\\");\"\n"
        }
    ];
    const ruleProperties = [
        "name", "description", "priority", "slang", "condition", "actions",
        "composingRules", "compositeRuleType"
    ];
    const slangValues = ["mvel", "spel", "jexl"];
    const compositeTypes = ["ActivationRuleGroup", "ConditionalRuleGroup", "UnitRuleGroup"];
    const hintWords = ruleProperties.concat(slangValues, compositeTypes);
    const markdownFields = ["erd-description", "erd-purpose", "erd-usage", "erd-copyright"];
    const markdownFieldKeys = {
        "erd-description": "description",
        "erd-purpose": "purpose",
        "erd-usage": "usage",
        "erd-copyright": "copyright"
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
        return library.title || library.name || library.id || "Easy rule";
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
            title: "Easy rule",
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
        CodeMirror.registerHelper("hint", "easy-rule-yaml", function (cm) {
            const cursor = cm.getCursor();
            const line = cm.getLine(cursor.line) || "";
            const before = line.slice(0, cursor.ch);
            const match = before.match(/[A-Za-z][A-Za-z0-9_-]*$/);
            const word = match ? match[0] : "";
            const start = cursor.ch - word.length;
            const prefix = word.toLowerCase();
            const propLine = String(line || "").replace(/^\s*-\s+/, "");
            const keyMatch = propLine.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*/);
            const keyName = keyMatch ? keyMatch[1] : "";
            const valueStart = keyMatch ? line.indexOf(keyMatch[0]) + keyMatch[0].length : -1;
            const inValue = keyMatch && start >= valueStart;
            let candidates = hintWords;
            if (inValue && keyName === "slang") {
                candidates = slangValues;
            } else if (inValue && keyName === "compositeRuleType") {
                candidates = compositeTypes;
            } else if (!inValue) {
                candidates = ruleProperties;
            }
            const asProperty = isYamlPropertyPosition(line, start);
            const colonAlready = /^\s*:/.test(line.slice(cursor.ch));
            const list = candidates.filter(function (item) {
                return !prefix || item.toLowerCase().indexOf(prefix) === 0;
            }).map(function (item) {
                if (!asProperty || colonAlready || inValue) {
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
        setMarkdownValue("erd-description", library && library.description);
        setMarkdownValue("erd-purpose", library && library.purpose);
        setMarkdownValue("erd-usage", library && library.usage);
        setMarkdownValue("erd-copyright", library && library.copyright);
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
        return editor ? editor.getValue() : ($("#erd-yaml").val() || "");
    }

    function domainSnapshot() {
        return CadminApi.selectCodings("#erd-domains").map(function (item) {
            return (item.system || "") + "|" + item.code;
        }).sort().join(",");
    }

    function basicsSnapshot() {
        return [
            $("#erd-title-input").val() || "",
            $("#erd-status").val() || "",
            $("#erd-experimental").is(":checked") ? "1" : "0",
            domainSnapshot(),
            markdownValue("erd-description"),
            markdownValue("erd-purpose"),
            markdownValue("erd-usage"),
            markdownValue("erd-copyright"),
            $("#erd-url").val() || "",
            $("#erd-name").val() || "",
            $("#erd-version").val() || "",
            $("#erd-publisher").val() || "",
            $("#erd-date").val() || "",
            $("#erd-approval").val() || "",
            $("#erd-review").val() || "",
            $("#erd-period-start").val() || "",
            $("#erd-period-end").val() || ""
        ].join("\n");
    }

    function isPersistedActive() {
        return CadminApi.isActiveEasyRuleLibrary(library);
    }

    function activeEditError() {
        return "An active Easy rule can only change status.";
    }

    function activeDeleteError() {
        return "An active Easy rule cannot be deleted.";
    }

    function basicsDirtyExceptStatus() {
        const current = basicsSnapshot().split("\n");
        const saved = String(savedBasics || "").split("\n");
        if (current.length !== saved.length) {
            return true;
        }
        let i;
        for (i = 0; i < current.length; i += 1) {
            if (i === 1) {
                continue;
            }
            if (current[i] !== saved[i]) {
                return true;
            }
        }
        return false;
    }

    function setTomSelectLocked(selector, locked) {
        const el = document.querySelector(selector);
        if (!el || !el.tomselect) {
            return;
        }
        if (locked) {
            el.tomselect.lock();
        } else {
            el.tomselect.unlock();
        }
    }

    function applyActiveLock() {
        const locked = isPersistedActive();
        $("#erd-basic-form :input").not("#erd-status, [type=submit]").prop("disabled", locked);
        $("#erd-identity-form :input, #erd-details-form :input").prop("disabled", locked);
        $("#erd-identity-form button[type=submit], #erd-details-form button[type=submit]").prop("disabled", locked);
        $("#erd-save, #erd-template, #erd-replace").prop("disabled", locked);
        $("#erd-delete").prop("disabled", locked);
        if (locked) {
            $("#erd-delete").attr("title", activeDeleteError());
        } else {
            $("#erd-delete").removeAttr("title");
        }
        const deleteHelp = locked
            ? activeDeleteError()
            : "This permanently deletes the Library that stores the Easy Rules YAML.";
        $("#erd-delete-help").text(deleteHelp);
        if (locked) {
            if (!$("#erd-active-lock-note").length) {
                $("#erd-status").closest(".mb-3").append(
                    '<div class="form-text" id="erd-active-lock-note">' +
                        "This Easy rule is active. Only status can be changed.</div>"
                );
            }
        } else {
            $("#erd-active-lock-note").remove();
        }
        if (editor) {
            editor.setOption("readOnly", locked ? "nocursor" : false);
        }
        Object.keys(markdownEditors).forEach(function (id) {
            const mde = markdownEditors[id];
            if (mde && mde.codemirror) {
                mde.codemirror.setOption("readOnly", locked ? "nocursor" : false);
            }
        });
        setTomSelectLocked("#erd-domains", locked);
        $("#erd-type").prop("disabled", true);
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
            return "Rule YAML is empty.";
        }
        const lines = source.split(/\r?\n/);
        let i;
        for (i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            if (!line.trim() || /^\s*#/.test(line)) {
                continue;
            }
            if (/^\t/.test(line)) {
                return "Line " + (i + 1) + " uses a tab. Indent Easy Rules YAML with spaces.";
            }
            if (/^\s+[^ \t].*:/.test(line) && (line.length - line.trimStart().length) % 2 !== 0) {
                return "Line " + (i + 1) + " is not indented in 2-space steps.";
            }
        }
        const docs = source.split(/^---\s*$/m).filter(function (doc) { return doc.trim(); });
        let d;
        for (d = 0; d < docs.length; d += 1) {
            const doc = docs[d];
            if (!/(^|\n)\s*name\s*:/.test(doc)) {
                return "Each rule needs a name.";
            }
            const composite = /(^|\n)\s*compositeRuleType\s*:/.test(doc);
            const composing = /(^|\n)\s*composingRules\s*:/.test(doc);
            const condition = /(^|\n)\s*condition\s*:/.test(doc);
            const actions = /(^|\n)\s*actions\s*:/.test(doc);
            if (composite || composing) {
                if (!composite || !composing) {
                    return "Composite rules need both compositeRuleType and composingRules.";
                }
            } else if (!condition || !actions) {
                return "Simple rules need slang, a condition, and actions.";
            } else if (!/(^|\n)\s*slang\s*:/.test(doc)) {
                return "Simple rules need slang (mvel, spel, or jexl).";
            }
        }
        return "";
    }

    function mountEditor(text) {
        destroyYamlEditor();
        const textarea = document.getElementById("erd-yaml");
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
            hintOptions: { hint: CodeMirror.hint["easy-rule-yaml"], completeSingle: false }
        });
        editor.getWrapperElement().classList.add("easy-rule-editor");
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
        setOrDelete(library, "title", $("#erd-title-input").val());
        library.status = $("#erd-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Easy Rule" }],
            text: libraryType
        };
        if ($("#erd-experimental").is(":checked")) {
            library.experimental = true;
        } else {
            delete library.experimental;
        }
        CadminApi.applyLibraryDomainCodings(library, CadminApi.selectCodings("#erd-domains"));
        setOrDelete(library, "description", htmlToMarkdown(markdownValue("erd-description")));
        setOrDelete(library, "purpose", htmlToMarkdown(markdownValue("erd-purpose")));
        setOrDelete(library, "usage", htmlToMarkdown(markdownValue("erd-usage")));
        setOrDelete(library, "copyright", htmlToMarkdown(markdownValue("erd-copyright")));
        setOrDelete(library, "url", $("#erd-url").val());
        setOrDelete(library, "name", $("#erd-name").val());
        setOrDelete(library, "version", $("#erd-version").val());
        setOrDelete(library, "publisher", $("#erd-publisher").val());
        setOrDelete(library, "date", $("#erd-date").val());
        setOrDelete(library, "approvalDate", $("#erd-approval").val());
        setOrDelete(library, "lastReviewDate", $("#erd-review").val());
        const start = ($("#erd-period-start").val() || "").trim();
        const end = ($("#erd-period-end").val() || "").trim();
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
        if (isPersistedActive()) {
            if ((withYaml && editorValue() !== savedYaml) || (withMeta && basicsDirtyExceptStatus())) {
                CadminApi.showToast("danger", activeEditError());
                return;
            }
            if (withMeta) {
                library.status = $("#erd-status").val() || library.status;
            }
        } else {
            if (withMeta) {
                applyMeta();
            } else {
                library.type = {
                    coding: [{ code: libraryType, display: "Easy Rule" }],
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
            CadminResourceHistory.mount(library);
            CadminLibraryRelated.mount(library);
            if (withYaml) {
                markEditorClean();
            } else {
                syncUnsavedFlag();
            }
            applyActiveLock();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update Easy rule failed (" + xhr.status + ").");
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
        if (CadminApi.isLibraryType(resource, "proto-spec")) {
            window.location.hash = "#/proto-specs/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isGatewayRouteLibrary(resource)) {
            window.location.hash = "#/icg-routes/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "jolt")) {
            window.location.hash = "#/jolts/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "rule-set")) {
            window.location.hash = "#/rule-sets/" + encodeURIComponent(resource.id);
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
            '<select class="form-select form-select-sm" id="erd-template" style="max-width:14rem">' +
                '<option value="">Insert template…</option>' +
                templates.map(function (item) {
                    return '<option value="' + esc(item.id) + '">' + esc(item.label) + "</option>";
                }).join("") +
            "</select>" +
            '<button class="btn btn-sm btn-outline-secondary" type="button" id="erd-find">' +
                '<i class="bi bi-search me-1"></i>Find</button>' +
            '<button class="btn btn-sm btn-outline-secondary" type="button" id="erd-replace">' +
                "Replace</button>" +
            '<div class="btn-group btn-group-sm" role="group" aria-label="Fold YAML">' +
                '<button class="btn btn-outline-secondary" type="button" id="erd-fold" ' +
                    'title="Fold all" aria-label="Fold all">' +
                    '<i class="bi bi-arrows-collapse" aria-hidden="true"></i></button>' +
                '<button class="btn btn-outline-secondary" type="button" id="erd-unfold" ' +
                    'title="Unfold all" aria-label="Unfold all">' +
                    '<i class="bi bi-arrows-expand" aria-hidden="true"></i></button>' +
            "</div>" +
            '<button class="btn btn-sm btn-primary" type="button" id="erd-save">' +
                '<i class="bi bi-check2 me-1"></i>Save</button>';
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/easy-rules">' +
                        '<i class="bi bi-arrow-left me-1"></i>Easy Rules</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="erd-title">' + label + "</h1>" +
                        '<span id="erd-status-badge">' + statusBadge(library.status) + "</span>" +
                        (library.id
                            ? '<code class="small" id="erd-fhir-id">' + esc(library.id) + "</code>"
                            : '<code class="small d-none" id="erd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="erd-settings-nav" role="tablist">' +
                        navButton("erd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("erd-pane-identity", "bi bi-person-vcard", "Identity and version") +
                        navButton("erd-pane-details", "bi bi-journal-text", "Details") +
                        navButton("erd-pane-rule", "bi bi-file-earmark-code", "Rule") +
                        navButton("erd-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("erd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("erd-pane-history", "bi bi-clock-history", "History") +
                        navButton("erd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("erd-pane-basics",
                            '<form id="erd-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="erd-title-input">') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="erd-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>"),
                                            field("Type",
                                                '<input class="form-control font-monospace" id="erd-type" value="' +
                                                    esc(typeCode()) + '" readonly disabled>')) +
                                        fieldRow(
                                            '<div class="mb-3">' +
                                                '<label class="form-label d-none d-md-block">&nbsp;</label>' +
                                                '<div class="form-check d-flex align-items-center gap-2" ' +
                                                    'style="min-height:calc(1.5em + .75rem + 2px)">' +
                                                    '<input class="form-check-input" type="checkbox" id="erd-experimental">' +
                                                    '<label class="form-check-label" for="erd-experimental">Experimental</label>' +
                                                "</div>" +
                                            "</div>",
                                            field("Domain",
                                                '<select class="form-select" id="erd-domains" multiple></select>')) +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("erd-pane-identity",
                            '<form id="erd-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Identity and version</h3></div>' +
                                    '<div class="card-body">' +
                                        field("URL", '<input class="form-control font-monospace" id="erd-url">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="erd-name">'),
                                            field("Version", '<input class="form-control" id="erd-version" autocomplete="off">')) +
                                        fieldRow(
                                            field("Publisher", '<input class="form-control" id="erd-publisher">'),
                                            field("Date", '<input type="date" class="form-control" id="erd-date">')) +
                                        fieldRow(
                                            field("Approved date", '<input type="date" class="form-control" id="erd-approval">'),
                                            field("Last review date", '<input type="date" class="form-control" id="erd-review">')) +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Effective date range</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="erd-period-start" ' +
                                                        'aria-label="Effective start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="erd-period-end" ' +
                                                        'aria-label="Effective end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("erd-pane-details",
                            '<form id="erd-details-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Details</h3></div>' +
                                    '<div class="card-body">' +
                                        markdownField("Description", "erd-description") +
                                        markdownField("Purpose", "erd-purpose") +
                                        markdownField("Usage", "erd-usage") +
                                        markdownField("Copyright", "erd-copyright") +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("erd-pane-rule",
                            '<div class="d-flex flex-column gap-3">' +
                                '<div class="card" id="easy-rule-yaml-card">' +
                                    '<div class="card-header flex-wrap gap-2">' +
                                        "<div>" +
                                            '<h3 class="card-title mb-0">Easy Rules YAML</h3>' +
                                            '<div class="small text-muted"><code>' + esc(routeContentType) + "</code>" +
                                                " · Ctrl-Space complete · Ctrl-F find · Ctrl-/ comment · Ctrl-Q fold</div>" +
                                        "</div>" +
                                        '<div class="card-tools d-flex flex-nowrap align-items-center gap-2 easy-rule-yaml-tools">' +
                                            yamlTools +
                                        "</div>" +
                                    "</div>" +
                                    '<div class="card-body p-0">' +
                                        '<textarea id="erd-yaml" class="d-none"></textarea>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                        tabPane("erd-pane-related", CadminLibraryRelated.cards()) +
                        tabPane("erd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("erd-pane-history", CadminResourceHistory.card()) +
                        tabPane("erd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this Easy rule</p>' +
                                            '<small class="text-secondary" id="erd-delete-help">' +
                                                "This permanently deletes the Library that stores the Easy Rules YAML." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="erd-delete">Delete</button>' +
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
        applyActiveLock();
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        const pane = document.getElementById("app-content-detail") || document;
        const wrap = pane.querySelector("#easy-rule-yaml-card .CodeMirror");
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
            const textarea = pane.querySelector("#erd-yaml");
            if (textarea) {
                mountEditor(textarea.value);
            }
        }
        refreshMarkdownEditors();
        syncUnsavedFlag();
        applyActiveLock();
    }

    function renderHeader() {
        const label = routeLabel();
        $("#erd-title").text(label);
        $("#erd-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $("#erd-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $("#erd-fhir-id").text("").addClass("d-none");
        }
    }

    function bindDomainSelect() {
        CadminApi.bindConceptSelect("#erd-domains", CadminApi.valueSets.easyRuleDomains, {
            placeholder: "Select domains…",
            multiple: true,
            preload: true,
            selected: CadminApi.libraryDomainCodings(library),
            onChange: syncUnsavedFlag
        });
    }

    function fillBasicsForm() {
        const period = library.effectivePeriod || {};
        $("#erd-title-input").val(library.title || "");
        $("#erd-status").val(library.status || "draft");
        $("#erd-type").val(typeCode());
        $("#erd-experimental").prop("checked", !!library.experimental);
        bindDomainSelect();
        $("#erd-url").val(library.url || "");
        $("#erd-name").val(library.name || "");
        $("#erd-version").val(library.version || "");
        $("#erd-publisher").val(library.publisher || "");
        $("#erd-date").val(dateInputValue(library.date));
        $("#erd-approval").val(dateInputValue(library.approvalDate));
        $("#erd-review").val(dateInputValue(library.lastReviewDate));
        $("#erd-period-start").val(dateInputValue(period.start));
        $("#erd-period-end").val(dateInputValue(period.end));
    }

    function refreshRoutePane() {
        if (editor) {
            editor.setSize("100%", "36rem");
            editor.refresh();
        }
    }

    function insertTemplate(id) {
        if (isPersistedActive()) {
            CadminApi.showToast("danger", activeEditError());
            return;
        }
        const match = templates.find(function (item) { return item.id === id; });
        if (!match) {
            return;
        }
        function apply() {
            if (editor) {
                editor.setValue(match.yaml);
                editor.focus();
            } else {
                $("#erd-yaml").val(match.yaml);
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
        $root.off(".erdetail");
        $root.on("shown.bs.tab.erdetail", "#erd-pane-details-btn", refreshMarkdownEditors);
        $root.on("shown.bs.tab.erdetail", "#erd-pane-rule-btn", refreshRoutePane);
        $root.on("shown.bs.tab.erdetail", "#erd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.erdetail change.erdetail",
            "#erd-basic-form :input, #erd-identity-form :input, #erd-details-form :input", syncUnsavedFlag);
        CadminApi.fillValueSetSelect("#erd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: library.status || "draft",
            onConcepts: function () {
                syncUnsavedFlag();
                applyActiveLock();
            }
        });
        $root.on("click.erdetail", "#erd-save", function () {
            saveLibrary(function () {
                CadminApi.showToast("success", "Easy rule saved.");
            });
        });
        $("#erd-basic-form, #erd-identity-form, #erd-details-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Easy rule updated.");
            }, { withMeta: true, withYaml: false });
        });
        $root.on("click.erdetail", "#erd-delete", function () {
            if (isPersistedActive()) {
                CadminApi.showToast("danger", activeDeleteError());
                return;
            }
            CadminApi.confirm("Delete this Easy rule?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    destroyEditor();
                    CadminApi.showToast("success", "Easy rule deleted.");
                    window.location.hash = "#/easy-rules";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete Easy rule failed (" + xhr.status + ").");
                });
            });
        });
        $root.on("change.erdetail", "#erd-template", function () {
            const id = $(this).val();
            $(this).val("");
            insertTemplate(id);
        });
        $root.on("click.erdetail", "#erd-find", function () {
            if (editor && CodeMirror.commands.findPersistent) {
                CodeMirror.commands.findPersistent(editor);
            } else if (editor && CodeMirror.commands.find) {
                CodeMirror.commands.find(editor);
            }
        });
        $root.on("click.erdetail", "#erd-replace", function () {
            if (isPersistedActive()) {
                CadminApi.showToast("danger", activeEditError());
                return;
            }
            if (editor && CodeMirror.commands.replace) {
                CodeMirror.commands.replace(editor);
            }
        });
        $root.on("click.erdetail", "#erd-fold", function () {
            if (!editor) {
                return;
            }
            editor.operation(function () {
                for (let i = editor.firstLine(); i <= editor.lastLine(); i += 1) {
                    editor.foldCode(CodeMirror.Pos(i, 0), null, "fold");
                }
            });
        });
        $root.on("click.erdetail", "#erd-unfold", function () {
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
