window.CadminApp = (function ($) {
    const routes = {};
    let currentUser = null;
    let config = { mode: "local" };

    function register(name, render) {
        routes[name] = render;
    }

    function parseHash() {
        const raw = (window.location.hash || "#/dashboard").replace(/^#\/?/, "");
        const q = raw.indexOf("?");
        const path = q < 0 ? raw : raw.slice(0, q);
        const query = {};
        if (q >= 0) {
            new URLSearchParams(raw.slice(q + 1)).forEach(function (value, key) {
                query[key] = value;
            });
        }
        const parts = path.split("/").filter(Boolean);
        return { name: parts[0] || "dashboard", params: parts.slice(1), query: query };
    }

    function setActive(name) {
        $(".sidebar-menu .nav-link").removeClass("active");
        $('.sidebar-menu .nav-item[data-route="' + name + '"] > .nav-link').addClass("active");
    }

    function isAdmin(user) {
        return ((user && user.roles) || []).some(function (role) {
            return /^(ROLE_)?ADMIN$/i.test(role);
        });
    }

    function render() {
        const route = parseHash();
        if ((route.name === "organizations" || route.name === "care-teams"
                || route.name === "locations" || route.name === "pds-policies"
                || route.name === "camel-routes"
                || route.name === "search-parameters" || route.name === "questionnaires"
                || route.name === "code-systems" || route.name === "value-sets"
                || route.name === "demo-data"
                || route.name === "subscription-topics" || route.name === "subscriptions"
                || route.name === "endpoints" || route.name === "consents"
                || route.name === "practitioner-roles" || route.name === "organization-affiliations"
                || route.name === "healthcare-services"
                || route.name === "core-admin-bridge"
                || route.name === "schedules" || route.name === "slots"
                || route.name === "appointments" || route.name === "appointment-responses"
                || route.name === "appointment-book"
                || route.name === "plan-definitions" || route.name === "activity-definitions"
                || route.name === "request-orchestrations" || route.name === "plan-apply"
                || route.name === "wiremock-mappings" || route.name === "wiremock-requests"
                || route.name === "wiremock-scenarios")
                && !isAdmin(currentUser)) {
            window.location.hash = "#/dashboard";
            return;
        }
        setActive(route.name);
        if (window.CadminWorkspace && CadminWorkspace.consumeHashChange()) {
            return;
        }
        if (window.CadminWorkspace && CadminWorkspace.handleRoute(route)) {
            return;
        }
        const token = CadminApi.routeParamId(route.params);
        const url = (route.query && route.query.url) || "";
        if (url && !token) {
            const type = CadminApi.typeForRoute(route.name);
            if (type) {
                CadminApi.findByUrl(type, url).done(function (resource) {
                    if (resource && resource.id) {
                        window.location.hash = CadminApi.detailHref(type, resource.id, resource);
                        return;
                    }
                    showRoute(route, [url]);
                }).fail(function () {
                    showRoute(route, [url]);
                });
                return;
            }
        }
        showRoute(route, route.params);
    }

    function showRoute(route, params) {
        const view = routes[route.name] || routes.dashboard;
        if (window.CadminWorkspace && !CadminWorkspace.routeKey({ name: route.name, params: params })) {
            CadminWorkspace.showWorkspace(route);
            CadminApi.destroySelects("#app-content");
            $("#app-content").html('<div class="text-muted py-5 text-center">Loading…</div>');
        }
        view(params);
    }

    function applyUser(user) {
        currentUser = user;
        $("#topbar-username").text(user.displayName || user.username);
        $("#topbar-role").text((user.roles || []).join(", ") || user.mode);
        if (!isAdmin(user)) {
            $(".admin-only").addClass("d-none");
        }
    }

    function initChrome() {
        $("#logout-link").on("click", function (event) {
            event.preventDefault();
            CadminApi.logout().always(function () {
                window.location.href = "/login.html?logout";
            });
        });
        $("#global-search-form").on("submit", function (event) {
            event.preventDefault();
            const q = $("#global-search").val();
            window.location.hash = "#/patients" + (q ? "/" + encodeURIComponent(q) : "");
        });
    }

    function start() {
        initChrome();
        if (window.CadminWorkspace) {
            CadminWorkspace.ensure();
        }
        $.when(CadminApi.get("/api/auth/config"), CadminApi.get("/api/auth/me"))
            .done(function (configRes, meRes) {
                config = configRes[0];
                applyUser(meRes[0]);
                if (window.CadminTargetList) {
                    CadminTargetList.init();
                }
                if (window.CadminWorkspace && typeof CadminWorkspace.restore === "function") {
                    CadminWorkspace.restore();
                }
                $(window).on("hashchange", render);
                render();
            });
    }

    return {
        register: register,
        start: start,
        user: function () { return currentUser; },
        config: function () { return config; },
        isAdmin: function () { return isAdmin(currentUser); },
        navigate: function (hash) { window.location.hash = hash; }
    };
}(jQuery));

$(function () {
    CadminApp.start();
});
