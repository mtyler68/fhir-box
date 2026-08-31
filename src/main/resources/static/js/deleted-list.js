window.CadminDeletedList = (function ($) {
    const HISTORY_PAGE = 100;
    const HISTORY_PAGE_MAX = 20;
    let enabled = false;
    let bound = false;
    let currentType = "";
    let reloadFn = null;
    const cache = {};

    function isOn() {
        return !!enabled;
    }

    function isAdmin() {
        return !!(window.CadminApp && typeof CadminApp.isAdmin === "function" && CadminApp.isAdmin());
    }

    function controls() {
        return '<div class="deleted-list-controls d-flex flex-wrap align-items-center gap-2">' +
            '<div class="form-check form-switch mb-0">' +
                '<input class="form-check-input" type="checkbox" role="switch" id="deleted-list-switch"' +
                    (enabled ? " checked" : "") + ">" +
                '<label class="form-check-label" for="deleted-list-switch">Deleted only</label>' +
            "</div>" +
            '<button class="btn btn-sm btn-outline-danger' + (enabled && isAdmin() ? "" : " d-none") +
                '" type="button" id="deleted-list-expunge">' +
                '<i class="bi bi-trash me-1" aria-hidden="true"></i>Expunge deleted</button>' +
            "</div>";
    }

    function emptyMessage(type) {
        return "No deleted " + (type || currentType || "resource") + " resources.";
    }

    function emptyRow(colspan, type, fallback) {
        return '<tr><td colspan="' + colspan + '" class="text-muted">' +
            (isOn() ? emptyMessage(type) : fallback) + "</td></tr>";
    }

    function syncControls() {
        const $switch = $("#deleted-list-switch");
        if ($switch.length) {
            $switch.prop("checked", enabled);
        }
        $("#deleted-list-expunge").toggleClass("d-none", !(enabled && isAdmin()));
    }

    function invalidate(type) {
        if (type) {
            delete cache[type];
            return;
        }
        Object.keys(cache).forEach(function (key) {
            delete cache[key];
        });
    }

    function historyId(entry, type) {
        const resource = entry && entry.resource;
        if (resource && resource.id) {
            return String(resource.id);
        }
        const url = ((entry && entry.request && entry.request.url) || (entry && entry.fullUrl) || "");
        const match = String(url).match(new RegExp("(?:^|/)" + type + "/([^/?#]+)"));
        if (!match) {
            return "";
        }
        try {
            return decodeURIComponent(match[1]);
        } catch (error) {
            return match[1];
        }
    }

    function isDeleteEntry(entry) {
        return String((entry && entry.request && entry.request.method) || "").toUpperCase() === "DELETE";
    }

    function toResource(type, id, snapshot) {
        const resource = snapshot ? $.extend({}, snapshot) : { resourceType: type };
        resource.resourceType = resource.resourceType || type;
        resource.id = id;
        resource._deleted = true;
        return resource;
    }

    function collectDeleted(type, page, acc, seen) {
        const path = CadminApi.pagedPath("/" + type + "/_history", page, HISTORY_PAGE);
        return CadminApi.fhir(path).then(function (bundle) {
            (bundle.entry || []).forEach(function (entry) {
                const id = historyId(entry, type);
                if (!id) {
                    return;
                }
                if (!seen[id]) {
                    seen[id] = {
                        id: id,
                        deleted: isDeleteEntry(entry),
                        resource: (entry && entry.resource) || null
                    };
                    if (seen[id].deleted) {
                        acc.push(seen[id]);
                    }
                } else if (!seen[id].resource && entry && entry.resource) {
                    seen[id].resource = entry.resource;
                }
            });
            const returned = (bundle.entry || []).length;
            const more = page + 1 < HISTORY_PAGE_MAX
                && CadminApi.bundleHasNext(bundle, page, returned, HISTORY_PAGE, bundle.total);
            if (more) {
                return collectDeleted(type, page + 1, acc, seen);
            }
            return acc.map(function (item) {
                return toResource(type, item.id, item.resource);
            }).filter(function (resource) {
                return resource && resource.id;
            });
        });
    }

    function loadDeleted(type) {
        if (cache[type]) {
            return $.Deferred().resolve(cache[type]).promise();
        }
        const deferred = $.Deferred();
        collectDeleted(type, 0, [], {}).done(function (resources) {
            cache[type] = resources;
            deferred.resolve(resources);
        }).fail(function (xhr) {
            deferred.reject(xhr);
        });
        return deferred.promise();
    }

    function toBundle(resources, page, size) {
        const start = page * size;
        const slice = resources.slice(start, start + size);
        return {
            resourceType: "Bundle",
            type: "searchset",
            total: resources.length,
            entry: slice.map(function (resource) {
                return { resource: resource };
            })
        };
    }

    function query(options) {
        const opts = options || {};
        const type = opts.type;
        const page = Math.max(0, opts.page || 0);
        const size = opts.size || CadminApi.pageSize;
        if (!enabled) {
            return CadminApi.fhir(CadminApi.pagedPath(opts.path, page, size));
        }
        const deferred = $.Deferred();
        loadDeleted(type).done(function (resources) {
            const filtered = typeof opts.filter === "function"
                ? resources.filter(opts.filter)
                : resources;
            deferred.resolve(toBundle(filtered, page, size));
        }).fail(function (xhr) {
            deferred.reject(xhr);
        });
        return deferred.promise();
    }

    function expunge(type, cascade) {
        const parameters = {
            resourceType: "Parameters",
            parameter: [
                { name: "expungeDeletedResources", valueBoolean: true }
            ]
        };
        if (cascade) {
            parameters.parameter.push({ name: "cascade", valueBoolean: true });
        }
        const path = "/" + type + "/$expunge" + (cascade ? "?_cascade=delete" : "");
        return CadminApi.fhir(path, "POST", parameters);
    }

    function ensureModal() {
        if (document.getElementById("deleted-list-expunge-modal")) {
            return;
        }
        $("body").append(
            '<div class="modal fade" id="deleted-list-expunge-modal" tabindex="-1" aria-labelledby="deleted-list-expunge-title">' +
                '<div class="modal-dialog">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title" id="deleted-list-expunge-title">Expunge deleted resources</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body">' +
                            '<p>Permanently expunge all deleted <strong id="deleted-list-expunge-type"></strong> resources?</p>' +
                            '<p class="text-muted">This removes deleted records from the server and cannot be undone. ' +
                                "Resources that depend on these records will be left behind unless you also cascade delete them.</p>" +
                            '<div class="form-check">' +
                                '<input class="form-check-input" type="checkbox" id="deleted-list-cascade">' +
                                '<label class="form-check-label" for="deleted-list-cascade">' +
                                    "Also delete all resources that depend on these records" +
                                "</label>" +
                            "</div>" +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="button" class="btn btn-danger" id="deleted-list-expunge-confirm">' +
                                '<i class="bi bi-trash me-1" aria-hidden="true"></i>Expunge</button>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
    }

    function hideModal() {
        const el = document.getElementById("deleted-list-expunge-modal");
        const modal = el && bootstrap.Modal.getInstance(el);
        if (modal) {
            modal.hide();
        }
    }

    function bind(options) {
        const opts = options || {};
        currentType = opts.type || "";
        reloadFn = opts.reload;
        ensureModal();
        syncControls();
        if (bound) {
            return;
        }
        bound = true;
        $(document).on("change.deletedlist", "#deleted-list-switch", function () {
            enabled = $(this).is(":checked");
            invalidate(currentType);
            syncControls();
            if (typeof reloadFn === "function") {
                reloadFn();
            }
        });
        $(document).on("click.deletedlist", "#deleted-list-expunge", function () {
            if (!enabled || !isAdmin() || !currentType) {
                return;
            }
            $("#deleted-list-expunge-type").text(currentType);
            $("#deleted-list-cascade").prop("checked", false);
            bootstrap.Modal.getOrCreateInstance(document.getElementById("deleted-list-expunge-modal")).show();
        });
        $(document).on("click.deletedlist", "#deleted-list-expunge-confirm", function () {
            const type = currentType;
            const cascade = $("#deleted-list-cascade").is(":checked");
            const $btn = $(this).prop("disabled", true);
            expunge(type, cascade).done(function () {
                hideModal();
                invalidate(type);
                CadminApi.showToast("success", "Deleted " + type + " resources expunged.");
                if (typeof reloadFn === "function") {
                    reloadFn();
                }
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Expunge failed" + (xhr && xhr.status ? " (" + xhr.status + ")" : "") + ".");
            }).always(function () {
                $btn.prop("disabled", false);
            });
        });
    }

    return {
        isOn: isOn,
        controls: controls,
        bind: bind,
        query: query,
        emptyMessage: emptyMessage,
        emptyRow: emptyRow,
        invalidate: invalidate
    };
}(jQuery));
