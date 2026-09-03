package io.cadmin.gateway.keycloak;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.cadmin.gateway.config.CadminProperties;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.ParameterizedTypeReference;
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
public class KeycloakClientService {

    static final Set<String> INTERNAL_CLIENTS = Set.of(
            "account",
            "account-console",
            "admin-cli",
            "broker",
            "realm-management",
            "security-admin-console"
    );

    static final List<String> MANAGED_SCOPES = List.of("icg", "icg.admin");

    private static final Duration TOKEN_SKEW = Duration.ofSeconds(30);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP =
            new ParameterizedTypeReference<>() {
            };

    private final WebClient webClient;
    private final CadminProperties.Keycloak keycloak;
    private final AtomicReference<CachedToken> cachedToken = new AtomicReference<>();

    public KeycloakClientService(CadminProperties properties, WebClient.Builder builder) {
        this.keycloak = properties.keycloak();
        this.webClient = builder.clone()
                .baseUrl(keycloak.serverUri())
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public Mono<List<Map<String, Object>>> listClients() {
        return accessToken().flatMap(token -> fetchClients(token)
                .flatMapMany(Flux::fromIterable)
                .filter(KeycloakClientService::isListedClient)
                .flatMap(client -> enrich(token, client, false), 8)
                .sort(Comparator.comparing(
                        row -> String.valueOf(row.getOrDefault("clientId", "")),
                        String.CASE_INSENSITIVE_ORDER))
                .collectList());
    }

    public Mono<Map<String, Object>> getClient(String id) {
        return accessToken().flatMap(token -> fetchClient(token, id)
                .flatMap(client -> enrich(token, client, true)));
    }

    public Mono<Map<String, Object>> createClient(CreateClientRequest request) {
        CreateClientRequest normalized = normalize(request);
        String message = validate(normalized);
        if (message != null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, message));
        }
        if (isInternal(normalized.clientId()) || isProtected(normalized.clientId())) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "That client id is reserved."));
        }
        return accessToken().flatMap(token -> postClient(token, normalized)
                .flatMap(id -> syncManagedScopes(token, id, normalized.scopes(), false)
                        .then(fetchClient(token, id))
                        .flatMap(client -> enrich(token, client, true))));
    }

    public Mono<Map<String, Object>> updateClient(String id, UpdateClientRequest request) {
        UpdateClientRequest normalized = normalize(request);
        return accessToken().flatMap(token -> fetchClient(token, id).flatMap(current -> {
            if (isProtected(clientIdOf(current))) {
                return Mono.error(new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "The Box and ICG clients cannot be edited here."));
            }
            return putClient(token, id, applyUpdate(current, normalized))
                    .then(normalized.scopes() == null
                            ? Mono.empty()
                            : syncManagedScopes(token, id, normalized.scopes(), true))
                    .then(fetchClient(token, id))
                    .flatMap(client -> enrich(token, client, true));
        }));
    }

    public Mono<Void> deleteClient(String id) {
        return accessToken().flatMap(token -> fetchClient(token, id).flatMap(current -> {
            String clientId = clientIdOf(current);
            if (isProtected(clientId) || isInternal(clientId)) {
                return Mono.error(new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "This client cannot be deleted."));
            }
            return webClient.delete()
                    .uri("/admin/realms/{realm}/clients/{id}", keycloak.realm(), id)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "delete-client"))
                    .toBodilessEntity()
                    .then();
        }));
    }

    public Mono<Map<String, Object>> regenerateSecret(String id) {
        return accessToken().flatMap(token -> fetchClient(token, id).flatMap(current -> {
            if (isProtected(clientIdOf(current))) {
                return Mono.error(new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "The Box and ICG client secrets cannot be rotated here."));
            }
            if (bool(current, "publicClient")) {
                return Mono.error(new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Public clients do not have a secret."));
            }
            return webClient.post()
                    .uri("/admin/realms/{realm}/clients/{id}/client-secret", keycloak.realm(), id)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "client-secret"))
                    .bodyToMono(CredentialRepresentation.class)
                    .flatMap(secret -> fetchClient(token, id)
                            .flatMap(client -> enrich(token, client, true))
                            .map(row -> {
                                row.put("secret", secret == null || blank(secret.value()) ? "" : secret.value());
                                return row;
                            }));
        }));
    }

    private Mono<Map<String, Object>> enrich(String token, Map<String, Object> client, boolean includeSecret) {
        String id = str(client, "id");
        Mono<String> subject = bool(client, "serviceAccountsEnabled")
                ? fetchServiceAccount(token, id).map(user -> user == null || blank(user.id()) ? "" : user.id())
                        .onErrorReturn("")
                : Mono.just("");
        Mono<String> secret = includeSecret && !bool(client, "publicClient")
                ? fetchSecret(token, id).onErrorReturn("")
                : Mono.just("");
        return Mono.zip(subject, secret).map(tuple -> toRow(client, tuple.getT1(), tuple.getT2(), includeSecret));
    }

    private Mono<List<Map<String, Object>>> fetchClients(String token) {
        return webClient.get()
                .uri(uri -> uri.path("/admin/realms/{realm}/clients")
                        .queryParam("max", 200)
                        .build(keycloak.realm()))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "clients"))
                .bodyToFlux(MAP)
                .collectList();
    }

    private Mono<Map<String, Object>> fetchClient(String token, String id) {
        return webClient.get()
                .uri("/admin/realms/{realm}/clients/{id}", keycloak.realm(), id)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(status -> status.value() == 404, response -> Mono.error(new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "OIDC client was not found.")))
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "client"))
                .bodyToMono(MAP);
    }

    private Mono<String> postClient(String token, CreateClientRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("clientId", request.clientId());
        body.put("name", request.name());
        body.put("description", request.description());
        body.put("enabled", true);
        body.put("protocol", "openid-connect");
        body.put("publicClient", false);
        if (!blank(request.secret())) {
            body.put("secret", request.secret());
        }
        body.put("standardFlowEnabled", false);
        body.put("implicitFlowEnabled", false);
        body.put("directAccessGrantsEnabled", false);
        body.put("serviceAccountsEnabled", request.serviceAccountsEnabled());
        body.put("fullScopeAllowed", false);
        body.put("frontchannelLogout", true);
        return webClient.post()
                .uri("/admin/realms/{realm}/clients", keycloak.realm())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchangeToMono(response -> {
                    if (response.statusCode().value() == 409) {
                        return response.releaseBody().then(Mono.error(new ResponseStatusException(
                                HttpStatus.CONFLICT, "A client with that id already exists.")));
                    }
                    if (response.statusCode().isError()) {
                        return adminApiError(response.statusCode(), "create-client").flatMap(Mono::error);
                    }
                    String location = response.headers().header(HttpHeaders.LOCATION).stream()
                            .findFirst()
                            .orElse("");
                    return response.releaseBody().then(Mono.defer(() -> {
                        String id = KeycloakUserService.userIdFromLocation(location);
                        if (id.isBlank()) {
                            return findClientId(token, request.clientId());
                        }
                        return Mono.just(id);
                    }));
                });
    }

    private Mono<String> findClientId(String token, String clientId) {
        return webClient.get()
                .uri(uri -> uri.path("/admin/realms/{realm}/clients")
                        .queryParam("clientId", clientId)
                        .build(keycloak.realm()))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "clients"))
                .bodyToFlux(MAP)
                .next()
                .map(client -> str(client, "id"))
                .filter(id -> !id.isBlank())
                .switchIfEmpty(Mono.error(new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "Keycloak did not return the created client id.")));
    }

    private Mono<Void> putClient(String token, String id, Map<String, Object> client) {
        return webClient.put()
                .uri("/admin/realms/{realm}/clients/{id}", keycloak.realm(), id)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(client)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "update-client"))
                .toBodilessEntity()
                .then();
    }

    private Mono<Void> syncManagedScopes(String token, String clientUuid, List<String> scopes, boolean removeMissing) {
        Set<String> wanted = new LinkedHashSet<>();
        if (scopes != null) {
            scopes.stream()
                    .filter(value -> !blank(value))
                    .map(String::trim)
                    .forEach(wanted::add);
        }
        return fetchClientScopes(token).flatMap(available -> {
            Map<String, String> ids = available.stream()
                    .filter(scope -> !blank(scope.name()) && !blank(scope.id()))
                    .collect(Collectors.toMap(KeycloakScopeRepresentation::name, KeycloakScopeRepresentation::id,
                            (left, right) -> left, LinkedHashMap::new));
            Mono<Void> chain = Mono.empty();
            for (String name : MANAGED_SCOPES) {
                String scopeId = ids.get(name);
                if (scopeId == null) {
                    continue;
                }
                boolean optional = name.endsWith(".admin");
                if (wanted.contains(name)) {
                    chain = chain.then(putClientScope(token, clientUuid, scopeId, optional));
                } else if (removeMissing) {
                    chain = chain.then(deleteClientScope(token, clientUuid, scopeId, optional))
                            .then(deleteClientScope(token, clientUuid, scopeId, !optional));
                }
            }
            return chain;
        });
    }

    private Mono<Void> putClientScope(String token, String clientUuid, String scopeId, boolean optional) {
        return webClient.put()
                .uri("/admin/realms/{realm}/clients/{id}/{kind}/{scopeId}",
                        keycloak.realm(), clientUuid, scopeKind(optional), scopeId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "client-scopes"))
                .toBodilessEntity()
                .then()
                .onErrorResume(error -> Mono.empty());
    }

    private Mono<Void> deleteClientScope(String token, String clientUuid, String scopeId, boolean optional) {
        return webClient.delete()
                .uri("/admin/realms/{realm}/clients/{id}/{kind}/{scopeId}",
                        keycloak.realm(), clientUuid, scopeKind(optional), scopeId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .toBodilessEntity()
                .then()
                .onErrorResume(error -> Mono.empty());
    }

    private static String scopeKind(boolean optional) {
        return optional ? "optional-client-scopes" : "default-client-scopes";
    }

    private Mono<List<KeycloakScopeRepresentation>> fetchClientScopes(String token) {
        return webClient.get()
                .uri("/admin/realms/{realm}/client-scopes", keycloak.realm())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "client-scopes"))
                .bodyToFlux(KeycloakScopeRepresentation.class)
                .collectList();
    }

    private Mono<ServiceAccountUser> fetchServiceAccount(String token, String clientUuid) {
        if (blank(clientUuid)) {
            return Mono.just(new ServiceAccountUser("", ""));
        }
        return webClient.get()
                .uri("/admin/realms/{realm}/clients/{id}/service-account-user", keycloak.realm(), clientUuid)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "service-account"))
                .bodyToMono(ServiceAccountUser.class)
                .defaultIfEmpty(new ServiceAccountUser("", ""));
    }

    private Mono<String> fetchSecret(String token, String clientUuid) {
        return webClient.get()
                .uri("/admin/realms/{realm}/clients/{id}/client-secret", keycloak.realm(), clientUuid)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> adminApiError(response.statusCode(), "client-secret"))
                .bodyToMono(CredentialRepresentation.class)
                .map(secret -> secret == null || blank(secret.value()) ? "" : secret.value())
                .defaultIfEmpty("");
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
                    if (response == null || blank(response.accessToken())) {
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

    private static Mono<Throwable> adminApiError(HttpStatusCode status, String action) {
        if (status.value() == 401 || status.value() == 403) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Keycloak admin API denied " + action
                            + ". Assign realm-management view-clients, query-clients, and manage-clients "
                            + "to the gateway service account."));
        }
        return Mono.error(new ResponseStatusException(
                HttpStatus.BAD_GATEWAY, "Keycloak admin API failed while loading " + action));
    }

    static boolean isListedClient(Map<String, Object> client) {
        if (client == null || isInternal(clientIdOf(client))) {
            return false;
        }
        String protocol = str(client, "protocol");
        return protocol.isBlank() || "openid-connect".equalsIgnoreCase(protocol);
    }

    static boolean isInternal(String clientId) {
        return clientId != null && INTERNAL_CLIENTS.contains(clientId.toLowerCase(Locale.ROOT));
    }

    static boolean isProtected(String clientId) {
        if (clientId == null) {
            return false;
        }
        String id = clientId.toLowerCase(Locale.ROOT);
        return "cadmin-gateway".equals(id) || "icg".equals(id);
    }

    static CreateClientRequest normalize(CreateClientRequest request) {
        if (request == null) {
            return new CreateClientRequest("", "", "", true, List.of(), "");
        }
        return new CreateClientRequest(
                trim(request.clientId()),
                trim(request.name()),
                trim(request.description()),
                request.serviceAccountsEnabled() == null || request.serviceAccountsEnabled(),
                request.scopes() == null ? List.of() : request.scopes(),
                blank(request.secret()) ? null : request.secret());
    }

    static UpdateClientRequest normalize(UpdateClientRequest request) {
        if (request == null) {
            return new UpdateClientRequest(null, null, null, null);
        }
        return new UpdateClientRequest(
                request.name() == null ? null : trim(request.name()),
                request.description() == null ? null : trim(request.description()),
                request.enabled(),
                request.scopes());
    }

    static String validate(CreateClientRequest request) {
        if (request == null || blank(request.clientId())) {
            return "Client id is required.";
        }
        if (!request.clientId().matches("[A-Za-z0-9][A-Za-z0-9._-]*")) {
            return "Client id may contain letters, numbers, dots, underscores, and hyphens.";
        }
        return null;
    }

    static Map<String, Object> toRow(
            Map<String, Object> client,
            String subject,
            String secret,
            boolean includeSecret
    ) {
        Map<String, Object> row = new LinkedHashMap<>();
        String clientId = clientIdOf(client);
        String name = str(client, "name");
        row.put("id", str(client, "id"));
        row.put("clientId", clientId);
        row.put("name", name.isBlank() ? clientId : name);
        row.put("description", str(client, "description"));
        row.put("enabled", client == null || !client.containsKey("enabled") || bool(client, "enabled"));
        row.put("publicClient", bool(client, "publicClient"));
        row.put("serviceAccountsEnabled", bool(client, "serviceAccountsEnabled"));
        row.put("standardFlowEnabled", bool(client, "standardFlowEnabled"));
        row.put("directAccessGrantsEnabled", bool(client, "directAccessGrantsEnabled"));
        row.put("internal", isInternal(clientId) || isProtected(clientId));
        row.put("subject", subject == null ? "" : subject);
        row.put("subjectSystem", OidcIdentifiers.SUBJECT_SYSTEM);
        row.put("defaultClientScopes", strings(client, "defaultClientScopes"));
        row.put("optionalClientScopes", strings(client, "optionalClientScopes"));
        if (includeSecret) {
            row.put("secret", secret == null ? "" : secret);
        }
        return row;
    }

    static Map<String, Object> applyUpdate(Map<String, Object> current, UpdateClientRequest request) {
        Map<String, Object> next = current == null ? new LinkedHashMap<>() : new LinkedHashMap<>(current);
        if (request != null && request.name() != null) {
            next.put("name", request.name());
        }
        if (request != null && request.description() != null) {
            next.put("description", request.description());
        }
        if (request != null && request.enabled() != null) {
            next.put("enabled", request.enabled());
        }
        return next;
    }

    private static String clientIdOf(Map<String, Object> client) {
        return str(client, "clientId");
    }

    private static String str(Map<String, Object> map, String key) {
        if (map == null) {
            return "";
        }
        Object value = map.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private static boolean bool(Map<String, Object> map, String key) {
        if (map == null) {
            return false;
        }
        Object value = map.get(key);
        if (value instanceof Boolean flag) {
            return flag;
        }
        return value != null && Boolean.parseBoolean(String.valueOf(value));
    }

    private static List<String> strings(Map<String, Object> map, String key) {
        if (map == null) {
            return List.of();
        }
        Object value = map.get(key);
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(String::valueOf).toList();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private record CachedToken(String value, Instant expiresAt) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("expires_in") Integer expiresIn
    ) {
    }

    public record CreateClientRequest(
            String clientId,
            String name,
            String description,
            Boolean serviceAccountsEnabled,
            List<String> scopes,
            String secret
    ) {
    }

    public record UpdateClientRequest(
            String name,
            String description,
            Boolean enabled,
            List<String> scopes
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CredentialRepresentation(String type, String value) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ServiceAccountUser(String id, String username) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record KeycloakScopeRepresentation(String id, String name) {
    }
}
