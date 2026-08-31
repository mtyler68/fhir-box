window.CadminScheduling = (function () {
    const APPOINTMENT_STATUS = [
        { code: "proposed", display: "Proposed" },
        { code: "pending", display: "Pending" },
        { code: "booked", display: "Booked" },
        { code: "arrived", display: "Arrived" },
        { code: "fulfilled", display: "Fulfilled" },
        { code: "cancelled", display: "Cancelled" },
        { code: "noshow", display: "No show" },
        { code: "entered-in-error", display: "Entered in error" },
        { code: "checked-in", display: "Checked in" },
        { code: "waitlist", display: "Waitlist" }
    ];
    const SLOT_STATUS = [
        { code: "busy", display: "Busy" },
        { code: "free", display: "Free" },
        { code: "busy-unavailable", display: "Busy unavailable" },
        { code: "busy-tentative", display: "Busy tentative" },
        { code: "entered-in-error", display: "Entered in error" }
    ];
    const RESPONSE_STATUS = [
        { code: "accepted", display: "Accepted" },
        { code: "declined", display: "Declined" },
        { code: "tentative", display: "Tentative" },
        { code: "needs-action", display: "Needs action" },
        { code: "entered-in-error", display: "Entered in error" }
    ];

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function conceptLabel(cc) {
        const item = Array.isArray(cc) ? cc[0] : cc;
        if (!item) {
            return "—";
        }
        const coding = (item.coding && item.coding[0]) || item;
        return item.text || coding.display || coding.code || "—";
    }

    function refLabel(ref) {
        if (!ref) {
            return "—";
        }
        const first = Array.isArray(ref) ? ref[0] : ref;
        return first.display || (first.reference || "").replace(/^[^/]+\//, "") || "—";
    }

    function refHtml(ref) {
        const first = Array.isArray(ref) ? ref[0] : ref;
        const type = CadminApi.referenceType(first);
        const id = CadminApi.referenceId(first);
        if (type && id) {
            return CadminApi.resourceLink(CadminApi.detailHref(type, id), refLabel(first));
        }
        return esc(refLabel(first));
    }

    function formatWhen(value) {
        if (!value) {
            return "—";
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    function windowLabel(start, end) {
        if (!start && !end) {
            return "—";
        }
        return formatWhen(start) + " – " + formatWhen(end);
    }

    function statusBadge(status, catalog) {
        const kind = status === "booked" || status === "free" || status === "accepted" || status === "active"
            ? "success"
            : status === "pending" || status === "busy-tentative" || status === "tentative" || status === "proposed"
                ? "warning"
                : status === "cancelled" || status === "noshow" || status === "entered-in-error" || status === "declined"
                    ? "danger"
                    : status === "busy" || status === "arrived" || status === "checked-in"
                        ? "primary"
                        : "secondary";
        return '<span class="badge text-bg-' + kind + '">' +
            esc(CadminApi.valueSetDisplay(catalog, status) || status || "—") + "</span>";
    }

    function appointmentSubject(appointment) {
        const participants = (appointment && appointment.participant) || [];
        for (let i = 0; i < participants.length; i++) {
            const actor = participants[i] && participants[i].actor;
            const type = CadminApi.referenceType(actor);
            if (type === "Patient") {
                return actor;
            }
        }
        return (participants[0] && participants[0].actor) || null;
    }

    function participantOfType(appointment, type) {
        const participants = (appointment && appointment.participant) || [];
        for (let i = 0; i < participants.length; i++) {
            const actor = participants[i] && participants[i].actor;
            if (CadminApi.referenceType(actor) === type) {
                return actor;
            }
        }
        return null;
    }

    function actorsLabel(resource) {
        return ((resource && resource.actor) || []).map(refLabel).filter(function (item) {
            return item && item !== "—";
        }).join(", ") || "—";
    }

    function relatedCard(id, extra) {
        return '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                '<h6 class="m-0">Appointments</h6>' +
                '<a class="btn btn-sm btn-outline-primary" href="#/appointment-book">Find and book</a>' +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle mb-0">' +
                        "<thead><tr><th>When</th><th>Status</th><th>Subject</th><th></th></tr></thead>" +
                        '<tbody id="' + id + '"><tr><td colspan="4" class="text-muted">Loading…</td></tr></tbody>' +
                    "</table>" +
                "</div>" +
                (extra || "") +
            "</div>" +
        "</div>";
    }

    function loadRelated(tbodyId, query) {
        CadminApi.fhir("/Appointment?" + query + "&_sort=-date&_count=8").done(function (bundle) {
            const rows = CadminApi.bundleResources(bundle, "Appointment");
            if (!rows.length) {
                $("#" + tbodyId).html('<tr><td colspan="4" class="text-muted">No appointments.</td></tr>');
                return;
            }
            $("#" + tbodyId).html(rows.map(function (appointment) {
                const href = CadminApi.detailHref("Appointment", appointment.id);
                return "<tr>" +
                    "<td>" + CadminApi.resourceLink(href, windowLabel(appointment.start, appointment.end)) + "</td>" +
                    "<td>" + statusBadge(appointment.status, APPOINTMENT_STATUS) + "</td>" +
                    "<td>" + refHtml(appointmentSubject(appointment)) + "</td>" +
                    '<td class="text-end"><a class="btn btn-sm btn-outline-primary" href="' + esc(href) +
                        '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a></td>' +
                    "</tr>";
            }).join(""));
        }).fail(function () {
            $("#" + tbodyId).html('<tr><td colspan="4" class="text-muted">Unable to load appointments.</td></tr>');
        });
    }

    return {
        appointmentStatus: APPOINTMENT_STATUS,
        slotStatus: SLOT_STATUS,
        responseStatus: RESPONSE_STATUS,
        conceptLabel: conceptLabel,
        refLabel: refLabel,
        refHtml: refHtml,
        formatWhen: formatWhen,
        windowLabel: windowLabel,
        statusBadge: statusBadge,
        appointmentSubject: appointmentSubject,
        participantOfType: participantOfType,
        actorsLabel: actorsLabel,
        relatedCard: relatedCard,
        loadRelated: loadRelated
    };
}());
