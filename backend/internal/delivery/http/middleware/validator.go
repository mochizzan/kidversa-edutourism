package middleware

import (
	"reflect"
	"unicode"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v5"
	"kidversa-edutourism-backend/internal/pkg/phoneutil"
)

// customValidator implements echo.Validator using go-playground/validator.
type customValidator struct {
	v *validator.Validate
}

// Validate runs struct validation and returns a normalized error (nil if valid).
func (cv *customValidator) Validate(i interface{}) error {
	return cv.v.Struct(i)
}

// SetupValidator installs a go-playground/validator-backed Validator on the echo instance.
func SetupValidator(e *echo.Echo) {
	e.Validator = NewValidator()
}

// NewValidator builds a go-playground/validator-backed echo.Validator with
// custom tags: "phone" (E.164-normalizable phone number) and "hasletter"
// (string must contain at least one Unicode letter).
func NewValidator() echo.Validator {
	v := validator.New()
	v.RegisterValidation("phone", func(fl validator.FieldLevel) bool {
		if fl.Field().Kind() != reflect.String {
			return false
		}
		_, err := phoneutil.Normalize(fl.Field().String())
		return err == nil
	})
	v.RegisterValidation("hasletter", func(fl validator.FieldLevel) bool {
		if fl.Field().Kind() != reflect.String {
			return false
		}
		for _, r := range fl.Field().String() {
			if unicode.IsLetter(r) {
				return true
			}
		}
		return false
	})
	return &customValidator{v: v}
}
