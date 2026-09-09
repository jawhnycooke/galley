import type { AppShell } from './appshell.ts';
import { getJSON, postJSON } from './net.ts';
import type { WorkspaceDoc, WorkspaceView } from './wire.d.ts';

// THE DRAWER: this document's neighbours, and the way to one of them. One
// server still serves one document; the drawer asks it for the listing
// (GET /_galley/workspace) and, on a choice, for the URL of that document's
// editor (POST /_galley/workspace/open — attached to a running one, or
// started for the occasion), then navigates the tab there.
//
// It is CHROME, built once on `body` and never inside the editor mount:
// anything appended under `.ProseMirror` is parsed as prose and written to
// the file (menu.ts's rule). It adds no node, no mark, no decoration.
//
// ONE SURFACE, TWO ENTRANCES. The bar's path readout toggles it with the
// mouse; Cmd/Ctrl+K opens it with the filter focused for a reviewer who
// knows the filename. The palette is the drawer's own filter, not a second
// overlay with its own rows to keep in step.

const DRAWER_KEY = 'galley-drawer';
type DrawerState = 'open' | 'closed';

export interface DrawerUI {
  root: HTMLElement;
  filter: HTMLInputElement;
  list: HTMLElement;
  toggle: HTMLButtonElement;
  glyph: HTMLElement;
}

export function readDrawer(raw: string | null): DrawerState {
  return raw === 'open' ? 'open' : 'closed';
}
function storedDrawer(): DrawerState {
  try {
    return readDrawer(localStorage.getItem(DRAWER_KEY));
  } catch {
    return 'closed';
  }
}
function storeDrawer(s: DrawerState): void {
  try {
    localStorage.setItem(DRAWER_KEY, s);
  } catch {
    /* private mode: the choice lasts the page */
  }
}

export function drawerFilter(
  docs: WorkspaceDoc[],
  query: string,
): WorkspaceDoc[] {
  const q = query.trim().toLowerCase();
  return q ? docs.filter((d) => d.path.toLowerCase().includes(q)) : docs;
}

export function groupDocs(
  docs: WorkspaceDoc[],
): { folder: string; docs: WorkspaceDoc[] }[] {
  const groups = new Map<string, WorkspaceDoc[]>();
  for (const d of docs) {
    const i = d.path.lastIndexOf('/');
    const folder = i < 0 ? '.' : d.path.slice(0, i);
    (groups.get(folder) ?? groups.set(folder, []).get(folder)!).push(d);
  }
  // Folders in path order; the root's own files last, under "." — a docs
  // tree reads top-down and the loose files at its root are the footnote.
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '.' ? 1 : b === '.' ? -1 : a.localeCompare(b)))
    .map(([folder, docs]) => ({ folder, docs }));
}

export function stateLine(doc: WorkspaceDoc): string {
  if (!doc.rounds) return 'untouched';
  const reason = doc.last?.reason ?? '';
  const phrase =
    reason === 'landed'
      ? 'agent revised'
      : reason === 'verdict'
        ? 'settled'
        : reason;
  return `${doc.rounds} round${doc.rounds === 1 ? '' : 's'} · ${phrase}`;
}

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

// Replaces the state cell's text without disturbing a `.gly-dot` child —
// `chooseDoc` writes `starting…` and the failure sentence into the same
// cell a live neighbour's dot lives in, and a plain `.textContent =` wipes
// the dot along with the words.
function setStateText(state: Element, text: string): void {
  const dot = state.querySelector('.gly-dot');
  state.textContent = text;
  if (dot) state.prepend(dot);
}

export const drawerMethods = {
  makeDrawer(this: AppShell): DrawerUI {
    const root = document.createElement('aside');
    root.className = 'gly-drawer';
    root.hidden = true;
    root.setAttribute('aria-label', 'documents');
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.className = 'gly-drawer-filter';
    filter.placeholder = 'Open a document…';
    filter.setAttribute('aria-label', 'filter documents');
    const list = document.createElement('div');
    list.className = 'gly-drawer-list';
    root.append(filter, list);
    document.body.appendChild(root);

    // The bar's path is the toggle. The shell already renders it as a
    // button (edit.html); the glyph is a reserved span so the bar rule
    // holds — visibility flips, the box does not.
    const toggle = document.querySelector<HTMLButtonElement>('.gly-doc-path')!;
    const glyph = document.createElement('span');
    glyph.className = 'gly-drawer-glyph';
    glyph.textContent = '▾';
    toggle.appendChild(glyph);
    toggle.classList.add('gly-drawer-toggle');
    toggle.addEventListener('click', () => this.toggleDrawer());

    filter.addEventListener('input', () => this.paintDrawer());
    filter.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveDrawerFocus(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const row =
          list.querySelector<HTMLButtonElement>('.gly-drawer-row.is-focus') ??
          list.querySelector<HTMLButtonElement>(
            '.gly-drawer-row:not(.is-current)',
          );
        if (row?.dataset.path) void this.chooseDoc(row.dataset.path);
      }
    });
    return { root, filter, list, toggle, glyph };
  },

  // Opening reads the listing again: a neighbour opened from another tab has
  // a dot now, and the count decides whether the stored state is honoured.
  async loadWorkspace(this: AppShell): Promise<WorkspaceView | null> {
    const v = await getJSON<WorkspaceView>('/_galley/workspace');
    if (v) this.workspace = v;
    return v;
  },

  openDrawer(this: AppShell, focusFilter = false): void {
    this.drawerOpen = true;
    storeDrawer('open');
    void this.loadWorkspace()
      .then(() => this.paintDrawer())
      .catch(() => {});
    this.paintDrawer();
    if (focusFilter && this.drawer) {
      this.drawer.filter.focus();
      this.drawer.filter.select();
    }
  },
  closeDrawer(this: AppShell): void {
    this.drawerOpen = false;
    storeDrawer('closed');
    if (this.drawer) this.drawer.filter.value = '';
    this.paintDrawer();
  },
  toggleDrawer(this: AppShell): void {
    if (this.drawerOpen) this.closeDrawer();
    else this.openDrawer();
  },

  // On load: the hash (a navigation from another document's drawer) wins,
  // then the stored state — but only when there is something to list. With
  // one document the drawer starts closed whatever was stored.
  initDrawer(this: AppShell): void {
    // A failed fetch must not leave `#drawer` sitting in the URL forever —
    // the hash is cleared and the (empty) drawer painted either way.
    const settle = (v: WorkspaceView | null) => {
      const fromHash = location.hash === '#drawer';
      if (fromHash)
        history.replaceState(null, '', location.pathname + location.search);
      // `docs` is `WorkspaceDoc[] | null` on the wire, so the second `?.` is
      // load-bearing: a root with nothing in it serializes the slice as null.
      const many = (v?.docs?.length ?? 0) > 1;
      this.drawerOpen = fromHash || (many && storedDrawer() === 'open');
      this.paintDrawer();
    };
    void this.loadWorkspace()
      .then(settle)
      .catch(() => settle(null));
  },

  paintDrawer(this: AppShell): void {
    const ui = this.drawer;
    if (!ui) return;
    ui.root.hidden = !this.drawerOpen;
    ui.toggle.setAttribute('aria-expanded', String(this.drawerOpen));
    ui.glyph.classList.toggle('is-open', this.drawerOpen);
    if (!this.drawerOpen) return;
    const docs = drawerFilter(this.workspace?.docs ?? [], ui.filter.value);
    // Rebuilding the rows drops any `.is-focus` from a prior ArrowUp/Down —
    // on purpose, palette convention: a new query is a new list, so Enter
    // with no arrow press yet falls back to the first (non-current) row.
    ui.list.textContent = '';
    for (const g of groupDocs(docs)) {
      const eyebrow = document.createElement('div');
      eyebrow.className = 'gly-drawer-folder';
      eyebrow.textContent = g.folder === '.' ? '.' : g.folder + '/';
      ui.list.appendChild(eyebrow);
      for (const d of g.docs) ui.list.appendChild(this.drawerRow(d));
    }
    if (docs.length === 0) {
      const none = document.createElement('p');
      none.className = 'gly-drawer-none';
      none.textContent = this.workspace?.truncated
        ? 'no match in the first 2000 documents'
        : 'no match';
      ui.list.appendChild(none);
    }
  },

  drawerRow(this: AppShell, d: WorkspaceDoc): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'gly-drawer-row';
    row.dataset.path = d.path;
    if (d.current) {
      row.classList.add('is-current');
      row.disabled = true;
    }
    const name = document.createElement('span');
    name.className = 'gly-drawer-name';
    name.textContent = nameOf(d.path);
    const state = document.createElement('span');
    state.className = 'gly-drawer-state';
    if (d.url) {
      const dot = document.createElement('span');
      dot.className = 'gly-dot';
      state.appendChild(dot);
    }
    state.append(d.current ? 'this document' : stateLine(d));
    row.append(name, state);
    row.addEventListener('click', () => void this.chooseDoc(d.path));
    return row;
  },

  moveDrawerFocus(this: AppShell, step: number): void {
    const rows = [
      ...(this.drawer?.list.querySelectorAll<HTMLElement>(
        '.gly-drawer-row:not(.is-current)',
      ) ?? []),
    ];
    if (rows.length === 0) return;
    const i = rows.findIndex((r) => r.classList.contains('is-focus'));
    const next = rows[(i + step + rows.length) % rows.length];
    for (const r of rows) r.classList.toggle('is-focus', r === next);
    next.scrollIntoView({ block: 'nearest' });
  },

  // The choice: ask for the URL, then go. The row says what is happening —
  // `starting…` while a child comes up — and carries the server's sentence
  // if it could not, so the failure is beside the thing that was pressed.
  // postJSON hands back the raw Response (net.ts throws for nothing but a
  // dead connection), so the non-2xx sentence is read off the body here.
  async chooseDoc(this: AppShell, path: string): Promise<void> {
    const row = this.drawer?.list.querySelector<HTMLButtonElement>(
      `[data-path="${CSS.escape(path)}"]`,
    );
    const state = row?.querySelector('.gly-drawer-state');
    if (row) row.disabled = true;
    if (state) setStateText(state, 'starting…');
    try {
      const res = await postJSON('/_galley/workspace/open', { path });
      if (!res.ok)
        throw new Error((await res.text()).trim() || 'could not open');
      const { url } = (await res.json()) as { url: string };
      location.assign(url + '#drawer');
    } catch (e) {
      if (state)
        setStateText(state, e instanceof Error ? e.message : 'could not open');
      if (row) row.disabled = false;
    }
  },
};
