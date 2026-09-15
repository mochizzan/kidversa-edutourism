export interface GalleryPhoto {
  id: string
  original_file_url: string
  framed_file_url?: string
  is_report_photo: boolean
  taken_at: string
  taken_by: string
}

export interface GalleryData {
  report_id: string
  participant_id: string
  session_id: string
  group_name: string
  child_name: string
  photos: GalleryPhoto[]
}
