CadminApp.register("rate-limit-tiers", function (params) {
    const token = CadminApi.routeParamId(params);
    if (token) {
        CadminWorkspace.openRoute("rate-limit-tiers", token, function (resource, $root) {
            CadminRateLimitTierDetail.render(resource, $root);
        }, function () {
            window.location.hash = "#/organizations";
        });
        return;
    }
    window.location.hash = "#/organizations";
});
