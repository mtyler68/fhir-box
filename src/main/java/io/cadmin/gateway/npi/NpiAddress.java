package io.cadmin.gateway.npi;

public record NpiAddress(
        String purpose,
        String line1,
        String line2,
        String city,
        String state,
        String postalCode,
        String country,
        String telephone,
        String fax,
        String label
) {
}
