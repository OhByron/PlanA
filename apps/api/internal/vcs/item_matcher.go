package vcs

import (
	"regexp"
	"strconv"
)

// itemNumberRe matches work-item references in branch names, PR titles, and commit messages.
// Supported formats: #42, PROJ-42, PLANA-42
var itemNumberRe = regexp.MustCompile(`(?:#(\d+)|([A-Z][A-Z0-9]+-(\d+)))`)

// ExtractItemNumber tries to find a work-item item_number from a text string.
// Returns the number and true if found.
func ExtractItemNumber(text string) (int, bool) {
	m := itemNumberRe.FindStringSubmatch(text)
	if m == nil {
		return 0, false
	}
	// Group 1: #(\d+)
	if m[1] != "" {
		n, err := strconv.Atoi(m[1])
		if err == nil {
			return n, true
		}
	}
	// Group 3: the digits after SLUG-
	if m[3] != "" {
		n, err := strconv.Atoi(m[3])
		if err == nil {
			return n, true
		}
	}
	return 0, false
}

// ExtractAllItemNumbers finds all work-item references in a text string.
// Returns deduplicated item numbers.
func ExtractAllItemNumbers(text string) []int {
	matches := itemNumberRe.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil
	}

	seen := make(map[int]struct{})
	var result []int

	for _, m := range matches {
		var n int
		var err error

		if m[1] != "" {
			n, err = strconv.Atoi(m[1])
		} else if m[3] != "" {
			n, err = strconv.Atoi(m[3])
		}

		if err == nil && n > 0 {
			if _, ok := seen[n]; !ok {
				seen[n] = struct{}{}
				result = append(result, n)
			}
		}
	}
	return result
}
