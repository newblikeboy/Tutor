package mailer

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"io"
	"math/big"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/textproto"
	"strings"
	"testing"
	"time"
)

func TestSMTPVerifiedTLSAndAcceptance(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "loopback SMTP fixture"}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(time.Hour), IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, IsCA: true, BasicConstraintsValid: true}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	certificate, err := tls.X509KeyPair(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	roots.AppendCertsFromPEM(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	for _, tc := range []struct {
		name, mode, reply    string
		ambiguous, permanent bool
	}{{"starttls accepted", "starttls", "250 Accepted", false, false}, {"implicit TLS accepted", "tls", "250 Accepted", false, false}, {"temporary rejection", "starttls", "451 Retry later", false, false}, {"permanent rejection", "starttls", "550 Rejected", false, true}, {"acknowledgement lost", "tls", "", true, false}} {
		t.Run(tc.name, func(t *testing.T) {
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			received := make(chan []byte, 1)
			done := make(chan error, 1)
			go func() {
				conn, err := listener.Accept()
				if err != nil {
					done <- err
					return
				}
				defer conn.Close()
				conn.SetDeadline(time.Now().Add(5 * time.Second))
				cfg := &tls.Config{Certificates: []tls.Certificate{certificate}, MinVersion: tls.VersionTLS12}
				if tc.mode == "tls" {
					conn = tls.Server(conn, cfg)
				}
				protocol := textproto.NewConn(conn)
				protocol.PrintfLine("220 Fixture SMTP")
				secured := tc.mode == "tls"
				for {
					line, e := protocol.ReadLine()
					if e != nil {
						done <- e
						return
					}
					switch {
					case strings.HasPrefix(line, "EHLO"):
						if secured {
							protocol.PrintfLine("250-fixture\r\n250 AUTH PLAIN")
						} else {
							protocol.PrintfLine("250-fixture\r\n250 STARTTLS")
						}
					case line == "STARTTLS":
						protocol.PrintfLine("220 Begin TLS")
						conn = tls.Server(conn, cfg)
						protocol = textproto.NewConn(conn)
						secured = true
					case strings.HasPrefix(line, "AUTH PLAIN"):
						if !secured {
							done <- errors.New("credentials sent without TLS")
							return
						}
						protocol.PrintfLine("235 Authenticated")
					case strings.HasPrefix(line, "MAIL FROM:"), strings.HasPrefix(line, "RCPT TO:"):
						protocol.PrintfLine("250 OK")
					case line == "DATA":
						protocol.PrintfLine("354 Send content")
						body, e := io.ReadAll(protocol.DotReader())
						if e != nil {
							done <- e
							return
						}
						received <- body
						if tc.reply != "" {
							protocol.PrintfLine("%s", tc.reply)
						}
						done <- nil
						return
					default:
						done <- errors.New("unexpected SMTP command")
						return
					}
				}
			}()
			host, port, _ := net.SplitHostPort(listener.Addr().String())
			sender := SMTP{Host: host, Port: port, Security: tc.mode, User: "fixture-user", Password: "fixture-secret", From: "support@gocoaching.in", roots: roots}
			content, err := Render(TemplateData{Name: "Fictional parent", Title: "Your sign-in code", Code: "123456", Support: "support@gocoaching.in"})
			if err != nil {
				t.Fatal(err)
			}
			err = sender.Send(context.Background(), Message{ID: "stable-id", To: "parent@example.test", Content: content})
			if tc.reply == "250 Accepted" {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				var smtpErr *Error
				if !errors.As(err, &smtpErr) || smtpErr.Ambiguous != tc.ambiguous || smtpErr.Permanent != tc.permanent {
					t.Fatalf("incorrect SMTP outcome: %v", err)
				}
			}
			if err := <-done; err != nil {
				t.Fatal(err)
			}
			message, err := mail.ReadMessage(bytes.NewReader(<-received))
			if err != nil {
				t.Fatal(err)
			}
			_, params, err := mime.ParseMediaType(message.Header.Get("Content-Type"))
			if err != nil {
				t.Fatal(err)
			}
			parts := multipart.NewReader(message.Body, params["boundary"])
			for _, kind := range []string{"text/plain", "text/html"} {
				part, err := parts.NextPart()
				if err != nil {
					t.Fatal(err)
				}
				if !strings.HasPrefix(part.Header.Get("Content-Type"), kind) {
					t.Fatal("missing alternative")
				}
				body, _ := io.ReadAll(part)
				if !strings.Contains(string(body), "123456") || !strings.Contains(string(body), "GoCoaching") {
					t.Fatal("missing utility content")
				}
			}
			if message.Header.Get("Message-ID") != "<stable-id@gocoaching.in>" || message.Header.Get("Reply-To") != "<support@gocoaching.in>" {
				t.Fatal("unstable or unbranded headers")
			}
		})
	}
}

func TestEmailEscapingAndHeaderInjection(t *testing.T) {
	content, err := Render(TemplateData{Name: "<script>name</script>", Title: "Trial confirmed", Details: []Detail{{Label: "Learner", Value: "<img src=x onerror=alert(1)>"}}, Support: "support@gocoaching.in"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(content.HTML, "<script>") || strings.Contains(content.HTML, "<img src=x") || !strings.Contains(content.HTML, "&lt;script&gt;") {
		t.Fatal("unsafe template escaping")
	}
	if _, err = MIME("support@gocoaching.in", Message{ID: "id", To: "parent@example.test", Content: Content{Subject: "Header\r\nBcc: attacker@example.test"}}, time.Now()); err == nil {
		t.Fatal("header injection accepted")
	}
	data, err := MIME("support@gocoaching.in", Message{ID: "id", To: "parent@example.test", Content: content}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	// Decode a raw MIME alternative too, so transfer encoding remains valid.
	msg, _ := mail.ReadMessage(bufio.NewReader(bytes.NewReader(data)))
	_, params, _ := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	part, _ := multipart.NewReader(msg.Body, params["boundary"]).NextRawPart()
	if _, err = io.ReadAll(quotedprintable.NewReader(part)); err != nil {
		t.Fatal(err)
	}
}
