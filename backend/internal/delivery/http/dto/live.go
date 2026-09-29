package dto

// LiveEventRequest is the payload for POST /events.
type LiveEventRequest struct {
	SessionID string `json:"session_id" validate:"required"`
	GroupID   string `json:"group_id" validate:"required"`
	Type      string `json:"type" validate:"required"`
	Message   string `json:"message,omitempty"`
}

// LiveGroupsResponse wraps a session's groups for the live dashboard.
type LiveGroupsResponse struct {
	Groups []interface{} `json:"groups"`
}
