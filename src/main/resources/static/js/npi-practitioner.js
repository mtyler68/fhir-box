window.CadminNpiPractitioner = (function ($) {
    const MODAL_ID = "cadmin-npi-practitioner-modal";
    const NPI_SYSTEM = "http://hl7.org/fhir/sid/us-npi";
    const TAXONOMY_SYSTEM = "http://nucc.org/provider-taxonomy";
    let bound = false;
    let step = 1;
    let lookup = null;
    let creating = false;
    let createdOidcId = "";

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
                            '<ol class="npi-wizard-steps mb-3" id="' + MODAL_ID + '-steps"></ol>' +
                            '<div id="' + MODAL_ID + '-alert" class="alert alert-danger d-none"></div>' +
                            '<div data-npi-pane="1">' +
                                '<p class="text-muted">Look up an individual provider in the CMS NPI Registry.</p>' +
                                '<label class="form-label" for="' + MODAL_ID + '-number">NPI number</label>' +
                                '<input class="form-control" id="' + MODAL_ID +
                                    '-number" inputmode="numeric" maxlength="10" autocomplete="off" ' +
                                    'placeholder="10-digit NPI">' +
                            "</div>" +
                            '<div data-npi-pane="2" class="d-none" id="' + MODAL_ID + '-review"></div>' +
                            '<div data-npi-pane="oidc" class="d-none" id="' + MODAL_ID + '-oidc"></div>' +
                            '<div data-npi-pane="summary" class="d-none" id="' + MODAL_ID + '-summary"></div>' +
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
        $("#" + MODAL_ID).on("change", "input[name=npi-oidc-choice]", syncOidcChoice);
        $("#" + MODAL_ID).on("change", "#npi-oidc-use-email", function () {
            syncUsernameFromEmail(true);
        });
        $("#" + MODAL_ID).on("input", "#npi-oidc-email", function () {
            syncUsernameFromEmail(false);
            clearFieldError("npi-oidc-email");
        });
        $("#" + MODAL_ID).on("input", "#npi-oidc-first, #npi-oidc-last, #npi-oidc-username, #npi-oidc-mobile", function () {
            clearFieldError(this.id);
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

    function isOidcMode() {
        return ((window.CadminApp && CadminApp.config()) || {}).mode === "oidc";
    }

    function canCreateOidcUser() {
        return isOidcMode() && isAdmin();
    }

    function lastStep() {
        return isOidcMode() ? 4 : 3;
    }

    function paneFor(value) {
        if (value === 1) {
            return "1";
        }
        if (value === 2) {
            return "2";
        }
        if (isOidcMode() && value === 3) {
            return "oidc";
        }
        return "summary";
    }

    function renderSteps() {
        const labels = isOidcMode()
            ? ["Enter NPI", "Review", "OIDC user", "Summary"]
            : ["Enter NPI", "Review", "Summary"];
        $("#" + MODAL_ID + "-steps").html(labels.map(function (label, index) {
            return '<li class="npi-wizard-step" data-npi-step="' + (index + 1) + '">' + esc(label) + "</li>";
        }).join(""));
    }

    function showStep(next) {
        step = next;
        hideAlert();
        $("#" + MODAL_ID + " [data-npi-pane]").addClass("d-none");
        $("#" + MODAL_ID + " [data-npi-pane=\"" + paneFor(step) + "\"]").removeClass("d-none");
        $("#" + MODAL_ID + "-steps .npi-wizard-step").each(function () {
            const value = Number($(this).attr("data-npi-step"));
            $(this).toggleClass("active", value === step);
            $(this).toggleClass("done", value < step);
        });
        $("#" + MODAL_ID + "-back").toggleClass("d-none", step === 1);
        $("#" + MODAL_ID + "-next").toggleClass("d-none", step === lastStep());
        $("#" + MODAL_ID + "-create").toggleClass("d-none", step !== lastStep());
    }

    function reset() {
        lookup = null;
        creating = false;
        createdOidcId = "";
        setBusy(false);
        $("#" + MODAL_ID + "-number").val("");
        $("#" + MODAL_ID + "-review, #" + MODAL_ID + "-oidc, #" + MODAL_ID + "-summary").empty();
        renderSteps();
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

    function oidcIssuer() {
        return ((window.CadminApp && CadminApp.config() || {}).oidcIssuer || "").replace(/\/+$/, "");
    }

    function oidcIdentifier(oidcId) {
        return {
            use: "official",
            system: oidcIssuer(),
            value: oidcId,
            type: { text: "OIDC subject" }
        };
    }

    function slugPart(value) {
        return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    function suggestedUsername(first, last) {
        const given = slugPart(first);
        const family = slugPart(last);
        if (given && family) {
            return given + "." + family;
        }
        return given || family;
    }

    function suggestedMobile() {
        const result = lookup || {};
        const phones = [(result.mailing && result.mailing.telephone)]
            .concat((result.practiceLocations || []).map(function (location) {
                return location && location.telephone;
            }))
            .filter(Boolean);
        return phones[0] || "";
    }

    function fieldError(id, message) {
        $("#" + id).toggleClass("is-invalid", !!message);
        $("#" + id + "-feedback").text(message || "");
    }

    function clearFieldError(id) {
        fieldError(id, "");
    }

    function clearOidcErrors() {
        ["npi-oidc-first", "npi-oidc-last", "npi-oidc-email", "npi-oidc-mobile", "npi-oidc-username", "npi-oidc-link"]
            .forEach(clearFieldError);
    }

    function oidcChoice() {
        return $("input[name=npi-oidc-choice]:checked").val() || "skip";
    }

    function syncOidcChoice() {
        const choice = oidcChoice();
        $("#npi-oidc-create-fields").toggleClass("d-none", choice !== "create");
        $("#npi-oidc-link-fields").toggleClass("d-none", choice !== "link");
    }

    function syncUsernameFromEmail(force) {
        const useEmail = $("#npi-oidc-use-email").is(":checked");
        $("#npi-oidc-username").prop("readonly", useEmail);
        if (useEmail && (force || !$("#npi-oidc-username").data("manual"))) {
            $("#npi-oidc-username").val($("#npi-oidc-email").val().trim());
        }
    }

    function readOidcForm() {
        return {
            firstName: $("#npi-oidc-first").val().trim(),
            lastName: $("#npi-oidc-last").val().trim(),
            email: $("#npi-oidc-email").val().trim(),
            mobile: $("#npi-oidc-mobile").val().trim(),
            username: $("#npi-oidc-username").val().trim(),
            useEmail: $("#npi-oidc-use-email").is(":checked")
        };
    }

    function linkedOidcId() {
        const linked = selectedLinkUser();
        return linked && linked.oidcId ? linked.oidcId : "";
    }

    function currentOidcId() {
        return createdOidcId || linkedOidcId();
    }

    function selectedLinkUser() {
        const $option = $("#npi-oidc-link option:selected");
        const oidcId = $option.val();
        if (!oidcId) {
            return null;
        }
        return {
            oidcId: oidcId,
            username: $option.attr("data-username") || $option.text(),
            displayName: $option.attr("data-display") || $option.text()
        };
    }

    function renderOidcStep() {
        if ($("#npi-oidc-first").length) {
            syncOidcChoice();
            return;
        }
        const result = lookup || {};
        const first = titleCase(result.firstName);
        const last = titleCase(result.lastName);
        const defaultChoice = canCreateOidcUser() ? "create" : "skip";
        const createRadio = canCreateOidcUser()
            ? '<div class="form-check">' +
                '<input class="form-check-input" type="radio" name="npi-oidc-choice" id="npi-oidc-choice-create" value="create"' +
                    (defaultChoice === "create" ? " checked" : "") + ">" +
                '<label class="form-check-label" for="npi-oidc-choice-create">Create a new OIDC user</label>' +
            "</div>"
            : "";
        $("#" + MODAL_ID + "-oidc").html(
            '<p class="text-muted">Create a Keycloak user for this practitioner or link an existing realm account. ' +
                "The user's subject id is stored on the practitioner as an identifier.</p>" +
            '<div class="mb-3">' +
                createRadio +
                '<div class="form-check">' +
                    '<input class="form-check-input" type="radio" name="npi-oidc-choice" id="npi-oidc-choice-link" value="link">' +
                    '<label class="form-check-label" for="npi-oidc-choice-link">Link an existing OIDC user</label>' +
                "</div>" +
                '<div class="form-check">' +
                    '<input class="form-check-input" type="radio" name="npi-oidc-choice" id="npi-oidc-choice-skip" value="skip"' +
                        (defaultChoice === "skip" ? " checked" : "") + ">" +
                    '<label class="form-check-label" for="npi-oidc-choice-skip">Do not create or link a user</label>' +
                "</div>" +
            "</div>" +
            '<div id="npi-oidc-create-fields"' + (defaultChoice === "create" ? "" : ' class="d-none"') + ">" +
                '<div class="row">' +
                    '<div class="col-md-6 mb-3"><label class="form-label" for="npi-oidc-first">First name</label>' +
                        '<input class="form-control" id="npi-oidc-first" required value="' + esc(first) + '">' +
                        '<div class="invalid-feedback" id="npi-oidc-first-feedback"></div></div>' +
                    '<div class="col-md-6 mb-3"><label class="form-label" for="npi-oidc-last">Last name</label>' +
                        '<input class="form-control" id="npi-oidc-last" required value="' + esc(last) + '">' +
                        '<div class="invalid-feedback" id="npi-oidc-last-feedback"></div></div>' +
                "</div>" +
                '<div class="mb-3"><label class="form-label" for="npi-oidc-email">Email</label>' +
                    '<input class="form-control" id="npi-oidc-email" type="email" autocomplete="off">' +
                    '<div class="invalid-feedback" id="npi-oidc-email-feedback"></div></div>' +
                '<div class="mb-3"><label class="form-label" for="npi-oidc-mobile">Mobile number</label>' +
                    '<input class="form-control" id="npi-oidc-mobile" inputmode="tel" autocomplete="off" value="' +
                        esc(suggestedMobile()) + '">' +
                    '<div class="invalid-feedback" id="npi-oidc-mobile-feedback"></div></div>' +
                '<div class="form-check mb-2">' +
                    '<input class="form-check-input" type="checkbox" id="npi-oidc-use-email">' +
                    '<label class="form-check-label" for="npi-oidc-use-email">Use email for username</label>' +
                "</div>" +
                '<div class="mb-0"><label class="form-label" for="npi-oidc-username">Username</label>' +
                    '<input class="form-control" id="npi-oidc-username" required autocomplete="off" value="' +
                        esc(suggestedUsername(first, last)) + '">' +
                    '<div class="invalid-feedback" id="npi-oidc-username-feedback"></div></div>' +
            "</div>" +
            '<div id="npi-oidc-link-fields" class="d-none">' +
                '<label class="form-label" for="npi-oidc-link">Existing user</label>' +
                '<select class="form-select" id="npi-oidc-link">' +
                    '<option value="">Loading users…</option></select>' +
                '<div class="invalid-feedback" id="npi-oidc-link-feedback"></div>' +
            "</div>"
        );
        loadOidcUsers();
    }

    function loadOidcUsers() {
        CadminApi.get("/api/auth/users").done(function (users) {
            const options = ['<option value="">Select a user…</option>'].concat((users || []).map(function (user) {
                const oidcId = user.oidcId || user.id || "";
                if (!oidcId) {
                    return "";
                }
                const label = (user.displayName || user.username || oidcId) +
                    (user.username && user.displayName && user.displayName !== user.username
                        ? " (" + user.username + ")"
                        : "");
                return '<option value="' + esc(oidcId) + '" data-username="' + esc(user.username || "") +
                    '" data-display="' + esc(user.displayName || user.username || "") + '">' +
                    esc(label) + "</option>";
            }));
            $("#npi-oidc-link").html(options.join(""));
        }).fail(function () {
            $("#npi-oidc-link").html('<option value="">Unable to load users</option>');
        });
    }

    function validateOidcLocal() {
        clearOidcErrors();
        const choice = oidcChoice();
        if (choice === "skip") {
            return { ok: true, choice: choice };
        }
        if (choice === "link") {
            const linked = selectedLinkUser();
            if (!linked) {
                fieldError("npi-oidc-link", "Select an existing OIDC user.");
                return { ok: false, choice: choice };
            }
            if (!oidcIssuer()) {
                showAlert("OIDC issuer is not configured.");
                return { ok: false, choice: choice };
            }
            return { ok: true, choice: choice, user: linked };
        }
        if (!canCreateOidcUser()) {
            showAlert("Creating an OIDC user requires an administrator.");
            return { ok: false, choice: choice };
        }
        const form = readOidcForm();
        let ok = true;
        if (!form.firstName) {
            fieldError("npi-oidc-first", "First name is required.");
            ok = false;
        }
        if (!form.lastName) {
            fieldError("npi-oidc-last", "Last name is required.");
            ok = false;
        }
        if (form.useEmail && !form.email) {
            fieldError("npi-oidc-email", "Email is required when using it as the username.");
            ok = false;
        }
        if (form.email && form.email.indexOf("@") < 0) {
            fieldError("npi-oidc-email", "Enter a valid email address.");
            ok = false;
        }
        if (!form.username) {
            fieldError("npi-oidc-username", "Username is required.");
            ok = false;
        }
        if (!ok) {
            return { ok: false, choice: choice, form: form };
        }
        return { ok: true, choice: choice, form: form };
    }

    function applyOidcConflicts(conflicts) {
        if (!conflicts) {
            return;
        }
        if (conflicts.username) {
            fieldError("npi-oidc-username", "Username is already used in this realm.");
        }
        if (conflicts.email) {
            fieldError("npi-oidc-email", "Email is already used in this realm.");
        }
        if (conflicts.mobile) {
            fieldError("npi-oidc-mobile", "Mobile number is already used in this realm.");
        }
    }

    function checkOidcAvailable(form) {
        const params = new URLSearchParams();
        if (form.username) {
            params.set("username", form.username);
        }
        if (form.email) {
            params.set("email", form.email);
        }
        if (form.mobile) {
            params.set("mobile", form.mobile);
        }
        return CadminApi.get("/api/auth/users/available?" + params.toString()).then(function (available) {
            const conflicts = {
                username: available && available.username === false,
                email: available && available.email === false,
                mobile: available && available.mobile === false
            };
            if (conflicts.username || conflicts.email || conflicts.mobile) {
                applyOidcConflicts(conflicts);
                return $.Deferred().reject({ conflicts: conflicts }).promise();
            }
            return form;
        });
    }

    function oidcSummaryText() {
        if (!isOidcMode()) {
            return "";
        }
        const choice = oidcChoice();
        if (choice === "create") {
            const form = readOidcForm();
            return "Create OIDC user " + (form.username || "—") +
                (form.email ? " · " + form.email : "");
        }
        if (choice === "link") {
            const linked = selectedLinkUser();
            return linked
                ? "Link existing OIDC user " + (linked.displayName || linked.username)
                : "Link existing OIDC user";
        }
        return "Do not create or link an OIDC user";
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
        const resources = plannedResources(currentOidcId());
        const rows = resources.map(function (item) {
            return "<tr><td>" + esc(item.resource.resourceType) + "</td><td>" + esc(item.title) + "</td></tr>";
        }).join("");
        const oidcRow = isOidcMode()
            ? "<tr><td>OIDC user</td><td>" + esc(oidcSummaryText()) + "</td></tr>"
            : "";
        $("#" + MODAL_ID + "-summary").html(
            '<p class="text-muted">These FHIR resources will be created.</p>' +
            '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
                "<thead><tr><th>Type</th><th>Summary</th></tr></thead>" +
                "<tbody>" + oidcRow + rows + "</tbody></table></div>" +
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

    function practitionerResource(result, oidcId) {
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
        if (oidcId && oidcIssuer()) {
            resource.identifier.push(oidcIdentifier(oidcId));
        }
        const telecom = [];
        if (isOidcMode() && oidcChoice() === "create") {
            const form = readOidcForm();
            pushTelecom(telecom, "email", form.email);
            if (form.mobile) {
                telecom.push({ system: "phone", value: form.mobile, use: "mobile" });
            }
        }
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

    function plannedResources(oidcId) {
        const practitioner = practitionerResource(lookup, oidcId);
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

    function createPayload(oidcId) {
        const items = plannedResources(oidcId);
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
        const payload = createPayload(currentOidcId());
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
            if (isOidcMode()) {
                renderOidcStep();
                showStep(3);
                return;
            }
            renderSummary();
            showStep(3);
            return;
        }
        if (step === 3 && isOidcMode()) {
            advanceFromOidc();
        }
    }

    function goBack() {
        if (step === lastStep()) {
            showStep(isOidcMode() ? 3 : 2);
            return;
        }
        if (step === 3 && isOidcMode()) {
            showStep(2);
            return;
        }
        if (step === 2) {
            showStep(1);
        }
    }

    function advanceFromOidc() {
        const local = validateOidcLocal();
        if (!local.ok) {
            return;
        }
        if (local.choice !== "create") {
            renderSummary();
            showStep(4);
            return;
        }
        setBusy(true);
        checkOidcAvailable(local.form).done(function () {
            renderSummary();
            showStep(4);
        }).fail(function (error) {
            if (error && error.conflicts) {
                showAlert("Username, email, and mobile number must be unique in the OIDC realm.");
                return;
            }
            showAlert(xhrMessage(error, "Unable to verify that the user is unique in the realm."));
        }).always(function () {
            setBusy(false);
        });
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
            createdOidcId = "";
            $("#" + MODAL_ID + "-oidc").empty();
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
        showAlert(xhrMessage(xhr, "Create failed (" + xhr.status + ").") +
            (createdOidcId ? " The OIDC user was created and can be linked later." : ""));
    }

    function postPractitioner(oidcId) {
        const payload = createPayload(oidcId);
        if (!payload) {
            creating = false;
            setBusy(false);
            showAlert("Nothing to create.");
            return;
        }
        if (payload.resourceType === "Bundle") {
            CadminApi.fhir("", "POST", payload).done(finish).fail(failCreate);
            return;
        }
        CadminApi.fhir("/Practitioner", "POST", payload)
            .done(finish)
            .fail(failCreate);
    }

    function createOidcUser() {
        const form = readOidcForm();
        return CadminApi.post("/api/auth/users", {
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email,
            mobile: form.mobile,
            username: form.username
        }).then(function (user) {
            createdOidcId = (user && (user.oidcId || user.id)) || "";
            if (!createdOidcId) {
                return $.Deferred().reject({
                    status: 502,
                    responseJSON: { message: "OIDC user was created but no subject id was returned." }
                }).promise();
            }
            return createdOidcId;
        });
    }

    function resolveOidcId() {
        if (!isOidcMode()) {
            return $.Deferred().resolve("").promise();
        }
        const choice = oidcChoice();
        if (choice === "link") {
            return $.Deferred().resolve(linkedOidcId()).promise();
        }
        if (choice !== "create") {
            return $.Deferred().resolve("").promise();
        }
        const local = validateOidcLocal();
        if (!local.ok) {
            showStep(3);
            return $.Deferred().reject({ status: 400 }).promise();
        }
        if (createdOidcId) {
            return $.Deferred().resolve(createdOidcId).promise();
        }
        return createOidcUser();
    }

    function runCreate() {
        if (!lookup || creating) {
            return;
        }
        creating = true;
        setBusy(true);
        hideAlert();
        resolveOidcId().done(function (oidcId) {
            postPractitioner(oidcId);
        }).fail(function (xhr) {
            creating = false;
            setBusy(false);
            if (xhr && xhr.status === 409) {
                applyOidcConflicts(xhr.responseJSON && xhr.responseJSON.conflicts);
                showAlert(xhrMessage(xhr, "That user is not unique in the OIDC realm."));
                showStep(3);
                return;
            }
            if (xhr && xhr.status === 400 && $("#npi-oidc-first").length) {
                showStep(3);
                return;
            }
            if (xhr && xhr.status === 400 && oidcChoice() === "create" && createdOidcId) {
                showAlert("OIDC user was created, but the practitioner could not be created.");
                return;
            }
            showAlert(xhrMessage(xhr, "Create failed" + (xhr && xhr.status ? " (" + xhr.status + ")" : "") + "."));
        });
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
