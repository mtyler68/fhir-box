package io.cadmin.gateway.jolt;

import com.bazaarvoice.jolt.Chainr;
import com.bazaarvoice.jolt.exception.SpecException;
import com.bazaarvoice.jolt.exception.TransformException;
import org.springframework.stereotype.Service;

@Service
public class JoltTransformService {

    public Object transform(Object input, Object spec) {
        if (spec == null) {
            throw new JoltTransformException("Jolt spec is required");
        }
        if (input == null) {
            throw new JoltTransformException("JSON document is required");
        }
        try {
            return Chainr.fromSpec(spec).transform(input);
        } catch (SpecException error) {
            throw new JoltTransformException("Invalid Jolt spec: " + message(error));
        } catch (TransformException error) {
            throw new JoltTransformException("Jolt transform failed: " + message(error));
        }
    }

    private static String message(RuntimeException error) {
        String text = error.getMessage();
        return text == null || text.isBlank() ? error.getClass().getSimpleName() : text;
    }
}
