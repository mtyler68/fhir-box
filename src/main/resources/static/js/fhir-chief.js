window.CadminFhirChief = (function () {
    function parameters(values) {
        const resource = { resourceType: "Parameters", parameter: [] };
        Object.keys(values || {}).forEach(function (name) {
            const value = values[name];
            if (value == null || value === "") {
                return;
            }
            const item = { name: name };
            if (typeof value === "object" && value.reference) {
                item.valueReference = value;
            } else if (typeof value === "number") {
                item.valueInteger = value;
            } else if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) {
                item.valueDateTime = value;
            } else {
                item.valueString = String(value);
            }
            resource.parameter.push(item);
        });
        return resource;
    }

    function resourceParam(body, name) {
        const items = (body && body.parameter) || [];
        for (let i = 0; i < items.length; i++) {
            if (items[i] && items[i].name === name && items[i].resource) {
                return items[i].resource;
            }
        }
        return null;
    }

    function op(path, values) {
        return CadminApi.fhirChief(path, "POST", parameters(values || {}));
    }

    return {
        parameters: parameters,
        resourceParam: resourceParam,
        find: function (values) { return op("/Appointment/$find", values); },
        hold: function (values) { return op("/Appointment/$hold", values); },
        book: function (values) { return op("/Appointment/$book", values); },
        cancel: function (values) { return op("/Appointment/$cancel", values); },
        reschedule: function (values) { return op("/Appointment/$reschedule", values); },
        propose: function (values) { return op("/Appointment/$propose", values); },
        generateSlots: function (scheduleId) {
            return CadminApi.fhirChief("/Schedule/" + encodeURIComponent(scheduleId) + "/$generate-slots", "POST",
                { resourceType: "Parameters" });
        },
        apply: function (planId, values) {
            return CadminApi.fhirChief("/PlanDefinition/" + encodeURIComponent(planId) + "/$apply", "POST",
                parameters(values || {}));
        },
        advance: function (orchestrationId, values) {
            return CadminApi.fhirChief("/RequestOrchestration/" + encodeURIComponent(orchestrationId) + "/$advance",
                "POST", parameters(values || {}));
        },
        cancelPlan: function (orchestrationId, values) {
            return CadminApi.fhirChief("/RequestOrchestration/" + encodeURIComponent(orchestrationId) + "/$cancel",
                "POST", parameters(values || {}));
        },
        status: function () { return CadminApi.fhirChief("/status"); }
    };
}());
