window.CadminActivityDefinitionDetail = (function () {
    let activity = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function questionnaireUrl() {
        const artifacts = activity.relatedArtifact || [];
        for (let i = 0; i < artifacts.length; i++) {
            if (artifacts[i] && artifacts[i].type === "depends-on" && artifacts[i].resource) {
                return artifacts[i].resource;
            }
        }
        return "";
    }

    function renderHeader() {
        $("#add-title").text(activity.title || activity.name || "Activity definition");
    }

    function renderBasics() {
        $("#add-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    CadminWorkflow.publicationBadge(activity.status) + "</dd>" +
                '<dt class="col-sm-3">Kind</dt><dd class="col-sm-9">' + esc(activity.kind || "—") + "</dd>" +
                '<dt class="col-sm-3">Code</dt><dd class="col-sm-9">' +
                    esc(CadminWorkflow.conceptCode(activity.code) || "—") + "</dd>" +
                '<dt class="col-sm-3">URL</dt><dd class="col-sm-9"><code>' + esc(activity.url || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Questionnaire</dt><dd class="col-sm-9"><code>' +
                    esc(questionnaireUrl() || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' + esc(activity.description || "—") + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(activity.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function populateForm() {
        $("#add-title-input").val(activity.title || "");
        $("#add-name").val(activity.name || "");
        $("#add-url").val(activity.url || "");
        $("#add-description").val(activity.description || "");
        $("#add-status").val(activity.status || "active");
        $("#add-kind").val(activity.kind || "Task");
        $("#add-code").val(CadminWorkflow.conceptCode(activity.code));
        $("#add-questionnaire").val(questionnaireUrl());
    }

    function save() {
        activity.title = $("#add-title-input").val().trim() || activity.title;
        activity.status = $("#add-status").val() || "draft";
        activity.kind = $("#add-kind").val() || activity.kind;
        const name = $("#add-name").val().trim();
        const url = $("#add-url").val().trim();
        const description = $("#add-description").val().trim();
        const code = $("#add-code").val().trim();
        const questionnaire = $("#add-questionnaire").val().trim();
        if (name) {
            activity.name = name;
        } else {
            delete activity.name;
        }
        if (url) {
            activity.url = url;
        } else {
            delete activity.url;
        }
        if (description) {
            activity.description = description;
        } else {
            delete activity.description;
        }
        if (code) {
            activity.code = { coding: [{ system: "https://cadmin.io/fhir/CodeSystem/schedule-task", code: code }] };
        } else {
            delete activity.code;
        }
        if (questionnaire) {
            activity.relatedArtifact = [{ type: "depends-on", resource: questionnaire }];
        } else {
            delete activity.relatedArtifact;
        }
        CadminApi.fhir("/ActivityDefinition/" + encodeURIComponent(activity.id), "PUT", activity).done(function (updated) {
            activity = updated || activity;
            hideModal("add-edit-modal");
            renderHeader();
            renderBasics();
            CadminResourceSource.mount(function () { return activity; });
            CadminResourceGraph.mount(activity);
            CadminApi.showToast("success", "Activity updated.");
        });
    }

    function render(resource) {
        activity = resource;
        $(CadminWorkspace.root()).html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/activity-definitions">' +
                        '<i class="bi bi-arrow-left me-1"></i>Activity definitions</a>' +
                    '<h1 class="h3 mb-0 page-title" id="add-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="add-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Activity</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#add-edit-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="add-basics"></div>' +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="add-edit-modal" tabindex="-1">' +
                '<div class="modal-dialog"><form class="modal-content" id="add-edit-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Edit activity</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Title</label>' +
                            '<input class="form-control" id="add-title-input"></div>' +
                        '<div class="mb-3"><label class="form-label">Name</label>' +
                            '<input class="form-control font-monospace" id="add-name"></div>' +
                        '<div class="mb-3"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="add-status">' +
                                CadminWorkflow.optionsHtml(CadminWorkflow.publication, activity.status) +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label">Kind</label>' +
                            '<select class="form-select" id="add-kind">' +
                                CadminWorkflow.optionsHtml(CadminWorkflow.kinds, activity.kind) +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label">Code</label>' +
                            '<input class="form-control" id="add-code"></div>' +
                        '<div class="mb-3"><label class="form-label">URL</label>' +
                            '<input class="form-control font-monospace" id="add-url"></div>' +
                        '<div class="mb-3"><label class="form-label">Questionnaire URL</label>' +
                            '<input class="form-control font-monospace" id="add-questionnaire" placeholder="https://…/Questionnaire/intake"></div>' +
                        '<div class="mb-0"><label class="form-label">Description</label>' +
                            '<textarea class="form-control" id="add-description" rows="2"></textarea></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form></div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return activity; });
        CadminResourceGraph.mount(activity);
        CadminResourceHistory.mount(activity);
        renderHeader();
        renderBasics();
        const $root = $(CadminWorkspace.root());
        $root.off(".activitydetail");
        $("#add-edit-modal").on("show.bs.modal", populateForm);
        $("#add-edit-form").on("submit", function (event) {
            event.preventDefault();
            save();
        });
        $root.on("click.activitydetail", "#add-delete", function () {
            CadminApi.confirm("Delete this activity?").done(function () {
                CadminApi.fhir("/ActivityDefinition/" + encodeURIComponent(activity.id), "DELETE").done(function () {
                    CadminApi.showToast("success", "Activity deleted.");
                    window.location.hash = "#/activity-definitions";
                });
            });
        });
    }

    return { render: render };
}());
