CadminApp.register("healthcare-services", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("healthcare-services", token, function (resource, $root) {
            CadminHealthcareServiceDetail.render(resource, $root);
        }, function () {
            renderHealthcareServiceList(token);
        });
        return;
    }
    renderHealthcareServiceList("");
});

function renderHealthcareServiceList(initialQuery) {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Healthcare services</h1>' +
            CadminResourceDocument.splitButton({
                label: "New healthcare service",
                modalTarget: "#create-healthcare-service-modal",
                resourceType: "HealthcareService"
            }) +
        "</div>" +
        '<div id="healthcare-service-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                '<h6 class="m-0">Healthcare service search</h6>' +
                '<form class="d-flex" id="healthcare-service-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="healthcare-service-query" placeholder="Name" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Name</th><th>Organization</th><th>Type</th><th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="healthcare-service-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="healthcare-service-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-healthcare-service-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-healthcare-service-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create healthcare service</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Name</label>' +
                            '<input class="form-control" id="hs-name" required></div>' +
                        '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="hs-active" checked>' +
                            '<label class="form-check-label" for="hs-active">Active</label></div>' +
                        '<div class="mb-3"><label class="form-label">Provided by</label>' +
                            '<select class="form-select" id="hs-organization"><option value="">None</option></select></div>' +
                        '<div class="mb-3"><label class="form-label">Location</label>' +
                            '<select class="form-select" id="hs-location"></select></div>' +
                        '<div class="mb-0"><label class="form-label">Specialty</label>' +
                            '<select class="form-select" id="hs-specialty"></select></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>"
    );

    function conceptLabel(cc) {
        const item = Array.isArray(cc) ? cc[0] : cc;
        if (!item) {
            return "—";
        }
        const coding = (item.coding && item.coding[0]) || {};
        return item.text || coding.display || coding.code || "—";
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        return ref.display || (ref.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function loadCreateOptions() {
        CadminApi.bindOrganizationSelect("#hs-organization", { placeholder: "None" });
        CadminApi.bindFhirSelect("#hs-location", "Location", { placeholder: "None" });
        CadminApi.fillValueSetSelect("#hs-specialty", CadminApi.valueSets.c80PracticeCodes, {
            fallback: CadminApi.valueSetFallbacks.c80PracticeCodes,
            prepend: [{ code: "", display: "Unspecified" }]
        });
    }

    let listPage = 0;

    function load(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/HealthcareService?_sort=-_lastUpdated";
        if (query) {
            path += "&name=" + encodeURIComponent(query);
        }
        const pageSize = CadminApi.listPageSize("healthcare-services");
        CadminApi.fhir(CadminApi.pagedPath(path, listPage, pageSize)).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "HealthcareService");
            CadminApi.renderPager("#healthcare-service-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "healthcare-services",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#healthcare-service-rows").html(
                    '<tr><td colspan="6" class="text-muted">No healthcare services found. Create one or start HAPI FHIR.</td></tr>');
                return;
            }
            const rows = entries.map(function (service) {
                const orgId = CadminApi.referenceId(service.providedBy);
                const orgHtml = orgId
                    ? CadminApi.resourceLink("#/organizations/" + encodeURIComponent(orgId), refLabel(service.providedBy))
                    : CadminApi.escapeHtml(refLabel(service.providedBy));
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/healthcare-services/" + encodeURIComponent(service.id),
                        service.name || "Unnamed") + "</td>" +
                    "<td>" + orgHtml + "</td>" +
                    "<td>" + CadminApi.escapeHtml(conceptLabel(service.type) !== "—"
                        ? conceptLabel(service.type) : conceptLabel(service.specialty)) + "</td>" +
                    "<td>" + (service.active !== false
                        ? '<span class="badge text-bg-success">Active</span>'
                        : '<span class="badge text-bg-secondary">Inactive</span>') + "</td>" +
                    "<td><code>" + CadminApi.escapeHtml(service.id) + "</code></td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="#/healthcare-services/' +
                        encodeURIComponent(service.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td>' +
                    "</tr>";
            });
            $("#healthcare-service-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#healthcare-service-pager").empty();
            $("#healthcare-service-rows").html(
                '<tr><td colspan="6" class="text-danger">Unable to load healthcare services from /fhir.</td></tr>');
            CadminApi.showAlert("#healthcare-service-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#healthcare-service-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#healthcare-service-query").val());
    });

    $("#create-healthcare-service-form").on("submit", function (event) {
        event.preventDefault();
        const resource = {
            resourceType: "HealthcareService",
            name: $("#hs-name").val().trim(),
            active: $("#hs-active").is(":checked")
        };
        const orgId = CadminApi.selectValue("#hs-organization");
        if (orgId) {
            resource.providedBy = {
                reference: "Organization/" + orgId,
                display: CadminApi.selectLabel("#hs-organization")
            };
        }
        const locId = CadminApi.selectValue("#hs-location");
        if (locId) {
            resource.location = [{
                reference: "Location/" + locId,
                display: CadminApi.selectLabel("#hs-location")
            }];
        }
        const specialty = $("#hs-specialty").val();
        if (specialty) {
            const specialtyLabel = $("#hs-specialty option:selected").text();
            const match = (CadminApi.valueSetFallbacks.c80PracticeCodes || []).find(function (item) {
                return item.code === specialty;
            });
            resource.specialty = [{
                coding: [{
                    system: (match && match.system) || "http://snomed.info/sct",
                    code: specialty,
                    display: specialtyLabel
                }],
                text: specialtyLabel
            }];
        }
        CadminApi.fhir("/HealthcareService", "POST", resource).done(function (created) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("create-healthcare-service-modal"));
            if (modal) {
                modal.hide();
            }
            CadminApi.showToast("success", "Healthcare service created.");
            if (created && created.id) {
                window.location.hash = CadminApi.detailHref("HealthcareService", created.id);
                return;
            }
            load($("#healthcare-service-query").val());
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
        });
    });

    $("#create-healthcare-service-modal").on("show.bs.modal", loadCreateOptions);

    load(initialQuery);
}
