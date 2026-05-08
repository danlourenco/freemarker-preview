///usr/bin/env jbang "$0" "$@" ; exit $?
//DEPS org.freemarker:freemarker:2.3.34
//DEPS com.fasterxml.jackson.core:jackson-databind:2.18.2

import freemarker.template.Configuration;
import freemarker.template.Template;
import freemarker.template.TemplateExceptionHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class Render {
    public static void main(String[] args) throws Exception {
        if (args.length != 3) {
            System.err.println("usage: Render <templatesRoot> <templateName> <fixturePath>");
            System.exit(2);
        }

        File templatesRoot = new File(args[0]);
        String templateName = args[1];
        File fixtureFile = new File(args[2]);

        Configuration cfg = new Configuration(Configuration.VERSION_2_3_34);
        cfg.setDirectoryForTemplateLoading(templatesRoot);
        cfg.setDefaultEncoding("UTF-8");
        cfg.setOutputEncoding("UTF-8");
        cfg.setLocale(Locale.US);
        cfg.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
        cfg.setRecognizeStandardFileExtensions(true);

        ObjectMapper mapper = new ObjectMapper();
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = mapper.readValue(fixtureFile, Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) coerceIsoDates(raw);

        Template template = cfg.getTemplate(templateName);
        Writer out = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true);
        template.process(data, out);
        out.flush();
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
