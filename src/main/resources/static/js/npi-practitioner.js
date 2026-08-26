window.CadminNpiPractitioner = (function ($) {
    const MODAL_ID = "cadmin-npi-practitioner-modal";
    const NPI_SYSTEM = "http://hl7.org/fhir/sid/us-npi";
    const TAXONOMY_SYSTEM = "http://nucc.org/provider-taxonomy";
    let bound = false;
    let step = 1;
    let lookup = null;
    let creating = false;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function isAdmin() {
        return window.CadminApp && typeof CadminApp.isAdmin === "function" && CadminApp.isAdmin();
    }

    function menuItem() {
        bindOnce();
        return {
            label: "From NPI number",
            icon: "bi bi-person-vcard",
            attrs: "data-npi-practitioner"
        };
    }

    function digits(value) {
        return String(value || "").replace(/\D/g, "");
    }

    function titleCase(value) {
        const text = String(value || "").trim();
        if (!text) {
            return "";
        }
        if (/^[A-Z]{1,6}\.?$/.test(text)) {
            return text;
        }
        return text.toLowerCase().replace(/(^|[\s\-'])[a-z]/g, function (ch) {
            return ch.toUpperCase();
        });
    }

    function xhrMessage(xhr, fallback) {
        const body = xhr && xhr.responseJSON;
        return (body && (body.detail || body.message || body.error)) || fallback;
    }

    function uuid() {
        if (window.crypto && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {
            const rand = Math.random() * 16 | 0;
            const value = ch === "x" ? rand : (rand & 0x3 | 0x8);
            return value.toString(16);
        });
    }

    function ensureModal() {
        if (document.getElementById(MODAL_ID)) {
            return;
        }
        $("body").append(
            '<div class="modal fade" id="' + MODAL_ID + '" tabindex="-1" aria-labelledby="' +
                MODAL_ID + '-title">' +
                '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title" id="' + MODAL_ID + '-title">Create practitioner from NPI</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        "</div>" +
                        '<div class="modal-body">' +
                            '<ol class="npi-wizard-steps mb-3" id="' + MODAL_ID + '-steps">' +
                                '<li class="npi-wizard-step" data-npi-step="1">Enter NPI</li>' +
                                '<li class="npi-wizard-step" data-npi-step="2">Review</li>' +
                                '<li class="npi-wizard-step" data-npi-step="3">Summary</li>' +
                            "</ol>" +
                            '<div id="' + MODAL_ID + '-alert" class="alert alert-danger d-none"></div>' +
                            '<div data-npi-pane="1">' +
                                '<p class="text-muted">Look up an individual provider in the CMS NPI Registry.</p>' +
                                '<label class="form-label" for="' + MODAL_ID + '-number">NPI number</label>' +
                                '<input class="form-control" id="' + MODAL_ID +
                                    '-number" inputmode="numeric" maxlength="10" autocomplete="off" ' +
                                    'placeholder="10-digit NPI">' +
                            "</div>" +
                            '<div data-npi-pane="2" class="d-none" id="' + MODAL_ID + '-review"></div>' +
                            '<div data-npi-pane="3" class="d-none" id="' + MODAL_ID + '-summary"></div>' +
                        "</div>" +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="button" class="btn btn-outline-secondary" id="' + MODAL_ID +
                                '-back">Back</button>' +
                            '<button type="button" class="btn btn-primary" id="' + MODAL_ID + '-next">Next</button>' +
                            '<button type="button" class="btn btn-primary d-none" id="' + MODAL_ID +
                                '-create">Create</button>' +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
        $("#" + MODAL_ID).on("shown.bs.modal", function () {
            $("#" + MODAL_ID + "-number").trigger("focus");
        });
        $("#" + MODAL_ID).on("hidden.bs.modal", reset);
        $("#" + MODAL_ID + "-next").on("click", goNext);
        $("#" + MODAL_ID + "-back").on("click", goBack);
        $("#" + MODAL_ID + "-create").on("click", runCreate);
        $("#" + MODAL_ID + "-number").on("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                goNext();
            }
        });
        $("#" + MODAL_ID + "-number").on("input", function () {
            this.value = digits(this.value).slice(0, 10);
        });
        $("#" + MODAL_ID).on("change", "#npi-create-locations", function () {
            const on = $(this).is(":checked");
            $("#npi-location-list input[type=checkbox]").prop("disabled", !on);
        });
        $("#" + MODAL_ID).on("click", "#" + MODAL_ID + "-view-fhir", function () {
            showGeneratedFhir();
        });
    }

    function showAlert(message) {
        $("#" + MODAL_ID + "-alert").removeClass("d-none").text(message || "");
    }

    function hideAlert() {
        $("#" + MODAL_ID + "-alert").addClass("d-none").text("");
    }

    function setBusy(busy) {
        $("#" + MODAL_ID + "-next, #" + MODAL_ID + "-back, #" + MODAL_ID + "-create")
            .prop("disabled", !!busy);
        $("#" + MODAL_ID + "-next").toggleClass("disabled", !!busy);
    }

    function showStep(next) {
        step = next;
        hideAlert();
        $("#" + MODAL_ID + " [data-npi-pane]").addClass("d-none");
        $("#" + MODAL_ID + " [data-npi-pane=\"" + step + "\"]").removeClass("d-none");
        $("#" + MODAL_ID + "-steps .npi-wizard-step").each(function () {
            const value = Number($(this).attr("data-npi-step"));
            $(this).toggleClass("active", value === step);
            $(this).toggleClass("done", value < step);
        });
        $("#" + MODAL_ID + "-back").toggleClass("d-none", step === 1);
        $("#" + MODAL_ID + "-next").toggleClass("d-none", step === 3);
        $("#" + MODAL_ID + "-create").toggleClass("d-none", step !== 3);
    }

    function reset() {
        lookup = null;
        creating = false;
        setBusy(false);
        $("#" + MODAL_ID + "-number").val("");
        $("#" + MODAL_ID + "-review, #" + MODAL_ID + "-summary").empty();
        showStep(1);
    }

    function open() {
        ensureModal();
        reset();
        bootstrap.Modal.getOrCreateInstance(document.getElementById(MODAL_ID)).show();
    }

    function dl(rows) {
        return '<dl class="row mb-0">' + rows.map(function (row) {
            return '<dt class="col-sm-4">' + esc(row[0]) + '</dt><dd class="col-sm-8">' + row[1] + "</dd>";
        }).join("") + "</dl>";
    }

    function addressText(address) {
        if (!address) {
            return "—";
        }
        return [
            [address.line1, address.line2].filter(Boolean).join(" "),
            [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
            address.country
        ].filter(Boolean).join(" · ") || "—";
    }

    function genderLabel(code) {
        if (code === "male") {
            return "Male";
        }
        if (code === "female") {
            return "Female";
        }
        return "Unknown";
    }

    function renderReview() {
        const result = lookup;
        const taxonomies = (result.taxonomies || []).map(function (item) {
            return esc((item.display || item.code || "") + (item.primary ? " (primary)" : ""));
        }).join("<br>") || "—";
        const locations = result.practiceLocations || [];
        let locationBlock = '<p class="text-muted mb-0">No practice locations were returned for this NPI.</p>';
        if (locations.length && isAdmin()) {
            locationBlock =
                '<div class="form-check mb-2">' +
                    '<input class="form-check-input" type="checkbox" id="npi-create-locations" checked>' +
                    '<label class="form-check-label" for="npi-create-locations">' +
                        "Create practice locations as FHIR Location resources and a PractitionerRole that links them" +
                    "</label></div>" +
                '<div id="npi-location-list" class="ps-1">' +
                    locations.map(function (location, index) {
                        return '<div class="form-check">' +
                            '<input class="form-check-input" type="checkbox" id="npi-loc-' + index +
                            '" data-npi-loc="' + index + '" checked>' +
                            '<label class="form-check-label" for="npi-loc-' + index + '">' +
                            esc(location.label || addressText(location)) +
                            (location.telephone ? '<div class="small text-muted">' +
                                esc(location.telephone) + "</div>" : "") +
                            "</label></div>";
                    }).join("") +
                "</div>";
        } else if (locations.length) {
            locationBlock = "<ul class=\"mb-0\">" + locations.map(function (location) {
                return "<li>" + esc(location.label || addressText(location)) + "</li>";
            }).join("") + "</ul>";
        }
        $("#" + MODAL_ID + "-review").html(
            '<h6 class="mb-3">Provider</h6>' +
            dl([
                ["Name", esc(result.displayName || "—")],
                ["NPI", "<code>" + esc(result.npi) + "</code>"],
                ["Gender", esc(genderLabel(result.gender))],
                ["Credential", esc(result.credential || "—")],
                ["Status", esc(result.status === "A" || !result.status ? "Active" : result.status)],
                ["Specialties", taxonomies],
                ["Mailing address", esc(addressText(result.mailing))]
            ]) +
            '<h6 class="mt-4 mb-3">Practice locations</h6>' +
            locationBlock
        );
    }

    function selectedLocations() {
        if (!lookup || !isAdmin() || !$("#npi-create-locations").is(":checked")) {
            return [];
        }
        const all = lookup.practiceLocations || [];
        return $("#npi-location-list [data-npi-loc]:checked").map(function () {
            return all[Number($(this).attr("data-npi-loc"))];
        }).get().filter(Boolean);
    }

    function renderSummary() {
        const resources = plannedResources();
        const rows = resources.map(function (item) {
            return "<tr><td>" + esc(item.resource.resourceType) + "</td><td>" + esc(item.title) + "</td></tr>";
        }).join("");
        $("#" + MODAL_ID + "-summary").html(
            '<p class="text-muted">These FHIR resources will be created.</p>' +
            '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                "<thead><tr><th>Type</th><th>Summary</th></tr></thead>" +
                "<tbody>" + rows + "</tbody></table></div>" +
            '<button class="btn btn-outline-primary mt-3" type="button" id="' + MODAL_ID + '-view-fhir">' +
                '<i class="bi bi-code-slash me-1"></i>View FHIR</button>'
        );
    }

    function fhirAddress(location, props) {
        if (!location) {
            return null;
        }
        const address = {};
        if (props && props.use) {
            address.use = props.use;
        }
        if (props && props.type) {
            address.type = props.type;
        }
        const line = [location.line1, location.line2].filter(Boolean);
        if (line.length) {
            address.line = line;
        }
        if (location.city) {
            address.city = titleCase(location.city);
        }
        if (location.state) {
            address.state = String(location.state).toUpperCase();
        }
        if (location.postalCode) {
            address.postalCode = location.postalCode;
        }
        if (location.country) {
            address.country = location.country;
        }
        return address.line || address.city || address.state ? address : null;
    }

    function pushTelecom(list, system, value) {
        if (!value) {
            return;
        }
        const exists = list.some(function (item) {
            return item.system === system && item.value === value;
        });
        if (!exists) {
            list.push({ system: system, value: value });
        }
    }

    function practitionerResource(result) {
        const given = [result.firstName, result.middleName].filter(Boolean).map(titleCase);
        const name = { use: "official", family: titleCase(result.lastName) || result.displayName || "Unknown" };
        if (given.length) {
            name.given = given;
        }
        if (result.prefix) {
            name.prefix = [titleCase(result.prefix)];
        }
        const suffix = [result.suffix, result.credential].filter(Boolean);
        if (suffix.length) {
            name.suffix = suffix;
        }
        if (result.displayName) {
            name.text = titleCase(result.displayName);
        }
        const resource = {
            resourceType: "Practitioner",
            active: !result.status || String(result.status).toUpperCase() === "A",
            identifier: [{ system: NPI_SYSTEM, value: result.npi, use: "official" }],
            name: [name],
            gender: result.gender || "unknown"
        };
        const telecom = [];
        pushTelecom(telecom, "phone", result.mailing && result.mailing.telephone);
        pushTelecom(telecom, "fax", result.mailing && result.mailing.fax);
        (result.practiceLocations || []).forEach(function (location) {
            pushTelecom(telecom, "phone", location.telephone);
            pushTelecom(telecom, "fax", location.fax);
        });
        if (telecom.length) {
            resource.telecom = telecom;
        }
        const mailing = fhirAddress(result.mailing, { type: "postal" });
        if (mailing) {
            resource.address = [mailing];
        }
        const qualifications = (result.taxonomies || []).map(function (item) {
            const coding = {};
            if (item.code) {
                coding.system = TAXONOMY_SYSTEM;
                coding.code = item.code;
            }
            if (item.display) {
                coding.display = item.display;
            }
            const qualification = { code: {} };
            if (coding.code || coding.display) {
                qualification.code.coding = [coding];
            }
            if (item.display) {
                qualification.code.text = item.display;
            }
            return qualification;
        }).filter(function (item) {
            return item.code && (item.code.coding || item.code.text);
        });
        if (qualifications.length) {
            resource.qualification = qualifications;
        }
        return resource;
    }

    function locationResource(location) {
        const resource = {
            resourceType: "Location",
            status: "active",
            name: location.label || [location.line1, location.city].filter(Boolean).join(", ") || "Practice location",
            mode: "instance",
            physicalType: {
                coding: [{
                    system: "http://terminology.hl7.org/CodeSystem/location-physical-type",
                    code: "si",
                    display: "Site"
                }]
            }
        };
        const address = fhirAddress(location, { use: "work", type: "physical" });
        if (address) {
            resource.address = address;
        }
        const telecom = [];
        pushTelecom(telecom, "phone", location.telephone);
        pushTelecom(telecom, "fax", location.fax);
        if (telecom.length) {
            resource.telecom = telecom;
        }
        return resource;
    }

    function practitionerName(resource) {
        const name = (resource.name && resource.name[0]) || {};
        return name.text || [((name.given || []).join(" ")), name.family].filter(Boolean).join(" ") || "Practitioner";
    }

    function plannedResources() {
        const practitioner = practitionerResource(lookup);
        const items = [{
            title: practitionerName(practitioner) + " · NPI " + lookup.npi,
            resource: practitioner,
            fullUrl: "urn:uuid:" + uuid()
        }];
        const locations = selectedLocations();
        const locItems = locations.map(function (location) {
            const resource = locationResource(location);
            return {
                title: resource.name,
                resource: resource,
                fullUrl: "urn:uuid:" + uuid()
            };
        });
        items.push.apply(items, locItems);
        if (locItems.length) {
            const role = {
                resourceType: "PractitionerRole",
                active: true,
                practitioner: {
                    reference: items[0].fullUrl,
                    display: practitionerName(practitioner)
                },
                location: locItems.map(function (item) {
                    return { reference: item.fullUrl, display: item.title };
                })
            };
            const primary = (lookup.taxonomies || []).find(function (item) { return item.primary; })
                || (lookup.taxonomies || [])[0];
            if (primary && (primary.code || primary.display)) {
                const coding = { system: TAXONOMY_SYSTEM };
                if (primary.code) {
                    coding.code = primary.code;
                }
                if (primary.display) {
                    coding.display = primary.display;
                }
                role.specialty = [{ coding: [coding], text: primary.display || primary.code }];
            }
            items.push({
                title: "Role linking " + practitionerName(practitioner) + " to " +
                    locItems.length + (locItems.length === 1 ? " location" : " locations"),
                resource: role,
                fullUrl: "urn:uuid:" + uuid()
            });
        }
        return items;
    }

    function createPayload() {
        const items = plannedResources();
        if (!items.length) {
            return null;
        }
        if (items.length === 1) {
            return items[0].resource;
        }
        return {
            resourceType: "Bundle",
            type: "transaction",
            entry: items.map(function (item) {
                return {
                    fullUrl: item.fullUrl,
                    resource: item.resource,
                    request: { method: "POST", url: item.resource.resourceType }
                };
            })
        };
    }

    function showGeneratedFhir() {
        const payload = createPayload();
        if (!payload || !window.CadminResourceSource) {
            return;
        }
        CadminResourceSource.show(payload);
    }

    function goNext() {
        hideAlert();
        if (step === 1) {
            lookupIndividual();
            return;
        }
        if (step === 2) {
            renderSummary();
            showStep(3);
        }
    }

    function goBack() {
        if (step === 3) {
            showStep(2);
            return;
        }
        if (step === 2) {
            showStep(1);
        }
    }

    function lookupIndividual() {
        const npi = digits($("#" + MODAL_ID + "-number").val());
        if (npi.length !== 10) {
            showAlert("Enter a 10-digit NPI number.");
            return;
        }
        setBusy(true);
        CadminApi.npiLookup(npi).done(function (result) {
            lookup = result;
            renderReview();
            showStep(2);
        }).fail(function (xhr) {
            const fallback = xhr.status === 404
                ? "No individual provider was found for that NPI."
                : xhr.status === 422
                    ? "That NPI belongs to an organization, not an individual."
                    : "NPI lookup failed (" + (xhr.status || "error") + ").";
            showAlert(xhrMessage(xhr, fallback));
        }).always(function () {
            setBusy(false);
        });
    }

    function practitionerIdFrom(body, xhr) {
        if (body && body.resourceType === "Practitioner" && body.id) {
            return body.id;
        }
        if (body && body.resourceType === "Bundle") {
            const entries = body.entry || [];
            let i;
            for (i = 0; i < entries.length; i += 1) {
                const entry = entries[i];
                const resource = entry && entry.resource;
                if (resource && resource.resourceType === "Practitioner" && resource.id) {
                    return resource.id;
                }
                const location = entry && entry.response && entry.response.location;
                const match = String(location || "").match(/Practitioner\/([^/?#]+)/);
                if (match) {
                    return decodeURIComponent(match[1]);
                }
            }
        }
        return CadminApi.createdResourceId(body, xhr, "Practitioner");
    }

    function finish(body, xhr) {
        const id = practitionerIdFrom(body, xhr);
        const modalEl = document.getElementById(MODAL_ID);
        const instance = modalEl && bootstrap.Modal.getInstance(modalEl);
        const go = function () {
            CadminApi.showToast("success", "Practitioner created.");
            if (id) {
                window.location.hash = CadminApi.detailHref("Practitioner", id);
            }
        };
        creating = false;
        setBusy(false);
        if (instance) {
            $(modalEl).one("hidden.bs.modal", go);
            instance.hide();
            return;
        }
        go();
    }

    function failCreate(xhr) {
        creating = false;
        setBusy(false);
        if (xhr.status >= 200 && xhr.status < 300) {
            finish(xhr.responseJSON, xhr);
            return;
        }
        showAlert(xhrMessage(xhr, "Create failed (" + xhr.status + ")."));
    }

    function runCreate() {
        if (!lookup || creating) {
            return;
        }
        const payload = createPayload();
        if (!payload) {
            showAlert("Nothing to create.");
            return;
        }
        creating = true;
        setBusy(true);
        hideAlert();
        if (payload.resourceType === "Bundle") {
            CadminApi.fhir("", "POST", payload).done(finish).fail(failCreate);
            return;
        }
        CadminApi.fhir("/Practitioner", "POST", payload)
            .done(finish)
            .fail(failCreate);
    }

    function bindOnce() {
        if (bound) {
            return;
        }
        bound = true;
        $(document).on("click.npipractitioner", "[data-npi-practitioner]", function (event) {
            event.preventDefault();
            open();
        });
    }

    return {
        menuItem: menuItem,
        open: open
    };
}(jQuery));
