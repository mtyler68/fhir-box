package io.cadmin.gateway.jolt;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JoltTransformServiceTest {

    private final JoltTransformService service = new JoltTransformService();

    @Test
    void transformsDocumentWithChainrShift() {
        Object input = Map.of(
                "rating", Map.of("primary", Map.of("value", 3, "max", 5)));
        Object spec = List.of(Map.of(
                "operation", "shift",
                "spec", Map.of(
                        "rating", Map.of(
                                "primary", Map.of(
                                        "value", "Rating",
                                        "max", "RatingRange")))));

        @SuppressWarnings("unchecked")
        Map<String, Object> output = (Map<String, Object>) service.transform(input, spec);

        assertEquals(3, output.get("Rating"));
        assertEquals(5, output.get("RatingRange"));
    }

    @Test
    void rejectsMissingSpec() {
        JoltTransformException error = assertThrows(JoltTransformException.class,
                () -> service.transform(Map.of("id", "1"), null));
        assertEquals("Jolt spec is required", error.getMessage());
    }

    @Test
    void rejectsMissingInput() {
        JoltTransformException error = assertThrows(JoltTransformException.class,
                () -> service.transform(null, List.of(Map.of("operation", "sort"))));
        assertEquals("JSON document is required", error.getMessage());
    }

    @Test
    void rejectsInvalidSpec() {
        JoltTransformException error = assertThrows(JoltTransformException.class,
                () -> service.transform(Map.of("id", "1"), Map.of("operation", "shift")));
        assertTrue(error.getMessage().startsWith("Invalid Jolt spec:"));
    }
}
