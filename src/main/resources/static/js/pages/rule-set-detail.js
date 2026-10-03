window.CadminRuleSetDetail = (function () {
    const libraryType = "rule-set";
    const engineContentType = "application/rule-set+json";
    const INT32_MIN = -2147483648;
    const INT32_MAX = 2147483647;
    const evaluationPlans = [
        { code: "Default", display: "Default" },
        { code: "Inference", display: "Inference" }
    ];
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const markdownFields = ["rsd-description", "rsd-purpose", "rsd-usage", "rsd-copyright"];
    const markdownFieldKeys = {
        "rsd-description": "description",
        "rsd-purpose": "purpose",
        "rsd-usage": "usage",
        "rsd-copyright": "copyright"
    };
    let library = null;
    let markdownEditors = {};
    let turndown = null;
    let jsonPreviewEditor = null;
    let savedEngine = "";
    let savedBasics = "";
    let easyRulesPage = 0;
    let easyRulesFetch = 0;

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
        return library.title || library.name || library.id || "Rule set";
    }

    function persistedDomain() {
        const domains = CadminApi.libraryDomainCodings(library);
        return domains.length ? domains[0] : null;
    }

    function contextSearchValue(domain) {
        if (!domain || !domain.code) {
            return "";
        }
        return domain.system ? (domain.system + "|" + domain.code) : domain.code;
    }

    function easyRuleSharesDomain(rule, domain) {
        if (!domain || !domain.code) {
            return false;
        }
        return CadminApi.libraryDomainCodings(rule).some(function (item) {
            if (!item || item.code !== domain.code) {
                return false;
            }
            if (domain.system && item.system) {
                return item.system === domain.system;
            }
            return true;
        });
    }

    function easyRulesEmpty(message, danger) {
        const kind = danger ? "text-danger" : "text-muted";
        return '<tr><td colspan="5" class="' + kind + '">' + message + "</td></tr>";
    }

    function easyRuleRow(rule) {
        return "<tr>" +
            "<td>" + CadminApi.resourceLink("#/easy-rules/" + encodeURIComponent(rule.id),
                rule.title || rule.name || "Untitled") + "</td>" +
            '<td class="cadmin-md-cell">' + CadminApi.markdownCell(rule.description) + "</td>" +
            "<td><code>" + esc(rule.version || "—") + "</code></td>" +
            "<td>" + statusBadge(rule.status) + "</td>" +
            "<td><code>" + esc(rule.name || "—") + "</code></td>" +
            "</tr>";
    }

    function easyRulesPaneHtml() {
        return '<div class="card" id="rsd-easy-rules-card">' +
            '<div class="card-header flex-wrap gap-2">' +
                "<div>" +
                    '<h3 class="card-title mb-0">Easy Rules</h3>' +
                    '<div class="small text-muted" id="rsd-easy-rules-domain"></div>' +
                "</div>" +
                '<div class="card-tools">' +
                    '<button class="btn btn-sm btn-outline-secondary" type="button" id="rsd-easy-rules-refresh" ' +
                        'title="Refresh" aria-label="Refresh">' +
                        '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>' +
                "</div>" +
            "</div>" +
            '<div class="card-body p-0">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Title</th><th>Description</th><th>Version</th><th>Status</th><th>Name</th></tr></thead>" +
                        '<tbody id="rsd-easy-rules-rows">' +
                            '<tr><td colspan="5" class="text-muted">Loading…</td></tr>' +
                        "</tbody>" +
                    "</table>" +
                "</div>" +
                '<div class="list-pager px-3 py-2" id="rsd-easy-rules-pager"></div>' +
            "</div>" +
        "</div>";
    }

    function loadEasyRules(page) {
        if (typeof page === "number") {
            easyRulesPage = page;
        }
        const token = ++easyRulesFetch;
        const domain = persistedDomain();
        const $rows = $("#rsd-easy-rules-rows");
        const $pager = $("#rsd-easy-rules-pager");
        const $label = $("#rsd-easy-rules-domain");
        if (!$rows.length) {
            return;
        }
        $pager.empty();
        if (!domain) {
            $label.text("No domain assigned.");
            $rows.html(easyRulesEmpty("Assign a domain on the Basics tab to list Easy rules."));
            return;
        }
        $label.html("Domain <code>" + esc(domain.display || domain.code) + "</code>");
        $rows.html(easyRulesEmpty("Loading…"));
        const size = CadminApi.listPageSize("easy-rules");
        const path = "/Library?type=" + encodeURIComponent("easy-rule") +
            "&context=" + encodeURIComponent(contextSearchValue(domain)) +
            "&_sort=-_lastUpdated" +
            "&_elements=" + encodeURIComponent(
                "id,name,title,description,version,status,type,useContext,subjectCodeableConcept");
        CadminApi.fhir(CadminApi.pagedPath(path, easyRulesPage, size)).done(function (bundle) {
            if (token !== easyRulesFetch) {
                return;
            }
            const entries = CadminApi.bundleResources(bundle, "Library").filter(function (item) {
                return (!item.type || CadminApi.isLibraryType(item, "easy-rule"))
                    && easyRuleSharesDomain(item, domain);
            });
            CadminApi.renderPager("#rsd-easy-rules-pager", {
                page: easyRulesPage,
                size: size,
                pageSizeKey: "easy-rules",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { loadEasyRules(nextPage); }
            });
            if (!entries.length) {
                $rows.html(easyRulesEmpty("No Easy rules share this domain."));
                return;
            }
            $rows.html(entries.map(easyRuleRow).join(""));
        }).fail(function (xhr) {
            if (token !== easyRulesFetch) {
                return;
            }
            $rows.html(easyRulesEmpty("Unable to load Easy rules (" + xhr.status + ").", true));
        });
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

    function defaultEngineParams() {
        return {
            evaluationPlan: "Default",
            skipOnFirstAppliedRule: false,
            skipOnFirstNonTriggeredRule: false,
            skipOnFirstFailedRule: false,
            priorityThreshold: INT32_MAX
        };
    }

    function normalizeEngineParams(raw) {
        const defaults = defaultEngineParams();
        const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
        const plan = source.evaluationPlan === "Inference" ? "Inference" : "Default";
        let threshold = Number(source.priorityThreshold);
        if (!Number.isInteger(threshold) || threshold < INT32_MIN || threshold > INT32_MAX) {
            threshold = defaults.priorityThreshold;
        }
        return {
            evaluationPlan: plan,
            skipOnFirstAppliedRule: !!source.skipOnFirstAppliedRule,
            skipOnFirstNonTriggeredRule: !!source.skipOnFirstNonTriggeredRule,
            skipOnFirstFailedRule: !!source.skipOnFirstFailedRule,
            priorityThreshold: threshold
        };
    }

    function isEngineContent(item) {
        const type = ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
        return type === engineContentType || type === "application/json";
    }

    function findEngineAttachment() {
        return (library.content || []).find(isEngineContent) || (library.content || [])[0] || null;
    }

    function readEngineParams() {
        const attachment = findEngineAttachment();
        if (!attachment || !attachment.data) {
            return defaultEngineParams();
        }
        try {
            return normalizeEngineParams(JSON.parse(decodeText(attachment.data)));
        } catch (err) {
            return defaultEngineParams();
        }
    }

    function engineJson(params) {
        return JSON.stringify(normalizeEngineParams(params), null, 2);
    }

    function jsonTheme() {
        return document.documentElement.getAttribute("data-bs-theme") === "dark"
            ? "material-darker"
            : "default";
    }

    function teardownJsonPreview() {
        if (jsonPreviewEditor) {
            try {
                jsonPreviewEditor.toTextArea();
            } catch (ignored) {
                /* already detached */
            }
            jsonPreviewEditor = null;
        }
    }

    function showJsonPreview() {
        const textarea = document.getElementById("rsd-json-preview");
        if (!textarea) {
            return;
        }
        teardownJsonPreview();
        textarea.value = engineJson(formEngineParams());
        if (typeof CodeMirror === "undefined") {
            return;
        }
        jsonPreviewEditor = CodeMirror.fromTextArea(textarea, {
            mode: { name: "javascript", json: true },
            theme: jsonTheme(),
            lineNumbers: true,
            lineWrapping: false,
            readOnly: true,
            indentUnit: 2,
            tabSize: 2,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
        });
        jsonPreviewEditor.setSize("100%", "28rem");
        requestAnimationFrame(function () {
            if (jsonPreviewEditor) {
                jsonPreviewEditor.refresh();
            }
        });
    }

    function viewModal(id, title, body) {
        return '<div class="modal fade" id="' + id + '" tabindex="-1">' +
            '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header"><h5 class="modal-title">' + title + "</h5>" +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
                    '<div class="modal-body">' + body + "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>' +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function upsertEngineParams(params) {
        const attachment = {
            contentType: engineContentType,
            title: "Engine parameters",
            data: encodeText(engineJson(params))
        };
        library.content = library.content || [];
        let found = false;
        library.content = library.content.map(function (item) {
            if (!isEngineContent(item)) {
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

    function switchField(id, label) {
        return '<div class="form-check form-switch mb-3">' +
            '<input class="form-check-input" type="checkbox" role="switch" id="' + id + '">' +
            '<label class="form-check-label" for="' + id + '">' + label + "</label>" +
            "</div>";
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
        setMarkdownValue("rsd-description", library && library.description);
        setMarkdownValue("rsd-purpose", library && library.purpose);
        setMarkdownValue("rsd-usage", library && library.usage);
        setMarkdownValue("rsd-copyright", library && library.copyright);
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

    function destroyEditor() {
        destroyMarkdownEditors();
        teardownJsonPreview();
    }

    function formEngineParams() {
        const raw = $("#rsd-priority-threshold").val();
        return {
            evaluationPlan: $("#rsd-evaluation-plan").val() || "Default",
            skipOnFirstAppliedRule: $("#rsd-skip-applied").is(":checked"),
            skipOnFirstNonTriggeredRule: $("#rsd-skip-non-triggered").is(":checked"),
            skipOnFirstFailedRule: $("#rsd-skip-failed").is(":checked"),
            priorityThreshold: raw === "" ? INT32_MAX : Number(raw)
        };
    }

    function validateEngine(params) {
        if (params.evaluationPlan !== "Default" && params.evaluationPlan !== "Inference") {
            return "Evaluation Plan must be Default or Inference.";
        }
        if (!Number.isInteger(params.priorityThreshold)
                || params.priorityThreshold < INT32_MIN
                || params.priorityThreshold > INT32_MAX) {
            return "Priority threshold must be a 32-bit signed integer.";
        }
        return "";
    }

    function selectedDomainCoding() {
        return CadminApi.selectCoding("#rsd-domains");
    }

    function domainSnapshot() {
        const item = selectedDomainCoding();
        return item ? (item.system || "") + "|" + item.code : "";
    }

    function engineSnapshot() {
        return engineJson(formEngineParams());
    }

    function basicsSnapshot() {
        return [
            $("#rsd-title-input").val() || "",
            $("#rsd-status").val() || "",
            $("#rsd-experimental").is(":checked") ? "1" : "0",
            domainSnapshot(),
            markdownValue("rsd-description"),
            markdownValue("rsd-purpose"),
            markdownValue("rsd-usage"),
            markdownValue("rsd-copyright"),
            $("#rsd-url").val() || "",
            $("#rsd-name").val() || "",
            $("#rsd-version").val() || "",
            $("#rsd-publisher").val() || "",
            $("#rsd-date").val() || "",
            $("#rsd-approval").val() || "",
            $("#rsd-review").val() || "",
            $("#rsd-period-start").val() || "",
            $("#rsd-period-end").val() || ""
        ].join("\n");
    }

    function syncUnsavedFlag() {
        CadminApi.setUnsavedFlag(CadminWorkspace.root(),
            engineSnapshot() !== savedEngine || basicsSnapshot() !== savedBasics);
    }

    function markEngineClean() {
        savedEngine = engineSnapshot();
        syncUnsavedFlag();
    }

    function markBasicsClean() {
        savedBasics = basicsSnapshot();
        syncUnsavedFlag();
    }

    function fillEngineForm() {
        const params = readEngineParams();
        $("#rsd-evaluation-plan").val(params.evaluationPlan);
        $("#rsd-skip-applied").prop("checked", params.skipOnFirstAppliedRule);
        $("#rsd-skip-non-triggered").prop("checked", params.skipOnFirstNonTriggeredRule);
        $("#rsd-skip-failed").prop("checked", params.skipOnFirstFailedRule);
        $("#rsd-priority-threshold").val(String(params.priorityThreshold));
    }

    function applyMeta() {
        setOrDelete(library, "title", $("#rsd-title-input").val());
        library.status = $("#rsd-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Rule Set" }],
            text: libraryType
        };
        if ($("#rsd-experimental").is(":checked")) {
            library.experimental = true;
        } else {
            delete library.experimental;
        }
        const domain = selectedDomainCoding();
        CadminApi.applyLibraryDomainCodings(library, domain ? [domain] : []);
        setOrDelete(library, "description", htmlToMarkdown(markdownValue("rsd-description")));
        setOrDelete(library, "purpose", htmlToMarkdown(markdownValue("rsd-purpose")));
        setOrDelete(library, "usage", htmlToMarkdown(markdownValue("rsd-usage")));
        setOrDelete(library, "copyright", htmlToMarkdown(markdownValue("rsd-copyright")));
        setOrDelete(library, "url", $("#rsd-url").val());
        setOrDelete(library, "name", $("#rsd-name").val());
        setOrDelete(library, "version", $("#rsd-version").val());
        setOrDelete(library, "publisher", $("#rsd-publisher").val());
        setOrDelete(library, "date", $("#rsd-date").val());
        setOrDelete(library, "approvalDate", $("#rsd-approval").val());
        setOrDelete(library, "lastReviewDate", $("#rsd-review").val());
        const start = ($("#rsd-period-start").val() || "").trim();
        const end = ($("#rsd-period-end").val() || "").trim();
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
        const withEngine = opts.withEngine !== false;
        if (withMeta) {
            applyMeta();
        } else {
            library.type = {
                coding: [{ code: libraryType, display: "Rule Set" }],
                text: libraryType
            };
        }
        if (withEngine) {
            const params = formEngineParams();
            const problem = validateEngine(params);
            if (problem) {
                CadminApi.showToast("danger", problem);
                return;
            }
            upsertEngineParams(params);
        }
        CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "PUT", library).done(function (updated) {
            library = updated || library;
            renderHeader();
            if (withMeta) {
                fillBasicsForm();
                fillMarkdownFields();
                markBasicsClean();
            }
            if (withEngine) {
                fillEngineForm();
                markEngineClean();
            } else {
                syncUnsavedFlag();
            }
            CadminResourceSource.mount(function () { return library; });
            CadminResourceGraph.mount(library);
            CadminResourceHistory.mount(library);
            CadminLibraryRelated.mount(library);
            if (withMeta) {
                loadEasyRules(0);
            }
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update Rule set failed (" + xhr.status + ").");
        });
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
        if (CadminApi.isLibraryType(resource, "proto-spec")) {
            window.location.hash = "#/proto-specs/" + encodeURIComponent(resource.id);
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
        const label = esc(routeLabel());
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/rule-sets">' +
                        '<i class="bi bi-arrow-left me-1"></i>Rule Sets</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="rsd-title">' + label + "</h1>" +
                        '<span id="rsd-status-badge">' + statusBadge(library.status) + "</span>" +
                        (library.id
                            ? '<code class="small" id="rsd-fhir-id">' + esc(library.id) + "</code>"
                            : '<code class="small d-none" id="rsd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="rsd-settings-nav" role="tablist">' +
                        navButton("rsd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("rsd-pane-identity", "bi bi-person-vcard", "Identity and version") +
                        navButton("rsd-pane-details", "bi bi-journal-text", "Details") +
                        navButton("rsd-pane-engine", "bi bi-sliders", "Rule Set") +
                        navButton("rsd-pane-easy-rules", "bi bi-list-ul", "Easy Rules") +
                        navButton("rsd-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("rsd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("rsd-pane-history", "bi bi-clock-history", "History") +
                        navButton("rsd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("rsd-pane-basics",
                            '<form id="rsd-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="rsd-title-input">') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="rsd-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>"),
                                            field("Type",
                                                '<input class="form-control font-monospace" id="rsd-type" value="' +
                                                    esc(typeCode()) + '" readonly disabled>')) +
                                        fieldRow(
                                            '<div class="mb-3">' +
                                                '<label class="form-label d-none d-md-block">&nbsp;</label>' +
                                                '<div class="form-check d-flex align-items-center gap-2" ' +
                                                    'style="min-height:calc(1.5em + .75rem + 2px)">' +
                                                    '<input class="form-check-input" type="checkbox" id="rsd-experimental">' +
                                                    '<label class="form-check-label" for="rsd-experimental">Experimental</label>' +
                                                "</div>" +
                                            "</div>",
                                            field("Domain",
                                                '<select class="form-select" id="rsd-domains"></select>')) +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("rsd-pane-identity",
                            '<form id="rsd-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Identity and version</h3></div>' +
                                    '<div class="card-body">' +
                                        field("URL", '<input class="form-control font-monospace" id="rsd-url">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="rsd-name">'),
                                            field("Version", '<input class="form-control" id="rsd-version" autocomplete="off">')) +
                                        fieldRow(
                                            field("Publisher", '<input class="form-control" id="rsd-publisher">'),
                                            field("Date", '<input type="date" class="form-control" id="rsd-date">')) +
                                        fieldRow(
                                            field("Approved date", '<input type="date" class="form-control" id="rsd-approval">'),
                                            field("Last review date", '<input type="date" class="form-control" id="rsd-review">')) +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Effective date range</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="rsd-period-start" ' +
                                                        'aria-label="Effective start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="rsd-period-end" ' +
                                                        'aria-label="Effective end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("rsd-pane-details",
                            '<form id="rsd-details-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Details</h3></div>' +
                                    '<div class="card-body">' +
                                        markdownField("Description", "rsd-description") +
                                        markdownField("Purpose", "rsd-purpose") +
                                        markdownField("Usage", "rsd-usage") +
                                        markdownField("Copyright", "rsd-copyright") +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("rsd-pane-engine",
                            '<form id="rsd-engine-form">' +
                                '<div class="card">' +
                                    '<div class="card-header flex-wrap gap-2">' +
                                        "<div>" +
                                            '<h3 class="card-title mb-0">Engine parameters</h3>' +
                                            '<div class="small text-muted"><code>' + esc(engineContentType) + "</code></div>" +
                                        "</div>" +
                                        '<div class="card-tools d-flex flex-nowrap align-items-center gap-2">' +
                                            '<button class="btn btn-sm btn-outline-secondary" type="button" id="rsd-json-btn">' +
                                                '<i class="bi bi-braces me-1"></i>JSON</button>' +
                                            '<button class="btn btn-sm btn-primary" type="submit" id="rsd-save">' +
                                                '<i class="bi bi-check2 me-1"></i>Save</button>' +
                                        "</div>" +
                                    "</div>" +
                                    '<div class="card-body">' +
                                        field("Evaluation Plan",
                                            '<select class="form-select" id="rsd-evaluation-plan">' +
                                                optionsHtml(evaluationPlans, "Default") + "</select>") +
                                        switchField("rsd-skip-applied", "Skip on first applied rule") +
                                        switchField("rsd-skip-non-triggered", "Skip on first non-triggered rule") +
                                        switchField("rsd-skip-failed", "Skip on first failed rule") +
                                        field("Priority threshold",
                                            '<input class="form-control font-monospace" type="number" id="rsd-priority-threshold" ' +
                                                'min="' + INT32_MIN + '" max="' + INT32_MAX + '" step="1">',
                                            "32-bit signed integer. Default is " + INT32_MAX + ".") +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("rsd-pane-easy-rules", easyRulesPaneHtml()) +
                        tabPane("rsd-pane-related", CadminLibraryRelated.cards()) +
                        tabPane("rsd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("rsd-pane-history", CadminResourceHistory.card()) +
                        tabPane("rsd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this Rule set</p>' +
                                            '<small class="text-secondary">' +
                                                "This permanently deletes the Library that stores the engine parameters." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="rsd-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>" +
            viewModal("rsd-json-modal", "Engine parameters JSON",
                '<div class="yaml-preview-host">' +
                    '<textarea id="rsd-json-preview" class="form-control font-monospace" readonly></textarea>' +
                "</div>")
        );
        CadminResourceSource.mount(function () { return library; });
        CadminResourceGraph.mount(library);
        CadminResourceHistory.mount(library);
        CadminLibraryRelated.mount(library);
        renderHeader();
        fillBasicsForm();
        fillEngineForm();
        mountMarkdownEditors();
        fillMarkdownFields();
        markEngineClean();
        markBasicsClean();
        bind();
        loadEasyRules(0);
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        refreshMarkdownEditors();
        if (jsonPreviewEditor) {
            jsonPreviewEditor.refresh();
        }
        syncUnsavedFlag();
        loadEasyRules();
    }

    function renderHeader() {
        const label = routeLabel();
        $("#rsd-title").text(label);
        $("#rsd-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $("#rsd-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $("#rsd-fhir-id").text("").addClass("d-none");
        }
    }

    function bindDomainSelect() {
        const domains = CadminApi.libraryDomainCodings(library);
        CadminApi.bindConceptSelect("#rsd-domains", CadminApi.valueSets.easyRuleDomains, {
            placeholder: "Select domain…",
            preload: true,
            selected: domains.length ? domains[0] : null,
            onChange: syncUnsavedFlag
        });
    }

    function fillBasicsForm() {
        const period = library.effectivePeriod || {};
        $("#rsd-title-input").val(library.title || "");
        $("#rsd-status").val(library.status || "draft");
        $("#rsd-type").val(typeCode());
        $("#rsd-experimental").prop("checked", !!library.experimental);
        bindDomainSelect();
        $("#rsd-url").val(library.url || "");
        $("#rsd-name").val(library.name || "");
        $("#rsd-version").val(library.version || "");
        $("#rsd-publisher").val(library.publisher || "");
        $("#rsd-date").val(dateInputValue(library.date));
        $("#rsd-approval").val(dateInputValue(library.approvalDate));
        $("#rsd-review").val(dateInputValue(library.lastReviewDate));
        $("#rsd-period-start").val(dateInputValue(period.start));
        $("#rsd-period-end").val(dateInputValue(period.end));
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".rsdetail");
        $root.on("shown.bs.tab.rsdetail", "#rsd-pane-details-btn", refreshMarkdownEditors);
        $root.on("shown.bs.tab.rsdetail", "#rsd-pane-easy-rules-btn", function () {
            loadEasyRules();
        });
        $root.on("click.rsdetail", "#rsd-easy-rules-refresh", function () {
            loadEasyRules(0);
        });
        $root.on("shown.bs.tab.rsdetail", "#rsd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.rsdetail change.rsdetail",
            "#rsd-basic-form :input, #rsd-identity-form :input, #rsd-details-form :input, #rsd-engine-form :input",
            syncUnsavedFlag);
        CadminApi.fillValueSetSelect("#rsd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: library.status || "draft",
            onConcepts: function () {
                syncUnsavedFlag();
            }
        });
        $("#rsd-basic-form, #rsd-identity-form, #rsd-details-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Rule set updated.");
            }, { withMeta: true, withEngine: false });
        });
        $("#rsd-engine-form").on("submit", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Rule set saved.");
            }, { withMeta: false, withEngine: true });
        });
        $root.on("click.rsdetail", "#rsd-json-btn", function () {
            bootstrap.Modal.getOrCreateInstance(document.getElementById("rsd-json-modal")).show();
        });
        $root.on("shown.bs.modal.rsdetail", "#rsd-json-modal", showJsonPreview);
        $root.on("hidden.bs.modal.rsdetail", "#rsd-json-modal", teardownJsonPreview);
        $root.on("click.rsdetail", "#rsd-delete", function () {
            CadminApi.confirm("Delete this Rule set?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    destroyEditor();
                    CadminApi.showToast("success", "Rule set deleted.");
                    window.location.hash = "#/rule-sets";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete Rule set failed (" + xhr.status + ").");
                });
            });
        });
    }

    return {
        render: render,
        reveal: reveal
    };
}());
