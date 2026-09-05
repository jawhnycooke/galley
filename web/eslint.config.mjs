// THE LINTER FOR web/, AND WHY IT IS THIS ONE.
//
// Go has had three static gates since the first commit — gofmt, go vet,
// golangci-lint — and no Go file reaches a commit without passing all three.
// web/ had none: 14,500 lines of browser client and 17,000 of harness with no
// format check and no linter, while the owner's framing is that this half is
// just as important as the Go one. This file is the linter half; .prettierrc
// and `just fmt-web-check` are the formatter half.
//
// WHY ESLINT. Three constraints decided it, and each was measured rather than
// assumed:
//
//   · IT MUST NOT COST MINUTES. The browser gates already do, and a check that
//     adds minutes to every commit gets resented and then disabled — this repo
//     has already watched four gates go dark. Measured over all 22 files and
//     31,000 lines: 0.71s wall. oxlint, the fast Rust alternative, was
//     installed and measured on the same tree at 0.53s — a difference of
//     0.18s, which at this size is not a difference at all. Speed was the one
//     argument that could have beaten the ecosystem-normal tool, and it does
//     not.
//
//   · IT MUST NOT FIGHT THE FORMATTER. ESLint 9 ships NO formatting rules —
//     they were removed from core, not merely discouraged — so there is no
//     rule here that can disagree with prettier about a line break or a quote.
//     No eslint-config-prettier, and nothing to keep in sync.
//
//   · IT MUST RUN IN THE CI JOB THAT ALREADY HAS NODE. It is a devDependency
//     of this package.json, pinned exactly like esbuild, typescript and
//     playwright-core, so `npm ci` in that job already installs it and there is
//     no second toolchain to provision. `just lint-web` is a pass-through to
//     the `lint` script here — the same shape `just types` has, for the same
//     reason.
//
// THE RULE SET IS SMALL AND EVERY RULE IS A DEFECT CLASS, NOT AN OPINION.
// `js.configs.recommended` is ~65 rules and would have been the easy import;
// it also carries no-empty, no-prototype-builtins and no-useless-escape, which
// report on shapes that are deliberate here and would make the gate noisy on
// its first day. A gate whose first output is a hundred things nobody intends
// to change is a gate that gets a blanket disable. So the list is explicit,
// and it is led by the two rules that name the two most expensive browser
// defects of the month:
//
//   · no-undef      — a ReferenceError on an undefined variable, in a bundle
//                     that had no compiler to catch it. `just types` catches
//                     this only in the files carrying `// @ts-check`, which is
//                     a handful; this catches it in all of them.
//   · no-unused-vars — a rename that silently broke two readers. The dead
//                     identifier left behind is the visible end of that, and
//                     it is the only cheap signal there is that a symbol lost
//                     its callers.
//
// The rest are the ones that are wrong in every codebase, cost nothing to
// check, and cannot be a matter of taste: an assignment to a const, a
// duplicate key or case or argument, code after a return, `typeof x ==
// "undefiend"`, `x !== NaN`, a self-comparison, a hole in an array literal, a
// `?.` whose result is immediately indexed. Adding a rule here should be an
// argument about a defect somebody actually shipped.
//
// TWO FILE GROUPS, AND THE GLOBALS ARE THE WHOLE REASON FOR THE SPLIT. `*.js`
// is the browser client — it is bundled into editor.js and runs in a page, so
// it gets browser globals and nothing else, which is what makes a stray
// `process` or `require` in it an error rather than a shrug. `*.mjs` is the
// harness, and it gets BOTH: those files are node programs, but every
// Playwright gate among them ships arrow functions into `page.evaluate`, where
// `document` and `window` are real. Splitting them the other way — node only —
// would report every one of those as undefined, and the fix would have been an
// eslintrc comment on top of each gate rather than a rule anybody believes.

import globals from 'globals';
import tseslint from 'typescript-eslint';

// The rules are identical for both groups; only the globals differ, and the
// list is spelled ONCE rather than copied — two copies of one rule set is the
// shape this repo has spent a fortnight deleting from the build and the
// product, and it would drift here for the same reason it drifts anywhere.
const rules = {
  'no-undef': 'error',
  // 'warn' AND A RATCHET THAT REACHED ZERO, WHICH IS WHAT A RATCHET IS FOR.
  //
  // This rule reported FIVE standing findings on the tree it was added to, and
  // the bound existed so a quality-stack change did not have to repair them in
  // the same breath: when a gate moves afterwards, nobody can say which half
  // did it. The five, and where each went:
  //
  //   typing.mjs:211 `SIDECAR`         a path computed and never read.
  //                                    Deleted with the collapse feature on
  //                                    2026-08-20; the bound came down 5 -> 4.
  //   probe.mjs:21   `Mark`            imported from @tiptap/core, unused
  //   probe.mjs:24   `Image`           imported, unused
  //   probe.mjs:137  `ARRIVAL_FADE_MS` imported from arrivals.ts, unused
  //   probe.mjs:138  `ARRIVAL_SUFFIX`  imported from arrivals.ts, unused
  //
  // The last four were deleted on 2026-08-21 by the dead-code sweep, and the
  // bound came down 4 -> 0 with them. That is the ratchet's own rule — "the
  // branch that clears these lowers the number with them" — fired twice, and
  // the second firing emptied it.
  //
  // SO THE BOUND IS ZERO NOW, and that is a stronger gate than it looks: with
  // no backlog left, any new unused variable is a red build on the commit that
  // introduces it, with nothing to hide behind. If a future change genuinely
  // needs a standing finding, raise the number AND name the finding here, the
  // way this comment has always done. A number raised without a name is how a
  // ratchet becomes a rubber stamp.
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  // `args: 'none'` — an unused PARAMETER is usually a signature being
  // honoured (a callback that ignores its second argument), not a defect, and
  // reporting it teaches people to rename things `_x`. `caughtErrors: 'none'`
  // for the same reason: `catch (e) {}` where the error genuinely does not
  // matter is a deliberate shape here. What is left is the case that earns the
  // rule — a binding nothing reads.
  'no-const-assign': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-sparse-arrays': 'error',
  'no-unreachable': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-fallthrough': 'error',
  // 'always', so `if ((x = f()))` — the deliberate spelling, with its own
  // parens — is allowed and a bare `if (x = f())` is not. The default option
  // only reports the bare form inside a conditional's test, which is narrower
  // than the mistake.
  'no-cond-assign': ['error', 'always'],
  'getter-return': 'error',
};

export default [
  {
    // node_modules is not reachable from the globs the `lint` script passes,
    // but the flat config's own default would walk into it if anyone ran
    // `eslint .`, and 14MB of dependencies is not this gate's population.
    ignores: ['node_modules/'],
  },
  // THE BROWSER CLIENT IS NOT LINTED HERE, AND THAT IS A STATED POSITION
  // RATHER THAN AN OMISSION.
  //
  // A `files: ['**/*.js']` block sat here and matched every module in web/.
  // All 28 are `.ts` now, so it matched nothing, and a rule that matches
  // nothing reads exactly like a rule that is working — the dead-declaration
  // shape this repo has an entry about. It is deleted rather than left.
  //
  // No `**/*.ts` block replaces it, because eslint cannot parse TypeScript
  // without @typescript-eslint's parser and plugin, and adding two
  // dependencies to re-check what `tsc --strict` already refuses is not a
  // trade worth making: no-undef, no-const-assign and the whole no-dupe-*
  // family are type errors now.
  //
  // ONE RULE WAS GENUINELY LOST, and it is restored where it can be —
  // `no-unused-vars` has no `strict` equivalent, so web/tsconfig.json turns
  // on `noUnusedLocals`, which is the same check by the tool that can still
  // see this code. Its own comment there records what it found on arrival.
  // THE BROWSER CLIENT, TYPE-AWARE. All 28 modules under web/ are TypeScript,
  // and until now eslint did not look at any of them — its only block matched
  // `**/*.js`, which stopped matching anything the day the conversion finished.
  // tsc covers a lot of what the base rules would (no-undef, no-const-assign,
  // the no-dupe-* family are all type errors), which is why this is TYPE-AWARE
  // rather than syntactic: it is here for the rules tsc genuinely cannot give.
  //
  // `no-floating-promises` is the one that earns the slower run on its own. An
  // unawaited promise swallows its own rejection — in a browser that is a
  // console line nobody sees and a surface left stale with no signal. This
  // project has already paid for exactly that: a ReferenceError inside
  // paintRounds went into a bare `.catch(() => {})` and the landing rail drew
  // its title and zero cards, with nothing anywhere saying why.
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      ...rules,
      // THE no-unsafe-* FAMILY IS OFF, and not because it is inconvenient.
      // Its 33 findings are all `any` arriving FROM VENDOR TYPES — TipTap's
      // and ProseMirror's .d.ts files hand back `any` in places, and it flows
      // one hop into our code at the call site. There is no `any` written in
      // this repository: `strict` is on, the rule is never/never/never, and
      // the whole tree contains ONE type assertion (entry.ts:455, a
      // documented vendor gap). Flagging code for a library's typing choices
      // asks for wrappers around every vendor call, which is a bigger and
      // worse change than the leak.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Declaration merging is how `interface App extends AppMethods {}` gives
      // the class its Object.assign'd mixins a type. It is the documented
      // mechanism, not an accident — see web/appshell.ts's header.
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      // `interface App extends AppMethods {}` again: an empty interface IS the
      // declaration-merging idiom, and there is no other spelling of it.
      '@typescript-eslint/no-empty-object-type': 'off',

      // 'warn' AND A RATCHET THAT REACHED ZERO, for the reason this file
      // already states about no-unused-vars: a gate that lands WITHOUT fixing
      // what it finds can be reviewed, and one that lands WITH the repairs
      // cannot — when a gate moves afterwards nobody can say which half did
      // it. SIXTEEN STANDING FINDINGS landed that way and were fixed on the
      // branch that lowered the bound with them, per this rule's own
      // requirement below. What each finding was, and where it went:
      //
      //   no-floating-promises  9   entry.ts:1002, entry.ts:1250,
      //                             history.ts:142, :183, :215, :228,
      //                             pending.ts:79, :256, verdict.ts:426
      //     Each was a `this.refreshPending()` or similar whose rejection had
      //     nowhere to go. pending.ts:79 was the one genuine bug among them —
      //     `this.refreshPending()` sat inside a `.then` already followed by
      //     a `.catch(() => {})` that LOOKED like it covered it and did not,
      //     because the inner promise was never returned into the chain; it
      //     now is. Every other site is fire-and-forget by design (a
      //     constructor's first paint, a background count, a UI refresh that
      //     already bottoms out in versions.ts's own bare
      //     `.catch(() => {})`) and is marked `void` with a comment saying
      //     what the reviewer sees on a failure and why that is tolerable.
      //
      //   no-misused-promises   4   versions.ts:568, :601, :992, :997
      //     An async-returning method passed where a listener's `void` return
      //     was expected (`pickView`, `restore`, `openRound`, `allRounds`) —
      //     wrapped in a block that `void`s the call, since each already
      //     bottoms out in a `.catch` (its own or `load()`'s).
      //
      //   no-base-to-string     2   heading.ts:28, rail.ts:535
      //     A value interpolated into a template whose toString is Object's,
      //     which prints "[object Object]" into something a person reads.
      //     Both were `unknown` coerced through `String()` without checking
      //     it was actually a string or number first; both now name the real
      //     shape (TipTap's attrs, a DOM element's tagName) and skip the
      //     coercion entirely when it isn't one.
      //
      //   unbound-method        1   suggestions.ts:983
      //     `onDocumentClick` was a class method manually `.bind()`'d back
      //     onto the instance in the constructor — correct at runtime, but
      //     invisible to the type the checker sees for a bare method
      //     reference. It is an arrow class field now, bound by construction,
      //     and the manual bind is gone.
      //
      // THE BOUND IS 16, AND IT WAS PREDICTED BEFORE IT WAS TRUE. On the
      // branch that added these rules the script said 20 — these sixteen plus
      // four unused imports in probe.mjs that no-unused-vars still reported
      // there — with a note that the dead-code sweep would remove those four,
      // take its own bound to 0, and leave exactly 16 when the two landed
      // together. They landed, and it was 16. Had it been anything else, one
      // of the two branches had not done what it said.
      //
      // THE BOUND IS ZERO NOW, for the reason no-unused-vars' own is: with no
      // backlog left, a new floating promise, misused promise, stringified
      // object or unbound method is a red build on the commit that
      // introduces it, with nothing to hide behind. If a future change
      // genuinely needs a standing finding, raise the number AND name the
      // finding here, the way this comment has always done. A number raised
      // without a name is how a ratchet becomes a rubber stamp.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
    },
  },

  {
    // The harness. node + browser, for the `page.evaluate` reason above.
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules,
  },
];
