package io.cadmin.gateway.npi;

import java.util.List;

public record NpiLookupResult(
        String npi,
        String firstName,
        String middleName,
        String lastName,
        String prefix,
        String suffix,
        String credential,
        String gender,
        String status,
        String displayName,
        String organizationName,
        NpiAuthorizedOfficial authorizedOfficial,
        NpiAddress mailing,
        List<NpiAddress> practiceLocations,
        List<NpiTaxonomy> taxonomies
) {
}
