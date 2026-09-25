package main

import (
	"context"
	"errors"
	"flag"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"log"
	"strings"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/storage"
)

func main() {
	staffOnly := flag.Bool("staff-only", false, "Apply staff indexes and validation to existing core collections only")
	applicationOnly := flag.Bool("application-only", false, "Apply application and staff validation/indexes to existing collections only")
	inboxOnly := flag.Bool("inbox-only", false, "Apply additive encrypted inbox collections and indexes only")
	flag.Parse()
	if e := config.LoadDevelopmentEnv(); e != nil {
		log.Fatal(e)
	}
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
	if *inboxOnly {
		e = s.MigrateInbox(ctx)
	} else if *staffOnly || *applicationOnly {
		e = s.MigrateStaff(ctx)
	} else {
		e = s.Migrate(ctx)
	}
	if e != nil {
		var command mongo.CommandError
		if errors.As(e, &command) {
			log.Printf("Migration command failed: code=%d name=%s", command.Code, command.Name)
			if strings.Contains(strings.ToLower(command.Message), "collections") || strings.Contains(strings.ToLower(command.Message), "quota") {
				log.Print("Atlas reports a collection/resource limit; inspect retained test databases with scripts/db-diagnostics.mjs")
			}
		}
		log.Fatal("Migration failed; check database privileges")
	}
	log.Print("Schema validation and indexes applied")
}
