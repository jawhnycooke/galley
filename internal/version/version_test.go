package version

import "testing"

func TestStringIncludesDateOnlyWhenStamped(t *testing.T) {
	// A raw `go build` has no release date; the stamp must not render an
	// empty slot in that case.
	defer func(v, c, d string) { version, commit, date = v, c, d }(version, commit, date)

	version, commit, date = "1.2.3", "abc1234", ""
	if got := String(); got != "1.2.3 (abc1234)" {
		t.Errorf("unstamped: %q", got)
	}
	date = "2026-08-09"
	if got := String(); got != "1.2.3 (abc1234, 2026-08-09)" {
		t.Errorf("stamped: %q", got)
	}
	if Date() != "2026-08-09" {
		t.Errorf("Date() = %q", Date())
	}
}
