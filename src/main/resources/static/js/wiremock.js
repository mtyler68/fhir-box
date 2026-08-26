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
        server: true
    };

    function copiedHeaders(headers) {
        const next = {};
        Object.keys(headers || {}).forEach(function (name) {
            if (SKIP_RESPONSE_HEADERS[name.toLowerCase()]) {
                return;
            }
            const value = headers[name];
            next[name] = Array.isArray(value) ? value.join(", ") : value;
        });
        return next;
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
        if (url.indexOf("?") >= 0) {
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
        responseBodyKind: responseBodyKind,
        responseBodyText: responseBodyText,
        requestUrl: requestUrl,
        requestStatus: requestStatus,
        matchedMapping: matchedMapping,
        mappingLabel: mappingLabel,
        mappingFromLogged: mappingFromLogged,
        formatTime: formatTime,
        matchesQuery: matchesQuery,
        emptyRow: emptyRow
    };
}());
