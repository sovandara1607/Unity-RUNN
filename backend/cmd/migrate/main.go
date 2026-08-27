package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

const migrationsDir = "migrations"

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	if len(os.Args) < 2 {
		return fmt.Errorf("usage: migrate <up|down|status|redo>")
	}
	command := os.Args[1]

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL is not set")
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set dialect: %w", err)
	}

	switch command {
	case "up":
		return goose.Up(db, migrationsDir)
	case "down":
		return goose.Down(db, migrationsDir)
	case "status":
		return goose.Status(db, migrationsDir)
	case "redo":
		return goose.Redo(db, migrationsDir)
	default:
		return fmt.Errorf("unknown command %q", command)
	}
}
