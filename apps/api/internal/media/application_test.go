package media

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func testMP4() []byte {
	box := func(kind string, content []byte) []byte {
		b := make([]byte, 8)
		binary.BigEndian.PutUint32(b, uint32(len(content)+8))
		copy(b[4:], kind)
		return append(b, content...)
	}
	data := box("ftyp", []byte{'i', 's', 'o', 'm', 0, 0, 0, 0, 'i', 's', 'o', 'm', 'm', 'p', '4', '2'})
	data = append(data, box("moov", []byte{0, 0, 0, 0})...)
	return append(data, box("mdat", bytes.Repeat([]byte{1}, 1024))...)
}
func TestApplicationVideoFramingAndLimits(t *testing.T) {
	data := testMP4()
	name, kind, e := ValidateApplication(`..\demo.mp4`, data)
	if e != nil || name != "demo.mp4" || kind != "video/mp4" {
		t.Fatal("valid container rejected", e)
	}
	if _, _, e = Validate("demo.mp4", data); e == nil {
		t.Fatal("video accepted outside application validation")
	}
	cases := [][]byte{data[:len(data)-1], append(append([]byte{}, data...), 1), make([]byte, MaxVideoBytes+1), data[:24], []byte("<script>not a video</script>")}
	for _, bad := range cases {
		if _, _, e = ValidateApplication("demo.mp4", bad); e == nil {
			t.Fatal("invalid video framing accepted")
		}
	}
	bad := append([]byte{}, data...)
	binary.BigEndian.PutUint32(bad[24:28], 0xffffffff)
	if _, _, e = ValidateApplication("demo.mp4", bad); e == nil {
		t.Fatal("oversized box accepted")
	}
	if _, _, e = ValidateApplication("demo.pdf", data); e == nil {
		t.Fatal("extension mismatch accepted")
	}
}
