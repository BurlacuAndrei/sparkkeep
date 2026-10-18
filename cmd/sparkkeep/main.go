package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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
	fmt.Println("  sparkkeep backup [output-file]     Snapshot the SQLite database (VACUUM INTO)")
	fmt.Println("  sparkkeep restore <backup-file>    Restore database from snapshot with pre-flight check")
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

func handleBackup(args []string) {
	dbPath := config.DBPath()
	out := ""
	if len(args) > 0 {
		out = args[0]
	}
	if out == "" {
		out = filepath.Join(filepath.Dir(dbPath), "backups",
			"sparkkeep-"+time.Now().UTC().Format("20060102-150405")+".db")
	}
	if _, err := os.Stat(out); err == nil {
		log.Fatalf("backup: %s already exists; refusing to overwrite", out)
	}
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		log.Fatalf("backup: %v", err)
	}
	db, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatalf("backup: open %s: %v", dbPath, err)
	}
	defer db.Close()
	if _, err := db.Exec(`VACUUM INTO ?`, out); err != nil {
		log.Fatalf("backup: %v", err)
	}
	fmt.Printf("✓ Backed up %s to %s\n", dbPath, out)
}

func handleRestore(args []string) {
	if len(args) == 0 || strings.TrimSpace(args[0]) == "" {
		fmt.Fprintln(os.Stderr, "Usage: sparkkeep restore <backup-file>")
		os.Exit(1)
	}
	srcPath := args[0]
	info, err := os.Stat(srcPath)
	if err != nil {
		log.Fatalf("restore: backup file %s: %v", srcPath, err)
	}
	if info.Size() == 0 {
		log.Fatalf("restore: backup file %s is empty", srcPath)
	}

	srcDB, err := sql.Open("sqlite", "file:"+srcPath+"?mode=ro")
	if err != nil {
		log.Fatalf("restore: cannot open backup %s: %v", srcPath, err)
	}
	defer srcDB.Close()

	var quickCheck string
	if err := srcDB.QueryRow("PRAGMA quick_check").Scan(&quickCheck); err != nil || quickCheck != "ok" {
		log.Fatalf("restore: backup integrity check failed (%s): %v", quickCheck, err)
	}

	var cardCount, capCount, schemaVer int
	if err := srcDB.QueryRow("SELECT COUNT(*) FROM cards").Scan(&cardCount); err != nil {
		log.Fatalf("restore: backup is missing valid cards table: %v", err)
	}
	_ = srcDB.QueryRow("SELECT COUNT(*) FROM captures").Scan(&capCount)
	_ = srcDB.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_version").Scan(&schemaVer)

	srcDB.Close()

	targetPath := config.DBPath()

	if _, err := os.Stat(targetPath); err == nil {
		bakPath := targetPath + ".pre-restore-" + time.Now().UTC().Format("20060102-150405") + ".bak"
		if err := copyFile(targetPath, bakPath); err != nil {
			log.Fatalf("restore: failed creating safety backup %s: %v", bakPath, err)
		}
		fmt.Printf("ℹ Saved pre-restore safety snapshot to %s\n", bakPath)

		_ = os.Remove(targetPath + "-wal")
		_ = os.Remove(targetPath + "-shm")
	}

	tmpTarget := targetPath + ".restore.tmp"
	if err := copyFile(srcPath, tmpTarget); err != nil {
		log.Fatalf("restore: failed to stage restore file: %v", err)
	}
	if err := os.Rename(tmpTarget, targetPath); err != nil {
		_ = os.Remove(tmpTarget)
		log.Fatalf("restore: atomic replacement failed: %v", err)
	}

	resDB, err := sql.Open("sqlite", "file:"+targetPath+"?mode=ro")
	if err != nil {
		log.Fatalf("restore: failed opening restored database: %v", err)
	}
	defer resDB.Close()

	var postCheck string
	if err := resDB.QueryRow("PRAGMA quick_check").Scan(&postCheck); err != nil || postCheck != "ok" {
		log.Fatalf("restore: post-restore integrity check failed: %v", err)
	}

	fmt.Printf("✓ Successfully restored %s from %s\n", targetPath, srcPath)
	fmt.Printf("  • Cards restored:    %d\n", cardCount)
	fmt.Printf("  • Captures restored: %d\n", capCount)
	fmt.Printf("  • Schema version:    v%d\n", schemaVer)
	fmt.Printf("  • Database integrity: OK\n")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
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
		case "backup":
			handleBackup(os.Args[2:])
			return
		case "restore":
			handleRestore(os.Args[2:])
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
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	logger("sparkkeep: listening on %s (version %s)", cfg.HTTPAddr, version)

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
		case <-time.After(30 * time.Second):
			logger("shutdown: timed out waiting for background tasks")
		}
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}
	logger("sparkkeep: stopped")
}
