# Task
Select up to {{.MaxMissions}} follow-up missions (misi lanjutan) for the child below, strictly from the candidate list, based on their assessment in the named Topik.

# Child & Context
- Child Name: {{.ChildName}}
- Topik: {{.TopicName}}
- Session: {{.SessionName}}

# Candidate Missions (only these may be selected)
{{.Candidates}}

# Assessment Data (this Topik only)
{{.Assessments}}

# Output
Return a JSON array of up to {{.MaxMissions}} mission id strings selected from the candidates above. Example: ["id-1","id-2"].
