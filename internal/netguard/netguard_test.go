package netguard

import (
	"net"
	"strings"
	"syscall"
	"testing"
)

func TestBlockedAddr(t *testing.T) {
	tests := []struct {
		addr    string
		blocked bool
	}{
		{"169.254.169.254:80", true},          // cloud metadata service
		{"169.254.1.1:80", true},              // IPv4 link-local range
		{"[fe80::1]:80", true},                // IPv6 link-local
		{"[fe80::1%eth0]:80", true},           // scoped IPv6 link-local
		{"[::ffff:169.254.169.254]:80", true}, // IPv4-mapped metadata
		{"127.0.0.1:1", false},                // loopback allowed
		{"10.0.0.1:80", false},                // RFC1918 allowed
		{"192.168.1.10:443", false},           // RFC1918 allowed
		{"[::1]:80", false},                   // IPv6 loopback allowed
		{"[::ffff:127.0.0.1]:80", false},      // mapped loopback allowed
		{"example.com:443", false},            // hostname (not resolved here) allowed
	}
	for _, tt := range tests {
		blocked, ip := blockedAddr(tt.addr)
		if blocked != tt.blocked {
			t.Errorf("blockedAddr(%q) blocked = %v (ip %v), want %v", tt.addr, blocked, ip, tt.blocked)
		}
	}
}

// TestDialContextRefusesMetadata exercises the Control wiring without a real
// socket: a blocked address returns an error naming the address.
func TestDialContextRefusesMetadata(t *testing.T) {
	d := &net.Dialer{}
	DialContext(d)
	err := d.Control("tcp", "169.254.169.254:80", nil)
	if err == nil {
		t.Fatal("Control allowed 169.254.169.254, want refusal")
	}
	if !strings.Contains(err.Error(), "169.254.169.254") {
		t.Fatalf("Control error %q does not name the blocked address", err)
	}
}

func TestDialContextChainsNextControl(t *testing.T) {
	called := false
	d := &net.Dialer{
		Control: func(network, address string, c syscall.RawConn) error {
			called = true
			return nil
		},
	}
	DialContext(d)

	// Blocked address should not call next Control
	if err := d.Control("tcp", "169.254.169.254:80", nil); err == nil {
		t.Fatal("expected blocked metadata error")
	}
	if called {
		t.Fatal("expected next Control NOT to be called on blocked address")
	}

	// Allowed address should call next Control
	if err := d.Control("tcp", "127.0.0.1:8080", nil); err != nil {
		t.Fatalf("unexpected error on allowed address: %v", err)
	}
	if !called {
		t.Fatal("expected next Control to be called for allowed address")
	}
}
