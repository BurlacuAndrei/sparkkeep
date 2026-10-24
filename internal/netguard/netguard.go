// Package netguard guards outbound dials against SSRF to cloud metadata.
// It blocks the link-local / cloud-metadata class (IPv4 169.254.0.0/16 and
// IPv6 fe80::/10) while allowing loopback and RFC1918 addresses, which are
// legitimate targets for a self-hosted homelab deployment.
package netguard

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strings"
	"syscall"
)

// DialContext configures dialer's Control callback to refuse link-local /
// cloud-metadata addresses, then returns its DialContext for use as an
// http.Transport dial function. Control sees the post-DNS resolved address,
// so a hostname that resolves to 169.254.169.254 is rejected too.
func DialContext(dialer *net.Dialer) func(ctx context.Context, network, addr string) (net.Conn, error) {
	next := dialer.Control
	dialer.Control = func(network, address string, c syscall.RawConn) error {
		if blocked, ip := blockedAddr(address); blocked {
			return fmt.Errorf("netguard: refusing connection to link-local/metadata address %s", ip)
		}
		if next != nil {
			return next(network, address, c)
		}
		return nil
	}
	return dialer.DialContext
}

// blockedAddr reports whether address (a resolved host:port) is link-local,
// i.e. IPv4 169.254.0.0/16 or IPv6 fe80::/10, including ::ffff: mapped forms.
func blockedAddr(address string) (bool, netip.Addr) {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		host = address
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return false, netip.Addr{}
	}
	addr = addr.Unmap() // ::ffff:a.b.c.d -> a.b.c.d
	// IsLinkLocalUnicast covers both 169.254.0.0/16 and fe80::/10.
	if addr.IsLinkLocalUnicast() {
		return true, addr
	}
	return false, netip.Addr{}
}

// ValidateURL checks that rawURL does not point or resolve to a link-local or cloud metadata address.
// It parses rawURL, extracts the host, checks IP literals, and resolves domain names.
func ValidateURL(ctx context.Context, rawURL string) error {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return fmt.Errorf("netguard: empty URL")
	}
	if !strings.Contains(trimmed, "://") {
		trimmed = "http://" + trimmed
	}
	u, err := url.Parse(trimmed)
	if err != nil {
		return fmt.Errorf("netguard: invalid URL: %w", err)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("netguard: empty host in URL")
	}

	// First check if host is an IP literal
	if blocked, ip := blockedAddr(host); blocked {
		return fmt.Errorf("netguard: refusing connection to link-local/metadata address %s", ip)
	}

	// Resolve host IPs
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil
	}
	for _, ip := range ips {
		unmapped := ip.Unmap()
		if unmapped.IsLinkLocalUnicast() {
			return fmt.Errorf("netguard: refusing connection to link-local/metadata address %s", unmapped)
		}
	}
	return nil
}
