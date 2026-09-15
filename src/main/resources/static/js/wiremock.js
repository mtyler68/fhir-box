window.CadminWiremock = (function () {
    const URL_FIELDS = ["urlPath", "url", "urlPathPattern", "urlPattern", "urlPathTemplate"];
    const DEFAULT_MAPPING = {
        request: {
            method: "GET",
            urlPath: "/example"
        },
        response: {
            status: 200,
            jsonBody: { ok: true },
            headers: {
                "Content-Type": "application/json"
            }
        }
    };

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function fail(action, xhr) {
        const status = xhr && xhr.status ? xhr.status : "error";
        return action + " failed (" + status + "). Is the WireMock stack running on port 9090?";
    }

    function showJson(value, title) {
        if (!value) {
            return;
        }
        CadminResourceSource.show(value, title || "WireMock");
    }

    function mappingHref(id) {
        return "#/wiremock-mappings/" + encodeURIComponent(id || "");
    }

    function requestHref(id) {
        return "#/wiremock-requests/" + encodeURIComponent(id || "");
    }

    function mappingUrlField(request) {
        const req = request || {};
        for (let i = 0; i < URL_FIELDS.length; i++) {
            if (req[URL_FIELDS[i]]) {
                return URL_FIELDS[i];
            }
        }
        return "urlPath";
    }

    function mappingUrl(mapping) {
        const request = (mapping && mapping.request) || {};
        return request[mappingUrlField(request)] || request.urlTemplate || "—";
    }

    function formatHeaders(headers) {
        return Object.keys(headers || {}).map(function (name) {
            const value = headers[name];
            return name + ": " + (value != null && typeof value === "object"
                ? JSON.stringify(value)
                : String(value));
        }).join("\n");
    }

    function parseHeaders(text) {
        const headers = {};
        String(text || "").split(/\r?\n/).forEach(function (line) {
            const index = line.indexOf(":");
            if (index < 1) {
                return;
            }
            const name = line.slice(0, index).trim();
            const value = line.slice(index + 1).trim();
            if (name) {
                headers[name] = value;
            }
        });
        return headers;
    }

    function responseBodyKind(response) {
        const body = response || {};
        if (body.proxyBaseUrl) {
            return "proxy";
        }
        if (Object.prototype.hasOwnProperty.call(body, "jsonBody")) {
            return "json";
        }
        if (body.base64Body) {
            return "base64";
        }
        if (Object.prototype.hasOwnProperty.call(body, "body")) {
            return "text";
        }
        return "empty";
    }

    function responseBodyText(response) {
        const body = response || {};
        const kind = responseBodyKind(body);
        if (kind === "json") {
            return typeof body.jsonBody === "string"
                ? body.jsonBody
                : JSON.stringify(body.jsonBody, null, 2);
        }
        if (kind === "proxy") {
            return body.proxyBaseUrl || "";
        }
        if (kind === "base64") {
            return body.base64Body || "";
        }
        if (kind === "text") {
            return body.body == null ? "" : String(body.body);
        }
        return "";
    }

    function mappingMethod(mapping) {
        return ((mapping && mapping.request) || {}).method || "ANY";
    }

    function mappingStatus(mapping) {
        const response = (mapping && mapping.response) || {};
        if (response.proxyBaseUrl) {
            return "proxy";
        }
        return response.status != null ? response.status : "—";
    }

    function requestUrl(item) {
        const request = (item && item.request) || {};
        return request.url || request.absoluteUrl || "—";
    }

    function requestStatus(item) {
        const response = (item && item.response) || item.responseDefinition || {};
        return response.status != null ? response.status : "—";
    }

    function matchedMapping(item) {
        if (!item || !item.wasMatched) {
            return null;
        }
        const stub = item.stubMapping;
        if (!stub || !stub.id) {
            return null;
        }
        return stub;
    }

    function mappingLabel(mapping) {
        if (!mapping) {
            return "";
        }
        return mapping.name || mappingUrl(mapping) || mapping.id || "Stub";
    }

    const SKIP_RESPONSE_HEADERS = {
        connection: true,
        "keep-alive": true,
        "proxy-authenticate": true,
        "proxy-authorization": true,
        te: true,
        trailer: true,
        "transfer-encoding": true,
        upgrade: true,
        "content-length": true,
        date: true,
        server: true,
        "matched-stub-id": true,
        "matched-stub-name": true
    };

    function skipResponseHeader(name) {
        return !!SKIP_RESPONSE_HEADERS[String(name || "").toLowerCase()];
    }

    function isHeaderMatcher(value) {
        return !!value && typeof value === "object" && !Array.isArray(value)
            && Object.keys(value).some(function (key) {
                return /^(equalTo|equalToJson|contains|matches|doesNotMatch|absent|caseInsensitive)$/.test(key);
            });
    }

    function headerEntries(headers) {
        const rows = [];
        Object.keys(headers || {}).forEach(function (name) {
            if (skipResponseHeader(name)) {
                return;
            }
            const value = headers[name];
            if (Array.isArray(value)) {
                value.forEach(function (item) {
                    if (item != null && typeof item === "object") {
                        return;
                    }
                    rows.push({ name: name, value: item == null ? "" : String(item) });
                });
                return;
            }
            if (isHeaderMatcher(value)) {
                return;
            }
            rows.push({ name: name, value: value == null ? "" : String(value) });
        });
        return rows;
    }

    function headersFromEntries(entries) {
        const headers = {};
        (entries || []).forEach(function (row) {
            const name = String((row && row.name) || "").trim();
            if (!name || skipResponseHeader(name)) {
                return;
            }
            const value = row && row.value == null ? "" : String(row.value);
            if (!Object.prototype.hasOwnProperty.call(headers, name)) {
                headers[name] = value;
                return;
            }
            const current = headers[name];
            if (Array.isArray(current)) {
                current.push(value);
            } else {
                headers[name] = [current, value];
            }
        });
        return headers;
    }

    function copiedHeaders(headers) {
        return headersFromEntries(headerEntries(headers));
    }

    function mappingFromLogged(item) {
        const request = (item && item.request) || {};
        const response = (item && (item.response || item.responseDefinition)) || {};
        const url = request.url || "";
        const mapping = {
            name: (request.method || "ANY") + " " + requestUrl(item),
            request: {
                method: request.method || "GET"
            },
            response: {
                status: response.status != null ? response.status : 200
            }
        };
        const queryEntries = queryParamEntries(request.queryParams);
        const queryFromUrl = queryEntries.length ? queryEntries : queryEntriesFromUrl(url);
        if (queryFromUrl.length) {
            mapping.request.queryParameters = queryParamsFromEntries(queryFromUrl);
            const path = urlPathOnly(url);
            if (path) {
                mapping.request.urlPath = path;
            }
        } else if (url.indexOf("?") >= 0) {
            mapping.request.url = url;
        } else if (url) {
            mapping.request.urlPath = url;
        }
        if (request.body) {
            try {
                JSON.parse(request.body);
                mapping.request.bodyPatterns = [{
                    equalToJson: request.body,
                    ignoreArrayOrder: true,
                    ignoreExtraElements: true
                }];
            } catch (error) {
                mapping.request.bodyPatterns = [{ equalTo: request.body }];
            }
        }
        const headers = copiedHeaders(response.headers);
        if (Object.keys(headers).length) {
            mapping.response.headers = headers;
        }
        if (Object.prototype.hasOwnProperty.call(response, "jsonBody")) {
            mapping.response.jsonBody = response.jsonBody;
        } else if (response.base64Body) {
            mapping.response.base64Body = response.base64Body;
        } else if (response.body) {
            try {
                mapping.response.jsonBody = JSON.parse(response.body);
            } catch (error) {
                mapping.response.body = response.body;
            }
        }
        return mapping;
    }

    function formatTime(item) {
        const raw = item && item.request && item.request.loggedDateString;
        if (!raw) {
            return "—";
        }
        const date = new Date(raw);
        return isNaN(date.getTime()) ? String(raw) : date.toLocaleString();
    }

    function matchesQuery(text, query) {
        if (!query) {
            return true;
        }
        return String(text || "").toLowerCase().indexOf(query.toLowerCase()) >= 0;
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
    }

    function adminTotal(body, listKey) {
        if (!body) {
            return null;
        }
        if (body.meta && typeof body.meta.total === "number") {
            return body.meta.total;
        }
        const list = body[listKey];
        return Array.isArray(list) ? list.length : null;
    }

    const RESPONSE_HEADER_NAMES = [
        "Content-Type",
        "Content-Disposition",
        "Content-Language",
        "Content-Encoding",
        "Content-Location",
        "Cache-Control",
        "ETag",
        "Expires",
        "Last-Modified",
        "Location",
        "Allow",
        "Link",
        "Vary",
        "Retry-After",
        "Set-Cookie",
        "WWW-Authenticate",
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Methods",
        "Access-Control-Allow-Headers",
        "Access-Control-Allow-Credentials",
        "Access-Control-Expose-Headers",
        "Access-Control-Max-Age",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Content-Security-Policy",
        "X-Request-ID",
        "X-Correlation-ID"
    ];

    const CONTENT_TYPE_VALUES = [
        "application/json",
        "application/json; charset=utf-8",
        "application/fhir+json",
        "application/fhir+xml",
        "application/problem+json",
        "application/xml",
        "application/octet-stream",
        "application/pdf",
        "application/javascript",
        "application/x-www-form-urlencoded",
        "application/jose",
        "application/jwt",
        "text/plain",
        "text/plain; charset=utf-8",
        "text/html",
        "text/html; charset=utf-8",
        "text/csv",
        "text/xml",
        "text/css",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/svg+xml",
        "multipart/form-data"
    ];

    const QUERY_PARAM_MATCHERS = [
        { code: "equalTo", display: "Equal to" },
        { code: "contains", display: "Contains" },
        { code: "doesNotContain", display: "Does not contain" },
        { code: "matches", display: "Matches regex" },
        { code: "doesNotMatch", display: "Does not match regex" },
        { code: "absent", display: "Absent" },
        { code: "custom", display: "Custom JSON" }
    ];
    const QUERY_PARAM_MATCHER_CODES = QUERY_PARAM_MATCHERS.map(function (item) {
        return item.code;
    }).filter(function (code) {
        return code !== "custom";
    });
    const QUERY_PARAM_CASE_MATCHERS = {
        equalTo: true,
        contains: true,
        doesNotContain: true,
        matches: true,
        doesNotMatch: true
    };
    const QUERY_PARAM_NAMES = [
        "_id",
        "_count",
        "_offset",
        "_sort",
        "_format",
        "_pretty",
        "_summary",
        "_elements",
        "_include",
        "_revinclude",
        "_lastUpdated",
        "_total",
        "_profile",
        "_security",
        "_tag",
        "_content",
        "_text",
        "_filter",
        "_has",
        "_type",
        "_includeDeleted",
        "_source",
        "patient",
        "subject",
        "identifier",
        "name",
        "status",
        "date",
        "category",
        "code",
        "encounter",
        "page",
        "limit",
        "offset",
        "q",
        "query",
        "search",
        "id",
        "format"
    ];
    const QUERY_PARAM_VALUE_SUGGEST = {
        _format: [
            "json",
            "xml",
            "application/fhir+json",
            "application/fhir+xml",
            "application/json",
            "application/xml"
        ],
        format: ["json", "xml", "application/json", "application/xml"],
        _pretty: ["true", "false"],
        _summary: ["true", "text", "data", "count", "false"],
        _total: ["none", "estimate", "accurate"],
        _includeDeleted: ["true", "false", "exclusive"],
        _sort: ["_lastUpdated", "-_lastUpdated", "_id"]
    };

    function queryParamValueListId(name) {
        const key = String(name || "").trim();
        if (!Object.prototype.hasOwnProperty.call(QUERY_PARAM_VALUE_SUGGEST, key)) {
            return "";
        }
        return "wmd-query-values-" + key.replace(/[^A-Za-z0-9_-]/g, "_");
    }

    function queryParamSupportsCase(matcher) {
        return !!QUERY_PARAM_CASE_MATCHERS[matcher];
    }

    function queryParamMatcherKind(pattern) {
        if (pattern == null || typeof pattern !== "object" || Array.isArray(pattern)) {
            return "custom";
        }
        const keys = Object.keys(pattern).filter(function (key) {
            return key !== "caseInsensitive";
        });
        if (keys.length === 1 && QUERY_PARAM_MATCHER_CODES.indexOf(keys[0]) >= 0) {
            return keys[0];
        }
        return "custom";
    }

    function queryParamSimpleRow(name, matcher, value, caseInsensitive) {
        return {
            name: name,
            matcher: matcher,
            value: value == null ? "" : String(value),
            caseInsensitive: !!caseInsensitive
        };
    }

    function queryParamCustomRow(name, pattern) {
        return {
            name: name,
            matcher: "custom",
            value: JSON.stringify(pattern && typeof pattern === "object" ? pattern : {}),
            caseInsensitive: false
        };
    }

    function queryParamValueText(value) {
        if (value != null && typeof value === "object") {
            return JSON.stringify(value);
        }
        return String(value == null ? "" : value);
    }

    function isLoggedQueryParameter(pattern, name) {
        if (!pattern || typeof pattern !== "object" || Array.isArray(pattern) || !Array.isArray(pattern.values)) {
            return false;
        }
        const keys = Object.keys(pattern);
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] !== "key" && keys[i] !== "values") {
                return false;
            }
        }
        return pattern.key == null || String(pattern.key) === String(name);
    }

    function queryPatternRows(name, pattern) {
        if (pattern != null && (typeof pattern === "string" || typeof pattern === "number"
                || typeof pattern === "boolean")) {
            return [queryParamSimpleRow(name, "equalTo", pattern, false)];
        }
        if (isLoggedQueryParameter(pattern, name)) {
            if (!pattern.values.length) {
                return [queryParamSimpleRow(name, "equalTo", "", false)];
            }
            return pattern.values.map(function (value) {
                return queryParamSimpleRow(name, "equalTo", value, false);
            });
        }
        const multi = pattern && typeof pattern === "object" && !Array.isArray(pattern)
            ? (Array.isArray(pattern.hasExactly) ? pattern.hasExactly
                : Array.isArray(pattern.includes) ? pattern.includes : null)
            : null;
        if (multi && multi.length) {
            const rows = [];
            for (let i = 0; i < multi.length; i++) {
                const inner = multi[i];
                const kind = queryParamMatcherKind(inner);
                if (kind === "custom") {
                    return [queryParamCustomRow(name, pattern)];
                }
                if (kind === "absent") {
                    rows.push(queryParamSimpleRow(name, "absent", "", false));
                } else {
                    rows.push(queryParamSimpleRow(name, kind, queryParamValueText(inner[kind]),
                        !!inner.caseInsensitive));
                }
            }
            return rows;
        }
        const kind = queryParamMatcherKind(pattern);
        if (kind === "absent") {
            return [queryParamSimpleRow(name, "absent", "", false)];
        }
        if (kind === "custom") {
            return [queryParamCustomRow(name, pattern)];
        }
        return [queryParamSimpleRow(name, kind, queryParamValueText(pattern[kind]),
            !!pattern.caseInsensitive)];
    }

    function queryParamEntries(queryParameters) {
        const rows = [];
        Object.keys(queryParameters || {}).forEach(function (name) {
            queryPatternRows(name, queryParameters[name]).forEach(function (row) {
                rows.push(row);
            });
        });
        return rows;
    }

    function queryParamPatternFromRow(row, noun) {
        const label = noun || "Query parameter";
        const matcher = (row && row.matcher) || "equalTo";
        if (matcher === "absent") {
            return { absent: true };
        }
        if (matcher === "custom") {
            let parsed;
            try {
                parsed = JSON.parse(row.value || "{}");
            } catch (error) {
                throw new Error(label + " \"" + String((row && row.name) || "") + "\" JSON is not valid.");
            }
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error(label + " \"" + String((row && row.name) || "") +
                    "\" JSON must be an object.");
            }
            return parsed;
        }
        const next = {};
        next[matcher] = row.value == null ? "" : String(row.value);
        if (row.caseInsensitive && queryParamSupportsCase(matcher)) {
            next.caseInsensitive = true;
        }
        return next;
    }

    function queryParamsFromEntries(entries, noun) {
        const grouped = [];
        const indexByName = {};
        (entries || []).forEach(function (row) {
            const name = String((row && row.name) || "").trim();
            if (!name) {
                return;
            }
            const pattern = queryParamPatternFromRow(row, noun);
            if (!Object.prototype.hasOwnProperty.call(indexByName, name)) {
                indexByName[name] = grouped.length;
                grouped.push({ name: name, patterns: [pattern] });
                return;
            }
            grouped[indexByName[name]].patterns.push(pattern);
        });
        const params = {};
        grouped.forEach(function (item) {
            params[item.name] = item.patterns.length === 1
                ? item.patterns[0]
                : { hasExactly: item.patterns };
        });
        return params;
    }

    const REQUEST_HEADER_NAMES = [
        "Accept",
        "Accept-Charset",
        "Accept-Encoding",
        "Accept-Language",
        "Authorization",
        "Cache-Control",
        "Content-Type",
        "Content-Encoding",
        "Cookie",
        "Forwarded",
        "Host",
        "If-Match",
        "If-Modified-Since",
        "If-None-Match",
        "If-Unmodified-Since",
        "Origin",
        "Prefer",
        "Range",
        "Referer",
        "User-Agent",
        "X-Requested-With",
        "X-Request-ID",
        "X-Correlation-ID",
        "X-Forwarded-For",
        "X-Forwarded-Host",
        "X-Forwarded-Proto",
        "Idempotency-Key"
    ];
    const REQUEST_HEADER_VALUE_SUGGEST = {
        Accept: [
            "application/json",
            "application/fhir+json",
            "application/xml",
            "application/fhir+xml",
            "application/json, application/fhir+json",
            "*/*"
        ],
        "Content-Type": CONTENT_TYPE_VALUES.slice(),
        Authorization: ["Bearer ", "Basic "],
        Prefer: ["return=minimal", "return=representation", "respond-async"],
        "Cache-Control": ["no-cache", "no-store", "max-age=0"],
        "X-Requested-With": ["XMLHttpRequest"]
    };

    function requestHeaderValueListId(name) {
        const key = String(name || "").trim().toLowerCase();
        if (!key) {
            return "";
        }
        const names = Object.keys(REQUEST_HEADER_VALUE_SUGGEST);
        for (let i = 0; i < names.length; i++) {
            if (names[i].toLowerCase() === key) {
                return "wmd-req-header-values-" + names[i].replace(/[^A-Za-z0-9_-]/g, "_");
            }
        }
        return "";
    }

    function requestHeaderEntries(headers) {
        return queryParamEntries(headers);
    }

    function requestHeadersFromEntries(entries) {
        return queryParamsFromEntries(entries, "Request header");
    }

    function decodeQueryComponent(value) {
        try {
            return decodeURIComponent(String(value || "").replace(/\+/g, " "));
        } catch (error) {
            return String(value || "").replace(/\+/g, " ");
        }
    }

    function queryEntriesFromUrl(url) {
        const raw = String(url || "");
        const index = raw.indexOf("?");
        if (index < 0) {
            return [];
        }
        const search = raw.slice(index + 1);
        const hash = search.indexOf("#");
        const query = hash >= 0 ? search.slice(0, hash) : search;
        if (!query) {
            return [];
        }
        const rows = [];
        query.split("&").forEach(function (part) {
            if (!part) {
                return;
            }
            const eq = part.indexOf("=");
            const name = decodeQueryComponent(eq < 0 ? part : part.slice(0, eq));
            if (!name) {
                return;
            }
            rows.push(queryParamSimpleRow(name, "equalTo",
                decodeQueryComponent(eq < 0 ? "" : part.slice(eq + 1)), false));
        });
        return rows;
    }

    function urlPathOnly(url) {
        const raw = String(url || "");
        const query = raw.indexOf("?");
        return query >= 0 ? raw.slice(0, query) : raw;
    }

    function formatDuration(seconds) {
        if (seconds == null || seconds === "" || seconds < 0) {
            return "—";
        }
        const total = Math.floor(Number(seconds));
        if (isNaN(total)) {
            return "—";
        }
        if (total < 60) {
            return total + "s";
        }
        const minutes = Math.floor(total / 60);
        const rem = total % 60;
        if (minutes < 60) {
            return rem ? minutes + "m " + rem + "s" : minutes + "m";
        }
        const hours = Math.floor(minutes / 60);
        const minRem = minutes % 60;
        if (hours < 24) {
            return minRem ? hours + "h " + minRem + "m" : hours + "h";
        }
        const days = Math.floor(hours / 24);
        const hourRem = hours % 24;
        return hourRem ? days + "d " + hourRem + "h" : days + "d";
    }

    return {
        URL_FIELDS: URL_FIELDS,
        DEFAULT_MAPPING: DEFAULT_MAPPING,
        esc: esc,
        fail: fail,
        showJson: showJson,
        mappingHref: mappingHref,
        requestHref: requestHref,
        mappingUrlField: mappingUrlField,
        mappingUrl: mappingUrl,
        mappingMethod: mappingMethod,
        mappingStatus: mappingStatus,
        formatHeaders: formatHeaders,
        parseHeaders: parseHeaders,
        headerEntries: headerEntries,
        headersFromEntries: headersFromEntries,
        responseBodyKind: responseBodyKind,
        responseBodyText: responseBodyText,
        requestUrl: requestUrl,
        requestStatus: requestStatus,
        matchedMapping: matchedMapping,
        mappingLabel: mappingLabel,
        mappingFromLogged: mappingFromLogged,
        formatTime: formatTime,
        matchesQuery: matchesQuery,
        emptyRow: emptyRow,
        adminTotal: adminTotal,
        formatDuration: formatDuration,
        RESPONSE_HEADER_NAMES: RESPONSE_HEADER_NAMES,
        CONTENT_TYPE_VALUES: CONTENT_TYPE_VALUES,
        QUERY_PARAM_MATCHERS: QUERY_PARAM_MATCHERS,
        QUERY_PARAM_NAMES: QUERY_PARAM_NAMES,
        QUERY_PARAM_VALUE_SUGGEST: QUERY_PARAM_VALUE_SUGGEST,
        queryParamValueListId: queryParamValueListId,
        queryParamSupportsCase: queryParamSupportsCase,
        queryParamEntries: queryParamEntries,
        queryParamsFromEntries: queryParamsFromEntries,
        REQUEST_HEADER_NAMES: REQUEST_HEADER_NAMES,
        REQUEST_HEADER_VALUE_SUGGEST: REQUEST_HEADER_VALUE_SUGGEST,
        requestHeaderValueListId: requestHeaderValueListId,
        requestHeaderEntries: requestHeaderEntries,
        requestHeadersFromEntries: requestHeadersFromEntries
    };
}());
