package metrics

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetricsRegistryAndHTTPMiddleware(t *testing.T) {
	handler := HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/error" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/cards/42", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	recErr := httptest.NewRecorder()
	reqErr := httptest.NewRequest(http.MethodGet, "/error", nil)
	handler.ServeHTTP(recErr, reqErr)

	RecordQueueTask("research", 50*time.Millisecond, nil)
	RecordQueueTask("research", 10*time.Millisecond, errors.New("llm timeout"))

	var buf bytes.Buffer
	if err := WritePrometheus(&buf, nil); err != nil {
		t.Fatalf("WritePrometheus: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "sparkkeep_uptime_seconds") {
		t.Errorf("missing uptime metric in output:\n%s", out)
	}
	if !strings.Contains(out, `sparkkeep_http_requests_total{method="GET",path="/api/v1/cards/:id",status="200"}`) {
		t.Errorf("missing normalized cards path metric in output:\n%s", out)
	}
	if !strings.Contains(out, `sparkkeep_queue_tasks_total{type="research",status="success"}`) {
		t.Errorf("missing queue success metric in output:\n%s", out)
	}
	if !strings.Contains(out, `sparkkeep_queue_tasks_total{type="research",status="failed"}`) {
		t.Errorf("missing queue failed metric in output:\n%s", out)
	}
}
