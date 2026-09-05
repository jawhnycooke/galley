//go:build js && wasm

// Command galley-wasm is the browser half of a galley review page.
//
// It holds the review document, speaks the y-websocket sync protocol to
// `galley serve`, and exposes a small function surface on window.galley. The
// page's JavaScript owns the DOM and nothing else: it reads a snapshot, paints
// it, and hands keystrokes back. Every decision about what the document
// contains is made here, in Go, where it can be tested.
package main

import (
	"encoding/json"
	"syscall/js"
	"time"

	"github.com/reearth/ygo/crdt"
	"github.com/reearth/ygo/sync"

	"github.com/schuettc/galley/internal/review"
	"github.com/schuettc/galley/internal/wire"
)

// originRemote marks transactions that arrived from the server, so they are not
// echoed straight back to it.
const originRemote = "remote"

type client struct {
	doc       *crdt.Doc
	socket    js.Value
	onChange  js.Value
	connected bool
}

func main() {
	c := &client{doc: crdt.New()}

	// Registering the observer takes the document's lock, so it must happen
	// before any transaction is in flight.
	c.doc.OnUpdate(func(update []byte, origin any) {
		if origin != originRemote {
			c.send(wire.Frame(wire.Sync, sync.EncodeUpdate(update)))
		}
		c.notify()
	})

	js.Global().Set("galley", js.ValueOf(map[string]any{
		"connect":     js.FuncOf(c.jsConnect),
		"snapshot":    js.FuncOf(c.jsSnapshot),
		"setComment":  js.FuncOf(c.jsSetComment),
		"setResolved": js.FuncOf(c.jsSetResolved),
		"onChange":    js.FuncOf(c.jsOnChange),
	}))

	// Tell the page we are ready; it cannot know otherwise.
	if ready := js.Global().Get("galleyReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}

	select {} // a wasm main that returns tears down the module
}

// jsConnect opens the websocket. galley.connect(url)
func (c *client) jsConnect(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return nil
	}
	url := args[0].String()

	ws := js.Global().Get("WebSocket").New(url)
	ws.Set("binaryType", "arraybuffer")
	c.socket = ws

	ws.Call("addEventListener", "open", js.FuncOf(func(js.Value, []js.Value) any {
		c.connected = true
		// The peer that speaks first asks what the other has.
		c.send(wire.Frame(wire.Sync, sync.EncodeSyncStep1(c.doc)))
		c.notify()
		return nil
	}))
	ws.Call("addEventListener", "message", js.FuncOf(func(_ js.Value, a []js.Value) any {
		c.receive(a[0].Get("data"))
		return nil
	}))
	closed := js.FuncOf(func(js.Value, []js.Value) any {
		c.connected = false
		c.notify()
		return nil
	})
	ws.Call("addEventListener", "close", closed)
	ws.Call("addEventListener", "error", closed)
	return nil
}

func (c *client) receive(data js.Value) {
	if data.Type() != js.TypeObject {
		return
	}
	buf := js.Global().Get("Uint8Array").New(data)
	msg := make([]byte, buf.Get("length").Int())
	js.CopyBytesToGo(msg, buf)

	outer, payload, err := wire.Unframe(msg)
	if err != nil || outer != wire.Sync {
		return // awareness and malformed frames are not our business
	}
	reply, err := sync.ApplySyncMessage(c.doc, payload, originRemote)
	if err != nil {
		return
	}
	if len(reply) > 0 {
		c.send(wire.Frame(wire.Sync, reply))
	}
	c.notify()
}

func (c *client) send(frame []byte) {
	if !c.connected || c.socket.IsUndefined() {
		return
	}
	buf := js.Global().Get("Uint8Array").New(len(frame))
	js.CopyBytesToJS(buf, frame)
	c.socket.Call("send", buf)
}

// jsSnapshot returns the whole conversation as JSON. The page re-renders from
// it wholesale, which is cheap at this size and removes a class of bug where
// incremental DOM updates drift from the document.
func (c *client) jsSnapshot(js.Value, []js.Value) any {
	raw, err := json.Marshal(map[string]any{
		"connected": c.connected,
		"threads":   review.Read(c.doc),
	})
	if err != nil {
		return "{}"
	}
	return string(raw)
}

// jsSetComment sets the reviewer's text for a section.
// galley.setComment(key, heading, text)
func (c *client) jsSetComment(_ js.Value, args []js.Value) any {
	if len(args) < 3 {
		return nil
	}
	review.Wrap(c.doc).SetComment(args[0].String(), args[1].String(), args[2].String(), time.Now())
	return nil
}

// jsSetResolved marks a thread settled. galley.setResolved(key, bool)
func (c *client) jsSetResolved(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return nil
	}
	_ = review.Wrap(c.doc).SetResolved(args[0].String(), args[1].Bool())
	return nil
}

func (c *client) jsOnChange(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return nil
	}
	c.onChange = args[0]
	c.notify()
	return nil
}

func (c *client) notify() {
	if c.onChange.Type() != js.TypeFunction {
		return
	}
	c.onChange.Invoke(c.jsSnapshot(js.Undefined(), nil))
}
