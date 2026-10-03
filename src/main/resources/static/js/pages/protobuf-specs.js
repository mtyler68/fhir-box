CadminApp.register("proto-specs", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("proto-specs", token, function (resource, $root) {
            CadminProtobufSpecDetail.render(resource, $root);
        }, function () {
            renderProtobufSpecList(token);
        });
        return;
    }
    renderProtobufSpecList("");
});

function renderProtobufSpecList(initialQuery) {
    const libraryType = "proto-spec";
    const protoContentType = "text/x-protobuf";
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
            '<h1 class="h3 mb-0 page-title">Protobuf Specs</h1>' +
            CadminResourceDocument.splitButton({
                label: "New Protobuf spec",
                modalTarget: "#create-protobuf-spec-modal",
                resourceType: "Library"
            }) +
        "</div>" +
        '<div id="protobuf-spec-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Spec search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="protobuf-spec-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="protobuf-spec-query" placeholder="Title" value="' +
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
                        '<tbody id="protobuf-spec-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="protobuf-spec-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-protobuf-spec-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-protobuf-spec-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create Protobuf spec</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="ps-title">Title</label>' +
                            '<input class="form-control" id="ps-title" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="ps-id">ID</label>' +
                            '<input class="form-control font-monospace" id="ps-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback" id="ps-id-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="ps-description">Description</label>' +
                            '<textarea class="form-control" id="ps-description" rows="3"></textarea></div>' +
                        '<div class="mb-0"><label class="form-label" for="ps-status">Status</label>' +
                            '<select class="form-select" id="ps-status">' +
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
        '<div class="modal fade" id="duplicate-protobuf-spec-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="duplicate-protobuf-spec-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Duplicate Protobuf spec</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Create a new draft from <strong id="ps-dup-title"></strong>.</p>' +
                        '<div class="mb-3"><label class="form-label" for="ps-dup-id">ID</label>' +
                            '<input class="form-control font-monospace" id="ps-dup-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-0"><label class="form-label" for="ps-dup-version">Version</label>' +
                            '<input class="form-control" id="ps-dup-version" placeholder="1.0.1"></div>' +
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
        return String(title || "proto-spec").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "proto-spec";
    }

    function pascalName(title) {
        const parts = slugName(title).split("-").filter(Boolean);
        const name = parts.map(function (part) {
            return part.charAt(0).toUpperCase() + part.slice(1);
        }).join("");
        return name || "Example";
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

    function defaultProto(title) {
        const pkg = slugName(title).replace(/-/g, ".") || "example";
        const message = pascalName(title);
        return 'syntax = "proto3";\n\n' +
            "package " + pkg + ";\n\n" +
            'option java_package = "com.example";\n' +
            "option java_multiple_files = true;\n\n" +
            "message " + message + " {\n" +
            "  string id = 1;\n" +
            "  string name = 2;\n" +
            "}\n";
    }

    function libraryTypeConcept() {
        return {
            coding: [{
                code: libraryType,
                display: "Protobuf Spec"
            }],
            text: libraryType
        };
    }

    function isProtoType(library) {
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
        const pageSize = CadminApi.listPageSize("proto-specs");
        CadminDeletedList.query({
            type: "Library",
            path: path,
            page: listPage,
            size: pageSize,
            filter: function (library) {
                return !library.type || isProtoType(library);
            }
        }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Library");
            CadminApi.renderPager("#protobuf-spec-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "proto-specs",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#protobuf-spec-rows").html(CadminDeletedList.emptyRow(7, "Protobuf spec",
                    "No Protobuf specs found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (library) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/proto-specs/" + encodeURIComponent(library.id),
                        library.title || library.name || "Untitled") + "</td>" +
                    "<td class=\"cadmin-md-cell\">" + CadminApi.markdownCell(library.description) + "</td>" +
                    "<td><code>" + esc(library.version || "—") + "</code></td>" +
                    "<td>" + statusBadge(library.status) + "</td>" +
                    "<td><code>" + esc(library.name || "—") + "</code></td>" +
                    "<td><code>" + esc(library.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        CadminWorkspace.listBookmarkButton(library) +
                        '<a class="btn btn-sm btn-outline-primary me-1" href="#/proto-specs/' +
                            encodeURIComponent(library.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" data-duplicate="' +
                            esc(library.id) + '">Duplicate</button>' +
                    "</td>" +
                    "</tr>";
            });
            $("#protobuf-spec-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#protobuf-spec-pager").empty();
            $("#protobuf-spec-rows").html('<tr><td colspan="7" class="text-danger">Unable to load libraries from /fhir.</td></tr>');
            CadminApi.showAlert("#protobuf-spec-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#protobuf-spec-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#protobuf-spec-query").val());
    });

    $("#create-protobuf-spec-modal").on("show.bs.modal", function () {
        $("#ps-title").val("");
        $("#ps-id").val("").removeClass("is-invalid");
        $("#ps-description").val("");
        $("#ps-status").val("draft");
    });
    $("#ps-id").on("input", function () {
        $(this).removeClass("is-invalid");
    });

    $("#create-protobuf-spec-form").on("submit", function (event) {
        event.preventDefault();
        const assignedId = $("#ps-id").val().trim();
        const title = $("#ps-title").val().trim();
        const resource = {
            resourceType: "Library",
            status: $("#ps-status").val() || "draft",
            title: title,
            name: slugName(title),
            version: "1.0.0",
            type: libraryTypeConcept(),
            content: [{
                contentType: protoContentType,
                title: "Protobuf spec",
                data: encodeText(defaultProto(title))
            }]
        };
        const description = $("#ps-description").val().trim();
        if (description) {
            resource.description = description;
        }
        ensureNewId(assignedId, $("#ps-id")).done(function () {
            saveLibrary(resource, assignedId).done(function (created, _status, xhr) {
                const modal = bootstrap.Modal.getInstance(document.getElementById("create-protobuf-spec-modal"));
                if (modal) {
                    modal.hide();
                }
                const id = CadminApi.createdResourceId(created, xhr, "Library") || assignedId;
                CadminApi.showToast("success", "Protobuf spec created.");
                if (id) {
                    window.location.hash = "#/proto-specs/" + encodeURIComponent(id);
                    return;
                }
                load($("#protobuf-spec-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
            });
        });
    });

    $root.on("click", "[data-duplicate]", function () {
        const id = $(this).attr("data-duplicate");
        CadminApi.fhir("/Library/" + encodeURIComponent(id)).done(function (library) {
            duplicateSource = library;
            $("#ps-dup-title").text(library.title || library.name || library.id);
            $("#ps-dup-id").val("").removeClass("is-invalid");
            $("#ps-dup-version").val(bumpVersion(library.version));
            bootstrap.Modal.getOrCreateInstance(document.getElementById("duplicate-protobuf-spec-modal")).show();
        }).fail(function (xhr) {
            CadminApi.showAlert("#protobuf-spec-alert", "danger", "Unable to load spec (" + xhr.status + ").");
        });
    });

    $("#duplicate-protobuf-spec-form").on("submit", function (event) {
        event.preventDefault();
        if (!duplicateSource) {
            return;
        }
        const assignedId = ($("#ps-dup-id").val() || "").trim();
        const newVersion = ($("#ps-dup-version").val() || "").trim() || bumpVersion(duplicateSource.version);
        const copy = cloneLibrary(duplicateSource, newVersion);
        if (copy.title) {
            copy.title = copy.title + " copy";
        }
        ensureNewId(assignedId, $("#ps-dup-id")).done(function () {
            saveLibrary(copy, assignedId).done(function () {
                const modal = bootstrap.Modal.getInstance(document.getElementById("duplicate-protobuf-spec-modal"));
                if (modal) {
                    modal.hide();
                }
                duplicateSource = null;
                CadminApi.showToast("success", "Protobuf spec duplicated.");
                load($("#protobuf-spec-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Duplicate failed (" + xhr.status + ").");
            });
        });
    });

    CadminDeletedList.bind({
        type: "Library",
        reload: function () { load($("#protobuf-spec-query").val(), 0); }
    });

    load(initialQuery);
}
