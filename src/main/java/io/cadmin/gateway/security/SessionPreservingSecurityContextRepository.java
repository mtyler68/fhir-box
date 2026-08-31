package io.cadmin.gateway.security;

import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.server.context.ServerSecurityContextRepository;
import org.springframework.security.web.server.context.WebSessionServerSecurityContextRepository;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebSession;
import reactor.core.publisher.Mono;

/**
 * Stores the security context in the WebSession without rotating the session id.
 * {@link WebSessionServerSecurityContextRepository} calls {@link WebSession#changeSessionId()}
 * on every save, which is correct at login but breaks TokenRelay refresh: concurrent
 * requests keep the old session cookie and CSRF token, and the SPA sees 403s.
 */
final class SessionPreservingSecurityContextRepository implements ServerSecurityContextRepository {

    private static final String ATTR =
            WebSessionServerSecurityContextRepository.DEFAULT_SPRING_SECURITY_CONTEXT_ATTR_NAME;

    @Override
    public Mono<Void> save(ServerWebExchange exchange, SecurityContext context) {
        return exchange.getSession().doOnNext(session -> {
            if (context == null) {
                session.getAttributes().remove(ATTR);
            } else {
                session.getAttributes().put(ATTR, context);
            }
        }).then();
    }

    @Override
    public Mono<SecurityContext> load(ServerWebExchange exchange) {
        return exchange.getSession().flatMap(session -> {
            Object value = session.getAttribute(ATTR);
            return value instanceof SecurityContext securityContext
                    ? Mono.just(securityContext)
                    : Mono.empty();
        });
    }
}
