package io.cadmin.gateway.keycloak;

import static org.assertj.core.api.Assertions.assertThat;

import io.cadmin.gateway.config.CadminProperties;
import io.cadmin.gateway.keycloak.KeycloakUserService.KeycloakUserRepresentation;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class KeycloakUserServiceTest {

    @Test
    void parsesServerAndRealmFromIssuer() {
        CadminProperties.Keycloak keycloak = new CadminProperties.Keycloak(
                "http://localhost:8180/realms/cadmin/",
                "cadmin-gateway",
                "secret");

        assertThat(keycloak.serverUri()).isEqualTo("http://localhost:8180");
        assertThat(keycloak.realm()).isEqualTo("cadmin");
    }

    @Test
    void hidesServiceAccounts() {
        assertThat(KeycloakUserService.isServiceAccount(new KeycloakUserRepresentation(
                "1", "service-account-cadmin-gateway", null, null, null, true, null))).isTrue();
        assertThat(KeycloakUserService.isServiceAccount(new KeycloakUserRepresentation(
                "2", "gateway", null, null, null, true, "cadmin-gateway"))).isTrue();
        assertThat(KeycloakUserService.isServiceAccount(new KeycloakUserRepresentation(
                "3", "admin", "Cadmin", "Admin", "admin@cadmin.local", true, null))).isFalse();
    }

    @Test
    void mapsDisplayFieldsAndFiltersDefaultRoles() {
        KeycloakUserRepresentation user = new KeycloakUserRepresentation(
                "abc", "admin", "Cadmin", "Admin", "admin@cadmin.local", true, null);

        Map<String, Object> row = KeycloakUserService.toRow(
                user, List.of("admin", "user", "offline_access", "default-roles-cadmin"));

        assertThat(row.get("username")).isEqualTo("admin");
        assertThat(row.get("id")).isEqualTo("abc");
        assertThat(row.get("oidcId")).isEqualTo("abc");
        assertThat(row.get("displayName")).isEqualTo("Cadmin Admin");
        assertThat(row.get("email")).isEqualTo("admin@cadmin.local");
        assertThat(row.get("enabled")).isEqualTo(true);
        assertThat(row.get("roles")).isEqualTo(List.of("admin", "user"));
        assertThat(KeycloakUserService.keepRole("admin")).isTrue();
        assertThat(KeycloakUserService.keepRole("offline_access")).isFalse();
        assertThat(KeycloakUserService.keepRole("default-roles-cadmin")).isFalse();
    }

    @Test
    void displayNameFallsBackToUsername() {
        assertThat(KeycloakUserService.displayName(new KeycloakUserRepresentation(
                "1", "clinician", "", "", null, true, null))).isEqualTo("clinician");
    }

    @Test
    void normalizesAndValidatesCreateRequest() {
        KeycloakUserService.CreateUserRequest request = KeycloakUserService.normalize(
                new KeycloakUserService.CreateUserRequest(
                        " Jane ", " Doe ", "Jane@Example.com", "(555) 010-1234", "jane.doe"));

        assertThat(request.firstName()).isEqualTo("Jane");
        assertThat(request.lastName()).isEqualTo("Doe");
        assertThat(request.email()).isEqualTo("jane@example.com");
        assertThat(request.mobile()).isEqualTo("5550101234");
        assertThat(request.username()).isEqualTo("jane.doe");
        assertThat(KeycloakUserService.validate(request)).isNull();
        assertThat(KeycloakUserService.validate(new KeycloakUserService.CreateUserRequest(
                "", "Doe", "", "", "jane"))).contains("required");
        assertThat(KeycloakUserService.validate(new KeycloakUserService.CreateUserRequest(
                "Jane", "Doe", "not-an-email", "", "jane"))).contains("Email");
    }

    @Test
    void readsMobileFromUserAttributes() {
        KeycloakUserRepresentation user = new KeycloakUserRepresentation(
                "abc", "jane", "Jane", "Doe", "jane@example.com", true, null,
                Map.of("mobile", List.of("5550101234")));

        Map<String, Object> row = KeycloakUserService.toRow(user, List.of("user"));

        assertThat(KeycloakUserService.mobileOf(user)).isEqualTo("5550101234");
        assertThat(row.get("mobile")).isEqualTo("5550101234");
        assertThat(KeycloakUserService.userIdFromLocation(
                "http://localhost:8180/admin/realms/cadmin/users/abc-123")).isEqualTo("abc-123");
        assertThat(KeycloakUserService.allAvailable(Map.of(
                "username", true, "email", false, "mobile", true))).isFalse();
    }
}
