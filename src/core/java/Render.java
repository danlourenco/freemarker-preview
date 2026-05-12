///usr/bin/env jbang "$0" "$@" ; exit $?
//DEPS org.freemarker:freemarker:2.3.34
//DEPS com.fasterxml.jackson.core:jackson-databind:2.18.2

import freemarker.core.Environment;
import freemarker.core.InvalidReferenceException;
import freemarker.core.ParseException;
import freemarker.template.Configuration;
import freemarker.template.Template;
import freemarker.template.TemplateException;
import freemarker.template.TemplateExceptionHandler;
import freemarker.template.TemplateNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class Render {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        if (args.length >= 1 && "--daemon".equals(args[0])) {
            if (args.length < 2 || args.length > 3) {
                System.err.println("usage: Render --daemon <templatesRoot> [missingMode]");
                System.exit(2);
                return;
            }
            String mode = args.length == 3 ? args[2] : "error";
            runDaemon(new File(args[1]), mode);
            return;
        }

        if (args.length < 3 || args.length > 4) {
            System.err.println("usage: Render <templatesRoot> <templateName> <fixturePath> [missingMode]");
            System.err.println("       Render --daemon <templatesRoot> [missingMode]");
            System.exit(2);
            return;
        }

        File templatesRoot = new File(args[0]);
        String templateName = args[1];
        File fixtureFile = new File(args[2]);
        String missingMode = args.length == 4 ? args[3] : "error";
        String templatePath = new File(templatesRoot, templateName).getAbsolutePath();

        try {
            Configuration cfg = freshConfig(templatesRoot, missingMode);
            String html = renderWithConfig(cfg, templateName, fixtureFile);
            emit(Map.of("ok", true, "html", html));
        } catch (Throwable t) {
            emit(errorBody(t, templatePath));
        }
    }

    private static void runDaemon(File templatesRoot, String missingMode) throws Exception {
        Configuration cfg = freshConfig(templatesRoot, missingMode);

        BufferedReader in = new BufferedReader(
            new InputStreamReader(System.in, StandardCharsets.UTF_8)
        );

        // Strictly serial request/response: read a request line, render,
        // write a response line. No id correlation — caller is responsible
        // for treating the daemon as serial.
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isEmpty()) continue;

            String templateName = null;
            String fixturePath = null;
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> req = MAPPER.readValue(line, Map.class);
                templateName = (String) req.get("templateName");
                fixturePath = (String) req.get("fixturePath");
            } catch (Exception parseEx) {
                emit(errorBody(parseEx, ""));
                continue;
            }

            String templatePath = new File(templatesRoot, templateName).getAbsolutePath();
            try {
                String html = renderWithConfig(cfg, templateName, new File(fixturePath));
                emit(Map.of("ok", true, "html", html));
            } catch (Throwable t) {
                emit(errorBody(t, templatePath));
            }
        }
    }

    private static Configuration freshConfig(File templatesRoot, String missingMode) throws Exception {
        Configuration cfg = new Configuration(Configuration.VERSION_2_3_34);
        cfg.setDirectoryForTemplateLoading(templatesRoot);
        cfg.setDefaultEncoding("UTF-8");
        cfg.setOutputEncoding("UTF-8");
        cfg.setLocale(Locale.US);
        cfg.setTemplateExceptionHandler(handlerFor(missingMode));
        cfg.setRecognizeStandardFileExtensions(true);
        applyUserSettings(cfg);
        return cfg;
    }

    /**
     * Apply freemarker.* settings from FMP_FREEMARKER_SETTINGS (JSON object)
     * via Configuration.setSetting(key, value). Lets users mirror their
     * production FreeMarkerConfigurer overrides (number_format, date_format,
     * whitespace_stripping, etc.) without code changes.
     */
    private static void applyUserSettings(Configuration cfg) throws Exception {
        String json = System.getenv("FMP_FREEMARKER_SETTINGS");
        if (json == null || json.isEmpty()) return;
        @SuppressWarnings("unchecked")
        Map<String, Object> settings = MAPPER.readValue(json, Map.class);
        for (Map.Entry<String, Object> e : settings.entrySet()) {
            cfg.setSetting(e.getKey(), String.valueOf(e.getValue()));
        }
    }

    private static TemplateExceptionHandler handlerFor(String mode) {
        if ("placeholder".equals(mode)) return PLACEHOLDER_HANDLER;
        if ("empty".equals(mode)) return EMPTY_HANDLER;
        return TemplateExceptionHandler.RETHROW_HANDLER;
    }

    private static final String PLACEHOLDER_STYLE =
        "display:inline-block;background:rgba(211,58,58,0.18);color:#a02020;" +
        "padding:0 4px;border-radius:3px;font-family:ui-monospace,monospace;" +
        "font-size:0.9em;";

    private static final TemplateExceptionHandler PLACEHOLDER_HANDLER =
        new TemplateExceptionHandler() {
            @Override
            public void handleTemplateException(TemplateException te, Environment env, Writer out)
                    throws TemplateException {
                if (te instanceof InvalidReferenceException ire) {
                    String path = ire.getBlamedExpressionString();
                    String safe = path != null ? escapeHtml(path) : "?";
                    try {
                        out.write(
                            "<span class=\"fmp-missing\" style=\"" + PLACEHOLDER_STYLE + "\">"
                            + "‹" + safe + "›</span>"
                        );
                        out.flush();
                    } catch (IOException ioe) {
                        throw new TemplateException(ioe, env);
                    }
                    return;
                }
                throw te;
            }
        };

    private static final TemplateExceptionHandler EMPTY_HANDLER =
        new TemplateExceptionHandler() {
            @Override
            public void handleTemplateException(TemplateException te, Environment env, Writer out)
                    throws TemplateException {
                if (te instanceof InvalidReferenceException) return;
                throw te;
            }
        };

    private static String escapeHtml(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&': b.append("&amp;"); break;
                case '<': b.append("&lt;"); break;
                case '>': b.append("&gt;"); break;
                case '"': b.append("&quot;"); break;
                case '\'': b.append("&#39;"); break;
                default: b.append(c);
            }
        }
        return b.toString();
    }

    private static String renderWithConfig(Configuration cfg, String templateName, File fixtureFile)
            throws IOException, TemplateException {
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = MAPPER.readValue(fixtureFile, Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) coerceIsoDates(raw);

        cfg.clearTemplateCache();
        Template template = cfg.getTemplate(templateName);
        StringWriter out = new StringWriter();
        template.process(data, out);
        return out.toString();
    }

    private static Map<String, Object> errorBody(Throwable t, String templatePath) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("type", classify(t));
        error.put("message", extractMessage(t));
        Integer line = extractLine(t);
        Integer column = extractColumn(t);
        if (line != null) error.put("line", line);
        if (column != null) error.put("column", column);
        error.put("templatePath", templatePath);
        error.put("stack", stackTrace(t));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("error", error);
        return body;
    }

    private static String classify(Throwable t) {
        if (t instanceof InvalidReferenceException) return "undefined-variable";
        if (t instanceof TemplateNotFoundException) return "template-not-found";
        if (t instanceof ParseException) return "template-parse";
        if (t instanceof TemplateException) return "template-runtime";
        if (t instanceof JsonProcessingException) return "fixture-parse";
        if (t instanceof IOException) return "fixture-read";
        return "internal";
    }

    private static String extractMessage(Throwable t) {
        if (t instanceof InvalidReferenceException ire) {
            String blamed = ire.getBlamedExpressionString();
            if (blamed != null) return blamed + " is undefined";
        }
        if (t instanceof ParseException pe) {
            return pe.getEditorMessage();
        }
        if (t instanceof TemplateException te) {
            String desc = te.getMessageWithoutStackTop();
            if (desc != null) return firstLine(desc);
        }
        String m = t.getMessage();
        return m != null ? firstLine(m) : t.getClass().getSimpleName();
    }

    private static String firstLine(String s) {
        int nl = s.indexOf('\n');
        return nl >= 0 ? s.substring(0, nl).trim() : s.trim();
    }

    private static Integer extractLine(Throwable t) {
        if (t instanceof TemplateException te && te.getLineNumber() > 0) return te.getLineNumber();
        if (t instanceof ParseException pe && pe.getLineNumber() > 0) return pe.getLineNumber();
        return null;
    }

    private static Integer extractColumn(Throwable t) {
        if (t instanceof TemplateException te && te.getColumnNumber() > 0) return te.getColumnNumber();
        if (t instanceof ParseException pe && pe.getColumnNumber() > 0) return pe.getColumnNumber();
        return null;
    }

    private static String stackTrace(Throwable t) {
        StringWriter sw = new StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        return sw.toString();
    }

    private static void emit(Map<String, Object> envelope) {
        try {
            String json = MAPPER.writeValueAsString(envelope);
            System.out.write(json.getBytes(StandardCharsets.UTF_8));
            System.out.write('\n');
            System.out.flush();
        } catch (IOException io) {
            System.err.println("internal: failed to write envelope: " + io.getMessage());
            System.exit(1);
        }
    }

    private static final Pattern ISO_8601 = Pattern.compile(
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"
    );

    @SuppressWarnings("unchecked")
    private static Object coerceIsoDates(Object value) {
        if (value instanceof String s && ISO_8601.matcher(s).matches()) {
            try {
                return Date.from(Instant.parse(s));
            } catch (Exception ignored) {
                return s;
            }
        }
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                result.put((String) e.getKey(), coerceIsoDates(e.getValue()));
            }
            return result;
        }
        if (value instanceof List<?> l) {
            return l.stream().map(Render::coerceIsoDates).collect(Collectors.toList());
        }
        return value;
    }
}
