package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

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

	if cfg.TGToken != "" {
		tg := &telegram.Adapter{
			Token:             cfg.TGToken,
			OwnerID:           cfg.TGChatID,
			PublicURL:         cfg.PublicURL,
			Service:           svc,
			Store:             st,
			Logf:              logger,
			DigestPushEnabled: cfg.DigestPushEnabled,
			DigestPushDay:     time.Weekday(cfg.DigestPushDay),
			DigestPushHour:    cfg.DigestPushHour,
		}
		svc.Channel = tg // telegram fills the channel once it is attached
		go func() {
			if err := tg.Run(ctx); err != nil {
				logger("telegram: %v", err)
			}
		}()
		logger("sparkkeep: telegram enabled")
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
