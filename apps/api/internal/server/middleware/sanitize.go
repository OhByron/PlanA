package middleware

import (
	"bytes"
	"io"
	"net/http"
	"strings"
)

// SanitizeBody is a middleware that strips potentially dangerous HTML tags
// from request bodies. This is a defense-in-depth measure — the frontend
// uses Tiptap which doesn't render raw HTML, but this protects against
// any future raw HTML rendering.
func SanitizeBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil && (r.Method == "POST" || r.Method == "PATCH" || r.Method == "PUT") {
			body, err := io.ReadAll(r.Body)
			r.Body.Close()
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			// Strip script tags and event handlers from the body
			cleaned := stripDangerousHTML(string(body))
			r.Body = io.NopCloser(bytes.NewBufferString(cleaned))
			r.ContentLength = int64(len(cleaned))
		}
		next.ServeHTTP(w, r)
	})
}

func stripDangerousHTML(s string) string {
	// Remove <script> tags and their content
	for {
		lower := strings.ToLower(s)
		start := strings.Index(lower, "<script")
		if start == -1 {
			break
		}
		end := strings.Index(lower[start:], "</script>")
		if end == -1 {
			s = s[:start]
			break
		}
		s = s[:start] + s[start+end+9:]
	}
	// Remove event handler attributes (onclick, onerror, etc.)
	for _, attr := range []string{"onclick", "onerror", "onload", "onmouseover", "onfocus", "onblur"} {
		for {
			lower := strings.ToLower(s)
			idx := strings.Index(lower, attr+"=")
			if idx == -1 {
				break
			}
			// Find the end of the attribute value
			end := idx + len(attr) + 1
			if end < len(s) && (s[end] == '"' || s[end] == '\'') {
				quote := s[end]
				closeIdx := strings.IndexByte(s[end+1:], quote)
				if closeIdx != -1 {
					s = s[:idx] + s[end+1+closeIdx+1:]
				} else {
					s = s[:idx]
				}
			}
		}
	}
	// Remove javascript: URLs
	s = strings.ReplaceAll(s, "javascript:", "")
	s = strings.ReplaceAll(s, "JAVASCRIPT:", "")
	return s
}
