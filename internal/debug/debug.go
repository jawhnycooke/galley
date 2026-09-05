// Package debug is galley's opt-in record of what it told the agent, what the
// agent told it back, and what it refused — written to a file or to stderr and
// to nowhere else.
//
// WHY IT EXISTS, AND IT IS NOT HYPOTHETICAL. Diagnosing two real defects on
// 2026-08-22 meant reading a Claude Code transcript belonging to ANOTHER
// project, because that transcript was the only surviving copy of what galley
// had sent a paired agent. galley could not answer that question about itself.
// Five facts were unavailable from galley at the time and each is a Kind below:
// what the round notification contained, what the ack carried, that findUnique
// refused an anchor and with what target (that error existed ONLY as a toast in
// the reviewer's browser), who moved the document, and whether an agent was
// attached.
//
// A DEBUG PATH MAY NEVER FAIL A REVIEW, and that is structural here for the
// same two reasons internal/ledger states it:
//
//   - LOG RETURNS NOTHING. An error return is an invitation — sooner or later a
//     call site writes `if err := debug.Log(...); err != nil { return err }`
//     and a full disk starts refusing Revise presses. There is no error value
//     to propagate, so no caller can propagate one.
//   - THE WRITE HAPPENS ON ANOTHER GOROUTINE, behind a bounded queue with a
//     recover around it. Nothing the filesystem does can land inside the
//     request that made the decision, and a full queue DROPS rather than
//     blocking, because blocking would put the round behind the disk.
//
// OFF BY DEFAULT, AND OFF MEANS NOTHING IS OPENED. With GALLEY_DEBUG unset the
// process-wide sink is nil, Log returns on its first line, and no file is
// created, no goroutine is started and nothing is written to stderr. The check
// is stated over the RESOLVER and over a real edit server, not over a comment.
//
// AN ENV VAR AND NOT A FLAG. The events below are produced by TWO processes:
// `galley edit` (the ack, the anchor refusal, the version cut, the waiter) and
// `galley channel` (the rendered notification, attach and detach). The channel
// is started by the MCP host from a fixed argv in .mcp.json, so there is no
// command line for a reviewer to add a flag to; an environment variable is
// inherited by both and is the only control that reaches both. GALLEY_LEDGER_DIR,
// GALLEY_LIVE_DIR and GALLEY_CONFIG_DIR are the same shape already.
//
//	GALLEY_DEBUG=/tmp/galley.jsonl   append JSON lines to that file
//	GALLEY_DEBUG=stderr              (also 1, on, true, yes) write to stderr
//	GALLEY_DEBUG=                    (unset, or 0/off/false/no) OFF
package debug

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Kind names one recorded event. The five the 2026-08-22 review could not
// answer, plus the detach that pairs with the attach.
//
// A Kind is a STRING and not an ordinal, for internal/suggest's own reason: the
// file this writes is read by a human hours later, and a number that renumbers
// when a constant is inserted above it is meaningless against a log written by
// an older binary.
type Kind string

const (
	// KindRoundSent is the round handoff AS SENT — the rendered notification,
	// byte for byte as the agent received it, not a reconstruction of it. Both
	// carriers write it (the channel's push and `galley wait`'s pull), because
	// a rule with two carriers fixed in one of them is this codebase's
	// most-repeated defect and a debug mode that watches one carrier would be
	// the silent site again.
	KindRoundSent Kind = "round.sent"

	// KindAckReceived is the agent's ack AS RECEIVED by the server, with the
	// quote/note/answers of every manifest entry exactly as posted — including
	// the entries the manifest goes on to drop, which is the population nothing
	// else records.
	KindAckReceived Kind = "ack.received"

	// KindAnchorRefused is an anchor galley would not place, with the target
	// text it was asked to place it on. That refusal reached a toast in the
	// reviewer's browser and nowhere else.
	KindAnchorRefused Kind = "anchor.refused"

	// KindVersionCut is a round committed to the version store: its number, its
	// reason, and WHO MOVED THE DOCUMENT — observed at the source by
	// roundAuthors, which is the only answer to "reviewer or agent" that is not
	// an inference from the bytes.
	KindVersionCut Kind = "version.cut"

	// KindAttached and KindDetached are whether an agent was there at a given
	// moment: the channel attaching to and letting go of an editor, and the
	// editor's own waiter registry arming and releasing.
	KindAttached Kind = "agent.attached"
	KindDetached Kind = "agent.detached"
)

// Event is one line of the debug log. IT IS A TYPE AND NOT A MAP, deliberately:
// a map is a shape nobody can rename safely and a reader cannot enumerate, and
// this file is read by someone reconstructing a handoff from an unfamiliar
// binary's output.
//
// It is Go-only. Nothing here crosses to the browser, so it is not part of
// web/wire.d.ts's generated contract and must not be added to wireRoots — the
// wire is what the browser reads off /_galley/pending and /_galley/versions,
// and a type in it that no browser reads is a contract with one party.
//
// Every field is omitempty except At and Kind, so a line says what happened and
// nothing it has no answer for. An absent field is "this event has no such
// fact", never "the fact was zero".
type Event struct {
	At   time.Time `json:"at"`
	Kind Kind      `json:"kind"`

	// Doc is the document this is about, and Where names the process and
	// carrier that wrote the line — `channel`, `wait`, `edit`. Two processes
	// write into one file when GALLEY_DEBUG names the same path, so a line that
	// did not say which one it came from would be unreadable in exactly the
	// situation this exists for.
	Doc   string `json:"doc,omitempty"`
	Where string `json:"where,omitempty"`
	Room  string `json:"room,omitempty"`

	Round       int    `json:"round,omitempty"`
	Reason      string `json:"reason,omitempty"`
	Fingerprint string `json:"fingerprint,omitempty"`

	// Rendered is the notification's whole text as sent, and Instructions is
	// the count that rode its meta. The count is a *int rather than an int
	// because the channel has a genuine "unknown" (countUnknown, on a reopen
	// whose count read failed) and reporting that as 0 would say the document
	// was clean at the moment a round opened on it.
	Rendered     string `json:"rendered,omitempty"`
	Instructions *int   `json:"instructions,omitempty"`
	Asks         []Ask  `json:"asks,omitempty"`

	// Ack is the agent's return as posted.
	Ack *Ack `json:"ack,omitempty"`

	// Op and Target are the refusal: which verb asked, and the text it asked
	// to anchor to. Err is the refusal in the words the caller was given.
	Op     string `json:"op,omitempty"`
	Target string `json:"target,omitempty"`
	Err    string `json:"err,omitempty"`

	// Authors is who moved the document since the last cut, and Answers is how
	// many asks the round answers.
	Authors string `json:"authors,omitempty"`
	Answers int    `json:"answers,omitempty"`

	// Waiting is how many waiters the editor holds AFTER this event. It is a
	// *int for Instructions' reason: zero waiters is a real and important
	// reading, and it must not be confused with an event that never counted.
	Waiting *int `json:"waiting,omitempty"`

	// Note carries the one sentence an event has that nothing else holds — a
	// detach's cause, an ack's note, a wake's reason.
	Note string `json:"note,omitempty"`
}

// Ask is one instruction as it went out with a round: the key the agent may
// name in its answers, the reviewer's words, and the passage they were about.
type Ask struct {
	Key   string `json:"key,omitempty"`
	Text  string `json:"text,omitempty"`
	Quote string `json:"quote,omitempty"`
}

// Ack is the agent's return as it arrived, before anything validates it.
type Ack struct {
	State   string      `json:"state,omitempty"`
	Note    string      `json:"note,omitempty"`
	Changes []AckChange `json:"changes,omitempty"`
}

// AckChange mirrors the manifest entry the agent posts. Recorded RAW — an entry
// the server cannot place is dropped from the round with no error to anybody,
// which makes this the only surface it ever appears on.
type AckChange struct {
	Quote   string   `json:"quote,omitempty"`
	Note    string   `json:"note,omitempty"`
	Answers []string `json:"answers,omitempty"`
}

// Int is a helper for the two *int fields, because a zero that means zero has
// to be spelled and `&n` on a literal is not legal Go.
func Int(n int) *int { return &n }

// Sink is one destination. A nil *Sink is OFF and every method on it is a
// no-op, which is what makes `Default == nil` the whole of "debug is off".
type Sink struct {
	w      io.Writer
	closer io.Closer

	ch    chan job
	start sync.Once
	live  atomic.Bool

	stop     chan struct{}
	stopOnce sync.Once
	closed   atomic.Bool

	failed  atomic.Int64
	dropped atomic.Int64
	written atomic.Int64
}

// queueDepth bounds what may be in flight before Log starts dropping. A round
// handoff is a handful of events, not a burst; this is generous next to any
// real one and small enough that a wedged file cannot grow it without bound.
const queueDepth = 256

// defaultSink is the process-wide sink, resolved from the environment ONCE at
// startup. A nil pointer means OFF, and off is what an unset GALLEY_DEBUG gives.
//
// Resolved at init rather than per call so that turning debug on mid-process is
// impossible: a log whose contents depend on when an env var was mutated is a
// log that cannot be read back.
//
// AN ATOMIC POINTER AND NOT A PLAIN VAR, because SetDefault exists for tests
// and every server goroutine in the process reads this one word. A plain var
// swapped by a test while a live handler read it is a data race `go test -race`
// would report — against the test harness, in a package whose whole promise is
// that it cannot disturb what it watches.
var defaultSink atomic.Pointer[Sink]

func init() {
	if s := FromEnv(os.Getenv); s != nil {
		defaultSink.Store(s)
	}
}

// Current is the sink in force, or nil when debug is off.
func Current() *Sink { return defaultSink.Load() }

// SetDefault installs a sink and returns the call that puts the previous one
// back. It exists for TESTS — a check that debug records what it claims to
// record cannot be written against a package-level destination it cannot
// address — and nothing in production calls it.
func SetDefault(s *Sink) (restore func()) {
	prev := defaultSink.Load()
	defaultSink.Store(s)
	return func() { defaultSink.Store(prev) }
}

// FromEnv resolves GALLEY_DEBUG into a sink, or nil for off. getenv is a
// parameter rather than os.Getenv so a test can prove the OFF case without
// mutating the process environment.
//
// A PATH THAT WILL NOT OPEN FALLS BACK TO STDERR AND SAYS SO. Silently doing
// nothing would be the worst of the three outcomes: the reviewer asked for a
// record, believes they have one, and finds out when they need it. It cannot
// fail anything — this runs at init, before any review exists.
func FromEnv(getenv func(string) string) *Sink {
	v := strings.TrimSpace(getenv("GALLEY_DEBUG"))
	switch strings.ToLower(v) {
	case "", "0", "off", "false", "no":
		return nil
	case "1", "on", "true", "yes", "stderr":
		return NewSink(os.Stderr, nil)
	}
	f, err := os.OpenFile(filepath.Clean(v), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[galley debug] cannot open %s (%v) — writing to stderr instead\n", v, err)
		return NewSink(os.Stderr, nil)
	}
	return NewSink(f, f)
}

// NewSink builds a sink over an arbitrary writer. closer may be nil.
func NewSink(w io.Writer, closer io.Closer) *Sink {
	return &Sink{w: w, closer: closer, ch: make(chan job, queueDepth), stop: make(chan struct{})}
}

// On reports whether anything is recording. Call sites use it ONLY to skip
// building an expensive payload — Log is safe to call unconditionally and
// checks this itself.
func On() bool { return Current() != nil }

// Log records one event on the default sink. It returns nothing; see the
// package comment.
func Log(ev Event) { Current().Log(ev) }

// Log records one event. It never fails, never blocks, and never returns
// anything a caller could mistake for a reason to refuse a decision.
func (s *Sink) Log(ev Event) {
	if s == nil {
		return
	}
	if ev.At.IsZero() {
		// STAMPED HERE, WHICH IS EVENT TIME. The worker runs behind a queue, so
		// a stamp taken there records when the WRITE happened — and the whole
		// use of this file is reading a handoff back in the order it occurred.
		ev.At = time.Now().UTC()
	}
	if s.closed.Load() {
		s.dropped.Add(1)
		return
	}
	s.start.Do(func() {
		s.live.Store(true)
		go s.work()
	})
	select {
	case s.ch <- job{ev: ev}:
	default:
		s.dropped.Add(1)
	}
}

// job is one event to write, or — when done is non-nil — the FLUSH SENTINEL: a
// marker carrying no event, answered by closing done. FIFO plus one worker is
// the whole proof that everything queued before the sentinel has been written
// by the time it comes back, which is the same guarantee a sync.WaitGroup would
// give with no counter to misuse from the goroutine making the decision.
type job struct {
	ev   Event
	done chan struct{}
}

func (s *Sink) work() {
	for {
		select {
		case <-s.stop:
			return
		case j := <-s.ch:
			if j.done != nil {
				close(j.done)
				continue
			}
			s.write(j.ev)
		}
	}
}

// write is the whole of the failure containment: a recover, because a panic
// here would take down the process that was merely being watched, and a
// counter, because a failure that is invisible is indistinguishable from a
// wiring that does nothing.
func (s *Sink) write(ev Event) {
	defer func() {
		if r := recover(); r != nil {
			s.failed.Add(1)
		}
	}()
	line, err := json.Marshal(ev)
	if err != nil {
		s.failed.Add(1)
		return
	}
	if _, err := s.w.Write(append(line, '\n')); err != nil {
		s.failed.Add(1)
		return
	}
	s.written.Add(1)
}

// Counts reports what this sink has done. Written is what reached the writer;
// Dropped is what a full queue or a closed sink refused; Failed is what the
// writer or the marshaller rejected.
//
// It exists so a test can prove the write was ATTEMPTED — the line that stops a
// property test passing against a wiring that does nothing, which is
// internal/ledger's own reason for Failed and Dropped.
func (s *Sink) Counts() (written, dropped, failed int64) {
	if s == nil {
		return 0, 0, 0
	}
	return s.written.Load(), s.dropped.Load(), s.failed.Load()
}

// Flush waits for everything queued when it was called to be written, up to
// timeout, and reports whether the queue drained. A process about to exit calls
// it; nobody has to.
func (s *Sink) Flush(timeout time.Duration) bool {
	if s == nil {
		return true
	}
	if s.closed.Load() || !s.live.Load() {
		return true
	}
	done := make(chan struct{})
	deadline := time.After(timeout)
	select {
	case s.ch <- job{done: done}:
	case <-deadline:
		return false
	case <-s.stop:
		return true
	}
	select {
	case <-done:
		return true
	case <-deadline:
		return false
	case <-s.stop:
		return true
	}
}

// Flush drains the default sink.
func Flush(timeout time.Duration) bool { return Current().Flush(timeout) }

// Close stops the worker and closes the underlying file if this sink owns one.
// The channel is NEVER closed — a send on a channel that is never closed cannot
// panic, which is what lets Log take no lock at all.
func (s *Sink) Close() error {
	if s == nil {
		return nil
	}
	s.closed.Store(true)
	s.stopOnce.Do(func() { close(s.stop) })
	if s.closer != nil {
		return s.closer.Close()
	}
	return nil
}
