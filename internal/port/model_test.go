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
		{"lifetime", false},
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
		{StatusResearching, true},
		{StatusReview, true},
		{StatusToDo, true},
		{StatusInProgress, true},
		{StatusDone, true},
		{StatusShelved, true},
		{StatusDismissed, true},
		{"doing", false},
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
