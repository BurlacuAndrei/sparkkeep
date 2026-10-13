package core

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"sparkkeep/internal/channel/discord"
	"sparkkeep/internal/channel/openclaw"
	"sparkkeep/internal/channel/slack"
	"sparkkeep/internal/channel/telegram"
)

// ReloadChannels reloads, registers, and unregisters channel adapters in s.Hub
// based on persisted settings in Store (falling back to initial s.Config).
func (s *Service) ReloadChannels(ctx context.Context) error {
	if s == nil || s.Hub == nil {
		return nil
	}

	s.channelMu.Lock()
	defer s.channelMu.Unlock()

	if s.Channel == nil {
		s.Channel = s.Hub
	}

	// 1. Telegram Adapter
	tgToken := s.Config.TGToken
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "tg_token"); err == nil {
			tgToken = strings.TrimSpace(val)
		}
	}
	tgOwnerID := s.Config.TGChatID
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "tg_chat_id"); err == nil && strings.TrimSpace(val) != "" {
			if id, err := strconv.ParseInt(strings.TrimSpace(val), 10, 64); err == nil {
				tgOwnerID = id
			}
		}
	}

	if tgToken != "" {
		if s.tgCancel != nil && s.tgToken == tgToken {
			if adp, ok := s.Hub.Get("telegram"); ok {
				if tg, ok := adp.(*telegram.Adapter); ok {
					tg.OwnerID = tgOwnerID
				}
			} else {
				tg := &telegram.Adapter{
					Token:             tgToken,
					OwnerID:           tgOwnerID,
					PublicURL:         s.Config.PublicURL,
					Service:           s,
					Store:             s.Store,
					Logf:              s.Logf,
					DigestPushEnabled: s.Config.DigestPushEnabled,
					DigestPushDay:     time.Weekday(s.Config.DigestPushDay),
					DigestPushHour:    s.Config.DigestPushHour,
				}
				s.Hub.Register(tg)
			}
		} else {
			if s.tgCancel != nil {
				s.tgCancel()
				s.tgCancel = nil
			}

			tg := &telegram.Adapter{
				Token:             tgToken,
				OwnerID:           tgOwnerID,
				PublicURL:         s.Config.PublicURL,
				Service:           s,
				Store:             s.Store,
				Logf:              s.Logf,
				DigestPushEnabled: s.Config.DigestPushEnabled,
				DigestPushDay:     time.Weekday(s.Config.DigestPushDay),
				DigestPushHour:    s.Config.DigestPushHour,
			}
			s.Hub.Register(tg)

			baseCtx := s.ctx
			if baseCtx == nil {
				baseCtx = context.Background()
			}
			pollCtx, cancel := context.WithCancel(baseCtx)
			s.tgCancel = cancel
			s.tgToken = tgToken

			go func() {
				if err := tg.Run(pollCtx); err != nil && !errors.Is(err, context.Canceled) {
					s.Logf("telegram: %v", err)
				}
			}()
			s.Logf("sparkkeep: telegram channel enabled")
		}
	} else {
		if s.tgCancel != nil {
			s.tgCancel()
			s.tgCancel = nil
			s.Logf("sparkkeep: telegram channel disabled")
		}
		s.tgToken = ""
		s.Hub.Unregister("telegram")
	}

	// 2. OpenClaw Bridge Adapter
	openClawURL := s.Config.OpenClawURL
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "openclaw_url"); err == nil && strings.TrimSpace(val) != "" {
			openClawURL = strings.TrimSpace(val)
		}
	}
	openClawToken := s.Config.OpenClawToken
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "openclaw_token"); err == nil {
			openClawToken = strings.TrimSpace(val)
		}
	}
	openClawChan := s.Config.OpenClawChannel
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "openclaw_channel"); err == nil && strings.TrimSpace(val) != "" {
			openClawChan = strings.TrimSpace(val)
		}
	}
	openClawTarget := s.Config.OpenClawTarget
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "openclaw_target"); err == nil && strings.TrimSpace(val) != "" {
			openClawTarget = strings.TrimSpace(val)
		}
	}
	openClawEnabled := openClawToken != ""
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "openclaw_enabled"); err == nil && strings.TrimSpace(val) != "" {
			openClawEnabled = strings.TrimSpace(val) == "true"
		}
	}

	if openClawEnabled && openClawToken != "" {
		oc := openclaw.New(openclaw.Config{
			GatewayURL:     openClawURL,
			HookToken:      openClawToken,
			DefaultChannel: openClawChan,
			DefaultTarget:  openClawTarget,
			Enabled:        true,
		}, s, s.Store, s.Config.PublicURL, s.Logf)
		s.Hub.Register(oc)
		s.Logf("sparkkeep: openclaw bridge channel enabled (gateway: %s, default channel: %s)", openClawURL, openClawChan)
	} else {
		s.Hub.Unregister("openclaw")
	}

	// 3. Discord Adapter
	discordToken := s.Config.DiscordToken
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "discord_token"); err == nil {
			discordToken = strings.TrimSpace(val)
		}
	}
	discordChanID := s.Config.DiscordChannelID
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "discord_channel_id"); err == nil {
			discordChanID = strings.TrimSpace(val)
		}
	}
	discordPubKey := s.Config.DiscordPublicKey
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "discord_public_key"); err == nil {
			discordPubKey = strings.TrimSpace(val)
		}
	}

	if discordToken != "" && discordChanID != "" {
		dc := discord.New(discord.Config{
			BotToken:  discordToken,
			ChannelID: discordChanID,
			PublicKey: discordPubKey,
			Enabled:   true,
		}, s, s.Store, s.Config.PublicURL, s.Logf)
		s.Hub.Register(dc)
		s.Logf("sparkkeep: discord channel enabled (channel: %s)", discordChanID)
	} else {
		s.Hub.Unregister("discord")
	}

	// 4. Slack Adapter
	slackWebhook := s.Config.SlackWebhookURL
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "slack_webhook_url"); err == nil {
			slackWebhook = strings.TrimSpace(val)
		}
	}
	slackToken := s.Config.SlackBotToken
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "slack_bot_token"); err == nil {
			slackToken = strings.TrimSpace(val)
		}
	}
	slackChanID := s.Config.SlackChannelID
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "slack_channel_id"); err == nil {
			slackChanID = strings.TrimSpace(val)
		}
	}

	if slackWebhook != "" || (slackToken != "" && slackChanID != "") {
		sl := slack.New(slack.Config{
			WebhookURL: slackWebhook,
			BotToken:   slackToken,
			ChannelID:  slackChanID,
			Enabled:    true,
		}, s, s.Store, s.Config.PublicURL, s.Logf)
		s.Hub.Register(sl)
		s.Logf("sparkkeep: slack channel enabled")
	} else {
		s.Hub.Unregister("slack")
	}

	return nil
}
