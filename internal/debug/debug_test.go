package debug

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// countingWriter is the only way to prove "nothing was written" as a fact about
// the WRITER rather than about a directory listing: a sink that never opened a
// file and a sink that opened one and wrote nothing are indistinguishable from
// the filesystem, and only one of them is off.
type countingWriter struct {
	mu    sync.Mutex
	n     int
	lines []string
	err   error
}

func (c *countingWriter) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.err != nil {
		return 0, c.err
	}
	c.n++
	c.lines = append(c.lines, string(p))
	return len(p), nil
}

func (c *countingWriter) all() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.lines...)
}

// TestOffByDefaultOpensNothingAndWritesNothing is the "prove it is off" check,
// and it is stated over the RESOLVER rather than over a comment.
//
// It asks two separate things, because a debug mode that leaks has two ways to
// do it and only one of them is visible in a directory listing: the resolver
// must answer nil for every spelling of off (so no file is created, no goroutine
// starts, and nothing reaches stderr), AND a nil sink must swallow every call
// without panicking, since the call sites invoke it unconditionally.
func TestOffByDefaultOpensNothingAndWritesNothing(t *testing.T) {
	dir := t.TempDir()
	stray := filepath.Join(dir, "should-never-exist.jsonl")

	for _, v := range []string{"", "0", "off", "OFF", "false", "no", "   "} {
		env := func(k string) string {
			if k == "GALLEY_DEBUG" {
				return v
			}
			// A test that let the resolver read the REAL environment would pass
			// or fail depending on the machine it ran on.
			return ""
		}
		if s := FromEnv(env); s != nil {
			t.Fatalf("GALLEY_DEBUG=%q resolved to a live sink; debug must be off unless it is asked for", v)
		}
	}

	// The nil sink is what every call site holds when debug is off, so it has to
	// survive the whole surface.
	var off *Sink
	off.Log(Event{Kind: KindRoundSent, Rendered: "this must go nowhere"})
	if !off.Flush(time.Second) {
		t.Fatal("Flush on an off sink must report drained")
	}
	if err := off.Close(); err != nil {
		t.Fatalf("Close on an off sink: %v", err)
	}
	written, dropped, failed := off.Counts()
	if written != 0 || dropped != 0 || failed != 0 {
		t.Fatalf("an off sink counted %d/%d/%d; want 0/0/0", written, dropped, failed)
	}
	if _, err := os.Stat(stray); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("something created %s with debug off", stray)
	}
}

// TestOnResolvesStderrAndAPath pins the two live spellings. It is the other
// half of the check above: a resolver that answered nil for EVERYTHING would
// pass that test and ship a debug mode that never records.
func TestOnResolvesStderrAndAPath(t *testing.T) {
	env := func(v string) func(string) string {
		return func(k string) string {
			if k == "GALLEY_DEBUG" {
				return v
			}
			return ""
		}
	}
	for _, v := range []string{"1", "on", "true", "YES", "stderr"} {
		s := FromEnv(env(v))
		if s == nil {
			t.Fatalf("GALLEY_DEBUG=%q resolved to off; it asks for stderr", v)
		}
		_ = s.Close()
	}

	path := filepath.Join(t.TempDir(), "sub-not-created", "..", "debug.jsonl")
	s := FromEnv(env(path))
	if s == nil {
		t.Fatalf("GALLEY_DEBUG=%q resolved to off; a path asks for a file", path)
	}
	s.Log(Event{Kind: KindRoundSent, Doc: "d.md", Rendered: "hello"})
	if !s.Flush(2 * time.Second) {
		t.Fatal("the queue did not drain")
	}
	_ = s.Close()
	b, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		t.Fatalf("the sink did not write to the path it was given: %v", err)
	}
	if !strings.Contains(string(b), `"rendered":"hello"`) {
		t.Fatalf("the file does not carry the event: %s", b)
	}
}

// TestADebugFailureCannotFailACaller is internal/ledger's own property, stated
// for this sink: a writer that fails every time must cost the caller nothing —
// no error, no panic, no block — and the failure must still be COUNTED, because
// a property test over a wiring that does nothing passes for the wrong reason.
func TestADebugFailureCannotFailACaller(t *testing.T) {
	w := &countingWriter{err: errors.New("the disk is full")}
	s := NewSink(w, nil)
	defer func() { _ = s.Close() }()

	for i := 0; i < 20; i++ {
		s.Log(Event{Kind: KindVersionCut, Round: i})
	}
	if !s.Flush(2 * time.Second) {
		t.Fatal("the queue did not drain")
	}
	written, _, failed := s.Counts()
	if written != 0 {
		t.Fatalf("a failing writer reported %d writes", written)
	}
	if failed != 20 {
		t.Fatalf("counted %d failures over 20 attempts — the wiring may not be reaching the writer at all", failed)
	}
}

// TestAPanickingWriterIsContained is the second half of the same property. A
// recover that is never exercised is a recover nobody can tell from an absent
// one.
func TestAPanickingWriterIsContained(t *testing.T) {
	w := &panicOnceWriter{}
	s := NewSink(w, nil)
	defer func() { _ = s.Close() }()
	s.Log(Event{Kind: KindAckReceived})
	s.Log(Event{Kind: KindVersionCut})
	if !s.Flush(2 * time.Second) {
		t.Fatal("the queue did not drain — the worker died with the panic")
	}
	if _, _, failed := s.Counts(); failed != 1 {
		t.Fatalf("counted %d failures; the panic was not contained and counted", failed)
	}
	// AND THE SINK STILL WORKS AFTERWARDS, which is what "contained" has to
	// mean. A recover that lets the worker goroutine return would satisfy the
	// count above and record nothing ever again.
	if written, _, _ := s.Counts(); written != 1 {
		t.Fatalf("wrote %d events after the panic; the worker did not survive it", written)
	}
}

type panicOnceWriter struct {
	mu sync.Mutex
	n  int
}

func (p *panicOnceWriter) Write(b []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.n++
	if p.n == 1 {
		panic("the writer exploded")
	}
	return len(b), nil
}

// TestAnEventRoundTrips reads a line back as the type that wrote it. The log is
// read by a human hours later and by whatever they pipe it through, so the
// shape has to survive json.
//
// The two *int fields carry the weight here: a zero waiter count and an absent
// one are different facts, and an int would have made them one.
func TestAnEventRoundTrips(t *testing.T) {
	w := &countingWriter{}
	s := NewSink(w, nil)
	defer func() { _ = s.Close() }()

	s.Log(Event{
		Kind:  KindAckReceived,
		Doc:   "d.md",
		Where: "edit",
		Round: 4,
		Ack: &Ack{
			State: "answered",
			Note:  "done",
			Changes: []AckChange{{
				Quote:   "the rewritten phrase",
				Answers: []string{"cm-1"},
				Note:    "why",
			}},
		},
		Waiting: Int(0),
	})
	if !s.Flush(2 * time.Second) {
		t.Fatal("the queue did not drain")
	}
	lines := w.all()
	if len(lines) != 1 {
		t.Fatalf("wrote %d lines, want 1", len(lines))
	}
	var got Event
	if err := json.Unmarshal([]byte(lines[0]), &got); err != nil {
		t.Fatalf("the line is not readable json: %v\n%s", err, lines[0])
	}
	if got.Ack == nil || got.Ack.State != "answered" || len(got.Ack.Changes) != 1 {
		t.Fatalf("the ack did not survive the round trip: %+v", got.Ack)
	}
	if got.Ack.Changes[0].Quote != "the rewritten phrase" || got.Ack.Changes[0].Answers[0] != "cm-1" {
		t.Fatalf("the manifest entry did not survive: %+v", got.Ack.Changes[0])
	}
	if got.Waiting == nil || *got.Waiting != 0 {
		t.Fatalf("waiting=0 came back as %v — zero waiters is a fact and must not read as absent", got.Waiting)
	}
	// And an event with no waiter count says so, rather than claiming zero.
	if got.Instructions != nil {
		t.Fatalf("instructions came back as %v on an event that never set it", got.Instructions)
	}
	if got.At.IsZero() {
		t.Fatal("the event was not stamped")
	}
	if !strings.Contains(lines[0], `"at":`) {
		t.Fatalf("the line has no instant: %s", lines[0])
	}
}

// TestLogNeverBlocks drives more events than the queue holds through a writer
// that is wedged, and requires every call to return. A full queue DROPS: the
// alternative is putting the round behind the disk, which is the one thing this
// type exists to prevent.
func TestLogNeverBlocks(t *testing.T) {
	release := make(chan struct{})
	s := NewSink(blockingWriter{release}, nil)
	defer func() { close(release); _ = s.Close() }()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < queueDepth*4; i++ {
			s.Log(Event{Kind: KindAttached, Round: i})
		}
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Log blocked on a wedged writer")
	}
	if _, dropped, _ := s.Counts(); dropped == 0 {
		t.Fatal("nothing was dropped over a wedged writer and a queue of 256 — the bound is not doing anything")
	}
}

type blockingWriter struct{ release chan struct{} }

func (b blockingWriter) Write(p []byte) (int, error) {
	<-b.release
	return len(p), nil
}
