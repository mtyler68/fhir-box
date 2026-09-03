window.CadminOrganizationAffiliationDetail = (function () {
    const ROLE_SYSTEM = "http://hl7.org/fhir/organization-role";
    const contactSystems = [
        { code: "phone", display: "Phone" },
        { code: "email", display: "Email" },
        { code: "fax", display: "Fax" },
        { code: "url", display: "URL" }
    ];
    const connectionTypes = [
        { code: "hl7-fhir-rest", display: "HL7 FHIR REST" },
        { code: "hl7-fhir-msg", display: "HL7 FHIR Messaging" },
        { code: "hl7v2-mllp", display: "HL7 v2 MLLP" },
        { code: "direct-project", display: "Direct Project" },
        { code: "secure-email", display: "Secure email" }
    ];

    let affiliation = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function bundleResources(bundle, type) {
        return CadminApi.bundleResources(bundle, type);
    }

    function conceptLabel(cc) {
        const item = Array.isArray(cc) ? cc[0] : cc;
        if (!item) {
            return "—";
        }
        const coding = (item.coding && item.coding[0]) || item;
        return item.text || coding.display || coding.code || "—";
    }

    function firstCoding(cc) {
        const item = Array.isArray(cc) ? cc[0] : cc;
        return (item && item.coding && item.coding[0]) || {};
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

    function refHref(type, ref) {
        const id = refId(ref);
        if (!id) {
            return esc(refLabel(ref));
        }
        return CadminApi.resourceLink(CadminApi.detailHref(type, id), refLabel(ref));
    }

    function formatPeriod(period) {
        if (!period || (!period.start && !period.end)) {
            return "—";
        }
        return [period.start || "…", period.end || "…"].join(" – ");
    }

    function statusBadge(active) {
        return active !== false
            ? '<span class="badge text-bg-success">Active</span>'
            : '<span class="badge text-bg-secondary">Inactive</span>';
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
    }

    function optionsHtml(items) {
        return items.map(function (item) {
            return '<option value="' + esc(item.code) + '">' + esc(item.display) + "</option>";
        }).join("");
    }

    function hideModal(id) {
        const el = document.getElementById(id);
        const instance = el ? bootstrap.Modal.getInstance(el) : null;
        if (instance) {
            instance.hide();
        }
    }

    function alertMsg(type, message) {
        CadminApi.showToast(type, message);
    }

    function fail(action, xhr) {
        alertMsg("danger", action + " failed (" + xhr.status + ").");
    }

    function card(title, tableId, cols, addTarget, addLabel, extraHeader) {
        return '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                "<h6 class=\"m-0\">" + title + "</h6>" +
                '<div class="d-flex gap-2">' +
                    (extraHeader || "") +
                    (addTarget
                        ? '<button class="btn btn-sm btn-primary" type="button" data-bs-toggle="modal" data-bs-target="' +
                            addTarget + '"><i class="bi bi-plus-lg me-1"></i>' + addLabel + "</button>"
                        : "") +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr>" + cols.map(function (col) { return "<th>" + col + "</th>"; }).join("") + "</tr></thead>" +
                        '<tbody id="' + tableId + '">' + emptyRow(cols.length, "Loading…") + "</tbody>" +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>";
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

    function field(label, control) {
        return '<div class="mb-3"><label class="form-label">' + label + "</label>" + control + "</div>";
    }

    function dropRef(list, id) {
        return (list || []).filter(function (ref) {
            return refId(ref) !== id;
        });
    }

    function codeableFromSelect(selector, fallbackSystem) {
        const coding = CadminApi.selectCoding(selector, fallbackSystem);
        if (!coding || !coding.code) {
            return null;
        }
        const item = { coding: [{ code: coding.code, display: coding.display }] };
        if (coding.system) {
            item.coding[0].system = coding.system;
        }
        if (coding.display) {
            item.text = coding.display;
        }
        return item;
    }

    function bindRoleSelect(selector, selectedCc) {
        const coding = firstCoding(selectedCc);
        CadminApi.bindConceptSelect(selector, CadminApi.valueSets.organizationRole, {
            placeholder: "Search roles…",
            fallback: CadminApi.valueSetFallbacks.organizationRole,
            selected: {
                code: coding.code || "",
                display: coding.display || conceptLabel(selectedCc),
                system: coding.system || ROLE_SYSTEM
            }
        });
    }

    function bindSpecialtySelect(selector) {
        CadminApi.bindConceptSelect(selector, CadminApi.valueSets.c80PracticeCodes, {
            placeholder: "Search specialties…",
            fallback: CadminApi.valueSetFallbacks.c80PracticeCodes,
            allowEmpty: false
        });
    }

    function saveAffiliation(next) {
        CadminApi.fhir("/OrganizationAffiliation/" + encodeURIComponent(affiliation.id), "PUT", affiliation)
            .done(function (updated) {
                affiliation = updated || affiliation;
                renderHeader();
                renderAssignment();
                renderClinical();
                renderNetworks();
                renderLocations();
                renderServices();
                renderContacts();
                renderIdentifiers();
                loadEndpoints();
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                fail("Update organization affiliation", xhr);
            });
    }

    function render(resource) {
        affiliation = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/organization-affiliations">' +
                        '<i class="bi bi-arrow-left me-1"></i>Organization affiliations</a>' +
                    '<h1 class="h3 mb-1 page-title" id="oad-title"></h1>' +
                    '<p class="text-muted mb-1" id="oad-subtitle"></p>' +
                    '<p class="small mb-0" id="oad-links"></p>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="oad-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    "<h6 class=\"m-0\">Assignment</h6>" +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#oad-assign-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="oad-assign"></div>' +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Roles", "oad-code-rows",
                    ["Role", ""], "#oad-code-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Specialties", "oad-spec-rows",
                    ["Specialty", ""], "#oad-spec-modal", "Add") + "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Networks", "oad-net-rows",
                    ["Organization", ""], "#oad-net-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Locations", "oad-loc-rows",
                    ["Location", ""], "#oad-loc-modal", "Add") + "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Healthcare services", "oad-svc-rows",
                    ["Service", ""], "#oad-svc-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Endpoints", "oad-ep-rows",
                    ["Name", "Address", "Status", ""], "#oad-endpoint-modal", "New",
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#oad-ep-attach-modal">Attach</button>') +
                    "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Affiliation contact", "oad-contact-rows",
                    ["System", "Value", ""], "#oad-contact-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Identifiers", "oad-id-rows",
                    ["System", "Value", ""], "#oad-id-modal", "Add") + "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            modal("oad-assign-modal", "Edit assignment",
                field("Primary organization", '<select class="form-select" id="oad-primary" required></select>') +
                field("Participating organization", '<select class="form-select" id="oad-participating" required></select>') +
                '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="oad-active">' +
                    '<label class="form-check-label" for="oad-active">Active</label></div>' +
                '<div class="row"><div class="col-md-6 mb-0"><label class="form-label">Period start</label>' +
                    '<input class="form-control" id="oad-start" type="date"></div>' +
                    '<div class="col-md-6 mb-0"><label class="form-label">Period end</label>' +
                    '<input class="form-control" id="oad-end" type="date"></div></div>',
                "oad-assign-form") +
            modal("oad-code-modal", "Add role",
                field("Role", '<select class="form-select" id="oad-code" required></select>'),
                "oad-code-form") +
            modal("oad-spec-modal", "Add specialty",
                field("Specialty", '<select class="form-select" id="oad-spec" required></select>'),
                "oad-spec-form") +
            modal("oad-net-modal", "Add network",
                field("Network organization", '<select class="form-select" id="oad-net" required></select>'),
                "oad-net-form") +
            modal("oad-loc-modal", "Add location",
                field("Location", '<select class="form-select" id="oad-loc" required></select>'),
                "oad-loc-form") +
            modal("oad-svc-modal", "Add healthcare service",
                field("Healthcare service", '<select class="form-select" id="oad-svc" required></select>'),
                "oad-svc-form") +
            modal("oad-contact-modal", "Add affiliation contact",
                field("System", '<select class="form-select" id="oad-ct-system">' + optionsHtml(contactSystems) + "</select>") +
                field("Value", '<input class="form-control" id="oad-ct-value" required>'),
                "oad-contact-form") +
            modal("oad-endpoint-modal", "New endpoint",
                field("Name", '<input class="form-control" id="oad-ep-name" required>') +
                field("Connection type", '<select class="form-select" id="oad-ep-type">' + optionsHtml(connectionTypes) + "</select>") +
                field("Address", '<input class="form-control font-monospace" id="oad-ep-address" required placeholder="https://example.org/fhir">') +
                field("Status", '<select class="form-select" id="oad-ep-status">' +
                    '<option value="active">Active</option><option value="limited">Limited</option>' +
                    '<option value="suspended">Suspended</option><option value="off">Off</option></select>'),
                "oad-endpoint-form") +
            modal("oad-ep-attach-modal", "Attach endpoint",
                field("Endpoint", '<select class="form-select" id="oad-ep-attach" required></select>'),
                "oad-ep-attach-form") +
            modal("oad-id-modal", "Add identifier",
                field("System", '<input class="form-control font-monospace" id="oad-id-system">') +
                field("Value", '<input class="form-control" id="oad-id-value" required>'),
                "oad-id-form")
        );
        CadminResourceSource.mount(function () { return affiliation; });
        CadminResourceGraph.mount(affiliation);
        CadminResourceHistory.mount(affiliation);
        renderHeader();
        renderAssignment();
        renderClinical();
        renderNetworks();
        renderLocations();
        renderServices();
        renderContacts();
        renderIdentifiers();
        loadEndpoints();
        resolveDisplays();
        bind();
        $("#oad-assign-modal").on("show.bs.modal", populateAssignForm);
        $("#oad-code-modal").on("show.bs.modal", function () {
            bindRoleSelect("#oad-code", null);
        });
        $("#oad-spec-modal").on("show.bs.modal", function () {
            bindSpecialtySelect("#oad-spec");
        });
        $("#oad-net-modal").on("show.bs.modal", function () {
            CadminApi.bindOrganizationSelect("#oad-net", { placeholder: "Search organizations…" });
        });
        $("#oad-loc-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#oad-loc", "Location", { placeholder: "Search locations…" });
        });
        $("#oad-svc-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#oad-svc", "HealthcareService", {
                placeholder: "Search healthcare services…"
            });
        });
        $("#oad-ep-attach-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#oad-ep-attach", "Endpoint", { placeholder: "Search endpoints…" });
        });
    }

    function renderHeader() {
        const roleLabel = conceptLabel(affiliation.code);
        const primary = refLabel(affiliation.organization);
        const other = refLabel(affiliation.participatingOrganization);
        const left = primary && primary !== "—" ? primary : "Organization";
        const right = roleLabel && roleLabel !== "—"
            ? roleLabel
            : (other && other !== "—" ? other : "Affiliation");
        $("#oad-title").text(left + " · " + right);
        $("#oad-subtitle").html(
            statusBadge(affiliation.active) +
            (other && other !== "—" ? '<span class="ms-2">' + esc(other) + "</span>" : "") +
            '<span class="ms-2">' + esc(formatPeriod(affiliation.period)) + "</span>"
        );
        const links = [];
        const primaryId = refId(affiliation.organization);
        const otherId = refId(affiliation.participatingOrganization);
        if (primaryId) {
            links.push('<a href="#/organizations/' + encodeURIComponent(primaryId) + '">Primary</a>');
        }
        if (otherId) {
            links.push('<a href="#/organizations/' + encodeURIComponent(otherId) + '">Participating</a>');
        }
        $("#oad-links").html(links.join(" · "));
    }

    function renderAssignment() {
        $("#oad-assign").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Primary</dt><dd class="col-sm-9">' +
                    refHref("Organization", affiliation.organization) + "</dd>" +
                '<dt class="col-sm-3">Participating</dt><dd class="col-sm-9">' +
                    refHref("Organization", affiliation.participatingOrganization) + "</dd>" +
                '<dt class="col-sm-3">Period</dt><dd class="col-sm-9">' + esc(formatPeriod(affiliation.period)) + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(affiliation.active) + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(affiliation.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function renderClinical() {
        const codes = affiliation.code || [];
        if (!codes.length) {
            $("#oad-code-rows").html(emptyRow(2, "No roles."));
        } else {
            $("#oad-code-rows").html(codes.map(function (item, index) {
                return "<tr><td>" + esc(conceptLabel(item)) + "</td>" +
                    '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-code="' +
                    index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
            }).join(""));
        }
        const specialties = affiliation.specialty || [];
        if (!specialties.length) {
            $("#oad-spec-rows").html(emptyRow(2, "No specialties."));
            return;
        }
        $("#oad-spec-rows").html(specialties.map(function (item, index) {
            return "<tr><td>" + esc(conceptLabel(item)) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-spec="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderRefTable(list, type, tableId, emptyText, attr) {
        if (!(list || []).length) {
            $(tableId).html(emptyRow(2, emptyText));
            return;
        }
        $(tableId).html(list.map(function (ref) {
            const id = refId(ref);
            return "<tr><td>" + refHref(type, ref) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" ' + attr + '="' +
                esc(id) + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderNetworks() {
        renderRefTable(affiliation.network, "Organization", "#oad-net-rows", "No networks.", "data-remove-net");
    }

    function renderLocations() {
        renderRefTable(affiliation.location, "Location", "#oad-loc-rows", "No locations.", "data-remove-loc");
    }

    function renderServices() {
        renderRefTable(affiliation.healthcareService, "HealthcareService", "#oad-svc-rows",
            "No healthcare services.", "data-remove-svc");
    }

    function affiliationTelecoms() {
        const rows = [];
        (affiliation.contact || []).forEach(function (contact, contactIndex) {
            (contact.telecom || []).forEach(function (item, telecomIndex) {
                rows.push({ contactIndex: contactIndex, telecomIndex: telecomIndex, item: item });
            });
        });
        return rows;
    }

    function renderContacts() {
        const rows = affiliationTelecoms();
        if (!rows.length) {
            $("#oad-contact-rows").html(emptyRow(3, "No affiliation contacts."));
            return;
        }
        $("#oad-contact-rows").html(rows.map(function (entry) {
            return "<tr><td>" + esc(entry.item.system || "—") + "</td><td>" + esc(entry.item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-contact="' +
                entry.contactIndex + ":" + entry.telecomIndex +
                '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderIdentifiers() {
        const rows = affiliation.identifier || [];
        if (!rows.length) {
            $("#oad-id-rows").html(emptyRow(3, "No identifiers."));
            return;
        }
        $("#oad-id-rows").html(rows.map(function (item, index) {
            return "<tr><td><code>" + esc(item.system || "—") + "</code></td><td>" + esc(item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-id="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function loadEndpoints() {
        const ids = (affiliation.endpoint || []).map(refId).filter(Boolean);
        if (!ids.length) {
            $("#oad-ep-rows").html(emptyRow(4, "No endpoints."));
            return;
        }
        CadminApi.fhir("/Endpoint?_id=" + ids.map(encodeURIComponent).join(",") + "&_count=50").done(function (bundle) {
            const listed = bundleResources(bundle, "Endpoint");
            if (!listed.length) {
                $("#oad-ep-rows").html(emptyRow(4, "No endpoints."));
                return;
            }
            $("#oad-ep-rows").html(listed.map(function (ep) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/endpoints/" + encodeURIComponent(ep.id), ep.name || ep.id) + "</td>" +
                    "<td><code>" + esc(ep.address || "—") + "</code></td>" +
                    "<td>" + esc(ep.status || "—") + "</td>" +
                    '<td class="text-end"><button class="btn btn-sm btn-outline-secondary" type="button" data-unlink-endpoint="' +
                    esc(ep.id) + '" title="Unlink" aria-label="Unlink"><iconify-icon icon="mdi:link-off" aria-hidden="true"></iconify-icon></button></td></tr>';
            }).join(""));
        }).fail(function (xhr) {
            $("#oad-ep-rows").html(emptyRow(4, "Unable to load endpoints."));
            fail("Load endpoints", xhr);
        });
    }

    function applyOrgDisplay(ref, resource) {
        if (!ref) {
            return;
        }
        ref.display = (resource && (resource.name || resource.id)) || ref.display;
    }

    function resolveDisplays() {
        const primaryId = refId(affiliation.organization);
        const otherId = refId(affiliation.participatingOrganization);
        const netIds = (affiliation.network || []).map(refId).filter(Boolean);
        const locIds = (affiliation.location || []).map(refId).filter(Boolean);
        const svcIds = (affiliation.healthcareService || []).map(refId).filter(Boolean);
        if (primaryId) {
            CadminApi.fhir("/Organization/" + encodeURIComponent(primaryId)).done(function (resource) {
                affiliation.organization = affiliation.organization || {};
                applyOrgDisplay(affiliation.organization, resource);
                renderHeader();
                renderAssignment();
            });
        }
        if (otherId) {
            CadminApi.fhir("/Organization/" + encodeURIComponent(otherId)).done(function (resource) {
                affiliation.participatingOrganization = affiliation.participatingOrganization || {};
                applyOrgDisplay(affiliation.participatingOrganization, resource);
                renderHeader();
                renderAssignment();
            });
        }
        if (netIds.length) {
            CadminApi.fhir("/Organization?_id=" + netIds.map(encodeURIComponent).join(",") + "&_count=50")
                .done(function (bundle) {
                    const byId = {};
                    bundleResources(bundle, "Organization").forEach(function (item) {
                        byId[item.id] = item.name || item.id;
                    });
                    (affiliation.network || []).forEach(function (ref) {
                        const id = refId(ref);
                        if (id && byId[id]) {
                            ref.display = byId[id];
                        }
                    });
                    renderNetworks();
                });
        }
        if (locIds.length) {
            CadminApi.fhir("/Location?_id=" + locIds.map(encodeURIComponent).join(",") + "&_count=50")
                .done(function (bundle) {
                    const byId = {};
                    bundleResources(bundle, "Location").forEach(function (item) {
                        byId[item.id] = item.name || item.id;
                    });
                    (affiliation.location || []).forEach(function (ref) {
                        const id = refId(ref);
                        if (id && byId[id]) {
                            ref.display = byId[id];
                        }
                    });
                    renderLocations();
                });
        }
        if (svcIds.length) {
            CadminApi.fhir("/HealthcareService?_id=" + svcIds.map(encodeURIComponent).join(",") + "&_count=50")
                .done(function (bundle) {
                    const byId = {};
                    bundleResources(bundle, "HealthcareService").forEach(function (item) {
                        byId[item.id] = item.name || item.id;
                    });
                    (affiliation.healthcareService || []).forEach(function (ref) {
                        const id = refId(ref);
                        if (id && byId[id]) {
                            ref.display = byId[id];
                        }
                    });
                    renderServices();
                });
        }
    }

    function populateAssignForm() {
        CadminApi.bindOrganizationSelect("#oad-primary", {
            placeholder: "Select…",
            selectedId: refId(affiliation.organization),
            selectedLabel: refLabel(affiliation.organization)
        });
        CadminApi.bindOrganizationSelect("#oad-participating", {
            placeholder: "Select…",
            selectedId: refId(affiliation.participatingOrganization),
            selectedLabel: refLabel(affiliation.participatingOrganization)
        });
        $("#oad-active").prop("checked", affiliation.active !== false);
        $("#oad-start").val((affiliation.period && affiliation.period.start) || "");
        $("#oad-end").val((affiliation.period && affiliation.period.end) || "");
    }

    function pushRef(listName, type, id, display) {
        if (!id) {
            return false;
        }
        const existing = (affiliation[listName] || []).some(function (ref) {
            return refId(ref) === id;
        });
        if (existing) {
            alertMsg("warning", "Already linked.");
            return false;
        }
        affiliation[listName] = affiliation[listName] || [];
        affiliation[listName].push({ reference: type + "/" + id, display: display || id });
        return true;
    }

    function parseIndexPair(value) {
        const parts = String(value || "").split(":");
        return { a: Number(parts[0]), b: Number(parts[1]) };
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".oad");

        $root.on("click.oad", "[data-remove-net]", function () {
            affiliation.network = dropRef(affiliation.network, $(this).attr("data-remove-net"));
            if (!affiliation.network.length) {
                delete affiliation.network;
            }
            saveAffiliation(function () { alertMsg("success", "Network removed."); });
        });

        $root.on("click.oad", "[data-remove-loc]", function () {
            affiliation.location = dropRef(affiliation.location, $(this).attr("data-remove-loc"));
            if (!affiliation.location.length) {
                delete affiliation.location;
            }
            saveAffiliation(function () { alertMsg("success", "Location removed."); });
        });

        $root.on("click.oad", "[data-remove-svc]", function () {
            affiliation.healthcareService = dropRef(affiliation.healthcareService, $(this).attr("data-remove-svc"));
            if (!affiliation.healthcareService.length) {
                delete affiliation.healthcareService;
            }
            saveAffiliation(function () { alertMsg("success", "Healthcare service removed."); });
        });

        $root.on("click.oad", "[data-remove-code]", function () {
            const index = Number($(this).attr("data-remove-code"));
            affiliation.code = (affiliation.code || []).filter(function (_item, i) { return i !== index; });
            if (!affiliation.code.length) {
                delete affiliation.code;
            }
            saveAffiliation(function () {
                alertMsg("success", "Role removed.");
                renderHeader();
            });
        });

        $root.on("click.oad", "[data-remove-spec]", function () {
            const index = Number($(this).attr("data-remove-spec"));
            affiliation.specialty = (affiliation.specialty || []).filter(function (_item, i) { return i !== index; });
            if (!affiliation.specialty.length) {
                delete affiliation.specialty;
            }
            saveAffiliation(function () { alertMsg("success", "Specialty removed."); });
        });

        $root.on("click.oad", "[data-remove-contact]", function () {
            const pair = parseIndexPair($(this).attr("data-remove-contact"));
            const contact = (affiliation.contact || [])[pair.a];
            if (contact && contact.telecom) {
                contact.telecom = contact.telecom.filter(function (_item, i) { return i !== pair.b; });
                if (!contact.telecom.length) {
                    delete contact.telecom;
                }
            }
            affiliation.contact = (affiliation.contact || []).filter(function (item) {
                return item.telecom && item.telecom.length;
            });
            if (!affiliation.contact.length) {
                delete affiliation.contact;
            }
            saveAffiliation(function () { alertMsg("success", "Contact removed."); });
        });

        $root.on("click.oad", "[data-unlink-endpoint]", function () {
            affiliation.endpoint = dropRef(affiliation.endpoint, $(this).attr("data-unlink-endpoint"));
            if (!affiliation.endpoint.length) {
                delete affiliation.endpoint;
            }
            saveAffiliation(function () {
                alertMsg("success", "Endpoint unlinked.");
                loadEndpoints();
            });
        });

        $root.on("click.oad", "[data-remove-id]", function () {
            const index = Number($(this).attr("data-remove-id"));
            affiliation.identifier = (affiliation.identifier || []).filter(function (_item, i) { return i !== index; });
            if (!affiliation.identifier.length) {
                delete affiliation.identifier;
            }
            saveAffiliation(function () { alertMsg("success", "Identifier removed."); });
        });

        $root.on("click.oad", "#oad-delete", function () {
            CadminApi.confirm("Delete this organization affiliation?").done(function () {
                CadminApi.fhir("/OrganizationAffiliation/" + encodeURIComponent(affiliation.id), "DELETE").done(function () {
                    alertMsg("success", "Organization affiliation deleted.");
                    window.location.hash = "#/organization-affiliations";
                }).fail(function (xhr) {
                    fail("Delete organization affiliation", xhr);
                });
            });
        });

        $("#oad-assign-form").on("submit", function (event) {
            event.preventDefault();
            const primaryId = CadminApi.selectValue("#oad-primary");
            const participatingId = CadminApi.selectValue("#oad-participating");
            if (!primaryId || !participatingId) {
                alertMsg("danger", "Select both organizations.");
                return;
            }
            if (primaryId === participatingId) {
                alertMsg("danger", "Primary and participating organizations must be different.");
                return;
            }
            affiliation.organization = {
                reference: "Organization/" + primaryId,
                display: CadminApi.selectLabel("#oad-primary")
            };
            affiliation.participatingOrganization = {
                reference: "Organization/" + participatingId,
                display: CadminApi.selectLabel("#oad-participating")
            };
            affiliation.active = $("#oad-active").is(":checked");
            const start = $("#oad-start").val();
            const end = $("#oad-end").val();
            if (start || end) {
                affiliation.period = {};
                if (start) {
                    affiliation.period.start = start;
                }
                if (end) {
                    affiliation.period.end = end;
                }
            } else {
                delete affiliation.period;
            }
            saveAffiliation(function () {
                hideModal("oad-assign-modal");
                alertMsg("success", "Assignment updated.");
            });
        });

        $("#oad-code-form").on("submit", function (event) {
            event.preventDefault();
            const cc = codeableFromSelect("#oad-code", ROLE_SYSTEM);
            if (!cc) {
                alertMsg("danger", "Select a role.");
                return;
            }
            affiliation.code = affiliation.code || [];
            affiliation.code.push(cc);
            saveAffiliation(function () {
                hideModal("oad-code-modal");
                alertMsg("success", "Role added.");
                renderHeader();
            });
        });

        $("#oad-spec-form").on("submit", function (event) {
            event.preventDefault();
            const cc = codeableFromSelect("#oad-spec", "http://snomed.info/sct");
            if (!cc) {
                alertMsg("danger", "Select a specialty.");
                return;
            }
            affiliation.specialty = affiliation.specialty || [];
            affiliation.specialty.push(cc);
            saveAffiliation(function () {
                hideModal("oad-spec-modal");
                alertMsg("success", "Specialty added.");
            });
        });

        $("#oad-net-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("network", "Organization", CadminApi.selectValue("#oad-net"),
                    CadminApi.selectLabel("#oad-net"))) {
                return;
            }
            saveAffiliation(function () {
                hideModal("oad-net-modal");
                alertMsg("success", "Network added.");
            });
        });

        $("#oad-loc-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("location", "Location", CadminApi.selectValue("#oad-loc"),
                    CadminApi.selectLabel("#oad-loc"))) {
                return;
            }
            saveAffiliation(function () {
                hideModal("oad-loc-modal");
                alertMsg("success", "Location added.");
            });
        });

        $("#oad-svc-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("healthcareService", "HealthcareService", CadminApi.selectValue("#oad-svc"),
                    CadminApi.selectLabel("#oad-svc"))) {
                return;
            }
            saveAffiliation(function () {
                hideModal("oad-svc-modal");
                alertMsg("success", "Healthcare service added.");
            });
        });

        $("#oad-contact-form").on("submit", function (event) {
            event.preventDefault();
            const telecom = {
                system: $("#oad-ct-system").val() || "phone",
                value: $("#oad-ct-value").val().trim()
            };
            if (!affiliation.contact || !affiliation.contact.length) {
                affiliation.contact = [{ telecom: [] }];
            }
            affiliation.contact[0].telecom = affiliation.contact[0].telecom || [];
            affiliation.contact[0].telecom.push(telecom);
            saveAffiliation(function () {
                hideModal("oad-contact-modal");
                alertMsg("success", "Contact added.");
            });
        });

        $("#oad-ep-attach-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("endpoint", "Endpoint", CadminApi.selectValue("#oad-ep-attach"),
                    CadminApi.selectLabel("#oad-ep-attach"))) {
                return;
            }
            saveAffiliation(function () {
                hideModal("oad-ep-attach-modal");
                alertMsg("success", "Endpoint attached.");
                loadEndpoints();
            });
        });

        $("#oad-endpoint-form").on("submit", function (event) {
            event.preventDefault();
            const conn = connectionTypes.find(function (item) {
                return item.code === $("#oad-ep-type").val();
            });
            const resource = {
                resourceType: "Endpoint",
                status: $("#oad-ep-status").val() || "active",
                name: $("#oad-ep-name").val(),
                address: $("#oad-ep-address").val(),
                connectionType: [{
                    coding: [{
                        system: "http://terminology.hl7.org/CodeSystem/endpoint-connection-type",
                        code: conn ? conn.code : "hl7-fhir-rest",
                        display: conn ? conn.display : "HL7 FHIR REST"
                    }]
                }],
                payload: [{
                    type: [{
                        coding: [{
                            system: "http://terminology.hl7.org/CodeSystem/endpoint-payload-type",
                            code: "any",
                            display: "Any"
                        }]
                    }]
                }]
            };
            if (affiliation.organization) {
                resource.managingOrganization = affiliation.organization;
            }
            CadminApi.fhir("/Endpoint", "POST", resource).done(function (created) {
                affiliation.endpoint = affiliation.endpoint || [];
                affiliation.endpoint.push({ reference: "Endpoint/" + created.id, display: created.name });
                saveAffiliation(function () {
                    hideModal("oad-endpoint-modal");
                    alertMsg("success", "Endpoint created.");
                    loadEndpoints();
                });
            }).fail(function (xhr) {
                fail("Create endpoint", xhr);
            });
        });

        $("#oad-id-form").on("submit", function (event) {
            event.preventDefault();
            const identifier = { value: $("#oad-id-value").val().trim() };
            const system = $("#oad-id-system").val().trim();
            if (system) {
                identifier.system = system;
            }
            affiliation.identifier = affiliation.identifier || [];
            affiliation.identifier.push(identifier);
            saveAffiliation(function () {
                hideModal("oad-id-modal");
                alertMsg("success", "Identifier added.");
            });
        });
    }

    return { render: render };
}());
