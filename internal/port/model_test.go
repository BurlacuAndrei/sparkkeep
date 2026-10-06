package port

import "testing"

func TestValidHorizon(t *testing.T) {
	tests := []struct {
		horizon string
		want    bool
	}{
		{HorizonShortTerm, true},
		{HorizonMediumTerm, true},
		{HorizonLongTerm, true},
		{HorizonLifetime, true},
		{"invalid", false},
		{"", false},
	}

	for _, tt := range tests {
		if got := ValidHorizon(tt.horizon); got != tt.want {
			t.Errorf("ValidHorizon(%q) = %v, want %v", tt.horizon, got, tt.want)
		}
	}
}

func TestValidStatus(t *testing.T) {
	tests := []struct {
		status string
		want   bool
	}{
		{StatusInbox, true},
		{StatusDoing, true},
		{StatusDone, true},
		{StatusShelved, true},
		{StatusDismissed, true},
		{"pending", false},
		{"", false},
		{"archived", false},
	}

	for _, tt := range tests {
		if got := ValidStatus(tt.status); got != tt.want {
			t.Errorf("ValidStatus(%q) = %v, want %v", tt.status, got, tt.want)
		}
	}
}
