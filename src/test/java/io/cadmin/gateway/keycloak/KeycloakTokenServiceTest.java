package io.cadmin.gateway.keycloak;

import static org.assertj.core.api.Assertions.assertThat;

import io.cadmin.gateway.config.CadminProperties;
import io.cadmin.gateway.keycloak.KeycloakTokenService.KeycloakError;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

class KeycloakTokenServiceTest {

    @Test
    void mapsPasswordGrantResponse() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request -> {
            assertThat(request.url().getPath()).isEqualTo("/realms/cadmin/protocol/openid-connect/token");
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header("Content-Type", "application/json")
                    .body("""
                            {
                              "access_token": "access-abc",
                              "token_type": "Bearer",
                              "expires_in": 3600,
                              "refresh_token": "refresh-abc",
                              "refresh_expires_in": 43200,
                              "id_token": "id-abc",
                              "scope": "openid profile email"
                            }
                            """)
                    .build());
        });
        KeycloakTokenService service = new KeycloakTokenService(properties(), builder);

        KeycloakTokenService.IssuedToken token = service.passwordGrant("admin", "admin", "openid profile").block();

        assertThat(token.accessToken()).isEqualTo("access-abc");
        assertThat(token.tokenType()).isEqualTo("Bearer");
        assertThat(token.expiresIn()).isEqualTo(3600);
        assertThat(token.expiresAt()).isNotNull();
        assertThat(token.refreshToken()).isEqualTo("refresh-abc");
        assertThat(token.idToken()).isEqualTo("id-abc");
        assertThat(token.scope()).isEqualTo("openid profile email");
        assertThat(token.bearer()).isEqualTo("Bearer access-abc");
        assertThat(token.issuer()).isEqualTo("http://localhost:8180/realms/cadmin");
        assertThat(token.clientId()).isEqualTo("cadmin-gateway");
        assertThat(token.grantType()).isEqualTo("password");
    }

    @Test
    void mapsClientCredentialsGrantAndFallsBackToConfiguredSecret() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request ->
                Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header("Content-Type", "application/json")
                        .body("""
                                {
                                  "access_token": "m2m-abc",
                                  "token_type": "Bearer",
                                  "expires_in": 300,
                                  "scope": "profile"
                                }
                                """)
                        .build()));
        KeycloakTokenService service = new KeycloakTokenService(properties(), builder);

        KeycloakTokenService.IssuedToken token = service.issue(new KeycloakTokenService.GrantRequest(
                "client_credentials", null, null, null, null, null)).block();

        assertThat(token.accessToken()).isEqualTo("m2m-abc");
        assertThat(token.grantType()).isEqualTo("client_credentials");
        assertThat(token.clientId()).isEqualTo("cadmin-gateway");
        assertThat(token.refreshToken()).isNull();
        assertThat(token.idToken()).isNull();
        assertThat(service.resolveClient(null, null).id()).isEqualTo("cadmin-gateway");
        assertThat(service.resolveClient("other-client", null)).isNull();
        assertThat(service.resolveClient("other-client", "secret").id()).isEqualTo("other-client");
    }

    @Test
    void rejectsUnknownGrantAndMissingClientSecret() {
        KeycloakTokenService service = new KeycloakTokenService(properties(), WebClient.builder());
        try {
            service.issue(new KeycloakTokenService.GrantRequest(
                    "refresh_token", null, null, null, null, null)).block();
            throw new AssertionError("expected unknown grant");
        }
        catch (ResponseStatusException ex) {
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }
        try {
            service.clientCredentialsGrant("other-client", "  ", null).block();
        }
        catch (ResponseStatusException ex) {
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            return;
        }
        throw new AssertionError("expected missing client secret");
    }

    @Test
    void mapsInvalidGrantToBadRequest() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request ->
                Mono.just(ClientResponse.create(HttpStatus.BAD_REQUEST)
                        .header("Content-Type", "application/json")
                        .body("""
                                {"error":"invalid_grant","error_description":"Invalid user credentials"}
                                """)
                        .build()));
        KeycloakTokenService service = new KeycloakTokenService(properties(), builder);

        try {
            service.passwordGrant("admin", "wrong", null).block();
        }
        catch (ResponseStatusException ex) {
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(ex.getReason()).isEqualTo("Invalid user credentials");
            return;
        }
        throw new AssertionError("expected bad request");
    }

    @Test
    void rejectsBlankUsername() {
        KeycloakTokenService service = new KeycloakTokenService(properties(), WebClient.builder());
        try {
            service.passwordGrant("  ", "admin", null).block();
        }
        catch (ResponseStatusException ex) {
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            return;
        }
        throw new AssertionError("expected bad request");
    }

    @Test
    void mapsKeycloakErrorMessage() {
        assertThat(KeycloakTokenService.mapErrorStatus(HttpStatus.BAD_REQUEST)).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(KeycloakTokenService.mapErrorStatus(HttpStatus.UNAUTHORIZED)).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(KeycloakTokenService.mapErrorStatus(HttpStatus.FORBIDDEN)).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(KeycloakTokenService.mapErrorStatus(HttpStatus.INTERNAL_SERVER_ERROR))
                .isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(KeycloakTokenService.errorMessage(
                new KeycloakError("invalid_grant", "Invalid user credentials"),
                HttpStatus.BAD_REQUEST)).isEqualTo("Invalid user credentials");
        assertThat(KeycloakTokenService.errorMessage(
                new KeycloakError("unauthorized_client", null),
                HttpStatus.UNAUTHORIZED)).isEqualTo("unauthorized_client");
        assertThat(KeycloakTokenService.errorMessage(
                new KeycloakError(null, null),
                HttpStatus.BAD_GATEWAY)).isEqualTo("Keycloak token request failed.");
    }

    private static CadminProperties properties() {
        return new CadminProperties(
                new CadminProperties.Security("local", java.util.List.of()),
                new CadminProperties.Fhir("http://localhost:8081"),
                new CadminProperties.Geocode(
                        "https://nominatim.openstreetmap.org",
                        "test"),
                new CadminProperties.NpiRegistry(
                        "https://npiregistry.cms.hhs.gov/api/",
                        "2.1"),
                new CadminProperties.Wiremock("http://localhost:9090"),
                new CadminProperties.CoreAdminBridge("http://localhost:8280"),
                new CadminProperties.FhirChief("http://localhost:8380"),
                new CadminProperties.Icg("http://localhost:8480"),
                new CadminProperties.Keycloak(
                        "http://localhost:8180/realms/cadmin",
                        "cadmin-gateway",
                        "cadmin-gateway-secret"));
    }
}
