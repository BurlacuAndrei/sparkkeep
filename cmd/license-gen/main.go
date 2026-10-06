package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"sparkkeep/internal/license"
)

func main() {
	genKeys := flag.Bool("generate-keypair", false, "Generate a new Ed25519 keypair")
	privKeyB64 := flag.String("priv-key", "", "Base64-encoded Ed25519 private key (or set SPARKKEEP_LICENSE_PRIVATE_KEY)")
	email := flag.String("email", "", "Customer email address")
	tier := flag.String("tier", "pro", "License tier (e.g. pro)")
	days := flag.Int("days", 0, "License validity in days (0 = lifetime)")
	featuresStr := flag.String("features", "obsidian_sync,webhooks,deep_research_v2", "Comma-separated list of unlocked features")
	flag.Parse()

	if *genKeys {
		pub, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error generating keypair: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("=== Sparkkeep Ed25519 Keypair ===")
		fmt.Printf("Private Key (keep secret!): %s\n", base64.StdEncoding.EncodeToString(priv))
		fmt.Printf("Public Key (base64):         %s\n", base64.StdEncoding.EncodeToString(pub))
		fmt.Println("\nTo embed this public key in the binary, update internal/license/license.go:")
		fmt.Printf("var defaultPublicKey = ed25519.PublicKey([]byte(%q))\n", string(pub))
		return
	}

	if *email == "" {
		fmt.Println("Usage: license-gen -email customer@example.com [options]")
		fmt.Println("       license-gen -generate-keypair")
		flag.PrintDefaults()
		os.Exit(1)
	}

	keyStr := *privKeyB64
	if keyStr == "" {
		keyStr = os.Getenv("SPARKKEEP_LICENSE_PRIVATE_KEY")
	}

	var priv ed25519.PrivateKey
	if keyStr == "" {
		// If no private key provided, notify user or generate dev key
		fmt.Println("[Note] No private key supplied via -priv-key or SPARKKEEP_LICENSE_PRIVATE_KEY.")
		fmt.Println("Generating an ephemeral signing key for demonstration:")
		_, p, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		priv = p
	} else {
		decoded, err := base64.StdEncoding.DecodeString(keyStr)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Invalid base64 private key: %v\n", err)
			os.Exit(1)
		}
		if len(decoded) != ed25519.PrivateKeySize {
			fmt.Fprintf(os.Stderr, "Invalid private key size: got %d bytes, want %d\n", len(decoded), ed25519.PrivateKeySize)
			os.Exit(1)
		}
		priv = ed25519.PrivateKey(decoded)
	}

	var features []string
	for _, f := range strings.Split(*featuresStr, ",") {
		f = strings.TrimSpace(f)
		if f != "" {
			features = append(features, f)
		}
	}

	var expiresAt int64 = 0
	if *days > 0 {
		expiresAt = time.Now().Add(time.Duration(*days) * 24 * time.Hour).Unix()
	}

	payload := license.LicensePayload{
		Email:     *email,
		Tier:      *tier,
		Features:  features,
		IssuedAt:  time.Now().Unix(),
		ExpiresAt: expiresAt,
	}

	signedKey, err := license.SignLicense(priv, payload)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to sign license: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("=== Generated Sparkkeep License ===")
	fmt.Printf("Customer Email: %s\n", *email)
	fmt.Printf("Tier:           %s\n", *tier)
	if expiresAt == 0 {
		fmt.Println("Expires:        Lifetime")
	} else {
		fmt.Printf("Expires:        %s\n", time.Unix(expiresAt, 0).Format(time.RFC3339))
	}
	fmt.Printf("Features:       %s\n", strings.Join(features, ", "))
	fmt.Println("-----------------------------------")
	fmt.Printf("License Key:\n%s\n", signedKey)
	fmt.Println("-----------------------------------")
}
