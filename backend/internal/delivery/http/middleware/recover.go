package middleware

import (
	"fmt"
	"runtime"

	"github.com/labstack/echo/v5"
)

// Recover converts panics into a normalized 500 envelope. Must be registered early.
func Recover() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			defer func() {
				if r := recover(); r != nil {
					buf := make([]byte, 4096)
					runtime.Stack(buf, false)
					err, ok := r.(error)
					if !ok {
						err = fmt.Errorf("%v", r)
					}
					ErrorHandler(c, err)
				}
			}()
			return next(c)
		}
	}
}
