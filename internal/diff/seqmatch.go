package diff

// seqmatch is a faithful port of CPython's difflib.SequenceMatcher with
// isjunk=None and autojunk=False — the exact matcher the spike measured with.
//
// IT IS NOT A MYERS DIFF AND MUST NOT BE REPLACED BY ONE. SequenceMatcher is
// Ratcliff/Obershelp: it finds the longest matching block in a range, recurses
// left and right of it, and never looks for a globally minimal edit script. A
// Myers diff over the same input returns a different — often smaller —
// opcode list, and every number in the spec (1,001 word fragments, 552
// sentence-level regions, "more than three pieces") is a COUNT OF OPCODES.
// Swapping the matcher moves the threshold rule's own measurement out from
// under it, silently: the code still runs, the diff still reads, and the one
// decision the spike made — pieces, not similarity, and three of them — is
// being enforced against a distribution nobody measured.
//
// The port is at the level of the algorithm, not of the text: b2j, the
// j2len sweep, the queue-driven recursion and the adjacent-block collapse are
// all reproduced step for step, because the opcode list depends on every one of
// them. Junk handling is deliberately ABSENT rather than stubbed — isjunk=None
// and autojunk=False make bjunk and bpopular empty, so the two junk extension
// loops in find_longest_match can never fire, and writing them as dead code
// would be writing code no test could reach.

// Match is one matching block: a[A:A+Size] == b[B:B+Size].
type Match struct {
	A, B, Size int
}

// OpTag is one of the four opcode tags difflib emits.
type OpTag string

const (
	TagEqual   OpTag = "equal"
	TagReplace OpTag = "replace"
	TagDelete  OpTag = "delete"
	TagInsert  OpTag = "insert"
)

// Opcode is one entry of get_opcodes(): a[I1:I2] and b[J1:J2] under Tag.
type Opcode struct {
	Tag            OpTag
	I1, I2, J1, J2 int
}

// matcher holds the two sequences and b's index, built once per pair.
type matcher struct {
	a, b []string
	b2j  map[string][]int
}

func newMatcher(a, b []string) *matcher {
	m := &matcher{a: a, b: b, b2j: make(map[string][]int, len(b))}
	for i, e := range b {
		m.b2j[e] = append(m.b2j[e], i)
	}
	return m
}

// findLongestMatch is difflib's find_longest_match over a[alo:ahi] and
// b[blo:bhi].
//
// The tie-break is load-bearing and is difflib's own: of all maximal matching
// blocks it returns the one that starts EARLIEST in a, and of those the one
// that starts earliest in b. That is why `>` and not `>=` compares against
// bestsize, and why the sweep runs i outward from alo.
func (m *matcher) findLongestMatch(alo, ahi, blo, bhi int) Match {
	besti, bestj, bestsize := alo, blo, 0
	j2len := map[int]int{}
	for i := alo; i < ahi; i++ {
		newj2len := map[int]int{}
		for _, j := range m.b2j[m.a[i]] {
			if j < blo {
				continue
			}
			if j >= bhi {
				break
			}
			k := j2len[j-1] + 1
			newj2len[j] = k
			if k > bestsize {
				besti, bestj, bestsize = i-k+1, j-k+1, k
			}
		}
		j2len = newj2len
	}
	// The non-junk extensions. Their junk twins below them in CPython cannot
	// fire here — see the header.
	for besti > alo && bestj > blo && m.a[besti-1] == m.b[bestj-1] {
		besti, bestj, bestsize = besti-1, bestj-1, bestsize+1
	}
	for besti+bestsize < ahi && bestj+bestsize < bhi &&
		m.a[besti+bestsize] == m.b[bestj+bestsize] {
		bestsize++
	}
	return Match{A: besti, B: bestj, Size: bestsize}
}

// matchingBlocks is difflib's get_matching_blocks: the recursion, the sort, the
// collapse of adjacent blocks, and the (len(a), len(b), 0) sentinel at the end.
func (m *matcher) matchingBlocks() []Match {
	la, lb := len(m.a), len(m.b)
	type span struct{ alo, ahi, blo, bhi int }
	queue := []span{{0, la, 0, lb}}
	var blocks []Match
	for len(queue) > 0 {
		q := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		x := m.findLongestMatch(q.alo, q.ahi, q.blo, q.bhi)
		if x.Size > 0 {
			blocks = append(blocks, x)
			if q.alo < x.A && q.blo < x.B {
				queue = append(queue, span{q.alo, x.A, q.blo, x.B})
			}
			if x.A+x.Size < q.ahi && x.B+x.Size < q.bhi {
				queue = append(queue, span{x.A + x.Size, q.ahi, x.B + x.Size, q.bhi})
			}
		}
	}
	sortMatches(blocks)

	var out []Match
	var i1, j1, k1 int
	for _, b := range blocks {
		if i1+k1 == b.A && j1+k1 == b.B {
			k1 += b.Size
			continue
		}
		if k1 > 0 {
			out = append(out, Match{i1, j1, k1})
		}
		i1, j1, k1 = b.A, b.B, b.Size
	}
	if k1 > 0 {
		out = append(out, Match{i1, j1, k1})
	}
	return append(out, Match{la, lb, 0})
}

// sortMatches orders blocks the way Python's list.sort orders 3-tuples.
// Insertion sort: the lists are short and this keeps the comparison explicit.
func sortMatches(ms []Match) {
	for i := 1; i < len(ms); i++ {
		v := ms[i]
		j := i - 1
		for j >= 0 && lessMatch(v, ms[j]) {
			ms[j+1] = ms[j]
			j--
		}
		ms[j+1] = v
	}
}

func lessMatch(x, y Match) bool {
	if x.A != y.A {
		return x.A < y.A
	}
	if x.B != y.B {
		return x.B < y.B
	}
	return x.Size < y.Size
}

// opcodes is difflib's get_opcodes.
func (m *matcher) opcodes() []Opcode {
	var out []Opcode
	i, j := 0, 0
	for _, b := range m.matchingBlocks() {
		var tag OpTag
		switch {
		case i < b.A && j < b.B:
			tag = TagReplace
		case i < b.A:
			tag = TagDelete
		case j < b.B:
			tag = TagInsert
		}
		if tag != "" {
			out = append(out, Opcode{tag, i, b.A, j, b.B})
		}
		i, j = b.A+b.Size, b.B+b.Size
		if b.Size > 0 {
			out = append(out, Opcode{TagEqual, b.A, i, b.B, j})
		}
	}
	return out
}

// ratioOf is difflib's ratio(): 2*M/T over the matching blocks, and 1.0 for two
// empty sequences — the same degenerate answer difflib gives, because
// _calculate_ratio returns 1.0 when the total length is zero.
func (m *matcher) ratioOf() float64 {
	matches := 0
	for _, b := range m.matchingBlocks() {
		matches += b.Size
	}
	total := len(m.a) + len(m.b)
	if total == 0 {
		return 1.0
	}
	return 2.0 * float64(matches) / float64(total)
}

// Opcodes returns difflib's opcode list for two token sequences.
func Opcodes(a, b []string) []Opcode { return newMatcher(a, b).opcodes() }

// SeqRatio returns difflib's ratio for two token sequences.
func SeqRatio(a, b []string) float64 { return newMatcher(a, b).ratioOf() }
