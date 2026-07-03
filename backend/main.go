package main

import (
	"log"
	"net/http"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type Story struct {
	gorm.Model
	Title       string `json:"title" gorm:"not null"`
	Description string `json:"description"`
	ImageURL    string `json:"image_url"`
	Category    string `json:"category"`
	AgeRange    string `json:"age_range"`
	IsActive    bool   `json:"is_active" gorm:"default:true"`
}

type Destination struct {
	gorm.Model
	Name        string  `json:"name" gorm:"not null"`
	Description string  `json:"description"`
	Address     string  `json:"address"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	ImageURL    string  `json:"image_url"`
	Category    string  `json:"category"`
	IsActive    bool    `json:"is_active" gorm:"default:true"`
}

var db *gorm.DB

func main() {
	var err error
	
	// Initialize database
	db, err = gorm.Open(sqlite.Open("kidversa.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto migrate
	db.AutoMigrate(&Story{}, &Destination{})

	// Initialize Echo
	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:5173", "http://localhost:3000"},
		AllowMethods: []string{http.MethodGet, http.MethodPut, http.MethodPost, http.MethodDelete},
	}))

	// Routes
	e.GET("/", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"message": "Kidversa Edutourism API",
			"version": "0.1.0",
		})
	})

	// API routes
	api := e.Group("/api")
	
	// Stories
	api.GET("/stories", getStories)
	api.POST("/stories", createStory)
	
	// Destinations
	api.GET("/destinations", getDestinations)
	api.POST("/destinations", createDestination)

	// Health check
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "healthy"})
	})

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	
	log.Printf("Server starting on port %s", port)
	e.Start(":" + port)
}

// Handlers
func getStories(c echo.Context) error {
	var stories []Story
	db.Find(&stories)
	return c.JSON(http.StatusOK, stories)
}

func createStory(c echo.Context) error {
	story := new(Story)
	if err := c.Bind(story); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	db.Create(story)
	return c.JSON(http.StatusCreated, story)
}

func getDestinations(c echo.Context) error {
	var destinations []Destination
	db.Find(&destinations)
	return c.JSON(http.StatusOK, destinations)
}

func createDestination(c echo.Context) error {
	destination := new(Destination)
	if err := c.Bind(destination); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	db.Create(destination)
	return c.JSON(http.StatusCreated, destination)
}
