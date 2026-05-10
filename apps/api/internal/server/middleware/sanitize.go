package middleware

import "net/http"

// maxRequestBody is the absolute upper bound for any request body. Handlers
// that legitimately need more (file imports, JUnit XML uploads) wrap r.Body
// with their own io.LimitReader at the route-specific size; this cap is just
// defense in depth against unbounded reads.
const maxRequestBody = 64 << 20 // 64 MiB

// LimitBody wraps r.Body with http.MaxBytesReader so any handler that reads
// the body — including json.Decode — gets a bounded, error-on-overflow stream
// instead of buffering arbitrarily large input.
//
// Note: an earlier version of this file shipped a SanitizeBody middleware
// that buffered the entire body, cast it to string (corrupting non-UTF-8
// uploads), and substring-stripped tokens like "javascript:" or "<script"
// from arbitrary JSON values. That broke legitimate content (e.g. comments
// referencing the word "javascript:") and provided no real XSS protection
// since the frontend uses Tiptap which doesn't render raw HTML. Output-side
// rendering is the correct layer for that defense.
func LimitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)
		}
		next.ServeHTTP(w, r)
	})
}
