#!/bin/sh
# galley installer — installs the current release from GitHub Releases.
#
# Run as:
#   curl -fsSL https://raw.githubusercontent.com/jawhnycooke/galley/main/install.sh | sh
#
# Detects the platform, downloads the current release asset from the
# repository's GitHub Releases, verifies it against the release's
# checksums.txt, and installs galley onto a directory already on PATH. Every
# failure exits non-zero with a sentence saying what to do about it.
#
# The URL scheme is GitHub's own:
#   https://github.com/<repo>/releases/latest/download/galley_<os>_<arch>.tar.gz
#   https://github.com/<repo>/releases/download/v<version>/galley_<os>_<arch>.tar.gz
#   …/checksums.txt beside each (the `shasum -a 256` listing the release workflow
#   uploads; see .github/workflows/release.yml).
#
# Knobs, all optional:
#   GALLEY_REPO=owner/name       which repository's releases to install from
#   GALLEY_VERSION=X.Y.Z         pin an exact version (a leading v is stripped)
#   GALLEY_INSTALL_DIR=/some/bin where to put the binary (default /usr/local/bin)

set -eu

repo="${GALLEY_REPO:-jawhnycooke/galley}"
host="https://github.com/$repo/releases"

die() { printf 'galley: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required to install galley."
command -v tar  >/dev/null 2>&1 || die "tar is required to install galley."

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in
	darwin|linux) ;;
	*) die "galley runs on macOS and Linux; this machine reports '$os'." ;;
esac

case "$(uname -m)" in
	x86_64|amd64)  arch=amd64 ;;
	arm64|aarch64) arch=arm64 ;;
	*) die "galley runs on x86-64 and arm64; this machine reports '$(uname -m)'." ;;
esac

# Resolve the release: an explicit pin names a tag; otherwise GitHub's `latest`
# redirect picks the newest non-prerelease.
version="${GALLEY_VERSION:-}"
version="${version#v}"
if [ -n "$version" ]; then
	base="$host/download/v$version"
else
	base="$host/latest/download"
fi

asset="galley_${os}_${arch}.tar.gz"

tmp=$(mktemp -d) || die "could not create a temporary directory."
trap 'rm -rf "$tmp"' EXIT INT TERM

printf 'galley: downloading %s from %s\n' "$asset" "$repo"
curl -fsSL "$base/$asset" -o "$tmp/$asset" \
	|| die "download failed. Check your connection, or that $repo has a published release at https://github.com/$repo/releases."
curl -fsSL "$base/checksums.txt" -o "$tmp/checksums.txt" \
	|| die "could not fetch checksums.txt from the release; refusing to install an unverified binary."

# Verify before anything is unpacked. checksums.txt is `shasum -a 256` output
# for every asset (`<hex>  <name>`); keep only this asset's line and check it
# fail-closed.
grep " $asset\$" "$tmp/checksums.txt" > "$tmp/$asset.sha256" \
	|| die "checksums.txt on the release has no entry for $asset; refusing to install an unverified binary."
if command -v shasum >/dev/null 2>&1; then
	( cd "$tmp" && shasum -a 256 -c "$asset.sha256" >/dev/null 2>&1 ) || die "checksum did not match. The download is corrupt or has been tampered with; nothing was installed."
elif command -v sha256sum >/dev/null 2>&1; then
	( cd "$tmp" && sha256sum -c "$asset.sha256" >/dev/null 2>&1 ) || die "checksum did not match. The download is corrupt or has been tampered with; nothing was installed."
else
	die "neither shasum nor sha256sum is available; refusing to install an unverified binary."
fi

tar -xzf "$tmp/$asset" -C "$tmp" || die "could not unpack $asset."
[ -f "$tmp/galley" ] || die "$asset did not contain a galley binary."
chmod 755 "$tmp/galley"

# Install onto a directory that is already on PATH, so nothing has to be
# explained to the person afterwards. /usr/local/bin is on PATH on macOS and on
# every mainstream Linux; sudo is used only when it is not writable.
dir="${GALLEY_INSTALL_DIR:-/usr/local/bin}"
if [ -d "$dir" ] && [ -w "$dir" ]; then
	mv "$tmp/galley" "$dir/galley"
elif command -v sudo >/dev/null 2>&1; then
	printf 'galley: installing to %s (sudo)\n' "$dir"
	sudo mkdir -p "$dir" && sudo mv "$tmp/galley" "$dir/galley" && sudo chmod 755 "$dir/galley"
else
	die "$dir is not writable and sudo is unavailable. Re-run with GALLEY_INSTALL_DIR set to a directory on your PATH."
fi

printf 'galley: installed %s to %s\n' "$("$dir/galley" version)" "$dir/galley"
