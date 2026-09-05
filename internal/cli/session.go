package cli

import "os"

// sessionID is the owner identity for this process, and it is harness-neutral.
//
// `galley edit` stamps it on a registry entry and `galley channel` reads it at
// startup to decide which editors it attaches to, so an empty answer means
// UNOWNED — the channel attaches to unowned documents only and a Revise press
// reaches nobody.
//
// CLAUDE_CODE_SESSION_ID is checked first so that every existing Claude Code
// session behaves exactly as it did before this helper existed.
// AGENT_SESSION_ID is the neutral name a non-Claude harness sets: pi sets it
// and deliberately does NOT set the Claude variable, because muster's
// paneless-identity fallback reads that one to decide whether a session is
// Claude Code, and a pi session must never claim to be one.
func sessionID() string {
	if id := os.Getenv("CLAUDE_CODE_SESSION_ID"); id != "" {
		return id
	}
	return os.Getenv("AGENT_SESSION_ID")
}
