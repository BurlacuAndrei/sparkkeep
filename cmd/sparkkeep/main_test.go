package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// binPath is the sparkkeep binary built once for every test in this package.
var binPath string

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "sparkkeep-cli-test")
	if err != nil {
		fmt.Fprintln(os.Stderr, "temp dir:", err)
		os.Exit(1)
	}

	binPath = filepath.Join(dir, "sparkkeep")
	if out, err := exec.Command("go", "build", "-o", binPath, ".").CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "build sparkkeep: %v\n%s", err, out)
		os.RemoveAll(dir)
		os.Exit(1)
	}

	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

// cliEnv returns the environment for the spawned binary with every SPARKKEEP_*
// variable stripped except SPARKKEEP_DB, proving the auth CLI needs no daemon
// configuration.
func cliEnv(dbPath string) []string {
	env := make([]string, 0, len(os.Environ())+1)
	for _, kv := range os.Environ() {
		if strings.HasPrefix(kv, "SPARKKEEP_") {
			continue
		}
		env = append(env, kv)
	}
	return append(env, "SPARKKEEP_DB="+dbPath)
}

func TestAuthCLI(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "sparkkeep.db")

	run := func(args ...string) (string, int) {
		t.Helper()
		cmd := exec.Command(binPath, append([]string{"auth"}, args...)...)
		cmd.Env = cliEnv(dbPath)
		out, err := cmd.CombinedOutput()
		if err == nil {
			return string(out), 0
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return string(out), exitErr.ExitCode()
		}
		t.Fatalf("run auth %v: %v", args, err)
		return "", -1
	}

	// A fresh DB resolves without any other configuration.
	if out, code := run("status"); code != 0 || !strings.Contains(out, "Open Access") {
		t.Fatalf("status on fresh DB: code=%d out=%q, want exit 0 and Open Access", code, out)
	}

	if out, code := run("set-passphrase", "hunter2"); code != 0 {
		t.Fatalf("set-passphrase: code=%d out=%q, want exit 0", code, out)
	}

	if out, code := run("status"); code != 0 || !strings.Contains(out, "bcrypt") {
		t.Fatalf("status after set-passphrase: code=%d out=%q, want exit 0 and bcrypt", code, out)
	}

	out, code := run("generate-token")
	if code != 0 || !strings.Contains(out, "sk_live_") {
		t.Fatalf("generate-token: code=%d out=%q, want exit 0 and an sk_live_ token", code, out)
	}
}

func TestBackupCLI(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "sparkkeep.db")
	run := func(args ...string) (string, int) {
		t.Helper()
		cmd := exec.Command(binPath, args...)
		cmd.Env = cliEnv(dbPath)
		out, err := cmd.CombinedOutput()
		if err == nil {
			return string(out), 0
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return string(out), exitErr.ExitCode()
		}
		t.Fatalf("run %v: %v", args, err)
		return "", -1
	}

	// Create and migrate the DB (auth status opens the store).
	if out, code := run("auth", "status"); code != 0 {
		t.Fatalf("auth status: code=%d out=%q", code, out)
	}

	outFile := filepath.Join(t.TempDir(), "snapshot.db")
	out, code := run("backup", outFile)
	if code != 0 || !strings.Contains(out, outFile) {
		t.Fatalf("backup: code=%d out=%q, want exit 0 and the written path", code, out)
	}

	db, err := sql.Open("sqlite", "file:"+outFile)
	if err != nil {
		t.Fatalf("open backup: %v", err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM cards`).Scan(&n); err != nil {
		t.Fatalf("backup missing cards table: %v", err)
	}

	// Refuse to overwrite an existing file.
	if out, code := run("backup", outFile); code == 0 {
		t.Fatalf("backup over existing file: code=0 out=%q, want non-zero", out)
	}
}

func TestRestoreCLI(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "sparkkeep.db")
	backupFile := filepath.Join(tempDir, "valid_backup.db")

	run := func(args ...string) (string, int) {
		t.Helper()
		cmd := exec.Command(binPath, args...)
		cmd.Env = cliEnv(dbPath)
		out, err := cmd.CombinedOutput()
		if err == nil {
			return string(out), 0
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return string(out), exitErr.ExitCode()
		}
		t.Fatalf("run %v: %v", args, err)
		return "", -1
	}

	// 1. Missing backup file arg
	if _, code := run("restore"); code == 0 {
		t.Fatal("restore with missing arg: want non-zero exit code")
	}

	// 2. Nonexistent backup file
	if _, code := run("restore", filepath.Join(tempDir, "missing.db")); code == 0 {
		t.Fatal("restore nonexistent file: want non-zero exit code")
	}

	// 3. Corrupt backup file (fails pre-flight check)
	corruptFile := filepath.Join(tempDir, "corrupt.db")
	if err := os.WriteFile(corruptFile, []byte("this is not a valid sqlite database"), 0644); err != nil {
		t.Fatalf("write corrupt file: %v", err)
	}
	if out, code := run("restore", corruptFile); code == 0 || !strings.Contains(out, "integrity check failed") {
		t.Fatalf("restore corrupt file: code=%d out=%q, want non-zero and integrity failure", code, out)
	}

	// 4. Create and populate valid database
	if _, code := run("auth", "set-passphrase", "initial_secret"); code != 0 {
		t.Fatal("set-passphrase failed")
	}

	// Insert test card directly
	db, err := sql.Open("sqlite", "file:"+dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	_, err = db.Exec(`INSERT INTO cards (title, summary, status, horizon, created_at, updated_at) VALUES ('Restore Test Card', 'Restore test summary', 'inbox', 'short-term', datetime('now'), datetime('now'))`)
	if err != nil {
		t.Fatalf("insert card: %v", err)
	}
	db.Close()

	// Backup database
	if out, code := run("backup", backupFile); code != 0 {
		t.Fatalf("backup failed: %s", out)
	}

	// Mutate live database
	db, err = sql.Open("sqlite", "file:"+dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	_, _ = db.Exec(`DELETE FROM cards`)
	db.Close()

	// Restore from backup
	out, code := run("restore", backupFile)
	if code != 0 || !strings.Contains(out, "Successfully restored") {
		t.Fatalf("restore: code=%d out=%q, want exit 0 and success message", code, out)
	}

	// Verify restored card data
	db, err = sql.Open("sqlite", "file:"+dbPath)
	if err != nil {
		t.Fatalf("open restored db: %v", err)
	}
	defer db.Close()

	var cardCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM cards WHERE title = 'Restore Test Card'`).Scan(&cardCount); err != nil {
		t.Fatalf("query restored cards: %v", err)
	}
	if cardCount != 1 {
		t.Fatalf("expected 1 restored card, got %d", cardCount)
	}
}
