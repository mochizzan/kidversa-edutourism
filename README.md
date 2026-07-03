# 🌍 Kidversa - Edutourism Platform

> Platform edutourism interaktif berbasis digital storytelling untuk anak-anak

## 🚀 Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI Library |
| TypeScript | 5.x | Type Safety |
| Vite | 6.x | Build Tool & Dev Server |
| Tailwind CSS | 4.x | Utility-first CSS |
| Lucide React | Latest | Icon Library |
| PWA | - | Progressive Web App |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Go | 1.26+ | Programming Language |
| Echo | v4 | Web Framework |
| GORM | Latest | ORM Library |
| SQLite | - | Database (development) |

---

## 📁 Project Structure

```
kidversa-edutourism/
├── frontend/              # React + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── backend/               # Go + Echo + GORM
│   ├── main.go
│   ├── go.mod
│   └── go.sum
├── .gitignore
└── README.md
```

---

## 🏃 Quick Start

### Frontend

```bash
# Install dependencies
cd frontend
pnpm install

# Start development server
pnpm dev
```

Frontend: `http://localhost:5173`

### Backend

```bash
# Install dependencies
cd backend
go mod tidy

# Run server
go run .
```

Backend: `http://localhost:8080`

---

## 🎨 Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Purple | `#5E2E91` | Primary |
| Orange | `#F9A01F` | Accent |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API Information |
| `GET` | `/health` | Health Check |
| `GET` | `/api/stories` | Get All Stories |
| `POST` | `/api/stories` | Create Story |
| `GET` | `/api/destinations` | Get All Destinations |
| `POST` | `/api/destinations` | Create Destination |

---

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org/) >= 18.x
- [pnpm](https://pnpm.io/) >= 8.x
- [Go](https://go.dev/) >= 1.21

---

## 📜 License

MIT © 2025 Kidversa Edutourism
