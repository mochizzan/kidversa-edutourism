package entity

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

// RawJSON is a framework-free JSON column type. It satisfies sql.Scanner and
// driver.Valuer so both GORM and database/sql can read/write it, while keeping
// the domain layer free of any ORM import. Use it for JSON columns (e.g.
// settings_json, emotion_tags_json, mission_ids_json).
type RawJSON []byte

// Value implements driver.Valuer — stores the JSON document as a string/blob.
func (r RawJSON) Value() (driver.Value, error) {
	if len(r) == 0 {
		return "{}", nil
	}
	return string(r), nil
}

// Scan implements sql.Scanner — reads the JSON document from the database.
func (r *RawJSON) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*r = RawJSON("{}")
		return nil
	case []byte:
		*r = RawJSON(v)
		return nil
	case string:
		*r = RawJSON(v)
		return nil
	default:
		return errors.New("entity.RawJSON: unsupported scan source type")
	}
}

// Marshal assigns a Go value into the RawJSON by serializing it.
func (r *RawJSON) Marshal(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	*r = b
	return nil
}

// Unmarshal deserializes the RawJSON into the provided target.
func (r RawJSON) Unmarshal(target any) error {
	if len(r) == 0 {
		return nil
	}
	return json.Unmarshal(r, target)
}
