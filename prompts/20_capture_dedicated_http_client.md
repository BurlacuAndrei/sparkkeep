# Prompt 20 — Use Dedicated HTTP Client in Capture

## Goal
Replace `http.DefaultClient` usage in `capture.go` with a dedicated client that has explicit transport timeouts.

## Problem
`httpFetch()` in `capture.go` (line 278) uses `http.DefaultClient.Do(req)`. The default client has **no timeout** and no connection pool limits. While the request has a 5s context timeout, the default client's transport can hang on TLS negotiation, keep-alive, or DNS resolution outside the context's scope.

## Changes Required

1. **`internal/capture/capture.go`**:
   - Create a package-level client with explicit timeouts:
     ```go
     var httpClient = &http.Client{
         Timeout: 10 * time.Second,
         Transport: &http.Transport{
             DialContext:         (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
             TLSHandshakeTimeout: 5 * time.Second,
             MaxIdleConns:        10,
             IdleConnTimeout:     30 * time.Second,
         },
     }
     ```
   - Replace `http.DefaultClient.Do(req)` with `httpClient.Do(req)` in `httpFetch()`

2. **Tests**: Verify `capture_test.go` passes (the test server should not be affected by client timeouts)

## Acceptance Criteria
- All HTTP fetches in capture use the dedicated client
- `http.DefaultClient` is no longer referenced in the capture package
- All tests pass

## Severity: MEDIUM
