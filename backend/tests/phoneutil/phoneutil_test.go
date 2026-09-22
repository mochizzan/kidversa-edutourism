package phoneutil_test

import (
	"testing"

	"kidversa-edutourism-backend/internal/pkg/phoneutil"
)

func TestNormalize(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{name: "local ID format", in: "08123123456", want: "+628123123456"},
		{name: "international US", in: "+1 213 373 4253", want: "+12133734253"},
		{name: "spaces and dashes", in: "  +62 812-3123-456  ", want: "+628123123456"},
		{name: "letters", in: "abc", wantErr: true},
		{name: "invalid country", in: "+999000000", wantErr: true},
		{name: "empty", in: "", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := phoneutil.Normalize(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("Normalize(%q) = %q, want error", tt.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Normalize(%q) error: %v", tt.in, err)
			}
			if got != tt.want {
				t.Fatalf("Normalize(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestWhatsAppDigits(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{name: "e164 with separators", in: "+62 812-3123-456", want: "628123123456"},
		{name: "legacy local", in: "0812", want: "0812"},
		{name: "empty", in: "", wantErr: true},
		{name: "no digits", in: "abc", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := phoneutil.WhatsAppDigits(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("WhatsAppDigits(%q) = %q, want error", tt.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("WhatsAppDigits(%q) error: %v", tt.in, err)
			}
			if got != tt.want {
				t.Fatalf("WhatsAppDigits(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
