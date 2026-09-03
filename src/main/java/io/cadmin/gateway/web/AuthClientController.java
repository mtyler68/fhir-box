package io.cadmin.gateway.web;

import io.cadmin.gateway.config.CadminProperties;
import io.cadmin.gateway.keycloak.KeycloakClientService;
import io.cadmin.gateway.keycloak.KeycloakClientService.CreateClientRequest;
import io.cadmin.gateway.keycloak.KeycloakClientService.UpdateClientRequest;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(path = "/api/auth/clients", produces = MediaType.APPLICATION_JSON_VALUE)
public class AuthClientController {

    private final CadminProperties properties;
    private final ObjectProvider<KeycloakClientService> keycloakClients;

    public AuthClientController(
            CadminProperties properties,
            ObjectProvider<KeycloakClientService> keycloakClients
    ) {
        this.properties = properties;
        this.keycloakClients = keycloakClients;
    }

    @GetMapping
    public Mono<List<Map<String, Object>>> list() {
        return oidcClients().flatMap(KeycloakClientService::listClients);
    }

    @GetMapping("/{id}")
    public Mono<Map<String, Object>> get(@PathVariable String id) {
        return oidcClients().flatMap(service -> service.getClient(id));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Map<String, Object>>> create(@RequestBody CreateClientRequest request) {
        return oidcClients()
                .flatMap(service -> service.createClient(request))
                .map(body -> ResponseEntity.status(HttpStatus.CREATED).body(body));
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<Map<String, Object>> update(@PathVariable String id, @RequestBody UpdateClientRequest request) {
        return oidcClients().flatMap(service -> service.updateClient(id, request));
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> delete(@PathVariable String id) {
        return oidcClients()
                .flatMap(service -> service.deleteClient(id))
                .thenReturn(ResponseEntity.noContent().build());
    }

    @PostMapping("/{id}/secret")
    public Mono<Map<String, Object>> regenerateSecret(@PathVariable String id) {
        return oidcClients().flatMap(service -> service.regenerateSecret(id));
    }

    private Mono<KeycloakClientService> oidcClients() {
        if (!properties.security().oidc()) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "OIDC client management is not enabled."));
        }
        KeycloakClientService service = keycloakClients.getIfAvailable();
        if (service == null) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "OIDC client management is not enabled."));
        }
        return Mono.just(service);
    }
}
