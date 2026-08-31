window.CadminAppointmentResponseDetail = (function () {
    let response = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function renderBasics() {
        $("#ard-title").text(CadminScheduling.refLabel(response.actor) + " · " +
            (response.participantStatus || "response"));
        $("#ard-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' +
                    CadminScheduling.statusBadge(response.participantStatus, CadminScheduling.responseStatus) + "</dd>" +
                '<dt class="col-sm-3">Appointment</dt><dd class="col-sm-9">' +
                    CadminScheduling.refHtml(response.appointment) + "</dd>" +
                '<dt class="col-sm-3">Actor</dt><dd class="col-sm-9">' +
                    CadminScheduling.refHtml(response.actor) + "</dd>" +
                '<dt class="col-sm-3">When</dt><dd class="col-sm-9">' +
                    esc(CadminScheduling.windowLabel(response.start, response.end)) + "</dd>" +
                '<dt class="col-sm-3">Comment</dt><dd class="col-sm-9">' + esc(response.comment || "—") + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(response.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function render(resource) {
        response = resource;
        $(CadminWorkspace.root()).html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/appointment-responses">' +
                        '<i class="bi bi-arrow-left me-1"></i>Appointment responses</a>' +
                    '<h1 class="h3 mb-0 page-title" id="ard-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="ard-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Appointment response</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#ard-edit-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="ard-basics"></div>' +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="ard-edit-modal" tabindex="-1">' +
                '<div class="modal-dialog"><form class="modal-content" id="ard-edit-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Edit response</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="ard-status"></select></div>' +
                        '<div class="mb-0"><label class="form-label">Comment</label>' +
                            '<input class="form-control" id="ard-comment"></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form></div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return response; });
        CadminResourceGraph.mount(response);
        CadminResourceHistory.mount(response);
        renderBasics();
        const $root = $(CadminWorkspace.root());
        $root.off(".ardetail");
        $("#ard-edit-modal").on("show.bs.modal", function () {
            CadminApi.fillSelectOptions("#ard-status", CadminScheduling.responseStatus, {
                selected: response.participantStatus || "accepted"
            });
            $("#ard-comment").val(response.comment || "");
        });
        $("#ard-edit-form").on("submit", function (event) {
            event.preventDefault();
            response.participantStatus = $("#ard-status").val() || "accepted";
            const comment = $("#ard-comment").val().trim();
            if (comment) {
                response.comment = comment;
            } else {
                delete response.comment;
            }
            CadminApi.fhir("/AppointmentResponse/" + encodeURIComponent(response.id), "PUT", response)
                .done(function (updated) {
                    response = updated || response;
                    hideModal("ard-edit-modal");
                    renderBasics();
                    CadminResourceSource.mount(function () { return response; });
                    CadminApi.showToast("success", "Response updated.");
                });
        });
        $root.on("click.ardetail", "#ard-delete", function () {
            CadminApi.confirm("Delete this appointment response?").done(function () {
                CadminApi.fhir("/AppointmentResponse/" + encodeURIComponent(response.id), "DELETE").done(function () {
                    CadminApi.showToast("success", "Response deleted.");
                    window.location.hash = "#/appointment-responses";
                });
            });
        });
    }

    return { render: render };
}());
