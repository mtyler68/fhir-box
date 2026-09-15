window.CadminCodeSystemDetail = (function () {
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const contentOptions = [
        { code: "complete", display: "Complete" },
        { code: "fragment", display: "Fragment" },
        { code: "example", display: "Example" },
        { code: "not-present", display: "Not present" },
        { code: "supplement", display: "Supplement" }
    ];

    let codeSystem = null;
    let conceptRows = [];
    let conceptDragFrom = -1;
    let conceptDropBefore = -1;

    function esc(value) {
        return CadminApi.escapeHtml(value);
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

    function statusLabel(code) {
        const match = statusOptions.find(function (option) { return option.code === code; });
        return match ? match.display : (code || "—");
    }

    function contentLabel(code) {
        const match = contentOptions.find(function (option) { return option.code === code; });
        return match ? match.display : (code || "—");
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success"
            : status === "retired" ? "secondary"
                : status === "draft" ? "warning"
                    : "info";
        return '<span class="badge text-bg-' + kind + '">' + esc(statusLabel(status)) + "</span>";
    }

    function alertMsg(type, message) {
        CadminApi.showToast(type, message);
    }

    function fail(action, xhr) {
        alertMsg("danger", action + " failed (" + xhr.status + ").");
    }

    function hideModal(id) {
        const el = document.getElementById(id);
        const instance = el ? bootstrap.Modal.getInstance(el) : null;
        if (instance) {
            instance.hide();
        }
    }

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const mark = item.code === selected ? " selected" : "";
            return '<option value="' + esc(item.code) + '"' + mark + ">" + esc(item.display) + "</option>";
        }).join("");
    }

    function applyMeta() {
        codeSystem.title = $("#csd-title-input").val().trim();
        const name = $("#csd-name").val().trim();
        const url = $("#csd-url").val().trim();
        const version = $("#csd-version").val().trim();
        const publisher = $("#csd-publisher").val().trim();
        const description = $("#csd-description").val().trim();
        codeSystem.status = $("#csd-status").val() || "draft";
        codeSystem.content = $("#csd-content").val() || "complete";
        if (name) {
            codeSystem.name = name;
        } else {
            delete codeSystem.name;
        }
        if (url) {
            codeSystem.url = url;
        } else {
            delete codeSystem.url;
        }
        if (version) {
            codeSystem.version = version;
        } else {
            delete codeSystem.version;
        }
        if (publisher) {
            codeSystem.publisher = publisher;
        } else {
            delete codeSystem.publisher;
        }
        if (description) {
            codeSystem.description = description;
        } else {
            delete codeSystem.description;
        }
    }

    function applyConcepts() {
        const nested = CadminApi.nestCodeSystemConcepts(conceptRows.filter(function (row) {
            return row && String(row.code || "").trim();
        }));
        if (nested.length) {
            codeSystem.concept = nested;
        } else {
            delete codeSystem.concept;
        }
    }

    function saveCodeSystem(next, withMeta) {
        if (withMeta) {
            applyMeta();
        }
        applyConcepts();
        CadminApi.fhir("/CodeSystem/" + encodeURIComponent(codeSystem.id), "PUT", codeSystem)
            .done(function (updated) {
                codeSystem = updated || codeSystem;
                conceptRows = CadminApi.flattenCodeSystemConcepts(codeSystem.concept);
                renderHeader();
                renderConcepts();
                CadminResourceSource.mount(function () { return codeSystem; });
                CadminResourceGraph.mount(codeSystem);
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                fail("Update code system", xhr);
            });
    }

    function render(resource) {
        codeSystem = resource;
        conceptRows = CadminApi.flattenCodeSystemConcepts(codeSystem.concept);
        const $root = $(CadminWorkspace.root());
        const label = esc(codeSystem.title || codeSystem.name || "CodeSystem");
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/code-systems">' +
                        '<i class="bi bi-arrow-left me-1"></i>Code systems</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="csd-title">' + label + "</h1>" +
                        '<span id="csd-status-badge">' + statusBadge(codeSystem.status) + "</span>" +
                        (codeSystem.id
                            ? '<code class="small" id="csd-fhir-id">' + esc(codeSystem.id) + "</code>"
                            : '<code class="small d-none" id="csd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column cadmin-settings-nav" id="csd-settings-nav" role="tablist">' +
                        navButton("csd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("csd-pane-concepts", "bi bi-list-ul", "Concepts") +
                        navButton("csd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("csd-pane-history", "bi bi-clock-history", "History") +
                        navButton("csd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("csd-pane-basics",
                            '<form id="csd-meta-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="csd-title-input">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control" id="csd-name">'),
                                            field("Status", '<select class="form-select" id="csd-status">' +
                                                optionsHtml(statusOptions, "") + "</select>")) +
                                        field("URL", '<input class="form-control font-monospace" id="csd-url">') +
                                        fieldRow(
                                            field("Content", '<select class="form-select" id="csd-content">' +
                                                optionsHtml(contentOptions, "") + "</select>"),
                                            field("Version", '<input class="form-control" id="csd-version">')) +
                                        field("Publisher", '<input class="form-control" id="csd-publisher">') +
                                        field("Description", '<textarea class="form-control" id="csd-description" rows="2"></textarea>') +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("csd-pane-concepts",
                            '<div class="card">' +
                                '<div class="card-header flex-wrap gap-2">' +
                                    '<h3 class="card-title mb-0">Concepts</h3>' +
                                    '<div class="card-tools d-flex gap-2">' +
                                        '<button class="btn btn-sm btn-outline-primary" type="button" id="csd-add-concept">' +
                                            '<i class="bi bi-plus-lg me-1"></i>Add concept</button>' +
                                        '<button class="btn btn-sm btn-primary" type="button" id="csd-save">' +
                                            '<i class="bi bi-check2 me-1"></i>Save</button>' +
                                    "</div>" +
                                "</div>" +
                                '<div class="card-body" id="csd-concepts"></div>' +
                            "</div>") +
                        tabPane("csd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("csd-pane-history", CadminResourceHistory.card()) +
                        tabPane("csd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this code system</p>' +
                                            '<small class="text-secondary">This permanently deletes the CodeSystem resource.</small>' +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="csd-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return codeSystem; });
        CadminResourceGraph.mount(codeSystem);
        CadminResourceHistory.mount(codeSystem);
        renderHeader();
        populateMetaForm();
        renderConcepts();
        bind();
    }

    function renderHeader() {
        $("#csd-title").text(codeSystem.title || codeSystem.name || "CodeSystem");
        $("#csd-status-badge").html(statusBadge(codeSystem.status));
        if (codeSystem.id) {
            $("#csd-fhir-id").text(codeSystem.id).removeClass("d-none");
        } else {
            $("#csd-fhir-id").text("").addClass("d-none");
        }
    }

    function populateMetaForm() {
        $("#csd-title-input").val(codeSystem.title || "");
        $("#csd-name").val(codeSystem.name || "");
        $("#csd-url").val(codeSystem.url || "");
        $("#csd-status").val(codeSystem.status || "draft");
        $("#csd-content").val(codeSystem.content || "complete");
        $("#csd-version").val(codeSystem.version || "");
        $("#csd-publisher").val(codeSystem.publisher || "");
        $("#csd-description").val(codeSystem.description || "");
        CadminApi.fillValueSetSelect("#csd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: codeSystem.status || "draft"
        });
        CadminApi.fillValueSetSelect("#csd-content", CadminApi.valueSets.codesystemContent, {
            fallback: contentOptions,
            selected: codeSystem.content || "complete"
        });
    }

    function parentOptions(currentCode) {
        return '<option value=""></option>' + conceptRows.filter(function (row) {
            return row.code && row.code !== currentCode;
        }).map(function (row) {
            return '<option value="' + esc(row.code) + '">' + esc(row.display || row.code) + "</option>";
        }).join("");
    }

    function flushConceptRows() {
        $("#csd-concept-rows tr[data-concept-index]").each(function () {
            const index = Number($(this).attr("data-concept-index"));
            if (!conceptRows[index]) {
                return;
            }
            conceptRows[index].code = $(this).find('[data-concept-field="code"]').val() || "";
            conceptRows[index].display = $(this).find('[data-concept-field="display"]').val() || "";
            conceptRows[index].definition = $(this).find('[data-concept-field="definition"]').val() || "";
            conceptRows[index].parent = $(this).find('[data-concept-field="parent"]').val() || "";
        });
    }

    function moveConcept(from, to) {
        flushConceptRows();
        if (from < 0 || to < 0 || from >= conceptRows.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const item = conceptRows.splice(from, 1)[0];
        conceptRows.splice(to > from ? to - 1 : to, 0, item);
        renderConcepts();
    }

    function clearConceptDrag() {
        conceptDragFrom = -1;
        conceptDropBefore = -1;
        $("#csd-concept-rows tr").removeClass("is-dragging drop-before drop-after");
    }

    function renderConcepts() {
        if (!conceptRows.length) {
            $("#csd-concepts").html('<div class="text-muted">No concepts yet. Add enumerated codes for this system.</div>');
            return;
        }
        $("#csd-concepts").html(
            '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                '<thead><tr><th class="cadmin-list-grip-col"></th><th>Code</th><th>Display</th>' +
                "<th>Definition</th><th>Parent</th><th></th></tr></thead>" +
                '<tbody id="csd-concept-rows">' +
                conceptRows.map(function (row, index) {
                    return '<tr draggable="true" data-concept-index="' + index + '">' +
                        '<td class="cadmin-list-grip-col">' +
                            '<span class="cadmin-list-grip" title="Drag to reorder" aria-hidden="true">' +
                                '<i class="bi bi-grip-vertical"></i></span></td>' +
                        '<td><input class="form-control form-control-sm font-monospace" data-concept-field="code" data-index="' +
                            index + '" value="' + esc(row.code || "") + '"></td>' +
                        '<td><input class="form-control form-control-sm" data-concept-field="display" data-index="' +
                            index + '" value="' + esc(row.display || "") + '"></td>' +
                        '<td><input class="form-control form-control-sm" data-concept-field="definition" data-index="' +
                            index + '" value="' + esc(row.definition || "") + '"></td>' +
                        '<td><select class="form-select form-select-sm" data-concept-field="parent" data-index="' +
                            index + '">' + parentOptions(row.code) + "</select></td>" +
                        '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-concept="' +
                            index + '"><i class="bi bi-trash"></i></button></td>' +
                        "</tr>";
                }).join("") +
                "</tbody></table></div>"
        );
        conceptRows.forEach(function (row, index) {
            const $parent = $('#csd-concepts [data-concept-field="parent"][data-index="' + index + '"]');
            $parent.val(row.parent || "");
        });
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".csdetail");
        $root.on("shown.bs.tab.csdetail", "#csd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("click.csdetail", "#csd-save", function () {
            saveCodeSystem(function () {
                alertMsg("success", "Code system saved.");
            });
        });
        $root.on("click.csdetail", "#csd-delete", function () {
            CadminApi.confirm("Delete this code system?").done(function () {
                CadminApi.fhir("/CodeSystem/" + encodeURIComponent(codeSystem.id), "DELETE").done(function () {
                    alertMsg("success", "Code system deleted.");
                    window.location.hash = "#/code-systems";
                }).fail(function (xhr) {
                    fail("Delete code system", xhr);
                });
            });
        });
        $root.on("click.csdetail", "#csd-add-concept", function () {
            conceptRows.push({ code: "", display: "", definition: "", parent: "" });
            renderConcepts();
        });
        $root.on("click.csdetail", "[data-remove-concept]", function () {
            const index = Number($(this).attr("data-remove-concept"));
            conceptRows.splice(index, 1);
            renderConcepts();
        });
        $root.on("change.csdetail input.csdetail", "[data-concept-field]", function () {
            const index = Number($(this).attr("data-index"));
            const fieldName = $(this).attr("data-concept-field");
            if (!conceptRows[index]) {
                return;
            }
            conceptRows[index][fieldName] = $(this).val();
        });
        $root.on("dragstart.csdetail", "#csd-concept-rows tr[data-concept-index]", function (event) {
            if ($(event.target).closest("button, input, textarea, select, a").length) {
                event.preventDefault();
                return;
            }
            conceptDragFrom = Number($(this).attr("data-concept-index"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", String(conceptDragFrom));
            }
            $(this).addClass("is-dragging");
        });
        $root.on("dragover.csdetail", "#csd-concept-rows tr[data-concept-index]", function (event) {
            if (conceptDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $("#csd-concept-rows tr").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            conceptDropBefore = Number($(this).attr("data-concept-index")) + (before ? 0 : 1);
        });
        $root.on("drop.csdetail", "#csd-concept-rows tr[data-concept-index]", function (event) {
            if (conceptDragFrom < 0) {
                return;
            }
            event.preventDefault();
            const from = conceptDragFrom;
            const to = conceptDropBefore;
            clearConceptDrag();
            moveConcept(from, to);
        });
        $root.on("dragend.csdetail", "#csd-concept-rows tr[data-concept-index]", function () {
            clearConceptDrag();
        });
        $("#csd-meta-form").on("submit", function (event) {
            event.preventDefault();
            saveCodeSystem(function () {
                alertMsg("success", "Identity updated.");
            }, true);
        });
    }

    return {
        render: render
    };
}());
