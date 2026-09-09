window.CadminSubscriptionDetail = (function () {
    let statusOptions = [
        { code: "requested", display: "Requested" },
        { code: "active", display: "Active" },
        { code: "error", display: "Error" },
        { code: "off", display: "Off" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    let channelTypes = [
        { code: "rest-hook", display: "Rest hook" },
        { code: "websocket", display: "Websocket" },
        { code: "email", display: "Email" },
        { code: "message", display: "Message" }
    ];
    let contentOptions = [
        { code: "empty", display: "Empty" },
        { code: "id-only", display: "ID only" },
        { code: "full-resource", display: "Full resource" }
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

    let subscription = null;
    let topicResource = null;
    let statusPollTimer = 0;
    let statusPollToken = 0;
    let statusPolling = false;
    let importStep = 1;
    let importParameters = null;
    let savedForms = "";

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
        const kind = status === "active" ? "success" : status === "error" ? "danger"
            : status === "off" || status === "entered-in-error" ? "secondary"
                : "warning";
        return '<span class="badge text-bg-' + kind + '">' + esc(statusLabel(status)) + "</span>";
    }

    function statusDisplay() {
        let html = statusBadge(subscription.status);
        if (statusPolling && subscription.status === "requested") {
            html += ' <span class="text-muted small align-middle">' +
                '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>' +
                "Checking status…</span>";
        }
        return html;
    }

    function stopStatusPoll() {
        statusPolling = false;
        if (statusPollTimer) {
            window.clearTimeout(statusPollTimer);
            statusPollTimer = 0;
        }
        statusPollToken += 1;
    }

    function subscriptionPageVisible() {
        return !!document.getElementById("sd-title");
    }

    function resourceVersion(resource) {
        const vid = resource && resource.meta && resource.meta.versionId;
        const n = Number(vid);
        return isNaN(n) ? 0 : n;
    }

    function rememberSubscription(resource) {
        if (resource && window.CadminWorkspace && typeof CadminWorkspace.rememberResource === "function") {
            CadminWorkspace.rememberResource(resource);
        }
    }

    function applyPolledSubscription(updated) {
        const previousVid = subscription && subscription.meta && subscription.meta.versionId;
        subscription = updated || subscription;
        rememberSubscription(subscription);
        if (!subscriptionPageVisible()) {
            return;
        }
        renderHeader();
        if (!formsAreDirty()) {
            fillBasicsForm();
            fillChannelForm();
            markFormsClean();
        }
        const nextVid = subscription && subscription.meta && subscription.meta.versionId;
        if (nextVid && nextVid !== previousVid) {
            CadminResourceSource.mount(function () { return subscription; });
            if (window.CadminResourceHistory) {
                CadminResourceHistory.mount(subscription);
            }
        }
    }

    function startStatusPoll() {
        stopStatusPoll();
        const id = subscription && subscription.id;
        if (!id) {
            return;
        }
        statusPolling = true;
        const token = statusPollToken;
        const started = Date.now();
        const intervalMs = 2000;
        const maxMs = 45000;
        if (subscriptionPageVisible()) {
            renderHeader();
            if (!formsAreDirty()) {
                fillBasicsForm();
                fillChannelForm();
            }
        }

        function tick() {
            if (token !== statusPollToken || !subscription || subscription.id !== id) {
                return;
            }
            CadminApi.fhir("/Subscription/" + encodeURIComponent(id), "GET", null, { silent: true })
                .done(function (updated) {
                    if (token !== statusPollToken) {
                        return;
                    }
                    applyPolledSubscription(updated);
                    const status = subscription.status;
                    if (status && status !== "requested") {
                        stopStatusPoll();
                        paintAfterStatus();
                        if (status === "active") {
                            CadminApi.showToast("success", "Subscription is active.");
                        } else if (status === "error") {
                            CadminApi.showToast("danger", "Subscription entered an error state.");
                        } else if (status === "off") {
                            CadminApi.showToast("info", "Subscription is off.");
                        }
                        return;
                    }
                    if (Date.now() - started >= maxMs) {
                        stopStatusPoll();
                        paintAfterStatus();
                        CadminApi.showToast("warning",
                            "Still waiting for the server to update this subscription.");
                        return;
                    }
                    statusPollTimer = window.setTimeout(tick, intervalMs);
                })
                .fail(function () {
                    if (token !== statusPollToken) {
                        return;
                    }
                    if (Date.now() - started >= maxMs) {
                        stopStatusPoll();
                        paintAfterStatus();
                        return;
                    }
                    statusPollTimer = window.setTimeout(tick, intervalMs);
                });
        }
        statusPollTimer = window.setTimeout(tick, intervalMs);
    }

    function subscriptionName() {
        return subscription.name || subscription.reason || subscription.id || "Subscription";
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function fail(action, xhr) {
        CadminApi.showAlert("#sub-detail-alert", "danger", action + " failed (" + xhr.status + ").");
    }

    function saveSubscription(next) {
        CadminApi.fhir("/Subscription/" + encodeURIComponent(subscription.id), "PUT", subscription)
            .done(function (updated) {
                subscription = updated || subscription;
                rememberSubscription(subscription);
                renderHeader();
                fillBasicsForm();
                fillChannelForm();
                renderFilters();
                renderParameters();
                markFormsClean();
                CadminResourceSource.mount(function () { return subscription; });
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                fail("Update subscription", xhr);
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

    function card(title, bodyId, columns, addTarget, addLabel, extraTools) {
        let tools = extraTools || "";
        if (addTarget) {
            tools += '<button class="btn btn-sm btn-outline-primary" type="button" id="' + bodyId +
                '-add" data-bs-toggle="modal" data-bs-target="' + addTarget + '">' + addLabel + "</button>";
        }
        return '<div class="card">' +
            '<div class="card-header">' +
                '<h3 class="card-title">' + title + "</h3>" +
                (tools ? '<div class="card-tools">' + tools + "</div>" : "") +
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

    function topicFilters() {
        if (!topicResource) {
            return [];
        }
        if (topicResource.canFilterBy && topicResource.canFilterBy.length) {
            return topicResource.canFilterBy;
        }
        const trigger = (topicResource.resourceTrigger && topicResource.resourceTrigger[0])
            || (topicResource.trigger && topicResource.trigger[0])
            || {};
        return trigger.canFilterBy || [];
    }

    function filterDef(name) {
        return topicFilters().find(function (item) { return item.filterParameter === name; }) || null;
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        return ref.display || (ref.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function refId(ref) {
        return CadminApi.referenceId(ref);
    }

    function toLocalInput(instant) {
        if (!instant) {
            return "";
        }
        const date = new Date(instant);
        if (isNaN(date.getTime())) {
            return "";
        }
        const pad = function (n) { return String(n).padStart(2, "0"); };
        return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
            "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }

    function fromLocalInput(value) {
        if (!value) {
            return "";
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? "" : date.toISOString();
    }

    function render(resource) {
        stopStatusPoll();
        subscription = resource;
        topicResource = null;
        const $root = $(CadminWorkspace.root());
        const label = esc(subscriptionName());
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<nav aria-label="breadcrumb">' +
                        '<ol class="breadcrumb mb-1">' +
                            '<li class="breadcrumb-item"><a href="#/subscriptions">Subscriptions</a></li>' +
                            '<li class="breadcrumb-item active" aria-current="page" id="sd-crumb">' + label + "</li>" +
                        "</ol>" +
                    "</nav>" +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="sd-title">' + label + "</h1>" +
                        '<span id="sd-status-badge">' + statusDisplay() + "</span>" +
                        (subscription.id
                            ? '<code class="small" id="sd-fhir-id">' + esc(subscription.id) + "</code>"
                            : '<code class="small d-none" id="sd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                    '<div class="small text-muted d-none" id="sd-error-note">' +
                        "Server reported an error. Play to retry.</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2 align-items-center">' +
                    '<span id="sd-toggle-slot"></span>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div id="sub-detail-alert" class="alert d-none"></div>' +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="sd-settings-nav" role="tablist">' +
                        navButton("sd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("sd-pane-channel", "bi bi-broadcast", "Channel") +
                        navButton("sd-pane-filters", "bi bi-funnel", "Filters") +
                        navButton("sd-pane-params", "bi bi-sliders", "Channel parameters") +
                        navButton("sd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("sd-pane-history", "bi bi-clock-history", "History") +
                        navButton("sd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("sd-pane-basics",
                            '<div class="card">' +
                                '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                '<div class="card-body">' +
                                    '<form class="row g-3" id="sd-basic-form">' +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-name">Name</label>' +
                                            '<input class="form-control" id="sd-name">' +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-topic">Topic</label>' +
                                            '<div class="d-flex gap-2">' +
                                                '<div class="flex-grow-1 min-w-0">' +
                                                    '<select class="form-select" id="sd-topic" required></select>' +
                                                "</div>" +
                                                '<a class="btn btn-outline-secondary d-none flex-shrink-0" id="sd-topic-open" ' +
                                                    'title="Open subscription topic">' +
                                                    '<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>' +
                                                    '<span class="visually-hidden">Open topic</span></a>' +
                                            "</div>" +
                                        "</div>" +
                                        '<div class="col-12">' +
                                            '<label class="form-label" for="sd-reason">Reason</label>' +
                                            '<input class="form-control" id="sd-reason">' +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-org">Managing organization</label>' +
                                            '<select class="form-select" id="sd-org"><option value="">None</option></select>' +
                                        "</div>" +
                                        '<div class="col-12">' +
                                            '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                        "</div>" +
                                    "</form>" +
                                "</div>" +
                            "</div>",
                            true) +
                        tabPane("sd-pane-channel",
                            '<div class="card">' +
                                '<div class="card-header">' +
                                    '<h3 class="card-title">Channel</h3>' +
                                    '<div class="card-tools">' +
                                        '<button class="btn btn-sm btn-outline-primary" type="button" ' +
                                            'data-bs-toggle="modal" data-bs-target="#sd-channel-import-modal">' +
                                            '<i class="bi bi-hdd-network me-1" aria-hidden="true"></i>Import from endpoint</button>' +
                                    "</div>" +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<form class="row g-3" id="sd-channel-form">' +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-channel-type">Channel type</label>' +
                                            '<select class="form-select" id="sd-channel-type">' +
                                                optionsHtml(channelTypes) + "</select>" +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-endpoint">Endpoint</label>' +
                                            '<input class="form-control font-monospace" id="sd-endpoint" ' +
                                                'placeholder="https://example.org/fhir/notification">' +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-content">Content</label>' +
                                            '<select class="form-select" id="sd-content">' +
                                                optionsHtml(contentOptions) + "</select>" +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-content-type">Content type</label>' +
                                            '<input class="form-control font-monospace" id="sd-content-type">' +
                                        "</div>" +
                                        '<div class="col-md-4">' +
                                            '<label class="form-label" for="sd-heartbeat">Heartbeat (seconds)</label>' +
                                            '<input class="form-control" id="sd-heartbeat" type="number" min="0" step="1">' +
                                        "</div>" +
                                        '<div class="col-md-4">' +
                                            '<label class="form-label" for="sd-timeout">Timeout (seconds)</label>' +
                                            '<input class="form-control" id="sd-timeout" type="number" min="0" step="1">' +
                                        "</div>" +
                                        '<div class="col-md-4">' +
                                            '<label class="form-label" for="sd-max-count">Max count</label>' +
                                            '<input class="form-control" id="sd-max-count" type="number" min="1" step="1">' +
                                        "</div>" +
                                        '<div class="col-md-6">' +
                                            '<label class="form-label" for="sd-end">End</label>' +
                                            '<input class="form-control" id="sd-end" type="datetime-local">' +
                                        "</div>" +
                                        '<div class="col-12">' +
                                            '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                        "</div>" +
                                    "</form>" +
                                "</div>" +
                            "</div>") +
                        tabPane("sd-pane-filters",
                            card("Filters", "sd-filter-rows",
                                ["Parameter", "Comparator", "Value", ""], "#sd-filter-modal", "Add")) +
                        tabPane("sd-pane-params",
                            card("Channel parameters", "sd-param-rows",
                                ["Name", "Value", ""], "#sd-param-modal", "Add")) +
                        tabPane("sd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("sd-pane-history", CadminResourceHistory.card()) +
                        tabPane("sd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this subscription</p>' +
                                            '<small class="text-secondary">' +
                                                "This permanently deletes the subscription. The topic and endpoint are not removed." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="sd-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>" +
            modal("sd-filter-modal", "Add filter",
                field("Filter parameter", '<select class="form-select" id="sd-fp-name" required></select>') +
                field("Resource", '<input class="form-control font-monospace" id="sd-fp-resource" readonly>') +
                field("Comparator", '<select class="form-select" id="sd-fp-cmp"></select>') +
                field("Modifier", '<select class="form-select" id="sd-fp-mod"></select>') +
                field("Value", '<input class="form-control font-monospace" id="sd-fp-value" required>'),
                "sd-filter-form") +
            modal("sd-param-modal", "Add channel parameter",
                field("Name", '<input class="form-control font-monospace" id="sd-pn-name" required placeholder="Authorization">') +
                field("Value", '<input class="form-control font-monospace" id="sd-pn-value" required>'),
                "sd-param-form") +
            '<div class="modal fade" id="sd-channel-import-modal" tabindex="-1">' +
                '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header"><h5 class="modal-title">Import channel from endpoint</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            '<ol class="npi-wizard-steps mb-3" id="sd-imp-steps">' +
                                '<li class="npi-wizard-step" data-imp-step="1">Select endpoint</li>' +
                                '<li class="npi-wizard-step" data-imp-step="2">Edit channel</li>' +
                            "</ol>" +
                            '<div id="sd-imp-alert" class="alert d-none"></div>' +
                            '<div data-imp-pane="1">' +
                                '<p class="text-muted">Choose an existing Endpoint. Address, connection type, payload, and headers prefill the channel so you can review them before saving.</p>' +
                                field("Endpoint",
                                    '<select class="form-select" id="sd-imp-endpoint">' +
                                        '<option value="">Select endpoint…</option></select>') +
                            "</div>" +
                            '<div data-imp-pane="2" class="d-none">' +
                                field("Channel type", '<select class="form-select" id="sd-imp-type">' +
                                    optionsHtml(channelTypes) + "</select>") +
                                field("Endpoint", '<input class="form-control font-monospace" id="sd-imp-url" ' +
                                    'placeholder="https://example.org/fhir/notification">') +
                                field("Content", '<select class="form-select" id="sd-imp-content">' +
                                    optionsHtml(contentOptions) + "</select>") +
                                field("Content type", '<input class="form-control font-monospace" id="sd-imp-content-type">') +
                                field("Heartbeat period (seconds)",
                                    '<input class="form-control" id="sd-imp-heartbeat" type="number" min="0" step="1">') +
                                field("Timeout (seconds)",
                                    '<input class="form-control" id="sd-imp-timeout" type="number" min="0" step="1">') +
                                field("Max count",
                                    '<input class="form-control" id="sd-imp-max-count" type="number" min="1" step="1">') +
                                field("End", '<input class="form-control" id="sd-imp-end" type="datetime-local">') +
                                '<p class="form-text mb-0" id="sd-imp-param-note"></p>' +
                            "</div>" +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="button" class="btn btn-outline-secondary d-none" id="sd-imp-back">Back</button>' +
                            '<button type="button" class="btn btn-primary" id="sd-imp-next">Next</button>' +
                            '<button type="button" class="btn btn-primary d-none" id="sd-imp-save">Save</button>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return subscription; });
        CadminResourceGraph.mount(subscription);
        CadminResourceHistory.mount(subscription);
        renderHeader();
        fillBasicsForm();
        fillChannelForm();
        renderFilters();
        renderParameters();
        fillTopicSelect(subscription.topic || "");
        fillOrgSelect(refId(subscription.managingEntity));
        loadTopic();
        bind();
        markFormsClean();
        CadminApi.fillValueSetSelect("#sd-channel-type", CadminApi.valueSets.subscriptionChannelType, {
            fallback: channelTypes,
            selected: (subscription.channelType && subscription.channelType.code) || "rest-hook",
            onConcepts: function (concepts) {
                channelTypes = concepts;
                if (!formsAreDirty()) {
                    fillChannelForm();
                    markFormsClean();
                }
                syncUnsavedFlag();
            }
        });
        CadminApi.fillValueSetSelect("#sd-imp-type", CadminApi.valueSets.subscriptionChannelType, {
            fallback: channelTypes,
            selected: (subscription.channelType && subscription.channelType.code) || "rest-hook"
        });
        CadminApi.fillValueSetSelect("#sd-content", CadminApi.valueSets.subscriptionPayloadContent, {
            fallback: contentOptions,
            selected: subscription.content || "id-only",
            onConcepts: function (concepts) {
                contentOptions = concepts;
                if (!formsAreDirty()) {
                    fillChannelForm();
                    markFormsClean();
                }
                syncUnsavedFlag();
            }
        });
        CadminApi.fillValueSetSelect("#sd-imp-content", CadminApi.valueSets.subscriptionPayloadContent, {
            fallback: contentOptions,
            selected: subscription.content || "id-only"
        });
        CadminApi.expandValueSet(CadminApi.valueSets.subscriptionStatus).done(function (concepts) {
            statusOptions = concepts;
            paintAfterStatus();
        });
        CadminApi.expandValueSet(CadminApi.valueSets.searchComparator).done(function (concepts) {
            comparatorOptions = concepts;
        });
        CadminApi.expandValueSet(CadminApi.valueSets.searchModifierCode).done(function (concepts) {
            modifierOptions = concepts;
        });
    }

    function refreshFromServer() {
        const id = subscription && subscription.id;
        if (!id) {
            return;
        }
        CadminApi.fhir("/Subscription/" + encodeURIComponent(id), "GET", null, { silent: true })
            .done(function (updated) {
                if (!subscription || subscription.id !== id) {
                    return;
                }
                applyPolledSubscription(updated);
                if (subscription.status === "requested") {
                    startStatusPoll();
                }
            });
    }

    function reveal(resource) {
        if (resource) {
            const same = subscription && subscription.id === resource.id;
            if (!same || resourceVersion(resource) >= resourceVersion(subscription)) {
                subscription = resource;
            }
        }
        if (!subscriptionPageVisible()) {
            return;
        }
        renderHeader();
        if (!formsAreDirty()) {
            fillBasicsForm();
            fillChannelForm();
        }
        renderFilters();
        renderParameters();
        refreshFromServer();
    }

    function paintAfterStatus() {
        if (!subscriptionPageVisible()) {
            return;
        }
        renderHeader();
        if (!formsAreDirty()) {
            fillBasicsForm();
            fillChannelForm();
        }
    }

    function currentTopicUrl() {
        const val = CadminApi.selectValue("#sd-topic");
        if (val) {
            return val;
        }
        const el = document.getElementById("sd-topic");
        if (!el || (!el.tomselect && $("#sd-topic option").length <= 1)) {
            return subscription.topic || "";
        }
        return "";
    }

    function formsSnapshot() {
        return [
            $("#sd-name").val() || "",
            currentTopicUrl(),
            $("#sd-reason").val() || "",
            CadminApi.selectValue("#sd-org") || "",
            $("#sd-channel-type").val() || "",
            $("#sd-endpoint").val() || "",
            $("#sd-content").val() || "",
            $("#sd-content-type").val() || "",
            $("#sd-heartbeat").val() || "",
            $("#sd-timeout").val() || "",
            $("#sd-max-count").val() || "",
            $("#sd-end").val() || ""
        ].join("\n");
    }

    function formsAreDirty() {
        return !!savedForms && formsSnapshot() !== savedForms;
    }

    function syncUnsavedFlag() {
        const root = window.CadminWorkspace ? CadminWorkspace.root() : document;
        CadminApi.setUnsavedFlag(root, formsAreDirty());
    }

    function markFormsClean() {
        savedForms = formsSnapshot();
        syncUnsavedFlag();
    }

    function renderHeader() {
        const label = subscriptionName();
        $("#sd-title").text(label);
        $("#sd-crumb").text(label);
        $("#sd-status-badge").html(statusDisplay());
        if (subscription.id) {
            $("#sd-fhir-id").text(subscription.id).removeClass("d-none");
        } else {
            $("#sd-fhir-id").text("").addClass("d-none");
        }
        $("#sd-error-note").toggleClass("d-none", subscription.status !== "error");
        const status = subscription.status;
        let toggle = "";
        if (status === "off" || status === "error") {
            toggle = '<button class="btn btn-outline-primary" type="button" id="sd-toggle" data-next="requested">' +
                '<i class="bi bi-play-circle me-1"></i>Play</button>';
        } else if (status !== "entered-in-error") {
            toggle = '<button class="btn btn-outline-secondary" type="button" id="sd-toggle" data-next="off">' +
                '<i class="bi bi-stop-circle me-1"></i>Stop</button>';
        }
        $("#sd-toggle-slot").html(toggle);
    }

    function updateTopicLink() {
        const $link = $("#sd-topic-open");
        if (topicResource && topicResource.id) {
            $link.attr("href", "#/subscription-topics/" + encodeURIComponent(topicResource.id))
                .removeClass("d-none");
        } else {
            $link.addClass("d-none").removeAttr("href");
        }
    }

    function fillBasicsForm() {
        $("#sd-name").val(subscription.name || "");
        $("#sd-reason").val(subscription.reason || "");
        setTopicSelectValue(subscription.topic || "");
        updateTopicLink();
    }

    function fillChannelForm() {
        $("#sd-channel-type").val((subscription.channelType && subscription.channelType.code) || "rest-hook");
        $("#sd-endpoint").val(subscription.endpoint || "");
        $("#sd-content").val(subscription.content || "id-only");
        $("#sd-content-type").val(subscription.contentType || "application/fhir+json");
        $("#sd-heartbeat").val(subscription.heartbeatPeriod != null ? subscription.heartbeatPeriod : "");
        $("#sd-timeout").val(subscription.timeout != null ? subscription.timeout : "");
        $("#sd-max-count").val(subscription.maxCount != null ? subscription.maxCount : "");
        $("#sd-end").val(toLocalInput(subscription.end));
    }

    function renderFilters() {
        const filters = subscription.filterBy || [];
        const allowed = topicFilters();
        const $add = $("#sd-filter-rows-add");
        if (topicResource && !allowed.length) {
            $add.prop("disabled", true).attr("title", "This topic does not define filter parameters.");
        } else if (!subscription.topic) {
            $add.prop("disabled", true).attr("title", "Select a topic before adding filters.");
        } else {
            $add.prop("disabled", false).removeAttr("title");
        }
        if (!filters.length) {
            $("#sd-filter-rows").html(emptyRow(4, allowed.length
                ? "No filters. Notifications match the whole topic."
                : "No filters. Topic canFilterBy defines which parameters are allowed."));
            return;
        }
        $("#sd-filter-rows").html(filters.map(function (item, index) {
            const cmp = [item.comparator, item.modifier].filter(Boolean).join(" / ") || "—";
            return "<tr>" +
                "<td><code>" + esc(item.filterParameter || "—") + "</code>" +
                    (item.resource ? ' <span class="text-muted">' + esc(item.resource) + "</span>" : "") + "</td>" +
                "<td>" + esc(cmp) + "</td>" +
                "<td><code>" + esc(item.value || "—") + "</code></td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-filter="' +
                    index + '" title="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderParameters() {
        const params = subscription.parameter || [];
        if (!params.length) {
            $("#sd-param-rows").html(emptyRow(3, "No channel parameters (for example Authorization headers)."));
            return;
        }
        $("#sd-param-rows").html(params.map(function (item, index) {
            return "<tr>" +
                "<td><code>" + esc(item.name || "—") + "</code></td>" +
                "<td><code>" + esc(item.value || "—") + "</code></td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-param="' +
                    index + '" title="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function loadTopic() {
        if (!subscription.topic) {
            return;
        }
        CadminApi.fhir("/SubscriptionTopic?url=" + encodeURIComponent(subscription.topic) + "&_count=1")
            .done(function (bundle) {
                topicResource = CadminApi.bundleResources(bundle, "SubscriptionTopic")[0] || null;
                updateTopicLink();
                renderFilters();
            });
    }

    function topicPickerItem(topic) {
        return {
            url: topic.url || "",
            name: topic.title || topic.name || topic.url || topic.id || "Untitled",
            status: topic.status || ""
        };
    }

    function topicPickerOptionHtml(item, escape) {
        return '<div class="d-flex justify-content-between align-items-center gap-2">' +
            '<span class="text-truncate">' + escape(item.name) + "</span>" +
            (item.status
                ? '<span class="flex-shrink-0">' + CadminWorkflow.publicationBadge(item.status) + "</span>"
                : "") +
            "</div>";
    }

    function setTopicSelectValue(url) {
        const el = document.getElementById("sd-topic");
        if (el && el.tomselect) {
            if (url && !el.tomselect.options[url]) {
                el.tomselect.addOption({ url: url, name: url, status: "" });
            }
            el.tomselect.setValue(url || "", true);
            return;
        }
        if ($("#sd-topic option").length > 1) {
            $("#sd-topic").val(url || "");
        }
    }

    function fillTopicSelect(preferredUrl) {
        const $select = $("#sd-topic");
        CadminApi.destroySelect("#sd-topic");
        $select.html('<option value="">Loading topics…</option>');
        CadminApi.fhir("/SubscriptionTopic?_count=200&_sort=title").done(function (bundle) {
            const topics = CadminApi.bundleResources(bundle, "SubscriptionTopic").map(topicPickerItem)
                .filter(function (item) { return item.url; });
            if (!topics.length) {
                $select.html('<option value="">No topics found</option>');
                return;
            }
            if (preferredUrl && !topics.some(function (item) { return item.url === preferredUrl; })) {
                topics.unshift({ url: preferredUrl, name: preferredUrl, status: "" });
            }
            $select.empty();
            const ts = new TomSelect("#sd-topic", {
                valueField: "url",
                labelField: "name",
                searchField: ["name", "url", "status"],
                options: topics,
                items: preferredUrl ? [preferredUrl] : [],
                maxItems: 1,
                persist: false,
                create: false,
                allowEmptyOption: false,
                placeholder: "Select topic…",
                dropdownParent: "body",
                render: {
                    option: topicPickerOptionHtml,
                    item: topicPickerOptionHtml
                }
            });
            ts.on("change", syncUnsavedFlag);
            syncUnsavedFlag();
        }).fail(function () {
            $select.html('<option value="' + esc(preferredUrl || "") + '">' +
                esc(preferredUrl || "Unable to load topics") + "</option>");
        });
    }

    function fillOrgSelect(selectedId) {
        CadminApi.bindOrganizationSelect("#sd-org", {
            placeholder: "None",
            selectedId: selectedId || "",
            selectedLabel: selectedId ? refLabel(subscription.managingEntity) : ""
        });
    }

    function applyFilterDef() {
        const def = filterDef($("#sd-fp-name").val());
        $("#sd-fp-resource").val(def && def.resource ? def.resource : "");
        const comparators = (def && def.comparator && def.comparator.length)
            ? def.comparator.map(function (code) {
                return { code: code, display: CadminApi.valueSetDisplay(comparatorOptions, code) };
            })
            : comparatorOptions;
        const modifiers = (def && def.modifier && def.modifier.length)
            ? def.modifier.map(function (code) {
                return { code: code, display: CadminApi.valueSetDisplay(modifierOptions, code) };
            })
            : modifierOptions;
        $("#sd-fp-cmp").html('<option value="">None</option>' + optionsHtml(comparators));
        $("#sd-fp-mod").html('<option value="">None</option>' + optionsHtml(modifiers));
    }

    function parseUnsigned(selector) {
        const raw = $(selector).val().trim();
        if (!raw) {
            return null;
        }
        const value = Number(raw);
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
    }

    function connectionTypeCode(endpoint) {
        const item = Array.isArray(endpoint && endpoint.connectionType)
            ? endpoint.connectionType[0]
            : (endpoint && endpoint.connectionType);
        const coding = (item && item.coding && item.coding[0]) || item || {};
        return coding.code || "";
    }

    function channelCodeFromEndpoint(endpoint) {
        const code = connectionTypeCode(endpoint);
        const mapped = {
            "hl7-fhir-rest": "rest-hook",
            "rest-hook": "rest-hook",
            "hl7-fhir-msg": "message",
            message: "message",
            "secure-email": "email",
            "direct-project": "email",
            email: "email",
            websocket: "websocket",
            "hl7v2-mllp": "message"
        }[code];
        if (mapped) {
            return mapped;
        }
        const address = String((endpoint && endpoint.address) || "");
        if (/^mailto:/i.test(address)) {
            return "email";
        }
        if (/^wss?:/i.test(address)) {
            return "websocket";
        }
        return (subscription.channelType && subscription.channelType.code) || "rest-hook";
    }

    function mimeFromEndpoint(endpoint) {
        const payloads = (endpoint && endpoint.payload) || [];
        for (let i = 0; i < payloads.length; i += 1) {
            const mime = (payloads[i].mimeType || [])[0];
            if (mime) {
                return mime;
            }
        }
        return "";
    }

    function contentFromEndpoint(endpoint) {
        const payloads = (endpoint && endpoint.payload) || [];
        const type = CadminApi.conceptCode(payloads[0] && payloads[0].type);
        if (type === "none") {
            return "empty";
        }
        return subscription.content || "id-only";
    }

    function parametersFromEndpoint(endpoint) {
        return ((endpoint && endpoint.header) || []).map(function (line) {
            const text = String(line || "");
            const index = text.indexOf(":");
            if (index < 0) {
                return { name: text.trim(), value: "" };
            }
            return {
                name: text.slice(0, index).trim(),
                value: text.slice(index + 1).trim()
            };
        }).filter(function (item) {
            return item.name;
        });
    }

    function applyChannelInputs(ids, extra) {
        const channel = channelTypes.find(function (option) {
            return option.code === $(ids.type).val();
        }) || channelTypes[0];
        subscription.channelType = {
            system: channel.system || "http://terminology.hl7.org/CodeSystem/subscription-channel-type",
            code: channel.code,
            display: channel.display
        };
        const endpoint = $(ids.endpoint).val().trim();
        const content = $(ids.content).val();
        const contentType = $(ids.contentType).val().trim();
        const heartbeat = parseUnsigned(ids.heartbeat);
        const timeout = parseUnsigned(ids.timeout);
        const maxCount = parseUnsigned(ids.maxCount);
        const end = fromLocalInput($(ids.end).val());
        if (endpoint) { subscription.endpoint = endpoint; } else { delete subscription.endpoint; }
        if (content) { subscription.content = content; } else { delete subscription.content; }
        if (contentType) { subscription.contentType = contentType; } else { delete subscription.contentType; }
        if (heartbeat != null) { subscription.heartbeatPeriod = heartbeat; } else { delete subscription.heartbeatPeriod; }
        if (timeout != null) { subscription.timeout = timeout; } else { delete subscription.timeout; }
        if (maxCount != null && maxCount >= 1) { subscription.maxCount = maxCount; } else { delete subscription.maxCount; }
        if (end) { subscription.end = end; } else { delete subscription.end; }
        if (extra && extra.parameters) {
            if (extra.parameters.length) {
                subscription.parameter = extra.parameters;
            } else {
                delete subscription.parameter;
            }
        }
    }

    function showImportStep(step) {
        importStep = step;
        CadminApi.showAlert("#sd-imp-alert");
        $("#sd-channel-import-modal [data-imp-pane]").addClass("d-none");
        $("#sd-channel-import-modal [data-imp-pane=\"" + step + "\"]").removeClass("d-none");
        $("#sd-imp-steps .npi-wizard-step").each(function () {
            const value = Number($(this).attr("data-imp-step"));
            $(this).toggleClass("active", value === step);
            $(this).toggleClass("done", value < step);
        });
        $("#sd-imp-back").toggleClass("d-none", step === 1);
        $("#sd-imp-next").toggleClass("d-none", step !== 1);
        $("#sd-imp-save").toggleClass("d-none", step !== 2);
    }

    function resetImportWizard() {
        importStep = 1;
        importParameters = null;
        $("#sd-imp-param-note").text("");
        CadminApi.showAlert("#sd-imp-alert");
        CadminApi.destroySelect("#sd-imp-endpoint");
        CadminApi.bindFhirSelect("#sd-imp-endpoint", "Endpoint", {
            placeholder: "Select endpoint…"
        });
        showImportStep(1);
    }

    function fillImportChannel(endpoint) {
        const type = channelCodeFromEndpoint(endpoint);
        const mime = mimeFromEndpoint(endpoint);
        const content = contentFromEndpoint(endpoint);
        const end = (endpoint.period && endpoint.period.end) || subscription.end;
        $("#sd-imp-type").val(type);
        $("#sd-imp-url").val(endpoint.address || "");
        $("#sd-imp-content").val(content);
        $("#sd-imp-content-type").val(mime || subscription.contentType || "application/fhir+json");
        $("#sd-imp-heartbeat").val(subscription.heartbeatPeriod != null ? subscription.heartbeatPeriod : "");
        $("#sd-imp-timeout").val(subscription.timeout != null ? subscription.timeout : "");
        $("#sd-imp-max-count").val(subscription.maxCount != null ? subscription.maxCount : "");
        $("#sd-imp-end").val(toLocalInput(end));
        importParameters = parametersFromEndpoint(endpoint);
        if (importParameters.length) {
            $("#sd-imp-param-note").text(
                importParameters.length === 1
                    ? "One header from this endpoint will replace the subscription channel parameters."
                    : importParameters.length + " headers from this endpoint will replace the subscription channel parameters."
            );
        } else {
            $("#sd-imp-param-note").text("This endpoint has no headers. Existing channel parameters are left unchanged.");
            importParameters = null;
        }
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".subdetail");

        $root.on("shown.bs.tab.subdetail", "#sd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });

        $root.on("input.subdetail change.subdetail", "#sd-basic-form :input, #sd-channel-form :input",
            syncUnsavedFlag);

        $root.on("click.subdetail", "#sd-toggle", function () {
            const next = $(this).attr("data-next");
            const starting = next === "requested";
            if (next !== "off" && !starting) {
                return;
            }
            CadminApi.confirm({
                title: starting ? "Start this subscription?" : "Stop this subscription?",
                confirmText: starting ? "Play" : "Stop"
            }).done(function () {
                if (starting) {
                    subscription.status = "requested";
                    saveSubscription(function () {
                        CadminApi.showToast("success", "Subscription started.");
                        startStatusPoll();
                    });
                    return;
                }
                stopStatusPoll();
                subscription.status = "off";
                saveSubscription(function () {
                    CadminApi.showToast("success", "Subscription stopped.");
                });
            });
        });

        $root.on("click.subdetail", "#sd-delete", function () {
            CadminApi.confirm("Delete this subscription?").done(function () {
                CadminApi.fhir("/Subscription/" + encodeURIComponent(subscription.id), "DELETE").done(function () {
                    stopStatusPoll();
                    CadminApi.showToast("success", "Subscription deleted.");
                    window.location.hash = "#/subscriptions";
                }).fail(function (xhr) {
                    fail("Delete subscription", xhr);
                });
            });
        });

        $("#sd-filter-modal").on("show.bs.modal", function () {
            const allowed = topicFilters();
            if (!allowed.length) {
                $("#sd-fp-name").html('<option value="">This topic has no canFilterBy parameters</option>');
                return;
            }
            $("#sd-fp-name").html(allowed.map(function (item) {
                return '<option value="' + esc(item.filterParameter) + '">' +
                    esc(item.filterParameter) +
                    (item.description ? " — " + item.description : "") +
                    "</option>";
            }).join(""));
            $("#sd-fp-value").val("");
            applyFilterDef();
        });

        $("#sd-fp-name").on("change", applyFilterDef);

        $("#sd-basic-form").on("submit", function (event) {
            event.preventDefault();
            const name = $("#sd-name").val().trim();
            const reason = $("#sd-reason").val().trim();
            const topic = $("#sd-topic").val();
            const orgId = CadminApi.selectValue("#sd-org");
            if (!topic) {
                CadminApi.showToast("danger", "Select a subscription topic.");
                return;
            }
            if (name) { subscription.name = name; } else { delete subscription.name; }
            if (reason) { subscription.reason = reason; } else { delete subscription.reason; }
            subscription.topic = topic;
            if (orgId) {
                subscription.managingEntity = {
                    reference: "Organization/" + orgId,
                    display: CadminApi.selectLabel("#sd-org")
                };
            } else {
                delete subscription.managingEntity;
            }
            saveSubscription(function () {
                CadminApi.showToast("success", "Subscription updated.");
                loadTopic();
            });
        });

        $("#sd-channel-form").on("submit", function (event) {
            event.preventDefault();
            applyChannelInputs({
                type: "#sd-channel-type",
                endpoint: "#sd-endpoint",
                content: "#sd-content",
                contentType: "#sd-content-type",
                heartbeat: "#sd-heartbeat",
                timeout: "#sd-timeout",
                maxCount: "#sd-max-count",
                end: "#sd-end"
            });
            saveSubscription(function () {
                CadminApi.showToast("success", "Channel updated.");
            });
        });

        $("#sd-channel-import-modal").on("show.bs.modal", resetImportWizard);
        $("#sd-channel-import-modal").on("hidden.bs.modal", function () {
            CadminApi.destroySelect("#sd-imp-endpoint");
            importParameters = null;
        });

        $("#sd-imp-next").on("click", function () {
            const endpointId = CadminApi.selectValue("#sd-imp-endpoint");
            if (!endpointId) {
                CadminApi.showAlert("#sd-imp-alert", "danger", "Select an endpoint to continue.");
                return;
            }
            const $next = $("#sd-imp-next").prop("disabled", true);
            CadminApi.fhir("/Endpoint/" + encodeURIComponent(endpointId)).done(function (endpoint) {
                fillImportChannel(endpoint || {});
                showImportStep(2);
            }).fail(function (xhr) {
                CadminApi.showAlert("#sd-imp-alert", "danger",
                    "Unable to load endpoint" + (xhr && xhr.status ? " (" + xhr.status + ")" : "") + ".");
            }).always(function () {
                $next.prop("disabled", false);
            });
        });

        $("#sd-imp-back").on("click", function () {
            showImportStep(1);
        });

        $("#sd-imp-save").on("click", function () {
            applyChannelInputs({
                type: "#sd-imp-type",
                endpoint: "#sd-imp-url",
                content: "#sd-imp-content",
                contentType: "#sd-imp-content-type",
                heartbeat: "#sd-imp-heartbeat",
                timeout: "#sd-imp-timeout",
                maxCount: "#sd-imp-max-count",
                end: "#sd-imp-end"
            }, importParameters ? { parameters: importParameters } : null);
            saveSubscription(function () {
                hideModal("sd-channel-import-modal");
                CadminApi.showToast("success", "Channel imported from endpoint.");
            });
        });

        $("#sd-filter-form").on("submit", function (event) {
            event.preventDefault();
            const allowed = topicFilters();
            const name = $("#sd-fp-name").val();
            if (!name || !allowed.length) {
                CadminApi.showToast("danger", "Choose a filter parameter defined by the topic.");
                return;
            }
            const filter = { filterParameter: name, value: $("#sd-fp-value").val().trim() };
            const resource = $("#sd-fp-resource").val().trim();
            const comparator = $("#sd-fp-cmp").val();
            const modifier = $("#sd-fp-mod").val();
            if (resource) { filter.resource = resource; }
            if (comparator) { filter.comparator = comparator; }
            if (modifier) { filter.modifier = modifier; }
            subscription.filterBy = subscription.filterBy || [];
            subscription.filterBy.push(filter);
            saveSubscription(function () {
                hideModal("sd-filter-modal");
                CadminApi.showToast("success", "Filter added.");
            });
        });

        $("#sd-param-form").on("submit", function (event) {
            event.preventDefault();
            const param = {
                name: $("#sd-pn-name").val().trim(),
                value: $("#sd-pn-value").val().trim()
            };
            subscription.parameter = subscription.parameter || [];
            subscription.parameter.push(param);
            saveSubscription(function () {
                hideModal("sd-param-modal");
                $("#sd-pn-name").val("");
                $("#sd-pn-value").val("");
                CadminApi.showToast("success", "Channel parameter added.");
            });
        });

        $root.on("click.subdetail", "[data-remove-filter]", function () {
            const index = Number($(this).attr("data-remove-filter"));
            subscription.filterBy = (subscription.filterBy || []).filter(function (_item, i) { return i !== index; });
            if (!subscription.filterBy.length) {
                delete subscription.filterBy;
            }
            saveSubscription(function () {
                CadminApi.showToast("success", "Filter removed.");
            });
        });

        $root.on("click.subdetail", "[data-remove-param]", function () {
            const index = Number($(this).attr("data-remove-param"));
            subscription.parameter = (subscription.parameter || []).filter(function (_item, i) { return i !== index; });
            if (!subscription.parameter.length) {
                delete subscription.parameter;
            }
            saveSubscription(function () {
                CadminApi.showToast("success", "Channel parameter removed.");
            });
        });
    }

    return { render: render, reveal: reveal };
}());
