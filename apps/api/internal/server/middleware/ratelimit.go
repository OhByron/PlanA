package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type visitor struct {
	tokens   float64
	lastSeen time.Time
}

// RateLimiter implements an in-memory token-bucket rate limiter keyed by IP.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     float64 // tokens per second
	burst    float64 // max tokens
}

// NewRateLimiter creates a rate limiter that allows requestsPerSecond sustained
// throughput with the given burst size. Stale entries are cleaned up
// automatically every minute.
func NewRateLimiter(requestsPerSecond float64, burst int) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     requestsPerSecond,
		burst:    float64(burst),
	}
	// Clean up stale entries every minute
	go func() {
		for {
			time.Sleep(time.Minute)
			rl.mu.Lock()
			for ip, v := range rl.visitors {
				if time.Since(v.lastSeen) > 3*time.Minute {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

// Allow checks whether a request from the given IP should be permitted.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	if !exists {
		rl.visitors[ip] = &visitor{tokens: rl.burst - 1, lastSeen: time.Now()}
		return true
	}

	elapsed := time.Since(v.lastSeen).Seconds()
	v.lastSeen = time.Now()
	v.tokens += elapsed * rl.rate
	if v.tokens > rl.burst {
		v.tokens = rl.burst
	}

	if v.tokens < 1 {
		return false
	}
	v.tokens--
	return true
}

// Middleware returns an HTTP middleware that rate-limits requests.
//
// The key is the client host derived from r.RemoteAddr, which the chi
// RealIP middleware populates from a trusted X-Forwarded-For chain when
// the API runs behind a proxy. Reading X-Forwarded-For directly here
// would let any client spoof the limiter key by forging the header.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if host, _, err := net.SplitHostPort(ip); err == nil {
			ip = host
		}
		if !rl.Allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"code":"rate_limited","message":"Too many requests. Please try again shortly."}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
