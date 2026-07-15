package persistence

// RecordingEmotionTagModel is the GORM persistence model for the
// recording_emotion_tags junction table — the 1NF normalization of the former
// emotion_tags_json column. It is a pure junction (no soft-delete, no audit columns).
type RecordingEmotionTagModel struct {
	RecordingID string `gorm:"primaryKey;column:recording_id"`
	EmotionTag  string `gorm:"primaryKey;column:emotion_tag"`
}

// TableName pins the table name.
func (RecordingEmotionTagModel) TableName() string { return "recording_emotion_tags" }
