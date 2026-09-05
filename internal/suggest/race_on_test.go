//go:build race

package suggest

// raceEnabled is true when this test binary was built with -race. Its
// instrumentation overhead is substantial and uneven across machines, which
// makes a wall-clock performance budget unreliable under it — see
// TestAcceptAll_PerformanceOn400Suggestions.
const raceEnabled = true
