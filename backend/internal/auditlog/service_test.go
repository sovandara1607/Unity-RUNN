package auditlog

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/google/uuid"
)

type fakeWriter struct {
	entries []Entry
	err     error
}

func (f *fakeWriter) Insert(ctx context.Context, e *Entry) error {
	if f.err != nil {
		return f.err
	}
	f.entries = append(f.entries, *e)
	return nil
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestService_Record_PersistsEntry(t *testing.T) {
	repo := &fakeWriter{}
	svc := NewService(repo, discardLogger())

	actorID := uuid.New()
	entityID := uuid.New()
	svc.Record(context.Background(), &actorID, "check_in_succeeded", "registration", &entityID, map[string]any{"foo": "bar"})

	if len(repo.entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(repo.entries))
	}
	e := repo.entries[0]
	if e.Action != "check_in_succeeded" || e.EntityType != "registration" {
		t.Errorf("entry = %+v, unexpected", e)
	}
	if e.ActorID == nil || *e.ActorID != actorID {
		t.Errorf("ActorID = %v, want %v", e.ActorID, actorID)
	}
}

func TestService_Record_WriteFailureDoesNotPanic(t *testing.T) {
	repo := &fakeWriter{err: context.DeadlineExceeded}
	svc := NewService(repo, discardLogger())

	// Should log and return, not panic or propagate.
	svc.Record(context.Background(), nil, "test_action", "test_entity", nil, nil)
}
