package ledger

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// A recorder writes what it was handed, through the real Log.
func TestRecorderWritesTheRecord(t *testing.T) {
	root, doc := repo(t)
	r := NewRecorder(Log)

	r.Record(doc, Record{Kind: KindApproved, Author: AuthorAgent, Quote: "the brown fox"})
	if !r.Flush(10 * time.Second) {
		t.Fatal("the recorder did not drain")
	}
	if r.Failed() != 0 || r.Dropped() != 0 {
		t.Fatalf("failed=%d dropped=%d, want 0/0", r.Failed(), r.Dropped())
	}

	raw, err := os.ReadFile(root + "/.galley/decisions.jsonl")
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1: %q", len(lines), raw)
	}
	var got Record
	if err := json.Unmarshal([]byte(lines[0]), &got); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got.Kind != KindApproved || got.Quote != "the brown fox" || got.Doc != "doc.md" {
		t.Fatalf("record %+v is not what was recorded", got)
	}
	if got.At.IsZero() || got.V != Version {
		t.Fatalf("record %+v lost the fields Append fills in", got)
	}
}

// THE PROPERTY, at this layer: an append that fails is counted and nothing
// else. Record hands back no error, so no caller can turn one into a refused
// decision — this asserts the failure really was reached rather than silently
// skipped, which is what makes the absence of an error meaningful.
func TestRecorderSwallowsAFailedAppend(t *testing.T) {
	_, doc := repo(t)
	boom := errors.New("the disk is full")
	r := NewRecorder(func(string, Record) error { return boom })

	r.Record(doc, Record{Kind: KindDeclined, Reason: "the house style says brown"})
	if !r.Flush(10 * time.Second) {
		t.Fatal("the recorder did not drain")
	}
	if r.Failed() != 1 {
		t.Fatalf("failed=%d, want 1 — the append must have been ATTEMPTED", r.Failed())
	}
}

// A panic in the append is the same class of failure as an error, and it must
// not escape: this goroutine belongs to no request, so an escaping panic ends
// the process and with it the review the record was about.
func TestRecorderSwallowsAPanickingAppend(t *testing.T) {
	_, doc := repo(t)
	r := NewRecorder(func(string, Record) error { panic("ledger exploded") })

	r.Record(doc, Record{Kind: KindHand})
	if !r.Flush(10 * time.Second) {
		t.Fatal("the recorder did not drain")
	}
	if r.Failed() != 1 {
		t.Fatalf("failed=%d, want 1", r.Failed())
	}
}

// No repository above the document is the ordinary soft failure — a scratch
// file outside any checkout — and it must reach the counter, not the caller.
func TestRecorderTakesNoRepoInItsStride(t *testing.T) {
	dir := t.TempDir()
	doc := dir + "/loose.md"
	if err := os.WriteFile(doc, []byte("hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := NewRecorder(func(docPath string, rec Record) error {
		err := Log(docPath, rec)
		if !errors.Is(err, ErrNoRepo) {
			t.Errorf("want ErrNoRepo, got %v", err)
		}
		return err
	})
	r.Record(doc, Record{Kind: KindApproved})
	if !r.Flush(10 * time.Second) {
		t.Fatal("the recorder did not drain")
	}
	if r.Failed() != 1 {
		t.Fatalf("failed=%d, want 1", r.Failed())
	}
}

// A WEDGED FILESYSTEM MUST NOT BLOCK A DECISION. The queue is bounded and a
// full one drops rather than waiting, so Record returns promptly however long
// the append takes.
func TestRecorderDropsRatherThanBlocks(t *testing.T) {
	_, doc := repo(t)
	release := make(chan struct{})
	var once sync.Once
	r := NewRecorder(func(string, Record) error {
		<-release
		return nil
	})
	t.Cleanup(func() { once.Do(func() { close(release) }) })

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < queueDepth*3; i++ {
			r.Record(doc, Record{Kind: KindApproved})
		}
	}()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Record blocked on a wedged append — a decision would have blocked with it")
	}
	if r.Dropped() == 0 {
		t.Fatal("nothing was dropped, so the queue is not bounded")
	}
	once.Do(func() { close(release) })
}

// THE LOG IS NOT INTERLEAVED, WHICH IS THE PROPERTY THIS CAN HOLD — and the
// claim is narrowed on purpose, because the wider one is not true and was
// written here anyway ("the log's line order is the order decisions were
// made"). This test enqueues from ONE goroutine, so all it can prove is that
// the channel and its single worker preserve the order they were given. Two
// concurrent call sites are a different question and this says nothing about
// it: EditServer.remember runs AFTER the mutation mutex is released, so two
// decisions serialized by that mutex can still reach the channel in either
// order, and no arrangement of a queue could fix that from here.
//
// What the single worker DOES guarantee, and what the log's value rests on, is
// that no record is written into the middle of another and every line is whole
// (Append's single write is the other half of that). Ordering between
// concurrent deciders is answered by the record's own `at`, stamped at Record
// time, which is why that stamp is not left to the worker.
func TestTheLogIsNotInterleaved(t *testing.T) {
	root, doc := repo(t)
	r := NewRecorder(Log)
	for i := 0; i < 20; i++ {
		r.Record(doc, Record{Kind: KindApproved, Quote: string(rune('a' + i))})
	}
	if !r.Flush(10 * time.Second) {
		t.Fatal("the recorder did not drain")
	}
	raw, err := os.ReadFile(root + "/.galley/decisions.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	if len(lines) != 20 {
		t.Fatalf("got %d lines, want 20", len(lines))
	}
	for i, line := range lines {
		var rec Record
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			t.Fatal(err)
		}
		if want := string(rune('a' + i)); rec.Quote != want {
			t.Fatalf("line %d carries %q, want %q — the order moved", i, rec.Quote, want)
		}
	}
}

// A nil recorder is the zero value a caller that never wired one holds, and it
// must be usable rather than a nil dereference in a decision path.
func TestNilRecorderIsInert(t *testing.T) {
	var r *Recorder
	r.Record("doc.md", Record{Kind: KindApproved})
	if !r.Flush(time.Second) {
		t.Fatal("a nil recorder must flush trivially")
	}
	if !r.Close(time.Second) {
		t.Fatal("a nil recorder must close trivially")
	}
}

// THE INSTANT IS DECISION TIME, NOT WRITE TIME. Append fills a zero At as a
// backstop, but Append runs on the worker — behind however much queue there is
// — so a record that arrives there unstamped carries queue latency instead of
// the moment it was decided. This holds the append still and asserts the stamp
// was already on the record before the disk was ever reached.
func TestTheInstantIsStampedWhenTheDecisionIsMade(t *testing.T) {
	release := make(chan struct{})
	seen := make(chan Record, 2)
	r := NewRecorder(func(_ string, rec Record) error {
		<-release
		seen <- rec
		return nil
	})
	t.Cleanup(func() { r.Close(10 * time.Second) })

	before := time.Now().UTC()
	r.Record("doc.md", Record{Kind: KindApproved, Quote: "swept"})
	r.Record("doc.md", Record{Kind: KindVerdictApproved})
	after := time.Now().UTC()

	close(release)
	if !r.Flush(10 * time.Second) {
		t.Fatal("the recorder did not drain")
	}
	first, second := <-seen, <-seen
	for _, rec := range []Record{first, second} {
		if rec.At.IsZero() {
			t.Fatalf("%s reached the append unstamped — the worker would have dated it", rec.Kind)
		}
		if rec.At.Before(before) || rec.At.After(after) {
			t.Fatalf("%s is stamped %s, outside the window the decisions were made in (%s … %s)",
				rec.Kind, rec.At, before, after)
		}
	}
	// The verdict was decided after what it swept, and the log has to say so.
	if second.At.Before(first.At) {
		t.Fatalf("the verdict (%s) predates the proposal it swept (%s)", second.At, first.At)
	}
	// A caller that supplies its own instant keeps it — a hand edit's `at` is
	// the reviewer's keystroke, not the save that reported it.
	own := time.Date(2026, 8, 15, 10, 0, 0, 0, time.UTC)
	r.Record("doc.md", Record{Kind: KindHand, At: own})
	if !r.Flush(10 * time.Second) {
		t.Fatal("the recorder did not drain")
	}
	if got := <-seen; !got.At.Equal(own) {
		t.Fatalf("at = %s, want the instant the caller supplied (%s)", got.At, own)
	}
}

// CLOSE EXISTS BECAUSE work() RANGES A CHANNEL. Without it that goroutine
// outlives every recorder ever built, for the life of the process — invisible
// in production, where there is one, and a leak per test everywhere else. After
// it, Record must DROP rather than send on a closed channel, which is a panic
// on the caller's goroutine: the decision path's, and the one place a panic is
// exactly what this type exists to prevent.
func TestCloseStopsTheWorkerAndRecordStaysSafe(t *testing.T) {
	_, doc := repo(t)
	var wrote int
	r := NewRecorder(func(string, Record) error { wrote++; return nil })

	r.Record(doc, Record{Kind: KindApproved})
	if !r.Close(10 * time.Second) {
		t.Fatal("close did not drain")
	}
	if wrote != 1 {
		t.Fatalf("wrote %d records before closing, want 1", wrote)
	}

	// After the close: no panic, no write, counted as a loss.
	r.Record(doc, Record{Kind: KindApproved})
	if wrote != 1 {
		t.Fatalf("a record was written after Close: %d", wrote)
	}
	if r.Dropped() != 1 {
		t.Fatalf("dropped=%d, want the post-close record counted as lost", r.Dropped())
	}
	// Idempotent: a second Close must not close a closed channel.
	if !r.Close(time.Second) {
		t.Fatal("a second close must be trivial")
	}
	// And a recorder nobody recorded through never started a worker, so it has
	// nothing to close and must say so immediately.
	quiet := NewRecorder(func(string, Record) error { return nil })
	if !quiet.Flush(time.Second) || !quiet.Close(time.Second) {
		t.Fatal("an unused recorder must flush and close trivially")
	}
}

// FLUSH MUST NOT BLOCK FOREVER ON A WEDGED APPEND, and it must say it did not
// drain rather than reporting a success it never waited for. The old
// implementation answered this with a goroutine parked on a WaitGroup, which
// leaked on every timeout; the sentinel is answered by the worker or by the
// deadline, and leaves nothing behind either way.
func TestFlushReportsAWedgedQueueRatherThanHanging(t *testing.T) {
	_, doc := repo(t)
	release := make(chan struct{})
	r := NewRecorder(func(string, Record) error {
		<-release
		return nil
	})
	t.Cleanup(func() {
		close(release)
		r.Close(10 * time.Second)
	})

	r.Record(doc, Record{Kind: KindApproved})
	done := make(chan bool, 1)
	go func() { done <- r.Flush(100 * time.Millisecond) }()
	select {
	case ok := <-done:
		if ok {
			t.Fatal("Flush reported a drain that cannot have happened — the append is still blocked")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Flush never returned")
	}
}

// A DECISION PATH MUST NEVER WAIT ON ANOTHER GOROUTINE, and this is the exact
// shape in which it used to: the lock, not the disk.
//
// Record's doc comment says it never blocks, unconditionally, and the type's
// whole justification is that a ledger write cannot fail or delay a decision.
// The old synchronisation made that CONDITIONALLY true. Flush held mu.RLock()
// across a channel send that is blocking whenever the queue is full; Close
// takes mu.Lock(); and Go's RWMutex blocks new readers behind a PENDING writer.
// So: a wedged append, a queue filled behind it, one Flush parked on the send,
// and a Close whose own Flush timed out — and every subsequent Record slept on
// mu until the disk came back. Unreachable in production, where nothing Closes
// DefaultRecorder, and an unconditional claim is not a claim to leave
// conditionally true.
//
// Assembled rather than described: each of those four conditions is set up
// here, in order, because with any of them missing the send is not blocking and
// the lock is never contended. Run against the RWMutex version this hangs until
// the deadline; with no lock in Record at all it cannot.
func TestRecordDoesNotWaitOnAConcurrentClose(t *testing.T) {
	_, doc := repo(t)
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	r := NewRecorder(func(string, Record) error {
		<-release
		return nil
	})

	// A wedged append, and a queue filled behind it — a sentinel send is only
	// blocking when there is no room left for it.
	for i := 0; i < queueDepth+2; i++ {
		r.Record(doc, Record{Kind: KindApproved})
	}
	// A Flush parked on that full queue.
	go r.Flush(30 * time.Second)
	time.Sleep(50 * time.Millisecond)
	// And a Close behind it, whose own Flush gives up quickly and leaves the
	// writer pending.
	go r.Close(10 * time.Millisecond)
	time.Sleep(50 * time.Millisecond)

	// The decision path. It has already decided; this is only the memory of it.
	done := make(chan struct{})
	go func() {
		r.Record(doc, Record{Kind: KindApproved})
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Record blocked — a reviewer's accept is now waiting on a shutdown " +
			"waiting on a disk, which is the one thing this type exists to prevent")
	}
}
