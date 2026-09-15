window.CadminEndpointDetail = (function () {
    const statusOptions = [
        { code: "active", display: "Active" },
        { code: "limited", display: "Limited" },
        { code: "suspended", display: "Suspended" },
        { code: "error", display: "Error" },
        { code: "off", display: "Off" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    const connectionTypes = [
        { code: "hl7-fhir-rest", display: "HL7 FHIR REST" },
        { code: "hl7-fhir-msg", display: "HL7 FHIR Messaging" },
        { code: "hl7v2-mllp", display: "HL7 v2 MLLP" },
        { code: "direct-project", display: "Direct Project" },
        { code: "secure-email", display: "Secure email" },
        { code: "ihe-xds", display: "IHE XDS" }
    ];
    const payloadTypes = [
        { code: "any", display: "Any" },
        { code: "none", display: "None" }
    ];
    const mimeTypes = [
        { code: "application/fhir+json", display: "application/fhir+json" },
        { code: "application/fhir+xml", display: "application/fhir+xml" },
        { code: "application/json", display: "application/json" },
        { code: "application/xml", display: "application/xml" }
    ];
    const contactSystems = [
        { code: "phone", display: "Phone" },
        { code: "email", display: "Email" },
        { code: "fax", display: "Fax" },
        { code: "url", display: "URL" }
    ];

    let endpoint = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function bundleResources(bundle) {
        return CadminApi.bundleResources(bundle);
    }

    function conceptLabel(cc) {
        const item = Array.isArray(cc) ? cc[0] : cc;
        if (!item) {
            return "—";
        }
        const coding = (item.coding && item.coding[0]) || item;
        return item.text || coding.display || coding.code || "—";
    }

    function currentCode(cc) {
        const item = Array.isArray(cc) ? cc[0] : cc;
        return item && item.coding && item.coding[0] ? item.coding[0].code : "";
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

    function findOption(items, code) {
        return items.find(function (item) { return item.code === code; });
    }

    function statusLabel(code) {
        const match = findOption(statusOptions, code);
        return match ? match.display : (code || "—");
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success"
            : status === "error" ? "danger"
                : status === "limited" || status === "suspended" ? "warning"
                    : "secondary";
        return '<span class="badge text-bg-' + kind + '">' + esc(statusLabel(status)) + "</span>";
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
    }

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const mark = item.code === selected ? " selected" : "";
            return '<option value="' + esc(item.code) + '"' + mark + ">" + esc(item.display) + "</option>";
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

    function fillSelect(selector, path, labelFn, selectedId) {
        const $select = $(selector);
        CadminApi.fhir(path).done(function (bundle) {
            const options = ['<option value="">None</option>'].concat(bundleResources(bundle).map(function (resource) {
                return '<option value="' + esc(resource.id) + '">' + esc(labelFn(resource)) + "</option>";
            }));
            $select.html(options.join(""));
            if (selectedId && $select.find('option[value="' + selectedId + '"]').length) {
                $select.val(selectedId);
            }
        });
    }

    function card(title, tableId, cols, addTarget, addLabel) {
        return '<div class="card mb-3">' +
            '<div class="card-header">' +
                '<h3 class="card-title">' + title + "</h3>" +
                (addTarget
                    ? '<div class="card-tools">' +
                        '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="' +
                        addTarget + '"><i class="bi bi-plus-lg me-1"></i>' + addLabel + "</button></div>"
                    : "") +
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

    function fieldRow(left, right) {
        return '<div class="row">' +
            '<div class="col-md-6">' + left + "</div>" +
            '<div class="col-md-6">' + right + "</div>" +
            "</div>";
    }

    function navButton(paneId, icon, label, opts) {
        opts = opts || {};
        const classes = ["list-group-item", "list-group-item-action", "text-start"];
        if (opts.active) {
            classes.push("active");
        }
        if (opts.danger) {
            classes.push("text-danger");
        }
        return '<button type="button" class="' + classes.join(" ") + '" id="' + paneId + '-btn" ' +
            'data-bs-toggle="pill" data-bs-target="#' + paneId + '" role="tab" aria-controls="' + paneId +
            '" aria-selected="' + (opts.active ? "true" : "false") + '">' +
            '<i class="' + icon + ' me-2" aria-hidden="true"></i>' + label +
            "</button>";
    }

    function tabPane(id, body, active) {
        return '<div class="tab-pane fade' + (active ? " show active" : "") + '" id="' + id +
            '" role="tabpanel" aria-labelledby="' + id + '-btn">' + body + "</div>";
    }

    function dropRef(list, id) {
        return (list || []).filter(function (ref) {
            return refId(ref) !== id;
        });
    }

    function saveEndpoint(next) {
        CadminApi.fhir("/Endpoint/" + encodeURIComponent(endpoint.id), "PUT", endpoint).done(function (updated) {
            endpoint = updated || endpoint;
            renderHeader();
            renderPayload();
            renderHeaders();
            renderContacts();
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            fail("Update endpoint", xhr);
        });
    }

    function render(resource) {
        endpoint = resource;
        const $root = $(CadminWorkspace.root());
        const label = esc(endpoint.name || endpoint.address || "Endpoint");
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/endpoints">' +
                        '<i class="bi bi-arrow-left me-1"></i>Endpoints</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="ed-title">' + label + "</h1>" +
                        '<span id="ed-status-badge">' + statusBadge(endpoint.status) + "</span>" +
                        (endpoint.id
                            ? '<code class="small" id="ed-fhir-id">' + esc(endpoint.id) + "</code>"
                            : '<code class="small d-none" id="ed-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column cadmin-settings-nav" id="ed-settings-nav" role="tablist">' +
                        navButton("ed-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("ed-pane-connection", "bi bi-hdd-network", "Connection") +
                        navButton("ed-pane-used", "bi bi-diagram-2", "Used by") +
                        navButton("ed-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("ed-pane-history", "bi bi-clock-history", "History") +
                        navButton("ed-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("ed-pane-basics",
                            '<form id="ed-basic-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Name", '<input class="form-control" id="ed-name" required>') +
                                        fieldRow(
                                            field("Status", '<select class="form-select" id="ed-status">' +
                                                optionsHtml(statusOptions) + "</select>"),
                                            field("Connection type", '<select class="form-select" id="ed-type">' +
                                                optionsHtml(connectionTypes) + "</select>")) +
                                        field("Address", '<input class="form-control font-monospace" id="ed-address" required placeholder="https://example.org/fhir">') +
                                        field("Description", '<textarea class="form-control" id="ed-description" rows="2"></textarea>') +
                                        field("Managing organization",
                                            '<select class="form-select" id="ed-org"><option value="">None</option></select>') +
                                        '<div class="mb-3">' +
                                            '<label class="form-label">Period</label>' +
                                            '<div class="row g-2">' +
                                                '<div class="col">' +
                                                    '<input class="form-control" id="ed-period-start" type="date" aria-label="Period start">' +
                                                "</div>" +
                                                '<div class="col">' +
                                                    '<input class="form-control" id="ed-period-end" type="date" aria-label="Period end">' +
                                                "</div>" +
                                            "</div>" +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("ed-pane-connection",
                            card("Payload", "ed-payload-rows", ["Type", "MIME type", ""], "#ed-payload-modal", "Add") +
                            card("Headers", "ed-header-rows", ["Header", ""], "#ed-header-modal", "Add") +
                            card("Contacts", "ed-contact-rows", ["System", "Value", ""], "#ed-contact-modal", "Add")) +
                        tabPane("ed-pane-used",
                            card("Used by", "ed-used-rows", ["Resource", "Name", ""], "", "")) +
                        tabPane("ed-pane-graph", CadminResourceGraph.card()) +
                        tabPane("ed-pane-history", CadminResourceHistory.card()) +
                        tabPane("ed-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this endpoint</p>' +
                                            '<small class="text-secondary">' +
                                                "It will be unlinked from organizations, locations, and healthcare services first." +
                                            "</small>" +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="ed-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>" +
            modal("ed-payload-modal", "Add payload",
                field("Type", '<select class="form-select" id="ed-pl-type">' + optionsHtml(payloadTypes) + "</select>") +
                field("MIME type", '<select class="form-select" id="ed-pl-mime">' +
                    '<option value=""></option>' + optionsHtml(mimeTypes) + "</select>"),
                "ed-payload-form") +
            modal("ed-header-modal", "Add header",
                field("Header name",
                    '<input type="text" class="form-control font-monospace" id="ed-hd-name" required ' +
                    'autocomplete="off" spellcheck="false" placeholder="X-Request-ID">') +
                field("Value",
                    '<input type="text" class="form-control font-monospace" id="ed-hd-value" ' +
                    'autocomplete="off" spellcheck="false" placeholder="Bearer …">'),
                "ed-header-form") +
            modal("ed-contact-modal", "Add contact",
                field("System", '<select class="form-select" id="ed-ct-system">' + optionsHtml(contactSystems) + "</select>") +
                field("Value", '<input class="form-control" id="ed-ct-value" required>'),
                "ed-contact-form")
        );
        CadminResourceSource.mount(function () { return endpoint; });
        CadminResourceGraph.mount(endpoint);
        CadminResourceHistory.mount(endpoint);
        renderHeader();
        populateBasicForm();
        renderPayload();
        renderHeaders();
        renderContacts();
        loadUsedBy();
        bind();
    }

    function managingHtml() {
        const ref = endpoint.managingOrganization;
        const id = refId(ref);
        if (id) {
            return '<a href="#/organizations/' + encodeURIComponent(id) + '">' + esc(refLabel(ref)) + "</a>";
        }
        return esc(refLabel(ref));
    }

    function formatPeriod(period) {
        if (!period || (!period.start && !period.end)) {
            return "—";
        }
        return [period.start || "…", period.end || "…"].join(" – ");
    }

    function renderHeader() {
        $("#ed-title").text(endpoint.name || endpoint.address || "Endpoint");
        $("#ed-status-badge").html(statusBadge(endpoint.status));
        if (endpoint.id) {
            $("#ed-fhir-id").text(endpoint.id).removeClass("d-none");
        } else {
            $("#ed-fhir-id").text("").addClass("d-none");
        }
    }

    function renderPayload() {
        const rows = endpoint.payload || [];
        if (!rows.length) {
            $("#ed-payload-rows").html(emptyRow(3, "No payload types."));
            return;
        }
        $("#ed-payload-rows").html(rows.map(function (item, index) {
            const mime = (item.mimeType || []).join(", ") || "—";
            return "<tr><td>" + esc(conceptLabel(item.type)) + "</td><td><code>" + esc(mime) + "</code></td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-payload="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderHeaders() {
        const rows = endpoint.header || [];
        if (!rows.length) {
            $("#ed-header-rows").html(emptyRow(2, "No headers."));
            return;
        }
        $("#ed-header-rows").html(rows.map(function (item, index) {
            return "<tr><td><code>" + esc(item) + "</code></td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-header="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderContacts() {
        const rows = endpoint.contact || [];
        if (!rows.length) {
            $("#ed-contact-rows").html(emptyRow(3, "No contacts."));
            return;
        }
        $("#ed-contact-rows").html(rows.map(function (item, index) {
            return "<tr><td>" + esc(item.system || "—") + "</td><td>" + esc(item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-contact="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function loadUsedBy() {
        const id = endpoint.id;
        $.when(
            CadminApi.fhir("/Organization?endpoint=" + encodeURIComponent(id) + "&_count=50&_sort=name"),
            CadminApi.fhir("/Location?endpoint=" + encodeURIComponent(id) + "&_count=50&_sort=name"),
            CadminApi.fhir("/HealthcareService?endpoint=" + encodeURIComponent(id) + "&_count=50&_sort=name")
        ).done(function (orgRes, locRes, svcRes) {
            const orgs = bundleResources(orgRes[0]);
            const locs = bundleResources(locRes[0]);
            const services = bundleResources(svcRes[0]);
            const rows = orgs.map(function (org) {
                return "<tr><td>Organization</td><td><a href=\"#/organizations/" +
                    encodeURIComponent(org.id) + '">' + esc(org.name || org.id) + "</a></td><td></td></tr>";
            }).concat(locs.map(function (loc) {
                return "<tr><td>Location</td><td><a href=\"#/locations/" +
                    encodeURIComponent(loc.id) + '">' + esc(loc.name || loc.id) + "</a></td><td></td></tr>";
            })).concat(services.map(function (item) {
                return "<tr><td>Healthcare service</td><td>" +
                    CadminApi.resourceLink(CadminApi.detailHref("HealthcareService", item.id), item.name || item.id) +
                    "</td><td></td></tr>";
            }));
            if (!rows.length) {
                $("#ed-used-rows").html(emptyRow(3, "No organizations, locations, or healthcare services reference this endpoint."));
                return;
            }
            $("#ed-used-rows").html(rows.join(""));
        }).fail(function () {
            $("#ed-used-rows").html(emptyRow(3, "Unable to load references."));
        });
    }

    function populateBasicForm() {
        $("#ed-name").val(endpoint.name || "");
        $("#ed-status").val(endpoint.status || "active");
        const typeCode = currentCode(endpoint.connectionType);
        if (typeCode && !$("#ed-type option[value='" + typeCode + "']").length) {
            $("#ed-type").append('<option value="' + esc(typeCode) + '">' +
                esc(conceptLabel(endpoint.connectionType)) + "</option>");
        }
        $("#ed-type").val(typeCode || "hl7-fhir-rest");
        $("#ed-address").val(endpoint.address || "");
        $("#ed-description").val(endpoint.description || "");
        $("#ed-period-start").val((endpoint.period && endpoint.period.start) || "");
        $("#ed-period-end").val((endpoint.period && endpoint.period.end) || "");
        CadminApi.bindOrganizationSelect("#ed-org", {
            placeholder: "None",
            selectedId: refId(endpoint.managingOrganization),
            selectedLabel: refLabel(endpoint.managingOrganization)
        });
    }

    function unlinkUsers(done) {
        const id = endpoint.id;
        $.when(
            CadminApi.fhir("/Organization?endpoint=" + encodeURIComponent(id) + "&_count=50"),
            CadminApi.fhir("/Location?endpoint=" + encodeURIComponent(id) + "&_count=50"),
            CadminApi.fhir("/HealthcareService?endpoint=" + encodeURIComponent(id) + "&_count=50")
        ).done(function (orgRes, locRes, svcRes) {
            const updates = [];
            bundleResources(orgRes[0]).forEach(function (org) {
                org.endpoint = dropRef(org.endpoint, id);
                if (!org.endpoint.length) {
                    delete org.endpoint;
                }
                updates.push(CadminApi.fhir("/Organization/" + encodeURIComponent(org.id), "PUT", org));
            });
            bundleResources(locRes[0]).forEach(function (loc) {
                loc.endpoint = dropRef(loc.endpoint, id);
                if (!loc.endpoint.length) {
                    delete loc.endpoint;
                }
                updates.push(CadminApi.fhir("/Location/" + encodeURIComponent(loc.id), "PUT", loc));
            });
            bundleResources(svcRes[0]).forEach(function (item) {
                item.endpoint = dropRef(item.endpoint, id);
                if (!item.endpoint.length) {
                    delete item.endpoint;
                }
                updates.push(CadminApi.fhir("/HealthcareService/" + encodeURIComponent(item.id), "PUT", item));
            });
            if (!updates.length) {
                done();
                return;
            }
            $.when.apply($, updates).always(done);
        }).fail(done);
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".epdetail");
        $root.on("shown.bs.tab.epdetail", "#ed-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });

        $root.on("click.epdetail", "[data-remove-payload]", function () {
            const index = Number($(this).attr("data-remove-payload"));
            endpoint.payload = (endpoint.payload || []).filter(function (_item, i) { return i !== index; });
            if (!endpoint.payload.length) {
                delete endpoint.payload;
            }
            saveEndpoint(function () {
                alertMsg("success", "Payload removed.");
            });
        });

        $root.on("click.epdetail", "[data-remove-header]", function () {
            const index = Number($(this).attr("data-remove-header"));
            endpoint.header = (endpoint.header || []).filter(function (_item, i) { return i !== index; });
            if (!endpoint.header.length) {
                delete endpoint.header;
            }
            saveEndpoint(function () {
                alertMsg("success", "Header removed.");
            });
        });

        $root.on("click.epdetail", "[data-remove-contact]", function () {
            const index = Number($(this).attr("data-remove-contact"));
            endpoint.contact = (endpoint.contact || []).filter(function (_item, i) { return i !== index; });
            if (!endpoint.contact.length) {
                delete endpoint.contact;
            }
            saveEndpoint(function () {
                alertMsg("success", "Contact removed.");
            });
        });

        $root.on("click.epdetail", "#ed-delete", function () {
            CadminApi.confirm({
                title: "Delete this endpoint?",
                text: "It will be unlinked from organizations, locations, and healthcare services first."
            }).done(function () {
                unlinkUsers(function () {
                    CadminApi.fhir("/Endpoint/" + encodeURIComponent(endpoint.id), "DELETE").done(function () {
                        alertMsg("success", "Endpoint deleted.");
                        window.location.hash = "#/endpoints";
                    }).fail(function (xhr) {
                        fail("Delete endpoint", xhr);
                    });
                });
            });
        });

        $("#ed-basic-form").on("submit", function (event) {
            event.preventDefault();
            endpoint.name = $("#ed-name").val().trim();
            endpoint.status = $("#ed-status").val() || "active";
            endpoint.address = $("#ed-address").val().trim();
            const description = $("#ed-description").val().trim();
            if (description) {
                endpoint.description = description;
            } else {
                delete endpoint.description;
            }
            const conn = findOption(connectionTypes, $("#ed-type").val()) || {
                code: $("#ed-type").val(),
                display: $("#ed-type option:selected").text()
            };
            if (conn && conn.code) {
                endpoint.connectionType = [{
                    coding: [{
                        system: "http://terminology.hl7.org/CodeSystem/endpoint-connection-type",
                        code: conn.code,
                        display: conn.display
                    }]
                }];
            }
            const orgId = CadminApi.selectValue("#ed-org");
            if (orgId) {
                endpoint.managingOrganization = {
                    reference: "Organization/" + orgId,
                    display: CadminApi.selectLabel("#ed-org")
                };
            } else {
                delete endpoint.managingOrganization;
            }
            const start = $("#ed-period-start").val();
            const end = $("#ed-period-end").val();
            if (start || end) {
                endpoint.period = {};
                if (start) {
                    endpoint.period.start = start;
                }
                if (end) {
                    endpoint.period.end = end;
                }
            } else {
                delete endpoint.period;
            }
            saveEndpoint(function () {
                alertMsg("success", "Endpoint updated.");
            });
        });

        $("#ed-payload-form").on("submit", function (event) {
            event.preventDefault();
            const type = findOption(payloadTypes, $("#ed-pl-type").val());
            const mime = $("#ed-pl-mime").val();
            const item = {
                type: [{
                    coding: [{
                        system: "http://terminology.hl7.org/CodeSystem/endpoint-payload-type",
                        code: type ? type.code : "any",
                        display: type ? type.display : "Any"
                    }]
                }]
            };
            if (mime) {
                item.mimeType = [mime];
            }
            endpoint.payload = endpoint.payload || [];
            endpoint.payload.push(item);
            saveEndpoint(function () {
                hideModal("ed-payload-modal");
                alertMsg("success", "Payload added.");
            });
        });

        $("#ed-header-form").on("submit", function (event) {
            event.preventDefault();
            const name = $("#ed-hd-name").val().trim();
            const value = $("#ed-hd-value").val().trim();
            if (!name) {
                return;
            }
            endpoint.header = endpoint.header || [];
            endpoint.header.push(value ? name + ": " + value : name);
            saveEndpoint(function () {
                hideModal("ed-header-modal");
                $("#ed-hd-name").val("");
                $("#ed-hd-value").val("");
                alertMsg("success", "Header added.");
            });
        });

        $("#ed-contact-form").on("submit", function (event) {
            event.preventDefault();
            const value = $("#ed-ct-value").val().trim();
            if (!value) {
                return;
            }
            endpoint.contact = endpoint.contact || [];
            endpoint.contact.push({
                system: $("#ed-ct-system").val() || "phone",
                value: value
            });
            saveEndpoint(function () {
                hideModal("ed-contact-modal");
                $("#ed-ct-value").val("");
                alertMsg("success", "Contact added.");
            });
        });
    }

    return {
        render: render
    };
}());
