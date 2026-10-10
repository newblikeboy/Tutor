package app

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/mailer"
	"tutorplatform/internal/storage"
)

type blockedUpdateSender struct {
	updateID string
	started  chan struct{}
	release  chan struct{}
	sent     chan string
}

func (s *blockedUpdateSender) Send(ctx context.Context, m mailer.Message) error {
	if m.ID == digest(s.updateID) {
		close(s.started)
		select {
		case <-s.release:
		case <-ctx.Done():
			return &mailer.Error{}
		}
	}
	s.sent <- m.ID
	return nil
}

func emailQueueFixture(t *testing.T) (*App, *storage.Store, config.Config) {
	t.Helper()
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	s, err := storage.Connect(context.Background(), uri, "tutor_test_email_queue_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Client.Disconnect(context.Background()) })
	if err = s.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err = s.Seed(context.Background(), "test"); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", SMTPFrom: "support@gocoaching.in", MailTokenKey: base64.StdEncoding.EncodeToString(make([]byte, 32))}
	a := New(s, cfg)
	a.Mail = &testEmailSender{}
	return a, s, cfg
}

func TestMongoEmailQueuePriority(t *testing.T) {
	t.Run("committed code wakes its reserved worker while an update is blocked", func(t *testing.T) {
		a, s, _ := emailQueueFixture(t)
		ctx, cancel := context.WithCancel(context.Background())
		sender := &blockedUpdateSender{updateID: "blocked-update", started: make(chan struct{}), release: make(chan struct{}), sent: make(chan string, 4)}
		a.Mail = sender
		if err := a.enqueue(ctx, sender.updateID, "email", bson.M{"event": "password_changed", "recipientId": "parent-a"}, "pending"); err != nil {
			t.Fatal(err)
		}
		var workers sync.WaitGroup
		for _, codes := range []bool{true, false} {
			workers.Add(1)
			go func() { defer workers.Done(); a.runEmailWorker(ctx, codes) }()
		}
		defer func() { close(sender.release); cancel(); workers.Wait() }()
		select {
		case <-sender.started:
		case <-time.After(3 * time.Second):
			t.Fatal("ordinary delivery did not start")
		}
		server := httptest.NewServer(a.Routes())
		defer server.Close()
		client := &testClient{t: t, http: &http.Client{Timeout: 10 * time.Second}, base: server.URL}
		response := client.ok("POST", "/auth/email/request", map[string]any{"email": "parent-a@example.test", "purpose": "login"}, 202)
		id := "email-code:" + response["challengeId"].(string)
		select {
		case sent := <-sender.sent:
			if sent != digest(id) {
				t.Fatal("another message took authentication capacity")
			}
		case <-time.After(2 * time.Second):
			t.Fatal("OTP waited for the blocked update or old five-second poll")
		}
		code, err := storage.One[emailChallenge](ctx, s, "email_challenges", bson.M{"_id": response["challengeId"]})
		if err != nil || code.Purpose != "login" {
			t.Fatal("worker ran before code transaction committed", err)
		}
		update, err := storage.One[job](ctx, s, "outbox", bson.M{"_id": sender.updateID})
		if err != nil || update.Status != "processing" {
			t.Fatal("slow update was not still in progress", err)
		}
	})

	t.Run("updates precede reminders but reminder turns and future jobs are preserved", func(t *testing.T) {
		a, s, _ := emailQueueFixture(t)
		ctx := context.Background()
		now := time.Now().UTC().Truncate(time.Millisecond)
		a.Now = func() time.Time { return now }
		sender := a.Mail.(*testEmailSender)
		for i := 0; i < 10; i++ {
			if err := a.enqueue(ctx, fmt.Sprintf("update-%02d", i), "email", bson.M{"event": "password_changed", "recipientId": "parent-a"}, "pending"); err != nil {
				t.Fatal(err)
			}
		}
		trial := domain.Trial{ID: "priority-trial", OwnerID: "parent-a", TutorID: "tutor-meera", LearnerName: "Fictional learner", Class: 8, Subject: "Mathematics", Subjects: []string{"Mathematics"}, Mode: "online", Status: "confirmed", Start: now.Add(time.Hour), End: now.Add(2 * time.Hour), Version: 1}
		if _, err := s.C("trials").InsertOne(ctx, trial); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 2; i++ {
			payload := bson.M{"event": "reminder", "recipientId": "parent-a", "targetKind": "trial", "targetId": trial.ID, "tutorId": trial.TutorID, "start": trial.Start.Format(time.RFC3339Nano), "due": now.Format(time.RFC3339Nano), "lead": "1 hour"}
			if err := a.enqueue(ctx, fmt.Sprintf("reminder-%d", i), "email", payload, "pending"); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := s.C("outbox").UpdateMany(ctx, bson.M{"payload.event": "reminder"}, bson.M{"$set": bson.M{"availableAt": now.Add(-time.Minute)}}); err != nil {
			t.Fatal(err)
		}
		for _, id := range []string{"future-update", "auth-reserved"} {
			event := "password_changed"
			if id == "auth-reserved" {
				event = "auth_code"
			}
			if err := a.enqueue(ctx, id, "email", bson.M{"event": event, "recipientId": "parent-a"}, "pending"); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := s.C("outbox").UpdateOne(ctx, bson.M{"_id": "future-update"}, bson.M{"$set": bson.M{"availableAt": now.Add(time.Hour)}}); err != nil {
			t.Fatal(err)
		}
		if n, err := a.runJobBatch(ctx, 25); err != nil || n != 0 {
			t.Fatalf("provider worker consumed email: %d %v", n, err)
		}
		if n, err := a.runEmailBatch(ctx, 10, false); err != nil || n != 10 {
			t.Fatalf("email batch bound: %d %v", n, err)
		}
		sender.mu.Lock()
		messages := append([]mailer.Message(nil), sender.messages...)
		sender.mu.Unlock()
		if len(messages) != 10 {
			for _, id := range []string{"reminder-0", "reminder-1"} {
				j, e := storage.One[job](ctx, s, "outbox", bson.M{"_id": id})
				t.Logf("reminder %s: status=%s error=%s lookup=%v", id, j.Status, j.LastError, e)
			}
			t.Fatalf("expected ten submitted messages, got %d", len(messages))
		}
		if messages[0].ID != digest("update-00") || messages[4].ID != digest("reminder-0") || messages[9].ID != digest("reminder-1") {
			t.Fatal("priority or four-update fairness was lost")
		}
		for _, id := range []string{"future-update", "auth-reserved"} {
			j, err := storage.One[job](ctx, s, "outbox", bson.M{"_id": id})
			if err != nil || j.Status != "pending" || j.Attempts != 0 {
				t.Fatal("future or reserved job claimed by ordinary worker", id, err)
			}
		}
	})

	t.Run("multiple API workers retain exclusive code leases and acceptance recovery", func(t *testing.T) {
		a, s, cfg := emailQueueFixture(t)
		ctx := context.Background()
		server := httptest.NewServer(a.Routes())
		defer server.Close()
		client := &testClient{t: t, http: &http.Client{Timeout: 10 * time.Second}, base: server.URL}
		response := client.ok("POST", "/auth/email/request", map[string]any{"email": "parent-a@example.test", "purpose": "login"}, 202)
		select {
		case <-a.EmailCodeWake:
		default:
			t.Fatal("committed request did not signal the code worker")
		}
		a2 := New(s, cfg)
		a2.Mail = a.Mail
		var workers sync.WaitGroup
		for _, instance := range []*App{a, a2} {
			workers.Add(1)
			go func() {
				defer workers.Done()
				if _, err := instance.runEmailBatch(ctx, 25, true); err != nil {
					t.Error(err)
				}
			}()
		}
		workers.Wait()
		id := "email-code:" + response["challengeId"].(string)
		j, err := storage.One[job](ctx, s, "outbox", bson.M{"_id": id})
		if err != nil || j.Status != "done" || j.Attempts != 1 || j.SMTPAcceptedAt == nil {
			t.Fatal("code lease not exclusive", err)
		}
		if _, err := s.C("outbox").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"status": "processing", "leaseUntil": a.Now().Add(-time.Minute)}}); err != nil {
			t.Fatal(err)
		}
		if n, err := a2.runEmailBatch(ctx, 25, true); err != nil || n != 1 {
			t.Fatalf("expired lease not recovered: %d %v", n, err)
		}
		sender := a.Mail.(*testEmailSender)
		sender.mu.Lock()
		defer sender.mu.Unlock()
		if len(sender.messages) != 1 {
			t.Fatal("accepted code submitted twice after lease recovery")
		}
	})
}
