package com.flexable.web.ingest;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

final class CashRobots {
    private record Rule(boolean allow, String path) {}
    private record Group(List<String> agents, List<Rule> rules) {}
    static boolean allowed(String text, String path) {
        List<Group> groups = new ArrayList<>();
        Group group = new Group(new ArrayList<>(), new ArrayList<>());
        groups.add(group);
        boolean directives = false;
        for (String raw : text.replace("\uFEFF", "").split("\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int colon = line.indexOf(':');
            if (colon < 0) continue;
            String key = line.substring(0, colon).trim().toLowerCase(Locale.ROOT), value = line.substring(colon + 1).trim();
            if (key.equals("user-agent")) {
                if (directives) { group = new Group(new ArrayList<>(), new ArrayList<>()); groups.add(group); directives = false; }
                group.agents().add(value.toLowerCase(Locale.ROOT));
            } else if (key.equals("allow") || key.equals("disallow")) {
                directives = true;
                if (!value.isEmpty()) group.rules().add(new Rule(key.equals("allow"), value));
            }
        }
        int specificity = -1;
        List<Rule> rules = new ArrayList<>();
        for (Group candidate : groups) {
            int score = candidate.agents().stream().mapToInt(a -> a.equals("*") ? 0 : !a.isEmpty() && "flexablewebcatalog".contains(a) ? a.length() : -1).max().orElse(-1);
            if (score < 0 || score < specificity) continue;
            if (score > specificity) { rules.clear(); specificity = score; }
            rules.addAll(candidate.rules());
        }
        int length = -1; boolean allowed = true;
        for (Rule rule : rules) {
            boolean end = rule.path().endsWith("$");
            String p = end ? rule.path().substring(0, rule.path().length() - 1) : rule.path();
            String regex = java.util.Arrays.stream(p.split("\\*", -1)).map(Pattern::quote).collect(java.util.stream.Collectors.joining(".*"));
            int size = p.replace("*", "").length();
            if (path.matches(regex + (end ? "" : ".*")) && (size > length || size == length && rule.allow())) {
                length = size; allowed = rule.allow();
            }
        }
        return allowed;
    }
}
