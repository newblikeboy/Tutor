package mailer

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"
)

type Content struct{ Subject, Text, HTML string }
type Message struct {
	ID, To  string
	Content Content
}
type Sender interface {
	Send(context.Context, Message) error
}
type SMTP struct {
	Host, Port, Security, User, Password, From string
	// Package tests supply a private CA; application construction uses system roots.
	roots *x509.CertPool
}

// Ambiguous submissions need review instead of automatic duplicate delivery.
type Error struct{ Ambiguous, Permanent bool }

func (e *Error) Error() string { return "SMTP submission could not be confirmed" }

func (s *SMTP) Send(ctx context.Context, m Message) error {
	if !validAddress(s.From) || !validAddress(m.To) || strings.ContainsAny(m.Content.Subject+m.ID, "\r\n") {
		return &Error{Permanent: true}
	}
	connection, err := (&net.Dialer{Timeout: 8 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(s.Host, s.Port))
	if err != nil {
		return &Error{}
	}
	defer connection.Close()
	deadline := time.Now().Add(8 * time.Second)
	if until, ok := ctx.Deadline(); ok && until.Before(deadline) {
		deadline = until
	}
	_ = connection.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { _ = connection.Close() })
	defer stop()
	security := &tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12, RootCAs: s.roots}
	if s.Security == "tls" {
		secured := tls.Client(connection, security)
		if secured.HandshakeContext(ctx) != nil {
			return &Error{}
		}
		connection = secured
	}
	client, err := smtp.NewClient(connection, s.Host)
	if err != nil {
		return &Error{}
	}
	defer client.Close()
	if err = client.Hello("gocoaching.in"); err != nil {
		return classify(err, false)
	}
	if s.Security == "starttls" {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return &Error{Permanent: true}
		}
		if err = client.StartTLS(security); err != nil {
			return classify(err, false)
		}
	} else if s.Security != "tls" {
		return &Error{Permanent: true}
	}
	if err = client.Auth(smtp.PlainAuth("", s.User, s.Password, s.Host)); err != nil {
		return classify(err, false)
	}
	if err = client.Mail(s.From); err != nil {
		return classify(err, false)
	}
	if err = client.Rcpt(m.To); err != nil {
		return classify(err, false)
	}
	body, err := MIME(s.From, m, time.Now())
	if err != nil {
		return &Error{Permanent: true}
	}
	writer, err := client.Data()
	if err != nil {
		return classify(err, false)
	}
	if _, err = writer.Write(body); err != nil {
		return classify(err, false)
	}
	if err = writer.Close(); err != nil {
		return classify(err, true)
	}
	// The final DATA acknowledgement establishes SMTP acceptance. QUIT cannot undo it.
	return nil
}
func classify(err error, ambiguous bool) error {
	var reply *textproto.Error
	if errors.As(err, &reply) {
		return &Error{Permanent: reply.Code >= 500}
	}
	return &Error{Ambiguous: ambiguous}
}
func validAddress(value string) bool {
	a, err := mail.ParseAddress(value)
	return err == nil && a.Address == value && !strings.ContainsAny(value, "\r\n")
}
func MIME(from string, m Message, now time.Time) ([]byte, error) {
	if !validAddress(from) || !validAddress(m.To) || strings.ContainsAny(m.Content.Subject+m.ID, "\r\n") {
		return nil, fmt.Errorf("invalid email envelope")
	}
	var body bytes.Buffer
	parts := multipart.NewWriter(&body)
	fmt.Fprintf(&body, "From: GoCoaching <%s>\r\nTo: <%s>\r\nReply-To: <%s>\r\nSubject: %s\r\nDate: %s\r\nMessage-ID: <%s@gocoaching.in>\r\nMIME-Version: 1.0\r\nAuto-Submitted: auto-generated\r\nX-Auto-Response-Suppress: All\r\nContent-Type: multipart/alternative; boundary=%q\r\n\r\n", from, m.To, from, mime.QEncoding.Encode("UTF-8", m.Content.Subject), now.Format(time.RFC1123Z), m.ID, parts.Boundary())
	for _, part := range []struct{ kind, value string }{{"text/plain", m.Content.Text}, {"text/html", m.Content.HTML}} {
		w, err := parts.CreatePart(textproto.MIMEHeader{"Content-Type": {part.kind + "; charset=UTF-8"}, "Content-Transfer-Encoding": {"quoted-printable"}})
		if err != nil {
			return nil, err
		}
		encoded := quotedprintable.NewWriter(w)
		if _, err = encoded.Write([]byte(part.value)); err != nil {
			return nil, err
		}
		if err = encoded.Close(); err != nil {
			return nil, err
		}
	}
	if err := parts.Close(); err != nil {
		return nil, err
	}
	return body.Bytes(), nil
}
