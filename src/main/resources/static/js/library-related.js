window.CadminLibraryRelated = (function () {
    const SEARCH_PATH = "/Library?_elements=id,name,title,url,type,version,status,relatedArtifact&_count=100";
    const TYPE_LABELS = {
        "camel-route": "Camel Route",
        "easy-rule": "Easy Rule",
        "rule-set": "Rule Set",
        "gateway-route": "Gateway Route",
        "icg-route": "ICG Route",
        "jolt": "Jolt",
        "rate-limit-plan": "Rate-limit plan",
        "pds-policies": "PDS Policies"
    };
    const RELATIONSHIP_LABELS = {
        documentation: "Documentation",
        justification: "Justification",
        citation: "Citation",
        predecessor: "Predecessor",
        successor: "Successor",
        "derived-from": "Derived from",
        "depends-on": "Depends on",
        "composed-of": "Composed of",
        "part-of": "Part of",
        amends: "Amends",
        "amended-with": "Amended with",
        appends: "Appends",
        "appended-with": "Appended with",
        cites: "Cites",
        "cited-by": "Cited by",
        "comments-on": "Comments on",
        "comment-in": "Comment in",
        contains: "Contains",
        "contained-in": "Contained in",
        corrects: "Corrects",
        "correction-in": "Correction in",
        replaces: "Replaces",
        "replaced-with": "Replaced with",
        retracts: "Retracts",
        "retracted-by": "Retracted by",
        signs: "Signs",
        "similar-to": "Similar to",
        supports: "Supports",
        "supported-with": "Supported with",
        transforms: "Transforms",
        "transformed-into": "Transformed into",
        "transformed-with": "Transformed with",
        documents: "Documents",
        "specification-of": "Specification of",
        "created-with": "Created with",
        "cite-as": "Cite as",
        reprint: "Reprint",
        "reprint-of": "Reprint of"
    };
    const PRESERVE_ARTIFACT_KEYS = [
        "classifier", "label", "citation", "document", "publicationStatus", "publicationDate"
    ];

    let mounted = null;
    let fetchToken = 0;
    let bound = false;
    let saving = false;
    let editingIndex = -1;
    let lastIndex = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function cards() {
        return relatedCard() + referencedCard() + editorModal();
    }

    function relatedCard() {
        return '<div class="card mb-3" id="library-related-card">' +
            '<div class="card-header">' +
                '<h3 class="card-title">Related libraries</h3>' +
                '<div class="card-tools">' +
                    '<button class="btn btn-sm btn-outline-secondary me-1" type="button" data-library-related-refresh ' +
                        'title="Refresh" aria-label="Refresh">' +
                        '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>' +
                    '<button class="btn btn-sm btn-outline-primary" type="button" data-library-related-add>' +
                        "Add</button>" +
                "</div>" +
            "</div>" +
            '<div class="card-body p-0">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Name</th><th>Type</th><th>Version</th><th>Status</th>" +
                        "<th>Relationship</th><th></th></tr></thead>" +
                        '<tbody id="library-related-rows">' +
                            '<tr><td colspan="6" class="text-muted">Loading…</td></tr>' +
                        "</tbody>" +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function referencedCard() {
        return '<div class="card" id="library-referenced-card">' +
            '<div class="card-header">' +
                '<h3 class="card-title">Referenced from</h3>' +
                '<div class="card-tools">' +
                    '<button class="btn btn-sm btn-outline-secondary" type="button" data-library-referenced-refresh ' +
                        'title="Refresh" aria-label="Refresh">' +
                        '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>' +
                "</div>" +
            "</div>" +
            '<div class="card-body p-0">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Name</th><th>Type</th><th>Version</th><th>Status</th>" +
                        "<th>Relationship</th></tr></thead>" +
                        '<tbody id="library-referenced-rows">' +
                            '<tr><td colspan="5" class="text-muted">Loading…</td></tr>' +
                        "</tbody>" +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function relationshipOptions(selected) {
        return Object.keys(RELATIONSHIP_LABELS).map(function (code) {
            const mark = code === selected ? " selected" : "";
            return '<option value="' + esc(code) + '"' + mark + ">" + esc(RELATIONSHIP_LABELS[code]) + "</option>";
        }).join("");
    }

    function editorModal() {
        return '<div class="modal fade" id="library-related-modal" tabindex="-1">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="library-related-form">' +
                    '<div class="modal-header"><h5 class="modal-title" id="library-related-modal-title">' +
                        "Add related library</h5>" +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<input type="hidden" id="library-related-index" value="">' +
                        '<div class="mb-3"><label class="form-label" for="library-related-target">Library</label>' +
                            '<select class="form-select" id="library-related-target">' +
                                '<option value="">Search libraries…</option></select></div>' +
                        '<div class="mb-0"><label class="form-label" for="library-related-relationship">Relationship</label>' +
                            '<select class="form-select" id="library-related-relationship">' +
                            relationshipOptions("depends-on") + "</select></div>" +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Save</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>";
    }

    function rowsEl(id) {
        return document.getElementById(id);
    }

    function emptyRow(cols, message) {
        return '<tr><td colspan="' + cols + '" class="text-muted">' + esc(message) + "</td></tr>";
    }

    function renderEmpty(id, message, cols) {
        const tbody = rowsEl(id);
        if (tbody) {
            tbody.innerHTML = emptyRow(cols || 5, message);
        }
    }

    function libraryKey(library) {
        if (!library || !library.id) {
            return "";
        }
        return "Library/" + library.id;
    }

    function fhirPathFromUrl(url) {
        const raw = String(url || "");
        if (!raw) {
            return "";
        }
        let pathAndQuery = raw;
        try {
            if (/^https?:\/\//i.test(raw) || raw.indexOf("//") === 0) {
                const parsed = new URL(raw, window.location.origin);
                pathAndQuery = parsed.pathname + parsed.search;
            }
        } catch (err) {
            return "";
        }
        const fhirIdx = pathAndQuery.indexOf("/fhir");
        if (fhirIdx >= 0) {
            let rest = pathAndQuery.substring(fhirIdx + 5);
            if (!rest || rest.charAt(0) === "?") {
                rest = "/" + rest;
            }
            return rest.charAt(0) === "/" ? rest : "/" + rest;
        }
        return pathAndQuery.charAt(0) === "/" ? pathAndQuery : "/" + pathAndQuery;
    }

    function bundleNext(bundle) {
        const links = (bundle && bundle.link) || [];
        for (let i = 0; i < links.length; i += 1) {
            const link = links[i];
            if (link && (link.relation === "next" || link.rel === "next") && link.url) {
                return fhirPathFromUrl(link.url);
            }
        }
        return "";
    }

    function refStrings(artifact) {
        const refs = [];
        if (!artifact) {
            return refs;
        }
        if (typeof artifact.resource === "string" && artifact.resource.trim()) {
            refs.push(artifact.resource.trim());
        }
        const ref = artifact.resourceReference;
        if (ref) {
            if (ref.reference) {
                refs.push(String(ref.reference));
            }
            if (ref.type === "Library" && ref.identifier && ref.identifier.value) {
                refs.push(String(ref.identifier.value));
            }
        }
        return refs;
    }

    function libraryTarget(artifact) {
        if (!artifact) {
            return null;
        }
        const ref = artifact.resourceReference;
        if (ref && (ref.reference || ref.type)) {
            const type = CadminApi.referenceType(ref) || ref.type || "";
            const id = CadminApi.referenceId(ref);
            if (type && type !== "Library") {
                return null;
            }
            if (type === "Library" || /(^|\/)Library\//.test(String(ref.reference || ""))) {
                return { id: id, url: String(ref.reference || "").split("|")[0] };
            }
        }
        const canonical = typeof artifact.resource === "string" ? artifact.resource.trim() : "";
        if (!canonical) {
            return null;
        }
        const bare = canonical.split("|")[0].trim();
        const type = CadminApi.referenceType(bare);
        const id = CadminApi.referenceId(bare);
        if (type && type !== "Library") {
            return null;
        }
        if (type === "Library" || /(^|\/)Library\//.test(bare)) {
            return { id: id, url: bare };
        }
        return null;
    }

    function targetFromArtifact(artifact, index) {
        const explicit = libraryTarget(artifact);
        if (explicit) {
            return explicit;
        }
        const refs = refStrings(artifact);
        for (let i = 0; i < refs.length; i += 1) {
            const bare = String(refs[i] || "").split("|")[0].trim();
            if (!bare) {
                continue;
            }
            if (index && index.byUrl[bare]) {
                return { id: index.byUrl[bare].id, url: bare };
            }
            if (index && index.byId[bare]) {
                return { id: bare, url: bare };
            }
        }
        return null;
    }

    function sameLibrary(target, library) {
        if (!target || !library) {
            return false;
        }
        if (target.id && library.id && target.id === library.id) {
            return true;
        }
        const targetUrl = (target.url || "").split("|")[0];
        const libraryUrl = (library.url || "").split("|")[0];
        if (targetUrl && libraryUrl && targetUrl === libraryUrl) {
            return true;
        }
        if (targetUrl && library.id && CadminApi.referenceId(targetUrl) === library.id) {
            return true;
        }
        return false;
    }

    function relationshipLabel(code) {
        if (!code) {
            return "—";
        }
        return RELATIONSHIP_LABELS[code] || String(code).replace(/-/g, " ");
    }

    function typeLabel(library) {
        const coding = ((library && library.type && library.type.coding) || [])[0] || {};
        if (coding.display) {
            return coding.display;
        }
        const code = coding.code || CadminApi.libraryTypeOf(library);
        return TYPE_LABELS[code] || code || "—";
    }

    function statusBadge(status) {
        const kind = status === "active" ? "success"
            : status === "retired" ? "secondary"
                : status === "draft" ? "warning"
                    : "info";
        const label = status
            ? status.charAt(0).toUpperCase() + status.slice(1)
            : "—";
        return '<span class="badge text-bg-' + kind + '">' + esc(label) + "</span>";
    }

    function nameOf(library, fallbackId) {
        return (library && (library.name || library.title)) || fallbackId || "—";
    }

    function cellsHtml(item) {
        const library = item.library;
        const id = (library && library.id) || item.id || "";
        const label = nameOf(library, id);
        const href = id
            ? CadminApi.detailHref("Library", id, library || undefined)
            : "";
        const nameCell = href
            ? CadminApi.resourceLink(href, label)
            : esc(label);
        return "<td>" + nameCell + "</td><td><code>" + esc(library ? typeLabel(library) : "—") +
            "</code></td><td><code>" + esc((library && library.version) || "—") +
            "</code></td><td>" + statusBadge(library && library.status) +
            "</td><td>" + esc(relationshipLabel(item.relationship)) + "</td>";
    }

    function isReadOnly() {
        return CadminApi.isActiveEasyRuleLibrary(mounted);
    }

    function activeEditError() {
        return "An active Easy rule can only change status.";
    }

    function syncReadOnlyUi() {
        const locked = isReadOnly();
        $("#library-related-card [data-library-related-add]")
            .toggleClass("d-none", locked)
            .prop("disabled", locked);
    }

    function relatedRowHtml(item) {
        const actions = isReadOnly()
            ? ""
            : '<button class="btn btn-sm btn-outline-secondary me-1" type="button" data-library-related-edit="' +
                item.artifactIndex + '" title="Edit" aria-label="Edit">' +
                '<i class="bi bi-pencil" aria-hidden="true"></i></button>' +
                '<button class="btn btn-sm btn-outline-danger" type="button" data-library-related-remove="' +
                item.artifactIndex + '" title="Remove" aria-label="Remove">' +
                '<i class="bi bi-trash" aria-hidden="true"></i></button>';
        return "<tr>" + cellsHtml(item) +
            '<td class="text-end text-nowrap">' + actions + "</td></tr>";
    }

    function referencedRowHtml(item) {
        return "<tr>" + cellsHtml(item) + "</tr>";
    }

    function renderRelatedRows(items) {
        const tbody = rowsEl("library-related-rows");
        if (!tbody) {
            return;
        }
        if (!items.length) {
            tbody.innerHTML = emptyRow(6, "No related FHIR libraries.");
            syncReadOnlyUi();
            return;
        }
        tbody.innerHTML = items.map(relatedRowHtml).join("");
        syncReadOnlyUi();
    }

    function renderReferencedRows(items) {
        const tbody = rowsEl("library-referenced-rows");
        if (!tbody) {
            return;
        }
        if (!items.length) {
            tbody.innerHTML = emptyRow(5, "Not referenced by other libraries.");
            return;
        }
        tbody.innerHTML = items.map(referencedRowHtml).join("");
    }

    function indexLibraries(libraries) {
        const byId = {};
        const byUrl = {};
        (libraries || []).forEach(function (library) {
            if (library && library.id) {
                byId[library.id] = library;
            }
            const url = library && library.url ? String(library.url).split("|")[0] : "";
            if (url) {
                byUrl[url] = library;
            }
        });
        return { byId: byId, byUrl: byUrl };
    }

    function lookup(index, target) {
        if (!target) {
            return null;
        }
        if (target.id && index.byId[target.id]) {
            return index.byId[target.id];
        }
        const url = (target.url || "").split("|")[0];
        if (url && index.byUrl[url]) {
            return index.byUrl[url];
        }
        return null;
    }

    function loadLibraries() {
        const items = [];
        function page(path) {
            return CadminApi.fhir(path, "GET", null, { silent: true }).then(function (bundle) {
                CadminApi.bundleResources(bundle, "Library").forEach(function (library) {
                    items.push(library);
                });
                const next = bundleNext(bundle);
                return next ? page(next) : items;
            });
        }
        return page(SEARCH_PATH);
    }

    function resolveMissing(targets, index) {
        const pending = [];
        const seen = {};
        targets.forEach(function (target) {
            if (!target || lookup(index, target)) {
                return;
            }
            const key = target.id || target.url;
            if (!key || seen[key]) {
                return;
            }
            seen[key] = true;
            pending.push(CadminApi.readByIdOrUrl("Library", target.id, target.url).then(function (library) {
                if (library && library.id) {
                    index.byId[library.id] = library;
                }
                const url = library && library.url ? String(library.url).split("|")[0] : target.url;
                if (url) {
                    index.byUrl[url] = library;
                }
                return library;
            }, function () {
                return null;
            }));
        });
        if (!pending.length) {
            return $.Deferred().resolve(index).promise();
        }
        return $.when.apply($, pending).then(function () {
            return index;
        });
    }

    function outgoingRows(library, index) {
        const rows = [];
        ((library && library.relatedArtifact) || []).forEach(function (artifact, artifactIndex) {
            const target = targetFromArtifact(artifact, index);
            if (!target) {
                return;
            }
            rows.push({
                artifactIndex: artifactIndex,
                id: target.id,
                relationship: artifact.type,
                library: lookup(index, target)
            });
        });
        return rows;
    }

    function incomingRows(library, libraries, index) {
        const rows = [];
        const self = libraryKey(library);
        (libraries || []).forEach(function (other) {
            if (!other || libraryKey(other) === self) {
                return;
            }
            ((other.relatedArtifact) || []).forEach(function (artifact) {
                const target = targetFromArtifact(artifact, index);
                if (!target || !sameLibrary(target, library)) {
                    return;
                }
                rows.push({
                    id: other.id,
                    relationship: artifact.type,
                    library: other
                });
            });
        });
        rows.sort(function (a, b) {
            return nameOf(a.library, a.id).localeCompare(nameOf(b.library, b.id));
        });
        return rows;
    }

    function hideModal() {
        const el = document.getElementById("library-related-modal");
        const modal = el && bootstrap.Modal.getInstance(el);
        if (modal) {
            modal.hide();
        }
    }

    function showModal() {
        const el = document.getElementById("library-related-modal");
        if (!el || typeof bootstrap === "undefined") {
            return;
        }
        bootstrap.Modal.getOrCreateInstance(el).show();
    }

    function artifactForLibrary(target, relationship, previous) {
        const artifact = {};
        if (previous) {
            PRESERVE_ARTIFACT_KEYS.forEach(function (key) {
                if (previous[key] != null) {
                    artifact[key] = previous[key];
                }
            });
        }
        artifact.type = relationship || "depends-on";
        const display = (target && (target.title || target.name)) || "";
        if (display) {
            artifact.display = display;
        }
        const url = target && target.url ? String(target.url).split("|")[0] : "";
        if (url) {
            artifact.resource = url;
        }
        if (target && target.id) {
            artifact.resourceReference = { reference: "Library/" + target.id };
            if (display) {
                artifact.resourceReference.display = display;
            }
            if (!url) {
                artifact.resource = "Library/" + target.id;
            }
        }
        return artifact;
    }

    function applyUpdated(updated) {
        if (!mounted || !updated) {
            return;
        }
        mounted.relatedArtifact = updated.relatedArtifact;
        if (updated.meta) {
            mounted.meta = updated.meta;
        }
        if (window.CadminResourceSource && typeof CadminResourceSource.mount === "function") {
            CadminResourceSource.mount(function () { return mounted; });
        }
        if (window.CadminResourceGraph && typeof CadminResourceGraph.mount === "function") {
            CadminResourceGraph.mount(mounted);
        }
    }

    function saveArtifacts(artifacts, successMessage) {
        if (!mounted || !mounted.id || saving) {
            return;
        }
        if (isReadOnly()) {
            CadminApi.showToast("danger", activeEditError());
            return;
        }
        saving = true;
        if (artifacts && artifacts.length) {
            mounted.relatedArtifact = artifacts;
        } else {
            delete mounted.relatedArtifact;
        }
        CadminApi.fhir("/Library/" + encodeURIComponent(mounted.id), "PUT", mounted).done(function (updated) {
            applyUpdated(updated || mounted);
            hideModal();
            reload();
            if (successMessage) {
                CadminApi.showToast("success", successMessage);
            }
        }).fail(function (xhr) {
            CadminApi.showToast("danger", "Update related libraries failed (" +
                ((xhr && xhr.status) || "error") + ").");
        }).always(function () {
            saving = false;
        });
    }

    function currentArtifacts() {
        return (mounted && mounted.relatedArtifact ? mounted.relatedArtifact.slice() : []);
    }

    function openEditor(index) {
        if (!mounted || !mounted.id) {
            return;
        }
        if (isReadOnly()) {
            CadminApi.showToast("danger", activeEditError());
            return;
        }
        editingIndex = index;
        showModal();
    }

    function populateModal() {
        const title = document.getElementById("library-related-modal-title");
        const indexInput = document.getElementById("library-related-index");
        const relSelect = document.getElementById("library-related-relationship");
        const adding = editingIndex < 0;
        if (title) {
            title.textContent = adding ? "Add related library" : "Edit related library";
        }
        if (indexInput) {
            indexInput.value = adding ? "" : String(editingIndex);
        }
        const artifacts = currentArtifacts();
        const artifact = !adding ? artifacts[editingIndex] : null;
        const target = artifact ? targetFromArtifact(artifact, lastIndex) : null;
        const selected = target ? lookup(lastIndex || indexLibraries([]), target) : null;
        if (relSelect) {
            relSelect.innerHTML = relationshipOptions((artifact && artifact.type) || "depends-on");
        }
        CadminApi.bindFhirSelect("#library-related-target", "Library", {
            placeholder: "Search libraries…",
            excludeId: mounted && mounted.id,
            selectedId: (selected && selected.id) || (target && target.id) || "",
            selectedLabel: selected
                ? nameOf(selected, selected.id)
                : (target && target.id) || ""
        });
    }

    function submitEditor(event) {
        event.preventDefault();
        if (!mounted || !mounted.id) {
            return;
        }
        const targetId = CadminApi.selectValue("#library-related-target");
        const relationship = $("#library-related-relationship").val() || "depends-on";
        if (!targetId) {
            CadminApi.showToast("danger", "Select a library.");
            return;
        }
        if (targetId === mounted.id) {
            CadminApi.showToast("danger", "A library cannot relate to itself.");
            return;
        }
        const fromIndex = lastIndex && lastIndex.byId[targetId];
        const finish = function (target) {
            if (!target || !target.id) {
                CadminApi.showToast("danger", "Unable to load the selected library.");
                return;
            }
            const artifacts = currentArtifacts();
            const previous = editingIndex >= 0 ? artifacts[editingIndex] : null;
            const next = artifactForLibrary(target, relationship, previous);
            if (editingIndex >= 0) {
                artifacts[editingIndex] = next;
                saveArtifacts(artifacts, "Related library updated.");
            } else {
                artifacts.push(next);
                saveArtifacts(artifacts, "Related library added.");
            }
        };
        if (fromIndex) {
            finish(fromIndex);
            return;
        }
        CadminApi.fhir("/Library/" + encodeURIComponent(targetId), "GET", null, { silent: true })
            .done(finish)
            .fail(function () {
                CadminApi.showToast("danger", "Unable to load the selected library.");
            });
    }

    function removeAt(index) {
        if (isReadOnly()) {
            CadminApi.showToast("danger", activeEditError());
            return;
        }
        const artifacts = currentArtifacts();
        const artifact = artifacts[index];
        if (!artifact) {
            return;
        }
        const target = targetFromArtifact(artifact, lastIndex);
        const selected = target ? lookup(lastIndex || indexLibraries([]), target) : null;
        const label = nameOf(selected, (target && target.id) || "this library");
        CadminApi.confirm({
            title: "Remove related library?",
            text: "Stop listing " + label + " as a related artifact."
        }).done(function () {
            artifacts.splice(index, 1);
            saveArtifacts(artifacts, "Related library removed.");
        });
    }

    function bindOnce() {
        if (bound) {
            return;
        }
        bound = true;
        $(document).on("click", "[data-library-related-refresh], [data-library-referenced-refresh]", function () {
            reload();
        });
        $(document).on("click", "[data-library-related-add]", function () {
            openEditor(-1);
        });
        $(document).on("click", "[data-library-related-edit]", function () {
            openEditor(Number($(this).attr("data-library-related-edit")));
        });
        $(document).on("click", "[data-library-related-remove]", function () {
            removeAt(Number($(this).attr("data-library-related-remove")));
        });
        $(document).on("submit", "#library-related-form", submitEditor);
        $(document).on("show.bs.modal", "#library-related-modal", populateModal);
        $(document).on("hidden.bs.modal", "#library-related-modal", function () {
            CadminApi.destroySelect("#library-related-target");
            editingIndex = -1;
        });
    }

    function mount(library) {
        bindOnce();
        mounted = library || null;
        syncReadOnlyUi();
        reload();
    }

    function reload() {
        const token = fetchToken + 1;
        fetchToken = token;
        if (!mounted || mounted.resourceType !== "Library" || !mounted.id) {
            renderEmpty("library-related-rows", "No related libraries.", 6);
            renderEmpty("library-referenced-rows", "Not referenced by other libraries.", 5);
            syncReadOnlyUi();
            return;
        }
        renderEmpty("library-related-rows", "Loading…", 6);
        renderEmpty("library-referenced-rows", "Loading…", 5);
        const current = mounted;
        loadLibraries().then(function (libraries) {
            if (token !== fetchToken || mounted !== current) {
                return;
            }
            const index = indexLibraries(libraries);
            lastIndex = index;
            const outgoingTargets = ((current.relatedArtifact) || []).map(function (artifact) {
                return targetFromArtifact(artifact, index);
            }).filter(Boolean);
            return resolveMissing(outgoingTargets, index).then(function (resolved) {
                if (token !== fetchToken || mounted !== current) {
                    return;
                }
                lastIndex = resolved;
                renderRelatedRows(outgoingRows(current, resolved));
                renderReferencedRows(incomingRows(current, libraries, resolved));
            });
        }).fail(function (xhr) {
            if (token !== fetchToken) {
                return;
            }
            const detail = xhr && xhr.status ? " (" + xhr.status + ")" : "";
            renderEmpty("library-related-rows", "Unable to load related libraries" + detail + ".", 6);
            renderEmpty("library-referenced-rows", "Unable to load referencing libraries" + detail + ".", 5);
        });
    }

    function reset() {
        fetchToken += 1;
        mounted = null;
        lastIndex = null;
        editingIndex = -1;
        renderEmpty("library-related-rows", "No related libraries.", 6);
        renderEmpty("library-referenced-rows", "Not referenced by other libraries.", 5);
    }

    return {
        cards: cards,
        mount: mount,
        reload: reload,
        reset: reset
    };
}());
