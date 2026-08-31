CadminApp.register("plan-apply", function (params) {
    CadminPlanApply.render(CadminApi.routeParamId(params));
});

window.CadminPlanApply = (function () {
    function fail(xhr) {
        CadminApi.showAlert("#pa-alert", "danger",
            "Apply failed (" + xhr.status + "). Is FHIR Chief running on port 8380?");
    }

    function valuesFromForm() {
        const values = {};
        const plan = CadminApi.selectValue("#pa-plan");
        const patient = CadminApi.selectValue("#pa-patient");
        const appointment = CadminApi.selectValue("#pa-appointment");
        const slot = CadminApi.selectValue("#pa-slot");
        if (patient) {
            values.subject = { reference: "Patient/" + patient, display: CadminApi.selectLabel("#pa-patient") };
        }
        if (appointment) {
            values.appointment = {
                reference: "Appointment/" + appointment,
                display: CadminApi.selectLabel("#pa-appointment")
            };
        }
        if (slot) {
            values.slot = { reference: "Slot/" + slot, display: CadminApi.selectLabel("#pa-slot") };
        }
        return { planId: plan, values: values };
    }

    function render(planId) {
        const $root = $("#app-content");
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/plan-definitions">' +
                        '<i class="bi bi-arrow-left me-1"></i>Plan definitions</a>' +
                    '<h1 class="h3 mb-0 page-title">Apply plan</h1>' +
                "</div>" +
            "</div>" +
            '<div id="pa-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Focus</h6></div>' +
                '<div class="card-body">' +
                    '<form id="pa-form">' +
                        '<div class="mb-3"><label class="form-label">Plan definition</label>' +
                            '<select class="form-select" id="pa-plan" required></select></div>' +
                        '<div class="mb-3"><label class="form-label">Subject</label>' +
                            '<select class="form-select" id="pa-patient"></select></div>' +
                        '<div class="mb-3"><label class="form-label">Appointment</label>' +
                            '<select class="form-select" id="pa-appointment"></select>' +
                            '<div class="form-text">Used as the focus for FHIRPath conditions and created work items.</div></div>' +
                        '<div class="mb-3"><label class="form-label">Slot</label>' +
                            '<select class="form-select" id="pa-slot"></select>' +
                            '<div class="form-text">Optional. Needed when a plan action books or holds an appointment.</div></div>' +
                        '<button class="btn btn-primary" type="submit">' +
                            '<i class="bi bi-play-circle me-1"></i>Apply</button>' +
                    "</form>" +
                "</div>" +
            "</div>"
        );
        CadminApi.bindFhirSelect("#pa-plan", "PlanDefinition", {
            placeholder: "Select a plan",
            selectedId: planId || ""
        });
        CadminApi.bindFhirSelect("#pa-patient", "Patient", { placeholder: "None" });
        CadminApi.bindFhirSelect("#pa-appointment", "Appointment", { placeholder: "None" });
        CadminApi.bindFhirSelect("#pa-slot", "Slot", { placeholder: "None" });
        $("#pa-form").on("submit", function (event) {
            event.preventDefault();
            const request = valuesFromForm();
            if (!request.planId) {
                CadminApi.showToast("danger", "Select a plan definition.");
                return;
            }
            CadminFhirChief.apply(request.planId, request.values).done(function (body) {
                const run = CadminFhirChief.resourceParam(body, "return");
                CadminApi.showToast("success", "Plan applied.");
                if (run && run.id) {
                    window.location.hash = CadminApi.detailHref("RequestOrchestration", run.id);
                    return;
                }
                window.location.hash = "#/request-orchestrations";
            }).fail(fail);
        });
    }

    return { render: render };
}());
