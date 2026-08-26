window.CadminTransactionBundle = (function ($) {
    const UPLOAD_ID = "cadmin-transaction-bundle-modal";
    const RESPONSE_ID = "cadmin-transaction-response-modal";
    const src = CadminFhirJsonSource;
    let uploadEditor = null;
    let responseEditor = null;
    let lastIssues = [];

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function editorText() {
        return uploadEditor ? uploadEditor.getValue() : ($("#" + UPLOAD_ID + "-text").val() || "");
    }

    function starter() {
        return src.pretty({
            resourceType: "Bundle",
            type: "transaction",
            entry: []
        });
    }

    function showClientError(message) {
        lastIssues = [];
        $("#" + UPLOAD_ID + "-outcome")
            .removeClass("d-none")
            .html('<div class="alert alert-danger mb-0">' + esc(message) + "</div>");
    }

    function readBundle() {
        const text = editorText().trim();
        if (!text) {
            showClientError("Enter a FHIR transaction Bundle.");
            return null;
        }
        const resource = src.parseJson(text);
        if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
            showClientError("Document is not valid JSON.");
            return null;
        }
        if (resource.resourceType !== "Bundle") {
            showClientError("resourceType must be Bundle.");
            return null;
        }
        if (resource.type !== "transaction") {
            showClientError('Bundle.type must be "transaction".');
            return null;
        }
        return resource;
    }

    function renderOutcome(status, body, fallback) {
        const rendered = src.outcomeHtml(status, body, fallback, "bundle is valid.");
        lastIssues = rendered.issues;
        $("#" + UPLOAD_ID + "-outcome").removeClass("d-none").html(rendered.html);
    }

    function goToIssue(index) {
        const issue = lastIssues[parseInt(index, 10)];
        if (!issue) {
            return;
        }
        src.activateIssueRow($("#" + UPLOAD_ID + "-outcome"), index);
        if (!src.revealIssue(uploadEditor, issue, "Bundle")) {
            CadminApi.showToast("warning", "Unable to locate that path in the document.");
        }
    }

    function runBeautify() {
        if (!src.beautify(uploadEditor, "#" + UPLOAD_ID + "-text")) {
            showClientError("Document is not valid JSON.");
        }
    }

    function busy(running) {
        $("#" + UPLOAD_ID + "-beautify, #" + UPLOAD_ID + "-validate, #" + UPLOAD_ID + "-submit")
            .prop("disabled", !!running);
    }

    function jsonEditor(textarea, readOnly, extraClass) {
        if (typeof CodeMirror === "undefined" || !textarea) {
            return null;
        }
        const editor = CodeMirror.fromTextArea(textarea, {
            mode: { name: "javascript", json: true },
            theme: "material-darker",
            lineNumbers: true,
            lineWrapping: false,
            readOnly: !!readOnly,
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
        editor.getWrapperElement().classList.add(extraClass);
        return editor;
    }

    function ensureUploadModal() {
        if (document.getElementById(UPLOAD_ID)) {
            return;
        }
        $("body").append(
            '<div class="modal fade" id="' + UPLOAD_ID + '" tabindex="-1" aria-labelledby="' +
                UPLOAD_ID + '-title">' +
                '<div class="modal-dialog modal-xl modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title" id="' + UPLOAD_ID + '-title">Upload transaction bundle</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body">' +
                            '<label class="form-label" for="' + UPLOAD_ID + '-text">Transaction Bundle (JSON)</label>' +
                            '<textarea id="' + UPLOAD_ID + '-text" class="form-control font-monospace" rows="16"></textarea>' +
                            '<div id="' + UPLOAD_ID + '-outcome" class="d-none mt-3"></div>' +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="button" class="btn btn-outline-secondary" id="' + UPLOAD_ID +
                                '-beautify"><i class="bi bi-text-indent-left me-1" aria-hidden="true"></i>Beautify</button>' +
                            '<button type="button" class="btn btn-outline-primary" id="' + UPLOAD_ID +
                                '-validate">Validate</button>' +
                            '<button type="button" class="btn btn-primary" id="' + UPLOAD_ID +
                                '-submit">Submit transaction</button>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        uploadEditor = jsonEditor(document.getElementById(UPLOAD_ID + "-text"), false, "resource-document-editor");
        $("#" + UPLOAD_ID).on("shown.bs.modal", function () {
            if (uploadEditor) {
                uploadEditor.refresh();
                uploadEditor.setSize("100%", "42vh");
                uploadEditor.focus();
            }
        });
        $("#" + UPLOAD_ID + "-beautify").on("click", runBeautify);
        $("#" + UPLOAD_ID + "-validate").on("click", runValidate);
        $("#" + UPLOAD_ID + "-submit").on("click", runSubmit);
        src.bindIssueRows($("#" + UPLOAD_ID), goToIssue);
    }

    function ensureResponseModal() {
        if (document.getElementById(RESPONSE_ID)) {
            return;
        }
        $("body").append(
            '<div class="modal fade" id="' + RESPONSE_ID + '" tabindex="-1" aria-labelledby="' +
                RESPONSE_ID + '-title">' +
                '<div class="modal-dialog modal-xl modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<div>' +
                                '<h5 class="modal-title" id="' + RESPONSE_ID + '-title">Transaction response</h5>' +
                                '<div class="small text-muted" id="' + RESPONSE_ID + '-summary"></div>' +
                            "</div>" +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body p-0">' +
                            '<textarea id="' + RESPONSE_ID + '-text" class="d-none"></textarea>' +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-primary" data-bs-dismiss="modal">Dismiss</button>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        responseEditor = jsonEditor(document.getElementById(RESPONSE_ID + "-text"), true, "resource-source-editor");
        $("#" + RESPONSE_ID).on("shown.bs.modal", function () {
            if (responseEditor) {
                responseEditor.refresh();
                responseEditor.setSize("100%", "70vh");
            }
        });
    }

    function responseSummary(status, bundle) {
        const entries = (bundle && bundle.entry) || [];
        const failed = entries.filter(function (entry) {
            const code = String((entry && entry.response && entry.response.status) || "");
            const num = parseInt(code, 10);
            return !isNaN(num) && num >= 400;
        }).length;
        const parts = ["HTTP " + status];
        if (bundle && bundle.type) {
            parts.push(bundle.type);
        }
        if (entries.length) {
            parts.push(entries.length + (entries.length === 1 ? " entry" : " entries"));
        }
        if (failed) {
            parts.push(failed + " failed");
        }
        return parts.join(" · ");
    }

    function showResponse(status, body) {
        ensureResponseModal();
        const json = src.pretty(body || {});
        $("#" + RESPONSE_ID + "-summary").text(responseSummary(status, body));
        if (responseEditor) {
            responseEditor.setValue(json);
        } else {
            $("#" + RESPONSE_ID + "-text").val(json);
        }
        const uploadEl = document.getElementById(UPLOAD_ID);
        const upload = uploadEl && bootstrap.Modal.getInstance(uploadEl);
        const openResponse = function () {
            bootstrap.Modal.getOrCreateInstance(document.getElementById(RESPONSE_ID)).show();
        };
        if (upload) {
            $(uploadEl).one("hidden.bs.modal", openResponse);
            upload.hide();
            return;
        }
        openResponse();
    }

    function runValidate() {
        const bundle = readBundle();
        if (!bundle) {
            return;
        }
        const prettyText = src.prettySource(uploadEditor, "#" + UPLOAD_ID + "-text", bundle);
        busy(true);
        CadminApi.fhir("/Bundle/$validate", "POST", prettyText, { silent: true })
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
        const bundle = readBundle();
        if (!bundle) {
            return;
        }
        busy(true);
        CadminApi.fhir("/", "POST", bundle, { silent: true })
            .done(function (body, _status, xhr) {
                finishSubmit(xhr && xhr.status ? xhr.status : 200, src.bodyFromXhr(xhr, body));
            })
            .fail(function (xhr) {
                const body = src.bodyFromXhr(xhr);
                if (body && body.resourceType === "Bundle") {
                    finishSubmit(xhr.status, body);
                    return;
                }
                renderOutcome(xhr.status, body, "Transaction failed (" + xhr.status + ").");
                busy(false);
            });
    }

    function finishSubmit(status, body) {
        busy(false);
        CadminApi.showToast(status >= 400 ? "danger" : "success",
            status >= 400 ? "Transaction completed with errors." : "Transaction submitted.");
        showResponse(status, body);
    }

    function open() {
        if (!window.CadminApp || !CadminApp.isAdmin()) {
            return;
        }
        ensureUploadModal();
        $("#" + UPLOAD_ID + "-outcome").addClass("d-none").empty();
        lastIssues = [];
        if (uploadEditor) {
            uploadEditor.setValue(starter());
        } else {
            $("#" + UPLOAD_ID + "-text").val(starter());
        }
        bootstrap.Modal.getOrCreateInstance(document.getElementById(UPLOAD_ID)).show();
    }

    $(function () {
        $(document).on("click.transaction-bundle", "#upload-transaction-bundle", function (event) {
            event.preventDefault();
            open();
        });
    });

    return {
        open: open
    };
}(jQuery));
