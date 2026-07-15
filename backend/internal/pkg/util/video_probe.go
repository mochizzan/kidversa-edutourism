package util

import (
	"os/exec"
	"strconv"
	"strings"
)

// ProbeVideoDuration extracts the playback duration of a video file in whole
// seconds using ffprobe (part of ffmpeg, installed in the runtime image).
//
// The backend computes the duration authoritatively on upload rather than
// trusting a client-supplied value, so the stored duration stays accurate
// regardless of what the browser reported. Returns 0 if ffprobe is missing,
// the file is not a decodable video, or parsing fails — callers treat 0 as
// "unknown" and fall back to any client-provided estimate.
func ProbeVideoDuration(filePath string) int {
	cmd := exec.Command("ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filePath,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	trimmed := strings.TrimSpace(string(out))
	seconds, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0
	}
	return int(seconds)
}
