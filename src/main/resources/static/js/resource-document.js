window.CadminResourceDocument = (function ($) {
    const MODAL_ID = "cadmin-resource-document-modal";
    const src = CadminFhirJsonSource;
    let editor = null;
    let bound = false;
    let currentType = "Resource";
    let lastIssues = [];

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function splitButton(options) {
        bindOnce();
        const label = options.label || "New";
        const target = options.modalTarget || "";
        const type = options.resourceType || "";
        const extraItems = (options.items || []).map(function (item) {
            const icon = item.icon
                ? '<i class="' + esc(item.icon) + ' me-2" aria-hidden="true"></i>'
                : "";
            return '<li><button type="button" class="dropdown-item" ' + (item.attrs || "") + ">" +
                icon + esc(item.label || "") + "</button></li>";
        }).join("");
        return '<div class="btn-group">' +
            '<button class="btn btn-primary" type="button" data-bs-toggle="modal" data-bs-target="' +
                esc(target) + '">' +
                '<i class="bi bi-plus-lg me-1"></i>' + esc(label) + "</button>" +
            '<button type="button" class="btn btn-primary dropdown-toggle dropdown-toggle-split" ' +
                'data-bs-toggle="dropdown" aria-expanded="false">' +
                '<span class="visually-hidden">More create options</span></button>' +
            '<ul class="dropdown-menu dropdown-menu-end">' +
                extraItems +
                '<li><button type="button" class="dropdown-item" data-resource-document="' +
                    esc(type) + '">' +
                    '<i class="bi bi-file-earmark-code me-2" aria-hidden="true"></i>' +
                    "From FHIR document</button></li>" +
            "</ul></div>";
    }

    function mode() {
        return ($("#" + MODAL_ID + "-mode-put").is(":checked") ? "put" : "post");
    }

    function syncSubmitLabel() {
        $("#" + MODAL_ID + "-submit").text(mode() === "put" ? "Update as Create" : "Create");
    }

    function editorText() {
        return editor ? editor.getValue() : ($("#" + MODAL_ID + "-text").val() || "");
    }

    function showClientError(message) {
        lastIssues = [];
        $("#" + MODAL_ID + "-outcome")
            .removeClass("d-none")
            .html('<div class="alert alert-danger mb-0">' + esc(message) + "</div>");
    }

    function readResource() {
        const text = editorText().trim();
        if (!text) {
            showClientError("Enter a FHIR JSON document.");
            return null;
        }
        const resource = src.parseJson(text);
        if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
            showClientError("Document is not valid JSON.");
            return null;
        }
        if (resource.resourceType !== currentType) {
            showClientError("resourceType must be " + currentType + ".");
            return null;
        }
        if (mode() === "put" && !resource.id) {
            showClientError("Update as Create (PUT) requires an id in the document.");
            return null;
        }
        return resource;
    }

    function prettyDocument(resource) {
        return src.prettySource(editor, "#" + MODAL_ID + "-text", resource);
    }

    function renderOutcome(status, body, fallback) {
        const rendered = src.outcomeHtml(status, body, fallback, "resource is valid.");
        lastIssues = rendered.issues;
        $("#" + MODAL_ID + "-outcome").removeClass("d-none").html(rendered.html);
    }

    function goToIssue(index) {
        const issue = lastIssues[parseInt(index, 10)];
        if (!issue) {
            return;
        }
        src.activateIssueRow($("#" + MODAL_ID + "-outcome"), index);
        if (!src.revealIssue(editor, issue, currentType)) {
            CadminApi.showToast("warning", "Unable to locate that path in the document.");
        }
    }

    function runBeautify() {
        if (!src.beautify(editor, "#" + MODAL_ID + "-text")) {
            showClientError("Document is not valid JSON.");
        }
    }

    function validatePath(resource) {
        const type = encodeURIComponent(currentType);
        if (mode() === "put") {
            return "/" + type + "/" + encodeURIComponent(resource.id) + "/$validate?mode=update";
        }
        return "/" + type + "/$validate?mode=create";
    }

    function busy(running) {
        $("#" + MODAL_ID + "-beautify, #" + MODAL_ID + "-validate, #" + MODAL_ID + "-submit")
            .prop("disabled", !!running);
    }

    function runValidate() {
        const resource = readResource();
        if (!resource) {
            return;
        }
        const prettyText = prettyDocument(resource);
        busy(true);
        CadminApi.fhir(validatePath(resource), "POST", prettyText, { silent: true })
            .done(function (body, _status, xhr) {
                renderOutcome(xhr && xhr.status ? xhr.status : 200, src.bodyFromXhr(xhr, body));
            })
            .fail(function (xhr) {
                const body = src.bodyFromXhr(xhr);
                renderOutcome(xhr && xhr.status, body,
                    "Validation failed (" + (xhr && xhr.status ? xhr.status : "error") + ").");
            })
            .always(function () {
                busy(false);
            });
    }

    function runSubmit() {
        const resource = readResource();
        if (!resource) {
            return;
        }
        const path = mode() === "put"
            ? "/" + encodeURIComponent(currentType) + "/" + encodeURIComponent(resource.id)
            : "/" + encodeURIComponent(currentType);
        const method = mode() === "put" ? "PUT" : "POST";
        busy(true);
        CadminApi.fhir(path, method, resource, { silent: true })
            .done(function (body, _status, xhr) {
                finishCreate(body, xhr);
            })
            .fail(function (xhr) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    finishCreate(src.bodyFromXhr(xhr), xhr);
                    return;
                }
                const body = src.bodyFromXhr(xhr);
                const fallback = (method === "PUT" ? "Update as Create" : "Create")
                    + " failed (" + xhr.status + ").";
                renderOutcome(xhr.status, body, fallback);
                busy(false);
            });
    }

    function finishCreate(body, xhr) {
        const created = body && body.resourceType === currentType ? body : null;
        const id = CadminApi.createdResourceId(created || body, xhr, currentType) || (created && created.id) || "";
        const modalEl = document.getElementById(MODAL_ID);
        const instance = modalEl && bootstrap.Modal.getInstance(modalEl);
        const go = function () {
            CadminApi.showToast("success", currentType + " created.");
            if (id) {
                window.location.hash = CadminApi.detailHref(currentType, id);
            }
        };
        busy(false);
        if (instance) {
            $(modalEl).one("hidden.bs.modal", go);
            instance.hide();
            return;
        }
        go();
    }

    function ensureModal() {
        if (document.getElementById(MODAL_ID)) {
            return;
        }
        $("body").append(
            '<div class="modal fade" id="' + MODAL_ID + '" tabindex="-1" aria-labelledby="' +
                MODAL_ID + '-title">' +
                '<div class="modal-dialog modal-xl modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title" id="' + MODAL_ID + '-title">Create from FHIR document</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body">' +
                            '<div class="btn-group mb-3" role="group" aria-label="Create mode">' +
                                '<input type="radio" class="btn-check" name="' + MODAL_ID + '-mode" id="' +
                                    MODAL_ID + '-mode-post" value="post" checked>' +
                                '<label class="btn btn-outline-primary" for="' + MODAL_ID + '-mode-post">' +
                                    "Create (POST)</label>" +
                                '<input type="radio" class="btn-check" name="' + MODAL_ID + '-mode" id="' +
                                    MODAL_ID + '-mode-put" value="put">' +
                                '<label class="btn btn-outline-primary" for="' + MODAL_ID + '-mode-put">' +
                                    "Update as Create (PUT)</label>" +
                            "</div>" +
                            '<label class="form-label" for="' + MODAL_ID + '-text">FHIR document (JSON)</label>' +
                            '<textarea id="' + MODAL_ID + '-text" class="form-control font-monospace" rows="16"></textarea>' +
                            '<div id="' + MODAL_ID + '-outcome" class="d-none mt-3"></div>' +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="button" class="btn btn-outline-secondary" id="' + MODAL_ID +
                                '-beautify"><i class="bi bi-text-indent-left me-1" aria-hidden="true"></i>Beautify</button>' +
                            '<button type="button" class="btn btn-outline-primary" id="' + MODAL_ID +
                                '-validate">Validate</button>' +
                            '<button type="button" class="btn btn-primary" id="' + MODAL_ID +
                                '-submit">Create</button>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        const textarea = document.getElementById(MODAL_ID + "-text");
        if (typeof CodeMirror !== "undefined" && textarea) {
            editor = CodeMirror.fromTextArea(textarea, {
                mode: { name: "javascript", json: true },
                theme: "material-darker",
                lineNumbers: true,
                lineWrapping: false,
                matchBrackets: true,
                tabSize: 2,
                indentUnit: 2,
                foldGutter: true,
                gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
                extraKeys: {
                    "Ctrl-Q": function (cm) {
                        cm.foldCode(cm.getCursor());
                    }
                },
                viewportMargin: Infinity
            });
            editor.getWrapperElement().classList.add("resource-document-editor");
        }
        $("#" + MODAL_ID).on("shown.bs.modal", function () {
            if (editor) {
                editor.refresh();
                editor.setSize("100%", "42vh");
                editor.focus();
            }
        });
        $("#" + MODAL_ID + "-mode-post, #" + MODAL_ID + "-mode-put").on("change", syncSubmitLabel);
        $("#" + MODAL_ID + "-beautify").on("click", runBeautify);
        $("#" + MODAL_ID + "-validate").on("click", runValidate);
        $("#" + MODAL_ID + "-submit").on("click", runSubmit);
        src.bindIssueRows($("#" + MODAL_ID), goToIssue);
    }

    function open(resourceType) {
        ensureModal();
        currentType = resourceType;
        $("#" + MODAL_ID + "-title").text("Create " + resourceType + " from FHIR document");
        $("#" + MODAL_ID + "-mode-post").prop("checked", true);
        $("#" + MODAL_ID + "-outcome").addClass("d-none").empty();
        lastIssues = [];
        syncSubmitLabel();
        const starter = src.pretty({ resourceType: resourceType });
        if (editor) {
            editor.setValue(starter);
        } else {
            $("#" + MODAL_ID + "-text").val(starter);
        }
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById(MODAL_ID));
        modal.show();
    }

    function bindOnce() {
        if (bound) {
            return;
        }
        bound = true;
        $(document).on("click.resource-document", "[data-resource-document]", function (event) {
            event.preventDefault();
            const type = $(this).attr("data-resource-document");
            if (type) {
                open(type);
            }
        });
    }

    return {
        splitButton: splitButton,
        open: open
    };
}(jQuery));
