// Public report shape returned by the parent access token endpoint
// (GET /api/reports/access). Mirrors backend PublicReportDTO — the payload now
// carries the same content the admin preview assembles (program/child/stages/
// missions/badges/gallery), so the parent rapor renders identically to
// useReportReview.buildRaportHtml. New fields are additive/optional (omitempty
// on the backend); the frontend tolerates their absence.

/** One session Kegiatan within a stage, with this participant's star rating. */
export interface PublicReportKegiatan {
 name: string
 star_rating?: number
}

/** A session stage (Topik) in admin-preview order, with its Kegiatan. */
export interface PublicReportStage {
 name: string
 sequence_order?: number
 kegiatan: PublicReportKegiatan[]
}

/** Mission with title already resolved by the backend (ids are never leaked). */
export interface PublicReportMission {
 id: string
 title: string
}

export interface PublicReportBadge {
 badge_name: string
 /** Token-free `/api/reports/access/badge/{contentId}` path; caller must append `?token=` (same contract as photo_url). */
 badge_image_url?: string
 /** "TOPIK" (current) | "SUBTOPIK" (legacy) | "FINAL"; absent on legacy payloads (split falls back). */
 badge_type?: string | null
 /** Topic FK; "" | null on FINAL/legacy rows. */
 program_stage_id?: string | null
}

export interface PublicReport {
 id: string
 participant_id: string
 session_id: string
 /** Topic FK this report belongs to; "" | null on legacy payloads (split treats it as legacy → all topic badges). */
 program_stage_id?: string | null
 status: string
 ai_narrative_final?: string
 mission_ids?: string[]
 report_pdf_url?: string
 /** Token-free access-photo path; absent when no photo resolves or consent is off. */
 photo_url?: string
 group_name?: string
 // Nama owner fasilitator kelompok; absent bila kelompok/fasilitator tak ter-set.
 facilitator_name?: string
 program_name?: string
 topic_name?: string
 child_name?: string
 child_age?: number
 school_name?: string
 session_date?: string
 gallery_access_token?: string
 stages?: PublicReportStage[]
 missions?: PublicReportMission[]
 badges?: PublicReportBadge[]
 /** Frozen-archive marker (PublicReportDTO.session_cancelled): true when the
  *  report's session was CANCELLED after generation. Content stays served
  *  (pre-cancel snapshot); the parent page renders an archive banner. */
 session_cancelled?: boolean
 /** Clone provenance (PublicReportDTO): ALWAYS present, null = natively
  *  created; non-null = report carried by the participant-migration flow,
  *  with a name+status SNAPSHOT of the source session at clone time. */
 source_session_id?: string | null
 source_session_name?: string | null
 source_session_status?: string | null
}
