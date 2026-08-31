window.CadminDeviceAssociationDetail = (function () {
    const STATUS_SYSTEM = "http://hl7.org/fhir/deviceassociation-status";
    const REASON_SYSTEM = "http://hl7.org/fhir/deviceassociation-status-reason";
    const OPERATION_SYSTEM = "http://hl7.org/fhir/deviceassociation-operationstatus";
    const SUBJECT_TYPES = [
        { type: "Patient", label: "Patient" },
        { type: "RelatedPerson", label: "Caregiver" },
        { type: "Practitioner", label: "Practitioner" },
        { type: "Device", label: "Device" }
    ];
    const OPERATOR_TYPES = [
        { type: "Patient", label: "Patient" },
        { type: "RelatedPerson", label: "Caregiver" },
        { type: "Practitioner", label: "Practitioner" }
    ];

    let association = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function conceptLabel(cc) {
        if (typeof cc === "string") {
            return cc || "—";
        }
        const item = Array.isArray(cc) ? cc[0] : cc;
        if (!item) {
            return "—";
        }
        const coding = (item.coding && item.coding[0]) || item;
        return item.text || coding.display || coding.code || "—";
    }

    function statusCode() {
        return CadminApi.conceptCode(association && association.status);
    }

    function statusBadge(status) {
        const code = CadminApi.conceptCode(status);
        const kind = code === "attached" || code === "implanted" ? "success"
            : code === "explanted" || code === "entered-in-error" ? "secondary"
                : "warning";
        return '<span class="badge text-bg-' + kind + '">' + esc(conceptLabel(status) || code || "—") + "</span>";
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

    function refType(ref) {
        const reference = (ref && ref.reference) || "";
        const match = reference.match(/([A-Za-z]+)\/[^/]+$/);
        return match ? match[1] : "";
    }

    function refHref(type, ref) {
        const id = refId(ref);
        if (!id) {
            return esc(refLabel(ref));
        }
        return CadminApi.resourceLink(CadminApi.detailHref(type || refType(ref), id), refLabel(ref));
    }

    function formatPeriod(period) {
        if (!period || (!period.start && !period.end)) {
            return "—";
        }
        return [period.start || "…", period.end || "…"].join(" – ");
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
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

    function card(title, tableId, cols, addTarget, addLabel) {
        return '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                "<h6 class=\"m-0\">" + title + "</h6>" +
                (addTarget
                    ? '<button class="btn btn-sm btn-primary" type="button" data-bs-toggle="modal" data-bs-target="' +
                        addTarget + '"><i class="bi bi-plus-lg me-1"></i>' + addLabel + "</button>"
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

    function codedFromSelect(selector, fallbackSystem, fallbacks) {
        const coding = CadminApi.selectCoding(selector, fallbackSystem);
        if (coding && coding.code) {
            const item = { coding: [{ code: coding.code, display: coding.display }] };
            if (coding.system) {
                item.coding[0].system = coding.system;
            }
            if (coding.display) {
                item.text = coding.display;
            }
            return item;
        }
        const code = $(selector).val();
        if (!code) {
            return null;
        }
        const match = (fallbacks || []).find(function (item) { return item.code === code; });
        return {
            coding: [{
                system: (match && match.system) || fallbackSystem,
                code: code,
                display: (match && match.display) || $(selector + " option:selected").text() || code
            }],
            text: (match && match.display) || code
        };
    }

    function bindStatusSelect(selector, selected) {
        CadminApi.fillValueSetSelect(selector, CadminApi.valueSets.deviceAssociationStatus, {
            fallback: CadminApi.valueSetFallbacks.deviceAssociationStatus,
            selected: CadminApi.conceptCode(selected) || "attached"
        });
    }

    function bindReasonSelect(selector) {
        CadminApi.fillValueSetSelect(selector, CadminApi.valueSets.deviceAssociationStatusReason, {
            fallback: CadminApi.valueSetFallbacks.deviceAssociationStatusReason,
            selected: ""
        });
    }

    function bindOperationSelect(selector, selected) {
        CadminApi.fillValueSetSelect(selector, CadminApi.valueSets.deviceAssociationOperationStatus, {
            fallback: CadminApi.valueSetFallbacks.deviceAssociationOperationStatus,
            selected: CadminApi.conceptCode(selected) || "on"
        });
    }

    function bindTypedSelect(selector, type, options) {
        const opts = options || {};
        if (type === "Patient") {
            return CadminApi.bindPatientSelect(selector, opts);
        }
        if (type === "RelatedPerson") {
            return CadminApi.bindCaregiverSelect(selector, opts);
        }
        if (type === "Practitioner") {
            return CadminApi.bindPractitionerSelect(selector, opts);
        }
        return CadminApi.bindFhirSelect(selector, type, opts);
    }

    function typeOptionsHtml(items, selected) {
        return items.map(function (item) {
            const mark = item.type === selected ? " selected" : "";
            return '<option value="' + esc(item.type) + '"' + mark + ">" + esc(item.label) + "</option>";
        }).join("");
    }

    function saveAssociation(next) {
        CadminApi.fhir("/DeviceAssociation/" + encodeURIComponent(association.id), "PUT", association)
            .done(function (updated) {
                association = updated || association;
                renderHeader();
                renderAssignment();
                renderReasons();
                renderOperations();
                renderIdentifiers();
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                fail("Update device association", xhr);
            });
    }

    function render(resource) {
        association = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/device-associations">' +
                        '<i class="bi bi-arrow-left me-1"></i>Device associations</a>' +
                    '<h1 class="h3 mb-1 page-title" id="da-title"></h1>' +
                    '<p class="text-muted mb-1" id="da-subtitle"></p>' +
                    '<p class="small mb-0" id="da-links"></p>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="da-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    "<h6 class=\"m-0\">Assignment</h6>" +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#da-assign-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="da-assign"></div>' +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Status reasons", "da-reason-rows",
                    ["Reason", ""], "#da-reason-modal", "Add") + "</div>" +
                '<div class="col-lg-6">' + card("Operations", "da-op-rows",
                    ["Status", "Operator", "Period", ""], "#da-op-modal", "Add") + "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-lg-6">' + card("Identifiers", "da-id-rows",
                    ["System", "Value", ""], "#da-id-modal", "Add") + "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            modal("da-assign-modal", "Edit assignment",
                field("Device", '<select class="form-select" id="da-device" required></select>') +
                field("Subject type", '<select class="form-select" id="da-subject-type">' +
                    '<option value="">None</option>' + typeOptionsHtml(SUBJECT_TYPES, "Patient") + "</select>") +
                field("Subject", '<select class="form-select" id="da-subject"></select>') +
                field("Status", '<select class="form-select" id="da-status" required></select>') +
                '<div class="row"><div class="col-md-6 mb-0"><label class="form-label">Period start</label>' +
                    '<input class="form-control" id="da-start" type="date"></div>' +
                    '<div class="col-md-6 mb-0"><label class="form-label">Period end</label>' +
                    '<input class="form-control" id="da-end" type="date"></div></div>',
                "da-assign-form") +
            modal("da-reason-modal", "Add status reason",
                field("Reason", '<select class="form-select" id="da-reason" required></select>'),
                "da-reason-form") +
            modal("da-op-modal", "Add operation",
                field("Operational status", '<select class="form-select" id="da-op-status" required></select>') +
                field("Operator type", '<select class="form-select" id="da-op-type">' +
                    '<option value="">None</option>' + typeOptionsHtml(OPERATOR_TYPES, "Patient") + "</select>") +
                field("Operator", '<select class="form-select" id="da-op-person"></select>') +
                '<div class="row"><div class="col-md-6 mb-0"><label class="form-label">Period start</label>' +
                    '<input class="form-control" id="da-op-start" type="date"></div>' +
                    '<div class="col-md-6 mb-0"><label class="form-label">Period end</label>' +
                    '<input class="form-control" id="da-op-end" type="date"></div></div>',
                "da-op-form") +
            modal("da-id-modal", "Add identifier",
                field("System", '<input class="form-control font-monospace" id="da-id-system">') +
                field("Value", '<input class="form-control" id="da-id-value" required>'),
                "da-id-form")
        );
        CadminResourceSource.mount(function () { return association; });
        CadminResourceGraph.mount(association);
        CadminResourceHistory.mount(association);
        renderHeader();
        renderAssignment();
        renderReasons();
        renderOperations();
        renderIdentifiers();
        resolveDisplays();
        bind();
        $("#da-assign-modal").on("show.bs.modal", populateAssignForm);
        $("#da-subject-type").on("change", function () {
            bindTypedSelect("#da-subject", $(this).val(), { placeholder: "Select…" });
        });
        $("#da-reason-modal").on("show.bs.modal", function () {
            bindReasonSelect("#da-reason");
        });
        $("#da-op-modal").on("show.bs.modal", function () {
            bindOperationSelect("#da-op-status", "on");
            $("#da-op-type").val("Patient");
            bindTypedSelect("#da-op-person", "Patient", { placeholder: "Select…" });
        });
        $("#da-op-type").on("change", function () {
            const type = $(this).val();
            if (type) {
                bindTypedSelect("#da-op-person", type, { placeholder: "Select…" });
            } else {
                CadminApi.destroySelect("#da-op-person");
                $("#da-op-person").html('<option value="">None</option>');
            }
        });
    }

    function renderHeader() {
        const device = refLabel(association.device);
        const status = conceptLabel(association.status);
        $("#da-title").text(
            (device && device !== "—" ? device : "Device") + " · " +
            (status && status !== "—" ? status : (statusCode() || "Association"))
        );
        $("#da-subtitle").html(
            statusBadge(association.status) +
            '<span class="ms-2">' + esc(refLabel(association.subject)) + "</span>" +
            '<span class="ms-2">' + esc(formatPeriod(association.period)) + "</span>"
        );
        const links = [];
        const deviceId = refId(association.device);
        const subjectId = refId(association.subject);
        const subjectKind = refType(association.subject);
        if (deviceId) {
            links.push('<a href="#/devices/' + encodeURIComponent(deviceId) + '">Device</a>');
        }
        if (subjectId && subjectKind) {
            links.push('<a href="' + CadminApi.detailHref(subjectKind, subjectId) + '">Subject</a>');
        }
        $("#da-links").html(links.join(" · "));
    }

    function renderAssignment() {
        const body = association.bodyStructure
            ? refHref("BodyStructure", association.bodyStructure)
            : "—";
        $("#da-assign").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Device</dt><dd class="col-sm-9">' +
                    refHref("Device", association.device) + "</dd>" +
                '<dt class="col-sm-3">Subject</dt><dd class="col-sm-9">' +
                    refHref(refType(association.subject), association.subject) + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(association.status) + "</dd>" +
                '<dt class="col-sm-3">Period</dt><dd class="col-sm-9">' + esc(formatPeriod(association.period)) + "</dd>" +
                '<dt class="col-sm-3">Body structure</dt><dd class="col-sm-9">' + body + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(association.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function renderReasons() {
        const rows = association.statusReason || [];
        if (!rows.length) {
            $("#da-reason-rows").html(emptyRow(2, "No status reasons."));
            return;
        }
        $("#da-reason-rows").html(rows.map(function (item, index) {
            return "<tr><td>" + esc(conceptLabel(item)) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-reason="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function operatorLabel(operation) {
        const operators = operation.operator || [];
        if (!operators.length) {
            return "—";
        }
        return operators.map(function (ref) {
            return refHref(refType(ref), ref);
        }).join(", ");
    }

    function renderOperations() {
        const rows = association.operation || [];
        if (!rows.length) {
            $("#da-op-rows").html(emptyRow(4, "No operations."));
            return;
        }
        $("#da-op-rows").html(rows.map(function (item, index) {
            return "<tr><td>" + esc(conceptLabel(item.status)) + "</td><td>" + operatorLabel(item) +
                "</td><td>" + esc(formatPeriod(item.period)) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-op="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderIdentifiers() {
        const rows = association.identifier || [];
        if (!rows.length) {
            $("#da-id-rows").html(emptyRow(3, "No identifiers."));
            return;
        }
        $("#da-id-rows").html(rows.map(function (item, index) {
            return "<tr><td><code>" + esc(item.system || "—") + "</code></td><td>" + esc(item.value || "—") + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-id="' +
                index + '" title="Remove" aria-label="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function resolveDisplays() {
        const deviceId = refId(association.device);
        if (deviceId) {
            CadminApi.fhir("/Device/" + encodeURIComponent(deviceId)).done(function (resource) {
                association.device = association.device || {};
                const names = resource.name || resource.deviceName || [];
                const preferred = names.find(function (item) { return item.display === true; })
                    || names.find(function (item) { return item.type === "user-friendly-name"; })
                    || names[0];
                association.device.display = (preferred && (preferred.value || preferred.name))
                    || [resource.manufacturer, resource.modelNumber].filter(Boolean).join(" ")
                    || resource.id;
                renderHeader();
                renderAssignment();
            });
        }
        const subjectId = refId(association.subject);
        const subjectKind = refType(association.subject);
        if (subjectId && subjectKind) {
            CadminApi.fhir("/" + subjectKind + "/" + encodeURIComponent(subjectId)).done(function (resource) {
                association.subject = association.subject || {};
                if (subjectKind === "Device") {
                    const names = resource.name || resource.deviceName || [];
                    association.subject.display = (names[0] && (names[0].value || names[0].name))
                        || resource.id;
                } else if (resource.name && typeof resource.name === "string") {
                    association.subject.display = resource.name;
                } else {
                    const name = (resource.name && resource.name[0]) || {};
                    const given = (name.given || []).join(" ");
                    association.subject.display = [given, name.family].filter(Boolean).join(" ")
                        || resource.id;
                }
                renderHeader();
                renderAssignment();
            });
        }
    }

    function populateAssignForm() {
        CadminApi.bindFhirSelect("#da-device", "Device", {
            placeholder: "Select…",
            selectedId: refId(association.device),
            selectedLabel: refLabel(association.device)
        });
        const type = refType(association.subject) || "";
        $("#da-subject-type").val(type);
        if (type) {
            bindTypedSelect("#da-subject", type, {
                placeholder: "Select…",
                selectedId: refId(association.subject),
                selectedLabel: refLabel(association.subject)
            });
        } else {
            CadminApi.destroySelect("#da-subject");
            $("#da-subject").html('<option value="">None</option>');
        }
        bindStatusSelect("#da-status", association.status);
        $("#da-start").val((association.period && association.period.start) || "");
        $("#da-end").val((association.period && association.period.end) || "");
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".dadetail");

        $root.on("click.dadetail", "[data-remove-reason]", function () {
            const index = Number($(this).attr("data-remove-reason"));
            association.statusReason = (association.statusReason || []).filter(function (_item, i) {
                return i !== index;
            });
            if (!association.statusReason.length) {
                delete association.statusReason;
            }
            saveAssociation(function () { alertMsg("success", "Status reason removed."); });
        });

        $root.on("click.dadetail", "[data-remove-op]", function () {
            const index = Number($(this).attr("data-remove-op"));
            association.operation = (association.operation || []).filter(function (_item, i) {
                return i !== index;
            });
            if (!association.operation.length) {
                delete association.operation;
            }
            saveAssociation(function () { alertMsg("success", "Operation removed."); });
        });

        $root.on("click.dadetail", "[data-remove-id]", function () {
            const index = Number($(this).attr("data-remove-id"));
            association.identifier = (association.identifier || []).filter(function (_item, i) {
                return i !== index;
            });
            if (!association.identifier.length) {
                delete association.identifier;
            }
            saveAssociation(function () { alertMsg("success", "Identifier removed."); });
        });

        $root.on("click.dadetail", "#da-delete", function () {
            CadminApi.confirm("Delete this device association?").done(function () {
                CadminApi.fhir("/DeviceAssociation/" + encodeURIComponent(association.id), "DELETE").done(function () {
                    alertMsg("success", "Device association deleted.");
                    window.location.hash = "#/device-associations";
                }).fail(function (xhr) {
                    fail("Delete device association", xhr);
                });
            });
        });

        $("#da-assign-form").on("submit", function (event) {
            event.preventDefault();
            const deviceId = CadminApi.selectValue("#da-device");
            if (!deviceId) {
                alertMsg("danger", "Select a device.");
                return;
            }
            association.device = {
                reference: "Device/" + deviceId,
                display: CadminApi.selectLabel("#da-device")
            };
            const subjectKind = $("#da-subject-type").val();
            const subjectId = CadminApi.selectValue("#da-subject");
            if (subjectKind && subjectId) {
                association.subject = {
                    reference: subjectKind + "/" + subjectId,
                    display: CadminApi.selectLabel("#da-subject")
                };
            } else {
                delete association.subject;
            }
            const status = codedFromSelect("#da-status", STATUS_SYSTEM,
                CadminApi.valueSetFallbacks.deviceAssociationStatus);
            if (!status) {
                alertMsg("danger", "Select a status.");
                return;
            }
            association.status = status;
            const start = $("#da-start").val();
            const end = $("#da-end").val();
            if (start || end) {
                association.period = {};
                if (start) {
                    association.period.start = start;
                }
                if (end) {
                    association.period.end = end;
                }
            } else {
                delete association.period;
            }
            saveAssociation(function () {
                hideModal("da-assign-modal");
                alertMsg("success", "Assignment updated.");
            });
        });

        $("#da-reason-form").on("submit", function (event) {
            event.preventDefault();
            const reason = codedFromSelect("#da-reason", REASON_SYSTEM,
                CadminApi.valueSetFallbacks.deviceAssociationStatusReason);
            if (!reason) {
                alertMsg("danger", "Select a reason.");
                return;
            }
            association.statusReason = association.statusReason || [];
            association.statusReason.push(reason);
            saveAssociation(function () {
                hideModal("da-reason-modal");
                alertMsg("success", "Status reason added.");
            });
        });

        $("#da-op-form").on("submit", function (event) {
            event.preventDefault();
            const status = codedFromSelect("#da-op-status", OPERATION_SYSTEM,
                CadminApi.valueSetFallbacks.deviceAssociationOperationStatus);
            if (!status) {
                alertMsg("danger", "Select an operational status.");
                return;
            }
            const operation = { status: status };
            const type = $("#da-op-type").val();
            const personId = CadminApi.selectValue("#da-op-person");
            if (type && personId) {
                operation.operator = [{
                    reference: type + "/" + personId,
                    display: CadminApi.selectLabel("#da-op-person")
                }];
            }
            const start = $("#da-op-start").val();
            const end = $("#da-op-end").val();
            if (start || end) {
                operation.period = {};
                if (start) {
                    operation.period.start = start;
                }
                if (end) {
                    operation.period.end = end;
                }
            }
            association.operation = association.operation || [];
            association.operation.push(operation);
            saveAssociation(function () {
                hideModal("da-op-modal");
                alertMsg("success", "Operation added.");
            });
        });

        $("#da-id-form").on("submit", function (event) {
            event.preventDefault();
            const identifier = { value: $("#da-id-value").val().trim() };
            const system = $("#da-id-system").val().trim();
            if (system) {
                identifier.system = system;
            }
            association.identifier = association.identifier || [];
            association.identifier.push(identifier);
            saveAssociation(function () {
                hideModal("da-id-modal");
                alertMsg("success", "Identifier added.");
            });
        });
    }

    return { render: render };
}());
