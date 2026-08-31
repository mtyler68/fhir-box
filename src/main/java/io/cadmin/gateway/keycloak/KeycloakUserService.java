package io.cadmin.gateway.keycloak;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.cadmin.gateway.config.CadminProperties;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
@ConditionalOnProperty(name = "cadmin.security.mode", havingValue = "oidc")
public class KeycloakUserService {

    private static final int PAGE_SIZE = 200;
    private static final Duration TOKEN_SKEW = Duration.ofSeconds(30);

    private final WebClient webClient;
    private final CadminProperties.Keycloak keycloak;
    private final AtomicReference<CachedToken> cachedToken = new AtomicReference<>();

    public KeycloakUserService(CadminProperties properties, WebClient.Builder builder) {
        this.keycloak = properties.keycloak();
        this.webClient = builder.clone()
                .baseUrl(keycloak.serverUri())
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public Mono<List<Map<String, Object>>> listUsers() {
        return accessToken().flatMap(token -> fetchUsers(token)
                .flatMapMany(Flux::fromIterable)
                .filter(user -> !isServiceAccount(user))
                .flatMap(user -> fetchRealmRoles(token, user.id())
                        .map(roles -> toRow(user, roles)), 8)
                .sort(Comparator.comparing(
                        row -> String.valueOf(row.getOrDefault("username", "")),
                        String.CASE_INSENSITIVE_ORDER))
                .collectList());
    }

    public Mono<Map<String, Boolean>> availability(String username, String email, String mobile) {
        return accessToken().flatMap(token -> Mono.zip(
                usernameAvailable(token, username),
                emailAvailable(token, email),
                mobileAvailable(token, mobile)
        ).map(tuple -> {
            Map<String, Boolean> body = new LinkedHashMap<>();
            body.put("username", tuple.getT1());
            body.put("email", tuple.getT2());
            body.put("mobile", tuple.getT3());
            return body;
        }));
    }

    public Mono<Map<String, Object>> createUser(CreateUserRequest request) {
        CreateUserRequest normalized = normalize(request);
        String message = validate(normalized);
        if (message != null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, message));
        }
        return accessToken().flatMap(token -> availability(
                normalized.username(), normalized.email(), normalized.mobile())
                .flatMap(available -> {
                    if (!allAvailable(available)) {
                        return Mono.error(new UserConflictException(available));
                    }
                    return postUser(token, normalized)
                            .flatMap(id -> assignRealmRole(token, id, "user")
                                    .then(fetchUser(token, id))
                                    .flatMap(user -> fetchRealmRoles(token, id)
                                            .map(roles -> toRow(user, roles))));
                }));
    }

    private Mono<List<KeycloakUserRepresentation>> fetchUsers(String token) {
        return webClient.get()
                .uri(uri -> uri.path("/admin/realms/{realm}/users")
                        .queryParam("max", PAGE_SIZE)
                        .queryParam("briefRepresentation", false)
                        .build(keycloak.realm()))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "users"))
                .bodyToFlux(KeycloakUserRepresentation.class)
                .collectList();
    }

    private Mono<List<String>> fetchRealmRoles(String token, String userId) {
        if (userId == null || userId.isBlank()) {
            return Mono.just(List.of());
        }
        return webClient.get()
                .uri("/admin/realms/{realm}/users/{id}/role-mappings/realm", keycloak.realm(), userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "roles"))
                .bodyToFlux(KeycloakRoleRepresentation.class)
                .mapNotNull(KeycloakRoleRepresentation::name)
                .filter(KeycloakUserService::keepRole)
                .collectList()
                .onErrorReturn(List.of());
    }

    private Mono<String> accessToken() {
        CachedToken cached = cachedToken.get();
        if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
            return Mono.just(cached.value());
        }
        return webClient.post()
                .uri("/realms/{realm}/protocol/openid-connect/token", keycloak.realm())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("grant_type", "client_credentials")
                        .with("client_id", keycloak.clientId())
                        .with("client_secret", keycloak.clientSecret()))
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> Mono.error(new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Keycloak client credentials failed. Enable the cadmin-gateway service account.")))
                .bodyToMono(TokenResponse.class)
                .handle((response, sink) -> {
                    if (response == null || response.accessToken() == null || response.accessToken().isBlank()) {
                        sink.error(new ResponseStatusException(
                                HttpStatus.BAD_GATEWAY, "Keycloak did not return an access token"));
                        return;
                    }
                    CachedToken next = new CachedToken(response.accessToken(), expiresAt(response.expiresIn()));
                    cachedToken.set(next);
                    sink.next(next.value());
                });
    }

    private static Instant expiresAt(Integer expiresIn) {
        int lifetime = expiresIn == null || expiresIn < 1 ? 60 : expiresIn;
        long skewSeconds = Math.min(TOKEN_SKEW.getSeconds(), Math.max(1, lifetime / 2));
        return Instant.now().plusSeconds(lifetime - skewSeconds);
    }

    private Mono<Boolean> usernameAvailable(String token, String username) {
        if (blank(username)) {
            return Mono.just(true);
        }
        return searchUsers(token, uri -> uri.queryParam("username", username).queryParam("exact", true))
                .map(users -> users.stream().noneMatch(user ->
                        !isServiceAccount(user) && equalsIgnoreCase(user.username(), username)));
    }

    private Mono<Boolean> emailAvailable(String token, String email) {
        if (blank(email)) {
            return Mono.just(true);
        }
        return searchUsers(token, uri -> uri.queryParam("email", email).queryParam("exact", true))
                .map(users -> users.stream().noneMatch(user ->
                        !isServiceAccount(user) && equalsIgnoreCase(user.email(), email)));
    }

    private Mono<Boolean> mobileAvailable(String token, String mobile) {
        String digits = digits(mobile);
        if (digits.isEmpty()) {
            return Mono.just(true);
        }
        return fetchUsers(token).map(users -> users.stream().noneMatch(user ->
                !isServiceAccount(user) && digits(mobileOf(user)).equals(digits)));
    }

    private Mono<List<KeycloakUserRepresentation>> searchUsers(
            String token,
            java.util.function.UnaryOperator<org.springframework.web.util.UriBuilder> query
    ) {
        return webClient.get()
                .uri(uri -> query.apply(uri.path("/admin/realms/{realm}/users")
                        .queryParam("max", PAGE_SIZE)
                        .queryParam("briefRepresentation", false))
                        .build(keycloak.realm()))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "users"))
                .bodyToFlux(KeycloakUserRepresentation.class)
                .collectList();
    }

    private Mono<String> postUser(String token, CreateUserRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("username", request.username());
        body.put("firstName", request.firstName());
        body.put("lastName", request.lastName());
        body.put("enabled", true);
        body.put("emailVerified", false);
        if (!blank(request.email())) {
            body.put("email", request.email());
        }
        if (!blank(request.mobile())) {
            Map<String, List<String>> attributes = new LinkedHashMap<>();
            attributes.put("mobile", List.of(request.mobile()));
            attributes.put("phoneNumber", List.of(request.mobile()));
            body.put("attributes", attributes);
        }
        return webClient.post()
                .uri("/admin/realms/{realm}/users", keycloak.realm())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchangeToMono(response -> {
                    if (response.statusCode().value() == 409) {
                        return response.releaseBody().then(Mono.error(new UserConflictException(Map.of(
                                "username", false,
                                "email", true,
                                "mobile", true
                        ))));
                    }
                    if (response.statusCode().isError()) {
                        return adminApiError(response.statusCode(), "create-user")
                                .flatMap(Mono::error);
                    }
                    String location = response.headers().header(HttpHeaders.LOCATION).stream()
                            .findFirst()
                            .orElse("");
                    return response.releaseBody().then(Mono.defer(() -> {
                        String id = userIdFromLocation(location);
                        if (id.isBlank()) {
                            return Mono.error(new ResponseStatusException(
                                    HttpStatus.BAD_GATEWAY, "Keycloak did not return the created user id."));
                        }
                        return Mono.just(id);
                    }));
                });
    }

    private Mono<KeycloakUserRepresentation> fetchUser(String token, String userId) {
        return webClient.get()
                .uri("/admin/realms/{realm}/users/{id}", keycloak.realm(), userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "user"))
                .bodyToMono(KeycloakUserRepresentation.class);
    }

    private Mono<Void> assignRealmRole(String token, String userId, String roleName) {
        return webClient.get()
                .uri("/admin/realms/{realm}/roles/{role}", keycloak.realm(), roleName)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "roles"))
                .bodyToMono(KeycloakRoleRepresentation.class)
                .flatMap(role -> webClient.post()
                        .uri("/admin/realms/{realm}/users/{id}/role-mappings/realm",
                                keycloak.realm(), userId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(List.of(Map.of(
                                "id", role.id() == null ? "" : role.id(),
                                "name", role.name() == null ? roleName : role.name())))
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "roles"))
                        .toBodilessEntity()
                        .then())
                .onErrorResume(error -> Mono.empty());
    }

    private static Mono<Throwable> adminApiError(HttpStatusCode status, String action) {
        if (status.value() == 401 || status.value() == 403) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Keycloak admin API denied " + action
                            + ". Assign realm-management view-users, query-users, and manage-users "
                            + "to the gateway service account."));
        }
        return Mono.error(new ResponseStatusException(
                HttpStatus.BAD_GATEWAY, "Keycloak admin API failed while loading " + action));
    }

    static boolean isServiceAccount(KeycloakUserRepresentation user) {
        if (user == null) {
            return true;
        }
        if (user.serviceAccountClientId() != null && !user.serviceAccountClientId().isBlank()) {
            return true;
        }
        String username = user.username();
        return username != null && username.toLowerCase(Locale.ROOT).startsWith("service-account-");
    }

    static boolean keepRole(String name) {
        if (name == null || name.isBlank()) {
            return false;
        }
        String lower = name.trim().toLowerCase(Locale.ROOT);
        return !"offline_access".equals(lower)
                && !"uma_authorization".equals(lower)
                && !lower.startsWith("default-roles-");
    }

    static String displayName(KeycloakUserRepresentation user) {
        if (user == null) {
            return "";
        }
        String combined = Stream.of(user.firstName(), user.lastName())
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .collect(Collectors.joining(" "));
        if (!combined.isBlank()) {
            return combined;
        }
        return user.username() == null ? "" : user.username();
    }

    static Map<String, Object> toRow(KeycloakUserRepresentation user, List<String> roles) {
        Map<String, Object> row = new LinkedHashMap<>();
        String oidcId = user == null || user.id() == null ? "" : user.id();
        row.put("id", oidcId);
        row.put("oidcId", oidcId);
        row.put("username", user == null || user.username() == null ? "" : user.username());
        row.put("displayName", displayName(user));
        row.put("email", user == null || user.email() == null ? "" : user.email());
        row.put("mobile", mobileOf(user));
        row.put("enabled", user == null || user.enabled() == null || user.enabled());
        row.put("roles", roles == null
                ? new ArrayList<String>()
                : roles.stream().filter(KeycloakUserService::keepRole).collect(Collectors.toList()));
        return row;
    }

    static CreateUserRequest normalize(CreateUserRequest request) {
        if (request == null) {
            return new CreateUserRequest("", "", "", "", "");
        }
        return new CreateUserRequest(
                trim(request.firstName()),
                trim(request.lastName()),
                trim(request.email()).toLowerCase(Locale.ROOT),
                digits(request.mobile()),
                trim(request.username()));
    }

    static String validate(CreateUserRequest request) {
        if (request == null || blank(request.firstName()) || blank(request.lastName()) || blank(request.username())) {
            return "First name, last name, and username are required.";
        }
        if (!blank(request.email()) && !request.email().contains("@")) {
            return "Email must be a valid address.";
        }
        return null;
    }

    static boolean allAvailable(Map<String, Boolean> available) {
        if (available == null) {
            return true;
        }
        return available.getOrDefault("username", true)
                && available.getOrDefault("email", true)
                && available.getOrDefault("mobile", true);
    }

    static String mobileOf(KeycloakUserRepresentation user) {
        if (user == null || user.attributes() == null) {
            return "";
        }
        for (String key : List.of("mobile", "phoneNumber", "phone")) {
            List<String> values = user.attributes().get(key);
            if (values == null) {
                continue;
            }
            for (String value : values) {
                if (!blank(value)) {
                    return value.trim();
                }
            }
        }
        return "";
    }

    static String digits(String value) {
        if (value == null) {
            return "";
        }
        StringBuilder digits = new StringBuilder();
        for (int i = 0; i < value.length(); i += 1) {
            char ch = value.charAt(i);
            if (ch >= '0' && ch <= '9') {
                digits.append(ch);
            }
        }
        return digits.toString();
    }

    static String userIdFromLocation(String location) {
        if (location == null || location.isBlank()) {
            return "";
        }
        String path = location;
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        while (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        int slash = path.lastIndexOf('/');
        return slash < 0 ? path : path.substring(slash + 1);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.trim().equalsIgnoreCase(right.trim());
    }

    private record CachedToken(String value, Instant expiresAt) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("expires_in") Integer expiresIn
    ) {
    }

    public record CreateUserRequest(
            String firstName,
            String lastName,
            String email,
            String mobile,
            String username
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record KeycloakUserRepresentation(
            String id,
            String username,
            String firstName,
            String lastName,
            String email,
            Boolean enabled,
            String serviceAccountClientId,
            Map<String, List<String>> attributes
    ) {
        KeycloakUserRepresentation(
                String id,
                String username,
                String firstName,
                String lastName,
                String email,
                Boolean enabled,
                String serviceAccountClientId
        ) {
            this(id, username, firstName, lastName, email, enabled, serviceAccountClientId, Map.of());
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record KeycloakRoleRepresentation(String id, String name, Boolean clientRole) {
        KeycloakRoleRepresentation(String name, Boolean clientRole) {
            this(null, name, clientRole);
        }
    }
}
