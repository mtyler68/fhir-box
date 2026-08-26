window.CadminFhirJsonSource = (function () {
    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function parseJson(text) {
        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }

    function pretty(value) {
        return JSON.stringify(value, null, 2);
    }

    function bodyFromXhr(xhr, body) {
        if (body && typeof body === "object") {
            return body;
        }
        if (xhr && xhr.responseJSON && typeof xhr.responseJSON === "object") {
            return xhr.responseJSON;
        }
        const text = xhr && xhr.responseText;
        return text ? parseJson(text) : null;
    }

    function outcomeFrom(body) {
        if (!body || typeof body !== "object") {
            return null;
        }
        if (body.resourceType === "OperationOutcome") {
            return body;
        }
        if (body.resourceType === "Parameters") {
            const match = (body.parameter || []).find(function (param) {
                return param && (param.name === "issues" || param.name === "outcome") && param.resource;
            });
            return match ? match.resource : null;
        }
        return null;
    }

    function issueText(issue) {
        const details = issue && issue.details;
        const coding = details && details.coding && details.coding[0];
        return (details && details.text)
            || (coding && (coding.display || coding.code))
            || (issue && issue.diagnostics)
            || "";
    }

    function issuePlaces(issue) {
        const expression = (issue && issue.expression) || [];
        const location = (issue && issue.location) || [];
        return expression.concat(location).filter(Boolean).join(", ");
    }

    function severityClass(severity) {
        if (severity === "fatal" || severity === "error") {
            return "danger";
        }
        if (severity === "warning") {
            return "warning";
        }
        if (severity === "information") {
            return "info";
        }
        return "success";
    }

    function lineColFromIssue(issue) {
        const places = ((issue && issue.location) || []).concat((issue && issue.expression) || []);
        for (let i = 0; i < places.length; i++) {
            const match = String(places[i]).match(/Line\[(\d+)\](?:\s*,?\s*Col\[(\d+)\])?/i);
            if (match) {
                return {
                    line: Math.max(0, parseInt(match[1], 10) - 1),
                    ch: match[2] ? Math.max(0, parseInt(match[2], 10) - 1) : 0
                };
            }
        }
        return null;
    }

    function issuePath(issue, resourceType) {
        const raw = ((issue && issue.expression && issue.expression[0])
            || (issue && issue.location && issue.location[0])
            || "").trim();
        if (!raw || /^Line\[\d+\]/i.test(raw)) {
            return "";
        }
        let path = raw.split("(")[0].split("/")[0];
        path = path.replace(/^%resource\.?/i, "");
        path = path.replace(/^Parameters\.parameter\[\d+\]\.resource\.?/i, "");
        if (resourceType && (path === resourceType || path.indexOf(resourceType + ".") === 0)) {
            path = path.slice(resourceType.length);
            if (path.charAt(0) === ".") {
                path = path.slice(1);
            }
        }
        return path;
    }

    function pathKey(segments) {
        let key = "";
        segments.forEach(function (seg) {
            if (typeof seg === "number") {
                key += "[" + seg + "]";
            } else {
                key += (key ? "." : "") + seg;
            }
        });
        return key;
    }

    function pathSegments(path) {
        const parts = [];
        String(path || "").replace(/([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g, function (_, name, index) {
            if (name) {
                parts.push(name);
            } else {
                parts.push(Number(index));
            }
            return "";
        });
        return parts;
    }

    function indexToLineCh(text, index) {
        let line = 0;
        let ch = 0;
        const limit = Math.max(0, Math.min(index, text.length));
        for (let i = 0; i < limit; i++) {
            if (text.charAt(i) === "\n") {
                line += 1;
                ch = 0;
            } else {
                ch += 1;
            }
        }
        return { line: line, ch: ch };
    }

    function parseJsonPositions(text) {
        const map = Object.create(null);
        let i = 0;
        const n = text.length;

        function peek() {
            return text.charAt(i);
        }

        function skipWs() {
            while (i < n && /\s/.test(text.charAt(i))) {
                i += 1;
            }
        }

        function parseString() {
            i += 1;
            while (i < n) {
                const c = text.charAt(i);
                i += 1;
                if (c === "\\") {
                    i += 1;
                } else if (c === '"') {
                    break;
                }
            }
        }

        function parseValue(path) {
            skipWs();
            const start = i;
            const c = peek();
            if (c === "{") {
                i += 1;
                skipWs();
                while (peek() !== "}" && i < n) {
                    skipWs();
                    const keyStart = i;
                    parseString();
                    let key = text.slice(keyStart, i);
                    try {
                        key = JSON.parse(key);
                    } catch (error) {
                        key = key.slice(1, -1);
                    }
                    skipWs();
                    if (peek() === ":") {
                        i += 1;
                    }
                    parseValue(path ? path + "." + key : key);
                    skipWs();
                    if (peek() === ",") {
                        i += 1;
                    }
                    skipWs();
                }
                if (peek() === "}") {
                    i += 1;
                }
            } else if (c === "[") {
                i += 1;
                let idx = 0;
                skipWs();
                while (peek() !== "]" && i < n) {
                    parseValue(path + "[" + idx + "]");
                    idx += 1;
                    skipWs();
                    if (peek() === ",") {
                        i += 1;
                    }
                    skipWs();
                }
                if (peek() === "]") {
                    i += 1;
                }
            } else if (c === '"') {
                parseString();
            } else if (c === "-" || (c >= "0" && c <= "9")) {
                while (i < n && /[-+0-9.eE]/.test(text.charAt(i))) {
                    i += 1;
                }
            } else {
                while (i < n && /[A-Za-z]/.test(text.charAt(i))) {
                    i += 1;
                }
            }
            map[path] = { start: start, end: i };
        }

        parseValue("");
        return map;
    }

    function unfoldRange(cm, from, to) {
        if (!cm || typeof cm.findMarks !== "function") {
            return;
        }
        cm.findMarks(from, to).forEach(function (mark) {
            if (mark && mark.__isFold) {
                mark.clear();
            }
        });
    }

    function selectRange(cm, from, to) {
        unfoldRange(cm, from, to);
        cm.setSelection(from, to);
        cm.scrollIntoView({ from: from, to: to }, 80);
        cm.getWrapperElement().scrollIntoView({ block: "nearest" });
        cm.focus();
    }

    function revealIssue(cm, issue, resourceType) {
        if (!cm || !issue) {
            return false;
        }
        const text = cm.getValue();
        const lineCol = lineColFromIssue(issue);
        if (lineCol && lineCol.line < cm.lineCount()) {
            const line = cm.getLine(lineCol.line) || "";
            const from = { line: lineCol.line, ch: Math.min(lineCol.ch, line.length) };
            const to = { line: lineCol.line, ch: line.length };
            selectRange(cm, from, to);
            return true;
        }
        const path = issuePath(issue, resourceType);
        const positions = parseJsonPositions(text);
        const loc = positions[path] || positions[pathKey(pathSegments(path))] || positions[""];
        if (!loc) {
            return false;
        }
        selectRange(cm, indexToLineCh(text, loc.start), indexToLineCh(text, loc.end));
        return true;
    }

    function applyPretty(cm, textareaSelector, resourceOrText) {
        const obj = typeof resourceOrText === "string" ? parseJson(resourceOrText) : resourceOrText;
        if (!obj || typeof obj !== "object") {
            return null;
        }
        const prettyText = pretty(obj);
        if (cm) {
            const cursor = cm.getCursor();
            cm.setValue(prettyText);
            cm.setCursor({
                line: Math.min(cursor.line, Math.max(0, cm.lineCount() - 1)),
                ch: cursor.ch
            });
        } else if (textareaSelector) {
            $(textareaSelector).val(prettyText);
        }
        return prettyText;
    }

    function beautify(cm, textareaSelector) {
        const text = cm ? cm.getValue() : ($(textareaSelector).val() || "");
        return applyPretty(cm, textareaSelector, text.trim());
    }

    function prettySource(cm, textareaSelector, resource) {
        return applyPretty(cm, textareaSelector, resource);
    }

    function outcomeHtml(status, body, fallback, validLabel) {
        const outcome = outcomeFrom(body);
        const issues = (outcome && outcome.issue) || [];
        const worst = issues.reduce(function (rank, issue) {
            const severity = issue && issue.severity;
            if (severity === "fatal") {
                return Math.max(rank, 4);
            }
            if (severity === "error") {
                return Math.max(rank, 3);
            }
            if (severity === "warning") {
                return Math.max(rank, 2);
            }
            if (severity === "information") {
                return Math.max(rank, 1);
            }
            return rank;
        }, 0);
        let summaryType = "success";
        let summary = "HTTP " + status + ": " + (validLabel || "resource is valid.");
        if (fallback && !outcome) {
            summaryType = status >= 400 ? "danger" : "warning";
            summary = fallback;
        } else if (worst >= 3 || status >= 400) {
            summaryType = "danger";
            summary = "HTTP " + status + ": validation found errors.";
        } else if (worst === 2) {
            summaryType = "warning";
            summary = "HTTP " + status + ": validation passed with warnings.";
        } else if (issues.length) {
            summaryType = "info";
            summary = "HTTP " + status + ": validation returned " + issues.length + " issue"
                + (issues.length === 1 ? "" : "s") + ".";
        }
        let html = '<div class="alert alert-' + summaryType + ' mb-3">' + esc(summary) + "</div>";
        if (issues.length) {
            html += '<div class="table-responsive resource-document-outcome mb-3">' +
                '<table class="table table-sm align-middle mb-0">' +
                "<thead><tr><th>Severity</th><th>Code</th><th>Details</th><th>Location</th></tr></thead><tbody>" +
                issues.map(function (issue, index) {
                    return '<tr class="resource-document-issue" data-issue-index="' + index +
                        '" role="link" tabindex="0" title="Show in document">' +
                        "<td><span class=\"badge text-bg-" + severityClass(issue.severity) + '">' +
                        esc(issue.severity || "") + "</span></td><td>" + esc(issue.code || "") +
                        "</td><td>" + esc(issueText(issue)) + "</td><td class=\"text-break\">" +
                        esc(issuePlaces(issue)) + "</td></tr>";
                }).join("") +
                "</tbody></table></div>";
        }
        const raw = body ? pretty(body) : "";
        if (raw) {
            html += "<details><summary class=\"small text-muted\">Raw response</summary>" +
                '<pre class="resource-document-raw mb-0 mt-2">' + esc(raw) + "</pre></details>";
        }
        return { html: html, issues: issues };
    }

    function bindIssueRows($root, goToIssue) {
        $root.on("click", "tr.resource-document-issue", function () {
            goToIssue($(this).attr("data-issue-index"));
        });
        $root.on("keydown", "tr.resource-document-issue", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToIssue($(this).attr("data-issue-index"));
            }
        });
    }

    function activateIssueRow($panel, index) {
        $panel.find("tr.resource-document-issue").removeClass("is-active");
        $panel.find("tr.resource-document-issue[data-issue-index=\"" + index + "\"]").addClass("is-active");
    }

    return {
        parseJson: parseJson,
        pretty: pretty,
        bodyFromXhr: bodyFromXhr,
        outcomeFrom: outcomeFrom,
        beautify: beautify,
        prettySource: prettySource,
        revealIssue: revealIssue,
        outcomeHtml: outcomeHtml,
        bindIssueRows: bindIssueRows,
        activateIssueRow: activateIssueRow
    };
}());
