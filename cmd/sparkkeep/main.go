package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sparkkeep/internal/channel"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/store"
	"sparkkeep/internal/web"
)

var version = "dev"

func printUsage() {
	fmt.Printf("Sparkkeep %s — Self-Hosted Capture & Action Engine\n\n", version)
	fmt.Println("Usage:")
	fmt.Println("  sparkkeep [server]                 Run the HTTP daemon (default)")
	fmt.Println("  sparkkeep --version | -v           Print version and exit")
	fmt.Println("  sparkkeep --help | -h              Print this help and exit")
	fmt.Println("  sparkkeep auth status              Show current authentication protection state")
	fmt.Println("  sparkkeep auth set-passphrase <p>  Set or update master passphrase (hashed with bcrypt)")
	fmt.Println("  sparkkeep auth generate-token      Generate a new static API token for integrations")
	fmt.Println()
}

func handleAuthCommand(args []string) {
	if len(args) == 0 {
		fmt.Println("Usage: sparkkeep auth <status|set-passphrase|generate-token>")
		os.Exit(1)
	}
	dbPath := config.DBPath()
	st, err := store.New(dbPath)
	if err != nil {
		log.Fatalf("store: open %s: %v", dbPath, err)
	}
	defer st.Close()
	ctx := context.Background()

	switch args[0] {
	case "status":
		token, _ := st.GetSetting(ctx, "auth_token")
		if token == "" {
			if envTok := os.Getenv("SPARKKEEP_AUTH_TOKEN"); envTok != "" {
				fmt.Println("Auth Status: Configured via SPARKKEEP_AUTH_TOKEN environment variable")
			} else {
				fmt.Println("Auth Status: Open Access (no passphrase set)")
			}
		} else if strings.HasPrefix(token, "$2a$") || strings.HasPrefix(token, "$2b$") {
			fmt.Println("Auth Status: Active (Protected with bcrypt salted hash)")
		} else {
			fmt.Println("Auth Status: Active (Legacy plaintext passphrase — will auto-upgrade to bcrypt on next login)")
		}
		apiToken, _ := st.GetSetting(ctx, "api_token")
		if apiToken != "" {
			fmt.Printf("API Token:   Active (%s...)\n", apiToken[:min(len(apiToken), 15)])
		}
	case "set-passphrase":
		if len(args) < 2 || strings.TrimSpace(args[1]) == "" {
			fmt.Fprintln(os.Stderr, "Usage: sparkkeep auth set-passphrase <new-passphrase>")
			os.Exit(1)
		}
		pass := strings.TrimSpace(args[1])
		hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("bcrypt hash failed: %v", err)
		}
		if err := st.SetSetting(ctx, "auth_token", string(hash)); err != nil {
			log.Fatalf("save setting: %v", err)
		}
		fmt.Println("✓ Master passphrase successfully updated (hashed with bcrypt).")
	case "generate-token":
		b := make([]byte, 24)
		if _, err := rand.Read(b); err != nil {
			log.Fatalf("rand: %v", err)
		}
		tok := "sk_live_" + hex.EncodeToString(b)
		if err := st.SetSetting(ctx, "api_token", tok); err != nil {
			log.Fatalf("save setting: %v", err)
		}
		fmt.Printf("✓ Generated new API Token: %s\n", tok)
		fmt.Println("Use this token in Authorization: Bearer header for external tools (Raycast, iOS Shortcut, cURL).")
	default:
		fmt.Fprintf(os.Stderr, "unknown auth command: %s\n", args[0])
		fmt.Fprintln(os.Stderr, "Available commands: status, set-passphrase, generate-token")
		os.Exit(1)
	}
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "-v", "--version", "version":
			fmt.Printf("sparkkeep version %s\n", version)
			return
		case "-h", "--help", "help":
			printUsage()
			return
		case "auth":
			handleAuthCommand(os.Args[2:])
			return
		case "server":
			// run daemon below
		default:
			if strings.HasPrefix(os.Args[1], "-") {
				printUsage()
				return
			}
			fmt.Fprintf(os.Stderr, "unknown command: %s\n\n", os.Args[1])
			printUsage()
			os.Exit(1)
		}
	}

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

	if err := svc.ReloadChannels(ctx); err != nil {
		logger("sparkkeep: reload channels: %v", err)
	}

	srv := &http.Server{
		Handler:           web.New(st, svc, cfg),
		Addr:              cfg.HTTPAddr,
		ReadHeaderTimeout: 15 * time.Second,
	}
	logger("sparkkeep: listening on %s (version %s)", cfg.HTTPAddr, version)

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
