package io.cadmin.gateway.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "cadmin")
public record CadminProperties(
    @DefaultValue Security security,
    @DefaultValue Fhir fhir,
    @DefaultValue Geocode geocode,
    @DefaultValue NpiRegistry npiRegistry,
    @DefaultValue Wiremock wiremock,
    @DefaultValue CoreAdminBridge coreAdminBridge,
    @DefaultValue FhirChief fhirChief,
    @DefaultValue Keycloak keycloak
) {

    public record Security(
            @DefaultValue("local") String mode,
            @DefaultValue List<LocalUser> users
    ) {
        public Security {
            if (users == null) {
                users = new ArrayList<>();
            }
        }

        public boolean local() {
            return "local".equalsIgnoreCase(mode);
        }

        public boolean oidc() {
            return "oidc".equalsIgnoreCase(mode);
        }
    }

    public record LocalUser(
            String username,
            String password,
            @DefaultValue List<String> roles
    ) {
        public LocalUser {
            if (roles == null) {
                roles = new ArrayList<>();
            }
        }
    }

    public record Fhir(@DefaultValue("http://localhost:8081") String uri) {
    }

    public record Geocode(
            @DefaultValue("https://nominatim.openstreetmap.org") String uri,
            @DefaultValue("FHIR-Box/0.1 (io.cadmin.gateway; location-geocoder)") String userAgent
    ) {
    }

    public record NpiRegistry(
            @DefaultValue("https://npiregistry.cms.hhs.gov/api/") String uri,
            @DefaultValue("2.1") String version
    ) {
    }

    public record Wiremock(@DefaultValue("http://localhost:9090") String uri) {
    }

    public record CoreAdminBridge(@DefaultValue("http://localhost:8280") String uri) {
    }

    public record FhirChief(@DefaultValue("http://localhost:8380") String uri) {
    }

    public record Keycloak(
            @DefaultValue("http://localhost:8180/realms/cadmin") String issuerUri,
            @DefaultValue("cadmin-gateway") String clientId,
            @DefaultValue("cadmin-gateway-secret") String clientSecret
    ) {
        public Keycloak {
            if (issuerUri == null || issuerUri.isBlank()) {
                issuerUri = "http://localhost:8180/realms/cadmin";
            }
            if (clientId == null || clientId.isBlank()) {
                clientId = "cadmin-gateway";
            }
            if (clientSecret == null || clientSecret.isBlank()) {
                clientSecret = "cadmin-gateway-secret";
            }
            issuerUri = trimTrailingSlash(issuerUri);
        }

        public String serverUri() {
            int index = realmIndex(issuerUri);
            return index < 0 ? issuerUri : issuerUri.substring(0, index);
        }

        public String realm() {
            int index = realmIndex(issuerUri);
            if (index < 0) {
                return "cadmin";
            }
            String rest = issuerUri.substring(index + "/realms/".length());
            int slash = rest.indexOf('/');
            String realm = slash < 0 ? rest : rest.substring(0, slash);
            return realm.isBlank() ? "cadmin" : realm;
        }

        private static int realmIndex(String issuer) {
            return issuer.toLowerCase(Locale.ROOT).lastIndexOf("/realms/");
        }

        private static String trimTrailingSlash(String value) {
            String trimmed = value.trim();
            while (trimmed.endsWith("/")) {
                trimmed = trimmed.substring(0, trimmed.length() - 1);
            }
            return trimmed;
        }
    }
}
