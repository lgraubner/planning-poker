package room

import (
	"encoding/hex"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxTitleLength = 100
	maxNameLength  = 40
)

var Decks = map[string][]string{
	"fibonacci": {"0", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"},
	"tshirt":    {"XS", "S", "M", "L", "XL", "XXL", "?", "☕"},
}

func ValidateLabel(value string, max int) (string, error) {
	if !utf8.ValidString(value) || strings.ContainsFunc(value, unicode.IsControl) {
		return "", errors.New("Use text without control characters")
	}

	value = strings.TrimSpace(value)
	if n := utf8.RuneCountInString(value); n == 0 || n > max {
		return "", errors.New("Text is empty or too long")
	}

	return value, nil
}

func validSecret(secret string) bool {
	if len(secret) != 36 || secret[8] != '-' || secret[13] != '-' || secret[18] != '-' || secret[23] != '-' {
		return false
	}

	_, err := hex.DecodeString(strings.ReplaceAll(secret, "-", ""))
	return err == nil
}
