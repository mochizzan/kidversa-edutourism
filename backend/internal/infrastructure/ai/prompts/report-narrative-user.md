# Task
Write a narrative progress report in Bahasa Indonesia, strictly maximum 50 words in 1 paragraph, based on the data below.

# Rules
1. Write in Bahasa Indonesia.
2. Word count MUST NOT exceed 50 words.
3. Do NOT use markdown formatting (no bold, italic, headers, or lists).
4. Reference specific Kegiatan/Topik names and the child's observed strengths.
5. If a Kegiatan has a low star rating (1-2), frame it as an area for growth with a positive, constructive tone.
6. Do NOT include generic filler — reference specific assessment data.
7. Output ONLY the narrative text directly. No preamble, no closing remark.
{{if .TopicName}}8. This report covers ONLY the Topik "{{.TopicName}}". Do NOT reference other Topik; all assessment data below belongs to this single Topik.{{end}}

# Child & Session Data
- Child Name: {{.ChildName}}
- Child Age: {{.ChildAge}} years old
- Session Name: {{.SessionName}}
{{- if .TopicName}}
- Topik: {{.TopicName}}
{{- end}}
- Session Date: {{.SessionDate}}

# Assessment Data
{{.Assessments}}