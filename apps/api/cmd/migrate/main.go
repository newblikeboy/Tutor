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
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	s, e := storage.Connect(ctx, c.URI, c.Database)
	if e != nil {
		log.Fatal("Database connection failed; check private configuration")
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		log.Fatal("Migration failed; check database privileges")
	}
	log.Print("Schema validation and indexes applied")
}
