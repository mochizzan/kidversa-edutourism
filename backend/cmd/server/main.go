package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"kidversa-edutourism-backend/internal/config"
	httppkg "kidversa-edutourism-backend/internal/delivery/http"
	"kidversa-edutourism-backend/internal/delivery/http/handler"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase"
	assessmentuc "kidversa-edutourism-backend/internal/usecase/assessment"
	liveuc "kidversa-edutourism-backend/internal/usecase/live"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

func main() {
	cfg := config.Load()

	db, err := persistence.OpenDB(cfg)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	jwt := auth.NewJWTManager(cfg)
	revoker := auth.NewInMemoryRevoker()
	refreshStore := auth.NewInMemoryRefreshStore()
	hub := sse.NewHub()

	// Repositories.
	userRepo := persistence.NewUserRepository(db.DB)
	tenantRepo := persistence.NewTenantRepository(db.DB)
	programRepo := persistence.NewProgramRepository(db.DB)
	sessionRepo := persistence.NewSessionRepository(db.DB)
	liveRepo := persistence.NewLiveRepository(db.DB)
	notifRepo := persistence.NewNotificationRepository(db.DB)
	assessmentRepo := persistence.NewAssessmentRepository(db.DB)
	photoRepo := persistence.NewPhotoRepository(db.DB)
	recordingRepo := persistence.NewRecordingRepository(db.DB)
	reportRepo := persistence.NewReportRepository(db.DB)
	missionBankRepo := persistence.NewMissionBankRepository(db.DB)
	participantMissionRepo := persistence.NewParticipantMissionRepository(db.DB)
	consentRepo := persistence.NewConsentRepository(db.DB)
	frameRepo := persistence.NewFrameRepository(db.DB)

	// Usecases.
	authUC := auth.NewUsecase(userRepo, jwt, revoker, refreshStore, auth.NewKioskStore(db.DB), cfg.BcryptCost)
	userUC := auth.NewUserUsecase(userRepo)
	tenantUC := auth.NewTenantUsecase(tenantRepo)
	sessionUC := usecase.NewSessionUsecase(sessionRepo)
	liveSvc := liveuc.NewService(liveRepo, notifRepo, hub)
	assessmentUC := assessmentuc.NewUsecase(assessmentRepo)
	reportsUC := reportsuc.NewUsecase(reportRepo, hub, reportsuc.NewPlaceholderNarrative())

	// Handlers.
	authHandler := handler.NewAuthHandler(authUC, jwt, cfg.SSECookieName(), cfg.RefreshCookieName(), cfg.CookieSecure, cfg.CookieSameSite)
	registry := handler.NewRegistry(authHandler)
	registry.User = handler.NewUserHandler(userUC, jwt)
	registry.Tenant = handler.NewTenantHandler(tenantUC, jwt)
	registry.Program = handler.NewProgramHandler(programRepo)
	registry.Session = handler.NewSessionHandler(sessionUC)
	registry.SessionLifecycle = handler.NewSessionLifecycleHandler(sessionUC)
	registry.SessionStage = handler.NewSessionStageHandler(sessionUC)
	registry.SessionGroup = handler.NewSessionGroupHandler(sessionUC)
	registry.SessionParticipant = handler.NewSessionParticipantHandler(sessionUC)
	registry.SessionParticipantBulk = handler.NewSessionParticipantBulkHandler(sessionUC)
	registry.Kiosk = handler.NewKioskHandler(authUC, sessionUC, programRepo)
	registry.Live = handler.NewLiveHandler(liveSvc, hub)
	registry.Notification = handler.NewNotificationHandler(liveSvc, hub)
	registry.Assessment = handler.NewAssessmentHandler(assessmentUC)
	registry.Photo = handler.NewPhotoHandler(photoRepo)
	registry.Recording = handler.NewRecordingHandler(recordingRepo)
	registry.Report = handler.NewReportHandler(reportsUC, cfg)
	registry.MissionBank = handler.NewMissionBankHandler(missionBankRepo)
	registry.ParticipantMission = handler.NewParticipantMissionHandler(participantMissionRepo)
	registry.Consent = handler.NewConsentHandler(consentRepo, sessionRepo)
	registry.Frame = handler.NewFrameHandler(frameRepo)
	registry.Upload = handler.NewUploadHandler(cfg, photoRepo, recordingRepo)
	registry.Media = handler.NewMediaHandler(cfg, photoRepo, recordingRepo, consentRepo, sessionRepo)

	deps := httppkg.Deps{
		Config:   cfg,
		DB:       db,
		JWT:      jwt,
		Hub:      hub,
		Revoker:  revoker,
		Handlers: registry,
	}
	e := httppkg.NewRouter(deps)

	// Graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		addr := ":" + cfg.ServerPort
		srv := &http.Server{Addr: addr, Handler: e}
		log.Printf("listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")
	hub.Shutdown(context.Background())
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	srv := &http.Server{Addr: ":" + cfg.ServerPort, Handler: e}
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
	revoker.Stop()
	db.Close()
	log.Println("stopped")
}
