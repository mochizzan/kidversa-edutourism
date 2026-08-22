// Public report shape returned by the parent access token endpoint
// (GET /api/reports/access). Mirrors backend PublicReportDTO — PII and the raw
// token are intentionally absent; the parent flow only ever sees this stripped
// payload.
export interface PublicReport {
  id: string
  participant_id: string
  session_id: string
  status: string
  ai_narrative_final?: string
  mission_ids?: string[]
  report_pdf_url?: string
}
