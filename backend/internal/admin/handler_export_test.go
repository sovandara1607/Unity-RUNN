package admin

import (
	"context"
	"encoding/csv"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/registrations"
)

type exportRegistrationReader struct {
	rows    []registrations.Registration
	filters []registrations.AdminListFilter
}

func (f *exportRegistrationReader) ListAll(_ context.Context, filter registrations.AdminListFilter) ([]registrations.Registration, int, error) {
	f.filters = append(f.filters, filter)
	start := filter.Offset
	if start > len(f.rows) {
		start = len(f.rows)
	}
	end := start + filter.Limit
	if end > len(f.rows) {
		end = len(f.rows)
	}
	return f.rows[start:end], len(f.rows), nil
}
func (f *exportRegistrationReader) GetByID(context.Context, uuid.UUID, auth.Role, uuid.UUID) (*registrations.Registration, error) {
	return nil, registrations.ErrNotFound
}

func TestExportRegistrationsIncludesAllPagesAndNeutralizesFormulas(t *testing.T) {
	eventID := uuid.New()
	rows := make([]registrations.Registration, 1001)
	for i := range rows {
		rows[i] = registrations.Registration{RegistrationNumber: "URC-1", FullName: "Runner", Email: "runner@example.com", EventID: eventID, EventName: "City Run", CategoryName: "10K", Status: registrations.StatusConfirmed, CreatedAt: time.Date(2026, 8, 29, 8, 0, 0, 0, time.UTC)}
	}
	rows[0].FullName = "=HYPERLINK(\"https://example.com\")"
	reader := &exportRegistrationReader{rows: rows}
	handler := NewHandler(reader, nil, nil, nil)
	req := httptest.NewRequest("GET", "/api/v1/admin/registrations/export.csv?event_id="+eventID.String()+"&status=CONFIRMED&search=runner", nil)
	res := httptest.NewRecorder()
	handler.ExportRegistrations(res, req)
	if res.Code != 200 {
		t.Fatalf("status = %d, body = %s", res.Code, res.Body.String())
	}
	if len(reader.filters) != 2 {
		t.Fatalf("ListAll calls = %d, want 2", len(reader.filters))
	}
	if reader.filters[0].EventID == nil || *reader.filters[0].EventID != eventID || reader.filters[0].Search != "runner" {
		t.Fatalf("filter = %#v", reader.filters[0])
	}
	if got := res.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/csv") {
		t.Fatalf("content type = %q", got)
	}
	body := strings.TrimPrefix(res.Body.String(), "\xEF\xBB\xBF")
	records, err := csv.NewReader(strings.NewReader(body)).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1002 {
		t.Fatalf("CSV rows = %d, want 1002", len(records))
	}
	if records[1][1] != "'=HYPERLINK(\"https://example.com\")" {
		t.Fatalf("unsafe cell = %q", records[1][1])
	}
}

func TestCSVSafe(t *testing.T) {
	for input, want := range map[string]string{"+855123": "'+855123", "  @SUM(A1)": "'  @SUM(A1)", "runner": "runner", "\x00name": "name"} {
		if got := csvSafe(input); got != want {
			t.Errorf("csvSafe(%q) = %q, want %q", input, got, want)
		}
	}
}
