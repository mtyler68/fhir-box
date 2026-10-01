window.CadminIcgRouteDesigner = (function () {
    function field(key, label, type, extra) {
        return Object.assign({ key: key, label: label || key, type: type || "string" }, extra || {});
    }

    function item(name, description, fields, extra) {
        const list = fields || [];
        return Object.assign({
            name: name,
            description: description || "",
            shortcut: list.filter(function (entry) {
                return !entry.optional && entry.type !== "boolean";
            }).map(function (entry) { return entry.key; }),
            fields: list
        }, extra || {});
    }

    const PREDICATES = [
        item("After", "Match requests after this instant.", [
            field("datetime", "Datetime", "string", { required: true, placeholder: "2026-01-01T00:00:00.000-00:00" })
        ]),
        item("Before", "Match requests before this instant.", [
            field("datetime", "Datetime", "string", { required: true, placeholder: "2026-12-31T23:59:59.000-00:00" })
        ]),
        item("Between", "Match requests between two instants.", [
            field("datetime1", "Start", "string", { required: true }),
            field("datetime2", "End", "string", { required: true })
        ]),
        item("Cookie", "Match a cookie name and optional regexp.", [
            field("name", "Cookie name", "string", { required: true }),
            field("regexp", "Regexp", "string", { optional: true })
        ]),
        item("Header", "Match a request header and optional regexp.", [
            field("header", "Header", "string", { required: true }),
            field("regexp", "Regexp", "string", { optional: true })
        ]),
        item("Host", "Match Host header patterns (Ant-style).", [
            field("patterns", "Patterns", "list", { required: true, placeholder: "*.example.com, api.example.com" })
        ], { shortcutType: "GATHER_LIST" }),
        item("Method", "Match HTTP methods.", [
            field("methods", "Methods", "list", { required: true, placeholder: "GET, POST" })
        ], { shortcutType: "GATHER_LIST" }),
        item("Path", "Match the request path.", [
            field("pattern", "Pattern", "string", { required: true, placeholder: "/Patient/**" }),
            field("matchTrailingSlash", "Match trailing slash", "boolean", { optional: true })
        ], { shortcut: ["pattern"] }),
        item("Query", "Match a query parameter.", [
            field("param", "Parameter", "string", { required: true }),
            field("regexp", "Regexp", "string", { optional: true })
        ]),
        item("RemoteAddr", "Match client CIDR sources.", [
            field("sources", "Sources", "list", { required: true, placeholder: "192.168.1.1/24" })
        ], { shortcutType: "GATHER_LIST" }),
        item("XForwardedRemoteAddr", "Match X-Forwarded-For CIDR sources.", [
            field("sources", "Sources", "list", { required: true })
        ], { shortcutType: "GATHER_LIST" }),
        item("Weight", "Weighted routing within a group.", [
            field("group", "Group", "string", { required: true }),
            field("weight", "Weight", "number", { required: true })
        ]),
        item("ReadBody", "Cache the request body for later predicates/filters.", [
            field("inClass", "Body class", "string", { optional: true, placeholder: "java.lang.String" })
        ]),
        item("Version", "API version predicate.", [
            field("versions", "Versions", "list", { required: true, placeholder: "1.0, 1.1" })
        ]),
        item("CloudFoundryRouteService", "Match Cloud Foundry route-service headers.", [])
    ];

    const nameValue = function (name, description, nameLabel, valueLabel) {
        return item(name, description, [
            field("name", nameLabel || "Name", "string", { required: true }),
            field("value", valueLabel || "Value", "string", { required: true })
        ]);
    };

    const FILTERS = [
        nameValue("AddRequestHeader", "Add a request header. Values may use path-template placeholders."),
        item("AddRequestHeadersIfNotPresent", "Add request headers only when missing.", [
            field("name", "Name", "string", { optional: true }),
            field("value", "Value", "string", { optional: true })
        ]),
        nameValue("AddRequestParameter", "Add a query parameter."),
        nameValue("AddResponseHeader", "Add a response header."),
        item("CacheRequestBody", "Cache the request body.", [
            field("bodyClass", "Body class", "string", { optional: true, placeholder: "java.lang.String" })
        ]),
        item("CircuitBreaker", "Wrap the request in a circuit breaker.", [
            field("name", "Name", "string", { required: true }),
            field("fallbackUri", "Fallback URI", "string", { optional: true, placeholder: "forward:/fallback" }),
            field("statusCodes", "Status codes", "list", { optional: true })
        ]),
        item("DedupeResponseHeader", "Remove duplicate response headers.", [
            field("name", "Header names", "string", { required: true }),
            field("strategy", "Strategy", "select", {
                optional: true,
                options: ["RETAIN_FIRST", "RETAIN_LAST", "RETAIN_UNIQUE"]
            })
        ]),
        item("FallbackHeaders", "Copy circuit-breaker exception details onto fallback headers.", [
            field("executionExceptionTypeHeaderName", "Exception type header", "string", { optional: true }),
            field("executionExceptionMessageHeaderName", "Exception message header", "string", { optional: true }),
            field("rootCauseExceptionTypeHeaderName", "Root-cause type header", "string", { optional: true }),
            field("rootCauseExceptionMessageHeaderName", "Root-cause message header", "string", { optional: true })
        ]),
        item("JsonToGrpc", "Translate JSON to gRPC.", [
            field("protoDescriptor", "Proto descriptor", "string", { required: true }),
            field("protoFile", "Proto file", "string", { required: true }),
            field("service", "Service", "string", { required: true }),
            field("method", "Method", "string", { required: true })
        ]),
        item("LocalResponseCache", "Cache responses locally.", [
            field("timeToLive", "Time to live", "string", { optional: true, placeholder: "10m" }),
            field("size", "Size", "string", { optional: true, placeholder: "5MB" })
        ]),
        item("MapRequestHeader", "Copy one request header onto another.", [
            field("fromHeader", "From header", "string", { required: true }),
            field("toHeader", "To header", "string", { required: true })
        ]),
        item("ModifyRequestBody", "Rewrite the request body (in/out class only; rewrite function is code).", [
            field("inClass", "In class", "string", { optional: true }),
            field("outClass", "Out class", "string", { optional: true })
        ]),
        item("ModifyResponseBody", "Rewrite the response body (in/out class only; rewrite function is code).", [
            field("inClass", "In class", "string", { optional: true }),
            field("outClass", "Out class", "string", { optional: true })
        ]),
        item("PrefixPath", "Prefix the request path.", [
            field("prefix", "Prefix", "string", { required: true, placeholder: "/mypath" })
        ]),
        item("PreserveHostHeader", "Send the original Host header downstream.", []),
        item("RedirectTo", "Redirect with a status and URL.", [
            field("status", "Status", "string", { required: true, placeholder: "302" }),
            field("url", "URL", "string", { required: true }),
            field("includeRequestParams", "Include request params", "boolean", { optional: true })
        ]),
        item("RemoveJsonAttributesResponseBody", "Remove JSON attributes from the response body.", [
            field("attributes", "Attributes", "list", { required: true }),
            field("deleteNullAttributes", "Delete null attributes", "boolean", { optional: true })
        ]),
        item("RemoveRequestHeader", "Remove a request header.", [
            field("name", "Header", "string", { required: true })
        ]),
        item("RemoveRequestParameter", "Remove a query parameter.", [
            field("name", "Parameter", "string", { required: true })
        ]),
        item("RemoveResponseHeader", "Remove a response header.", [
            field("name", "Header", "string", { required: true })
        ]),
        item("RequestHeaderSize", "Limit request header size.", [
            field("maxSize", "Max size", "string", { required: true, placeholder: "16KB" }),
            field("errorHeaderName", "Error header name", "string", { optional: true })
        ]),
        item("RequestHeaderToRequestUri", "Use a request header as the downstream URI.", [
            field("name", "Header", "string", { required: true })
        ]),
        item("RequestRateLimiter", "Built-in rate limiter (ICG prefers ClientRateLimit).", [
            field("redis-rate-limiter.replenishRate", "Replenish rate", "number", { optional: true }),
            field("redis-rate-limiter.burstCapacity", "Burst capacity", "number", { optional: true }),
            field("redis-rate-limiter.requestedTokens", "Requested tokens", "number", { optional: true }),
            field("key-resolver", "Key resolver bean", "string", { optional: true }),
            field("denyEmptyKey", "Deny empty key", "boolean", { optional: true })
        ]),
        item("RequestSize", "Limit request body size.", [
            field("maxSize", "Max size", "string", { required: true, placeholder: "5MB" })
        ]),
        item("Retry", "Retry failed downstream calls.", [
            field("retries", "Retries", "number", { required: true }),
            field("statuses", "Statuses", "list", { optional: true, placeholder: "BAD_GATEWAY, GATEWAY_TIMEOUT" }),
            field("methods", "Methods", "list", { optional: true }),
            field("series", "Series", "list", { optional: true, placeholder: "SERVER_ERROR" }),
            field("exceptions", "Exceptions", "list", { optional: true }),
            field("backoff.firstBackoff", "First backoff", "string", { optional: true, placeholder: "10ms" }),
            field("backoff.maxBackoff", "Max backoff", "string", { optional: true }),
            field("backoff.factor", "Backoff factor", "number", { optional: true }),
            field("backoff.basedOnPreviousValue", "Based on previous value", "boolean", { optional: true })
        ]),
        item("RewriteLocationResponseHeader", "Rewrite the Location response header.", [
            field("stripVersionMode", "Strip version", "select", {
                optional: true,
                options: ["NEVER_STRIP", "AS_IN_REQUEST", "ALWAYS_STRIP"]
            }),
            field("locationHeaderName", "Location header", "string", { optional: true }),
            field("hostValue", "Host value", "string", { optional: true }),
            field("protocolsRegex", "Protocols regexp", "string", { optional: true })
        ]),
        item("RewritePath", "Rewrite the request path with a regexp.", [
            field("regexp", "Regexp", "string", { required: true, placeholder: "/legacy/(?<segment>.*)" }),
            field("replacement", "Replacement", "string", { required: true, placeholder: "/${segment}" })
        ]),
        item("RewriteRequestParameter", "Rewrite a query parameter value.", [
            field("name", "Parameter", "string", { required: true }),
            field("replacement", "Replacement", "string", { required: true })
        ]),
        item("RewriteResponseHeader", "Rewrite a response header with a regexp.", [
            field("name", "Header", "string", { required: true }),
            field("regexp", "Regexp", "string", { required: true }),
            field("replacement", "Replacement", "string", { required: true })
        ]),
        item("SaveSession", "Force WebSession save before forwarding.", []),
        item("SecureHeaders", "Add security response headers. Extra args override individual headers.", []),
        item("SetPath", "Set the path from a template.", [
            field("template", "Template", "string", { required: true, placeholder: "/{segment}" })
        ]),
        nameValue("SetRequestHeader", "Replace a request header."),
        item("SetRequestHostHeader", "Replace the Host header.", [
            field("host", "Host", "string", { required: true })
        ]),
        item("SetRequestUri", "Replace the request URI.", [
            field("uri", "URI", "string", { required: true, placeholder: "https://example.org" })
        ]),
        nameValue("SetResponseHeader", "Replace a response header."),
        item("SetStatus", "Set the HTTP status of the response.", [
            field("status", "Status", "string", { required: true, placeholder: "401" })
        ]),
        item("StripPrefix", "Strip path segments before forwarding.", [
            field("parts", "Parts", "number", { required: true })
        ]),
        item("TokenRelay", "Relay the OAuth2 access token downstream.", []),
        item("JoltTransform", "Transform JSON responses with a FHIR Jolt library.", [
            field("name", "Library name", "string", { required: true }),
            field("version", "Version / range", "string", { required: true, placeholder: "^1.0.0" })
        ], { custom: true }),
        item("ClientRateLimit", "Per-OIDC-client rate limit (YAML fallback when no FHIR policy).", [
            field("endpoint", "Endpoint id", "string", { optional: true }),
            field("requestsPerMinute", "Requests / minute", "number", { optional: true }),
            field("requestsPerDay", "Requests / day", "number", { optional: true }),
            field("requestsPerSecond", "Requests / second", "number", { optional: true })
        ], {
            custom: true,
            shortcut: ["endpoint", "requestsPerMinute", "requestsPerDay", "requestsPerSecond"]
        }),
        item("RequireQueryParam", "Reject requests missing a required query parameter.", [
            field("paramName", "Parameter name", "string", { required: true })
        ], { custom: true })
    ];

    const CUSTOM = "Custom";
    const predicateByName = indexByName(PREDICATES);
    const filterByName = indexByName(FILTERS);
    let hostSelector = "";
    let api = null;
    let routes = [];
    let selected = 0;
    let lastYaml = "";
    let parseError = "";
    let applying = false;
    let dirty = false;

    function indexByName(list) {
        const map = {};
        list.forEach(function (entry) { map[entry.name] = entry; });
        return map;
    }

    function specFor(kind, name) {
        if (!name || name === CUSTOM) {
            return { name: name || CUSTOM, fields: [], shortcut: [], custom: true };
        }
        return (kind === "predicate" ? predicateByName : filterByName)[name]
            || { name: name, fields: [], shortcut: [], unknown: true };
    }

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function emptyRoute() {
        return {
            id: "",
            uri: "",
            order: "",
            metadata: [],
            predicates: [{ name: "Path", args: { pattern: "/**" } }],
            filters: []
        };
    }

    function asString(value) {
        if (value == null) {
            return "";
        }
        if (Array.isArray(value)) {
            return value.map(function (item) { return String(item); }).join(", ");
        }
        return String(value);
    }

    function coerceArg(field, value) {
        if (value == null) {
            return "";
        }
        if (!field) {
            return asString(value);
        }
        if (field.type === "boolean") {
            return value === true || value === "true";
        }
        if (field.type === "number") {
            return value;
        }
        return asString(value);
    }

    function namedArgs(spec, raw) {
        const args = {};
        Object.keys(raw || {}).forEach(function (key) {
            args[key] = raw[key];
        });
        const shortcut = spec.shortcut || [];
        shortcut.forEach(function (key, index) {
            const gen = "_genkey_" + index;
            if (args[gen] != null && (args[key] == null || args[key] === "")) {
                args[key] = args[gen];
                delete args[gen];
            }
        });
        if (spec.name === "Path" && args.patterns != null && args.pattern == null) {
            args.pattern = asString(args.patterns);
            delete args.patterns;
        }
        if (spec.name === "Host" && args.pattern != null && args.patterns == null) {
            args.patterns = args.pattern;
            delete args.pattern;
        }
        if (spec.name === "Method" && args.methods == null) {
            if (args.pattern != null) {
                args.methods = args.pattern;
                delete args.pattern;
            } else if (args.patterns != null) {
                args.methods = args.patterns;
                delete args.patterns;
            }
        }
        if (spec.name === "Weight" && args.weightGroup != null && args.group == null) {
            args.group = args.weightGroup;
            delete args.weightGroup;
        }
        if (spec.name === "SetRequestUri" && args.template != null && args.uri == null) {
            args.uri = args.template;
            delete args.template;
        }
        const known = {};
        (spec.fields || []).forEach(function (entry) {
            known[entry.key] = true;
            if (args[entry.key] != null) {
                args[entry.key] = coerceArg(entry, args[entry.key]);
            }
        });
        Object.keys(args).forEach(function (key) {
            if (!known[key] && /^_genkey_/.test(key)) {
                const index = Number(key.replace("_genkey_", ""));
                const mapped = shortcut[index];
                if (mapped && args[mapped] == null) {
                    args[mapped] = args[key];
                    delete args[key];
                }
            }
        });
        return args;
    }

    function parseShortcut(text, kind) {
        const source = String(text || "").trim();
        const eq = source.indexOf("=");
        const name = eq < 0 ? source : source.slice(0, eq).trim();
        const raw = eq < 0 ? "" : source.slice(eq + 1);
        const spec = specFor(kind, name);
        const args = {};
        if (!raw) {
            return { name: name, args: args };
        }
        if (spec.shortcutType === "GATHER_LIST" && spec.shortcut[0]) {
            args[spec.shortcut[0]] = raw;
            return { name: name, args: namedArgs(spec, args) };
        }
        const fields = spec.shortcut.length ? spec.shortcut : spec.fields.map(function (entry) { return entry.key; });
        if (fields.length <= 1) {
            if (fields[0]) {
                args[fields[0]] = raw;
            } else {
                args._genkey_0 = raw;
            }
            return { name: name, args: namedArgs(spec, args) };
        }
        const parts = [];
        let current = "";
        let inQuote = false;
        for (let i = 0; i < raw.length; i += 1) {
            const ch = raw.charAt(i);
            if (ch === '"' || ch === "'") {
                inQuote = !inQuote;
                current += ch;
            } else if (ch === "," && !inQuote) {
                parts.push(current.trim());
                current = "";
            } else {
                current += ch;
            }
        }
        if (current.length || parts.length) {
            parts.push(current.trim());
        }
        fields.forEach(function (key, index) {
            if (parts[index] != null && parts[index] !== "") {
                args[key] = parts[index];
            }
        });
        return { name: name, args: namedArgs(spec, args) };
    }

    function parseNamed(raw, kind) {
        if (raw == null) {
            return [];
        }
        const items = Array.isArray(raw) ? raw : [raw];
        return items.map(function (item) {
            if (typeof item === "string") {
                return parseShortcut(item, kind);
            }
            if (!item || typeof item !== "object") {
                return { name: CUSTOM, args: {} };
            }
            if (item.name) {
                const spec = specFor(kind, String(item.name).trim());
                return { name: spec.name, args: namedArgs(spec, flattenArgs(item.args)) };
            }
            const keys = Object.keys(item);
            if (keys.length !== 1) {
                return { name: CUSTOM, args: flattenArgs(item) };
            }
            const name = keys[0];
            const value = item[name];
            if (value == null) {
                return parseShortcut(name, kind);
            }
            if (typeof value !== "object") {
                return parseShortcut(name + "=" + value, kind);
            }
            const spec = specFor(kind, name);
            return { name: name, args: namedArgs(spec, flattenArgs(value)) };
        });
    }

    function flattenArgs(raw) {
        const args = {};
        if (raw == null) {
            return args;
        }
        if (Array.isArray(raw)) {
            raw.forEach(function (value, index) {
                args["_genkey_" + index] = value;
            });
            return args;
        }
        if (typeof raw !== "object") {
            args._genkey_0 = raw;
            return args;
        }
        Object.keys(raw).forEach(function (key) {
            const value = raw[key];
            if (value != null && typeof value === "object" && !Array.isArray(value)) {
                Object.keys(value).forEach(function (child) {
                    args[key + "." + child] = value[child];
                });
            } else {
                args[key] = value;
            }
        });
        return args;
    }

    function parseMetadata(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            return [];
        }
        return Object.keys(raw).map(function (key) {
            return { key: key, value: raw[key] == null ? "" : String(raw[key]) };
        });
    }

    function parseRoute(raw) {
        const route = emptyRoute();
        if (!raw || typeof raw !== "object") {
            return route;
        }
        route.id = raw.id == null ? "" : String(raw.id);
        route.uri = raw.uri == null ? "" : String(raw.uri);
        route.order = raw.order == null || raw.order === "" ? "" : String(raw.order);
        route.metadata = parseMetadata(raw.metadata);
        route.predicates = parseNamed(raw.predicates, "predicate");
        route.filters = parseNamed(raw.filters, "filter");
        if (!route.predicates.length) {
            route.predicates = [{ name: "Path", args: { pattern: "/**" } }];
        }
        return route;
    }

    function parseYaml(text) {
        if (typeof jsyaml === "undefined") {
            return { error: "YAML parser is not loaded.", routes: [] };
        }
        const source = String(text || "").trim();
        if (!source) {
            return { error: "", routes: [emptyRoute()] };
        }
        try {
            const loaded = jsyaml.load(source);
            let items = [];
            if (Array.isArray(loaded)) {
                items = loaded;
            } else if (loaded && typeof loaded === "object") {
                if (Array.isArray(loaded.routes)) {
                    items = loaded.routes;
                } else if (loaded.id || loaded.uri) {
                    items = [loaded];
                }
            }
            if (!items.length) {
                return { error: "YAML must be a list of routes or a map with a routes key.", routes: [] };
            }
            return {
                error: "",
                routes: items.map(function (item) { return parseRoute(item); })
            };
        } catch (err) {
            return { error: (err && err.message) || "Invalid YAML.", routes: [] };
        }
    }

    function dumpValue(field, value) {
        if (value == null || value === "") {
            return undefined;
        }
        if (!field) {
            if (value === "true") {
                return true;
            }
            if (value === "false") {
                return false;
            }
            if (/^-?\d+(\.\d+)?$/.test(String(value))) {
                return Number(value);
            }
            return value;
        }
        if (field.type === "boolean") {
            return value === true || value === "true";
        }
        if (field.type === "number") {
            const number = Number(value);
            return Number.isFinite(number) ? number : value;
        }
        return asString(value);
    }

    function dumpNamed(kind, entries) {
        return (entries || []).map(function (entry) {
            const spec = specFor(kind, entry.name);
            const args = {};
            Object.keys(entry.args || {}).forEach(function (key) {
                const field = (spec.fields || []).find(function (item) { return item.key === key; });
                const dumped = dumpValue(field, entry.args[key]);
                if (field && field.type === "boolean") {
                    if (dumped === true) {
                        args[key] = true;
                    }
                    return;
                }
                if (dumped === undefined || dumped === "") {
                    return;
                }
                args[key] = dumped;
            });
            if (spec.name === "Path" && args.pattern) {
                args.pattern = String(args.pattern);
            }
            const node = { name: entry.name || CUSTOM };
            if (Object.keys(args).length) {
                node.args = args;
            }
            return node;
        }).filter(function (entry) { return entry.name; });
    }

    function dumpMetadata(rows) {
        const map = {};
        (rows || []).forEach(function (row) {
            const key = String(row.key || "").trim();
            if (!key) {
                return;
            }
            map[key] = row.value == null ? "" : row.value;
        });
        return Object.keys(map).length ? map : undefined;
    }

    function dumpRoutes(list) {
        return (list || []).map(function (route) {
            const node = {
                id: String(route.id || "").trim() || "route",
                uri: String(route.uri || "").trim()
            };
            if (route.order !== "" && route.order != null) {
                const order = Number(route.order);
                node.order = Number.isFinite(order) ? order : route.order;
            }
            const metadata = dumpMetadata(route.metadata);
            if (metadata) {
                node.metadata = metadata;
            }
            node.predicates = dumpNamed("predicate", route.predicates);
            const filters = dumpNamed("filter", route.filters);
            if (filters.length) {
                node.filters = filters;
            }
            return node;
        });
    }

    function dumpYaml(list) {
        if (typeof jsyaml === "undefined") {
            return "";
        }
        return jsyaml.dump(dumpRoutes(list), {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            quotingType: '"',
            forceQuotes: false
        }).replace(/\s+$/, "") + "\n";
    }

    function $host() {
        return hostSelector ? $(hostSelector) : $();
    }

    function current() {
        if (!routes.length) {
            routes = [emptyRoute()];
            selected = 0;
        }
        if (selected < 0 || selected >= routes.length) {
            selected = 0;
        }
        return routes[selected];
    }

    function optionsHtml(list, selectedName, includeCustom) {
        const groups = [];
        const builtin = list.filter(function (entry) { return !entry.custom; });
        const custom = list.filter(function (entry) { return entry.custom; });
        function opts(items) {
            return items.map(function (entry) {
                const mark = entry.name === selectedName ? " selected" : "";
                return '<option value="' + esc(entry.name) + '"' + mark + ">" + esc(entry.name) + "</option>";
            }).join("");
        }
        groups.push('<option value="">Select…</option>');
        if (custom.length) {
            groups.push('<optgroup label="ICG">' + opts(custom) + "</optgroup>");
        }
        groups.push('<optgroup label="Spring Cloud Gateway">' + opts(builtin) + "</optgroup>");
        if (includeCustom) {
            groups.push('<option value="' + CUSTOM + '"' + (selectedName === CUSTOM ? " selected" : "") + ">Custom…</option>");
        }
        if (selectedName && selectedName !== CUSTOM && !list.some(function (entry) { return entry.name === selectedName; })) {
            groups.push('<option value="' + esc(selectedName) + '" selected>' + esc(selectedName) + "</option>");
        }
        return groups.join("");
    }

    function extraKeys(spec, args) {
        const known = {};
        (spec.fields || []).forEach(function (entry) { known[entry.key] = true; });
        return Object.keys(args || {}).filter(function (key) { return !known[key]; });
    }

    function inputControl(kind, index, spec, args, entry) {
        const id = "ird-d-" + kind + "-" + index + "-" + entry.key.replace(/\./g, "-");
        const value = args[entry.key];
        const common = 'class="form-control form-control-sm" data-arg="' + esc(entry.key) + '" id="' + id + '"';
        if (entry.type === "boolean") {
            const on = value === true || value === "true";
            return '<div class="form-check form-switch mb-0">' +
                '<input class="form-check-input" type="checkbox" role="switch" data-arg="' + esc(entry.key) +
                    '" id="' + id + '"' + (on ? " checked" : "") + ">" +
                "</div>";
        }
        if (entry.type === "select") {
            const options = (entry.options || []).map(function (opt) {
                const mark = String(value || "") === opt ? " selected" : "";
                return '<option value="' + esc(opt) + '"' + mark + ">" + esc(opt) + "</option>";
            }).join("");
            return '<select ' + common + '><option value=""></option>' + options + "</select>";
        }
        if (entry.type === "number") {
            return '<input type="number" ' + common + ' value="' + esc(value == null ? "" : value) + '"' +
                (entry.placeholder ? ' placeholder="' + esc(entry.placeholder) + '"' : "") + ">";
        }
        return '<input ' + common + ' value="' + esc(value == null ? "" : value) + '"' +
            (entry.placeholder ? ' placeholder="' + esc(entry.placeholder) + '"' : "") + ">";
    }

    function namedEditor(kind, entries) {
        if (!entries.length) {
            return '<div class="text-muted small mb-2">None yet.</div>';
        }
        return entries.map(function (entry, index) {
            const spec = specFor(kind, entry.name);
            const catalog = kind === "predicate" ? PREDICATES : FILTERS;
            const extras = extraKeys(spec, entry.args);
            const badge = spec.custom
                ? '<span class="badge text-bg-info">ICG</span>'
                : (spec.unknown ? '<span class="badge text-bg-secondary">Custom</span>' : "");
            const fields = (spec.fields || []).map(function (item) {
                return '<div class="col-md-6 mb-2">' +
                    '<label class="form-label small mb-1" for="ird-d-' + kind + "-" + index + "-" +
                        esc(item.key.replace(/\./g, "-")) + '">' + esc(item.label) +
                        (item.required ? ' <span class="text-danger">*</span>' : "") + "</label>" +
                    inputControl(kind, index, spec, entry.args, item) +
                    "</div>";
            }).join("");
            const extraRows = extras.map(function (key) {
                return '<div class="row g-2 align-items-center mb-1" data-extra-row="' + esc(key) + '">' +
                    '<div class="col-5"><input class="form-control form-control-sm" data-extra-key value="' +
                        esc(key) + '"></div>' +
                    '<div class="col"><input class="form-control form-control-sm" data-extra-value value="' +
                        esc(entry.args[key] == null ? "" : entry.args[key]) + '"></div>' +
                    '<div class="col-auto"><button class="btn btn-sm btn-outline-danger" type="button" data-extra-remove="' +
                        esc(key) + '"><i class="bi bi-x"></i></button></div>' +
                    "</div>";
            }).join("");
            return '<div class="icg-designer-item" data-kind="' + kind + '" data-index="' + index + '">' +
                '<div class="icg-designer-item-head">' +
                    '<select class="form-select form-select-sm" data-named-name style="max-width:16rem">' +
                        optionsHtml(catalog, entry.name, true) + "</select>" +
                    badge +
                    '<div class="ms-auto btn-group btn-group-sm">' +
                        '<button class="btn btn-outline-secondary" type="button" data-named-up title="Move up">' +
                            '<i class="bi bi-arrow-up"></i></button>' +
                        '<button class="btn btn-outline-secondary" type="button" data-named-down title="Move down">' +
                            '<i class="bi bi-arrow-down"></i></button>' +
                        '<button class="btn btn-outline-danger" type="button" data-named-remove title="Remove">' +
                            '<i class="bi bi-trash"></i></button>' +
                    "</div>" +
                "</div>" +
                (spec.description ? '<div class="small text-muted mb-2">' + esc(spec.description) + "</div>" : "") +
                (spec.name === CUSTOM || spec.unknown
                    ? '<div class="mb-2"><label class="form-label small">Name</label>' +
                        '<input class="form-control form-control-sm" data-custom-name value="' +
                        esc(entry.name === CUSTOM ? "" : entry.name) + '" placeholder="Factory name"></div>'
                    : "") +
                '<div class="row">' + fields + "</div>" +
                '<div class="mt-1" data-extra-host>' + extraRows + "</div>" +
                '<button class="btn btn-sm btn-outline-secondary" type="button" data-extra-add>Add argument</button>' +
            "</div>";
        }).join("");
    }

    function metadataEditor(rows) {
        const body = (rows || []).map(function (row, index) {
            return '<div class="row g-2 align-items-center mb-1" data-meta-index="' + index + '">' +
                '<div class="col-5"><input class="form-control form-control-sm" data-meta-key placeholder="Key" value="' +
                    esc(row.key) + '"></div>' +
                '<div class="col"><input class="form-control form-control-sm" data-meta-value placeholder="Value" value="' +
                    esc(row.value) + '"></div>' +
                '<div class="col-auto"><button class="btn btn-sm btn-outline-danger" type="button" data-meta-remove="' +
                    index + '"><i class="bi bi-x"></i></button></div>' +
                "</div>";
        }).join("");
        return (body || '<div class="text-muted small mb-2">No metadata.</div>') +
            '<button class="btn btn-sm btn-outline-secondary" type="button" data-meta-add>Add metadata</button>';
    }

    function render() {
        const $root = $host();
        if (!$root.length) {
            return;
        }
        const route = current();
        const routeOptions = routes.map(function (item, index) {
            const label = (item.id || "Route " + (index + 1)) + (item.uri ? " · " + item.uri : "");
            return '<option value="' + index + '"' + (index === selected ? " selected" : "") + ">" +
                esc(label) + "</option>";
        }).join("");
        $root.html(
            (parseError
                ? '<div class="alert alert-warning py-2">' + esc(parseError) +
                    " Showing the last valid designer state.</div>"
                : "") +
            '<div class="d-flex flex-wrap gap-2 align-items-end mb-3">' +
                '<div class="flex-grow-1" style="min-width:12rem">' +
                    '<label class="form-label mb-1" for="ird-designer-route">Route</label>' +
                    '<select class="form-select" id="ird-designer-route">' + routeOptions + "</select>" +
                "</div>" +
                '<button class="btn btn-outline-primary" type="button" id="ird-designer-add-route">Add route</button>' +
                '<button class="btn btn-outline-secondary" type="button" id="ird-designer-dup-route">Duplicate</button>' +
                '<button class="btn btn-outline-danger" type="button" id="ird-designer-del-route"' +
                    (routes.length < 2 ? " disabled" : "") + ">Remove</button>" +
                (api && typeof api.onSave === "function"
                    ? '<button class="btn btn-primary ms-auto" type="button" id="ird-designer-save">' +
                        '<i class="bi bi-check2 me-1"></i>Save</button>'
                    : "") +
            "</div>" +
            '<div class="card mb-3">' +
                '<div class="card-header"><h3 class="card-title">Route</h3></div>' +
                '<div class="card-body">' +
                    '<div class="row">' +
                        '<div class="col-md-4 mb-3"><label class="form-label" for="ird-d-id">Id</label>' +
                            '<input class="form-control" id="ird-d-id" value="' + esc(route.id) + '"></div>' +
                        '<div class="col-md-6 mb-3"><label class="form-label" for="ird-d-uri">URI</label>' +
                            '<input class="form-control font-monospace" id="ird-d-uri" value="' + esc(route.uri) +
                            '" placeholder="https://httpbin.org"></div>' +
                        '<div class="col-md-2 mb-3"><label class="form-label" for="ird-d-order">Order</label>' +
                            '<input class="form-control" type="number" id="ird-d-order" value="' +
                            esc(route.order) + '"></div>' +
                    "</div>" +
                    '<div class="small text-muted">Spring Cloud Gateway route properties. URI may include <code>${...}</code> placeholders.</div>' +
                "</div>" +
            "</div>" +
            '<div class="card mb-3">' +
                '<div class="card-header"><h3 class="card-title">Metadata</h3></div>' +
                '<div class="card-body" id="ird-d-metadata">' + metadataEditor(route.metadata) + "</div>" +
            "</div>" +
            '<div class="card mb-3">' +
                '<div class="card-header d-flex justify-content-between align-items-center">' +
                    '<h3 class="card-title mb-0">Predicates</h3>' +
                    '<div class="d-flex gap-2">' +
                        '<select class="form-select form-select-sm" id="ird-d-add-predicate" style="max-width:16rem">' +
                            optionsHtml(PREDICATES, "", false) + "</select>" +
                        '<button class="btn btn-sm btn-outline-primary" type="button" id="ird-d-add-predicate-btn">Add</button>' +
                    "</div>" +
                "</div>" +
                '<div class="card-body" data-named-host="predicate">' + namedEditor("predicate", route.predicates) + "</div>" +
            "</div>" +
            '<div class="card">' +
                '<div class="card-header d-flex justify-content-between align-items-center">' +
                    '<h3 class="card-title mb-0">Filters</h3>' +
                    '<div class="d-flex gap-2">' +
                        '<select class="form-select form-select-sm" id="ird-d-add-filter" style="max-width:16rem">' +
                            optionsHtml(FILTERS, "", false) + "</select>" +
                        '<button class="btn btn-sm btn-outline-primary" type="button" id="ird-d-add-filter-btn">Add</button>' +
                    "</div>" +
                "</div>" +
                '<div class="card-body" data-named-host="filter">' + namedEditor("filter", route.filters) + "</div>" +
            "</div>"
        );
    }

    function harvest() {
        const route = current();
        const $root = $host();
        route.id = $root.find("#ird-d-id").val() || "";
        route.uri = $root.find("#ird-d-uri").val() || "";
        route.order = $root.find("#ird-d-order").val() || "";
        const metadata = [];
        $root.find("[data-meta-index]").each(function () {
            metadata.push({
                key: $(this).find("[data-meta-key]").val() || "",
                value: $(this).find("[data-meta-value]").val() || ""
            });
        });
        route.metadata = metadata;
        ["predicate", "filter"].forEach(function (kind) {
            const list = kind === "predicate" ? route.predicates : route.filters;
            $root.find('[data-kind="' + kind + '"]').each(function (index) {
                const $item = $(this);
                const entry = list[index];
                if (!entry) {
                    return;
                }
                let name = $item.find("[data-named-name]").val() || entry.name;
                if (name === CUSTOM) {
                    name = ($item.find("[data-custom-name]").val() || "").trim() || CUSTOM;
                }
                const spec = specFor(kind, name === CUSTOM ? entry.name : name);
                const args = {};
                $item.find("[data-arg]").each(function () {
                    const key = $(this).attr("data-arg");
                    if ($(this).is(":checkbox")) {
                        args[key] = this.checked;
                    } else {
                        args[key] = $(this).val();
                    }
                });
                $item.find("[data-extra-row]").each(function () {
                    const key = ($(this).find("[data-extra-key]").val() || "").trim();
                    if (!key) {
                        return;
                    }
                    args[key] = $(this).find("[data-extra-value]").val() || "";
                });
                entry.name = name;
                entry.args = args;
            });
        });
    }

    function writeYaml() {
        parseError = "";
        const yaml = dumpYaml(routes);
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
    }

    function emit() {
        harvest();
        writeYaml();
    }

    function moveItem(kind, index, delta) {
        const route = current();
        const list = kind === "predicate" ? route.predicates : route.filters;
        const dest = index + delta;
        if (dest < 0 || dest >= list.length) {
            return;
        }
        const item = list.splice(index, 1)[0];
        list.splice(dest, 0, item);
        writeYaml();
        render();
    }

    function addNamed(kind, name) {
        if (!name) {
            return;
        }
        harvest();
        const spec = specFor(kind, name);
        const args = {};
        (spec.fields || []).forEach(function (entry) {
            if (entry.type === "boolean") {
                args[entry.key] = false;
            }
        });
        const route = current();
        const list = kind === "predicate" ? route.predicates : route.filters;
        list.push({ name: name, args: args });
        writeYaml();
        render();
    }

    function bind() {
        const $root = $host();
        $root.off(".irddesigner");
        $root.on("change.irddesigner", "#ird-designer-route", function () {
            harvest();
            selected = Number($(this).val()) || 0;
            render();
        });
        $root.on("click.irddesigner", "#ird-designer-add-route", function () {
            harvest();
            routes.push(emptyRoute());
            selected = routes.length - 1;
            writeYaml();
            render();
        });
        $root.on("click.irddesigner", "#ird-designer-dup-route", function () {
            harvest();
            const copy = clone(current());
            copy.id = (copy.id || "route") + "-copy";
            routes.splice(selected + 1, 0, copy);
            selected += 1;
            writeYaml();
            render();
        });
        $root.on("click.irddesigner", "#ird-designer-del-route", function () {
            if (routes.length < 2) {
                return;
            }
            harvest();
            routes.splice(selected, 1);
            selected = Math.min(selected, routes.length - 1);
            writeYaml();
            render();
        });
        $root.on("click.irddesigner", "#ird-designer-save", function () {
            emit();
            if (api && typeof api.onSave === "function") {
                api.onSave();
            }
        });
        $root.on("input.irddesigner change.irddesigner", "#ird-d-id, #ird-d-uri, #ird-d-order", function () {
            emit();
            const $select = $root.find("#ird-designer-route option").eq(selected);
            const route = current();
            $select.text((route.id || "Route " + (selected + 1)) + (route.uri ? " · " + route.uri : ""));
        });
        $root.on("click.irddesigner", "[data-meta-add]", function () {
            harvest();
            current().metadata.push({ key: "", value: "" });
            render();
        });
        $root.on("click.irddesigner", "[data-meta-remove]", function () {
            harvest();
            current().metadata.splice(Number($(this).attr("data-meta-remove")), 1);
            writeYaml();
            render();
        });
        $root.on("input.irddesigner", "[data-meta-key], [data-meta-value]", emit);
        $root.on("click.irddesigner", "#ird-d-add-predicate-btn", function () {
            addNamed("predicate", $root.find("#ird-d-add-predicate").val());
            $root.find("#ird-d-add-predicate").val("");
        });
        $root.on("click.irddesigner", "#ird-d-add-filter-btn", function () {
            addNamed("filter", $root.find("#ird-d-add-filter").val());
            $root.find("#ird-d-add-filter").val("");
        });
        $root.on("change.irddesigner", "[data-named-name]", function () {
            harvest();
            const $item = $(this).closest(".icg-designer-item");
            const kind = $item.attr("data-kind");
            const index = Number($item.attr("data-index"));
            const list = kind === "predicate" ? current().predicates : current().filters;
            const name = $(this).val();
            list[index] = { name: name, args: {} };
            writeYaml();
            render();
        });
        $root.on("click.irddesigner", "[data-named-remove]", function () {
            harvest();
            const $item = $(this).closest(".icg-designer-item");
            const kind = $item.attr("data-kind");
            const index = Number($item.attr("data-index"));
            const list = kind === "predicate" ? current().predicates : current().filters;
            if (kind === "predicate" && list.length < 2) {
                CadminApi.showToast("danger", "A route needs at least one predicate.");
                return;
            }
            list.splice(index, 1);
            writeYaml();
            render();
        });
        $root.on("click.irddesigner", "[data-named-up]", function () {
            harvest();
            const $item = $(this).closest(".icg-designer-item");
            moveItem($item.attr("data-kind"), Number($item.attr("data-index")), -1);
        });
        $root.on("click.irddesigner", "[data-named-down]", function () {
            harvest();
            const $item = $(this).closest(".icg-designer-item");
            moveItem($item.attr("data-kind"), Number($item.attr("data-index")), 1);
        });
        $root.on("input.irddesigner change.irddesigner", "[data-arg], [data-custom-name], [data-extra-key], [data-extra-value]", emit);
        $root.on("click.irddesigner", "[data-extra-add]", function () {
            harvest();
            const $item = $(this).closest(".icg-designer-item");
            const kind = $item.attr("data-kind");
            const index = Number($item.attr("data-index"));
            const entry = (kind === "predicate" ? current().predicates : current().filters)[index];
            let key = "arg";
            let n = 1;
            while (Object.prototype.hasOwnProperty.call(entry.args, key)) {
                n += 1;
                key = "arg" + n;
            }
            entry.args[key] = "";
            render();
        });
        $root.on("click.irddesigner", "[data-extra-remove]", function () {
            harvest();
            const $item = $(this).closest(".icg-designer-item");
            const kind = $item.attr("data-kind");
            const index = Number($item.attr("data-index"));
            const entry = (kind === "predicate" ? current().predicates : current().filters)[index];
            delete entry.args[$(this).attr("data-extra-remove")];
            writeYaml();
            render();
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
        const parsed = parseYaml(source);
        if (parsed.error && parsed.routes.length === 0 && routes.length) {
            parseError = parsed.error;
            render();
            return;
        }
        parseError = parsed.error;
        routes = parsed.routes.length ? parsed.routes : [emptyRoute()];
        selected = Math.min(selected, routes.length - 1);
        lastYaml = source;
        dirty = false;
        render();
    }

    function applyToYaml() {
        if (!routes.length || parseError || !dirty) {
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
        $host().off(".irddesigner").empty();
        hostSelector = "";
        api = null;
        routes = [];
        selected = 0;
        lastYaml = "";
        parseError = "";
        dirty = false;
    }

    return {
        predicates: PREDICATES,
        filters: FILTERS,
        parseYaml: parseYaml,
        dumpYaml: dumpYaml,
        mount: mount,
        syncFromYaml: function (text) { loadFromYaml(text, false); },
        applyToYaml: applyToYaml,
        isApplying: function () { return applying; },
        destroy: destroy
    };
}());
