CadminApp.register("rule-sets", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("rule-sets", token, function (resource, $root) {
            CadminRuleSetDetail.render(resource, $root);
        }, function () {
            renderRuleSetList(token);
        });
        return;
    }
    renderRuleSetList("");
});

function renderRuleSetList(initialQuery) {
    const libraryType = "rule-set";
    const routeContentType = "application/rule-set+json";
    const statusOptions = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const defaultPriorityThreshold = 2147483647;
    let duplicateSource = null;
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Rule Sets</h1>' +
            CadminResourceDocument.splitButton({
                label: "New Rule set",
                modalTarget: "#create-rule-set-modal",
                resourceType: "Library"
            }) +
        "</div>" +
        '<div id="rule-set-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Rule set search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="rule-set-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="rule-set-query" placeholder="Title" value="' +
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
                        '<tbody id="rule-set-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="rule-set-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-rule-set-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-rule-set-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create Rule set</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3"><label class="form-label" for="rs-title">Title</label>' +
                            '<input class="form-control" id="rs-title" required></div>' +
                        '<div class="mb-3"><label class="form-label" for="rs-id">ID</label>' +
                            '<input class="form-control font-monospace" id="rs-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback" id="rs-id-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="rs-description">Description</label>' +
                            '<textarea class="form-control" id="rs-description" rows="3"></textarea></div>' +
                        '<div class="mb-0"><label class="form-label" for="rs-status">Status</label>' +
                            '<select class="form-select" id="rs-status">' +
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
        '<div class="modal fade" id="duplicate-rule-set-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="duplicate-rule-set-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Duplicate Rule set</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Create a new draft from <strong id="rs-dup-title"></strong>.</p>' +
                        '<div class="mb-3"><label class="form-label" for="rs-dup-id">ID</label>' +
                            '<input class="form-control font-monospace" id="rs-dup-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-0"><label class="form-label" for="rs-dup-version">Version</label>' +
                            '<input class="form-control" id="rs-dup-version" placeholder="1.0.1"></div>' +
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
        return String(title || "rule-set").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "rule-set";
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

    function defaultEngineJson() {
        return JSON.stringify({
            evaluationPlan: "Default",
            skipOnFirstAppliedRule: false,
            skipOnFirstNonTriggeredRule: false,
            skipOnFirstFailedRule: false,
            priorityThreshold: defaultPriorityThreshold
        }, null, 2);
    }

    function libraryTypeConcept() {
        return {
            coding: [{
                code: libraryType,
                display: "Rule Set"
            }],
            text: libraryType
        };
    }

    function isRuleSetType(library) {
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
        const pageSize = CadminApi.listPageSize("rule-sets");
        CadminDeletedList.query({
            type: "Library",
            path: path,
            page: listPage,
            size: pageSize,
            filter: function (library) {
                return !library.type || isRuleSetType(library);
            }
        }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Library");
            CadminApi.renderPager("#rule-set-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "rule-sets",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#rule-set-rows").html(CadminDeletedList.emptyRow(7, "Rule set",
                    "No Rule sets found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (library) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/rule-sets/" + encodeURIComponent(library.id),
                        library.title || library.name || "Untitled") + "</td>" +
                    "<td class=\"cadmin-md-cell\">" + CadminApi.markdownCell(library.description) + "</td>" +
                    "<td><code>" + esc(library.version || "—") + "</code></td>" +
                    "<td>" + statusBadge(library.status) + "</td>" +
                    "<td><code>" + esc(library.name || "—") + "</code></td>" +
                    "<td><code>" + esc(library.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        CadminWorkspace.listBookmarkButton(library) +
                        '<a class="btn btn-sm btn-outline-primary me-1" href="#/rule-sets/' +
                            encodeURIComponent(library.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" data-duplicate="' +
                            esc(library.id) + '">Duplicate</button>' +
                    "</td>" +
                    "</tr>";
            });
            $("#rule-set-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#rule-set-pager").empty();
            $("#rule-set-rows").html('<tr><td colspan="7" class="text-danger">Unable to load libraries from /fhir.</td></tr>');
            CadminApi.showAlert("#rule-set-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#rule-set-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#rule-set-query").val());
    });

    $("#create-rule-set-modal").on("show.bs.modal", function () {
        $("#rs-title").val("");
        $("#rs-id").val("").removeClass("is-invalid");
        $("#rs-description").val("");
        $("#rs-status").val("draft");
    });
    $("#rs-id").on("input", function () {
        $(this).removeClass("is-invalid");
    });

    $("#create-rule-set-form").on("submit", function (event) {
        event.preventDefault();
        const assignedId = $("#rs-id").val().trim();
        const title = $("#rs-title").val().trim();
        const resource = {
            resourceType: "Library",
            status: $("#rs-status").val() || "draft",
            title: title,
            name: slugName(title),
            version: "1.0.0",
            type: libraryTypeConcept(),
            content: [{
                contentType: routeContentType,
                title: "Engine parameters",
                data: encodeText(defaultEngineJson())
            }]
        };
        const description = $("#rs-description").val().trim();
        if (description) {
            resource.description = description;
        }
        ensureNewId(assignedId, $("#rs-id")).done(function () {
            saveLibrary(resource, assignedId).done(function (created, _status, xhr) {
                const modal = bootstrap.Modal.getInstance(document.getElementById("create-rule-set-modal"));
                if (modal) {
                    modal.hide();
                }
                const id = CadminApi.createdResourceId(created, xhr, "Library") || assignedId;
                CadminApi.showToast("success", "Rule set created.");
                if (id) {
                    window.location.hash = "#/rule-sets/" + encodeURIComponent(id);
                    return;
                }
                load($("#rule-set-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
            });
        });
    });

    $root.on("click", "[data-duplicate]", function () {
        const id = $(this).attr("data-duplicate");
        CadminApi.fhir("/Library/" + encodeURIComponent(id)).done(function (library) {
            duplicateSource = library;
            $("#rs-dup-title").text(library.title || library.name || library.id);
            $("#rs-dup-id").val("").removeClass("is-invalid");
            $("#rs-dup-version").val(bumpVersion(library.version));
            bootstrap.Modal.getOrCreateInstance(document.getElementById("duplicate-rule-set-modal")).show();
        }).fail(function (xhr) {
            CadminApi.showAlert("#rule-set-alert", "danger", "Unable to load rule set (" + xhr.status + ").");
        });
    });

    $("#duplicate-rule-set-form").on("submit", function (event) {
        event.preventDefault();
        if (!duplicateSource) {
            return;
        }
        const assignedId = ($("#rs-dup-id").val() || "").trim();
        const newVersion = ($("#rs-dup-version").val() || "").trim() || bumpVersion(duplicateSource.version);
        const copy = cloneLibrary(duplicateSource, newVersion);
        if (copy.title) {
            copy.title = copy.title + " copy";
        }
        ensureNewId(assignedId, $("#rs-dup-id")).done(function () {
            saveLibrary(copy, assignedId).done(function () {
                const modal = bootstrap.Modal.getInstance(document.getElementById("duplicate-rule-set-modal"));
                if (modal) {
                    modal.hide();
                }
                duplicateSource = null;
                CadminApi.showToast("success", "Rule set duplicated.");
                load($("#rule-set-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Duplicate failed (" + xhr.status + ").");
            });
        });
    });

    CadminDeletedList.bind({
        type: "Library",
        reload: function () { load($("#rule-set-query").val(), 0); }
    });

    load(initialQuery);
}
