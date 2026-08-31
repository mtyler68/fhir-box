window.CadminTargetList = (function () {
    const STORE_KEY = "cadmin.targetListId";
    const ROOT_ID = "cadmin-target-list";
    const STATUS_OPTIONS = [
        { code: "current", display: "Current" },
        { code: "retired", display: "Retired" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    const MODE_OPTIONS = [
        { code: "working", display: "Working" },
        { code: "snapshot", display: "Snapshot" },
        { code: "changes", display: "Changes" }
    ];

    let target = null;
    let targetId = "";
    let open = false;
    let bound = false;
    let currentResource = null;
    let currentGetter = null;
    let saveChain = $.Deferred().resolve();
    let dragFrom = -1;
    let dropBefore = -1;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function readStore() {
        try {
            return String(sessionStorage.getItem(STORE_KEY) || "").trim();
        } catch (ignore) {
            return "";
        }
    }

    function writeStore(id) {
        try {
            if (id) {
                sessionStorage.setItem(STORE_KEY, id);
            } else {
                sessionStorage.removeItem(STORE_KEY);
            }
        } catch (ignore) {
            // private mode
        }
    }

    function mountedResource() {
        return currentGetter ? currentGetter() : currentResource;
    }

    function isFhirResource(resource) {
        return !!(resource && resource.resourceType && resource.id);
    }

    function resourceLabel(resource) {
        if (!resource) {
            return "";
        }
        if (typeof resource.title === "string" && resource.title) {
            return resource.title;
        }
        if (typeof resource.name === "string" && resource.name) {
            return resource.name;
        }
        const name = resource.name && resource.name[0];
        if (typeof name === "string" && name) {
            return name;
        }
        if (name) {
            const given = (name.given || []).join(" ");
            return [given, name.family].filter(Boolean).join(" ").trim() || resource.id || "";
        }
        const deviceName = resource.deviceName && resource.deviceName[0];
        if (deviceName && deviceName.name) {
            return deviceName.name;
        }
        return resource.id || resource.resourceType || "";
    }

    function listTitle(list) {
        return (list && (list.title || list.id)) || "Untitled list";
    }

    function subjects(list) {
        const subject = list && list.subject;
        if (!subject) {
            return [];
        }
        return Array.isArray(subject) ? subject : [subject];
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        return ref.display || (ref.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function refHtml(ref) {
        const type = CadminApi.referenceType(ref);
        const id = CadminApi.referenceId(ref);
        if (type && id) {
            return CadminApi.resourceLink(CadminApi.detailHref(type, id), refLabel(ref));
        }
        return esc(refLabel(ref));
    }

    function sameRef(a, b) {
        const type = CadminApi.referenceType(a);
        const id = CadminApi.referenceId(a);
        return !!(type && id && type === CadminApi.referenceType(b) && id === CadminApi.referenceId(b));
    }

    function statusBadge(status) {
        const kind = status === "current" ? "success"
            : status === "entered-in-error" ? "danger"
                : "secondary";
        return '<span class="badge text-bg-' + kind + '">' +
            esc(CadminApi.valueSetDisplay(STATUS_OPTIONS, status) || status || "—") + "</span>";
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    function isTarget(id) {
        return !!(id && targetId && String(id) === String(targetId));
    }

    function notifyUpdated() {
        $(document).trigger("cadmin-target-list-updated", [target]);
        $(document).trigger("cadmin-target-list-changed", [targetId]);
    }

    function syncAddButtons() {
        const ok = isFhirResource(mountedResource());
        $("body").toggleClass("cadmin-has-fhir-resource", ok);
        $("[data-target-list-add]")
            .toggleClass("btn-outline-secondary", !targetId)
            .toggleClass("btn-outline-primary", !!targetId);
    }

    function paintChoosers() {
        $("[data-set-target]").each(function () {
            const $btn = $(this);
            const id = $btn.attr("data-set-target");
            const on = isTarget(id);
            const labeled = $btn.hasClass("cadmin-target-list-chooser-lg");
            $btn.toggleClass("btn-success", on)
                .toggleClass("btn-outline-secondary", !on)
                .attr("title", on ? "Open target list" : "Set as target list")
                .attr("aria-label", on ? "Open target list" : "Set as target list");
            $btn.find("i").attr("class", "bi " + (on ? "bi-pin-angle-fill" : "bi-pin-angle") +
                (labeled ? " me-1" : ""));
            if (labeled) {
                $btn.find(".ctl-chooser-label").text(on ? "Target list" : "Set as target");
            }
        });
    }

    function chooserButton(id, options) {
        const large = options && options.large;
        const on = isTarget(id);
        return '<button class="btn' + (large ? "" : " btn-sm") +
            (on ? " btn-success" : " btn-outline-secondary") +
            (large ? " cadmin-target-list-chooser-lg" : "") +
            '" type="button" data-set-target="' + esc(id) +
            '" title="' + (on ? "Open target list" : "Set as target list") +
            '" aria-label="' + (on ? "Open target list" : "Set as target list") + '">' +
            '<i class="bi ' + (on ? "bi-pin-angle-fill" : "bi-pin-angle") +
            (large ? " me-1" : "") + '" aria-hidden="true"></i>' +
            (large ? '<span class="ctl-chooser-label">' +
                (on ? "Target list" : "Set as target") + "</span>" : "") +
            "</button>";
    }

    function button() {
        return '<button class="btn btn-outline-primary" type="button" data-target-list-add ' +
            'title="Add to target list" aria-label="Add to target list">' +
            '<i class="bi bi-list-check" aria-hidden="true"></i></button>';
    }

    function root() {
        return document.getElementById(ROOT_ID);
    }

    function $root() {
        return $("#" + ROOT_ID);
    }

    function entryCount() {
        return ((target && target.entry) || []).length;
    }

    function ensureShell() {
        if (root()) {
            return;
        }
        $("body").append(
            '<div id="' + ROOT_ID + '" class="cadmin-target-list">' +
                '<div class="cadmin-target-list-backdrop" data-ctl-hide></div>' +
                '<button class="cadmin-target-list-tab" type="button" data-ctl-toggle ' +
                    'title="Target list" aria-controls="' + ROOT_ID + '-panel" aria-expanded="false">' +
                    '<i class="bi bi-list-ul" aria-hidden="true"></i>' +
                    '<span class="badge text-bg-primary cadmin-target-list-count">0</span>' +
                "</button>" +
                '<aside class="cadmin-target-list-panel" id="' + ROOT_ID + '-panel" role="dialog" ' +
                    'aria-labelledby="' + ROOT_ID + '-title">' +
                    '<div class="cadmin-target-list-header">' +
                        '<div class="min-w-0">' +
                            '<div class="text-muted small">Target list</div>' +
                            '<h2 class="h5 mb-0 text-truncate" id="' + ROOT_ID + '-title">List</h2>' +
                        "</div>" +
                        '<button class="btn-close" type="button" data-ctl-hide aria-label="Hide"></button>' +
                    "</div>" +
                    '<div class="cadmin-target-list-body" id="' + ROOT_ID + '-body"></div>' +
                    '<div class="cadmin-target-list-footer">' +
                        '<button class="btn btn-outline-secondary" type="button" data-ctl-hide>Hide</button>' +
                        '<button class="btn btn-outline-danger" type="button" data-ctl-close>Close</button>' +
                    "</div>" +
                "</aside>" +
            "</div>"
        );
    }

    function applyChrome() {
        const $el = $root();
        $el.toggleClass("has-target", !!targetId);
        $el.toggleClass("is-open", !!(targetId && open));
        $el.find("[data-ctl-toggle]").attr("aria-expanded", targetId && open ? "true" : "false");
        const count = entryCount();
        $el.find(".cadmin-target-list-count").text(String(count)).toggleClass("d-none", !targetId);
        paintChoosers();
        syncAddButtons();
    }

    function renderBody() {
        const $body = $("#" + ROOT_ID + "-body");
        const $title = $("#" + ROOT_ID + "-title");
        if (!target) {
            $title.text(targetId ? "Loading…" : "List");
            $body.html(targetId
                ? '<p class="text-muted mb-0">Loading target list…</p>'
                : '<p class="text-muted mb-0">Choose a list from Lists to use as the target.</p>');
            applyChrome();
            return;
        }
        const href = CadminApi.detailHref("List", target.id);
        $title.html(CadminApi.resourceLink(href, listTitle(target)));
        const subject = subjects(target)[0];
        const rows = target.entry || [];
        let entriesHtml;
        if (!rows.length) {
            entriesHtml = '<p class="text-muted small mb-0">No items in this list.</p>';
        } else {
            entriesHtml = '<div class="cadmin-target-list-entries" role="list">' +
                rows.map(function (item, index) {
                    const type = CadminApi.referenceType(item.item) || "Resource";
                    const deleted = !!item.deleted;
                    return '<div class="cadmin-target-list-entry' + (deleted ? " is-deleted" : "") +
                        '" role="listitem" draggable="true" data-ctl-index="' + index + '">' +
                        '<span class="cadmin-target-list-grip" title="Drag to reorder" aria-hidden="true">' +
                            '<i class="bi bi-grip-vertical"></i></span>' +
                        '<div class="cadmin-target-list-entry-main min-w-0">' +
                            '<div class="small text-muted">' + esc(type) +
                                (item.date ? " · " + esc(formatDate(item.date)) : "") + "</div>" +
                            '<div class="d-flex align-items-center gap-2 min-w-0">' +
                                '<div class="cadmin-target-list-entry-label text-truncate">' +
                                    refHtml(item.item) + "</div>" +
                                (deleted
                                    ? '<span class="badge rounded-pill text-bg-danger flex-shrink-0">Deleted</span>'
                                    : "") +
                            "</div>" +
                        "</div>" +
                        '<div class="cadmin-target-list-entry-actions">' +
                            (deleted
                                ? '<button class="btn btn-sm btn-outline-secondary" type="button" data-ctl-restore="' +
                                    index + '" title="Restore" aria-label="Restore">' +
                                    '<i class="bi bi-arrow-counterclockwise"></i></button>'
                                : '<button class="btn btn-sm btn-outline-secondary" type="button" data-ctl-soft="' +
                                    index + '" title="Mark deleted" aria-label="Mark deleted">' +
                                    '<i class="bi bi-dash-circle"></i></button>') +
                            '<button class="btn btn-sm btn-outline-danger" type="button" data-ctl-hard="' +
                                index + '" title="Remove" aria-label="Remove">' +
                                '<i class="bi bi-trash"></i></button>' +
                        "</div>" +
                    "</div>";
                }).join("") +
                "</div>";
        }
        $body.html(
            '<dl class="cadmin-target-list-meta">' +
                "<div><dt>Status</dt><dd>" + statusBadge(target.status) + "</dd></div>" +
                "<div><dt>Mode</dt><dd>" +
                    esc(CadminApi.valueSetDisplay(MODE_OPTIONS, target.mode) || target.mode || "—") +
                    "</dd></div>" +
                "<div><dt>Subject</dt><dd>" + refHtml(subject) + "</dd></div>" +
                "<div><dt>Date</dt><dd>" + esc(formatDate(target.date)) + "</dd></div>" +
                "<div><dt>Items</dt><dd>" + esc(String(rows.length)) + "</dd></div>" +
            "</dl>" +
            '<div class="d-flex align-items-center justify-content-between mb-2">' +
                '<h3 class="h6 mb-0">Items</h3>' +
                '<a class="small" href="' + esc(href) + '">Open list</a>' +
            "</div>" +
            entriesHtml
        );
        applyChrome();
    }

    function persist(list, message) {
        if (!list || !list.id) {
            return $.Deferred().reject().promise();
        }
        const id = list.id;
        saveChain = saveChain.then(function () {
            return CadminApi.fhir("/List/" + encodeURIComponent(id), "PUT", list, { silent: true })
                .done(function (updated) {
                    if (!isTarget(id)) {
                        return;
                    }
                    target = updated || list;
                    renderBody();
                    notifyUpdated();
                    if (message) {
                        CadminApi.showToast("success", message);
                    }
                })
                .fail(function (xhr) {
                    CadminApi.showToast("danger", "Update target list failed (" + xhr.status + ").");
                    reload({ open: open });
                })
                .then(null, function () {
                    return $.Deferred().resolve();
                });
        });
        return saveChain;
    }

    function mutate(fn, message) {
        if (!target) {
            return;
        }
        fn(target);
        if (target.entry && !target.entry.length) {
            delete target.entry;
        }
        persist(target, message);
    }

    function moveEntry(from, to) {
        const rows = (target && target.entry) || [];
        if (from < 0 || to < 0 || from >= rows.length) {
            return;
        }
        if (from === to || from + 1 === to) {
            return;
        }
        const next = rows.slice();
        const item = next.splice(from, 1)[0];
        const dest = to > from ? to - 1 : to;
        next.splice(dest, 0, item);
        target.entry = next;
        target.orderedBy = {
            coding: [{
                system: "http://terminology.hl7.org/CodeSystem/list-order",
                code: "user",
                display: "Sorted by User"
            }]
        };
        persist(target);
    }

    function clearDrag() {
        dragFrom = -1;
        dropBefore = -1;
        $root().find(".cadmin-target-list-entry").removeClass("is-dragging drop-before drop-after");
    }

    function show() {
        if (!targetId) {
            return;
        }
        open = true;
        applyChrome();
    }

    function hide() {
        open = false;
        applyChrome();
    }

    function toggle() {
        if (!targetId) {
            return;
        }
        if (open) {
            hide();
        } else {
            show();
        }
    }

    function clear() {
        target = null;
        targetId = "";
        open = false;
        writeStore("");
        renderBody();
        notifyUpdated();
    }

    function reload(options) {
        const id = targetId;
        if (!id) {
            return $.Deferred().reject().promise();
        }
        return CadminApi.fhir("/List/" + encodeURIComponent(id), "GET", null, { silent: true }).done(function (list) {
            if (!isTarget(id)) {
                return;
            }
            target = list;
            if (options && options.open) {
                open = true;
            }
            renderBody();
            notifyUpdated();
        }).fail(function (xhr) {
            if (xhr.status === 404 || xhr.status === 410) {
                CadminApi.showToast("warning", "Target list is no longer available.");
                clear();
                return;
            }
            $("#" + ROOT_ID + "-body").html(
                '<p class="text-danger mb-0">Unable to load the target list (' + xhr.status + ").</p>");
            applyChrome();
        });
    }

    function set(id) {
        const next = String(id || "").trim();
        if (!next) {
            return;
        }
        targetId = next;
        target = null;
        writeStore(next);
        open = true;
        renderBody();
        reload({ open: true });
    }

    function syncFrom(list) {
        if (!list || !list.id || !isTarget(list.id)) {
            return;
        }
        target = list;
        renderBody();
    }

    function add(resource) {
        const item = resource || mountedResource();
        if (!isFhirResource(item)) {
            CadminApi.showToast("danger", "This page is not a FHIR resource.");
            return;
        }
        if (!targetId) {
            CadminApi.showToast("warning", "Choose a target list from Lists first.");
            return;
        }
        if (item.resourceType === "List" && item.id === targetId) {
            CadminApi.showToast("warning", "A list cannot add itself as an entry.");
            return;
        }
        const reference = {
            reference: item.resourceType + "/" + item.id,
            display: resourceLabel(item) || (item.resourceType + "/" + item.id)
        };
        CadminApi.fhir("/List/" + encodeURIComponent(targetId), "GET", null, { silent: true }).done(function (list) {
            if (!isTarget(list.id)) {
                return;
            }
            target = list;
            list.entry = list.entry || [];
            let existing = null;
            list.entry.forEach(function (entry) {
                if (sameRef(entry.item, reference)) {
                    existing = entry;
                }
            });
            if (existing) {
                if (existing.deleted) {
                    delete existing.deleted;
                    persist(list, "Restored on the target list.");
                    show();
                    return;
                }
                CadminApi.showToast("info", "Already on the target list.");
                show();
                renderBody();
                return;
            }
            list.entry.push({
                item: reference,
                date: new Date().toISOString()
            });
            persist(list, "Added to the target list.");
            show();
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Unable to load the target list (" + xhr.status + ").");
        });
    }

    function mount(resource) {
        if (typeof resource === "function") {
            currentGetter = resource;
            currentResource = resource() || null;
        } else {
            currentGetter = null;
            currentResource = resource || null;
        }
        syncAddButtons();
    }

    function bindOnce() {
        if (bound) {
            return;
        }
        bound = true;
        const $doc = $(document);
        $doc.on("click.targetlist", "[data-ctl-hide]", function (event) {
            event.preventDefault();
            hide();
        });
        $doc.on("click.targetlist", "[data-ctl-close]", function (event) {
            event.preventDefault();
            clear();
        });
        $doc.on("click.targetlist", "[data-ctl-toggle]", function (event) {
            event.preventDefault();
            toggle();
        });
        $doc.on("click.targetlist", "[data-set-target]", function (event) {
            event.preventDefault();
            const id = $(this).attr("data-set-target");
            if (isTarget(id)) {
                show();
                return;
            }
            set(id);
        });
        $doc.on("click.targetlist", "[data-target-list-add]", function (event) {
            event.preventDefault();
            add(mountedResource());
        });
        $doc.on("click.targetlist", "[data-ctl-soft]", function (event) {
            event.preventDefault();
            const index = Number($(this).attr("data-ctl-soft"));
            mutate(function (list) {
                if (list.entry && list.entry[index]) {
                    list.entry[index].deleted = true;
                }
            }, "Marked deleted.");
        });
        $doc.on("click.targetlist", "[data-ctl-restore]", function (event) {
            event.preventDefault();
            const index = Number($(this).attr("data-ctl-restore"));
            mutate(function (list) {
                if (list.entry && list.entry[index]) {
                    delete list.entry[index].deleted;
                }
            }, "Entry restored.");
        });
        $doc.on("click.targetlist", "[data-ctl-hard]", function (event) {
            event.preventDefault();
            const index = Number($(this).attr("data-ctl-hard"));
            CadminApi.confirm("Remove this item from the target list?").done(function () {
                mutate(function (list) {
                    list.entry = (list.entry || []).filter(function (_item, i) {
                        return i !== index;
                    });
                }, "Item removed.");
            });
        });
        $doc.on("dragstart.targetlist", ".cadmin-target-list-entry", function (event) {
            if ($(event.target).closest("button, a").length) {
                event.preventDefault();
                return;
            }
            dragFrom = Number($(this).attr("data-ctl-index"));
            const native = event.originalEvent && event.originalEvent.dataTransfer;
            if (native) {
                native.effectAllowed = "move";
                native.setData("text/plain", String(dragFrom));
            }
            $(this).addClass("is-dragging");
        });
        $doc.on("dragover.targetlist", ".cadmin-target-list-entry", function (event) {
            if (dragFrom < 0) {
                return;
            }
            event.preventDefault();
            const native = event.originalEvent;
            if (native && native.dataTransfer) {
                native.dataTransfer.dropEffect = "move";
            }
            const rect = this.getBoundingClientRect();
            const before = native && (native.clientY - rect.top) < rect.height / 2;
            $root().find(".cadmin-target-list-entry").removeClass("drop-before drop-after");
            $(this).addClass(before ? "drop-before" : "drop-after");
            dropBefore = Number($(this).attr("data-ctl-index")) + (before ? 0 : 1);
        });
        $doc.on("drop.targetlist", ".cadmin-target-list-entry", function (event) {
            if (dragFrom < 0) {
                return;
            }
            event.preventDefault();
            const from = dragFrom;
            const to = dropBefore;
            clearDrag();
            moveEntry(from, to);
        });
        $doc.on("dragend.targetlist", ".cadmin-target-list-entry", function () {
            clearDrag();
        });
        $doc.on("keydown.targetlist", function (event) {
            if (event.key === "Escape" && open) {
                hide();
            }
        });
    }

    function init() {
        ensureShell();
        bindOnce();
        const stored = readStore();
        if (stored) {
            targetId = stored;
            renderBody();
            reload({ open: false });
        } else {
            renderBody();
        }
    }

    return {
        init: init,
        set: set,
        clear: clear,
        hide: hide,
        show: show,
        toggle: toggle,
        add: add,
        button: button,
        chooserButton: chooserButton,
        mount: mount,
        syncFrom: syncFrom,
        isTarget: isTarget
    };
}());
