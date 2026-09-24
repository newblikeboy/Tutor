package media

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"net"
	"strings"
	"time"
)

type Scanner interface {
	Scan(context.Context, []byte) (bool, error)
}
type ClamAV struct{ Address string }

func (c ClamAV) Scan(ctx context.Context, data []byte) (bool, error) {
	fail := errors.New("file scanner unavailable")
	if len(data) > MaxVideoBytes {
		return false, fail
	}
	conn, e := (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "tcp", c.Address)
	if e != nil {
		return false, fail
	}
	defer conn.Close()
	deadline := time.Now().Add(8 * time.Second)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)
	if _, e = conn.Write([]byte("zINSTREAM\x00")); e != nil {
		return false, fail
	}
	for start := 0; start < len(data); start += 32768 {
		chunk := data[start:min(start+32768, len(data))]
		var size [4]byte
		binary.BigEndian.PutUint32(size[:], uint32(len(chunk)))
		if _, e = conn.Write(size[:]); e != nil {
			return false, fail
		}
		if _, e = conn.Write(chunk); e != nil {
			return false, fail
		}
	}
	if _, e = conn.Write(make([]byte, 4)); e != nil {
		return false, fail
	}
	reader := bufio.NewReaderSize(conn, 4096)
	response, e := reader.ReadSlice(0)
	if e != nil {
		return false, fail
	}
	result := strings.TrimSuffix(string(response), "\x00")
	if result == "stream: OK" {
		return true, nil
	}
	if strings.HasPrefix(result, "stream: ") && strings.HasSuffix(result, " FOUND") {
		return false, nil
	}
	return false, fail
}
