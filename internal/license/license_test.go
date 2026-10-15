package license

import "testing"

func TestStatusCommunityMIT(t *testing.T) {
	status := Status()

	if status.Tier != TierCommunity {
		t.Fatalf("expected tier %s, got %s", TierCommunity, status.Tier)
	}
	if !status.IsValid || !status.IsLifetime {
		t.Fatalf("expected the community license to be valid and lifetime")
	}
	if len(status.Features) == 0 {
		t.Fatalf("expected every feature to be listed")
	}
}
