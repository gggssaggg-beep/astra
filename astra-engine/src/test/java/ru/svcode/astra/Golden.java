package ru.svcode.astra;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Доступ к золотым файлам — тем самым JSON, что сгенерировал JS-движок
 * ({@code app/tools/golden.mjs}). Порт обязан выдать те же числа на тех же
 * входах; здесь только чтение, вся проверка — в тестах.
 */
final class Golden {
    private Golden() {}

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Каталог золотых файлов (задаётся сборкой, см. build.gradle). */
    static Path dir() {
        String p = System.getProperty("astra.golden");
        return Path.of(p == null ? "golden" : p);
    }

    /** Каталог файлов эфемерид; null — если его нет, тесты движка пропускаются. */
    static String ephePath() {
        String p = System.getProperty("astra.ephe");
        if (p == null) return null;
        File f = new File(p);
        return f.isDirectory() ? f.getAbsolutePath() : null;
    }

    static JsonNode load(String name) {
        Path file = dir().resolve(name + ".json");
        try {
            return MAPPER.readTree(Files.readString(file));
        } catch (IOException e) {
            throw new UncheckedIOException("нет золотого файла " + file
                    + " — сгенерируй: node astra-engine/tools/golden.mjs", e);
        }
    }

    static JsonNode cases(String name) {
        return load(name).get("cases");
    }
}
