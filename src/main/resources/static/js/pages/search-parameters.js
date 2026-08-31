CadminApp.register("search-parameters", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("search-parameters", token, function (resource, $root) {
            CadminSearchParameterDetail.render(resource, $root);
        }, function () {
            renderSearchParameterList(token);
        });
        return;
    }
    renderSearchParameterList("");
});

function renderSearchParameterList(initialQuery) {
    let statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    let typeOptions = [
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
    const baseOptions = [
        "Patient", "Practitioner", "PractitionerRole", "Organization", "Location",
        "Encounter", "Observation", "Condition", "Procedure", "AllergyIntolerance",
        "MedicationRequest", "DiagnosticReport", "DocumentReference", "Library",
        "SearchParameter", "Questionnaire", "ValueSet", "CodeSystem", "Appointment",
        "Coverage", "Device", "DeviceAssociation", "CareTeam", "Group", "HealthcareService",
        "RelatedPerson", "Task", "Subscription", "SubscriptionTopic", "Consent", "Flag"
    ];
    let duplicateSource = null;
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Search Parameters</h1>' +
            CadminResourceDocument.splitButton({
                label: "New search parameter",
                modalTarget: "#create-search-parameter-modal",
                resourceType: "SearchParameter"
            }) +
        "</div>" +
        '<div id="search-parameter-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Search parameter search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="search-parameter-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="search-parameter-query" placeholder="Name or code" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Name</th><th>Code</th><th>Base</th><th>Type</th><th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="search-parameter-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="search-parameter-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-search-parameter-modal" tabindex="-1">' +
            '<div class="modal-dialog modal-lg">' +
                '<form class="modal-content" id="create-search-parameter-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create search parameter</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="sp-name">Name</label>' +
                            '<input class="form-control" id="sp-name" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="sp-code">Code</label>' +
                            '<input class="form-control font-monospace" id="sp-code" required placeholder="Used in search URLs"></div>' +
                        '<div class="mb-3"><label class="form-label" for="sp-id">ID</label>' +
                            '<input class="form-control font-monospace" id="sp-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback">A search parameter with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="sp-description">Description</label>' +
                            '<textarea class="form-control" id="sp-description" rows="2" required></textarea></div>' +
                        '<div class="row">' +
                            '<div class="col-md-4 mb-3"><label class="form-label" for="sp-status">Status</label>' +
                                '<select class="form-select" id="sp-status">' +
                                    statusOptions.map(function (option) {
                                        return '<option value="' + option.code + '"' +
                                            (option.code === "draft" ? " selected" : "") + ">" +
                                            CadminApi.escapeHtml(option.display) + "</option>";
                                    }).join("") +
                                "</select></div>" +
                            '<div class="col-md-4 mb-3"><label class="form-label" for="sp-type">Type</label>' +
                                '<select class="form-select" id="sp-type">' +
                                    typeOptions.map(function (option) {
                                        return '<option value="' + option.code + '">' +
                                            CadminApi.escapeHtml(option.display) + "</option>";
                                    }).join("") +
                                "</select></div>" +
                            '<div class="col-md-4 mb-3"><label class="form-label" for="sp-base">Base</label>' +
                                '<select class="form-select" id="sp-base">' +
                                    baseOptions.map(function (type) {
                                        return '<option value="' + type + '">' + type + "</option>";
                                    }).join("") +
                                "</select></div>" +
                        "</div>" +
                        '<div class="mb-3"><label class="form-label" for="sp-url">URL</label>' +
                            '<input class="form-control font-monospace" id="sp-url" ' +
                            'placeholder="https://cadmin.io/fhir/SearchParameter/{code}"></div>' +
                        '<div class="mb-0"><label class="form-label" for="sp-expression">Expression</label>' +
                            '<input class="form-control font-monospace" id="sp-expression" placeholder="FHIRPath, e.g. Patient.name"></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="duplicate-search-parameter-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="duplicate-search-parameter-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Duplicate search parameter</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Create a new draft from <strong id="sp-dup-title"></strong>.</p>' +
                        '<div class="mb-3"><label class="form-label" for="sp-dup-name">Name</label>' +
                            '<input class="form-control" id="sp-dup-name" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="sp-dup-code">Code</label>' +
                            '<input class="form-control font-monospace" id="sp-dup-code" required></div>' +
                        '<div class="mb-0"><label class="form-label" for="sp-dup-version">Version</label>' +
                            '<input class="form-control" id="sp-dup-version" placeholder="1.0.1"></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Duplicate</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>"
    );

    function esc(value) {
        return CadminApi.escapeHtml(value);
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

    function typeLabel(code) {
        const match = typeOptions.find(function (option) { return option.code === code; });
        return match ? match.display : (code || "—");
    }

    function baseLabel(resource) {
        return (resource.base || []).join(", ") || "—";
    }

    function slugName(value) {
        return String(value || "search-parameter").replace(/[^A-Za-z0-9._-]+/g, "")
            .replace(/^[^A-Za-z]+/, "")
            .slice(0, 64) || "searchParameter";
    }

    function defaultUrl(code) {
        return "https://cadmin.io/fhir/SearchParameter/" + encodeURIComponent(code || "search");
    }

    function bumpVersion(version) {
        const parts = String(version || "1.0.0").split(".");
        const last = Number(parts[parts.length - 1]);
        if (!isNaN(last)) {
            parts[parts.length - 1] = String(last + 1);
            return parts.join(".");
        }
        return version ? version + ".1" : "1.0.1";
    }

    function hrefFor(id) {
        return "#/search-parameters/" + encodeURIComponent(id);
    }

    let listPage = 0;
    let urlTouched = false;

    function load(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/SearchParameter?_sort=-_lastUpdated";
        const q = String(query || "").trim();
        if (q) {
            if (/^[A-Za-z0-9._-]+$/.test(q)) {
                path += "&code=" + encodeURIComponent(q);
            } else {
                path += "&name=" + encodeURIComponent(q);
            }
        }
        const pageSize = CadminApi.listPageSize("search-parameters");
        CadminDeletedList.query({ type: "SearchParameter", path: path, page: listPage, size: pageSize }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "SearchParameter");
            CadminApi.renderPager("#search-parameter-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "search-parameters",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#search-parameter-rows").html(CadminDeletedList.emptyRow(7, "SearchParameter",
                    "No search parameters found. Create one or start HAPI FHIR."));
                return;
            }
            $("#search-parameter-rows").html(entries.map(function (sp) {
                const href = hrefFor(sp.id);
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink(href, sp.title || sp.name || "Untitled") + "</td>" +
                    "<td><code>" + esc(sp.code || "—") + "</code></td>" +
                    "<td>" + esc(baseLabel(sp)) + "</td>" +
                    "<td>" + esc(typeLabel(sp.type)) + "</td>" +
                    "<td>" + statusBadge(sp.status) + "</td>" +
                    "<td><code>" + esc(sp.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        '<a class="btn btn-sm btn-outline-primary me-1" href="' + esc(href) +
                            '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" data-duplicate="' +
                            esc(sp.id) + '">Duplicate</button>' +
                    "</td></tr>";
            }).join(""));
        }).fail(function (xhr) {
            $("#search-parameter-pager").empty();
            $("#search-parameter-rows").html('<tr><td colspan="7" class="text-danger">Unable to load search parameters from /fhir.</td></tr>');
            CadminApi.showAlert("#search-parameter-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    function syncDefaultUrl() {
        if (!urlTouched) {
            const code = $("#sp-code").val().trim() || slugName($("#sp-name").val());
            $("#sp-url").val(defaultUrl(code));
        }
    }

    function ensureNewId(id, $field) {
        const deferred = $.Deferred();
        const value = String(id || "").trim();
        if (!value) {
            return deferred.resolve("").promise();
        }
        CadminApi.fhir("/SearchParameter/" + encodeURIComponent(value)).done(function () {
            $field.addClass("is-invalid");
            CadminApi.showToast("danger", "A search parameter with ID \"" + value + "\" already exists.");
            deferred.reject();
        }).fail(function (xhr) {
            if (xhr.status === 404) {
                deferred.resolve(value);
                return;
            }
            CadminApi.showToast("danger", "Unable to check ID (" + xhr.status + ").");
            deferred.reject();
        });
        return deferred.promise();
    }

    function finishCreate(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById("create-search-parameter-modal"));
        if (modal) {
            modal.hide();
        }
        CadminApi.showToast("success", "Search parameter created.");
        if (id) {
            window.location.hash = hrefFor(id);
            return;
        }
        load($("#search-parameter-query").val());
    }

    $("#search-parameter-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#search-parameter-query").val());
    });

    $("#create-search-parameter-modal").on("show.bs.modal", function () {
        urlTouched = false;
        $("#sp-name").val("");
        $("#sp-code").val("").data("touched", false);
        $("#sp-id").val("").removeClass("is-invalid");
        $("#sp-description").val("");
        $("#sp-status").val("draft");
        $("#sp-type").val("string");
        $("#sp-base").val("Patient");
        $("#sp-url").val("");
        $("#sp-expression").val("");
    });
    $("#sp-name").on("input", function () {
        if (!$("#sp-code").data("touched")) {
            $("#sp-code").val(slugName($(this).val()).toLowerCase());
        }
        syncDefaultUrl();
    });
    $("#sp-code").on("input", function () {
        $(this).data("touched", true);
        syncDefaultUrl();
    });
    $("#sp-id").on("input", function () {
        $("#sp-id").removeClass("is-invalid");
    });
    $("#sp-url").on("input", function () {
        urlTouched = !!$(this).val();
    });

    $("#create-search-parameter-form").on("submit", function (event) {
        event.preventDefault();
        $("#sp-id").removeClass("is-invalid");
        const code = $("#sp-code").val().trim();
        const name = $("#sp-name").val().trim();
        const assignedId = $("#sp-id").val().trim();
        const resource = {
            resourceType: "SearchParameter",
            url: $("#sp-url").val().trim() || defaultUrl(code),
            name: slugName(name),
            title: name,
            status: $("#sp-status").val() || "draft",
            description: $("#sp-description").val().trim(),
            code: code,
            base: [$("#sp-base").val()],
            type: $("#sp-type").val()
        };
        const expression = $("#sp-expression").val().trim();
        if (expression) {
            resource.expression = expression;
        }
        ensureNewId(assignedId, $("#sp-id")).done(function () {
            const path = assignedId
                ? "/SearchParameter/" + encodeURIComponent(assignedId)
                : "/SearchParameter";
            const method = assignedId ? "PUT" : "POST";
            if (assignedId) {
                resource.id = assignedId;
            }
            CadminApi.fhir(path, method, resource).done(function (created, _status, xhr) {
                finishCreate(assignedId || CadminApi.createdResourceId(created, xhr, "SearchParameter"));
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
            });
        });
    });

    $root.on("click", "[data-duplicate]", function () {
        const id = $(this).attr("data-duplicate");
        CadminApi.fhir("/SearchParameter/" + encodeURIComponent(id)).done(function (sp) {
            duplicateSource = sp;
            $("#sp-dup-title").text(sp.title || sp.name || sp.code || sp.id);
            $("#sp-dup-name").val((sp.title || sp.name || "Search parameter") + " copy");
            $("#sp-dup-code").val((sp.code || "search") + "-copy");
            $("#sp-dup-version").val(bumpVersion(sp.version));
            bootstrap.Modal.getOrCreateInstance(document.getElementById("duplicate-search-parameter-modal")).show();
        }).fail(function (xhr) {
            CadminApi.showAlert("#search-parameter-alert", "danger",
                "Unable to load search parameter (" + xhr.status + ").");
        });
    });

    $("#duplicate-search-parameter-form").on("submit", function (event) {
        event.preventDefault();
        if (!duplicateSource) {
            return;
        }
        const copy = JSON.parse(JSON.stringify(duplicateSource));
        delete copy.id;
        delete copy.meta;
        delete copy.text;
        copy.status = "draft";
        copy.title = $("#sp-dup-name").val().trim() || (duplicateSource.title || "Search parameter") + " copy";
        copy.name = slugName(copy.title);
        copy.code = $("#sp-dup-code").val().trim() || (duplicateSource.code || "search") + "-copy";
        copy.url = defaultUrl(copy.code);
        const version = $("#sp-dup-version").val().trim();
        if (version) {
            copy.version = version;
        } else {
            delete copy.version;
        }
        CadminApi.fhir("/SearchParameter", "POST", copy).done(function (created, _status, xhr) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("duplicate-search-parameter-modal"));
            if (modal) {
                modal.hide();
            }
            duplicateSource = null;
            CadminApi.showToast("success", "Search parameter duplicated as draft.");
            const id = CadminApi.createdResourceId(created, xhr, "SearchParameter");
            if (id) {
                window.location.hash = hrefFor(id);
                return;
            }
            load($("#search-parameter-query").val());
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Duplicate failed (" + xhr.status + ").");
        });
    });

    CadminApi.fillValueSetSelect("#sp-status", CadminApi.valueSets.publicationStatus, {
        fallback: statusOptions,
        selected: "draft",
        onConcepts: function (concepts) { statusOptions = concepts; }
    });
    CadminApi.fillValueSetSelect("#sp-type", CadminApi.valueSets.searchParamType, {
        fallback: typeOptions,
        selected: "string",
        onConcepts: function (concepts) { typeOptions = concepts; }
    });
    CadminApi.fillValueSetSelect("#sp-base", CadminApi.valueSets.resourceTypes, {
        fallback: baseOptions.map(function (type) { return { code: type, display: type }; }),
        selected: "Patient",
        count: 300
    });

    CadminDeletedList.bind({
        type: "SearchParameter",
        reload: function () { load($("#search-parameter-query").val(), 0); }
    });

    load(initialQuery);
}
