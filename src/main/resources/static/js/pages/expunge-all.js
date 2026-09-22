CadminApp.register("expunge-all", function () {
    const $root = $("#app-content");
    const MODAL_ID = "expunge-all-modal";

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function selectedOptions() {
        return {
            expungeDeletedResources: $("#expunge-deleted").is(":checked"),
            expungePreviousVersions: $("#expunge-previous").is(":checked"),
            expungeEverything: $("#expunge-everything").is(":checked")
        };
    }

    function consequences(options) {
        const items = [];
        if (options.expungeDeletedResources) {
            items.push("Permanently remove every resource that has already been deleted.");
        }
        if (options.expungePreviousVersions) {
            items.push("Permanently remove previous versions of remaining resources. Current versions stay.");
        }
        if (options.expungeEverything) {
            items.push("Permanently delete every resource on this FHIR server, including current versions. This empties the store.");
        }
        return items;
    }

    function confirmCopy(options) {
        const items = consequences(options);
        const intro = "This runs POST /$expunge on the FHIR server and cannot be undone.";
        return {
            title: options.expungeEverything ? "Expunge everything on this server?" : "Expunge selected FHIR data?",
            text: intro + "\n\n" + items.map(function (item) { return "• " + item; }).join("\n"),
            html: "<p>" + esc(intro) + "</p><ul class=\"text-start mb-0\">" +
                items.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("") +
                "</ul>"
        };
    }

    function parametersResource(options) {
        const parameter = [];
        ["expungeDeletedResources", "expungePreviousVersions", "expungeEverything"].forEach(function (name) {
            if (options[name]) {
                parameter.push({ name: name, valueBoolean: true });
            }
        });
        return {
            resourceType: "Parameters",
            parameter: parameter
        };
    }

    function countFromParameters(body) {
        const list = (body && body.parameter) || [];
        for (let i = 0; i < list.length; i++) {
            if (list[i].name === "count" && list[i].valueInteger != null) {
                return list[i].valueInteger;
            }
        }
        return null;
    }

    function modalEl() {
        return document.getElementById(MODAL_ID);
    }

    function showModal() {
        const el = modalEl();
        if (el) {
            bootstrap.Modal.getOrCreateInstance(el).show();
        }
    }

    function hideModal() {
        const el = modalEl();
        const instance = el && bootstrap.Modal.getInstance(el);
        if (instance) {
            instance.hide();
        }
    }

    function afterModalHidden(next) {
        const el = modalEl();
        if (!el || !el.classList.contains("show")) {
            next();
            return;
        }
        $(el).one("hidden.bs.modal", next);
        hideModal();
    }

    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            "<div>" +
                '<h1 class="h3 mb-1 page-title">Expunge All</h1>' +
                '<p class="text-muted mb-0">Permanently remove deleted resources, old versions, or the entire FHIR store.</p>' +
            "</div>" +
            '<button class="btn btn-danger" type="button" id="expunge-all-open">' +
                '<i class="bi bi-eraser me-1" aria-hidden="true"></i>Expunge All</button>' +
        "</div>" +
        '<div class="alert alert-warning" role="alert">' +
            "Expunge is irreversible. Choose only the scope you intend, then confirm the operation.</div>" +
        '<div class="modal fade" id="' + MODAL_ID + '" tabindex="-1" aria-labelledby="expunge-all-title">' +
            '<div class="modal-dialog">' +
                '<form class="modal-content" id="expunge-all-form">' +
                    '<div class="modal-header">' +
                        '<h5 class="modal-title" id="expunge-all-title">Expunge All</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    "</div>" +
                    '<div class="modal-body">' +
                        '<p class="mb-3">Select what the system-level <code>$expunge</code> operation should remove.</p>' +
                        '<div class="form-check mb-3">' +
                            '<input class="form-check-input" type="checkbox" id="expunge-deleted">' +
                            '<label class="form-check-label" for="expunge-deleted">Expunge Deleted Resources</label>' +
                            '<div class="form-text">Remove resources that have already been deleted.</div>' +
                        "</div>" +
                        '<div class="form-check mb-3">' +
                            '<input class="form-check-input" type="checkbox" id="expunge-previous">' +
                            '<label class="form-check-label" for="expunge-previous">Expunge Previous Versions</label>' +
                            '<div class="form-text">Remove historical versions. Current versions remain.</div>' +
                        "</div>" +
                        '<div class="form-check mb-0">' +
                            '<input class="form-check-input" type="checkbox" id="expunge-everything">' +
                            '<label class="form-check-label" for="expunge-everything">Expunge Everything</label>' +
                            '<div class="form-text">Delete every resource on this server, including current versions.</div>' +
                        "</div>" +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-danger" id="expunge-all-submit">Expunge</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>"
    );

    $("#expunge-all-open").on("click", showModal);
    $("#expunge-all-form").on("submit", function (event) {
        event.preventDefault();
        const options = selectedOptions();
        if (!options.expungeDeletedResources && !options.expungePreviousVersions && !options.expungeEverything) {
            CadminApi.showToast("warning", "Select at least one expunge option.");
            return;
        }
        const copy = confirmCopy(options);
        afterModalHidden(function () {
            CadminApi.confirm({
                title: copy.title,
                text: copy.text,
                html: copy.html,
                confirmText: "Expunge",
                danger: true
            }).done(function () {
                const $btn = $("#expunge-all-submit").prop("disabled", true);
                CadminApi.fhir("/$expunge", "POST", parametersResource(options)).done(function (body) {
                    const count = countFromParameters(body);
                    CadminApi.showToast("success", count != null
                        ? "Expunge completed (" + count + " resources)."
                        : "Expunge completed.");
                }).fail(function (xhr) {
                    CadminApi.showToast("danger", "Expunge failed" + (xhr && xhr.status ? " (" + xhr.status + ")" : "") + ".");
                    showModal();
                }).always(function () {
                    $btn.prop("disabled", false);
                });
            }).fail(function () {
                showModal();
            });
        });
    });

    showModal();
});
