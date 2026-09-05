package cli

import "testing"

// The owner identity is read from the environment by `galley edit` (stamping)
// and `galley channel` (attach routing). Claude Code sets
// CLAUDE_CODE_SESSION_ID; pi sets AGENT_SESSION_ID and deliberately does not
// set the Claude one. Precedence favours the Claude variable so that every
// existing Claude Code session behaves exactly as it did before.
func TestSessionID(t *testing.T) {
	for _, tc := range []struct {
		name   string
		claude string
		agent  string
		want   string
	}{
		{"neither set", "", "", ""},
		{"claude only", "claude-abc", "", "claude-abc"},
		{"agent only", "", "agent-xyz", "agent-xyz"},
		{"both set, claude wins", "claude-abc", "agent-xyz", "claude-abc"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("CLAUDE_CODE_SESSION_ID", tc.claude)
			t.Setenv("AGENT_SESSION_ID", tc.agent)
			if got := sessionID(); got != tc.want {
				t.Errorf("sessionID() = %q, want %q", got, tc.want)
			}
		})
	}
}
