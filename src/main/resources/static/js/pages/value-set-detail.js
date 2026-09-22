window.CadminValueSetDetail = (function () {
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const includeKinds = [
        { code: "system", display: "Entire code system" },
        { code: "concepts", display: "Selected concepts" },
        { code: "valueset", display: "Another value set" }
    ];

    let valueSet = null;
    let includes = [];
    let conceptDragInclude = -1;
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

    function includeKind(include) {
        if (include.valueSet && include.valueSet.length) {
            return "valueset";
        }
        if (include.concept && include.concept.length) {
            return "concepts";
        }
        return "system";
    }

    function fromResource(resource) {
        return ((resource.compose && resource.compose.include) || []).map(function (include) {
            return {
                kind: includeKind(include),
                system: include.system || "",
                valueSet: ((include.valueSet || [])[0]) || "",
                concepts: (include.concept || []).map(function (item) {
                    return { code: item.code || "", display: item.display || "" };
                })
            };
        });
    }

    function applyMeta() {
        valueSet.title = $("#vsd-title-input").val().trim();
        const name = $("#vsd-name").val().trim();
        const url = $("#vsd-url").val().trim();
        const version = $("#vsd-version").val().trim();
        const publisher = $("#vsd-publisher").val().trim();
        const description = $("#vsd-description").val().trim();
        valueSet.status = $("#vsd-status").val() || "draft";
        if (name) {
            valueSet.name = name;
        } else {
            delete valueSet.name;
        }
        if (url) {
            valueSet.url = url;
        } else {
            delete valueSet.url;
        }
        if (version) {
            valueSet.version = version;
        } else {
            delete valueSet.version;
        }
        if (publisher) {
            valueSet.publisher = publisher;
        } else {
            delete valueSet.publisher;
        }
        if (description) {
            valueSet.description = description;
        } else {
            delete valueSet.description;
        }
    }

    function applyCompose() {
        const out = includes.map(function (row) {
            const include = {};
            if (row.kind === "valueset") {
                if (row.valueSet) {
                    include.valueSet = [row.valueSet];
                }
                return include;
            }
            if (row.system) {
                include.system = row.system;
            }
            if (row.kind === "concepts") {
                const concepts = (row.concepts || []).filter(function (item) {
                    return item && String(item.code || "").trim();
                }).map(function (item) {
                    const concept = { code: item.code.trim() };
                    if (item.display) {
                        concept.display = item.display;
                    }
                    return concept;
                });
                if (concepts.length) {
                    include.concept = concepts;
                }
            }
            return include;
        }).filter(function (include) {
            return include.system || (include.concept && include.concept.length) ||
                (include.valueSet && include.valueSet.length);
        });
        if (out.length) {
            valueSet.compose = { include: out };
        } else {
            delete valueSet.compose;
        }
        delete valueSet.expansion;
    }

    function saveValueSet(next, withMeta) {
        if (withMeta) {
            applyMeta();
        }
        applyCompose();
        CadminApi.fhir("/ValueSet/" + encodeURIComponent(valueSet.id), "PUT", valueSet)
            .done(function (updated) {
                valueSet = updated || valueSet;
                includes = fromResource(valueSet);
                renderHeader();
                renderCompose();
                CadminResourceSource.mount(function () { return valueSet; });
                CadminResourceGraph.mount(valueSet);
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                fail("Update value set", xhr);
            });
    }

    function render(resource) {
        valueSet = resource;
        includes = fromResource(valueSet);
        const $root = $(CadminWorkspace.root());
        const label = esc(valueSet.title || valueSet.name || "ValueSet");
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/value-sets">' +
                        '<i class="bi bi-arrow-left me-1"></i>Value sets</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="vsd-title">' + label + "</h1>" +
                        '<span id="vsd-status-badge">' + statusBadge(valueSet.status) + "</span>" +
                        (valueSet.id
                            ? '<code class="small" id="vsd-fhir-id">' + esc(valueSet.id) + "</code>"
                            : '<code class="small d-none" id="vsd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column cadmin-settings-nav" id="vsd-settings-nav" role="tablist">' +
                        navButton("vsd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("vsd-pane-compose", "bi bi-collection", "Compose") +
                        navButton("vsd-pane-expansion", "bi bi-arrow-repeat", "Expansion") +
                        navButton("vsd-pane-validate", "bi bi-check2-circle", "Validate code") +
                        navButton("vsd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("vsd-pane-history", "bi bi-clock-history", "History") +
                        navButton("vsd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("vsd-pane-basics",
                            '<form id="vsd-meta-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="vsd-title-input">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control" id="vsd-name">'),
                                            field("Status", '<select class="form-select" id="vsd-status">' +
                                                optionsHtml(statusOptions, "") + "</select>")) +
                                        field("URL", '<input class="form-control font-monospace" id="vsd-url">') +
                                        fieldRow(
                                            field("Version", '<input class="form-control" id="vsd-version">'),
                                            field("Publisher", '<input class="form-control" id="vsd-publisher">')) +
                                        field("Description", '<textarea class="form-control" id="vsd-description" rows="2"></textarea>') +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("vsd-pane-compose",
                            '<div class="card">' +
                                '<div class="card-header flex-wrap gap-2">' +
                                    '<h3 class="card-title mb-0">Compose</h3>' +
                                    '<div class="card-tools d-flex gap-2">' +
                                        '<button class="btn btn-sm btn-outline-primary" type="button" id="vsd-add-include">' +
                                            '<i class="bi bi-plus-lg me-1"></i>Add include</button>' +
                                        '<button class="btn btn-sm btn-primary" type="button" id="vsd-save">' +
                                            '<i class="bi bi-check2 me-1"></i>Save</button>' +
                                    "</div>" +
                                "</div>" +
                                '<div class="card-body" id="vsd-compose"></div>' +
                            "</div>") +
                        tabPane("vsd-pane-expansion",
                            '<div class="card">' +
                                '<div class="card-header flex-wrap gap-2">' +
                                    '<h3 class="card-title mb-0">Expansion preview</h3>' +
                                    '<div class="card-tools">' +
                                        '<button class="btn btn-sm btn-outline-primary" type="button" id="vsd-expand">' +
                                            '<i class="bi bi-arrow-repeat me-1"></i>Expand</button>' +
                                    "</div>" +
                                "</div>" +
                                '<div class="card-body" id="vsd-expansion"></div>' +
                            "</div>") +
                        tabPane("vsd-pane-validate",
                            '<div class="card">' +
                                '<div class="card-header"><h3 class="card-title">Validate code</h3></div>' +
                                '<div class="card-body">' +
                                    '<form class="row g-2 align-items-end" id="vsd-validate-form">' +
                                        '<div class="col-md-4"><label class="form-label" for="vsd-val-system">System</label>' +
                                            '<select class="form-select" id="vsd-val-system"></select></div>' +
                                        '<div class="col-md-3"><label class="form-label" for="vsd-val-code">Code</label>' +
                                            '<input class="form-control font-monospace" id="vsd-val-code" required></div>' +
                                        '<div class="col-md-3"><label class="form-label" for="vsd-val-display">Display (optional)</label>' +
                                            '<input class="form-control" id="vsd-val-display"></div>' +
                                        '<div class="col-md-2">' +
                                            '<button class="btn btn-outline-primary w-100" type="submit">Validate</button></div>' +
                                    "</form>" +
                                    '<div class="mt-3 d-none" id="vsd-validate-result"></div>' +
                                "</div>" +
                            "</div>") +
                        tabPane("vsd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("vsd-pane-history", CadminResourceHistory.card()) +
                        tabPane("vsd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this value set</p>' +
                                            '<small class="text-secondary">This permanently deletes the ValueSet resource.</small>' +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="vsd-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return valueSet; });
        CadminResourceGraph.mount(valueSet);
        CadminResourceHistory.mount(valueSet);
        renderHeader();
        populateMetaForm();
        renderCompose();
        $("#vsd-expansion").html('<div class="text-muted">Expand to preview codes from the current compose.</div>');
        bind();
        CadminApi.bindCodeSystemPicker("#vsd-val-system", {
            placeholder: "Code system…",
            selectedUrl: (includes[0] && includes[0].system) || "",
            allowEmpty: true
        });
    }

    function renderHeader() {
        $("#vsd-title").text(valueSet.title || valueSet.name || "ValueSet");
        $("#vsd-status-badge").html(statusBadge(valueSet.status));
        if (valueSet.id) {
            $("#vsd-fhir-id").text(valueSet.id).removeClass("d-none");
        } else {
            $("#vsd-fhir-id").text("").addClass("d-none");
        }
    }

    function populateMetaForm() {
        $("#vsd-title-input").val(valueSet.title || "");
        $("#vsd-name").val(valueSet.name || "");
        $("#vsd-url").val(valueSet.url || "");
        $("#vsd-status").val(valueSet.status || "draft");
        $("#vsd-version").val(valueSet.version || "");
        $("#vsd-publisher").val(valueSet.publisher || "");
        $("#vsd-description").val(valueSet.description || "");
        CadminApi.fillValueSetSelect("#vsd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: valueSet.status || "draft"
        });
    }

    function flushIncludeConcepts(includeIndex) {
        const row = includes[includeIndex];
        if (!row || !row.concepts) {
            return;
        }
        $('#vsd-compose [data-include-card="' + includeIndex + '"] tr[data-cindex]').each(function () {
            const cIndex = Number($(this).attr("data-cindex"));
            if (!row.concepts[cIndex]) {
                return;
            }
            row.concepts[cIndex].code = $(this).find("[data-concept-code]").val() || "";
            row.concepts[cIndex].display = $(this).find("[data-concept-display]").val() || "";
        });
    }

    function moveIncludeConcept(includeIndex, from, to) {
        flushIncludeConcepts(includeIndex);
        const list = includes[includeIndex] && includes[includeIndex].concepts;
        if (!list || from < 0 || to < 0 || from >= list.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const item = list.splice(from, 1)[0];
        list.splice(to > from ? to - 1 : to, 0, item);
        renderCompose();
    }

    function clearConceptDrag() {
        conceptDragInclude = -1;
        conceptDragFrom = -1;
        conceptDropBefore = -1;
        $("#vsd-compose tr").removeClass("is-dragging drop-before drop-after");
    }

    function conceptTable(row, index) {
        const concepts = row.concepts || [];
        return '<div class="table-responsive mt-2"><table class="table table-sm align-middle mb-2">' +
            '<thead><tr><th class="cadmin-list-grip-col"></th><th>Code</th><th>Display</th><th></th></tr></thead>' +
            '<tbody id="vsd-concept-rows-' + index + '">' +
            (concepts.length ? concepts.map(function (item, cIndex) {
                return '<tr draggable="true" data-include-index="' + index + '" data-cindex="' + cIndex + '">' +
                    '<td class="cadmin-list-grip-col">' +
                        '<span class="cadmin-list-grip" title="Drag to reorder" aria-hidden="true">' +
                            '<i class="bi bi-grip-vertical"></i></span></td>' +
                    '<td><input class="form-control form-control-sm font-monospace" data-concept-code="' +
                        index + '" data-cindex="' + cIndex + '" value="' + esc(item.code || "") + '"></td>' +
                    '<td><input class="form-control form-control-sm" data-concept-display="' +
                        index + '" data-cindex="' + cIndex + '" value="' + esc(item.display || "") + '"></td>' +
                    '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-concept="' +
                        index + '" data-cindex="' + cIndex + '"><i class="bi bi-trash"></i></button></td>' +
                    "</tr>";
            }).join("") : '<tr><td colspan="4" class="text-muted">No concepts. Add codes from this system.</td></tr>') +
            "</tbody></table></div>" +
            '<button class="btn btn-sm btn-outline-primary" type="button" data-add-concept="' +
                index + '">Add concept</button>';
    }

    function includeCard(row, index) {
        let body = field("Include",
            '<select class="form-select" data-include-kind="' + index + '">' +
                optionsHtml(includeKinds, row.kind) + "</select>");
        if (row.kind === "valueset") {
            body += field("Value set", '<select class="form-select" id="vsd-inc-vs-' + index + '"></select>');
        } else {
            body += field("Code system", '<select class="form-select" id="vsd-inc-cs-' + index + '"></select>');
            if (row.kind === "concepts") {
                body += conceptTable(row, index);
            }
        }
        return '<div class="border rounded p-3 mb-3" data-include-card="' + index + '">' +
            '<div class="d-flex justify-content-between align-items-start">' +
                '<strong>Include ' + (index + 1) + "</strong>" +
                '<button class="btn btn-sm btn-outline-danger" type="button" data-remove-include="' +
                    index + '"><i class="bi bi-trash"></i></button>' +
            "</div>" + body + "</div>";
    }

    function bindIncludePickers() {
        includes.forEach(function (row, index) {
            if (row.kind === "valueset") {
                CadminApi.bindValueSetPicker("#vsd-inc-vs-" + index, {
                    selectedUrl: row.valueSet,
                    selectedLabel: row.valueSet,
                    placeholder: "Search value sets…",
                    onChange: function (url) {
                        if (includes[index]) {
                            includes[index].valueSet = url;
                        }
                    }
                });
                return;
            }
            CadminApi.bindCodeSystemPicker("#vsd-inc-cs-" + index, {
                selectedUrl: row.system,
                selectedLabel: row.system,
                placeholder: "Search code systems…",
                onChange: function (url) {
                    if (includes[index]) {
                        includes[index].system = url;
                    }
                }
            });
        });
    }

    function renderCompose() {
        CadminApi.destroySelects("#vsd-compose");
        if (!includes.length) {
            $("#vsd-compose").html('<div class="text-muted">No includes. Add a code system, selected concepts, or another value set.</div>');
            return;
        }
        $("#vsd-compose").html(includes.map(includeCard).join(""));
        bindIncludePickers();
    }

    function parameterValue(parameters, name) {
        const match = ((parameters && parameters.parameter) || []).find(function (item) {
            return item.name === name;
        });
        if (!match) {
            return "";
        }
        return match.valueBoolean === true ? true
            : match.valueBoolean === false ? false
                : (match.valueString || match.valueCode || match.valueUri || "");
    }

    function showExpansion(expanded) {
        const $out = $("#vsd-expansion");
        const contains = ((expanded && expanded.expansion) || {}).contains || [];
        const total = expanded && expanded.expansion && expanded.expansion.total;
        if (!contains.length) {
            $out.html('<div class="text-muted">No codes in the expansion.</div>');
            return;
        }
        $out.html(
            (typeof total === "number" ? '<p class="small text-muted mb-2">' + total + " codes" +
                (contains.length < total ? " (showing " + contains.length + ")" : "") + "</p>" : "") +
            '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                "<thead><tr><th>System</th><th>Code</th><th>Display</th></tr></thead><tbody>" +
                contains.map(function (item) {
                    return "<tr><td><code class=\"small\">" + esc(item.system || "") +
                        "</code></td><td><code>" + esc(item.code || "") +
                        "</code></td><td>" + esc(item.display || "") + "</td></tr>";
                }).join("") +
                "</tbody></table></div>"
        );
    }

    function expandPreview() {
        const $out = $("#vsd-expansion");
        const url = ($("#vsd-url").val() || "").trim() || (valueSet && valueSet.url) || "";
        if (!url) {
            $out.html('<div class="text-danger">This value set has no URL to expand.</div>');
            return;
        }
        $out.html('<div class="text-muted">Expanding…</div>');
        CadminApi.fhir("/ValueSet/$expand?url=" + encodeURIComponent(url), "GET", null, { silent: true })
            .done(showExpansion)
            .fail(function (xhr) {
                $out.html('<div class="text-danger">Expand failed (' + xhr.status + ").</div>");
            });
    }

    function validateCode() {
        applyCompose();
        const system = CadminApi.selectValue("#vsd-val-system");
        const code = $("#vsd-val-code").val().trim();
        const display = $("#vsd-val-display").val().trim();
        const $result = $("#vsd-validate-result");
        if (!code) {
            alertMsg("danger", "Enter a code to validate.");
            return;
        }
        const preview = JSON.parse(JSON.stringify(valueSet));
        delete preview.id;
        delete preview.meta;
        const parameter = [
            { name: "valueSet", resource: preview },
            { name: "code", valueCode: code }
        ];
        if (system) {
            parameter.push({ name: "system", valueUri: system });
        }
        if (display) {
            parameter.push({ name: "display", valueString: display });
        }
        CadminApi.fhir("/ValueSet/$validate-code", "POST", {
            resourceType: "Parameters",
            parameter: parameter
        }, { silent: true }).done(function (parameters) {
            const ok = parameterValue(parameters, "result") === true;
            const message = parameterValue(parameters, "message") ||
                (ok ? "Code is in this value set." : "Code is not in this value set.");
            $result.removeClass("d-none alert-success alert-danger")
                .addClass("alert " + (ok ? "alert-success" : "alert-danger"))
                .text(message);
        }).fail(function (xhr) {
            $result.removeClass("d-none alert-success").addClass("alert alert-danger")
                .text("Validate failed (" + xhr.status + ").");
        });
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".vsdetail");
        $root.on("shown.bs.tab.vsdetail", "#vsd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("shown.bs.tab.vsdetail", "#vsd-pane-compose-btn", renderCompose);
        $root.on("click.vsdetail", "#vsd-save", function () {
            saveValueSet(function () {
                alertMsg("success", "Value set saved.");
            });
        });
        $root.on("click.vsdetail", "#vsd-delete", function () {
            CadminApi.confirm("Delete this value set?").done(function () {
                CadminApi.fhir("/ValueSet/" + encodeURIComponent(valueSet.id), "DELETE").done(function () {
                    alertMsg("success", "Value set deleted.");
                    window.location.hash = "#/value-sets";
                }).fail(function (xhr) {
                    fail("Delete value set", xhr);
                });
            });
        });
        $root.on("click.vsdetail", "#vsd-add-include", function () {
            includes.push({ kind: "system", system: "", valueSet: "", concepts: [] });
            renderCompose();
        });
        $root.on("click.vsdetail", "[data-remove-include]", function () {
            const index = Number($(this).attr("data-remove-include"));
            includes.splice(index, 1);
            renderCompose();
        });
        $root.on("change.vsdetail", "[data-include-kind]", function () {
            const index = Number($(this).attr("data-include-kind"));
            if (!includes[index]) {
                return;
            }
            includes[index].kind = $(this).val();
            if (includes[index].kind === "concepts" && !includes[index].concepts.length) {
                includes[index].concepts = [{ code: "", display: "" }];
            }
            renderCompose();
        });
        $root.on("click.vsdetail", "[data-add-concept]", function () {
            const index = Number($(this).attr("data-add-concept"));
            if (!includes[index]) {
                return;
            }
            includes[index].concepts = includes[index].concepts || [];
            includes[index].concepts.push({ code: "", display: "" });
            renderCompose();
        });
        $root.on("click.vsdetail", "[data-remove-concept]", function () {
            const index = Number($(this).attr("data-remove-concept"));
            const cIndex = Number($(this).attr("data-cindex"));
            if (!includes[index] || !includes[index].concepts) {
                return;
            }
            includes[index].concepts.splice(cIndex, 1);
            renderCompose();
        });
        $root.on("change.vsdetail input.vsdetail", "[data-concept-code]", function () {
            const index = Number($(this).attr("data-concept-code"));
            const cIndex = Number($(this).attr("data-cindex"));
            if (includes[index] && includes[index].concepts && includes[index].concepts[cIndex]) {
                includes[index].concepts[cIndex].code = $(this).val();
            }
        });
        $root.on("change.vsdetail input.vsdetail", "[data-concept-display]", function () {
            const index = Number($(this).attr("data-concept-display"));
            const cIndex = Number($(this).attr("data-cindex"));
            if (includes[index] && includes[index].concepts && includes[index].concepts[cIndex]) {
                includes[index].concepts[cIndex].display = $(this).val();
            }
        });
        $root.on("dragstart.vsdetail", "#vsd-compose tr[data-cindex]", function (event) {
            if ($(event.target).closest("button, input, textarea, select, a").length) {
                event.preventDefault();
                return;
            }
            conceptDragInclude = Number($(this).attr("data-include-index"));
            conceptDragFrom = Number($(this).attr("data-cindex"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", conceptDragInclude + ":" + conceptDragFrom);
            }
            $(this).addClass("is-dragging");
        });
        $root.on("dragover.vsdetail", "#vsd-compose tr[data-cindex]", function (event) {
            const includeIndex = Number($(this).attr("data-include-index"));
            if (conceptDragInclude < 0 || includeIndex !== conceptDragInclude) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $("#vsd-compose tr").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            conceptDropBefore = Number($(this).attr("data-cindex")) + (before ? 0 : 1);
        });
        $root.on("drop.vsdetail", "#vsd-compose tr[data-cindex]", function (event) {
            const includeIndex = Number($(this).attr("data-include-index"));
            if (conceptDragInclude < 0 || includeIndex !== conceptDragInclude) {
                return;
            }
            event.preventDefault();
            const from = conceptDragFrom;
            const to = conceptDropBefore;
            const include = conceptDragInclude;
            clearConceptDrag();
            moveIncludeConcept(include, from, to);
        });
        $root.on("dragend.vsdetail", "#vsd-compose tr[data-cindex]", function () {
            clearConceptDrag();
        });
        $root.on("click.vsdetail", "#vsd-expand", expandPreview);
        $root.on("submit.vsdetail", "#vsd-validate-form", function (event) {
            event.preventDefault();
            validateCode();
        });
        $("#vsd-meta-form").on("submit", function (event) {
            event.preventDefault();
            saveValueSet(function () {
                alertMsg("success", "Identity updated.");
            }, true);
        });
    }

    return {
        render: render
    };
}());
