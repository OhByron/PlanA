// Package safehttp provides SSRF protection for outbound HTTP calls to
// user-supplied URLs (webhooks, custom AI endpoints, etc.). Resolves the host
// up front and rejects loopback, private, link-local, and metadata IPs.
package safehttp

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

// ErrBlockedURL is returned when a URL is rejected by CheckExternal.
var ErrBlockedURL = errors.New("URL not allowed")

// CheckExternal returns nil if rawURL is safe to call from the server:
// http(s) scheme, resolvable host, and every resolved IP is publicly routable.
// Returns a wrapped ErrBlockedURL otherwise.
//
// Note: this has an inherent TOCTOU race against DNS — the host could resolve
// differently between this check and the actual dial. For defense in depth,
// also configure the http.Client redirect policy to re-check each hop.
func CheckExternal(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("%w: invalid URL: %v", ErrBlockedURL, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("%w: scheme %q not allowed", ErrBlockedURL, u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("%w: missing host", ErrBlockedURL)
	}

	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("%w: DNS lookup failed: %v", ErrBlockedURL, err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("%w: no IPs resolved for %s", ErrBlockedURL, host)
	}
	for _, ip := range ips {
		if isBlocked(ip) {
			return fmt.Errorf("%w: destination IP %s is private/loopback/link-local", ErrBlockedURL, ip)
		}
	}
	return nil
}

func isBlocked(ip net.IP) bool {
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() ||
		ip.IsUnspecified()
}

// NewClient returns an http.Client suitable for outbound calls to user-supplied
// URLs: a fixed timeout and a redirect policy that re-validates the target of
// every redirect against CheckExternal.
func NewClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			return CheckExternal(req.URL.String())
		},
	}
}
