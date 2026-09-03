CadminApp.register("icg-routes", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("icg-routes", token, function (resource, $root) {
            CadminIcgRouteDetail.render(resource, $root);
        }, function () {
            renderIcgRouteList(token);
        });
        return;
    }
    renderIcgRouteList("");
});

function renderIcgRouteList(initialQuery) {
    const libraryType = "icg-route";
    const routeContentType = "application/gateway+yaml";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    let duplicateSource = null;
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">ICG Routes</h1>' +
            CadminResourceDocument.splitButton({
                label: "New ICG route",
                modalTarget: "#create-icg-route-modal",
                resourceType: "Library"
            }) +
        "</div>" +
        '<div id="icg-route-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Route search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="icg-route-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="icg-route-query" placeholder="Title" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Title</th><th>Description</th><th>Version</th><th>Status</th><th>Name</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="icg-route-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="icg-route-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-icg-route-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-icg-route-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create ICG route</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="ir-title">Title</label>' +
                            '<input class="form-control" id="ir-title" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="ir-id">ID</label>' +
                            '<input class="form-control font-monospace" id="ir-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback" id="ir-id-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="ir-description">Description</label>' +
                            '<textarea class="form-control" id="ir-description" rows="3"></textarea></div>' +
                        '<div class="mb-0"><label class="form-label" for="ir-status">Status</label>' +
                            '<select class="form-select" id="ir-status">' +
                                statusOptions.map(function (option) {
                                    return '<option value="' + option.code + '">' + CadminApi.escapeHtml(option.display) + "</option>";
                                }).join("") +
                            "</select></div>" +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="duplicate-icg-route-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="duplicate-icg-route-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Duplicate ICG route</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Create a new draft from <strong id="ir-dup-title"></strong>.</p>' +
                        '<div class="mb-3"><label class="form-label" for="ir-dup-id">ID</label>' +
                            '<input class="form-control font-monospace" id="ir-dup-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-0"><label class="form-label" for="ir-dup-version">Version</label>' +
                            '<input class="form-control" id="ir-dup-version" placeholder="1.0.1"></div>' +
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

    function encodeText(value) {
        try {
            return btoa(unescape(encodeURIComponent(value || "")));
        } catch (err) {
            return btoa(value || "");
        }
    }

    function slugName(title) {
        return String(title || "icg-route").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "icg-route";
    }

    function bumpVersion(value) {
        const text = String(value || "").trim();
        const match = text.match(/^(\d+)\.(\d+)\.(\d+)/);
        if (match) {
            return match[1] + "." + match[2] + "." + (Number(match[3]) + 1);
        }
        if (/^\d+$/.test(text)) {
            return String(Number(text) + 1);
        }
        return text ? text + "-copy" : "1.0.0";
    }

    function defaultYaml(title) {
        const id = slugName(title).replace(/-/g, "_") || "example";
        return "- id: " + id + "\n" +
            "  uri: https://httpbin.org\n" +
            "  predicates:\n" +
            "    - Path=/" + id + "/**\n" +
            "  filters:\n" +
            "    - StripPrefix=1\n";
    }

    function libraryTypeConcept() {
        return {
            coding: [{
                code: libraryType,
                display: "ICG Route"
            }],
            text: libraryType
        };
    }

    function isIcgType(library) {
        return CadminApi.isLibraryType(library, libraryType);
    }

    function ensureNewId(id, $field) {
        const deferred = $.Deferred();
        const value = String(id || "").trim();
        if (!value) {
            return deferred.resolve("").promise();
        }
        CadminApi.fhir("/Library/" + encodeURIComponent(value), "GET", null, { silent: true }).done(function () {
            $field.addClass("is-invalid");
            CadminApi.showToast("danger", "A library with ID \"" + value + "\" already exists.");
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

    function saveLibrary(resource, assignedId) {
        const path = assignedId
            ? "/Library/" + encodeURIComponent(assignedId)
            : "/Library";
        if (assignedId) {
            resource.id = assignedId;
        }
        return CadminApi.fhir(path, assignedId ? "PUT" : "POST", resource);
    }

    function cloneLibrary(source, newVersion) {
        const copy = JSON.parse(JSON.stringify(source));
        delete copy.id;
        delete copy.meta;
        delete copy.text;
        copy.status = "draft";
        copy.version = newVersion;
        copy.type = libraryTypeConcept();
        return copy;
    }

    let listPage = 0;

    function load(query, page) {
        listPage = typeof page === "number" ? page : 0;
        let path = "/Library?type=" + encodeURIComponent(libraryType) + "&_sort=-_lastUpdated";
        if (query) {
            path += "&title=" + encodeURIComponent(query);
        }
        const pageSize = CadminApi.listPageSize("icg-routes");
        CadminDeletedList.query({
            type: "Library",
            path: path,
            page: listPage,
            size: pageSize,
            filter: function (library) {
                return !library.type || isIcgType(library);
            }
        }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Library");
            CadminApi.renderPager("#icg-route-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "icg-routes",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#icg-route-rows").html(CadminDeletedList.emptyRow(7, "ICG route",
                    "No ICG routes found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (library) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/icg-routes/" + encodeURIComponent(library.id),
                        library.title || library.name || "Untitled") + "</td>" +
                    "<td>" + esc(library.description || "—") + "</td>" +
                    "<td><code>" + esc(library.version || "—") + "</code></td>" +
                    "<td>" + statusBadge(library.status) + "</td>" +
                    "<td><code>" + esc(library.name || "—") + "</code></td>" +
                    "<td><code>" + esc(library.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        '<a class="btn btn-sm btn-outline-primary me-1" href="#/icg-routes/' +
                            encodeURIComponent(library.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" data-duplicate="' +
                            esc(library.id) + '">Duplicate</button>' +
                    "</td>" +
                    "</tr>";
            });
            $("#icg-route-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#icg-route-pager").empty();
            $("#icg-route-rows").html('<tr><td colspan="7" class="text-danger">Unable to load libraries from /fhir.</td></tr>');
            CadminApi.showAlert("#icg-route-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#icg-route-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#icg-route-query").val());
    });

    $("#create-icg-route-modal").on("show.bs.modal", function () {
        $("#ir-title").val("");
        $("#ir-id").val("").removeClass("is-invalid");
        $("#ir-description").val("");
        $("#ir-status").val("draft");
    });
    $("#ir-id").on("input", function () {
        $(this).removeClass("is-invalid");
    });

    $("#create-icg-route-form").on("submit", function (event) {
        event.preventDefault();
        const assignedId = $("#ir-id").val().trim();
        const title = $("#ir-title").val().trim();
        const resource = {
            resourceType: "Library",
            status: $("#ir-status").val() || "draft",
            title: title,
            name: slugName(title),
            version: "1.0.0",
            type: libraryTypeConcept(),
            content: [{
                contentType: routeContentType,
                title: "ICG route",
                data: encodeText(defaultYaml(title))
            }]
        };
        const description = $("#ir-description").val().trim();
        if (description) {
            resource.description = description;
        }
        ensureNewId(assignedId, $("#ir-id")).done(function () {
            saveLibrary(resource, assignedId).done(function (created, _status, xhr) {
                const modal = bootstrap.Modal.getInstance(document.getElementById("create-icg-route-modal"));
                if (modal) {
                    modal.hide();
                }
                const id = CadminApi.createdResourceId(created, xhr, "Library") || assignedId;
                CadminApi.showToast("success", "ICG route created.");
                if (id) {
                    window.location.hash = "#/icg-routes/" + encodeURIComponent(id);
                    return;
                }
                load($("#icg-route-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
            });
        });
    });

    $root.on("click", "[data-duplicate]", function () {
        const id = $(this).attr("data-duplicate");
        CadminApi.fhir("/Library/" + encodeURIComponent(id)).done(function (library) {
            duplicateSource = library;
            $("#ir-dup-title").text(library.title || library.name || library.id);
            $("#ir-dup-id").val("").removeClass("is-invalid");
            $("#ir-dup-version").val(bumpVersion(library.version));
            bootstrap.Modal.getOrCreateInstance(document.getElementById("duplicate-icg-route-modal")).show();
        }).fail(function (xhr) {
            CadminApi.showAlert("#icg-route-alert", "danger", "Unable to load route (" + xhr.status + ").");
        });
    });

    $("#duplicate-icg-route-form").on("submit", function (event) {
        event.preventDefault();
        if (!duplicateSource) {
            return;
        }
        const assignedId = ($("#ir-dup-id").val() || "").trim();
        const newVersion = ($("#ir-dup-version").val() || "").trim() || bumpVersion(duplicateSource.version);
        const copy = cloneLibrary(duplicateSource, newVersion);
        if (copy.title) {
            copy.title = copy.title + " copy";
        }
        ensureNewId(assignedId, $("#ir-dup-id")).done(function () {
            saveLibrary(copy, assignedId).done(function () {
                const modal = bootstrap.Modal.getInstance(document.getElementById("duplicate-icg-route-modal"));
                if (modal) {
                    modal.hide();
                }
                duplicateSource = null;
                CadminApi.showToast("success", "ICG route duplicated.");
                load($("#icg-route-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Duplicate failed (" + xhr.status + ").");
            });
        });
    });

    CadminDeletedList.bind({
        type: "Library",
        reload: function () { load($("#icg-route-query").val(), 0); }
    });

    load(initialQuery);
}
