CadminApp.register("dashboard", function () {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<div>' +
                '<h1 class="h3 mb-1 page-title">Dashboard</h1>' +
                '<p class="text-muted mb-0">Explore FHIR resources, search, and what this server can do.</p>' +
            '</div>' +
            '<span class="badge bg-primary badge-mode" id="dash-mode"></span>' +
        '</div>' +
        '<div class="row" id="dash-cards"></div>' +
        '<div class="d-sm-flex align-items-center justify-content-between mb-3">' +
            '<h2 class="h5 mb-0">FHIR resources</h2>' +
            '<span class="text-muted small" id="dash-count-status">Loading counts…</span>' +
        "</div>" +
        '<div class="row" id="dash-counts"></div>' +
        '<div class="card shadow mb-4 d-none" id="dash-other-card">' +
            '<div class="card-header py-3"><h6 class="m-0">Other resource types</h6></div>' +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Type</th><th class=\"text-end\">Count</th><th></th></tr></thead>" +
                        '<tbody id="dash-other-rows"></tbody>' +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>" +
        '<div class="row">' +
            '<div class="col-lg-7">' +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3"><h6 class="m-0">Gateway</h6></div>' +
                    '<div class="card-body" id="dash-gateway"></div>' +
                '</div>' +
                '<div class="card shadow mb-4 d-none" id="dash-wiremock-card">' +
                    '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                        '<h6 class="m-0">WireMock</h6>' +
                        '<a class="small text-decoration-none" href="#/wiremock-mappings">Mappings</a>' +
                    "</div>" +
                    '<div class="card-body" id="dash-wiremock">' +
                        '<p class="text-muted mb-0">Loading…</p>' +
                    "</div>" +
                "</div>" +
                '<div class="card shadow mb-4 d-none" id="dash-icg-card">' +
                    '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                        '<h6 class="m-0">ICG</h6>' +
                        '<a class="small text-decoration-none" href="#/icg">Routes</a>' +
                    "</div>" +
                    '<div class="card-body" id="dash-icg">' +
                        '<p class="text-muted mb-0">Loading…</p>' +
                    "</div>" +
                "</div>" +
            '</div>' +
            '<div class="col-lg-5">' +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3"><h6 class="m-0">Quick actions</h6></div>' +
                    '<div class="card-body">' +
                        '<a class="btn btn-primary me-2 mb-2" href="#/patients">Browse patients</a>' +
                        '<a class="btn btn-outline-primary me-2 mb-2" href="#/flags">Browse flags</a>' +
                        '<a class="btn btn-outline-primary me-2 mb-2" href="#/lists">Browse lists</a>' +
                        '<a class="btn btn-outline-primary me-2 mb-2" href="#/device-associations">Device associations</a>' +
                        '<a class="btn btn-outline-primary me-2 mb-2" href="#/resources">Open FHIR browser</a>' +
                        '<a class="btn btn-outline-primary me-2 mb-2" href="#/capabilities">FHIR capabilities</a>' +
                        (CadminApp.isAdmin()
                            ? '<a class="btn btn-outline-primary me-2 mb-2" href="#/demo-data">Generate demo data</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/subscription-topics">Subscription topics</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/subscriptions">Subscriptions</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/endpoints">Endpoints</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/practitioner-roles">Practitioner roles</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/organization-affiliations">Organization affiliations</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/healthcare-services">Healthcare services</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/pds-policies">PDS policies</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/camel-routes">Camel routes</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/icg-routes">ICG routes</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/jolts">Jolt</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/core-admin-bridge">Core Admin Bridge</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/icg">Integrator Connect Gateway</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/schedules">Schedules</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/appointments">Appointments</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/appointment-book">Find and book</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/plan-definitions">Plan definitions</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/request-orchestrations">Orchestrations</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/plan-apply">Apply plan</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/search-parameters">Search parameters</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/questionnaires">Questionnaires</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/code-systems">Code systems</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/value-sets">Value sets</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/consents">Consents</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/oidc-token">OIDC token</a>' +
                              '<a class="btn btn-outline-primary me-2 mb-2" href="#/oidc-clients">OIDC clients</a>'
                            : "") +
                        '<a class="btn btn-outline-secondary mb-2" href="#/settings">Settings</a>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>'
    );

    const user = CadminApp.user() || {};
    const config = CadminApp.config() || {};
    $("#dash-mode").text((config.mode || "local").toUpperCase());

    function card(col, border, label, value, icon) {
        return '<div class="col-xl-3 col-md-6 mb-4">' +
            '<div class="card border-left-' + border + ' shadow h-100 py-2">' +
                '<div class="card-body">' +
                    '<div class="row align-items-center no-gutters">' +
                        '<div class="col me-2">' +
                            '<div class="text-xs text-uppercase text-' + border + ' mb-1">' + label + '</div>' +
                            '<div class="h5 mb-0 stat-value">' + CadminApi.escapeHtml(value) + '</div>' +
                        '</div>' +
                        '<div class="col-auto text-gray-400"><i class="bi ' + icon + ' fs-2"></i></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    const countMetrics = [
        { type: "Patient", label: "Patients", href: "#/patients", icon: "bi-people", border: "primary" },
        { type: "RelatedPerson", label: "Caregivers", href: "#/caregivers", icon: "bi-person-heart", border: "info" },
        { type: "Practitioner", label: "Practitioners", href: "#/practitioners", iconify: "mdi:doctor", border: "success" },
        { type: "Device", label: "Devices", href: "#/devices", iconify: "mdi:devices", border: "warning" },
        { type: "DeviceAssociation", label: "Device associations", href: "#/device-associations", icon: "bi-link-45deg", border: "secondary" },
        { type: "Flag", label: "Flags", href: "#/flags", icon: "bi-flag", border: "danger" },
        { type: "List", label: "Lists", href: "#/lists", icon: "bi-list-ul", border: "primary" },
        { type: "Organization", label: "Organizations", href: "#/organizations", icon: "bi-building", border: "primary", admin: true },
        { type: "Location", label: "Locations", href: "#/locations", icon: "bi-geo-alt", border: "info", admin: true },
        { type: "CareTeam", label: "Care teams", href: "#/care-teams", icon: "bi-people-fill", border: "success", admin: true },
        { type: "PractitionerRole", label: "Practitioner roles", href: "#/practitioner-roles", icon: "bi-person-vcard", border: "info", admin: true },
        { type: "OrganizationAffiliation", label: "Org affiliations", href: "#/organization-affiliations", icon: "bi-buildings", border: "warning", admin: true },
        { type: "HealthcareService", label: "Healthcare services", href: "#/healthcare-services", iconify: "mdi:medical-bag", border: "success", admin: true },
        { type: "Schedule", label: "Schedules", href: "#/schedules", icon: "bi-calendar3", border: "primary", admin: true },
        { type: "Slot", label: "Slots", href: "#/slots", icon: "bi-calendar2-week", border: "info", admin: true },
        { type: "Appointment", label: "Appointments", href: "#/appointments", icon: "bi-calendar-check", border: "success", admin: true },
        { type: "AppointmentResponse", label: "Appointment responses", href: "#/appointment-responses", icon: "bi-calendar2-check", border: "secondary", admin: true },
        { type: "PlanDefinition", label: "Plan definitions", href: "#/plan-definitions", icon: "bi-diagram-3", border: "primary", admin: true },
        { type: "ActivityDefinition", label: "Activity definitions", href: "#/activity-definitions", icon: "bi-lightning-charge", border: "warning", admin: true },
        { type: "RequestOrchestration", label: "Orchestrations", href: "#/request-orchestrations", icon: "bi-kanban", border: "success", admin: true },
        { type: "Consent", label: "Consents", href: "#/consents", icon: "bi-shield-check", border: "warning", admin: true },
        { type: "Subscription", label: "Subscriptions", href: "#/subscriptions", icon: "bi-broadcast", border: "info", admin: true },
        { type: "Endpoint", label: "Endpoints", href: "#/endpoints", icon: "bi-hdd-network", border: "secondary", admin: true },
        { type: "SubscriptionTopic", label: "Topics", href: "#/subscription-topics", icon: "bi-bookmark-star", border: "primary", admin: true },
        { key: "pds-policies", type: "Library", search: "type=pds-policies", label: "PDS policies", href: "#/pds-policies", icon: "bi-journal-text", border: "success", admin: true },
        { key: "camel-routes", type: "Library", search: "type=camel-route", label: "Camel routes", href: "#/camel-routes", iconify: "hugeicons:camel", border: "warning", admin: true },
        { key: "icg-routes", type: "Library", search: "type=icg-route", label: "ICG routes", href: "#/icg-routes", iconify: "mdi:routes", border: "info", admin: true },
        { key: "jolts", type: "Library", search: "type=jolt", label: "Jolt", href: "#/jolts", iconify: "mdi:code-json", border: "secondary", admin: true },
        { type: "SearchParameter", label: "Search params", href: "#/search-parameters", icon: "bi-search", border: "warning", admin: true },
        { type: "Questionnaire", label: "Questionnaires", href: "#/questionnaires", icon: "bi-ui-checks", border: "info", admin: true },
        { type: "CodeSystem", label: "Code systems", href: "#/code-systems", icon: "bi-braces", border: "primary", admin: true },
        { type: "ValueSet", label: "Value sets", href: "#/value-sets", icon: "bi-tags", border: "success", admin: true }
    ];

    function featuredMetrics() {
        return countMetrics.filter(function (metric) {
            return !metric.admin || CadminApp.isAdmin();
        });
    }

    function formatCount(value) {
        if (value == null) {
            return "—";
        }
        return Number(value).toLocaleString();
    }

    function countIcon(metric) {
        if (metric.iconify) {
            return '<iconify-icon icon="' + metric.iconify + '" class="stat-icon" aria-hidden="true"></iconify-icon>';
        }
        return '<i class="bi ' + metric.icon + ' fs-2"></i>';
    }

    function countCard(metric, value) {
        return '<div class="col-xl-3 col-md-6 mb-4">' +
            '<a class="dash-count-card text-decoration-none" href="' + metric.href + '">' +
                '<div class="card border-left-' + metric.border + ' shadow h-100 py-2">' +
                    '<div class="card-body">' +
                        '<div class="row align-items-center no-gutters">' +
                            '<div class="col me-2">' +
                                '<div class="text-xs text-uppercase text-' + metric.border + ' mb-1">' +
                                    CadminApi.escapeHtml(metric.label) + "</div>" +
                                '<div class="h5 mb-0 stat-value">' + CadminApi.escapeHtml(formatCount(value)) + "</div>" +
                            "</div>" +
                            '<div class="col-auto text-gray-400">' + countIcon(metric) + "</div>" +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</a></div>";
    }

    function parseCountParameters(parameters) {
        const counts = {};
        ((parameters && parameters.parameter) || []).forEach(function (item) {
            if (item && item.name && typeof item.valueInteger === "number") {
                counts[item.name] = item.valueInteger;
            }
        });
        return counts;
    }

    function metricId(metric) {
        return metric.key || metric.type;
    }

    function renderCounts(counts, note) {
        const featured = featuredMetrics();
        const featuredTypes = {};
        const featuredIds = {};
        $("#dash-counts").html(featured.map(function (metric) {
            featuredTypes[metric.type] = true;
            const id = metricId(metric);
            featuredIds[id] = true;
            const value = Object.prototype.hasOwnProperty.call(counts, id)
                ? counts[id]
                : (Object.prototype.hasOwnProperty.call(counts, metric.type) && !metric.search
                    ? counts[metric.type]
                    : 0);
            return countCard(metric, value);
        }).join(""));
        const others = Object.keys(counts).filter(function (type) {
            return !featuredTypes[type] && !featuredIds[type] && counts[type] > 0;
        }).sort();
        if (others.length) {
            $("#dash-other-rows").html(others.map(function (type) {
                return "<tr>" +
                    "<td>" + CadminApi.escapeHtml(type) + "</td>" +
                    '<td class="text-end">' + CadminApi.escapeHtml(formatCount(counts[type])) + "</td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="#/resources/' +
                        encodeURIComponent(type) + '">Browse</a></td></tr>';
            }).join(""));
            $("#dash-other-card").removeClass("d-none");
        } else {
            $("#dash-other-card").addClass("d-none");
        }
        $("#dash-count-status").text(note || "");
    }

    function loadResourceCounts() {
        const featured = featuredMetrics();
        const cached = {};
        const live = {};
        let pending = featured.length + 1;
        let finished = false;

        function finish() {
            pending -= 1;
            if (pending > 0 || finished) {
                return;
            }
            finished = true;
            const counts = Object.assign({}, cached);
            featured.forEach(function (metric) {
                const id = metricId(metric);
                if (typeof live[id] === "number") {
                    counts[id] = live[id];
                } else if (!metric.search && !Object.prototype.hasOwnProperty.call(counts, id)) {
                    counts[id] = live[id];
                }
            });
            renderCounts(counts);
        }

        CadminApi.fhir("/$get-resource-counts", "GET", null, { silent: true })
            .done(function (parameters) {
                Object.assign(cached, parseCountParameters(parameters));
            })
            .always(finish);

        featured.forEach(function (metric) {
            const id = metricId(metric);
            const query = (metric.search ? metric.search + "&" : "") + "_summary=count&_count=0&_total=accurate";
            CadminApi.fhir("/" + encodeURIComponent(metric.type) + "?" + query, "GET", null, { silent: true })
                .done(function (bundle) {
                    if (typeof bundle.total === "number") {
                        live[id] = bundle.total;
                    }
                })
                .fail(function () {
                    live[id] = !metric.search && Object.prototype.hasOwnProperty.call(cached, metric.type)
                        ? cached[metric.type]
                        : null;
                })
                .always(finish);
        });
    }

    function countLink(href, value) {
        if (value == null) {
            return "—";
        }
        return '<a href="' + href + '">' + CadminApi.escapeHtml(formatCount(value)) + "</a>";
    }

    function renderWiremockMetrics(result) {
        const wm = window.CadminWiremock;
        const health = result.health || {};
        const requests = result.requests || {};
        const journalDisabled = !!requests.requestJournalDisabled;
        const healthy = health.status === "healthy" || health.status === "UP";
        const up = !!(result.health || result.mappings || result.requests || result.scenarios);
        const version = health.version || "—";
        const mappings = wm ? wm.adminTotal(result.mappings, "mappings") : null;
        const journal = journalDisabled ? null : (wm ? wm.adminTotal(result.requests, "requests") : null);
        const unmatched = journalDisabled ? null : (wm ? wm.adminTotal(result.unmatched, "requests") : null);
        const scenarios = result.scenarios && Array.isArray(result.scenarios.scenarios)
            ? result.scenarios.scenarios.length
            : null;
        $("#dash-wiremock").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-4">Status</dt><dd class="col-sm-8">' +
                    (up
                        ? '<span class="badge text-bg-success">' + (healthy ? "Healthy" : "Up") + "</span>"
                        : '<span class="badge text-bg-danger">Down</span>') +
                    (!up && result.error
                        ? ' <small class="text-muted">' + CadminApi.escapeHtml(result.error) + "</small>"
                        : "") +
                "</dd>" +
                '<dt class="col-sm-4">Version</dt><dd class="col-sm-8">' +
                    CadminApi.escapeHtml(version) + "</dd>" +
                '<dt class="col-sm-4">Uptime</dt><dd class="col-sm-8">' +
                    CadminApi.escapeHtml(wm ? wm.formatDuration(health.uptimeInSeconds) : "—") + "</dd>" +
                '<dt class="col-sm-4">Mappings</dt><dd class="col-sm-8">' +
                    countLink("#/wiremock-mappings", mappings) + "</dd>" +
                '<dt class="col-sm-4">Requests</dt><dd class="col-sm-8">' +
                    (journalDisabled
                        ? '<span class="text-muted">Journal disabled</span>'
                        : countLink("#/wiremock-requests", journal)) +
                "</dd>" +
                '<dt class="col-sm-4">Unmatched</dt><dd class="col-sm-8">' +
                    (journalDisabled
                        ? "—"
                        : countLink("#/wiremock-requests", unmatched)) +
                "</dd>" +
                '<dt class="col-sm-4">Scenarios</dt><dd class="col-sm-8">' +
                    countLink("#/wiremock-scenarios", scenarios) + "</dd>" +
            "</dl>"
        );
    }

    function loadWiremockMetrics() {
        if (!CadminApp.isAdmin()) {
            return;
        }
        $("#dash-wiremock-card").removeClass("d-none");
        const result = {};
        let pending = 5;
        let finished = false;

        function finish() {
            pending -= 1;
            if (pending > 0 || finished) {
                return;
            }
            finished = true;
            if (!result.health && !result.mappings && !result.requests && !result.scenarios) {
                const wm = window.CadminWiremock;
                result.error = wm ? wm.fail("Load WireMock", result.xhr) : "WireMock is unavailable.";
            }
            renderWiremockMetrics(result);
        }

        function take(key, path) {
            CadminApi.wiremock(path)
                .done(function (body) {
                    result[key] = body;
                })
                .fail(function (xhr) {
                    result.xhr = result.xhr || xhr;
                })
                .always(finish);
        }

        take("health", "/__admin/health");
        take("mappings", "/__admin/mappings?limit=1");
        take("requests", "/__admin/requests?limit=1");
        take("unmatched", "/__admin/requests?limit=1&unmatched=true");
        take("scenarios", "/__admin/scenarios");
    }

    function renderIcgMetrics(result) {
        const icg = window.CadminIcg;
        const status = result.status || {};
        const health = result.health || {};
        const totals = status.totals || {};
        const healthUp = health.status === "UP" || health.up === true;
        const up = !!(result.status || result.health);
        const routes = result.status && Array.isArray(status.routes) ? status.routes.length : null;
        const libraries = result.status && Array.isArray(status.libraries) ? status.libraries.length : null;
        const requests = result.status
            ? (totals.requests != null ? totals.requests : 0)
            : null;
        const errors = result.status
            ? (totals.errors != null ? totals.errors : 0)
            : null;
        $("#dash-icg").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-4">Status</dt><dd class="col-sm-8">' +
                    (up
                        ? '<span class="badge text-bg-success">' + (healthUp ? "Up" : "Reachable") + "</span>"
                        : '<span class="badge text-bg-danger">Down</span>') +
                    (!up && result.error
                        ? ' <small class="text-muted">' + CadminApi.escapeHtml(result.error) + "</small>"
                        : "") +
                "</dd>" +
                '<dt class="col-sm-4">Uptime</dt><dd class="col-sm-8">' +
                    CadminApi.escapeHtml(icg ? icg.formatDuration(totals.uptimeSeconds) : "—") + "</dd>" +
                '<dt class="col-sm-4">Routes</dt><dd class="col-sm-8">' +
                    countLink("#/icg", routes) + "</dd>" +
                '<dt class="col-sm-4">Libraries</dt><dd class="col-sm-8">' +
                    countLink("#/icg-routes", libraries) + "</dd>" +
                '<dt class="col-sm-4">Requests</dt><dd class="col-sm-8">' +
                    countLink("#/icg", requests) + "</dd>" +
                '<dt class="col-sm-4">Failed</dt><dd class="col-sm-8">' +
                    CadminApi.escapeHtml(formatCount(errors)) + "</dd>" +
                '<dt class="col-sm-4">Success rate</dt><dd class="col-sm-8">' +
                    CadminApi.escapeHtml(icg ? icg.successRate(totals) : "—") + "</dd>" +
                '<dt class="col-sm-4">Mean</dt><dd class="col-sm-8">' +
                    CadminApi.escapeHtml(icg ? icg.formatMs(totals.meanMs) : "—") + "</dd>" +
            "</dl>"
        );
    }

    function loadIcgMetrics() {
        if (!CadminApp.isAdmin()) {
            return;
        }
        $("#dash-icg-card").removeClass("d-none");
        const result = {};
        let pending = 2;
        let finished = false;

        function finish() {
            pending -= 1;
            if (pending > 0 || finished) {
                return;
            }
            finished = true;
            if (!result.status && !result.health) {
                const icg = window.CadminIcg;
                result.error = icg ? icg.fail("Load ICG", result.xhr) : "ICG is unavailable.";
            }
            renderIcgMetrics(result);
        }

        function take(key, path) {
            CadminApi.icg(path)
                .done(function (body) {
                    result[key] = body;
                })
                .fail(function (xhr) {
                    result.xhr = result.xhr || xhr;
                })
                .always(finish);
        }

        take("status", "/status");
        take("health", "/actuator/health");
    }

    CadminApi.get("/api/status").done(function (status) {
        const fhir = status.fhir || {};
        $("#dash-cards").html(
            card("3", "primary", "Signed in", user.displayName || user.username || "—", "bi-person-check") +
            card("3", "success", "HAPI FHIR", fhir.up ? "Reachable" : "Unavailable", "bi-activity") +
            card("3", "info", "Proxy path", fhir.proxyPath || "/fhir", "bi-diagram-3") +
            card("3", "warning", "Security", (status.securityMode || config.mode || "").toUpperCase(), "bi-shield-lock")
        );
        $("#dash-gateway").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-4">Application</dt><dd class="col-sm-8">' + CadminApi.escapeHtml(status.application) + '</dd>' +
                '<dt class="col-sm-4">FHIR origin</dt><dd class="col-sm-8"><code>' + CadminApi.escapeHtml(fhir.uri) + '</code></dd>' +
                '<dt class="col-sm-4">Status</dt><dd class="col-sm-8">' +
                    (fhir.up ? '<span class="badge text-bg-success">Up</span>' : '<span class="badge text-bg-danger">Down</span>') +
                    (fhir.error ? ' <small class="text-muted">' + CadminApi.escapeHtml(fhir.error) + '</small>' : '') +
                '</dd>' +
            '</dl>'
        );
        loadResourceCounts();
        loadWiremockMetrics();
        loadIcgMetrics();
    }).fail(function () {
        $("#dash-cards").html(card("3", "danger", "Gateway", "Status check failed", "bi-exclamation-triangle"));
        loadResourceCounts();
        loadWiremockMetrics();
        loadIcgMetrics();
    });
});
