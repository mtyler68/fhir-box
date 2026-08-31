window.CadminPlanDefinitionDetail = (function () {
    let plan = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function renderHeader() {
        $("#pd-title").text(plan.title || plan.name || "Plan definition");
    }

    function renderBasics() {
        $("#pd-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    CadminWorkflow.publicationBadge(plan.status) + "</dd>" +
                '<dt class="col-sm-3">Name</dt><dd class="col-sm-9"><code>' + esc(plan.name || "—") + "</code></dd>" +
                '<dt class="col-sm-3">URL</dt><dd class="col-sm-9"><code>' + esc(plan.url || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Type</dt><dd class="col-sm-9">' +
                    esc(CadminWorkflow.conceptLabel(plan.type)) + "</dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' + esc(plan.description || "—") + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(plan.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function renderActions() {
        const actions = plan.action || [];
        if (!actions.length) {
            $("#pd-action-rows").html('<tr><td colspan="5" class="text-muted">No actions. Add one to instantiate work items.</td></tr>');
            return;
        }
        $("#pd-action-rows").html(actions.map(function (action, index) {
            return "<tr>" +
                "<td><code>" + esc(action.linkId || action.id || String(index + 1)) + "</code></td>" +
                "<td>" + esc(action.title || "—") + "</td>" +
                "<td>" + esc(CadminWorkflow.conceptCode(action.code) || "—") + "</td>" +
                "<td><code class=\"small\">" + esc(CadminWorkflow.conditionExpr(action) || "—") + "</code></td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-action="' +
                    index + '"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function populateForm() {
        $("#pd-title-input").val(plan.title || "");
        $("#pd-name").val(plan.name || "");
        $("#pd-url").val(plan.url || "");
        $("#pd-description").val(plan.description || "");
        $("#pd-status").val(plan.status || "active");
    }

    function saveMeta() {
        plan.title = $("#pd-title-input").val().trim() || plan.title;
        const name = $("#pd-name").val().trim();
        const url = $("#pd-url").val().trim();
        const description = $("#pd-description").val().trim();
        plan.status = $("#pd-status").val() || "draft";
        if (name) {
            plan.name = name;
        } else {
            delete plan.name;
        }
        if (url) {
            plan.url = url;
        } else {
            delete plan.url;
        }
        if (description) {
            plan.description = description;
        } else {
            delete plan.description;
        }
        persist("Plan updated", function () {
            hideModal("pd-edit-modal");
        });
    }

    function persist(message, next) {
        CadminApi.fhir("/PlanDefinition/" + encodeURIComponent(plan.id), "PUT", plan).done(function (updated) {
            plan = updated || plan;
            renderHeader();
            renderBasics();
            renderActions();
            CadminResourceSource.mount(function () { return plan; });
            CadminResourceGraph.mount(plan);
            CadminApi.showToast("success", message);
            if (next) {
                next();
            }
        });
    }

    function addAction() {
        const linkId = $("#pda-link").val().trim();
        const title = $("#pda-title").val().trim();
        const code = $("#pda-code").val().trim();
        if (!linkId || !title || !code) {
            CadminApi.showToast("danger", "Link id, title, and code are required.");
            return;
        }
        const action = { linkId: linkId, title: title, description: title };
        action.code = [{ coding: [{ system: "https://cadmin.io/fhir/CodeSystem/schedule-task", code: code, display: title }] }];
        const condition = $("#pda-condition").val().trim();
        if (condition) {
            action.condition = [{
                kind: "applicability",
                expression: { language: "text/fhirpath", expression: condition }
            }];
        }
        const definition = $("#pda-definition").val().trim();
        if (definition) {
            action.definitionCanonical = definition;
        }
        plan.action = (plan.action || []).concat([action]);
        persist("Action added", function () {
            hideModal("pd-action-modal");
            $("#pd-action-form")[0].reset();
        });
    }

    function render(resource) {
        plan = resource;
        $(CadminWorkspace.root()).html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/plan-definitions">' +
                        '<i class="bi bi-arrow-left me-1"></i>Plan definitions</a>' +
                    '<h1 class="h3 mb-0 page-title" id="pd-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<a class="btn btn-primary" href="#/plan-apply/' + encodeURIComponent(plan.id) + '">' +
                        '<i class="bi bi-play-circle me-1"></i>Apply</a>' +
                    '<button class="btn btn-outline-danger" type="button" id="pd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Plan</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#pd-edit-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="pd-basics"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Actions</h6>' +
                    '<button class="btn btn-sm btn-primary" type="button" data-bs-toggle="modal" data-bs-target="#pd-action-modal">' +
                        '<i class="bi bi-plus-lg me-1"></i>Add action</button>' +
                "</div>" +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Link</th><th>Title</th><th>Code</th><th>Condition</th><th></th></tr></thead>" +
                        '<tbody id="pd-action-rows"></tbody>' +
                    "</table></div></div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="pd-edit-modal" tabindex="-1">' +
                '<div class="modal-dialog"><form class="modal-content" id="pd-edit-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Edit plan</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Title</label>' +
                            '<input class="form-control" id="pd-title-input"></div>' +
                        '<div class="mb-3"><label class="form-label">Name</label>' +
                            '<input class="form-control font-monospace" id="pd-name"></div>' +
                        '<div class="mb-3"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="pd-status">' +
                                CadminWorkflow.optionsHtml(CadminWorkflow.publication, plan.status) +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label">URL</label>' +
                            '<input class="form-control font-monospace" id="pd-url"></div>' +
                        '<div class="mb-0"><label class="form-label">Description</label>' +
                            '<textarea class="form-control" id="pd-description" rows="2"></textarea></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form></div>" +
            "</div>" +
            '<div class="modal fade" id="pd-action-modal" tabindex="-1">' +
                '<div class="modal-dialog"><form class="modal-content" id="pd-action-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Add action</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Link id</label>' +
                            '<input class="form-control font-monospace" id="pda-link" required></div>' +
                        '<div class="mb-3"><label class="form-label">Title</label>' +
                            '<input class="form-control" id="pda-title" required></div>' +
                        '<div class="mb-3"><label class="form-label">Code</label>' +
                            '<input class="form-control" id="pda-code" placeholder="intake, reminder, collect-information" required></div>' +
                        '<div class="mb-3"><label class="form-label">Activity definition URL</label>' +
                            '<input class="form-control font-monospace" id="pda-definition"></div>' +
                        '<div class="mb-0"><label class="form-label">Applicability (FHIRPath)</label>' +
                            '<input class="form-control font-monospace" id="pda-condition" placeholder="status = \'booked\'"></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Add</button>' +
                    "</div>" +
                "</form></div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return plan; });
        CadminResourceGraph.mount(plan);
        CadminResourceHistory.mount(plan);
        renderHeader();
        renderBasics();
        renderActions();
        const $root = $(CadminWorkspace.root());
        $root.off(".plandetetail");
        $("#pd-edit-modal").on("show.bs.modal", populateForm);
        $("#pd-edit-form").on("submit", function (event) {
            event.preventDefault();
            saveMeta();
        });
        $("#pd-action-form").on("submit", function (event) {
            event.preventDefault();
            addAction();
        });
        $root.on("click.plandetetail", "[data-remove-action]", function () {
            const index = parseInt($(this).attr("data-remove-action"), 10);
            plan.action = (plan.action || []).filter(function (_item, i) { return i !== index; });
            if (!plan.action.length) {
                delete plan.action;
            }
            persist("Action removed");
        });
        $root.on("click.plandetetail", "#pd-delete", function () {
            CadminApi.confirm("Delete this plan?").done(function () {
                CadminApi.fhir("/PlanDefinition/" + encodeURIComponent(plan.id), "DELETE").done(function () {
                    CadminApi.showToast("success", "Plan deleted.");
                    window.location.hash = "#/plan-definitions";
                });
            });
        });
    }

    return { render: render };
}());
