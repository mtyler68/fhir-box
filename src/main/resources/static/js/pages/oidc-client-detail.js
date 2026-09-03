window.CadminOidcClientDetail = (function () {
    function organizationName(org) {
        return (org && org.name) || (org && org.id) || "Organization";
    }

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function defaultTokenScope(client) {
        const scopes = [];
        if (hasScope(client, "icg")) {
            scopes.push("icg");
        }
        if (hasScope(client, "icg.admin")) {
            scopes.push("icg.admin");
        }
        return scopes.join(" ");
    }

    function decodeJwt(token) {
        const parts = String(token || "").split(".");
        if (parts.length < 2) {
            return null;
        }
        try {
            let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const pad = payload.length % 4;
            if (pad) {
                payload += "=".repeat(4 - pad);
            }
            return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(payload), function (ch) {
                return "%" + ("00" + ch.charCodeAt(0).toString(16)).slice(-2);
            }).join("")));
        } catch (ex) {
            return null;
        }
    }

    function formatExpires(body) {
        if (body && body.expiresAt) {
            const date = new Date(body.expiresAt);
            if (!isNaN(date.getTime())) {
                const seconds = body.expiresIn != null ? body.expiresIn + "s" : "";
                return date.toLocaleString() + (seconds ? " (" + seconds + ")" : "");
            }
        }
        return body && body.expiresIn != null ? body.expiresIn + "s" : "—";
    }

    function copyText(text, label) {
        const value = text || "";
        const done = function () {
            CadminApi.showToast("success", label + " copied.");
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done).catch(function () {
                fallbackCopy(value, done);
            });
            return;
        }
        fallbackCopy(value, done);
    }

    function fallbackCopy(text, done) {
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.left = "-9999px";
        document.body.appendChild(field);
        field.select();
        try {
            document.execCommand("copy");
            done();
        } catch (ex) {
            CadminApi.showToast("danger", "Could not copy to the clipboard.");
        }
        document.body.removeChild(field);
    }

    function tokenWizardHtml() {
        return '<div class="modal fade" id="ocd-token-modal" tabindex="-1">' +
            '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header"><h5 class="modal-title">Request bearer token</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<ol class="npi-wizard-steps mb-3" id="ocd-token-steps">' +
                            '<li class="npi-wizard-step" data-ocd-token-step="1">Credentials</li>' +
                            '<li class="npi-wizard-step" data-ocd-token-step="2">Access token</li>' +
                        "</ol>" +
                        '<div id="ocd-token-alert" class="alert d-none"></div>' +
                        '<div data-ocd-token-pane="1">' +
                            '<p class="text-muted">Request a client-credentials access token with this client ID and secret.</p>' +
                            '<div class="mb-3"><label class="form-label" for="ocd-token-client-id">Client ID</label>' +
                                '<input class="form-control font-monospace" id="ocd-token-client-id" readonly></div>' +
                            '<div class="mb-3"><label class="form-label" for="ocd-token-secret">Client secret</label>' +
                                '<div class="input-group">' +
                                    '<input class="form-control font-monospace" id="ocd-token-secret" type="password" autocomplete="off">' +
                                    '<button class="btn btn-outline-secondary" type="button" id="ocd-token-secret-toggle">Show</button>' +
                                "</div></div>" +
                            '<div class="mb-0"><label class="form-label" for="ocd-token-scope">Scope</label>' +
                                '<input class="form-control" id="ocd-token-scope" placeholder="icg icg.admin">' +
                                '<div class="form-text">Leave blank to use the client default scopes.</div></div>' +
                        "</div>" +
                        '<div data-ocd-token-pane="2" class="d-none">' +
                            '<dl class="row">' +
                                '<dt class="col-sm-3">Client</dt><dd class="col-sm-9" id="ocd-token-result-client">—</dd>' +
                                '<dt class="col-sm-3">Type</dt><dd class="col-sm-9" id="ocd-token-type">—</dd>' +
                                '<dt class="col-sm-3">Expires</dt><dd class="col-sm-9" id="ocd-token-expires">—</dd>' +
                                '<dt class="col-sm-3">Scope</dt><dd class="col-sm-9" id="ocd-token-granted-scope">—</dd>' +
                            "</dl>" +
                            '<label class="form-label" for="ocd-token-access">Access token</label>' +
                            '<textarea class="form-control font-monospace mb-3" id="ocd-token-access" rows="5" readonly></textarea>' +
                            '<label class="form-label" for="ocd-token-bearer">Authorization header</label>' +
                            '<textarea class="form-control font-monospace mb-3" id="ocd-token-bearer" rows="3" readonly></textarea>' +
                            '<div id="ocd-token-claims-wrap" class="d-none">' +
                                '<label class="form-label">JWT claims</label>' +
                                '<pre class="small mb-0" id="ocd-token-claims"></pre>' +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="ocd-token-cancel">Cancel</button>' +
                        '<button type="button" class="btn btn-outline-secondary d-none" id="ocd-token-back">Back</button>' +
                        '<button type="button" class="btn btn-primary" id="ocd-token-next">Request token</button>' +
                        '<button type="button" class="btn btn-outline-secondary d-none" id="ocd-token-copy">Copy token</button>' +
                        '<button type="button" class="btn btn-primary d-none" id="ocd-token-copy-bearer">Copy Bearer header</button>' +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function hasScope(client, name) {
        const defaults = client.defaultClientScopes || [];
        const optional = client.optionalClientScopes || [];
        return defaults.indexOf(name) >= 0 || optional.indexOf(name) >= 0;
    }

    function selectedScopes() {
        const scopes = [];
        if ($("#ocd-scope-icg").is(":checked")) {
            scopes.push("icg");
        }
        if ($("#ocd-scope-icg-admin").is(":checked")) {
            scopes.push("icg.admin");
        }
        return scopes;
    }

    function putOrganization(organization) {
        return CadminApi.fhir("/Organization/" + encodeURIComponent(organization.id), "PUT", organization);
    }

    function assignToOrganization(subject, organizationId) {
        return CadminApi.findByOidcSubject("Organization", subject).then(function (current) {
            let chain = $.Deferred().resolve().promise();
            (current || []).forEach(function (organization) {
                if (organization.id === organizationId) {
                    return;
                }
                CadminApi.removeOidcSubjectIdentifier(organization, subject);
                chain = chain.then(function () { return putOrganization(organization); });
            });
            if (!organizationId) {
                return chain;
            }
            const already = (current || []).some(function (organization) {
                return organization.id === organizationId;
            });
            if (already) {
                return chain.then(function () {
                    const linked = (current || []).find(function (organization) {
                        return organization.id === organizationId;
                    });
                    if (!linked) {
                        return;
                    }
                    CadminApi.upsertOidcSubjectIdentifier(linked, subject);
                    return putOrganization(linked);
                });
            }
            return chain.then(function () {
                return CadminApi.fhir("/Organization/" + encodeURIComponent(organizationId)).then(function (organization) {
                    CadminApi.upsertOidcSubjectIdentifier(organization, subject);
                    return putOrganization(organization);
                });
            });
        });
    }

    function render(id) {
        const $root = $("#app-content");
        $root.html('<div class="text-muted py-5 text-center">Loading…</div>');
        CadminApi.get("/api/auth/clients/" + encodeURIComponent(id)).done(function (client) {
            paint(client);
        }).fail(function (xhr) {
            const message = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error))
                || xhr.statusText
                || "Failed to load OIDC client";
            $root.html(
                '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                    '<h1 class="h3 mb-0 page-title">OIDC client</h1>' +
                    '<a class="btn btn-outline-secondary btn-sm" href="#/oidc-clients">Back</a>' +
                "</div>" +
                '<div class="alert alert-danger">' + CadminApi.escapeHtml(message) + "</div>"
            );
        });
    }

    function paint(client) {
        const $root = $("#app-content");
        const protectedClient = !!client.internal;
        const subject = client.subject || "";
        const canLink = !!subject;
        $root.html(
            '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
                '<div><a class="small text-muted text-decoration-none" href="#/oidc-clients">' +
                    '<i class="bi bi-arrow-left me-1"></i>OIDC clients</a>' +
                    '<h1 class="h3 mb-0 page-title">' + CadminApi.escapeHtml(client.clientId || "OIDC client") + "</h1></div>" +
                '<div class="d-flex gap-2">' +
                    (client.publicClient ? "" :
                        '<button class="btn btn-outline-primary btn-sm" type="button" id="ocd-token-open">' +
                            '<i class="bi bi-key me-1" aria-hidden="true"></i>Request token</button>') +
                    (protectedClient ? "" :
                        '<button class="btn btn-outline-danger btn-sm" type="button" id="ocd-delete">Delete</button>') +
                "</div>" +
            "</div>" +
            '<div id="ocd-alert" class="alert d-none"></div>' +
            '<div class="row">' +
                '<div class="col-lg-7">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Client</h6></div>' +
                        '<div class="card-body">' +
                            '<form id="ocd-form">' +
                                '<div class="mb-3"><label class="form-label" for="ocd-name">Name</label>' +
                                    '<input class="form-control" id="ocd-name" ' + (protectedClient ? "disabled" : "") + "></div>" +
                                '<div class="mb-3"><label class="form-label" for="ocd-description">Description</label>' +
                                    '<textarea class="form-control" id="ocd-description" rows="3" ' +
                                    (protectedClient ? "disabled" : "") + "></textarea></div>" +
                                '<div class="form-check mb-3">' +
                                    '<input class="form-check-input" type="checkbox" id="ocd-enabled" ' +
                                    (protectedClient ? "disabled" : "") + ">" +
                                    '<label class="form-check-label" for="ocd-enabled">Enabled</label>' +
                                "</div>" +
                                '<div class="form-check">' +
                                    '<input class="form-check-input" type="checkbox" id="ocd-scope-icg" ' +
                                    (protectedClient ? "disabled" : "") + ">" +
                                    '<label class="form-check-label" for="ocd-scope-icg">Default scope <code>icg</code></label>' +
                                "</div>" +
                                '<div class="form-check mb-3">' +
                                    '<input class="form-check-input" type="checkbox" id="ocd-scope-icg-admin" ' +
                                    (protectedClient ? "disabled" : "") + ">" +
                                    '<label class="form-check-label" for="ocd-scope-icg-admin">Optional scope <code>icg.admin</code></label>' +
                                "</div>" +
                                (protectedClient
                                    ? '<p class="small text-muted mb-0">The Box and ICG clients are managed outside this page.</p>'
                                    : '<button class="btn btn-primary" type="submit">Save</button>') +
                            "</form>" +
                        "</div>" +
                    "</div>" +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Client secret</h6></div>' +
                        '<div class="card-body">' +
                            (client.publicClient
                                ? '<p class="text-muted mb-0">Public clients do not have a secret.</p>'
                                : '<div class="input-group mb-3">' +
                                    '<input class="form-control font-monospace" id="ocd-secret" type="password" readonly>' +
                                    '<button class="btn btn-outline-secondary" type="button" id="ocd-secret-toggle">Show</button>' +
                                    '<button class="btn btn-outline-secondary" type="button" id="ocd-secret-copy">Copy</button>' +
                                "</div>" +
                                (protectedClient
                                    ? '<p class="small text-muted mb-0">Rotate this secret in the Keycloak admin console.</p>'
                                    : '<button class="btn btn-outline-danger btn-sm" type="button" id="ocd-secret-regen">Regenerate secret</button>') +
                                '<button class="btn btn-outline-primary btn-sm' +
                                    (protectedClient ? "" : " ms-2") +
                                    '" type="button" id="ocd-token-open-card">' +
                                    '<i class="bi bi-key me-1" aria-hidden="true"></i>Request token</button>') +
                        "</div>" +
                    "</div>" +
                "</div>" +
                '<div class="col-lg-5">' +
                    '<div class="card shadow mb-4">' +
                        '<div class="card-header py-3"><h6 class="m-0">Organization</h6></div>' +
                        '<div class="card-body">' +
                            '<p class="text-muted">The service-account JWT <code>sub</code> is stored as an Organization identifier.</p>' +
                            '<dl class="row">' +
                                '<dt class="col-sm-4">System</dt>' +
                                '<dd class="col-sm-8"><code class="small">' +
                                    CadminApi.escapeHtml(client.subjectSystem || CadminApi.oidcSubjectSystem()) +
                                "</code></dd>" +
                                '<dt class="col-sm-4">Subject</dt>' +
                                '<dd class="col-sm-8">' +
                                    (subject
                                        ? '<code class="small" id="ocd-subject">' + CadminApi.escapeHtml(subject) + "</code>"
                                        : '<span class="text-muted">Enable a service account to obtain a subject.</span>') +
                                "</dd>" +
                            "</dl>" +
                            '<div class="mb-3"><label class="form-label" for="ocd-organization">Linked organization</label>' +
                                '<select class="form-select" id="ocd-organization"' +
                                (canLink ? "" : " disabled") + ">" +
                                    '<option value="">Select organization…</option></select></div>' +
                            '<button class="btn btn-primary" type="button" id="ocd-assign"' +
                            (canLink ? "" : " disabled") + ">Save link</button>" +
                            '<button class="btn btn-outline-secondary ms-2" type="button" id="ocd-unassign"' +
                            (canLink ? "" : " disabled") + ">Remove link</button>" +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>" +
            (client.publicClient ? "" : tokenWizardHtml())
        );

        $("#ocd-name").val(client.name || "");
        $("#ocd-description").val(client.description || "");
        $("#ocd-enabled").prop("checked", client.enabled !== false);
        $("#ocd-scope-icg").prop("checked", hasScope(client, "icg"));
        $("#ocd-scope-icg-admin").prop("checked", hasScope(client, "icg.admin"));
        if (!client.publicClient) {
            $("#ocd-secret").val(client.secret || "");
        }

        let linkedOrg = null;

        function bindOrganization(selected) {
            linkedOrg = selected || null;
            CadminApi.destroySelect("#ocd-organization");
            CadminApi.bindOrganizationSelect("#ocd-organization", {
                placeholder: "Select organization…",
                selectedId: linkedOrg ? linkedOrg.id : "",
                selectedLabel: linkedOrg ? linkedOrg.name : ""
            });
        }

        if (canLink) {
            CadminApi.findByOidcSubject("Organization", subject).done(function (organizations) {
                const first = (organizations || [])[0];
                bindOrganization(first ? { id: first.id, name: organizationName(first) } : null);
            }).fail(function () {
                bindOrganization(null);
            });
        }

        $root.off(".oidc-client");
        $root.on("submit.oidc-client", "#ocd-form", function (event) {
            event.preventDefault();
            if (protectedClient) {
                return;
            }
            const $submit = $(this).find('[type="submit"]').prop("disabled", true);
            CadminApi.showAlert("#ocd-alert");
            CadminApi.put("/api/auth/clients/" + encodeURIComponent(client.id), {
                name: $("#ocd-name").val(),
                description: $("#ocd-description").val(),
                enabled: $("#ocd-enabled").is(":checked"),
                scopes: selectedScopes()
            }).done(function (updated) {
                CadminApi.showToast("success", "Client saved.");
                paint(updated);
            }).fail(function (xhr) {
                const message = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error))
                    || "Failed to save client";
                CadminApi.showAlert("#ocd-alert", "danger", message);
            }).always(function () {
                $submit.prop("disabled", false);
            });
        });

        $root.on("click.oidc-client", "#ocd-secret-toggle", function () {
            const $input = $("#ocd-secret");
            const hidden = $input.attr("type") === "password";
            $input.attr("type", hidden ? "text" : "password");
            $(this).text(hidden ? "Hide" : "Show");
        });

        $root.on("click.oidc-client", "#ocd-secret-copy", function () {
            const value = $("#ocd-secret").val();
            if (!value || !navigator.clipboard) {
                CadminApi.showToast("danger", "Nothing to copy.");
                return;
            }
            navigator.clipboard.writeText(value).then(function () {
                CadminApi.showToast("success", "Secret copied.");
            }, function () {
                CadminApi.showToast("danger", "Copy failed.");
            });
        });

        $root.on("click.oidc-client", "#ocd-secret-regen", function () {
            CadminApi.confirm({
                title: "Regenerate this client secret?",
                text: "Existing applications using the current secret will stop authenticating.",
                confirmText: "Regenerate",
                danger: true
            }).done(function () {
                CadminApi.post("/api/auth/clients/" + encodeURIComponent(client.id) + "/secret").done(function (updated) {
                    CadminApi.showToast("success", "Secret regenerated.");
                    paint(updated);
                }).fail(function (xhr) {
                    const message = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error))
                        || "Failed to regenerate secret";
                    CadminApi.showAlert("#ocd-alert", "danger", message);
                });
            });
        });

        $root.on("click.oidc-client", "#ocd-assign", function () {
            const organizationId = CadminApi.selectValue("#ocd-organization");
            if (!organizationId) {
                CadminApi.showToast("danger", "Select an organization.");
                return;
            }
            const $button = $(this).prop("disabled", true);
            assignToOrganization(subject, organizationId).done(function () {
                CadminApi.showToast("success", "Organization linked.");
                render(client.id);
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Link failed" + (xhr && xhr.status ? " (" + xhr.status + ")" : "") + ".");
            }).always(function () {
                $button.prop("disabled", false);
            });
        });

        $root.on("click.oidc-client", "#ocd-unassign", function () {
            const $button = $(this).prop("disabled", true);
            assignToOrganization(subject, "").done(function () {
                CadminApi.showToast("success", "Organization link removed.");
                render(client.id);
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Unlink failed" + (xhr && xhr.status ? " (" + xhr.status + ")" : "") + ".");
            }).always(function () {
                $button.prop("disabled", false);
            });
        });

        function showTokenStep(step) {
            CadminApi.showAlert("#ocd-token-alert");
            $("#ocd-token-modal [data-ocd-token-pane]").addClass("d-none");
            $("#ocd-token-modal [data-ocd-token-pane=\"" + step + "\"]").removeClass("d-none");
            $("#ocd-token-steps .npi-wizard-step").each(function () {
                const value = Number($(this).attr("data-ocd-token-step"));
                $(this).toggleClass("active", value === step);
                $(this).toggleClass("done", value < step);
            });
            $("#ocd-token-cancel").toggleClass("d-none", step !== 1);
            $("#ocd-token-back").toggleClass("d-none", step !== 2);
            $("#ocd-token-next").toggleClass("d-none", step !== 1);
            $("#ocd-token-copy, #ocd-token-copy-bearer").toggleClass("d-none", step !== 2);
        }

        function resetTokenWizard() {
            $("#ocd-token-client-id").val(client.clientId || "");
            $("#ocd-token-secret").val(client.secret || "").attr("type", "password");
            $("#ocd-token-secret-toggle").text("Show");
            $("#ocd-token-scope").val(defaultTokenScope(client));
            $("#ocd-token-access, #ocd-token-bearer").val("");
            $("#ocd-token-result-client, #ocd-token-type, #ocd-token-expires, #ocd-token-granted-scope").text("—");
            $("#ocd-token-claims-wrap").addClass("d-none");
            $("#ocd-token-claims").text("");
            showTokenStep(1);
        }

        function openTokenWizard() {
            const el = document.getElementById("ocd-token-modal");
            if (!el) {
                CadminApi.showToast("danger", "Public clients cannot request a client-credentials token.");
                return;
            }
            resetTokenWizard();
            bootstrap.Modal.getOrCreateInstance(el).show();
        }

        function paintTokenResult(body) {
            const token = (body && body.accessToken) || "";
            const bearer = (body && body.bearer) || ((body && body.tokenType) || "Bearer") + " " + token;
            $("#ocd-token-result-client").html(body && body.clientId
                ? "<code>" + esc(body.clientId) + "</code>"
                : "—");
            $("#ocd-token-type").text((body && body.tokenType) || "Bearer");
            $("#ocd-token-expires").text(formatExpires(body || {}));
            $("#ocd-token-granted-scope").text((body && body.scope) || "—");
            $("#ocd-token-access").val(token);
            $("#ocd-token-bearer").val("Authorization: " + bearer);
            const claims = decodeJwt(token);
            if (claims) {
                $("#ocd-token-claims-wrap").removeClass("d-none");
                $("#ocd-token-claims").text(JSON.stringify(claims, null, 2));
            } else {
                $("#ocd-token-claims-wrap").addClass("d-none");
            }
            showTokenStep(2);
        }

        $root.on("click.oidc-client", "#ocd-token-open, #ocd-token-open-card", openTokenWizard);
        $root.on("click.oidc-client", "#ocd-token-secret-toggle", function () {
            const $input = $("#ocd-token-secret");
            const hidden = $input.attr("type") === "password";
            $input.attr("type", hidden ? "text" : "password");
            $(this).text(hidden ? "Hide" : "Show");
        });
        $root.on("click.oidc-client", "#ocd-token-back", function () {
            showTokenStep(1);
        });
        $root.on("click.oidc-client", "#ocd-token-copy", function () {
            copyText($("#ocd-token-access").val(), "Access token");
        });
        $root.on("click.oidc-client", "#ocd-token-copy-bearer", function () {
            copyText($("#ocd-token-bearer").val(), "Authorization header");
        });
        $root.on("click.oidc-client", "#ocd-token-next", function () {
            const clientId = $("#ocd-token-client-id").val().trim();
            const clientSecret = $("#ocd-token-secret").val();
            if (!clientId || !clientSecret) {
                CadminApi.showAlert("#ocd-token-alert", "danger",
                    "Client ID and secret are required to request a token.");
                return;
            }
            const $next = $("#ocd-token-next").prop("disabled", true);
            CadminApi.showAlert("#ocd-token-alert");
            CadminApi.post("/api/auth/token", {
                grantType: "client_credentials",
                clientId: clientId,
                clientSecret: clientSecret,
                scope: $("#ocd-token-scope").val()
            }, { skipAuthRedirect: true }).done(function (body) {
                paintTokenResult(body || {});
                CadminApi.showToast("success", "Access token received.");
            }).fail(function (xhr) {
                const message = (xhr && xhr.responseJSON && (xhr.responseJSON.detail
                    || xhr.responseJSON.message || xhr.responseJSON.error))
                    || (xhr && (xhr.status === 400 || xhr.status === 401)
                        ? "Keycloak rejected the credentials."
                        : xhr && xhr.status === 502
                            ? "Could not reach Keycloak. Is it running on port 8180?"
                            : "Token request failed.");
                CadminApi.showAlert("#ocd-token-alert", "danger", message);
            }).always(function () {
                $next.prop("disabled", false);
            });
        });

        $root.on("click.oidc-client", "#ocd-delete", function () {
            CadminApi.confirm({
                title: "Delete this OIDC client?",
                text: client.clientId + " will be removed from Keycloak.",
                confirmText: "Delete",
                danger: true
            }).done(function () {
                CadminApi.delete("/api/auth/clients/" + encodeURIComponent(client.id)).done(function () {
                    CadminApi.showToast("success", "Client deleted.");
                    window.location.hash = "#/oidc-clients";
                }).fail(function (xhr) {
                    const message = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error))
                        || "Failed to delete client";
                    CadminApi.showAlert("#ocd-alert", "danger", message);
                });
            });
        });
    }

    return { render: render };
}());
