CadminApp.register("oidc-token", function () {
    const config = CadminApp.config() || {};
    const user = CadminApp.user() || {};
    const configuredClient = config.keycloakClientId || "cadmin-gateway";
    const passwordScope = "openid profile email";
    const m2mScope = "icg icg.admin";
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            "<div>" +
                '<h1 class="h3 mb-1 page-title">OIDC token</h1>' +
                '<p class="text-muted mb-0">Exchange Keycloak credentials for an access token to use as a Bearer header.</p>' +
            "</div>" +
        "</div>" +
        '<div id="oidc-token-alert" class="alert d-none"></div>' +
        '<div class="row">' +
            '<div class="col-lg-5">' +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3"><h6 class="m-0">Keycloak</h6></div>' +
                    '<div class="card-body">' +
                        '<dl class="row mb-0">' +
                            '<dt class="col-sm-4">Issuer</dt><dd class="col-sm-8"><code id="oidc-issuer"></code></dd>' +
                            '<dt class="col-sm-4">Realm</dt><dd class="col-sm-8"><code id="oidc-realm"></code></dd>' +
                            '<dt class="col-sm-4">Box client</dt><dd class="col-sm-8"><code id="oidc-client"></code></dd>' +
                        "</dl>" +
                    "</div>" +
                "</div>" +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3"><h6 class="m-0">Credentials</h6></div>' +
                    '<div class="card-body">' +
                        '<form id="oidc-token-form">' +
                            '<fieldset class="mb-3">' +
                                '<legend class="form-label fs-6">Grant</legend>' +
                                '<div class="form-check">' +
                                    '<input class="form-check-input" type="radio" name="oidc-grant" id="oidc-grant-password" ' +
                                        'value="password" checked>' +
                                    '<label class="form-check-label" for="oidc-grant-password">User password</label>' +
                                "</div>" +
                                '<div class="form-check">' +
                                    '<input class="form-check-input" type="radio" name="oidc-grant" id="oidc-grant-client" ' +
                                        'value="client_credentials">' +
                                    '<label class="form-check-label" for="oidc-grant-client">Client credentials (M2M)</label>' +
                                "</div>" +
                            "</fieldset>" +
                            '<div id="oidc-user-fields">' +
                                '<div class="mb-3">' +
                                    '<label class="form-label" for="oidc-username">Username</label>' +
                                    '<input class="form-control" id="oidc-username" name="username" autocomplete="username">' +
                                "</div>" +
                                '<div class="mb-3">' +
                                    '<label class="form-label" for="oidc-password">Password</label>' +
                                    '<input class="form-control" id="oidc-password" name="password" type="password" ' +
                                        'autocomplete="current-password">' +
                                "</div>" +
                            "</div>" +
                            '<div id="oidc-client-fields" class="d-none">' +
                                '<div class="form-check mb-3">' +
                                    '<input class="form-check-input" type="checkbox" id="oidc-use-box-client" checked>' +
                                    '<label class="form-check-label" for="oidc-use-box-client">' +
                                        "Use configured FHIR Box client</label>" +
                                "</div>" +
                                '<div class="mb-3">' +
                                    '<label class="form-label" for="oidc-client-id">Client ID</label>' +
                                    '<input class="form-control" id="oidc-client-id" name="clientId" autocomplete="off">' +
                                "</div>" +
                                '<div class="mb-3" id="oidc-secret-wrap">' +
                                    '<label class="form-label" for="oidc-client-secret">Client secret</label>' +
                                    '<input class="form-control" id="oidc-client-secret" name="clientSecret" type="password" ' +
                                        'autocomplete="off">' +
                                    '<div class="form-text">Leave blank to use the configured Box client secret.</div>' +
                                "</div>" +
                            "</div>" +
                            '<div class="mb-3">' +
                                '<label class="form-label" for="oidc-scope">Scope</label>' +
                                '<input class="form-control" id="oidc-scope" name="scope" value="openid profile email">' +
                                '<div class="form-text" id="oidc-scope-help">' +
                                    "Leave blank to use the client default scopes.</div>" +
                            "</div>" +
                            '<button class="btn btn-primary" type="submit" id="oidc-submit">' +
                                '<i class="bi bi-key me-1"></i>Request token</button>' +
                        "</form>" +
                    "</div>" +
                "</div>" +
            "</div>" +
            '<div class="col-lg-7">' +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                        '<h6 class="m-0">Access token</h6>' +
                        '<div class="d-flex flex-wrap gap-2">' +
                            '<button class="btn btn-sm btn-outline-secondary" type="button" id="oidc-copy-token" disabled>' +
                                '<i class="bi bi-clipboard me-1"></i>Copy token</button>' +
                            '<button class="btn btn-sm btn-outline-primary" type="button" id="oidc-copy-bearer" disabled>' +
                                '<i class="bi bi-clipboard-plus me-1"></i>Copy Bearer header</button>' +
                        "</div>" +
                    "</div>" +
                    '<div class="card-body">' +
                        '<p class="text-muted mb-3" id="oidc-token-empty">Submit Keycloak credentials to request a token.</p>' +
                        '<div id="oidc-token-result" class="d-none">' +
                            '<dl class="row">' +
                                '<dt class="col-sm-3">Grant</dt><dd class="col-sm-9" id="oidc-grant-label">—</dd>' +
                                '<dt class="col-sm-3">Client</dt><dd class="col-sm-9" id="oidc-result-client">—</dd>' +
                                '<dt class="col-sm-3">Type</dt><dd class="col-sm-9" id="oidc-type">—</dd>' +
                                '<dt class="col-sm-3">Expires</dt><dd class="col-sm-9" id="oidc-expires">—</dd>' +
                                '<dt class="col-sm-3">Scope</dt><dd class="col-sm-9" id="oidc-granted-scope">—</dd>' +
                            "</dl>" +
                            '<label class="form-label" for="oidc-access-token">Access token</label>' +
                            '<textarea class="form-control font-monospace mb-3" id="oidc-access-token" rows="6" readonly></textarea>' +
                            '<label class="form-label" for="oidc-bearer">Authorization header</label>' +
                            '<textarea class="form-control font-monospace mb-3" id="oidc-bearer" rows="3" readonly></textarea>' +
                            '<label class="form-label" for="oidc-curl">curl example</label>' +
                            '<textarea class="form-control font-monospace mb-0" id="oidc-curl" rows="4" readonly></textarea>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
                '<div class="card shadow mb-4 d-none" id="oidc-claims-card">' +
                    '<div class="card-header py-3"><h6 class="m-0">JWT claims</h6></div>' +
                    '<div class="card-body">' +
                        '<pre class="mb-0 small" id="oidc-claims"></pre>' +
                    "</div>" +
                "</div>" +
                '<div class="card shadow mb-4 d-none" id="oidc-extra-card">' +
                    '<div class="card-header py-3"><h6 class="m-0">Additional tokens</h6></div>' +
                    '<div class="card-body">' +
                        '<label class="form-label" for="oidc-refresh-token">Refresh token</label>' +
                        '<textarea class="form-control font-monospace mb-3" id="oidc-refresh-token" rows="3" readonly></textarea>' +
                        '<label class="form-label" for="oidc-id-token">ID token</label>' +
                        '<textarea class="form-control font-monospace mb-0" id="oidc-id-token" rows="3" readonly></textarea>' +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>"
    );

    $("#oidc-issuer").text(config.keycloakIssuer || "—");
    $("#oidc-realm").text(config.keycloakRealm || "—");
    $("#oidc-client").text(configuredClient);
    $("#oidc-username").val(user.username || "");
    $("#oidc-client-id").val(configuredClient);

    function grantType() {
        return $("input[name='oidc-grant']:checked").val() || "password";
    }

    function useBoxClient() {
        return $("#oidc-use-box-client").is(":checked");
    }

    function syncGrantFields() {
        const m2m = grantType() === "client_credentials";
        $("#oidc-user-fields").toggleClass("d-none", m2m);
        $("#oidc-client-fields").toggleClass("d-none", !m2m);
        $("#oidc-username, #oidc-password").prop("required", !m2m);
        const configured = useBoxClient();
        $("#oidc-client-id").prop("readonly", configured);
        $("#oidc-secret-wrap").toggleClass("d-none", configured);
        $("#oidc-client-secret").prop("required", m2m && !configured);
        if (configured) {
            $("#oidc-client-id").val(configuredClient);
            $("#oidc-client-secret").val("");
        }
        const $scope = $("#oidc-scope");
        const current = $scope.val();
        if (m2m && (current === passwordScope || current === "openid profile email")) {
            $scope.val(m2mScope);
        }
        else if (!m2m && (current === m2mScope || current === "")) {
            $scope.val(passwordScope);
        }
        $("#oidc-scope-help").text(m2m
            ? "Request icg for routes and icg.admin for /status. Leave blank for client defaults."
            : "Include icg so the token can call ICG routes. Box admins can still use /status via ROLE_ADMIN.");
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
        }
        catch (ex) {
            CadminApi.showToast("danger", "Could not copy to the clipboard.");
        }
        document.body.removeChild(field);
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
        }
        catch (ex) {
            return null;
        }
    }

    function formatExpires(body) {
        if (body.expiresAt) {
            const date = new Date(body.expiresAt);
            if (!isNaN(date.getTime())) {
                const seconds = body.expiresIn != null ? body.expiresIn + "s" : "";
                return date.toLocaleString() + (seconds ? " (" + seconds + ")" : "");
            }
        }
        return body.expiresIn != null ? body.expiresIn + "s" : "—";
    }

    function grantLabel(value) {
        return value === "client_credentials" ? "Client credentials (M2M)" : "User password";
    }

    function paint(body) {
        const token = body.accessToken || "";
        const bearer = body.bearer || ((body.tokenType || "Bearer") + " " + token);
        $("#oidc-token-empty").addClass("d-none");
        $("#oidc-token-result").removeClass("d-none");
        $("#oidc-grant-label").text(grantLabel(body.grantType));
        $("#oidc-result-client").html(body.clientId
            ? "<code>" + CadminApi.escapeHtml(body.clientId) + "</code>"
            : "—");
        $("#oidc-type").text(body.tokenType || "Bearer");
        $("#oidc-expires").text(formatExpires(body));
        $("#oidc-granted-scope").text(body.scope || "—");
        $("#oidc-access-token").val(token);
        $("#oidc-bearer").val("Authorization: " + bearer);
        $("#oidc-curl").val(
            "curl -H 'Authorization: " + bearer + "' \\\n" +
            "  http://localhost:8080/fhir/Patient"
        );
        $("#oidc-copy-token, #oidc-copy-bearer").prop("disabled", !token);
        const claims = decodeJwt(token);
        if (claims) {
            $("#oidc-claims-card").removeClass("d-none");
            $("#oidc-claims").text(JSON.stringify(claims, null, 2));
        }
        else {
            $("#oidc-claims-card").addClass("d-none");
        }
        if (body.refreshToken || body.idToken) {
            $("#oidc-extra-card").removeClass("d-none");
            $("#oidc-refresh-token").val(body.refreshToken || "");
            $("#oidc-id-token").val(body.idToken || "");
        }
        else {
            $("#oidc-extra-card").addClass("d-none");
        }
    }

    function requestBody() {
        const grant = grantType();
        const body = {
            grantType: grant,
            scope: $("#oidc-scope").val()
        };
        if (grant === "client_credentials") {
            body.clientId = useBoxClient() ? configuredClient : $("#oidc-client-id").val();
            if (!useBoxClient()) {
                body.clientSecret = $("#oidc-client-secret").val();
            }
            return body;
        }
        body.username = $("#oidc-username").val();
        body.password = $("#oidc-password").val();
        return body;
    }

    $root.off(".oidc-token");
    $root.on("change.oidc-token", "input[name='oidc-grant'], #oidc-use-box-client", syncGrantFields);
    $root.on("submit.oidc-token", "#oidc-token-form", function (event) {
        event.preventDefault();
        const $btn = $("#oidc-submit").prop("disabled", true);
        CadminApi.showAlert("#oidc-token-alert");
        CadminApi.post("/api/auth/token", requestBody(), { skipAuthRedirect: true }).done(function (body) {
            paint(body || {});
            CadminApi.showToast("success", "Access token received.");
        }).fail(function (xhr) {
            const message = (xhr && xhr.responseJSON && (xhr.responseJSON.detail
                || xhr.responseJSON.message || xhr.responseJSON.error))
                || (xhr && (xhr.status === 400 || xhr.status === 401)
                    ? "Keycloak rejected the credentials."
                    : xhr && xhr.status === 502
                        ? "Could not reach Keycloak. Is it running on port 8180?"
                        : "Token request failed.");
            CadminApi.showAlert("#oidc-token-alert", "danger", message);
        }).always(function () {
            $btn.prop("disabled", false);
        });
    });
    $root.on("click.oidc-token", "#oidc-copy-token", function () {
        copyText($("#oidc-access-token").val(), "Access token");
    });
    $root.on("click.oidc-token", "#oidc-copy-bearer", function () {
        copyText($("#oidc-bearer").val(), "Authorization header");
    });

    syncGrantFields();
});
