window.CadminRateLimitPlan = (function () {
    const LIBRARY_TYPE = "rate-limit-plan";
    const TIER_TYPE = "rate-limit-tier";
    const TIER_TYPE_SYSTEM = "https://insulet.com/fhir/CodeSystem/rate-limit-tier";
    const SOURCE_EXTENSION = "https://insulet.com/fhir/StructureDefinition/rate-limit-plan-source";
    const CONTENT_TYPE = "application/icg-rate-limit+json";
    const CLIENT_ID_SYSTEM = "https://insulet.com/fhir/identifier/oidc/client-id";

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

    function attachmentType(item) {
        return ((item && item.contentType) || "").split(";")[0].trim().toLowerCase();
    }

    function isPlanJson(item) {
        const type = attachmentType(item);
        return type === CONTENT_TYPE || type === "application/json" || type === "text/json";
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
            tier: (resource && (resource.name || resource.title)) || "gold",
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

    function planToJson(plan) {
        plan = plan || emptyPlan(null);
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

    function prettyPlan(plan) {
        return JSON.stringify(planToJson(plan), null, 2);
    }

    function parsePlanText(text, resource) {
        if (!String(text || "").trim()) {
            return emptyPlan(resource);
        }
        try {
            return planFromJson(JSON.parse(text), resource);
        } catch (ignored) {
            return null;
        }
    }

    function presentRateFields(limits) {
        limits = limits || {};
        const fields = [];
        if (limits.requestsPerSecond != null && Number.isFinite(Number(limits.requestsPerSecond))) {
            fields.push({
                key: "rps",
                label: "requests per second",
                value: Number(limits.requestsPerSecond)
            });
        }
        if (limits.requestsPerMinute != null && Number.isFinite(Number(limits.requestsPerMinute))) {
            fields.push({
                key: "rpm",
                label: "requests per minute",
                value: Number(limits.requestsPerMinute)
            });
        }
        if (limits.requestsPerDay != null && Number.isFinite(Number(limits.requestsPerDay))) {
            fields.push({
                key: "rpd",
                label: "requests per day",
                value: Number(limits.requestsPerDay)
            });
        }
        return fields;
    }

    function limitOrderError(limits, scope) {
        const fields = presentRateFields(limits);
        for (let i = 0; i < fields.length - 1; i += 1) {
            if (fields[i].value > fields[i + 1].value) {
                const where = scope ? scope + ": " : "";
                return where + fields[i].label + " (" + fields[i].value + ") must not exceed " +
                    fields[i + 1].label + " (" + fields[i + 1].value +
                    "). Rates must satisfy rps ≤ rpm ≤ rpd for the fields that are set.";
            }
        }
        return "";
    }

    function planLimitOrderError(plan) {
        const json = planToJson(plan);
        let error = limitOrderError(json.defaults || {}, "Plan defaults");
        if (error) {
            return error;
        }
        const groups = json.groups || {};
        const groupIds = Object.keys(groups);
        for (let i = 0; i < groupIds.length; i += 1) {
            error = limitOrderError(groups[groupIds[i]] || {}, "Group “" + groupIds[i] + "”");
            if (error) {
                return error;
            }
        }
        const endpoints = json.endpoints || {};
        const endpointIds = Object.keys(endpoints);
        for (let j = 0; j < endpointIds.length; j += 1) {
            error = limitOrderError(endpoints[endpointIds[j]] || {}, "Endpoint “" + endpointIds[j] + "”");
            if (error) {
                return error;
            }
        }
        return "";
    }

    function rateFingerprint(plan) {
        const json = planToJson(plan || emptyPlan(null));
        function pack(limits, key) {
            limits = limits || {};
            return [
                key,
                limits.requestsPerSecond == null ? "" : String(limits.requestsPerSecond),
                limits.requestsPerMinute == null ? "" : String(limits.requestsPerMinute),
                limits.requestsPerDay == null ? "" : String(limits.requestsPerDay)
            ].join(":");
        }
        const parts = [pack(json.defaults, "defaults")];
        Object.keys(json.groups || {}).sort().forEach(function (id) {
            parts.push(pack(json.groups[id], "group:" + id));
        });
        Object.keys(json.endpoints || {}).sort().forEach(function (id) {
            parts.push(pack(json.endpoints[id], "endpoint:" + id));
        });
        return parts.join("|");
    }

    function ratesChanged(savedPlan, currentPlan) {
        return rateFingerprint(savedPlan) !== rateFingerprint(currentPlan);
    }

    function policyVersionOf(plan) {
        return String((plan && plan.policyVersion) || "").trim();
    }

    function policyVersionIncremented(savedPlan, currentPlan) {
        return policyVersionOf(savedPlan) !== policyVersionOf(currentPlan);
    }

    function incrementPolicyVersion(version) {
        const raw = String(version || "").trim() || "1";
        const dotted = raw.split(".");
        for (let i = dotted.length - 1; i >= 0; i -= 1) {
            if (/^\d+$/.test(dotted[i])) {
                dotted[i] = String(Number(dotted[i]) + 1);
                return dotted.join(".");
            }
        }
        const trail = raw.match(/^(.*?)(\d+)$/);
        if (trail) {
            return trail[1] + String(Number(trail[2]) + 1);
        }
        return raw + ".1";
    }

    function confirmPolicyBumpIfNeeded(savedPlan, currentPlan, applyBump) {
        if (!ratesChanged(savedPlan, currentPlan) || policyVersionIncremented(savedPlan, currentPlan)) {
            return $.Deferred().resolve().promise();
        }
        return CadminApi.confirm({
            title: "Increment the policy version?",
            text: "Rate limits changed. Increment the policy version so unique bucket keys can be created for the new limits.",
            confirmText: "Increment and save",
            cancelText: "Cancel",
            danger: false,
            icon: "question"
        }).done(function () {
            if (typeof applyBump === "function") {
                applyBump();
            }
        });
    }

    function plansMatch(leftText, rightText) {
        const left = parsePlanText(leftText, null);
        const right = parsePlanText(rightText, null);
        if (!left || !right) {
            return false;
        }
        return JSON.stringify(planToJson(left)) === JSON.stringify(planToJson(right));
    }

    function libraryTypeConcept() {
        return {
            coding: [{ code: LIBRARY_TYPE, display: "Rate-limit plan" }],
            text: LIBRARY_TYPE
        };
    }

    function tierTypeConcept() {
        return {
            coding: [{
                system: TIER_TYPE_SYSTEM,
                code: TIER_TYPE,
                display: "Rate-limit tier"
            }],
            text: TIER_TYPE
        };
    }

    function conceptCodes(cc) {
        const items = Array.isArray(cc) ? cc : (cc ? [cc] : []);
        const codes = [];
        items.forEach(function (item) {
            ((item && item.coding) || []).forEach(function (coding) {
                if (coding && coding.code) {
                    codes.push(coding.code);
                }
            });
            if (item && item.text) {
                codes.push(item.text);
            }
        });
        return codes;
    }

    function isRateLimitTier(resource) {
        if (!resource || resource.resourceType !== "DocumentReference") {
            return false;
        }
        if (conceptCodes(resource.type).indexOf(TIER_TYPE) >= 0
                || conceptCodes(resource.category).indexOf(TIER_TYPE) >= 0) {
            return true;
        }
        return ((resource.content) || []).map(documentAttachmentOf).filter(Boolean).some(isPlanJson);
    }

    function isActiveTier(resource) {
        return !!(resource && resource.status === "current");
    }

    function findLibraryAttachment(library) {
        return ((library && library.content) || []).find(isPlanJson)
            || ((library && library.content) || [])[0]
            || null;
    }

    function readLibraryPlanText(library) {
        const attachment = findLibraryAttachment(library);
        return attachment && attachment.data ? decodeText(attachment.data) : "";
    }

    function upsertLibraryPlanJson(library, text) {
        const attachment = {
            contentType: CONTENT_TYPE,
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

    function documentAttachmentOf(content) {
        return content && (content.attachment || content);
    }

    function findDocumentAttachment(doc) {
        const items = ((doc && doc.content) || []).map(documentAttachmentOf).filter(Boolean);
        return items.find(isPlanJson) || items[0] || null;
    }

    function readDocumentPlanText(doc) {
        const attachment = findDocumentAttachment(doc);
        return attachment && attachment.data ? decodeText(attachment.data) : "";
    }

    function upsertDocumentPlanJson(doc, text, title) {
        const attachment = {
            contentType: CONTENT_TYPE,
            title: title || (findDocumentAttachment(doc) && findDocumentAttachment(doc).title) || "Rate-limit tier",
            data: encodeText(text || "")
        };
        doc.content = [{ attachment: attachment }];
    }

    function parseReference(ref) {
        const value = (ref && ref.reference) || "";
        const match = value.match(/^([^/]+)\/(.+)$/);
        if (!match) {
            return null;
        }
        return {
            type: match[1],
            id: match[2],
            display: (ref && ref.display) || "",
            reference: value
        };
    }

    function sourceLibraryRef(doc) {
        const extensions = (doc && doc.extension) || [];
        for (let i = 0; i < extensions.length; i += 1) {
            const item = extensions[i];
            if (item && item.url === SOURCE_EXTENSION && item.valueReference) {
                const parsed = parseReference(item.valueReference);
                if (parsed && parsed.type === "Library") {
                    return parsed;
                }
            }
        }
        const related = (doc && doc.context && doc.context.related) || [];
        for (let j = 0; j < related.length; j += 1) {
            const parsedRelated = parseReference(related[j]);
            if (parsedRelated && parsedRelated.type === "Library") {
                return parsedRelated;
            }
        }
        return null;
    }

    function organizationRefOf(doc) {
        return parseReference(doc && doc.subject) || parseReference(doc && doc.custodian);
    }

    function setOrganization(doc, organization) {
        if (!doc || !organization || !organization.id) {
            return;
        }
        const target = {
            reference: "Organization/" + organization.id,
            display: organization.name || organization.id
        };
        doc.subject = target;
        doc.custodian = target;
    }

    function oidcClientIdOf(doc) {
        const system = (window.CadminApi && CadminApi.OIDC_CLIENT_ID_SYSTEM) || CLIENT_ID_SYSTEM;
        const match = ((doc && doc.identifier) || []).find(function (item) {
            return item && item.system === system && item.value;
        });
        return match ? match.value : "";
    }

    function setOidcClientId(doc, clientId) {
        const system = (window.CadminApi && CadminApi.OIDC_CLIENT_ID_SYSTEM) || CLIENT_ID_SYSTEM;
        const value = String(clientId || "").trim();
        doc.identifier = ((doc.identifier) || []).filter(function (item) {
            return !item || item.system !== system;
        });
        if (value) {
            doc.identifier.push({
                system: system,
                value: value,
                type: { text: "OIDC client ID" }
            });
        }
        if (!doc.identifier.length) {
            delete doc.identifier;
        }
    }

    function setSourceLibrary(doc, library) {
        doc.extension = ((doc.extension) || []).filter(function (item) {
            return !item || item.url !== SOURCE_EXTENSION;
        });
        if (!library || !library.id) {
            if (!doc.extension.length) {
                delete doc.extension;
            }
            return;
        }
        doc.extension.push({
            url: SOURCE_EXTENSION,
            valueReference: {
                reference: "Library/" + library.id,
                display: library.title || library.name || library.id
            }
        });
    }

    function documentTitle(doc) {
        if (doc && doc.description) {
            return doc.description;
        }
        const attachment = findDocumentAttachment(doc);
        return (attachment && attachment.title) || (doc && doc.id) || "Rate-limit tier";
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
            const type = attachmentType(item);
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
                return routes;
            }, function () {
                return [];
            });
    }

    function loadPlanLibraries(opts) {
        opts = opts || {};
        let path = "/Library?type=" + encodeURIComponent(LIBRARY_TYPE) + "&_count=200&_sort=title";
        if (opts.status) {
            path += "&status=" + encodeURIComponent(opts.status);
        }
        return CadminApi.fhir(path, "GET", null, { silent: true })
            .then(function (bundle) {
                return CadminApi.bundleResources(bundle, "Library").filter(function (library) {
                    if (!CadminApi.isLibraryType(library, LIBRARY_TYPE)) {
                        return false;
                    }
                    if (opts.status && library.status !== opts.status) {
                        return false;
                    }
                    return true;
                });
            }, function () {
                return [];
            });
    }

    function belongsToOrg(doc, orgId) {
        const ref = organizationRefOf(doc);
        return !!(ref && ref.id === orgId);
    }

    function asResourceList(value) {
        if (Array.isArray(value)) {
            return value;
        }
        if (value && value.resourceType) {
            return [value];
        }
        return [];
    }

    function mergeOrgTiers(byId, docs, orgId) {
        asResourceList(docs).forEach(function (doc) {
            if (doc && doc.id && isRateLimitTier(doc) && belongsToOrg(doc, orgId)) {
                byId[doc.id] = doc;
            }
        });
    }

    function fetchDocumentReferences(path) {
        return CadminApi.fhir(path, "GET", null, { silent: true }).then(function (bundle) {
            return CadminApi.bundleResources(bundle, "DocumentReference");
        }, function () {
            return [];
        });
    }

    function searchOrgTiers(orgId) {
        const id = String(orgId || "").trim();
        const result = $.Deferred();
        if (!id) {
            result.resolveWith(null, [[]]);
            return result.promise();
        }
        const encoded = encodeURIComponent(id);
        const paths = [
            "/DocumentReference?type=" + encodeURIComponent(TIER_TYPE) + "&_count=200",
            "/DocumentReference?type=" + encodeURIComponent(TIER_TYPE_SYSTEM + "|" + TIER_TYPE) + "&_count=200",
            "/DocumentReference?custodian=" + encoded + "&_count=100",
            "/DocumentReference?custodian=Organization/" + encoded + "&_count=100",
            "/DocumentReference?subject=" + encoded + "&_count=100",
            "/DocumentReference?subject=Organization/" + encoded + "&_count=100"
        ];
        const byId = {};
        let chain = $.Deferred().resolve().promise();
        paths.forEach(function (path) {
            chain = chain.then(function () {
                return fetchDocumentReferences(path).then(function (docs) {
                    mergeOrgTiers(byId, docs, id);
                });
            });
        });
        chain.always(function () {
            result.resolveWith(null, [Object.keys(byId).map(function (key) { return byId[key]; })]);
        });
        return result.promise();
    }

    function putDocument(doc) {
        return CadminApi.fhir("/DocumentReference/" + encodeURIComponent(doc.id), "PUT", doc);
    }

    function activateTier(doc, siblings) {
        const others = Array.isArray(siblings) ? siblings : asResourceList(siblings);
        let chain = $.Deferred().resolve().promise();
        others.forEach(function (item) {
            if (!item || item.id === doc.id || item.status !== "current") {
                return;
            }
            item.status = "superseded";
            chain = chain.then(function () { return putDocument(item); });
        });
        return chain.then(function () {
            doc.status = "current";
            return putDocument(doc);
        });
    }

    function planFormHtml(prefix, subtitle) {
        return '<form id="' + prefix + '-plan-form">' +
            '<div class="card mb-3">' +
                '<div class="card-header flex-wrap gap-2">' +
                    "<div>" +
                        '<h3 class="card-title mb-0">Tier plan</h3>' +
                        '<div class="small text-muted"><code>' + esc(CONTENT_TYPE) + "</code>" +
                            (subtitle ? " · " + subtitle : "") + "</div>" +
                    "</div>" +
                    '<div class="card-tools d-flex flex-nowrap align-items-center gap-2">' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" id="' + prefix + '-json-preview-btn">' +
                            '<i class="bi bi-braces me-1"></i>JSON preview</button>' +
                        '<button class="btn btn-sm btn-primary" type="submit">' +
                            '<i class="bi bi-check2 me-1"></i>Save</button>' +
                    "</div>" +
                "</div>" +
                '<div class="card-body">' +
                    fieldRow(
                        field("Tier",
                            '<input class="form-control font-monospace" id="' + prefix + '-tier" required>',
                            "Tier level this plan represents, for example gold."),
                        field("Policy version",
                            '<input class="form-control font-monospace" id="' + prefix + '-policy-version" required>',
                            "Bump to reset Redis counters.")) +
                    '<h6 class="mt-2">Defaults</h6>' +
                    '<p class="small text-muted">Used by unlisted routes and by definitions that use defaults.</p>' +
                    '<div id="' + prefix + '-defaults-host"></div>' +
                "</div>" +
            "</div>" +
            '<div class="card mb-3">' +
                '<div class="card-header"><h3 class="card-title">Groups</h3></div>' +
                '<div class="card-body">' +
                    '<p class="small text-muted">Named groups share one rate-limit pool. A route can appear only once in the plan.</p>' +
                    '<div class="d-flex flex-wrap gap-2 align-items-end mb-3">' +
                        '<div class="flex-grow-1" style="min-width:12rem">' +
                            '<label class="form-label" for="' + prefix + '-new-group">New group ID</label>' +
                            '<input class="form-control font-monospace" id="' + prefix + '-new-group" placeholder="clinical-read">' +
                        "</div>" +
                        '<button class="btn btn-outline-primary" type="button" id="' + prefix + '-add-group">Add group</button>' +
                    "</div>" +
                    '<div id="' + prefix + '-groups-list"></div>' +
                "</div>" +
            "</div>" +
            '<div class="card">' +
                '<div class="card-header"><h3 class="card-title">Dedicated endpoints</h3></div>' +
                '<div class="card-body">' +
                    '<p class="small text-muted">Each listed route gets its own pool. Select from ICG gateway route IDs.</p>' +
                    '<div class="alert alert-info py-2 d-none" id="' + prefix + '-no-routes">No ICG routes found. Create ICG routes to populate this list.</div>' +
                    '<div class="alert alert-secondary py-2 d-none" id="' + prefix + '-all-used">Every ICG route is already on this plan.</div>' +
                    '<div class="d-flex flex-wrap gap-2 align-items-end mb-3">' +
                        '<div class="flex-grow-1" style="min-width:12rem" id="' + prefix + '-endpoint-add-host"></div>' +
                        '<button class="btn btn-outline-primary" type="button" id="' + prefix + '-add-endpoint">Add endpoint</button>' +
                    "</div>" +
                    '<div id="' + prefix + '-endpoints-list"></div>' +
                "</div>" +
            "</div>" +
        "</form>";
    }

    function summaryHtml(prefix) {
        return '<div id="' + prefix + '-summary">' +
            '<div class="card mb-3">' +
                '<div class="card-header"><h3 class="card-title">Overview</h3></div>' +
                '<div class="card-body">' +
                    '<div id="' + prefix + '-summary-stats"></div>' +
                    '<div id="' + prefix + '-summary-basics"></div>' +
                "</div>" +
            "</div>" +
            '<div class="card mb-3">' +
                '<div class="card-header"><h3 class="card-title">Groups</h3></div>' +
                '<div class="card-body" id="' + prefix + '-summary-groups"></div>' +
            "</div>" +
            '<div class="card mb-3">' +
                '<div class="card-header"><h3 class="card-title">Dedicated endpoints</h3></div>' +
                '<div class="card-body" id="' + prefix + '-summary-endpoints"></div>' +
            "</div>" +
            '<div class="card">' +
                '<div class="card-header"><h3 class="card-title">Route assignments</h3></div>' +
                '<div class="card-body" id="' + prefix + '-summary-routes"></div>' +
            "</div>" +
        "</div>";
    }

    function jsonModalHtml(prefix) {
        return '<div class="modal fade" id="' + prefix + '-json-modal" tabindex="-1">' +
            '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<h5 class="modal-title">Plan JSON</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    "</div>" +
                    '<div class="modal-body">' +
                        '<div class="rlp-json-host">' +
                            '<textarea id="' + prefix + '-json-preview" class="form-control font-monospace" rows="16" readonly></textarea>' +
                        "</div>" +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>' +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function createEditor(opts) {
        opts = opts || {};
        const prefix = opts.prefix || "rlp";
        const onChange = opts.onChange || function () {};
        let plan = emptyPlan(null);
        let icgRoutes = [];
        let jsonPreviewEditor = null;

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

        function limitsFields(fieldPrefix, item, includeUseDefaults) {
            const hidden = includeUseDefaults && item.useDefaults ? " d-none" : "";
            const rpsHidden = item.enableRps ? "" : " d-none";
            return (includeUseDefaults
                ? '<div class="form-check form-switch mb-3">' +
                    '<input class="form-check-input rlp-use-defaults" type="checkbox" role="switch" id="' +
                        esc(fieldPrefix + "-use-defaults") + '"' + (item.useDefaults ? " checked" : "") + ">" +
                    '<label class="form-check-label" for="' + esc(fieldPrefix + "-use-defaults") + '">Use defaults</label>' +
                    '<div class="form-text">When on, this definition is stored without rate-limit numbers.</div>' +
                "</div>"
                : "") +
                '<div class="rlp-limits' + hidden + '">' +
                    fieldRow(
                        field("Requests per minute", numberInput(fieldPrefix + "-rpm", item.rpm, 0)),
                        field("Requests per day", numberInput(fieldPrefix + "-rpd", item.rpd, 0))) +
                    '<div class="form-check form-switch mb-3">' +
                        '<input class="form-check-input rlp-enable-rps" type="checkbox" role="switch" id="' +
                            esc(fieldPrefix + "-enable-rps") + '"' + (item.enableRps ? " checked" : "") + ">" +
                        '<label class="form-check-label" for="' + esc(fieldPrefix + "-enable-rps") +
                            '">Limit requests per second</label>' +
                    "</div>" +
                    '<div class="rlp-rps' + rpsHidden + '">' +
                        field("Requests per second", numberInput(fieldPrefix + "-rps", item.rps, 0),
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
            $("#" + prefix + "-tier").val(plan.tier || "");
            $("#" + prefix + "-policy-version").val(plan.policyVersion || "");
            $("#" + prefix + "-defaults-host").html(limitsFields(prefix + "-def", plan.defaults, false));
        }

        function renderGroups() {
            if (!plan.groups.length) {
                $("#" + prefix + "-groups-list").html('<p class="text-muted mb-0">No groups. Add a named shared pool.</p>');
                return;
            }
            $("#" + prefix + "-groups-list").html(plan.groups.map(function (group, index) {
                const fieldPrefix = prefix + "-g" + index;
                const chips = (group.endpoints || []).map(function (id, ei) {
                    return routeChip(id, 'data-remove-group-route="' + index + '" data-route-index="' + ei + '"');
                }).join("") || '<span class="text-muted">No routes in this group.</span>';
                const addSelect = routeSelectHtml(fieldPrefix + "-add", {
                    kind: "group",
                    index: index,
                    endpointIndex: -1
                });
                return '<div class="border rounded p-3 mb-3" data-group-index="' + index + '">' +
                    '<div class="d-flex justify-content-between align-items-start gap-2 mb-3">' +
                        field("Group ID", '<input class="form-control font-monospace" id="' + fieldPrefix + '-id" value="' +
                            esc(group.id) + '">') +
                        '<button class="btn btn-sm btn-outline-danger mt-4" type="button" data-remove-group="' +
                            index + '">Remove</button>' +
                    "</div>" +
                    limitsFields(fieldPrefix, group, true) +
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
                $("#" + prefix + "-endpoints-list").html(
                    '<p class="text-muted mb-0">No dedicated endpoints. Unlisted ICG routes use the plan defaults.</p>');
            } else {
                $("#" + prefix + "-endpoints-list").html(plan.endpoints.map(function (item, index) {
                    const fieldPrefix = prefix + "-e" + index;
                    return '<div class="border rounded p-3 mb-3" data-endpoint-index="' + index + '">' +
                        '<div class="d-flex justify-content-between align-items-start gap-2 mb-2">' +
                            '<div><div class="form-label mb-1">Route ID</div>' +
                                '<code>' + esc(item.id) + "</code></div>" +
                            '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-endpoint="' +
                                index + '">Remove</button>' +
                        "</div>" +
                        limitsFields(fieldPrefix, item, true) +
                    "</div>";
                }).join(""));
            }
            $("#" + prefix + "-endpoint-add-host").html(
                routeSelectHtml(prefix + "-endpoint-add", { kind: "endpoint", index: -1 }));
        }

        function limitsLabel(item, labelOpts) {
            labelOpts = labelOpts || {};
            if (!labelOpts.forceLimits && item && item.useDefaults) {
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
            if (!$("#" + prefix + "-summary").length) {
                return;
            }
            const assigned = assignedRoutes();
            const used = usedRouteIds();
            const unlisted = icgRoutes.filter(function (route) { return route.id && !used[route.id]; });
            $("#" + prefix + "-summary-stats").html(
                '<div class="row">' +
                    summaryStat("primary", "Groups", String((plan.groups || []).length)) +
                    summaryStat("info", "Dedicated endpoints", String((plan.endpoints || []).length)) +
                    summaryStat("success", "Assigned routes", String(assigned.length)) +
                "</div>"
            );
            $("#" + prefix + "-summary-basics").html(summaryDl([
                ["Tier", "<code>" + esc(plan.tier || "—") + "</code>"],
                ["Policy version", "<code>" + esc(plan.policyVersion || "—") + "</code>"],
                ["Default limits", esc(limitsLabel(plan.defaults, { forceLimits: true }))]
            ]));
            if (!(plan.groups || []).length) {
                $("#" + prefix + "-summary-groups").html('<p class="text-muted mb-0">No groups.</p>');
            } else {
                $("#" + prefix + "-summary-groups").html(
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
                $("#" + prefix + "-summary-endpoints").html('<p class="text-muted mb-0">No dedicated endpoints.</p>');
            } else {
                $("#" + prefix + "-summary-endpoints").html(
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
                $("#" + prefix + "-summary-routes").html(
                    '<p class="text-muted mb-0">No ICG routes are assigned. Unlisted routes use the plan defaults.</p>');
            } else {
                $("#" + prefix + "-summary-routes").html(
                    '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                        "<thead><tr><th>Route</th><th>Pool</th><th>Limits</th></tr></thead><tbody>" +
                        assignmentRows.join("") +
                        "</tbody></table></div>"
                );
            }
        }

        function render() {
            renderDefaults();
            renderGroups();
            renderEndpoints();
            const available = availableRoutes();
            $("#" + prefix + "-no-routes").toggleClass("d-none", icgRoutes.length > 0);
            $("#" + prefix + "-all-used").toggleClass("d-none", !(icgRoutes.length && !available.length));
            renderSummary();
        }

        function readNumber(id, fallback) {
            const n = Number($(id).val());
            return Number.isFinite(n) ? n : fallback;
        }

        function harvest() {
            plan.tier = ($("#" + prefix + "-tier").val() || "").trim();
            plan.policyVersion = ($("#" + prefix + "-policy-version").val() || "").trim();
            plan.defaults.rpm = readNumber("#" + prefix + "-def-rpm", plan.defaults.rpm);
            plan.defaults.rpd = readNumber("#" + prefix + "-def-rpd", plan.defaults.rpd);
            plan.defaults.enableRps = $("#" + prefix + "-def-enable-rps").is(":checked");
            plan.defaults.rps = readNumber("#" + prefix + "-def-rps", plan.defaults.rps);
            plan.groups.forEach(function (group, index) {
                const fieldPrefix = "#" + prefix + "-g" + index;
                group.id = ($(fieldPrefix + "-id").val() || "").trim();
                group.useDefaults = $(fieldPrefix + "-use-defaults").is(":checked");
                group.rpm = readNumber(fieldPrefix + "-rpm", group.rpm);
                group.rpd = readNumber(fieldPrefix + "-rpd", group.rpd);
                group.enableRps = $(fieldPrefix + "-enable-rps").is(":checked");
                group.rps = readNumber(fieldPrefix + "-rps", group.rps);
            });
            plan.endpoints.forEach(function (item, index) {
                const fieldPrefix = "#" + prefix + "-e" + index;
                item.useDefaults = $(fieldPrefix + "-use-defaults").is(":checked");
                item.rpm = readNumber(fieldPrefix + "-rpm", item.rpm);
                item.rpd = readNumber(fieldPrefix + "-rpd", item.rpd);
                item.enableRps = $(fieldPrefix + "-enable-rps").is(":checked");
                item.rps = readNumber(fieldPrefix + "-rps", item.rps);
            });
        }

        function validate() {
            harvest();
            const groupIds = plan.groups.map(function (group) {
                return String(group.id || "").trim();
            }).filter(Boolean);
            if (groupIds.length !== plan.groups.length) {
                return "Every group needs an ID.";
            }
            if (new Set(groupIds).size !== groupIds.length) {
                return "Group IDs must be unique.";
            }
            const json = planToJson(plan);
            if (!json.tier) {
                return "Enter a tier.";
            }
            if (!json.policyVersion) {
                return "Enter a policy version.";
            }
            const limitError = planLimitOrderError(plan);
            if (limitError) {
                return limitError;
            }
            return "";
        }

        function bumpPolicyVersion() {
            harvest();
            plan.policyVersion = incrementPolicyVersion(plan.policyVersion);
            $("#" + prefix + "-policy-version").val(plan.policyVersion);
            onChange();
            return plan.policyVersion;
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
            harvest();
            const textarea = document.getElementById(prefix + "-json-preview");
            if (!textarea) {
                return;
            }
            teardownJsonPreview();
            textarea.value = prettyPlan(plan);
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

        function refreshJson() {
            if (jsonPreviewEditor) {
                jsonPreviewEditor.refresh();
            }
        }

        function bind($root, ns) {
            ns = ns || (prefix + "editor");
            $root.off("." + ns);
            $root.on("shown.bs.tab." + ns, "#" + prefix + "-pane-summary-btn", function () {
                harvest();
                renderSummary();
            });
            $root.on("input." + ns + " change." + ns, "#" + prefix + "-plan-form :input", function () {
                onChange();
            });
            $root.on("click." + ns, "#" + prefix + "-json-preview-btn", function () {
                bootstrap.Modal.getOrCreateInstance(document.getElementById(prefix + "-json-modal")).show();
            });
            $("#" + prefix + "-json-modal").off("." + ns)
                .on("shown.bs.modal." + ns, showJsonPreview)
                .on("hidden.bs.modal." + ns, teardownJsonPreview);
            $root.on("change." + ns, ".rlp-use-defaults", function () {
                const on = this.checked;
                $(this).closest("[data-group-index], [data-endpoint-index]").find(".rlp-limits").toggleClass("d-none", on);
                harvest();
                onChange();
            });
            $root.on("change." + ns, ".rlp-enable-rps", function () {
                const on = this.checked;
                $(this).closest(".rlp-limits").find(".rlp-rps").toggleClass("d-none", !on);
                harvest();
                onChange();
            });
            $root.on("click." + ns, "#" + prefix + "-add-group", function () {
                harvest();
                const id = ($("#" + prefix + "-new-group").val() || "").trim();
                if (!id) {
                    CadminApi.showToast("danger", "Enter a group ID.");
                    return;
                }
                if (plan.groups.some(function (group) { return group.id === id; })) {
                    CadminApi.showToast("danger", "That group ID is already on this plan.");
                    return;
                }
                plan.groups.push(Object.assign({ id: id, endpoints: [] }, emptyLimits(false)));
                $("#" + prefix + "-new-group").val("");
                render();
                onChange();
            });
            $root.on("click." + ns, "[data-remove-group]", function () {
                harvest();
                const index = Number($(this).attr("data-remove-group"));
                plan.groups.splice(index, 1);
                render();
                onChange();
            });
            $root.on("click." + ns, "[data-add-group-route]", function () {
                harvest();
                const index = Number($(this).attr("data-add-group-route"));
                const select = document.getElementById(prefix + "-g" + index + "-add");
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
                render();
                onChange();
            });
            $root.on("click." + ns, "[data-remove-group-route]", function () {
                harvest();
                const gi = Number($(this).attr("data-remove-group-route"));
                const ei = Number($(this).attr("data-route-index"));
                plan.groups[gi].endpoints.splice(ei, 1);
                render();
                onChange();
            });
            $root.on("click." + ns, "#" + prefix + "-add-endpoint", function () {
                harvest();
                const id = ($("#" + prefix + "-endpoint-add").val() || "").trim();
                if (!id) {
                    CadminApi.showToast("danger", "Select an ICG route.");
                    return;
                }
                if (usedRouteIds()[id]) {
                    CadminApi.showToast("danger", "That route is already on this plan.");
                    return;
                }
                plan.endpoints.push(Object.assign({ id: id }, emptyLimits(false)));
                render();
                onChange();
            });
            $root.on("click." + ns, "[data-remove-endpoint]", function () {
                harvest();
                const index = Number($(this).attr("data-remove-endpoint"));
                plan.endpoints.splice(index, 1);
                render();
                onChange();
            });
        }

        function destroy($root, ns) {
            teardownJsonPreview();
            if ($root) {
                $root.off("." + (ns || (prefix + "editor")));
            }
            $("#" + prefix + "-json-modal").off();
        }

        return {
            setPlan: function (next) {
                plan = next || emptyPlan(null);
            },
            getPlan: function () {
                return plan;
            },
            loadFromText: function (text, resource) {
                const parsed = parsePlanText(text, resource);
                if (!parsed) {
                    plan = emptyPlan(resource);
                    CadminApi.showToast("danger", "Stored plan JSON is invalid. Showing empty defaults.");
                    return;
                }
                plan = parsed;
            },
            harvest: harvest,
            render: render,
            renderSummary: renderSummary,
            pretty: function () {
                return prettyPlan(plan);
            },
            json: function () {
                return planToJson(plan);
            },
            validate: validate,
            bumpPolicyVersion: bumpPolicyVersion,
            loadIcgRoutes: function () {
                return loadIcgRoutes().then(function (routes) {
                    icgRoutes = routes;
                    return routes;
                });
            },
            bind: bind,
            destroy: destroy,
            refreshJson: refreshJson
        };
    }

    function originLabelHtml(doc, sourceLibrary) {
        const source = sourceLibraryRef(doc);
        if (!source) {
            return '<span class="badge text-bg-warning">Custom</span>' +
                '<div class="small text-muted mt-1">Not derived</div>';
        }
        const href = "#/rate-limit-plans/" + encodeURIComponent(source.id);
        const name = (sourceLibrary && (sourceLibrary.title || sourceLibrary.name)) || source.display || source.id;
        const derived = 'Derived from ' + CadminApi.resourceLink(href, name);
        const currentText = readDocumentPlanText(doc);
        const templateText = sourceLibrary ? readLibraryPlanText(sourceLibrary) : "";
        const matches = sourceLibrary ? plansMatch(currentText, templateText) : false;
        if (matches) {
            return '<span class="badge text-bg-secondary">Template</span>' +
                '<div class="small mt-1">' + derived + "</div>";
        }
        return '<span class="badge text-bg-warning">Custom</span>' +
            '<div class="small mt-1">' + derived + "</div>";
    }

    return {
        LIBRARY_TYPE: LIBRARY_TYPE,
        TIER_TYPE: TIER_TYPE,
        TIER_TYPE_SYSTEM: TIER_TYPE_SYSTEM,
        CONTENT_TYPE: CONTENT_TYPE,
        SOURCE_EXTENSION: SOURCE_EXTENSION,
        CLIENT_ID_SYSTEM: CLIENT_ID_SYSTEM,
        encodeText: encodeText,
        decodeText: decodeText,
        emptyPlan: emptyPlan,
        emptyLimits: emptyLimits,
        planFromJson: planFromJson,
        planToJson: planToJson,
        prettyPlan: prettyPlan,
        parsePlanText: parsePlanText,
        plansMatch: plansMatch,
        planLimitOrderError: planLimitOrderError,
        ratesChanged: ratesChanged,
        incrementPolicyVersion: incrementPolicyVersion,
        confirmPolicyBumpIfNeeded: confirmPolicyBumpIfNeeded,
        libraryTypeConcept: libraryTypeConcept,
        tierTypeConcept: tierTypeConcept,
        isRateLimitTier: isRateLimitTier,
        isActiveTier: isActiveTier,
        findLibraryAttachment: findLibraryAttachment,
        readLibraryPlanText: readLibraryPlanText,
        upsertLibraryPlanJson: upsertLibraryPlanJson,
        findDocumentAttachment: findDocumentAttachment,
        readDocumentPlanText: readDocumentPlanText,
        upsertDocumentPlanJson: upsertDocumentPlanJson,
        sourceLibraryRef: sourceLibraryRef,
        setSourceLibrary: setSourceLibrary,
        organizationRefOf: organizationRefOf,
        setOrganization: setOrganization,
        oidcClientIdOf: oidcClientIdOf,
        setOidcClientId: setOidcClientId,
        documentTitle: documentTitle,
        loadIcgRoutes: loadIcgRoutes,
        loadPlanLibraries: loadPlanLibraries,
        searchOrgTiers: searchOrgTiers,
        activateTier: activateTier,
        planFormHtml: planFormHtml,
        summaryHtml: summaryHtml,
        jsonModalHtml: jsonModalHtml,
        createEditor: createEditor,
        originLabelHtml: originLabelHtml,
        field: field,
        fieldRow: fieldRow
    };
}());
