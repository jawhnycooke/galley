// galley review overlay — the DOM half.
//
// This file owns nothing but the page. It creates a comment box per section,
// hands keystrokes to the Go client, and repaints from whatever snapshot Go
// gives back. Every decision about what the document contains — threads,
// entries, edits, resolve, connection state — is made in Go, where it is
// tested. The rule that keeps this honest: no state lives here.
(function () {
  "use strict";

  var API = "/_galley";
  var POLL_MS = 1500;

  var boxes = Object.create(null); // key -> {wrap, box, stateEl, replies, resolveBtn, heading, editedAt}
  var order = [];
  var bar, barDot, barText;
  var lastSavedMs = 0;
  var snapshot = { connected: false, threads: [] };

  function slugify(s) {
    return String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  // Heading text with child elements separated: the template wraps the section
  // number in its own span, and joining without a separator would produce
  // "01Shape" rather than "01 Shape".
  function headingText(h) {
    var parts = [];
    for (var i = 0; i < h.childNodes.length; i++) {
      var t = h.childNodes[i].textContent.trim();
      if (t) parts.push(t);
    }
    return parts.join(" ").replace(/\s+/g, " ");
  }

  function sections() {
    var els = document.querySelectorAll("section");
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < els.length; i++) {
      var h = els[i].querySelector("h1, h2, h3");
      var heading = h ? headingText(h) : "";
      var base = slugify(heading) || "section-" + (i + 1);
      var key = base;
      var n = 2;
      while (seen[key]) {
        key = base + "-" + n;
        n++;
      }
      seen[key] = true;
      out.push({ el: els[i], key: key, heading: heading || key });
    }
    return out;
  }

  function clockTime(ms) {
    var d = ms ? new Date(ms) : new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function threadFor(key) {
    for (var i = 0; i < snapshot.threads.length; i++) {
      if (snapshot.threads[i].key === key) return snapshot.threads[i];
    }
    return null;
  }

  function commentOf(thread) {
    if (!thread || !thread.entries) return "";
    for (var i = 0; i < thread.entries.length; i++) {
      if (thread.entries[i].author === "court") return thread.entries[i].text;
    }
    return "";
  }

  // ---- rendering ------------------------------------------------------------

  function paint() {
    var open = 0;
    order.forEach(function (key) {
      var view = boxes[key];
      var thread = threadFor(key);
      var text = commentOf(thread);
      var resolved = !!(thread && thread.resolved);

      // Only adopt the document's text when it actually differs. Writing the
      // value unconditionally would move the caret on every repaint.
      if (view.box.value !== text && document.activeElement !== view.box) {
        view.box.value = text;
      }

      var state;
      if (!snapshot.connected) {
        state = "error";
      } else if (view.editedAt && lastSavedMs >= view.editedAt) {
        state = "saved";
      } else if (view.editedAt) {
        state = "syncing";
      } else if (view.box.value) {
        state = "saved";
      } else {
        state = "idle";
      }

      view.wrap.setAttribute("data-state", state);
      view.stateEl.setAttribute("data-state", state);
      view.stateEl.textContent =
        state === "saved"
          ? "on disk " + clockTime(lastSavedMs || view.editedAt)
          : state === "syncing"
            ? "syncing…"
            : state === "error"
              ? "DISCONNECTED"
              : "";

      view.resolveBtn.hidden = !view.box.value && !resolved;
      view.resolveBtn.textContent = resolved ? "reopen" : "resolve";
      view.wrap.classList.toggle("gly-resolved", resolved);

      if (view.box.value && !resolved) open++;
      renderReplies(view, thread);
    });

    setBar(
      snapshot.connected ? (open ? "saved" : "idle") : "error",
      snapshot.connected
        ? open
          ? open + (open === 1 ? " open thread" : " open threads")
          : "galley · connected"
        : "DISCONNECTED — reconnecting",
    );
    renderOrphans();
  }

  function renderReplies(view, thread) {
    view.replies.textContent = "";
    if (!thread || !thread.entries) return;
    thread.entries.forEach(function (e) {
      if (e.author === "court" || !e.text) return;
      var div = document.createElement("div");
      div.className = "gly-reply";
      var who = document.createElement("span");
      who.className = "gly-who";
      who.textContent = "claude";
      var when = document.createElement("span");
      when.className = "gly-when";
      when.textContent = e.at ? clockTime(Date.parse(e.at)) : "";
      var p = document.createElement("p");
      p.textContent = e.text;
      div.appendChild(who);
      div.appendChild(when);
      div.appendChild(p);
      view.replies.appendChild(div);
    });
  }

  // A heading changed between regenerations, so a comment no longer has a home.
  // Surface it rather than dropping it silently.
  function renderOrphans() {
    var orphans = snapshot.threads.filter(function (t) {
      return !boxes[t.key] && commentOf(t);
    });
    var box = document.getElementById("gly-orphans");
    if (!orphans.length) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement("section");
      box.id = "gly-orphans";
      var h = document.createElement("h2");
      h.textContent = "Comments whose section is gone";
      box.appendChild(h);
      (document.querySelector(".wrap") || document.body).appendChild(box);
    }
    while (box.childNodes.length > 1) box.removeChild(box.lastChild);
    orphans.forEach(function (t) {
      var p = document.createElement("p");
      var b = document.createElement("strong");
      b.textContent = (t.heading || t.key) + " — ";
      p.appendChild(b);
      p.appendChild(document.createTextNode(commentOf(t)));
      box.appendChild(p);
    });
  }

  function setBar(state, text) {
    if (!bar) return;
    bar.setAttribute("data-state", state);
    barText.textContent = text;
  }

  // ---- mount ----------------------------------------------------------------

  function mount() {
    sections().forEach(function (sec) {
      var wrap = document.createElement("div");
      wrap.className = "gly-cmt";
      wrap.setAttribute("data-state", "idle");

      var head = document.createElement("div");
      head.className = "gly-head";

      var lab = document.createElement("label");
      lab.textContent = "comment";
      lab.htmlFor = "gly-" + sec.key;

      var right = document.createElement("span");
      right.className = "gly-right";

      var stateEl = document.createElement("span");
      stateEl.className = "gly-state";
      stateEl.setAttribute("data-state", "idle");

      var resolveBtn = document.createElement("button");
      resolveBtn.className = "gly-resolve";
      resolveBtn.type = "button";
      resolveBtn.hidden = true;
      resolveBtn.textContent = "resolve";
      resolveBtn.addEventListener("click", function () {
        var thread = threadFor(sec.key);
        window.galley.setResolved(sec.key, !(thread && thread.resolved));
      });

      right.appendChild(stateEl);
      right.appendChild(resolveBtn);

      var box = document.createElement("textarea");
      box.id = "gly-" + sec.key;
      box.placeholder = "…";
      box.addEventListener("input", function () {
        boxes[sec.key].editedAt = Date.now();
        // Straight through to Go. Nothing is buffered here, so there is no
        // local state that can disagree with the document.
        window.galley.setComment(sec.key, sec.heading, box.value);
      });

      var replies = document.createElement("div");
      replies.className = "gly-replies";

      head.appendChild(lab);
      head.appendChild(right);
      wrap.appendChild(head);
      wrap.appendChild(box);
      wrap.appendChild(replies);
      sec.el.appendChild(wrap);

      boxes[sec.key] = {
        wrap: wrap,
        box: box,
        stateEl: stateEl,
        replies: replies,
        resolveBtn: resolveBtn,
        heading: sec.heading,
        editedAt: 0,
      };
      order.push(sec.key);
    });

    bar = document.createElement("div");
    bar.className = "gly-bar";
    bar.setAttribute("data-state", "idle");
    barDot = document.createElement("span");
    barDot.className = "gly-dot";
    var brand = document.createElement("span");
    brand.className = "gly-brand";
    brand.appendChild(markSVG());
    barText = document.createElement("span");
    barText.textContent = "galley";
    brand.appendChild(barText);
    bar.appendChild(barDot);
    bar.appendChild(brand);
    document.body.appendChild(bar);
  }

  // The caret — the same mark that sits on the tab (favicon.svg) and the edit
  // bar (edit.html's .gly-mark). Built with createElementNS rather than an
  // innerHTML string: this file otherwise never writes raw markup, and the
  // rule ("no state lives here") extends naturally to "no HTML string
  // parsing here" either. Geometry (the path, the rect) is set here because
  // it never changes; colour is entirely overlay.css's (.gly-brand-mark-*),
  // so dark mode is one media query there rather than a second SVG here.
  function markSVG() {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "gly-brand-mark");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var baseline = document.createElementNS(NS, "rect");
    baseline.setAttribute("x", "6");
    baseline.setAttribute("y", "14");
    baseline.setAttribute("width", "52");
    baseline.setAttribute("height", "6");
    baseline.setAttribute("rx", "3");
    baseline.setAttribute("class", "gly-brand-mark-bar");
    var caret = document.createElementNS(NS, "path");
    caret.setAttribute("d", "M 14 54 L 32 26 L 50 54");
    caret.setAttribute("class", "gly-brand-mark-caret");
    svg.appendChild(baseline);
    svg.appendChild(caret);
    return svg;
  }

  // Poll the server's own projection timestamp. "Synced to a peer" and "on
  // disk" are different claims and the reviewer deserves the stronger one.
  function watchSaved() {
    setInterval(function () {
      fetch(API + "/saved")
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d.saved && d.saved !== lastSavedMs) {
            lastSavedMs = d.saved;
            paint();
          }
        })
        .catch(function () {});
    }, POLL_MS);
  }

  // The agent regenerates the page; the browser picks it up. Never while the
  // reviewer is mid-sentence.
  function watchPage() {
    var seen = null;
    setInterval(function () {
      fetch(API + "/rev")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (seen === null) {
            seen = data.rev;
            return;
          }
          if (data.rev === seen) return;
          if (document.activeElement && document.activeElement.tagName === "TEXTAREA") return;
          location.reload();
        })
        .catch(function () {});
    }, POLL_MS);
  }

  // Called by the Go module once its function surface is installed.
  window.galleyReady = function () {
    mount();
    window.galley.onChange(function (json) {
      try {
        snapshot = JSON.parse(json);
      } catch (e) {
        return;
      }
      paint();
    });
    fetch(API + "/room")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var proto = location.protocol === "https:" ? "wss:" : "ws:";
        window.galley.connect(proto + "//" + location.host + "/yjs/" + d.room);
        watchSaved();
        watchPage();
      })
      .catch(function (err) {
        console.error("galley: cannot reach the server", err);
      });
  };

  function boot() {
    if (typeof Go !== "function") {
      console.error("galley: wasm_exec.js did not load");
      return;
    }
    var go = new Go();
    WebAssembly.instantiateStreaming(fetch(API + "/galley.wasm"), go.importObject)
      .then(function (res) {
        go.run(res.instance); // blocks; galleyReady fires from inside
      })
      .catch(function (err) {
        console.error("galley: the wasm client failed to load", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
