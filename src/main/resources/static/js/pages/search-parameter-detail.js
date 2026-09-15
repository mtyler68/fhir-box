window.CadminSearchParameterDetail = (function () {
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const typeOptions = [
        { code: "string", display: "String" },
        { code: "token", display: "Token" },
        { code: "reference", display: "Reference" },
        { code: "date", display: "Date" },
        { code: "number", display: "Number" },
        { code: "quantity", display: "Quantity" },
        { code: "uri", display: "URI" },
        { code: "composite", display: "Composite" },
        { code: "special", display: "Special" }
    ];
    const processingOptions = [
        { code: "", display: "Unspecified" },
        { code: "normal", display: "Normal" },
        { code: "phonetic", display: "Phonetic" },
        { code: "other", display: "Other" }
    ];
    const comparatorOptions = [
        { code: "eq", display: "eq" }, { code: "ne", display: "ne" },
        { code: "gt", display: "gt" }, { code: "lt", display: "lt" },
        { code: "ge", display: "ge" }, { code: "le", display: "le" },
        { code: "sa", display: "sa" }, { code: "eb", display: "eb" }, { code: "ap", display: "ap" }
    ];
    const modifierOptions = [
        { code: "missing", display: "missing" }, { code: "exact", display: "exact" },
        { code: "contains", display: "contains" }, { code: "not", display: "not" },
        { code: "text", display: "text" }, { code: "in", display: "in" },
        { code: "not-in", display: "not-in" }, { code: "below", display: "below" },
        { code: "above", display: "above" }, { code: "type", display: "type" },
        { code: "identifier", display: "identifier" }, { code: "of-type", display: "of-type" },
        { code: "code-text", display: "code-text" }, { code: "text-advanced", display: "text-advanced" },
        { code: "iterate", display: "iterate" }
    ];
    const baseFallback = [
        "Patient", "Practitioner", "PractitionerRole", "Organization", "Location",
        "Encounter", "Observation", "Condition", "Procedure", "AllergyIntolerance",
        "MedicationRequest", "DiagnosticReport", "DocumentReference", "Library",
        "SearchParameter", "Questionnaire", "ValueSet", "CodeSystem", "Appointment",
        "Coverage", "Device", "DeviceAssociation", "CareTeam", "Group", "HealthcareService",
        "RelatedPerson", "Task", "Subscription", "SubscriptionTopic", "Consent", "Flag",
        "List", "Endpoint", "OrganizationAffiliation"
    ].map(function (type) { return { code: type, display: type }; });

    let searchParameter = null;
    let resourceTypes = baseFallback.slice();

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

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const code = item.code != null ? item.code : item;
            const display = item.display != null ? item.display : item;
            const mark = code === selected ? " selected" : "";
            return '<option value="' + esc(code) + '"' + mark + ">" + esc(display) + "</option>";
        }).join("");
    }

    function labelOf(items, code) {
        const match = (items || []).find(function (item) { return item.code === code; });
        return match ? match.display : (code || "—");
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success"
            : status === "retired" ? "secondary"
                : status === "draft" ? "warning"
                    : "info";
        return '<span class="badge text-bg-' + kind + '">' + esc(labelOf(statusOptions, status)) + "</span>";
    }

    function hideModal(id) {
        const el = document.getElementById(id);
        const instance = el ? bootstrap.Modal.getInstance(el) : null;
        if (instance) {
            instance.hide();
        }
    }

    function fail(action, xhr) {
        CadminApi.showToast("danger", action + " failed (" + xhr.status + ").");
    }

    function selectedChecks(name) {
        const values = [];
        $('input[name="' + name + '"]:checked').each(function () {
            values.push($(this).val());
        });
        return values;
    }

    function emptyRow(cols, text) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + text + "</td></tr>";
    }

    function setList(name, values) {
        if (values && values.length) {
            searchParameter[name] = values;
        } else {
            delete searchParameter[name];
        }
    }

    function setOptional(name, value) {
        if (value) {
            searchParameter[name] = value;
        } else {
            delete searchParameter[name];
        }
    }

    function applyIdentity() {
        searchParameter.name = $("#spd-name").val().trim() || searchParameter.name;
        searchParameter.status = $("#spd-status").val() || "draft";
        setOptional("title", $("#spd-title-input").val().trim());
        setOptional("url", $("#spd-url").val().trim());
        setOptional("version", $("#spd-version").val().trim());
        setOptional("publisher", $("#spd-publisher").val().trim());
        setOptional("description", $("#spd-description").val().trim());
        setOptional("purpose", $("#spd-purpose").val().trim());
        setOptional("derivedFrom", $("#spd-derived").val().trim());
        if ($("#spd-experimental").is(":checked")) {
            searchParameter.experimental = true;
        } else {
            delete searchParameter.experimental;
        }
    }

    function applyDefinition() {
        searchParameter.code = $("#spd-code").val().trim() || searchParameter.code;
        searchParameter.type = $("#spd-type").val() || searchParameter.type;
        searchParameter.base = selectedChecks("spd-base");
        setOptional("expression", $("#spd-expression").val().trim());
        setOptional("processingMode", $("#spd-processing").val());
        setOptional("constraint", $("#spd-constraint").val().trim());
        delete searchParameter.xpath;
        delete searchParameter.xpathUsage;
    }

    function applyBehavior() {
        const multipleOr = $("#spd-multiple-or").val();
        const multipleAnd = $("#spd-multiple-and").val();
        if (multipleOr === "true") {
            searchParameter.multipleOr = true;
        } else if (multipleOr === "false") {
            searchParameter.multipleOr = false;
        } else {
            delete searchParameter.multipleOr;
        }
        if (multipleAnd === "true") {
            searchParameter.multipleAnd = true;
        } else if (multipleAnd === "false") {
            searchParameter.multipleAnd = false;
        } else {
            delete searchParameter.multipleAnd;
        }
        setList("comparator", selectedChecks("spd-cmp"));
        setList("modifier", selectedChecks("spd-mod"));
        const chains = [];
        $("#spd-chain-rows [data-chain]").each(function () {
            const value = $(this).val().trim();
            if (value) {
                chains.push(value);
            }
        });
        setList("chain", chains);
        const targets = [];
        $("#spd-target-rows [data-target]").each(function () {
            const value = $(this).val();
            if (value) {
                targets.push(value);
            }
        });
        setList("target", targets);
        const components = [];
        $("#spd-component-rows tr").each(function () {
            const definition = $(this).find("[data-component-def]").val();
            const expression = $(this).find("[data-component-expr]").val();
            if (definition || expression) {
                const item = {};
                if (definition) {
                    item.definition = definition.trim();
                }
                if (expression) {
                    item.expression = expression.trim();
                }
                components.push(item);
            }
        });
        if (components.length) {
            searchParameter.component = components;
        } else {
            delete searchParameter.component;
        }
    }

    function save(next) {
        applyIdentity();
        applyDefinition();
        applyBehavior();
        if (!searchParameter.name || !searchParameter.code || !searchParameter.description
                || !(searchParameter.base && searchParameter.base.length) || !searchParameter.type
                || !searchParameter.url) {
            CadminApi.showToast("danger", "URL, name, description, code, type, and at least one base are required.");
            return;
        }
        CadminApi.fhir("/SearchParameter/" + encodeURIComponent(searchParameter.id), "PUT", searchParameter)
            .done(function (updated) {
                searchParameter = updated || searchParameter;
                renderHeader();
                renderBehavior();
                CadminResourceSource.mount(function () { return searchParameter; });
                CadminResourceGraph.mount(searchParameter);
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                fail("Update search parameter", xhr);
            });
    }

    function render(resource) {
        searchParameter = resource;
        const $root = $(CadminWorkspace.root());
        const label = esc(searchParameter.title || searchParameter.name || searchParameter.code || "SearchParameter");
        $root.html(
            '<div class="d-flex align-items-center justify-content-between mb-3">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/search-parameters">' +
                        '<i class="bi bi-arrow-left me-1"></i>Search parameters</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="mb-0 fs-3 page-title" id="spd-title">' + label + "</h1>" +
                        '<span id="spd-status-badge">' + statusBadge(searchParameter.status) + "</span>" +
                        (searchParameter.id
                            ? '<code class="small" id="spd-fhir-id">' + esc(searchParameter.id) + "</code>"
                            : '<code class="small d-none" id="spd-fhir-id"></code>') +
                        CadminApi.unsavedFlagHtml() +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="row g-3">' +
                '<div class="col-md-3">' +
                    '<div class="list-group list-group-flush nav nav-pills flex-column cadmin-settings-nav" id="spd-settings-nav" role="tablist">' +
                        navButton("spd-pane-basics", "bi bi-info-circle", "Basics", { active: true }) +
                        navButton("spd-pane-definition", "bi bi-sliders", "Definition") +
                        navButton("spd-pane-behavior", "bi bi-toggles", "Behavior") +
                        navButton("spd-pane-graph", "bi bi-diagram-3", "Reference graph") +
                        navButton("spd-pane-history", "bi bi-clock-history", "History") +
                        navButton("spd-pane-danger", "bi bi-exclamation-triangle", "Danger zone", { danger: true }) +
                    "</div>" +
                "</div>" +
                '<div class="col-md-9">' +
                    '<div class="tab-content">' +
                        tabPane("spd-pane-basics",
                            '<form id="spd-identity-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Basics</h3></div>' +
                                    '<div class="card-body">' +
                                        field("Title", '<input class="form-control" id="spd-title-input">') +
                                        fieldRow(
                                            field("Name", '<input class="form-control font-monospace" id="spd-name" required>'),
                                            field("Status", '<select class="form-select" id="spd-status">' +
                                                optionsHtml(statusOptions, "") + "</select>")) +
                                        field("URL", '<input class="form-control font-monospace" id="spd-url" required>') +
                                        fieldRow(
                                            field("Version", '<input class="form-control" id="spd-version">'),
                                            field("Publisher", '<input class="form-control" id="spd-publisher">')) +
                                        field("Description", '<textarea class="form-control" id="spd-description" rows="3" required></textarea>') +
                                        field("Purpose", '<textarea class="form-control" id="spd-purpose" rows="2"></textarea>') +
                                        field("Derived from", '<input class="form-control font-monospace" id="spd-derived" placeholder="Canonical SearchParameter URL">') +
                                        '<div class="form-check mb-3">' +
                                            '<input class="form-check-input" type="checkbox" id="spd-experimental">' +
                                            '<label class="form-check-label" for="spd-experimental">Experimental</label>' +
                                        "</div>" +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>",
                            true) +
                        tabPane("spd-pane-definition",
                            '<form id="spd-definition-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Definition</h3></div>' +
                                    '<div class="card-body">' +
                                        fieldRow(
                                            field("Code", '<input class="form-control font-monospace" id="spd-code" required>'),
                                            field("Type", '<select class="form-select" id="spd-type">' +
                                                optionsHtml(typeOptions, "") + "</select>")) +
                                        '<div class="mb-3"><label class="form-label">Base resource types</label>' +
                                            '<div class="border rounded p-2" style="max-height:16rem;overflow:auto" id="spd-base-list"></div></div>' +
                                        field("Expression", '<input class="form-control font-monospace" id="spd-expression" placeholder="FHIRPath">') +
                                        fieldRow(
                                            field("Processing mode", '<select class="form-select" id="spd-processing">' +
                                                optionsHtml(processingOptions, "") + "</select>"),
                                            field("Constraint", '<input class="form-control font-monospace" id="spd-constraint" placeholder="FHIRPath that must be true">')) +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("spd-pane-behavior",
                            '<form id="spd-behavior-form">' +
                                '<div class="card">' +
                                    '<div class="card-header"><h3 class="card-title">Behavior</h3></div>' +
                                    '<div class="card-body" id="spd-behavior"></div>' +
                                    '<div class="card-footer bg-transparent">' +
                                        '<button type="submit" class="btn btn-primary">Save changes</button>' +
                                    "</div>" +
                                "</div>" +
                            "</form>") +
                        tabPane("spd-pane-graph", CadminResourceGraph.card()) +
                        tabPane("spd-pane-history", CadminResourceHistory.card()) +
                        tabPane("spd-pane-danger",
                            '<div class="card border-danger">' +
                                '<div class="card-header bg-danger-subtle">' +
                                    '<h3 class="card-title text-danger">Danger zone</h3>' +
                                "</div>" +
                                '<div class="card-body">' +
                                    '<div class="d-flex justify-content-between align-items-start">' +
                                        "<div>" +
                                            '<p class="mb-0 fw-semibold text-danger">Delete this search parameter</p>' +
                                            '<small class="text-secondary">This permanently deletes the SearchParameter resource.</small>' +
                                        "</div>" +
                                        '<button class="btn btn-danger" type="button" id="spd-delete">Delete</button>' +
                                    "</div>" +
                                "</div>" +
                            "</div>") +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        CadminResourceSource.mount(function () { return searchParameter; });
        CadminResourceGraph.mount(searchParameter);
        CadminResourceHistory.mount(searchParameter);
        renderHeader();
        populateIdentity();
        populateDefinition();
        renderBehavior();
        bind();
    }

    function renderHeader() {
        $("#spd-title").text(searchParameter.title || searchParameter.name || searchParameter.code || "SearchParameter");
        $("#spd-status-badge").html(statusBadge(searchParameter.status));
        if (searchParameter.id) {
            $("#spd-fhir-id").text(searchParameter.id).removeClass("d-none");
        } else {
            $("#spd-fhir-id").text("").addClass("d-none");
        }
    }

    function boolSelect(id, value) {
        const selected = value === true ? "true" : value === false ? "false" : "";
        return '<select class="form-select form-select-sm" id="' + id + '">' +
            '<option value=""' + (selected === "" ? " selected" : "") + ">Unspecified</option>" +
            '<option value="true"' + (selected === "true" ? " selected" : "") + ">Yes</option>" +
            '<option value="false"' + (selected === "false" ? " selected" : "") + ">No</option>" +
            "</select>";
    }

    function typeIs(kind) {
        return searchParameter && searchParameter.type === kind;
    }

    function renderBehavior() {
        const showTargets = typeIs("reference") || (searchParameter.target && searchParameter.target.length);
        const showComponents = typeIs("composite") || (searchParameter.component && searchParameter.component.length);
        $("#spd-behavior").html(
            '<div class="row">' +
                '<div class="col-md-6 mb-3">' +
                    '<label class="form-label">Allow multiple OR values</label>' +
                    boolSelect("spd-multiple-or", searchParameter.multipleOr) +
                "</div>" +
                '<div class="col-md-6 mb-3">' +
                    '<label class="form-label">Allow multiple AND parameters</label>' +
                    boolSelect("spd-multiple-and", searchParameter.multipleAnd) +
                "</div>" +
            "</div>" +
            '<div class="row">' +
                '<div class="col-md-6 mb-3">' +
                    '<label class="form-label">Comparators</label>' +
                    '<div id="spd-cmp-list"></div>' +
                "</div>" +
                '<div class="col-md-6 mb-3">' +
                    '<label class="form-label">Modifiers</label>' +
                    '<div id="spd-mod-list"></div>' +
                "</div>" +
            "</div>" +
            (showTargets
                ? '<div class="mb-3">' +
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        "<label class=\"form-label mb-0\">Reference targets</label>" +
                        '<button class="btn btn-sm btn-outline-primary" type="button" id="spd-add-target">' +
                            '<i class="bi bi-plus-lg me-1"></i>Add</button></div>' +
                    '<div class="table-responsive">' +
                        '<table class="table table-sm align-middle mb-0">' +
                            "<thead><tr><th>Resource</th><th></th></tr></thead>" +
                            '<tbody id="spd-target-rows"></tbody></table></div></div>'
                : "") +
            '<div class="mb-3">' +
                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                    "<label class=\"form-label mb-0\">Chained parameters</label>" +
                    '<button class="btn btn-sm btn-outline-primary" type="button" id="spd-add-chain">' +
                        '<i class="bi bi-plus-lg me-1"></i>Add</button></div>' +
                '<div class="table-responsive">' +
                    '<table class="table table-sm align-middle mb-0">' +
                        "<thead><tr><th>Chain</th><th></th></tr></thead>" +
                        '<tbody id="spd-chain-rows"></tbody></table></div></div>' +
            (showComponents
                ? '<div class="mb-0">' +
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        "<label class=\"form-label mb-0\">Composite components</label>" +
                        '<button class="btn btn-sm btn-outline-primary" type="button" id="spd-add-component">' +
                            '<i class="bi bi-plus-lg me-1"></i>Add</button></div>' +
                    '<div class="table-responsive">' +
                        '<table class="table table-sm align-middle mb-0">' +
                            "<thead><tr><th>Definition</th><th>Expression</th><th></th></tr></thead>" +
                            '<tbody id="spd-component-rows"></tbody></table></div></div>'
                : "")
        );
        CadminApi.fillValueSetChecks("#spd-cmp-list", CadminApi.valueSets.searchComparator, {
            name: "spd-cmp",
            selected: searchParameter.comparator || [],
            fallback: comparatorOptions
        });
        CadminApi.fillValueSetChecks("#spd-mod-list", CadminApi.valueSets.searchModifierCode, {
            name: "spd-mod",
            selected: searchParameter.modifier || [],
            fallback: modifierOptions
        });
        if (showTargets) {
            renderTargets(searchParameter.target || []);
        }
        renderChains(searchParameter.chain || []);
        if (showComponents) {
            renderComponents(searchParameter.component || []);
        }
    }

    function resourceSelect(attr, selected) {
        return '<select class="form-select form-select-sm" ' + attr + ">" +
            '<option value=""></option>' + optionsHtml(resourceTypes, selected) + "</select>";
    }

    function renderTargets(targets) {
        const rows = targets.length ? targets : [""];
        $("#spd-target-rows").html(rows.map(function (type, index) {
            return "<tr>" +
                "<td>" + resourceSelect('data-target data-index="' + index + '"', type) + "</td>" +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-target="' +
                    index + '"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderChains(chains) {
        const rows = chains.length ? chains : [""];
        $("#spd-chain-rows").html(rows.map(function (chain, index) {
            return "<tr>" +
                '<td><input class="form-control form-control-sm font-monospace" data-chain data-index="' +
                    index + '" value="' + esc(chain) + '" placeholder="e.g. name"></td>' +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-chain="' +
                    index + '"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function renderComponents(components) {
        const rows = components.length ? components : [{ definition: "", expression: "" }];
        $("#spd-component-rows").html(rows.map(function (item, index) {
            return "<tr>" +
                '<td><input class="form-control form-control-sm font-monospace" data-component-def data-index="' +
                    index + '" value="' + esc(item.definition || "") +
                    '" placeholder="Canonical SearchParameter URL"></td>' +
                '<td><input class="form-control form-control-sm font-monospace" data-component-expr data-index="' +
                    index + '" value="' + esc(item.expression || "") +
                    '" placeholder="FHIRPath on the matched resource"></td>' +
                '<td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-component="' +
                    index + '"><i class="bi bi-trash"></i></button></td></tr>';
        }).join(""));
    }

    function currentTargets() {
        const values = [];
        $("#spd-target-rows [data-target]").each(function () {
            values.push($(this).val() || "");
        });
        return values;
    }

    function currentChains() {
        const values = [];
        $("#spd-chain-rows [data-chain]").each(function () {
            values.push($(this).val() || "");
        });
        return values;
    }

    function currentComponents() {
        const values = [];
        $("#spd-component-rows tr").each(function () {
            values.push({
                definition: $(this).find("[data-component-def]").val() || "",
                expression: $(this).find("[data-component-expr]").val() || ""
            });
        });
        return values;
    }

    function populateIdentity() {
        $("#spd-title-input").val(searchParameter.title || "");
        $("#spd-name").val(searchParameter.name || "");
        $("#spd-url").val(searchParameter.url || "");
        $("#spd-status").val(searchParameter.status || "draft");
        $("#spd-version").val(searchParameter.version || "");
        $("#spd-publisher").val(searchParameter.publisher || "");
        $("#spd-description").val(searchParameter.description || "");
        $("#spd-purpose").val(searchParameter.purpose || "");
        $("#spd-derived").val(searchParameter.derivedFrom || "");
        $("#spd-experimental").prop("checked", searchParameter.experimental === true);
        CadminApi.fillValueSetSelect("#spd-status", CadminApi.valueSets.publicationStatus, {
            fallback: statusOptions,
            selected: searchParameter.status || "draft"
        });
    }

    function populateDefinition() {
        $("#spd-code").val(searchParameter.code || "");
        $("#spd-type").val(searchParameter.type || "string");
        $("#spd-expression").val(searchParameter.expression || "");
        $("#spd-processing").val(searchParameter.processingMode || searchParameter.xpathUsage || "");
        $("#spd-constraint").val(searchParameter.constraint || "");
        CadminApi.fillValueSetSelect("#spd-type", CadminApi.valueSets.searchParamType, {
            fallback: typeOptions,
            selected: searchParameter.type || "string"
        });
        CadminApi.fillValueSetSelect("#spd-processing", CadminApi.valueSets.searchProcessingMode, {
            fallback: processingOptions,
            selected: searchParameter.processingMode || searchParameter.xpathUsage || "",
            prepend: [{ code: "", display: "Unspecified" }]
        });
        CadminApi.fillValueSetChecks("#spd-base-list", CadminApi.valueSets.resourceTypes, {
            name: "spd-base",
            selected: searchParameter.base || [],
            fallback: resourceTypes,
            count: 300,
            onConcepts: function (concepts) {
                if (concepts && concepts.length) {
                    resourceTypes = concepts;
                }
            }
        });
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".spdetail");
        $root.on("shown.bs.tab.spdetail", "#spd-pane-graph-btn", function () {
            if (typeof CadminResourceGraph.resize === "function") {
                CadminResourceGraph.resize();
            }
        });
        $root.on("click.spdetail", "#spd-delete", function () {
            CadminApi.confirm("Delete this search parameter?").done(function () {
                CadminApi.fhir("/SearchParameter/" + encodeURIComponent(searchParameter.id), "DELETE")
                    .done(function () {
                        CadminApi.showToast("success", "Search parameter deleted.");
                        window.location.hash = "#/search-parameters";
                    }).fail(function (xhr) {
                        fail("Delete search parameter", xhr);
                    });
            });
        });
        $root.on("click.spdetail", "#spd-add-target", function () {
            renderTargets(currentTargets().concat([""]));
        });
        $root.on("click.spdetail", "[data-remove-target]", function () {
            const index = Number($(this).attr("data-remove-target"));
            const next = currentTargets();
            next.splice(index, 1);
            renderTargets(next);
        });
        $root.on("click.spdetail", "#spd-add-chain", function () {
            renderChains(currentChains().concat([""]));
        });
        $root.on("click.spdetail", "[data-remove-chain]", function () {
            const index = Number($(this).attr("data-remove-chain"));
            const next = currentChains();
            next.splice(index, 1);
            renderChains(next);
        });
        $root.on("click.spdetail", "#spd-add-component", function () {
            renderComponents(currentComponents().concat([{ definition: "", expression: "" }]));
        });
        $root.on("click.spdetail", "[data-remove-component]", function () {
            const index = Number($(this).attr("data-remove-component"));
            const next = currentComponents();
            next.splice(index, 1);
            renderComponents(next);
        });
        $("#spd-identity-form").on("submit", function (event) {
            event.preventDefault();
            save(function () {
                CadminApi.showToast("success", "Identity updated.");
            }, "identity");
        });
        $("#spd-definition-form").on("submit", function (event) {
            event.preventDefault();
            save(function () {
                CadminApi.showToast("success", "Definition updated.");
            }, "definition");
        });
        $("#spd-behavior-form").on("submit", function (event) {
            event.preventDefault();
            save(function () {
                CadminApi.showToast("success", "Behavior updated.");
            }, "all");
        });
    }

    return {
        render: render
    };
}());
