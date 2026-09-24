package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"golang.org/x/term"
	"io"
	"os"
	"strings"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/staff"
	"tutorplatform/internal/storage"
)

func main() {
	var in staff.Input
	var pipe bool
	flag.StringVar(&in.Email, "email", "", "Staff email")
	flag.StringVar(&in.Name, "name", "", "Staff display name")
	flag.StringVar(&in.Role, "role", "", "mentor, admin, support or finance")
	flag.StringVar(&in.Operator, "operator", "", "Operator/change-control reference")
	flag.StringVar(&in.Reason, "reason", "", "Reason for least-privilege provisioning")
	flag.BoolVar(&pipe, "password-stdin", false, "Read one password line from an approved secret manager pipe; never use a shell literal")
	flag.Parse()
	if in.Email == "" || in.Name == "" || in.Role == "" || in.Operator == "" || in.Reason == "" {
		flag.Usage()
		os.Exit(2)
	}
	if e := config.LoadDevelopmentEnv(); e != nil {
		fail("Cannot read private configuration")
	}
	c, e := config.Load()
	if e != nil {
		fail("Invalid private configuration")
	}
	if pipe {
		reader := bufio.NewReader(io.LimitReader(os.Stdin, 514))
		line, e := reader.ReadString('\n')
		if e != nil && e != io.EOF {
			fail("Could not read password")
		}
		in.Password = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
	} else {
		if !term.IsTerminal(int(os.Stdin.Fd())) {
			fail("Interactive terminal required, or explicitly use --password-stdin")
		}
		fmt.Fprint(os.Stderr, "New staff password (hidden): ")
		raw, e := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if e != nil {
			fail("Could not read password")
		}
		fmt.Fprint(os.Stderr, "Repeat password (hidden): ")
		repeat, e := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if e != nil || string(raw) != string(repeat) {
			fail("Passwords do not match")
		}
		in.Password = string(raw)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	s, e := storage.Connect(ctx, c.URI, c.Database)
	if e != nil {
		fail("Database connection failed")
	}
	defer s.Client.Disconnect(context.Background())
	if e = staff.Provision(ctx, s, in); e != nil {
		fail("Staff provisioning failed; check fields/password policy and existing account. No existing account was replaced.")
	}
	fmt.Println("Staff account provisioned with an audit record. Production access remains gated until MFA and operator release review. No invitation was sent.")
}
func fail(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }
