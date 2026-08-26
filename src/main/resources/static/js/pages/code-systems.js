CadminApp.register("code-systems", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("code-systems", token, function (resource, $root) {
            CadminCodeSystemDetail.render(resource, $root);
        }, function () {
            renderCodeSystemList(token);
        });
        return;
    }
    renderCodeSystemList("");
});

function renderCodeSystemList(initialQuery) {
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
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Code systems</h1>' +
            CadminResourceDocument.splitButton({
                label: "New code system",
                modalTarget: "#create-codesystem-modal",
                resourceType: "CodeSystem"
            }) +
        "</div>" +
        '<div id="codesystem-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                '<h6 class="m-0">Code system search</h6>' +
                '<form class="d-flex" id="codesystem-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="codesystem-query" placeholder="Title, name, or URL" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Title</th><th>URL</th><th>Status</th><th>Content</th>" +
                        "<th>Concepts</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="codesystem-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="codesystem-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-codesystem-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-codesystem-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create code system</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="cs-title">Title</label>' +
                            '<input class="form-control" id="cs-title" name="title" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="cs-id">ID</label>' +
                            '<input class="form-control font-monospace" id="cs-id" name="id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID. Provide an ID to create and manage a known catalog (for example <code>flag-code</code>) that other forms can bind to by that identity.</div>' +
                            '<div class="invalid-feedback" id="cs-id-feedback">A code system with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="cs-status">Status</label>' +
                            '<select class="form-select" id="cs-status" name="status">' +
                                statusOptions.map(function (option) {
                                    return '<option value="' + option.code + '"' +
                                        (option.code === "draft" ? " selected" : "") + ">" +
                                        CadminApi.escapeHtml(option.display) + "</option>";
                                }).join("") +
                            "</select></div>" +
                        '<div class="mb-3"><label class="form-label" for="cs-url">URL</label>' +
                            '<input class="form-control font-monospace" id="cs-url" name="url" ' +
                            'placeholder="https://cadmin.io/fhir/CodeSystem/example"></div>' +
                        '<div class="mb-3"><label class="form-label" for="cs-version">Version</label>' +
                            '<input class="form-control" id="cs-version" name="version" value="1.0.0" autocomplete="off"></div>' +
                        '<div class="form-check mb-3">' +
                            '<input class="form-check-input" type="checkbox" id="cs-companion-vs" checked>' +
                            '<label class="form-check-label" for="cs-companion-vs">' +
                            "Also create a ValueSet that includes this code system</label>" +
                        "</div>" +
                        '<div class="mb-0"><label class="form-label" for="cs-vs-id">Value set ID</label>' +
                            '<input class="form-control font-monospace" id="cs-vs-id" name="valueSetId" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID. Provide an ID to create and manage a known catalog value set that forms can bind to by that identity.</div>' +
                            '<div class="invalid-feedback" id="cs-vs-id-feedback">A value set with this ID already exists.</div></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
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

    function slugName(title) {
        return String(title || "codesystem").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "codesystem";
    }

    function countConcepts(concepts) {
        return CadminApi.flattenCodeSystemConcepts(concepts).length;
    }

    function defaultUrl(title, id) {
        const slug = String(id || "").trim() || slugName(title);
        return "https://cadmin.io/fhir/CodeSystem/" + slug;
    }

    let listPage = 0;
    let urlTouched = false;

    function load(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/CodeSystem?_sort=-_lastUpdated";
        const q = String(query || "").trim();
        if (q) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(q)) {
                path += "&url=" + encodeURIComponent(q);
            } else {
                path += "&title=" + encodeURIComponent(q);
            }
        }
        const pageSize = CadminApi.listPageSize("code-systems");
        CadminApi.fhir(CadminApi.pagedPath(path, listPage, pageSize)).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "CodeSystem");
            CadminApi.renderPager("#codesystem-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "code-systems",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#codesystem-rows").html('<tr><td colspan="7" class="text-muted">No code systems found. Create one or start HAPI FHIR.</td></tr>');
                return;
            }
            $("#codesystem-rows").html(entries.map(function (cs) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/code-systems/" + encodeURIComponent(cs.id),
                        cs.title || cs.name || "Untitled") + "</td>" +
                    "<td><code class=\"small\">" + esc(cs.url || "—") + "</code></td>" +
                    "<td>" + statusBadge(cs.status) + "</td>" +
                    "<td>" + esc(contentLabel(cs.content)) + "</td>" +
                    "<td>" + countConcepts(cs.concept) + "</td>" +
                    "<td><code>" + esc(cs.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        '<a class="btn btn-sm btn-outline-primary" href="#/code-systems/' +
                            encodeURIComponent(cs.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                    "</td></tr>";
            }).join(""));
        }).fail(function (xhr) {
            $("#codesystem-pager").empty();
            $("#codesystem-rows").html('<tr><td colspan="7" class="text-danger">Unable to load code systems from /fhir.</td></tr>');
            CadminApi.showAlert("#codesystem-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#codesystem-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#codesystem-query").val());
    });

    function syncDefaultUrl() {
        if (!urlTouched) {
            $("#cs-url").val(defaultUrl($("#cs-title").val(), $("#cs-id").val()));
        }
    }

    function syncValueSetIdField() {
        const on = $("#cs-companion-vs").is(":checked");
        $("#cs-vs-id").prop("disabled", !on);
        if (!on) {
            $("#cs-vs-id").removeClass("is-invalid");
        }
    }

    function ensureNewId(resourceType, id, $field, noun) {
        const deferred = $.Deferred();
        const value = String(id || "").trim();
        if (!value) {
            return deferred.resolve("").promise();
        }
        CadminApi.fhir("/" + resourceType + "/" + encodeURIComponent(value)).done(function () {
            $field.addClass("is-invalid");
            CadminApi.showToast("danger", "A " + noun + " with ID \"" + value + "\" already exists.");
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

    $("#cs-title").on("input", syncDefaultUrl);
    $("#cs-id").on("input", function () {
        $("#cs-id").removeClass("is-invalid");
        syncDefaultUrl();
    });
    $("#cs-vs-id").on("input", function () {
        $("#cs-vs-id").removeClass("is-invalid");
    });
    $("#cs-url").on("input", function () {
        urlTouched = !!$(this).val();
    });
    $("#cs-companion-vs").on("change", syncValueSetIdField);

    $("#create-codesystem-modal").on("show.bs.modal", function () {
        urlTouched = false;
        $("#cs-title").val("");
        $("#cs-id").val("").removeClass("is-invalid");
        $("#cs-vs-id").val("").removeClass("is-invalid");
        $("#cs-url").val("");
        $("#cs-status").val("draft");
        $("#cs-version").val("1.0.0");
        $("#cs-companion-vs").prop("checked", true);
        syncValueSetIdField();
    });

    function finishCreate(id, message) {
        const modal = bootstrap.Modal.getInstance(document.getElementById("create-codesystem-modal"));
        if (modal) {
            modal.hide();
        }
        CadminApi.showToast("success", message);
        if (id) {
            window.location.hash = "#/code-systems/" + encodeURIComponent(id);
            return;
        }
        load($("#codesystem-query").val());
    }

    function createCompanionValueSet(resource, created, csId) {
        const id = csId || (created && created.id);
        const canonical = (created && created.url) || resource.url;
        const withValueSet = $("#cs-companion-vs").is(":checked");
        const vsId = withValueSet ? $("#cs-vs-id").val().trim() : "";
        if (!withValueSet || !canonical) {
            finishCreate(id, "Code system created.");
            return;
        }
        const valueSet = {
            resourceType: "ValueSet",
            status: resource.status,
            title: resource.title,
            name: resource.name,
            url: CadminApi.companionValueSetUrl(canonical),
            version: resource.version,
            compose: { include: [{ system: canonical }] }
        };
        const path = vsId ? "/ValueSet/" + encodeURIComponent(vsId) : "/ValueSet";
        const method = vsId ? "PUT" : "POST";
        if (vsId) {
            valueSet.id = vsId;
        }
        CadminApi.fhir(path, method, valueSet).done(function () {
            finishCreate(id, "Code system and companion value set created.");
        }).fail(function () {
            finishCreate(id, "Code system created. Companion value set could not be created.");
        });
    }

    function submitCodeSystem(resource, assignedId) {
        const path = assignedId
            ? "/CodeSystem/" + encodeURIComponent(assignedId)
            : "/CodeSystem";
        const method = assignedId ? "PUT" : "POST";
        if (assignedId) {
            resource.id = assignedId;
        }
        CadminApi.fhir(path, method, resource).done(function (created, _status, xhr) {
            const id = assignedId || CadminApi.createdResourceId(created, xhr, "CodeSystem");
            createCompanionValueSet(resource, created, id);
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
        });
    }

    $("#create-codesystem-form").on("submit", function (event) {
        event.preventDefault();
        $("#cs-id").removeClass("is-invalid");
        $("#cs-vs-id").removeClass("is-invalid");
        const title = $("#cs-title").val().trim();
        const assignedId = $("#cs-id").val().trim();
        const withValueSet = $("#cs-companion-vs").is(":checked");
        const vsId = withValueSet ? $("#cs-vs-id").val().trim() : "";
        const url = $("#cs-url").val().trim() || defaultUrl(title, assignedId);
        const resource = {
            resourceType: "CodeSystem",
            status: $("#cs-status").val() || "draft",
            content: "complete",
            title: title,
            name: slugName(title),
            url: url,
            version: $("#cs-version").val().trim() || "1.0.0",
            concept: []
        };
        ensureNewId("CodeSystem", assignedId, $("#cs-id"), "code system").then(function () {
            if (!withValueSet) {
                return $.Deferred().resolve().promise();
            }
            return ensureNewId("ValueSet", vsId, $("#cs-vs-id"), "value set");
        }).done(function () {
            submitCodeSystem(resource, assignedId);
        });
    });

    CadminApi.fillValueSetSelect("#cs-status", CadminApi.valueSets.publicationStatus, {
        fallback: statusOptions,
        selected: "draft"
    });

    load(initialQuery);
}
