package config

import (
	"os"
	"testing"
)

func setenv(t *testing.T, kv map[string]string) {
	t.Helper()
	for _, k := range []string{
		"SPARKKEEP_DB", "SPARKKEEP_HTTP_ADDR", "SPARKKEEP_PUBLIC_URL",
		"SPARKKEEP_LLM_BASE", "SPARKKEEP_LLM_KEY", "SPARKKEEP_LLM_MODEL",
		"SPARKKEEP_MAX_ANALYZE_TOKENS", "SPARKKEEP_TG_TOKEN",
		"SPARKKEEP_TG_CHAT_ID", "SPARKKEEP_OFFSET_FILE", "SPARKKEEP_SEARCH_URL",
		"SPARKKEEP_HEADLESS_ENABLED", "SPARKKEEP_CHROME_BIN", "SPARKKEEP_YTDLP",
	} {
		if err := os.Setenv(k, ""); err != nil {
			t.Fatal(err)
		}
	}
	for k, v := range kv {
		if err := os.Setenv(k, v); err != nil {
			t.Fatal(err)
		}
	}
}

func TestLoadDefaults(t *testing.T) {
	setenv(t, map[string]string{"SPARKKEEP_LLM_MODEL": "llama3"})

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	cases := []struct {
		name string
		got  any
		want any
	}{
		{"DB", cfg.DB, "./sparkkeep.db"},
		{"HTTPAddr", cfg.HTTPAddr, ":8080"},
		{"PublicURL", cfg.PublicURL, "http://localhost:8080"},
		{"LLMBase", cfg.LLMBase, "http://localhost:11434/v1"},
		{"LLMKey", cfg.LLMKey, ""},
		{"LLMModel", cfg.LLMModel, "llama3"},
		{"MaxAnalyzeTokens", cfg.MaxAnalyzeTokens, 2048},
		{"TGToken", cfg.TGToken, ""},
		{"TGChatID", cfg.TGChatID, int64(0)},
		{"OffsetFile", cfg.OffsetFile, "bot_offset.json"},
		{"SearchURL", cfg.SearchURL, DefaultSearchURL},
		{"HeadlessEnabled", cfg.HeadlessEnabled, true},
		{"ChromeBin", cfg.ChromeBin, ""},
		{"YtDlpBin", cfg.YtDlpBin, "yt-dlp"},
	}
	for _, tc := range cases {
		if tc.got != tc.want {
			t.Errorf("%s = %v, want %v", tc.name, tc.got, tc.want)
		}
	}
}

func TestLoadErrorMissingModel(t *testing.T) {
	setenv(t, nil)

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for missing SPARKKEEP_LLM_MODEL")
	}
}

func TestLoadFull(t *testing.T) {
	setenv(t, map[string]string{
		"SPARKKEEP_DB":                 "/tmp/sk.db",
		"SPARKKEEP_HTTP_ADDR":          ":9999",
		"SPARKKEEP_PUBLIC_URL":         "https://sk.example.com",
		"SPARKKEEP_LLM_BASE":           "https://llm.example.com/v1",
		"SPARKKEEP_LLM_KEY":            "secret",
		"SPARKKEEP_LLM_MODEL":          "gpt-4o",
		"SPARKKEEP_MAX_ANALYZE_TOKENS": "3000",
		"SPARKKEEP_TG_TOKEN":           "tg-token",
		"SPARKKEEP_TG_CHAT_ID":         "123456789",
		"SPARKKEEP_OFFSET_FILE":        "/data/offset.json",
		"SPARKKEEP_SEARCH_URL":         "https://searx.example.com/search",
		"SPARKKEEP_HEADLESS_ENABLED":   "false",
		"SPARKKEEP_CHROME_BIN":         "/usr/bin/google-chrome",
		"SPARKKEEP_YTDLP":              "/usr/bin/yt-dlp",
	})

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	cases := []struct {
		name string
		got  any
		want any
	}{
		{"DB", cfg.DB, "/tmp/sk.db"},
		{"HTTPAddr", cfg.HTTPAddr, ":9999"},
		{"PublicURL", cfg.PublicURL, "https://sk.example.com"},
		{"LLMBase", cfg.LLMBase, "https://llm.example.com/v1"},
		{"LLMKey", cfg.LLMKey, "secret"},
		{"LLMModel", cfg.LLMModel, "gpt-4o"},
		{"MaxAnalyzeTokens", cfg.MaxAnalyzeTokens, 3000},
		{"TGToken", cfg.TGToken, "tg-token"},
		{"TGChatID", cfg.TGChatID, int64(123456789)},
		{"OffsetFile", cfg.OffsetFile, "/data/offset.json"},
		{"SearchURL", cfg.SearchURL, "https://searx.example.com/search"},
		{"HeadlessEnabled", cfg.HeadlessEnabled, false},
		{"ChromeBin", cfg.ChromeBin, "/usr/bin/google-chrome"},
		{"YtDlpBin", cfg.YtDlpBin, "/usr/bin/yt-dlp"},
	}
	for _, tc := range cases {
		if tc.got != tc.want {
			t.Errorf("%s = %v, want %v", tc.name, tc.got, tc.want)
		}
	}
}
