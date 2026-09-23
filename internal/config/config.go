package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	DB               string
	HTTPAddr         string
	PublicURL        string
	LLMBase          string
	LLMKey           string
	LLMModel         string
	MaxAnalyzeTokens int
	TGToken          string
	TGChatID         int64
	OffsetFile       string
	SearchURL        string
}

// DefaultSearchURL is the public SearXNG instance used when
// SPARKKEEP_SEARCH_URL is unset. Override per deployment (SPARKKEEP_SEARCH_URL
// takes precedence in Load).
const DefaultSearchURL = "https://searx.be"

func Load() (Config, error) {
	cfg := Config{
		DB:               getenv("SPARKKEEP_DB", "./sparkkeep.db"),
		HTTPAddr:         getenv("SPARKKEEP_HTTP_ADDR", ":8080"),
		PublicURL:        getenv("SPARKKEEP_PUBLIC_URL", "http://localhost:8080"),
		LLMBase:          getenv("SPARKKEEP_LLM_BASE", "http://localhost:11434/v1"),
		LLMKey:           getenv("SPARKKEEP_LLM_KEY", ""),
		LLMModel:         os.Getenv("SPARKKEEP_LLM_MODEL"),
		MaxAnalyzeTokens: 2048,
		TGToken:          os.Getenv("SPARKKEEP_TG_TOKEN"),
		SearchURL:        getenv("SPARKKEEP_SEARCH_URL", DefaultSearchURL),
	}

	if v := os.Getenv("SPARKKEEP_MAX_ANALYZE_TOKENS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: SPARKKEEP_MAX_ANALYZE_TOKENS: %w", err)
		}
		cfg.MaxAnalyzeTokens = n
	}

	if v := os.Getenv("SPARKKEEP_TG_CHAT_ID"); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return Config{}, fmt.Errorf("config: SPARKKEEP_TG_CHAT_ID: %w", err)
		}
		cfg.TGChatID = id
	}

	if v := os.Getenv("SPARKKEEP_OFFSET_FILE"); v != "" {
		cfg.OffsetFile = v
	} else {
		cfg.OffsetFile = filepath.Join(filepath.Dir(cfg.DB), "bot_offset.json")
	}

	if cfg.LLMModel == "" {
		return Config{}, fmt.Errorf("config: SPARKKEEP_LLM_MODEL is required")
	}

	return cfg, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
