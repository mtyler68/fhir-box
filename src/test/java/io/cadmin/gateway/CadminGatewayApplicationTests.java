package io.cadmin.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.BodyInserters;

@SpringBootTest
@AutoConfigureWebTestClient
@ActiveProfiles("local")
class CadminGatewayApplicationTests {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void contextLoads() {
    }

    @Test
    void authConfigIsPublic() {
        webTestClient.get()
                .uri("/api/auth/config")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.mode").isEqualTo("local")
                .jsonPath("$.oidcIssuer").isEqualTo("")
                .jsonPath("$.oidcSubjectSystem").isEqualTo("https://insulet.com/fhir/identifier/oidc/subject")
                .jsonPath("$.keycloakIssuer").isEqualTo("http://localhost:8180/realms/cadmin")
                .jsonPath("$.keycloakClientId").isEqualTo("cadmin-gateway")
                .jsonPath("$.keycloakRealm").isEqualTo("cadmin")
                .jsonPath("$.fhirBaseUrl").isEqualTo("/fhir");
    }

    @Test
    void fhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/Patient")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void organizationFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/Organization")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void organizationFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/Organization")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void organizationRelatedFhirIsForbiddenForNonAdmin() {
        webTestClient.get().uri("/fhir/Location").header("Accept", "application/fhir+json")
                .exchange().expectStatus().isForbidden();
        webTestClient.get().uri("/fhir/OrganizationAffiliation").header("Accept", "application/fhir+json")
                .exchange().expectStatus().isForbidden();
        webTestClient.get().uri("/fhir/Endpoint").header("Accept", "application/fhir+json")
                .exchange().expectStatus().isForbidden();
        webTestClient.get().uri("/fhir/PractitionerRole").header("Accept", "application/fhir+json")
                .exchange().expectStatus().isForbidden();
        webTestClient.get().uri("/fhir/HealthcareService").header("Accept", "application/fhir+json")
                .exchange().expectStatus().isForbidden();
    }

    @Test
    void healthcareServiceFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/HealthcareService")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void careTeamFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/CareTeam")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void careTeamFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/CareTeam")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void libraryFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/Library")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void libraryFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/Library")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void searchParameterFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/SearchParameter")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void searchParameterFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/SearchParameter")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void questionnaireFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/Questionnaire")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void questionnaireFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/Questionnaire")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void codeSystemFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/CodeSystem")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void codeSystemFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/CodeSystem")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void valueSetFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/ValueSet")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void valueSetFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/ValueSet")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void endpointFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/Endpoint")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void subscriptionFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/Subscription")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
        webTestClient.get()
                .uri("/fhir/SubscriptionTopic")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void subscriptionFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/Subscription")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
        webTestClient.get()
                .uri("/fhir/SubscriptionTopic")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void consentFhirRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir/Consent")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void consentFhirIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/Consent")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void geocodeRequiresAuthentication() {
        webTestClient.get()
                .uri("/api/geocode?q=Portland")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void geocodeIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/api/geocode?q=Portland")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void geocodeRequiresAddress() {
        webTestClient.get()
                .uri("/api/geocode")
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    void npiRequiresAuthentication() {
        webTestClient.get()
                .uri("/api/npi?number=1234567893")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void npiRejectsInvalidNumber() {
        webTestClient.get()
                .uri("/api/npi?number=123")
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    void currentUserRequiresAuthentication() {
        webTestClient.get()
                .uri("/api/auth/me")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN", "USER"})
    void currentUserReturnsAuthenticatedPrincipal() {
        webTestClient.get()
                .uri("/api/auth/me")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.username").isEqualTo("admin")
                .jsonPath("$.mode").isEqualTo("local");
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void localUsersAreListedForAuthenticatedCaller() {
        webTestClient.get()
                .uri("/api/auth/users")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[0].username").isEqualTo("admin")
                .jsonPath("$[1].username").isEqualTo("clinician");
    }

    @Test
    void loginRedirectsToHtml() {
        webTestClient.get()
                .uri("/login?error")
                .exchange()
                .expectStatus().isFound()
                .expectHeader().valueEquals(org.springframework.http.HttpHeaders.LOCATION, "/login.html?error");
    }

    @Test
    void adminCanSignInViaFormLogin() {
        webTestClient.post()
                .uri("/login")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("username", "admin").with("password", "admin"))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.authenticated").isEqualTo(true)
                .jsonPath("$.username").isEqualTo("admin");
    }

    @Test
    void adminCanSignInViaJsonLoginAtRoot() {
        webTestClient.post()
                .uri("/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"username\":\"admin\",\"password\":\"admin\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.authenticated").isEqualTo(true)
                .jsonPath("$.username").isEqualTo("admin");
    }

    @Test
    void adminCanSignInViaJsonLogin() {
        webTestClient.post()
                .uri("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"username\":\"admin\",\"password\":\"admin\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.authenticated").isEqualTo(true)
                .jsonPath("$.username").isEqualTo("admin");
    }

    @Test
    void wiremockRequiresAuthentication() {
        webTestClient.get()
                .uri("/wiremock/__admin/mappings")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void oidcTokenRequiresAuthentication() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"username\":\"admin\",\"password\":\"admin\"}")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN", "USER"})
    void oidcTokenRejectsUnknownGrant() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"grantType\":\"refresh_token\"}")
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void oidcTokenIsForbiddenForNonAdmin() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"username\":\"admin\",\"password\":\"admin\"}")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void createOidcUserIsForbiddenForNonAdmin() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/api/auth/users")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"firstName\":\"Jane\",\"lastName\":\"Doe\",\"username\":\"jane.doe\"}")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void oidcClientsRequireAuthentication() {
        webTestClient.get()
                .uri("/api/auth/clients")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void oidcClientsAreForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/api/auth/clients")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN", "USER"})
    void oidcClientsAreNotFoundWhenOidcIsDisabled() {
        webTestClient.get()
                .uri("/api/auth/clients")
                .exchange()
                .expectStatus().isNotFound();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN", "USER"})
    void createOidcClientIsNotFoundWhenOidcIsDisabled() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/api/auth/clients")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"clientId\":\"abbott-usa\"}")
                .exchange()
                .expectStatus().isNotFound();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN", "USER"})
    void createOidcUserIsNotFoundWhenOidcIsDisabled() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/api/auth/users")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"firstName\":\"Jane\",\"lastName\":\"Doe\",\"username\":\"jane.doe\"}")
                .exchange()
                .expectStatus().isNotFound();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void patientExpungeIsForbiddenForNonAdmin() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/fhir/Patient/$expunge")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"resourceType\":\"Parameters\"}")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void wiremockIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/wiremock/__admin/mappings")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void coreAdminBridgeRequiresAuthentication() {
        webTestClient.get()
                .uri("/core-admin-bridge/actuator/camel")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void coreAdminBridgeIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/core-admin-bridge/actuator/camel")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void fhirChiefRequiresAuthentication() {
        webTestClient.get()
                .uri("/fhir-chief/status")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void fhirChiefIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir-chief/status")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void icgRequiresAuthentication() {
        webTestClient.get()
                .uri("/icg/status")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void icgIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/icg/status")
                .header("Accept", "application/json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void scheduleIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/Schedule")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void planDefinitionIsForbiddenForNonAdmin() {
        webTestClient.get()
                .uri("/fhir/PlanDefinition")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
        webTestClient.get()
                .uri("/fhir/ActivityDefinition")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
        webTestClient.get()
                .uri("/fhir/RequestOrchestration")
                .header("Accept", "application/fhir+json")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void joltTransformRequiresAuthentication() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/jolt/$transform")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"input\":{},\"spec\":[]}")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @WithMockUser(username = "clinician", roles = {"USER"})
    void joltTransformIsForbiddenForNonAdmin() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/jolt/$transform")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"input\":{},\"spec\":[]}")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN", "USER"})
    void joltTransformRunsChainrShift() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/jolt/$transform")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {
                          "input": { "rating": { "primary": { "value": 3, "max": 5 } } },
                          "spec": [{
                            "operation": "shift",
                            "spec": { "rating": { "primary": { "value": "Rating", "max": "RatingRange" } } }
                          }]
                        }
                        """)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.Rating").isEqualTo(3)
                .jsonPath("$.RatingRange").isEqualTo(5);
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN", "USER"})
    void joltTransformRejectsMissingSpec() {
        webTestClient.mutateWith(SecurityMockServerConfigurers.csrf())
                .post()
                .uri("/jolt/$transform")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"input\":{\"id\":\"1\"}}")
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.resourceType").isEqualTo("OperationOutcome")
                .jsonPath("$.issue[0].diagnostics").isEqualTo("Jolt spec is required");
    }

    @Test
    void unknownUserIsRejected() {
        webTestClient.post()
                .uri("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"username\":\"admin\",\"password\":\"wrong\"}")
                .exchange()
                .expectStatus().isUnauthorized();
    }
}
