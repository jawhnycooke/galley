package wire

import (
	"bytes"
	"testing"
)

func TestVarUintRoundTrip(t *testing.T) {
	// Boundaries either side of every continuation-bit step, because the sync
	// protocol's own framing depends on this and a wrong boundary desynchronises
	// the whole stream rather than corrupting one message.
	for _, v := range []uint64{0, 1, 2, 127, 128, 129, 255, 256, 16383, 16384, 1 << 32, 1<<64 - 1} {
		enc := AppendVarUint(nil, v)
		got, n, err := ReadVarUint(enc)
		if err != nil {
			t.Fatalf("%d: %v", v, err)
		}
		if got != v {
			t.Fatalf("want %d, got %d", v, got)
		}
		if n != len(enc) {
			t.Fatalf("%d: consumed %d of %d bytes", v, n, len(enc))
		}
	}
}

func TestSmallTypesAreASingleByte(t *testing.T) {
	// Both outer types the protocol actually uses must encode to one byte, or
	// the client is paying for framing it does not need.
	for _, v := range []uint64{Sync, Awareness} {
		if got := AppendVarUint(nil, v); len(got) != 1 {
			t.Fatalf("outer type %d encoded to %d bytes", v, len(got))
		}
	}
}

func TestFrameRoundTrip(t *testing.T) {
	payload := []byte{0x00, 0x01, 0xFF, 0x7F}
	framed := Frame(Sync, payload)
	outer, got, err := Unframe(framed)
	if err != nil {
		t.Fatal(err)
	}
	if outer != Sync {
		t.Fatalf("outer = %d", outer)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("payload = %v", got)
	}
}

func TestFrameDoesNotAliasThePayload(t *testing.T) {
	// The caller reuses its encode buffer; a frame that aliased it would mutate
	// messages already queued for the socket.
	payload := []byte{1, 2, 3}
	framed := Frame(Sync, payload)
	payload[0] = 9
	if framed[1] == 9 {
		t.Fatal("Frame aliased the caller's payload")
	}
}

func TestUnframeRejectsAnEmptyMessage(t *testing.T) {
	if _, _, err := Unframe(nil); err == nil {
		t.Fatal("want an error for an empty frame")
	}
}

func TestUnframeOfAwarenessIsRecognised(t *testing.T) {
	// Awareness frames are not handled, but they must be identifiable rather
	// than mistaken for sync data.
	outer, payload, err := Unframe(Frame(Awareness, []byte{7}))
	if err != nil {
		t.Fatal(err)
	}
	if outer != Awareness || len(payload) != 1 {
		t.Fatalf("outer=%d payload=%v", outer, payload)
	}
}
