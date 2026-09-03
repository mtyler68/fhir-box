package io.cadmin.gateway.keycloak;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.cadmin.gateway.config.CadminProperties;
import java.time.Instant;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

@Service
public class KeycloakTokenService {

    public static final String GRANT_PASSWORD = "password";
    public static final String GRANT_CLIENT_CREDENTIALS = "client_credentials";

    private final WebClient webClient;
    private final CadminProperties.Keycloak keycloak;

    public KeycloakTokenService(CadminProperties properties, WebClient.Builder builder) {
        this.keycloak = properties.keycloak();
        this.webClient = builder.clone()
                .baseUrl(keycloak.serverUri())
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public Mono<IssuedToken> issue(GrantRequest request) {
        if (request == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Token request is required."));
        }
        String grant = normalizeGrant(request.grantType());
        if (GRANT_CLIENT_CREDENTIALS.equals(grant)) {
            return clientCredentialsGrant(request.clientId(), request.clientSecret(), request.scope());
        }
        if (GRANT_PASSWORD.equals(grant)) {
            return passwordGrant(request.username(), request.password(), request.scope());
        }
        return Mono.error(new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Grant type must be password or client_credentials."));
    }

    public Mono<IssuedToken> passwordGrant(String username, String password, String scope) {
        if (blank(username) || password == null || password.isEmpty()) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Username and password are required."));
        }
        MultiValueMap<String, String> form = baseClientForm(GRANT_PASSWORD, keycloak.clientId(), keycloak.clientSecret());
        form.add("username", username.trim());
        form.add("password", password);
        addScope(form, scope);
        return exchange(form, GRANT_PASSWORD, keycloak.clientId());
    }

    public Mono<IssuedToken> clientCredentialsGrant(String clientId, String clientSecret, String scope) {
        ResolvedClient client = resolveClient(clientId, clientSecret);
        if (client == null) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Client ID and secret are required."));
        }
        MultiValueMap<String, String> form = baseClientForm(GRANT_CLIENT_CREDENTIALS, client.id(), client.secret());
        addScope(form, scope);
        return exchange(form, GRANT_CLIENT_CREDENTIALS, client.id());
    }

    ResolvedClient resolveClient(String clientId, String clientSecret) {
        String id = blank(clientId) ? keycloak.clientId() : clientId.trim();
        if (blank(id)) {
            return null;
        }
        String secret = !blank(clientSecret)
                ? clientSecret
                : id.equals(keycloak.clientId()) ? keycloak.clientSecret() : null;
        if (blank(secret)) {
            return null;
        }
        return new ResolvedClient(id, secret);
    }

    static String normalizeGrant(String grantType) {
        if (blank(grantType)) {
            return GRANT_PASSWORD;
        }
        return grantType.trim().toLowerCase();
    }

    private MultiValueMap<String, String> baseClientForm(String grantType, String clientId, String clientSecret) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", grantType);
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        return form;
    }

    private static void addScope(MultiValueMap<String, String> form, String scope) {
        if (!blank(scope)) {
            form.add("scope", scope.trim());
        }
    }

    private Mono<IssuedToken> exchange(MultiValueMap<String, String> form, String grantType, String clientId) {
        return webClient.post()
                .uri(keycloak.tokenPath())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData(form))
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::tokenError)
                .bodyToMono(KeycloakTokenResponse.class)
                .flatMap(response -> {
                    if (response == null || blank(response.accessToken())) {
                        return Mono.error(new ResponseStatusException(
                                HttpStatus.BAD_GATEWAY, "Keycloak did not return an access token."));
                    }
                    return Mono.just(IssuedToken.from(response, keycloak.issuerUri(), clientId, grantType));
                })
                .onErrorMap(WebClientRequestException.class, ex -> new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "Could not reach Keycloak at " + keycloak.tokenUri() + "."));
    }

    private Mono<? extends Throwable> tokenError(ClientResponse response) {
        HttpStatus status = mapErrorStatus(response.statusCode());
        return response.bodyToMono(KeycloakError.class)
                .defaultIfEmpty(new KeycloakError(null, null))
                .map(error -> new ResponseStatusException(status, errorMessage(error, response.statusCode())));
    }

    static HttpStatus mapErrorStatus(HttpStatusCode status) {
        if (status.value() == 400 || status.value() == 401) {
            return HttpStatus.BAD_REQUEST;
        }
        if (status.value() == 403) {
            return HttpStatus.FORBIDDEN;
        }
        return HttpStatus.BAD_GATEWAY;
    }

    static String errorMessage(KeycloakError error, HttpStatusCode status) {
        if (error != null && !blank(error.errorDescription())) {
            return error.errorDescription();
        }
        if (error != null && !blank(error.error())) {
            return error.error();
        }
        return status.value() == 400 || status.value() == 401
                ? "Keycloak rejected the credentials."
                : "Keycloak token request failed.";
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    public record GrantRequest(
            String grantType,
            String username,
            String password,
            String clientId,
            String clientSecret,
            String scope
    ) {
    }

    record ResolvedClient(String id, String secret) {
    }

    public record IssuedToken(
            String accessToken,
            String tokenType,
            Integer expiresIn,
            Instant expiresAt,
            String refreshToken,
            Integer refreshExpiresIn,
            String idToken,
            String scope,
            String bearer,
            String issuer,
            String clientId,
            String grantType
    ) {
        static IssuedToken from(
                KeycloakTokenResponse response,
                String issuer,
                String clientId,
                String grantType
        ) {
            String type = blank(response.tokenType()) ? "Bearer" : response.tokenType();
            Instant expiresAt = response.expiresIn() == null || response.expiresIn() < 1
                    ? null
                    : Instant.now().plusSeconds(response.expiresIn());
            return new IssuedToken(
                    response.accessToken(),
                    type,
                    response.expiresIn(),
                    expiresAt,
                    response.refreshToken(),
                    response.refreshExpiresIn(),
                    response.idToken(),
                    response.scope(),
                    type + " " + response.accessToken(),
                    issuer,
                    clientId,
                    grantType);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KeycloakTokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("token_type") String tokenType,
            @JsonProperty("expires_in") Integer expiresIn,
            @JsonProperty("refresh_token") String refreshToken,
            @JsonProperty("refresh_expires_in") Integer refreshExpiresIn,
            @JsonProperty("id_token") String idToken,
            String scope
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KeycloakError(
            String error,
            @JsonProperty("error_description") String errorDescription
    ) {
    }
}
