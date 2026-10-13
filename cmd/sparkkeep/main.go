package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"sparkkeep/internal/channel"
	"sparkkeep/internal/channel/discord"
	"sparkkeep/internal/channel/openclaw"
	"sparkkeep/internal/channel/slack"
	"sparkkeep/internal/channel/telegram"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/store"
	"sparkkeep/internal/web"
)

func main() {
	logger := log.Printf
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	st, err := store.New(cfg.DB)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	svc := core.New(ctx, st, cfg, logger)
	svc.StartQueueWorker(ctx)

	hub := channel.NewHub(logger)
	svc.Hub = hub
	svc.Channel = hub

	// 1. Telegram Adapter
	tgToken := cfg.TGToken
	if val, err := st.GetSetting(ctx, "tg_token"); err == nil && val != "" {
		tgToken = val
	}
	if tgToken != "" {
		tgOwnerID := cfg.TGChatID
		if val, err := st.GetSetting(ctx, "tg_chat_id"); err == nil && val != "" {
			if id, err := strconv.ParseInt(val, 10, 64); err == nil {
				tgOwnerID = id
			}
		}
		tg := &telegram.Adapter{
			Token:             tgToken,
			OwnerID:           tgOwnerID,
			PublicURL:         cfg.PublicURL,
			Service:           svc,
			Store:             st,
			Logf:              logger,
			DigestPushEnabled: cfg.DigestPushEnabled,
			DigestPushDay:     time.Weekday(cfg.DigestPushDay),
			DigestPushHour:    cfg.DigestPushHour,
		}
		hub.Register(tg)
		go func() {
			if err := tg.Run(ctx); err != nil {
				logger("telegram: %v", err)
			}
		}()
		logger("sparkkeep: telegram channel enabled")
	}

	// 2. OpenClaw Bridge Adapter
	openClawURL := cfg.OpenClawURL
	if val, err := st.GetSetting(ctx, "openclaw_url"); err == nil && val != "" {
		openClawURL = val
	}
	openClawToken := cfg.OpenClawToken
	if val, err := st.GetSetting(ctx, "openclaw_token"); err == nil && val != "" {
		openClawToken = val
	}
	openClawChan := cfg.OpenClawChannel
	if val, err := st.GetSetting(ctx, "openclaw_channel"); err == nil && val != "" {
		openClawChan = val
	}
	openClawTarget := cfg.OpenClawTarget
	if val, err := st.GetSetting(ctx, "openclaw_target"); err == nil && val != "" {
		openClawTarget = val
	}
	openClawEnabled := openClawToken != ""
	if val, err := st.GetSetting(ctx, "openclaw_enabled"); err == nil && val != "" {
		openClawEnabled = val == "true"
	}
	if openClawEnabled {
		oc := openclaw.New(openclaw.Config{
			GatewayURL:     openClawURL,
			HookToken:      openClawToken,
			DefaultChannel: openClawChan,
			DefaultTarget:  openClawTarget,
			Enabled:        true,
		}, svc, st, cfg.PublicURL, logger)
		hub.Register(oc)
		logger("sparkkeep: openclaw bridge channel enabled (gateway: %s, default channel: %s)", openClawURL, openClawChan)
	}

	// 3. Discord Adapter
	discordToken := cfg.DiscordToken
	if val, err := st.GetSetting(ctx, "discord_token"); err == nil && val != "" {
		discordToken = val
	}
	discordChanID := cfg.DiscordChannelID
	if val, err := st.GetSetting(ctx, "discord_channel_id"); err == nil && val != "" {
		discordChanID = val
	}
	if discordToken != "" && discordChanID != "" {
		dc := discord.New(discord.Config{
			BotToken:  discordToken,
			ChannelID: discordChanID,
			PublicKey: cfg.DiscordPublicKey,
			Enabled:   true,
		}, svc, st, cfg.PublicURL, logger)
		hub.Register(dc)
		logger("sparkkeep: discord channel enabled (channel: %s)", discordChanID)
	}

	// 4. Slack Adapter
	slackWebhook := cfg.SlackWebhookURL
	if val, err := st.GetSetting(ctx, "slack_webhook_url"); err == nil && val != "" {
		slackWebhook = val
	}
	slackToken := cfg.SlackBotToken
	if val, err := st.GetSetting(ctx, "slack_bot_token"); err == nil && val != "" {
		slackToken = val
	}
	slackChanID := cfg.SlackChannelID
	if val, err := st.GetSetting(ctx, "slack_channel_id"); err == nil && val != "" {
		slackChanID = val
	}
	if slackWebhook != "" || (slackToken != "" && slackChanID != "") {
		sl := slack.New(slack.Config{
			WebhookURL: slackWebhook,
			BotToken:   slackToken,
			ChannelID:  slackChanID,
			Enabled:    true,
		}, svc, st, cfg.PublicURL, logger)
		hub.Register(sl)
		logger("sparkkeep: slack channel enabled")
	}

	srv := &http.Server{
		Handler:           web.New(st, svc, cfg),
		Addr:              cfg.HTTPAddr,
		ReadHeaderTimeout: 15 * time.Second,
	}
	logger("sparkkeep: listening on %s", cfg.HTTPAddr)

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			logger("shutdown: %v", err)
		}
		waitDone := make(chan struct{})
		go func() {
			svc.WG.Wait()
			close(waitDone)
		}()
		select {
		case <-waitDone:
		case <-time.After(5 * time.Second):
			logger("shutdown: timed out waiting for background tasks")
		}
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}
	logger("sparkkeep: stopped")
}
