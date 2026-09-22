package participant_test

import (
	"strings"
	"testing"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/delivery/http/middleware"
)

func validate(v any) error {
	return middleware.NewValidator().Validate(v)
}

func validCreate() dto.CreateParticipantRequest {
	return dto.CreateParticipantRequest{
		ChildName:   "Budi",
		ChildAge:    6,
		ParentName:  "Santoso",
		ParentPhone: "+628123123456",
		ParentEmail: "",
	}
}

func TestCreateParticipantValidation(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*dto.CreateParticipantRequest)
		wantErr bool
	}{
		{name: "valid", mutate: func(r *dto.CreateParticipantRequest) {}},
		{name: "age 0", mutate: func(r *dto.CreateParticipantRequest) { r.ChildAge = 0 }, wantErr: true},
		{name: "age 1", mutate: func(r *dto.CreateParticipantRequest) { r.ChildAge = 1 }},
		{name: "age 120", mutate: func(r *dto.CreateParticipantRequest) { r.ChildAge = 120 }},
		{name: "age 121", mutate: func(r *dto.CreateParticipantRequest) { r.ChildAge = 121 }, wantErr: true},
		{name: "child name digits only", mutate: func(r *dto.CreateParticipantRequest) { r.ChildName = "123" }, wantErr: true},
		{name: "child name whitespace only", mutate: func(r *dto.CreateParticipantRequest) { r.ChildName = "  " }, wantErr: true},
		{name: "child name emoji only", mutate: func(r *dto.CreateParticipantRequest) { r.ChildName = "🌟🌟" }, wantErr: true},
		{name: "child name 2 chars", mutate: func(r *dto.CreateParticipantRequest) { r.ChildName = "Ab" }},
		{name: "child name 201 chars", mutate: func(r *dto.CreateParticipantRequest) { r.ChildName = strings.Repeat("a", 201) }, wantErr: true},
		{name: "phone letters", mutate: func(r *dto.CreateParticipantRequest) { r.ParentPhone = "abc" }, wantErr: true},
		{name: "phone invalid country", mutate: func(r *dto.CreateParticipantRequest) { r.ParentPhone = "+999000000" }, wantErr: true},
		{name: "phone local ID fallback", mutate: func(r *dto.CreateParticipantRequest) { r.ParentPhone = "08123123456" }},
		{name: "email invalid", mutate: func(r *dto.CreateParticipantRequest) { r.ParentEmail = "bukan-email" }, wantErr: true},
		{name: "email empty ok", mutate: func(r *dto.CreateParticipantRequest) { r.ParentEmail = "" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validCreate()
			tt.mutate(&req)
			err := validate(&req)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected nil, got %v", err)
			}
		})
	}
}

func TestUpdateParticipantValidation(t *testing.T) {
	base := dto.UpdateParticipantRequest{
		ChildName:  "Budi",
		ChildAge:   6,
		ParentName: "Santoso",
	}
	tests := []struct {
		name    string
		mutate  func(*dto.UpdateParticipantRequest)
		wantErr bool
	}{
		{name: "valid", mutate: func(r *dto.UpdateParticipantRequest) {}},
		{name: "age 0 omitted", mutate: func(r *dto.UpdateParticipantRequest) { r.ChildAge = 0 }},
		{name: "age 121", mutate: func(r *dto.UpdateParticipantRequest) { r.ChildAge = 121 }, wantErr: true},
		{name: "name empty omitted", mutate: func(r *dto.UpdateParticipantRequest) { r.ChildName = "" }},
		{name: "name digits only", mutate: func(r *dto.UpdateParticipantRequest) { r.ChildName = "123" }, wantErr: true},
		{name: "phone letters", mutate: func(r *dto.UpdateParticipantRequest) { r.ParentPhone = "abc" }, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := base
			tt.mutate(&req)
			err := validate(&req)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected nil, got %v", err)
			}
		})
	}
}

// TestImportParticipantsDive proves the dive tag descends into row validation:
// a valid row passes, a letterless name inside a row is rejected.
func TestImportParticipantsDive(t *testing.T) {
	t.Run("valid row", func(t *testing.T) {
		req := dto.ImportParticipantsRequest{
			Rows: []dto.CreateParticipantRequest{validCreate()},
		}
		if err := validate(&req); err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	})
	t.Run("invalid row name rejected", func(t *testing.T) {
		row := validCreate()
		row.ChildName = "12"
		req := dto.ImportParticipantsRequest{Rows: []dto.CreateParticipantRequest{row}}
		if err := validate(&req); err == nil {
			t.Fatalf("expected error, got nil")
		}
	})
}
