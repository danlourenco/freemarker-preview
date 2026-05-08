///usr/bin/env jbang "$0" "$@" ; exit $?
//DEPS org.freemarker:freemarker:2.3.34
//DEPS com.fasterxml.jackson.core:jackson-databind:2.18.2

import freemarker.core.InvalidReferenceException;
import freemarker.core.ParseException;
import freemarker.template.Configuration;
import freemarker.template.Template;
import freemarker.template.TemplateException;
import freemarker.template.TemplateExceptionHandler;
import freemarker.template.TemplateNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
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

    public static void main(String[] args) {
        if (args.length != 3) {
            System.err.println("usage: Render <templatesRoot> <templateName> <fixturePath>");
            System.exit(2);
            return;
        }

        File templatesRoot = new File(args[0]);
        String templateName = args[1];
        File fixtureFile = new File(args[2]);
        String templatePath = new File(templatesRoot, templateName).getAbsolutePath();

        try {
            String html = renderToString(templatesRoot, templateName, fixtureFile);
            emit(Map.of("ok", true, "html", html));
        } catch (Throwable t) {
            emit(toErrorEnvelope(t, templatePath));
        }
    }

    private static String renderToString(File templatesRoot, String templateName, File fixtureFile)
            throws IOException, TemplateException {
        Configuration cfg = new Configuration(Configuration.VERSION_2_3_34);
        cfg.setDirectoryForTemplateLoading(templatesRoot);
        cfg.setDefaultEncoding("UTF-8");
        cfg.setOutputEncoding("UTF-8");
        cfg.setLocale(Locale.US);
        cfg.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
        cfg.setRecognizeStandardFileExtensions(true);

        @SuppressWarnings("unchecked")
        Map<String, Object> raw = MAPPER.readValue(fixtureFile, Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) coerceIsoDates(raw);

        Template template = cfg.getTemplate(templateName);
        StringWriter out = new StringWriter();
        template.process(data, out);
        return out.toString();
    }

    private static Map<String, Object> toErrorEnvelope(Throwable t, String templatePath) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("type", classify(t));
        error.put("message", extractMessage(t));
        Integer line = extractLine(t);
        Integer column = extractColumn(t);
        if (line != null) error.put("line", line);
        if (column != null) error.put("column", column);
        error.put("templatePath", templatePath);
        error.put("stack", stackTrace(t));

        Map<String, Object> env = new LinkedHashMap<>();
        env.put("ok", false);
        env.put("error", error);
        return env;
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
