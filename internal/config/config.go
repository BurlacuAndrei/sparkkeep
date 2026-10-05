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
	UploadMaxAgeDays int
	UploadMaxSizeMB  int
	TranscriptLangs  string
	FFmpegBin        string

	// Scheduled weekly digest push over Telegram. Enabled by default once a
	// bot token exists; Day/Hour are local time (0=Sunday, 0..23).
	DigestPushEnabled bool
	DigestPushDay     int
	DigestPushHour    int
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
	if v := os.Getenv("SPARKKEEP_UPLOAD_MAX_AGE_DAYS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: SPARKKEEP_UPLOAD_MAX_AGE_DAYS: %w", err)
		}
		cfg.UploadMaxAgeDays = n
	}
	if v := os.Getenv("SPARKKEEP_UPLOAD_MAX_SIZE_MB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: SPARKKEEP_UPLOAD_MAX_SIZE_MB: %w", err)
		}
		cfg.UploadMaxSizeMB = n
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

	digestPush, err := getenvBool("SPARKKEEP_DIGEST_PUSH_ENABLED", cfg.TGToken != "")
	if err != nil {
		return Config{}, err
	}
	cfg.DigestPushEnabled = digestPush
	if cfg.DigestPushDay, err = getenvInt("SPARKKEEP_DIGEST_PUSH_DAY", 0, 0, 6); err != nil {
		return Config{}, err
	}
	if cfg.DigestPushHour, err = getenvInt("SPARKKEEP_DIGEST_PUSH_HOUR", 19, 0, 23); err != nil {
		return Config{}, err
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

// getenvInt reads an int from key, falling back to def when unset and
// rejecting anything non-numeric or outside [min, max].
func getenvInt(key string, def, min, max int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < min || n > max {
		return def, fmt.Errorf("config: %s=%q: want an int in [%d,%d]", key, v, min, max)
	}
	return n, nil
}
