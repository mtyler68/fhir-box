CadminApp.register("easy-rules", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("easy-rules", token, function (resource, $root) {
            CadminEasyRuleDetail.render(resource, $root);
        }, function () {
            renderEasyRuleList(token);
        });
        return;
    }
    renderEasyRuleList("");
});

function renderEasyRuleList(initialQuery) {
    const libraryType = "easy-rule";
    const routeContentType = "application/easy-rules+yaml";
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
            '<h1 class="h3 mb-0 page-title">Easy Rules</h1>' +
            CadminResourceDocument.splitButton({
                label: "New Easy rule",
                modalTarget: "#create-easy-rule-modal",
                resourceType: "Library"
            }) +
        "</div>" +
        '<div id="easy-rule-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Rule search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="easy-rule-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="easy-rule-query" placeholder="Title" value="' +
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
                        '<tbody id="easy-rule-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="easy-rule-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-easy-rule-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-easy-rule-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create Easy rule</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="er-title">Title</label>' +
                            '<input class="form-control" id="er-title" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="er-id">ID</label>' +
                            '<input class="form-control font-monospace" id="er-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback" id="er-id-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="er-description">Description</label>' +
                            '<textarea class="form-control" id="er-description" rows="3"></textarea></div>' +
                        '<div class="mb-0"><label class="form-label">Status</label>' +
                            '<input class="form-control" value="Draft" disabled>' +
                            '<div class="form-text">New Easy rules are created as draft.</div></div>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="duplicate-easy-rule-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="duplicate-easy-rule-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Duplicate Easy rule</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Create a new draft from <strong id="er-dup-title"></strong>.</p>' +
                        '<div class="mb-3"><label class="form-label" for="er-dup-id">ID</label>' +
                            '<input class="form-control font-monospace" id="er-dup-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-0"><label class="form-label" for="er-dup-version">Version</label>' +
                            '<input class="form-control" id="er-dup-version" placeholder="1.0.1"></div>' +
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
        return String(title || "easy-rule").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "easy-rule";
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
        const name = String(title || "example rule").replace(/"/g, "'");
        return "name: " + name + "\n" +
            "description: when the condition is true, then run the action\n" +
            "priority: 1\n" +
            "slang: mvel\n" +
            "condition: \"true\"\n" +
            "actions:\n" +
            "  - \"System.out.println(\\\"Easy rule fired\\\");\"\n";
    }

    function libraryTypeConcept() {
        return {
            coding: [{
                code: libraryType,
                display: "Easy Rule"
            }],
            text: libraryType
        };
    }

    function isEasyRuleType(library) {
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
        const pageSize = CadminApi.listPageSize("easy-rules");
        CadminDeletedList.query({
            type: "Library",
            path: path,
            page: listPage,
            size: pageSize,
            filter: function (library) {
                return !library.type || isEasyRuleType(library);
            }
        }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Library");
            CadminApi.renderPager("#easy-rule-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "easy-rules",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#easy-rule-rows").html(CadminDeletedList.emptyRow(7, "Easy rule",
                    "No Easy rules found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (library) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/easy-rules/" + encodeURIComponent(library.id),
                        library.title || library.name || "Untitled") + "</td>" +
                    "<td class=\"cadmin-md-cell\">" + CadminApi.markdownCell(library.description) + "</td>" +
                    "<td><code>" + esc(library.version || "—") + "</code></td>" +
                    "<td>" + statusBadge(library.status) + "</td>" +
                    "<td><code>" + esc(library.name || "—") + "</code></td>" +
                    "<td><code>" + esc(library.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        CadminWorkspace.listBookmarkButton(library) +
                        '<a class="btn btn-sm btn-outline-primary me-1" href="#/easy-rules/' +
                            encodeURIComponent(library.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" data-duplicate="' +
                            esc(library.id) + '">Duplicate</button>' +
                    "</td>" +
                    "</tr>";
            });
            $("#easy-rule-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#easy-rule-pager").empty();
            $("#easy-rule-rows").html('<tr><td colspan="7" class="text-danger">Unable to load libraries from /fhir.</td></tr>');
            CadminApi.showAlert("#easy-rule-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#easy-rule-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#easy-rule-query").val());
    });

    $("#create-easy-rule-modal").on("show.bs.modal", function () {
        $("#er-title").val("");
        $("#er-id").val("").removeClass("is-invalid");
        $("#er-description").val("");
    });
    $("#er-id").on("input", function () {
        $(this).removeClass("is-invalid");
    });

    $("#create-easy-rule-form").on("submit", function (event) {
        event.preventDefault();
        const assignedId = $("#er-id").val().trim();
        const title = $("#er-title").val().trim();
        const resource = {
            resourceType: "Library",
            status: "draft",
            title: title,
            name: slugName(title),
            version: "1.0.0",
            type: libraryTypeConcept(),
            content: [{
                contentType: routeContentType,
                title: "Easy rule",
                data: encodeText(defaultYaml(title))
            }]
        };
        const description = $("#er-description").val().trim();
        if (description) {
            resource.description = description;
        }
        ensureNewId(assignedId, $("#er-id")).done(function () {
            saveLibrary(resource, assignedId).done(function (created, _status, xhr) {
                const modal = bootstrap.Modal.getInstance(document.getElementById("create-easy-rule-modal"));
                if (modal) {
                    modal.hide();
                }
                const id = CadminApi.createdResourceId(created, xhr, "Library") || assignedId;
                CadminApi.showToast("success", "Easy rule created.");
                if (id) {
                    window.location.hash = "#/easy-rules/" + encodeURIComponent(id);
                    return;
                }
                load($("#easy-rule-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
            });
        });
    });

    $root.on("click", "[data-duplicate]", function () {
        const id = $(this).attr("data-duplicate");
        CadminApi.fhir("/Library/" + encodeURIComponent(id)).done(function (library) {
            duplicateSource = library;
            $("#er-dup-title").text(library.title || library.name || library.id);
            $("#er-dup-id").val("").removeClass("is-invalid");
            $("#er-dup-version").val(bumpVersion(library.version));
            bootstrap.Modal.getOrCreateInstance(document.getElementById("duplicate-easy-rule-modal")).show();
        }).fail(function (xhr) {
            CadminApi.showAlert("#easy-rule-alert", "danger", "Unable to load rule (" + xhr.status + ").");
        });
    });

    $("#duplicate-easy-rule-form").on("submit", function (event) {
        event.preventDefault();
        if (!duplicateSource) {
            return;
        }
        const assignedId = ($("#er-dup-id").val() || "").trim();
        const newVersion = ($("#er-dup-version").val() || "").trim() || bumpVersion(duplicateSource.version);
        const copy = cloneLibrary(duplicateSource, newVersion);
        if (copy.title) {
            copy.title = copy.title + " copy";
        }
        ensureNewId(assignedId, $("#er-dup-id")).done(function () {
            saveLibrary(copy, assignedId).done(function () {
                const modal = bootstrap.Modal.getInstance(document.getElementById("duplicate-easy-rule-modal"));
                if (modal) {
                    modal.hide();
                }
                duplicateSource = null;
                CadminApi.showToast("success", "Easy rule duplicated.");
                load($("#easy-rule-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Duplicate failed (" + xhr.status + ").");
            });
        });
    });

    CadminDeletedList.bind({
        type: "Library",
        reload: function () { load($("#easy-rule-query").val(), 0); }
    });

    load(initialQuery);
}
