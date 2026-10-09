package domain

import (
	"reflect"
	"testing"
)

func TestClassBasedBookingSubjects(t *testing.T) {
	for _, class := range []int{1, 5} {
		got, err := BookingSubjects(class, []string{AllSubjects})
		if err != nil || !reflect.DeepEqual(got, []string{AllSubjects}) {
			t.Fatal(got, err)
		}
		if _, err = BookingSubjects(class, []string{"Mathematics"}); err == nil {
			t.Fatal("individual primary-class subject accepted")
		}
	}
	got, err := BookingSubjects(6, []string{"Science", "Mathematics"})
	if err != nil || !reflect.DeepEqual(got, []string{"Mathematics", "Science"}) {
		t.Fatal(got, err)
	}
	for _, subjects := range [][]string{nil, {AllSubjects}, {"Science", "Science"}, {"Unknown"}} {
		if _, err := BookingSubjects(6, subjects); err == nil {
			t.Fatalf("invalid subjects accepted: %v", subjects)
		}
	}
	legacy := Scope{Subject: "Mathematics"}
	if !legacy.CoversSubjects([]string{"Mathematics"}) || legacy.CoversSubjects([]string{"Mathematics", "Science"}) {
		t.Fatal("legacy approval widened")
	}
	approved := Scope{Subject: "Mathematics", Subjects: []string{"Mathematics", "Science"}}
	if !approved.CoversSubjects(got) || approved.CoversSubjects([]string{AllSubjects}) {
		t.Fatal("explicit subject scope ignored")
	}
}
