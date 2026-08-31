package io.cadmin.gateway.security;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

final class KeycloakRealmAuthorities {

    private KeycloakRealmAuthorities() {
    }

    static Collection<GrantedAuthority> merge(OidcUser user, OAuth2AccessToken accessToken) {
        Set<GrantedAuthority> authorities = new LinkedHashSet<>();
        if (user != null && user.getAuthorities() != null) {
            authorities.addAll(user.getAuthorities());
        }
        roleNames(user, accessToken).stream()
                .map(KeycloakRealmAuthorities::toSpringRole)
                .filter(role -> role != null)
                .map(SimpleGrantedAuthority::new)
                .forEach(authorities::add);
        return authorities;
    }

    static Set<String> roleNames(OidcUser user, OAuth2AccessToken accessToken) {
        Set<String> roles = new LinkedHashSet<>();
        if (user != null) {
            addRealmRoles(roles, user.getClaim("realm_access"));
            addClientRoles(roles, user.getClaim("resource_access"));
            addStringRoles(roles, user.getClaim("roles"));
        }
        if (accessToken != null && accessToken.getTokenValue() != null) {
            Map<String, Object> claims = jwtClaims(accessToken.getTokenValue());
            addRealmRoles(roles, claims.get("realm_access"));
            addClientRoles(roles, claims.get("resource_access"));
            addStringRoles(roles, claims.get("roles"));
        }
        return roles;
    }

    static String toSpringRole(String keycloakRole) {
        if (keycloakRole == null || keycloakRole.isBlank()) {
            return null;
        }
        String name = keycloakRole.trim();
        if (name.regionMatches(true, 0, "ROLE_", 0, 5)) {
            name = name.substring(5);
        }
        if (ignoreRole(name)) {
            return null;
        }
        return "ROLE_" + name.toUpperCase(Locale.ROOT);
    }

    private static boolean ignoreRole(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return "offline_access".equals(lower)
                || "uma_authorization".equals(lower)
                || lower.startsWith("default-roles-");
    }

    private static void addRealmRoles(Set<String> roles, Object realmAccess) {
        if (!(realmAccess instanceof Map<?, ?> map)) {
            return;
        }
        addStringRoles(roles, map.get("roles"));
    }

    private static void addClientRoles(Set<String> roles, Object resourceAccess) {
        if (!(resourceAccess instanceof Map<?, ?> clients)) {
            return;
        }
        clients.values().forEach(value -> addRealmRoles(roles, value));
    }

    private static void addStringRoles(Set<String> roles, Object value) {
        if (value instanceof Collection<?> collection) {
            collection.forEach(item -> {
                if (item != null && !String.valueOf(item).isBlank()) {
                    roles.add(String.valueOf(item));
                }
            });
        } else if (value instanceof String text && !text.isBlank()) {
            roles.add(text);
        }
    }

    private static Map<String, Object> jwtClaims(String token) {
        int first = token.indexOf('.');
        int second = token.indexOf('.', first + 1);
        if (first < 0 || second < 0) {
            return Map.of();
        }
        try {
            String payload = token.substring(first + 1, second);
            byte[] json = Base64.getUrlDecoder().decode(payload);
            return JsonParserFactory.getJsonParser().parseMap(new String(json, StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            return Map.of();
        }
    }
}
