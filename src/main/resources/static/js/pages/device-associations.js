CadminApp.register("device-associations", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("device-associations", token, function (resource, $root) {
            CadminDeviceAssociationDetail.render(resource, $root);
        }, function () {
            renderDeviceAssociationList(token);
        });
        return;
    }
    renderDeviceAssociationList("");
});

function renderDeviceAssociationList(initialQuery) {
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Device associations</h1>' +
            CadminResourceDocument.splitButton({
                label: "New association",
                modalTarget: "#create-device-association-modal",
                resourceType: "DeviceAssociation"
            }) +
        "</div>" +
        '<div id="device-association-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Assignment search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="device-association-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="device-association-query" placeholder="Device name" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Device</th><th>Subject</th><th>Status</th><th>Period</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="device-association-rows"><tr><td colspan="6" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="device-association-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-device-association-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-device-association-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create device association</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label">Device</label>' +
                            '<select class="form-select" id="dal-device" required></select></div>' +
                        '<div class="mb-3"><label class="form-label">Subject type</label>' +
                            '<select class="form-select" id="dal-subject-type">' +
                                '<option value="Patient">Patient</option>' +
                                '<option value="RelatedPerson">Caregiver</option>' +
                                '<option value="Practitioner">Practitioner</option>' +
                                '<option value="Device">Device</option>' +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label">Subject</label>' +
                            '<select class="form-select" id="dal-subject"></select></div>' +
                        '<div class="mb-3"><label class="form-label">Status</label>' +
                            '<select class="form-select" id="dal-status"></select></div>' +
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
        if (typeof cc === "string") {
            return cc || "—";
        }
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

    function statusBadge(status) {
        const code = CadminApi.conceptCode(status);
        const kind = code === "attached" || code === "implanted" ? "success"
            : code === "explanted" || code === "entered-in-error" ? "secondary"
                : "warning";
        return '<span class="badge text-bg-' + kind + '">' +
            CadminApi.escapeHtml(conceptLabel(status) || code || "—") + "</span>";
    }

    function formatPeriod(period) {
        if (!period || (!period.start && !period.end)) {
            return "—";
        }
        return [period.start || "…", period.end || "…"].join(" – ");
    }

    function bindSubject(type) {
        if (type === "Patient") {
            CadminApi.bindPatientSelect("#dal-subject", { placeholder: "Select…" });
        } else if (type === "RelatedPerson") {
            CadminApi.bindCaregiverSelect("#dal-subject", { placeholder: "Select…" });
        } else if (type === "Practitioner") {
            CadminApi.bindPractitionerSelect("#dal-subject", { placeholder: "Select…" });
        } else {
            CadminApi.bindFhirSelect("#dal-subject", type, { placeholder: "Select…" });
        }
    }

    function fillCreateForm() {
        CadminApi.bindFhirSelect("#dal-device", "Device", { placeholder: "Select…" });
        $("#dal-subject-type").val("Patient");
        bindSubject("Patient");
        CadminApi.fillValueSetSelect("#dal-status", CadminApi.valueSets.deviceAssociationStatus, {
            fallback: CadminApi.valueSetFallbacks.deviceAssociationStatus,
            selected: "attached"
        });
    }

    function codedStatus() {
        const coding = CadminApi.selectCoding("#dal-status", "http://hl7.org/fhir/deviceassociation-status");
        if (coding && coding.code) {
            return {
                coding: [{
                    system: coding.system || "http://hl7.org/fhir/deviceassociation-status",
                    code: coding.code,
                    display: coding.display
                }],
                text: coding.display
            };
        }
        const fallbacks = CadminApi.valueSetFallbacks.deviceAssociationStatus;
        const code = $("#dal-status").val() || "attached";
        const match = fallbacks.find(function (item) { return item.code === code; }) || fallbacks[2];
        return {
            coding: [{
                system: match.system,
                code: match.code,
                display: match.display
            }],
            text: match.display
        };
    }

    let listPage = 0;

    function load(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/DeviceAssociation?_sort=-_lastUpdated" +
            "&_include=DeviceAssociation:device&_include=DeviceAssociation:subject";
        const q = (query || "").trim();
        if (q) {
            path += "&device.device-name=" + encodeURIComponent(q);
        }
        const pageSize = CadminApi.listPageSize("device-associations");
        CadminDeletedList.query({ type: "DeviceAssociation", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "DeviceAssociation");
            const extras = {};
            CadminApi.bundleResources(bundle).forEach(function (resource) {
                if (resource.resourceType !== "DeviceAssociation" && resource.id) {
                    extras[resource.resourceType + "/" + resource.id] = resource;
                }
            });
            CadminApi.renderPager("#device-association-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "device-associations",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#device-association-rows").html(CadminDeletedList.emptyRow(6, "DeviceAssociation", "No device associations found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (item) {
                const deviceId = CadminApi.referenceId(item.device);
                const subjectId = CadminApi.referenceId(item.subject);
                const subjectType = ((item.subject && item.subject.reference) || "").split("/")[0];
                const includedDevice = extras["Device/" + deviceId];
                const includedSubject = subjectType ? extras[subjectType + "/" + subjectId] : null;
                const deviceLabel = includedDevice
                    ? (function () {
                        const names = includedDevice.name || includedDevice.deviceName || [];
                        const named = names[0] && (names[0].value || names[0].name);
                        return named || includedDevice.id;
                    }())
                    : refLabel(item.device);
                let subjectLabel = refLabel(item.subject);
                if (includedSubject) {
                    if (includedSubject.resourceType === "Device") {
                        const names = includedSubject.name || includedSubject.deviceName || [];
                        subjectLabel = (names[0] && (names[0].value || names[0].name)) || includedSubject.id;
                    } else if (typeof includedSubject.name === "string") {
                        subjectLabel = includedSubject.name;
                    } else {
                        const name = (includedSubject.name && includedSubject.name[0]) || {};
                        const given = (name.given || []).join(" ");
                        subjectLabel = [given, name.family].filter(Boolean).join(" ") || includedSubject.id;
                    }
                }
                const deviceHtml = deviceId
                    ? CadminApi.resourceLink("#/devices/" + encodeURIComponent(deviceId), deviceLabel || "Unnamed")
                    : CadminApi.escapeHtml(deviceLabel);
                const subjectHtml = subjectId
                    ? CadminApi.resourceLink(CadminApi.detailHref(subjectType || "Patient", subjectId), subjectLabel)
                    : CadminApi.escapeHtml(subjectLabel);
                return "<tr>" +
                    "<td>" + deviceHtml + "</td>" +
                    "<td>" + subjectHtml + "</td>" +
                    "<td>" + statusBadge(item.status) + "</td>" +
                    "<td>" + CadminApi.escapeHtml(formatPeriod(item.period)) + "</td>" +
                    "<td><code>" + CadminApi.escapeHtml(item.id) + "</code></td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="#/device-associations/' +
                        encodeURIComponent(item.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td>' +
                    "</tr>";
            });
            $("#device-association-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#device-association-pager").empty();
            $("#device-association-rows").html(
                '<tr><td colspan="6" class="text-danger">Unable to load device associations from /fhir.</td></tr>'
            );
            CadminApi.showAlert("#device-association-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#device-association-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#device-association-query").val());
    });

    $("#dal-subject-type").on("change", function () {
        bindSubject($(this).val());
    });

    $("#create-device-association-form").on("submit", function (event) {
        event.preventDefault();
        const deviceId = CadminApi.selectValue("#dal-device");
        if (!deviceId) {
            CadminApi.showToast("danger", "Select a device.");
            return;
        }
        const resource = {
            resourceType: "DeviceAssociation",
            status: codedStatus(),
            device: {
                reference: "Device/" + deviceId,
                display: CadminApi.selectLabel("#dal-device")
            }
        };
        const subjectType = $("#dal-subject-type").val();
        const subjectId = CadminApi.selectValue("#dal-subject");
        if (subjectType && subjectId) {
            resource.subject = {
                reference: subjectType + "/" + subjectId,
                display: CadminApi.selectLabel("#dal-subject")
            };
        }
        CadminApi.fhir("/DeviceAssociation", "POST", resource).done(function (created, _status, xhr) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("create-device-association-modal"));
            if (modal) {
                modal.hide();
            }
            const id = CadminApi.createdResourceId(created, xhr, "DeviceAssociation");
            CadminApi.showToast("success", "Device association created.");
            if (id) {
                window.location.hash = "#/device-associations/" + encodeURIComponent(id);
                return;
            }
            load($("#device-association-query").val());
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
        });
    });

    $("#create-device-association-modal").on("show.bs.modal", fillCreateForm);

    CadminDeletedList.bind({
        type: "DeviceAssociation",
        reload: function () { load($("#device-association-query").val(), 0); }
    });

    load(initialQuery);
}
