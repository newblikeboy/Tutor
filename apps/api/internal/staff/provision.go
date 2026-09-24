package staff

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/mail"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/password"
	"tutorplatform/internal/storage"
	"unicode/utf8"
)

type Input struct{ Name, Email, Role, Password, Operator, Reason string }

func Provision(ctx context.Context, s *storage.Store, in Input) error {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	address, e := mail.ParseAddress(email)
	if e != nil || address.Address != email || len(email) > 254 || !strings.Contains(strings.SplitN(email, "@", 2)[1], ".") || strings.ContainsAny(email, " \t\r\n") {
		return errors.New("valid staff email required")
	}
	in.Name = strings.TrimSpace(in.Name)
	if utf8.RuneCountInString(in.Name) < 2 || utf8.RuneCountInString(in.Name) > 80 || len(strings.TrimSpace(in.Operator)) < 3 || len(in.Operator) > 120 || len(strings.TrimSpace(in.Reason)) < 10 || len(in.Reason) > 1000 {
		return errors.New("bounded staff name, operator reference and reason required")
	}
	switch in.Role {
	case "mentor", "admin", "support", "finance":
	default:
		return errors.New("staff role must be mentor, admin, support or finance")
	}
	if !password.Valid(in.Password) {
		return errors.New("a unique password of 15 to 128 characters is required")
	}
	hash, e := password.Hash(in.Password)
	if e != nil {
		return errors.New("password could not be protected")
	}
	var random [32]byte
	if _, e = rand.Read(random[:]); e != nil {
		return e
	}
	id := hex.EncodeToString(random[:])
	u := domain.User{ID: id, Name: in.Name, Email: email, Role: in.Role, Sample: false}
	return s.Tx(ctx, func(ctx context.Context) error {
		if _, e := s.C("credentials").InsertOne(ctx, bson.M{"_id": email, "userId": id, "passwordHash": hash}); e != nil {
			return e
		}
		if _, e := s.C("users").InsertOne(ctx, u); e != nil {
			return e
		}
		_, e := s.C("audit").InsertOne(ctx, bson.M{"_id": "provision:" + id, "actor": "operator:" + strings.TrimSpace(in.Operator), "action": "staff.provisioned", "target": id, "at": time.Now().UTC(), "reason": strings.TrimSpace(in.Reason), "role": in.Role})
		return e
	})
}
