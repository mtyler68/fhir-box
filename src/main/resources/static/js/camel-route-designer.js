window.CadminCamelRouteDesigner = (function () {
    const REST_METHODS = ["get", "post", "put", "delete", "patch", "head"];
    const SIMPLE_HINTS = [
        "${body}", "${bodyAs(String)}", "${mandatoryBodyAs(String)}", "${prettyBody}",
        "${header.}", "${headers}", "${headerAs(name, String)}",
        "${exchangeProperty.}", "${variable.}", "${exchange}", "${in.body}", "${in.headers.}",
        "${exception.message}", "${exception.stacktrace}",
        "${id}", "${exchangeId}", "${routeId}", "${camelId}", "${threadName}",
        "${messageTimestamp}", "${date:now:yyyy-MM-dd HH:mm:ss}", "${date:now:yyyy-MM-dd}",
        "${properties:}", "${env:}", "${sys:}", "${ref:}", "${type:}", "${bean:}",
        "${originalBody}", "${null}", "true", "false",
        " == ", " != ", " > ", " >= ", " < ", " <= ", " =~ ", " ~~ ",
        " contains ", " not contains ", " starts with ", " ends with ",
        " in ", " range ", " regex ", " is ", " is not ", " and ", " or ", " not ", " && ", " || "
    ];
    const SCRIPT_HINTS = [
        "body", "headers", "exchange", "camelContext", "request", "response",
        "exchange.getMessage()", "exchange.getIn()", "exchange.getProperty(\"",
        "exchange.setProperty(\"", "exchange.getMessage().setBody(",
        "exchange.getMessage().setHeader(\"", "header(\"", "headers.get(\""
    ];
    const JSONPATH_HINTS = ["$", "$.", "$[*]", "$..", "$[?(@.)]", "@."];
    const XPATH_HINTS = ["/", "//", "local-name()", "text()", "/fhir:", "//*[local-name()='Patient']"];
    const GROUP_LABELS = {
        endpoint: "Endpoints",
        routing: "Routing",
        message: "Message",
        transform: "Transform",
        control: "Control",
        resilience: "Resilience",
        error: "Error handling",
        other: "Other",
        rest: "REST",
        document: "Document"
    };

    let hostSelector = "";
    let api = null;
    let docs = [];
    let selectedDoc = 0;
    let selectedPath = [];
    let lastYaml = "";
    let parseError = "";
    let applying = false;
    let dirty = false;
    let exprEditors = {};
    let hintRegistered = false;

    function catalog() {
        return window.CadminCamelYamlCatalog || {
            expressions: ["simple", "constant", "groovy", "js", "spel", "jsonpath", "xpath"],
            dataFormats: ["json", "fhirJson", "jaxb"],
            components: ["direct", "timer", "log", "http", "kafka"],
            componentParams: {},
            documents: {},
            processors: {},
            formatSpecs: {}
        };
    }

    function specFor(kind) {
        const C = catalog();
        if (C.processors[kind]) {
            return C.processors[kind];
        }
        if (C.documents[kind]) {
            return C.documents[kind];
        }
        if (kind === "when") {
            return C.when;
        }
        if (kind === "otherwise") {
            return C.otherwise;
        }
        if (kind === "doCatch" || kind === "catch") {
            return C.doCatch;
        }
        if (kind === "doFinally" || kind === "finally") {
            return C.doFinally;
        }
        if (REST_METHODS.indexOf(kind) >= 0) {
            return C.restVerb;
        }
        return {
            name: kind,
            title: kind,
            description: "",
            fields: [],
            hasSteps: false,
            hasExpression: false,
            hasUri: false,
            hasParameters: false,
            hasDataFormat: false
        };
    }

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function $host() {
        return hostSelector ? $(hostSelector) : $();
    }

    function asList(value) {
        if (value == null) {
            return [];
        }
        return Array.isArray(value) ? value : [value];
    }

    function pathKey(path) {
        return (path || []).join("/");
    }

    function getAt(path) {
        let current = docs;
        (path || []).forEach(function (seg) {
            if (current == null) {
                return;
            }
            current = current[seg];
        });
        return current;
    }

    function parentPath(path) {
        return (path || []).slice(0, -1);
    }

    function stepParts(step) {
        if (step == null) {
            return null;
        }
        if (typeof step === "string") {
            return { kind: "to", body: { uri: step } };
        }
        if (typeof step !== "object" || Array.isArray(step)) {
            return null;
        }
        const keys = Object.keys(step);
        if (!keys.length) {
            return null;
        }
        return { kind: keys[0], body: step[keys[0]] };
    }

    function exprValue(raw) {
        if (raw == null) {
            return "";
        }
        if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
            return String(raw);
        }
        if (typeof raw === "object" && raw.expression != null) {
            return String(raw.expression);
        }
        return "";
    }

    function exprOf(body) {
        const langs = catalog().expressions || [];
        let i;
        if (!body || typeof body !== "object") {
            return { language: "simple", value: "" };
        }
        for (i = 0; i < langs.length; i += 1) {
            if (body[langs[i]] != null) {
                return { language: langs[i], value: exprValue(body[langs[i]]) };
            }
        }
        if (body.expression != null) {
            return { language: "simple", value: exprValue(body.expression) };
        }
        return { language: "simple", value: "" };
    }

    function setExpression(body, language, value) {
        (catalog().expressions || []).forEach(function (lang) {
            delete body[lang];
        });
        delete body.expression;
        if (value == null || value === "") {
            return;
        }
        body[language || "simple"] = value;
    }

    function dataFormatOf(body) {
        const formats = catalog().dataFormats || [];
        let i;
        if (typeof body === "string" && formats.indexOf(body) >= 0) {
            return { name: body, config: {} };
        }
        for (i = 0; i < formats.length; i += 1) {
            if (body && Object.prototype.hasOwnProperty.call(body, formats[i])) {
                const raw = body[formats[i]];
                return {
                    name: formats[i],
                    config: raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
                };
            }
        }
        return { name: "", config: {} };
    }

    function setDataFormat(body, name, config) {
        (catalog().dataFormats || []).forEach(function (fmt) {
            delete body[fmt];
        });
        if (!name) {
            return;
        }
        body[name] = config && typeof config === "object" && !Array.isArray(config) ? config : {};
    }

    function formatSpecOf(name) {
        return (catalog().formatSpecs || {})[name] || { name: name, title: name, description: "", fields: [] };
    }

    function assignFieldValue(target, field, $el) {
        const key = field && field.key ? field.key : $el.attr("data-df-field") || $el.attr("data-field") || $el.attr("data-df-item");
        if (!key) {
            return;
        }
        if ($el.is(":checkbox")) {
            if ($el[0].checked) {
                target[key] = true;
            } else {
                delete target[key];
            }
            return;
        }
        let value = $el.val();
        if (field && field.type === "number" && value !== "") {
            const number = Number(value);
            value = Number.isFinite(number) ? number : value;
        }
        if (field && field.type === "list") {
            value = String(value || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
            if (!value.length) {
                delete target[key];
                return;
            }
        }
        if (value === "" || value == null) {
            delete target[key];
        } else {
            target[key] = value;
        }
    }

    function splitUri(uri) {
        const raw = String(uri || "").trim();
        const q = raw.indexOf("?");
        const base = q < 0 ? raw : raw.slice(0, q);
        const query = {};
        if (q >= 0) {
            raw.slice(q + 1).split("&").forEach(function (pair) {
                if (!pair) {
                    return;
                }
                const eq = pair.indexOf("=");
                const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
                const value = eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1));
                query[key] = value;
            });
        }
        const colon = base.indexOf(":");
        return {
            scheme: colon < 0 ? base : base.slice(0, colon),
            path: colon < 0 ? "" : base.slice(colon + 1),
            query: query
        };
    }

    function joinUri(scheme, path) {
        const left = String(scheme || "").trim();
        const right = String(path || "").trim();
        if (!left) {
            return right;
        }
        return left + ":" + right;
    }

    function emptyRoute() {
        return {
            id: "route",
            from: {
                uri: "direct:start",
                parameters: {},
                steps: [{ log: { message: "${body}" } }]
            }
        };
    }

    function emptyStep(kind) {
        const spec = specFor(kind);
        const body = {};
        if (kind === "log") {
            body.message = "${body}";
        } else if (spec.hasUri) {
            body.uri = kind === "from" ? "direct:start" : "log:out";
        }
        if (spec.hasExpression && kind !== "log") {
            body.simple = "${body}";
        }
        if (spec.hasSteps || kind === "choice" || kind === "filter" || kind === "split"
                || kind === "loop" || kind === "doTry" || kind === "multicast" || kind === "pipeline") {
            body.steps = [];
        }
        if (kind === "choice") {
            body.when = [{ simple: "${header.type} == 'ok'", steps: [] }];
            body.otherwise = { steps: [] };
        }
        if (kind === "setHeader") {
            body.name = "CamelHeader";
        }
        if (kind === "setProperty" || kind === "setVariable") {
            body.name = kind === "setProperty" ? "myProperty" : "myVariable";
        }
        if (kind === "toD") {
            body.uri = "${header.uri}";
        }
        if (kind === "bean" || kind === "process") {
            body.ref = "myBean";
        }
        if (spec.hasDataFormat) {
            body.json = {};
        }
        const node = {};
        node[kind] = body;
        return node;
    }

    function normalizeFrom(raw) {
        if (raw == null) {
            return { uri: "direct:start", steps: [] };
        }
        if (typeof raw === "string") {
            return { uri: raw, steps: [] };
        }
        if (typeof raw !== "object") {
            return { uri: "direct:start", steps: [] };
        }
        if (!raw.steps) {
            raw.steps = [];
        }
        if (raw.parameters && typeof raw.parameters !== "object") {
            raw.parameters = {};
        }
        return raw;
    }

    function parseDocs(text) {
        if (typeof jsyaml === "undefined") {
            return { error: "YAML parser is not loaded.", docs: [] };
        }
        const source = String(text || "").trim();
        if (!source) {
            return { error: "", docs: [{ route: emptyRoute() }] };
        }
        try {
            const loaded = jsyaml.load(source);
            const items = Array.isArray(loaded) ? loaded : loaded ? [loaded] : [];
            if (!items.length) {
                return { error: "YAML must contain a Camel route, from, or rest block.", docs: [] };
            }
            const parsed = items.map(function (item) {
                if (!item || typeof item !== "object") {
                    return { route: emptyRoute() };
                }
                if (item.route && item.route.from) {
                    item.route.from = normalizeFrom(item.route.from);
                }
                if (item.from && !item.route && !item.rest) {
                    item.from = normalizeFrom(item.from);
                }
                return item;
            });
            return { error: "", docs: parsed };
        } catch (err) {
            return { error: (err && err.message) || "Invalid YAML.", docs: [] };
        }
    }

    function compact(value, key) {
        if (value == null || value === "") {
            return undefined;
        }
        if (Array.isArray(value)) {
            const list = value.map(function (item) { return compact(item); }).filter(function (item) {
                return item !== undefined;
            });
            if (!list.length && key !== "steps" && key !== "when") {
                return undefined;
            }
            return list;
        }
        if (typeof value === "object") {
            const out = {};
            Object.keys(value).forEach(function (child) {
                const next = compact(value[child], child);
                if (next !== undefined) {
                    out[child] = next;
                }
            });
            return out;
        }
        return value;
    }

    function dumpYaml(list) {
        if (typeof jsyaml === "undefined") {
            return "";
        }
        const cleaned = compact(list);
        return jsyaml.dump(cleaned && cleaned.length ? cleaned : list, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            quotingType: '"',
            forceQuotes: false
        }).replace(/\s+$/, "") + "\n";
    }

    function hintsFor(language) {
        if (language === "jsonpath" || language === "jq") {
            return JSONPATH_HINTS;
        }
        if (language === "xpath" || language === "xquery" || language === "xtokenize") {
            return XPATH_HINTS;
        }
        if (language === "groovy" || language === "js" || language === "java" || language === "joor"
                || language === "mvel" || language === "ognl" || language === "python") {
            return SCRIPT_HINTS;
        }
        if (language === "spel") {
            return SCRIPT_HINTS.concat(["#root", "#this", "T(", "systemProperties["]);
        }
        return SIMPLE_HINTS;
    }

    function registerExprHint() {
        if (hintRegistered || typeof CodeMirror === "undefined") {
            return;
        }
        hintRegistered = true;
        CodeMirror.registerHelper("hint", "camel-expr", function (cm) {
            const language = (cm.getOption("camelExprLanguage") || "simple");
            const cursor = cm.getCursor();
            const token = cm.getTokenAt(cursor);
            const word = token && token.string ? token.string : "";
            const start = token && token.start != null ? token.start : cursor.ch;
            const prefix = word.replace(/^['"]/, "").toLowerCase();
            const list = hintsFor(language).filter(function (item) {
                return !prefix || item.toLowerCase().indexOf(prefix) >= 0;
            });
            return {
                list: list,
                from: CodeMirror.Pos(cursor.line, Math.max(0, start)),
                to: cursor
            };
        });
    }

    function destroyExprEditors() {
        Object.keys(exprEditors).forEach(function (id) {
            const cm = exprEditors[id];
            if (cm && typeof cm.toTextArea === "function") {
                cm.toTextArea();
            }
        });
        exprEditors = {};
    }

    function mountExprEditors() {
        registerExprHint();
        if (typeof CodeMirror === "undefined") {
            return;
        }
        $host().find("textarea[data-expr]").each(function () {
            const ta = this;
            const language = ta.getAttribute("data-expr-lang") || "simple";
            const cm = CodeMirror.fromTextArea(ta, {
                mode: language === "xpath" || language === "xquery" ? "xml" : "javascript",
                theme: "material-darker",
                lineNumbers: false,
                lineWrapping: true,
                matchBrackets: true,
                autoCloseBrackets: true,
                extraKeys: { "Ctrl-Space": "autocomplete" },
                hintOptions: { hint: CodeMirror.hint["camel-expr"], completeSingle: false },
                camelExprLanguage: language
            });
            cm.setSize("100%", "6.5rem");
            cm.getWrapperElement().classList.add("camel-expr-editor");
            cm.on("change", function () {
                emit();
            });
            cm.on("inputRead", function (editor, change) {
                if (change.text.length !== 1) {
                    return;
                }
                CodeMirror.commands.autocomplete(editor, null, { completeSingle: false });
            });
            exprEditors[ta.id] = cm;
        });
    }

    function optionsFor(list, selected, placeholder) {
        const first = placeholder ? '<option value="">' + esc(placeholder) + "</option>" : "";
        return first + (list || []).map(function (item) {
            const value = typeof item === "string" ? item : item.name;
            const label = typeof item === "string" ? item : (item.title || item.name);
            const mark = value === selected ? " selected" : "";
            return '<option value="' + esc(value) + '"' + mark + ">" + esc(label) + "</option>";
        }).join("");
    }

    function processorOptions(selected) {
        const C = catalog();
        const groups = {};
        Object.keys(C.processors || {}).forEach(function (name) {
            const spec = C.processors[name];
            const group = spec.group || "other";
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(spec);
        });
        const order = ["endpoint", "message", "transform", "routing", "control", "resilience", "error", "other"];
        let html = '<option value="">Add step…</option>';
        order.forEach(function (group) {
            const items = groups[group];
            if (!items) {
                return;
            }
            html += '<optgroup label="' + esc(GROUP_LABELS[group] || group) + '">';
            items.sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (item) {
                const mark = item.name === selected ? " selected" : "";
                html += '<option value="' + esc(item.name) + '"' + mark + ">" + esc(item.title || item.name) + "</option>";
            });
            html += "</optgroup>";
        });
        return html;
    }

    function documentKind(doc) {
        if (!doc || typeof doc !== "object") {
            return "route";
        }
        const keys = Object.keys(doc);
        if (keys.length === 1) {
            return keys[0];
        }
        if (doc.route) {
            return "route";
        }
        if (doc.rest) {
            return "rest";
        }
        if (doc.from) {
            return "from";
        }
        return keys[0] || "route";
    }

    function documentBody(doc) {
        const kind = documentKind(doc);
        return doc[kind];
    }

    function documentLabel(doc, index) {
        const kind = documentKind(doc);
        const body = documentBody(doc) || {};
        if (kind === "route" && body && body.id) {
            return "route · " + body.id;
        }
        if (kind === "rest" && body && body.path) {
            return "rest · " + body.path;
        }
        if (kind === "from") {
            return "from · " + (typeof body === "string" ? body : (body.uri || ""));
        }
        return kind + " " + (index + 1);
    }

    function kvRows(map) {
        const rows = [];
        Object.keys(map || {}).forEach(function (key) {
            rows.push({ key: key, value: map[key] == null ? "" : String(map[key]) });
        });
        return rows;
    }

    function kvHtml(rows, keyAttr, addAttr) {
        const body = (rows || []).map(function (row, index) {
            return '<div class="row g-2 align-items-center mb-1" data-kv-index="' + index + '">' +
                '<div class="col-5"><input class="form-control form-control-sm" data-kv-key value="' +
                    esc(row.key) + '" placeholder="Name"></div>' +
                '<div class="col"><input class="form-control form-control-sm" data-kv-value value="' +
                    esc(row.value) + '" placeholder="Value"></div>' +
                '<div class="col-auto"><button class="btn btn-sm btn-outline-danger" type="button" data-kv-remove="' +
                    index + '"><i class="bi bi-x"></i></button></div></div>';
        }).join("");
        return '<div data-kv="' + esc(keyAttr) + '">' +
            (body || '<div class="text-muted small mb-2">None.</div>') +
            '<button class="btn btn-sm btn-outline-secondary" type="button" data-kv-add="' +
                esc(addAttr) + '">Add parameter</button></div>';
    }

    function harvestKv($root) {
        const map = {};
        $root.find("[data-kv-index]").each(function () {
            const key = ($(this).find("[data-kv-key]").val() || "").trim();
            if (!key) {
                return;
            }
            map[key] = $(this).find("[data-kv-value]").val() || "";
        });
        return map;
    }

    function fieldControl(field, value, id, attrName) {
        const attr = attrName || "data-field";
        const common = 'class="form-control form-control-sm" ' + attr + '="' + esc(field.key) + '" id="' + id + '"';
        if (field.type === "boolean") {
            const on = value === true || value === "true";
            return '<div class="form-check form-switch mb-0">' +
                '<input class="form-check-input" type="checkbox" role="switch" ' + attr + '="' +
                    esc(field.key) + '" id="' + id + '"' + (on ? " checked" : "") + "></div>";
        }
        if (field.type === "enum" || (field.options || []).length) {
            return "<select " + common + ">" +
                optionsFor(field.options || [], value == null ? "" : String(value), "(default)") +
                "</select>";
        }
        if (field.type === "number") {
            return '<input type="number" ' + common + ' value="' + esc(value == null ? "" : value) + '">';
        }
        if (field.type === "list") {
            const text = Array.isArray(value) ? value.join(", ") : (value == null ? "" : String(value));
            return "<input " + common + ' value="' + esc(text) + '" placeholder="Comma-separated">';
        }
        return "<input " + common + ' value="' + esc(value == null ? "" : value) + '"' +
            (field.description ? ' title="' + esc(field.description) + '"' : "") + ">";
    }

    function skipField(field) {
        return field.type === "nested" || field.type === "nestedList" || field.key === "from"
            || field.key === "errorHandler" || field.key === "inputType" || field.key === "outputType"
            || field.key === "openApi" || field.key === "securityDefinitions";
    }

    function inspectorFields(spec, body) {
        const hidden = { uri: true, parameters: true, steps: true };
        return (spec.fields || []).filter(function (field) {
            return !skipField(field) && !hidden[field.key];
        }).map(function (field) {
            const id = "crd-d-field-" + field.key;
            return '<div class="col-md-6 mb-2">' +
                '<label class="form-label small mb-1" for="' + id + '">' + esc(field.label) +
                    (field.required ? ' <span class="text-danger">*</span>' : "") + "</label>" +
                fieldControl(field, body ? body[field.key] : "", id) +
                (field.description ? '<div class="form-text">' + esc(field.description) + "</div>" : "") +
                "</div>";
        }).join("");
    }

    function uriEditor(body, idPrefix) {
        const parsed = splitUri(body && body.uri);
        const params = Object.assign({}, parsed.query, (body && body.parameters) || {});
        const known = catalog().componentParams[parsed.scheme] || [];
        const rows = kvRows(params);
        known.forEach(function (key) {
            if (!Object.prototype.hasOwnProperty.call(params, key)) {
                rows.push({ key: key, value: "" });
            }
        });
        return '<div class="row g-2 mb-2">' +
            '<div class="col-md-4"><label class="form-label small" for="' + idPrefix + '-scheme">Component</label>' +
                '<input class="form-control form-control-sm" list="crd-d-components" id="' + idPrefix +
                    '-scheme" data-uri-scheme value="' + esc(parsed.scheme) + '"></div>' +
            '<div class="col-md-8"><label class="form-label small" for="' + idPrefix + '-path">Path / remaining URI</label>' +
                '<input class="form-control form-control-sm font-monospace" id="' + idPrefix +
                    '-path" data-uri-path value="' + esc(parsed.path) + '" placeholder="tick  |  /Patient  |  events"></div>' +
            "</div>" +
            '<datalist id="crd-d-components">' +
                (catalog().components || []).map(function (item) {
                    return '<option value="' + esc(item) + '">';
                }).join("") + "</datalist>" +
            '<div class="small text-muted mb-1">Endpoint parameters</div>' +
            kvHtml(rows, "parameters", "parameters");
    }

    function expressionEditor(body) {
        const expr = exprOf(body);
        return '<div class="mb-2"><label class="form-label small">Expression</label>' +
            '<div class="row g-2 mb-2"><div class="col-md-4">' +
                "<select class=\"form-select form-select-sm\" data-expr-lang>" +
                    optionsFor(catalog().expressions, expr.language) + "</select></div>" +
                '<div class="col-md-8 small text-muted pt-1">Ctrl-Space completes Simple, scripts, JsonPath, and XPath.</div></div>' +
            '<textarea class="form-control font-monospace" id="crd-d-expr" data-expr data-expr-lang="' +
                esc(expr.language) + '">' + esc(expr.value) + "</textarea></div>";
    }

    function nestedListEditor(field, value) {
        const rows = asList(value);
        const items = field.itemFields || [];
        const body = rows.map(function (row, index) {
            const obj = row && typeof row === "object" ? row : {};
            return '<div class="row g-2 align-items-end mb-1" data-df-nested-row="' + index + '">' +
                items.map(function (item) {
                    const id = "crd-d-df-" + field.key + "-" + index + "-" + item.key;
                    return '<div class="col">' +
                        '<label class="form-label small mb-1" for="' + id + '">' + esc(item.label) + "</label>" +
                        fieldControl(item, obj[item.key], id, "data-df-item") +
                        "</div>";
                }).join("") +
                '<div class="col-auto pb-1">' +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-df-nested-remove="' +
                        esc(field.key) + '" data-df-nested-index="' + index +
                        '"><i class="bi bi-x"></i></button></div></div>';
        }).join("");
        return '<div class="mb-3" data-df-nested="' + esc(field.key) + '">' +
            '<div class="small text-muted mb-1">' + esc(field.label) +
                (field.description ? " — " + esc(field.description) : "") + "</div>" +
            (body || '<div class="text-muted small mb-2">None.</div>') +
            '<button class="btn btn-sm btn-outline-secondary" type="button" data-df-nested-add="' +
                esc(field.key) + '">Add ' + esc((field.label || "item").toLowerCase()) + "</button></div>";
    }

    function dataFormatEditor(body) {
        const fmt = dataFormatOf(body);
        const spec = formatSpecOf(fmt.name);
        const formats = (catalog().dataFormats || []).map(function (name) {
            const item = formatSpecOf(name);
            return { name: name, title: item.title || name };
        });
        const primitives = (spec.fields || []).filter(function (field) {
            return field.type !== "nestedList";
        });
        const nested = (spec.fields || []).filter(function (field) {
            return field.type === "nestedList";
        });
        let html = '<div class="mb-3 camel-df-editor"><label class="form-label small" for="crd-d-dataformat">Data format</label>' +
            '<select class="form-select form-select-sm mb-2" id="crd-d-dataformat" data-dataformat>' +
                optionsFor(formats, fmt.name, "Select…") + "</select>";
        if (spec.description) {
            html += '<div class="form-text mb-2">' + esc(spec.description) + "</div>";
        }
        if (fmt.name && primitives.length) {
            html += '<div class="row camel-df-fields">' + primitives.map(function (field) {
                const id = "crd-d-df-" + field.key;
                return '<div class="col-md-6 mb-2">' +
                    '<label class="form-label small mb-1" for="' + id + '">' + esc(field.label) +
                        (field.required ? ' <span class="text-danger">*</span>' : "") + "</label>" +
                    fieldControl(field, fmt.config ? fmt.config[field.key] : "", id, "data-df-field") +
                    (field.description ? '<div class="form-text">' + esc(field.description) + "</div>" : "") +
                    "</div>";
            }).join("") + "</div>";
        } else if (fmt.name && !primitives.length && !nested.length) {
            html += '<div class="text-muted small mb-2">This data format has no extra options.</div>';
        }
        nested.forEach(function (field) {
            html += nestedListEditor(field, fmt.config && fmt.config[field.key]);
        });
        html += "</div>";
        return html;
    }

    function currentDoc() {
        if (!docs.length) {
            docs = [{ route: emptyRoute() }];
            selectedDoc = 0;
        }
        if (selectedDoc < 0 || selectedDoc >= docs.length) {
            selectedDoc = 0;
        }
        return docs[selectedDoc];
    }

    function ensureFrom(doc) {
        const kind = documentKind(doc);
        if (kind === "route") {
            doc.route = doc.route || emptyRoute();
            doc.route.from = normalizeFrom(doc.route.from);
            return doc.route.from;
        }
        if (kind === "from") {
            doc.from = normalizeFrom(doc.from);
            return doc.from;
        }
        return null;
    }

    function stepsOwnerFromPath(path) {
        const list = path || [];
        const idx = list.lastIndexOf("steps");
        if (idx >= 0 && idx < list.length - 1) {
            return { ownerPath: list.slice(0, idx), index: Number(list[idx + 1]) };
        }
        return null;
    }

    function renderStepTree(steps, path, depth) {
        if (!steps || !steps.length) {
            return '<div class="text-muted small py-1" style="padding-left:' + (depth * 0.85) + 'rem">No steps.</div>';
        }
        return steps.map(function (step, index) {
            const parsed = stepParts(step) || { kind: "step", body: {} };
            const spec = specFor(parsed.kind);
            const itemPath = path.concat(["steps", index, parsed.kind]);
            const active = pathKey(itemPath) === pathKey(selectedPath);
            let label = spec.title || parsed.kind;
            if (parsed.body && parsed.body.uri) {
                label += " · " + String(parsed.body.uri);
            } else if (parsed.kind === "log" && parsed.body && parsed.body.message) {
                label += " · " + String(parsed.body.message);
            } else if (spec.hasDataFormat) {
                const fmt = dataFormatOf(parsed.body || {});
                if (fmt.name) {
                    label += " · " + fmt.name;
                }
            } else {
                const expr = exprOf(parsed.body || {});
                if (expr.value) {
                    label += " · " + expr.value;
                }
            }
            let nested = "";
            const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};
            if (asList(body.steps).length) {
                nested += renderStepTree(body.steps, path.concat(["steps", index, parsed.kind]), depth + 1);
            }
            asList(body.when).forEach(function (when, wi) {
                const whenPath = path.concat(["steps", index, parsed.kind, "when", wi]);
                const whenActive = pathKey(whenPath) === pathKey(selectedPath);
                nested += '<button type="button" class="camel-designer-node' +
                    (whenActive ? " is-active" : "") + '" data-select-path="' + esc(pathKey(whenPath)) +
                    '" style="padding-left:' + ((depth + 1) * 0.85 + 0.5) + 'rem">when</button>';
                nested += renderStepTree(when && when.steps, whenPath, depth + 2);
            });
            if (body.otherwise) {
                const otherPath = path.concat(["steps", index, parsed.kind, "otherwise"]);
                const otherActive = pathKey(otherPath) === pathKey(selectedPath);
                nested += '<button type="button" class="camel-designer-node' +
                    (otherActive ? " is-active" : "") + '" data-select-path="' + esc(pathKey(otherPath)) +
                    '" style="padding-left:' + ((depth + 1) * 0.85 + 0.5) + 'rem">otherwise</button>';
                nested += renderStepTree(body.otherwise.steps, otherPath, depth + 2);
            }
            return '<button type="button" class="camel-designer-node' +
                (active ? " is-active" : "") + '" data-select-path="' + esc(pathKey(itemPath)) +
                '" style="padding-left:' + (depth * 0.85 + 0.5) + 'rem">' + esc(label) + "</button>" + nested;
        }).join("");
    }

    function selectedKind() {
        if (!selectedPath.length) {
            return documentKind(currentDoc());
        }
        const last = selectedPath[selectedPath.length - 1];
        if (/^\d+$/.test(String(last)) && selectedPath.length >= 2) {
            return selectedPath[selectedPath.length - 2];
        }
        return last;
    }

    function selectedBody() {
        const value = getAt(selectedPath);
        const kind = selectedKind();
        if (specFor(kind).hasDataFormat && typeof value === "string") {
            const parent = getAt(parentPath(selectedPath));
            const key = selectedPath[selectedPath.length - 1];
            const obj = {};
            obj[value] = {};
            if (parent && typeof parent === "object") {
                parent[key] = obj;
            }
            return obj;
        }
        if (value && typeof value === "object" && !Array.isArray(value)) {
            const parts = stepParts(value);
            if (parts && selectedPath[selectedPath.length - 1] !== parts.kind) {
                return parts.body && typeof parts.body === "object" ? parts.body : value;
            }
        }
        return value;
    }

    function inspectorHtml() {
        const doc = currentDoc();
        const kind = selectedPath.length ? selectedKind() : documentKind(doc);
        const spec = specFor(kind);
        let body = selectedPath.length ? selectedBody() : documentBody(doc);
        if (typeof body === "string") {
            if (spec.hasDataFormat) {
                const fmtName = body;
                body = {};
                if (fmtName) {
                    body[fmtName] = {};
                }
            } else if (spec.hasUri) {
                body = { uri: body };
            } else if (spec.hasExpression) {
                body = { simple: body };
            } else {
                body = { message: body };
            }
        }
        body = body && typeof body === "object" ? body : {};
        const fromPath = documentKind(doc) === "from" ? [String(selectedDoc), "from"] : [String(selectedDoc), "route", "from"];
        const inspectingFrom = pathKey(selectedPath) === pathKey(fromPath) || (!selectedPath.length && (kind === "route" || kind === "from"));
        let html = '<div class="small text-muted mb-2">' + esc(spec.description || spec.title || kind) + "</div>";
        if (kind === "route" && (!selectedPath.length || pathKey(selectedPath) === selectedDoc + "/route")) {
            html += '<div class="row">' + inspectorFields(spec, body) + "</div>";
            const from = ensureFrom(doc) || {};
            html += '<hr><h4 class="h6">From</h4>' + uriEditor(from, "crd-d-from");
            return html;
        }
        if (spec.hasUri || inspectingFrom) {
            html += uriEditor(body, "crd-d-uri");
        }
        if (spec.hasExpression) {
            html += expressionEditor(body);
        }
        if (spec.hasDataFormat) {
            html += dataFormatEditor(body);
        }
        html += '<div class="row">' + inspectorFields(spec, body) + "</div>";
        if (kind === "rest") {
            html += '<hr><div class="small text-muted mb-2">HTTP verbs</div>';
            REST_METHODS.forEach(function (method) {
                const verbs = asList(body[method]);
                html += '<div class="mb-2"><div class="d-flex justify-content-between align-items-center">' +
                    "<strong>" + method.toUpperCase() + "</strong>" +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-add-verb="' + method +
                    '">Add</button></div>';
                verbs.forEach(function (verb, index) {
                    const item = typeof verb === "string" ? { to: verb } : (verb || {});
                    html += '<div class="row g-2 align-items-center mb-1" data-verb="' + method + '" data-verb-index="' +
                        index + '">' +
                        '<div class="col-md-5"><input class="form-control form-control-sm" data-verb-path placeholder="/path" value="' +
                            esc(item.path || "") + '"></div>' +
                        '<div class="col-md-5"><input class="form-control form-control-sm font-monospace" data-verb-to placeholder="direct:hello" value="' +
                            esc(item.to || "") + '"></div>' +
                        '<div class="col-auto"><button class="btn btn-sm btn-outline-danger" type="button" data-verb-remove="' +
                            index + '" data-verb-method="' + method + '"><i class="bi bi-x"></i></button></div></div>';
                });
                html += "</div>";
            });
        }
        return html;
    }

    function writeYaml() {
        parseError = "";
        const yaml = dumpYaml(docs);
        lastYaml = yaml;
        dirty = true;
        if (api && typeof api.setYaml === "function") {
            applying = true;
            api.setYaml(yaml);
            applying = false;
        }
        if (api && typeof api.onChange === "function") {
            api.onChange();
        }
        if (window.CadminCamelRouteGraph) {
            CadminCamelRouteGraph.scheduleRefresh();
            if (typeof CadminCamelRouteGraph.selectPath === "function") {
                CadminCamelRouteGraph.selectPath(selectedPath);
            }
        }
    }

    function harvestDataFormat($root, body) {
        const name = $root.find("[data-dataformat]").val();
        const spec = formatSpecOf(name);
        const previous = dataFormatOf(body);
        const known = {};
        (spec.fields || []).forEach(function (field) {
            known[field.key] = field;
        });
        const config = {};
        if (previous.name === name && previous.config) {
            Object.keys(previous.config).forEach(function (key) {
                if (!known[key]) {
                    config[key] = previous.config[key];
                }
            });
        }
        $root.find("[data-df-field]").each(function () {
            const key = $(this).attr("data-df-field");
            assignFieldValue(config, known[key], $(this));
        });
        $root.find("[data-df-nested]").each(function () {
            const key = $(this).attr("data-df-nested");
            const field = known[key] || { key: key, itemFields: [] };
            const itemFields = {};
            (field.itemFields || []).forEach(function (item) {
                itemFields[item.key] = item;
            });
            const rows = [];
            $(this).find("[data-df-nested-row]").each(function () {
                const item = {};
                $(this).find("[data-df-item]").each(function () {
                    const itemKey = $(this).attr("data-df-item");
                    assignFieldValue(item, itemFields[itemKey] || { key: itemKey }, $(this));
                });
                if (Object.keys(item).length) {
                    rows.push(item);
                }
            });
            if (rows.length) {
                config[key] = rows;
            }
        });
        setDataFormat(body, name, config);
    }

    function harvest(opts) {
        const $root = $host();
        if (!$root.length) {
            return;
        }
        const doc = currentDoc();
        const kind = selectedPath.length ? selectedKind() : documentKind(doc);
        let body = selectedPath.length ? selectedBody() : documentBody(doc);
        const from = ensureFrom(doc);
        if ($root.find("[data-uri-scheme], [data-uri-path]").length) {
            const scheme = $root.find("[data-uri-scheme]").val() || "";
            const path = $root.find("[data-uri-path]").val() || "";
            const params = harvestKv($root.find('[data-kv="parameters"]'));
            const target = (kind === "route" && (!selectedPath.length || pathKey(selectedPath) === selectedDoc + "/route"))
                ? from
                : (body && typeof body === "object" ? body : from);
            if (target) {
                target.uri = joinUri(scheme, path);
                target.parameters = params;
            }
        }
        if (body && typeof body === "object") {
            $root.find("[data-field]").each(function () {
                const key = $(this).attr("data-field");
                const specField = (specFor(kind).fields || []).find(function (item) { return item.key === key; });
                if ($(this).is(":checkbox")) {
                    if (this.checked) {
                        body[key] = true;
                    } else {
                        delete body[key];
                    }
                    return;
                }
                let value = $(this).val();
                if (specField && specField.type === "number" && value !== "") {
                    const number = Number(value);
                    value = Number.isFinite(number) ? number : value;
                }
                if (specField && specField.type === "list") {
                    value = String(value || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
                    if (!value.length) {
                        delete body[key];
                        return;
                    }
                }
                if (value === "" || value == null) {
                    delete body[key];
                } else {
                    body[key] = value;
                }
            });
            if ($root.find("[data-expr]").length) {
                const lang = $root.find("[data-expr-lang]").val() || "simple";
                let text = "";
                if (exprEditors["crd-d-expr"]) {
                    text = exprEditors["crd-d-expr"].getValue();
                } else {
                    text = $root.find("[data-expr]").val() || "";
                }
                setExpression(body, lang, text);
            }
            if (!(opts && opts.skipDataFormat) && $root.find("[data-dataformat]").length) {
                harvestDataFormat($root, body);
            }
            if (kind === "rest") {
                REST_METHODS.forEach(function (method) {
                    const verbs = [];
                    $root.find('[data-verb="' + method + '"]').each(function () {
                        const path = ($(this).find("[data-verb-path]").val() || "").trim();
                        const to = ($(this).find("[data-verb-to]").val() || "").trim();
                        if (path || to) {
                            verbs.push({ path: path, to: to });
                        }
                    });
                    if (verbs.length) {
                        body[method] = verbs;
                    } else {
                        delete body[method];
                    }
                });
            }
        }
    }

    function emit() {
        harvest();
        writeYaml();
    }

    function parseSelectPath(value) {
        return String(value || "").split("/").filter(function (item) { return item !== ""; }).map(function (item) {
            return /^\d+$/.test(item) ? Number(item) : item;
        });
    }

    function addDocument(kind) {
        harvest();
        let node;
        if (kind === "route") {
            node = { route: emptyRoute() };
        } else if (kind === "rest") {
            node = { rest: { path: "/api", get: [{ path: "/hello", to: "direct:hello" }] } };
        } else if (kind === "from") {
            node = { from: normalizeFrom("direct:start") };
        } else if (kind === "onException") {
            node = { onException: { exceptions: ["java.lang.Exception"], steps: [{ log: { message: "${exception.message}" } }] } };
        } else {
            node = {};
            node[kind] = {};
        }
        docs.push(node);
        selectedDoc = docs.length - 1;
        selectedPath = [selectedDoc, kind];
        writeYaml();
        render();
    }

    function insertStep(kind, afterNode) {
        if (!kind) {
            return;
        }
        harvest();
        const step = emptyStep(kind);
        let owner = ensureFrom(currentDoc());
        let index = owner && owner.steps ? owner.steps.length : 0;
        const path = afterNode && (afterNode.bodyPath || afterNode.path);
        const target = getAt(path || selectedPath);
        const targetKind = (path || selectedPath).length
            ? (path || selectedPath)[(path || selectedPath).length - 1]
            : "";
        const targetSpec = specFor(String(targetKind));
        if (target && typeof target === "object" && !Array.isArray(target)
                && (Array.isArray(target.steps) || targetSpec.hasSteps
                    || targetKind === "when" || targetKind === "otherwise"
                    || targetKind === "from" || targetKind === "doCatch" || targetKind === "doFinally")) {
            if (!Array.isArray(target.steps)) {
                target.steps = [];
            }
            owner = target;
            index = owner.steps.length;
        } else {
            const found = stepsOwnerFromPath(path || selectedPath);
            if (found) {
                const parent = getAt(found.ownerPath);
                if (parent && Array.isArray(parent.steps)) {
                    owner = parent;
                    index = found.index + 1;
                }
            }
        }
        if (!owner) {
            CadminApi.showToast("danger", "Select a route or from node before adding a step.");
            return;
        }
        if (!Array.isArray(owner.steps)) {
            owner.steps = [];
        }
        owner.steps.splice(index, 0, step);
        writeYaml();
        render();
        mountGraph();
    }

    function removeSelected(node) {
        harvest();
        const path = (node && (node.path || node.bodyPath)) || selectedPath;
        const found = stepsOwnerFromPath(path);
        if (!found) {
            if (docs.length < 2) {
                CadminApi.showToast("danger", "A Camel library needs at least one document.");
                return;
            }
            docs.splice(selectedDoc, 1);
            selectedDoc = Math.min(selectedDoc, docs.length - 1);
            selectedPath = [];
            writeYaml();
            render();
            mountGraph();
            return;
        }
        const parent = getAt(found.ownerPath);
        if (!parent || !Array.isArray(parent.steps) || parent.steps.length < 1) {
            return;
        }
        parent.steps.splice(found.index, 1);
        selectedPath = found.ownerPath;
        writeYaml();
        render();
        mountGraph();
    }

    function moveSelected(node, delta) {
        harvest();
        const path = (node && (node.path || node.bodyPath)) || selectedPath;
        const found = stepsOwnerFromPath(path);
        if (!found) {
            return;
        }
        const parent = getAt(found.ownerPath);
        if (!parent || !Array.isArray(parent.steps)) {
            return;
        }
        const dest = found.index + delta;
        if (dest < 0 || dest >= parent.steps.length) {
            return;
        }
        const item = parent.steps.splice(found.index, 1)[0];
        parent.steps.splice(dest, 0, item);
        const parsed = stepParts(item);
        selectedPath = found.ownerPath.concat(["steps", dest, parsed ? parsed.kind : "to"]);
        writeYaml();
        render();
        mountGraph();
    }

    function render() {
        const $root = $host();
        if (!$root.length) {
            return;
        }
        destroyExprEditors();
        const doc = currentDoc();
        const kind = documentKind(doc);
        const from = ensureFrom(doc);
        const fromPath = kind === "from" ? [selectedDoc, "from"] : [selectedDoc, "route", "from"];
        const routePath = [selectedDoc, kind];
        const docOptions = docs.map(function (item, index) {
            return '<option value="' + index + '"' + (index === selectedDoc ? " selected" : "") + ">" +
                esc(documentLabel(item, index)) + "</option>";
        }).join("");
        const tree = '<button type="button" class="camel-designer-node' +
            (pathKey(selectedPath) === pathKey(routePath) || !selectedPath.length ? " is-active" : "") +
            '" data-select-path="' + esc(pathKey(routePath)) + '">' + esc(documentLabel(doc, selectedDoc)) + "</button>";
        const fromTree = from
            ? '<button type="button" class="camel-designer-node' +
                (pathKey(selectedPath) === pathKey(fromPath) ? " is-active" : "") +
                '" data-select-path="' + esc(pathKey(fromPath)) + '">from · ' +
                esc((from && from.uri) || "") + "</button>" +
                renderStepTree(from.steps, fromPath, 1)
            : "";
        $root.html(
            (parseError ? '<div class="alert alert-warning py-2">' + esc(parseError) + "</div>" : "") +
            '<div class="camel-designer-toolbar d-flex flex-wrap gap-2 align-items-center mb-3">' +
                '<div class="flex-grow-1" style="min-width:12rem">' +
                    '<label class="form-label mb-1" for="crd-designer-doc">Document</label>' +
                    '<select class="form-select" id="crd-designer-doc">' + docOptions + "</select></div>" +
                '<select class="form-select flex-grow-0" id="crd-designer-add-doc" style="width:11rem">' +
                    '<option value="">Add document…</option>' +
                    optionsFor(["route", "rest", "from", "onException", "onCompletion", "intercept",
                        "interceptFrom", "interceptSendToEndpoint", "errorHandler", "restConfiguration",
                        "routeConfiguration", "beans"], "") +
                "</select>" +
                '<button class="btn btn-outline-primary flex-grow-0" type="button" id="crd-designer-add-doc-btn">Add</button>' +
                (api && typeof api.onSave === "function"
                    ? '<button class="btn btn-primary flex-grow-0 ms-auto" type="button" id="crd-designer-save">' +
                        '<i class="bi bi-check2 me-1"></i>Save</button>'
                    : "") +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-lg-4">' +
                    '<div class="card h-100"><div class="card-header d-flex justify-content-between align-items-center gap-2">' +
                        '<h3 class="card-title mb-0">Steps</h3>' +
                        '<div class="camel-designer-actions d-flex align-items-center gap-2">' +
                            '<select class="form-select form-select-sm" id="crd-d-add-step">' +
                                processorOptions("") + "</select>" +
                            '<button class="btn btn-sm btn-outline-primary" type="button" id="crd-d-add-step-btn">Add</button>' +
                        "</div></div>" +
                        '<div class="camel-designer-tree" id="crd-d-tree">' + tree + fromTree + "</div>" +
                        '<div class="card-footer py-2">' +
                            '<div class="btn-group btn-group-sm" role="group" aria-label="Reorder steps">' +
                                '<button class="btn btn-outline-secondary" type="button" id="crd-d-up" title="Move up">' +
                                    '<i class="bi bi-arrow-up"></i></button>' +
                                '<button class="btn btn-outline-secondary" type="button" id="crd-d-down" title="Move down">' +
                                    '<i class="bi bi-arrow-down"></i></button>' +
                                '<button class="btn btn-outline-danger" type="button" id="crd-d-remove" title="Remove">' +
                                    '<i class="bi bi-trash"></i></button>' +
                            "</div>" +
                        "</div></div></div>" +
                '<div class="col-lg-8">' +
                    '<div class="card"><div class="card-header"><h3 class="card-title">Configuration</h3></div>' +
                        '<div class="card-body" id="crd-d-inspector">' + inspectorHtml() + "</div></div></div>" +
            "</div>"
        );
        mountExprEditors();
    }

    function bind() {
        const $root = $host();
        $root.off(".crddesigner");
        $root.on("change.crddesigner", "#crd-designer-doc", function () {
            harvest();
            selectedDoc = Number($(this).val()) || 0;
            selectedPath = [selectedDoc, documentKind(currentDoc())];
            render();
            mountGraph();
        });
        $root.on("click.crddesigner", "#crd-designer-add-doc-btn", function () {
            addDocument($root.find("#crd-designer-add-doc").val() || "route");
            $root.find("#crd-designer-add-doc").val("");
        });
        $root.on("click.crddesigner", "#crd-designer-save", function () {
            emit();
            if (api && typeof api.onSave === "function") {
                api.onSave();
            }
        });
        $root.on("click.crddesigner", "[data-select-path]", function () {
            harvest();
            selectedPath = parseSelectPath($(this).attr("data-select-path"));
            if (selectedPath.length) {
                selectedDoc = Number(selectedPath[0]) || 0;
            }
            render();
            if (window.CadminCamelRouteGraph && typeof CadminCamelRouteGraph.selectPath === "function") {
                CadminCamelRouteGraph.selectPath(selectedPath);
            }
        });
        $root.on("click.crddesigner", "#crd-d-add-step-btn", function () {
            insertStep($root.find("#crd-d-add-step").val(), { bodyPath: selectedPath, path: selectedPath });
            $root.find("#crd-d-add-step").val("");
        });
        $root.on("click.crddesigner", "#crd-d-remove", function () {
            removeSelected({ path: selectedPath, bodyPath: selectedPath });
        });
        $root.on("click.crddesigner", "#crd-d-up", function () {
            moveSelected({ path: selectedPath, bodyPath: selectedPath }, -1);
        });
        $root.on("click.crddesigner", "#crd-d-down", function () {
            moveSelected({ path: selectedPath, bodyPath: selectedPath }, 1);
        });
        $root.on("click.crddesigner", "[data-kv-add]", function () {
            harvest();
            const from = ensureFrom(currentDoc());
            const body = selectedPath.length ? selectedBody() : from;
            const target = body && typeof body === "object" ? body : from;
            if (!target.parameters || typeof target.parameters !== "object") {
                target.parameters = {};
            }
            let key = "option";
            let n = 1;
            while (Object.prototype.hasOwnProperty.call(target.parameters, key)) {
                n += 1;
                key = "option" + n;
            }
            target.parameters[key] = "";
            render();
        });
        $root.on("click.crddesigner", "[data-kv-remove]", function () {
            $(this).closest("[data-kv-index]").remove();
            emit();
        });
        $root.on("click.crddesigner", "[data-add-verb]", function () {
            harvest();
            const body = selectedBody() || documentBody(currentDoc());
            const method = $(this).attr("data-add-verb");
            body[method] = asList(body[method]);
            body[method].push({ path: "/", to: "direct:" + method });
            writeYaml();
            render();
        });
        $root.on("click.crddesigner", "[data-verb-remove]", function () {
            harvest();
            const method = $(this).attr("data-verb-method");
            const index = Number($(this).attr("data-verb-remove"));
            const body = selectedBody() || documentBody(currentDoc());
            const list = asList(body[method]);
            list.splice(index, 1);
            body[method] = list;
            writeYaml();
            render();
        });
        $root.on("change.crddesigner", "[data-dataformat]", function () {
            const newName = $(this).val();
            harvest({ skipDataFormat: true });
            const body = selectedBody();
            if (body && typeof body === "object") {
                const previous = dataFormatOf(body);
                const spec = formatSpecOf(newName);
                const next = {};
                const known = {};
                (spec.fields || []).forEach(function (field) {
                    known[field.key] = true;
                });
                Object.keys(previous.config || {}).forEach(function (key) {
                    if (known[key]) {
                        next[key] = previous.config[key];
                    }
                });
                setDataFormat(body, newName, next);
            }
            writeYaml();
            render();
        });
        $root.on("click.crddesigner", "[data-df-nested-add]", function () {
            harvest();
            const body = selectedBody();
            const fmt = dataFormatOf(body || {});
            const key = $(this).attr("data-df-nested-add");
            if (!body || !fmt.name || !key) {
                return;
            }
            const config = Object.assign({}, fmt.config);
            config[key] = asList(config[key]).slice();
            config[key].push({});
            setDataFormat(body, fmt.name, config);
            writeYaml();
            render();
        });
        $root.on("click.crddesigner", "[data-df-nested-remove]", function () {
            harvest();
            const body = selectedBody();
            const fmt = dataFormatOf(body || {});
            const key = $(this).attr("data-df-nested-remove");
            const index = Number($(this).attr("data-df-nested-index"));
            if (!body || !fmt.name || !key || !Number.isFinite(index)) {
                return;
            }
            const config = Object.assign({}, fmt.config);
            config[key] = asList(config[key]).slice();
            config[key].splice(index, 1);
            if (!config[key].length) {
                delete config[key];
            }
            setDataFormat(body, fmt.name, config);
            writeYaml();
            render();
        });
        $root.on("input.crddesigner change.crddesigner",
            "[data-field], [data-uri-scheme], [data-uri-path], [data-kv-key], [data-kv-value], " +
            "[data-expr-lang], [data-df-field], [data-df-item], [data-verb-path], [data-verb-to]",
            emit);
    }

    function mountGraph() {
        if (!window.CadminCamelRouteGraph) {
            return;
        }
        CadminCamelRouteGraph.mount(function () {
            return lastYaml || (api && api.getYaml ? api.getYaml() : "") || "";
        }, {
            prefix: "crd-designer",
            editable: true,
            selectedPathKey: pathKey(selectedPath),
            onSelect: function (node) {
                harvest();
                selectedPath = node.bodyPath || node.path || [];
                if (selectedPath.length) {
                    selectedDoc = Number(selectedPath[0]) || 0;
                }
                render();
                if (typeof CadminCamelRouteGraph.selectPath === "function") {
                    CadminCamelRouteGraph.selectPath(selectedPath);
                }
            },
            onAdd: function (node) {
                const $root = $host();
                insertStep($root.find("#crd-d-add-step").val() || "log", node);
            },
            onDelete: function (node) {
                removeSelected(node);
            },
            onMove: function (node, delta) {
                moveSelected(node, delta);
            }
        });
    }

    function loadFromYaml(text, force) {
        if (applying && !force) {
            return;
        }
        const source = String(text || "");
        if (!force && source === lastYaml) {
            return;
        }
        const parsed = parseDocs(source);
        if (parsed.error && parsed.docs.length === 0 && docs.length) {
            parseError = parsed.error;
            render();
            return;
        }
        parseError = parsed.error;
        docs = parsed.docs.length ? parsed.docs : [{ route: emptyRoute() }];
        selectedDoc = Math.min(selectedDoc, docs.length - 1);
        if (!selectedPath.length) {
            selectedPath = [selectedDoc, documentKind(docs[selectedDoc])];
        }
        lastYaml = source;
        dirty = false;
        render();
    }

    function applyToYaml() {
        if (!docs.length || parseError || !dirty) {
            return;
        }
        emit();
    }

    function mount(selector, options) {
        hostSelector = selector;
        api = options || {};
        bind();
        loadFromYaml(api.getYaml ? api.getYaml() : "", true);
    }

    function destroy() {
        destroyExprEditors();
        $host().off(".crddesigner").empty();
        hostSelector = "";
        api = null;
        docs = [];
        selectedDoc = 0;
        selectedPath = [];
        lastYaml = "";
        parseError = "";
        dirty = false;
    }

    return {
        mount: mount,
        mountGraph: mountGraph,
        syncFromYaml: function (text) { loadFromYaml(text, false); },
        applyToYaml: applyToYaml,
        isApplying: function () { return applying; },
        destroy: destroy
    };
}());
