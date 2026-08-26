package io.cadmin.gateway.npi;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.cadmin.gateway.config.CadminProperties;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

@Service
public class NpiRegistryService {

    private final WebClient webClient;
    private final String version;

    public NpiRegistryService(CadminProperties properties, WebClient.Builder builder) {
        CadminProperties.NpiRegistry npi = properties.npiRegistry();
        this.version = npi.version();
        this.webClient = builder.clone()
                .baseUrl(npi.uri())
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public Mono<NpiLookupResult> lookup(String number) {
        return lookup(number, "individual");
    }

    public Mono<NpiLookupResult> lookup(String number, String kind) {
        String npi = normalize(number);
        if (!isNpi(npi)) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Enter a 10-digit NPI number."));
        }
        boolean organization = isOrganizationKind(kind);
        return webClient.get()
                .uri(uri -> uri.queryParam("version", version).queryParam("number", npi).build())
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> Mono.error(new ResponseStatusException(
                        response.statusCode().value() == 429
                                ? HttpStatus.TOO_MANY_REQUESTS
                                : HttpStatus.BAD_GATEWAY,
                        "NPI registry request failed")))
                .bodyToMono(CmsResponse.class)
                .flatMap(response -> toResult(npi, response, organization))
                .switchIfEmpty(notFound(organization));
    }

    static String normalize(String number) {
        return number == null ? "" : number.replaceAll("\\D", "");
    }

    static boolean isNpi(String number) {
        return number != null && number.matches("\\d{10}");
    }

    static boolean isOrganizationKind(String kind) {
        return kind != null && kind.equalsIgnoreCase("organization");
    }

    private Mono<NpiLookupResult> toResult(String npi, CmsResponse response, boolean organization) {
        if (response != null && response.errors() != null && !response.errors().isEmpty()) {
            return notFound(organization);
        }
        List<CmsProvider> results = response == null || response.results() == null
                ? List.of()
                : response.results();
        if (results.isEmpty() || (response.resultCount() != null && response.resultCount() == 0)) {
            return notFound(organization);
        }
        CmsProvider provider = results.getFirst();
        boolean providerIsOrg = isOrganization(provider);
        if (organization && !providerIsOrg) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "That NPI belongs to an individual, not an organization."));
        }
        if (!organization && providerIsOrg) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "That NPI belongs to an organization, not an individual."));
        }
        CmsBasic basic = provider.basic() == null ? emptyBasic() : provider.basic();
        List<CmsAddress> addresses = provider.addresses() == null ? List.of() : provider.addresses();
        String organizationName = text(basic.organizationName());
        String display = organization
                ? firstNonBlank(organizationName, displayName(basic))
                : firstNonBlank(displayName(basic), organizationName);
        return Mono.just(new NpiLookupResult(
                firstNonBlank(provider.number(), npi),
                text(basic.firstName()),
                text(basic.middleName()),
                text(basic.lastName()),
                text(basic.namePrefix()),
                text(basic.nameSuffix()),
                text(basic.credential()),
                genderOf(basic.sex()),
                text(basic.status()),
                display,
                organizationName,
                authorizedOfficialOf(basic),
                mailingOf(addresses),
                practiceLocationsOf(addresses, provider.practiceLocations()),
                taxonomiesOf(provider.taxonomies())));
    }

    static boolean isOrganization(CmsProvider provider) {
        String type = provider.enumerationType() == null ? "" : provider.enumerationType().trim();
        if (type.equalsIgnoreCase("NPI-2") || type.equals("2")) {
            return true;
        }
        if (type.equalsIgnoreCase("NPI-1") || type.equals("1")) {
            return false;
        }
        CmsBasic basic = provider.basic();
        if (basic == null) {
            return false;
        }
        return notBlank(basic.organizationName()) && isBlank(basic.lastName()) && isBlank(basic.firstName());
    }

    static NpiAddress mailingOf(List<CmsAddress> addresses) {
        return addresses.stream()
                .filter(address -> purposeIs(address, "MAILING"))
                .findFirst()
                .map(NpiRegistryService::toAddress)
                .orElseGet(() -> {
                    if (addresses.size() > 1 && !purposeIs(addresses.get(1), "LOCATION")) {
                        return toAddress(addresses.get(1));
                    }
                    return null;
                });
    }

    static List<NpiAddress> practiceLocationsOf(List<CmsAddress> addresses, List<CmsAddress> extra) {
        LinkedHashMap<String, NpiAddress> unique = new LinkedHashMap<>();
        Stream.concat(
                        addresses.stream().filter(address -> !purposeIs(address, "MAILING")),
                        extra == null ? Stream.empty() : extra.stream())
                .map(NpiRegistryService::toAddress)
                .filter(Objects::nonNull)
                .forEach(address -> unique.putIfAbsent(addressKey(address), address));
        if (unique.isEmpty() && addresses.size() == 1) {
            NpiAddress only = toAddress(addresses.getFirst());
            if (only != null) {
                unique.put(addressKey(only), only);
            }
        }
        return new ArrayList<>(unique.values());
    }

    static List<NpiTaxonomy> taxonomiesOf(List<CmsTaxonomy> taxonomies) {
        if (taxonomies == null) {
            return List.of();
        }
        return taxonomies.stream()
                .map(item -> new NpiTaxonomy(
                        text(item.code()),
                        text(item.desc()),
                        item.primary() != null && item.primary(),
                        text(item.license()),
                        text(item.state())))
                .filter(item -> notBlank(item.code()) || notBlank(item.display()))
                .toList();
    }

    static NpiAddress toAddress(CmsAddress address) {
        if (address == null) {
            return null;
        }
        String line1 = text(address.address1());
        String city = text(address.city());
        String state = text(address.state());
        if (isBlank(line1) && isBlank(city) && isBlank(state)) {
            return null;
        }
        return new NpiAddress(
                text(address.addressPurpose()),
                line1,
                text(address.address2()),
                city,
                state,
                formatPostal(address.postalCode()),
                countryOf(address),
                text(address.telephoneNumber()),
                text(address.faxNumber()),
                labelOf(line1, city, state));
    }

    static String genderOf(String sex) {
        String value = sex == null ? "" : sex.trim().toUpperCase(Locale.ROOT);
        if (value.startsWith("M") || value.equals("MALE")) {
            return "male";
        }
        if (value.startsWith("F") || value.equals("FEMALE")) {
            return "female";
        }
        return "unknown";
    }

    static String displayName(CmsBasic basic) {
        return joinName(basic.namePrefix(), basic.firstName(), basic.middleName(), basic.lastName(),
                basic.nameSuffix(), basic.credential());
    }

    static NpiAuthorizedOfficial authorizedOfficialOf(CmsBasic basic) {
        if (!hasAuthorizedOfficialName(basic)) {
            return null;
        }
        return new NpiAuthorizedOfficial(
                text(basic.authorizedOfficialFirstName()),
                text(basic.authorizedOfficialMiddleName()),
                text(basic.authorizedOfficialLastName()),
                text(basic.authorizedOfficialNamePrefix()),
                text(basic.authorizedOfficialNameSuffix()),
                text(basic.authorizedOfficialCredential()),
                text(basic.authorizedOfficialTitle()),
                text(basic.authorizedOfficialTelephone()),
                joinName(
                        basic.authorizedOfficialNamePrefix(),
                        basic.authorizedOfficialFirstName(),
                        basic.authorizedOfficialMiddleName(),
                        basic.authorizedOfficialLastName(),
                        basic.authorizedOfficialNameSuffix(),
                        basic.authorizedOfficialCredential()));
    }

    static boolean hasAuthorizedOfficialName(CmsBasic basic) {
        return notBlank(basic.authorizedOfficialFirstName())
                || notBlank(basic.authorizedOfficialMiddleName())
                || notBlank(basic.authorizedOfficialLastName())
                || notBlank(basic.authorizedOfficialNamePrefix())
                || notBlank(basic.authorizedOfficialNameSuffix());
    }

    static String joinName(String... parts) {
        return Stream.of(parts)
                .filter(NpiRegistryService::notBlank)
                .map(String::trim)
                .collect(Collectors.joining(" "));
    }

    static CmsBasic emptyBasic() {
        return new CmsBasic(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null);
    }

    static String formatPostal(String postal) {
        String digits = postal == null ? "" : postal.replaceAll("\\D", "");
        if (digits.length() == 9) {
            return digits.substring(0, 5) + "-" + digits.substring(5);
        }
        return text(postal);
    }

    static String countryOf(CmsAddress address) {
        String code = text(address.countryCode());
        if ("US".equalsIgnoreCase(code) || "USA".equalsIgnoreCase(code)) {
            return "US";
        }
        return notBlank(code) ? code : text(address.countryName());
    }

    static String labelOf(String line1, String city, String state) {
        String locality = Stream.of(city, state).filter(NpiRegistryService::notBlank).collect(Collectors.joining(", "));
        if (notBlank(line1) && notBlank(locality)) {
            return line1 + ", " + locality;
        }
        return firstNonBlank(line1, locality, "Practice location");
    }

    static String addressKey(NpiAddress address) {
        return Stream.of(address.line1(), address.line2(), address.city(), address.state(), address.postalCode())
                .map(value -> value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", ""))
                .collect(Collectors.joining("|"));
    }

    static boolean purposeIs(CmsAddress address, String purpose) {
        return address != null && address.addressPurpose() != null
                && address.addressPurpose().trim().equalsIgnoreCase(purpose);
    }

    private static Mono<NpiLookupResult> notFound(boolean organization) {
        return Mono.error(new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                organization
                        ? "No organization was found for that NPI."
                        : "No individual provider was found for that NPI."));
    }

    static String text(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? "" : trimmed;
    }

    static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    static String firstNonBlank(String... values) {
        return Stream.of(values).filter(NpiRegistryService::notBlank).findFirst().orElse("");
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CmsResponse(
            @JsonProperty("result_count") Integer resultCount,
            List<CmsProvider> results,
            @JsonProperty("Errors") @JsonAlias("errors") List<CmsError> errors
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CmsError(String description, String field, String number) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CmsProvider(
            String number,
            @JsonProperty("enumeration_type") String enumerationType,
            CmsBasic basic,
            List<CmsAddress> addresses,
            @JsonAlias({"practiceLocations", "practice_locations"}) List<CmsAddress> practiceLocations,
            List<CmsTaxonomy> taxonomies
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CmsBasic(
            @JsonProperty("first_name") String firstName,
            @JsonProperty("middle_name") String middleName,
            @JsonProperty("last_name") String lastName,
            @JsonProperty("name_prefix") String namePrefix,
            @JsonProperty("name_suffix") String nameSuffix,
            String credential,
            String sex,
            String status,
            @JsonProperty("organization_name") String organizationName,
            @JsonProperty("enumeration_date") String enumerationDate,
            @JsonProperty("authorized_official_first_name") String authorizedOfficialFirstName,
            @JsonProperty("authorized_official_middle_name") String authorizedOfficialMiddleName,
            @JsonProperty("authorized_official_last_name") String authorizedOfficialLastName,
            @JsonProperty("authorized_official_name_prefix") String authorizedOfficialNamePrefix,
            @JsonProperty("authorized_official_name_suffix") String authorizedOfficialNameSuffix,
            @JsonProperty("authorized_official_credential") String authorizedOfficialCredential,
            @JsonProperty("authorized_official_title_or_position") String authorizedOfficialTitle,
            @JsonProperty("authorized_official_telephone_number") String authorizedOfficialTelephone
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CmsAddress(
            @JsonProperty("address_purpose") String addressPurpose,
            @JsonProperty("address_1") String address1,
            @JsonProperty("address_2") String address2,
            String city,
            String state,
            @JsonProperty("postal_code") String postalCode,
            @JsonProperty("country_code") String countryCode,
            @JsonProperty("country_name") String countryName,
            @JsonProperty("telephone_number") String telephoneNumber,
            @JsonProperty("fax_number") String faxNumber
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CmsTaxonomy(
            String code,
            String desc,
            Boolean primary,
            String license,
            String state
    ) {
    }
}
