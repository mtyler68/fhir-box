CadminApp.register("rate-limit-plans", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("rate-limit-plans", token, function (resource, $root) {
            CadminRateLimitPlanDetail.render(resource, $root);
        }, function () {
            renderRateLimitPlanList(token);
        });
        return;
    }
    renderRateLimitPlanList("");
});

function renderRateLimitPlanList(initialQuery) {
    const libraryType = "rate-limit-plan";
    const planContentType = "application/icg-rate-limit+json";
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
            '<h1 class="h3 mb-0 page-title">Rate-limit plans</h1>' +
            CadminResourceDocument.splitButton({
                label: "New rate-limit plan",
                modalTarget: "#create-rate-limit-plan-modal",
                resourceType: "Library"
            }) +
        "</div>" +
        '<div id="rate-limit-plan-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<h6 class="m-0">Plan search</h6>' +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                '<form class="d-flex" id="rate-limit-plan-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="rate-limit-plan-query" placeholder="Title" value="' +
                        CadminApi.escapeHtml(initialQuery) + '">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
                CadminDeletedList.controls() +
                "</div>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Title</th><th>Description</th><th>Tier</th><th>Version</th>" +
                        "<th>Status</th><th>ID</th><th></th></tr></thead>" +
                        '<tbody id="rate-limit-plan-rows"><tr><td colspan="7" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="rate-limit-plan-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="create-rate-limit-plan-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="create-rate-limit-plan-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create rate-limit plan</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="text-muted">A plan is a tier template. It can later be copied onto an ' +
                            "integrator organization DocumentReference.</p>" +
                        '<div class="mb-3"><label class="form-label" for="rlp-create-title">Title</label>' +
                            '<input class="form-control" id="rlp-create-title" required placeholder="Gold"></div>' +
                        '<div class="mb-3"><label class="form-label" for="rlp-create-id">ID</label>' +
                            '<input class="form-control font-monospace" id="rlp-create-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback" id="rlp-create-id-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-3"><label class="form-label" for="rlp-create-description">Description</label>' +
                            '<textarea class="form-control" id="rlp-create-description" rows="3"></textarea></div>' +
                        '<div class="mb-0"><label class="form-label" for="rlp-create-status">Status</label>' +
                            '<select class="form-select" id="rlp-create-status">' +
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
        '<div class="modal fade" id="duplicate-rate-limit-plan-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="duplicate-rate-limit-plan-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Duplicate rate-limit plan</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Create a new draft from <strong id="rlp-dup-title"></strong>.</p>' +
                        '<div class="mb-3"><label class="form-label" for="rlp-dup-id">ID</label>' +
                            '<input class="form-control font-monospace" id="rlp-dup-id" autocomplete="off" maxlength="64">' +
                            '<div class="form-text">Optional. Leave blank for a server-assigned ID.</div>' +
                            '<div class="invalid-feedback">A library with this ID already exists.</div></div>' +
                        '<div class="mb-0"><label class="form-label" for="rlp-dup-version">Version</label>' +
                            '<input class="form-control" id="rlp-dup-version" placeholder="1.0.1"></div>' +
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

    function decodeText(value) {
        if (!value) {
            return "";
        }
        try {
            return decodeURIComponent(escape(atob(value)));
        } catch (err) {
            try {
                return atob(value);
            } catch (ignored) {
                return "";
            }
        }
    }

    function slugName(title) {
        return String(title || "gold").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) || "gold";
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

    function defaultPlanJson(title) {
        const tier = slugName(title);
        return JSON.stringify({
            tier: tier,
            policyVersion: "1.0.0",
            defaults: {
                requestsPerMinute: 60,
                requestsPerDay: 10000
            }
        }, null, 2);
    }

    function planTier(library) {
        const attachment = ((library && library.content) || [])[0] || {};
        if (!attachment.data) {
            return library.name || "—";
        }
        try {
            const json = JSON.parse(decodeText(attachment.data));
            return (json && json.tier) || library.name || "—";
        } catch (ignored) {
            return library.name || "—";
        }
    }

    function libraryTypeConcept() {
        return {
            coding: [{
                code: libraryType,
                display: "Rate-limit plan"
            }],
            text: libraryType
        };
    }

    function isPlanType(library) {
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
        const pageSize = CadminApi.listPageSize("rate-limit-plans");
        CadminDeletedList.query({
            type: "Library",
            path: path,
            page: listPage,
            size: pageSize,
            filter: function (library) {
                return !library.type || isPlanType(library);
            }
        }).done(function (bundle) {
            const entries = CadminApi.bundleResources(bundle, "Library");
            CadminApi.renderPager("#rate-limit-plan-pager", {
                page: listPage,
                size: pageSize,
                pageSizeKey: "rate-limit-plans",
                returned: entries.length,
                total: bundle.total,
                bundle: bundle,
                onPage: function (nextPage) { load(query, nextPage); }
            });
            if (!entries.length) {
                $("#rate-limit-plan-rows").html(CadminDeletedList.emptyRow(7, "Rate-limit plan",
                    "No rate-limit plans found. Create one or start HAPI FHIR."));
                return;
            }
            const rows = entries.map(function (library) {
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink("#/rate-limit-plans/" + encodeURIComponent(library.id),
                        library.title || library.name || "Untitled") + "</td>" +
                    "<td class=\"cadmin-md-cell\">" + CadminApi.markdownCell(library.description) + "</td>" +
                    "<td><code>" + esc(planTier(library)) + "</code></td>" +
                    "<td><code>" + esc(library.version || "—") + "</code></td>" +
                    "<td>" + statusBadge(library.status) + "</td>" +
                    "<td><code>" + esc(library.id) + "</code></td>" +
                    '<td class="text-end text-nowrap">' +
                        CadminWorkspace.listBookmarkButton(library) +
                        '<a class="btn btn-sm btn-outline-primary me-1" href="#/rate-limit-plans/' +
                            encodeURIComponent(library.id) + '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                        '<button class="btn btn-sm btn-outline-secondary" type="button" data-duplicate="' +
                            esc(library.id) + '">Duplicate</button>' +
                    "</td>" +
                    "</tr>";
            });
            $("#rate-limit-plan-rows").html(rows.join(""));
        }).fail(function (xhr) {
            $("#rate-limit-plan-pager").empty();
            $("#rate-limit-plan-rows").html(
                '<tr><td colspan="7" class="text-danger">Unable to load libraries from /fhir.</td></tr>');
            CadminApi.showAlert("#rate-limit-plan-alert", "danger",
                "FHIR request failed (" + xhr.status + "). Is the HAPI FHIR stack running?");
        });
    }

    $("#rate-limit-plan-search-form").on("submit", function (event) {
        event.preventDefault();
        load($("#rate-limit-plan-query").val());
    });

    $("#create-rate-limit-plan-modal").on("show.bs.modal", function () {
        $("#rlp-create-title").val("");
        $("#rlp-create-id").val("").removeClass("is-invalid");
        $("#rlp-create-description").val("");
        $("#rlp-create-status").val("draft");
    });
    $("#rlp-create-id").on("input", function () {
        $(this).removeClass("is-invalid");
    });

    $("#create-rate-limit-plan-form").on("submit", function (event) {
        event.preventDefault();
        const assignedId = $("#rlp-create-id").val().trim();
        const title = $("#rlp-create-title").val().trim();
        const resource = {
            resourceType: "Library",
            status: $("#rlp-create-status").val() || "draft",
            title: title,
            name: slugName(title),
            version: "1.0.0",
            type: libraryTypeConcept(),
            content: [{
                contentType: planContentType,
                title: "Rate-limit plan",
                data: encodeText(defaultPlanJson(title))
            }]
        };
        const description = $("#rlp-create-description").val().trim();
        if (description) {
            resource.description = description;
        }
        ensureNewId(assignedId, $("#rlp-create-id")).done(function () {
            saveLibrary(resource, assignedId).done(function (created, _status, xhr) {
                const modal = bootstrap.Modal.getInstance(document.getElementById("create-rate-limit-plan-modal"));
                if (modal) {
                    modal.hide();
                }
                const id = CadminApi.createdResourceId(created, xhr, "Library") || assignedId;
                CadminApi.showToast("success", "Rate-limit plan created.");
                if (id) {
                    window.location.hash = "#/rate-limit-plans/" + encodeURIComponent(id);
                    return;
                }
                load($("#rate-limit-plan-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Create failed (" + xhr.status + ").");
            });
        });
    });

    $root.on("click", "[data-duplicate]", function () {
        const id = $(this).attr("data-duplicate");
        CadminApi.fhir("/Library/" + encodeURIComponent(id)).done(function (library) {
            duplicateSource = library;
            $("#rlp-dup-title").text(library.title || library.name || library.id);
            $("#rlp-dup-id").val("").removeClass("is-invalid");
            $("#rlp-dup-version").val(bumpVersion(library.version));
            bootstrap.Modal.getOrCreateInstance(document.getElementById("duplicate-rate-limit-plan-modal")).show();
        }).fail(function (xhr) {
            CadminApi.showAlert("#rate-limit-plan-alert", "danger", "Unable to load plan (" + xhr.status + ").");
        });
    });

    $("#duplicate-rate-limit-plan-form").on("submit", function (event) {
        event.preventDefault();
        if (!duplicateSource) {
            return;
        }
        const assignedId = ($("#rlp-dup-id").val() || "").trim();
        const newVersion = ($("#rlp-dup-version").val() || "").trim() || bumpVersion(duplicateSource.version);
        const copy = cloneLibrary(duplicateSource, newVersion);
        if (copy.title) {
            copy.title = copy.title + " copy";
        }
        ensureNewId(assignedId, $("#rlp-dup-id")).done(function () {
            saveLibrary(copy, assignedId).done(function () {
                const modal = bootstrap.Modal.getInstance(document.getElementById("duplicate-rate-limit-plan-modal"));
                if (modal) {
                    modal.hide();
                }
                duplicateSource = null;
                CadminApi.showToast("success", "Rate-limit plan duplicated.");
                load($("#rate-limit-plan-query").val());
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Duplicate failed (" + xhr.status + ").");
            });
        });
    });

    CadminDeletedList.bind({
        type: "Library",
        reload: function () { load($("#rate-limit-plan-query").val(), 0); }
    });

    load(initialQuery);
}
