window.CadminApi = (function ($) {
    function cookie(name) {
        const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
        return match ? decodeURIComponent(match[1]) : "";
    }

    let csrfToken = "";
    let csrfHeaderName = "X-XSRF-TOKEN";

    function csrfHeaders() {
        const token = csrfToken || cookie("XSRF-TOKEN");
        return token ? { [csrfHeaderName]: token } : {};
    }

    function rememberCsrf(config) {
        if (config && config.csrfToken) {
            csrfToken = config.csrfToken;
        }
        if (config && config.csrfHeaderName) {
            csrfHeaderName = config.csrfHeaderName;
        }
        return config;
    }

    function ajax(options) {
        return $.ajax($.extend(true, {
            headers: $.extend({ "X-Requested-With": "XMLHttpRequest" }, csrfHeaders()),
            xhrFields: { withCredentials: true }
        }, options)).fail(function (xhr) {
            if (xhr.status === 401 && !options.skipAuthRedirect
                    && options.url !== "/login" && options.url !== "/api/auth/login") {
                window.location.href = "/login.html";
            }
        });
    }

    function get(url) {
        const request = ajax({ url: url, method: "GET" });
        if (url === "/api/auth/config") {
            return request.done(rememberCsrf);
        }
        return request;
    }

    function send(url, method, data, contentType, extra) {
        return ajax($.extend({
            url: url,
            method: method,
            data: typeof data === "string" ? data : JSON.stringify(data),
            contentType: contentType || "application/json"
        }, extra || {}));
    }

    function login(username, password) {
        return ajax({
            url: "/login",
            method: "POST",
            skipAuthRedirect: true,
            data: JSON.stringify({ username: username, password: password }),
            contentType: "application/json"
        });
    }

    function logout() {
        return ajax({ url: "/logout", method: "POST" });
    }

    function fhir(path, method, data, options) {
        const verb = (method || "GET").toUpperCase();
        const opts = options && typeof options === "object" ? options : {};
        const request = ajax({
            url: "/fhir" + path,
            method: method || "GET",
            data: !data ? undefined : (typeof data === "string" ? data : JSON.stringify(data)),
            contentType: data ? "application/fhir+json" : undefined,
            converters: {
                "text json": function (text) {
                    return text && String(text).trim() ? JSON.parse(text) : null;
                }
            },
            headers: $.extend({
                "X-Requested-With": "XMLHttpRequest",
                Accept: "application/fhir+json"
            }, data ? { Prefer: "return=representation" } : {}, csrfHeaders())
        });
        if (verb !== "GET" && verb !== "HEAD" && String(path || "").indexOf("$") < 0) {
            request.done(function (body) {
                if (window.CadminWorkspace && typeof CadminWorkspace.notifyWrite === "function") {
                    CadminWorkspace.notifyWrite({
                        method: verb,
                        path: path,
                        resource: body || data || null
                    });
                }
            });
        }
        request.fail(function (xhr) {
            if (xhr.status === 401 || opts.silent) {
                return;
            }
            const issues = operationOutcomeIssues(xhr);
            if (issues.length || (verb !== "GET" && verb !== "HEAD")) {
                showFhirError(xhr, { issues: issues, title: opts.errorTitle });
            }
        });
        return request;
    }

    function wiremock(path, method, data) {
        const verb = (method || "GET").toUpperCase();
        const options = {
            url: "/wiremock" + path,
            method: verb
        };
        if (data !== undefined && data !== null && verb !== "GET" && verb !== "HEAD") {
            options.data = typeof data === "string" ? data : JSON.stringify(data);
            options.contentType = "application/json";
        }
        return ajax(options);
    }

    function coreAdminBridge(path, method, data) {
        const verb = (method || "GET").toUpperCase();
        const options = {
            url: "/core-admin-bridge" + path,
            method: verb,
            headers: {
                Accept: "application/json"
            }
        };
        if (data !== undefined && data !== null && verb !== "GET" && verb !== "HEAD") {
            options.data = typeof data === "string" ? data : JSON.stringify(data);
            options.contentType = "application/json";
        }
        return ajax(options);
    }

    function icg(path, method, data) {
        const verb = (method || "GET").toUpperCase();
        const options = {
            url: "/icg" + path,
            method: verb,
            headers: {
                Accept: "application/json"
            }
        };
        if (data !== undefined && data !== null && verb !== "GET" && verb !== "HEAD") {
            options.data = typeof data === "string" ? data : JSON.stringify(data);
            options.contentType = "application/json";
        }
        return ajax(options);
    }

    function fhirChief(path, method, data, contentType) {
        const verb = (method || "GET").toUpperCase();
        const options = {
            url: "/fhir-chief" + path,
            method: verb,
            converters: {
                "text json": function (text) {
                    return text && String(text).trim() ? JSON.parse(text) : null;
                }
            },
            headers: {
                Accept: "application/fhir+json, application/json"
            }
        };
        if (data !== undefined && data !== null && verb !== "GET" && verb !== "HEAD") {
            options.data = typeof data === "string" ? data : JSON.stringify(data);
            options.contentType = contentType || "application/fhir+json";
        }
        return ajax(options);
    }

    function showAlert(selector, type, message) {
        const $el = $(selector);
        if (!type) {
            $el.addClass("d-none").removeClass("alert-success alert-danger alert-warning alert-info").text("");
            return;
        }
        $el.removeClass("d-none alert-success alert-danger alert-warning alert-info")
            .addClass("alert alert-" + type)
            .text(message);
    }

    function fhirErrorBody(xhr) {
        if (xhr && xhr.responseJSON && typeof xhr.responseJSON === "object") {
            return xhr.responseJSON;
        }
        const text = xhr && xhr.responseText;
        if (!text || !String(text).trim()) {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }

    function issueMessage(issue) {
        const details = (issue && issue.details) || {};
        const coding = (details.coding && details.coding[0]) || {};
        return details.text || coding.display || (issue && issue.diagnostics) || (issue && issue.code) || "";
    }

    function issueLocation(issue) {
        if (!issue) {
            return "";
        }
        if (issue.expression && issue.expression.length) {
            return issue.expression.join(", ");
        }
        if (issue.location && issue.location.length) {
            return issue.location.join(", ");
        }
        return "";
    }

    function collectOutcomeIssues(resource, out) {
        if (!resource || typeof resource !== "object") {
            return;
        }
        if (resource.resourceType === "OperationOutcome") {
            (resource.issue || []).forEach(function (issue) {
                const message = issueMessage(issue);
                if (!message && !issue.code) {
                    return;
                }
                out.push({
                    severity: issue.severity || "error",
                    code: issue.code || "",
                    message: message || "Unspecified issue",
                    location: issueLocation(issue)
                });
            });
            return;
        }
        if (resource.resourceType === "Bundle") {
            (resource.entry || []).forEach(function (entry) {
                if (!entry) {
                    return;
                }
                collectOutcomeIssues(entry.resource, out);
                collectOutcomeIssues(entry.response && entry.response.outcome, out);
            });
        }
    }

    function operationOutcomeIssues(xhr) {
        const issues = [];
        const body = fhirErrorBody(xhr);
        collectOutcomeIssues(body, issues);
        if (!issues.length && body) {
            const fallback = body.detail || body.message || body.error || body.title;
            if (fallback) {
                issues.push({
                    severity: "error",
                    code: "",
                    message: fallback,
                    location: ""
                });
            }
        }
        return issues;
    }

    function severityBadge(severity) {
        const kind = severity === "fatal" || severity === "error" ? "danger"
            : severity === "warning" ? "warning"
                : severity === "information" ? "info"
                    : "secondary";
        return '<span class="badge text-bg-' + kind + '">' + escapeHtml(severity || "error") + "</span>";
    }

    function showFhirError(xhr, options) {
        const opts = options || {};
        let issues = opts.issues || operationOutcomeIssues(xhr);
        if (!issues.length) {
            issues = [{
                severity: "error",
                code: "",
                message: "Request failed (" + ((xhr && xhr.status) || "error") + ").",
                location: ""
            }];
        }
        const status = xhr && xhr.status ? "HTTP " + xhr.status + (xhr.statusText ? " " + xhr.statusText : "") : "";
        const title = opts.title || "FHIR request failed";
        let modalEl = document.getElementById("cadmin-fhir-outcome-modal");
        if (!modalEl) {
            $("body").append(
                '<div class="modal fade" id="cadmin-fhir-outcome-modal" tabindex="-1" aria-labelledby="cadmin-fhir-outcome-title">' +
                    '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                        '<div class="modal-content">' +
                            '<div class="modal-header">' +
                                '<h5 class="modal-title" id="cadmin-fhir-outcome-title"></h5>' +
                                '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                            "</div>" +
                            '<div class="modal-body">' +
                                '<p class="text-muted small mb-3" id="cadmin-fhir-outcome-status"></p>' +
                                '<div id="cadmin-fhir-outcome-issues"></div>' +
                            "</div>" +
                            '<div class="modal-footer">' +
                                '<button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>' +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</div>"
            );
            modalEl = document.getElementById("cadmin-fhir-outcome-modal");
        }
        $("#cadmin-fhir-outcome-title").text(title);
        $("#cadmin-fhir-outcome-status").text(status || "").toggleClass("d-none", !status);
        $("#cadmin-fhir-outcome-issues").html(
            '<div class="list-group">' + issues.map(function (issue) {
                return '<div class="list-group-item">' +
                    '<div class="d-flex flex-wrap align-items-center gap-2 mb-1">' +
                        severityBadge(issue.severity) +
                        (issue.code ? '<span class="small text-muted">' + escapeHtml(issue.code) + "</span>" : "") +
                    "</div>" +
                    '<div style="white-space:pre-wrap">' + escapeHtml(issue.message) + "</div>" +
                    (issue.location
                        ? '<div class="small text-muted mt-1"><code>' + escapeHtml(issue.location) + "</code></div>"
                        : "") +
                    "</div>";
            }).join("") + "</div>"
        );
        if (typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }

    function showToast(type, message) {
        if (!message || typeof bootstrap === "undefined") {
            return;
        }
        let container = document.getElementById("cadmin-toasts");
        if (!container) {
            container = document.createElement("div");
            container.id = "cadmin-toasts";
            container.className = "toast-container position-fixed p-3";
            container.setAttribute("aria-live", "polite");
            container.setAttribute("aria-atomic", "false");
            document.body.appendChild(container);
        }
        const danger = type === "danger";
        const light = type === "warning" || type === "info";
        const toastEl = document.createElement("div");
        toastEl.className = "toast align-items-center text-bg-" + type + " border-0 shadow";
        toastEl.setAttribute("role", danger ? "alert" : "status");
        toastEl.setAttribute("aria-live", danger ? "assertive" : "polite");
        toastEl.setAttribute("aria-atomic", "true");
        toastEl.innerHTML = '<div class="d-flex">' +
            '<div class="toast-body">' + escapeHtml(message) + "</div>" +
            '<button type="button" class="btn-close ' + (light ? "" : "btn-close-white ") +
                'me-2 m-auto" data-bs-dismiss="toast" aria-label="Dismiss"></button>' +
            "</div>";
        container.appendChild(toastEl);
        const toast = new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: danger ? 8000 : 5000
        });
        toastEl.addEventListener("hidden.bs.toast", function () {
            toastEl.remove();
        });
        toast.show();
    }

    function confirmDialog(messageOrOptions) {
        const opts = typeof messageOrOptions === "string"
            ? { title: messageOrOptions }
            : (messageOrOptions || {});
        const title = opts.title || "Are you sure?";
        const text = opts.text || "";
        const combined = [title, text, opts.confirmText || ""].join(" ");
        let confirmText = opts.confirmText;
        if (!confirmText) {
            const match = combined.match(/\b(delete|remove|expunge|reset|clear|inactivate|replace)\b/i);
            confirmText = match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : "Confirm";
        }
        const danger = opts.danger != null
            ? !!opts.danger
            : /delete|remove|expunge|reset|clear|inactivate/i.test(combined);
        const icon = opts.icon || (danger ? "warning" : "question");
        const deferred = $.Deferred();

        function decide(ok) {
            if (ok) {
                deferred.resolve();
            } else {
                deferred.reject();
            }
        }

        if (typeof Swal === "undefined") {
            decide(window.confirm(text ? title + "\n\n" + text : title));
            return deferred.promise();
        }
        Swal.fire({
            title: title,
            text: text || undefined,
            icon: icon,
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: opts.cancelText || "Cancel",
            reverseButtons: true,
            focusCancel: true,
            buttonsStyling: false,
            customClass: {
                popup: "cadmin-swal",
                title: "cadmin-swal-title",
                htmlContainer: "cadmin-swal-text",
                actions: "cadmin-swal-actions",
                confirmButton: danger ? "btn btn-danger" : "btn btn-primary",
                cancelButton: "btn btn-outline-secondary"
            }
        }).then(function (result) {
            decide(!!result.isConfirmed);
        });
        return deferred.promise();
    }

    function escapeHtml(value) {
        return $("<div>").text(value == null ? "" : String(value)).html();
    }

    function resourceLink(href, label) {
        return '<a href="' + escapeHtml(href) + '">' + escapeHtml(label) + "</a>";
    }

    const DETAIL_PREFIX = {
        Patient: "#/patients/",
        RelatedPerson: "#/caregivers/",
        Practitioner: "#/practitioners/",
        Device: "#/devices/",
        DeviceAssociation: "#/device-associations/",
        Flag: "#/flags/",
        Organization: "#/organizations/",
        CareTeam: "#/care-teams/",
        Location: "#/locations/",
        HealthcareService: "#/healthcare-services/",
        Consent: "#/consents/",
        Subscription: "#/subscriptions/",
        SubscriptionTopic: "#/subscription-topics/",
        Endpoint: "#/endpoints/",
        Library: "#/pds-policies/",
        Questionnaire: "#/questionnaires/",
        SearchParameter: "#/search-parameters/",
        CodeSystem: "#/code-systems/",
        ValueSet: "#/value-sets/",
        PractitionerRole: "#/practitioner-roles/",
        OrganizationAffiliation: "#/organization-affiliations/",
        List: "#/lists/",
        Schedule: "#/schedules/",
        Slot: "#/slots/",
        Appointment: "#/appointments/",
        AppointmentResponse: "#/appointment-responses/",
        PlanDefinition: "#/plan-definitions/",
        ActivityDefinition: "#/activity-definitions/",
        RequestOrchestration: "#/request-orchestrations/"
    };

    function libraryTypeCodes(resource) {
        const codes = ((resource && resource.type && resource.type.coding) || []).map(function (coding) {
            return coding && coding.code;
        }).filter(Boolean);
        if (resource && resource.type && resource.type.text) {
            codes.push(resource.type.text);
        }
        return codes;
    }

    function libraryTypeOf(resource) {
        return libraryTypeCodes(resource)[0] || "";
    }

    function isLibraryType(resource, code) {
        return libraryTypeCodes(resource).indexOf(code) >= 0;
    }

    function detailHref(type, id, resource) {
        if (type === "Library" && isLibraryType(resource, "camel-route")) {
            return "#/camel-routes/" + encodeURIComponent(id);
        }
        if (type === "Library" && isLibraryType(resource, "icg-route")) {
            return "#/icg-routes/" + encodeURIComponent(id);
        }
        if (type === "Library" && isLibraryType(resource, "jolt")) {
            return "#/jolts/" + encodeURIComponent(id);
        }
        const prefix = DETAIL_PREFIX[type];
        if (prefix) {
            return prefix + encodeURIComponent(id);
        }
        return "#/resources/" + encodeURIComponent(type) + "/" + encodeURIComponent(id);
    }

    function listHref(type, query) {
        const prefix = DETAIL_PREFIX[type];
        const base = prefix ? prefix.replace(/\/$/, "") : "#/resources/" + encodeURIComponent(type);
        const url = query && query.url;
        if (url) {
            return base + "?url=" + encodeURIComponent(String(url).split("|")[0]);
        }
        return base;
    }

    function typeForRoute(routeName) {
        const prefix = "#/" + routeName + "/";
        const types = Object.keys(DETAIL_PREFIX);
        for (let i = 0; i < types.length; i += 1) {
            if (DETAIL_PREFIX[types[i]] === prefix) {
                return types[i];
            }
        }
        return "";
    }

    function looksLikeCanonical(value) {
        return /^(https?:|urn:)/i.test(String(value || "").trim());
    }

    function hashQuery(name) {
        const raw = String(window.location.hash || "").replace(/^#\/?/, "");
        const q = raw.indexOf("?");
        if (q < 0) {
            return name ? "" : {};
        }
        const params = new URLSearchParams(raw.slice(q + 1));
        if (name) {
            return params.get(name) || "";
        }
        const out = {};
        params.forEach(function (value, key) {
            out[key] = value;
        });
        return out;
    }

    function findByUrl(type, url) {
        const bare = String(url || "").split("|")[0].trim();
        if (!type || !bare) {
            return $.Deferred().reject().promise();
        }
        return fhir("/" + encodeURIComponent(type) + "?url=" + encodeURIComponent(bare) + "&_count=5",
            "GET", null, { silent: true }).then(function (bundle) {
            const items = bundleResources(bundle, type);
            if (!items.length) {
                return $.Deferred().reject().promise();
            }
            return items[0];
        });
    }

    function readByIdOrUrl(type, id, url) {
        const canonical = String(url || (looksLikeCanonical(id) ? id : "")).split("|")[0].trim();
        if (id && !looksLikeCanonical(id)) {
            return fhir("/" + encodeURIComponent(type) + "/" + encodeURIComponent(id), "GET", null, { silent: true })
                .then(null, function () {
                    return canonical ? findByUrl(type, canonical) : $.Deferred().reject().promise();
                });
        }
        if (canonical) {
            return findByUrl(type, canonical);
        }
        return $.Deferred().reject().promise();
    }

    function decodeId(value) {
        const text = value == null ? "" : String(value);
        if (!text) {
            return "";
        }
        try {
            return decodeURIComponent(text);
        } catch (error) {
            return text;
        }
    }

    function routeParamId(params) {
        return (params || []).map(decodeId).filter(Boolean).join("/");
    }

    function referenceId(ref) {
        if (!ref) {
            return "";
        }
        const reference = typeof ref === "string" ? ref : (ref.reference || "");
        const urn = reference.match(/^urn:uuid:([^/?#]+)$/i);
        if (urn) {
            return decodeId(urn[1]);
        }
        const match = reference.match(/\/([^/]+)$/);
        return match ? decodeId(match[1]) : "";
    }

    function referenceType(ref) {
        const reference = typeof ref === "string" ? ref : ((ref && ref.reference) || "");
        const match = String(reference).match(/^([A-Za-z][A-Za-z0-9]+)\//);
        return match ? match[1] : "";
    }

    const PAGE_SIZE = 10;
    const PAGE_SIZES = [5, 10, 20, 50];
    const PAGE_SIZE_STORE = "cadmin.pageSize.";

    function listPageSize(key, next) {
        const name = String(key || "").trim();
        if (!name) {
            return PAGE_SIZE;
        }
        if (next != null) {
            const size = PAGE_SIZES.indexOf(Number(next)) !== -1 ? Number(next) : PAGE_SIZE;
            try {
                localStorage.setItem(PAGE_SIZE_STORE + name, String(size));
            } catch (ignore) {
                // private mode
            }
            return size;
        }
        try {
            const stored = Number(localStorage.getItem(PAGE_SIZE_STORE + name));
            if (PAGE_SIZES.indexOf(stored) !== -1) {
                return stored;
            }
        } catch (ignore) {
            // private mode
        }
        return PAGE_SIZE;
    }

    function pagedPath(path, page, size) {
        size = size || PAGE_SIZE;
        page = Math.max(0, parseInt(page, 10) || 0);
        const text = String(path || "");
        const qIndex = text.indexOf("?");
        const base = qIndex >= 0 ? text.slice(0, qIndex) : text;
        const params = new URLSearchParams(qIndex >= 0 ? text.slice(qIndex + 1) : "");
        params.set("_count", String(size));
        params.set("_total", "accurate");
        if (page > 0) {
            params.set("_offset", String(page * size));
        } else {
            params.delete("_offset");
        }
        return base + "?" + params.toString();
    }

    function bundleResources(bundle, resourceType) {
        return (bundle && bundle.entry || []).map(function (entry) {
            return entry.resource;
        }).filter(function (resource) {
            return resource && (!resourceType || resource.resourceType === resourceType);
        });
    }

    function bundleHasNext(bundle, page, returned, size, total) {
        if ((bundle && bundle.link || []).some(function (link) { return link.relation === "next"; })) {
            return true;
        }
        if (typeof total === "number") {
            return (page + 1) * size < total;
        }
        return returned >= size;
    }

    function pageWindow(current, pageCount) {
        const pages = [];
        if (pageCount <= 7) {
            for (let i = 0; i < pageCount; i += 1) {
                pages.push(i);
            }
            return pages;
        }
        pages.push(0);
        let start = Math.max(1, current - 1);
        let end = Math.min(pageCount - 2, current + 1);
        if (current <= 2) {
            start = 1;
            end = 3;
        }
        if (current >= pageCount - 3) {
            start = pageCount - 4;
            end = pageCount - 2;
        }
        if (start > 1) {
            pages.push("ellipsis");
        }
        for (let i = start; i <= end; i += 1) {
            pages.push(i);
        }
        if (end < pageCount - 2) {
            pages.push("ellipsis");
        }
        pages.push(pageCount - 1);
        return pages;
    }

    function pagerButton(page, label, disabled, active) {
        if (disabled) {
            return '<li class="page-item disabled"><span class="page-link">' + escapeHtml(label) + "</span></li>";
        }
        if (active) {
            return '<li class="page-item active" aria-current="page">' +
                '<button type="button" class="page-link" data-page="' + page + '">' + escapeHtml(label) + "</button></li>";
        }
        return '<li class="page-item">' +
            '<button type="button" class="page-link" data-page="' + page + '">' + escapeHtml(label) + "</button></li>";
    }

    function renderPager(selector, options) {
        const opts = options || {};
        const page = Math.max(0, opts.page || 0);
        const sizeKey = opts.pageSizeKey || "";
        const size = opts.size || (sizeKey ? listPageSize(sizeKey) : PAGE_SIZE);
        const returned = opts.returned || 0;
        const total = typeof opts.total === "number" ? opts.total : undefined;
        const $el = $(selector);
        if (!$el.length) {
            return;
        }
        if (!returned && page === 0 && !sizeKey) {
            $el.empty();
            return;
        }
        const hasPrev = page > 0;
        const hasNext = opts.hasNext != null
            ? !!opts.hasNext
            : bundleHasNext(opts.bundle, page, returned, size, total);
        const start = page * size + (returned ? 1 : 0);
        const end = page * size + returned;
        const label = !returned && page === 0
            ? (typeof total === "number" ? "Showing 0 of " + total : "Showing 0")
            : typeof total === "number"
                ? "Showing " + start + "–" + end + " of " + total
                : "Showing " + start + "–" + end;
        let numbers = "";
        if (typeof total === "number" && total > 0) {
            const pageCount = Math.max(1, Math.ceil(total / size));
            numbers = pageWindow(page, pageCount).map(function (item) {
                if (item === "ellipsis") {
                    return '<li class="page-item disabled"><span class="page-link">&hellip;</span></li>';
                }
                return pagerButton(item, String(item + 1), false, item === page);
            }).join("");
        } else {
            numbers = pagerButton(page, String(page + 1), false, true);
        }
        const sizeControl = sizeKey
            ? '<label class="small text-muted mb-0 d-flex align-items-center gap-2">' +
                '<span>Per page</span>' +
                '<select class="form-select form-select-sm" data-page-size aria-label="Results per page">' +
                    PAGE_SIZES.map(function (option) {
                        return '<option value="' + option + '"' + (option === size ? " selected" : "") +
                            ">" + option + "</option>";
                    }).join("") +
                "</select></label>"
            : "";
        $el.html(
            '<div class="d-flex flex-wrap justify-content-between align-items-center gap-2">' +
                '<div class="d-flex flex-wrap align-items-center gap-3">' +
                    '<div class="text-muted small">' + escapeHtml(label) + "</div>" +
                    sizeControl +
                "</div>" +
                '<nav aria-label="List pages"><ul class="pagination pagination-sm mb-0">' +
                    pagerButton(page - 1, "Previous", !hasPrev, false) +
                    numbers +
                    pagerButton(page + 1, "Next", !hasNext, false) +
                "</ul></nav></div>"
        );
        $el.off("click.pager change.pager");
        $el.on("click.pager", "button[data-page]", function () {
            const nextPage = parseInt($(this).attr("data-page"), 10);
            if (!isNaN(nextPage) && typeof opts.onPage === "function") {
                opts.onPage(nextPage);
            }
        });
        $el.on("change.pager", "[data-page-size]", function () {
            listPageSize(sizeKey, $(this).val());
            if (typeof opts.onPageSize === "function") {
                opts.onPageSize(listPageSize(sizeKey));
                return;
            }
            if (typeof opts.onPage === "function") {
                opts.onPage(0);
            }
        });
    }

    function createdResourceId(body, xhr, resourceType) {
        if (body && body.id) {
            return body.id;
        }
        const header = (xhr && (xhr.getResponseHeader("Location") || xhr.getResponseHeader("Content-Location"))) || "";
        if (!header) {
            return "";
        }
        const urn = header.match(/urn:uuid:([^/?#]+)/i);
        if (urn) {
            return decodeId(urn[1]);
        }
        if (resourceType) {
            const match = header.match(new RegExp(resourceType + "/([^/?#]+)"));
            if (match) {
                return decodeId(match[1]);
            }
        }
        const tail = header.match(/\/([^/?#]+)(?:\/_history\/[^/?#]+)?\/?$/);
        return tail ? decodeId(tail[1]) : "";
    }

    const VALUE_SETS = {
        subscriptionStatus: "http://hl7.org/fhir/ValueSet/subscription-status",
        subscriptionChannelType: "http://hl7.org/fhir/ValueSet/subscription-channel-type",
        subscriptionPayloadContent: "http://hl7.org/fhir/ValueSet/subscription-payload-content",
        publicationStatus: "http://hl7.org/fhir/ValueSet/publication-status",
        interactionTrigger: "http://hl7.org/fhir/ValueSet/interaction-trigger",
        subscriptiontopicCrBehavior: "http://hl7.org/fhir/ValueSet/subscriptiontopic-cr-behavior",
        searchComparator: "http://hl7.org/fhir/ValueSet/search-comparator",
        searchModifierCode: "http://hl7.org/fhir/ValueSet/search-modifier-code",
        searchParamType: "http://hl7.org/fhir/ValueSet/search-param-type",
        searchProcessingMode: "http://hl7.org/fhir/ValueSet/search-processingmode",
        resourceTypes: "http://hl7.org/fhir/ValueSet/resource-types",
        consentState: "http://hl7.org/fhir/ValueSet/consent-state-codes",
        consentProvisionType: "http://hl7.org/fhir/ValueSet/consent-provision-type",
        consentCategory: "http://hl7.org/fhir/ValueSet/consent-category",
        consentAction: "http://hl7.org/fhir/ValueSet/consent-action",
        consentPolicy: "http://hl7.org/fhir/ValueSet/consent-policy",
        consentDataMeaning: "http://hl7.org/fhir/ValueSet/consent-data-meaning",
        flagStatus: "http://hl7.org/fhir/ValueSet/flag-status",
        flagCategory: "http://hl7.org/fhir/ValueSet/flag-category",
        flagCode: "https://cadmin.io/fhir/ValueSet/flag-code",
        listStatus: "http://hl7.org/fhir/ValueSet/list-status",
        listMode: "http://hl7.org/fhir/ValueSet/list-mode",
        listExampleCodes: "http://hl7.org/fhir/ValueSet/list-example-codes",
        listEmptyReason: "http://hl7.org/fhir/ValueSet/list-empty-reason",
        listItemFlag: "http://hl7.org/fhir/ValueSet/list-item-flag",
        codesystemContent: "http://hl7.org/fhir/ValueSet/codesystem-content-mode",
        practitionerRole: "http://hl7.org/fhir/ValueSet/practitioner-role",
        organizationRole: "http://hl7.org/fhir/ValueSet/organization-role",
        c80PracticeCodes: "http://hl7.org/fhir/ValueSet/c80-practice-codes",
        deviceAssociationStatus: "http://hl7.org/fhir/ValueSet/deviceassociation-status",
        deviceAssociationStatusReason: "http://hl7.org/fhir/ValueSet/deviceassociation-status-reason",
        deviceAssociationOperationStatus: "http://hl7.org/fhir/ValueSet/deviceassociation-operationstatus",
        conditionClinical: "http://hl7.org/fhir/ValueSet/condition-clinical",
        conditionVerStatus: "http://hl7.org/fhir/ValueSet/condition-ver-status",
        conditionCategory: "http://hl7.org/fhir/ValueSet/condition-category",
        conditionSeverity: "http://hl7.org/fhir/ValueSet/condition-severity",
        conditionCode: "http://hl7.org/fhir/ValueSet/condition-code"
    };

    const VALUE_SET_FALLBACKS = {
        practitionerRole: [
            { code: "doctor", display: "Doctor",
                system: "http://terminology.hl7.org/CodeSystem/practitioner-role" },
            { code: "nurse", display: "Nurse",
                system: "http://terminology.hl7.org/CodeSystem/practitioner-role" },
            { code: "pharmacist", display: "Pharmacist",
                system: "http://terminology.hl7.org/CodeSystem/practitioner-role" },
            { code: "researcher", display: "Researcher",
                system: "http://terminology.hl7.org/CodeSystem/practitioner-role" },
            { code: "teacher", display: "Teacher",
                system: "http://terminology.hl7.org/CodeSystem/practitioner-role" },
            { code: "ict", display: "ICT professional",
                system: "http://terminology.hl7.org/CodeSystem/practitioner-role" }
        ],
        organizationRole: [
            { code: "provider", display: "Provider",
                system: "http://hl7.org/fhir/organization-role" },
            { code: "agency", display: "Agency",
                system: "http://hl7.org/fhir/organization-role" },
            { code: "research", display: "Research",
                system: "http://hl7.org/fhir/organization-role" },
            { code: "payer", display: "Payer",
                system: "http://hl7.org/fhir/organization-role" },
            { code: "diagnostics", display: "Diagnostics",
                system: "http://hl7.org/fhir/organization-role" },
            { code: "supplier", display: "Supplier",
                system: "http://hl7.org/fhir/organization-role" },
            { code: "HIE/HIO", display: "HIE/HIO",
                system: "http://hl7.org/fhir/organization-role" },
            { code: "member", display: "Member",
                system: "http://hl7.org/fhir/organization-role" }
        ],
        c80PracticeCodes: [
            { code: "394814009", display: "General practice", system: "http://snomed.info/sct" },
            { code: "394579002", display: "Cardiology", system: "http://snomed.info/sct" },
            { code: "394584008", display: "Gastroenterology", system: "http://snomed.info/sct" },
            { code: "394610002", display: "Surgery-Dental", system: "http://snomed.info/sct" },
            { code: "394587001", display: "Psychiatry", system: "http://snomed.info/sct" },
            { code: "394537008", display: "Pediatrics", system: "http://snomed.info/sct" },
            { code: "394585009", display: "Obstetrics and gynecology", system: "http://snomed.info/sct" },
            { code: "394802001", display: "General medicine", system: "http://snomed.info/sct" }
        ],
        deviceAssociationStatus: [
            { code: "implanted", display: "Implanted",
                system: "http://hl7.org/fhir/deviceassociation-status" },
            { code: "explanted", display: "Explanted",
                system: "http://hl7.org/fhir/deviceassociation-status" },
            { code: "attached", display: "Attached",
                system: "http://hl7.org/fhir/deviceassociation-status" },
            { code: "entered-in-error", display: "Entered in error",
                system: "http://hl7.org/fhir/deviceassociation-status" },
            { code: "unknown", display: "Unknown",
                system: "http://hl7.org/fhir/deviceassociation-status" }
        ],
        deviceAssociationStatusReason: [
            { code: "attached", display: "Attached",
                system: "http://hl7.org/fhir/deviceassociation-status-reason" },
            { code: "disconnected", display: "Disconnected",
                system: "http://hl7.org/fhir/deviceassociation-status-reason" },
            { code: "failed", display: "Failed",
                system: "http://hl7.org/fhir/deviceassociation-status-reason" },
            { code: "placed", display: "Placed",
                system: "http://hl7.org/fhir/deviceassociation-status-reason" },
            { code: "replaced", display: "Replaced",
                system: "http://hl7.org/fhir/deviceassociation-status-reason" }
        ],
        deviceAssociationOperationStatus: [
            { code: "on", display: "On",
                system: "http://hl7.org/fhir/deviceassociation-operationstatus" },
            { code: "off", display: "Off",
                system: "http://hl7.org/fhir/deviceassociation-operationstatus" },
            { code: "standby", display: "Stand by",
                system: "http://hl7.org/fhir/deviceassociation-operationstatus" },
            { code: "defective", display: "Defective",
                system: "http://hl7.org/fhir/deviceassociation-operationstatus" },
            { code: "unknown", display: "Unknown",
                system: "http://hl7.org/fhir/deviceassociation-operationstatus" }
        ],
        conditionClinical: [
            { code: "active", display: "Active",
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical" },
            { code: "recurrence", display: "Recurrence",
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical" },
            { code: "relapse", display: "Relapse",
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical" },
            { code: "inactive", display: "Inactive",
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical" },
            { code: "remission", display: "Remission",
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical" },
            { code: "resolved", display: "Resolved",
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical" }
        ],
        conditionVerStatus: [
            { code: "unconfirmed", display: "Unconfirmed",
                system: "http://terminology.hl7.org/CodeSystem/condition-ver-status" },
            { code: "provisional", display: "Provisional",
                system: "http://terminology.hl7.org/CodeSystem/condition-ver-status" },
            { code: "differential", display: "Differential",
                system: "http://terminology.hl7.org/CodeSystem/condition-ver-status" },
            { code: "confirmed", display: "Confirmed",
                system: "http://terminology.hl7.org/CodeSystem/condition-ver-status" },
            { code: "refuted", display: "Refuted",
                system: "http://terminology.hl7.org/CodeSystem/condition-ver-status" },
            { code: "entered-in-error", display: "Entered in error",
                system: "http://terminology.hl7.org/CodeSystem/condition-ver-status" }
        ],
        conditionCategory: [
            { code: "problem-list-item", display: "Problem List Item",
                system: "http://terminology.hl7.org/CodeSystem/condition-category" },
            { code: "encounter-diagnosis", display: "Encounter Diagnosis",
                system: "http://terminology.hl7.org/CodeSystem/condition-category" }
        ],
        conditionSeverity: [
            { code: "255604002", display: "Mild", system: "http://snomed.info/sct" },
            { code: "6736007", display: "Moderate", system: "http://snomed.info/sct" },
            { code: "24484000", display: "Severe", system: "http://snomed.info/sct" }
        ],
        conditionCode: [
            { code: "38341003", display: "Hypertension", system: "http://snomed.info/sct" },
            { code: "73211009", display: "Diabetes mellitus", system: "http://snomed.info/sct" },
            { code: "44054006", display: "Type 2 diabetes mellitus", system: "http://snomed.info/sct" },
            { code: "195967001", display: "Asthma", system: "http://snomed.info/sct" },
            { code: "13645005", display: "Chronic obstructive lung disease", system: "http://snomed.info/sct" },
            { code: "22298006", display: "Myocardial infarction", system: "http://snomed.info/sct" },
            { code: "49436004", display: "Atrial fibrillation", system: "http://snomed.info/sct" },
            { code: "35489007", display: "Depressive disorder", system: "http://snomed.info/sct" },
            { code: "84757009", display: "Epilepsy", system: "http://snomed.info/sct" },
            { code: "26929004", display: "Alzheimer's disease", system: "http://snomed.info/sct" }
        ]
    };

    const valueSetCache = {};

    function flattenExpansion(items, out) {
        (items || []).forEach(function (item) {
            if (item && item.code) {
                out.push({
                    code: item.code,
                    display: item.display || item.code,
                    system: item.system || ""
                });
            }
            if (item && item.contains) {
                flattenExpansion(item.contains, out);
            }
        });
        return out;
    }

    function sortConcepts(concepts) {
        return concepts.slice().sort(function (a, b) {
            return String(a.display || a.code).localeCompare(String(b.display || b.code));
        });
    }

    function expandValueSet(url, options) {
        const opts = options || {};
        const count = opts.count || 500;
        const filter = opts.filter || "";
        const offset = opts.offset || 0;
        const key = String(url) + "|" + count + "|" + filter + "|" + offset;
        if (!opts.nocache && valueSetCache[key]) {
            return $.Deferred().resolve(valueSetCache[key]).promise();
        }
        let path = "/ValueSet/$expand?url=" + encodeURIComponent(url) + "&count=" + encodeURIComponent(String(count));
        if (filter) {
            path += "&filter=" + encodeURIComponent(filter);
        }
        if (offset) {
            path += "&offset=" + encodeURIComponent(String(offset));
        }
        return fhir(path, "GET", null, { silent: true }).then(function (valueSet) {
            const contains = ((valueSet && valueSet.expansion) || {}).contains || [];
            const concepts = sortConcepts(flattenExpansion(contains, []));
            if (!concepts.length && !opts.allowEmpty) {
                return $.Deferred().reject(valueSet).promise();
            }
            if (!opts.nocache) {
                valueSetCache[key] = concepts;
            }
            return concepts;
        });
    }

    function optionHtml(items, selected) {
        return (items || []).map(function (item) {
            const code = item.code != null ? item.code : item;
            const display = item.display != null ? item.display : item;
            const mark = String(code) === String(selected) ? " selected" : "";
            return '<option value="' + escapeHtml(code) + '"' + mark + ">" + escapeHtml(display) + "</option>";
        }).join("");
    }

    function ensureSelected(concepts, selected) {
        if (selected == null || selected === "") {
            return concepts;
        }
        if (concepts.some(function (item) { return String(item.code) === String(selected); })) {
            return concepts;
        }
        return concepts.concat([{ code: selected, display: selected }]);
    }

    function fillSelectOptions(selector, concepts, options) {
        const opts = options || {};
        const $el = $(selector);
        if (!$el.length) {
            return concepts || [];
        }
        const selected = opts.selected !== undefined ? opts.selected : $el.val();
        const items = ensureSelected((opts.prepend || []).concat(concepts || []), selected);
        $el.html(optionHtml(items, selected));
        return concepts || [];
    }

    function fillValueSetSelect(selector, url, options) {
        const opts = options || {};
        return expandValueSet(url, opts).then(function (concepts) {
            fillSelectOptions(selector, concepts, opts);
            if (typeof opts.onConcepts === "function") {
                opts.onConcepts(concepts);
            }
            return concepts;
        }, function () {
            const fallback = opts.fallback || [];
            fillSelectOptions(selector, fallback, opts);
            if (typeof opts.onConcepts === "function") {
                opts.onConcepts(fallback);
            }
            return fallback;
        });
    }

    function fillValueSetChecks(containerSelector, url, options) {
        const opts = options || {};
        const $el = $(containerSelector);
        const selected = opts.selected || [];
        const name = opts.name || "vs";
        const inputClass = opts.inputClass || "";
        function apply(concepts) {
            $el.html((concepts || []).map(function (item) {
                const id = name + "-" + String(item.code).replace(/[^A-Za-z0-9_-]/g, "_");
                const checked = selected.indexOf(item.code) >= 0 ? " checked" : "";
                return '<div class="form-check">' +
                    '<input class="form-check-input' + (inputClass ? " " + inputClass : "") +
                    '" type="checkbox" name="' + escapeHtml(name) + '" value="' +
                    escapeHtml(item.code) + '" id="' + escapeHtml(id) + '"' + checked + ">" +
                    '<label class="form-check-label" for="' + escapeHtml(id) + '">' +
                    escapeHtml(item.display) + "</label></div>";
            }).join(""));
            if (typeof opts.onConcepts === "function") {
                opts.onConcepts(concepts);
            }
            return concepts || [];
        }
        return expandValueSet(url, opts).then(apply, function () {
            return apply(opts.fallback || []);
        });
    }

    function geocode(fields) {
        const params = [];
        ["q", "line", "city", "state", "postalCode", "country"].forEach(function (key) {
            const value = fields && fields[key];
            if (value) {
                params.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
            }
        });
        return get("/api/geocode" + (params.length ? "?" + params.join("&") : ""));
    }

    function npiLookup(number, kind) {
        let url = "/api/npi?number=" + encodeURIComponent(String(number || "").replace(/\D/g, ""));
        if (kind) {
            url += "&kind=" + encodeURIComponent(kind);
        }
        return get(url);
    }

    function valueSetDisplay(concepts, code) {
        const match = (concepts || []).find(function (item) { return item.code === code; });
        return match ? match.display : (code || "—");
    }

    const FHIR_SELECT_PAGE = 20;
    const FHIR_SELECT_TYPES = {
        Organization: { type: "Organization", noun: "organizations" },
        Patient: { type: "Patient", noun: "patients" },
        Practitioner: { type: "Practitioner", noun: "practitioners" },
        RelatedPerson: { type: "RelatedPerson", noun: "caregivers" },
        Location: { type: "Location", noun: "locations" },
        HealthcareService: { type: "HealthcareService", noun: "healthcare services" },
        Endpoint: { type: "Endpoint", noun: "endpoints" },
        Device: { type: "Device", noun: "devices", sort: "-_lastUpdated", queryParam: "device-name" },
        List: { type: "List", noun: "lists", sort: "title", queryParam: "title" },
        Flag: { type: "Flag", noun: "flags", sort: "-_lastUpdated", queryParam: "_id" },
        Consent: { type: "Consent", noun: "consents", sort: "-_lastUpdated", queryParam: "_id" },
        Endpoint: { type: "Endpoint", noun: "endpoints", sort: "name", queryParam: "name" },
        Questionnaire: { type: "Questionnaire", noun: "questionnaires", sort: "title", queryParam: "title" },
        SearchParameter: { type: "SearchParameter", noun: "search parameters", sort: "name", queryParam: "name" },
        CodeSystem: { type: "CodeSystem", noun: "code systems", sort: "title", queryParam: "title" },
        ValueSet: { type: "ValueSet", noun: "value sets", sort: "title", queryParam: "title" },
        PractitionerRole: { type: "PractitionerRole", noun: "practitioner roles", sort: "-_lastUpdated",
            queryParam: "_id" },
        Schedule: { type: "Schedule", noun: "schedules", sort: "-_lastUpdated", queryParam: "_id" },
        Slot: { type: "Slot", noun: "slots", sort: "start", queryParam: "_id" },
        Appointment: { type: "Appointment", noun: "appointments", sort: "-date", queryParam: "_id" },
        PlanDefinition: { type: "PlanDefinition", noun: "plans", sort: "title", queryParam: "title" },
        ActivityDefinition: { type: "ActivityDefinition", noun: "activities", sort: "title", queryParam: "title" },
        RequestOrchestration: { type: "RequestOrchestration", noun: "orchestrations", sort: "-_lastUpdated",
            queryParam: "_id" }
    };

    function selectElement(selector) {
        return typeof selector === "string" ? document.querySelector(selector) : selector;
    }

    function destroySelect(selector) {
        const el = selectElement(selector);
        if (el && el.tomselect) {
            el.tomselect.destroy();
        }
    }

    function destroySelects(root) {
        const scope = typeof root === "string" ? document.querySelector(root) : (root || document);
        if (!scope || !scope.querySelectorAll) {
            return;
        }
        Array.prototype.forEach.call(scope.querySelectorAll("select"), function (el) {
            if (el.tomselect) {
                el.tomselect.destroy();
            }
        });
    }

    function selectValue(selector) {
        const el = selectElement(selector);
        if (el && el.tomselect) {
            return el.tomselect.getValue() || "";
        }
        return (el && el.value) || "";
    }

    function selectLabel(selector) {
        const el = selectElement(selector);
        if (el && el.tomselect) {
            const value = el.tomselect.getValue();
            if (!value) {
                return "";
            }
            const opt = el.tomselect.options[value];
            return (opt && (opt.name || opt.text)) || "";
        }
        if (!el || el.selectedIndex < 0) {
            return "";
        }
        const selected = el.options[el.selectedIndex];
        return selected ? String(selected.text || "").trim() : "";
    }

    function personName(resource) {
        const name = (resource && resource.name && resource.name[0]) || {};
        const given = (name.given || []).join(" ");
        return [given, name.family].filter(Boolean).join(" ") || (resource && resource.id) || "Unnamed";
    }

    function deviceSelectLabel(resource) {
        const names = (resource && (resource.name || resource.deviceName)) || [];
        const preferred = names.find(function (item) { return item && item.display === true; })
            || names.find(function (item) { return item && item.type === "user-friendly-name"; })
            || names[0];
        const named = preferred && (preferred.value || preferred.name);
        if (named) {
            return named;
        }
        return [resource && resource.manufacturer, resource && resource.modelNumber].filter(Boolean).join(" ")
            || (resource && resource.id) || "";
    }

    function fhirSelectLabel(resource) {
        if (!resource) {
            return "";
        }
        if (resource.resourceType === "Device") {
            return deviceSelectLabel(resource);
        }
        if (resource.resourceType === "Organization") {
            return resource.name || resource.id || "";
        }
        if (resource.resourceType === "Endpoint") {
            const name = resource.name || "";
            const address = resource.address || "";
            if (name && address && name !== address) {
                return name + " — " + address;
            }
            return name || address || resource.id || "";
        }
        if (resource.resourceType === "PlanDefinition" || resource.resourceType === "ActivityDefinition") {
            return resource.title || resource.name || resource.id || "";
        }
        if (resource.resourceType === "Appointment") {
            return resource.description || resource.start || resource.id || "";
        }
        if (resource.resourceType === "Slot") {
            return [resource.start, resource.end].filter(Boolean).join(" – ") || resource.id || "";
        }
        if (resource.resourceType === "Schedule") {
            const actor = (resource.actor && resource.actor[0]) || {};
            return actor.display || actor.reference || resource.id || "";
        }
        if (Array.isArray(resource.name) || (resource.name && (resource.name.family || resource.name.given))) {
            return personName(resource);
        }
        return resource.name || resource.id || "";
    }

    function patientGenderLabel(code) {
        const labels = { male: "Male", female: "Female", other: "Other", unknown: "Unknown" };
        return labels[code] || (code || "");
    }

    function formatPatientBirthDate(iso) {
        if (!iso) {
            return "";
        }
        const date = new Date(String(iso) + (String(iso).indexOf("T") >= 0 ? "" : "T00:00:00"));
        return isNaN(date.getTime()) ? String(iso) : date.toLocaleDateString();
    }

    function patientBirthdateQuery(query) {
        const q = String(query || "").trim();
        if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(q)) {
            return q;
        }
        const numeric = q.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
        if (numeric) {
            return numeric[3] + "-" + numeric[1].padStart(2, "0") + "-" + numeric[2].padStart(2, "0");
        }
        if (/\d{4}/.test(q) && /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(q)) {
            const date = new Date(q);
            if (!isNaN(date.getTime())) {
                const pad = function (n) { return String(n).padStart(2, "0"); };
                return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
            }
        }
        return "";
    }

    function fhirSelectItem(resource) {
        const item = {
            id: resource.id,
            name: fhirSelectLabel(resource)
        };
        if (resource.resourceType === "Patient") {
            item.gender = resource.gender || "";
            item.genderLabel = patientGenderLabel(resource.gender);
            item.birthDate = resource.birthDate || "";
            item.birthDateDisplay = formatPatientBirthDate(resource.birthDate);
        }
        return item;
    }

    function patientSelectMeta(item) {
        return [item && item.genderLabel, item && item.birthDateDisplay].filter(Boolean).join(" · ");
    }

    function fhirSearchPath(resourceType, query, page) {
        const spec = FHIR_SELECT_TYPES[resourceType];
        const q = String(query || "").trim();
        if (!spec) {
            let path = "/" + resourceType + "?_sort=-_lastUpdated";
            if (q) {
                path += "&_id=" + encodeURIComponent(q);
            }
            return pagedPath(path, page, FHIR_SELECT_PAGE);
        }
        const sort = spec.sort || "name";
        const queryParam = spec.queryParam || "name";
        let path = "/" + resourceType + "?_sort=" + sort;
        if (q) {
            const birthdate = spec.type === "Patient" ? patientBirthdateQuery(q) : "";
            if (birthdate) {
                path += "&birthdate=" + encodeURIComponent(birthdate);
            } else {
                path += "&" + queryParam + "=" + encodeURIComponent(q);
            }
        }
        return pagedPath(path, page, FHIR_SELECT_PAGE);
    }

    function conceptCode(cc) {
        if (cc == null || cc === "") {
            return "";
        }
        if (typeof cc === "string") {
            return cc;
        }
        const item = Array.isArray(cc) ? cc[0] : cc;
        if (item == null) {
            return "";
        }
        if (typeof item === "string") {
            return item;
        }
        const coding = (item.coding && item.coding[0]) || {};
        return coding.code || item.code || item.text || "";
    }

    function pageFromSearchPath(path) {
        const query = String(path || "");
        const qIndex = query.indexOf("?");
        const params = new URLSearchParams(qIndex >= 0 ? query.slice(qIndex + 1) : "");
        const size = parseInt(params.get("_count"), 10) || FHIR_SELECT_PAGE;
        const offset = parseInt(params.get("_offset"), 10) || 0;
        return { page: Math.floor(offset / size), size: size };
    }

    function fhirFetch(path, signal) {
        return fetch("/fhir" + path, {
            credentials: "same-origin",
            headers: $.extend({
                "X-Requested-With": "XMLHttpRequest",
                Accept: "application/fhir+json"
            }, csrfHeaders()),
            signal: signal
        }).then(function (response) {
            if (response.status === 401) {
                window.location.href = "/login.html";
                throw new Error("unauthorized");
            }
            if (!response.ok) {
                throw new Error("FHIR request failed (" + response.status + ")");
            }
            return response.json();
        });
    }

    function bindFhirSelect(selector, resourceType, options) {
        const spec = FHIR_SELECT_TYPES[resourceType] || {
            type: resourceType,
            noun: String(resourceType || "results").toLowerCase() + "s"
        };
        const opts = options || {};
        const el = selectElement(selector);
        if (!el || typeof TomSelect !== "function") {
            return null;
        }
        const placeholder = opts.placeholder || ("Search " + spec.noun + "…");
        const previousValue = opts.selectedId !== undefined ? opts.selectedId : selectValue(el);
        const previousLabel = opts.selectedLabel !== undefined ? opts.selectedLabel : selectLabel(el);
        destroySelect(el);
        el.innerHTML = '<option value="">' + escapeHtml(placeholder) + "</option>";
        let inFlight = null;
        const patientSelect = spec.type === "Patient";
        const ts = new TomSelect(el, {
            valueField: "id",
            labelField: "name",
            searchField: patientSelect ? ["name", "birthDate", "birthDateDisplay"] : ["name"],
            maxItems: 1,
            maxOptions: 200,
            preload: "focus",
            loadThrottle: 300,
            persist: false,
            create: false,
            allowEmptyOption: opts.allowEmpty !== false,
            placeholder: placeholder,
            plugins: ["virtual_scroll", "clear_button"],
            dropdownParent: "body",
            firstUrl: function (query) {
                return fhirSearchPath(spec.type, query, 0);
            },
            shouldLoad: function () {
                return true;
            },
            load: function (query, callback) {
                if (inFlight) {
                    inFlight.abort();
                }
                inFlight = new AbortController();
                const url = this.getUrl(query);
                const self = this;
                fhirFetch(url, inFlight.signal).then(function (bundle) {
                    const excludeId = opts.excludeId || "";
                    const items = bundleResources(bundle, spec.type).filter(function (resource) {
                        return resource.id !== excludeId;
                    }).map(fhirSelectItem);
                    const parsed = pageFromSearchPath(url);
                    if (bundleHasNext(bundle, parsed.page, items.length, parsed.size, bundle.total)) {
                        self.setNextUrl(query, fhirSearchPath(spec.type, query, parsed.page + 1));
                    }
                    callback(items);
                }).catch(function (error) {
                    if (!error || error.name !== "AbortError") {
                        callback();
                    }
                });
            },
            render: {
                option: function (item, escape) {
                    if (!patientSelect) {
                        return "<div>" + escape(item.name) + "</div>";
                    }
                    const meta = patientSelectMeta(item);
                    return '<div class="cadmin-patient-option">' +
                        "<div>" + escape(item.name || "") + "</div>" +
                        (meta ? '<div class="cadmin-patient-option-meta">' + escape(meta) + "</div>" : "") +
                        "</div>";
                },
                item: function (item, escape) {
                    if (!patientSelect) {
                        return "<div>" + escape(item.name) + "</div>";
                    }
                    const meta = patientSelectMeta(item);
                    return '<div class="cadmin-patient-option">' +
                        escape(item.name || "") +
                        (meta ? '<span class="cadmin-patient-option-meta"> · ' + escape(meta) + "</span>" : "") +
                        "</div>";
                },
                loading_more: function () {
                    return '<div class="loading-more-results py-2 d-flex align-items-center">' +
                        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
                        "Loading more " + spec.noun + "…</div>";
                },
                no_more_results: function () {
                    return '<div class="no-more-results py-2 text-muted">No more ' + spec.noun + "</div>";
                }
            }
        });
        if (previousValue) {
            ts.addOption({
                id: previousValue,
                name: previousLabel && previousLabel !== placeholder ? previousLabel : previousValue
            });
            ts.setValue(previousValue, true);
            if (patientSelect) {
                fhir("/Patient/" + encodeURIComponent(previousValue), "GET", null, { silent: true }).done(function (patient) {
                    if (!patient || !el.tomselect) {
                        return;
                    }
                    el.tomselect.updateOption(previousValue, fhirSelectItem(patient));
                });
            }
        }
        return ts;
    }

    function bindOrganizationSelect(selector, options) {
        return bindFhirSelect(selector, "Organization", options);
    }

    function bindPatientSelect(selector, options) {
        return bindFhirSelect(selector, "Patient", options);
    }

    function bindPractitionerSelect(selector, options) {
        return bindFhirSelect(selector, "Practitioner", options);
    }

    function bindCaregiverSelect(selector, options) {
        return bindFhirSelect(selector, "RelatedPerson", options);
    }

    function terminologyLabel(resource) {
        if (!resource) {
            return "";
        }
        return resource.title || resource.name || resource.url || resource.id || "";
    }

    function looksLikeCanonical(value) {
        const text = String(value || "").trim();
        return /^[a-z][a-z0-9+.-]*:/i.test(text) || text.indexOf("/") >= 0;
    }

    function terminologySearchPath(resourceType, query, page) {
        let path = "/" + resourceType + "?_sort=title";
        const q = String(query || "").trim();
        if (q) {
            if (looksLikeCanonical(q)) {
                path += "&url=" + encodeURIComponent(q);
            } else {
                path += "&title=" + encodeURIComponent(q);
            }
        }
        return pagedPath(path, page, FHIR_SELECT_PAGE);
    }

    function flattenCodeSystemConcepts(concepts, parent, out) {
        const rows = out || [];
        (concepts || []).forEach(function (item) {
            if (!item || !item.code) {
                return;
            }
            rows.push({
                code: item.code,
                display: item.display || "",
                definition: item.definition || "",
                parent: parent || ""
            });
            if (item.concept && item.concept.length) {
                flattenCodeSystemConcepts(item.concept, item.code, rows);
            }
        });
        return rows;
    }

    function nestCodeSystemConcepts(rows) {
        const byCode = {};
        (rows || []).forEach(function (row) {
            if (!row || !row.code) {
                return;
            }
            const node = { code: row.code };
            if (row.display) {
                node.display = row.display;
            }
            if (row.definition) {
                node.definition = row.definition;
            }
            byCode[row.code] = node;
        });
        const roots = [];
        (rows || []).forEach(function (row) {
            if (!row || !row.code || !byCode[row.code]) {
                return;
            }
            const node = byCode[row.code];
            const parent = row.parent && byCode[row.parent] && row.parent !== row.code
                ? byCode[row.parent]
                : null;
            if (parent) {
                parent.concept = parent.concept || [];
                parent.concept.push(node);
            } else {
                roots.push(node);
            }
        });
        return roots;
    }

    function bindTerminologySelect(selector, resourceType, options) {
        const opts = options || {};
        const spec = {
            type: resourceType,
            noun: resourceType === "ValueSet" ? "value sets" : "code systems"
        };
        const el = selectElement(selector);
        if (!el || typeof TomSelect !== "function") {
            return null;
        }
        const placeholder = opts.placeholder || ("Search " + spec.noun + "…");
        const previousValue = opts.selectedUrl !== undefined ? opts.selectedUrl : selectValue(el);
        const previousLabel = opts.selectedLabel !== undefined ? opts.selectedLabel : selectLabel(el);
        destroySelect(el);
        el.innerHTML = '<option value="">' + escapeHtml(placeholder) + "</option>";
        let inFlight = null;
        const ts = new TomSelect(el, {
            valueField: "url",
            labelField: "name",
            searchField: ["name", "url"],
            maxItems: 1,
            maxOptions: 200,
            preload: "focus",
            loadThrottle: 300,
            persist: !!opts.create,
            create: opts.create ? function (input) {
                const url = String(input || "").trim();
                if (!url) {
                    return false;
                }
                return { url: url, name: url };
            } : false,
            createOnBlur: !!opts.create,
            createFilter: function (input) {
                return String(input || "").trim().length > 0;
            },
            allowEmptyOption: opts.allowEmpty !== false,
            placeholder: placeholder,
            plugins: ["virtual_scroll", "clear_button"],
            dropdownParent: "body",
            firstUrl: function (query) {
                return terminologySearchPath(spec.type, query, 0);
            },
            shouldLoad: function () {
                return true;
            },
            load: function (query, callback) {
                if (inFlight) {
                    inFlight.abort();
                }
                inFlight = new AbortController();
                const url = this.getUrl(query);
                const self = this;
                fhirFetch(url, inFlight.signal).then(function (bundle) {
                    const items = bundleResources(bundle, spec.type).map(function (resource) {
                        const canonical = resource.url || "";
                        return {
                            url: canonical || resource.id,
                            name: terminologyLabel(resource),
                            id: resource.id
                        };
                    }).filter(function (item) {
                        return !!item.url;
                    });
                    const parsed = pageFromSearchPath(url);
                    if (bundleHasNext(bundle, parsed.page, items.length, parsed.size, bundle.total)) {
                        self.setNextUrl(query, terminologySearchPath(spec.type, query, parsed.page + 1));
                    }
                    callback(items);
                }).catch(function (error) {
                    if (!error || error.name !== "AbortError") {
                        callback();
                    }
                });
            },
            render: {
                option: function (item, escape) {
                    const secondary = item.url && item.url !== item.name
                        ? '<div class="small text-muted text-truncate">' + escape(item.url) + "</div>"
                        : "";
                    return "<div>" + escape(item.name) + secondary + "</div>";
                },
                item: function (item, escape) {
                    return "<div>" + escape(item.name) + "</div>";
                },
                loading_more: function () {
                    return '<div class="loading-more-results py-2 d-flex align-items-center">' +
                        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
                        "Loading more " + spec.noun + "…</div>";
                },
                no_more_results: function () {
                    return '<div class="no-more-results py-2 text-muted">No more ' + spec.noun + "</div>";
                }
            }
        });
        if (previousValue) {
            ts.addOption({
                url: previousValue,
                name: previousLabel && previousLabel !== placeholder ? previousLabel : previousValue
            });
            ts.setValue(previousValue, true);
        }
        if (typeof opts.onChange === "function") {
            ts.on("change", function (value) {
                opts.onChange(value || "");
            });
        }
        return ts;
    }

    function bindValueSetPicker(selector, options) {
        return bindTerminologySelect(selector, "ValueSet", options);
    }

    function bindCodeSystemPicker(selector, options) {
        return bindTerminologySelect(selector, "CodeSystem", options);
    }

    function conceptOptionId(item) {
        return (item.system || "") + "|" + String(item.code || "");
    }

    function conceptToOption(item) {
        return {
            id: conceptOptionId(item),
            code: item.code,
            display: item.display || item.code,
            name: item.display || item.code,
            system: item.system || ""
        };
    }

    function expandSelectPath(valueSetUrl, query, page) {
        const offset = Math.max(0, (parseInt(page, 10) || 0) * FHIR_SELECT_PAGE);
        let path = "/ValueSet/$expand?url=" + encodeURIComponent(valueSetUrl) +
            "&count=" + encodeURIComponent(String(FHIR_SELECT_PAGE));
        if (offset) {
            path += "&offset=" + encodeURIComponent(String(offset));
        }
        const q = String(query || "").trim();
        if (q) {
            path += "&filter=" + encodeURIComponent(q);
        }
        return path;
    }

    function pageFromExpandPath(path) {
        const query = String(path || "");
        const qIndex = query.indexOf("?");
        const params = new URLSearchParams(qIndex >= 0 ? query.slice(qIndex + 1) : "");
        const size = parseInt(params.get("count"), 10) || FHIR_SELECT_PAGE;
        const offset = parseInt(params.get("offset"), 10) || 0;
        return { page: Math.floor(offset / size), size: size };
    }

    function bindConceptSelect(selector, valueSetUrl, options) {
        const opts = options || {};
        const el = selectElement(selector);
        if (!el || typeof TomSelect !== "function") {
            if (el && (opts.fallback || []).length) {
                fillSelectOptions(el, opts.fallback, opts);
            }
            return null;
        }
        const placeholder = opts.placeholder || "Search codes…";
        const selected = opts.selected || {};
        const selectedCode = selected.code || opts.selectedCode || "";
        const selectedSystem = selected.system || opts.selectedSystem || "";
        const selectedDisplay = selected.display || opts.selectedDisplay || selectedCode;
        destroySelect(el);
        el.innerHTML = '<option value="">' + escapeHtml(placeholder) + "</option>";

        if (!valueSetUrl) {
            const tsLocal = new TomSelect(el, {
                valueField: "id",
                labelField: "name",
                searchField: ["name", "code"],
                maxItems: 1,
                options: (opts.fallback || []).map(conceptToOption),
                maxOptions: 200,
                persist: false,
                create: false,
                allowEmptyOption: opts.allowEmpty !== false,
                placeholder: placeholder,
                plugins: ["clear_button"],
                dropdownParent: "body"
            });
            if (selectedCode) {
                const prior = conceptToOption({
                    code: selectedCode,
                    display: selectedDisplay,
                    system: selectedSystem
                });
                tsLocal.addOption(prior);
                tsLocal.setValue(prior.id, true);
            }
            if (typeof opts.onChange === "function") {
                tsLocal.on("change", function () {
                    opts.onChange(selectCoding(el, selectedSystem));
                });
            }
            return tsLocal;
        }

        let inFlight = null;
        const ts = new TomSelect(el, {
            valueField: "id",
            labelField: "name",
            searchField: ["name", "code"],
            maxItems: 1,
            maxOptions: 200,
            preload: "focus",
            loadThrottle: 300,
            persist: false,
            create: false,
            allowEmptyOption: opts.allowEmpty !== false,
            placeholder: placeholder,
            plugins: ["virtual_scroll", "clear_button"],
            dropdownParent: "body",
            firstUrl: function (query) {
                return expandSelectPath(valueSetUrl, query, 0);
            },
            shouldLoad: function () {
                return true;
            },
            load: function (query, callback) {
                if (inFlight) {
                    inFlight.abort();
                }
                inFlight = new AbortController();
                const url = this.getUrl(query);
                const self = this;
                fhirFetch(url, inFlight.signal).then(function (valueSet) {
                    const contains = ((valueSet && valueSet.expansion) || {}).contains || [];
                    const items = flattenExpansion(contains, []).map(conceptToOption);
                    const parsed = pageFromExpandPath(url);
                    const total = valueSet && valueSet.expansion && valueSet.expansion.total;
                    if (typeof total === "number"
                            ? (parsed.page + 1) * parsed.size < total
                            : items.length >= parsed.size) {
                        self.setNextUrl(query, expandSelectPath(valueSetUrl, query, parsed.page + 1));
                    }
                    callback(items);
                }).catch(function (error) {
                    if (!error || error.name !== "AbortError") {
                        callback(opts.fallback ? (opts.fallback || []).map(conceptToOption) : []);
                    }
                });
            },
            render: {
                option: function (item, escape) {
                    const code = item.code && item.code !== item.name
                        ? '<span class="small text-muted ms-1">' + escape(item.code) + "</span>"
                        : "";
                    return "<div>" + escape(item.name) + code + "</div>";
                },
                item: function (item, escape) {
                    return "<div>" + escape(item.name) + "</div>";
                },
                loading_more: function () {
                    return '<div class="loading-more-results py-2 d-flex align-items-center">' +
                        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
                        "Loading more codes…</div>";
                },
                no_more_results: function () {
                    return '<div class="no-more-results py-2 text-muted">No more codes</div>';
                }
            }
        });
        if (selectedCode) {
            const prior = conceptToOption({
                code: selectedCode,
                display: selectedDisplay,
                system: selectedSystem
            });
            ts.addOption(prior);
            ts.setValue(prior.id, true);
        }
        if (typeof opts.onChange === "function") {
            ts.on("change", function () {
                opts.onChange(selectCoding(el, selectedSystem));
            });
        }
        return ts;
    }

    function selectCoding(selector, fallbackSystem) {
        const el = selectElement(selector);
        if (el && el.tomselect) {
            const value = el.tomselect.getValue();
            if (!value) {
                return null;
            }
            const opt = el.tomselect.options[value];
            if (!opt) {
                return null;
            }
            return {
                system: opt.system || fallbackSystem || "",
                code: opt.code || "",
                display: opt.display || opt.name || opt.code || ""
            };
        }
        const code = (el && el.value) || "";
        if (!code) {
            return null;
        }
        const label = selectLabel(el);
        return {
            system: fallbackSystem || "",
            code: code,
            display: label && label !== code ? label : code
        };
    }

    function companionValueSetUrl(codeSystemUrl) {
        const url = String(codeSystemUrl || "");
        if (url.indexOf("/CodeSystem/") >= 0) {
            return url.replace("/CodeSystem/", "/ValueSet/");
        }
        return url ? url.replace(/\/?$/, "") + "-valueset" : "";
    }

    function unsavedFlagHtml() {
        return '<span class="badge rounded-pill text-bg-warning align-middle d-none" data-unsaved-flag>' +
            "Unsaved changes</span>";
    }

    function setUnsavedFlag(scope, dirty) {
        $(scope || document).find("[data-unsaved-flag]").toggleClass("d-none", !dirty);
    }

    const OIDC_SUBJECT_SYSTEM = "https://insulet.com/fhir/identifier/oidc/subject";

    function oidcSubjectSystem() {
        const configured = ((window.CadminApp && CadminApp.config()) || {}).oidcSubjectSystem;
        return String(configured || OIDC_SUBJECT_SYSTEM).replace(/\/+$/, "") || OIDC_SUBJECT_SYSTEM;
    }

    function oidcIssuer() {
        return String(((window.CadminApp && CadminApp.config()) || {}).oidcIssuer || "").replace(/\/+$/, "");
    }

    function isOidcSubjectSystem(system) {
        const value = String(system || "").replace(/\/+$/, "");
        if (!value) {
            return true;
        }
        if (value === oidcSubjectSystem()) {
            return true;
        }
        const issuer = oidcIssuer();
        return !!issuer && value === issuer;
    }

    function oidcSubjectIdentifier(subject) {
        return {
            use: "official",
            system: oidcSubjectSystem(),
            value: subject,
            type: { text: "OIDC subject" }
        };
    }

    function isOidcSubjectIdentifier(identifier, subject) {
        if (!identifier || !identifier.value) {
            return false;
        }
        if (subject && identifier.value !== subject) {
            return false;
        }
        return isOidcSubjectSystem(identifier.system);
    }

    function upsertOidcSubjectIdentifier(resource, subject) {
        if (!resource || !subject) {
            return resource;
        }
        resource.identifier = (resource.identifier || []).filter(function (item) {
            return !isOidcSubjectIdentifier(item, subject);
        });
        resource.identifier.push(oidcSubjectIdentifier(subject));
        return resource;
    }

    function removeOidcSubjectIdentifier(resource, subject) {
        if (!resource) {
            return resource;
        }
        resource.identifier = (resource.identifier || []).filter(function (item) {
            return !isOidcSubjectIdentifier(item, subject);
        });
        if (!resource.identifier.length) {
            delete resource.identifier;
        }
        return resource;
    }

    function oidcSubjectQueries(subject) {
        const system = oidcSubjectSystem();
        const issuer = oidcIssuer();
        const suffix = subject ? subject : "";
        const queries = [system + "|" + suffix];
        if (issuer && issuer !== system) {
            queries.push(issuer + "|" + suffix);
        }
        return queries;
    }

    function findByOidcSubject(resourceType, subject, options) {
        const type = resourceType || "Practitioner";
        const opts = options && typeof options === "object" ? options : {};
        const count = opts.count || (subject ? 20 : 200);
        const queries = oidcSubjectQueries(subject);
        let chain = $.Deferred().resolve([]).promise();
        queries.forEach(function (query) {
            chain = chain.then(function (seen) {
                return fhir(
                    "/" + type + "?identifier=" + encodeURIComponent(query) + "&_count=" + count,
                    "GET",
                    null,
                    { silent: opts.silent != null ? !!opts.silent : !subject }
                ).then(function (bundle) {
                    const next = seen.slice();
                    bundleResources(bundle, type).forEach(function (resource) {
                        if (resource && resource.id && !next.some(function (item) {
                            return item.id === resource.id;
                        })) {
                            next.push(resource);
                        }
                    });
                    return next;
                }, function () {
                    return seen;
                });
            });
        });
        return chain;
    }

    return {
        get: get,
        post: function (url, data, extra) { return send(url, "POST", data, undefined, extra); },
        put: function (url, data, extra) { return send(url, "PUT", data, undefined, extra); },
        delete: function (url, extra) { return ajax($.extend({ url: url, method: "DELETE" }, extra || {})); },
        login: login,
        logout: logout,
        fhir: fhir,
        wiremock: wiremock,
        coreAdminBridge: coreAdminBridge,
        fhirChief: fhirChief,
        icg: icg,
        showAlert: showAlert,
        showToast: showToast,
        confirm: confirmDialog,
        showFhirError: showFhirError,
        escapeHtml: escapeHtml,
        resourceLink: resourceLink,
        detailHref: detailHref,
        listHref: listHref,
        typeForRoute: typeForRoute,
        looksLikeCanonical: looksLikeCanonical,
        hashQuery: hashQuery,
        findByUrl: findByUrl,
        readByIdOrUrl: readByIdOrUrl,
        libraryTypeOf: libraryTypeOf,
        isLibraryType: isLibraryType,
        routeParamId: routeParamId,
        referenceId: referenceId,
        referenceType: referenceType,
        createdResourceId: createdResourceId,
        pageSize: PAGE_SIZE,
        pageSizes: PAGE_SIZES,
        listPageSize: listPageSize,
        pagedPath: pagedPath,
        bundleResources: bundleResources,
        renderPager: renderPager,
        valueSets: VALUE_SETS,
        valueSetFallbacks: VALUE_SET_FALLBACKS,
        expandValueSet: expandValueSet,
        fillSelectOptions: fillSelectOptions,
        fillValueSetSelect: fillValueSetSelect,
        fillValueSetChecks: fillValueSetChecks,
        valueSetDisplay: valueSetDisplay,
        geocode: geocode,
        npiLookup: npiLookup,
        post: function (url, data) { return send(url, "POST", data); },
        destroySelect: destroySelect,
        destroySelects: destroySelects,
        selectValue: selectValue,
        selectLabel: selectLabel,
        bindFhirSelect: bindFhirSelect,
        bindOrganizationSelect: bindOrganizationSelect,
        bindPatientSelect: bindPatientSelect,
        bindPractitionerSelect: bindPractitionerSelect,
        bindCaregiverSelect: bindCaregiverSelect,
        bindValueSetPicker: bindValueSetPicker,
        bindCodeSystemPicker: bindCodeSystemPicker,
        bindConceptSelect: bindConceptSelect,
        selectCoding: selectCoding,
        flattenCodeSystemConcepts: flattenCodeSystemConcepts,
        nestCodeSystemConcepts: nestCodeSystemConcepts,
        unsavedFlagHtml: unsavedFlagHtml,
        setUnsavedFlag: setUnsavedFlag,
        companionValueSetUrl: companionValueSetUrl,
        terminologyLabel: terminologyLabel,
        conceptCode: conceptCode,
        OIDC_SUBJECT_SYSTEM: OIDC_SUBJECT_SYSTEM,
        oidcSubjectSystem: oidcSubjectSystem,
        oidcIssuer: oidcIssuer,
        isOidcSubjectSystem: isOidcSubjectSystem,
        oidcSubjectIdentifier: oidcSubjectIdentifier,
        isOidcSubjectIdentifier: isOidcSubjectIdentifier,
        upsertOidcSubjectIdentifier: upsertOidcSubjectIdentifier,
        removeOidcSubjectIdentifier: removeOidcSubjectIdentifier,
        oidcSubjectQueries: oidcSubjectQueries,
        findByOidcSubject: findByOidcSubject
    };
}(jQuery));
