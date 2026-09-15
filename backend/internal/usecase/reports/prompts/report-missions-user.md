# Task
Select up to {{.MaxMissions}} follow-up missions (misi lanjutan) for the child below, strictly from the candidate list, based on their assessment in the named Topik.

# Anak
- Nama: {{.ChildName}}

# Topik & Sesi
- Topik: {{.TopicName}}
- Sesi: {{.SessionName}}

# Kandidat Misi (hanya dari daftar ini yang boleh dipilih)
{{.Candidates}}

# Data Asesmen (Topik ini saja)
Format: Kegiatan <nama>: <N> bintang — "<komentar>"
{{.Assessments}}

# Output
Kembalikan JSON array berisi hingga {{.MaxMissions}} mission id string dari kandidat di atas. Contoh: ["id-1","id-2"].
