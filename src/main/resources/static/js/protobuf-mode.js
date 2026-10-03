(function (CodeMirror) {
    if (!CodeMirror) {
        return;
    }

    const KEYWORDS = {
        syntax: true,
        import: true,
        weak: true,
        public: true,
        package: true,
        option: true,
        message: true,
        group: true,
        enum: true,
        service: true,
        extend: true,
        extensions: true,
        reserved: true,
        to: true,
        rpc: true,
        returns: true,
        stream: true,
        oneof: true,
        map: true,
        optional: true,
        required: true,
        repeated: true,
        edition: true,
        features: true,
        export: true,
        local: true
    };
    const TYPES = {
        double: true,
        float: true,
        int32: true,
        int64: true,
        uint32: true,
        uint64: true,
        sint32: true,
        sint64: true,
        fixed32: true,
        fixed64: true,
        sfixed32: true,
        sfixed64: true,
        bool: true,
        string: true,
        bytes: true
    };
    const ATOMS = {
        true: true,
        false: true,
        inf: true,
        nan: true,
        max: true,
        SPEED: true,
        CODE_SIZE: true,
        LITE_RUNTIME: true,
        STRING: true,
        CORD: true,
        STRING_PIECE: true,
        JS_NORMAL: true,
        JS_STRING: true,
        JS_NUMBER: true,
        EXPLICIT: true,
        IMPLICIT: true,
        LEGACY_REQUIRED: true,
        UNKNOWN: true,
        UNVERIFIED: true,
        ENCODED: true,
        PROTO2: true,
        PROTO3: true,
        EDITIONS: true,
        OPEN: true,
        CLOSED: true,
        PACKED: true,
        EXPANDED: true,
        DELIMITED: true,
        LENGTH_PREFIXED: true,
        STRICT: true,
        NONE: true,
        ALLOW: true,
        STYLE2024: true,
        STYLE_LEGACY: true,
        EXPORT_ALL: true,
        EXPORT_TOP_LEVEL: true,
        LOCAL_ALL: true,
        STRICT_EXPORT: true
    };
    const WELL_KNOWN = [
        "google.protobuf.Any",
        "google.protobuf.Api",
        "google.protobuf.BoolValue",
        "google.protobuf.BytesValue",
        "google.protobuf.DoubleValue",
        "google.protobuf.Duration",
        "google.protobuf.Empty",
        "google.protobuf.Enum",
        "google.protobuf.EnumValue",
        "google.protobuf.Field",
        "google.protobuf.FieldMask",
        "google.protobuf.FloatValue",
        "google.protobuf.Int32Value",
        "google.protobuf.Int64Value",
        "google.protobuf.ListValue",
        "google.protobuf.Method",
        "google.protobuf.Mixin",
        "google.protobuf.NullValue",
        "google.protobuf.Option",
        "google.protobuf.SourceContext",
        "google.protobuf.StringValue",
        "google.protobuf.Struct",
        "google.protobuf.Timestamp",
        "google.protobuf.Type",
        "google.protobuf.UInt32Value",
        "google.protobuf.UInt64Value",
        "google.protobuf.Value"
    ];
    const OPTIONS = [
        "java_package",
        "java_outer_classname",
        "java_multiple_files",
        "java_string_check_utf8",
        "java_generic_services",
        "optimize_for",
        "go_package",
        "cc_generic_services",
        "py_generic_services",
        "php_generic_services",
        "deprecated",
        "cc_enable_arenas",
        "objc_class_prefix",
        "csharp_namespace",
        "swift_prefix",
        "php_class_prefix",
        "php_namespace",
        "php_metadata_namespace",
        "ruby_package",
        "allow_alias",
        "packed",
        "lazy",
        "unverified_lazy",
        "json_name",
        "ctype",
        "jstype",
        "weak",
        "map_entry",
        "message_set_wire_format",
        "no_standard_descriptor_accessor",
        "idempotency_level",
        "features",
        "features.field_presence",
        "features.enum_type",
        "features.repeated_field_encoding",
        "features.utf8_validation",
        "features.message_encoding",
        "features.json_format",
        "features.enforce_naming_style",
        "features.default_symbol_visibility"
    ];
    const HINT_WORDS = Object.keys(KEYWORDS)
        .concat(Object.keys(TYPES))
        .concat(Object.keys(ATOMS))
        .concat(WELL_KNOWN)
        .concat(OPTIONS)
        .concat(["proto2", "proto3", "2023", "2024"]);

    function tokenComment(stream, state) {
        while (!stream.eol()) {
            if (stream.match("*/")) {
                state.tokenize = tokenBase;
                break;
            }
            stream.next();
        }
        return "comment";
    }

    function tokenString(quote) {
        return function (stream, state) {
            let escaped = false;
            while (!stream.eol()) {
                const ch = stream.next();
                if (ch === quote && !escaped) {
                    state.tokenize = tokenBase;
                    break;
                }
                escaped = !escaped && ch === "\\";
            }
            return "string";
        };
    }

    function tokenBase(stream, state) {
        if (stream.eatSpace()) {
            return null;
        }
        if (stream.match("//")) {
            stream.skipToEnd();
            return "comment";
        }
        if (stream.match("/*")) {
            state.tokenize = tokenComment;
            return tokenComment(stream, state);
        }
        const quote = stream.peek();
        if (quote === '"' || quote === "'") {
            stream.next();
            state.tokenize = tokenString(quote);
            return tokenString(quote)(stream, state);
        }
        if (stream.match(/0[xX][0-9a-fA-F]+/) || stream.match(/[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?/)) {
            return "number";
        }
        const punct = stream.peek();
        if (punct && "{}[]();,=<>:".indexOf(punct) >= 0) {
            stream.next();
            if (punct === "{") {
                state.indent += 2;
            } else if (punct === "}") {
                state.indent = Math.max(0, state.indent - 2);
            }
            return null;
        }
        if (stream.match(/[A-Za-z_][\w.]*/)) {
            const word = stream.current();
            const last = word.split(".").pop();
            if (KEYWORDS[word] || KEYWORDS[last]) {
                return "keyword";
            }
            if (TYPES[word] || TYPES[last] || word.indexOf("google.protobuf.") === 0) {
                return "type";
            }
            if (ATOMS[word] || ATOMS[last]) {
                return "atom";
            }
            return "variable";
        }
        stream.next();
        return null;
    }

    CodeMirror.defineMode("protobuf", function () {
        return {
            startState: function () {
                return { tokenize: tokenBase, indent: 0 };
            },
            copyState: function (state) {
                return { tokenize: state.tokenize, indent: state.indent };
            },
            token: function (stream, state) {
                return state.tokenize(stream, state);
            },
            indent: function (state, textAfter) {
                let indent = state.indent || 0;
                if (/^\s*\}/.test(textAfter || "")) {
                    indent -= 2;
                }
                return Math.max(0, indent);
            },
            electricInput: /^\s*\}$/,
            lineComment: "//",
            blockCommentStart: "/*",
            blockCommentEnd: "*/",
            fold: "brace"
        };
    });
    CodeMirror.defineMIME("text/x-protobuf", "protobuf");
    CodeMirror.defineMIME("text/protobuf", "protobuf");

    function declaredNames(cm) {
        const text = cm.getValue();
        const names = [];
        const seen = {};
        const pattern = /\b(?:message|enum|service|rpc|oneof)\s+([A-Za-z_][\w]*)/g;
        let match;
        while ((match = pattern.exec(text))) {
            const name = match[1];
            if (seen[name]) {
                continue;
            }
            seen[name] = true;
            names.push(name);
        }
        return names;
    }

    CodeMirror.registerHelper("hint", "protobuf", function (cm) {
        const cursor = cm.getCursor();
        const line = cm.getLine(cursor.line) || "";
        const before = line.slice(0, cursor.ch);
        const match = before.match(/[A-Za-z_][\w.]*(?:=)?$/);
        const word = match ? match[0].replace(/=$/, "") : "";
        const start = cursor.ch - (match ? match[0].length : 0) + (match && /=$/.test(match[0]) ? match[0].length - word.length : 0);
        const prefix = word.toLowerCase();
        const optionContext = /\boption\s+[\w.]*$/.test(before) || /\[[\w.]*$/.test(before);
        const syntaxContext = /\b(?:syntax|edition)\s*=\s*"?[\w.]*$/.test(before);
        let words = HINT_WORDS.concat(declaredNames(cm));
        if (syntaxContext) {
            words = ["proto2", "proto3", "2023", "2024"];
        } else if (optionContext) {
            words = OPTIONS.concat(Object.keys(ATOMS));
        }
        const seen = {};
        const list = words.filter(function (item) {
            if (seen[item]) {
                return false;
            }
            seen[item] = true;
            return !prefix || item.toLowerCase().indexOf(prefix) === 0;
        });
        return {
            list: list,
            from: CodeMirror.Pos(cursor.line, Math.max(0, start)),
            to: cursor
        };
    });

    window.CadminProtobufMode = {
        keywords: Object.keys(KEYWORDS),
        types: Object.keys(TYPES),
        wellKnown: WELL_KNOWN.slice(),
        options: OPTIONS.slice()
    };
}(window.CodeMirror));
