CadminApp.register("organization-affiliations", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("organization-affiliations", token, function (resource, $root) {
            CadminOrganizationAffiliationDetail.render(resource, $root);
        }, function () {
            renderOrganizationAffiliationList(token);
        });
        return;
    }
    renderOrganizationAffiliationList("");
});

function renderOrganizationAffiliationList(initialQuery) {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Organization affiliations</h1>' +
            CadminResourceDocument.splitButton({
                label: "New organization affiliation",
                modalTarget: "#create-organization-affiliation-list-modal",
                resourceType: "OrganizationAffiliation"
            }) +
        "</div>" +
        '<div id="organization-affiliation-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Affiliation search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="organization-affiliation-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="organization-affiliation-query" placeholder="Organization name" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Primary</th><th>Participating</th><th>Role</th><th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="organization-affiliation-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="organization-affiliation-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-organization-affiliation-list-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-organization-affiliation-list-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create organization affiliation</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Primary organization</label>' +
                            '<select class="form-select" id="oal-primary" required></select></div>' +
                        '<div class="mb-3"><label class="form-label">Participating organization</label>' +
                            '<select class="form-select" id="oal-participating" required></select></div>' +
                        '<div class="mb-3"><label class="form-label">Role</label>' +
                            '<select class="form-select" id="oal-code"></select></div>' +
                        '<div class="form-check mb-0">' +
                            '<input class="form-check-input" type="checkbox" id="oal-active" checked>' +
                            '<label class="form-check-label" for="oal-active">Active</label>' +
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

    function statusBadge(active) {
        return active !== false
            ? '<span class="badge text-bg-success">Active</span>'
            : '<span class="badge text-bg-secondary">Inactive</span>';
    }

    function orgName(resource) {
        return (resource && (resource.name || resource.id)) || "Unnamed";
    }

    function fillCreateForm() {
        CadminApi.bindOrganizationSelect("#oal-primary", { placeholder: "Select…" });
        CadminApi.bindOrganizationSelect("#oal-participating", { placeholder: "Select…" });
        CadminApi.fillValueSetSelect("#oal-code", CadminApi.valueSets.organizationRole, {
            fallback: CadminApi.valueSetFallbacks.organizationRole,
            selected: "provider"
        });
        $("#oal-active").prop("checked", true);
    }

    function collectOrgs(bundle) {
        const orgs = {};
        CadminApi.bundleResources(bundle).forEach(function (resource) {
            if (resource.resourceType === "Organization") {
                orgs[resource.id] = resource;
            }
        });
        return orgs;
    }

    function affiliationRow(item, orgs) {
        const primaryId = CadminApi.referenceId(item.organization);
        const otherId = CadminApi.referenceId(item.participatingOrganization);
        const primary = orgs[primaryId];
        const other = orgs[otherId];
        const primaryLabel = primary ? orgName(primary) : refLabel(item.organization);
        const otherLabel = other ? orgName(other) : refLabel(item.participatingOrganization);
        const primaryHtml = primaryId
            ? CadminApi.resourceLink("#/organizations/" + encodeURIComponent(primaryId), primaryLabel)
            : CadminApi.escapeHtml(primaryLabel);
        const otherHtml = otherId
            ? CadminApi.resourceLink("#/organizations/" + encodeURIComponent(otherId), otherLabel)
            : CadminApi.escapeHtml(otherLabel);
        return "<tr>" +
            "<td>" + primaryHtml + "</td>" +
            "<td>" + otherHtml + "</td>" +
            "<td>" + CadminApi.resourceLink("#/organization-affiliations/" + encodeURIComponent(item.id),
                conceptLabel(item.code)) + "</td>" +
            "<td>" + statusBadge(item.active) + "</td>" +
            "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
            '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="#/organization-affiliations/' +
                encodeURIComponent(item.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td>' +
            "</tr>";
    }

    function paintRows(entries, orgs) {
        if (!entries.length) {
            $("#organization-affiliation-rows").html(CadminDeletedList.emptyRow(6, "OrganizationAffiliation", "No organization affiliations found. Create one or start HAPI FHIR."));
            return;
        }
        $("#organization-affiliation-rows").html(entries.map(function (item) {
            return affiliationRow(item, orgs);
        }).join(""));
    }

    function includePath() {
        return "_include=OrganizationAffiliation:primary-organization" +
            "&_include=OrganizationAffiliation:participating-organization";
    }

    let listPage = 0;

    function loadPaged(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/OrganizationAffiliation?_sort=-_lastUpdated&" + includePath();
        const q = (query || "").trim();
        if (q) {
            path += "&primary-organization.name=" + encodeURIComponent(q);
        }
        const pageSize = CadminApi.listPageSize("organization-affiliations");
        CadminDeletedList.query({ type: "OrganizationAffiliation", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "OrganizationAffiliation");
            CadminApi.renderPager("#organization-affiliation-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "organization-affiliations",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { loadPaged(query, nextPage); }
            });
            paintRows(entries, collectOrgs(bundle));
        }).fail(function (xhr) {
            $("#organization-affiliation-pager").empty();
            $("#organization-affiliation-rows").html(
                '<tr><td colspan="6" class="text-danger">Unable to load organization affiliations from /fhir.</td></tr>'
            );
            CadminApi.showAlert("#organization-affiliation-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    function mergeAffiliations(primary, participating) {
        const byId = {};
        CadminApi.bundleResources(primary, "OrganizationAffiliation")
            .concat(CadminApi.bundleResources(participating, "OrganizationAffiliation"))
            .forEach(function (item) {
                if (item && item.id) {
                    byId[item.id] = item;
                }
            });
        return Object.keys(byId).map(function (id) { return byId[id]; });
    }

    function loadByEitherOrg(query) {
        if (CadminDeletedList.isOn()) {
            loadPaged(query, 0);
            return;
        }
        const q = (query || "").trim();
        if (!q) {
            loadPaged("", 0);
            return;
        }
        CadminApi.fhir("/Organization?name=" + encodeURIComponent(q) + "&_count=20").done(function (orgBundle) {
            const orgs = CadminApi.bundleResources(orgBundle, "Organization");
            if (!orgs.length) {
                $("#organization-affiliation-pager").empty();
                paintRows([], {});
                return;
            }
            const ids = orgs.map(function (org) { return encodeURIComponent(org.id); }).join(",");
            const suffix = "&" + includePath() + "&_count=50";
            $.when(
                CadminApi.fhir("/OrganizationAffiliation?primary-organization=" + ids + suffix),
                CadminApi.fhir("/OrganizationAffiliation?participating-organization=" + ids + suffix)
            ).done(function (primaryRes, participatingRes) {
                const primaryBundle = primaryRes[0];
                const participatingBundle = participatingRes[0];
                const orgsById = Object.assign(collectOrgs(primaryBundle), collectOrgs(participatingBundle));
                orgs.forEach(function (org) {
                    orgsById[org.id] = org;
                });
                $("#organization-affiliation-pager").empty();
                paintRows(mergeAffiliations(primaryBundle, participatingBundle), orgsById);
            }).fail(function (xhr) {
                $("#organization-affiliation-pager").empty();
                $("#organization-affiliation-rows").html(
                    '<tr><td colspan="6" class="text-danger">Unable to load organization affiliations from /fhir.</td></tr>'
                );
                CadminApi.showAlert("#organization-affiliation-alert", "danger",
                    "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
            });
        }).fail(function () {
            loadPaged(q, 0);
        });
    }

    $("#organization-affiliation-search-form").on("submit", function (event) {
        event.preventDefault();
        loadByEitherOrg($("#organization-affiliation-query").val());
    });

    $("#create-organization-affiliation-list-form").on("submit", function (event) {
        event.preventDefault();
        const primaryId = CadminApi.selectValue("#oal-primary");
        const participatingId = CadminApi.selectValue("#oal-participating");
        if (!primaryId || !participatingId) {
            CadminApi.showToast("danger", "Select both organizations.");
            return;
        }
        if (primaryId === participatingId) {
            CadminApi.showToast("danger", "Primary and participating organizations must be different.");
            return;
        }
        const coding = CadminApi.selectCoding("#oal-code", "http://hl7.org/fhir/organization-role");
        const resource = {
            resourceType: "OrganizationAffiliation",
            active: $("#oal-active").is(":checked"),
            organization: {
                reference: "Organization/" + primaryId,
                display: CadminApi.selectLabel("#oal-primary")
            },
            participatingOrganization: {
                reference: "Organization/" + participatingId,
                display: CadminApi.selectLabel("#oal-participating")
            }
        };
        if (coding && coding.code) {
            resource.code = [{
                coding: [{
                    system: coding.system || "http://hl7.org/fhir/organization-role",
                    code: coding.code,
                    display: coding.display
                }],
                text: coding.display
            }];
        }
        CadminApi.fhir("/OrganizationAffiliation", "POST", resource).done(function (created, _status, xhr) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("create-organization-affiliation-list-modal"));
            if (modal) {
                modal.hide();
            }
            const id = CadminApi.createdResourceId(created, xhr, "OrganizationAffiliation");
            CadminApi.showToast("success", "Organization affiliation created.");
            if (id) {
                window.location.hash = "#/organization-affiliations/" + encodeURIComponent(id);
                return;
            }
            loadByEitherOrg($("#organization-affiliation-query").val());
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
        });
    });

    $("#create-organization-affiliation-list-modal").on("show.bs.modal", fillCreateForm);

    CadminDeletedList.bind({
        type: "OrganizationAffiliation",
        reload: function () { loadByEitherOrg($("#organization-affiliation-query").val()); }
    });

    loadByEitherOrg(initialQuery);
}
