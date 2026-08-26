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
                renderMeta();
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
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/value-sets">' +
                        '<i class="bi bi-arrow-left me-1"></i>Value sets</a>' +
                    '<h1 class="h3 mb-0 page-title" id="vsd-title"></h1>' +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-primary" type="button" id="vsd-save">' +
                        '<i class="bi bi-check2 me-1"></i>Save</button>' +
                    '<button class="btn btn-outline-danger" type="button" id="vsd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Identity</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#vsd-meta-modal">Edit</button>' +
                "</div>" +
                '<div class="card-body" id="vsd-meta"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Compose</h6>' +
                    '<button class="btn btn-sm btn-primary" type="button" id="vsd-add-include">' +
                        '<i class="bi bi-plus-lg me-1"></i>Add include</button>' +
                "</div>" +
                '<div class="card-body" id="vsd-compose"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                    '<h6 class="m-0">Expansion preview</h6>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" id="vsd-expand">' +
                        '<i class="bi bi-arrow-repeat me-1"></i>Expand</button>' +
                "</div>" +
                '<div class="card-body" id="vsd-expansion"></div>' +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Validate code</h6></div>' +
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
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card() +
            '<div class="modal fade" id="vsd-meta-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="vsd-meta-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Edit identity</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            field("Title", '<input class="form-control" id="vsd-title-input">') +
                            field("Name", '<input class="form-control" id="vsd-name">') +
                            field("URL", '<input class="form-control font-monospace" id="vsd-url">') +
                            field("Status", '<select class="form-select" id="vsd-status">' +
                                optionsHtml(statusOptions, "") + "</select>") +
                            field("Version", '<input class="form-control" id="vsd-version">') +
                            field("Publisher", '<input class="form-control" id="vsd-publisher">') +
                            field("Description", '<textarea class="form-control" id="vsd-description" rows="2"></textarea>') +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Save</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return valueSet; });
        CadminResourceGraph.mount(valueSet);
        CadminResourceHistory.mount(valueSet);
        renderMeta();
        renderCompose();
        $("#vsd-expansion").html('<div class="text-muted">Expand to preview codes from the current compose.</div>');
        bind();
        $("#vsd-meta-modal").on("show.bs.modal", populateMetaForm);
        CadminApi.bindCodeSystemPicker("#vsd-val-system", {
            placeholder: "Code system…",
            selectedUrl: (includes[0] && includes[0].system) || "",
            allowEmpty: true
        });
    }

    function renderMeta() {
        $("#vsd-title").text(valueSet.title || valueSet.name || "ValueSet");
        $("#vsd-meta").html(
            '<dl class="row mb-0">' +
                '<dt class="col-sm-3">Title</dt><dd class="col-sm-9">' + esc(valueSet.title || "—") + "</dd>" +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + statusBadge(valueSet.status) + "</dd>" +
                '<dt class="col-sm-3">Name</dt><dd class="col-sm-9"><code>' + esc(valueSet.name || "—") + "</code></dd>" +
                '<dt class="col-sm-3">URL</dt><dd class="col-sm-9"><code>' + esc(valueSet.url || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Version</dt><dd class="col-sm-9"><code>' + esc(valueSet.version || "—") + "</code></dd>" +
                '<dt class="col-sm-3">Publisher</dt><dd class="col-sm-9">' + esc(valueSet.publisher || "—") + "</dd>" +
                '<dt class="col-sm-3">Description</dt><dd class="col-sm-9">' + esc(valueSet.description || "—") + "</dd>" +
                '<dt class="col-sm-3">ID</dt><dd class="col-sm-9"><code>' + esc(valueSet.id) + "</code></dd>" +
            "</dl>"
        );
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

    function conceptTable(row, index) {
        const concepts = row.concepts || [];
        return '<div class="table-responsive mt-2"><table class="table table-sm align-middle mb-2">' +
            "<thead><tr><th>Code</th><th>Display</th><th></th></tr></thead><tbody>" +
            (concepts.length ? concepts.map(function (item, cIndex) {
                return "<tr>" +
                    '<td><input class="form-control form-control-sm font-monospace" data-concept-code="' +
                        index + '" data-cindex="' + cIndex + '" value="' + esc(item.code || "") + '"></td>' +
                    '<td><input class="form-control form-control-sm" data-concept-display="' +
                        index + '" data-cindex="' + cIndex + '" value="' + esc(item.display || "") + '"></td>' +
                    '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-concept="' +
                        index + '" data-cindex="' + cIndex + '"><i class="bi bi-trash"></i></button></td>' +
                    "</tr>";
            }).join("") : '<tr><td colspan="3" class="text-muted">No concepts. Add codes from this system.</td></tr>') +
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
        applyCompose();
        const $out = $("#vsd-expansion");
        $out.html('<div class="text-muted">Expanding…</div>');
        const preview = JSON.parse(JSON.stringify(valueSet));
        delete preview.id;
        delete preview.meta;
        const body = {
            resourceType: "Parameters",
            parameter: [
                { name: "valueSet", resource: preview },
                { name: "count", valueInteger: 50 }
            ]
        };
        CadminApi.fhir("/ValueSet/$expand", "POST", body, { silent: true }).done(showExpansion).fail(function () {
            let path = "/ValueSet/$expand?count=50";
            if (valueSet.url) {
                path += "&url=" + encodeURIComponent(valueSet.url);
            } else if (valueSet.id) {
                path = "/ValueSet/" + encodeURIComponent(valueSet.id) + "/$expand?count=50";
            }
            CadminApi.fhir(path, "GET", null, { silent: true }).done(showExpansion).fail(function (xhr) {
                $out.html('<div class="text-danger">Expand failed (' + xhr.status + ").</div>");
            });
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
        $root.on("click.vsdetail", "#vsd-save", function () {
            saveValueSet(function () {
                alertMsg("success", "Value set saved.");
            });
        });
        $root.on("click.vsdetail", "#vsd-delete", function () {
            if (!window.confirm("Delete this value set?")) {
                return;
            }
            CadminApi.fhir("/ValueSet/" + encodeURIComponent(valueSet.id), "DELETE").done(function () {
                alertMsg("success", "Value set deleted.");
                window.location.hash = "#/value-sets";
            }).fail(function (xhr) {
                fail("Delete value set", xhr);
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
        $root.on("click.vsdetail", "#vsd-expand", expandPreview);
        $root.on("submit.vsdetail", "#vsd-validate-form", function (event) {
            event.preventDefault();
            validateCode();
        });
        $("#vsd-meta-form").on("submit", function (event) {
            event.preventDefault();
            saveValueSet(function () {
                hideModal("vsd-meta-modal");
                alertMsg("success", "Identity updated.");
            }, true);
        });
    }

    return {
        render: render
    };
}());
