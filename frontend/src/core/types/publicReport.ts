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
  badge_image_url?: string
}

export interface PublicReport {
  id: string
  participant_id: string
  session_id: string
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
}
