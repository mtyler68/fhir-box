package io.cadmin.gateway.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.client.RefreshOidcUserReactiveOAuth2AuthorizationSuccessHandler;
import org.springframework.security.oauth2.client.RefreshTokenReactiveOAuth2AuthorizedClientProvider;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcReactiveOAuth2UserService;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.web.server.logout.OidcClientInitiatedServerLogoutSuccessHandler;
import org.springframework.security.oauth2.client.registration.ReactiveClientRegistrationRepository;
import org.springframework.security.oauth2.client.userinfo.ReactiveOAuth2UserService;
import org.springframework.security.oauth2.client.web.server.DefaultServerOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.server.ServerOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.authentication.logout.ServerLogoutSuccessHandler;

@Configuration
@EnableWebFluxSecurity
@ConditionalOnProperty(name = "cadmin.security.mode", havingValue = "oidc")
public class OidcSecurityConfig {

    @Bean
    SecurityWebFilterChain oidcSecurityFilterChain(
            ServerHttpSecurity http,
            ReactiveClientRegistrationRepository clients,
            @Value("${cadmin.security.oidc.post-logout-redirect-uri:{baseUrl}/login.html}") String postLogoutRedirectUri
    ) {
        SecuritySupport.common(http)
                .oauth2Login(oauth -> oauth
                        .loginPage("/login.html")
                        .authorizationRequestResolver(authorizationRequestResolver(clients))
                        .authenticationSuccessHandler(AjaxAuthenticationHandlers.successHandler())
                        .authenticationFailureHandler(AjaxAuthenticationHandlers.failureHandler()))
                .logout(logout -> logout
                        .requiresLogout(SecuritySupport.logoutMatcher())
                        .logoutSuccessHandler(oidcLogoutSuccessHandler(clients, postLogoutRedirectUri)));
        return http.build();
    }

    @Bean
    ReactiveOAuth2UserService<OidcUserRequest, OidcUser> oidcUserService() {
        OidcReactiveOAuth2UserService delegate = new OidcReactiveOAuth2UserService();
        return request -> delegate.loadUser(request).map(user -> {
            var authorities = KeycloakRealmAuthorities.merge(user, request.getAccessToken());
            String nameAttribute = user.getAttribute("preferred_username") != null
                    ? "preferred_username"
                    : IdTokenClaimNames.SUB;
            if (user.getUserInfo() != null) {
                return new DefaultOidcUser(authorities, user.getIdToken(), user.getUserInfo(), nameAttribute);
            }
            return new DefaultOidcUser(authorities, user.getIdToken(), nameAttribute);
        });
    }

    /**
     * TokenRelay refreshes the Keycloak access token about every five minutes. The default
     * refresh handler rebuilds {@link OidcUser} without our realm-role mapping and rotates
     * the session id, so admin FHIR routes start returning 403 while the SPA still looks signed in.
     */
    @Bean
    RefreshTokenReactiveOAuth2AuthorizedClientProvider refreshTokenAuthorizedClientProvider(
            ReactiveOAuth2UserService<OidcUserRequest, OidcUser> oidcUserService
    ) {
        RefreshOidcUserReactiveOAuth2AuthorizationSuccessHandler handler =
                new RefreshOidcUserReactiveOAuth2AuthorizationSuccessHandler();
        handler.setUserService(oidcUserService);
        handler.setServerSecurityContextRepository(new SessionPreservingSecurityContextRepository());
        RefreshTokenReactiveOAuth2AuthorizedClientProvider provider =
                new RefreshTokenReactiveOAuth2AuthorizedClientProvider();
        provider.setAuthorizationSuccessHandler(handler);
        return provider;
    }

    private static ServerOAuth2AuthorizationRequestResolver authorizationRequestResolver(
            ReactiveClientRegistrationRepository clients
    ) {
        DefaultServerOAuth2AuthorizationRequestResolver resolver =
                new DefaultServerOAuth2AuthorizationRequestResolver(clients);
        resolver.setAuthorizationRequestCustomizer(request ->
                request.additionalParameters(params -> params.put("prompt", "login")));
        return resolver;
    }

    private static ServerLogoutSuccessHandler oidcLogoutSuccessHandler(
            ReactiveClientRegistrationRepository clients,
            String postLogoutRedirectUri
    ) {
        OidcClientInitiatedServerLogoutSuccessHandler handler =
                new OidcClientInitiatedServerLogoutSuccessHandler(clients);
        handler.setPostLogoutRedirectUri(postLogoutRedirectUri);
        return handler;
    }
}
