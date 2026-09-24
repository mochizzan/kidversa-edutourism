package handler

import (
	"context"
	"sort"
	"testing"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// fakeResolutionPhotoRepo is an in-memory PhotoRepository used to exercise the
// unexported resolveReportPhoto helper without a database (repo test convention).
// listCalls is observed to prove the fallback path is (not) taken.
type fakeResolutionPhotoRepo struct {
	photos    map[string]*entity.SmartPhoto
	tenantOf  map[string]string
	picks     map[string]entity.ReportPhotoPick
	listCalls int
}

func pickKey(participantID, sessionID, programStageID string) string {
	return participantID + "|" + sessionID + "|" + programStageID
}

func (f *fakeResolutionPhotoRepo) CreatePhoto(_ context.Context, p *entity.SmartPhoto) error {
	f.photos[p.ID] = p
	return nil
}

func (f *fakeResolutionPhotoRepo) GetPhotoByID(_ context.Context, id, tenantID string) (*entity.SmartPhoto, error) {
	p, ok := f.photos[id]
	if !ok {
		return nil, apperrors.NotFound("not_found", nil)
	}
	if tenantID != "" && f.tenantOf[id] != tenantID {
		return nil, apperrors.NotFound("not_found", nil)
	}
	clone := *p
	return &clone, nil
}

func (f *fakeResolutionPhotoRepo) ListPhotos(_ context.Context, filt repository.PhotoFilter, _, _ int) (*repository.Paginated[entity.SmartPhoto], error) {
	f.listCalls++
	out := make([]entity.SmartPhoto, 0, len(f.photos))
	for _, p := range f.photos {
		if filt.ParticipantID != "" && p.ParticipantID != filt.ParticipantID {
			continue
		}
		if filt.SessionID != "" && p.SessionID != filt.SessionID {
			continue
		}
		if filt.IsReportPhoto != nil && p.IsReportPhoto != *filt.IsReportPhoto {
			continue
		}
		out = append(out, *p)
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: out, Total: len(out)}, nil
}

func (f *fakeResolutionPhotoRepo) UpdatePhoto(_ context.Context, p *entity.SmartPhoto) error {
	f.photos[p.ID] = p
	return nil
}

func (f *fakeResolutionPhotoRepo) UpdatePhotoFields(context.Context, string, map[string]interface{}) error {
	return nil
}

func (f *fakeResolutionPhotoRepo) SetReportPhoto(context.Context, string, string, string) error {
	return nil
}

func (f *fakeResolutionPhotoRepo) DeletePhoto(_ context.Context, id string) error {
	delete(f.photos, id)
	return nil
}

func (f *fakeResolutionPhotoRepo) UpsertReportPhotoPick(_ context.Context, pick *entity.ReportPhotoPick) error {
	f.picks[pickKey(pick.ParticipantID, pick.SessionID, pick.ProgramStageID)] = *pick
	return nil
}

func (f *fakeResolutionPhotoRepo) GetReportPhotoPick(_ context.Context, participantID, sessionID, programStageID string) (*entity.ReportPhotoPick, error) {
	pick, ok := f.picks[pickKey(participantID, sessionID, programStageID)]
	if !ok {
		return nil, nil
	}
	return &pick, nil
}

func (f *fakeResolutionPhotoRepo) ListReportPhotoPicks(_ context.Context, participantID, sessionID string) ([]entity.ReportPhotoPick, error) {
	out := make([]entity.ReportPhotoPick, 0, len(f.picks))
	for _, pick := range f.picks {
		if pick.ParticipantID == participantID && pick.SessionID == sessionID {
			out = append(out, pick)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ProgramStageID < out[j].ProgramStageID })
	return out, nil
}

func (f *fakeResolutionPhotoRepo) DeleteReportPhotoPick(_ context.Context, participantID, sessionID, programStageID string) error {
	delete(f.picks, pickKey(participantID, sessionID, programStageID))
	return nil
}

// TestResolveReportPhoto pins the four resolution behaviours of the report
// photo helper (spec §4.1 / §5.4): an explicit pick wins over the
// is_report_photo default; a pick whose photo was deleted resolves to nil
// WITHOUT falling back (listCalls stays 0 — no dangling reference, no surprise
// default); with no pick row the session's exclusive default is the fallback;
// nothing resolvable yields nil.
func TestResolveReportPhoto(t *testing.T) {
	const (
		participantID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
		sessionID      = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		stageID        = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
		pickedPhotoID  = "11111111-1111-4111-8111-111111111111"
		defaultPhotoID = "22222222-2222-4222-8222-222222222222"
	)

	newPhoto := func(id string, isReportPhoto bool) *entity.SmartPhoto {
		p := &entity.SmartPhoto{IsReportPhoto: isReportPhoto}
		p.ID = id
		p.ParticipantID = participantID
		p.SessionID = sessionID
		return p
	}

	tests := []struct {
		name string
		// pickPhotoID non-empty means a pick row exists pointing at it.
		pickPhotoID   string
		photos        map[string]*entity.SmartPhoto
		wantID        string // "" = expect nil
		wantListCalls int
	}{
		{
			name:          "pick wins over is_report_photo default",
			pickPhotoID:   pickedPhotoID,
			photos:        map[string]*entity.SmartPhoto{pickedPhotoID: newPhoto(pickedPhotoID, false), defaultPhotoID: newPhoto(defaultPhotoID, true)},
			wantID:        pickedPhotoID,
			wantListCalls: 0,
		},
		{
			name:        "deleted pick photo resolves to nil without fallback",
			pickPhotoID: pickedPhotoID,
			// The default EXISTS here: a fallback would wrongly return it.
			photos:        map[string]*entity.SmartPhoto{defaultPhotoID: newPhoto(defaultPhotoID, true)},
			wantID:        "",
			wantListCalls: 0,
		},
		{
			name:          "no pick row falls back to is_report_photo",
			photos:        map[string]*entity.SmartPhoto{defaultPhotoID: newPhoto(defaultPhotoID, true)},
			wantID:        defaultPhotoID,
			wantListCalls: 1,
		},
		{
			name: "nothing resolves to nil",
			photos: map[string]*entity.SmartPhoto{
				defaultPhotoID: newPhoto(defaultPhotoID, false), // exists but not the default
			},
			wantID:        "",
			wantListCalls: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeResolutionPhotoRepo{
				photos:   tt.photos,
				tenantOf: map[string]string{},
				picks:    map[string]entity.ReportPhotoPick{},
			}
			if tt.pickPhotoID != "" {
				pick := entity.ReportPhotoPick{
					ParticipantID:  participantID,
					SessionID:      sessionID,
					ProgramStageID: stageID,
					PhotoID:        tt.pickPhotoID,
				}
				pick.ID = "pick-00000000-0000-4000-8000-000000000001"
				repo.picks[pickKey(participantID, sessionID, stageID)] = pick
			}

			got, err := resolveReportPhoto(context.Background(), repo, participantID, sessionID, stageID)
			if err != nil {
				t.Fatalf("resolveReportPhoto returned error: %v", err)
			}
			if tt.wantID == "" {
				if got != nil {
					t.Fatalf("expected nil photo, got id=%q", got.ID)
				}
			} else {
				if got == nil {
					t.Fatalf("expected photo %q, got nil", tt.wantID)
				}
				if got.ID != tt.wantID {
					t.Fatalf("expected photo %q, got %q", tt.wantID, got.ID)
				}
			}
			if repo.listCalls != tt.wantListCalls {
				t.Fatalf("ListPhotos called %d time(s), want %d (fallback must not run when a pick row exists)", repo.listCalls, tt.wantListCalls)
			}
		})
	}
}
