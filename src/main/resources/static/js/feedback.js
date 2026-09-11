window.CadminFeedback = (function ($) {
    const CATEGORY_SYSTEM = "https://insulet.com/fhir/CodeSystem/feedback-category";
    const categories = [
        { code: "feature-request", display: "Feature request" },
        { code: "enhancement", display: "Enhancement" },
        { code: "bug", display: "Bug report" },
        { code: "comment", display: "Comment" }
    ];
    let editor = null;
    let bound = false;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function personName(resource) {
        const name = (resource && resource.name && resource.name[0]) || {};
        const given = (name.given || []).join(" ");
        return [given, name.family].filter(Boolean).join(" ") || (resource && resource.id) || "Unnamed";
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

    function markdownToolbar() {
        function tool(name, action, icon, title) {
            return { name: name, action: action, className: icon, title: title };
        }
        return [
            tool("bold", EasyMDE.toggleBold, "bi bi-type-bold", "Bold"),
            tool("italic", EasyMDE.toggleItalic, "bi bi-type-italic", "Italic"),
            tool("strikethrough", EasyMDE.toggleStrikethrough, "bi bi-type-strikethrough", "Strikethrough"),
            tool("heading", EasyMDE.toggleHeadingSmaller, "bi bi-type-h1", "Heading"),
            "|",
            tool("quote", EasyMDE.toggleBlockquote, "bi bi-quote", "Quote"),
            tool("code", EasyMDE.toggleCodeBlock, "bi bi-code-slash", "Code"),
            tool("unordered-list", EasyMDE.toggleUnorderedList, "bi bi-list-ul", "Bulleted list"),
            tool("ordered-list", EasyMDE.toggleOrderedList, "bi bi-list-ol", "Numbered list"),
            "|",
            tool("link", EasyMDE.drawLink, "bi bi-link-45deg", "Link"),
            "|",
            tool("preview", EasyMDE.togglePreview, "bi bi-eye no-disable", "Preview"),
            tool("guide", "https://www.markdownguide.org/basic-syntax/", "bi bi-question-circle no-disable",
                "Markdown guide")
        ];
    }

    function destroyEditor() {
        if (editor && typeof editor.toTextArea === "function") {
            try {
                editor.toTextArea();
            } catch (ignored) {
                /* already detached */
            }
        }
        editor = null;
    }

    function bodyValue() {
        if (editor) {
            return editor.value() || "";
        }
        return $("#feedback-body").val() || "";
    }

    function mountEditor() {
        destroyEditor();
        const el = document.getElementById("feedback-body");
        if (!el || typeof EasyMDE === "undefined") {
            return;
        }
        editor = new EasyMDE({
            element: el,
            autofocus: false,
            autoDownloadFontAwesome: false,
            spellChecker: false,
            status: false,
            forceSync: true,
            minHeight: "12rem",
            placeholder: "Write markdown…",
            toolbar: markdownToolbar()
        });
        requestAnimationFrame(function () {
            if (editor && editor.codemirror) {
                editor.codemirror.refresh();
            }
        });
    }

    function categoryOptionsHtml(selected) {
        return categories.map(function (item) {
            const mark = item.code === selected ? " selected" : "";
            return '<option value="' + esc(item.code) + '"' + mark + ">" + esc(item.display) + "</option>";
        }).join("");
    }

    function categoryLabel(code) {
        const match = categories.find(function (item) { return item.code === code; });
        return match ? match.display : (code || "—");
    }

    function categoryOf(resource) {
        const coding = ((((resource && resource.category) || [])[0] || {}).coding || [])[0] || {};
        return coding.code || "";
    }

    function payloadAttachment(resource) {
        const payload = ((resource && resource.payload) || [])[0] || {};
        return payload.contentAttachment || {};
    }

    function ensureModal() {
        if (document.getElementById("feedback-modal")) {
            return;
        }
        $("body").append(
            '<div class="modal fade" id="feedback-modal" tabindex="-1" data-bs-focus="false" ' +
                'aria-labelledby="feedback-modal-title">' +
                '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                    '<form class="modal-content" id="feedback-form">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title" id="feedback-modal-title">Send feedback</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body">' +
                            '<p class="text-muted">Comments, feature or enhancement ideas, and bug reports. ' +
                                "This is stored as a FHIR Communication.</p>" +
                            '<div class="mb-3">' +
                                '<label class="form-label" for="feedback-category">Type</label>' +
                                '<select class="form-select" id="feedback-category">' +
                                    categoryOptionsHtml("feature-request") +
                                "</select>" +
                            "</div>" +
                            '<div class="mb-3">' +
                                '<label class="form-label" for="feedback-subject">Subject</label>' +
                                '<input class="form-control" id="feedback-subject" required maxlength="256" ' +
                                    'autocomplete="off" placeholder="Short summary">' +
                            "</div>" +
                            '<div class="mb-0">' +
                                '<label class="form-label" for="feedback-body">Message</label>' +
                                '<div class="crd-markdown-host">' +
                                    '<textarea class="form-control" id="feedback-body" rows="8"></textarea>' +
                                "</div>" +
                            "</div>" +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary" id="feedback-submit">' +
                                '<i class="bi bi-send me-1" aria-hidden="true"></i>Send</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>"
        );
    }

    function modal() {
        ensureModal();
        return bootstrap.Modal.getOrCreateInstance(document.getElementById("feedback-modal"), { focus: false });
    }

    function currentPractitioner() {
        const user = (window.CadminApp && CadminApp.user()) || {};
        const oidcId = user.oidcId || "";
        if (!oidcId) {
            return $.Deferred().reject({
                message: "Your account is not linked to a practitioner. Ask an administrator to assign one on the Users page."
            }).promise();
        }
        return CadminApi.findByOidcSubject("Practitioner", oidcId, { silent: true }).then(function (practitioners) {
            const practitioner = (practitioners || [])[0];
            if (!practitioner || !practitioner.id) {
                return $.Deferred().reject({
                    message: "Your account is not linked to a practitioner. Ask an administrator to assign one on the Users page."
                }).promise();
            }
            return practitioner;
        });
    }

    function submit(event) {
        event.preventDefault();
        const subject = ($("#feedback-subject").val() || "").trim();
        const body = bodyValue().trim();
        const code = $("#feedback-category").val() || "feature-request";
        const match = categories.find(function (item) { return item.code === code; }) || categories[0];
        if (!subject) {
            CadminApi.showToast("danger", "Enter a subject.");
            return;
        }
        if (!body) {
            CadminApi.showToast("danger", "Enter a message.");
            return;
        }
        const $submit = $("#feedback-submit").prop("disabled", true);
        currentPractitioner().then(function (practitioner) {
            const communication = {
                resourceType: "Communication",
                status: "preparation",
                sent: new Date().toISOString(),
                category: [{
                    coding: [{
                        system: CATEGORY_SYSTEM,
                        code: match.code,
                        display: match.display
                    }],
                    text: match.display
                }],
                topic: { text: subject },
                sender: {
                    reference: "Practitioner/" + practitioner.id,
                    display: personName(practitioner)
                },
                payload: [{
                    contentAttachment: {
                        contentType: "text/markdown",
                        title: subject,
                        data: encodeText(body)
                    }
                }]
            };
            return CadminApi.fhir("/Communication", "POST", communication);
        }).done(function () {
            CadminApi.showToast("success", "Feedback sent.");
            modal().hide();
        }).fail(function (err) {
            if (err && err.message && !err.status) {
                CadminApi.showToast("danger", err.message);
                return;
            }
            CadminApi.showToast("danger", "Send feedback failed (" + ((err && err.status) || "?") + ").");
        }).always(function () {
            $submit.prop("disabled", false);
        });
    }

    function resetForm() {
        $("#feedback-category").val("feature-request");
        $("#feedback-subject").val("");
        $("#feedback-body").val("");
        if (editor) {
            editor.value("");
        }
    }

    function open(event) {
        if (event) {
            event.preventDefault();
        }
        modal().show();
    }

    function init() {
        ensureModal();
        if (bound) {
            return;
        }
        bound = true;
        $(document).on("click", "#feedback-open", open);
        $("#feedback-form").on("submit", submit);
        $("#feedback-modal").on("shown.bs.modal", function () {
            mountEditor();
            $("#feedback-subject").trigger("focus");
        });
        $("#feedback-modal").on("hidden.bs.modal", function () {
            destroyEditor();
            resetForm();
        });
    }

    return {
        CATEGORY_SYSTEM: CATEGORY_SYSTEM,
        categories: categories,
        categoryOptionsHtml: categoryOptionsHtml,
        categoryLabel: categoryLabel,
        categoryOf: categoryOf,
        payloadAttachment: payloadAttachment,
        encodeText: encodeText,
        decodeText: decodeText,
        personName: personName,
        currentPractitioner: currentPractitioner,
        init: init,
        open: open
    };
}(jQuery));
