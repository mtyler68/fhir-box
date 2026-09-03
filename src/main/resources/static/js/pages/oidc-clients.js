CadminApp.register("oidc-clients", function (params) {
    const id = CadminApi.routeParamId(params);
    if (id) {
        CadminOidcClientDetail.render(id);
        return;
    }

    const oidc = (CadminApp.config() || {}).mode === "oidc";
    const $root = $("#app-content");
    let clientsCache = [];
    let assignments = {};

    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">OIDC clients</h1>' +
            (oidc
                ? '<button class="btn btn-primary btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#oidc-client-create-modal">' +
                    '<i class="bi bi-plus-lg me-1" aria-hidden="true"></i>New client</button>'
                : "") +
        "</div>" +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                "<h6 class=\"m-0\">Keycloak clients</h6>" +
                (oidc
                    ? '<button class="btn btn-outline-secondary btn-sm" type="button" id="oidc-clients-refresh">' +
                        '<i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>Refresh</button>'
                    : "") +
            "</div>" +
            '<div class="card-body">' +
                '<p class="text-muted">' +
                (oidc
                    ? "Confidential machine-to-machine clients in the realm. Link a client to an organization by storing the service-account JWT subject as an Organization identifier using " +
                        "<code>" + CadminApi.escapeHtml(CadminApi.oidcSubjectSystem()) + "</code>."
                    : "OIDC client management is available when the gateway runs with <code>cadmin.security.mode=oidc</code>.") +
                "</p>" +
                '<div class="table-responsive">' +
                    '<table class="table align-middle">' +
                        "<thead><tr><th>Client ID</th><th>Name</th><th>Status</th><th>Service account</th><th>Organization</th><th></th></tr></thead>" +
                        '<tbody id="oidc-client-rows"><tr><td colspan="6" class="text-muted">' +
                            (oidc ? "Loading…" : "Not available in local mode.") +
                        "</td></tr></tbody>" +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>" +
        (oidc
            ? '<div class="modal fade" id="oidc-client-create-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="oidc-client-create-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Create OIDC client</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            '<div class="mb-3"><label class="form-label" for="oc-client-id">Client ID</label>' +
                                '<input class="form-control font-monospace" id="oc-client-id" required autocomplete="off"></div>' +
                            '<div class="mb-3"><label class="form-label" for="oc-name">Name</label>' +
                                '<input class="form-control" id="oc-name"></div>' +
                            '<div class="mb-3"><label class="form-label" for="oc-description">Description</label>' +
                                '<textarea class="form-control" id="oc-description" rows="2"></textarea></div>' +
                            '<div class="form-check mb-2">' +
                                '<input class="form-check-input" type="checkbox" id="oc-service-account" checked>' +
                                '<label class="form-check-label" for="oc-service-account">Service account (client credentials)</label>' +
                            "</div>" +
                            '<div class="form-check">' +
                                '<input class="form-check-input" type="checkbox" id="oc-scope-icg" checked>' +
                                '<label class="form-check-label" for="oc-scope-icg">Default scope <code>icg</code></label>' +
                            "</div>" +
                            '<div class="form-check mb-0">' +
                                '<input class="form-check-input" type="checkbox" id="oc-scope-icg-admin">' +
                                '<label class="form-check-label" for="oc-scope-icg-admin">Optional scope <code>icg.admin</code></label>' +
                            "</div>" +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Create</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>"
            : "")
    );

    function dash(value) {
        return value ? CadminApi.escapeHtml(value) : "—";
    }

    function organizationName(org) {
        return (org && org.name) || (org && org.id) || "Organization";
    }

    function organizationCell(client) {
        const subject = client && client.subject;
        const linked = subject && assignments[subject];
        if (!linked) {
            return "—";
        }
        return CadminApi.resourceLink(CadminApi.detailHref("Organization", linked.id), linked.name);
    }

    function renderRows(clients) {
        clientsCache = clients || [];
        if (!clientsCache.length) {
            $("#oidc-client-rows").html(
                '<tr><td colspan="6" class="text-muted">No OIDC clients were returned.</td></tr>'
            );
            return;
        }
        $("#oidc-client-rows").html(clientsCache.map(function (client) {
            const enabled = client.enabled !== false;
            const service = client.serviceAccountsEnabled === true;
            return "<tr><td class=\"font-monospace\">" + dash(client.clientId) + "</td><td>" +
                dash(client.name) +
                '</td><td><span class="badge ' + (enabled ? "text-bg-success" : "text-bg-secondary") + '">' +
                (enabled ? "Enabled" : "Disabled") + "</span></td><td>" +
                (service ? '<span class="badge text-bg-primary">Yes</span>' : "—") +
                "</td><td>" + organizationCell(client) +
                '</td><td class="text-end"><a class="btn btn-sm btn-outline-primary" href="#/oidc-clients/' +
                encodeURIComponent(client.id) + '">Open</a></td></tr>';
        }).join(""));
    }

    function loadAssignments() {
        assignments = {};
        return CadminApi.findByOidcSubject("Organization").then(function (organizations) {
            (organizations || []).forEach(function (organization) {
                (organization.identifier || []).forEach(function (identifier) {
                    if (CadminApi.isOidcSubjectIdentifier(identifier) && identifier.value) {
                        assignments[identifier.value] = {
                            id: organization.id,
                            name: organizationName(organization)
                        };
                    }
                });
            });
        }, function () {
            assignments = {};
        });
    }

    function load() {
        $("#oidc-client-rows").html('<tr><td colspan="6" class="text-muted">Loading…</td></tr>');
        CadminApi.get("/api/auth/clients").done(function (clients) {
            loadAssignments().always(function () {
                renderRows(clients);
            });
        }).fail(function (xhr) {
            const message = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error))
                || xhr.statusText
                || "Failed to load OIDC clients";
            $("#oidc-client-rows").html(
                '<tr><td colspan="6" class="text-danger">' + CadminApi.escapeHtml(message) + "</td></tr>"
            );
        });
    }

    if (!oidc) {
        return;
    }

    $("#oidc-clients-refresh").on("click", load);

    $("#oidc-client-create-form").on("submit", function (event) {
        event.preventDefault();
        const scopes = [];
        if ($("#oc-scope-icg").is(":checked")) {
            scopes.push("icg");
        }
        if ($("#oc-scope-icg-admin").is(":checked")) {
            scopes.push("icg.admin");
        }
        const $submit = $(this).find('[type="submit"]').prop("disabled", true);
        CadminApi.post("/api/auth/clients", {
            clientId: $("#oc-client-id").val(),
            name: $("#oc-name").val(),
            description: $("#oc-description").val(),
            serviceAccountsEnabled: $("#oc-service-account").is(":checked"),
            scopes: scopes
        }).done(function (created) {
            const el = document.getElementById("oidc-client-create-modal");
            const modal = el && bootstrap.Modal.getInstance(el);
            if (modal) {
                modal.hide();
            }
            CadminApi.showToast("success", "OIDC client created.");
            if (created && created.id) {
                window.location.hash = "#/oidc-clients/" + encodeURIComponent(created.id);
                return;
            }
            load();
        }).fail(function (xhr) {
            const message = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error))
                || "Failed to create client";
            CadminApi.showToast("danger", message);
        }).always(function () {
            $submit.prop("disabled", false);
        });
    });

    load();
});
