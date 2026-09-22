package main

import (
	"context"
	"log"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/storage"
)

func main() {
	c, e := config.Load()
	if e != nil {
		log.Fatal(e)
	}
	if c.Env != "development" && c.Env != "test" {
		log.Fatal("Production sample seeding prohibited")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	s, e := storage.Connect(ctx, c.URI, c.Database)
	if e != nil {
		log.Fatal("Database connection failed; check private configuration")
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Seed(ctx, c.Env); e != nil {
		log.Fatal("Seeding failed")
	}
	log.Print("Fictional development identities and tutor profiles seeded idempotently")
}
