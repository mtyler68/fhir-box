package io.cadmin.gateway.keycloak;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class UserConflictException extends ResponseStatusException {

    private final Map<String, Boolean> available;

    public UserConflictException(Map<String, Boolean> available) {
        super(HttpStatus.CONFLICT, conflictMessage(available));
        this.available = available == null ? Map.of() : Map.copyOf(available);
    }

    public Map<String, Object> toBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", getReason());
        Map<String, Boolean> conflicts = new LinkedHashMap<>();
        conflicts.put("username", !available.getOrDefault("username", true));
        conflicts.put("email", !available.getOrDefault("email", true));
        conflicts.put("mobile", !available.getOrDefault("mobile", true));
        body.put("conflicts", conflicts);
        return body;
    }

    private static String conflictMessage(Map<String, Boolean> available) {
        if (available == null) {
            return "A user with these details already exists in the realm.";
        }
        if (!available.getOrDefault("username", true)) {
            return "Username is already used in this realm.";
        }
        if (!available.getOrDefault("email", true)) {
            return "Email is already used in this realm.";
        }
        if (!available.getOrDefault("mobile", true)) {
            return "Mobile number is already used in this realm.";
        }
        return "A user with these details already exists in the realm.";
    }
}
