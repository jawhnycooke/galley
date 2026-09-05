package cli

import (
	"errors"
	"strings"
	"testing"

	"github.com/schuettc/galley/internal/version"
	tools "github.com/schuettc/tools-common"
)

// Task 2 stood main() up on tools.App while keeping run() as the tested
// single-command entry. These pin the special routes main() still handles
// itself (bare galley, version) and the sentinel→exit mapping wait feeds into
// Dispatch, so the migration stays behaviour-for-behaviour.

// Bare `galley` prints the usage const to stdout and is not an error.
func TestBareGalleyPrintsUsage(t *testing.T) {
	var err error
	stdout, _ := captureOutput(t, func() { err = run(nil) })
	if err != nil {
		t.Fatalf("run(nil) = %v, want nil", err)
	}
	if !strings.Contains(stdout, "galley — review before the one-way door.") {
		t.Fatalf("bare galley did not print the usage const:\n%s", stdout)
	}
}

// `galley version` prints the build stamp verbatim — version.String(), not the
// family default "galley <stamp>".
func TestVersionPrintsTheStamp(t *testing.T) {
	var err error
	stdout, _ := captureOutput(t, func() { err = run([]string{"version"}) })
	if err != nil {
		t.Fatalf("run(version) = %v, want nil", err)
	}
	if got := strings.TrimSpace(stdout); got != version.String() {
		t.Fatalf("version printed %q, want %q", got, version.String())
	}
}

// An unknown command is an error that names the command and reprints usage.
func TestUnknownCommandIsAnError(t *testing.T) {
	var err error
	_, _ = captureOutput(t, func() { err = run([]string{"bogus"}) })
	if err == nil {
		t.Fatal("run(bogus) = nil, want an unknown-command error")
	}
	if !strings.Contains(err.Error(), "unknown command") {
		t.Fatalf("error %q should say the command is unknown", err.Error())
	}
}

// The wait sentinels map to the exit codes a `while galley wait …; do` loop
// branches on, carried as *tools.ExitError so Dispatch renders the code. Driven
// directly with the sentinels — no live server needed.
func TestWaitExitMapsSentinelsToExitCodes(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   error
		code int
	}{
		{"timeout", errWaitTimeout, 3},
		{"stopped", errWaitStopped, 4},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := waitExit(tc.in)
			var ee *tools.ExitError
			if !errors.As(got, &ee) {
				t.Fatalf("waitExit(%v) = %T, want *tools.ExitError", tc.in, got)
			}
			if ee.Code != tc.code {
				t.Fatalf("waitExit(%v).Code = %d, want %d", tc.in, ee.Code, tc.code)
			}
		})
	}
}

// A non-sentinel error passes through waitExit untouched — errNoServer and an
// unknown wake reason are plain exit-1 errors, not *ExitError.
func TestWaitExitPassesOtherErrorsThrough(t *testing.T) {
	plain := errors.New("no server running")
	got := waitExit(plain)
	if !errors.Is(got, plain) {
		t.Fatalf("waitExit(plain) = %v, want the error unchanged", got)
	}
	var ee *tools.ExitError
	if errors.As(got, &ee) {
		t.Fatalf("a plain error should not become an *ExitError")
	}
}

// newApp registers every galley command plus the overridden version, and
// Dispatch routes an unknown command to a usage error (exit 2).
func TestNewAppRegistersCommands(t *testing.T) {
	app := newApp()
	var out, errw strings.Builder
	if code := app.Dispatch([]string{"nope"}, &out, &errw); code != 2 {
		t.Fatalf("Dispatch(nope) = %d, want 2 (usage error)", code)
	}
	if !strings.Contains(errw.String(), "unknown command") {
		t.Fatalf("Dispatch(nope) stderr = %q, want an unknown-command line", errw.String())
	}
}
