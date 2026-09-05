package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRemovedWorkflowCommandsAreGone(t *testing.T) {
	for _, command := range []string{
		"approve", "decline", "reply", "resolve", "delete", "blocks",
		"suggest", "accept", "reject", "reopen", "discard",
	} {
		err := run([]string{command})
		if err == nil || !strings.Contains(err.Error(), "unknown command") {
			t.Errorf("galley %s returned %v, want unknown command", command, err)
		}
		if strings.Contains(usage, "galley "+command+" ") {
			t.Errorf("usage still advertises removed command %q", command)
		}
	}
}

func TestOfflinePendingUsesAnEmptyInstructionArray(t *testing.T) {
	doc := writeDoc(t, t.TempDir(), "clean.md", "# Clean\n\nNothing pending.\n")
	view, err := offlinePending(doc)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(raw); got != `{"instructions":[]}` {
		t.Fatalf("offline pending = %s, want an empty instruction array", got)
	}
}
