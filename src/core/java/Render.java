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
import java.util.Locale;
import java.util.Map;

public class Render {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: Render <templatePath> <fixturePath>");
            System.exit(2);
        }

        File templateFile = new File(args[0]);
        File fixtureFile = new File(args[1]);

        Configuration cfg = new Configuration(Configuration.VERSION_2_3_34);
        cfg.setDirectoryForTemplateLoading(templateFile.getParentFile());
        cfg.setDefaultEncoding("UTF-8");
        cfg.setOutputEncoding("UTF-8");
        cfg.setLocale(Locale.US);
        cfg.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
        cfg.setRecognizeStandardFileExtensions(true);

        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> data = mapper.readValue(fixtureFile, Map.class);

        Template template = cfg.getTemplate(templateFile.getName());
        Writer out = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true);
        template.process(data, out);
        out.flush();
    }
}
