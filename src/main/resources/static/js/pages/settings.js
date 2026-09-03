CadminApp.register("settings", function () {
    const user = CadminApp.user() || {};
    const config = CadminApp.config() || {};
    $("#app-content").html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">Settings</h1>' +
        '</div>' +
        '<div class="row">' +
            '<div class="col-lg-6">' +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3"><h6 class="m-0">Security</h6></div>' +
                    '<div class="card-body">' +
                        '<dl class="row mb-0">' +
                            '<dt class="col-sm-4">Mode</dt><dd class="col-sm-8"><code>' + CadminApi.escapeHtml(config.mode) + "</code></dd>" +
                            '<dt class="col-sm-4">Signed in as</dt><dd class="col-sm-8">' + CadminApi.escapeHtml(user.username) + "</dd>" +
                            '<dt class="col-sm-4">Roles</dt><dd class="col-sm-8">' + CadminApi.escapeHtml((user.roles || []).join(", ")) + "</dd>" +
                        "</dl>" +
                        '<hr>' +
                        "<p class=\"small text-muted mb-2\">Change mode with Spring profiles: " +
                        "<code>local</code> (application users) or <code>oidc</code> (Keycloak). " +
                        "See the project README for Docker Compose bootstrap commands.</p>" +
                        (CadminApp.isAdmin()
                            ? '<a class="btn btn-sm btn-outline-primary me-2" href="#/oidc-token">' +
                                '<i class="bi bi-key me-1"></i>Request an OIDC access token</a>' +
                                ((config.mode || "") === "oidc"
                                    ? '<a class="btn btn-sm btn-outline-primary" href="#/oidc-clients">' +
                                        '<i class="bi bi-app me-1"></i>Manage OIDC clients</a>'
                                    : "")
                            : "") +
                    "</div>" +
                "</div>" +
            "</div>" +
            '<div class="col-lg-6">' +
                '<div class="card shadow mb-4">' +
                    '<div class="card-header py-3"><h6 class="m-0">Downstream proxies</h6></div>' +
                    '<div class="card-body">' +
                        "<p>FHIR Box serves the UI and proxies browser calls so exploration stays same-origin.</p>" +
                        '<ul class="mb-0">' +
                            "<li><code>/fhir/**</code> → HAPI FHIR JPA Starter (<code>cadmin.fhir.uri</code>)</li>" +
                            "<li><code>/wiremock/**</code> → WireMock (<code>cadmin.wiremock.uri</code>)</li>" +
                            "<li><code>/core-admin-bridge/**</code> → Core Admin Bridge (<code>cadmin.core-admin-bridge.uri</code>)</li>" +
                            "<li><code>/fhir-chief/**</code> → FHIR Chief (<code>cadmin.fhir-chief.uri</code>)</li>" +
                            "<li><code>/icg/**</code> → Integrator Connect Gateway (<code>cadmin.icg.uri</code>)</li>" +
                            "<li><code>/api/**</code> → gateway JSON endpoints</li>" +
                        "</ul>" +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>"
    );
});
