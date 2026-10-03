export interface GalleryPhoto {
 id: string
 original_file_url: string
 framed_file_url?: string
 is_report_photo: boolean
 /** True when this photo backs the report token's topic (pick wins; fallback is_report_photo). */
 report_photo: boolean
 /**
  * Topic bucket this photo belongs to (session_stages.id). `''` = legacy
  * photo without a topic. Matched against GalleryData.topics[].session_stage_id
  * for the parent gallery's topic switcher.
  */
 session_stage_id: string
 taken_at: string
 taken_by: string
}

/** One topic pill of the parent gallery switcher: the session's topic, its program stage and display name. */
export interface GalleryTopic {
 session_stage_id: string
 program_stage_id: string
 name: string
}

export interface GalleryData {
 report_id: string
 participant_id: string
 session_id: string
 group_name: string
 child_name: string
 photos: GalleryPhoto[]
 /**
  * The session's topics ordered by sequence — source for the switcher.
  * Empty array when the session has no stages. (Runtime guards in the
  * gallery page still tolerate a stale payload without it.)
  */
 topics: GalleryTopic[]
}
