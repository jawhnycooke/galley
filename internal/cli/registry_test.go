package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/schuettc/galley/internal/version"
)

// `galley help` is the second spelling of the bare-invocation route dispatch_test.go
// already pins for no args — both print galley's hand-maintained usage const to
// stdout and exit 0, never tools.App's own grouped usage.
func TestHelpPrintsUsage(t *testing.T) {
	var err error
	stdout, _ := captureOutput(t, func() { err = run([]string{"help"}) })
	if err != nil {
		t.Fatalf("run(help) = %v, want nil", err)
	}
	if !strings.Contains(stdout, "galley — review before the one-way door.") {
		t.Fatalf("galley help did not print the usage const:\n%s", stdout)
	}
}

// `galley -v` and `galley --version` are the two short spellings dispatch_test.go's
// TestVersionPrintsTheStamp does not cover — all three must agree.
func TestVersionShortFlagsPrintTheStamp(t *testing.T) {
	for _, flagName := range []string{"-v", "--version"} {
		t.Run(flagName, func(t *testing.T) {
			var err error
			stdout, _ := captureOutput(t, func() { err = run([]string{flagName}) })
			if err != nil {
				t.Fatalf("run(%s) = %v, want nil", flagName, err)
			}
			if got := strings.TrimSpace(stdout); got != version.String() {
				t.Fatalf("run(%s) printed %q, want %q", flagName, got, version.String())
			}
		})
	}
}

// Task 5's coverage check: `galley commands --json` must parse and list every
// command this binary actually dispatches — the mutating verbs, the reading
// verbs, and the four built-ins tools.App registers itself (help, man,
// commands, version — "update" is deliberately excluded below, since galley
// does not ship a self-update path worth asserting on here). A command
// missing from this list is a command `commands --json` silently dropped,
// which is exactly the drift `galley agent-prompt` and any external tooling
// built on the machine-readable index would inherit without warning.
func TestCommandsJSONListsEveryCommand(t *testing.T) {
	app := newApp()
	var out, errw strings.Builder
	code := app.Dispatch([]string{"commands", "--json"}, &out, &errw)
	if code != 0 {
		t.Fatalf("commands --json exited %d, stderr: %s", code, errw.String())
	}

	var cmds []struct {
		Name     string `json:"name"`
		Synopsis string `json:"synopsis"`
		Summary  string `json:"summary"`
	}
	if err := json.Unmarshal([]byte(out.String()), &cmds); err != nil {
		t.Fatalf("commands --json did not parse as JSON: %v\noutput:\n%s", err, out.String())
	}

	got := map[string]bool{}
	for _, c := range cmds {
		if c.Name == "" {
			t.Errorf("a command entry has no name: %+v", c)
		}
		got[c.Name] = true
	}

	want := []string{
		// galley's own mutating and reading verbs.
		"serve", "comments", "edit", "pending", "cannot", "revise", "ack",
		"round", "wait", "agent-prompt", "channel", "ledger",
		// built-ins tools.App registers on every app.
		"help", "man", "commands", "version",
	}
	for _, name := range want {
		if !got[name] {
			t.Errorf("commands --json is missing %q\noutput:\n%s", name, out.String())
		}
	}
	if len(cmds) < len(want) {
		t.Errorf("commands --json listed %d commands, want at least %d", len(cmds), len(want))
	}
}

// `galley man` must render a real roff man page — the one thing every galley
// invocation of `man galley` (were it installed) would show.
func TestManRendersARoffPage(t *testing.T) {
	app := newApp()
	var out, errw strings.Builder
	code := app.Dispatch([]string{"man"}, &out, &errw)
	if code != 0 {
		t.Fatalf("man exited %d, stderr: %s", code, errw.String())
	}
	if !strings.Contains(out.String(), ".TH GALLEY 1") {
		t.Fatalf("man output does not contain the roff title header:\n%s", out.String())
	}
	// Spot-check that a real command's synopsis made it into the page, so this
	// isn't just asserting on the fixed header/footer boilerplate.
	if !strings.Contains(out.String(), "channel") {
		t.Errorf("man output does not mention the channel command:\n%s", out.String())
	}
}
