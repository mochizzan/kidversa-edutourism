package reports

import (
	"context"
	"sort"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// Public payload shapes for GET /api/reports/access. Assembly mirrors the admin
// preview (frontend useReportReview.buildRaportHtml + missionSelector) field by
// field so the parent mini-raport equals the admin render; JSON tags live here
// and the delivery-layer DTO reuses these slice types verbatim. RAPORT_LAYOUT
// caps (stages/missions/badges) are applied client-side, like the admin does.

// PublicKegiatan is one session Kegiatan with this participant's star rating.
type PublicKegiatan struct {
	Name       string `json:"name"`
	StarRating int    `json:"star_rating"`
}

// PublicStage is one session Topik in admin-preview order: the program-stage
// name + sequence order, with its Kegiatan (names resolved from the program,
// ratings from the participant's assessments, default 0).
type PublicStage struct {
	Name          string           `json:"name"`
	SequenceOrder int              `json:"sequence_order"`
	Kegiatan      []PublicKegiatan `json:"kegiatan"`
}

// PublicMission is a mission with its title already resolved.
type PublicMission struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// PublicBadge is an awarded badge. BadgeImageURL is already translated to the
// PUBLIC kiosk media route — parents have no JWT for /api/media/content.
type PublicBadge struct {
	BadgeName     string `json:"badge_name"`
	BadgeImageURL string `json:"badge_image_url,omitempty"`
}

// PublicReportView is the assembled mini-raport content for one report. Core
// report fields (status, narrative, mission_ids, gallery token) and photoURL
// stay on the DTO; group name and facilitator are resolved LIVE (admin parity),
// not from the report's denormalized group_name.
type PublicReportView struct {
	ProgramName     string
	TopicName       string
	ChildName       string
	ChildAge        int
	SchoolName      string
	SessionDate     string
	GroupName       string
	FacilitatorName string
	Stages          []PublicStage
	Missions        []PublicMission
	Badges          []PublicBadge
}

// publicAssessmentPageSize matches the admin's GET /api/assessments?limit=100.
// Unlike the admin single page we paginate to the end so no rating is missed.
const publicAssessmentPageSize = 100

// publicMissionCandidateLimit mirrors missionService.getByTopic({limit: 100}).
const publicMissionCandidateLimit = 100

// fallbackMissionCount mirrors missionSelector.selectMissionsForParticipant (3).
const fallbackMissionCount = 3

// BuildPublicReportView assembles everything the parent mini-raport renders —
// the same data the admin preview collects from ~10 authenticated frontend
// calls (session, program, stages, kegiatan names, assessments, missions,
// badges, group). Public reads carry no JWT: tenant scope is resolved from the
// report's own session row (participant row as fallback), never from request
// context. The parent access token itself never enters the view.
func (u *Usecase) BuildPublicReportView(ctx context.Context, r *entity.Report) (*PublicReportView, error) {
	participant, err := u.sessionRepo.GetParticipantByID(ctx, r.ParticipantID, "")
	if err != nil {
		return nil, err
	}
	session, err := u.sessionRepo.GetSessionByID(ctx, r.SessionID, "")
	if err != nil {
		return nil, err
	}
	program, err := u.programRepo.GetProgramByID(ctx, session.ProgramID)
	if err != nil {
		return nil, err
	}
	tenant := derefStr(session.TenantID)
	if tenant == "" {
		tenant = derefStr(participant.TenantID)
	}

	view := &PublicReportView{
		ProgramName: program.Name,
		ChildName:   participant.ChildName,
		ChildAge:    participant.ChildAge,
		SchoolName:  participant.SchoolName,
		SessionDate: publicSessionDate(session.SessionDate),
		Stages:      []PublicStage{},
		Missions:    []PublicMission{},
		Badges:      []PublicBadge{},
	}

	// Topic name (admin: topics.find(activeTopicId)?.name ?? ''). A deleted
	// Topic yields "" like the admin; other errors fail the request.
	if r.ProgramStageID != "" {
		if stage, serr := u.programRepo.GetStageByID(ctx, r.ProgramStageID); serr == nil {
			view.TopicName = stage.Name
		} else if !isNotFound(serr) {
			return nil, serr
		}
	}

	// Participant group: live name lookup (admin parity — report.group_name is
	// a denormalization that goes stale when the group is renamed).
	var groups []entity.SessionGroup
	if derefStr(participant.GroupID) != "" {
		groups, err = u.sessionRepo.ListSessionGroups(ctx, r.SessionID)
		if err != nil {
			return nil, err
		}
		for i := range groups {
			if groups[i].ID == *participant.GroupID {
				view.GroupName = groups[i].Name
				break
			}
		}
	}
	// GetByToken already resolved the facilitator name read-time via the same
	// join the admin session detail uses (users.name via group.facilitator_id);
	// fall back to group → user when it came back empty.
	view.FacilitatorName = r.FacilitatorName
	if view.FacilitatorName == "" && u.userRepo != nil && derefStr(participant.GroupID) != "" {
		for i := range groups {
			if groups[i].ID != *participant.GroupID || groups[i].FacilitatorID == nil || *groups[i].FacilitatorID == "" {
				continue
			}
			if usr, uerr := u.userRepo.GetByID(ctx, *groups[i].FacilitatorID); uerr == nil && usr != nil {
				view.FacilitatorName = usr.Name
			}
			break
		}
	}

	// Participant's session assessments, newest first (created_at DESC — same
	// ordering the admin GET /api/assessments?session_id= uses); indexed by
	// session_substage, first wins, mirroring JS Array.find.
	assessments, err := u.loadPublicAssessments(ctx, r, tenant)
	if err != nil {
		return nil, err
	}
	firstBySubstage := make(map[string]entity.Assessment, len(assessments))
	for _, a := range assessments {
		if a.SessionSubstageID == "" {
			continue
		}
		if _, ok := firstBySubstage[a.SessionSubstageID]; !ok {
			firstBySubstage[a.SessionSubstageID] = a
		}
	}

	sessStages, err := u.sessionRepo.ListSessionStages(ctx, r.SessionID)
	if err != nil {
		return nil, err
	}
	sessSubs, err := u.sessionSubstageRepo.ListSessionSubstages(ctx, r.SessionID)
	if err != nil {
		return nil, err
	}
	// Mirror frontend substagesOfStage: parent stage, created_at ASC, id tie-break.
	sort.SliceStable(sessSubs, func(i, j int) bool {
		if !sessSubs[i].CreatedAt.Equal(sessSubs[j].CreatedAt) {
			return sessSubs[i].CreatedAt.Before(sessSubs[j].CreatedAt)
		}
		return sessSubs[i].ID < sessSubs[j].ID
	})
	subsByStage := make(map[string][]entity.SessionSubstage, len(sessStages))
	for _, sub := range sessSubs {
		subsByStage[sub.SessionStageID] = append(subsByStage[sub.SessionStageID], sub)
	}

	// Program stage / Kegiatan-name lookups, cached per id.
	progStages := map[string]*entity.ProgramStage{} // nil = Topic deleted (admin skips it)
	progSubNames := map[string]map[string]string{}
	progStageOf := func(id string) (*entity.ProgramStage, error) {
		if s, ok := progStages[id]; ok {
			return s, nil
		}
		s, err := u.programRepo.GetStageByID(ctx, id)
		if err != nil {
			if isNotFound(err) {
				progStages[id] = nil
				return nil, nil
			}
			return nil, err
		}
		progStages[id] = s
		return s, nil
	}
	subNamesOf := func(programStageID string) (map[string]string, error) {
		if m, ok := progSubNames[programStageID]; ok {
			return m, nil
		}
		subs, err := u.programSubstageRepo.ListSubstages(ctx, programStageID)
		if err != nil {
			return nil, err
		}
		m := make(map[string]string, len(subs))
		for _, ps := range subs {
			m[ps.ID] = ps.Name
		}
		progSubNames[programStageID] = m
		return m, nil
	}

	// Admin stageInfos equivalent: session stages in session order, skipping
	// stages whose program Topik no longer exists.
	type stageKegiatan struct {
		name          string
		rating        int
		hasAssessment bool
	}
	type stageInfo struct {
		programStageID string
		name           string
		sequenceOrder  int
		kegiatan       []stageKegiatan
	}
	stageInfos := make([]stageInfo, 0, len(sessStages))
	for _, ss := range sessStages {
		ps, perr := progStageOf(ss.ProgramStageID)
		if perr != nil {
			return nil, perr
		}
		if ps == nil {
			continue // admin: programStages.find miss → stage dropped
		}
		names, nerr := subNamesOf(ps.ID)
		if nerr != nil {
			return nil, nerr
		}
		subs := subsByStage[ss.ID]
		info := stageInfo{
			programStageID: ps.ID,
			name:           ps.Name,
			sequenceOrder:  ps.SequenceOrder,
			kegiatan:       make([]stageKegiatan, 0, len(subs)),
		}
		for _, sub := range subs {
			// Admin: subNameById.get(id) ?? id (raw id when the program Kegiatan is gone).
			name := sub.ProgramSubstageID
			if n, ok := names[sub.ProgramSubstageID]; ok {
				name = n
			}
			k := stageKegiatan{name: name}
			if a, ok := firstBySubstage[sub.ID]; ok {
				k.rating = a.StarRating
				k.hasAssessment = true
			}
			info.kegiatan = append(info.kegiatan, k)
		}
		stageInfos = append(stageInfos, info)
	}
	view.Stages = make([]PublicStage, 0, len(stageInfos))
	for _, si := range stageInfos {
		st := PublicStage{
			Name:          si.name,
			SequenceOrder: si.sequenceOrder,
			Kegiatan:      make([]PublicKegiatan, 0, len(si.kegiatan)),
		}
		for _, k := range si.kegiatan {
			st.Kegiatan = append(st.Kegiatan, PublicKegiatan{Name: k.name, StarRating: k.rating})
		}
		view.Stages = append(view.Stages, st)
	}

	// Fallback-mission input (missionSelector): average rating per program
	// Topik over EXISTING assessments of mapped stages, in first-encounter
	// order; the 2 lowest averages win (stable sort keeps encounter order on ties).
	sums := map[string]float64{}
	counts := map[string]int{}
	var encounterOrder []string
	for _, si := range stageInfos {
		for _, k := range si.kegiatan {
			if !k.hasAssessment {
				continue
			}
			if _, ok := sums[si.programStageID]; !ok {
				encounterOrder = append(encounterOrder, si.programStageID)
			}
			sums[si.programStageID] += float64(k.rating)
			counts[si.programStageID]++
		}
	}
	type avgRating struct {
		id  string
		avg float64
	}
	avgs := make([]avgRating, 0, len(encounterOrder))
	for _, id := range encounterOrder {
		avgs = append(avgs, avgRating{id: id, avg: sums[id] / float64(counts[id])})
	}
	sort.SliceStable(avgs, func(i, j int) bool { return avgs[i].avg < avgs[j].avg })
	lowestStageIDs := make([]string, 0, 2)
	for i := 0; i < len(avgs) && i < 2; i++ {
		lowestStageIDs = append(lowestStageIDs, avgs[i].id)
	}

	// Topic-scoped active mission candidates (missionService.getByTopic query:
	// topic_id + is_active=true, page 1, limit 100, created_at DESC).
	var candidates []entity.MissionBank
	if r.ProgramStageID != "" {
		res, cerr := u.missionRepo.List(ctx, repository.MissionBankFilter{
			TenantID: tenant,
			TopicID:  r.ProgramStageID,
			IsActive: boolPtr(true),
		}, 1, publicMissionCandidateLimit)
		if cerr != nil {
			return nil, cerr
		}
		candidates = res.Items
	}

	view.Missions, err = u.resolvePublicMissions(ctx, r, candidates, lowestStageIDs, tenant)
	if err != nil {
		return nil, err
	}

	// Badges (badgeService.listByParticipant): full list, created_at ASC; the
	// image id is translated to the public kiosk content route.
	badges, berr := u.sessionSubstageRepo.ListBadgesByParticipant(ctx, r.ParticipantID)
	if berr != nil {
		return nil, berr
	}
	view.Badges = make([]PublicBadge, 0, len(badges))
	for _, b := range badges {
		img := ""
		if b.BadgeImageURL != "" {
			img = "/api/media/kiosk/content/" + b.BadgeImageURL
		}
		view.Badges = append(view.Badges, PublicBadge{BadgeName: b.BadgeName, BadgeImageURL: img})
	}
	return view, nil
}

// resolvePublicMissions picks the mission list the admin preview prints: the
// assigned (report.mission_ids) titles in admin order, falling back to the
// deterministic selector when no assigned title resolves.
func (u *Usecase) resolvePublicMissions(ctx context.Context, r *entity.Report, candidates []entity.MissionBank, lowestStageIDs []string, tenant string) ([]PublicMission, error) {
	ids := r.MissionIDs
	if len(ids) > MaxReportMissions {
		ids = ids[:MaxReportMissions] // admin: assignedMissionIds.slice(0, 4)
	}
	if len(ids) > 0 {
		assigned := make(map[string]bool, len(ids))
		for _, id := range ids {
			assigned[id] = true
		}
		// Admin display order: candidate list (created_at DESC) filtered to the
		// assigned set. Assigned ids the topic page does not carry (unlinked,
		// inactive, or beyond the page limit) are resolved directly so a saved
		// selection is never dropped.
		resolved := make([]PublicMission, 0, len(ids))
		seen := make(map[string]bool, len(ids))
		for _, m := range candidates {
			if assigned[m.ID] {
				resolved = append(resolved, PublicMission{ID: m.ID, Title: m.Title})
				seen[m.ID] = true
			}
		}
		for _, id := range ids {
			if seen[id] {
				continue
			}
			seen[id] = true
			m, err := u.missionRepo.GetByID(ctx, id, tenant)
			if err != nil {
				if isNotFound(err) {
					continue // deleted mission: admin never prints it either
				}
				return nil, err // surface real failures to the caller
			}
			resolved = append(resolved, PublicMission{ID: m.ID, Title: m.Title})
		}
		if len(resolved) > 0 {
			return resolved, nil
		}
	}
	// Admin fallback (selectMissionsForParticipant) when no assigned title
	// resolves: score = overlap of related_stage_ids with the 2 lowest-averaged
	// Topik, score desc then id asc, take 3 — printed in candidate order.
	picked := selectFallbackMissions(candidates, lowestStageIDs)
	if len(picked) == 0 {
		return nil, nil
	}
	pickedSet := make(map[string]bool, len(picked))
	for _, id := range picked {
		pickedSet[id] = true
	}
	out := make([]PublicMission, 0, len(picked))
	for _, m := range candidates {
		if pickedSet[m.ID] {
			out = append(out, PublicMission{ID: m.ID, Title: m.Title})
		}
	}
	return out, nil
}

// selectFallbackMissions returns up to fallbackMissionCount candidate ids
// (score order) for the deterministic admin fallback selector.
func selectFallbackMissions(candidates []entity.MissionBank, lowestStageIDs []string) []string {
	if len(candidates) == 0 {
		return nil
	}
	// Candidates arrive active-only (query mirrors getByTopic is_active=true).
	type scored struct {
		id    string
		score int
	}
	items := make([]scored, 0, len(candidates))
	for _, c := range candidates {
		score := 0
		for _, sid := range c.RelatedStageIDs {
			for _, low := range lowestStageIDs {
				if sid == low {
					score++
				}
			}
		}
		items = append(items, scored{id: c.ID, score: score})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].score != items[j].score {
			return items[i].score > items[j].score
		}
		return items[i].id < items[j].id
	})
	limit := fallbackMissionCount
	if len(items) < limit {
		limit = len(items)
	}
	picked := make([]string, 0, limit)
	for i := 0; i < limit; i++ {
		picked = append(picked, items[i].id)
	}
	return picked
}

// loadPublicAssessments pages through every assessment row for the report's
// participant + session in the admin's ordering (created_at DESC) so no star
// rating is missed (the admin fetch is a single limit=100 page). Tenant scope
// comes from the session row; when no tenant can be resolved the list is empty,
// matching what the admin's tenant-scoped query returns for such a session.
func (u *Usecase) loadPublicAssessments(ctx context.Context, r *entity.Report, tenant string) ([]entity.Assessment, error) {
	if tenant == "" {
		return nil, nil
	}
	var out []entity.Assessment
	for page := 1; ; page++ {
		res, err := u.assessmentRepo.List(ctx, repository.AssessmentFilter{
			ParticipantID: r.ParticipantID,
			SessionID:     r.SessionID,
			TenantID:      tenant,
		}, page, publicAssessmentPageSize)
		if err != nil {
			return nil, err
		}
		out = append(out, res.Items...)
		if len(res.Items) < publicAssessmentPageSize || len(out) >= res.Total {
			break
		}
	}
	return out, nil
}

// publicSessionDate normalizes the DATE column to RFC3339 UTC
// ("2026-09-19T00:00:00Z"); anything else (including an empty date) passes
// through untouched. The frontend formatDate renders it identically to the
// admin's raw "YYYY-MM-DD".
func publicSessionDate(raw string) string {
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return t.UTC().Format(time.RFC3339)
	}
	return raw
}

// derefStr normalizes a nullable string pointer into an empty-or-value string.
func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// isNotFound reports whether err is an app-level NotFound.
func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	_, code, ok := apperrors.AsAppError(err)
	return ok && code == "not_found"
}
