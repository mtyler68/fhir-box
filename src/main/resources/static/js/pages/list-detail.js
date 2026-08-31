window.CadminListDetail = (function () {
    let statusOptions = [
        { code: "current", display: "Current" },
        { code: "retired", display: "Retired" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    let modeOptions = [
        { code: "working", display: "Working" },
        { code: "snapshot", display: "Snapshot" },
        { code: "changes", display: "Changes" }
    ];
    const resourceTypeFallback = [
        "Patient", "RelatedPerson", "Practitioner", "PractitionerRole", "Organization",
        "Location", "HealthcareService", "CareTeam", "Device", "DeviceAssociation",
        "Flag", "Consent", "Encounter", "Observation", "Condition", "Procedure",
        "AllergyIntolerance", "MedicationRequest", "DiagnosticReport", "DocumentReference",
        "Endpoint", "Subscription", "SubscriptionTopic", "Questionnaire", "QuestionnaireResponse",
        "List", "Group", "Schedule", "Slot", "Appointment", "AppointmentResponse", "Task", "Coverage", "ServiceRequest",
        "ValueSet", "CodeSystem", "Library", "SearchParameter"
    ].map(function (type) {
        return { code: type, display: type };
    });

    let list = null;
    let dragFrom = -1;
    let dropBefore = -1;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function field(label, control) {
        return '<div class="mb-3"><label class="form-label">' + label + "</label>" + control + "</div>";
    }

    function hideModal(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) {
            modal.hide();
        }
    }

    function fail(action, xhr) {
        CadminApi.showAlert("#list-detail-alert", "danger", action + " failed (" + xhr.status + ").");
    }

    function subjects() {
        const subject = list && list.subject;
        if (!subject) {
            return [];
        }
        return Array.isArray(subject) ? subject : [subject];
    }

    function entries() {
        return (list && list.entry) || [];
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        return ref.display || (ref.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function refHtml(ref) {
        const type = CadminApi.referenceType(ref);
        const id = CadminApi.referenceId(ref);
        if (type && id) {
            return CadminApi.resourceLink(CadminApi.detailHref(type, id), refLabel(ref));
        }
        return esc(refLabel(ref));
    }

    function conceptLabel(cc) {
        const item = Array.isArray(cc) ? cc[0] : cc;
        if (!item) {
            return "—";
        }
        const coding = (item.coding && item.coding[0]) || item;
        return item.text || coding.display || coding.code || "—";
    }

    function statusBadge(status) {
        const kind = status === "current" ? "success"
            : status === "entered-in-error" ? "danger"
                : "secondary";
        return '<span class="badge text-bg-' + kind + '">' +
            esc(CadminApi.valueSetDisplay(statusOptions, status) || status || "—") + "</span>";
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    function toLocalInput(instant) {
        if (!instant) {
            return "";
        }
        const date = new Date(instant);
        if (isNaN(date.getTime())) {
            return "";
        }
        const pad = function (n) { return String(n).padStart(2, "0"); };
        return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
            "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }

    function listTitle() {
        return (list && (list.title || conceptLabel(list.code))) || "List";
    }

    function markUserOrdered() {
        list.orderedBy = {
            coding: [{
                system: "http://terminology.hl7.org/CodeSystem/list-order",
                code: "user",
                display: "Sorted by User"
            }]
        };
    }

    function moveEntry(from, to) {
        const rows = entries();
        if (from < 0 || to < 0 || from >= rows.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const next = rows.slice();
        const item = next.splice(from, 1)[0];
        next.splice(to > from ? to - 1 : to, 0, item);
        list.entry = next;
        markUserOrdered();
        saveList();
    }

    function clearDrag() {
        dragFrom = -1;
        dropBefore = -1;
        $("#ld-entry-rows tr").removeClass("is-dragging drop-before drop-after");
    }

    function saveList(next) {
        CadminApi.fhir("/List/" + encodeURIComponent(list.id), "PUT", list).done(function (updated) {
            list = updated || list;
            renderHeader();
            renderBasics();
            renderEntries();
            CadminResourceSource.mount(function () { return list; });
            CadminResourceGraph.mount(list);
            CadminTargetList.syncFrom(list);
            if (next) {
                next();
            }
        }).fail(function (xhr) {
            fail("Update list", xhr);
        });
    }

    function bindEntryResourceSelect(type, selectedId, selectedLabel) {
        CadminApi.destroySelect("#ld-item");
        $("#ld-item").html('<option value="">Select…</option>');
        if (!type) {
            return;
        }
        CadminApi.bindFhirSelect("#ld-item", type, {
            placeholder: "Search " + type + "…",
            selectedId: selectedId || "",
            selectedLabel: selectedLabel || ""
        });
    }

    function populateBasicsForm() {
        const subject = subjects()[0];
        $("#ld-title").val(list.title || "");
        $("#ld-code").val((list.code && list.code.text) || conceptLabel(list.code) || "");
        $("#ld-date").val(toLocalInput(list.date));
        CadminApi.fillValueSetSelect("#ld-status", CadminApi.valueSets.listStatus, {
            fallback: statusOptions,
            selected: list.status || "current",
            onConcepts: function (concepts) { statusOptions = concepts; }
        });
        CadminApi.fillValueSetSelect("#ld-mode", CadminApi.valueSets.listMode, {
            fallback: modeOptions,
            selected: list.mode || "working",
            onConcepts: function (concepts) { modeOptions = concepts; }
        });
        CadminApi.bindPatientSelect("#ld-subject", {
            placeholder: "None",
            selectedId: CadminApi.referenceId(subject),
            selectedLabel: refLabel(subject)
        });
    }

    function applyBasicsForm() {
        const title = $("#ld-title").val().trim();
        if (!title) {
            CadminApi.showToast("danger", "Enter a list title.");
            return false;
        }
        list.title = title;
        list.status = $("#ld-status").val() || "current";
        list.mode = $("#ld-mode").val() || "working";
        const purpose = $("#ld-code").val().trim();
        if (purpose) {
            list.code = { text: purpose };
        } else {
            delete list.code;
        }
        const date = $("#ld-date").val().trim();
        if (date) {
            list.date = new Date(date).toISOString();
        } else {
            delete list.date;
        }
        const subjectId = CadminApi.selectValue("#ld-subject");
        if (subjectId) {
            list.subject = [{
                reference: "Patient/" + subjectId,
                display: CadminApi.selectLabel("#ld-subject")
            }];
        } else {
            delete list.subject;
        }
        return true;
    }

    function renderHeader() {
        $("#ld-title-text").text(listTitle());
    }

    function renderBasics() {
        const subject = subjects()[0];
        $("#ld-basics").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Title</dt><dd class="col-sm-9">' + esc(list.title || "—") + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(list.status) + "</dd>" +
                '<dt class="col-sm-3">Mode</dt><dd class="col-sm-9">' +
                    esc(CadminApi.valueSetDisplay(modeOptions, list.mode) || list.mode || "—") + "</dd>" +
                '<dt class="col-sm-3">Purpose</dt><dd class="col-sm-9">' + esc(conceptLabel(list.code)) + "</dd>" +
                '<dt class="col-sm-3">Subject</dt><dd class="col-sm-9">' + refHtml(subject) + "</dd>" +
                '<dt class="col-sm-3">Date</dt><dd class="col-sm-9">' + esc(formatDate(list.date)) + "</dd>" +
                '<dt class="col-sm-3">Entries</dt><dd class="col-sm-9">' + esc(String(entries().length)) + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(list.id) + "</code></dd>" +
            "</dl>"
        );
    }

    function renderEntries() {
        const rows = entries();
        if (!rows.length) {
            $("#ld-entry-rows").html(
                '<tr><td colspan="6" class="text-muted">No entries. Add any FHIR resource to this list.</td></tr>');
            return;
        }
        $("#ld-entry-rows").html(rows.map(function (item, index) {
            const type = CadminApi.referenceType(item.item) || "—";
            const deleted = item.deleted
                ? '<span class="badge rounded-pill text-bg-danger">Deleted</span>'
                : "";
            return '<tr draggable="true" data-ld-index="' + index + '">' +
                '<td class="cadmin-list-grip-col">' +
                    '<span class="cadmin-list-grip" title="Drag to reorder" aria-hidden="true">' +
                        '<i class="bi bi-grip-vertical"></i></span></td>' +
                "<td><code>" + esc(type) + "</code></td>" +
                "<td>" +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        refHtml(item.item) + deleted +
                    "</div></td>" +
                "<td>" + esc(formatDate(item.date)) + "</td>" +
                "<td>" + esc(conceptLabel(item.flag)) + "</td>" +
                '<td class="text-end text-nowrap">' +
                    (item.deleted
                        ? '<button class="btn btn-sm btn-outline-secondary me-1" type="button" data-restore-entry="' +
                            index + '" title="Restore" aria-label="Restore">' +
                            '<i class="bi bi-arrow-counterclockwise"></i></button>'
                        : '<button class="btn btn-sm btn-outline-secondary me-1" type="button" data-soft-entry="' +
                            index + '" title="Mark deleted" aria-label="Mark deleted">' +
                            '<i class="bi bi-dash-circle"></i></button>') +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-entry="' +
                        index + '" title="Remove"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function render(resource) {
        list = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/lists">' +
                        '<i class="bi bi-arrow-left me-1"></i>Lists</a>' +
                    '<h1 class="h3 mb-0 page-title" id="ld-title-text"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="ld-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminTargetList.chooserButton(list.id, { large: true }) +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div id="list-detail-alert" class="alert d-none"></div>' +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Basics</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#ld-basic-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="ld-basics"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Entries</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#ld-entry-modal">Add</button>' +
                "</div>" +
                '<div class="card-body">' +
                    '<div class="table-responsive">' +
                        '<table class="table table-hover align-middle mb-0">' +
                            '<thead><tr><th class="cadmin-list-grip-col"></th><th>Type</th><th>Item</th>' +
                                "<th>Date</th><th>Flag</th><th></th></tr></thead>" +
                            '<tbody id="ld-entry-rows"></tbody>' +
                        "</table>" +
                    "</div>" +
                "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="ld-basic-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="ld-basic-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Edit list</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Title", '<input class="form-control" id="ld-title" required>') +
                            field("Status", '<select class="form-select" id="ld-status"></select>') +
                            field("Mode", '<select class="form-select" id="ld-mode"></select>') +
                            field("Purpose", '<input class="form-control" id="ld-code" placeholder="Optional">') +
                            field("Subject", '<select class="form-select" id="ld-subject"></select>') +
                            field("Date", '<input class="form-control" id="ld-date" type="datetime-local">') +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Save</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>" +
            '<div class="modal fade" id="ld-entry-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="ld-entry-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Add list entry</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Resource type", '<select class="form-select" id="ld-item-type" required></select>') +
                            field("Resource", '<select class="form-select" id="ld-item" required></select>') +
                            field("Date", '<input class="form-control" id="ld-item-date" type="datetime-local">') +
                            field("Flag", '<input class="form-control" id="ld-item-flag" placeholder="Optional note">') +
                            '<div class="form-check mb-0">' +
                                '<input class="form-check-input" type="checkbox" id="ld-item-deleted">' +
                                '<label class="form-check-label" for="ld-item-deleted">Marked deleted</label></div>' +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Add</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return list; });
        CadminResourceGraph.mount(list);
        CadminResourceHistory.mount(list);
        CadminApi.fillValueSetSelect("#ld-item-type", CadminApi.valueSets.resourceTypes, {
            fallback: resourceTypeFallback,
            count: 300,
            selected: "Patient",
            onConcepts: function (concepts) {
                const skip = {
                    Resource: true, DomainResource: true, CanonicalResource: true, MetadataResource: true
                };
                CadminApi.fillSelectOptions("#ld-item-type", (concepts || []).filter(function (item) {
                    return item.code && !skip[item.code];
                }), { selected: "Patient" });
            }
        });
        CadminApi.expandValueSet(CadminApi.valueSets.listStatus).done(function (concepts) {
            statusOptions = concepts;
            renderBasics();
        });
        CadminApi.expandValueSet(CadminApi.valueSets.listMode).done(function (concepts) {
            modeOptions = concepts;
            renderBasics();
        });
        renderHeader();
        renderBasics();
        renderEntries();
        bind();
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".listdetail");
        $(document).off("cadmin-target-list-updated.listdetail")
            .on("cadmin-target-list-updated.listdetail", function (_event, updated) {
                if (!updated || !list || updated.id !== list.id) {
                    return;
                }
                list = updated;
                renderHeader();
                renderBasics();
                renderEntries();
                CadminResourceSource.mount(function () { return list; });
                CadminResourceGraph.mount(list);
            });

        $("#ld-basic-modal").on("show.bs.modal", populateBasicsForm);
        $("#ld-entry-modal").on("show.bs.modal", function () {
            const type = $("#ld-item-type").val() || "Patient";
            $("#ld-item-type").val(type);
            $("#ld-item-date").val("");
            $("#ld-item-flag").val("");
            $("#ld-item-deleted").prop("checked", false);
            bindEntryResourceSelect(type);
        });
        $root.on("change.listdetail", "#ld-item-type", function () {
            bindEntryResourceSelect($(this).val());
        });

        $("#ld-basic-form").on("submit", function (event) {
            event.preventDefault();
            if (!applyBasicsForm()) {
                return;
            }
            saveList(function () {
                hideModal("ld-basic-modal");
                CadminApi.showToast("success", "List updated.");
            });
        });

        $("#ld-entry-form").on("submit", function (event) {
            event.preventDefault();
            const type = $("#ld-item-type").val();
            const id = CadminApi.selectValue("#ld-item");
            if (!type || !id) {
                CadminApi.showToast("danger", "Select a resource to add.");
                return;
            }
            const entry = {
                item: {
                    reference: type + "/" + id,
                    display: CadminApi.selectLabel("#ld-item") || (type + "/" + id)
                }
            };
            const date = $("#ld-item-date").val().trim();
            if (date) {
                entry.date = new Date(date).toISOString();
            }
            const flag = $("#ld-item-flag").val().trim();
            if (flag) {
                entry.flag = { text: flag };
            }
            if ($("#ld-item-deleted").prop("checked")) {
                entry.deleted = true;
            }
            list.entry = entries().concat([entry]);
            saveList(function () {
                hideModal("ld-entry-modal");
                CadminApi.showToast("success", "Entry added.");
            });
        });

        $root.on("dragstart.listdetail", "#ld-entry-rows tr[data-ld-index]", function (event) {
            if ($(event.target).closest("button, a").length) {
                event.preventDefault();
                return;
            }
            dragFrom = Number($(this).attr("data-ld-index"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", String(dragFrom));
            }
            $(this).addClass("is-dragging");
        });
        $root.on("dragover.listdetail", "#ld-entry-rows tr[data-ld-index]", function (event) {
            if (dragFrom < 0) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $("#ld-entry-rows tr").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            dropBefore = Number($(this).attr("data-ld-index")) + (before ? 0 : 1);
        });
        $root.on("drop.listdetail", "#ld-entry-rows tr[data-ld-index]", function (event) {
            if (dragFrom < 0) {
                return;
            }
            event.preventDefault();
            const from = dragFrom;
            const to = dropBefore;
            clearDrag();
            moveEntry(from, to);
        });
        $root.on("dragend.listdetail", "#ld-entry-rows tr[data-ld-index]", function () {
            clearDrag();
        });

        $root.on("click.listdetail", "[data-soft-entry]", function () {
            const index = Number($(this).attr("data-soft-entry"));
            if (!list.entry || !list.entry[index]) {
                return;
            }
            list.entry[index].deleted = true;
            saveList(function () {
                CadminApi.showToast("success", "Marked deleted.");
            });
        });

        $root.on("click.listdetail", "[data-restore-entry]", function () {
            const index = Number($(this).attr("data-restore-entry"));
            if (!list.entry || !list.entry[index]) {
                return;
            }
            delete list.entry[index].deleted;
            saveList(function () {
                CadminApi.showToast("success", "Entry restored.");
            });
        });

        $root.on("click.listdetail", "[data-remove-entry]", function () {
            const index = Number($(this).attr("data-remove-entry"));
            list.entry = entries().filter(function (_item, i) { return i !== index; });
            if (!list.entry.length) {
                delete list.entry;
            }
            saveList(function () {
                CadminApi.showToast("success", "Entry removed.");
            });
        });

        $root.on("click.listdetail", "#ld-delete", function () {
            CadminApi.confirm("Delete this list?").done(function () {
                CadminApi.fhir("/List/" + encodeURIComponent(list.id), "DELETE").done(function () {
                    if (CadminTargetList.isTarget(list.id)) {
                        CadminTargetList.clear();
                    }
                    CadminApi.showToast("success", "List deleted.");
                    window.location.hash = "#/lists";
                }).fail(function (xhr) {
                    fail("Delete list", xhr);
                });
            });
        });
    }

    return { render: render };
}());
