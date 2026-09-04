CadminApp.register("jolts", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("jolts", token, function (resource, $root) {
            CadminJoltDetail.render(resource, $root);
        }, function () {
            renderJoltList(token);
        });
        return;
    }
    renderJoltList("");
});

function renderJoltList(initialQuery) {
    const libraryType = "jolt";
    const specContentType = "application/jolt+json";
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
            '<h1 class="h3 mb-0 page-title">Jolt Specs</h1>' +
            CadminResourceDocument.splitButton({
                label: "New Jolt spec",
                modalTarget: "#create-jolt-modal",
                resourceType: "Library"
            }) +
        "</div>" +
        '<div id="jolt-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Spec search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="jolt-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="jolt-query" placeholder="Title" value="' +
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
                        '<tbody id="jolt-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="jolt-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-jolt-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-jolt-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create Jolt spec</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="bj-title">Title</label>' +
                            '<input class="form-control" id="bj-title" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="bj-id">ID</label>' +
                            '<input class="form-control font-monospace" id="bj-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback" id="bj-id-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="bj-description">Description</label>' +
                            '<textarea class="form-control" id="bj-description" rows="3"></textarea></div>' +
                        '<div class="mb-0"><label class="form-label" for="bj-status">Status</label>' +
                            '<select class="form-select" id="bj-status">' +
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
        '<div class="modal fade" id="duplicate-jolt-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="duplicate-jolt-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Duplicate Jolt spec</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Create a new draft from <strong id="bj-dup-title"></strong>.</p>' +
                        '<div class="mb-3"><label class="form-label" for="bj-dup-id">ID</label>' +
                            '<input class="form-control font-monospace" id="bj-dup-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-0"><label class="form-label" for="bj-dup-version">Version</label>' +
                            '<input class="form-control" id="bj-dup-version" placeholder="1.0.1"></div>' +
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
        return String(title || "jolt").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "jolt";
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

    function defaultSpec() {
        return JSON.stringify([
            {
                operation: "shift",
                spec: {
                    "*": "&"
                }
            }
        ], null, 2) + "\n";
    }

    function libraryTypeConcept() {
        return {
            coding: [{
                code: libraryType,
                display: "Jolt"
            }],
            text: libraryType
        };
    }

    function isJoltType(library) {
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
        const pageSize = CadminApi.listPageSize("jolts");
        CadminDeletedList.query({
            type: "Library",
            path: path,
            page: listPage,
            size: pageSize,
            filter: function (library) {
                return !library.type || isJoltType(library);
            }
        }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Library");
            CadminApi.renderPager("#jolt-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "jolts",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#jolt-rows").html(CadminDeletedList.emptyRow(7, "Jolt spec",
                    "No Jolt specs found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (library) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/jolts/" + encodeURIComponent(library.id),
                        library.title || library.name || "Untitled") + "</td>" +
                    "<td>" + esc(library.description || "—") + "</td>" +
                    "<td><code>" + esc(library.version || "—") + "</code></td>" +
                    "<td>" + statusBadge(library.status) + "</td>" +
                    "<td><code>" + esc(library.name || "—") + "</code></td>" +
                    "<td><code>" + esc(library.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        '<a class="btn btn-sm btn-outline-primary me-1" href="#/jolts/' +
                            encodeURIComponent(library.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" data-duplicate="' +
                            esc(library.id) + '">Duplicate</button>' +
                    "</td>" +
                    "</tr>";
            });
            $("#jolt-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#jolt-pager").empty();
            $("#jolt-rows").html('<tr><td colspan="7" class="text-danger">Unable to load libraries from /fhir.</td></tr>');
            CadminApi.showAlert("#jolt-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#jolt-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#jolt-query").val());
    });

    $("#create-jolt-modal").on("show.bs.modal", function () {
        $("#bj-title").val("");
        $("#bj-id").val("").removeClass("is-invalid");
        $("#bj-description").val("");
        $("#bj-status").val("draft");
    });
    $("#bj-id").on("input", function () {
        $(this).removeClass("is-invalid");
    });

    $("#create-jolt-form").on("submit", function (event) {
        event.preventDefault();
        const assignedId = $("#bj-id").val().trim();
        const title = $("#bj-title").val().trim();
        const resource = {
            resourceType: "Library",
            status: $("#bj-status").val() || "draft",
            title: title,
            name: slugName(title),
            version: "1.0.0",
            type: libraryTypeConcept(),
            content: [{
                contentType: specContentType,
                title: "Jolt spec",
                data: encodeText(defaultSpec())
            }]
        };
        const description = $("#bj-description").val().trim();
        if (description) {
            resource.description = description;
        }
        ensureNewId(assignedId, $("#bj-id")).done(function () {
            saveLibrary(resource, assignedId).done(function (created, _status, xhr) {
                const modal = bootstrap.Modal.getInstance(document.getElementById("create-jolt-modal"));
                if (modal) {
                    modal.hide();
                }
                const id = CadminApi.createdResourceId(created, xhr, "Library") || assignedId;
                CadminApi.showToast("success", "Jolt spec created.");
                if (id) {
                    window.location.hash = "#/jolts/" + encodeURIComponent(id);
                    return;
                }
                load($("#jolt-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
            });
        });
    });

    $root.on("click", "[data-duplicate]", function () {
        const id = $(this).attr("data-duplicate");
        CadminApi.fhir("/Library/" + encodeURIComponent(id)).done(function (library) {
            duplicateSource = library;
            $("#bj-dup-title").text(library.title || library.name || library.id);
            $("#bj-dup-id").val("").removeClass("is-invalid");
            $("#bj-dup-version").val(bumpVersion(library.version));
            bootstrap.Modal.getOrCreateInstance(document.getElementById("duplicate-jolt-modal")).show();
        }).fail(function (xhr) {
            CadminApi.showAlert("#jolt-alert", "danger", "Unable to load spec (" + xhr.status + ").");
        });
    });

    $("#duplicate-jolt-form").on("submit", function (event) {
        event.preventDefault();
        if (!duplicateSource) {
            return;
        }
        const assignedId = ($("#bj-dup-id").val() || "").trim();
        const newVersion = ($("#bj-dup-version").val() || "").trim() || bumpVersion(duplicateSource.version);
        const copy = cloneLibrary(duplicateSource, newVersion);
        if (copy.title) {
            copy.title = copy.title + " copy";
        }
        ensureNewId(assignedId, $("#bj-dup-id")).done(function () {
            saveLibrary(copy, assignedId).done(function () {
                const modal = bootstrap.Modal.getInstance(document.getElementById("duplicate-jolt-modal"));
                if (modal) {
                    modal.hide();
                }
                duplicateSource = null;
                CadminApi.showToast("success", "Jolt spec duplicated.");
                load($("#jolt-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Duplicate failed (" + xhr.status + ").");
            });
        });
    });

    CadminDeletedList.bind({
        type: "Library",
        reload: function () { load($("#jolt-query").val(), 0); }
    });

    load(initialQuery);
}
