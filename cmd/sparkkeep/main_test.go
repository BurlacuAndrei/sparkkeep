package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
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
