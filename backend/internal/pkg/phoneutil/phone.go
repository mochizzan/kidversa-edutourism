// Package phoneutil is the single source of truth for phone handling.
package phoneutil

import (
	"errors"
	"strings"

	"github.com/nyaruka/phonenumbers/v2"
)

// Normalize parses raw and returns it in E.164 form (e.g. "+628123456789").
// Input starting with '+' is parsed as international; anything else uses
// default region "ID" so legacy local-format numbers keep working.
// Errors on empty input, parse failure, or metadata-invalid numbers.
func Normalize(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", errors.New("empty phone number")
	}
	region := ""
	if !strings.HasPrefix(s, "+") {
		region = "ID"
	}
	num, err := phonenumbers.Parse(s, region)
	if err != nil {
		return "", err
	}
	if !phonenumbers.IsValidNumber(num) {
		return "", errors.New("invalid phone number")
	}
	return phonenumbers.Format(num, phonenumbers.E164), nil
}

// WhatsAppDigits returns the digit-only form used to build WhatsApp chat IDs
// ("<digits>@c.us"). Lenient by design: legacy rows written before
// normalization must stay processable. Errors only when input has no digits.
func WhatsAppDigits(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", errors.New("empty phone number")
	}
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "", errors.New("no digits in phone number")
	}
	return b.String(), nil
}
