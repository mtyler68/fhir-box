window.CadminLibraryRelated = (function () {
    const SEARCH_PATH = "/Library?_elements=id,name,title,url,type,version,status,relatedArtifact&_count=100";
    const TYPE_LABELS = {
        "camel-route": "Camel Route",
        "icg-route": "ICG Route",
        "jolt": "Jolt",
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

    let mounted = null;
    let fetchToken = 0;
    let bound = false;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function cards() {
        return tableCard("library-related-card", "Related libraries", "bi-box-arrow-up-right",
                "Libraries this resource lists in relatedArtifact.",
                "library-related-rows", "data-library-related-refresh") +
            tableCard("library-referenced-card", "Referenced from", "bi-box-arrow-in-down",
                "Other libraries that list this resource as a related artifact.",
                "library-referenced-rows", "data-library-referenced-refresh");
    }

    function tableCard(id, title, icon, hint, bodyId, refreshAttr) {
        return '<div class="card shadow mb-4" id="' + id + '">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                '<div>' +
                    '<h6 class="m-0"><i class="bi ' + icon + ' me-1"></i>' + esc(title) + "</h6>" +
                    '<div class="small text-muted mt-1">' + esc(hint) + "</div>" +
                "</div>" +
                '<button class="btn btn-sm btn-outline-secondary" type="button" ' + refreshAttr +
                    ' title="Refresh" aria-label="Refresh">' +
                    '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>' +
            "</div>" +
            '<div class="card-body p-0">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>Name</th><th>Type</th><th>Version</th><th>Status</th>" +
                        "<th>Relationship</th></tr></thead>" +
                        '<tbody id="' + bodyId + '">' +
                            '<tr><td colspan="5" class="text-muted">Loading…</td></tr>' +
                        "</tbody>" +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function rowsEl(id) {
        return document.getElementById(id);
    }

    function emptyRow(message) {
        return '<tr><td colspan="5" class="text-muted">' + esc(message) + "</td></tr>";
    }

    function renderEmpty(id, message) {
        const tbody = rowsEl(id);
        if (tbody) {
            tbody.innerHTML = emptyRow(message);
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

    function rowHtml(item) {
        const library = item.library;
        const id = (library && library.id) || item.id || "";
        const label = nameOf(library, id);
        const href = id
            ? CadminApi.detailHref("Library", id, library || undefined)
            : "";
        const nameCell = href
            ? CadminApi.resourceLink(href, label)
            : esc(label);
        return "<tr><td>" + nameCell + "</td><td><code>" + esc(library ? typeLabel(library) : "—") +
            "</code></td><td><code>" + esc((library && library.version) || "—") +
            "</code></td><td>" + statusBadge(library && library.status) +
            "</td><td>" + esc(relationshipLabel(item.relationship)) + "</td></tr>";
    }

    function renderRows(id, items, emptyMessage) {
        const tbody = rowsEl(id);
        if (!tbody) {
            return;
        }
        if (!items.length) {
            tbody.innerHTML = emptyRow(emptyMessage);
            return;
        }
        tbody.innerHTML = items.map(rowHtml).join("");
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
        ((library && library.relatedArtifact) || []).forEach(function (artifact) {
            const target = targetFromArtifact(artifact, index);
            if (!target) {
                return;
            }
            rows.push({
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

    function bindOnce() {
        if (bound) {
            return;
        }
        bound = true;
        $(document).on("click", "[data-library-related-refresh], [data-library-referenced-refresh]", function () {
            reload();
        });
    }

    function mount(library) {
        bindOnce();
        mounted = library || null;
        reload();
    }

    function reload() {
        const token = fetchToken + 1;
        fetchToken = token;
        if (!mounted || mounted.resourceType !== "Library" || !mounted.id) {
            renderEmpty("library-related-rows", "No related libraries.");
            renderEmpty("library-referenced-rows", "Not referenced by other libraries.");
            return;
        }
        renderEmpty("library-related-rows", "Loading…");
        renderEmpty("library-referenced-rows", "Loading…");
        const current = mounted;
        loadLibraries().then(function (libraries) {
            if (token !== fetchToken || mounted !== current) {
                return;
            }
            const index = indexLibraries(libraries);
            const outgoingTargets = ((current.relatedArtifact) || []).map(function (artifact) {
                return targetFromArtifact(artifact, index);
            }).filter(Boolean);
            return resolveMissing(outgoingTargets, index).then(function (resolved) {
                if (token !== fetchToken || mounted !== current) {
                    return;
                }
                renderRows("library-related-rows", outgoingRows(current, resolved),
                    "No related FHIR libraries.");
                renderRows("library-referenced-rows", incomingRows(current, libraries, resolved),
                    "Not referenced by other libraries.");
            });
        }).fail(function (xhr) {
            if (token !== fetchToken) {
                return;
            }
            const detail = xhr && xhr.status ? " (" + xhr.status + ")" : "";
            renderEmpty("library-related-rows", "Unable to load related libraries" + detail + ".");
            renderEmpty("library-referenced-rows", "Unable to load referencing libraries" + detail + ".");
        });
    }

    function reset() {
        fetchToken += 1;
        mounted = null;
        renderEmpty("library-related-rows", "No related libraries.");
        renderEmpty("library-referenced-rows", "Not referenced by other libraries.");
    }

    return {
        cards: cards,
        mount: mount,
        reload: reload,
        reset: reset
    };
}());
