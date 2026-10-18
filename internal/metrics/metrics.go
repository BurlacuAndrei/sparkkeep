package metrics

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"sparkkeep/internal/port"
)

var (
	startTime = time.Now().UTC()

	inFlightRequests atomic.Int64

	mu            sync.RWMutex
	httpRequests  = make(map[string]uint64)
	httpDurations = make(map[string]map[float64]uint64) // key -> bucket -> count
	httpSums      = make(map[string]float64)            // key -> sum seconds
	httpCounts    = make(map[string]uint64)             // key -> total count
	queueTasks    = make(map[string]uint64)

	buckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}

	idRegex = regexp.MustCompile(`/\d+(/|$)`)
)

func NormalizePath(path string) string {
	return idRegex.ReplaceAllString(path, "/:id$1")
}

func RecordHTTPRequest(method, path string, status int, duration time.Duration) {
	normPath := NormalizePath(path)
	key := fmt.Sprintf(`method="%s",path="%s",status="%d"`, method, normPath, status)
	histKey := fmt.Sprintf(`method="%s",path="%s"`, method, normPath)
	durSec := duration.Seconds()

	mu.Lock()
	defer mu.Unlock()

	httpRequests[key]++
	httpSums[histKey] += durSec
	httpCounts[histKey]++

	bMap, ok := httpDurations[histKey]
	if !ok {
		bMap = make(map[float64]uint64)
		httpDurations[histKey] = bMap
	}
	for _, b := range buckets {
		if durSec <= b {
			bMap[b]++
		}
	}
}

func RecordQueueTask(taskType string, duration time.Duration, err error) {
	status := "success"
	if err != nil {
		status = "failed"
	}
	key := fmt.Sprintf(`type="%s",status="%s"`, taskType, status)

	mu.Lock()
	defer mu.Unlock()
	queueTasks[key]++
}

type statusResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *statusResponseWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

func HTTPMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inFlightRequests.Add(1)
		defer inFlightRequests.Add(-1)

		start := time.Now()
		sw := &statusResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(sw, r)

		RecordHTTPRequest(r.Method, r.URL.Path, sw.statusCode, time.Since(start))
	})
}

func WritePrometheus(w io.Writer, store port.Store) error {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	uptime := time.Since(startTime).Seconds()

	fmt.Fprintln(w, "# HELP sparkkeep_uptime_seconds Process uptime in seconds")
	fmt.Fprintln(w, "# TYPE sparkkeep_uptime_seconds gauge")
	fmt.Fprintf(w, "sparkkeep_uptime_seconds %.2f\n\n", uptime)

	fmt.Fprintln(w, "# HELP sparkkeep_go_goroutines Number of active goroutines")
	fmt.Fprintln(w, "# TYPE sparkkeep_go_goroutines gauge")
	fmt.Fprintf(w, "sparkkeep_go_goroutines %d\n\n", runtime.NumGoroutine())

	fmt.Fprintln(w, "# HELP sparkkeep_go_mem_alloc_bytes Number of allocated heap memory bytes")
	fmt.Fprintln(w, "# TYPE sparkkeep_go_mem_alloc_bytes gauge")
	fmt.Fprintf(w, "sparkkeep_go_mem_alloc_bytes %d\n\n", m.Alloc)

	fmt.Fprintln(w, "# HELP sparkkeep_http_requests_in_flight Number of currently processing HTTP requests")
	fmt.Fprintln(w, "# TYPE sparkkeep_http_requests_in_flight gauge")
	fmt.Fprintf(w, "sparkkeep_http_requests_in_flight %d\n\n", inFlightRequests.Load())

	mu.RLock()
	defer mu.RUnlock()

	fmt.Fprintln(w, "# HELP sparkkeep_http_requests_total Total number of HTTP requests processed")
	fmt.Fprintln(w, "# TYPE sparkkeep_http_requests_total counter")
	for k, count := range httpRequests {
		fmt.Fprintf(w, "sparkkeep_http_requests_total{%s} %d\n", k, count)
	}
	fmt.Fprintln(w)

	fmt.Fprintln(w, "# HELP sparkkeep_http_request_duration_seconds HTTP request latency histogram in seconds")
	fmt.Fprintln(w, "# TYPE sparkkeep_http_request_duration_seconds histogram")
	for histKey, bMap := range httpDurations {
		for _, b := range buckets {
			fmt.Fprintf(w, "sparkkeep_http_request_duration_seconds_bucket{%s,le=\"%s\"} %d\n", histKey, strconv.FormatFloat(b, 'f', -1, 64), bMap[b])
		}
		fmt.Fprintf(w, "sparkkeep_http_request_duration_seconds_bucket{%s,le=\"+Inf\"} %d\n", histKey, httpCounts[histKey])
		fmt.Fprintf(w, "sparkkeep_http_request_duration_seconds_sum{%s} %.6f\n", histKey, httpSums[histKey])
		fmt.Fprintf(w, "sparkkeep_http_request_duration_seconds_count{%s} %d\n", histKey, httpCounts[histKey])
	}
	fmt.Fprintln(w)

	fmt.Fprintln(w, "# HELP sparkkeep_queue_tasks_total Total number of background queue tasks processed")
	fmt.Fprintln(w, "# TYPE sparkkeep_queue_tasks_total counter")
	for k, count := range queueTasks {
		fmt.Fprintf(w, "sparkkeep_queue_tasks_total{%s} %d\n", k, count)
	}
	fmt.Fprintln(w)

	if store != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if pm, err := store.GetPipelineMetrics(ctx); err == nil {
			fmt.Fprintln(w, "# HELP sparkkeep_cards_total Current count of cards in library")
			fmt.Fprintln(w, "# TYPE sparkkeep_cards_total gauge")
			fmt.Fprintf(w, "sparkkeep_cards_total %d\n\n", pm.CardsCount)

			fmt.Fprintln(w, "# HELP sparkkeep_cards_by_status Current count of cards in library by status")
			fmt.Fprintln(w, "# TYPE sparkkeep_cards_by_status gauge")
			for status, count := range pm.TriageByStatus {
				fmt.Fprintf(w, "sparkkeep_cards_by_status{status=\"%s\"} %d\n", status, count)
			}
			fmt.Fprintln(w)
		}
	}

	return nil
}
