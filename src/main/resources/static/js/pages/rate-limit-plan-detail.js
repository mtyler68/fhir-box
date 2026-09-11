window.CadminRateLimitPlanDetail = (function () {
    const libraryType = "rate-limit-plan";
    const planContentType = "application/icg-rate-limit+json";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const markdownFields = ["rlp-description", "rlp-purpose", "rlp-usage", "rlp-copyright"];
    const markdownFieldKeys = {
        "rlp-description": "description",
        "rlp-purpose": "purpose",
        "rlp-usage": "usage",
        "rlp-copyright": "copyright"
    };
    let library = null;
    let plan = emptyPlan(null);
    let icgRoutes = [];
    let markdownEditors = {};
    let turndown = null;
    let jsonPreviewEditor = null;
    let savedPlan = "";
    let savedBasics = "";

    function pageRoot() {
        if (window.CadminWorkspace && typeof CadminWorkspace.root === "function") {
            return CadminWorkspace.root() || document;
        }
        return document;
    }

    function $page(selector) {
        const $root = $(pageRoot());
        return selector ? $root.find(selector) : $root;
    }

    function pageEl(id) {
        const root = pageRoot();
        if (root && root.querySelector) {
            return root.querySelector("#" + id);
        }
        return document.getElementById(id);
    }

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

    function planLabel() {
        return (library && (library.title || library.name || library.id)) || "Rate-limit plan";
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

    function isPlanJson(item) {
        const type = ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
        return type === planContentType || type === "application/json" || type === "text/json";
    }

    function findPlanAttachment() {
        return (library.content || []).find(isPlanJson) || (library.content || [])[0] || null;
    }

    function readPlanText() {
        const attachment = findPlanAttachment();
        return attachment && attachment.data ? decodeText(attachment.data) : "";
    }

    function upsertPlanJson(text) {
        const attachment = {
            contentType: planContentType,
            title: "Rate-limit plan",
            data: encodeText(text || "")
        };
        library.content = library.content || [];
        let found = false;
        library.content = library.content.map(function (item) {
            if (!isPlanJson(item)) {
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

    function emptyLimits(useDefaults) {
        return {
            useDefaults: !!useDefaults,
            enableRps: false,
            rpm: 60,
            rpd: 10000,
            rps: 1
        };
    }

    function emptyPlan(resource) {
        return {
            tier: (resource && resource.name) || "gold",
            policyVersion: (resource && resource.version) || "1.0.0",
            defaults: emptyLimits(false),
            groups: [],
            endpoints: []
        };
    }

    function parseLimits(obj) {
        obj = obj && typeof obj === "object" ? obj : {};
        const hasLimit = obj.requestsPerMinute != null || obj.requestsPerDay != null
            || obj.requestsPerSecond != null;
        return {
            useDefaults: !hasLimit,
            enableRps: obj.requestsPerSecond != null,
            rpm: obj.requestsPerMinute != null ? obj.requestsPerMinute : 60,
            rpd: obj.requestsPerDay != null ? obj.requestsPerDay : 10000,
            rps: obj.requestsPerSecond != null ? obj.requestsPerSecond : 1
        };
    }

    function planFromJson(json, resource) {
        const next = emptyPlan(resource);
        if (!json || typeof json !== "object") {
            return next;
        }
        if (json.tier) {
            next.tier = String(json.tier);
        }
        if (json.policyVersion != null && json.policyVersion !== "") {
            next.policyVersion = String(json.policyVersion);
        }
        if (json.defaults && typeof json.defaults === "object") {
            const defaults = parseLimits(json.defaults);
            defaults.useDefaults = false;
            next.defaults = defaults;
        }
        Object.keys(json.groups || {}).forEach(function (id) {
            const group = json.groups[id] || {};
            const limits = parseLimits(group);
            next.groups.push({
                id: id,
                useDefaults: limits.useDefaults,
                enableRps: limits.enableRps,
                rpm: limits.rpm,
                rpd: limits.rpd,
                rps: limits.rps,
                endpoints: Array.isArray(group.endpoints) ? group.endpoints.map(String) : []
            });
        });
        Object.keys(json.endpoints || {}).forEach(function (id) {
            const item = json.endpoints[id] || {};
            const limits = parseLimits(item);
            next.endpoints.push({
                id: id,
                useDefaults: limits.useDefaults,
                enableRps: limits.enableRps,
                rpm: limits.rpm,
                rpd: limits.rpd,
                rps: limits.rps
            });
        });
        return next;
    }

    function loadPlanFromLibrary() {
        const text = readPlanText();
        if (!String(text || "").trim()) {
            plan = emptyPlan(library);
            return;
        }
        try {
            plan = planFromJson(JSON.parse(text), library);
        } catch (ignored) {
            plan = emptyPlan(library);
            CadminApi.showToast("danger", "Stored plan JSON is invalid. Showing empty defaults.");
        }
    }

    function emitLimits(item) {
        if (item && item.useDefaults) {
            return {};
        }
        const out = {};
        const rpm = Number(item && item.rpm);
        const rpd = Number(item && item.rpd);
        if (Number.isFinite(rpm) && rpm >= 0) {
            out.requestsPerMinute = rpm;
        }
        if (Number.isFinite(rpd) && rpd >= 0) {
            out.requestsPerDay = rpd;
        }
        if (item && item.enableRps) {
            const rps = Number(item.rps);
            if (Number.isFinite(rps) && rps >= 0) {
                out.requestsPerSecond = rps;
            }
        }
        return out;
    }

    function planToJson() {
        const json = {
            tier: String(plan.tier || "").trim() || "gold",
            policyVersion: String(plan.policyVersion || "").trim() || "1"
        };
        json.defaults = emitLimits(Object.assign({}, plan.defaults, { useDefaults: false }));
        const groups = {};
        (plan.groups || []).forEach(function (group) {
            const id = String(group.id || "").trim();
            if (!id) {
                return;
            }
            const body = emitLimits(group);
            body.endpoints = (group.endpoints || []).map(String).filter(Boolean);
            groups[id] = body;
        });
        if (Object.keys(groups).length) {
            json.groups = groups;
        }
        const endpoints = {};
        (plan.endpoints || []).forEach(function (item) {
            const id = String(item.id || "").trim();
            if (!id) {
                return;
            }
            endpoints[id] = emitLimits(item);
        });
        if (Object.keys(endpoints).length) {
            json.endpoints = endpoints;
        }
        return json;
    }

    function prettyPlan() {
        return JSON.stringify(planToJson(), null, 2);
    }

    function usedRouteIds(except) {
        const used = {};
        (plan.groups || []).forEach(function (group, gi) {
            (group.endpoints || []).forEach(function (id, ei) {
                if (except && except.kind === "group" && except.index === gi && except.endpointIndex === ei) {
                    return;
                }
                if (id) {
                    used[id] = true;
                }
            });
        });
        (plan.endpoints || []).forEach(function (item, index) {
            if (except && except.kind === "endpoint" && except.index === index) {
                return;
            }
            if (item && item.id) {
                used[item.id] = true;
            }
        });
        return used;
    }

    function availableRoutes(except) {
        const used = usedRouteIds(except);
        return icgRoutes.filter(function (route) {
            return route.id && !used[route.id];
        });
    }

    function routeSelectHtml(id, except) {
        const options = availableRoutes(except);
        return '<select class="form-select form-select-sm" id="' + esc(id) + '">' +
            '<option value="">Select an ICG route…</option>' +
            options.map(function (route) {
                const extra = route.title && route.title !== route.id ? " · " + route.title : "";
                return '<option value="' + esc(route.id) + '">' + esc(route.id + extra) + "</option>";
            }).join("") +
            "</select>";
    }

    function numberInput(id, value, min) {
        return '<input type="number" class="form-control" id="' + esc(id) + '" min="' + (min == null ? 0 : min) +
            '" step="1" value="' + esc(value) + '">';
    }

    function limitsFields(prefix, item, includeUseDefaults) {
        const hidden = includeUseDefaults && item.useDefaults ? " d-none" : "";
        const rpsHidden = item.enableRps ? "" : " d-none";
        return (includeUseDefaults
            ? '<div class="form-check form-switch mb-3">' +
                '<input class="form-check-input rlp-use-defaults" type="checkbox" role="switch" id="' +
                    esc(prefix + "-use-defaults") + '"' + (item.useDefaults ? " checked" : "") + ">" +
                '<label class="form-check-label" for="' + esc(prefix + "-use-defaults") + '">Use defaults</label>' +
                '<div class="form-text">When on, this definition is stored without rate-limit numbers.</div>' +
            "</div>"
            : "") +
            '<div class="rlp-limits' + hidden + '">' +
                fieldRow(
                    field("Requests per minute", numberInput(prefix + "-rpm", item.rpm, 0)),
                    field("Requests per day", numberInput(prefix + "-rpd", item.rpd, 0))) +
                '<div class="form-check form-switch mb-3">' +
                    '<input class="form-check-input rlp-enable-rps" type="checkbox" role="switch" id="' +
                        esc(prefix + "-enable-rps") + '"' + (item.enableRps ? " checked" : "") + ">" +
                    '<label class="form-check-label" for="' + esc(prefix + "-enable-rps") +
                        '">Limit requests per second</label>' +
                "</div>" +
                '<div class="rlp-rps' + rpsHidden + '">' +
                    field("Requests per second", numberInput(prefix + "-rps", item.rps, 0),
                        "Omitted from JSON when this switch is off.") +
                "</div>" +
            "</div>";
    }

    function routeChip(id, removeAttr) {
        return '<span class="badge text-bg-secondary rlp-route-chip me-1 mb-1">' +
            '<code class="text-reset">' + esc(id) + "</code>" +
            '<button class="btn-close btn-close-white" type="button" style="font-size:0.55rem" ' +
                removeAttr + ' aria-label="Remove ' + esc(id) + '"></button></span>';
    }

    function renderDefaults() {
        $("#rlp-tier").val(plan.tier || "");
        $("#rlp-policy-version").val(plan.policyVersion || "");
        $("#rlp-defaults-host").html(limitsFields("rlp-def", plan.defaults, false));
    }

    function renderGroups() {
        if (!plan.groups.length) {
            $("#rlp-groups-list").html('<p class="text-muted mb-0">No groups. Add a named shared pool.</p>');
            return;
        }
        $("#rlp-groups-list").html(plan.groups.map(function (group, index) {
            const prefix = "rlp-g" + index;
            const chips = (group.endpoints || []).map(function (id, ei) {
                return routeChip(id, 'data-remove-group-route="' + index + '" data-route-index="' + ei + '"');
            }).join("") || '<span class="text-muted">No routes in this group.</span>';
            const addSelect = routeSelectHtml(prefix + "-add", { kind: "group", index: index, endpointIndex: -1 });
            return '<div class="border rounded p-3 mb-3" data-group-index="' + index + '">' +
                '<div class="d-flex justify-content-between align-items-start gap-2 mb-3">' +
                    field("Group ID", '<input class="form-control font-monospace" id="' + prefix + '-id" value="' +
                        esc(group.id) + '">') +
                    '<button class="btn btn-sm btn-outline-danger mt-4" type="button" data-remove-group="' +
                        index + '">Remove</button>' +
                "</div>" +
                limitsFields(prefix, group, true) +
                '<div class="mb-2"><div class="form-label">Routes</div>' + chips + "</div>" +
                '<div class="d-flex flex-wrap gap-2 align-items-end">' +
                    '<div class="flex-grow-1" style="min-width:12rem">' + addSelect + "</div>" +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-add-group-route="' +
                        index + '">Add route</button>' +
                "</div>" +
            "</div>";
        }).join(""));
    }

    function renderEndpoints() {
        if (!plan.endpoints.length) {
            $("#rlp-endpoints-list").html(
                '<p class="text-muted mb-0">No dedicated endpoints. Unlisted ICG routes use the plan defaults.</p>');
        } else {
            $("#rlp-endpoints-list").html(plan.endpoints.map(function (item, index) {
                const prefix = "rlp-e" + index;
                return '<div class="border rounded p-3 mb-3" data-endpoint-index="' + index + '">' +
                    '<div class="d-flex justify-content-between align-items-start gap-2 mb-2">' +
                        '<div><div class="form-label mb-1">Route ID</div>' +
                            '<code>' + esc(item.id) + "</code></div>" +
                        '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-endpoint="' +
                            index + '">Remove</button>' +
                    "</div>" +
                    limitsFields(prefix, item, true) +
                "</div>";
            }).join(""));
        }
        $("#rlp-endpoint-add-host").html(routeSelectHtml("rlp-endpoint-add", { kind: "endpoint", index: -1 }));
    }

    function renderPlanEditor() {
        renderDefaults();
        renderGroups();
        renderEndpoints();
        const available = availableRoutes();
        $("#rlp-no-routes").toggleClass("d-none", icgRoutes.length > 0);
        $("#rlp-all-used").toggleClass("d-none", !(icgRoutes.length && !available.length));
        renderSummary();
    }

    function limitsLabel(item, opts) {
        opts = opts || {};
        if (!opts.forceLimits && item && item.useDefaults) {
            return "Uses defaults";
        }
        const parts = [];
        const rpm = Number(item && item.rpm);
        const rpd = Number(item && item.rpd);
        const rps = Number(item && item.rps);
        if (Number.isFinite(rpm)) {
            parts.push(rpm + "/min");
        }
        if (Number.isFinite(rpd)) {
            parts.push(rpd + "/day");
        }
        if (item && item.enableRps && Number.isFinite(rps)) {
            parts.push(rps + "/sec");
        }
        return parts.join(" · ") || "—";
    }

    function routeTitle(id) {
        const match = icgRoutes.find(function (route) { return route.id === id; });
        return match && match.title && match.title !== id ? match.title : "";
    }

    function summaryStat(border, label, value) {
        return '<div class="col-md-4 mb-3">' +
            '<div class="card border-left-' + border + ' h-100 py-2">' +
                '<div class="card-body py-2">' +
                    '<div class="text-xs text-uppercase text-' + border + ' mb-1">' + esc(label) + "</div>" +
                    '<div class="h5 mb-0">' + esc(value) + "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function summaryDl(rows) {
        return "<dl class=\"row mb-0\">" + rows.map(function (row) {
            return '<dt class="col-sm-4">' + esc(row[0]) + '</dt><dd class="col-sm-8">' + row[1] + "</dd>";
        }).join("") + "</dl>";
    }

    function assignedRoutes() {
        const rows = [];
        (plan.groups || []).forEach(function (group) {
            (group.endpoints || []).forEach(function (id) {
                if (!id) {
                    return;
                }
                rows.push({
                    id: id,
                    pool: "Group · " + (group.id || "—"),
                    limits: limitsLabel(group)
                });
            });
        });
        (plan.endpoints || []).forEach(function (item) {
            if (!item || !item.id) {
                return;
            }
            rows.push({
                id: item.id,
                pool: "Dedicated",
                limits: limitsLabel(item)
            });
        });
        return rows;
    }

    function renderSummary() {
        if (!$("#rlp-summary").length) {
            return;
        }
        const assigned = assignedRoutes();
        const used = usedRouteIds();
        const unlisted = icgRoutes.filter(function (route) { return route.id && !used[route.id]; });
        $("#rlp-summary-stats").html(
            '<div class="row">' +
                summaryStat("primary", "Groups", String((plan.groups || []).length)) +
                summaryStat("info", "Dedicated endpoints", String((plan.endpoints || []).length)) +
                summaryStat("success", "Assigned routes", String(assigned.length)) +
            "</div>"
        );
        $("#rlp-summary-basics").html(summaryDl([
            ["Tier", "<code>" + esc(plan.tier || "—") + "</code>"],
            ["Policy version", "<code>" + esc(plan.policyVersion || "—") + "</code>"],
            ["Default limits", esc(limitsLabel(plan.defaults, { forceLimits: true }))]
        ]));
        if (!(plan.groups || []).length) {
            $("#rlp-summary-groups").html('<p class="text-muted mb-0">No groups.</p>');
        } else {
            $("#rlp-summary-groups").html(
                '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                    "<thead><tr><th>Group</th><th>Limits</th><th>Routes</th></tr></thead><tbody>" +
                    plan.groups.map(function (group) {
                        const routes = (group.endpoints || []).filter(Boolean);
                        const chips = routes.length
                            ? routes.map(function (id) {
                                return "<code>" + esc(id) + "</code>";
                            }).join(", ")
                            : '<span class="text-muted">None</span>';
                        return "<tr><td><code>" + esc(group.id || "—") + "</code></td><td>" +
                            esc(limitsLabel(group)) + "</td><td>" + chips + "</td></tr>";
                    }).join("") +
                    "</tbody></table></div>"
            );
        }
        if (!(plan.endpoints || []).length) {
            $("#rlp-summary-endpoints").html('<p class="text-muted mb-0">No dedicated endpoints.</p>');
        } else {
            $("#rlp-summary-endpoints").html(
                '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                    "<thead><tr><th>Route</th><th>Limits</th></tr></thead><tbody>" +
                    plan.endpoints.map(function (item) {
                        const extra = routeTitle(item.id);
                        return "<tr><td><code>" + esc(item.id || "—") + "</code>" +
                            (extra ? '<div class="small text-muted">' + esc(extra) + "</div>" : "") +
                            "</td><td>" + esc(limitsLabel(item)) + "</td></tr>";
                    }).join("") +
                    "</tbody></table></div>"
            );
        }
        const assignmentRows = assigned.map(function (row) {
            const extra = routeTitle(row.id);
            return "<tr><td><code>" + esc(row.id) + "</code>" +
                (extra ? '<div class="small text-muted">' + esc(extra) + "</div>" : "") +
                "</td><td>" + esc(row.pool) + "</td><td>" + esc(row.limits) + "</td></tr>";
        });
        unlisted.forEach(function (route) {
            assignmentRows.push(
                "<tr><td><code>" + esc(route.id) + "</code>" +
                    (route.title && route.title !== route.id
                        ? '<div class="small text-muted">' + esc(route.title) + "</div>" : "") +
                '</td><td><span class="text-muted">Unlisted · defaults</span></td><td>' +
                    esc(limitsLabel(plan.defaults, { forceLimits: true })) + "</td></tr>"
            );
        });
        if (!assignmentRows.length) {
            $("#rlp-summary-routes").html(
                '<p class="text-muted mb-0">No ICG routes are assigned. Unlisted routes use the plan defaults.</p>');
        } else {
            $("#rlp-summary-routes").html(
                '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                    "<thead><tr><th>Route</th><th>Pool</th><th>Limits</th></tr></thead><tbody>" +
                    assignmentRows.join("") +
                    "</tbody></table></div>"
            );
        }
    }

    function parseIcgRouteIds(yamlText) {
        if (!yamlText || typeof jsyaml === "undefined") {
            return [];
        }
        try {
            const parsed = jsyaml.load(yamlText);
            const items = Array.isArray(parsed) ? parsed : [];
            return items.map(function (item) {
                return item && typeof item.id === "string" ? item.id.trim() : "";
            }).filter(Boolean);
        } catch (ignored) {
            return [];
        }
    }

    function decodeLibraryYaml(resource) {
        const attachment = ((resource && resource.content) || []).find(function (item) {
            const type = ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
            return type === "application/gateway+yaml" || type.indexOf("yaml") >= 0;
        }) || ((resource && resource.content) || [])[0];
        return attachment && attachment.data ? decodeText(attachment.data) : "";
    }

    function loadIcgRoutes() {
        return CadminApi.fhir("/Library?type=icg-route&_count=200&_sort=title", "GET", null, { silent: true })
            .then(function (bundle) {
                const seen = {};
                const routes = [];
                CadminApi.bundleResources(bundle, "Library").forEach(function (resource) {
                    parseIcgRouteIds(decodeLibraryYaml(resource)).forEach(function (id) {
                        if (seen[id]) {
                            return;
                        }
                        seen[id] = true;
                        routes.push({
                            id: id,
                            title: resource.title || resource.name || resource.id,
                            libraryId: resource.id
                        });
                    });
                });
                routes.sort(function (a, b) {
                    return a.id.localeCompare(b.id);
                });
                icgRoutes = routes;
            }, function () {
                icgRoutes = [];
            });
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
            tool("guide", "https://www.markdownguide.org/basic-syntax/", "bi bi-question-circle no-disable",
                "Markdown guide")
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
                    /* already detached */
                }
            }
        });
        markdownEditors = {};
    }

    function markdownValue(id) {
        const mde = markdownEditors[id];
        if (!mde) {
            const el = pageEl(id);
            return el ? (el.value || "") : ((library && library[markdownFieldKeys[id]]) || "");
        }
        return mde.value() || "";
    }

    function setMarkdownValue(id, value) {
        const next = htmlToMarkdown(value || "");
        const mde = markdownEditors[id];
        if (!mde) {
            const el = pageEl(id);
            if (el) {
                el.value = next;
            }
            return;
        }
        if (mde.value() !== next) {
            mde.value(next);
        }
    }

    function mountMarkdownEditors() {
        if (typeof EasyMDE === "undefined") {
            return;
        }
        markdownFields.forEach(function (id) {
            const el = pageEl(id);
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
                    /* already detached */
                }
            }
            const textarea = pageEl(id);
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
        setMarkdownValue("rlp-description", library && library.description);
        setMarkdownValue("rlp-purpose", library && library.purpose);
        setMarkdownValue("rlp-usage", library && library.usage);
        setMarkdownValue("rlp-copyright", library && library.copyright);
    }

    function refreshMarkdownEditors() {
        Object.keys(markdownEditors).forEach(function (id) {
            const mde = markdownEditors[id];
            if (mde && mde.codemirror) {
                mde.codemirror.refresh();
            }
        });
    }

    function basicsSnapshot() {
        return [
            $page("#rlp-title-input").val() || "",
            $page("#rlp-status").val() || "",
            $page("#rlp-experimental").is(":checked") ? "1" : "0",
            markdownValue("rlp-description"),
            markdownValue("rlp-purpose"),
            markdownValue("rlp-usage"),
            markdownValue("rlp-copyright"),
            $page("#rlp-url").val() || "",
            $page("#rlp-name").val() || "",
            $page("#rlp-version").val() || "",
            $page("#rlp-publisher").val() || "",
            $page("#rlp-date").val() || "",
            $page("#rlp-approval").val() || "",
            $page("#rlp-review").val() || "",
            $page("#rlp-period-start").val() || "",
            $page("#rlp-period-end").val() || ""
        ].join("\n");
    }

    function syncUnsavedFlag() {
        const dirty = prettyPlan() !== savedPlan || basicsSnapshot() !== savedBasics;
        CadminApi.setUnsavedFlag(CadminWorkspace.root(), dirty);
    }

    function markClean() {
        savedPlan = prettyPlan();
        savedBasics = basicsSnapshot();
        syncUnsavedFlag();
    }

    function applyMeta() {
        setOrDelete(library, "title", $page("#rlp-title-input").val());
        library.status = $page("#rlp-status").val() || "draft";
        library.type = {
            coding: [{ code: libraryType, display: "Rate-limit plan" }],
            text: libraryType
        };
        if ($page("#rlp-experimental").is(":checked")) {
            library.experimental = true;
        } else {
            delete library.experimental;
        }
        setOrDelete(library, "description", htmlToMarkdown(markdownValue("rlp-description")));
        setOrDelete(library, "purpose", htmlToMarkdown(markdownValue("rlp-purpose")));
        setOrDelete(library, "usage", htmlToMarkdown(markdownValue("rlp-usage")));
        setOrDelete(library, "copyright", htmlToMarkdown(markdownValue("rlp-copyright")));
        setOrDelete(library, "url", $page("#rlp-url").val());
        setOrDelete(library, "name", $page("#rlp-name").val());
        setOrDelete(library, "version", $page("#rlp-version").val());
        setOrDelete(library, "publisher", $page("#rlp-publisher").val());
        setOrDelete(library, "date", $page("#rlp-date").val());
        setOrDelete(library, "approvalDate", $page("#rlp-approval").val());
        setOrDelete(library, "lastReviewDate", $page("#rlp-review").val());
        const start = ($page("#rlp-period-start").val() || "").trim();
        const end = ($page("#rlp-period-end").val() || "").trim();
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

    function readNumber(id, fallback) {
        const n = Number($(id).val());
        return Number.isFinite(n) ? n : fallback;
    }

    function harvestPlan() {
        plan.tier = ($("#rlp-tier").val() || "").trim();
        plan.policyVersion = ($("#rlp-policy-version").val() || "").trim();
        plan.defaults.rpm = readNumber("#rlp-def-rpm", plan.defaults.rpm);
        plan.defaults.rpd = readNumber("#rlp-def-rpd", plan.defaults.rpd);
        plan.defaults.enableRps = $("#rlp-def-enable-rps").is(":checked");
        plan.defaults.rps = readNumber("#rlp-def-rps", plan.defaults.rps);
        plan.groups.forEach(function (group, index) {
            const prefix = "#rlp-g" + index;
            group.id = ($(prefix + "-id").val() || "").trim();
            group.useDefaults = $(prefix + "-use-defaults").is(":checked");
            group.rpm = readNumber(prefix + "-rpm", group.rpm);
            group.rpd = readNumber(prefix + "-rpd", group.rpd);
            group.enableRps = $(prefix + "-enable-rps").is(":checked");
            group.rps = readNumber(prefix + "-rps", group.rps);
        });
        plan.endpoints.forEach(function (item, index) {
            const prefix = "#rlp-e" + index;
            item.useDefaults = $(prefix + "-use-defaults").is(":checked");
            item.rpm = readNumber(prefix + "-rpm", item.rpm);
            item.rpd = readNumber(prefix + "-rpd", item.rpd);
            item.enableRps = $(prefix + "-enable-rps").is(":checked");
            item.rps = readNumber(prefix + "-rps", item.rps);
        });
    }

    function saveLibrary(next, opts) {
        opts = opts || {};
        const withMeta = !!opts.withMeta;
        const withPlan = opts.withPlan !== false;
        if (withPlan) {
            harvestPlan();
            const groupIds = plan.groups.map(function (group) { return String(group.id || "").trim(); }).filter(Boolean);
            if (groupIds.length !== plan.groups.length) {
                CadminApi.showToast("danger", "Every group needs an ID.");
                return;
            }
            if (new Set(groupIds).size !== groupIds.length) {
                CadminApi.showToast("danger", "Group IDs must be unique.");
                return;
            }
            const json = planToJson();
            if (!json.tier) {
                CadminApi.showToast("danger", "Enter a tier.");
                return;
            }
            if (!json.policyVersion) {
                CadminApi.showToast("danger", "Enter a policy version.");
                return;
            }
            const limitError = CadminRateLimitPlan.planLimitOrderError(plan);
            if (limitError) {
                CadminApi.showToast("danger", limitError);
                return;
            }
        }
        const write = function () {
            if (withMeta) {
                applyMeta();
            } else {
                library.type = {
                    coding: [{ code: libraryType, display: "Rate-limit plan" }],
                    text: libraryType
                };
            }
            if (withPlan) {
                upsertPlanJson(JSON.stringify(planToJson(), null, 2));
            }
            CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "PUT", library).done(function (updated) {
                library = updated || library;
                if (withPlan) {
                    loadPlanFromLibrary();
                    renderPlanEditor();
                }
                if (window.CadminWorkspace && typeof CadminWorkspace.rememberResource === "function") {
                    CadminWorkspace.rememberResource(library);
                }
                renderHeader();
                if (withMeta) {
                    fillBasicsForm();
                    fillMarkdownFields();
                }
                CadminResourceSource.mount(function () { return library; });
                CadminResourceGraph.mount(library);
                CadminLibraryRelated.mount(library);
                markClean();
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Update rate-limit plan failed (" + xhr.status + ").");
            });
        };
        if (withPlan) {
            const saved = CadminRateLimitPlan.parsePlanText(savedPlan, library);
            CadminRateLimitPlan.confirmPolicyBumpIfNeeded(saved, plan, function () {
                plan.policyVersion = CadminRateLimitPlan.incrementPolicyVersion(plan.policyVersion);
                $page("#rlp-policy-version").val(plan.policyVersion);
            }).done(write).fail(function () { /* cancelled */ });
            return;
        }
        write();
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
        harvestPlan();
        const textarea = document.getElementById("rlp-json-preview");
        if (!textarea) {
            return;
        }
        teardownJsonPreview();
        textarea.value = prettyPlan();
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

    function renderHeader() {
        $page("#rlp-title").text(planLabel());
        $page("#rlp-status-badge").html(statusBadge(library.status));
        if (library.id) {
            $page("#rlp-fhir-id").text(library.id).removeClass("d-none");
        } else {
            $page("#rlp-fhir-id").text("").addClass("d-none");
        }
    }

    function fillBasicsForm() {
        const period = library.effectivePeriod || {};
        $page("#rlp-title-input").val(library.title || "");
        $page("#rlp-status").val(library.status || "draft");
        $page("#rlp-type").val(typeCode());
        $page("#rlp-experimental").prop("checked", !!library.experimental);
        $page("#rlp-url").val(library.url || "");
        $page("#rlp-name").val(library.name || "");
        $page("#rlp-version").val(library.version || "");
        $page("#rlp-publisher").val(library.publisher || "");
        $page("#rlp-date").val(dateInputValue(library.date));
        $page("#rlp-approval").val(dateInputValue(library.approvalDate));
        $page("#rlp-review").val(dateInputValue(library.lastReviewDate));
        $page("#rlp-period-start").val(dateInputValue(period.start));
        $page("#rlp-period-end").val(dateInputValue(period.end));
    }

    function render(resource) {
        destroyMarkdownEditors();
        teardownJsonPreview();
        if (CadminApi.isLibraryType(resource, "pds-policies")) {
            window.location.hash = "#/pds-policies/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "camel-route")) {
            window.location.hash = "#/camel-routes/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "icg-route")) {
            window.location.hash = "#/icg-routes/" + encodeURIComponent(resource.id);
            return;
        }
        if (CadminApi.isLibraryType(resource, "jolt")) {
            window.location.hash = "#/jolts/" + encodeURIComponent(resource.id);
            return;
        }
        library = resource;
        loadPlanFromLibrary();
        const $root = $(CadminWorkspace.root());
        const label = esc(planLabel());
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/rate-limit-plans">' +
                        '<i class="bi bi-arrow-left me-1"></i>Rate-limit plans</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="rlp-title">' + label + "</h1>" +
                        '<span id="rlp-status-badge">' + statusBadge(library.status) + "</span>" +
                        (library.id
                            ? '<code class="small" id="rlp-fhir-id">' + esc(library.id) + "</code>"
                            : '<code class="small d-none" id="rlp-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="rlp-settings-nav" role="tablist">' +
                        navButton("rlp-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("rlp-pane-identity", "bi bi-person-vcard", "Identity and version") +
                        navButton("rlp-pane-plan", "bi bi-speedometer2", "Plan") +
                        navButton("rlp-pane-summary", "bi bi-clipboard-data", "Summary") +
                        navButton("rlp-pane-related", "bi bi-link-45deg", "Related") +
                        navButton("rlp-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("rlp-pane-history", "bi bi-clock-history", "History") +
                        navButton("rlp-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("rlp-pane-basics",
                            '<form id="rlp-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basic details</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="rlp-title-input">') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="rlp-status">' +
                                                optionsHtml(statusOptions, library.status || "draft") + "</select>"),
                                            field("Type",
                                                '<input class="form-control font-monospace" id="rlp-type" value="' +
                                                    esc(typeCode()) + '" readonly disabled>')) +
                                        '<div class="form-check mb-3">' +
                                            '<input class="form-check-input" type="checkbox" id="rlp-experimental">' +
                                            '<label class="form-check-label" for="rlp-experimental">Experimental</label>' +
                                        "</div>" +
                                        markdownField("Description", "rlp-description") +
                                        markdownField("Purpose", "rlp-purpose") +
                                        markdownField("Usage", "rlp-usage") +
                                        markdownField("Copyright", "rlp-copyright") +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("rlp-pane-identity",
                            '<form id="rlp-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Identity and version</h3></div>' +
                                    '<div class="card-body">' +
                                        field("URL", '<input class="form-control font-monospace" id="rlp-url">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="rlp-name">'),
                                            field("Version", '<input class="form-control" id="rlp-version" autocomplete="off">')) +
                                        fieldRow(
                                            field("Publisher", '<input class="form-control" id="rlp-publisher">'),
                                            field("Date", '<input type="date" class="form-control" id="rlp-date">')) +
                                        fieldRow(
                                            field("Approved date", '<input type="date" class="form-control" id="rlp-approval">'),
                                            field("Last review date", '<input type="date" class="form-control" id="rlp-review">')) +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Effective date range</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="rlp-period-start" ' +
                                                        'aria-label="Effective start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input type="date" class="form-control" id="rlp-period-end" ' +
                                                        'aria-label="Effective end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("rlp-pane-plan",
                            '<form id="rlp-plan-form">' +
                                '<div class="card mb-3">' +
                                    '<div class="card-header flex-wrap gap-2">' +
                                        "<div>" +
                                            '<h3 class="card-title mb-0">Tier plan</h3>' +
                                            '<div class="small text-muted"><code>' + esc(planContentType) + "</code>" +
                                                " · template for later DocumentReference assignment</div>" +
                                        "</div>" +
                                        '<div class="card-tools d-flex flex-nowrap align-items-center gap-2">' +
                                            '<button class="btn btn-sm btn-outline-secondary" type="button" id="rlp-json-preview-btn">' +
                                                '<i class="bi bi-braces me-1"></i>JSON preview</button>' +
                                            '<button class="btn btn-sm btn-primary" type="submit">' +
                                                '<i class="bi bi-check2 me-1"></i>Save</button>' +
                                        "</div>" +
                                    "</div>" +
                                    '<div class="card-body">' +
                                        fieldRow(
                                            field("Tier",
                                                '<input class="form-control font-monospace" id="rlp-tier" required>',
                                                "Tier level this plan represents, for example gold."),
                                            field("Policy version",
                                                '<input class="form-control font-monospace" id="rlp-policy-version" required>',
                                                "Copied onto assigned documents. Bump to reset Redis counters.")) +
                                        '<h6 class="mt-2">Defaults</h6>' +
                                        '<p class="small text-muted">Used by unlisted routes and by definitions that use defaults.</p>' +
                                        '<div id="rlp-defaults-host"></div>' +
                                    "</div>" +
                                "</div>" +
                                '<div class="card mb-3">' +
                                    '<div class="card-header"><h3 class="card-title">Groups</h3></div>' +
                                    '<div class="card-body">' +
                                        '<p class="small text-muted">Named groups share one rate-limit pool. A route can appear only once in the plan.</p>' +
                                        '<div class="d-flex flex-wrap gap-2 align-items-end mb-3">' +
                                            '<div class="flex-grow-1" style="min-width:12rem">' +
                                                '<label class="form-label" for="rlp-new-group">New group ID</label>' +
                                                '<input class="form-control font-monospace" id="rlp-new-group" placeholder="clinical-read">' +
                                            "</div>" +
                                            '<button class="btn btn-outline-primary" type="button" id="rlp-add-group">Add group</button>' +
                                        "</div>" +
                                        '<div id="rlp-groups-list"></div>' +
                                    "</div>" +
                                "</div>" +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Dedicated endpoints</h3></div>' +
                                    '<div class="card-body">' +
                                        '<p class="small text-muted">Each listed route gets its own pool. Select from ICG gateway route IDs.</p>' +
                                        '<div class="alert alert-info py-2 d-none" id="rlp-no-routes">No ICG routes found. Create ICG routes to populate this list.</div>' +
                                        '<div class="alert alert-secondary py-2 d-none" id="rlp-all-used">Every ICG route is already on this plan.</div>' +
                                        '<div class="d-flex flex-wrap gap-2 align-items-end mb-3">' +
                                            '<div class="flex-grow-1" style="min-width:12rem" id="rlp-endpoint-add-host"></div>' +
                                            '<button class="btn btn-outline-primary" type="button" id="rlp-add-endpoint">Add endpoint</button>' +
                                        "</div>" +
                                        '<div id="rlp-endpoints-list"></div>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("rlp-pane-summary",
                            '<div id="rlp-summary">' +
                                '<div class="card mb-3">' +
                                    '<div class="card-header"><h3 class="card-title">Overview</h3></div>' +
                                    '<div class="card-body">' +
                                        '<div id="rlp-summary-stats"></div>' +
                                        '<div id="rlp-summary-basics"></div>' +
                                    "</div>" +
                                "</div>" +
                                '<div class="card mb-3">' +
                                    '<div class="card-header"><h3 class="card-title">Groups</h3></div>' +
                                    '<div class="card-body" id="rlp-summary-groups"></div>' +
                                "</div>" +
                                '<div class="card mb-3">' +
                                    '<div class="card-header"><h3 class="card-title">Dedicated endpoints</h3></div>' +
                                    '<div class="card-body" id="rlp-summary-endpoints"></div>' +
                                "</div>" +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Route assignments</h3></div>' +
                                    '<div class="card-body" id="rlp-summary-routes"></div>' +
                                "</div>" +
                            "</div>") +
                        tabPane("rlp-pane-related", CadminLibraryRelated.cards()) +
                        tabPane("rlp-pane-graph", CadminResourceGraph.card()) +
                        tabPane("rlp-pane-history", CadminResourceHistory.card()) +
                        tabPane("rlp-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this rate-limit plan</p>' +
                                            '<small class="text-secondary">' +
                                                "This permanently deletes the Library that stores the tier template." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="rlp-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>" +
            '<div class="modal fade" id="rlp-json-modal" tabindex="-1">' +
                '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title">Plan JSON</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body">' +
                            '<div class="rlp-json-host">' +
                                '<textarea id="rlp-json-preview" class="form-control font-monospace" rows="16" readonly></textarea>' +
                            "</div>" +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return library; });
        CadminResourceGraph.mount(library);
        CadminResourceHistory.mount(library);
        CadminLibraryRelated.mount(library);
        renderHeader();
        fillBasicsForm();
        mountMarkdownEditors();
        fillMarkdownFields();
        bind();
        renderPlanEditor();
        markClean();
        loadIcgRoutes().always(function () {
            harvestPlan();
            renderPlanEditor();
            savedPlan = prettyPlan();
            syncUnsavedFlag();
        });
    }

    function reveal(resource) {
        if (resource) {
            library = resource;
        }
        refreshMarkdownEditors();
        if (jsonPreviewEditor) {
            jsonPreviewEditor.refresh();
        }
        harvestPlan();
        renderSummary();
        syncUnsavedFlag();
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".rlpdetail");
        $root.on("shown.bs.tab.rlpdetail", "#rlp-pane-basics-btn", refreshMarkdownEditors);
        $root.on("shown.bs.tab.rlpdetail", "#rlp-pane-summary-btn", function () {
            harvestPlan();
            renderSummary();
        });
        $root.on("shown.bs.tab.rlpdetail", "#rlp-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.rlpdetail change.rlpdetail",
            "#rlp-basic-form :input, #rlp-identity-form :input, #rlp-plan-form :input", syncUnsavedFlag);
        CadminApi.fillValueSetSelect($page("#rlp-status"), CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            onConcepts: function () {
                syncUnsavedFlag();
            }
        });
        $root.on("submit.rlpdetail", "#rlp-basic-form, #rlp-identity-form", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Rate-limit plan updated.");
            }, { withMeta: true, withPlan: false });
        });
        $root.on("submit.rlpdetail", "#rlp-plan-form", function (event) {
            event.preventDefault();
            saveLibrary(function () {
                CadminApi.showToast("success", "Rate-limit plan saved.");
            }, { withPlan: true });
        });
        $root.on("click.rlpdetail", "#rlp-json-preview-btn", function () {
            bootstrap.Modal.getOrCreateInstance(document.getElementById("rlp-json-modal")).show();
        });
        $("#rlp-json-modal").on("shown.bs.modal", showJsonPreview);
        $("#rlp-json-modal").on("hidden.bs.modal", teardownJsonPreview);
        $root.on("change.rlpdetail", ".rlp-use-defaults", function () {
            const on = this.checked;
            $(this).closest("[data-group-index], [data-endpoint-index]").find(".rlp-limits").toggleClass("d-none", on);
            harvestPlan();
            syncUnsavedFlag();
        });
        $root.on("change.rlpdetail", ".rlp-enable-rps", function () {
            const on = this.checked;
            $(this).closest(".rlp-limits").find(".rlp-rps").toggleClass("d-none", !on);
            harvestPlan();
            syncUnsavedFlag();
        });
        $root.on("click.rlpdetail", "#rlp-add-group", function () {
            harvestPlan();
            const id = ($("#rlp-new-group").val() || "").trim();
            if (!id) {
                CadminApi.showToast("danger", "Enter a group ID.");
                return;
            }
            if (plan.groups.some(function (group) { return group.id === id; })) {
                CadminApi.showToast("danger", "That group ID is already on this plan.");
                return;
            }
            plan.groups.push(Object.assign({ id: id, endpoints: [] }, emptyLimits(false)));
            $("#rlp-new-group").val("");
            renderPlanEditor();
            syncUnsavedFlag();
        });
        $root.on("click.rlpdetail", "[data-remove-group]", function () {
            harvestPlan();
            const index = Number($(this).attr("data-remove-group"));
            plan.groups.splice(index, 1);
            renderPlanEditor();
            syncUnsavedFlag();
        });
        $root.on("click.rlpdetail", "[data-add-group-route]", function () {
            harvestPlan();
            const index = Number($(this).attr("data-add-group-route"));
            const select = document.getElementById("rlp-g" + index + "-add");
            const id = select ? String(select.value || "").trim() : "";
            if (!id) {
                CadminApi.showToast("danger", "Select an ICG route.");
                return;
            }
            if (usedRouteIds()[id]) {
                CadminApi.showToast("danger", "That route is already on this plan.");
                return;
            }
            plan.groups[index].endpoints = plan.groups[index].endpoints || [];
            plan.groups[index].endpoints.push(id);
            renderPlanEditor();
            syncUnsavedFlag();
        });
        $root.on("click.rlpdetail", "[data-remove-group-route]", function () {
            harvestPlan();
            const gi = Number($(this).attr("data-remove-group-route"));
            const ei = Number($(this).attr("data-route-index"));
            plan.groups[gi].endpoints.splice(ei, 1);
            renderPlanEditor();
            syncUnsavedFlag();
        });
        $root.on("click.rlpdetail", "#rlp-add-endpoint", function () {
            harvestPlan();
            const id = ($("#rlp-endpoint-add").val() || "").trim();
            if (!id) {
                CadminApi.showToast("danger", "Select an ICG route.");
                return;
            }
            if (usedRouteIds()[id]) {
                CadminApi.showToast("danger", "That route is already on this plan.");
                return;
            }
            plan.endpoints.push(Object.assign({ id: id }, emptyLimits(false)));
            renderPlanEditor();
            syncUnsavedFlag();
        });
        $root.on("click.rlpdetail", "[data-remove-endpoint]", function () {
            harvestPlan();
            const index = Number($(this).attr("data-remove-endpoint"));
            plan.endpoints.splice(index, 1);
            renderPlanEditor();
            syncUnsavedFlag();
        });
        $root.on("click.rlpdetail", "#rlp-delete", function () {
            CadminApi.confirm("Delete this rate-limit plan?").done(function () {
                CadminApi.fhir("/Library/" + encodeURIComponent(library.id), "DELETE").done(function () {
                    destroyMarkdownEditors();
                    teardownJsonPreview();
                    CadminApi.showToast("success", "Rate-limit plan deleted.");
                    window.location.hash = "#/rate-limit-plans";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete rate-limit plan failed (" + xhr.status + ").");
                });
            });
        });
    }

    return {
        render: render,
        reveal: reveal
    };
}());
