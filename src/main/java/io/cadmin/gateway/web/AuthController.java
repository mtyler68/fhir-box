package io.cadmin.gateway.web;

import io.cadmin.gateway.config.CadminProperties;
import io.cadmin.gateway.keycloak.KeycloakTokenService;
import io.cadmin.gateway.keycloak.KeycloakTokenService.GrantRequest;
import io.cadmin.gateway.keycloak.KeycloakTokenService.IssuedToken;
import io.cadmin.gateway.keycloak.KeycloakUserService;
import io.cadmin.gateway.keycloak.OidcIdentifiers;
import io.cadmin.gateway.keycloak.KeycloakUserService.CreateUserRequest;
import io.cadmin.gateway.keycloak.UserConflictException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.server.csrf.CsrfToken;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(path = "/api/auth", produces = MediaType.APPLICATION_JSON_VALUE)
public class AuthController {

    private final CadminProperties properties;
    private final ObjectProvider<KeycloakUserService> keycloakUsers;
    private final KeycloakTokenService keycloakTokens;

    public AuthController(
            CadminProperties properties,
            ObjectProvider<KeycloakUserService> keycloakUsers,
            KeycloakTokenService keycloakTokens
    ) {
        this.properties = properties;
        this.keycloakUsers = keycloakUsers;
        this.keycloakTokens = keycloakTokens;
    }

    @GetMapping("/config")
    public Mono<Map<String, Object>> config(ServerWebExchange exchange) {
        boolean oidc = properties.security().oidc();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mode", properties.security().mode());
        body.put("oidcLoginUrl", oidc ? "/oauth2/authorization/keycloak" : "");
        body.put("oidcIssuer", oidc ? properties.keycloak().issuerUri() : "");
        body.put("oidcSubjectSystem", OidcIdentifiers.SUBJECT_SYSTEM);
        body.put("keycloakIssuer", properties.keycloak().issuerUri());
        body.put("keycloakClientId", properties.keycloak().clientId());
        body.put("keycloakRealm", properties.keycloak().realm());
        body.put("fhirBaseUrl", "/fhir");
        Mono<CsrfToken> csrf = exchange.getAttribute(CsrfToken.class.getName());
        if (csrf == null) {
            return Mono.just(body);
        }
        return csrf.map(token -> {
            body.put("csrfToken", token.getToken());
            body.put("csrfHeaderName", token.getHeaderName());
            return body;
        });
    }

    @GetMapping("/me")
    public Mono<Map<String, Object>> me() {
        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .map(this::toUser);
    }

    public record TokenRequest(
            String grantType,
            String username,
            String password,
            String clientId,
            String clientSecret,
            String scope
    ) {
    }

    @PostMapping(path = "/token", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<IssuedToken> token(@RequestBody TokenRequest request) {
        return keycloakTokens.issue(new GrantRequest(
                request.grantType(),
                request.username(),
                request.password(),
                request.clientId(),
                request.clientSecret(),
                request.scope()));
    }

    @GetMapping("/users")
    public Mono<List<Map<String, Object>>> users() {
        if (properties.security().oidc()) {
            KeycloakUserService service = keycloakUsers.getIfAvailable();
            if (service == null) {
                return Mono.just(List.of());
            }
            return service.listUsers();
        }
        return Mono.just(properties.security().users().stream()
                .map(user -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("username", user.username());
                    row.put("displayName", user.username());
                    row.put("email", "");
                    row.put("enabled", true);
                    row.put("roles", user.roles());
                    return row;
                })
                .toList());
    }

    @GetMapping("/users/available")
    public Mono<Map<String, Boolean>> usersAvailable(
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String mobile
    ) {
        return oidcUsers().flatMap(service -> service.availability(username, email, mobile));
    }

    @PostMapping("/users")
    public Mono<ResponseEntity<Map<String, Object>>> createUser(@RequestBody CreateUserRequest request) {
        return oidcUsers()
                .flatMap(service -> service.createUser(request))
                .map(ResponseEntity::ok)
                .onErrorResume(UserConflictException.class, error ->
                        Mono.just(ResponseEntity.status(HttpStatus.CONFLICT).body(error.toBody())));
    }

    private Mono<KeycloakUserService> oidcUsers() {
        if (!properties.security().oidc()) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "OIDC user management is not enabled."));
        }
        KeycloakUserService service = keycloakUsers.getIfAvailable();
        if (service == null) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "OIDC user management is not enabled."));
        }
        return Mono.just(service);
    }

    private Map<String, Object> toUser(Authentication authentication) {
        String username = authentication.getName();
        String displayName = username;
        if (authentication instanceof OAuth2AuthenticationToken oauth
                && oauth.getPrincipal() instanceof OidcUser oidcUser) {
            username = firstNonBlank(oidcUser.getPreferredUsername(), oidcUser.getName(), username);
            displayName = firstNonBlank(oidcUser.getFullName(), oidcUser.getGivenName(), username);
        }
        return Map.of(
                "username", username,
                "displayName", displayName,
                "roles", authorities(authentication.getAuthorities()),
                "mode", properties.security().mode()
        );
    }

    private static List<String> authorities(Collection<? extends GrantedAuthority> authorities) {
        return authorities.stream().map(GrantedAuthority::getAuthority).collect(Collectors.toList());
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}
