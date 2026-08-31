window.CadminWorkflow = (function () {
    const PUBLICATION = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "retired", display: "Retired" },
        { code: "unknown", display: "Unknown" }
    ];
    const REQUEST = [
        { code: "draft", display: "Draft" },
        { code: "active", display: "Active" },
        { code: "on-hold", display: "On hold" },
        { code: "revoked", display: "Revoked" },
        { code: "completed", display: "Completed" },
        { code: "entered-in-error", display: "Entered in error" },
        { code: "unknown", display: "Unknown" }
    ];
    const ACTION_STATUS = [
        { code: "scheduled", display: "Scheduled" },
        { code: "in-progress", display: "In progress" },
        { code: "completed", display: "Completed" },
        { code: "cancelled", display: "Cancelled" }
    ];
    const KINDS = [
        { code: "Task", display: "Task" },
        { code: "CommunicationRequest", display: "Communication request" },
        { code: "Appointment", display: "Appointment" },
        { code: "ServiceRequest", display: "Service request" }
    ];

    function labelOf(items, code) {
        const match = (items || []).find(function (item) { return item.code === code; });
        return match ? match.display : (code || "—");
    }

    function badge(status, items) {
        const kind = status === "active" || status === "in-progress" || status === "completed" ? "success"
            : status === "retired" || status === "revoked" || status === "cancelled" || status === "entered-in-error"
                ? "secondary"
                : status === "draft" || status === "scheduled" || status === "on-hold" ? "warning"
                    : "info";
        return '<span class="badge text-bg-' + kind + '">' +
            CadminApi.escapeHtml(labelOf(items, status)) + "</span>";
    }

    function conceptLabel(concept) {
        const first = Array.isArray(concept) ? concept[0] : concept;
        if (!first) {
            return "—";
        }
        const coding = (first.coding && first.coding[0]) || {};
        return first.text || coding.display || coding.code || "—";
    }

    function conceptCode(concept) {
        const first = Array.isArray(concept) ? concept[0] : concept;
        if (!first) {
            return "";
        }
        const coding = (first.coding && first.coding[0]) || {};
        return coding.code || first.text || "";
    }

    function extensionValue(resource, url) {
        const items = (resource && resource.extension) || [];
        for (let i = 0; i < items.length; i++) {
            if (items[i] && items[i].url === url) {
                return items[i].valueCode || items[i].valueString || items[i].valueDateTime || "";
            }
        }
        return "";
    }

    function optionsHtml(items, selected) {
        return items.map(function (item) {
            const mark = item.code === selected ? " selected" : "";
            return '<option value="' + CadminApi.escapeHtml(item.code) + '"' + mark + ">" +
                CadminApi.escapeHtml(item.display) + "</option>";
        }).join("");
    }

    function conditionExpr(action) {
        const conditions = (action && action.condition) || [];
        for (let i = 0; i < conditions.length; i++) {
            const expr = conditions[i] && conditions[i].expression && conditions[i].expression.expression;
            if (expr) {
                return expr;
            }
        }
        return "";
    }

    function definitionUrl(action) {
        return (action && (action.definitionCanonical || action.definitionUri)) || "";
    }

    return {
        publication: PUBLICATION,
        request: REQUEST,
        actionStatus: ACTION_STATUS,
        kinds: KINDS,
        publicationBadge: function (status) { return badge(status, PUBLICATION); },
        requestBadge: function (status) { return badge(status, REQUEST); },
        actionBadge: function (status) { return badge(status, ACTION_STATUS); },
        conceptLabel: conceptLabel,
        conceptCode: conceptCode,
        extensionValue: extensionValue,
        optionsHtml: optionsHtml,
        conditionExpr: conditionExpr,
        definitionUrl: definitionUrl,
        labelOf: labelOf
    };
}());
