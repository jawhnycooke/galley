package docmodel

import (
	"crypto/rand"
	"encoding/hex"
)

// NewRun mints a run token — see RunAttr for what one means.
//
// It lives here, in the package that owns the attribute, because FOUR places
// mint them and they must share one namespace: markdown's CriticMarkup parser
// (one per span in the file), suggest's transforms (one per authored edit),
// suggest.MintRuns (one per mark that reached a session without one) and the
// BROWSER (one per edit the reviewer types — web/suggestions.js's newRun).
// They sit in different packages, in two languages, and run at different
// times, so they cannot share a counter — hence random rather than
// sequential, in a namespace large enough that they will not collide.
//
// THE FOURTH ONE IS IN JAVASCRIPT AND MUST MATCH THIS SHAPE. web/suggestions.js
// mints 4 random bytes as lower-case hex because that is what this returns;
// tokens are compared as plain strings across the wire, so a client token of
// another length or alphabet would work right up until something matched or
// truncated one. Change the shape here and that function changes with it.
//
// The browser did NOT always mint. It stamped nothing, and two doc comments —
// this one and MintRuns' — claimed it did, which is what made a typed edit
// spanning formatting look like it was already handled while it split into one
// card per inline. The claim is now true; check web/suggestions.js before
// writing anything about it either way.
//
// docmodel is the leaf both markdown and suggest import, so this is the only
// place all of them can reach — markdown cannot import suggest, since suggest
// already imports markdown.
func NewRun() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand does not fail on any platform galley builds for, and one
		// unaddressable mark beats a dead editor. An empty run degrades to the
		// old behaviour for that mark — it groups with its neighbours — which
		// is the safe direction: fewer cards, never a half-applied decision.
		return ""
	}
	return hex.EncodeToString(b[:])
}
