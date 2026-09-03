CadminApp.register("users", function () {
    const oidc = (CadminApp.config() || {}).mode === "oidc";
    const $root = $("#app-content");
    const colCount = oidc ? 7 : 5;
    let usersCache = [];
    let assignments = {};
    let pendingUser = null;

    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Users</h1>' +
            '<button class="btn btn-outline-secondary btn-sm" type="button" id="users-refresh">' +
                '<i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>Refresh</button>' +
        "</div>" +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3"><h6 class="m-0">' +
                (oidc ? "Keycloak users" : "Configured local users") +
            "</h6></div>" +
            '<div class="card-body">' +
                '<p class="text-muted">' +
                (oidc
                    ? "Realm accounts loaded from the Keycloak Admin API. Assign a practitioner to store the user's JWT subject as a Practitioner identifier using " +
                        "<code>" + CadminApi.escapeHtml(CadminApi.oidcSubjectSystem()) + "</code>."
                    : "These accounts are managed by the gateway when <code>cadmin.security.mode=local</code>.") +
                "</p>" +
                '<div class="table-responsive">' +
                    '<table class="table align-middle">' +
                        "<thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Status</th><th>Roles</th>" +
                        (oidc ? "<th>Practitioner</th><th></th>" : "") +
                        "</tr></thead>" +
                        '<tbody id="user-rows"><tr><td colspan="' + colCount + '" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>" +
        (oidc
            ? '<div class="modal fade" id="users-assign-modal" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<form class="modal-content" id="users-assign-form">' +
                        '<div class="modal-header"><h5 class="modal-title">Assign practitioner</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                        '<div class="modal-body">' +
                            '<p class="text-muted" id="users-assign-summary"></p>' +
                            '<div class="mb-0"><label class="form-label" for="users-practitioner">Practitioner</label>' +
                                '<select class="form-select" id="users-practitioner">' +
                                    '<option value="">Select practitioner…</option></select></div>' +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Save</button>' +
                        "</div>" +
                    "</form>" +
                "</div>" +
            "</div>"
            : "")
    );

    function dash(value) {
        return value ? CadminApi.escapeHtml(value) : "—";
    }

    function userOidcId(user) {
        return (user && (user.oidcId || user.id)) || "";
    }

    function personName(resource) {
        const name = (resource && resource.name && resource.name[0]) || {};
        const given = (name.given || []).join(" ");
        return [given, name.family].filter(Boolean).join(" ") || (resource && resource.id) || "Unnamed";
    }

    function practitionerCell(user) {
        const oidcId = userOidcId(user);
        const linked = oidcId && assignments[oidcId];
        if (!linked) {
            return "—";
        }
        return CadminApi.resourceLink(CadminApi.detailHref("Practitioner", linked.id), linked.name);
    }

    function renderRows(users) {
        usersCache = users || [];
        if (!usersCache.length) {
            $("#user-rows").html(
                '<tr><td colspan="' + colCount + '" class="text-muted">' +
                    (oidc ? "No Keycloak users were returned." : "No local users are configured.") +
                "</td></tr>"
            );
            return;
        }
        $("#user-rows").html(usersCache.map(function (user, index) {
            const enabled = user.enabled !== false;
            const roles = (user.roles || []).map(function (role) {
                return '<span class="badge text-bg-primary me-1">' + CadminApi.escapeHtml(role) + "</span>";
            }).join(" ") || "—";
            const oidcId = userOidcId(user);
            const linked = oidc && oidcId && assignments[oidcId];
            const assignCell = oidc
                ? "<td>" + practitionerCell(user) + "</td>" +
                    '<td class="text-end">' +
                        '<button class="btn btn-sm btn-outline-primary" type="button" data-assign="' + index + '"' +
                        (oidcId ? "" : " disabled") + ">" +
                        (linked ? "Change" : "Assign") + "</button></td>"
                : "";
            return "<tr><td>" + dash(user.username) + "</td><td>" +
                dash(user.displayName) + "</td><td>" + dash(user.email) +
                '</td><td><span class="badge ' + (enabled ? "text-bg-success" : "text-bg-secondary") + '">' +
                (enabled ? "Enabled" : "Disabled") + "</span></td><td>" + roles + "</td>" + assignCell + "</tr>";
        }).join(""));
    }

    function loadAssignments(users) {
        assignments = {};
        if (!oidc || !users || !users.length) {
            return $.Deferred().resolve().promise();
        }
        return CadminApi.findByOidcSubject("Practitioner").then(function (practitioners) {
            (practitioners || []).forEach(function (practitioner) {
                (practitioner.identifier || []).forEach(function (identifier) {
                    if (CadminApi.isOidcSubjectIdentifier(identifier) && identifier.value) {
                        assignments[identifier.value] = {
                            id: practitioner.id,
                            name: personName(practitioner)
                        };
                    }
                });
            });
        }, function () {
            assignments = {};
        });
    }

    function load() {
        $("#user-rows").html('<tr><td colspan="' + colCount + '" class="text-muted">Loading…</td></tr>');
        CadminApi.get("/api/auth/users").done(function (users) {
            loadAssignments(users).always(function () {
                renderRows(users);
            });
        }).fail(function (xhr) {
            const message = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error))
                || xhr.statusText
                || "Failed to load users";
            $("#user-rows").html(
                '<tr><td colspan="' + colCount + '" class="text-danger">' + CadminApi.escapeHtml(message) + "</td></tr>"
            );
        });
    }

    function hideAssignModal() {
        const el = document.getElementById("users-assign-modal");
        const modal = el && bootstrap.Modal.getInstance(el);
        if (modal) {
            modal.hide();
        }
    }

    function findCurrentPractitioners(oidcId) {
        return CadminApi.findByOidcSubject("Practitioner", oidcId);
    }

    function putPractitioner(practitioner) {
        return CadminApi.fhir("/Practitioner/" + encodeURIComponent(practitioner.id), "PUT", practitioner);
    }

    function assignToPractitioner(user, practitionerId) {
        const oidcId = userOidcId(user);
        return findCurrentPractitioners(oidcId).then(function (current) {
            let chain = $.Deferred().resolve().promise();
            (current || []).forEach(function (practitioner) {
                if (practitioner.id === practitionerId) {
                    return;
                }
                CadminApi.removeOidcSubjectIdentifier(practitioner, oidcId);
                chain = chain.then(function () { return putPractitioner(practitioner); });
            });
            if (!practitionerId) {
                return chain;
            }
            const already = (current || []).some(function (practitioner) {
                return practitioner.id === practitionerId;
            });
            if (already) {
                return chain;
            }
            return chain.then(function () {
                return CadminApi.fhir("/Practitioner/" + encodeURIComponent(practitionerId)).then(function (practitioner) {
                    CadminApi.upsertOidcSubjectIdentifier(practitioner, oidcId);
                    return putPractitioner(practitioner);
                });
            });
        });
    }

    if (oidc) {
        $root.on("click", "[data-assign]", function () {
            const index = Number($(this).attr("data-assign"));
            pendingUser = usersCache[index];
            if (!pendingUser || !userOidcId(pendingUser)) {
                CadminApi.showToast("danger", "This user has no OIDC subject id.");
                return;
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById("users-assign-modal")).show();
        });

        $("#users-assign-modal").on("show.bs.modal", function () {
            const user = pendingUser || {};
            const oidcId = userOidcId(user);
            const linked = assignments[oidcId];
            $("#users-assign-summary").html(
                "Link <strong>" + CadminApi.escapeHtml(user.displayName || user.username || "user") +
                "</strong> using JWT subject <code>" + CadminApi.escapeHtml(oidcId) + "</code>."
            );
            CadminApi.bindPractitionerSelect("#users-practitioner", {
                placeholder: "Select practitioner…",
                selectedId: linked ? linked.id : "",
                selectedLabel: linked ? linked.name : ""
            });
        });

        $("#users-assign-modal").on("hidden.bs.modal", function () {
            CadminApi.destroySelect("#users-practitioner");
            pendingUser = null;
        });

        $("#users-assign-form").on("submit", function (event) {
            event.preventDefault();
            const user = pendingUser;
            if (!user) {
                return;
            }
            const practitionerId = CadminApi.selectValue("#users-practitioner");
            const $submit = $(this).find('[type="submit"]').prop("disabled", true);
            assignToPractitioner(user, practitionerId).done(function () {
                hideAssignModal();
                CadminApi.showToast("success", practitionerId
                    ? "User assigned to practitioner."
                    : "Practitioner assignment removed.");
                load();
            }).fail(function (xhr) {
                CadminApi.showToast("danger", "Assignment failed" + (xhr && xhr.status ? " (" + xhr.status + ")" : "") + ".");
            }).always(function () {
                $submit.prop("disabled", false);
            });
        });
    }

    $("#users-refresh").on("click", load);
    load();
});
