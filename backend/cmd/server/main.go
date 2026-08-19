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
	"kidversa-edutourism-backend/internal/infrastructure/ai"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/infrastructure/messaging"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	"kidversa-edutourism-backend/internal/pkg/sse"
	"kidversa-edutourism-backend/internal/usecase"
	assessmentuc "kidversa-edutourism-backend/internal/usecase/assessment"
	badgeuc "kidversa-edutourism-backend/internal/usecase/badge"
	liveuc "kidversa-edutourism-backend/internal/usecase/live"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

func main() {
	cfg := config.Load()

	db, err := persistence.OpenDB(cfg)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	// Keep pooled connections alive and warm the InnoDB buffer pool.
	// Prevents the cold-start SLOW SQL on the first request after idle.
	stopKeepalive := persistence.StartKeepalive(db.DB, 30*time.Second)
	defer stopKeepalive()

	jwt := auth.NewJWTManager(cfg)
	revoker := auth.NewInMemoryRevoker()
	refreshStore := persistence.NewGormRefreshRepository(db.DB)
	// Periodically purge expired refresh tokens. Cleans tokens older than
	// 2× the refresh TTL (default: 14 days) every 6 hours.
	stopCleanup := refreshStore.StartCleanup(context.Background(), 6*time.Hour, cfg.JWTRefreshTTL*2)
	defer stopCleanup()
	hub := sse.NewHub()

	// Repositories.
	userRepo := persistence.NewUserRepository(db.DB)
	tenantRepo := persistence.NewTenantRepository(db.DB)
	programRepo := persistence.NewProgramRepository(db.DB)
	contentRepo := persistence.NewContentRepository(db.DB)
	sessionRepo := persistence.NewSessionRepository(db.DB)
	liveRepo := persistence.NewLiveRepository(db.DB)
	notifRepo := persistence.NewNotificationRepository(db.DB)
	assessmentRepo := persistence.NewAssessmentRepository(db.DB)
	photoRepo := persistence.NewPhotoRepository(db.DB)
	reportRepo := persistence.NewReportRepository(db.DB)
	missionBankRepo := persistence.NewMissionBankRepository(db.DB)
	participantMissionRepo := persistence.NewParticipantMissionRepository(db.DB)
	consentRepo := persistence.NewConsentRepository(db.DB, cfg.ConsentTokenTTL)
	frameRepo := persistence.NewFrameRepository(db.DB)
	programSubstageRepo := persistence.NewProgramSubstageRepository(db.DB)
	sessionSubstageRepo := persistence.NewSessionSubstageRepository(db.DB)

	// AI clients.
	openRouterClient := ai.NewOpenRouterClient(cfg.OpenRouterAPIKey, cfg.OpenRouterModel, cfg.OpenRouterBaseURL)
	narrativeGen := ai.NewOpenRouterNarrativeGenerator(openRouterClient, reportRepo, sessionRepo, assessmentRepo, programRepo, sessionSubstageRepo)

	// Usecases.
	authUC := auth.NewUsecase(userRepo, jwt, revoker, refreshStore, auth.NewKioskStore(db.DB), cfg.BcryptCost)
	userUC := auth.NewUserUsecase(userRepo, notifRepo, hub, cfg.BcryptCost)
	tenantUC := auth.NewTenantUsecase(tenantRepo)
	sessionUC := usecase.NewSessionUsecase(sessionRepo, programRepo)
	// Wire the v4 substage repos into the session usecase so CreateSession
	// clones Kegiatan into session_substages and LinkParticipant clones scores.
	sessionUC.SetSubstageRepos(programSubstageRepo, sessionSubstageRepo)
	sessionUC.SetAssessmentRepo(assessmentRepo)
	sessionUC.SetUserRepo(userRepo)
	liveSvc := liveuc.NewService(liveRepo, notifRepo, hub)
	badgeUC := badgeuc.NewUsecase(sessionSubstageRepo, programSubstageRepo, programRepo, assessmentRepo, sessionRepo)
	assessmentUC := assessmentuc.NewUsecase(assessmentRepo, badgeUC)
	reportsUC := reportsuc.NewUsecase(reportRepo, narrativeGen)

	// Handlers.
	authHandler := handler.NewAuthHandler(authUC, jwt, cfg.SSECookieName(), cfg.RefreshCookieName(), cfg.CookieSecure, cfg.CookieSameSite, sessionRepo)
	registry := handler.NewRegistry(authHandler)
	registry.User = handler.NewUserHandler(userUC, jwt, liveSvc)
	registry.Tenant = handler.NewTenantHandler(tenantUC, jwt)
	registry.Program = handler.NewProgramHandler(programRepo, contentRepo, programSubstageRepo)
	registry.Content = handler.NewContentHandler(cfg, contentRepo)
	registry.Session = handler.NewSessionHandler(sessionUC)
	registry.SessionLifecycle = handler.NewSessionLifecycleHandler(sessionUC)
	registry.SessionStage = handler.NewSessionStageHandler(sessionUC)
	registry.SessionGroup = handler.NewSessionGroupHandler(sessionUC)
	registry.SessionParticipant = handler.NewSessionParticipantHandler(sessionUC)
	registry.SessionParticipantBulk = handler.NewSessionParticipantBulkHandler(sessionUC)
	registry.Kiosk = handler.NewKioskHandler(authUC, sessionUC, contentRepo, sessionSubstageRepo, liveRepo)
	registry.ProgramSubstage = handler.NewProgramSubstageHandler(programSubstageRepo)
	registry.SessionSubstage = handler.NewSessionSubstageHandler(badgeUC, sessionUC, sessionSubstageRepo, sessionRepo)
	registry.Badge = handler.NewBadgeHandler(sessionSubstageRepo)
	registry.Live = handler.NewLiveHandler(liveSvc, hub, cfg.SSEKeepaliveSec)
	registry.Notification = handler.NewNotificationHandler(liveSvc, hub, cfg.SSEKeepaliveSec)
	registry.Assessment = handler.NewAssessmentHandler(assessmentUC)
	registry.Photo = handler.NewPhotoHandler(photoRepo)
	registry.Report = handler.NewReportHandler(reportsUC, cfg, sessionRepo, hub)
	registry.MissionBank = handler.NewMissionBankHandler(missionBankRepo)
	registry.ParticipantMission = handler.NewParticipantMissionHandler(participantMissionRepo)
	registry.Consent = handler.NewConsentHandler(consentRepo, sessionRepo, messaging.NewWhatsAppGateway(cfg), cfg, hub)
	registry.Frame = handler.NewFrameHandler(frameRepo)
	registry.Upload = handler.NewUploadHandler(cfg, photoRepo, frameRepo, contentRepo, userRepo, consentRepo)
	registry.Media = handler.NewMediaHandler(cfg, photoRepo, consentRepo, sessionRepo, frameRepo, contentRepo, userRepo)

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
