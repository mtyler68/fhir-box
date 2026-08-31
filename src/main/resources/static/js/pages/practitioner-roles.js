CadminApp.register("practitioner-roles", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("practitioner-roles", token, function (resource, $root) {
            CadminPractitionerRoleDetail.render(resource, $root);
        }, function () {
            renderPractitionerRoleList(token);
        });
        return;
    }
    renderPractitionerRoleList("");
});

function renderPractitionerRoleList(initialQuery) {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Practitioner roles</h1>' +
            CadminResourceDocument.splitButton({
                label: "New practitioner role",
                modalTarget: "#create-practitioner-role-list-modal",
                resourceType: "PractitionerRole"
            }) +
        "</div>" +
        '<div id="practitioner-role-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Assignment search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="practitioner-role-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="practitioner-role-query" placeholder="Practitioner name" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Practitioner</th><th>Role</th><th>Organization</th><th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="practitioner-role-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="practitioner-role-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-practitioner-role-list-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-practitioner-role-list-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create practitioner role</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Practitioner</label>' +
                            '<select class="form-select" id="prl-practitioner" required></select></div>' +
                        '<div class="mb-3"><label class="form-label">Organization</label>' +
                            '<select class="form-select" id="prl-organization"><option value="">None</option></select></div>' +
                        '<div class="mb-3"><label class="form-label">Location</label>' +
                            '<select class="form-select" id="prl-location"><option value="">None</option></select></div>' +
                        '<div class="mb-3"><label class="form-label">Role</label>' +
                            '<select class="form-select" id="prl-code"></select></div>' +
                        '<div class="form-check mb-0">' +
                            '<input class="form-check-input" type="checkbox" id="prl-active" checked>' +
                            '<label class="form-check-label" for="prl-active">Active</label>' +
                        "</div>" +
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

    function personName(resource) {
        const name = (resource && resource.name && resource.name[0]) || {};
        const given = (name.given || []).join(" ");
        return [given, name.family].filter(Boolean).join(" ") || (resource && resource.id) || "Unnamed";
    }

    function statusBadge(active) {
        return active !== false
            ? '<span class="badge text-bg-success">Active</span>'
            : '<span class="badge text-bg-secondary">Inactive</span>';
    }

    function fillCreateForm() {
        CadminApi.bindPractitionerSelect("#prl-practitioner", { placeholder: "Select…" });
        CadminApi.bindOrganizationSelect("#prl-organization", { placeholder: "None" });
        CadminApi.bindFhirSelect("#prl-location", "Location", { placeholder: "None" });
        CadminApi.fillValueSetSelect("#prl-code", CadminApi.valueSets.practitionerRole, {
            fallback: CadminApi.valueSetFallbacks.practitionerRole,
            selected: "doctor"
        });
        $("#prl-active").prop("checked", true);
    }

    let listPage = 0;

    function load(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/PractitionerRole?_sort=-_lastUpdated" +
            "&_include=PractitionerRole:practitioner&_include=PractitionerRole:organization";
        const q = (query || "").trim();
        if (q) {
            path += "&practitioner.name=" + encodeURIComponent(q);
        }
        const pageSize = CadminApi.listPageSize("practitioner-roles");
        CadminDeletedList.query({ type: "PractitionerRole", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "PractitionerRole");
            const people = {};
            const orgs = {};
            CadminApi.bundleResources(bundle).forEach(function (resource) {
                if (resource.resourceType === "Practitioner") {
                    people[resource.id] = resource;
                } else if (resource.resourceType === "Organization") {
                    orgs[resource.id] = resource;
                }
            });
            CadminApi.renderPager("#practitioner-role-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "practitioner-roles",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#practitioner-role-rows").html(CadminDeletedList.emptyRow(6, "PractitionerRole", "No practitioner roles found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (item) {
                const prId = CadminApi.referenceId(item.practitioner);
                const orgId = CadminApi.referenceId(item.organization);
                const person = people[prId];
                const org = orgs[orgId];
                const personLabel = person ? personName(person) : refLabel(item.practitioner);
                const orgLabel = org ? (org.name || org.id) : refLabel(item.organization);
                const personHtml = prId
                    ? CadminApi.resourceLink("#/practitioners/" + encodeURIComponent(prId), personLabel)
                    : CadminApi.escapeHtml(personLabel);
                const orgHtml = orgId
                    ? CadminApi.resourceLink("#/organizations/" + encodeURIComponent(orgId), orgLabel)
                    : CadminApi.escapeHtml(orgLabel);
                return "<tr>" +
                    "<td>" + personHtml + "</td>" +
                    "<td>" + CadminApi.resourceLink("#/practitioner-roles/" + encodeURIComponent(item.id),
                        conceptLabel(item.code)) + "</td>" +
                    "<td>" + orgHtml + "</td>" +
                    "<td>" + statusBadge(item.active) + "</td>" +
                    "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="#/practitioner-roles/' +
                        encodeURIComponent(item.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td>' +
                    "</tr>";
            });
            $("#practitioner-role-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#practitioner-role-pager").empty();
            $("#practitioner-role-rows").html(
                '<tr><td colspan="6" class="text-danger">Unable to load practitioner roles from /fhir.</td></tr>'
            );
            CadminApi.showAlert("#practitioner-role-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#practitioner-role-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#practitioner-role-query").val());
    });

    $("#create-practitioner-role-list-form").on("submit", function (event) {
        event.preventDefault();
        const practitionerId = CadminApi.selectValue("#prl-practitioner");
        if (!practitionerId) {
            CadminApi.showToast("danger", "Select a practitioner.");
            return;
        }
        const coding = CadminApi.selectCoding("#prl-code",
            "http://terminology.hl7.org/CodeSystem/practitioner-role");
        const resource = {
            resourceType: "PractitionerRole",
            active: $("#prl-active").is(":checked"),
            practitioner: {
                reference: "Practitioner/" + practitionerId,
                display: CadminApi.selectLabel("#prl-practitioner")
            }
        };
        const organizationId = CadminApi.selectValue("#prl-organization");
        if (organizationId) {
            resource.organization = {
                reference: "Organization/" + organizationId,
                display: CadminApi.selectLabel("#prl-organization")
            };
        }
        const locationId = CadminApi.selectValue("#prl-location");
        if (locationId) {
            resource.location = [{
                reference: "Location/" + locationId,
                display: CadminApi.selectLabel("#prl-location")
            }];
        }
        if (coding && coding.code) {
            resource.code = [{
                coding: [{
                    system: coding.system || "http://terminology.hl7.org/CodeSystem/practitioner-role",
                    code: coding.code,
                    display: coding.display
                }],
                text: coding.display
            }];
        }
        CadminApi.fhir("/PractitionerRole", "POST", resource).done(function (created, _status, xhr) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("create-practitioner-role-list-modal"));
            if (modal) {
                modal.hide();
            }
            const id = CadminApi.createdResourceId(created, xhr, "PractitionerRole");
            CadminApi.showToast("success", "Practitioner role created.");
            if (id) {
                window.location.hash = "#/practitioner-roles/" + encodeURIComponent(id);
                return;
            }
            load($("#practitioner-role-query").val());
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
        });
    });

    $("#create-practitioner-role-list-modal").on("show.bs.modal", fillCreateForm);

    CadminDeletedList.bind({
        type: "PractitionerRole",
        reload: function () { load($("#practitioner-role-query").val(), 0); }
    });

    load(initialQuery);
}
