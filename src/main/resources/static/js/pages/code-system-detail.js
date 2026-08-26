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

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function field(label, control) {
        return '<div class="mb-3"><label class="form-label">' + label + "</label>" + control + "</div>";
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
                renderMeta();
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
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/code-systems">' +
                        '<i class="bi bi-arrow-left me-1"></i>Code systems</a>' +
                    '<h1 class="h3 mb-0 page-title" id="csd-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-primary" type="button" id="csd-save">' +
                        '<i class="bi bi-check2 me-1"></i>Save</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="csd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Identity</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#csd-meta-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="csd-meta"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Concepts</h6>' +
                    '<button class="btn btn-sm btn-primary" type="button" id="csd-add-concept">' +
                        '<i class="bi bi-plus-lg me-1"></i>Add concept</button>' +
                "</div>" +
                '<div class="card-body" id="csd-concepts"></div>' +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="csd-meta-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="csd-meta-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Edit identity</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Title", '<input class="form-control" id="csd-title-input">') +
                            field("Name", '<input class="form-control" id="csd-name">') +
                            field("URL", '<input class="form-control font-monospace" id="csd-url">') +
                            field("Status", '<select class="form-select" id="csd-status">' +
                                optionsHtml(statusOptions, "") + "</select>") +
                            field("Content", '<select class="form-select" id="csd-content">' +
                                optionsHtml(contentOptions, "") + "</select>") +
                            field("Version", '<input class="form-control" id="csd-version">') +
                            field("Publisher", '<input class="form-control" id="csd-publisher">') +
                            field("Description", '<textarea class="form-control" id="csd-description" rows="2"></textarea>') +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Save</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return codeSystem; });
        CadminResourceGraph.mount(codeSystem);
        CadminResourceHistory.mount(codeSystem);
        renderMeta();
        renderConcepts();
        bind();
        $("#csd-meta-modal").on("show.bs.modal", populateMetaForm);
    }

    function renderMeta() {
        $("#csd-title").text(codeSystem.title || codeSystem.name || "CodeSystem");
        const companion = codeSystem.url ? CadminApi.companionValueSetUrl(codeSystem.url) : "";
        $("#csd-meta").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Title</dt><dd class="col-sm-9">' + esc(codeSystem.title || "—") + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(codeSystem.status) + "</dd>" +
                '<dt class="col-sm-3">Name</dt><dd class="col-sm-9"><code>' + esc(codeSystem.name || "—") + "</code></dd>" +
                '<dt class="col-sm-3">URL</dt><dd class="col-sm-9"><code>' + esc(codeSystem.url || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Content</dt><dd class="col-sm-9">' + esc(contentLabel(codeSystem.content)) + "</dd>" +
                '<dt class="col-sm-3">Version</dt><dd class="col-sm-9"><code>' + esc(codeSystem.version || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Publisher</dt><dd class="col-sm-9">' + esc(codeSystem.publisher || "—") + "</dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' + esc(codeSystem.description || "—") + "</dd>" +
                (companion
                    ? '<dt class="col-sm-3">Companion ValueSet</dt><dd class="col-sm-9"><code>' +
                        esc(companion) + "</code></dd>"
                    : "") +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(codeSystem.id) + "</code></dd>" +
            "</dl>"
        );
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

    function renderConcepts() {
        if (!conceptRows.length) {
            $("#csd-concepts").html('<div class="text-muted">No concepts yet. Add enumerated codes for this system.</div>');
            return;
        }
        $("#csd-concepts").html(
            '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                "<thead><tr><th>Code</th><th>Display</th><th>Definition</th><th>Parent</th><th></th></tr></thead>" +
                "<tbody>" +
                conceptRows.map(function (row, index) {
                    return "<tr>" +
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
        $root.on("click.csdetail", "#csd-save", function () {
            saveCodeSystem(function () {
                alertMsg("success", "Code system saved.");
            });
        });
        $root.on("click.csdetail", "#csd-delete", function () {
            if (!window.confirm("Delete this code system?")) {
                return;
            }
            CadminApi.fhir("/CodeSystem/" + encodeURIComponent(codeSystem.id), "DELETE").done(function () {
                alertMsg("success", "Code system deleted.");
                window.location.hash = "#/code-systems";
            }).fail(function (xhr) {
                fail("Delete code system", xhr);
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
        $("#csd-meta-form").on("submit", function (event) {
            event.preventDefault();
            saveCodeSystem(function () {
                hideModal("csd-meta-modal");
                alertMsg("success", "Identity updated.");
            }, true);
        });
    }

    return {
        render: render
    };
}());
