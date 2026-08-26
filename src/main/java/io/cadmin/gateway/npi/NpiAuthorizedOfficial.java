package io.cadmin.gateway.npi;

public record NpiAuthorizedOfficial(
        String firstName,
        String middleName,
        String lastName,
        String prefix,
        String suffix,
        String credential,
        String title,
        String telephone,
        String displayName
) {
}
