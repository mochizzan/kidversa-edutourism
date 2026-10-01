package handler

import (
	"context"
	"errors"
	"sort"
	"testing"
	"time"

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
	// listErr, when set, fails ListPhotos for the calls whose filter matches —
	// used to prove a repo failure surfaces as an error (never as a silent
	// nil/placeholder). Called AFTER listCalls is incremented.
	listErr func(filt repository.PhotoFilter) error
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

func (f *fakeResolutionPhotoRepo) ListPhotos(_ context.Context, filt repository.PhotoFilter, page, limit int) (*repository.Paginated[entity.SmartPhoto], error) {
	f.listCalls++
	if f.listErr != nil {
		if err := f.listErr(filt); err != nil {
			return nil, err
		}
	}
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
	// Mirror GormPhotoRepository.ListPhotos: created_at DESC, taken_at DESC,
	// id DESC, then page/limit — so limit=1 observes the newest row like SQL.
	sort.Slice(out, func(i, j int) bool {
		if !out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].CreatedAt.After(out[j].CreatedAt)
		}
		if !out[i].TakenAt.Equal(out[j].TakenAt) {
			return out[i].TakenAt.After(out[j].TakenAt)
		}
		return out[i].ID > out[j].ID
	})
	total := len(out)
	if page < 1 {
		page = 1
	}
	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := total
	if limit > 0 && start+limit < end {
		end = start + limit
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: out[start:end], Total: total}, nil
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

// TestResolveReportPhoto pins the two-tier resolution of the base helper
// (spec §4.1): an explicit pick whose photo still exists wins over the
// is_report_photo default; a pick whose photo was deleted falls through to the
// is_report_photo default (foto rapor must replace the mini-raport placeholder
// — no dangling reference, no stale nil); with no pick row the session's
// exclusive default is the fallback; nothing resolvable yields nil. This is
// also the public gallery's report_photo computation — it intentionally has
// NO tier-3 gallery fallback (see TestResolveReportPhotoWithFallback).
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
			name:        "deleted pick photo falls back to is_report_photo",
			pickPhotoID: pickedPhotoID,
			// Pick's photo is gone; the flagged default exists → foto rapor
			// menggantikan placeholder (spec §4.1), so the list fallback runs.
			photos:        map[string]*entity.SmartPhoto{defaultPhotoID: newPhoto(defaultPhotoID, true)},
			wantID:        defaultPhotoID,
			wantListCalls: 1,
		},
		{
			name:        "deleted pick photo without flagged default → nil (gallery two-tier; report route would try tier 3)",
			pickPhotoID: pickedPhotoID,
			// Nothing flagged to fall back to → nil after the fallback attempt.
			photos:        map[string]*entity.SmartPhoto{defaultPhotoID: newPhoto(defaultPhotoID, false)},
			wantID:        "",
			wantListCalls: 1,
		},
		{
			name:          "no pick row falls back to is_report_photo",
			photos:        map[string]*entity.SmartPhoto{defaultPhotoID: newPhoto(defaultPhotoID, true)},
			wantID:        defaultPhotoID,
			wantListCalls: 1,
		},
		{
			name: "no report photo resolves → nil (gallery two-tier: a plain gallery photo is NOT tier 3 here)",
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
				t.Fatalf("ListPhotos called %d time(s), want %d", repo.listCalls, tt.wantListCalls)
			}
		})
	}
}

// TestResolveReportPhotoWithFallback pins the Fase-2 three-tier contract used
// by the parent mini-raport routes (GetByAccessToken/GetAccessPhoto):
//  1. an explicit pick wins over everything (never the fallback);
//  2. the is_report_photo flag wins over a newer plain gallery photo;
//  3. with neither, the participant's newest gallery photo is used
//     (created_at DESC, tie-break taken_at lalu id — ListPhotos ordering);
//  4. nothing at all → nil → mini-raport placeholder.
//
// The fallback never crosses participants, and the two-tier gallery helper
// above is untouched (its own test still pins nil for case 3's photos).
func TestResolveReportPhotoWithFallback(t *testing.T) {
	const (
		participantID      = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
		otherParticipantID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
		sessionID          = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		stageID            = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
		pickedPhotoID      = "11111111-1111-4111-8111-111111111111"
		flaggedPhotoID     = "22222222-2222-4222-8222-222222222222"
		olderPhotoID       = "33333333-3333-4333-8333-333333333333"
		newestPhotoID      = "44444444-4444-4444-8444-444444444444"
		otherOwnerPhotoID  = "55555555-5555-4555-8555-555555555555"
		tieTakenLowID      = "66666666-6666-4666-8666-666666666666"
		tieTakenHighID     = "77777777-7777-4777-8777-777777777777"
		tieIDLow           = "00000000-0000-4000-8000-000000000000"
		tieIDHigh          = "ffffffff-ffff-4fff-8fff-ffffffffffff"
	)

	var (
		older  = time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
		flagT  = time.Date(2026, 10, 1, 10, 0, 0, 0, time.UTC)
		newest = time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
		later  = time.Date(2026, 10, 1, 13, 0, 0, 0, time.UTC)
	)

	newPhoto := func(id, owner string, isReport bool, createdAt, takenAt time.Time) *entity.SmartPhoto {
		p := &entity.SmartPhoto{IsReportPhoto: isReport, TakenAt: takenAt}
		p.ID = id
		p.ParticipantID = owner
		p.SessionID = sessionID
		p.CreatedAt = createdAt
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
			name:        "1. pick wins over flag and a newer gallery photo",
			pickPhotoID: pickedPhotoID,
			photos: map[string]*entity.SmartPhoto{
				pickedPhotoID:  newPhoto(pickedPhotoID, participantID, false, older, older),
				flaggedPhotoID: newPhoto(flaggedPhotoID, participantID, true, flagT, flagT),
				newestPhotoID:  newPhoto(newestPhotoID, participantID, false, newest, newest),
			},
			wantID:        pickedPhotoID,
			wantListCalls: 0,
		},
		{
			name:        "1. pick deleted → flag wins over a newer gallery photo",
			pickPhotoID: pickedPhotoID, // picked photo itself is absent from photos
			photos: map[string]*entity.SmartPhoto{
				flaggedPhotoID: newPhoto(flaggedPhotoID, participantID, true, older, older),
				newestPhotoID:  newPhoto(newestPhotoID, participantID, false, newest, newest),
			},
			wantID:        flaggedPhotoID,
			wantListCalls: 1,
		},
		{
			name: "1. no pick + flag beats an unflagged photo even without tier 3",
			photos: map[string]*entity.SmartPhoto{
				flaggedPhotoID: newPhoto(flaggedPhotoID, participantID, true, older, older),
				newestPhotoID:  newPhoto(newestPhotoID, participantID, false, newest, newest),
			},
			wantID:        flaggedPhotoID,
			wantListCalls: 1,
		},
		{
			name: "2. no report photo → newest gallery photo of the participant",
			photos: map[string]*entity.SmartPhoto{
				olderPhotoID:  newPhoto(olderPhotoID, participantID, false, older, older),
				newestPhotoID: newPhoto(newestPhotoID, participantID, false, newest, newest),
				// A newer photo of ANOTHER participant in the same session must not win.
				otherOwnerPhotoID: newPhoto(otherOwnerPhotoID, otherParticipantID, false, later, later),
			},
			wantID:        newestPhotoID,
			wantListCalls: 2,
		},
		{
			name: "2. created_at identical → tie-break taken_at",
			photos: map[string]*entity.SmartPhoto{
				tieTakenLowID:  newPhoto(tieTakenLowID, participantID, false, flagT, older),
				tieTakenHighID: newPhoto(tieTakenHighID, participantID, false, flagT, newest),
			},
			wantID:        tieTakenHighID,
			wantListCalls: 2,
		},
		{
			name: "2. created_at + taken_at identical → tie-break id DESC",
			photos: map[string]*entity.SmartPhoto{
				tieIDLow:  newPhoto(tieIDLow, participantID, false, flagT, flagT),
				tieIDHigh: newPhoto(tieIDHigh, participantID, false, flagT, flagT),
			},
			wantID:        tieIDHigh,
			wantListCalls: 2,
		},
		{
			name:          "3. empty gallery → nil (placeholder)",
			photos:        map[string]*entity.SmartPhoto{},
			wantID:        "",
			wantListCalls: 2,
		},
		{
			name: "3. only another participant's photos → nil (participant filter)",
			photos: map[string]*entity.SmartPhoto{
				otherOwnerPhotoID: newPhoto(otherOwnerPhotoID, otherParticipantID, false, newest, newest),
			},
			wantID:        "",
			wantListCalls: 2,
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
				pick.ID = "pick-00000000-0000-4000-8000-000000000002"
				repo.picks[pickKey(participantID, sessionID, stageID)] = pick
			}

			got, err := resolveReportPhotoWithFallback(context.Background(), repo, participantID, sessionID, stageID)
			if err != nil {
				t.Fatalf("resolveReportPhotoWithFallback returned error: %v", err)
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
				t.Fatalf("ListPhotos called %d time(s), want %d", repo.listCalls, tt.wantListCalls)
			}
		})
	}
}

// TestResolveReportPhotoWithFallback_RepoErrorIsLoud pins the no-silent-error
// rule of the fallback: a ListPhotos FAILURE (as opposed to an empty page) is
// returned as an error — never converted into (nil, nil), which would render
// the placeholder as if the gallery were simply empty. The handler logs the
// cause (phase7_common.go) before middleware.ErrorHandler maps it to the
// generic internal_error envelope.
func TestResolveReportPhotoWithFallback_RepoErrorIsLoud(t *testing.T) {
	const (
		participantID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
		sessionID     = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		stageID       = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	)

	boom := errors.New("database connection lost")

	tests := []struct {
		name string
		// failUnscoped scopes the failure to the tier-3 gallery query (that
		// call carries no IsReportPhoto filter); otherwise the first,
		// flagged-photo ListPhotos call fails.
		failUnscoped bool
		wantCalls    int
	}{
		{
			name:      "tier 2 (is_report_photo query) fails → error, not silent nil",
			wantCalls: 1,
		},
		{
			name:         "tier 3 (gallery fallback) fails → error, not silent nil/placeholder",
			failUnscoped: true,
			wantCalls:    2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeResolutionPhotoRepo{
				photos:   map[string]*entity.SmartPhoto{},
				tenantOf: map[string]string{},
				picks:    map[string]entity.ReportPhotoPick{},
				listErr: func(filt repository.PhotoFilter) error {
					if tt.failUnscoped && filt.IsReportPhoto != nil {
						return nil // tier-2 (flagged) query succeeds
					}
					return boom
				},
			}

			got, err := resolveReportPhotoWithFallback(context.Background(), repo, participantID, sessionID, stageID)
			if !errors.Is(err, boom) {
				t.Fatalf("expected repo error %v, got %v", boom, err)
			}
			if got != nil {
				t.Fatalf("expected nil photo alongside the error, got id=%q", got.ID)
			}
			if repo.listCalls != tt.wantCalls {
				t.Fatalf("ListPhotos called %d time(s), want %d", repo.listCalls, tt.wantCalls)
			}
		})
	}
}
