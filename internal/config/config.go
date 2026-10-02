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
	HeadlessEnabled  bool
	ChromeBin        string
	YtDlpBin         string
	ASRURL           string
	ASRModel         string
	VisionModel      string
	CookiesFile      string
	UploadDir        string
	MaxUploadMB      int
	TranscriptLangs  string
	FFmpegBin        string
}

// DefaultSearchURL is the public SearXNG instance used when
// SPARKKEEP_SEARCH_URL is unset. Override per deployment (SPARKKEEP_SEARCH_URL
// takes precedence in Load).
const DefaultSearchURL = "https://searx.be"

// DefaultASRURL points at the deployed whisper container on proxy_net, used when
// SPARKKEEP_ASR_URL is unset. Override per deployment (SPARKKEEP_ASR_URL takes
// precedence in Load). Note: getenv treats an empty value as unset, so ASRURL is
// never empty — callers that must skip transcription need their own switch.
const DefaultASRURL = "http://whisper:9000"

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
		HeadlessEnabled:  true, // overridden below if env var is set
		ChromeBin:        os.Getenv("SPARKKEEP_CHROME_BIN"),
		YtDlpBin:         getenv("SPARKKEEP_YTDLP", "yt-dlp"),
		ASRURL:           getenv("SPARKKEEP_ASR_URL", DefaultASRURL),
		ASRModel:         os.Getenv("SPARKKEEP_ASR_MODEL"),
		CookiesFile:      os.Getenv("SPARKKEEP_COOKIES_FILE"),
		MaxUploadMB:      25, // overridden below if env var is set
		TranscriptLangs:  getenv("SPARKKEEP_TRANSCRIPT_LANGS", "en.*,en"),
		FFmpegBin:        os.Getenv("SPARKKEEP_FFMPEG_BIN"),
	}

	headless, err := getenvBool("SPARKKEEP_HEADLESS_ENABLED", true)
	if err != nil {
		return Config{}, err
	}
	cfg.HeadlessEnabled = headless

	if v := os.Getenv("SPARKKEEP_VISION_MODEL"); v != "" {
		cfg.VisionModel = v
	} else {
		cfg.VisionModel = cfg.LLMModel
	}
	if v := os.Getenv("SPARKKEEP_MAX_UPLOAD_MB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: SPARKKEEP_MAX_UPLOAD_MB: %w", err)
		}
		cfg.MaxUploadMB = n
	}
	cfg.UploadDir = os.Getenv("SPARKKEEP_UPLOAD_DIR")
	if cfg.UploadDir == "" {
		cfg.UploadDir = filepath.Join(filepath.Dir(cfg.DB), "uploads")
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

func getenvBool(key string, def bool) (bool, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def, fmt.Errorf("config: %s=%q: %w", key, v, err)
	}
	return b, nil
}
