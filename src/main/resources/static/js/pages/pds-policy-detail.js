window.CadminPdsPolicyDetail = (function () {
    const libraryType = "pds-policies";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const applyOptions = [
        { code: "deny-overrides", display: "Deny overrides" },
        { code: "permit-overrides", display: "Permit overrides" },
        { code: "first-permit-or-deny", display: "First permit or deny" }
    ];
    const outcomeOptions = [
        { code: "indeterminate", display: "Indeterminate" },
        { code: "permit", display: "Permit" },
        { code: "deny", display: "Deny" }
    ];
    const policyContentType = "application/x-policy+x-yaml";
    const contentTypes = [
        { code: "text/plain", display: "Plain text" },
        { code: "application/json", display: "JSON" },
        { code: "application/xml", display: "XML" },
        { code: "text/cql", display: "CQL" },
        { code: "text/markdown", display: "Markdown" }
    ];
    let library = null;
    let otherPolicies = [];
    let targetEditor = null;
    let savedPolicy = "";
    let yamlPreviewEditor = null;
    let springElModeDefined = false;

    const spelKeywords = {
        "true": true,
        "false": true,
        "null": true,
        "new": true,
        "instanceof": true,
        "matches": true,
        "between": true,
        "and": true,
        "or": true,
        "not": true,
        "eq": true,
        "ne": true,
        "lt": true,
        "le": true,
        "gt": true,
        "ge": true
    };

    function defineSpringElMode() {
        if (typeof CodeMirror === "undefined" || springElModeDefined) {
            return;
        }
        springElModeDefined = true;
        CodeMirror.defineMode("springel", function () {
            function tokenString(quote) {
                return function (stream, state) {
                    let escaped = false;
                    let next;
                    while ((next = stream.next()) != null) {
                        if (quote === "'" && next === "'" && stream.peek() === "'") {
                            stream.next();
                            continue;
                        }
                        if (next === quote && !escaped) {
                            state.tokenize = tokenBase;
                            break;
                        }
                        escaped = quote === '"' && !escaped && next === "\\";
                    }
                    return "string";
                };
            }

            function tokenBase(stream, state) {
                if (stream.eatSpace()) {
                    return null;
                }
                const ch = stream.next();
                if (ch === "'" || ch === '"') {
                    state.tokenize = tokenString(ch);
                    return state.tokenize(stream, state);
                }
                if (ch === "/" && stream.eat("/")) {
                    stream.skipToEnd();
                    return "comment";
                }
                if (/\d/.test(ch)) {
                    if (ch === "0" && stream.eat(/[xX]/)) {
                        stream.eatWhile(/[0-9a-fA-F]/);
                        return "number";
                    }
                    stream.eatWhile(/\d/);
                    if (stream.peek() === ".") {
                        stream.next();
                        if (!stream.eatWhile(/\d/)) {
                            stream.backUp(1);
                        }
                    }
                    stream.match(/^[eE][+-]?\d+/);
                    stream.eat(/[lLfFdD]/);
                    return "number";
                }
                if (ch === "#") {
                    if (stream.match(/^[A-Za-z_][\w$]*/) || stream.eat("{")) {
                        return "variable-2";
                    }
                    return "operator";
                }
                if (ch === "@") {
                    stream.match(/^[A-Za-z_][\w$]*/);
                    return "atom";
                }
                if (ch === "T" && stream.peek() === "(") {
                    return "builtin";
                }
                if (ch === "?" && /[:.]/.test(stream.peek() || "")) {
                    stream.next();
                    return "operator";
                }
                if ((ch === "!" || ch === "^" || ch === "$") && stream.peek() === "[") {
                    return "operator";
                }
                if ((ch === "=" || ch === "!" || ch === "<" || ch === ">") && stream.peek() === "=") {
                    stream.next();
                    return "operator";
                }
                if (ch === "&" && stream.peek() === "&") {
                    stream.next();
                    return "operator";
                }
                if (ch === "|" && stream.peek() === "|") {
                    stream.next();
                    return "operator";
                }
                if ("()[]{}".indexOf(ch) >= 0) {
                    return "bracket";
                }
                if ("+-*/%^=!<>&|?:.,;$".indexOf(ch) >= 0) {
                    return "operator";
                }
                stream.backUp(1);
                const word = stream.match(/^[A-Za-z_$][\w$]*/);
                if (word) {
                    return spelKeywords[word[0]] ? "keyword" : "variable";
                }
                stream.next();
                return null;
            }

            return {
                startState: function () {
                    return { tokenize: tokenBase };
                },
                token: function (stream, state) {
                    return state.tokenize(stream, state);
                },
                lineComment: "//"
            };
        });
        CodeMirror.defineMIME("text/x-springel", "springel");
    }

    function spelStringMask(text) {
        const mask = [];
        let i = 0;
        while (i < text.length) {
            const ch = text.charAt(i);
            if (ch === "'" || ch === '"') {
                const quote = ch;
                mask[i] = false;
                i += 1;
                while (i < text.length) {
                    if (quote === "'" && text.charAt(i) === "'" && text.charAt(i + 1) === "'") {
                        mask[i] = true;
                        mask[i + 1] = true;
                        i += 2;
                        continue;
                    }
                    if (quote === '"' && text.charAt(i) === "\\") {
                        mask[i] = true;
                        i += 1;
                        if (i < text.length) {
                            mask[i] = true;
                            i += 1;
                        }
                        continue;
                    }
                    if (text.charAt(i) === quote) {
                        mask[i] = false;
                        i += 1;
                        break;
                    }
                    mask[i] = true;
                    i += 1;
                }
                continue;
            }
            mask[i] = false;
            i += 1;
        }
        return mask;
    }

    function currentParameterRange(text, index) {
        if (!text || index < 0 || index > text.length) {
            return null;
        }
        const inString = spelStringMask(text);
        if (index < inString.length && inString[index]) {
            return null;
        }
        const pairs = { "(": ")", "[": "]", "{": "}" };
        const closers = { ")": "(", "]": "[", "}": "{" };
        let openPos = -1;
        let opener = "";
        let depth = 0;
        for (let i = index - 1; i >= 0; i -= 1) {
            if (inString[i]) {
                continue;
            }
            const ch = text.charAt(i);
            if (closers[ch]) {
                depth += 1;
            } else if (pairs[ch]) {
                if (depth === 0) {
                    openPos = i;
                    opener = ch;
                    break;
                }
                depth -= 1;
            }
        }
        if (openPos < 0) {
            return null;
        }
        const closer = pairs[opener];
        depth = 0;
        let closePos = -1;
        for (let i = openPos + 1; i < text.length; i += 1) {
            if (inString[i]) {
                continue;
            }
            const ch = text.charAt(i);
            if (ch === opener) {
                depth += 1;
            } else if (ch === closer) {
                if (depth === 0) {
                    closePos = i;
                    break;
                }
                depth -= 1;
            }
        }
        if (index === openPos || (closePos >= 0 && index === closePos)) {
            return { open: openPos, close: closePos, arg: null };
        }
        if (closePos < 0 && index < openPos) {
            return null;
        }
        const endLimit = closePos >= 0 ? closePos : text.length;
        const args = [];
        let start = openPos + 1;
        depth = 0;
        for (let i = openPos + 1; i < endLimit; i += 1) {
            if (inString[i]) {
                continue;
            }
            const ch = text.charAt(i);
            if (pairs[ch]) {
                depth += 1;
            } else if (closers[ch]) {
                depth -= 1;
            } else if (ch === "," && depth === 0) {
                args.push({ start: start, end: i });
                start = i + 1;
            }
        }
        args.push({ start: start, end: endLimit });
        let arg = null;
        args.forEach(function (item) {
            if (index >= item.start && index <= item.end) {
                arg = item;
            }
        });
        return { open: openPos, close: closePos, arg: arg };
    }

    function trimParameterArg(text, arg) {
        if (!arg) {
            return null;
        }
        let start = arg.start;
        let end = arg.end;
        while (start < end && /\s/.test(text.charAt(start))) {
            start += 1;
        }
        while (end > start && /\s/.test(text.charAt(end - 1))) {
            end -= 1;
        }
        if (end <= start) {
            return null;
        }
        return { start: start, end: end };
    }

    function bindParameterMatch(cm) {
        let marks = [];
        function clearMarks() {
            marks.forEach(function (mark) { mark.clear(); });
            marks = [];
        }
        function refreshMarks() {
            clearMarks();
            const text = cm.getValue();
            const range = currentParameterRange(text, cm.indexFromPos(cm.getCursor()));
            if (!range) {
                return;
            }
            function pos(index) {
                return cm.posFromIndex(index);
            }
            marks.push(cm.markText(pos(range.open), pos(range.open + 1), {
                className: "spel-param-bracket",
                inclusiveLeft: false,
                inclusiveRight: false
            }));
            if (range.close >= 0) {
                marks.push(cm.markText(pos(range.close), pos(range.close + 1), {
                    className: "spel-param-bracket",
                    inclusiveLeft: false,
                    inclusiveRight: false
                }));
            }
            const arg = trimParameterArg(text, range.arg);
            if (arg) {
                marks.push(cm.markText(pos(arg.start), pos(arg.end), {
                    className: "spel-current-param",
                    inclusiveLeft: false,
                    inclusiveRight: false
                }));
            }
        }
        cm.on("cursorActivity", refreshMarks);
        cm.on("changes", function () {
            refreshMarks();
            syncUnsavedFlag();
        });
        refreshMarks();
    }

    function attachSpelEditor(textarea, minHeight) {
        if (typeof CodeMirror === "undefined" || !textarea) {
            return null;
        }
        defineSpringElMode();
        const cm = CodeMirror.fromTextArea(textarea, {
            mode: "springel",
            theme: "default",
            lineWrapping: true,
            viewportMargin: Infinity,
            matchBrackets: true,
            highlightSelectionMatches: {
                minChars: 2,
                delay: 80,
                wordsOnly: false,
                showToken: /[#@A-Za-z0-9_$]/,
                trim: true
            },
            extraKeys: { Tab: false, "Shift-Tab": false }
        });
        if (minHeight) {
            cm.getWrapperElement().style.minHeight = minHeight;
        }
        bindParameterMatch(cm);
        if (window.CadminSpelPolicyCompletion) {
            CadminSpelPolicyCompletion.attach(cm);
        }
        requestAnimationFrame(function () {
            cm.refresh();
        });
        return cm;
    }

    function teardownCm($el) {
        const cm = $el.data("cm");
        if (cm) {
            cm.toTextArea();
            $el.removeData("cm");
        }
    }

    function teardownSpelEditors() {
        teardownYamlPreview();
        if (targetEditor) {
            targetEditor.toTextArea();
            targetEditor = null;
        }
        $("#pd-policy-ontarget .pd-ontarget-row, #pd-policy-rules .pd-spel-row, #pd-policy-rules .spel-host").each(function () {
            teardownCm($(this));
        });
    }

    function attachOnTargetEditor($row) {
        const textarea = $row.find("textarea.pd-ontarget-value, textarea.pd-spel-value")[0];
        const cm = attachSpelEditor(textarea, "3.5rem");
        if (cm) {
            $row.data("cm", cm);
        }
    }

    function esc(value) {
        return CadminApi.escapeHtml(value);
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

    function statusLabel(code) {
        const match = statusOptions.find(function (option) { return option.code === code; });
        return match ? match.display : (code || "—");
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success" : status === "retired" ? "secondary" : status === "draft" ? "warning" : "info";
        return '<span class="badge text-bg-' + kind + '">' + esc(statusLabel(status)) + "</span>";
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
    }

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const mark = item.code === selected ? " selected" : "";
            return '<option value="' + esc(item.code) + '"' + mark + ">" + esc(item.display) + "</option>";
        }).join("");
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

    function fieldRow(left, right) {
        return '<div class="row">' +
            '<div class="col-md-6">' + left + "</div>" +
            '<div class="col-md-6">' + right + "</div>" +
            "</div>";
    }

    function dateInputValue(value) {
        return String(value || "").slice(0, 10);
    }

    function typeCode() {
        const coding = ((library && library.type && library.type.coding) || []).find(function (item) {
            return item && item.code;
        });
        return (coding && coding.code) || libraryType;
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function alertMsg(type, message) {
        CadminApi.showToast(type, message);
    }

    function fail(action, xhr) {
        alertMsg("danger", action + " failed (" + xhr.status + ").");
    }

    function card(title, tableId, cols, addTarget, addLabel) {
        return '<div class="card mb-3">' +
            '<div class="card-header">' +
                '<h3 class="card-title">' + title + "</h3>" +
                '<div class="card-tools">' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="' +
                        addTarget + '"><i class="bi bi-plus-lg me-1"></i>' + addLabel + "</button>" +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr>" + cols.map(function (col) { return "<th>" + col + "</th>"; }).join("") + "</tr></thead>" +
                        '<tbody id="' + tableId + '">' + emptyRow(cols.length, "None") + "</tbody>" +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function modal(id, title, body, formId, large) {
        return '<div class="modal fade" id="' + id + '" tabindex="-1">' +
            '<div class="modal-dialog' + (large ? " modal-lg" : "") + '">' +
                '<form class="modal-content" id="' + formId + '">' +
                    '<div class="modal-header"><h5 class="modal-title">' + title + "</h5>" +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' + body + "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>";
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

    function field(label, control) {
        return '<div class="mb-3"><label class="form-label">' + label + "</label>" + control + "</div>";
    }

    function setOrDelete(obj, key, value) {
        if (value) {
            obj[key] = value;
        } else {
            delete obj[key];
        }
    }

    function yamlScalar(value, indent) {
        const text = value == null ? "" : String(value);
        const pad = indent || "";
        if (text === "") {
            return '""';
        }
        if (/[\n\r]/.test(text)) {
            return "|\n" + text.split(/\r?\n/).map(function (line) {
                return pad + "  " + line;
            }).join("\n");
        }
        if (/[:#\[\]{}&*!|>'"%@`]/.test(text)
                || /^\s|\s$/.test(text)
                || /^(true|false|null|yes|no|on|off)$/i.test(text)
                || (/^[-+]?[0-9]/.test(text) && !isNaN(text))) {
            return JSON.stringify(text);
        }
        return text;
    }

    function unquoteYaml(value) {
        const text = (value || "").trim();
        if ((text.charAt(0) === '"' && text.charAt(text.length - 1) === '"')
                || (text.charAt(0) === "'" && text.charAt(text.length - 1) === "'")) {
            try {
                if (text.charAt(0) === '"') {
                    return JSON.parse(text);
                }
                return text.slice(1, -1);
            } catch (err) {
                return text.slice(1, -1);
            }
        }
        return text;
    }

    function emptyRule() {
        return {
            id: "",
            description: "",
            target: "",
            onTarget: [],
            when: "",
            outcome: "indeterminate",
            otherwise: "indeterminate",
            onPermit: [],
            onDeny: []
        };
    }

    function normalizeOutcome(value) {
        const code = String(value || "indeterminate").trim();
        return outcomeOptions.some(function (option) { return option.code === code; })
            ? code
            : "indeterminate";
    }

    function dumpStatementList(key, items, indent) {
        const list = (items || []).filter(Boolean);
        if (!list.length) {
            return "";
        }
        let yaml = indent + key + ":\n";
        list.forEach(function (statement) {
            yaml += indent + "  - " + JSON.stringify(String(statement)) + "\n";
        });
        return yaml;
    }

    function dumpRuleYaml(rule) {
        const indent = "    ";
        let yaml = "  - id: " + yamlScalar(rule.id || "") + "\n";
        yaml += indent + "description: " + yamlScalar(rule.description || "", indent) + "\n";
        yaml += indent + "target: " + yamlScalar(rule.target || "", indent) + "\n";
        yaml += dumpStatementList("onTarget", rule.onTarget, indent);
        yaml += indent + "when: " + yamlScalar(rule.when || "", indent) + "\n";
        const outcome = normalizeOutcome(rule.outcome);
        if (outcome !== "indeterminate") {
            yaml += indent + "outcome: " + yamlScalar(outcome) + "\n";
        }
        const otherwise = normalizeOutcome(rule.otherwise);
        if (otherwise !== "indeterminate") {
            yaml += indent + "otherwise: " + yamlScalar(otherwise) + "\n";
        }
        yaml += dumpStatementList("onPermit", rule.onPermit, indent);
        yaml += dumpStatementList("onDeny", rule.onDeny, indent);
        return yaml;
    }

    function dumpPolicyYaml(policy) {
        const imports = (policy.imports || []).filter(Boolean);
        const onTarget = (policy.onTarget || []).filter(Boolean);
        const rules = (policy.rules || []).filter(function (rule) {
            return rule && (rule.id || rule.description || rule.target || rule.when
                || (rule.onTarget && rule.onTarget.length)
                || (rule.onPermit && rule.onPermit.length)
                || (rule.onDeny && rule.onDeny.length)
                || normalizeOutcome(rule.outcome) !== "indeterminate"
                || normalizeOutcome(rule.otherwise) !== "indeterminate");
        });
        let yaml = "id: " + yamlScalar(policy.id) + "\n";
        yaml += "description: " + yamlScalar(policy.description || "") + "\n";
        yaml += "version: " + yamlScalar(policy.version || "") + "\n";
        yaml += "status: " + yamlScalar(policy.status || "draft") + "\n";
        if (!imports.length) {
            yaml += "imports: []\n";
        } else {
            yaml += "imports:\n";
            imports.forEach(function (id) {
                yaml += "  - " + JSON.stringify(String(id)) + "\n";
            });
        }
        yaml += "target: " + yamlScalar(policy.target || "") + "\n";
        yaml += "apply: " + yamlScalar(policy.apply || "deny-overrides") + "\n";
        if (!onTarget.length) {
            yaml += "onTarget: []\n";
        } else {
            yaml += "onTarget:\n";
            onTarget.forEach(function (statement) {
                yaml += "  - " + JSON.stringify(String(statement)) + "\n";
            });
        }
        if (rules.length) {
            yaml += "rules:\n";
            rules.forEach(function (rule) {
                yaml += dumpRuleYaml(rule);
            });
        }
        return yaml;
    }

    function parseInlineList(raw) {
        const inner = String(raw || "").trim();
        if (inner.charAt(0) !== "[" || inner.charAt(inner.length - 1) !== "]") {
            return [];
        }
        const body = inner.slice(1, -1).trim();
        if (!body) {
            return [];
        }
        return body.split(",").map(function (item) {
            return unquoteYaml(item);
        }).filter(Boolean);
    }

    function parseYamlList(text, key) {
        const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
        const items = [];
        let inList = false;
        const keyPattern = new RegExp("^" + key + "\\s*:");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (keyPattern.test(line)) {
                inList = true;
                items.length = 0;
                const rest = line.replace(keyPattern, "").replace(/^\s*/, "").trim();
                if (rest === "[]") {
                    return [];
                }
                if (rest.charAt(0) === "[" && rest.charAt(rest.length - 1) === "]") {
                    return parseInlineList(rest);
                }
                continue;
            }
            if (!inList) {
                continue;
            }
            if (/^[A-Za-z][A-Za-z0-9_-]*\s*:/.test(line)) {
                break;
            }
            const item = line.match(/^[ \t]*-[ \t]+(.*)$/);
            if (item) {
                const value = unquoteYaml(item[1]);
                if (value && value !== "[]") {
                    items.push(value);
                }
            }
        }
        return items;
    }

    function lineIndent(line) {
        const match = String(line || "").match(/^[ \t]*/);
        return match ? match[0].length : 0;
    }

    function applyRuleField(rule, key, value) {
        if (key === "onTarget" || key === "onPermit" || key === "onDeny") {
            rule[key] = Array.isArray(value) ? value.filter(Boolean) : [];
            return;
        }
        if (key === "outcome" || key === "otherwise") {
            rule[key] = normalizeOutcome(value);
            return;
        }
        if (key === "id" || key === "description" || key === "target" || key === "when") {
            rule[key] = value == null ? "" : String(value);
        }
    }

    function parseRulesYaml(text) {
        const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
        let start = -1;
        for (let i = 0; i < lines.length; i += 1) {
            const match = lines[i].match(/^rules\s*:\s*(.*)$/);
            if (!match) {
                continue;
            }
            const rest = match[1].trim();
            if (rest === "[]") {
                return [];
            }
            if (rest.charAt(0) === "[" && rest.charAt(rest.length - 1) === "]") {
                return [];
            }
            start = i + 1;
            break;
        }
        if (start < 0) {
            return [];
        }
        const rules = [];
        let current = null;
        let listKey = "";
        let blockKey = "";
        let blockLines = [];
        let blockIndent = 0;

        function finishBlock() {
            if (!current || !blockKey) {
                return;
            }
            applyRuleField(current, blockKey, blockLines.join("\n").replace(/\n+$/, ""));
            blockKey = "";
            blockLines = [];
        }

        function finishList() {
            listKey = "";
        }

        for (let i = start; i < lines.length; i += 1) {
            const line = lines[i];
            if (/^[A-Za-z]/.test(line)) {
                break;
            }
            if (blockKey) {
                if (line === "" || lineIndent(line) > blockIndent) {
                    const strip = blockIndent + 2;
                    blockLines.push(line.length >= strip ? line.slice(strip) : line.replace(/^\s*/, ""));
                    continue;
                }
                finishBlock();
            }
            const itemStart = line.match(/^(\s*)-\s+(.*)$/);
            if (itemStart && itemStart[1].length <= 2) {
                finishList();
                current = emptyRule();
                rules.push(current);
                const rest = itemStart[2].trim();
                if (rest) {
                    const first = rest.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
                    if (first) {
                        applyRuleField(current, first[1], unquoteYaml(first[2]));
                    }
                }
                continue;
            }
            if (!current) {
                continue;
            }
            const prop = line.match(/^(\s+)([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
            if (prop && prop[1].length >= 4 && prop[1].length <= 5) {
                finishList();
                const key = prop[2];
                const rest = prop[3].trim();
                if (key === "onTarget" || key === "onPermit" || key === "onDeny") {
                    listKey = key;
                    current[key] = [];
                    if (rest === "[]") {
                        listKey = "";
                    } else if (rest.charAt(0) === "[" && rest.charAt(rest.length - 1) === "]") {
                        current[key] = parseInlineList(rest);
                        listKey = "";
                    }
                    continue;
                }
                if (rest === "|" || rest === ">" || rest === "|-" || rest === "|+") {
                    blockKey = key;
                    blockIndent = prop[1].length;
                    blockLines = [];
                    continue;
                }
                applyRuleField(current, key, unquoteYaml(rest));
                continue;
            }
            if (listKey) {
                const item = line.match(/^\s+-\s+(.*)$/);
                if (item) {
                    const value = unquoteYaml(item[1]);
                    if (value) {
                        current[listKey].push(value);
                    }
                }
            }
        }
        finishBlock();
        return rules;
    }

    function parsePolicyYaml(text) {
        const result = {
            id: "",
            description: "",
            version: "",
            status: "draft",
            imports: [],
            target: "",
            apply: "deny-overrides",
            onTarget: [],
            rules: []
        };
        if (!text || !String(text).trim()) {
            return result;
        }
        const lines = String(text).replace(/\r\n/g, "\n").split("\n");
        let inBlock = false;
        let blockKey = "";
        let blockLines = [];

        function finishBlock() {
            if (inBlock) {
                result[blockKey] = blockLines.join("\n").replace(/\n+$/, "");
                inBlock = false;
                blockLines = [];
            }
        }

        lines.forEach(function (line) {
            if (inBlock) {
                if (line.indexOf("  ") === 0 || line === "") {
                    blockLines.push(line.indexOf("  ") === 0 ? line.slice(2) : line);
                    return;
                }
                finishBlock();
            }
            const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
            if (!keyMatch) {
                return;
            }
            const key = keyMatch[1];
            const rest = keyMatch[2];
            if (key === "imports" || key === "onTarget" || key === "rules") {
                return;
            }
            if (rest === "|" || rest === ">" || rest === "|-" || rest === "|+") {
                inBlock = true;
                blockKey = key;
                blockLines = [];
                return;
            }
            if (key === "id" || key === "description" || key === "version" || key === "status"
                    || key === "target" || key === "apply") {
                result[key] = unquoteYaml(rest);
            }
        });
        finishBlock();
        result.imports = parseYamlList(text, "imports");
        result.onTarget = parseYamlList(text, "onTarget");
        result.rules = parseRulesYaml(text);
        return result;
    }

    function isPolicyYaml(item) {
        const type = ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
        return type === policyContentType;
    }

    function findPolicyAttachment() {
        return (library.content || []).find(isPolicyYaml);
    }

    function readPolicyDocument() {
        const attachment = findPolicyAttachment();
        const parsed = attachment && attachment.data ? parsePolicyYaml(decodeText(attachment.data)) : {};
        const imports = Array.isArray(parsed.imports) ? parsed.imports.filter(Boolean) : [];
        const onTarget = Array.isArray(parsed.onTarget) ? parsed.onTarget.filter(Boolean) : [];
        const rules = Array.isArray(parsed.rules) ? parsed.rules.map(function (rule) {
            return Object.assign(emptyRule(), rule, {
                onTarget: Array.isArray(rule.onTarget) ? rule.onTarget.filter(Boolean) : [],
                onPermit: Array.isArray(rule.onPermit) ? rule.onPermit.filter(Boolean) : [],
                onDeny: Array.isArray(rule.onDeny) ? rule.onDeny.filter(Boolean) : [],
                outcome: normalizeOutcome(rule.outcome),
                otherwise: normalizeOutcome(rule.otherwise)
            });
        }) : [];
        return {
            id: parsed.id || library.name || "",
            description: parsed.description || library.description || "",
            version: parsed.version || library.version || "",
            status: parsed.status || library.status || "draft",
            imports: imports,
            target: parsed.target || "",
            apply: parsed.apply || "deny-overrides",
            onTarget: onTarget,
            rules: rules
        };
    }

    function upsertPolicyYaml(policy) {
        const yaml = dumpPolicyYaml(policy);
        const attachment = {
            contentType: policyContentType,
            title: "Policy",
            data: encodeText(yaml)
        };
        library.content = library.content || [];
        let found = false;
        library.content = library.content.map(function (item) {
            if (!isPolicyYaml(item)) {
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

    function applyPolicyDocument(policy) {
        setOrDelete(library, "name", policy.id);
        setOrDelete(library, "description", policy.description);
        setOrDelete(library, "version", policy.version);
        library.status = policy.status || "draft";
        upsertPolicyYaml(policy);
    }

    function syncYamlFromLibraryIfPresent() {
        if (!findPolicyAttachment()) {
            return;
        }
        const current = readPolicyDocument();
        current.id = library.name || current.id;
        current.description = library.description || "";
        current.version = library.version || "";
        current.status = library.status || "draft";
        upsertPolicyYaml(current);
    }

    function importOptionHtml(selected) {
        const names = {};
        let html = '<option value="">Select a policy…</option>';
        otherPolicies.forEach(function (policy) {
            names[policy.name] = true;
            const label = policy.title && policy.title !== policy.name
                ? policy.name + " — " + policy.title
                : policy.name;
            html += '<option value="' + esc(policy.name) + '"' +
                (policy.name === selected ? " selected" : "") + ">" + esc(label) + "</option>";
        });
        if (selected && !names[selected]) {
            html += '<option value="' + esc(selected) + '" selected>' + esc(selected) + "</option>";
        }
        if (!otherPolicies.length && !selected) {
            html += '<option value="" disabled>No other named policies</option>';
        }
        return html;
    }

    function importRowHtml(value) {
        return '<div class="input-group mb-2 pd-import-row">' +
            '<select class="form-select font-monospace pd-import-value">' + importOptionHtml(value) + "</select>" +
            '<button class="btn btn-outline-danger" type="button" data-import-remove title="Remove import">' +
                '<i class="bi bi-x-lg"></i></button>' +
            "</div>";
    }

    function collectImports(excludeId) {
        const imports = [];
        const seen = {};
        $("#pd-policy-imports .pd-import-value").each(function () {
            const value = ($(this).val() || "").trim();
            if (!value || value === excludeId || seen[value]) {
                return;
            }
            seen[value] = true;
            imports.push(value);
        });
        return imports;
    }

    function onTargetRowHtml(value) {
        return '<div class="d-flex align-items-stretch gap-2 mb-2 pd-ontarget-row">' +
            '<div class="spel-host flex-grow-1 min-w-0">' +
                '<textarea class="form-control font-monospace pd-ontarget-value" rows="2" placeholder="SpringEL statement">' +
                    esc(value || "") + "</textarea>" +
            "</div>" +
            '<button class="btn btn-outline-danger align-self-start" type="button" data-ontarget-remove title="Remove statement">' +
                '<i class="bi bi-x-lg"></i></button>' +
            "</div>";
    }

    function collectOnTarget() {
        const statements = [];
        $("#pd-policy-ontarget .pd-ontarget-row").each(function () {
            const cm = $(this).data("cm");
            const value = (cm ? cm.getValue() : ($(this).find(".pd-ontarget-value").val() || "")).trim();
            if (value) {
                statements.push(value);
            }
        });
        return statements;
    }

    function collectSpelList($container) {
        const statements = [];
        $container.find(".pd-spel-row").each(function () {
            const cm = $(this).data("cm");
            const value = (cm ? cm.getValue() : ($(this).find(".pd-spel-value").val() || "")).trim();
            if (value) {
                statements.push(value);
            }
        });
        return statements;
    }

    function spelFieldValue($textarea) {
        const $host = $textarea.closest(".spel-host");
        const cm = $host.data("cm");
        return (cm ? cm.getValue() : ($textarea.val() || "")).trim();
    }

    function collectRule($card) {
        return {
            id: ($card.find(".pd-rule-id").val() || "").trim(),
            description: ($card.find(".pd-rule-description").val() || "").trim(),
            target: spelFieldValue($card.find("textarea.pd-rule-target")),
            onTarget: collectSpelList($card.find(".pd-rule-ontarget")),
            when: spelFieldValue($card.find("textarea.pd-rule-when")),
            outcome: normalizeOutcome($card.find(".pd-rule-outcome").val()),
            otherwise: normalizeOutcome($card.find(".pd-rule-otherwise").val()),
            onPermit: collectSpelList($card.find(".pd-rule-onpermit")),
            onDeny: collectSpelList($card.find(".pd-rule-ondeny"))
        };
    }

    function collectRules() {
        const rules = [];
        $("#pd-policy-rules .pd-rule-card").each(function () {
            rules.push(collectRule($(this)));
        });
        return rules;
    }

    function outcomeSelectHtml(className, selected) {
        const value = normalizeOutcome(selected);
        return '<select class="form-select ' + className + '">' +
            outcomeOptions.map(function (option) {
                return '<option value="' + esc(option.code) + '"' +
                    (option.code === value ? " selected" : "") + ">" +
                    esc(option.display) + "</option>";
            }).join("") +
            "</select>";
    }

    function spelListRowHtml(value) {
        return '<div class="d-flex align-items-stretch gap-2 mb-2 pd-spel-row">' +
            '<div class="spel-host flex-grow-1 min-w-0">' +
                '<textarea class="form-control font-monospace pd-spel-value" rows="2" placeholder="SpringEL statement">' +
                    esc(value || "") + "</textarea>" +
            "</div>" +
            '<button class="btn btn-outline-danger align-self-start" type="button" data-spel-remove title="Remove statement">' +
                '<i class="bi bi-x-lg"></i></button>' +
            "</div>";
    }

    function ruleStatementListHtml(label, listClass, listKey, statements) {
        const rows = (statements || []).length
            ? statements.map(spelListRowHtml).join("")
            : '<div class="text-muted small pd-spel-empty">None.</div>';
        return '<div class="mb-3">' +
            '<div class="d-flex justify-content-between align-items-center mb-2">' +
                '<label class="form-label mb-0">' + label + "</label>" +
                '<button class="btn btn-sm btn-outline-primary" type="button" data-rule-list-add="' + listKey + '">' +
                    '<i class="bi bi-plus-lg me-1"></i>Add statement</button>' +
            "</div>" +
            '<div class="' + listClass + '">' + rows + "</div>" +
        "</div>";
    }

    function nextRuleId() {
        const used = {};
        $("#pd-policy-rules .pd-rule-id").each(function () {
            used[($(this).val() || "").trim()] = true;
        });
        let n = 1;
        while (used["rule-" + n]) {
            n += 1;
        }
        return "rule-" + n;
    }

    function ruleCardHtml(rule) {
        const item = Object.assign(emptyRule(), rule || {});
        return '<div class="card card-primary card-outline mb-3 pd-rule-card">' +
            '<div class="card-header">' +
                '<h3 class="card-title">Rule</h3>' +
                '<div class="card-tools">' +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-rule-remove title="Remove rule">' +
                        '<i class="bi bi-trash"></i></button>' +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="row">' +
                    '<div class="col-md-4">' +
                        field("ID", '<input class="form-control font-monospace pd-rule-id" placeholder="Unique within this policy" value="' +
                            esc(item.id) + '">') +
                    "</div>" +
                    '<div class="col-md-8">' +
                        field("Description", '<input class="form-control pd-rule-description" value="' +
                            esc(item.description) + '">') +
                    "</div>" +
                "</div>" +
                field("Target", '<div class="spel-host">' +
                    '<textarea class="form-control font-monospace pd-rule-target" rows="2" placeholder="SpringEL predicate">' +
                        esc(item.target) + "</textarea></div>" +
                    '<div class="form-text">If this predicate is true, the rule is evaluated.</div>') +
                ruleStatementListHtml("On target", "pd-rule-ontarget", "ontarget", item.onTarget) +
                field("When", '<div class="spel-host">' +
                    '<textarea class="form-control font-monospace pd-rule-when" rows="2" placeholder="SpringEL rule logic">' +
                        esc(item.when) + "</textarea></div>" +
                    '<div class="form-text">Rule logic evaluated when the rule target is true.</div>') +
                '<div class="row">' +
                    '<div class="col-md-6">' +
                        field("Outcome", outcomeSelectHtml("pd-rule-outcome", item.outcome) +
                            '<div class="form-text">Result when <code>when</code> is true. Indeterminate is omitted from YAML.</div>') +
                    "</div>" +
                    '<div class="col-md-6">' +
                        field("Otherwise", outcomeSelectHtml("pd-rule-otherwise", item.otherwise) +
                            '<div class="form-text">Result when <code>when</code> is false. Indeterminate is omitted from YAML.</div>') +
                    "</div>" +
                "</div>" +
                ruleStatementListHtml("On permit", "pd-rule-onpermit", "onpermit", item.onPermit) +
                ruleStatementListHtml("On deny", "pd-rule-ondeny", "ondeny", item.onDeny) +
            "</div>" +
        "</div>";
    }

    function attachRuleEditors($card) {
        $card.find("textarea.pd-rule-target, textarea.pd-rule-when").each(function () {
            const cm = attachSpelEditor(this, "3.5rem");
            if (cm) {
                $(this).closest(".spel-host").data("cm", cm);
            }
        });
        $card.find(".pd-spel-row").each(function () {
            attachOnTargetEditor($(this));
        });
    }

    function renderRules(rules) {
        if (!rules || !rules.length) {
            $("#pd-policy-rules").html('<div class="text-muted small" id="pd-rules-empty">No rules.</div>');
            return;
        }
        $("#pd-policy-rules").html(rules.map(ruleCardHtml).join(""));
        $("#pd-policy-rules .pd-rule-card").each(function () {
            attachRuleEditors($(this));
        });
    }

    function policySnapshot() {
        try {
            return JSON.stringify(collectPolicyForm());
        } catch (err) {
            return "";
        }
    }

    function syncUnsavedFlag() {
        const root = window.CadminWorkspace ? CadminWorkspace.root() : document;
        CadminApi.setUnsavedFlag(root, policySnapshot() !== savedPolicy);
    }

    function markPolicyClean() {
        savedPolicy = policySnapshot();
        syncUnsavedFlag();
    }

    function collectPolicyForm() {
        return {
            id: ($("#pd-policy-id").val() || "").trim(),
            description: ($("#pd-policy-description").val() || "").trim(),
            version: ($("#pd-policy-version").val() || "").trim(),
            status: $("#pd-policy-status").val() || "draft",
            imports: collectImports(($("#pd-policy-id").val() || "").trim()),
            target: (targetEditor ? targetEditor.getValue() : ($("#pd-policy-target").val() || "")).trim(),
            apply: $("#pd-policy-apply").val() || "deny-overrides",
            onTarget: collectOnTarget(),
            rules: collectRules()
        };
    }

    function teardownYamlPreview() {
        if (yamlPreviewEditor) {
            yamlPreviewEditor.toTextArea();
            yamlPreviewEditor = null;
        }
    }

    function showGeneratedYaml() {
        const yaml = dumpPolicyYaml(collectPolicyForm());
        const textarea = document.getElementById("pd-yaml-preview");
        if (!textarea) {
            return;
        }
        teardownYamlPreview();
        textarea.value = yaml;
        if (typeof CodeMirror === "undefined") {
            return;
        }
        yamlPreviewEditor = CodeMirror.fromTextArea(textarea, {
            mode: "yaml",
            theme: "default",
            readOnly: true,
            lineNumbers: true,
            lineWrapping: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: {
                "Ctrl-Q": function (cm) {
                    cm.foldCode(cm.getCursor());
                }
            },
            viewportMargin: Infinity
        });
        yamlPreviewEditor.setSize("100%", "28rem");
        requestAnimationFrame(function () {
            if (yamlPreviewEditor) {
                yamlPreviewEditor.refresh();
            }
        });
    }

    function applySelectHtml(selected) {
        const value = selected || "deny-overrides";
        const known = applyOptions.some(function (option) { return option.code === value; });
        let html = optionsHtml(applyOptions);
        if (value && !known) {
            html += '<option value="' + esc(value) + '" selected>' + esc(value) + "</option>";
        }
        return html;
    }

    function render(resource) {
        if (CadminApi.isLibraryType(resource, "camel-route")) {
            window.location.hash = "#/camel-routes/" + encodeURIComponent(resource.id);
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
        if (CadminApi.isGatewayRouteLibrary(resource)) {
            window.location.hash = "#/icg-routes/" + encodeURIComponent(resource.id);
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
        const label = esc(library.title || library.name || "PDS policy");
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/pds-policies">' +
                        '<i class="bi bi-arrow-left me-1"></i>PDS Policies</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="pd-title">' + label + "</h1>" +
                        '<span id="pd-status-badge">' + statusBadge(library.status) + "</span>" +
                        (library.id
                            ? '<code class="small" id="pd-fhir-id">' + esc(library.id) + "</code>"
                            : '<code class="small d-none" id="pd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column cadmin-settings-nav" id="pd-settings-nav" role="tablist">' +
                        navButton("pd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("pd-pane-identity", "bi bi-person-vcard", "Identity and version") +
                        navButton("pd-pane-details", "bi bi-journal-text", "Details") +
                        navButton("pd-pane-policy", "bi bi-shield-lock", "Policy") +
                        navButton("pd-pane-attachments", "bi bi-paperclip", "Attachments") +
                        navButton("pd-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("pd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("pd-pane-history", "bi bi-clock-history", "History") +
                        navButton("pd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("pd-pane-basics",
                            '<form id="pd-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="pd-title-input">') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="pd-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>"),
                                            field("Type",
                                                '<input class="form-control font-monospace" id="pd-type" value="' +
                                                    esc(typeCode()) + '" readonly disabled>')) +
                                        '<div class="form-check mb-3">' +
                                            '<input class="form-check-input" type="checkbox" id="pd-experimental">' +
                                            '<label class="form-check-label" for="pd-experimental">Experimental</label>' +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("pd-pane-identity",
                            '<form id="pd-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Identity and version</h3></div>' +
                                    '<div class="card-body">' +
                                        field("URL", '<input class="form-control font-monospace" id="pd-url">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="pd-name">'),
                                            field("Version", '<input class="form-control" id="pd-version" autocomplete="off">')) +
                                        fieldRow(
                                            field("Publisher", '<input class="form-control" id="pd-publisher">'),
                                            field("Date", '<input type="date" class="form-control" id="pd-date">')) +
                                        fieldRow(
                                            field("Approved date", '<input type="date" class="form-control" id="pd-approval">'),
                                            field("Last review date", '<input type="date" class="form-control" id="pd-review">')) +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Effective date range</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="pd-period-start" ' +
                                                        'aria-label="Effective start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="pd-period-end" ' +
                                                        'aria-label="Effective end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("pd-pane-details",
                            '<form id="pd-details-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Details</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Description", '<textarea class="form-control" id="pd-description" rows="4"></textarea>') +
                                        field("Purpose", '<textarea class="form-control" id="pd-purpose" rows="3"></textarea>') +
                                        field("Usage", '<textarea class="form-control" id="pd-usage" rows="3"></textarea>') +
                                        field("Copyright", '<textarea class="form-control" id="pd-copyright" rows="2"></textarea>') +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("pd-pane-policy",
                            '<form id="pd-policy-form">' +
                                '<div class="card">' +
                                    '<div class="card-header flex-wrap gap-2">' +
                                        "<div>" +
                                            '<h3 class="card-title mb-0">Policy content</h3>' +
                                            '<div class="small text-muted"><code>' + esc(policyContentType) + "</code></div>" +
                                        "</div>" +
                                        '<div class="card-tools d-flex flex-nowrap align-items-center gap-2">' +
                                            '<button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="modal" data-bs-target="#pd-yaml-modal">' +
                                                '<i class="bi bi-filetype-yml me-1"></i>View YAML</button>' +
                                            '<button class="btn btn-sm btn-primary" type="submit">' +
                                                '<i class="bi bi-check2 me-1"></i>Save</button>' +
                                        "</div>" +
                                    "</div>" +
                                    '<div class="card-body">' +
                                        '<div class="row">' +
                                            '<div class="col-md-6">' +
                                                field("Policy ID", '<input class="form-control font-monospace" id="pd-policy-id" required placeholder="Unique ID (Library.name)">') +
                                            "</div>" +
                                            '<div class="col-md-3">' +
                                                field("Version", '<input class="form-control" id="pd-policy-version" placeholder="e.g. 1.0.0">') +
                                            "</div>" +
                                            '<div class="col-md-3">' +
                                                field("Status", '<select class="form-select" id="pd-policy-status">' +
                                                    optionsHtml(statusOptions) + "</select>") +
                                            "</div>" +
                                        "</div>" +
                                        field("Description", '<textarea class="form-control" id="pd-policy-description" rows="3"></textarea>') +
                                        '<div class="mb-3">' +
                                            '<div class="d-flex justify-content-between align-items-center mb-2">' +
                                                '<label class="form-label mb-0">Imports</label>' +
                                                '<button class="btn btn-sm btn-outline-primary" type="button" id="pd-policy-import-add">' +
                                                    '<i class="bi bi-plus-lg me-1"></i>Add import</button>' +
                                            "</div>" +
                                            '<div id="pd-policy-imports"></div>' +
                                            '<div class="form-text">Each import is another policy’s <code>Library.name</code>.</div>' +
                                        "</div>" +
                                        field("Target", '<div class="spel-host">' +
                                            '<textarea class="form-control font-monospace" id="pd-policy-target" rows="4" ' +
                                            'placeholder="SpringEL predicate"></textarea></div>' +
                                            '<div class="form-text">If this predicate is true, the policy rules are evaluated.</div>') +
                                        field("Apply", '<select class="form-select" id="pd-policy-apply">' +
                                            optionsHtml(applyOptions) + "</select>" +
                                            '<div class="form-text">Rule combiner used when the target matches.</div>') +
                                        '<div class="mb-0">' +
                                            '<div class="d-flex justify-content-between align-items-center mb-2">' +
                                                '<label class="form-label mb-0">On target</label>' +
                                                '<button class="btn btn-sm btn-outline-primary" type="button" id="pd-policy-ontarget-add">' +
                                                    '<i class="bi bi-plus-lg me-1"></i>Add statement</button>' +
                                            "</div>" +
                                            '<div id="pd-policy-ontarget"></div>' +
                                            '<div class="form-text">SpringEL statements run when the target predicate is true.</div>' +
                                        "</div>" +
                                        '<div class="mt-4">' +
                                            '<div class="d-flex justify-content-between align-items-center mb-2">' +
                                                '<label class="form-label mb-0">Rules</label>' +
                                                '<button class="btn btn-sm btn-outline-primary" type="button" id="pd-policy-rule-add">' +
                                                    '<i class="bi bi-plus-lg me-1"></i>Add rule</button>' +
                                            "</div>" +
                                            '<div id="pd-policy-rules"></div>' +
                                            '<div class="form-text">Rules are omitted from YAML when this list is empty.</div>' +
                                        "</div>" +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("pd-pane-attachments",
                            card("Identifiers", "pds-id-rows", ["System", "Value", ""], "#pd-id-modal", "Add") +
                            card("Contacts", "pds-contact-rows", ["Name", "Telecom", ""], "#pd-contact-modal", "Add") +
                            card("Content", "pds-content-rows", ["Title", "Type", ""], "#pd-content-modal", "Add")) +
                        tabPane("pd-pane-related", CadminLibraryRelated.cards()) +
                        tabPane("pd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("pd-pane-history", CadminResourceHistory.card()) +
                        tabPane("pd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this PDS policy</p>' +
                                            '<small class="text-secondary">' +
                                                "This permanently deletes the Library that stores the policy YAML." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="pd-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>" +
            viewModal("pd-yaml-modal", "Generated YAML",
                '<div class="yaml-preview-host">' +
                    '<textarea id="pd-yaml-preview" class="form-control font-monospace" readonly></textarea>' +
                "</div>") +
            modal("pd-id-modal", "Add identifier",
                field("System", '<input class="form-control" id="pd-id-system">') +
                field("Value", '<input class="form-control" id="pd-id-value" required>'),
                "pd-id-form") +
            modal("pd-contact-modal", "Add contact",
                field("Name", '<input class="form-control" id="pd-ct-name" required>') +
                field("Phone", '<input class="form-control" id="pd-ct-phone">') +
                field("Email", '<input class="form-control" id="pd-ct-email" type="email">'),
                "pd-contact-form") +
            modal("pd-content-modal", "Add content",
                field("Title", '<input class="form-control" id="pd-content-title">') +
                field("Content type", '<select class="form-select" id="pd-content-type">' + optionsHtml(contentTypes) + "</select>") +
                field("URL", '<input class="form-control" id="pd-content-url" placeholder="Optional instead of inline data">') +
                field("Data", '<textarea class="form-control font-monospace" id="pd-content-data" rows="8" placeholder="Inline policy text"></textarea>'),
                "pd-content-form", true)
        );
        CadminResourceSource.mount(function () { return library; });
        CadminResourceGraph.mount(library);
        CadminResourceHistory.mount(library);
        CadminLibraryRelated.mount(library);
        renderHeader();
        fillBasicsForm();
        renderIdentifiers();
        renderContacts();
        renderContent();
        renderPolicyEditor();
        loadImportChoices();
        bindForms();
    }

    function renderImportRows(imports) {
        if (!imports || !imports.length) {
            $("#pd-policy-imports").html('<div class="text-muted small" id="pd-imports-empty">No imports.</div>');
            return;
        }
        $("#pd-policy-imports").html(imports.map(importRowHtml).join(""));
    }

    function renderOnTargetRows(statements) {
        $("#pd-policy-ontarget .pd-ontarget-row").each(function () {
            const cm = $(this).data("cm");
            if (cm) {
                cm.toTextArea();
                $(this).removeData("cm");
            }
        });
        if (!statements || !statements.length) {
            $("#pd-policy-ontarget").html('<div class="text-muted small" id="pd-ontarget-empty">No on-target statements.</div>');
            return;
        }
        $("#pd-policy-ontarget").html(statements.map(onTargetRowHtml).join(""));
        $("#pd-policy-ontarget .pd-ontarget-row").each(function () {
            attachOnTargetEditor($(this));
        });
    }

    function refreshImportSelects() {
        $("#pd-policy-imports .pd-import-value").each(function () {
            const selected = $(this).val();
            $(this).html(importOptionHtml(selected));
            if (selected) {
                $(this).val(selected);
            }
        });
    }

    function renderPolicyEditor() {
        teardownSpelEditors();
        const policy = readPolicyDocument();
        $("#pd-policy-id").val(policy.id);
        $("#pd-policy-description").val(policy.description);
        $("#pd-policy-version").val(policy.version);
        $("#pd-policy-status").val(policy.status || "draft");
        $("#pd-policy-target").val(policy.target || "");
        $("#pd-policy-apply").html(applySelectHtml(policy.apply));
        $("#pd-policy-apply").val(policy.apply || "deny-overrides");
        renderImportRows(policy.imports);
        renderOnTargetRows(policy.onTarget);
        renderRules(policy.rules);
        targetEditor = attachSpelEditor(document.getElementById("pd-policy-target"), "6.5rem");
        markPolicyClean();
    }

    function loadImportChoices() {
        CadminApi.fhir("/Library?type=" + encodeURIComponent(libraryType) + "&_count=200").done(function (bundle) {
            otherPolicies = (bundle.entry || []).map(function (entry) {
                return entry.resource;
            }).filter(function (item) {
                return item && item.name && item.id !== library.id;
            }).map(function (item) {
                return { name: item.name, title: item.title || "" };
            }).sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });
            refreshImportSelects();
        }).fail(function () {
            otherPolicies = [];
        });
    }

    function renderHeader() {
        $("#pd-title").text(library.title || library.name || "PDS policy");
        $("#pd-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $("#pd-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $("#pd-fhir-id").text("").addClass("d-none");
        }
    }

    function fillBasicsForm() {
        const period = library.effectivePeriod || {};
        $("#pd-title-input").val(library.title || "");
        $("#pd-status").val(library.status || "draft");
        $("#pd-type").val(typeCode());
        $("#pd-experimental").prop("checked", !!library.experimental);
        $("#pd-description").val(library.description || "");
        $("#pd-purpose").val(library.purpose || "");
        $("#pd-usage").val(library.usage || "");
        $("#pd-copyright").val(library.copyright || "");
        $("#pd-url").val(library.url || "");
        $("#pd-name").val(library.name || "");
        $("#pd-version").val(library.version || "");
        $("#pd-publisher").val(library.publisher || "");
        $("#pd-date").val(dateInputValue(library.date));
        $("#pd-approval").val(dateInputValue(library.approvalDate));
        $("#pd-review").val(dateInputValue(library.lastReviewDate));
        $("#pd-period-start").val(dateInputValue(period.start));
        $("#pd-period-end").val(dateInputValue(period.end));
        CadminApi.fillValueSetSelect("#pd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: library.status || "draft"
        });
    }

    function applyLibraryMeta() {
        setOrDelete(library, "title", $("#pd-title-input").val());
        library.status = $("#pd-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "PDS Policies" }],
            text: libraryType
        };
        if ($("#pd-experimental").is(":checked")) {
            library.experimental = true;
        } else {
            delete library.experimental;
        }
        setOrDelete(library, "description", $("#pd-description").val());
        setOrDelete(library, "purpose", $("#pd-purpose").val());
        setOrDelete(library, "usage", $("#pd-usage").val());
        setOrDelete(library, "copyright", $("#pd-copyright").val());
        setOrDelete(library, "url", $("#pd-url").val());
        setOrDelete(library, "name", $("#pd-name").val());
        setOrDelete(library, "version", $("#pd-version").val());
        setOrDelete(library, "publisher", $("#pd-publisher").val());
        setOrDelete(library, "date", $("#pd-date").val());
        setOrDelete(library, "approvalDate", $("#pd-approval").val());
        setOrDelete(library, "lastReviewDate", $("#pd-review").val());
        const start = ($("#pd-period-start").val() || "").trim();
        const end = ($("#pd-period-end").val() || "").trim();
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

    function renderIdentifiers() {
        const items = library.identifier || [];
        if (!items.length) {
            $("#pds-id-rows").html(emptyRow(3, "No identifiers."));
            return;
        }
        $("#pds-id-rows").html(items.map(function (item, index) {
            return "<tr><td>" + esc(item.system || "—") + "</td><td>" + esc(item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove="identifier" data-index="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function formatTelecom(list) {
        return (list || []).map(function (item) {
            return [item.system, item.value].filter(Boolean).join(": ");
        }).filter(Boolean).join(" · ") || "—";
    }

    function renderContacts() {
        const items = library.contact || [];
        if (!items.length) {
            $("#pds-contact-rows").html(emptyRow(3, "No contacts."));
            return;
        }
        $("#pds-contact-rows").html(items.map(function (item, index) {
            return "<tr><td>" + esc(item.name || "—") + "</td><td>" + esc(formatTelecom(item.telecom)) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove="contact" data-index="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderContent() {
        const items = library.content || [];
        const rows = [];
        items.forEach(function (item, index) {
            if (isPolicyYaml(item)) {
                return;
            }
            rows.push("<tr><td>" + esc(item.title || item.url || "Untitled") + "</td><td>" +
                esc(item.contentType || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove="content" data-index="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>');
        });
        if (!rows.length) {
            $("#pds-content-rows").html(emptyRow(3, "No additional content."));
            return;
        }
        $("#pds-content-rows").html(rows.join(""));
    }

    function refreshLists() {
        renderHeader();
        renderIdentifiers();
        renderContacts();
        renderContent();
    }

    function saveLibrary(next) {
        if (!library.type) {
            library.type = {
                coding: [{ code: libraryType, display: "PDS Policies" }],
                text: libraryType
            };
        }
        const sentContent = library.content;
        CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "PUT", library).done(function (updated) {
            library = updated || library;
            if (sentContent && sentContent.length) {
                if (!library.content || !library.content.length) {
                    library.content = sentContent;
                } else {
                    library.content = library.content.map(function (item, index) {
                        if (item.data) {
                            return item;
                        }
                        const sent = sentContent.find(function (candidate) {
                            return isPolicyYaml(candidate) && isPolicyYaml(item);
                        }) || sentContent[index];
                        if (sent && sent.data && !item.data) {
                            item.data = sent.data;
                            if (!item.contentType) {
                                item.contentType = sent.contentType;
                            }
                        }
                        return item;
                    });
                }
            }
            refreshLists();
            CadminLibraryRelated.mount(library);
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            fail("Update policy", xhr);
        });
    }

    function bindForms() {
        const $root = $(CadminWorkspace.root());
        $root.off(".pdsdetail");
        $root.on("input.pdsdetail change.pdsdetail",
            "#pd-policy-form :input, #pd-basic-form :input, #pd-identity-form :input, #pd-details-form :input", syncUnsavedFlag);

        $root.on("shown.bs.tab.pdsdetail", "#pd-pane-policy-btn", function () {
            $("#pd-policy-form .CodeMirror").each(function () {
                if (this.CodeMirror) {
                    this.CodeMirror.refresh();
                }
            });
        });
        $root.on("shown.bs.tab.pdsdetail", "#pd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });

        $root.on("click.pdsdetail", "#pd-delete", function () {
            CadminApi.confirm("Delete this PDS policy?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    CadminApi.showToast("success", "PDS policy deleted.");
                    window.location.hash = "#/pds-policies";
                }).fail(function (xhr) {
                    fail("Delete policy", xhr);
                });
            });
        });

        $root.on("click.pdsdetail", "[data-remove]", function () {
            const fieldName = $(this).attr("data-remove");
            const index = Number($(this).attr("data-index"));
            if (fieldName === "content" && isPolicyYaml((library.content || [])[index])) {
                return;
            }
            library[fieldName] = (library[fieldName] || []).filter(function (_item, i) { return i !== index; });
            saveLibrary(function () {
                alertMsg("success", "Removed.");
            });
        });

        $("#pd-basic-form, #pd-identity-form, #pd-details-form").on("submit", function (event) {
            event.preventDefault();
            applyLibraryMeta();
            syncYamlFromLibraryIfPresent();
            saveLibrary(function () {
                alertMsg("success", "Library details updated.");
            });
        });

        $("#pd-id-form").on("submit", function (event) {
            event.preventDefault();
            library.identifier = library.identifier || [];
            const identifier = { value: $("#pd-id-value").val() };
            const system = $("#pd-id-system").val();
            if (system) {
                identifier.system = system;
            }
            library.identifier.push(identifier);
            saveLibrary(function () {
                hideModal("pd-id-modal");
                alertMsg("success", "Identifier added.");
            });
        });

        $("#pd-contact-form").on("submit", function (event) {
            event.preventDefault();
            const contact = { name: $("#pd-ct-name").val(), telecom: [] };
            const phone = $("#pd-ct-phone").val();
            const email = $("#pd-ct-email").val();
            if (phone) {
                contact.telecom.push({ system: "phone", value: phone });
            }
            if (email) {
                contact.telecom.push({ system: "email", value: email });
            }
            library.contact = library.contact || [];
            library.contact.push(contact);
            saveLibrary(function () {
                hideModal("pd-contact-modal");
                alertMsg("success", "Contact added.");
            });
        });

        $("#pd-content-form").on("submit", function (event) {
            event.preventDefault();
            const attachment = {
                contentType: $("#pd-content-type").val() || "text/plain"
            };
            const title = $("#pd-content-title").val();
            const url = $("#pd-content-url").val();
            const data = $("#pd-content-data").val();
            if (title) {
                attachment.title = title;
            }
            if (url) {
                attachment.url = url;
            }
            if (data) {
                attachment.data = encodeText(data);
            }
            library.content = library.content || [];
            library.content.push(attachment);
            saveLibrary(function () {
                hideModal("pd-content-modal");
                alertMsg("success", "Content added.");
            });
        });

        $root.on("click.pdsdetail", "#pd-policy-import-add", function () {
            $("#pd-imports-empty").remove();
            $("#pd-policy-imports").append(importRowHtml(""));
            syncUnsavedFlag();
        });

        $root.on("click.pdsdetail", "[data-import-remove]", function () {
            $(this).closest(".pd-import-row").remove();
            if (!$("#pd-policy-imports .pd-import-row").length) {
                renderImportRows([]);
            }
            syncUnsavedFlag();
        });

        $root.on("click.pdsdetail", "#pd-policy-ontarget-add", function () {
            $("#pd-ontarget-empty").remove();
            const $row = $(onTargetRowHtml(""));
            $("#pd-policy-ontarget").append($row);
            attachOnTargetEditor($row);
            syncUnsavedFlag();
        });

        $root.on("click.pdsdetail", "[data-ontarget-remove]", function () {
            const $row = $(this).closest(".pd-ontarget-row");
            const cm = $row.data("cm");
            if (cm) {
                cm.toTextArea();
            }
            $row.remove();
            if (!$("#pd-policy-ontarget .pd-ontarget-row").length) {
                renderOnTargetRows([]);
            }
            syncUnsavedFlag();
        });

        $root.on("click.pdsdetail", "#pd-policy-rule-add", function () {
            $("#pd-rules-empty").remove();
            const $card = $(ruleCardHtml(Object.assign(emptyRule(), { id: nextRuleId() })));
            $("#pd-policy-rules").append($card);
            attachRuleEditors($card);
            syncUnsavedFlag();
        });

        $root.on("click.pdsdetail", "[data-rule-remove]", function () {
            const $card = $(this).closest(".pd-rule-card");
            $card.find(".spel-host, .pd-spel-row").each(function () {
                teardownCm($(this));
            });
            $card.remove();
            if (!$("#pd-policy-rules .pd-rule-card").length) {
                renderRules([]);
            }
            syncUnsavedFlag();
        });

        $root.on("click.pdsdetail", "[data-rule-list-add]", function () {
            const key = $(this).attr("data-rule-list-add");
            const $list = $(this).closest(".mb-3").find(".pd-rule-" + key);
            $list.find(".pd-spel-empty").remove();
            const $row = $(spelListRowHtml(""));
            $list.append($row);
            attachOnTargetEditor($row);
            syncUnsavedFlag();
        });

        $root.on("click.pdsdetail", "[data-spel-remove]", function () {
            const $list = $(this).closest(".pd-rule-ontarget, .pd-rule-onpermit, .pd-rule-ondeny");
            const $row = $(this).closest(".pd-spel-row");
            teardownCm($row);
            $row.remove();
            if ($list.length && !$list.find(".pd-spel-row").length) {
                $list.html('<div class="text-muted small pd-spel-empty">None.</div>');
            }
            syncUnsavedFlag();
        });

        $("#pd-policy-form").on("submit", function (event) {
            event.preventDefault();
            const policy = collectPolicyForm();
            if (!policy.id) {
                alertMsg("danger", "Policy ID is required.");
                return;
            }
            applyPolicyDocument(policy);
            saveLibrary(function () {
                alertMsg("success", "Policy content saved.");
            });
        });

        $("#pd-yaml-modal").on("shown.bs.modal", showGeneratedYaml);
        $("#pd-yaml-modal").on("hidden.bs.modal", teardownYamlPreview);
    }

    return { render: render };
}());
