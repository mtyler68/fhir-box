CadminApp.register("wiremock-scenarios", function () {
    const wm = CadminWiremock;
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">WireMock scenarios</h1>' +
            '<button class="btn btn-outline-secondary" type="button" id="wm-scen-reset">' +
                '<i class="bi bi-arrow-counterclockwise me-1"></i>Reset all</button>' +
        "</div>" +
        '<div id="wm-scen-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                "<h6 class=\"m-0\">Scenario state</h6>" +
                '<form class="d-flex" id="wm-scen-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="wm-scen-query" placeholder="Name or state">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Name</th><th>State</th><th>Possible states</th><th></th></tr></thead>" +
                        '<tbody id="wm-scen-rows">' + wm.emptyRow(4, "Loading…") + "</tbody>" +
                    "</table>" +
                "</div>" +
            "</div>" +
        "</div>"
    );

    let query = "";

    function load(nextQuery) {
        query = nextQuery == null ? query : String(nextQuery).trim();
        CadminApi.wiremock("/__admin/scenarios").done(function (body) {
            let scenarios = (body && body.scenarios) || [];
            if (query) {
                scenarios = scenarios.filter(function (scenario) {
                    return wm.matchesQuery([
                        scenario.name,
                        scenario.id,
                        scenario.state
                    ].concat(scenario.possibleStates || []).join(" "), query);
                });
            }
            if (!scenarios.length) {
                $("#wm-scen-rows").html(wm.emptyRow(4,
                    "No scenarios found. Add scenarioName to a stub mapping to create one."));
                return;
            }
            $("#wm-scen-rows").html(scenarios.map(function (scenario, index) {
                const name = scenario.name || scenario.id || "";
                const states = scenario.possibleStates && scenario.possibleStates.length
                    ? scenario.possibleStates
                    : [scenario.state || "Started"].filter(Boolean);
                const options = states.map(function (state) {
                    const selected = state === scenario.state ? " selected" : "";
                    return '<option value="' + wm.esc(state) + '"' + selected + ">" + wm.esc(state) + "</option>";
                }).join("");
                return "<tr>" +
                    "<td>" + wm.esc(name || "Untitled") + "</td>" +
                    "<td><span class=\"badge text-bg-info\">" + wm.esc(scenario.state || "—") + "</span></td>" +
                    "<td>" + wm.esc((scenario.possibleStates || []).join(", ") || "—") + "</td>" +
                    '<td class="text-end text-nowrap">' +
                        '<div class="d-inline-flex align-items-center gap-2">' +
                            '<select class="form-select form-select-sm" data-wm-state="' + index + '">' +
                                options + "</select>" +
                            '<button class="btn btn-sm btn-outline-primary" type="button" data-wm-apply="' +
                                index + '">Set</button>' +
                            '<button class="btn btn-sm btn-outline-secondary" type="button" data-wm-view="' +
                                index + '" title="View JSON"><i class="bi bi-code-slash"></i></button>' +
                        "</div>" +
                    "</td></tr>";
            }).join(""));
            scenarios.forEach(function (scenario, index) {
                $("#wm-scen-rows [data-wm-apply=\"" + index + "\"]").data("scenario", scenario);
                $("#wm-scen-rows [data-wm-view=\"" + index + "\"]").data("scenario", scenario);
                $("#wm-scen-rows [data-wm-state=\"" + index + "\"]").data("scenario", scenario);
            });
        }).fail(function (xhr) {
            $("#wm-scen-rows").html(wm.emptyRow(4, "Unable to load scenarios from WireMock."));
            CadminApi.showAlert("#wm-scen-alert", "danger", wm.fail("Load scenarios", xhr));
        });
    }

    $root.on("submit", "#wm-scen-search-form", function (event) {
        event.preventDefault();
        load($("#wm-scen-query").val());
    });

    $root.on("click", "[data-wm-view]", function () {
        wm.showJson($(this).data("scenario"), "Scenario");
    });

    $root.on("click", "[data-wm-apply]", function () {
        const scenario = $(this).data("scenario") || {};
        const name = scenario.name || scenario.id;
        const index = $(this).attr("data-wm-apply");
        const state = $root.find('[data-wm-state="' + index + '"]').val();
        if (!name || !state) {
            return;
        }
        CadminApi.wiremock("/__admin/scenarios/" + encodeURIComponent(name) + "/state", "PUT", { state: state })
            .done(function () {
                CadminApi.showToast("success", "Scenario state updated.");
                load();
            })
            .fail(function (xhr) {
                CadminApi.showToast("danger", wm.fail("Set scenario state", xhr));
            });
    });

    $root.on("click", "#wm-scen-reset", function () {
        CadminApi.confirm("Reset every scenario to its starting state?").done(function () {
            CadminApi.wiremock("/__admin/scenarios/reset", "PUT").done(function () {
                CadminApi.showToast("success", "Scenarios reset.");
                load();
            }).fail(function (xhr) {
                CadminApi.showToast("danger", wm.fail("Reset scenarios", xhr));
            });
        });
    });

    load("");
});
