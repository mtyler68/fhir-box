package io.cadmin.gateway.web;

import io.cadmin.gateway.npi.NpiLookupResult;
import io.cadmin.gateway.npi.NpiRegistryService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(path = "/api", produces = MediaType.APPLICATION_JSON_VALUE)
public class NpiController {

    private final NpiRegistryService npiRegistryService;

    public NpiController(NpiRegistryService npiRegistryService) {
        this.npiRegistryService = npiRegistryService;
    }

    @GetMapping("/npi")
    public Mono<NpiLookupResult> lookup(
            @RequestParam(required = false) String number,
            @RequestParam(required = false, defaultValue = "individual") String kind
    ) {
        return npiRegistryService.lookup(number, kind);
    }
}
