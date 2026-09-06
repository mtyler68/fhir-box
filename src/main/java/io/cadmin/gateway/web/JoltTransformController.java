package io.cadmin.gateway.web;

import io.cadmin.gateway.jolt.JoltTransformException;
import io.cadmin.gateway.jolt.JoltTransformService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class JoltTransformController {

    private static final MediaType FHIR_JSON = MediaType.parseMediaType("application/fhir+json");

    private final JoltTransformService jolt;

    public JoltTransformController(JoltTransformService jolt) {
        this.jolt = jolt;
    }

    @PostMapping(value = "/jolt/$transform", consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public Object transform(@RequestBody(required = false) JoltTransformRequest request) {
        if (request == null) {
            throw new JoltTransformException("Request body is required");
        }
        return jolt.transform(request.input(), request.spec());
    }

    @ExceptionHandler(JoltTransformException.class)
    public ResponseEntity<Map<String, Object>> badRequest(JoltTransformException error) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .contentType(FHIR_JSON)
                .body(outcome(error.getMessage()));
    }

    static Map<String, Object> outcome(String diagnostics) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("text", diagnostics);
        Map<String, Object> issue = new LinkedHashMap<>();
        issue.put("severity", "error");
        issue.put("code", "processing");
        issue.put("details", details);
        issue.put("diagnostics", diagnostics);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("resourceType", "OperationOutcome");
        body.put("issue", List.of(issue));
        return body;
    }
}
