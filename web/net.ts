// net.ts — talking to the server, and nothing else.
//
// getJSON and postJSON are the whole of it: every mutation this editor makes
// goes through one of these two, and nothing else in the browser half issues a
// request. It cannot live in a mixin because entry.ts itself calls it — the
// constructor's own polling loop reaches for getJSON before any mixin is
// wired in.

// GENERIC, DEFAULTING TO `unknown` — a caller that names no `T` gets exactly
// the old signature back, so every existing untyped call site is unchanged.
// `VersionsPanelOptions.getJSON` (web/versions.ts) already declared its
// injected dependency as `<T>(path: string) => Promise<T>` and entry.ts
// passes this function to satisfy it — a mismatch invisible only because
// entry.ts is not yet typechecked (Task 8). A caller that DOES name `T` is
// trusting the endpoint's own wire contract, the same trust `getJSON<T>` in
// versions.ts already spends: `/_galley/*`'s shape is `wire.d.ts`'s or the
// Go handler's, checked at the boundary that generates that file, not by
// walking the JSON by hand a second time here.
function getJSON<T = unknown>(path: string): Promise<T | null> {
  return fetch(path, { headers: { Accept: 'application/json' } }).then((res) =>
    res.ok ? res.json() : null,
  );
}

function postJSON(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export { getJSON, postJSON };
