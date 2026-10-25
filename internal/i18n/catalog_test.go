package i18n

import (
	"reflect"
	"testing"
)

func TestCatalogCompletenessAllLocales(t *testing.T) {
	for _, loc := range SupportedLocales {
		t.Run("headings_"+loc, func(t *testing.T) {
			h := GetHeadings(loc)
			v := reflect.ValueOf(h)
			for i := 0; i < v.NumField(); i++ {
				field := v.Type().Field(i).Name
				val := v.Field(i).String()
				if val == "" {
					t.Errorf("locale %q missing heading for field %s", loc, field)
				}
			}
		})

		t.Run("buttons_"+loc, func(t *testing.T) {
			b := GetButtons(loc)
			v := reflect.ValueOf(b)
			for i := 0; i < v.NumField(); i++ {
				field := v.Type().Field(i).Name
				val := v.Field(i).String()
				if val == "" {
					t.Errorf("locale %q missing button for field %s", loc, field)
				}
			}
		})

		t.Run("messages_"+loc, func(t *testing.T) {
			m := GetMessages(loc)
			v := reflect.ValueOf(m)
			for i := 0; i < v.NumField(); i++ {
				field := v.Type().Field(i).Name
				val := v.Field(i).String()
				if val == "" {
					t.Errorf("locale %q missing message for field %s", loc, field)
				}
			}
		})
	}
}

func TestNormalizeFallback(t *testing.T) {
	if got := Normalize(""); got != "en" {
		t.Errorf("expected en for empty, got %q", got)
	}
	if got := Normalize("unknown"); got != "en" {
		t.Errorf("expected en for unknown, got %q", got)
	}
	if got := Normalize("RO-MD"); got != "ro" {
		t.Errorf("expected ro for RO-MD, got %q", got)
	}
	if got := Normalize("pt_BR"); got != "pt-BR" {
		t.Errorf("expected pt-BR for pt_BR, got %q", got)
	}
}
