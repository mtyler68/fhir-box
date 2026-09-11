window.CadminRateLimitTierDetail = (function () {
    const Plan = window.CadminRateLimitPlan;
    let documentRef = null;
    let sourceLibrary = null;
    let editor = null;
    let savedPlan = "";
    let savedBasics = "";

    function esc(value) {
        return CadminApi.escapeHtml(value);
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
        return Plan.field(label, control, hint);
    }

    function orgIdOf() {
        const ref = Plan.organizationRefOf(documentRef);
        return (ref && ref.id) || "";
    }

    function orgHref() {
        const id = orgIdOf();
        return id ? "#/organizations/" + encodeURIComponent(id) : "#/organizations";
    }

    function orgLabel() {
        const ref = Plan.organizationRefOf(documentRef);
        return (ref && (ref.display || ref.id)) || "Organization";
    }

    function tierTitle() {
        return Plan.documentTitle(documentRef);
    }

    function statusBadge() {
        if (Plan.isActiveTier(documentRef)) {
            return '<span class="badge text-bg-success">Active</span>';
        }
        return '<span class="badge text-bg-secondary">Inactive</span>';
    }

    function remember() {
        if (window.CadminWorkspace && typeof CadminWorkspace.rememberResource === "function") {
            CadminWorkspace.rememberResource(documentRef);
        }
    }

    function basicsSnapshot() {
        return ($("#rlt-title-input").val() || "") + "\n" + (documentRef && documentRef.status || "");
    }

    function syncUnsavedFlag() {
        const pretty = editor ? editor.pretty() : "";
        const dirty = pretty !== savedPlan || basicsSnapshot() !== savedBasics;
        CadminApi.setUnsavedFlag(CadminWorkspace.root(), dirty);
    }

    function markClean() {
        savedPlan = editor ? editor.pretty() : "";
        savedBasics = basicsSnapshot();
        syncUnsavedFlag();
    }

    function destroyEditor() {
        if (editor) {
            editor.destroy($(CadminWorkspace.root()), "rltdetail");
            editor = null;
        }
    }

    function loadSourceLibrary() {
        const source = Plan.sourceLibraryRef(documentRef);
        if (!source) {
            sourceLibrary = null;
            return $.Deferred().resolve(null).promise();
        }
        return CadminApi.fhir("/Library/" + encodeURIComponent(source.id), "GET", null, { silent: true })
            .done(function (library) {
                sourceLibrary = library;
            })
            .fail(function () {
                sourceLibrary = null;
            });
    }

    function renderHeader() {
        $("#rlt-title").text(tierTitle());
        $("#rlt-status-badge").html(statusBadge());
        $("#rlt-origin-badge").html(Plan.originLabelHtml(documentRef, sourceLibrary));
        if (documentRef.id) {
            $("#rlt-fhir-id").text(documentRef.id).removeClass("d-none");
        }
        remember();
    }

    function fillBasicsForm() {
        $("#rlt-title-input").val(documentRef.description || Plan.documentTitle(documentRef) || "");
        const source = Plan.sourceLibraryRef(documentRef);
        if (!source) {
            $("#rlt-derived").html('<span class="text-muted">Not derived</span>');
        } else {
            const name = (sourceLibrary && (sourceLibrary.title || sourceLibrary.name))
                || source.display || source.id;
            $("#rlt-derived").html(CadminApi.resourceLink(
                "#/rate-limit-plans/" + encodeURIComponent(source.id), name));
        }
        $("#rlt-org").html(CadminApi.resourceLink(orgHref(), orgLabel()));
        const clientId = Plan.oidcClientIdOf(documentRef);
        $("#rlt-client-id").html(clientId
            ? "<code>" + esc(clientId) + "</code>"
            : '<span class="text-muted">—</span>');
        const active = Plan.isActiveTier(documentRef);
        $("#rlt-activate").toggleClass("d-none", active);
        $("#rlt-deactivate").toggleClass("d-none", !active);
    }

    function applyBasics() {
        const title = ($("#rlt-title-input").val() || "").trim();
        if (title) {
            documentRef.description = title;
        } else {
            delete documentRef.description;
        }
        const attachment = Plan.findDocumentAttachment(documentRef);
        if (attachment) {
            attachment.title = title || attachment.title || "Rate-limit tier";
        }
    }

    function saveDocument(next, opts) {
        opts = opts || {};
        if (opts.withPlan !== false && editor) {
            const error = editor.validate();
            if (error) {
                CadminApi.showToast("danger", error);
                return;
            }
        }
        const write = function () {
            if (opts.withMeta) {
                applyBasics();
            }
            if (opts.withPlan !== false && editor) {
                Plan.upsertDocumentPlanJson(documentRef, editor.pretty(),
                    documentRef.description || Plan.documentTitle(documentRef));
            }
            documentRef.type = Plan.tierTypeConcept();
            documentRef.category = [Plan.tierTypeConcept()];
            if (orgIdOf()) {
                Plan.setOrganization(documentRef, { id: orgIdOf(), name: orgLabel() });
            }
            documentRef.date = new Date().toISOString();
            CadminApi.fhir("/DocumentReference/" + encodeURIComponent(documentRef.id), "PUT", documentRef)
                .done(function (updated) {
                    documentRef = updated || documentRef;
                    if (editor && opts.withPlan !== false) {
                        editor.loadFromText(Plan.readDocumentPlanText(documentRef), documentRef);
                        editor.render();
                    }
                    renderHeader();
                    fillBasicsForm();
                    CadminResourceSource.mount(function () { return documentRef; });
                    CadminResourceGraph.mount(documentRef);
                    markClean();
                    if (next) {
                        next();
                    }
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Update rate-limit tier failed (" + xhr.status + ").");
                });
        };
        if (opts.withPlan !== false && editor) {
            const saved = Plan.parsePlanText(savedPlan, documentRef);
            Plan.confirmPolicyBumpIfNeeded(saved, editor.getPlan(), function () {
                editor.bumpPolicyVersion();
            }).done(write).fail(function () { /* cancelled */ });
            return;
        }
        write();
    }

    function setActive(active) {
        const orgId = orgIdOf();
        const work = orgId ? Plan.searchOrgTiers(orgId) : $.Deferred().resolve([]).promise();
        work.then(function (siblings) {
            if (active) {
                return Plan.activateTier(documentRef, siblings);
            }
            documentRef.status = "superseded";
            return CadminApi.fhir("/DocumentReference/" + encodeURIComponent(documentRef.id), "PUT", documentRef);
        }).done(function (updated) {
            documentRef = updated || documentRef;
            renderHeader();
            fillBasicsForm();
            CadminResourceSource.mount(function () { return documentRef; });
            CadminResourceGraph.mount(documentRef);
            markClean();
            CadminApi.showToast("success", active
                ? "This tier is now active. Other assigned tiers were deactivated."
                : "Tier deactivated.");
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update status failed (" + xhr.status + ").");
        });
    }

    function render(resource) {
        destroyEditor();
        if (resource && resource.resourceType === "DocumentReference" && !Plan.isRateLimitTier(resource)) {
            window.location.hash = "#/resources/DocumentReference/" + encodeURIComponent(resource.id);
            return;
        }
        documentRef = resource;
        sourceLibrary = null;
        const $root = $(CadminWorkspace.root());
        editor = Plan.createEditor({
            prefix: "rlt",
            onChange: syncUnsavedFlag
        });
        editor.loadFromText(Plan.readDocumentPlanText(documentRef), documentRef);
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="' + orgHref() + '">' +
                        '<i class="bi bi-arrow-left me-1"></i>' + esc(orgLabel()) + "</a>" +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="rlt-title"></h1>' +
                        '<span id="rlt-status-badge"></span>' +
                        '<span id="rlt-origin-badge"></span>' +
                        (documentRef.id
                            ? '<code class="small" id="rlt-fhir-id">' + esc(documentRef.id) + "</code>"
                            : '<code class="small d-none" id="rlt-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column" id="rlt-settings-nav" role="tablist">' +
                        navButton("rlt-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("rlt-pane-plan", "bi bi-speedometer2", "Plan") +
                        navButton("rlt-pane-summary", "bi bi-clipboard-data", "Summary") +
                        navButton("rlt-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("rlt-pane-history", "bi bi-clock-history", "History") +
                        navButton("rlt-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("rlt-pane-basics",
                            '<form id="rlt-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Assignment</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="rlt-title-input">') +
                                        field("Organization", '<div id="rlt-org"></div>') +
                                        field("OIDC client ID", '<div id="rlt-client-id"></div>') +
                                        field("Derived from", '<div id="rlt-derived"></div>',
                                            "Assigned from a rate-limit plan library, or created as a custom plan.") +
                                        '<div class="d-flex flex-wrap gap-2">' +
                                            '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                            '<button type="button" class="btn btn-outline-success" id="rlt-activate">' +
                                                "Make active</button>" +
                                            '<button type="button" class="btn btn-outline-secondary" id="rlt-deactivate">' +
                                                "Deactivate</button>" +
                                        "</div>" +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("rlt-pane-plan",
                            Plan.planFormHtml("rlt", "assigned organization DocumentReference")) +
                        tabPane("rlt-pane-summary", Plan.summaryHtml("rlt")) +
                        tabPane("rlt-pane-graph", CadminResourceGraph.card()) +
                        tabPane("rlt-pane-history", CadminResourceHistory.card()) +
                        tabPane("rlt-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this rate-limit tier</p>' +
                                            '<small class="text-secondary">' +
                                                "Removes this DocumentReference from the organization. Other assigned tiers are left unchanged." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="rlt-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>" +
            Plan.jsonModalHtml("rlt")
        );
        CadminResourceSource.mount(function () { return documentRef; });
        CadminResourceGraph.mount(documentRef);
        CadminResourceHistory.mount(documentRef);
        fillBasicsForm();
        renderHeader();
        editor.bind($root, "rltdetail");
        editor.render();
        bind();
        markClean();
        loadSourceLibrary().always(function () {
            renderHeader();
            fillBasicsForm();
        });
        editor.loadIcgRoutes().always(function () {
            editor.harvest();
            editor.render();
            savedPlan = editor.pretty();
            syncUnsavedFlag();
        });
    }

    function reveal(resource) {
        if (resource) {
            documentRef = resource;
        }
        if (editor) {
            editor.refreshJson();
            editor.harvest();
            editor.renderSummary();
        }
        syncUnsavedFlag();
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".rltdetailmeta");
        $root.on("shown.bs.tab.rltdetailmeta", "#rlt-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("input.rltdetailmeta change.rltdetailmeta", "#rlt-basic-form :input", syncUnsavedFlag);
        $("#rlt-basic-form").on("submit", function (event) {
            event.preventDefault();
            saveDocument(function () {
                CadminApi.showToast("success", "Rate-limit tier updated.");
            }, { withMeta: true, withPlan: false });
        });
        $("#rlt-plan-form").on("submit", function (event) {
            event.preventDefault();
            saveDocument(function () {
                CadminApi.showToast("success", "Rate-limit tier saved.");
            }, { withPlan: true });
        });
        $root.on("click.rltdetailmeta", "#rlt-activate", function () {
            setActive(true);
        });
        $root.on("click.rltdetailmeta", "#rlt-deactivate", function () {
            setActive(false);
        });
        $root.on("click.rltdetailmeta", "#rlt-delete", function () {
            CadminApi.confirm("Delete this rate-limit tier?").done(function () {
                CadminApi.fhir("/DocumentReference/" + encodeURIComponent(documentRef.id), "DELETE")
                    .done(function () {
                        destroyEditor();
                        CadminApi.showToast("success", "Rate-limit tier deleted.");
                        window.location.hash = orgHref();
                    }).fail(function (xhr) {
                        CadminApi.showToast("danger", "Delete failed (" + xhr.status + ").");
                    });
            });
        });
    }

    return {
        render: render,
        reveal: reveal
    };
}());
