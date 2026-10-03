package handler

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
)

// RegisterGalleryRoutes mounts the public gallery token view.
//   - GET  /api/reports/gallery?token=...                    PUBLIC (gallery access via QR)
//   - GET  /api/reports/gallery/photo/:photoId?token=...&variant=framed|original
//     PUBLIC (raw photo bytes for the gallery <img>, inline)
//   - GET  /api/reports/gallery/photo/:photoId/download?token=...
//     PUBLIC (full-resolution original bytes + Content-Disposition: attachment
//     — the fullscreen preview's download button; never the framed variant)
//
// Gallery tokens are minted by the report approve flow (usecase), not by a
// dedicated management endpoint.
func RegisterGalleryRoutes(g *echo.Group, h *GalleryHandler, cfg *config.Config) {
	// Public gallery access — intentionally outside JWTAuth (gallery token is the authn).
	// RateLimit(cfg.RateLimitPerMin) brute-force protection on the 64hex token space.
	g.GET("/gallery", h.GetByToken, appmiddleware.RateLimit(cfg.RateLimitPerMin))
	g.GET("/gallery/photo/:photoId", h.GetPhoto, appmiddleware.RateLimit(cfg.RateLimitPerMin))
	g.GET("/gallery/photo/:photoId/download", h.DownloadPhoto, appmiddleware.RateLimit(cfg.RateLimitPerMin))
}
