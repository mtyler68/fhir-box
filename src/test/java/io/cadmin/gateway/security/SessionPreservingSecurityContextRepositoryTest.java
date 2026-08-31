package io.cadmin.gateway.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.web.server.context.WebSessionServerSecurityContextRepository;

class SessionPreservingSecurityContextRepositoryTest {

    @Test
    void saveKeepsSessionIdAndReloadsContext() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/fhir/Organization"));
        SessionPreservingSecurityContextRepository repo = new SessionPreservingSecurityContextRepository();
        SecurityContext context = new SecurityContextImpl(
                new TestingAuthenticationToken("admin", "n/a", "ROLE_ADMIN"));

        repo.save(exchange, context).block();
        String sessionId = exchange.getSession().block().getId();

        repo.save(exchange, context).block();

        assertThat(exchange.getSession().block().getId()).isEqualTo(sessionId);
        SecurityContext loaded = repo.load(exchange).block();
        assertThat(loaded).isNotNull();
        assertThat(loaded.getAuthentication().getName()).isEqualTo("admin");
        assertThat(loaded.getAuthentication().getAuthorities())
                .extracting(authority -> authority.getAuthority())
                .contains("ROLE_ADMIN");
    }

    @Test
    void usesSameSessionAttributeAsDefaultRepository() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/auth/me"));
        SecurityContext context = new SecurityContextImpl(
                new TestingAuthenticationToken("admin", "n/a", "ROLE_ADMIN"));
        new WebSessionServerSecurityContextRepository().save(exchange, context).block();

        SecurityContext loaded = new SessionPreservingSecurityContextRepository().load(exchange).block();
        assertThat(loaded).isNotNull();
        assertThat(loaded.getAuthentication().getName()).isEqualTo("admin");
    }
}
