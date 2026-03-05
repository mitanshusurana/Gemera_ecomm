package com.jewelry.backend.service;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import java.util.HashMap;
import java.util.Map;

@Disabled("Run manually for performance profiling")
public class EmailServiceBenchmark {

    @Test
    public void benchmarkStringReplace() {
        String template = "<html><body><h1>Hello {{name}}!</h1><p>Your order {{orderId}} has shipped.</p><p>Total: {{total}}</p></body></html>";
        Map<String, String> data = new HashMap<>();
        data.put("name", "John Doe");
        data.put("orderId", "12345");
        data.put("total", "$100.00");
        data.put("unused1", "value1");
        data.put("unused2", "value2");
        data.put("unused3", "value3");

        // Warm up
        for (int i = 0; i < 10000; i++) {
            String htmlContent = template;
            for (Map.Entry<String, String> entry : data.entrySet()) {
                htmlContent = htmlContent.replace("{{" + entry.getKey() + "}}", String.valueOf(entry.getValue()));
            }
        }

        long start = System.nanoTime();
        for (int i = 0; i < 1000000; i++) {
            String htmlContent = template;
            for (Map.Entry<String, String> entry : data.entrySet()) {
                htmlContent = htmlContent.replace("{{" + entry.getKey() + "}}", String.valueOf(entry.getValue()));
            }
        }
        long end = System.nanoTime();
        System.out.println("Time taken with String.replace (ms): " + (end - start) / 1000000.0);
    }

    @Test
    public void benchmarkSinglePass() {
        String template = "<html><body><h1>Hello {{name}}!</h1><p>Your order {{orderId}} has shipped.</p><p>Total: {{total}}</p></body></html>";
        Map<String, String> data = new HashMap<>();
        data.put("name", "John Doe");
        data.put("orderId", "12345");
        data.put("total", "$100.00");
        data.put("unused1", "value1");
        data.put("unused2", "value2");
        data.put("unused3", "value3");

        // Warm up
        for (int i = 0; i < 10000; i++) {
            replacePlaceholders(template, data);
        }

        long start = System.nanoTime();
        for (int i = 0; i < 1000000; i++) {
            replacePlaceholders(template, data);
        }
        long end = System.nanoTime();
        System.out.println("Time taken with SinglePass (ms): " + (end - start) / 1000000.0);
    }

    private String replacePlaceholders(String template, Map<String, String> data) {
        StringBuilder sb = new StringBuilder(template.length());
        int i = 0;
        while (i < template.length()) {
            int openIdx = template.indexOf("{{", i);
            if (openIdx == -1) {
                sb.append(template, i, template.length());
                break;
            }
            sb.append(template, i, openIdx);
            int closeIdx = template.indexOf("}}", openIdx + 2);
            if (closeIdx == -1) {
                sb.append(template, openIdx, template.length());
                break;
            }
            String key = template.substring(openIdx + 2, closeIdx);
            if (data.containsKey(key)) {
                sb.append(data.get(key));
            } else {
                sb.append("{{").append(key).append("}}");
            }
            i = closeIdx + 2;
        }
        return sb.toString();
    }
}
