window.CadminRequestOrchestrationDetail = (function () {
    let orchestration = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function actionStatus(action) {
        return CadminWorkflow.extensionValue(action, "https://cadmin.io/fhir/StructureDefinition/action-status");
    }

    function actionDue(action) {
        return CadminWorkflow.extensionValue(action, "https://cadmin.io/fhir/StructureDefinition/action-due");
    }

    function renderHeader() {
        const plan = ((orchestration.instantiatesCanonical || [])[0] || "").split("/").pop();
        $("#rod-title").text(plan || orchestration.id || "Request orchestration");
    }

    function renderBasics() {
        const plan = (orchestration.instantiatesCanonical || [])[0] || "—";
        const based = ((orchestration.basedOn || [])[0] || {}).reference || "—";
        $("#rod-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    CadminWorkflow.requestBadge(orchestration.status) + "</dd>" +
                '<dt class="col-sm-3">Plan</dt><dd class="col-sm-9"><code>' + esc(plan) + "</code></dd>" +
                '<dt class="col-sm-3">Subject</dt><dd class="col-sm-9">' +
                    CadminScheduling.refHtml(orchestration.subject) + "</dd>" +
                '<dt class="col-sm-3">Based on</dt><dd class="col-sm-9">' + esc(based) + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(orchestration.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function renderActions() {
        const actions = orchestration.action || [];
        if (!actions.length) {
            $("#rod-action-rows").html('<tr><td colspan="5" class="text-muted">No actions on this run.</td></tr>');
            return;
        }
        $("#rod-action-rows").html(actions.map(function (action) {
            const status = actionStatus(action);
            const resource = action.resource && action.resource.reference;
            const advance = status === "in-progress"
                ? '<button class="btn btn-sm btn-outline-primary" type="button" data-advance="' +
                    esc(action.linkId || "") + '">Complete</button>'
                : "";
            return "<tr>" +
                "<td><code>" + esc(action.linkId || "—") + "</code></td>" +
                "<td>" + esc(action.title || CadminWorkflow.conceptCode(action.code) || "—") + "</td>" +
                "<td>" + CadminWorkflow.actionBadge(status) +
                    (actionDue(action) ? '<div class="small text-muted">' + esc(actionDue(action)) + "</div>" : "") +
                "</td>" +
                "<td>" + (resource ? esc(resource) : "—") + "</td>" +
                '<td class="text-end">' + advance + "</td></tr>";
        }).join(""));
    }

    function loadTasks() {
        CadminApi.fhir("/Task?based-on=RequestOrchestration/" + encodeURIComponent(orchestration.id) +
            "&_sort=-_lastUpdated&_count=20").done(function (bundle) {
            const tasks = CadminApi.bundleResources(bundle, "Task");
            if (!tasks.length) {
                $("#rod-task-rows").html('<tr><td colspan="4" class="text-muted">No tasks created by this run.</td></tr>');
                return;
            }
            $("#rod-task-rows").html(tasks.map(function (task) {
                return "<tr>" +
                    "<td>" + esc(CadminWorkflow.conceptCode(task.code) || task.description || task.id) + "</td>" +
                    "<td>" + CadminWorkflow.actionBadge(task.status) + "</td>" +
                    "<td>" + esc((task.focus && task.focus.reference) || "—") + "</td>" +
                    "<td><code>" + esc(task.id) + "</code></td></tr>";
            }).join(""));
        }).fail(function () {
            $("#rod-task-rows").html('<tr><td colspan="4" class="text-muted">Unable to load tasks.</td></tr>');
        });
    }

    function refresh(body) {
        const updated = CadminFhirChief.resourceParam(body, "return") || orchestration;
        orchestration = updated;
        renderHeader();
        renderBasics();
        renderActions();
        loadTasks();
        CadminResourceSource.mount(function () { return orchestration; });
        CadminResourceGraph.mount(orchestration);
    }

    function render(resource) {
        orchestration = resource;
        $(CadminWorkspace.root()).html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/request-orchestrations">' +
                        '<i class="bi bi-arrow-left me-1"></i>Request orchestrations</a>' +
                    '<h1 class="h3 mb-0 page-title" id="rod-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="rod-cancel">' +
                        '<i class="bi bi-x-circle me-1"></i>Cancel run</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div id="rod-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Run</h6></div>' +
                '<div class="card-body" id="rod-basics"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Actions</h6></div>' +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Link</th><th>Title</th><th>Status</th><th>Work item</th><th></th></tr></thead>" +
                        '<tbody id="rod-action-rows"></tbody>' +
                    "</table></div></div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Tasks</h6></div>' +
                '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Code</th><th>Status</th><th>Focus</th><th>ID</th></tr></thead>" +
                        '<tbody id="rod-task-rows"><tr><td colspan="4" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table></div></div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card()
        );
        CadminResourceSource.mount(function () { return orchestration; });
        CadminResourceGraph.mount(orchestration);
        CadminResourceHistory.mount(orchestration);
        renderHeader();
        renderBasics();
        renderActions();
        loadTasks();
        const $root = $(CadminWorkspace.root());
        $root.off(".orchdetail");
        $root.on("click.orchdetail", "[data-advance]", function () {
            const linkId = $(this).attr("data-advance");
            CadminFhirChief.advance(orchestration.id, { action: linkId }).done(function (body) {
                CadminApi.showToast("success", "Action completed.");
                refresh(body);
            }).fail(function (xhr) {
                CadminApi.showAlert("#rod-alert", "danger",
                    "Advance failed (" + xhr.status + "). Is FHIR Chief running on port 8380?");
            });
        });
        $root.on("click.orchdetail", "#rod-cancel", function () {
            CadminApi.confirm("Cancel this plan run and open work items?").done(function () {
                CadminFhirChief.cancelPlan(orchestration.id).done(function (body) {
                    CadminApi.showToast("success", "Run cancelled.");
                    refresh(body);
                }).fail(function (xhr) {
                    CadminApi.showAlert("#rod-alert", "danger",
                        "Cancel failed (" + xhr.status + "). Is FHIR Chief running on port 8380?");
                });
            });
        });
    }

    return { render: render };
}());
