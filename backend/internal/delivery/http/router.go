package http

import (
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// Deps bundles shared dependencies for route registration.
type Deps struct {
	Config   *config.Config
	DB       *persistence.DB
	JWT      *auth.JWTManager
	Hub      *sse.Hub
	Revoker  *auth.InMemoryRevoker
	Handlers *handler.Registry
}

// NewRouter assembles the echo instance with all middleware and routes.
func NewRouter(d Deps) *echo.Echo {
	e := echo.New()
	e.HTTPErrorHandler = middleware.ErrorHandler
	middleware.SetupValidator(e)

	e.Use(middleware.SecurityHeaders())
	e.Use(middleware.CORS(d.Config.CORSOrigins))
	e.Use(middleware.Recover())

	// Public health.
	e.GET("/health", healthHandler(d.DB))

	// API group.
	api := e.Group("/api")

	// Auth routes (public + protected).
	authGroup := api.Group("/auth")
	handler.RegisterAuthRoutes(authGroup, d.Handlers.Auth, d.JWT, d.Config.SSECookieName(), d.Revoker)

	h := d.Handlers

	// Tenants (SUPER_ADMIN).
	handler.RegisterTenantsRoutes(api.Group("/tenants"), h.Tenant, d.JWT, d.Revoker)

	// Users.
	handler.RegisterUsersRoutes(api.Group("/users"), h.User, d.JWT, d.Revoker)

	// Programs + stages + contents.
	handler.RegisterProgramsRoutes(api.Group("/programs"), h.Program, d.JWT, d.Revoker)

	// Sessions + stages + groups + participants.
	handler.RegisterSessionsRoutes(
		api.Group("/sessions"),
		h.Session, h.SessionLifecycle, h.SessionStage, h.SessionGroup, h.SessionParticipant, h.SessionParticipantBulk,
		d.JWT, d.Revoker, h.Kiosk,
		api.Group("/participants"),
	)

	// Live + SSE.
	handler.RegisterLiveRoutes(api.Group("/live"), h.Live, d.JWT, d.Hub, d.Revoker)
	handler.RegisterNotificationsRoutes(api.Group("/notifications"), h.Notification, d.JWT, d.Hub, d.Revoker)

	// Resources.
	handler.RegisterAssessmentRoutes(api.Group("/assessments"), h.Assessment, d.JWT, d.Revoker)
	handler.RegisterPhotosRoutes(api.Group("/photos"), h.Photo, d.JWT, d.Revoker)
	handler.RegisterRecordingsRoutes(api.Group("/recordings"), h.Recording, d.JWT, d.Revoker)
	handler.RegisterReportsRoutes(api.Group("/reports"), h.Report, d.JWT, d.Revoker)
	handler.RegisterMissionBanksRoutes(api.Group("/mission-banks"), h.MissionBank, d.JWT, d.Revoker)
	handler.RegisterParticipantMissionsRoutes(api.Group("/participant-missions"), h.ParticipantMission, d.JWT, d.Revoker)
	handler.RegisterConsentRoutes(api.Group("/consent"), h.Consent, d.JWT, d.Revoker)
	handler.RegisterFramesRoutes(api.Group("/frames"), h.Frame, d.JWT, d.Revoker)

	// File upload + authenticated media.
	handler.RegisterUploadRoutes(api.Group("/api"), h.Upload, d.JWT, d.Config, d.Revoker)
	handler.RegisterMediaRoutes(api.Group("/media"), h.Media, d.JWT, d.Config, d.Revoker)

	return e
}

// healthHandler returns 200 if DB is reachable, 503 otherwise.
func healthHandler(db *persistence.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		if err := db.Ping(); err != nil {
			return echo.NewHTTPError(503, "db_unavailable")
		}
		return (*c).JSON(200, map[string]string{"status": "ok"})
	}
}
