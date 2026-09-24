package media

import (
	"bufio"
	"context"
	"encoding/binary"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPrivateDiskAndFileValidation(t *testing.T) {
	dir := t.TempDir()
	if _, e := NewDisk(filepath.Join(dir, "public", "files")); e == nil {
		t.Fatal("public storage root accepted")
	}
	disk, e := NewDisk(dir)
	if e != nil {
		t.Fatal(e)
	}
	key := strings.Repeat("a", 64)
	data := []byte("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF")
	name, kind, e := Validate(`..\private\lesson.pdf`, data)
	if e != nil || name != "lesson.pdf" || kind != "application/pdf" {
		t.Fatal("valid file rejected")
	}
	if e = disk.Put(context.Background(), key, data); e != nil {
		t.Fatal(e)
	}
	if e = disk.Put(context.Background(), key, data); e != nil {
		t.Fatal("identical retry failed")
	}
	if e = disk.Put(context.Background(), key, []byte("changed")); e == nil {
		t.Fatal("immutable disk object overwritten")
	}
	restarted, _ := NewDisk(dir)
	got, e := restarted.Read(context.Background(), key)
	if e != nil || string(got) != string(data) {
		t.Fatal("file did not persist")
	}
	for _, bad := range []string{"../../outside", "C:\\private", key + ":stream", key + "/child"} {
		if _, e = disk.Read(context.Background(), bad); e == nil {
			t.Fatal("unsafe path read")
		}
		if e = disk.Put(context.Background(), bad, data); e == nil {
			t.Fatal("unsafe path write")
		}
	}
	for _, bad := range []struct {
		name string
		data []byte
	}{{"lesson.jpg", data}, {"lesson.pdf", []byte("<script>alert(1)</script>")}, {"bad.png", []byte{137, 80, 78, 71, 13, 10, 26, 10}}, {"big.pdf", make([]byte, MaxBytes+1)}} {
		if _, _, e = Validate(bad.name, bad.data); e == nil {
			t.Fatal("bad type accepted")
		}
	}
	files, _ := os.ReadDir(dir)
	if len(files) != 1 {
		t.Fatal("unexpected files created")
	}
}
func TestClamAVStreamProtocol(t *testing.T) {
	for _, tc := range []struct {
		response   string
		clean, err bool
	}{{"stream: OK\x00", true, false}, {"stream: Eicar-Test-Signature FOUND\x00", false, false}, {"stream: size limit ERROR\x00", false, true}} {
		t.Run(strings.Trim(tc.response, "\x00"), func(t *testing.T) {
			listener, e := net.Listen("tcp", "127.0.0.1:0")
			if e != nil {
				t.Fatal(e)
			}
			defer listener.Close()
			done := make(chan error, 1)
			go func() {
				c, e := listener.Accept()
				if e != nil {
					done <- e
					return
				}
				defer c.Close()
				r := bufio.NewReader(c)
				command, e := r.ReadString(0)
				if e != nil || command != "zINSTREAM\x00" {
					done <- ErrStorage
					return
				}
				var all []byte
				for {
					var size uint32
					if e = binary.Read(r, binary.BigEndian, &size); e != nil {
						done <- e
						return
					}
					if size == 0 {
						break
					}
					chunk := make([]byte, size)
					if _, e = io.ReadFull(r, chunk); e != nil {
						done <- e
						return
					}
					all = append(all, chunk...)
				}
				if string(all) != "file contents" {
					done <- ErrStorage
					return
				}
				_, e = c.Write([]byte(tc.response))
				done <- e
			}()
			clean, e := (ClamAV{Address: listener.Addr().String()}).Scan(context.Background(), []byte("file contents"))
			if clean != tc.clean || (e != nil) != tc.err {
				t.Fatal("scanner verdict mismatch")
			}
			if e = <-done; e != nil {
				t.Fatal(e)
			}
		})
	}
}
