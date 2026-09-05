package serve

import (
	"fmt"
	"os"
	"sync"
	"testing"
)

// THE LEASE IS SHARED STATE AND reviseMu ONLY EVER GUARDED THE POINTER TO IT.
//
// importDraft took reviseMu, copied `s.handoffLease` — a *handoffLease — and
// let the lock go, then read Baseline and LastImported off the pointee and, at
// the end, handed the same pointer to writeLease, which json.Marshals it. Every
// one of those reads ran with no lock held, while any other caller was writing
// LastImported through the same pointer under the lock. A mutex that guards the
// handle and not the thing it points at guards nothing.
//
// The window's own watcher ticks importDraft every 300ms, so a second caller is
// not hypothetical: it is the product. CI caught it as a race inside
// TestSeveralSavesThroughTheExchangeAreOneRound, whose four saves simply gave a
// tick somewhere to land — which is why this test drives the collision directly
// rather than waiting for the scheduler to be unlucky in front of a reviewer.
func TestTheLeaseIsReadUnderMu(t *testing.T) {
	dir := t.TempDir()
	s := newEditServer(t, dir, "doc.md", "# Title\n\nAlpha beta gamma delta.\n")
	defer func() { _ = s.Close() }()
	s.OnRevise = "true"
	press(t, s, "{}")

	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := range 20 {
				_ = os.WriteFile(s.MdPath, fmt.Appendf(nil, "# Title\n\nBody %d-%d.\n", n, j), 0o644)
				_, _ = s.importDraft()
			}
		}(i)
	}
	wg.Wait()
}
