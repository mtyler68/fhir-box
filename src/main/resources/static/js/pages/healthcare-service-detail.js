window.CadminHealthcareServiceDetail = (function () {
    const contactSystems = [
        { code: "phone", display: "Phone" },
        { code: "fax", display: "Fax" },
        { code: "email", display: "Email" },
        { code: "url", display: "URL" }
    ];
    const connectionTypes = [
        { code: "hl7-fhir-rest", display: "HL7 FHIR REST" },
        { code: "hl7-fhir-msg", display: "HL7 FHIR Messaging" },
        { code: "hl7v2-mllp", display: "HL7 v2 MLLP" },
        { code: "direct-project", display: "Direct Project" },
        { code: "secure-email", display: "Secure email" },
        { code: "ihe-xds", display: "IHE XDS" }
    ];

    let service = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function bundleResources(bundle, resourceType) {
        return CadminApi.bundleResources(bundle, resourceType);
    }

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

    function refId(ref) {
        return CadminApi.referenceId(ref);
    }

    function refHref(type, ref) {
        const id = refId(ref);
        const label = refLabel(ref);
        if (!id) {
            return esc(label);
        }
        return CadminApi.resourceLink(CadminApi.detailHref(type, id), label);
    }

    function statusBadge(active) {
        return active !== false
            ? '<span class="badge text-bg-success">Active</span>'
            : '<span class="badge text-bg-secondary">Inactive</span>';
    }

    function codeStatusBadge(status) {
        const kind = status === "active" ? "success"
            : status === "error" ? "danger"
                : status === "limited" || status === "suspended" ? "warning"
                    : "secondary";
        return '<span class="badge text-bg-' + kind + '">' + esc(status || "—") + "</span>";
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

    function editCard(title, bodyId, editTarget) {
        return '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                "<h6 class=\"m-0\">" + title + "</h6>" +
                '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="' +
                    editTarget + '">Edit</button>' +
            "</div>" +
            '<div class="card-body" id="' + bodyId + '"></div>' +
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

    function pushRef(fieldName, type, id, display) {
        if (!id) {
            return false;
        }
        const reference = type + "/" + id;
        service[fieldName] = service[fieldName] || [];
        if (service[fieldName].some(function (ref) { return refId(ref) === id; })) {
            alertMsg("danger", "Already linked.");
            return false;
        }
        service[fieldName].push({ reference: reference, display: display });
        return true;
    }

    function codedConcept(text, code, system, display) {
        const concept = {};
        if (code) {
            concept.coding = [{
                system: system || undefined,
                code: code,
                display: display || text || code
            }];
        }
        if (text || display) {
            concept.text = text || display;
        }
        return concept.coding || concept.text ? concept : null;
    }

    function render(resource) {
        service = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/healthcare-services">' +
                        '<i class="bi bi-arrow-left me-1"></i>Healthcare services</a>' +
                    '<h1 class="h3 mb-0 page-title">' + esc(service.name || "Healthcare service") + "</h1>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="hsd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            editCard("Basic details", "hsd-basic-details", "#hsd-basic-modal") +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Types", "hsd-type-rows",
                    ["Type", ""], "#hsd-type-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Specialties", "hsd-spec-rows",
                    ["Specialty", ""], "#hsd-spec-modal", "Add") + "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Locations", "hsd-loc-rows",
                    ["Location", ""], "#hsd-loc-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Endpoints", "hsd-ep-rows",
                    ["Name", "Address", "Status", ""], "#hsd-endpoint-modal", "New",
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#hsd-ep-attach-modal">Attach</button>') +
                    "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Contacts", "hsd-contact-rows",
                    ["System", "Value", ""], "#hsd-contact-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Practitioner roles", "hsd-role-rows",
                    ["Practitioner", "Organization", "Role", ""], "", "") + "</div>" +
            "</div>" +
            (window.CadminScheduling ? CadminScheduling.relatedCard("hsd-appt-rows") : "") +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            modal("hsd-basic-modal", "Edit basic details",
                field("Name", '<input class="form-control" id="hsd-name" required>') +
                '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="hsd-active">' +
                    '<label class="form-check-label" for="hsd-active">Active</label></div>' +
                field("Provided by", '<select class="form-select" id="hsd-org"><option value="">None</option></select>') +
                '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="hsd-appt">' +
                    '<label class="form-check-label" for="hsd-appt">Appointment required</label></div>' +
                field("Comment", '<textarea class="form-control" id="hsd-comment" rows="2"></textarea>') +
                field("Extra details", '<textarea class="form-control" id="hsd-extra" rows="2"></textarea>') +
                '<div class="row"><div class="col-md-6 mb-0"><label class="form-label">Identifier system</label>' +
                    '<input class="form-control" id="hsd-id-system"></div>' +
                    '<div class="col-md-6 mb-0"><label class="form-label">Identifier value</label>' +
                    '<input class="form-control" id="hsd-id-value"></div></div>',
                "hsd-basic-form") +
            modal("hsd-type-modal", "Add type",
                field("Type", '<input class="form-control" id="hsd-type-text" required placeholder="Clinic / Center">'),
                "hsd-type-form") +
            modal("hsd-spec-modal", "Add specialty",
                field("Specialty", '<select class="form-select" id="hsd-spec" required></select>'),
                "hsd-spec-form") +
            modal("hsd-loc-modal", "Add location",
                field("Location", '<select class="form-select" id="hsd-loc" required></select>'),
                "hsd-loc-form") +
            modal("hsd-endpoint-modal", "New endpoint",
                field("Name", '<input class="form-control" id="hsd-ep-name" required>') +
                field("Connection type", '<select class="form-select" id="hsd-ep-type">' + optionsHtml(connectionTypes) + "</select>") +
                field("Address", '<input class="form-control font-monospace" id="hsd-ep-address" required placeholder="https://example.org/fhir">') +
                field("Status", '<select class="form-select" id="hsd-ep-status">' +
                    '<option value="active">Active</option><option value="limited">Limited</option>' +
                    '<option value="suspended">Suspended</option><option value="off">Off</option></select>'),
                "hsd-endpoint-form") +
            modal("hsd-ep-attach-modal", "Attach endpoint",
                field("Endpoint", '<select class="form-select" id="hsd-ep-attach" required></select>'),
                "hsd-ep-attach-form") +
            modal("hsd-contact-modal", "Add contact",
                field("System", '<select class="form-select" id="hsd-ct-system">' + optionsHtml(contactSystems) + "</select>") +
                field("Value", '<input class="form-control" id="hsd-ct-value" required>'),
                "hsd-contact-form")
        );
        CadminResourceSource.mount(function () { return service; });
        CadminResourceGraph.mount(service);
        CadminResourceHistory.mount(service);
        renderBasics();
        renderConcepts();
        renderLocations();
        loadEndpoints();
        renderContacts();
        loadRoles();
        if (window.CadminScheduling) {
            CadminScheduling.loadRelated("hsd-appt-rows",
                "actor=HealthcareService/" + encodeURIComponent(service.id));
        }
        bindForms();
    }

    function orgHtml() {
        const id = refId(service.providedBy);
        if (!id) {
            return esc(refLabel(service.providedBy));
        }
        return CadminApi.resourceLink(CadminApi.detailHref("Organization", id), refLabel(service.providedBy));
    }

    function renderBasics() {
        const identifier = (service.identifier && service.identifier[0]) || {};
        $("#hsd-basic-details").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-4">Name</dt><dd class="col-sm-8">' + esc(service.name || "—") + "</dd>" +
                '<dt class="col-sm-4">Status</dt><dd class="col-sm-8">' + statusBadge(service.active) + "</dd>" +
                '<dt class="col-sm-4">Provided by</dt><dd class="col-sm-8">' + orgHtml() + "</dd>" +
                '<dt class="col-sm-4">Appointment</dt><dd class="col-sm-8">' +
                    esc(service.appointmentRequired ? "Required" : "Not required") + "</dd>" +
                '<dt class="col-sm-4">Comment</dt><dd class="col-sm-8">' + esc(service.comment || "—") + "</dd>" +
                '<dt class="col-sm-4">Extra details</dt><dd class="col-sm-8">' + esc(service.extraDetails || "—") + "</dd>" +
                '<dt class="col-sm-4">Identifier</dt><dd class="col-sm-8">' +
                    esc(identifier.system || identifier.value
                        ? [identifier.system, identifier.value].filter(Boolean).join(" · ")
                        : "—") + "</dd>" +
                '<dt class="col-sm-4">ID</dt><dd class="col-sm-8"><code>' + esc(service.id) + "</code></dd>" +
            "</dl>"
        );
        $(".page-title").first().text(service.name || "Healthcare service");
    }

    function renderConceptTable(list, tableId, emptyText, attr) {
        if (!(list || []).length) {
            $(tableId).html(emptyRow(2, emptyText));
            return;
        }
        $(tableId).html(list.map(function (item, index) {
            return "<tr><td>" + esc(conceptLabel(item)) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" ' + attr + '="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderConcepts() {
        renderConceptTable(service.type, "#hsd-type-rows", "No types.", "data-remove-type");
        renderConceptTable(service.specialty, "#hsd-spec-rows", "No specialties.", "data-remove-spec");
    }

    function renderLocations() {
        if (!(service.location || []).length) {
            $("#hsd-loc-rows").html(emptyRow(2, "No locations."));
            return;
        }
        $("#hsd-loc-rows").html(service.location.map(function (ref) {
            return "<tr><td>" + refHref("Location", ref) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-loc="' +
                esc(refId(ref)) + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function loadEndpoints() {
        const ids = (service.endpoint || []).map(refId).filter(Boolean);
        if (!ids.length) {
            $("#hsd-ep-rows").html(emptyRow(4, "No endpoints."));
            return;
        }
        CadminApi.fhir("/Endpoint?_id=" + ids.map(encodeURIComponent).join(",") + "&_count=50").done(function (bundle) {
            const listed = bundleResources(bundle, "Endpoint");
            if (!listed.length) {
                $("#hsd-ep-rows").html(emptyRow(4, "No endpoints."));
                return;
            }
            $("#hsd-ep-rows").html(listed.map(function (ep) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink(CadminApi.detailHref("Endpoint", ep.id), ep.name || ep.id) + "</td>" +
                    "<td><code>" + esc(ep.address || "—") + "</code></td>" +
                    "<td>" + codeStatusBadge(ep.status) + "</td>" +
                    '<td class="text-end"><button class="btn btn-sm btn-outline-secondary" type="button" data-unlink-endpoint="' +
                    esc(ep.id) + '" title="Unlink" aria-label="Unlink"><i class="bi bi-x-lg"></i></button></td></tr>';
            }).join(""));
        }).fail(function (xhr) {
            $("#hsd-ep-rows").html(emptyRow(4, "Unable to load endpoints."));
            fail("Load endpoints", xhr);
        });
    }

    function contactRows() {
        const rows = [];
        (service.contact || []).forEach(function (contact, contactIndex) {
            (contact.telecom || []).forEach(function (item, telecomIndex) {
                rows.push({ contactIndex: contactIndex, telecomIndex: telecomIndex, item: item });
            });
        });
        return rows;
    }

    function renderContacts() {
        const rows = contactRows();
        if (!rows.length) {
            $("#hsd-contact-rows").html(emptyRow(3, "No contacts."));
            return;
        }
        $("#hsd-contact-rows").html(rows.map(function (entry) {
            return "<tr><td>" + esc(entry.item.system || "—") + "</td><td>" + esc(entry.item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-contact="' +
                entry.contactIndex + ":" + entry.telecomIndex +
                '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function personName(resource) {
        const name = (resource && resource.name && resource.name[0]) || {};
        const given = (name.given || []).join(" ");
        return [given, name.family].filter(Boolean).join(" ") || (resource && resource.id) || "Unnamed";
    }

    function loadRoles() {
        CadminApi.fhir("/PractitionerRole?service=" + encodeURIComponent(service.id) +
            "&_include=PractitionerRole:practitioner&_count=50").done(function (bundle) {
            const practitioners = {};
            const roles = [];
            bundleResources(bundle).forEach(function (resource) {
                if (resource.resourceType === "Practitioner") {
                    practitioners[resource.id] = resource;
                } else if (resource.resourceType === "PractitionerRole") {
                    roles.push(resource);
                }
            });
            if (!roles.length) {
                $("#hsd-role-rows").html(emptyRow(4, "No practitioner roles reference this service."));
                return;
            }
            $("#hsd-role-rows").html(roles.map(function (role) {
                const prId = refId(role.practitioner);
                const practitioner = practitioners[prId] || {};
                const name = personName(practitioner) !== "Unnamed" ? personName(practitioner) : refLabel(role.practitioner);
                const nameHtml = prId
                    ? CadminApi.resourceLink(CadminApi.detailHref("Practitioner", prId), name)
                    : esc(name);
                return "<tr><td>" + nameHtml + "</td><td>" + esc(refLabel(role.organization)) +
                    "</td><td>" + esc(conceptLabel(role.code)) + "</td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' +
                    CadminApi.detailHref("PractitionerRole", role.id) +
                    '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td></tr>';
            }).join(""));
        }).fail(function (xhr) {
            $("#hsd-role-rows").html(emptyRow(4, "Unable to load practitioner roles."));
            fail("Load practitioner roles", xhr);
        });
    }

    function saveService(next) {
        delete service.telecom;
        CadminApi.fhir("/HealthcareService/" + encodeURIComponent(service.id), "PUT", service).done(function (updated) {
            service = updated || service;
            renderBasics();
            renderConcepts();
            renderLocations();
            renderContacts();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            fail("Update healthcare service", xhr);
        });
    }

    function populateBasicForm() {
        const identifier = (service.identifier && service.identifier[0]) || {};
        $("#hsd-name").val(service.name || "");
        $("#hsd-active").prop("checked", service.active !== false);
        $("#hsd-appt").prop("checked", !!service.appointmentRequired);
        $("#hsd-comment").val(service.comment || "");
        $("#hsd-extra").val(service.extraDetails || "");
        $("#hsd-id-system").val(identifier.system || "");
        $("#hsd-id-value").val(identifier.value || "");
        CadminApi.bindOrganizationSelect("#hsd-org", {
            placeholder: "None",
            selectedId: refId(service.providedBy),
            selectedLabel: refLabel(service.providedBy)
        });
    }

    function bindForms() {
        const $root = $(CadminWorkspace.root());
        $root.off(".hsdetail");

        $root.on("click.hsdetail", "#hsd-delete", function () {
            CadminApi.confirm("Delete this healthcare service?").done(function () {
                CadminApi.fhir("/HealthcareService/" + encodeURIComponent(service.id), "DELETE").done(function () {
                    alertMsg("success", "Healthcare service deleted.");
                    window.location.hash = "#/healthcare-services";
                }).fail(function (xhr) {
                    fail("Delete healthcare service", xhr);
                });
            });
        });

        $root.on("click.hsdetail", "[data-remove-type]", function () {
            const index = Number($(this).attr("data-remove-type"));
            service.type = (service.type || []).filter(function (_item, i) { return i !== index; });
            if (!service.type.length) {
                delete service.type;
            }
            saveService(function () {
                alertMsg("success", "Type removed.");
            });
        });

        $root.on("click.hsdetail", "[data-remove-spec]", function () {
            const index = Number($(this).attr("data-remove-spec"));
            service.specialty = (service.specialty || []).filter(function (_item, i) { return i !== index; });
            if (!service.specialty.length) {
                delete service.specialty;
            }
            saveService(function () {
                alertMsg("success", "Specialty removed.");
            });
        });

        $root.on("click.hsdetail", "[data-remove-loc]", function () {
            service.location = dropRef(service.location, $(this).attr("data-remove-loc"));
            if (!service.location.length) {
                delete service.location;
            }
            saveService(function () {
                alertMsg("success", "Location removed.");
            });
        });

        $root.on("click.hsdetail", "[data-unlink-endpoint]", function () {
            service.endpoint = dropRef(service.endpoint, $(this).attr("data-unlink-endpoint"));
            if (!service.endpoint.length) {
                delete service.endpoint;
            }
            saveService(function () {
                alertMsg("success", "Endpoint unlinked.");
                loadEndpoints();
            });
        });

        $root.on("click.hsdetail", "[data-remove-contact]", function () {
            const parts = String($(this).attr("data-remove-contact") || "").split(":");
            const contactIndex = Number(parts[0]);
            const telecomIndex = Number(parts[1]);
            const contact = (service.contact || [])[contactIndex];
            if (!contact || !contact.telecom) {
                return;
            }
            contact.telecom = contact.telecom.filter(function (_item, i) { return i !== telecomIndex; });
            if (!contact.telecom.length) {
                delete contact.telecom;
            }
            service.contact = (service.contact || []).filter(function (item) {
                return (item.telecom && item.telecom.length) || item.name || item.address || item.purpose;
            });
            if (!service.contact.length) {
                delete service.contact;
            }
            saveService(function () {
                alertMsg("success", "Contact removed.");
            });
        });

        $("#hsd-basic-modal").on("show.bs.modal", populateBasicForm);
        $("#hsd-spec-modal").on("show.bs.modal", function () {
            CadminApi.fillValueSetSelect("#hsd-spec", CadminApi.valueSets.c80PracticeCodes, {
                fallback: CadminApi.valueSetFallbacks.c80PracticeCodes
            });
        });
        $("#hsd-loc-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#hsd-loc", "Location", { placeholder: "Select…" });
        });
        $("#hsd-ep-attach-modal").on("show.bs.modal", function () {
            CadminApi.bindFhirSelect("#hsd-ep-attach", "Endpoint", { placeholder: "Select…" });
        });

        $("#hsd-basic-form").on("submit", function (event) {
            event.preventDefault();
            service.name = $("#hsd-name").val().trim();
            service.active = $("#hsd-active").is(":checked");
            service.appointmentRequired = $("#hsd-appt").is(":checked") || undefined;
            if (!service.appointmentRequired) {
                delete service.appointmentRequired;
            }
            const comment = $("#hsd-comment").val().trim();
            if (comment) {
                service.comment = comment;
            } else {
                delete service.comment;
            }
            const extra = $("#hsd-extra").val().trim();
            if (extra) {
                service.extraDetails = extra;
            } else {
                delete service.extraDetails;
            }
            const orgId = CadminApi.selectValue("#hsd-org");
            if (orgId) {
                service.providedBy = {
                    reference: "Organization/" + orgId,
                    display: CadminApi.selectLabel("#hsd-org")
                };
            } else {
                delete service.providedBy;
            }
            const idSystem = $("#hsd-id-system").val().trim();
            const idValue = $("#hsd-id-value").val().trim();
            if (idSystem || idValue) {
                service.identifier = [{ system: idSystem || undefined, value: idValue || undefined }];
            } else {
                delete service.identifier;
            }
            saveService(function () {
                hideModal("hsd-basic-modal");
                alertMsg("success", "Healthcare service updated.");
            });
        });

        $("#hsd-type-form").on("submit", function (event) {
            event.preventDefault();
            const text = $("#hsd-type-text").val().trim();
            const concept = codedConcept(text);
            if (!concept) {
                return;
            }
            service.type = service.type || [];
            service.type.push(concept);
            saveService(function () {
                hideModal("hsd-type-modal");
                $("#hsd-type-text").val("");
                alertMsg("success", "Type added.");
            });
        });

        $("#hsd-spec-form").on("submit", function (event) {
            event.preventDefault();
            const code = $("#hsd-spec").val();
            const display = $("#hsd-spec option:selected").text();
            if (!code) {
                return;
            }
            const match = (CadminApi.valueSetFallbacks.c80PracticeCodes || []).find(function (item) {
                return item.code === code;
            });
            const concept = codedConcept(display, code, (match && match.system) || "http://snomed.info/sct", display);
            service.specialty = service.specialty || [];
            service.specialty.push(concept);
            saveService(function () {
                hideModal("hsd-spec-modal");
                alertMsg("success", "Specialty added.");
            });
        });

        $("#hsd-loc-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("location", "Location", CadminApi.selectValue("#hsd-loc"),
                    CadminApi.selectLabel("#hsd-loc"))) {
                return;
            }
            saveService(function () {
                hideModal("hsd-loc-modal");
                alertMsg("success", "Location added.");
            });
        });

        $("#hsd-endpoint-form").on("submit", function (event) {
            event.preventDefault();
            const conn = connectionTypes.find(function (item) { return item.code === $("#hsd-ep-type").val(); });
            const resource = {
                resourceType: "Endpoint",
                status: $("#hsd-ep-status").val() || "active",
                name: $("#hsd-ep-name").val(),
                address: $("#hsd-ep-address").val(),
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
            const orgId = refId(service.providedBy);
            if (orgId) {
                resource.managingOrganization = {
                    reference: "Organization/" + orgId,
                    display: refLabel(service.providedBy)
                };
            }
            CadminApi.fhir("/Endpoint", "POST", resource).done(function (created) {
                if (!created || !created.id) {
                    fail("Create endpoint", { status: "unknown" });
                    return;
                }
                pushRef("endpoint", "Endpoint", created.id, created.name);
                saveService(function () {
                    hideModal("hsd-endpoint-modal");
                    alertMsg("success", "Endpoint created.");
                    loadEndpoints();
                });
            }).fail(function (xhr) {
                fail("Create endpoint", xhr);
            });
        });

        $("#hsd-ep-attach-form").on("submit", function (event) {
            event.preventDefault();
            if (!pushRef("endpoint", "Endpoint", CadminApi.selectValue("#hsd-ep-attach"),
                    CadminApi.selectLabel("#hsd-ep-attach"))) {
                return;
            }
            saveService(function () {
                hideModal("hsd-ep-attach-modal");
                alertMsg("success", "Endpoint attached.");
                loadEndpoints();
            });
        });

        $("#hsd-contact-form").on("submit", function (event) {
            event.preventDefault();
            const value = $("#hsd-ct-value").val().trim();
            if (!value) {
                return;
            }
            service.contact = service.contact || [{}];
            if (!service.contact.length) {
                service.contact.push({});
            }
            const contact = service.contact[0];
            contact.telecom = contact.telecom || [];
            contact.telecom.push({
                system: $("#hsd-ct-system").val() || "phone",
                value: value
            });
            saveService(function () {
                hideModal("hsd-contact-modal");
                $("#hsd-ct-value").val("");
                alertMsg("success", "Contact added.");
            });
        });
    }

    return { render: render };
}());
