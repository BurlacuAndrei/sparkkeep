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

	svc := core.New(st, cfg, logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.TGToken != "" {
		tg := &telegram.Adapter{
			Token:   cfg.TGToken,
			OwnerID: cfg.TGChatID,
			Service: svc,
			Store:   st,
			Logf:    logger,
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
		Handler: web.New(st, svc, cfg.PublicURL),
		Addr:    cfg.HTTPAddr,
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
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}
	logger("sparkkeep: stopped")
}
