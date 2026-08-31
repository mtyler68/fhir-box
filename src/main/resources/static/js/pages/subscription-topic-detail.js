window.CadminSubscriptionTopicDetail = (function () {
    let statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const resourceTypes = [
        "Patient", "Practitioner", "PractitionerRole", "Organization", "Location",
        "Encounter", "Observation", "Condition", "Procedure", "AllergyIntolerance",
        "MedicationRequest", "DiagnosticReport", "DocumentReference", "Library",
        "Device", "DeviceAssociation", "CareTeam", "RelatedPerson", "Task",
        "Appointment", "Coverage", "Group", "HealthcareService", "Subscription",
        "SearchParameter"
    ];
    let interactionOptions = [
        { code: "create", display: "Create" },
        { code: "update", display: "Update" },
        { code: "delete", display: "Delete" }
    ];
    const resultOptions = [
        { code: "", display: "Unspecified" },
        { code: "test-passes", display: "Test passes" },
        { code: "test-fails", display: "Test fails" }
    ];
    let comparatorOptions = [
        { code: "eq", display: "eq" }, { code: "ne", display: "ne" },
        { code: "gt", display: "gt" }, { code: "lt", display: "lt" },
        { code: "ge", display: "ge" }, { code: "le", display: "le" },
        { code: "sa", display: "sa" }, { code: "eb", display: "eb" }, { code: "ap", display: "ap" }
    ];
    let modifierOptions = [
        { code: "missing", display: "missing" }, { code: "exact", display: "exact" },
        { code: "contains", display: "contains" }, { code: "not", display: "not" },
        { code: "text", display: "text" }, { code: "in", display: "in" },
        { code: "not-in", display: "not-in" }, { code: "below", display: "below" },
        { code: "above", display: "above" }, { code: "type", display: "type" },
        { code: "identifier", display: "identifier" }
    ];

    let topic = null;
    let editingTriggerIndex = -1;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const code = item.code != null ? item.code : item;
            const display = item.display != null ? item.display : item;
            const mark = code === selected ? " selected" : "";
            return '<option value="' + esc(code) + '"' + mark + ">" + esc(display) + "</option>";
        }).join("");
    }

    function statusLabel(code) {
        const match = statusOptions.find(function (option) { return option.code === code; });
        return match ? match.display : (code || "—");
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success" : status === "retired" ? "secondary"
            : status === "draft" ? "warning" : "info";
        return '<span class="badge text-bg-' + kind + '">' + esc(statusLabel(status)) + "</span>";
    }

    function resourceTriggers() {
        return topic.resourceTrigger || topic.trigger || [];
    }

    function topicFilters() {
        if (topic.canFilterBy && topic.canFilterBy.length) {
            return topic.canFilterBy;
        }
        const nested = [];
        resourceTriggers().forEach(function (item) {
            (item.canFilterBy || []).forEach(function (filter) {
                nested.push(filter);
            });
        });
        return nested;
    }

    function topicShapes() {
        if (topic.notificationShape && topic.notificationShape.length) {
            return topic.notificationShape;
        }
        const nested = [];
        resourceTriggers().forEach(function (item) {
            (item.notificationShape || []).forEach(function (shape) {
                nested.push(shape);
            });
        });
        return nested;
    }

    function migrateR5() {
        if (!topic.resourceTrigger && topic.trigger) {
            topic.resourceTrigger = topic.trigger;
        }
        delete topic.trigger;
        topic.resourceTrigger = topic.resourceTrigger || [];
        const filters = topicFilters().slice();
        const shapes = topicShapes().slice();
        topic.resourceTrigger.forEach(function (item) {
            if (typeof item.fhirPathCriteria === "string") {
                item.fhirPathCriteria = item.fhirPathCriteria ? [item.fhirPathCriteria] : [];
                if (!item.fhirPathCriteria.length) {
                    delete item.fhirPathCriteria;
                }
            }
            delete item.canFilterBy;
            delete item.notificationShape;
        });
        if (filters.length) {
            topic.canFilterBy = filters;
        } else {
            delete topic.canFilterBy;
        }
        if (shapes.length) {
            topic.notificationShape = shapes;
        } else {
            delete topic.notificationShape;
        }
    }

    function fhirPathText(item) {
        const paths = item && item.fhirPathCriteria;
        if (Array.isArray(paths)) {
            return paths.join("\n");
        }
        return paths || "";
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function fail(action, xhr) {
        CadminApi.showAlert("#topic-detail-alert", "danger", action + " failed (" + xhr.status + ").");
    }

    function saveTopic(next) {
        migrateR5();
        CadminApi.fhir("/SubscriptionTopic/" + encodeURIComponent(topic.id), "PUT", topic).done(function (updated) {
            topic = updated || topic;
            migrateR5();
            renderBasics();
            renderTriggers();
            renderFilters();
            renderShapes();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            fail("Update topic", xhr);
        });
    }

    function field(label, control) {
        return '<div class="mb-3"><label class="form-label">' + label + "</label>" + control + "</div>";
    }

    function modal(id, title, body, formId) {
        return '<div class="modal fade" id="' + id + '" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="' + formId + '">' +
                    '<div class="modal-header"><h5 class="modal-title">' + title + "</h5>" +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' + body + "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>";
    }

    function card(title, bodyId, columns, addTarget, addLabel) {
        return '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                "<h6 class=\"m-0\">" + title + "</h6>" +
                (addTarget
                    ? '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="' +
                        addTarget + '">' + addLabel + "</button>"
                    : "") +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr>" + columns.map(function (col) { return "<th>" + col + "</th>"; }).join("") +
                        "</tr></thead>" +
                        '<tbody id="' + bodyId + '"></tbody>' +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
    }

    function checkboxList(name, options, selected) {
        const chosen = selected || [];
        return options.map(function (option) {
            const checked = chosen.indexOf(option.code) >= 0 ? " checked" : "";
            const id = name + "-" + option.code;
            return '<div class="form-check">' +
                '<input class="form-check-input" type="checkbox" name="' + name + '" value="' +
                option.code + '" id="' + id + '"' + checked + ">" +
                '<label class="form-check-label" for="' + id + '">' + esc(option.display) + "</label></div>";
        }).join("");
    }

    function selectedChecks(name) {
        const values = [];
        $('input[name="' + name + '"]:checked').each(function () {
            values.push($(this).val());
        });
        return values;
    }

    function render(resource) {
        topic = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/subscription-topics">' +
                        '<i class="bi bi-arrow-left me-1"></i>Subscription topics</a>' +
                    '<h1 class="h3 mb-0 page-title">' + esc(topic.title || topic.name || topic.url || "Subscription topic") + "</h1>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-primary" type="button" id="topic-new-sub">' +
                        '<i class="bi bi-broadcast me-1"></i>New subscription</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="td-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div id="topic-detail-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Basics</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#td-basic-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="td-basics"></div>' +
            "</div>" +
            card("Resource triggers", "td-trigger-rows",
                ["Resource", "Interactions", "Criteria", ""], "#td-trigger-modal", "Add") +
            '<div class="row">' +
                '<div class="col-lg-6">' +
                    card("Can filter by", "td-filter-rows",
                        ["Parameter", "Resource", "Comparators", ""], "#td-filter-modal", "Add") +
                "</div>" +
                '<div class="col-lg-6">' +
                    card("Notification shape", "td-shape-rows",
                        ["Resource", "Include", ""], "#td-shape-modal", "Add") +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Subscriptions using this topic</h6></div>' +
                '<div class="card-body">' +
                    '<div class="table-responsive">' +
                        '<table class="table table-hover align-middle mb-0">' +
                            "<thead><tr><th>Name</th><th>Status</th><th>Channel</th><th>Endpoint</th></tr></thead>" +
                            '<tbody id="td-sub-rows"><tr><td colspan="4" class="text-muted">Loading…</td></tr></tbody>' +
                        "</table>" +
                    "</div>" +
                "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            modal("td-basic-modal", "Edit basics",
                field("URL", '<input class="form-control font-monospace" id="td-url" required>') +
                field("Title", '<input class="form-control" id="td-title">') +
                field("Name", '<input class="form-control font-monospace" id="td-name">') +
                field("Version", '<input class="form-control" id="td-version" autocomplete="off">') +
                field("Status", '<select class="form-select" id="td-status">' + optionsHtml(statusOptions) + "</select>") +
                field("Description", '<textarea class="form-control" id="td-description" rows="3"></textarea>') +
                field("Purpose", '<textarea class="form-control" id="td-purpose" rows="2"></textarea>'),
                "td-basic-form") +
            modal("td-trigger-modal", "Resource trigger",
                field("Description", '<input class="form-control" id="td-trig-desc" placeholder="Optional">') +
                field("Resource", '<select class="form-select" id="td-resource">' + optionsHtml(resourceTypes) + "</select>") +
                '<div class="mb-3"><label class="form-label">Interactions</label>' +
                    '<div id="td-ix-list">' + checkboxList("td-ix", interactionOptions, []) + "</div></div>" +
                field("Previous query", '<input class="form-control font-monospace" id="td-prev" placeholder="FHIR search string">') +
                field("Current query", '<input class="form-control font-monospace" id="td-current" placeholder="FHIR search string">') +
                field("Result for create", '<select class="form-select" id="td-create-result">' + optionsHtml(resultOptions) + "</select>") +
                field("Result for delete", '<select class="form-select" id="td-delete-result">' + optionsHtml(resultOptions) + "</select>") +
                '<div class="form-check mb-3">' +
                    '<input class="form-check-input" type="checkbox" id="td-require-both">' +
                    '<label class="form-check-label" for="td-require-both">Require both previous and current</label></div>' +
                field("FHIRPath criteria",
                    '<textarea class="form-control font-monospace" id="td-fhirpath" rows="3" ' +
                    'placeholder="One expression per line"></textarea>'),
                "td-trigger-form") +
            modal("td-filter-modal", "Add filter parameter",
                field("Filter parameter", '<input class="form-control font-monospace" id="td-fp-name" required placeholder="e.g. patient">') +
                field("Resource", '<select class="form-select" id="td-fp-resource">' +
                    '<option value="">Same as trigger</option>' + optionsHtml(resourceTypes) + "</select>") +
                field("Description", '<input class="form-control" id="td-fp-desc">') +
                '<div class="mb-3"><label class="form-label">Comparators</label>' +
                    '<div id="td-fp-cmp-list">' + checkboxList("td-fp-cmp", comparatorOptions, []) + "</div></div>" +
                '<div class="mb-0"><label class="form-label">Modifiers</label>' +
                    '<div id="td-fp-mod-list">' + checkboxList("td-fp-mod", modifierOptions, []) + "</div></div>",
                "td-filter-form") +
            modal("td-shape-modal", "Add notification shape",
                field("Resource", '<select class="form-select" id="td-ns-resource" required>' + optionsHtml(resourceTypes) + "</select>") +
                field("Include", '<input class="form-control font-monospace" id="td-ns-include" placeholder="Patient:organization">') +
                field("Revinclude", '<input class="form-control font-monospace" id="td-ns-revinclude" placeholder="Observation:subject">'),
                "td-shape-form")
        );
        CadminResourceSource.mount(function () { return topic; });
        CadminResourceGraph.mount(topic);
        CadminResourceHistory.mount(topic);
        migrateR5();
        renderBasics();
        renderTriggers();
        renderFilters();
        renderShapes();
        loadSubscriptions();
        bind();
        bindValueSets();
    }

    function bindValueSets() {
        const resourceFallback = resourceTypes.map(function (type) {
            return { code: type, display: type };
        });
        CadminApi.fillValueSetSelect("#td-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: topic.status || "draft",
            onConcepts: function (concepts) { statusOptions = concepts; }
        });
        CadminApi.fillValueSetSelect("#td-resource", CadminApi.valueSets.resourceTypes, {
            fallback: resourceFallback,
            selected: (resourceTriggers()[0] || {}).resource || "Patient",
            count: 300
        });
        CadminApi.fillValueSetSelect("#td-fp-resource", CadminApi.valueSets.resourceTypes, {
            fallback: resourceFallback,
            prepend: [{ code: "", display: "Same as trigger" }],
            selected: "",
            count: 300
        });
        CadminApi.fillValueSetSelect("#td-ns-resource", CadminApi.valueSets.resourceTypes, {
            fallback: resourceFallback,
            count: 300
        });
        CadminApi.fillValueSetSelect("#td-create-result", CadminApi.valueSets.subscriptiontopicCrBehavior, {
            fallback: resultOptions.filter(function (item) { return item.code; }),
            prepend: [{ code: "", display: "Unspecified" }],
            selected: ""
        });
        CadminApi.fillValueSetSelect("#td-delete-result", CadminApi.valueSets.subscriptiontopicCrBehavior, {
            fallback: resultOptions.filter(function (item) { return item.code; }),
            prepend: [{ code: "", display: "Unspecified" }],
            selected: ""
        });
        CadminApi.fillValueSetChecks("#td-ix-list", CadminApi.valueSets.interactionTrigger, {
            fallback: interactionOptions,
            name: "td-ix",
            onConcepts: function (concepts) { interactionOptions = concepts; }
        });
        CadminApi.fillValueSetChecks("#td-fp-cmp-list", CadminApi.valueSets.searchComparator, {
            fallback: comparatorOptions,
            name: "td-fp-cmp",
            onConcepts: function (concepts) { comparatorOptions = concepts; }
        });
        CadminApi.fillValueSetChecks("#td-fp-mod-list", CadminApi.valueSets.searchModifierCode, {
            fallback: modifierOptions,
            name: "td-fp-mod",
            onConcepts: function (concepts) { modifierOptions = concepts; }
        });
    }

    function renderBasics() {
        $("#td-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">URL</dt><dd class="col-sm-9"><code>' + esc(topic.url || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Title</dt><dd class="col-sm-9">' + esc(topic.title || "—") + "</dd>" +
                '<dt class="col-sm-3">Name</dt><dd class="col-sm-9">' + esc(topic.name || "—") + "</dd>" +
                '<dt class="col-sm-3">Version</dt><dd class="col-sm-9">' + esc(topic.version || "—") + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(topic.status) + "</dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' + esc(topic.description || "—") + "</dd>" +
                '<dt class="col-sm-3">Purpose</dt><dd class="col-sm-9">' + esc(topic.purpose || "—") + "</dd>" +
            "</dl>"
        );
    }

    function triggerCriteriaLabel(item) {
        const criteria = (item && item.queryCriteria) || {};
        const parts = [];
        if (criteria.previous) {
            parts.push("prev " + criteria.previous);
        }
        if (criteria.current) {
            parts.push("curr " + criteria.current);
        }
        const paths = fhirPathText(item);
        if (paths) {
            parts.push(paths.replace(/\n/g, "; "));
        }
        return parts.join(" · ") || "—";
    }

    function fillTriggerForm(item) {
        item = item || {};
        const criteria = item.queryCriteria || {};
        $("#td-trig-desc").val(item.description || "");
        $("#td-resource").val(item.resource || "Patient");
        $('input[name="td-ix"]').prop("checked", false);
        (item.supportedInteraction || []).forEach(function (code) {
            $('input[name="td-ix"][value="' + code + '"]').prop("checked", true);
        });
        $("#td-prev").val(criteria.previous || "");
        $("#td-current").val(criteria.current || "");
        $("#td-create-result").val(criteria.resultForCreate || "");
        $("#td-delete-result").val(criteria.resultForDelete || "");
        $("#td-require-both").prop("checked", !!criteria.requireBoth);
        $("#td-fhirpath").val(fhirPathText(item));
        $("#td-trigger-modal .modal-title").text(editingTriggerIndex >= 0 ? "Edit resource trigger" : "Add resource trigger");
    }

    function readTriggerForm() {
        const item = {};
        const description = $("#td-trig-desc").val().trim();
        if (description) {
            item.description = description;
        }
        item.resource = $("#td-resource").val();
        const interactions = selectedChecks("td-ix");
        if (interactions.length) {
            item.supportedInteraction = interactions;
        }
        const previous = $("#td-prev").val().trim();
        const current = $("#td-current").val().trim();
        const resultForCreate = $("#td-create-result").val();
        const resultForDelete = $("#td-delete-result").val();
        const requireBoth = $("#td-require-both").is(":checked");
        if (previous || current || resultForCreate || resultForDelete || requireBoth) {
            item.queryCriteria = {};
            if (previous) { item.queryCriteria.previous = previous; }
            if (current) { item.queryCriteria.current = current; }
            if (resultForCreate) { item.queryCriteria.resultForCreate = resultForCreate; }
            if (resultForDelete) { item.queryCriteria.resultForDelete = resultForDelete; }
            if (requireBoth) { item.queryCriteria.requireBoth = true; }
        }
        const paths = $("#td-fhirpath").val().split(/\r?\n/).map(function (line) {
            return line.trim();
        }).filter(Boolean);
        if (paths.length) {
            item.fhirPathCriteria = paths;
        }
        return item;
    }

    function renderTriggers() {
        const items = resourceTriggers();
        if (!items.length) {
            $("#td-trigger-rows").html(emptyRow(4, "No resource triggers. Add one for each resource this topic watches."));
            return;
        }
        $("#td-trigger-rows").html(items.map(function (item, index) {
            return "<tr>" +
                "<td>" + esc(item.resource || "—") +
                    (item.description ? '<div class="small text-muted">' + esc(item.description) + "</div>" : "") +
                "</td>" +
                "<td>" + esc((item.supportedInteraction || []).join(", ") || "—") + "</td>" +
                "<td><code>" + esc(triggerCriteriaLabel(item)) + "</code></td>" +
                '<td class="text-end text-nowrap">' +
                    '<button class="btn btn-sm btn-outline-primary me-1" type="button" data-bs-toggle="modal" ' +
                        'data-bs-target="#td-trigger-modal" data-edit-trigger="' + index +
                        '" title="Edit"><i class="bi bi-pencil"></i></button>' +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-trigger="' +
                        index + '" title="Remove"><i class="bi bi-trash"></i></button>' +
                "</td></tr>";
        }).join(""));
    }

    function renderFilters() {
        const filters = topicFilters();
        if (!filters.length) {
            $("#td-filter-rows").html(emptyRow(4, "No filter parameters. Subscriptions can still bind to this topic."));
            return;
        }
        $("#td-filter-rows").html(filters.map(function (item, index) {
            return "<tr>" +
                "<td><code>" + esc(item.filterParameter || "—") + "</code></td>" +
                "<td>" + esc(item.resource || "—") + "</td>" +
                "<td>" + esc((item.comparator || []).join(", ") || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-filter="' +
                    index + '" title="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderShapes() {
        const shapes = topicShapes();
        if (!shapes.length) {
            $("#td-shape-rows").html(emptyRow(3, "No notification shapes."));
            return;
        }
        $("#td-shape-rows").html(shapes.map(function (item, index) {
            return "<tr>" +
                "<td>" + esc(item.resource || "—") + "</td>" +
                "<td><code>" + esc((item.include || []).concat(item.revInclude || []).join(", ") || "—") + "</code></td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-shape="' +
                    index + '" title="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function loadSubscriptions() {
        if (!topic.url) {
            $("#td-sub-rows").html(emptyRow(4, "Topic URL is required to find subscriptions."));
            return;
        }
        CadminApi.fhir("/Subscription?topic=" + encodeURIComponent(topic.url) + "&_count=50&_sort=-_lastUpdated")
            .done(function (bundle) {
                const entries = CadminApi.bundleResources(bundle, "Subscription");
                if (!entries.length) {
                    $("#td-sub-rows").html(emptyRow(4, "No subscriptions use this topic yet."));
                    return;
                }
                $("#td-sub-rows").html(entries.map(function (sub) {
                    const channel = ((sub.channelType || {}).code) || "—";
                    return "<tr>" +
                        "<td>" + CadminApi.resourceLink("#/subscriptions/" + encodeURIComponent(sub.id),
                            sub.name || sub.id) + "</td>" +
                        "<td>" + esc(sub.status || "—") + "</td>" +
                        "<td>" + esc(channel) + "</td>" +
                        "<td><code>" + esc(sub.endpoint || "—") + "</code></td></tr>";
                }).join(""));
            }).fail(function () {
                $("#td-sub-rows").html(emptyRow(4, "Unable to load subscriptions."));
            });
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".topicdetail");

        $("#td-basic-modal").on("show.bs.modal", function () {
            $("#td-url").val(topic.url || "");
            $("#td-title").val(topic.title || "");
            $("#td-name").val(topic.name || "");
            $("#td-version").val(topic.version || "");
            $("#td-status").val(topic.status || "draft");
            $("#td-description").val(topic.description || "");
            $("#td-purpose").val(topic.purpose || "");
        });

        $("#td-trigger-modal").on("show.bs.modal", function (event) {
            const related = event.relatedTarget;
            const editAttr = related ? $(related).attr("data-edit-trigger") : null;
            if (editAttr != null && editAttr !== "") {
                editingTriggerIndex = Number(editAttr);
                fillTriggerForm(resourceTriggers()[editingTriggerIndex] || {});
            } else {
                editingTriggerIndex = -1;
                fillTriggerForm({});
            }
        });

        $("#td-basic-form").on("submit", function (event) {
            event.preventDefault();
            topic.url = $("#td-url").val().trim();
            const title = $("#td-title").val().trim();
            const name = $("#td-name").val().trim();
            const version = $("#td-version").val().trim();
            const description = $("#td-description").val().trim();
            const purpose = $("#td-purpose").val().trim();
            topic.status = $("#td-status").val() || "draft";
            if (title) { topic.title = title; } else { delete topic.title; }
            if (name) { topic.name = name; } else { delete topic.name; }
            if (version) { topic.version = version; } else { delete topic.version; }
            if (description) { topic.description = description; } else { delete topic.description; }
            if (purpose) { topic.purpose = purpose; } else { delete topic.purpose; }
            saveTopic(function () {
                hideModal("td-basic-modal");
                CadminApi.showToast("success", "Topic updated.");
            });
        });

        $("#td-trigger-form").on("submit", function (event) {
            event.preventDefault();
            migrateR5();
            const item = readTriggerForm();
            if (editingTriggerIndex >= 0 && editingTriggerIndex < topic.resourceTrigger.length) {
                topic.resourceTrigger[editingTriggerIndex] = item;
            } else {
                topic.resourceTrigger.push(item);
            }
            saveTopic(function () {
                hideModal("td-trigger-modal");
                CadminApi.showToast("success", editingTriggerIndex >= 0
                    ? "Resource trigger updated."
                    : "Resource trigger added.");
            });
        });

        $("#td-filter-form").on("submit", function (event) {
            event.preventDefault();
            migrateR5();
            const filter = { filterParameter: $("#td-fp-name").val().trim() };
            const resource = $("#td-fp-resource").val();
            const description = $("#td-fp-desc").val().trim();
            const comparators = selectedChecks("td-fp-cmp");
            const modifiers = selectedChecks("td-fp-mod");
            if (resource) { filter.resource = resource; }
            if (description) { filter.description = description; }
            if (comparators.length) { filter.comparator = comparators; }
            if (modifiers.length) { filter.modifier = modifiers; }
            topic.canFilterBy = topic.canFilterBy || [];
            topic.canFilterBy.push(filter);
            saveTopic(function () {
                hideModal("td-filter-modal");
                CadminApi.showToast("success", "Filter parameter added.");
            });
        });

        $("#td-shape-form").on("submit", function (event) {
            event.preventDefault();
            migrateR5();
            const shape = { resource: $("#td-ns-resource").val() };
            const include = $("#td-ns-include").val().trim();
            const revInclude = $("#td-ns-revinclude").val().trim();
            if (include) { shape.include = include.split(/\s*,\s*/).filter(Boolean); }
            if (revInclude) { shape.revInclude = revInclude.split(/\s*,\s*/).filter(Boolean); }
            topic.notificationShape = topic.notificationShape || [];
            topic.notificationShape.push(shape);
            saveTopic(function () {
                hideModal("td-shape-modal");
                CadminApi.showToast("success", "Notification shape added.");
            });
        });

        $root.on("click.topicdetail", "[data-remove-trigger]", function () {
            const index = Number($(this).attr("data-remove-trigger"));
            migrateR5();
            topic.resourceTrigger = topic.resourceTrigger.filter(function (_item, i) { return i !== index; });
            if (!topic.resourceTrigger.length) {
                delete topic.resourceTrigger;
            }
            saveTopic(function () {
                CadminApi.showToast("success", "Resource trigger removed.");
            });
        });

        $root.on("click.topicdetail", "[data-remove-filter]", function () {
            const index = Number($(this).attr("data-remove-filter"));
            migrateR5();
            topic.canFilterBy = (topic.canFilterBy || []).filter(function (_item, i) { return i !== index; });
            if (!topic.canFilterBy.length) {
                delete topic.canFilterBy;
            }
            saveTopic(function () {
                CadminApi.showToast("success", "Filter parameter removed.");
            });
        });

        $root.on("click.topicdetail", "[data-remove-shape]", function () {
            const index = Number($(this).attr("data-remove-shape"));
            migrateR5();
            topic.notificationShape = (topic.notificationShape || []).filter(function (_item, i) {
                return i !== index;
            });
            if (!topic.notificationShape.length) {
                delete topic.notificationShape;
            }
            saveTopic(function () {
                CadminApi.showToast("success", "Notification shape removed.");
            });
        });

        $("#td-delete").on("click", function () {
            CadminApi.confirm("Delete this subscription topic?").done(function () {
                CadminApi.fhir("/SubscriptionTopic/" + encodeURIComponent(topic.id), "DELETE").done(function () {
                    CadminApi.showToast("success", "Subscription topic deleted.");
                    window.location.hash = "#/subscription-topics";
                }).fail(function (xhr) {
                    fail("Delete topic", xhr);
                });
            });
        });

        $("#topic-new-sub").on("click", function () {
            try {
                sessionStorage.setItem("cadmin.pendingSubscriptionTopic", JSON.stringify({
                    id: topic.id,
                    url: topic.url,
                    title: topic.title || topic.name || topic.url
                }));
            } catch (err) {
                /* ignore */
            }
            window.location.hash = "#/subscriptions";
        });
    }

    return { render: render };
}());
