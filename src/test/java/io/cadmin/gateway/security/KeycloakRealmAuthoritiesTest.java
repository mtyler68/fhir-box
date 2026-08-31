package io.cadmin.gateway.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;

class KeycloakRealmAuthoritiesTest {

    @Test
    void mapsKeycloakAdminRoleFromAccessToken() {
        OidcIdToken idToken = new OidcIdToken(
                "id-token",
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(3600),
                Map.of("sub", "admin", "preferred_username", "admin")
        );
        DefaultOidcUser user = new DefaultOidcUser(List.of(), idToken, "preferred_username");
        OAuth2AccessToken accessToken = new OAuth2AccessToken(
                OAuth2AccessToken.TokenType.BEARER,
                jwt(Map.of("realm_access", Map.of("roles", List.of("admin", "user", "offline_access")))),
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(3600)
        );

        List<String> authorities = KeycloakRealmAuthorities.merge(user, accessToken).stream()
                .map(GrantedAuthority::getAuthority)
                .toList();

        assertThat(authorities).contains("ROLE_ADMIN", "ROLE_USER");
        assertThat(authorities).doesNotContain("ROLE_OFFLINE_ACCESS");
    }

    @Test
    void mapsAdminFromIdTokenRealmAccess() {
        OidcIdToken idToken = new OidcIdToken(
                "id-token",
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(3600),
                Map.of(
                        "sub", "admin",
                        "preferred_username", "admin",
                        "realm_access", Map.of("roles", List.of("admin"))
                )
        );
        DefaultOidcUser user = new DefaultOidcUser(List.of(), idToken, "preferred_username");

        assertThat(KeycloakRealmAuthorities.toSpringRole("admin")).isEqualTo("ROLE_ADMIN");
        assertThat(KeycloakRealmAuthorities.roleNames(user, null)).contains("admin");
    }

    private static String jwt(Map<String, Object> claims) {
        try {
            String header = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
            String payload = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(jwtClaimsJson(claims).getBytes(StandardCharsets.UTF_8));
            return header + "." + payload + ".sig";
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String jwtClaimsJson(Map<String, Object> claims) {
        StringBuilder json = new StringBuilder("{\"realm_access\":{\"roles\":[");
        Object realmAccess = claims.get("realm_access");
        if (realmAccess instanceof Map<?, ?> map && map.get("roles") instanceof List<?> roles) {
            for (int i = 0; i < roles.size(); i += 1) {
                if (i > 0) {
                    json.append(',');
                }
                json.append('"').append(roles.get(i)).append('"');
            }
        }
        json.append("]}}");
        return json.toString();
    }
}
