package persistence

import (
	"context"
	"fmt"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func probeDB(t *testing.T) *gorm.DB {
	dsn := "root:admin@tcp(127.0.0.1:3306)/kidversa?parseTime=true&loc=Local&multiStatements=true"
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Skipf("cannot open live DB: %v", err)
	}
	return db
}

func TestProbeApproveRejectRFC3339(t *testing.T) {
	db := probeDB(t)
	repo := NewUserRepository(db)

	var m UserModel
	if err := db.Where("approval_status = ?", "pending").First(&m).Error; err != nil {
		t.Skipf("no pending user to probe: %v", err)
	}
	id := m.ID
	approver := "1e0c819b-f816-47d3-b4f9-896eea540f01"

	// simulate the FIXED formatting
	now := time.Now().Format("2006-01-02 15:04:05.000")
	fmt.Printf("FIXED-NOW literal = %q\n", now)

	u, err := repo.Approve(context.Background(), id, approver)
	if err != nil {
		t.Fatalf("APPROVE unexpectedly failed with FIXED format: %v", err)
	}
	fmt.Printf("APPROVE OK: ApprovedAt=%v ApprovedBy=%v RejectedAt=%v\n",
		deref(u.ApprovedAt), deref(u.ApprovedBy), deref(u.RejectedAt))

	if err := db.Model(&UserModel{}).Where("id = ?", id).
		Updates(map[string]interface{}{"approval_status": "pending", "is_active": false,
			"approved_at": nil, "approved_by": nil, "rejected_at": nil, "rejected_by": nil}).Error; err != nil {
		t.Fatalf("reset failed: %v", err)
	}

	ur, err3 := repo.Reject(context.Background(), id, approver, "probe-reason")
	if err3 != nil {
		t.Fatalf("REJECT unexpectedly failed with FIXED format: %v", err3)
	}
	fmt.Printf("REJECT OK: RejectedAt=%v RejectedBy=%v ApprovedAt=%v\n",
		deref(ur.RejectedAt), deref(ur.RejectedBy), deref(ur.ApprovedAt))
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}
