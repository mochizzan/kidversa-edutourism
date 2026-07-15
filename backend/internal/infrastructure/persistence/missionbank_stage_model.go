package persistence

// MissionBankStageModel is the GORM persistence model for the mission_bank_stages
// junction table — the 1NF normalization of the former related_stage_ids JSON
// column. It is a pure junction (no soft-delete, no audit columns).
type MissionBankStageModel struct {
	MissionBankID  string `gorm:"primaryKey;column:mission_bank_id"`
	ProgramStageID string `gorm:"primaryKey;column:program_stage_id"`
	SortOrder      int    `gorm:"column:sort_order"`
}

// TableName pins the table name.
func (MissionBankStageModel) TableName() string { return "mission_bank_stages" }
