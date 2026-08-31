window.CadminCamelRouteGraph = (function () {
    const GROUPS = {
        route: { color: { background: "#0d6efd", border: "#0a58ca" }, font: { color: "#fff" }, shape: "box" },
        from: { color: { background: "#198754", border: "#146c43" }, font: { color: "#fff" }, shape: "box" },
        to: { color: { background: "#0dcaf0", border: "#3d8bfd" }, font: { color: "#052c65" }, shape: "box" },
        rest: { color: { background: "#20c997", border: "#0f5132" }, font: { color: "#052c65" }, shape: "box" },
        choice: { color: { background: "#fd7e14", border: "#ca6510" }, shape: "diamond" },
        branch: { color: { background: "#ffc107", border: "#cc9a06" }, font: { color: "#212529" }, shape: "box" },
        eip: { color: { background: "#6f42c1", border: "#59359a" }, font: { color: "#fff" }, shape: "box" }
    };
    const TO_KINDS = { to: true, toD: true, wireTap: true };
    const FROM_KINDS = { from: true };
    const REST_METHODS = ["get", "post", "put", "delete", "patch", "head"];
    let network = null;
    let observer = null;
    let sizeWait = null;
    let sourceFn = null;
    let refreshTimer = 0;
    let lastYaml = null;
    let lastGraph = null;
    let lastCanvasSize = "";
    let ignoreResize = false;

    function esc(value) {
        return CadminApi.escapeHtml(value);
    }

    function cssColor(name, fallback) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        if (!raw) {
            return fallback;
        }
        if (/^\d+(\.\d+)?(\s*,\s*\d+(\.\d+)?){2}/.test(raw)) {
            return "rgb(" + raw + ")";
        }
        return raw;
    }

    function themePalette() {
        return {
            canvas: cssColor("--bs-body-bg", "#fff"),
            muted: cssColor("--bs-secondary-color", "#858796"),
            border: cssColor("--bs-border-color", "#dee2e6"),
            primary: cssColor("--bs-primary", "#0d6efd")
        };
    }

    function styleEdges(edges) {
        const theme = themePalette();
        const sameDir = {};
        (edges || []).forEach(function (edge, index) {
            const key = edge.from + "\0" + edge.to;
            if (!sameDir[key]) {
                sameDir[key] = [];
            }
            sameDir[key].push(index);
        });
        return (edges || []).map(function (edge, index) {
            const group = sameDir[edge.from + "\0" + edge.to] || [index];
            const slot = group.indexOf(index);
            const offset = slot - (group.length - 1) / 2;
            let smooth;
            if (edge.dashed) {
                smooth = {
                    type: offset < 0 ? "curvedCCW" : "curvedCW",
                    roundness: Math.min(0.28 + Math.abs(offset) * 0.15, 0.7)
                };
            } else if (group.length === 1) {
                smooth = { type: "cubicBezier", forceDirection: "horizontal", roundness: 0.22 };
            } else if (offset === 0) {
                smooth = { type: "cubicBezier", forceDirection: "horizontal", roundness: 0.18 };
            } else {
                smooth = {
                    type: offset < 0 ? "curvedCCW" : "curvedCW",
                    roundness: Math.min(0.2 + Math.abs(offset) * 0.2, 0.85)
                };
            }
            return {
                from: edge.from,
                to: edge.to,
                label: edge.label || "",
                title: edge.title || edge.label || "",
                dashes: edge.dashed ? [7, 5] : false,
                arrows: { to: { enabled: true, scaleFactor: 0.75 } },
                color: { color: edge.dashed ? theme.muted : theme.border, highlight: theme.primary },
                font: {
                    align: "horizontal",
                    size: 11,
                    color: theme.muted,
                    face: "system-ui, sans-serif",
                    strokeWidth: 0
                },
                smooth: smooth
            };
        });
    }

    function card() {
        return '<div class="card shadow h-100" id="camel-route-graph-card">' +
            '<div class="card-header py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                '<div>' +
                    '<h6 class="m-0">' +
                        '<iconify-icon class="me-1" icon="hugeicons:camel" aria-hidden="true"></iconify-icon>' +
                        "Route graph</h6>" +
                    '<div class="small text-muted" id="camel-route-graph-status"></div>' +
                "</div>" +
                '<div class="d-flex flex-wrap align-items-center gap-2">' +
                    '<span class="small text-muted d-none d-lg-inline">Scroll to zoom · drag to pan</span>' +
                    '<button class="btn btn-sm btn-outline-secondary" type="button" id="camel-route-graph-refresh" ' +
                        'title="Refresh graph" aria-label="Refresh graph">' +
                        '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>' +
                    '<button type="button" class="btn btn-tool" data-lte-toggle="card-maximize" title="Maximize" aria-label="Maximize">' +
                        '<i data-lte-icon="maximize" class="bi bi-fullscreen"></i>' +
                        '<i data-lte-icon="minimize" class="bi bi-fullscreen-exit"></i>' +
                    "</button>" +
                "</div>" +
            "</div>" +
            '<div class="card-body p-0">' +
                '<div id="camel-route-graph" class="camel-route-graph"></div>' +
            "</div>" +
        "</div>";
    }

    function setStatus(message, isError) {
        const el = document.getElementById("camel-route-graph-status");
        if (!el) {
            return;
        }
        el.textContent = message || "";
        el.classList.toggle("text-danger", !!isError);
        el.classList.toggle("d-none", !message);
    }

    function asList(value) {
        if (value == null) {
            return [];
        }
        return Array.isArray(value) ? value : [value];
    }

    function truncate(value, max) {
        const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
        const limit = max || 42;
        if (text.length <= limit) {
            return text;
        }
        return text.slice(0, limit - 1) + "…";
    }

    function uriOf(body) {
        if (body == null) {
            return "";
        }
        if (typeof body === "string" || typeof body === "number") {
            return String(body);
        }
        if (typeof body !== "object") {
            return "";
        }
        if (typeof body.uri === "string") {
            return body.uri;
        }
        if (typeof body.to === "string") {
            return body.to;
        }
        return "";
    }

    function parseEndpoint(uri) {
        const raw = String(uri == null ? "" : uri).trim();
        if (!raw) {
            return null;
        }
        const noQuery = raw.split("?")[0];
        const match = noQuery.match(/^([A-Za-z][A-Za-z0-9+.-]*):(?:\/\/)?(.*)$/);
        if (!match) {
            return null;
        }
        const scheme = match[1].toLowerCase();
        const path = String(match[2] || "").replace(/^\/+/, "");
        if (!path) {
            return null;
        }
        return {
            scheme: scheme,
            path: path,
            key: scheme + ":" + path
        };
    }

    function exprOf(body) {
        if (!body || typeof body !== "object") {
            return "";
        }
        const keys = ["simple", "constant", "jsonpath", "xpath", "header", "exchangeProperty",
            "datasonnet", "groovy", "javascript", "expression", "message", "name"];
        let i;
        for (i = 0; i < keys.length; i += 1) {
            const value = body[keys[i]];
            if (typeof value === "string" && value) {
                return value;
            }
        }
        return "";
    }

    function childSteps(body) {
        if (!body || typeof body !== "object") {
            return [];
        }
        if (body.steps != null) {
            return asList(body.steps);
        }
        if (body.do != null) {
            return asList(body.do);
        }
        return [];
    }

    function stepParts(step) {
        if (step == null) {
            return null;
        }
        if (typeof step === "string") {
            return { kind: step, body: {} };
        }
        if (typeof step !== "object" || Array.isArray(step)) {
            return null;
        }
        const keys = Object.keys(step);
        if (!keys.length) {
            return null;
        }
        return { kind: keys[0], body: step[keys[0]] };
    }

    function groupOf(kind) {
        if (FROM_KINDS[kind]) {
            return "from";
        }
        if (TO_KINDS[kind]) {
            return "to";
        }
        if (kind === "choice") {
            return "choice";
        }
        if (kind === "when" || kind === "otherwise") {
            return "branch";
        }
        if (kind === "rest" || REST_METHODS.indexOf(kind) >= 0) {
            return "rest";
        }
        if (kind === "route") {
            return "route";
        }
        return "eip";
    }

    function labelOf(kind, body) {
        const uri = uriOf(body);
        const expr = exprOf(body);
        if (kind === "from") {
            return uri ? "from\n" + truncate(uri) : "from";
        }
        if (TO_KINDS[kind]) {
            return uri ? kind + "\n" + truncate(uri) : kind;
        }
        if (kind === "when") {
            return expr ? "when\n" + truncate(expr) : "when";
        }
        if (kind === "log") {
            return expr ? "log\n" + truncate(expr) : "log";
        }
        if (kind === "setBody" || kind === "setHeader" || kind === "setProperty") {
            return expr ? kind + "\n" + truncate(expr) : kind;
        }
        if (kind === "rest") {
            const path = body && body.path;
            return path ? "rest\n" + truncate(path) : "rest";
        }
        if (REST_METHODS.indexOf(kind) >= 0) {
            const verbPath = body && typeof body === "object" ? body.path : "";
            if (verbPath) {
                return kind.toUpperCase() + "\n" + truncate(verbPath);
            }
            return uri ? kind.toUpperCase() + "\n" + truncate(uri) : kind.toUpperCase();
        }
        if (kind === "route") {
            const id = body && body.id;
            return id ? "route\n" + truncate(id) : "route";
        }
        if (uri) {
            return kind + "\n" + truncate(uri);
        }
        if (expr) {
            return kind + "\n" + truncate(expr);
        }
        return kind;
    }

    function titleOf(kind, body) {
        const lines = [kind];
        const uri = uriOf(body);
        const expr = exprOf(body);
        if (uri) {
            lines.push(uri);
        }
        if (expr && expr !== uri) {
            lines.push(expr);
        }
        if (body && typeof body === "object" && body.parameters) {
            try {
                lines.push(JSON.stringify(body.parameters));
            } catch (err) {
                // ignore
            }
        }
        return lines.join("\n");
    }

    function parseYaml(text) {
        if (typeof jsyaml === "undefined") {
            return { error: "YAML parser is not loaded.", value: null };
        }
        try {
            return { error: "", value: jsyaml.load(text || "") };
        } catch (err) {
            return { error: (err && err.message) || "Invalid YAML.", value: null };
        }
    }

    function flattenDefs(value) {
        const out = [];
        function walk(item) {
            if (item == null) {
                return;
            }
            if (Array.isArray(item)) {
                item.forEach(walk);
                return;
            }
            if (typeof item === "object") {
                out.push(item);
            }
        }
        walk(value);
        return out;
    }

    function buildGraph(value) {
        const nodes = [];
        const edges = [];
        const nodeById = {};
        let seq = 0;

        function addNode(kind, body, level) {
            seq += 1;
            const id = "crn-" + seq;
            const node = {
                id: id,
                label: labelOf(kind, body),
                title: titleOf(kind, body),
                group: groupOf(kind),
                level: typeof level === "number" ? level : 0,
                endpointUri: FROM_KINDS[kind] || TO_KINDS[kind] ? uriOf(body) : "",
                font: { multi: true, face: "inherit", size: 13 }
            };
            nodes.push(node);
            nodeById[id] = node;
            return id;
        }

        function levelOf(ids) {
            let max = -1;
            asList(ids).forEach(function (id) {
                const node = nodeById[id];
                if (node && typeof node.level === "number") {
                    max = Math.max(max, node.level);
                }
            });
            return max;
        }

        function nextLevel(predecessors) {
            return levelOf(predecessors) + 1;
        }

        function link(fromIds, toId, label) {
            asList(fromIds).forEach(function (fromId) {
                if (fromId && toId) {
                    edges.push({
                        from: fromId,
                        to: toId,
                        label: label || ""
                    });
                }
            });
        }

        function walkSteps(steps, predecessors) {
            let current = asList(predecessors);
            asList(steps).forEach(function (step) {
                const parsed = stepParts(step);
                if (!parsed) {
                    return;
                }
                const kind = parsed.kind;
                const body = parsed.body;
                if (kind === "choice") {
                    current = walkChoice(body, current);
                    return;
                }
                if (kind === "doTry" || kind === "try") {
                    current = walkTry(body, current);
                    return;
                }
                if (kind === "multicast") {
                    current = walkMulticast(body, current);
                    return;
                }
                const id = addNode(kind, body, nextLevel(current));
                link(current, id);
                const nested = childSteps(body);
                current = nested.length ? walkSteps(nested, [id]) : [id];
            });
            return current;
        }

        function walkChoice(body, predecessors) {
            const choiceId = addNode("choice", body || {}, nextLevel(predecessors));
            link(predecessors, choiceId);
            const tails = [];
            asList(body && body.when).forEach(function (when) {
                const whenId = addNode("when", when, nextLevel([choiceId]));
                link(choiceId, whenId, "when");
                let next = childSteps(when);
                if (!next.length && when && (when.to || when.uri)) {
                    next = [{ to: when.to || when.uri }];
                }
                const whenTails = next.length ? walkSteps(next, [whenId]) : [whenId];
                tails.push.apply(tails, whenTails);
            });
            if (body && body.otherwise != null) {
                const other = body.otherwise;
                const otherId = addNode("otherwise", other, nextLevel([choiceId]));
                link(choiceId, otherId, "otherwise");
                const otherSteps = childSteps(other);
                const otherTails = otherSteps.length ? walkSteps(otherSteps, [otherId]) : [otherId];
                tails.push.apply(tails, otherTails);
            }
            return tails.length ? tails : [choiceId];
        }

        function walkTry(body, predecessors) {
            const tryId = addNode("doTry", body || {}, nextLevel(predecessors));
            link(predecessors, tryId);
            const tails = walkSteps(childSteps(body), [tryId]);
            asList(body && (body.doCatch || body.catch)).forEach(function (caught) {
                const catchId = addNode("doCatch", caught, nextLevel([tryId]));
                link(tryId, catchId, "catch");
                walkSteps(childSteps(caught), [catchId]);
            });
            if (body && (body.doFinally || body.finally)) {
                const fin = body.doFinally || body.finally;
                const finId = addNode("doFinally", fin, nextLevel([tryId]));
                link(tryId, finId, "finally");
                walkSteps(childSteps(fin), [finId]);
            }
            return tails.length ? tails : [tryId];
        }

        function walkMulticast(body, predecessors) {
            const multiId = addNode("multicast", body || {}, nextLevel(predecessors));
            link(predecessors, multiId);
            const tails = [];
            const branches = childSteps(body);
            if (branches.length) {
                const ended = walkSteps(branches, [multiId]);
                tails.push.apply(tails, ended);
            }
            asList(body && body.to).forEach(function (target) {
                const toId = addNode("to", typeof target === "string" ? target : target,
                    nextLevel([multiId]));
                link(multiId, toId);
                tails.push(toId);
            });
            return tails.length ? tails : [multiId];
        }

        function walkFrom(fromBody, level) {
            const fromId = addNode("from", fromBody, typeof level === "number" ? level : 0);
            const steps = typeof fromBody === "object" ? childSteps(fromBody) : [];
            if (steps.length) {
                walkSteps(steps, [fromId]);
            }
            return fromId;
        }

        function walkRoute(route) {
            if (!route || typeof route !== "object") {
                return;
            }
            let start = null;
            if (route.id) {
                start = addNode("route", route, 0);
            }
            if (route.from != null) {
                const fromId = walkFrom(route.from, start ? 1 : 0);
                if (start) {
                    link(start, fromId);
                }
            }
        }

        function walkRest(rest) {
            if (!rest || typeof rest !== "object") {
                return;
            }
            const restId = addNode("rest", rest, 0);
            REST_METHODS.forEach(function (method) {
                if (rest[method] == null) {
                    return;
                }
                asList(rest[method]).forEach(function (verb) {
                    const methodId = addNode(method, verb, 1);
                    link(restId, methodId, method.toUpperCase());
                    const to = typeof verb === "string" ? verb : uriOf(verb);
                    if (to) {
                        const toId = addNode("to", to, 2);
                        link(methodId, toId);
                    }
                });
            });
        }

        flattenDefs(value).forEach(function (item) {
            if (item.route != null) {
                walkRoute(item.route);
                return;
            }
            if (item.from != null && item.steps == null && !item.rest) {
                walkFrom(item.from);
                return;
            }
            if (item.rest != null) {
                walkRest(item.rest);
                return;
            }
            if (item.id != null && item.from != null) {
                walkRoute(item);
            }
        });

        function linkMatchingEndpoints() {
            const froms = [];
            const tos = [];
            nodes.forEach(function (node) {
                const endpoint = parseEndpoint(node.endpointUri);
                if (!endpoint) {
                    return;
                }
                if (node.group === "from") {
                    froms.push({ node: node, endpoint: endpoint });
                } else if (node.group === "to") {
                    tos.push({ node: node, endpoint: endpoint });
                }
            });
            tos.forEach(function (producer) {
                froms.forEach(function (consumer) {
                    if (producer.endpoint.key !== consumer.endpoint.key) {
                        return;
                    }
                    if (producer.node.id === consumer.node.id) {
                        return;
                    }
                    edges.push({
                        from: producer.node.id,
                        to: consumer.node.id,
                        label: producer.endpoint.scheme,
                        title: producer.endpoint.scheme + " · " + producer.endpoint.key,
                        dashed: true
                    });
                });
            });
        }

        linkMatchingEndpoints();
        return { nodes: nodes, edges: edges };
    }

    function placeNodes(graph) {
        const nodes = graph.nodes || [];
        const edges = graph.edges || [];
        if (!nodes.length) {
            return graph;
        }
        const byId = {};
        const orderIndex = {};
        const adj = {};
        nodes.forEach(function (node, index) {
            byId[node.id] = node;
            orderIndex[node.id] = index;
            adj[node.id] = [];
        });
        const outgoing = {};
        const incoming = {};
        edges.forEach(function (edge) {
            if (edge.dashed || !byId[edge.from] || !byId[edge.to]) {
                return;
            }
            adj[edge.from].push(edge.to);
            adj[edge.to].push(edge.from);
            if (!outgoing[edge.from]) {
                outgoing[edge.from] = [];
            }
            outgoing[edge.from].push(edge.to);
            if (!incoming[edge.to]) {
                incoming[edge.to] = [];
            }
            incoming[edge.to].push(edge.from);
        });

        const seen = {};
        const components = [];
        nodes.forEach(function (node) {
            if (seen[node.id]) {
                return;
            }
            const stack = [node.id];
            const ids = [];
            seen[node.id] = true;
            while (stack.length) {
                const id = stack.pop();
                ids.push(id);
                (adj[id] || []).forEach(function (next) {
                    if (!seen[next]) {
                        seen[next] = true;
                        stack.push(next);
                    }
                });
            }
            ids.sort(function (a, b) {
                return orderIndex[a] - orderIndex[b];
            });
            components.push(ids);
        });
        components.sort(function (a, b) {
            return orderIndex[a[0]] - orderIndex[b[0]];
        });

        function indexOf(order) {
            const map = {};
            order.forEach(function (id, index) {
                map[id] = index;
            });
            return map;
        }

        function barycenter(neighbors, index) {
            if (!neighbors || !neighbors.length) {
                return null;
            }
            let sum = 0;
            let count = 0;
            neighbors.forEach(function (id) {
                if (index[id] != null) {
                    sum += index[id];
                    count += 1;
                }
            });
            return count ? sum / count : null;
        }

        function sortByBarycenter(ids, neighborsOf, index) {
            ids.sort(function (a, b) {
                const left = barycenter(neighborsOf[a], index);
                const right = barycenter(neighborsOf[b], index);
                if (left == null && right == null) {
                    return orderIndex[a] - orderIndex[b];
                }
                if (left == null) {
                    return 1;
                }
                if (right == null) {
                    return -1;
                }
                if (left !== right) {
                    return left - right;
                }
                return orderIndex[a] - orderIndex[b];
            });
        }

        const xGap = 240;
        const yGap = 120;
        let yOffset = 0;
        components.forEach(function (comp) {
            const byLevel = {};
            comp.forEach(function (id) {
                const level = typeof byId[id].level === "number" ? byId[id].level : 0;
                if (!byLevel[level]) {
                    byLevel[level] = [];
                }
                byLevel[level].push(id);
            });
            const levelKeys = Object.keys(byLevel).map(Number).sort(function (a, b) {
                return a - b;
            });
            levelKeys.forEach(function (level) {
                byLevel[level].sort(function (a, b) {
                    return orderIndex[a] - orderIndex[b];
                });
            });
            let pass;
            for (pass = 0; pass < 4; pass += 1) {
                let i;
                for (i = 1; i < levelKeys.length; i += 1) {
                    sortByBarycenter(byLevel[levelKeys[i]], incoming, indexOf(byLevel[levelKeys[i - 1]]));
                }
                for (i = levelKeys.length - 2; i >= 0; i -= 1) {
                    sortByBarycenter(byLevel[levelKeys[i]], outgoing, indexOf(byLevel[levelKeys[i + 1]]));
                }
            }
            const tallest = levelKeys.reduce(function (max, level) {
                return Math.max(max, byLevel[level].length);
            }, 1);
            const canvasHeight = (tallest - 1) * yGap;
            levelKeys.forEach(function (level) {
                const ids = byLevel[level];
                const colHeight = (ids.length - 1) * yGap;
                const originY = yOffset + (canvasHeight - colHeight) / 2;
                ids.forEach(function (id, row) {
                    byId[id].x = level * xGap;
                    byId[id].y = originY + row * yGap;
                    byId[id].fixed = false;
                });
            });
            yOffset += canvasHeight + yGap * 1.5;
        });
        return graph;
    }

    function emptyMessage(text) {
        const el = document.getElementById("camel-route-graph");
        if (!el) {
            return;
        }
        destroyNetwork();
        el.innerHTML = '<div class="text-muted text-center py-5 px-3">' + esc(text) + "</div>";
    }

    function destroyNetwork() {
        if (sizeWait) {
            sizeWait.disconnect();
            sizeWait = null;
        }
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (network) {
            network.destroy();
            network = null;
        }
    }

    function themeFont() {
        const dark = document.documentElement.getAttribute("data-bs-theme") === "dark";
        return {
            color: dark ? "#e9ecef" : "#212529",
            face: "inherit",
            size: 13,
            multi: true,
            strokeWidth: 0
        };
    }

    function visGroups() {
        const font = themeFont();
        const groups = {};
        Object.keys(GROUPS).forEach(function (name) {
            const src = GROUPS[name];
            groups[name] = {
                color: src.color,
                shape: src.shape,
                font: src.shape === "diamond"
                    ? { color: font.color, face: font.face, size: font.size, multi: true, strokeWidth: 0 }
                    : src.font
            };
        });
        return groups;
    }

    function networkData(graph) {
        placeNodes(graph);
        return {
            nodes: new vis.DataSet(graph.nodes),
            edges: new vis.DataSet(styleEdges(graph.edges))
        };
    }

    function finishLayout(animate) {
        if (!network) {
            return;
        }
        const el = document.getElementById("camel-route-graph");
        if (!el || !el.clientWidth || !el.clientHeight) {
            return;
        }
        const size = el.clientWidth + "x" + el.clientHeight;
        ignoreResize = true;
        network.setSize(el.clientWidth + "px", el.clientHeight + "px");
        network.redraw();
        if (animate || size !== lastCanvasSize) {
            lastCanvasSize = size;
            network.fit({
                animation: animate
                    ? { duration: 220, easingFunction: "easeInOutQuad" }
                    : false
            });
        }
        window.requestAnimationFrame(function () {
            ignoreResize = false;
        });
    }

    function reformat() {
        finishLayout(true);
    }

    function drawWhenSized(el, graph) {
        if (sizeWait) {
            sizeWait.disconnect();
            sizeWait = null;
        }
        if (el.clientWidth && el.clientHeight) {
            createNetwork(el, graph);
            return;
        }
        if (typeof ResizeObserver === "undefined") {
            createNetwork(el, graph);
            return;
        }
        sizeWait = new ResizeObserver(function () {
            if (!el.clientWidth || !el.clientHeight) {
                return;
            }
            sizeWait.disconnect();
            sizeWait = null;
            createNetwork(el, graph);
        });
        sizeWait.observe(el);
    }

    function createNetwork(el, graph) {
        destroyNetwork();
        lastCanvasSize = "";
        el.innerHTML = "";
        network = new vis.Network(el, networkData(graph), {
            groups: visGroups(),
            layout: {
                hierarchical: { enabled: false },
                improvedLayout: false,
                randomSeed: 2
            },
            physics: { enabled: false },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                navigationButtons: true,
                keyboard: { enabled: true, bindToWindow: false },
                hover: true,
                tooltipDelay: 200,
                selectable: true
            },
            nodes: {
                margin: 12,
                borderWidth: 1,
                shadow: false,
                font: themeFont(),
                widthConstraint: { maximum: 180 }
            },
            edges: {
                width: 1.5,
                font: { strokeWidth: 0 }
            }
        });
        network.once("afterDrawing", function () {
            finishLayout(false);
            observe();
        });
    }

    function draw(graph) {
        const el = document.getElementById("camel-route-graph");
        if (!el || typeof vis === "undefined" || !vis.Network) {
            return;
        }
        lastGraph = graph;
        drawWhenSized(el, graph);
    }

    function observe() {
        const el = document.getElementById("camel-route-graph");
        if (!el || typeof ResizeObserver === "undefined") {
            return;
        }
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        observer = new ResizeObserver(function () {
            if (ignoreResize) {
                return;
            }
            window.requestAnimationFrame(resize);
        });
        observer.observe(el);
        const card = document.getElementById("camel-route-graph-card");
        if (card) {
            observer.observe(card);
        }
    }

    function resize() {
        finishLayout(false);
    }

    function refresh() {
        const yaml = sourceFn ? String(sourceFn() || "") : "";
        if (yaml === lastYaml && network) {
            resize();
            return;
        }
        lastYaml = yaml;
        if (!yaml.trim()) {
            setStatus("");
            emptyMessage("Add a Camel route in the YAML editor to see the graph.");
            return;
        }
        const parsed = parseYaml(yaml);
        if (parsed.error) {
            setStatus(parsed.error, true);
            if (!network) {
                emptyMessage("YAML is not valid yet. The graph updates when it parses.");
            }
            return;
        }
        const graph = buildGraph(parsed.value);
        if (!graph.nodes.length) {
            setStatus("");
            emptyMessage("No route, from, or rest blocks found in this YAML.");
            return;
        }
        setStatus(graph.nodes.length + (graph.nodes.length === 1 ? " node" : " nodes"));
        draw(graph);
    }

    function scheduleRefresh() {
        if (refreshTimer) {
            window.clearTimeout(refreshTimer);
        }
        refreshTimer = window.setTimeout(function () {
            refreshTimer = 0;
            refresh();
        }, 280);
    }

    function bind() {
        const $card = $("#camel-route-graph-card");
        $card.off(".crgraph");
        $card.on("click.crgraph", "#camel-route-graph-refresh", function () {
            lastYaml = null;
            refresh();
        });
    }

    function mount(getYaml) {
        destroy();
        sourceFn = typeof getYaml === "function" ? getYaml : function () { return ""; };
        bind();
        refresh();
    }

    function destroy() {
        if (refreshTimer) {
            window.clearTimeout(refreshTimer);
            refreshTimer = 0;
        }
        $("#camel-route-graph-card").off(".crgraph");
        destroyNetwork();
        sourceFn = null;
        lastYaml = null;
        lastGraph = null;
        lastCanvasSize = "";
        ignoreResize = false;
    }

    return {
        card: card,
        mount: mount,
        refresh: refresh,
        scheduleRefresh: scheduleRefresh,
        reformat: reformat,
        resize: resize,
        destroy: destroy
    };
}());
