package io.cadmin.gateway.web;

import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Controller
public class LoginPageController {

    @GetMapping("/login")
    public Mono<Void> login(ServerWebExchange exchange) {
        String query = exchange.getRequest().getURI().getRawQuery();
        String target = "/login.html";
        if (query != null && !query.isBlank()) {
            target = target + "?" + query;
        }
        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
        exchange.getResponse().getHeaders().setLocation(URI.create(target));
        return exchange.getResponse().setComplete();
    }
}
