window.CadminPractitionerRoleDetail = (function () {
    const ROLE_SYSTEM = "http://terminology.hl7.org/CodeSystem/practitioner-role";
    const daysOfWeek = [
        { code: "mon", display: "Mon" },
        { code: "tue", display: "Tue" },
        { code: "wed", display: "Wed" },
        { code: "thu", display: "Thu" },
        { code: "fri", display: "Fri" },
        { code: "sat", display: "Sat" },
        { code: "sun", display: "Sun" }
    ];
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

    let role = null;

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

    function personName(resource) {
        const name = (resource && resource.name && resource.name[0]) || {};
        const given = (name.given || []).join(" ");
        return [given, name.family].filter(Boolean).join(" ") || (resource && resource.id) || "Unnamed";
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
        CadminApi.bindConceptSelect(selector, CadminApi.valueSets.practitionerRole, {
            placeholder: "Search roles…",
            fallback: CadminApi.valueSetFallbacks.practitionerRole,
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

    function availabilityRoot() {
        if (!role.availability || !role.availability.length) {
            role.availability = [{}];
        }
        return role.availability[0];
    }

    function pruneAvailability() {
        role.availability = (role.availability || []).filter(function (item) {
            return (item.availableTime && item.availableTime.length)
                || (item.notAvailableTime && item.notAvailableTime.length);
        });
        if (!role.availability.length) {
            delete role.availability;
        }
    }

    function formatHours(slot) {
        if (!slot) {
            return "—";
        }
        if (slot.allDay) {
            return "all day";
        }
        const open = slot.availableStartTime || "";
        const close = slot.availableEndTime || "";
        return (open || close) ? open + "–" + close : "—";
    }

    function saveRole(next) {
        CadminApi.fhir("/PractitionerRole/" + encodeURIComponent(role.id), "PUT", role).done(function (updated) {
            role = updated || role;
            renderHeader();
            renderAssignment();
            renderClinical();
            renderLocations();
            renderServices();
            renderContacts();
            renderHours();
            renderUnavailable();
            renderIdentifiers();
            loadEndpoints();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            fail("Update practitioner role", xhr);
        });
    }

    function render(resource) {
        role = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/practitioner-roles">' +
                        '<i class="bi bi-arrow-left me-1"></i>Practitioner roles</a>' +
                    '<h1 class="h3 mb-1 page-title" id="prrd-title"></h1>' +
                    '<p class="text-muted mb-1" id="prrd-subtitle"></p>' +
                    '<p class="small mb-0" id="prrd-links"></p>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="prrd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    "<h6 class=\"m-0\">Assignment</h6>" +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#prrd-assign-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="prrd-assign"></div>' +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Locations", "prrd-loc-rows",
                    ["Location", ""], "#prrd-loc-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Healthcare services", "prrd-svc-rows",
                    ["Service", ""], "#prrd-svc-modal", "Add") + "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Roles", "prrd-code-rows",
                    ["Role", ""], "#prrd-code-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Specialties", "prrd-spec-rows",
                    ["Specialty", ""], "#prrd-spec-modal", "Add") + "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Role contact", "prrd-contact-rows",
                    ["System", "Value", ""], "#prrd-contact-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Endpoints", "prrd-ep-rows",
                    ["Name", "Address", "Status", ""], "#prrd-endpoint-modal", "New",
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#prrd-ep-attach-modal">Attach</button>') +
                    "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Weekly hours", "prrd-hours-rows",
                    ["Days", "Hours", ""], "#prrd-hours-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Not available", "prrd-unavail-rows",
                    ["Description", "Period", ""], "#prrd-unavail-modal", "Add") + "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Identifiers", "prrd-id-rows",
                    ["System", "Value", ""], "#prrd-id-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Care teams", "prrd-team-rows",
                    ["Team", "Patient", "Match", ""], "", "") + "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            modal("prrd-assign-modal", "Edit assignment",
                field("Practitioner", '<select class="form-select" id="prrd-practitioner" required></select>') +
                field("Organization", '<select class="form-select" id="prrd-organization"><option value="">None</option></select>') +
                '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="prrd-active">' +
                    '<label class="form-check-label" for="prrd-active">Active</label></div>' +
                '<div class="row"><div class="col-md-6 mb-0"><label class="form-label">Period start</label>' +
                    '<input class="form-control" id="prrd-start" type="date"></div>' +
                    '<div class="col-md-6 mb-0"><label class="form-label">Period end</label>' +
                    '<input class="form-control" id="prrd-end" type="date"></div></div>',
                "prrd-assign-form") +
            modal("prrd-loc-modal", "Add location",
                field("Location", '<select class="form-select" id="prrd-loc" required></select>'),
                "prrd-loc-form") +
            modal("prrd-svc-modal", "Add healthcare service",
                field("Healthcare service", '<select class="form-select" id="prrd-svc" required></select>'),
                "prrd-svc-form") +
            modal("prrd-code-modal", "Add role",
                field("Role", '<select class="form-select" id="prrd-code" required></select>'),
                "prrd-code-form") +
            modal("prrd-spec-modal", "Add specialty",
                field("Specialty", '<select class="form-select" id="prrd-spec" required></select>'),
                "prrd-spec-form") +
            modal("prrd-contact-modal", "Add role contact",
                field("System", '<select class="form-select" id="prrd-ct-system">' + optionsHtml(contactSystems) + "</select>") +
                field("Value", '<input class="form-control" id="prrd-ct-value" required>'),
                "prrd-contact-form") +
            modal("prrd-endpoint-modal", "New endpoint",
                field("Name", '<input class="form-control" id="prrd-ep-name" required>') +
                field("Connection type", '<select class="form-select" id="prrd-ep-type">' + optionsHtml(connectionTypes) + "</select>") +
                field("Address", '<input class="form-control font-monospace" id="prrd-ep-address" required placeholder="https://example.org/fhir">') +
                field("Status", '<select class="form-select" id="prrd-ep-status">' +
                    '<option value="active">Active</option><option value="limited">Limited</option>' +
                    '<option value="suspended">Suspended</option><option value="off">Off</option></select>'),
                "prrd-endpoint-form") +
            modal("prrd-ep-attach-modal", "Attach endpoint",
                field("Endpoint", '<select class="form-select" id="prrd-ep-attach" required></select>'),
                "prrd-ep-attach-form") +
            modal("prrd-hours-modal", "Add weekly hours",
                '<div class="mb-3"><label class="form-label">Days</label><div id="prrd-hours-days">' +
                    daysOfWeek.map(function (day) {
                        return '<div class="form-check form-check-inline">' +
                            '<input class="form-check-input" type="checkbox" id="prrd-day-' + day.code +
                            '" value="' + day.code + '">' +
                            '<label class="form-check-label" for="prrd-day-' + day.code + '">' +
                            day.display + "</label></div>";
                    }).join("") +
                "</div></div>" +
                '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="prrd-hours-allday">' +
                    '<label class="form-check-label" for="prrd-hours-allday">All day</label></div>' +
                '<div class="row"><div class="col-md-6 mb-0"><label class="form-label">Opens</label>' +
                    '<input type="time" class="form-control" id="prrd-hours-open"></div>' +
                    '<div class="col-md-6 mb-0"><label class="form-label">Closes</label>' +
                    '<input type="time" class="form-control" id="prrd-hours-close"></div></div>',
                "prrd-hours-form") +
            modal("prrd-unavail-modal", "Add not-available period",
                field("Description", '<input class="form-control" id="prrd-unavail-desc" required>') +
                '<div class="row"><div class="col-md-6 mb-0"><label class="form-label">Start</label>' +
                    '<input type="date" class="form-control" id="prrd-unavail-start"></div>' +
                    '<div class="col-md-6 mb-0"><label class="form-label">End</label>' +
                    '<input type="date" class="form-control" id="prrd-unavail-end"></div></div>',
                "prrd-unavail-form") +
            modal("prrd-id-modal", "Add identifier",
                field("System", '<input class="form-control font-monospace" id="prrd-id-system">') +
                field("Value", '<input class="form-control" id="prrd-id-value" required>'),
                "prrd-id-form")
        );
        CadminResourceSource.mount(function () { return role; });
        CadminResourceGraph.mount(role);
        CadminResourceHistory.mount(role);
        renderHeader();
        renderAssignment();
        renderClinical();
        renderLocations();
        renderServices();
        renderContacts();
        renderHours();
        renderUnavailable();
        renderIdentifiers();
        loadEndpoints();
        loadCareTeams();
        resolveDisplays();
        bind();
        $("#prrd-assign-modal").on("show.bs.modal", populateAssignForm);
        $("#prrd-loc-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#prrd-loc", "Location", { placeholder: "Search locations…" });
        });
        $("#prrd-svc-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#prrd-svc", "HealthcareService", {
                placeholder: "Search healthcare services…"
            });
        });
        $("#prrd-code-modal").on("show.bs.modal", function () {
            bindRoleSelect("#prrd-code", null);
        });
        $("#prrd-spec-modal").on("show.bs.modal", function () {
            bindSpecialtySelect("#prrd-spec");
        });
        $("#prrd-ep-attach-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#prrd-ep-attach", "Endpoint", { placeholder: "Search endpoints…" });
        });
    }

    function renderHeader() {
        const roleLabel = conceptLabel(role.code);
        const practitioner = refLabel(role.practitioner);
        $("#prrd-title").text(
            (practitioner && practitioner !== "—" ? practitioner : "Practitioner") + " · " +
            (roleLabel && roleLabel !== "—" ? roleLabel : "Role")
        );
        const org = refLabel(role.organization);
        $("#prrd-subtitle").html(
            statusBadge(role.active) +
            (org && org !== "—" ? '<span class="ms-2">' + esc(org) + "</span>" : "") +
            '<span class="ms-2">' + esc(formatPeriod(role.period)) + "</span>"
        );
        const links = [];
        const prId = refId(role.practitioner);
        const orgId = refId(role.organization);
        if (prId) {
            links.push('<a href="#/practitioners/' + encodeURIComponent(prId) + '">Practitioner</a>');
        }
        if (orgId) {
            links.push('<a href="#/organizations/' + encodeURIComponent(orgId) + '">Organization</a>');
        }
        $("#prrd-links").html(links.join(" · "));
    }

    function renderAssignment() {
        $("#prrd-assign").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Practitioner</dt><dd class="col-sm-9">' +
                    refHref("Practitioner", role.practitioner) + "</dd>" +
                '<dt class="col-sm-3">Organization</dt><dd class="col-sm-9">' +
                    refHref("Organization", role.organization) + "</dd>" +
                '<dt class="col-sm-3">Period</dt><dd class="col-sm-9">' + esc(formatPeriod(role.period)) + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(role.active) + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(role.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function renderClinical() {
        const codes = role.code || [];
        if (!codes.length) {
            $("#prrd-code-rows").html(emptyRow(2, "No roles."));
        } else {
            $("#prrd-code-rows").html(codes.map(function (item, index) {
                return "<tr><td>" + esc(conceptLabel(item)) + "</td>" +
                    '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-code="' +
                    index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
            }).join(""));
        }
        const specialties = role.specialty || [];
        if (!specialties.length) {
            $("#prrd-spec-rows").html(emptyRow(2, "No specialties."));
            return;
        }
        $("#prrd-spec-rows").html(specialties.map(function (item, index) {
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

    function renderLocations() {
        renderRefTable(role.location, "Location", "#prrd-loc-rows", "No locations.", "data-remove-loc");
    }

    function renderServices() {
        renderRefTable(role.healthcareService, "HealthcareService", "#prrd-svc-rows",
            "No healthcare services.", "data-remove-svc");
    }

    function roleTelecoms() {
        const rows = [];
        (role.contact || []).forEach(function (contact, contactIndex) {
            (contact.telecom || []).forEach(function (item, telecomIndex) {
                rows.push({ contactIndex: contactIndex, telecomIndex: telecomIndex, item: item });
            });
        });
        return rows;
    }

    function renderContacts() {
        const rows = roleTelecoms();
        if (!rows.length) {
            $("#prrd-contact-rows").html(emptyRow(3, "No role contacts."));
            return;
        }
        $("#prrd-contact-rows").html(rows.map(function (entry) {
            return "<tr><td>" + esc(entry.item.system || "—") + "</td><td>" + esc(entry.item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-contact="' +
                entry.contactIndex + ":" + entry.telecomIndex +
                '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function flattenAvailable() {
        const rows = [];
        (role.availability || []).forEach(function (item, availIndex) {
            (item.availableTime || []).forEach(function (slot, timeIndex) {
                rows.push({ availIndex: availIndex, timeIndex: timeIndex, slot: slot });
            });
        });
        return rows;
    }

    function flattenUnavailable() {
        const rows = [];
        (role.availability || []).forEach(function (item, availIndex) {
            (item.notAvailableTime || []).forEach(function (slot, timeIndex) {
                rows.push({ availIndex: availIndex, timeIndex: timeIndex, slot: slot });
            });
        });
        return rows;
    }

    function renderHours() {
        const rows = flattenAvailable();
        if (!rows.length) {
            $("#prrd-hours-rows").html(emptyRow(3, "No weekly hours."));
            return;
        }
        $("#prrd-hours-rows").html(rows.map(function (entry) {
            return "<tr><td>" + esc((entry.slot.daysOfWeek || []).join(", ") || "—") + "</td><td>" +
                esc(formatHours(entry.slot)) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-hours="' +
                entry.availIndex + ":" + entry.timeIndex +
                '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderUnavailable() {
        const rows = flattenUnavailable();
        if (!rows.length) {
            $("#prrd-unavail-rows").html(emptyRow(3, "No not-available periods."));
            return;
        }
        $("#prrd-unavail-rows").html(rows.map(function (entry) {
            return "<tr><td>" + esc(entry.slot.description || "—") + "</td><td>" +
                esc(formatPeriod(entry.slot.during)) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-unavail="' +
                entry.availIndex + ":" + entry.timeIndex +
                '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderIdentifiers() {
        const rows = role.identifier || [];
        if (!rows.length) {
            $("#prrd-id-rows").html(emptyRow(3, "No identifiers."));
            return;
        }
        $("#prrd-id-rows").html(rows.map(function (item, index) {
            return "<tr><td><code>" + esc(item.system || "—") + "</code></td><td>" + esc(item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-id="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function loadEndpoints() {
        const ids = (role.endpoint || []).map(refId).filter(Boolean);
        if (!ids.length) {
            $("#prrd-ep-rows").html(emptyRow(4, "No endpoints."));
            return;
        }
        CadminApi.fhir("/Endpoint?_id=" + ids.map(encodeURIComponent).join(",") + "&_count=50").done(function (bundle) {
            const listed = bundleResources(bundle, "Endpoint");
            if (!listed.length) {
                $("#prrd-ep-rows").html(emptyRow(4, "No endpoints."));
                return;
            }
            $("#prrd-ep-rows").html(listed.map(function (ep) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/endpoints/" + encodeURIComponent(ep.id), ep.name || ep.id) + "</td>" +
                    "<td><code>" + esc(ep.address || "—") + "</code></td>" +
                    "<td>" + esc(ep.status || "—") + "</td>" +
                    '<td class="text-end"><button class="btn btn-sm btn-outline-secondary" type="button" data-unlink-endpoint="' +
                    esc(ep.id) + '" title="Unlink" aria-label="Unlink"><iconify-icon icon="mdi:link-off" aria-hidden="true"></iconify-icon></button></td></tr>';
            }).join(""));
        }).fail(function (xhr) {
            $("#prrd-ep-rows").html(emptyRow(4, "Unable to load endpoints."));
            fail("Load endpoints", xhr);
        });
    }

    function teamPatient(team) {
        return refHref("Patient", team.subject);
    }

    function memberMatches(team, type, id) {
        const needle = type + "/" + id;
        return (team.participant || []).some(function (item) {
            const reference = (item.member && item.member.reference) || "";
            return reference === needle || reference.indexOf("/" + needle) >= 0 || refId(item.member) === id;
        });
    }

    function loadCareTeams() {
        const roleId = role.id;
        const prId = refId(role.practitioner);
        const byId = {};
        let pending = prId ? 2 : 1;
        let failed = 0;

        function paint() {
            const teams = Object.keys(byId).map(function (id) { return byId[id]; });
            if (!teams.length) {
                const message = pending > 0
                    ? "Loading…"
                    : (failed ? "Unable to load care teams." : "No care teams reference this assignment.");
                $("#prrd-team-rows").html(emptyRow(4, message));
                return;
            }
            $("#prrd-team-rows").html(teams.map(function (team) {
                const byRole = memberMatches(team, "PractitionerRole", roleId);
                const byPractitioner = prId && memberMatches(team, "Practitioner", prId);
                const match = byRole ? "This role" : (byPractitioner ? "Same practitioner" : "Related");
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/care-teams/" + encodeURIComponent(team.id),
                        team.name || team.id) + "</td>" +
                    "<td>" + teamPatient(team) + "</td>" +
                    "<td>" + esc(match) + "</td><td></td></tr>";
            }).join(""));
        }

        function absorb(bundle) {
            bundleResources(bundle, "CareTeam").forEach(function (team) {
                byId[team.id] = team;
            });
            pending -= 1;
            paint();
        }

        function miss(xhr) {
            failed += 1;
            pending -= 1;
            if (!Object.keys(byId).length && pending <= 0) {
                fail("Load care teams", xhr);
            }
            paint();
        }

        CadminApi.fhir("/CareTeam?participant=PractitionerRole/" + encodeURIComponent(roleId) + "&_count=50")
            .done(absorb).fail(miss);
        if (prId) {
            CadminApi.fhir("/CareTeam?participant=Practitioner/" + encodeURIComponent(prId) + "&_count=50")
                .done(absorb).fail(miss);
        }
    }

    function resolveDisplays() {
        const prId = refId(role.practitioner);
        const orgId = refId(role.organization);
        const locIds = (role.location || []).map(refId).filter(Boolean);
        const svcIds = (role.healthcareService || []).map(refId).filter(Boolean);
        if (prId) {
            CadminApi.fhir("/Practitioner/" + encodeURIComponent(prId)).done(function (resource) {
                role.practitioner = role.practitioner || {};
                role.practitioner.display = personName(resource);
                renderHeader();
                renderAssignment();
            });
        }
        if (orgId) {
            CadminApi.fhir("/Organization/" + encodeURIComponent(orgId)).done(function (resource) {
                role.organization = role.organization || {};
                role.organization.display = resource.name || resource.id;
                renderHeader();
                renderAssignment();
            });
        }
        if (locIds.length) {
            CadminApi.fhir("/Location?_id=" + locIds.map(encodeURIComponent).join(",") + "&_count=50")
                .done(function (bundle) {
                    const byId = {};
                    bundleResources(bundle, "Location").forEach(function (item) {
                        byId[item.id] = item.name || item.id;
                    });
                    (role.location || []).forEach(function (ref) {
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
                    (role.healthcareService || []).forEach(function (ref) {
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
        CadminApi.bindPractitionerSelect("#prrd-practitioner", {
            placeholder: "Select…",
            selectedId: refId(role.practitioner),
            selectedLabel: refLabel(role.practitioner)
        });
        CadminApi.bindOrganizationSelect("#prrd-organization", {
            placeholder: "None",
            selectedId: refId(role.organization),
            selectedLabel: refLabel(role.organization)
        });
        $("#prrd-active").prop("checked", role.active !== false);
        $("#prrd-start").val((role.period && role.period.start) || "");
        $("#prrd-end").val((role.period && role.period.end) || "");
    }

    function pushRef(listName, type, id, display) {
        if (!id) {
            return false;
        }
        const existing = (role[listName] || []).some(function (ref) {
            return refId(ref) === id;
        });
        if (existing) {
            alertMsg("warning", "Already linked.");
            return false;
        }
        role[listName] = role[listName] || [];
        role[listName].push({ reference: type + "/" + id, display: display || id });
        return true;
    }

    function parseIndexPair(value) {
        const parts = String(value || "").split(":");
        return { a: Number(parts[0]), b: Number(parts[1]) };
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".prrd");

        $root.on("click.prrd", "[data-remove-loc]", function () {
            role.location = dropRef(role.location, $(this).attr("data-remove-loc"));
            if (!role.location.length) {
                delete role.location;
            }
            saveRole(function () { alertMsg("success", "Location removed."); });
        });

        $root.on("click.prrd", "[data-remove-svc]", function () {
            role.healthcareService = dropRef(role.healthcareService, $(this).attr("data-remove-svc"));
            if (!role.healthcareService.length) {
                delete role.healthcareService;
            }
            saveRole(function () { alertMsg("success", "Healthcare service removed."); });
        });

        $root.on("click.prrd", "[data-remove-code]", function () {
            const index = Number($(this).attr("data-remove-code"));
            role.code = (role.code || []).filter(function (_item, i) { return i !== index; });
            if (!role.code.length) {
                delete role.code;
            }
            saveRole(function () {
                alertMsg("success", "Role removed.");
                renderHeader();
            });
        });

        $root.on("click.prrd", "[data-remove-spec]", function () {
            const index = Number($(this).attr("data-remove-spec"));
            role.specialty = (role.specialty || []).filter(function (_item, i) { return i !== index; });
            if (!role.specialty.length) {
                delete role.specialty;
            }
            saveRole(function () { alertMsg("success", "Specialty removed."); });
        });

        $root.on("click.prrd", "[data-remove-contact]", function () {
            const pair = parseIndexPair($(this).attr("data-remove-contact"));
            const contact = (role.contact || [])[pair.a];
            if (contact && contact.telecom) {
                contact.telecom = contact.telecom.filter(function (_item, i) { return i !== pair.b; });
                if (!contact.telecom.length) {
                    delete contact.telecom;
                }
            }
            role.contact = (role.contact || []).filter(function (item) {
                return item.telecom && item.telecom.length;
            });
            if (!role.contact.length) {
                delete role.contact;
            }
            saveRole(function () { alertMsg("success", "Contact removed."); });
        });

        $root.on("click.prrd", "[data-unlink-endpoint]", function () {
            role.endpoint = dropRef(role.endpoint, $(this).attr("data-unlink-endpoint"));
            if (!role.endpoint.length) {
                delete role.endpoint;
            }
            saveRole(function () {
                alertMsg("success", "Endpoint unlinked.");
                loadEndpoints();
            });
        });

        $root.on("click.prrd", "[data-remove-hours]", function () {
            const pair = parseIndexPair($(this).attr("data-remove-hours"));
            const item = (role.availability || [])[pair.a];
            if (item && item.availableTime) {
                item.availableTime = item.availableTime.filter(function (_slot, i) { return i !== pair.b; });
                if (!item.availableTime.length) {
                    delete item.availableTime;
                }
            }
            pruneAvailability();
            saveRole(function () { alertMsg("success", "Hours removed."); });
        });

        $root.on("click.prrd", "[data-remove-unavail]", function () {
            const pair = parseIndexPair($(this).attr("data-remove-unavail"));
            const item = (role.availability || [])[pair.a];
            if (item && item.notAvailableTime) {
                item.notAvailableTime = item.notAvailableTime.filter(function (_slot, i) { return i !== pair.b; });
                if (!item.notAvailableTime.length) {
                    delete item.notAvailableTime;
                }
            }
            pruneAvailability();
            saveRole(function () { alertMsg("success", "Not-available period removed."); });
        });

        $root.on("click.prrd", "[data-remove-id]", function () {
            const index = Number($(this).attr("data-remove-id"));
            role.identifier = (role.identifier || []).filter(function (_item, i) { return i !== index; });
            if (!role.identifier.length) {
                delete role.identifier;
            }
            saveRole(function () { alertMsg("success", "Identifier removed."); });
        });

        $root.on("click.prrd", "#prrd-delete", function () {
            CadminApi.confirm("Delete this practitioner role assignment?").done(function () {
                CadminApi.fhir("/PractitionerRole/" + encodeURIComponent(role.id), "DELETE").done(function () {
                    alertMsg("success", "Practitioner role deleted.");
                    window.location.hash = "#/practitioner-roles";
                }).fail(function (xhr) {
                    fail("Delete practitioner role", xhr);
                });
            });
        });

        $("#prrd-assign-form").on("submit", function (event) {
            event.preventDefault();
            const practitionerId = CadminApi.selectValue("#prrd-practitioner");
            if (!practitionerId) {
                alertMsg("danger", "Select a practitioner.");
                return;
            }
            role.practitioner = {
                reference: "Practitioner/" + practitionerId,
                display: CadminApi.selectLabel("#prrd-practitioner")
            };
            const organizationId = CadminApi.selectValue("#prrd-organization");
            if (organizationId) {
                role.organization = {
                    reference: "Organization/" + organizationId,
                    display: CadminApi.selectLabel("#prrd-organization")
                };
            } else {
                delete role.organization;
            }
            role.active = $("#prrd-active").is(":checked");
            const start = $("#prrd-start").val();
            const end = $("#prrd-end").val();
            if (start || end) {
                role.period = {};
                if (start) {
                    role.period.start = start;
                }
                if (end) {
                    role.period.end = end;
                }
            } else {
                delete role.period;
            }
            saveRole(function () {
                hideModal("prrd-assign-modal");
                alertMsg("success", "Assignment updated.");
            });
        });

        $("#prrd-loc-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("location", "Location", CadminApi.selectValue("#prrd-loc"),
                    CadminApi.selectLabel("#prrd-loc"))) {
                return;
            }
            saveRole(function () {
                hideModal("prrd-loc-modal");
                alertMsg("success", "Location added.");
            });
        });

        $("#prrd-svc-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("healthcareService", "HealthcareService", CadminApi.selectValue("#prrd-svc"),
                    CadminApi.selectLabel("#prrd-svc"))) {
                return;
            }
            saveRole(function () {
                hideModal("prrd-svc-modal");
                alertMsg("success", "Healthcare service added.");
            });
        });

        $("#prrd-code-form").on("submit", function (event) {
            event.preventDefault();
            const cc = codeableFromSelect("#prrd-code", ROLE_SYSTEM);
            if (!cc) {
                alertMsg("danger", "Select a role.");
                return;
            }
            role.code = role.code || [];
            role.code.push(cc);
            saveRole(function () {
                hideModal("prrd-code-modal");
                alertMsg("success", "Role added.");
                renderHeader();
            });
        });

        $("#prrd-spec-form").on("submit", function (event) {
            event.preventDefault();
            const cc = codeableFromSelect("#prrd-spec", "http://snomed.info/sct");
            if (!cc) {
                alertMsg("danger", "Select a specialty.");
                return;
            }
            role.specialty = role.specialty || [];
            role.specialty.push(cc);
            saveRole(function () {
                hideModal("prrd-spec-modal");
                alertMsg("success", "Specialty added.");
            });
        });

        $("#prrd-contact-form").on("submit", function (event) {
            event.preventDefault();
            const telecom = {
                system: $("#prrd-ct-system").val() || "phone",
                value: $("#prrd-ct-value").val().trim()
            };
            if (!role.contact || !role.contact.length) {
                role.contact = [{ telecom: [] }];
            }
            role.contact[0].telecom = role.contact[0].telecom || [];
            role.contact[0].telecom.push(telecom);
            saveRole(function () {
                hideModal("prrd-contact-modal");
                alertMsg("success", "Contact added.");
            });
        });

        $("#prrd-ep-attach-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("endpoint", "Endpoint", CadminApi.selectValue("#prrd-ep-attach"),
                    CadminApi.selectLabel("#prrd-ep-attach"))) {
                return;
            }
            saveRole(function () {
                hideModal("prrd-ep-attach-modal");
                alertMsg("success", "Endpoint attached.");
                loadEndpoints();
            });
        });

        $("#prrd-endpoint-form").on("submit", function (event) {
            event.preventDefault();
            const conn = connectionTypes.find(function (item) {
                return item.code === $("#prrd-ep-type").val();
            });
            const resource = {
                resourceType: "Endpoint",
                status: $("#prrd-ep-status").val() || "active",
                name: $("#prrd-ep-name").val(),
                address: $("#prrd-ep-address").val(),
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
            if (role.organization) {
                resource.managingOrganization = role.organization;
            }
            CadminApi.fhir("/Endpoint", "POST", resource).done(function (created) {
                role.endpoint = role.endpoint || [];
                role.endpoint.push({ reference: "Endpoint/" + created.id, display: created.name });
                saveRole(function () {
                    hideModal("prrd-endpoint-modal");
                    alertMsg("success", "Endpoint created.");
                    loadEndpoints();
                });
            }).fail(function (xhr) {
                fail("Create endpoint", xhr);
            });
        });

        $("#prrd-hours-form").on("submit", function (event) {
            event.preventDefault();
            const selectedDays = daysOfWeek.map(function (day) { return day.code; }).filter(function (code) {
                return $("#prrd-day-" + code).is(":checked");
            });
            const slot = { daysOfWeek: selectedDays };
            if ($("#prrd-hours-allday").is(":checked")) {
                slot.allDay = true;
            } else {
                const open = $("#prrd-hours-open").val();
                const close = $("#prrd-hours-close").val();
                if (open) {
                    slot.availableStartTime = open + (open.length === 5 ? ":00" : "");
                }
                if (close) {
                    slot.availableEndTime = close + (close.length === 5 ? ":00" : "");
                }
            }
            const root = availabilityRoot();
            root.availableTime = root.availableTime || [];
            root.availableTime.push(slot);
            saveRole(function () {
                hideModal("prrd-hours-modal");
                alertMsg("success", "Hours added.");
            });
        });

        $("#prrd-unavail-form").on("submit", function (event) {
            event.preventDefault();
            const slot = { description: $("#prrd-unavail-desc").val().trim() };
            const start = $("#prrd-unavail-start").val();
            const end = $("#prrd-unavail-end").val();
            if (start || end) {
                slot.during = {};
                if (start) {
                    slot.during.start = start;
                }
                if (end) {
                    slot.during.end = end;
                }
            }
            const root = availabilityRoot();
            root.notAvailableTime = root.notAvailableTime || [];
            root.notAvailableTime.push(slot);
            saveRole(function () {
                hideModal("prrd-unavail-modal");
                alertMsg("success", "Not-available period added.");
            });
        });

        $("#prrd-id-form").on("submit", function (event) {
            event.preventDefault();
            const identifier = { value: $("#prrd-id-value").val().trim() };
            const system = $("#prrd-id-system").val().trim();
            if (system) {
                identifier.system = system;
            }
            role.identifier = role.identifier || [];
            role.identifier.push(identifier);
            saveRole(function () {
                hideModal("prrd-id-modal");
                alertMsg("success", "Identifier added.");
            });
        });
    }

    return { render: render };
}());
