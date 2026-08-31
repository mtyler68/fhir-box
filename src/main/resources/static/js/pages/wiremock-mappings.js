CadminApp.register("wiremock-mappings", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWiremockMappingDetail.render(token);
        return;
    }
    if (window.CadminWiremockMappingDetail) {
        CadminWiremockMappingDetail.destroy();
    }
    renderWiremockMappingList();
});

function renderWiremockMappingList() {
    const wm = CadminWiremock;
    const $root = $("#app-content");
    $root.html(
        '<div class="d-sm-flex align-items-center justify-content-between mb-4">' +
            '<h1 class="h3 mb-0 page-title">WireMock mappings</h1>' +
            '<div class="d-flex flex-wrap gap-2">' +
                '<button class="btn btn-outline-secondary" type="button" id="wm-map-save">' +
                    '<i class="bi bi-save me-1"></i>Save to files</button>' +
                '<button class="btn btn-outline-secondary" type="button" id="wm-map-reset">' +
                    '<i class="bi bi-arrow-counterclockwise me-1"></i>Reset to files</button>' +
                '<button class="btn btn-outline-danger" type="button" id="wm-map-delete-all">' +
                    '<i class="bi bi-trash me-1"></i>Delete all</button>' +
                '<button class="btn btn-primary" type="button" data-bs-toggle="modal" data-bs-target="#wm-map-create-modal">' +
                    '<i class="bi bi-plus-lg me-1"></i>New mapping</button>' +
            "</div>" +
        "</div>" +
        '<div id="wm-map-alert" class="alert d-none"></div>' +
        '<div class="card shadow mb-4">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center">' +
                "<h6 class=\"m-0\">Stub mappings</h6>" +
                '<form class="d-flex" id="wm-map-search-form">' +
                    '<input class="form-control form-control-sm me-2" id="wm-map-query" placeholder="Name, method, or URL">' +
                    '<button class="btn btn-sm btn-primary" type="submit">Search</button>' +
                "</form>" +
            "</div>" +
            '<div class="card-body">' +
                '<div class="table-responsive">' +
                    '<table class="table table-hover align-middle">' +
                        "<thead><tr><th>Name</th><th>Method</th><th>URL</th><th>Status</th>" +
                        "<th>Scenario</th><th>Persistent</th><th></th></tr></thead>" +
                        '<tbody id="wm-map-rows">' + wm.emptyRow(7, "Loading…") + "</tbody>" +
                    "</table>" +
                "</div>" +
                '<div class="list-pager" id="wm-map-pager"></div>' +
            "</div>" +
        "</div>" +
        '<div class="modal fade" id="wm-map-create-modal" tabindex="-1">' +
            '<div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                '<form class="modal-content" id="wm-map-create-form">' +
                    '<div class="modal-header"><h5 class="modal-title">Create stub mapping</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                        '<label class="form-label" for="wm-map-json">Stub mapping JSON</label>' +
                        '<textarea class="form-control font-monospace" id="wm-map-json" rows="16" required></textarea>' +
                    "</div>" +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="submit" class="btn btn-primary">Create</button>' +
                    "</div>" +
                "</form>" +
            "</div>" +
        "</div>"
    );

    $("#wm-map-json").val(JSON.stringify(wm.DEFAULT_MAPPING, null, 2));

    let listPage = 0;
    let query = "";

    function load(nextQuery, page) {
        query = nextQuery == null ? query : String(nextQuery).trim();
        listPage = typeof page === "number" ? page : 0;
        const pageSize = CadminApi.listPageSize("wiremock-mappings");
        const searching = !!query;
        const limit = searching ? 500 : pageSize;
        const offset = searching ? 0 : listPage * pageSize;
        CadminApi.wiremock("/__admin/mappings?limit=" + encodeURIComponent(String(limit)) +
                "&offset=" + encodeURIComponent(String(offset)))
            .done(function (body) {
                let mappings = (body && body.mappings) || [];
                if (searching) {
                    mappings = mappings.filter(function (mapping) {
                        return wm.matchesQuery([
                            mapping.name,
                            mapping.id,
                            wm.mappingMethod(mapping),
                            wm.mappingUrl(mapping),
                            mapping.scenarioName
                        ].join(" "), query);
                    });
                }
                const total = searching
                    ? mappings.length
                    : ((body && body.meta && body.meta.total) || mappings.length);
                CadminApi.renderPager("#wm-map-pager", {
                    page: searching ? 0 : listPage,
                    size: pageSize,
                    pageSizeKey: "wiremock-mappings",
                    returned: mappings.length,
                    total: total,
                    onPage: function (nextPage) { load(query, nextPage); }
                });
                if (!mappings.length) {
                    $("#wm-map-rows").html(wm.emptyRow(7, "No stub mappings found."));
                    return;
                }
                $("#wm-map-rows").html(mappings.map(function (mapping) {
                    const id = mapping.id || "";
                    const href = id ? wm.mappingHref(id) : "#/wiremock-mappings";
                    const label = mapping.name || id || "Untitled";
                    return "<tr>" +
                        "<td>" + (id
                            ? CadminApi.resourceLink(href, label)
                            : wm.esc(label)) + "</td>" +
                        "<td><code>" + wm.esc(wm.mappingMethod(mapping)) + "</code></td>" +
                        "<td><code>" + wm.esc(wm.mappingUrl(mapping)) + "</code></td>" +
                        "<td>" + wm.esc(String(wm.mappingStatus(mapping))) + "</td>" +
                        "<td>" + wm.esc(mapping.scenarioName || "—") + "</td>" +
                        "<td>" + (mapping.persistent
                            ? '<span class="badge text-bg-success">Yes</span>'
                            : '<span class="badge text-bg-secondary">No</span>') + "</td>" +
                        '<td class="text-end text-nowrap">' +
                            '<a class="btn btn-sm btn-outline-primary me-1" href="' + wm.esc(href) +
                                '" title="Open" aria-label="Open"><i class="bi bi-eye"></i></a>' +
                            '<button class="btn btn-sm btn-outline-danger" type="button" data-wm-delete="' +
                                wm.esc(id) + '" title="Delete"><i class="bi bi-trash"></i></button>' +
                        "</td></tr>";
                }).join(""));
            })
            .fail(function (xhr) {
                $("#wm-map-pager").empty();
                $("#wm-map-rows").html(wm.emptyRow(7, "Unable to load mappings from WireMock."));
                CadminApi.showAlert("#wm-map-alert", "danger", wm.fail("Load mappings", xhr));
            });
    }

    $root.off(".wmmaps");
    $root.on("submit.wmmaps", "#wm-map-search-form", function (event) {
        event.preventDefault();
        load($("#wm-map-query").val(), 0);
    });

    $root.on("click.wmmaps", "[data-wm-delete]", function () {
        const id = $(this).attr("data-wm-delete");
        if (!id) {
            return;
        }
        CadminApi.confirm("Delete this stub mapping?").done(function () {
            CadminApi.wiremock("/__admin/mappings/" + encodeURIComponent(id), "DELETE").done(function () {
                CadminApi.showToast("success", "Mapping deleted.");
                load();
            }).fail(function (xhr) {
                CadminApi.showToast("danger", wm.fail("Delete mapping", xhr));
            });
        });
    });

    $root.on("click.wmmaps", "#wm-map-save", function () {
        CadminApi.wiremock("/__admin/mappings/save", "POST").done(function () {
            CadminApi.showToast("success", "Mappings saved to files.");
        }).fail(function (xhr) {
            CadminApi.showToast("danger", wm.fail("Save mappings", xhr));
        });
    });

    $root.on("click.wmmaps", "#wm-map-reset", function () {
        CadminApi.confirm({
            title: "Reset stub mappings?",
            text: "This restores mappings from the files mounted in the WireMock container."
        }).done(function () {
            CadminApi.wiremock("/__admin/mappings/reset", "POST").done(function () {
                CadminApi.showToast("success", "Mappings reset from files.");
                load();
            }).fail(function (xhr) {
                CadminApi.showToast("danger", wm.fail("Reset mappings", xhr));
            });
        });
    });

    $root.on("click.wmmaps", "#wm-map-delete-all", function () {
        CadminApi.confirm("Delete every stub mapping from this WireMock server?").done(function () {
            CadminApi.wiremock("/__admin/mappings", "DELETE").done(function () {
                CadminApi.showToast("success", "All mappings deleted.");
                load();
            }).fail(function (xhr) {
                CadminApi.showToast("danger", wm.fail("Delete mappings", xhr));
            });
        });
    });

    $root.on("submit.wmmaps", "#wm-map-create-form", function (event) {
        event.preventDefault();
        let mapping;
        try {
            mapping = JSON.parse($("#wm-map-json").val());
        } catch (error) {
            CadminApi.showToast("danger", "Mapping JSON is not valid.");
            return;
        }
        CadminApi.wiremock("/__admin/mappings", "POST", mapping).done(function (created) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById("wm-map-create-modal")).hide();
            CadminApi.showToast("success", "Mapping created.");
            if (created && created.id) {
                window.location.hash = wm.mappingHref(created.id);
                return;
            }
            load();
        }).fail(function (xhr) {
            CadminApi.showToast("danger", wm.fail("Create mapping", xhr));
        });
    });

    load("", 0);
}
