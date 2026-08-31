window.CadminResourceHistory = (function () {
    const PAGE_SIZE = 50;
    const ACTION_LABELS = {
        POST: "Created",
        PUT: "Updated",
        PATCH: "Patched",
        DELETE: "Deleted"
    };
    const ACTION_BADGES = {
        POST: "text-bg-success",
        PUT: "text-bg-secondary",
        PATCH: "text-bg-info",
        DELETE: "text-bg-danger"
    };
    const DIFF_MODAL_ID = "cadmin-resource-diff-modal";
    const SKIP_DIFF_PATHS = {
        "meta.versionId": true,
        "meta.lastUpdated": true
    };

    let mounted = null;
    let entries = [];
    let nextPath = "";
    let fetchToken = 0;
    let bound = false;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function card() {
        return '<div class="card shadow mb-4" id="resource-history-card">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                '<h6 class="m-0"><i class="bi bi-clock-history me-1"></i>History</h6>' +
                '<button class="btn btn-sm btn-outline-secondary" type="button" data-history-refresh ' +
                    'title="Refresh" aria-label="Refresh history">' +
                    '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>' +
            "</div>" +
            '<div class="card-body p-0">' +
                '<div class="table-responsive resource-history-table">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Version</th><th>When</th><th>Action</th><th></th></tr></thead>" +
                        '<tbody id="resource-history-rows">' +
                            '<tr><td colspan="4" class="text-muted">Loading…</td></tr>' +
                        "</tbody>" +
                    "</table>" +
                "</div>" +
                '<div class="p-2 border-top d-none" id="resource-history-more">' +
                    '<button class="btn btn-sm btn-outline-secondary" type="button" data-history-more>' +
                        "Load more</button>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function rowsEl() {
        return document.getElementById("resource-history-rows");
    }

    function moreEl() {
        return document.getElementById("resource-history-more");
    }

    function fhirPathFromUrl(url) {
        const raw = String(url || "");
        if (!raw) {
            return "";
        }
        let pathAndQuery = raw;
        try {
            if (/^https?:\/\//i.test(raw) || raw.indexOf("//") === 0) {
                const parsed = new URL(raw, window.location.origin);
                pathAndQuery = parsed.pathname + parsed.search;
            }
        } catch (err) {
            return "";
        }
        const fhirIdx = pathAndQuery.indexOf("/fhir");
        if (fhirIdx >= 0) {
            let rest = pathAndQuery.substring(fhirIdx + 5);
            if (!rest || rest.charAt(0) === "?") {
                rest = "/" + rest;
            }
            return rest.charAt(0) === "/" ? rest : "/" + rest;
        }
        return pathAndQuery.charAt(0) === "/" ? pathAndQuery : "/" + pathAndQuery;
    }

    function bundleNext(bundle) {
        const links = (bundle && bundle.link) || [];
        let i;
        for (i = 0; i < links.length; i += 1) {
            const link = links[i];
            if (link && (link.relation === "next" || link.rel === "next") && link.url) {
                return fhirPathFromUrl(link.url);
            }
        }
        return "";
    }

    function versionId(entry) {
        const resource = entry && entry.resource;
        if (resource && resource.meta && resource.meta.versionId) {
            return String(resource.meta.versionId);
        }
        const etag = entry && entry.response && entry.response.etag;
        if (etag) {
            const match = String(etag).match(/(\d+)\s*"?\s*$/);
            if (match) {
                return match[1];
            }
        }
        const location = (entry && entry.response && entry.response.location) ||
            (entry && entry.request && entry.request.url) || "";
        const locMatch = String(location).match(/\/_history\/([^/?#]+)/);
        return locMatch ? decodeURIComponent(locMatch[1]) : "";
    }

    function whenOf(entry) {
        const resource = entry && entry.resource;
        if (resource && resource.meta && resource.meta.lastUpdated) {
            return resource.meta.lastUpdated;
        }
        return (entry && entry.response && entry.response.lastModified) || "";
    }

    function formatWhen(instant) {
        if (!instant) {
            return "—";
        }
        const date = new Date(instant);
        return isNaN(date.getTime()) ? String(instant) : date.toLocaleString();
    }

    function actionOf(entry) {
        const method = entry && entry.request && entry.request.method;
        if (method) {
            return String(method).toUpperCase();
        }
        return entry && entry.resource ? "PUT" : "DELETE";
    }

    function currentVersionId() {
        return mounted && mounted.meta && mounted.meta.versionId
            ? String(mounted.meta.versionId)
            : "";
    }

    function resourceKey(resource) {
        if (!resource || !resource.resourceType || !resource.id) {
            return "";
        }
        return resource.resourceType + "/" + resource.id;
    }

    function historyPath() {
        if (!mounted || !mounted.resourceType || !mounted.id) {
            return "";
        }
        return "/" + encodeURIComponent(mounted.resourceType) + "/" +
            encodeURIComponent(mounted.id) + "/_history?_count=" + PAGE_SIZE;
    }

    function setBusy(busy) {
        $("[data-history-refresh], [data-history-more]").prop("disabled", !!busy);
    }

    function renderEmpty(message) {
        const tbody = rowsEl();
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted">' + esc(message) + "</td></tr>";
        }
        const more = moreEl();
        if (more) {
            more.classList.add("d-none");
        }
    }

    function renderRows() {
        const tbody = rowsEl();
        if (!tbody) {
            return;
        }
        if (!entries.length) {
            renderEmpty("No versions yet.");
            return;
        }
        const currentVid = currentVersionId();
        tbody.innerHTML = entries.map(function (entry, index) {
            const vid = versionId(entry);
            const action = actionOf(entry);
            const label = ACTION_LABELS[action] || action;
            const badge = ACTION_BADGES[action] || "text-bg-secondary";
            const isCurrent = vid && currentVid && vid === currentVid;
            const canView = !!(entry && entry.resource) || (action !== "DELETE" && vid);
            const canDiff = canView && !isCurrent;
            const viewBtn = canView
                ? '<button class="btn btn-sm btn-outline-secondary" type="button" data-history-view="' +
                    index + '"><i class="bi bi-code-slash me-1"></i>JSON</button>'
                : '<button class="btn btn-sm btn-outline-secondary" type="button" disabled>JSON</button>';
            const diffBtn = '<button class="btn btn-sm btn-outline-secondary" type="button"' +
                (canDiff ? ' data-history-diff="' + index + '"' : " disabled") +
                ' title="Diff with current" aria-label="Diff with current">' +
                '<i class="bi bi-file-diff" aria-hidden="true"></i></button>';
            return "<tr>" +
                "<td><code>" + esc(vid ? "v" + vid : "—") + "</code>" +
                    (isCurrent ? ' <span class="badge text-bg-primary">Current</span>' : "") +
                    "</td>" +
                "<td>" + esc(formatWhen(whenOf(entry))) + "</td>" +
                '<td><span class="badge ' + badge + '">' + esc(label) + "</span></td>" +
                '<td class="text-end"><div class="btn-group btn-group-sm" role="group">' +
                    viewBtn + diffBtn + "</div></td>" +
                "</tr>";
        }).join("");
        const more = moreEl();
        if (more) {
            more.classList.toggle("d-none", !nextPath);
        }
    }

    function load(append) {
        const tbody = rowsEl();
        if (!tbody) {
            return;
        }
        if (!mounted || !mounted.resourceType || !mounted.id) {
            entries = [];
            nextPath = "";
            renderEmpty("No versions yet.");
            return;
        }
        const path = append ? nextPath : historyPath();
        if (!path) {
            if (!append) {
                renderEmpty("No versions yet.");
            }
            return;
        }
        const token = fetchToken + 1;
        fetchToken = token;
        if (!append) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Loading…</td></tr>';
            const more = moreEl();
            if (more) {
                more.classList.add("d-none");
            }
        }
        setBusy(true);
        CadminApi.fhir(path).done(function (bundle) {
            if (token !== fetchToken) {
                return;
            }
            const page = ((bundle && bundle.entry) || []).filter(function (entry) {
                return entry && (entry.resource || entry.request || entry.response);
            });
            entries = append ? entries.concat(page) : page;
            nextPath = bundleNext(bundle);
            renderRows();
        }).fail(function (xhr) {
            if (token !== fetchToken) {
                return;
            }
            if (!append) {
                entries = [];
                nextPath = "";
                renderEmpty("Unable to load history" +
                    (xhr && xhr.status ? " (" + xhr.status + ")" : "") + ".");
            }
        }).always(function () {
            if (token === fetchToken) {
                setBusy(false);
            }
        });
    }

    function cloneJson(value) {
        if (value == null) {
            return value;
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            return value;
        }
    }

    function sameJson(left, right) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function formatDiffValue(value) {
        if (value === undefined) {
            return "";
        }
        if (typeof value === "string") {
            return value;
        }
        if (typeof value === "number" || typeof value === "boolean" || value === null) {
            return String(value);
        }
        return JSON.stringify(value, null, 2);
    }

    function pathSegments(path) {
        const parts = [];
        String(path || "").replace(/\[(\d+)\]|([^.\[\]]+)/g, function (_match, idx, key) {
            if (idx != null) {
                parts.push(Number(idx));
            } else if (key) {
                parts.push(key);
            }
            return "";
        });
        return parts;
    }

    function valueAt(root, path) {
        if (!path || path === "(root)") {
            return root;
        }
        const parts = pathSegments(path);
        let current = root;
        let i;
        for (i = 0; i < parts.length; i += 1) {
            if (current == null) {
                return undefined;
            }
            current = current[parts[i]];
        }
        return current;
    }

    function parentPath(path) {
        const text = String(path || "");
        const trimmed = text.replace(/(\.[^.\[\]]+|\[\d+\])$/, "");
        return trimmed === text ? "" : trimmed;
    }

    function lastPathKey(path) {
        const parts = pathSegments(path);
        return parts.length ? String(parts[parts.length - 1]) : "";
    }

    function isBase64FieldName(name) {
        return name === "data" || name === "base64Body";
    }

    function compactBase64(value) {
        return String(value || "").replace(/\s+/g, "");
    }

    function looksLikeBase64(value) {
        const compact = compactBase64(value);
        return compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
    }

    function attachmentFromValue(value) {
        if (value && typeof value === "object" && !Array.isArray(value) && typeof value.data === "string") {
            return value;
        }
        return null;
    }

    function isBase64Change(path, value) {
        if (attachmentFromValue(value)) {
            return looksLikeBase64(value.data) || !!value.contentType;
        }
        return typeof value === "string" && !!value && isBase64FieldName(lastPathKey(path));
    }

    function decodeBase64Text(value) {
        const compact = compactBase64(value);
        if (!compact) {
            return "";
        }
        try {
            return decodeURIComponent(escape(atob(compact)));
        } catch (err) {
            try {
                return atob(compact);
            } catch (ignored) {
                return "";
            }
        }
    }

    function isPrintableText(value) {
        const text = String(value || "");
        if (!text) {
            return false;
        }
        let bad = 0;
        const limit = Math.min(text.length, 400);
        let i;
        for (i = 0; i < limit; i += 1) {
            const code = text.charCodeAt(i);
            if (code === 0 || (code < 9) || (code > 13 && code < 32)) {
                bad += 1;
            }
        }
        return bad < 3;
    }

    function normalizeContentType(value) {
        return String(value || "").split(";")[0].trim().toLowerCase();
    }

    function contentTypeFor(resource, path, value) {
        const attachment = attachmentFromValue(value);
        if (attachment && attachment.contentType) {
            return String(attachment.contentType);
        }
        const parent = valueAt(resource, parentPath(path));
        if (parent && typeof parent === "object" && parent.contentType) {
            return String(parent.contentType);
        }
        if (resource && resource.contentType && lastPathKey(path) === "data") {
            return String(resource.contentType);
        }
        return "";
    }

    function highlightMode(contentType) {
        const type = normalizeContentType(contentType);
        if (!type) {
            return "";
        }
        if (type === "application/json" || type === "text/json" || type.indexOf("+json") >= 0) {
            return "json";
        }
        if (type === "text/yaml" || type === "text/x-yaml" || type === "application/x-yaml"
                || type.indexOf("yaml") >= 0) {
            return "yaml";
        }
        if (type === "application/xml" || type === "text/xml" || type === "text/html"
                || type === "application/xhtml+xml" || type.indexOf("+xml") >= 0) {
            return "xml";
        }
        if (type === "text/javascript" || type === "application/javascript"
                || type === "application/ecmascript") {
            return "javascript";
        }
        return "";
    }

    function highlightThemeClass() {
        return document.documentElement.getAttribute("data-bs-theme") === "dark"
            ? "cm-s-material-darker"
            : "cm-s-default";
    }

    function modeSpec(name) {
        if (name === "json") {
            return { name: "javascript", json: true };
        }
        return name;
    }

    function highlightDiffBlocks(root) {
        if (typeof CodeMirror === "undefined" || typeof CodeMirror.runMode !== "function") {
            return;
        }
        $(root || document).find("[data-cm-mode]").each(function () {
            const el = this;
            const mode = modeSpec(el.getAttribute("data-cm-mode") || "");
            const text = el.textContent || "";
            if (!mode || !text) {
                return;
            }
            el.textContent = "";
            try {
                CodeMirror.runMode(text, mode, el);
            } catch (err) {
                el.textContent = text;
            }
        });
    }

    function renderPlainDiff(kind, value) {
        return '<pre class="resource-diff-' + kind + ' mb-0">' + esc(formatDiffValue(value)) + "</pre>";
    }

    function renderBase64Diff(kind, path, value, resource) {
        const attachment = attachmentFromValue(value);
        const encoded = attachment ? attachment.data : value;
        const contentType = contentTypeFor(resource, path, value);
        const decoded = decodeBase64Text(encoded);
        const mode = highlightMode(contentType);
        const theme = highlightThemeClass();
        let html = '<div class="resource-diff-side resource-diff-' + kind + '">';
        html += '<div class="resource-diff-pane-label">Base64</div>';
        html += '<pre class="resource-diff-base64 mb-0">' + esc(formatDiffValue(encoded)) + "</pre>";
        html += '<div class="resource-diff-pane-label">Decoded';
        if (contentType) {
            html += ' · <code>' + esc(contentType) + "</code>";
        }
        html += "</div>";
        if (decoded && isPrintableText(decoded)) {
            html += '<pre class="resource-diff-decoded mb-0 ' + theme + '"' +
                (mode ? ' data-cm-mode="' + esc(mode) + '"' : "") + ">" +
                esc(decoded) + "</pre>";
        } else if (decoded) {
            html += '<div class="small text-muted">Decoded bytes are not printable text.</div>';
        } else {
            html += '<div class="small text-muted">Unable to decode this value as UTF-8 text.</div>';
        }
        html += "</div>";
        return html;
    }

    function collectDiffs(before, after, path, out) {
        if (SKIP_DIFF_PATHS[path]) {
            return;
        }
        if (sameJson(before, after)) {
            return;
        }
        if (before === undefined) {
            out.push({ kind: "added", path: path || "(root)", after: after });
            return;
        }
        if (after === undefined) {
            out.push({ kind: "removed", path: path || "(root)", before: before });
            return;
        }
        const beforeObj = before !== null && typeof before === "object";
        const afterObj = after !== null && typeof after === "object";
        const beforeArr = Array.isArray(before);
        const afterArr = Array.isArray(after);
        if (!beforeObj || !afterObj || beforeArr !== afterArr) {
            out.push({ kind: "changed", path: path || "(root)", before: before, after: after });
            return;
        }
        if (beforeArr) {
            const max = Math.max(before.length, after.length);
            let i;
            for (i = 0; i < max; i += 1) {
                collectDiffs(before[i], after[i], path + "[" + i + "]", out);
            }
            return;
        }
        const keys = {};
        Object.keys(before).concat(Object.keys(after)).forEach(function (key) {
            keys[key] = true;
        });
        Object.keys(keys).sort().forEach(function (key) {
            collectDiffs(before[key], after[key], path ? path + "." + key : key, out);
        });
    }

    function diffKindMeta(kind) {
        if (kind === "added") {
            return { label: "Added", badge: "text-bg-success" };
        }
        if (kind === "removed") {
            return { label: "Removed", badge: "text-bg-danger" };
        }
        return { label: "Changed", badge: "text-bg-warning" };
    }

    function renderDiffValue(kind, path, value, resource) {
        if (isBase64Change(path, value)) {
            return renderBase64Diff(kind, path, value, resource);
        }
        return renderPlainDiff(kind, value);
    }

    function renderDiffItem(item, selected, current) {
        const meta = diffKindMeta(item.kind);
        const path = item.path || "(root)";
        let body = "";
        if (item.kind === "removed" || item.kind === "changed") {
            body += renderDiffValue("before", path, item.before, selected);
        }
        if (item.kind === "added" || item.kind === "changed") {
            body += renderDiffValue("after", path, item.after, current);
        }
        return '<div class="resource-diff-item">' +
            '<div class="d-flex align-items-center gap-2 mb-2">' +
                '<span class="badge ' + meta.badge + '">' + esc(meta.label) + "</span>" +
                "<code>" + esc(path) + "</code>" +
            "</div>" + body +
            "</div>";
    }

    function ensureDiffModal() {
        if (document.getElementById(DIFF_MODAL_ID)) {
            return;
        }
        $("body").append(
            '<div class="modal fade" id="' + DIFF_MODAL_ID + '" tabindex="-1" aria-labelledby="' +
                DIFF_MODAL_ID + '-title">' +
                '<div class="modal-dialog modal-xl modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title" id="' + DIFF_MODAL_ID + '-title">Diff</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body p-0" id="' + DIFF_MODAL_ID + '-body"></div>' +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        $("#" + DIFF_MODAL_ID).on("hidden.bs.modal", function () {
            $("#" + DIFF_MODAL_ID + "-body").empty();
        });
    }

    function hideDiff() {
        const el = document.getElementById(DIFF_MODAL_ID);
        if (!el) {
            return;
        }
        const modal = bootstrap.Modal.getInstance(el);
        if (modal) {
            modal.hide();
        }
    }

    function setDiffBody(html) {
        $("#" + DIFF_MODAL_ID + "-body").html(html);
    }

    function showDiff(selected, current) {
        ensureDiffModal();
        const selectedVid = selected && selected.meta && selected.meta.versionId
            ? "v" + selected.meta.versionId
            : "selected";
        const currentVid = current && current.meta && current.meta.versionId
            ? "v" + current.meta.versionId
            : "current";
        const title = "Diff · " +
            ((selected && selected.resourceType) || (current && current.resourceType) || "Resource") +
            (selected && selected.id ? " / " + selected.id : "") +
            " · " + selectedVid + " → " + currentVid;
        $("#" + DIFF_MODAL_ID + "-title").text(title);
        const changes = [];
        collectDiffs(cloneJson(selected), cloneJson(current), "", changes);
        if (!changes.length) {
            setDiffBody('<div class="p-3 text-muted">No differences from the current document.</div>');
        } else {
            setDiffBody(
                '<div class="resource-diff-legend px-3 py-2 border-bottom small text-muted">' +
                    '<span class="resource-diff-swatch resource-diff-swatch-before"></span>Selected' +
                    '<span class="resource-diff-swatch resource-diff-swatch-after ms-3"></span>Current' +
                "</div>" +
                '<div class="resource-diff-list">' +
                    changes.map(function (item) {
                        return renderDiffItem(item, selected, current);
                    }).join("") +
                "</div>"
            );
            highlightDiffBlocks("#" + DIFF_MODAL_ID + "-body");
        }
        bootstrap.Modal.getOrCreateInstance(document.getElementById(DIFF_MODAL_ID)).show();
    }

    function loadVersion(entry, onResource, onFail) {
        if (entry && entry.resource && entry.resource.resourceType) {
            onResource(entry.resource);
            return;
        }
        const vid = versionId(entry);
        if (!mounted || !vid || actionOf(entry) === "DELETE") {
            if (typeof onFail === "function") {
                onFail();
            }
            return;
        }
        CadminApi.fhir("/" + encodeURIComponent(mounted.resourceType) + "/" +
            encodeURIComponent(mounted.id) + "/_history/" + encodeURIComponent(vid))
            .done(function (resource) {
                if (resource && resource.resourceType) {
                    onResource(resource);
                    return;
                }
                if (typeof onFail === "function") {
                    onFail();
                }
            }).fail(function () {
                if (typeof onFail === "function") {
                    onFail();
                }
            });
    }

    function viewAt(index) {
        const entry = entries[index];
        if (!entry || !window.CadminResourceSource) {
            return;
        }
        loadVersion(entry, function (resource) {
            CadminResourceSource.show(resource);
        });
    }

    function diffAt(index) {
        const entry = entries[index];
        if (!entry || !mounted) {
            return;
        }
        const vid = versionId(entry);
        const currentVid = currentVersionId();
        if (vid && currentVid && vid === currentVid) {
            return;
        }
        if (entry.resource && entry.resource.resourceType) {
            showDiff(entry.resource, mounted);
            return;
        }
        ensureDiffModal();
        $("#" + DIFF_MODAL_ID + "-title").text("Diff");
        setDiffBody('<div class="p-3 text-muted">Loading…</div>');
        bootstrap.Modal.getOrCreateInstance(document.getElementById(DIFF_MODAL_ID)).show();
        loadVersion(entry, function (resource) {
            showDiff(resource, mounted);
        }, function () {
            setDiffBody('<div class="p-3 text-muted">Unable to load that version.</div>');
        });
    }

    function bindOnce() {
        if (bound) {
            return;
        }
        bound = true;
        $(document).on("click.resourcehistory", "[data-history-refresh]", function (event) {
            event.preventDefault();
            load(false);
        });
        $(document).on("click.resourcehistory", "[data-history-more]", function (event) {
            event.preventDefault();
            load(true);
        });
        $(document).on("click.resourcehistory", "[data-history-view]", function (event) {
            event.preventDefault();
            viewAt(Number($(this).attr("data-history-view")));
        });
        $(document).on("click.resourcehistory", "[data-history-diff]", function (event) {
            event.preventDefault();
            diffAt(Number($(this).attr("data-history-diff")));
        });
        $(window).on("hashchange.resourcehistory", hideDiff);
    }

    function mount(resource) {
        mounted = resource || null;
        entries = [];
        nextPath = "";
        bindOnce();
        load(false);
    }

    function reload() {
        load(false);
    }

    function reset() {
        fetchToken += 1;
        mounted = null;
        entries = [];
        nextPath = "";
        hideDiff();
    }

    function onWrite(info) {
        if (!mounted || !mounted.resourceType || !mounted.id) {
            return;
        }
        if (info && info.method === "DELETE") {
            return;
        }
        const written = info && info.resource;
        if (written && resourceKey(written) === resourceKey(mounted)) {
            mounted = written;
            load(false);
            return;
        }
        const path = String((info && info.path) || "");
        const prefix = "/" + mounted.resourceType + "/" + mounted.id;
        if (path === prefix || path.indexOf(prefix + "/") === 0 || path.indexOf(prefix + "?") === 0) {
            load(false);
        }
    }

    return {
        card: card,
        mount: mount,
        reload: reload,
        reset: reset,
        onWrite: onWrite
    };
}());
