# Prompt 18 — Warn on Config Parse Errors

## Goal
Return an error (or log a warning) when `getenvBool()` encounters an unparseable value instead of silently falling back to the default.

## Problem
`getenvBool()` in `config.go` (line 83) silently ignores parse errors. If a user sets `SPARKKEEP_HEADLESS_ENABLED=yes123`, the error is swallowed and the default (`true`) is used. The user has no indication their config is being ignored.

## Changes Required

1. **`internal/config/config.go`**:
   - Change `getenvBool` to return `(bool, error)`:
     ```go
     func getenvBool(key string, def bool) (bool, error) {
         v := os.Getenv(key)
         if v == "" { return def, nil }
         b, err := strconv.ParseBool(v)
         if err != nil {
             return def, fmt.Errorf("config: %s=%q: %w", key, v, err)
         }
         return b, nil
     }
     ```
   - Update `Load()` to handle the error:
     ```go
     headless, err := getenvBool("SPARKKEEP_HEADLESS_ENABLED", true)
     if err != nil {
         return Config{}, err
     }
     cfg.HeadlessEnabled = headless
     ```

## Acceptance Criteria
- Invalid boolean env vars cause `Load()` to return an error (fail-fast)
- Valid values (`true`, `false`, `1`, `0`, `yes`, `no`) work as before
- Empty/unset values use the default
- Config tests updated for the new error behavior

## Severity: LOW
