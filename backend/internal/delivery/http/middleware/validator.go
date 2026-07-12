package middleware

import (
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v5"
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

// NewValidator builds a go-playground/validator-backed echo.Validator.
func NewValidator() echo.Validator {
	return &customValidator{v: validator.New()}
}
