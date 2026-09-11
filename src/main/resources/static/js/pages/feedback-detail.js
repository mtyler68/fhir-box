window.CadminFeedbackDetail = (function () {
    const statusOptions = [
        { code: "preparation", display: "Preparation" },
        { code: "in-progress", display: "In progress" },
        { code: "on-hold", display: "On hold" },
        { code: "completed", display: "Completed" },
        { code: "not-done", display: "Not done" },
        { code: "stopped", display: "Stopped" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    let communication = null;
    let noteEditor = null;
    let markdownRenderer = null;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function statusBadge(status) {
        const kind = status === "completed" ? "success"
            : status === "in-progress" ? "info"
                : status === "preparation" ? "warning"
                    : status === "entered-in-error" ? "danger"
                        : "secondary";
        return '<span class="badge text-bg-' + kind + '">' +
            esc(CadminApi.valueSetDisplay(statusOptions, status)) + "</span>";
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        return ref.display || (ref.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function sentLabel(value) {
        if (!value) {
            return "—";
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    function subjectOf() {
        const attachment = CadminFeedback.payloadAttachment(communication);
        return attachment.title || (communication.topic && communication.topic.text) || "Untitled";
    }

    function bodyOf() {
        return CadminFeedback.decodeText(CadminFeedback.payloadAttachment(communication).data);
    }

    function notesOf() {
        return (communication && communication.note) || [];
    }

    function markdownToolbar() {
        function tool(name, action, icon, title) {
            return { name: name, action: action, className: icon, title: title };
        }
        return [
            tool("bold", EasyMDE.toggleBold, "bi bi-type-bold", "Bold"),
            tool("italic", EasyMDE.toggleItalic, "bi bi-type-italic", "Italic"),
            tool("heading", EasyMDE.toggleHeadingSmaller, "bi bi-type-h1", "Heading"),
            "|",
            tool("quote", EasyMDE.toggleBlockquote, "bi bi-quote", "Quote"),
            tool("code", EasyMDE.toggleCodeBlock, "bi bi-code-slash", "Code"),
            tool("unordered-list", EasyMDE.toggleUnorderedList, "bi bi-list-ul", "Bulleted list"),
            tool("ordered-list", EasyMDE.toggleOrderedList, "bi bi-list-ol", "Numbered list"),
            "|",
            tool("link", EasyMDE.drawLink, "bi bi-link-45deg", "Link"),
            "|",
            tool("preview", EasyMDE.togglePreview, "bi bi-eye no-disable", "Preview")
        ];
    }

    function destroyInstance(instance) {
        if (instance && typeof instance.toTextArea === "function") {
            try {
                instance.toTextArea();
            } catch (ignored) {
                /* already detached */
            }
        }
        return null;
    }

    function destroyNoteEditor() {
        noteEditor = destroyInstance(noteEditor);
    }

    function sanitizeHtml(html) {
        const wrap = document.createElement("div");
        wrap.innerHTML = html || "";
        wrap.querySelectorAll("script,style,iframe,object,embed,form").forEach(function (el) {
            el.remove();
        });
        wrap.querySelectorAll("*").forEach(function (el) {
            Array.prototype.slice.call(el.attributes).forEach(function (attr) {
                if (/^on/i.test(attr.name)
                        || ((attr.name === "href" || attr.name === "src")
                            && /^\s*javascript:/i.test(attr.value))) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return wrap.innerHTML;
    }

    function markdownHtml(text) {
        const raw = String(text || "");
        if (!raw.trim()) {
            return "";
        }
        if (typeof EasyMDE === "undefined") {
            return "<p>" + esc(raw).replace(/\n/g, "<br>") + "</p>";
        }
        try {
            if (!markdownRenderer) {
                markdownRenderer = Object.create(EasyMDE.prototype);
                markdownRenderer.options = { renderingConfig: {} };
            }
            if (typeof markdownRenderer.markdown === "function") {
                return sanitizeHtml(markdownRenderer.markdown(raw) || "");
            }
        } catch (ignored) {
            /* fall through */
        }
        return "<p>" + esc(raw).replace(/\n/g, "<br>") + "</p>";
    }

    function noteValue() {
        if (noteEditor) {
            return noteEditor.value() || "";
        }
        return $("#fbd-note-body").val() || "";
    }

    function mountNoteEditor() {
        destroyNoteEditor();
        const el = document.getElementById("fbd-note-body");
        if (!el || typeof EasyMDE === "undefined") {
            return;
        }
        noteEditor = new EasyMDE({
            element: el,
            autofocus: false,
            autoDownloadFontAwesome: false,
            spellChecker: false,
            status: false,
            forceSync: true,
            minHeight: "8rem",
            placeholder: "Write a markdown note…",
            toolbar: markdownToolbar()
        });
    }

    function clearNoteEditor() {
        $("#fbd-note-body").val("");
        if (noteEditor) {
            noteEditor.value("");
        }
    }

    function senderHtml() {
        const id = CadminApi.referenceId(communication.sender);
        if (id) {
            return CadminApi.resourceLink("#/practitioners/" + encodeURIComponent(id), refLabel(communication.sender));
        }
        return esc(refLabel(communication.sender));
    }

    function noteAuthorHtml(note) {
        if (note && note.authorReference) {
            const id = CadminApi.referenceId(note.authorReference);
            const label = refLabel(note.authorReference);
            if (id) {
                return CadminApi.resourceLink("#/practitioners/" + encodeURIComponent(id), label);
            }
            return esc(label);
        }
        return esc((note && note.authorString) || "—");
    }

    function remember() {
        if (window.CadminWorkspace && typeof CadminWorkspace.rememberResource === "function") {
            CadminWorkspace.rememberResource(communication);
        }
    }

    function renderHeader() {
        $("#fbd-title").text(subjectOf());
        $("#fbd-status-badge").html(statusBadge(communication.status));
        remember();
    }

    function renderBasics() {
        $("#fbd-type").text(CadminFeedback.categoryLabel(CadminFeedback.categoryOf(communication)));
        $("#fbd-sender").html(senderHtml());
        $("#fbd-sent").text(sentLabel(communication.sent));
        $("#fbd-id").text(communication.id || "");
        $("#fbd-status").val(communication.status || "preparation");
        const html = markdownHtml(bodyOf());
        $("#fbd-body").html(html || '<p class="text-muted mb-0">No message.</p>');
    }

    function renderNotesList() {
        const notes = notesOf();
        if (!notes.length) {
            $("#fbd-notes-list").html('<p class="text-muted mb-0">No notes yet.</p>');
            return;
        }
        $("#fbd-notes-list").html(notes.map(function (note, index) {
            const html = markdownHtml(note && note.text);
            return '<div class="fbd-note border rounded p-3 mb-3">' +
                '<div class="d-flex justify-content-between align-items-start gap-2 mb-2">' +
                    '<div class="small text-muted">' +
                        noteAuthorHtml(note) +
                        '<span class="mx-1">·</span>' +
                        esc(sentLabel(note && note.time)) +
                    "</div>" +
                    '<button class="btn btn-sm btn-outline-danger" type="button" data-note-index="' + index + '"' +
                        ' title="Delete note" aria-label="Delete note">' +
                        '<i class="bi bi-trash"></i></button>' +
                "</div>" +
                '<div class="fbd-note-markdown">' + (html || "<p class=\"text-muted mb-0\">Empty note.</p>") + "</div>" +
            "</div>";
        }).join(""));
    }

    function save(next, options) {
        const skipBasics = options && options.skipBasics;
        return CadminApi.fhir("/Communication/" + encodeURIComponent(communication.id), "PUT", communication)
            .done(function (updated) {
                communication = updated || communication;
                renderHeader();
                if (!skipBasics) {
                    renderBasics();
                }
                renderNotesList();
                CadminResourceSource.mount(function () { return communication; });
                CadminResourceGraph.mount(communication);
                if (next) {
                    next();
                }
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Update feedback failed (" + xhr.status + ").");
            });
    }

    function addNote(event) {
        event.preventDefault();
        const text = noteValue().trim();
        if (!text) {
            CadminApi.showToast("danger", "Enter a note.");
            return;
        }
        const $submit = $("#fbd-note-submit").prop("disabled", true);
        CadminFeedback.currentPractitioner().then(function (practitioner) {
            const notes = notesOf().slice();
            notes.push({
                authorReference: {
                    reference: "Practitioner/" + practitioner.id,
                    display: CadminFeedback.personName(practitioner)
                },
                time: new Date().toISOString(),
                text: text
            });
            communication.note = notes;
            return save(function () {
                clearNoteEditor();
                CadminApi.showToast("success", "Note added.");
            }, { skipBasics: true });
        }).fail(function (err) {
            if (err && err.message && !err.status) {
                CadminApi.showToast("danger", err.message);
            }
        }).always(function () {
            $submit.prop("disabled", false);
        });
    }

    function deleteNote(index) {
        const notes = notesOf().slice();
        if (index < 0 || index >= notes.length) {
            return;
        }
        notes.splice(index, 1);
        if (notes.length) {
            communication.note = notes;
        } else {
            delete communication.note;
        }
        save(function () {
            CadminApi.showToast("success", "Note deleted.");
        }, { skipBasics: true });
    }

    function render(resource) {
        destroyNoteEditor();
        communication = resource;
        const $root = $(CadminWorkspace.root());
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                "<div>" +
                    '<a class="small text-decoration-none" href="#/feedback">' +
                        '<i class="bi bi-arrow-left me-1"></i>Feedback</a>' +
                    '<div class="d-flex align-items-center flex-wrap gap-2">' +
                        '<h1 class="h3 mb-0 page-title" id="fbd-title"></h1>' +
                        '<span id="fbd-status-badge"></span>' +
                    "</div>" +
                "</div>" +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button class="btn btn-outline-danger" type="button" id="fbd-delete">' +
                        '<i class="bi bi-trash me-1"></i>Delete</button>' +
                    CadminResourceSource.button() +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Feedback</h6></div>' +
                '<div class="card-body">' +
                    '<form id="fbd-status-form">' +
                        '<div class="row">' +
                            '<div class="col-md-4 mb-3">' +
                                '<label class="form-label" for="fbd-status">Status</label>' +
                                '<select class="form-select" id="fbd-status"></select>' +
                            "</div>" +
                            '<div class="col-md-4 mb-3">' +
                                '<div class="form-label">Type</div>' +
                                '<div id="fbd-type"></div>' +
                            "</div>" +
                            '<div class="col-md-4 mb-3">' +
                                '<div class="form-label">Sent</div>' +
                                '<div id="fbd-sent"></div>' +
                            "</div>" +
                        "</div>" +
                        '<div class="mb-3">' +
                            '<div class="form-label">Sender</div>' +
                            '<div id="fbd-sender"></div>' +
                        "</div>" +
                        '<div class="mb-3">' +
                            '<div class="form-label">ID</div>' +
                            '<code id="fbd-id"></code>' +
                        "</div>" +
                        '<div class="mb-3">' +
                            '<div class="form-label">Message</div>' +
                            '<div class="fbd-note-markdown border rounded p-3" id="fbd-body"></div>' +
                        "</div>" +
                        '<button type="submit" class="btn btn-primary">Save status</button>' +
                    "</form>" +
                "</div>" +
            "</div>" +
            '<div class="card shadow mb-4">' +
                '<div class="card-header py-3"><h6 class="m-0">Notes</h6></div>' +
                '<div class="card-body">' +
                    '<div id="fbd-notes-list" class="mb-4"></div>' +
                    '<form id="fbd-note-form">' +
                        '<label class="form-label" for="fbd-note-body">Add note</label>' +
                        '<div class="crd-markdown-host mb-3">' +
                            '<textarea class="form-control" id="fbd-note-body" rows="6"></textarea>' +
                        "</div>" +
                        '<button type="submit" class="btn btn-primary" id="fbd-note-submit">' +
                            '<i class="bi bi-plus-lg me-1"></i>Add note</button>' +
                    "</form>" +
                "</div>" +
            "</div>" +
            CadminResourceHistory.card() +
            CadminResourceGraph.card()
        );
        CadminApi.fillSelectOptions("#fbd-status", statusOptions, {
            selected: communication.status || "preparation"
        });
        CadminResourceSource.mount(function () { return communication; });
        CadminResourceGraph.mount(communication);
        CadminResourceHistory.mount(communication);
        renderHeader();
        renderBasics();
        renderNotesList();
        mountNoteEditor();
        bind();
    }

    function bind() {
        const $root = $(CadminWorkspace.root());
        $root.off(".fbdetail");
        $("#fbd-status-form").on("submit", function (event) {
            event.preventDefault();
            communication.status = $("#fbd-status").val() || "preparation";
            save(function () {
                CadminApi.showToast("success", "Feedback updated.");
            });
        });
        $("#fbd-note-form").on("submit", addNote);
        $root.on("click.fbdetail", "[data-note-index]", function () {
            const index = Number($(this).attr("data-note-index"));
            CadminApi.confirm("Delete this note?").done(function () {
                deleteNote(index);
            });
        });
        $root.on("click.fbdetail", "#fbd-delete", function () {
            CadminApi.confirm("Delete this feedback?").done(function () {
                CadminApi.fhir("/Communication/" + encodeURIComponent(communication.id), "DELETE").done(function () {
                    destroyNoteEditor();
                    CadminApi.showToast("success", "Feedback deleted.");
                    window.location.hash = "#/feedback";
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Delete feedback failed (" + xhr.status + ").");
                });
            });
        });
    }

    return {
        render: render
    };
}());
