package io.cadmin.gateway.keycloak;

import static org.assertj.core.api.Assertions.assertThat;

import io.cadmin.gateway.keycloak.KeycloakClientService.CreateClientRequest;
import io.cadmin.gateway.keycloak.KeycloakClientService.UpdateClientRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class KeycloakClientServiceTest {

    @Test
    void hidesInternalClientsAndProtectsGatewayClients() {
        assertThat(KeycloakClientService.isInternal("account")).isTrue();
        assertThat(KeycloakClientService.isInternal("realm-management")).isTrue();
        assertThat(KeycloakClientService.isInternal("abbott-usa")).isFalse();
        assertThat(KeycloakClientService.isProtected("cadmin-gateway")).isTrue();
        assertThat(KeycloakClientService.isProtected("icg")).isTrue();
        assertThat(KeycloakClientService.isProtected("abbott-usa")).isFalse();
    }

    @Test
    void listsOpenidClientsAndSkipsSaml() {
        assertThat(KeycloakClientService.isListedClient(Map.of(
                "clientId", "abbott-usa",
                "protocol", "openid-connect"))).isTrue();
        assertThat(KeycloakClientService.isListedClient(Map.of(
                "clientId", "account",
                "protocol", "openid-connect"))).isFalse();
        assertThat(KeycloakClientService.isListedClient(Map.of(
                "clientId", "saml-app",
                "protocol", "saml"))).isFalse();
    }

    @Test
    void mapsClientRowAndSubjectSystem() {
        Map<String, Object> client = new LinkedHashMap<>();
        client.put("id", "abc-123");
        client.put("clientId", "abbott-usa");
        client.put("name", "Abbott USA");
        client.put("description", "M2M");
        client.put("enabled", true);
        client.put("serviceAccountsEnabled", true);
        client.put("defaultClientScopes", List.of("icg"));
        client.put("optionalClientScopes", List.of("icg.admin"));

        Map<String, Object> row = KeycloakClientService.toRow(client, "subject-uuid", "s3cret", true);

        assertThat(row.get("id")).isEqualTo("abc-123");
        assertThat(row.get("clientId")).isEqualTo("abbott-usa");
        assertThat(row.get("name")).isEqualTo("Abbott USA");
        assertThat(row.get("subject")).isEqualTo("subject-uuid");
        assertThat(row.get("subjectSystem")).isEqualTo(OidcIdentifiers.SUBJECT_SYSTEM);
        assertThat(row.get("internal")).isEqualTo(false);
        assertThat(row.get("secret")).isEqualTo("s3cret");
        assertThat(row.get("defaultClientScopes")).isEqualTo(List.of("icg"));
    }

    @Test
    void marksGatewayClientsInternal() {
        Map<String, Object> row = KeycloakClientService.toRow(
                Map.of("id", "1", "clientId", "cadmin-gateway"), "", "", false);

        assertThat(row.get("internal")).isEqualTo(true);
        assertThat(row.get("name")).isEqualTo("cadmin-gateway");
        assertThat(row.containsKey("secret")).isFalse();
    }

    @Test
    void normalizesAndValidatesCreateRequest() {
        CreateClientRequest request = KeycloakClientService.normalize(
                new CreateClientRequest(" abbott-usa ", " Abbott ", " Partner ", null, List.of("icg"), " "));

        assertThat(request.clientId()).isEqualTo("abbott-usa");
        assertThat(request.name()).isEqualTo("Abbott");
        assertThat(request.serviceAccountsEnabled()).isTrue();
        assertThat(request.secret()).isNull();
        assertThat(KeycloakClientService.validate(request)).isNull();
        assertThat(KeycloakClientService.validate(new CreateClientRequest("", "", "", true, List.of(), null)))
                .contains("required");
        assertThat(KeycloakClientService.validate(new CreateClientRequest(
                "bad id", "", "", true, List.of(), null))).contains("letters");
    }

    @Test
    void applyUpdateChangesOnlyProvidedFields() {
        Map<String, Object> current = new LinkedHashMap<>();
        current.put("clientId", "abbott-usa");
        current.put("name", "Old");
        current.put("redirectUris", List.of("https://example.test"));
        current.put("enabled", true);

        Map<String, Object> next = KeycloakClientService.applyUpdate(
                current, new UpdateClientRequest("New", null, false, List.of("icg")));

        assertThat(next.get("name")).isEqualTo("New");
        assertThat(next.get("enabled")).isEqualTo(false);
        assertThat(next.get("redirectUris")).isEqualTo(List.of("https://example.test"));
        assertThat(next.get("clientId")).isEqualTo("abbott-usa");
    }
}
