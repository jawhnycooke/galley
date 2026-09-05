// Package wire implements the outer y-websocket frame.
//
// ygo's sync package produces transport-agnostic sync messages; y-websocket
// wraps each one in a single varuint saying what kind of message it is. This is
// the whole difference between the two, kept in its own package so the browser
// client and its tests can share it without dragging in syscall/js.
package wire

import "errors"

// Outer message types, from the y-websocket protocol.
const (
	Sync      = 0
	Awareness = 1
)

// ErrEmpty is returned when a frame carries no type byte at all.
var ErrEmpty = errors.New("wire: empty frame")

// Frame prefixes a payload with its outer message type.
func Frame(outer uint64, payload []byte) []byte {
	head := AppendVarUint(nil, outer)
	out := make([]byte, 0, len(head)+len(payload))
	out = append(out, head...)
	return append(out, payload...)
}

// Unframe splits a frame into its outer message type and payload.
func Unframe(msg []byte) (uint64, []byte, error) {
	outer, n, err := ReadVarUint(msg)
	if err != nil {
		return 0, nil, err
	}
	return outer, msg[n:], nil
}

// AppendVarUint appends a lib0-style variable-length unsigned integer: seven
// bits per byte, high bit set while more bytes follow.
func AppendVarUint(dst []byte, v uint64) []byte {
	for v > 0x7F {
		dst = append(dst, byte(v&0x7F)|0x80)
		v >>= 7
	}
	return append(dst, byte(v))
}

// ReadVarUint reads a variable-length unsigned integer, returning it and the
// number of bytes consumed.
func ReadVarUint(src []byte) (uint64, int, error) {
	var v uint64
	var shift uint
	for i, b := range src {
		if shift >= 64 {
			return 0, 0, errors.New("wire: varuint overflows 64 bits")
		}
		v |= uint64(b&0x7F) << shift
		if b&0x80 == 0 {
			return v, i + 1, nil
		}
		shift += 7
	}
	return 0, 0, ErrEmpty
}
