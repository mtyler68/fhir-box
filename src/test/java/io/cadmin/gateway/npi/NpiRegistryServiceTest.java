package io.cadmin.gateway.npi;

import static org.assertj.core.api.Assertions.assertThat;

import io.cadmin.gateway.config.CadminProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

class NpiRegistryServiceTest {

    @Test
    void lookupMapsIndividualProviderAndPracticeLocations() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request -> {
            assertThat(request.url().toString()).contains("number=1234567893").contains("version=2.1");
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .body(individualJson())
                    .build());
        });
        NpiRegistryService service = new NpiRegistryService(properties(), builder);

        StepVerifier.create(service.lookup("123-456-7893"))
                .assertNext(result -> {
                    assertThat(result.npi()).isEqualTo("1234567893");
                    assertThat(result.firstName()).isEqualTo("ADA");
                    assertThat(result.lastName()).isEqualTo("LOVELACE");
                    assertThat(result.gender()).isEqualTo("female");
                    assertThat(result.credential()).isEqualTo("MD");
                    assertThat(result.mailing().city()).isEqualTo("PORTLAND");
                    assertThat(result.mailing().line1()).isEqualTo("PO BOX 1");
                    assertThat(result.practiceLocations()).hasSize(2);
                    assertThat(result.practiceLocations().getFirst().label()).contains("1 MAIN ST");
                    assertThat(result.practiceLocations().getFirst().postalCode()).isEqualTo("97201-4123");
                    assertThat(result.practiceLocations().get(1).city()).isEqualTo("BEAVERTON");
                    assertThat(result.taxonomies()).hasSize(1);
                    assertThat(result.taxonomies().getFirst().code()).isEqualTo("207Q00000X");
                    assertThat(result.taxonomies().getFirst().primary()).isTrue();
                    assertThat(result.organizationName()).isEmpty();
                    assertThat(result.authorizedOfficial()).isNull();
                })
                .verifyComplete();
    }

    @Test
    void lookupMapsOrganizationProviderAndPracticeLocations() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request -> {
            assertThat(request.url().toString()).contains("number=1234567890").contains("version=2.1");
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .body(organizationJson())
                    .build());
        });
        NpiRegistryService service = new NpiRegistryService(properties(), builder);

        StepVerifier.create(service.lookup("1234567890", "organization"))
                .assertNext(result -> {
                    assertThat(result.npi()).isEqualTo("1234567890");
                    assertThat(result.organizationName()).isEqualTo("ACME CLINIC");
                    assertThat(result.displayName()).isEqualTo("ACME CLINIC");
                    assertThat(result.status()).isEqualTo("A");
                    assertThat(result.authorizedOfficial()).isNotNull();
                    assertThat(result.authorizedOfficial().firstName()).isEqualTo("JANE");
                    assertThat(result.authorizedOfficial().lastName()).isEqualTo("DOE");
                    assertThat(result.authorizedOfficial().prefix()).isEqualTo("MS");
                    assertThat(result.authorizedOfficial().title()).isEqualTo("CEO");
                    assertThat(result.authorizedOfficial().telephone()).isEqualTo("5035550111");
                    assertThat(result.authorizedOfficial().displayName()).contains("JANE").contains("DOE");
                    assertThat(result.mailing().city()).isEqualTo("PORTLAND");
                    assertThat(result.mailing().line1()).isEqualTo("PO BOX 9");
                    assertThat(result.practiceLocations()).hasSize(1);
                    assertThat(result.practiceLocations().getFirst().label()).contains("100 CLINIC WAY");
                    assertThat(result.taxonomies()).hasSize(1);
                    assertThat(result.taxonomies().getFirst().code()).isEqualTo("261QP2300X");
                })
                .verifyComplete();
    }

    @Test
    void organizationNpiIsRejected() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request ->
                Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header(HttpHeaders.CONTENT_TYPE, "application/json")
                        .body("""
                                {"result_count":1,"results":[{
                                  "number":"1234567890",
                                  "enumeration_type":"NPI-2",
                                  "basic":{"organization_name":"ACME CLINIC"}
                                }]}
                                """)
                        .build()));
        NpiRegistryService service = new NpiRegistryService(properties(), builder);
        StepVerifier.create(service.lookup("1234567890"))
                .expectErrorSatisfies(error -> {
                    assertThat(error).isInstanceOf(ResponseStatusException.class);
                    ResponseStatusException status = (ResponseStatusException) error;
                    assertThat(status.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(status.getReason()).containsIgnoringCase("organization");
                })
                .verify();
    }

    @Test
    void individualNpiIsRejectedForOrganizationLookup() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request ->
                Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header(HttpHeaders.CONTENT_TYPE, "application/json")
                        .body(individualJson())
                        .build()));
        NpiRegistryService service = new NpiRegistryService(properties(), builder);
        StepVerifier.create(service.lookup("1234567893", "organization"))
                .expectErrorSatisfies(error -> {
                    assertThat(error).isInstanceOf(ResponseStatusException.class);
                    ResponseStatusException status = (ResponseStatusException) error;
                    assertThat(status.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(status.getReason()).containsIgnoringCase("individual");
                })
                .verify();
    }

    @Test
    void missingProviderIsNotFound() {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(request ->
                Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header(HttpHeaders.CONTENT_TYPE, "application/json")
                        .body("{\"result_count\":0,\"results\":[]}")
                        .build()));
        NpiRegistryService service = new NpiRegistryService(properties(), builder);
        StepVerifier.create(service.lookup("1234567893"))
                .expectErrorSatisfies(error -> {
                    assertThat(error).isInstanceOf(ResponseStatusException.class);
                    assertThat(((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
                })
                .verify();
    }

    @Test
    void invalidNumberIsBadRequest() {
        NpiRegistryService service = new NpiRegistryService(properties(), WebClient.builder());
        StepVerifier.create(service.lookup("123"))
                .expectErrorSatisfies(error -> {
                    assertThat(error).isInstanceOf(ResponseStatusException.class);
                    assertThat(((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                })
                .verify();
    }

    private static String organizationJson() {
        return """
                {"result_count":1,"results":[{
                  "number":"1234567890",
                  "enumeration_type":"NPI-2",
                  "basic":{
                    "organization_name":"ACME CLINIC",
                    "status":"A",
                    "authorized_official_first_name":"JANE",
                    "authorized_official_last_name":"DOE",
                    "authorized_official_name_prefix":"MS",
                    "authorized_official_title_or_position":"CEO",
                    "authorized_official_telephone_number":"5035550111"
                  },
                  "addresses":[
                    {
                      "address_purpose":"LOCATION",
                      "address_1":"100 CLINIC WAY",
                      "city":"PORTLAND",
                      "state":"OR",
                      "postal_code":"972014123",
                      "country_code":"US",
                      "telephone_number":"5035550199"
                    },
                    {
                      "address_purpose":"MAILING",
                      "address_1":"PO BOX 9",
                      "city":"PORTLAND",
                      "state":"OR",
                      "postal_code":"97201",
                      "country_code":"US"
                    }
                  ],
                  "taxonomies":[{"code":"261QP2300X","desc":"Clinic/Center","primary":true}]
                }]}
                """;
    }

    private static String individualJson() {
        return """
                {"result_count":1,"results":[{
                  "number":"1234567893",
                  "enumeration_type":"NPI-1",
                  "basic":{
                    "first_name":"ADA",
                    "last_name":"LOVELACE",
                    "credential":"MD",
                    "sex":"F",
                    "status":"A"
                  },
                  "addresses":[
                    {
                      "address_purpose":"LOCATION",
                      "address_1":"1 MAIN ST",
                      "city":"PORTLAND",
                      "state":"OR",
                      "postal_code":"972014123",
                      "country_code":"US",
                      "telephone_number":"5035550100"
                    },
                    {
                      "address_purpose":"MAILING",
                      "address_1":"PO BOX 1",
                      "city":"PORTLAND",
                      "state":"OR",
                      "postal_code":"97201",
                      "country_code":"US"
                    }
                  ],
                  "practiceLocations":[
                    {
                      "address_1":"9 OAK AVE",
                      "city":"BEAVERTON",
                      "state":"OR",
                      "postal_code":"97005",
                      "country_code":"US"
                    }
                  ],
                  "taxonomies":[{"code":"207Q00000X","desc":"Family Medicine","primary":true}]
                }]}
                """;
    }

    private static CadminProperties properties() {
        return new CadminProperties(
                new CadminProperties.Security("local", java.util.List.of()),
                new CadminProperties.Fhir("http://localhost:8081"),
                new CadminProperties.Geocode(
                        "https://nominatim.openstreetmap.org",
                        "FHIR-Box/0.1 (io.cadmin.gateway; location-geocoder)"),
                new CadminProperties.NpiRegistry(
                        "https://npiregistry.cms.hhs.gov/api/",
                        "2.1"),
                new CadminProperties.Wiremock("http://localhost:9090"));
    }
}
