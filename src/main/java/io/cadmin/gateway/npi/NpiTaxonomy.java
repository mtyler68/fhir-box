package io.cadmin.gateway.npi;

public record NpiTaxonomy(
        String code,
        String display,
        boolean primary,
        String license,
        String state
) {
}
