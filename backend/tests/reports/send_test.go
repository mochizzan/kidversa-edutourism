package reports_test

import (
	"context"
	"strings"
	"testing"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/usecase/reports"
)

// fakeReportRepo is a minimal in-memory ReportRepository: Send only reads one
// report and persists it via Update.
type fakeReportRepo struct {
	repository.ReportRepository
	report  *entity.Report
	updates []*entity.Report
	getErr  error
}

func (f *fakeReportRepo) GetByID(ctx context.Context, id, tenantID string) (*entity.Report, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	return f.report, nil
}

func (f *fakeReportRepo) Update(ctx context.Context, r *entity.Report) error {
	snapshot := *r
	f.updates = append(f.updates, &snapshot)
	f.report = r
	return nil
}

// fakeSessionRepo supplies the participant (recipient) and the session (name)
// that Send needs; other methods panic if touched (embedded nil interface).
type fakeSessionRepo struct {
	repository.SessionRepository
	participant *entity.Participant
	session     *entity.Session
}

func (f *fakeSessionRepo) GetParticipantByID(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	return f.participant, nil
}

func (f *fakeSessionRepo) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	return f.session, nil
}

// recordingMessenger captures what the report flow actually hands to WhatsApp.
type recordingMessenger struct {
	calls   []sentMessage
	sendErr error
}

type sentMessage struct {
	chatID string
	text   string
}

func (m *recordingMessenger) SendTextMessage(ctx context.Context, chatID, text string) error {
	m.calls = append(m.calls, sentMessage{chatID: chatID, text: text})
	return m.sendErr
}

const (
	testTenantID = "tenant-1"
	testReportID = "report-1"
	testBaseURL  = "http://localhost:8002/parent/report"
)

func newSendFixture(messenger repository.MessagingService) (*reports.Usecase, *fakeReportRepo, *fakeSessionRepo) {
	reportRepo := &fakeReportRepo{
		report: &entity.Report{
			ParticipantID: "participant-1",
			SessionID:     "session-1",
			Status:        entity.ReportApproved,
		},
	}
	sessionRepo := &fakeSessionRepo{
		participant: &entity.Participant{
			ChildName:   "Budi Santoso",
			ParentName:  "Ibu Sari",
			ParentPhone: "+62 812-3456-7890",
		},
		session: &entity.Session{Name: "Petualangan Sains"},
	}
	cfg := &config.Config{ParentReportBaseURL: testBaseURL}
	uc := reports.NewUsecase(reportRepo, nil, nil, nil, nil, sessionRepo, nil, nil, nil, nil, nil, cfg, messenger, nil, nil)
	return uc, reportRepo, sessionRepo
}

func requireAppErrorCode(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error %q, got nil", want)
	}
	if _, code, ok := apperrors.AsAppError(err); !ok || code != want {
		t.Fatalf("expected error code %q, got %v", want, err)
	}
}

// TestSendDeliversReportWhatsApp is the feedback loop for the reported bug:
// POST /api/reports/:id/send must hand the parent a WhatsApp message
// (chat id + link), not only flip the DB status.
func TestSendDeliversReportWhatsApp(t *testing.T) {
	messenger := &recordingMessenger{}
	uc, reportRepo, _ := newSendFixture(messenger)

	r, err := uc.Send(context.Background(), testReportID, testTenantID, 168)
	if err != nil {
		t.Fatalf("Send() error: %v", err)
	}

	if len(messenger.calls) != 1 {
		t.Fatalf("expected exactly 1 WhatsApp send, got %d", len(messenger.calls))
	}
	call := messenger.calls[0]
	if call.chatID != "6281234567890@c.us" {
		t.Errorf("chat id = %q, want %q", call.chatID, "6281234567890@c.us")
	}
	if !strings.Contains(call.text, "Budi Santoso") {
		t.Errorf("message must address the child, got %q", call.text)
	}
	if r.ParentAccessToken == "" {
		t.Fatal("expected a freshly minted parent access token")
	}
	wantLink := testBaseURL + "?token=" + r.ParentAccessToken
	if !strings.Contains(call.text, wantLink) {
		t.Errorf("message must contain report link %q, got %q", wantLink, call.text)
	}

	// Sent only after the gateway confirmed success.
	if r.Status != entity.ReportSent {
		t.Errorf("status = %q, want SENT", r.Status)
	}
	if r.SentAt == nil {
		t.Error("sent_at must be set on success")
	}
	last := reportRepo.updates[len(reportRepo.updates)-1]
	if last.Status != entity.ReportSent {
		t.Errorf("persisted status = %q, want SENT", last.Status)
	}
}

// TestSendGatewayFailureDoesNotMarkSent: a failed WhatsApp delivery must be
// recorded as a retryable failure, never as SENT.
func TestSendGatewayFailureDoesNotMarkSent(t *testing.T) {
	messenger := &recordingMessenger{sendErr: context.DeadlineExceeded}
	uc, reportRepo, _ := newSendFixture(messenger)

	_, err := uc.Send(context.Background(), testReportID, testTenantID, 168)

	if len(messenger.calls) != 1 {
		t.Fatalf("expected the send to be attempted, got %d calls", len(messenger.calls))
	}
	requireAppErrorCode(t, err, "whatsapp_send_failed")

	last := reportRepo.updates[len(reportRepo.updates)-1]
	if last.Status == entity.ReportSent {
		t.Errorf("status = SENT although the gateway failed; want a failure status")
	}
	if last.Status != entity.ReportSendFailed {
		t.Errorf("persisted status = %q, want SEND_FAILED", last.Status)
	}
	if last.SentAt != nil {
		t.Error("sent_at must stay unset when delivery fails")
	}
}

// TestSendMissingPhoneMarksSendFailed: no reachable number → recorded failure
// with a distinct code so the admin knows what to fix before retrying.
func TestSendMissingPhoneMarksSendFailed(t *testing.T) {
	messenger := &recordingMessenger{}
	uc, reportRepo, sessionRepo := newSendFixture(messenger)
	sessionRepo.participant.ParentPhone = ""

	_, err := uc.Send(context.Background(), testReportID, testTenantID, 168)

	requireAppErrorCode(t, err, "whatsapp_number_missing")
	if len(messenger.calls) != 0 {
		t.Errorf("expected no gateway call without a phone number, got %d", len(messenger.calls))
	}
	last := reportRepo.updates[len(reportRepo.updates)-1]
	if last.Status != entity.ReportSendFailed {
		t.Errorf("persisted status = %q, want SEND_FAILED", last.Status)
	}
}
