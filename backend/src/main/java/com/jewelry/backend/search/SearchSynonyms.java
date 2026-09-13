package com.jewelry.backend.search;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Static synonym expansion for the product search (OPERATIONS-CONTRACT.md
 * section 6). Hindi and trade names are grouped with their English
 * equivalents; every member of a group expands to the whole group, so
 * "panna" finds emeralds and "emerald" finds products listed as panna.
 *
 * {@link #expand(String)} turns a free-text query into one OR-group per
 * token (the token itself plus its synonyms). Callers AND the groups
 * together and OR the terms inside a group against every searchable field.
 */
public final class SearchSynonyms {

    private SearchSynonyms() {
    }

    private static final List<List<String>> GROUPS = List.of(
            List.of("panna", "emerald"),
            List.of("neelam", "blue sapphire", "sapphire"),
            List.of("pukhraj", "yellow sapphire", "sapphire"),
            List.of("manik", "manikya", "ruby"),
            List.of("moti", "pearl"),
            List.of("moonga", "red coral", "coral"),
            List.of("gomed", "gomedak", "hessonite"),
            List.of("lehsunia", "vaidurya", "cat's eye", "cats eye", "chrysoberyl"),
            List.of("firoza", "turquoise"),
            List.of("heera", "diamond"),
            List.of("sona", "gold"),
            List.of("chandi", "silver"),
            List.of("payal", "anklet"),
            List.of("mangalsutra", "tanmaniya"),
            List.of("jhumka", "jhumki", "earring"),
            List.of("bali", "hoop earring", "hoop"),
            List.of("nath", "nosepin", "nose pin"),
            List.of("kada", "bangle"),
            List.of("haar", "necklace"),
            List.of("angoothi", "ring"),
            List.of("rudraksh", "rudraksha"),
            List.of("tanzanite", "tanzanite stone"),
            List.of("cvd", "lab grown diamond", "lab grown", "lab-grown"),
            List.of("navratna", "navaratna"),
            List.of("polki", "uncut diamond"),
            List.of("kundan"),
            List.of("meenakari", "enamel"));

    /** term (lower case) -> every term in its group, in declaration order. */
    private static final Map<String, Set<String>> INDEX;

    /** Longest multi-word key, in words, so the tokenizer knows how far to look ahead. */
    private static final int MAX_PHRASE_WORDS;

    static {
        Map<String, Set<String>> index = new HashMap<>();
        int maxWords = 1;
        for (List<String> group : GROUPS) {
            for (String term : group) {
                String key = term.toLowerCase(Locale.ROOT);
                Set<String> expansion = index.computeIfAbsent(key, k -> new LinkedHashSet<>());
                expansion.addAll(group);
                maxWords = Math.max(maxWords, key.split(" ").length);
            }
        }
        INDEX = Collections.unmodifiableMap(index);
        MAX_PHRASE_WORDS = maxWords;
    }

    /**
     * Splits {@code query} into tokens (known multi-word phrases such as
     * "blue sapphire" stay together), and returns one OR-group per token:
     * the token first, followed by its synonyms. Every term is lower case.
     * An empty list means the query had no usable text.
     */
    public static List<List<String>> expand(String query) {
        if (query == null) {
            return List.of();
        }
        String[] words = query.trim().toLowerCase(Locale.ROOT).split("[\\s,;]+");
        List<String> tokens = new ArrayList<>();
        for (String word : words) {
            if (!word.isEmpty()) {
                tokens.add(word);
            }
        }

        List<List<String>> groups = new ArrayList<>();
        int i = 0;
        while (i < tokens.size()) {
            // Prefer the longest known phrase starting at this token.
            int consumed = 1;
            String token = tokens.get(i);
            for (int len = Math.min(MAX_PHRASE_WORDS, tokens.size() - i); len > 1; len--) {
                String phrase = String.join(" ", tokens.subList(i, i + len));
                if (INDEX.containsKey(phrase)) {
                    token = phrase;
                    consumed = len;
                    break;
                }
            }
            groups.add(groupFor(token));
            i += consumed;
        }
        return groups;
    }

    private static List<String> groupFor(String token) {
        LinkedHashSet<String> terms = new LinkedHashSet<>();
        terms.add(token);
        Set<String> synonyms = INDEX.get(token);
        if (synonyms == null && token.length() > 3 && token.endsWith("s")) {
            // "earrings" -> "earring", "bangles" -> "bangle"
            synonyms = INDEX.get(token.substring(0, token.length() - 1));
        }
        if (synonyms != null) {
            terms.addAll(synonyms);
        }
        return new ArrayList<>(terms);
    }
}
