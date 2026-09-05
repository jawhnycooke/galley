// Package version carries the build stamp. The justfile and the release
// workflow both set these via -ldflags -X, so a local build and a release
// build report the same thing.
package version

var (
	version = "dev"
	commit  = "none"
	date    = ""
)

// Version returns the semantic version this binary was stamped with.
func Version() string { return version }

// Commit returns the short commit this binary was built from.
func Commit() string { return commit }

// Date returns the YYYY-MM-DD the binary was built, or "" for a raw
// `go build`. The licensing gate treats "" as "inside every update window":
// someone building from source is already past the honor line the stamp
// enforces.
func Date() string { return date }

// String renders the full build stamp.
func String() string {
	if date == "" {
		return version + " (" + commit + ")"
	}
	return version + " (" + commit + ", " + date + ")"
}
