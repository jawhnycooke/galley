package serve

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/schuettc/galley/internal/versions"
)

func post(t *testing.T, h http.Handler, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == nil {
		r = httptest.NewRequest(http.MethodPost, path, nil)
	} else {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r = httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	}
	r.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func rounds(t *testing.T, s *EditServer) []versions.Round {
	t.Helper()
	rs, err := s.Versions().List()
	if err != nil {
		t.Fatal(err)
	}
	return rs
}

func press(t *testing.T, s *EditServer, body string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/_galley/revise", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("Revise answered %d: %s", rec.Code, rec.Body.String())
	}
}

func commentAs(t *testing.T, s *EditServer, target, instruction string) {
	t.Helper()
	rec := post(t, s.Handler(), "/_galley/instruct", map[string]any{
		"op": "comment", "target": target, "text": instruction, "author": "court",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("instruction answered %d: %s", rec.Code, rec.Body.String())
	}
}

func newEditServer(t *testing.T, dir, name, content string) *EditServer {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := NewEdit(path)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
