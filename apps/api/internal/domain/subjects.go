package domain

import "slices"

const AllSubjects = "All Subjects"

var TeachingSubjects = []string{"Mathematics", "Science", "English", "Hindi", "Social Science"}

func ValidSubject(subject string) bool {
	return subject == AllSubjects || slices.Contains(TeachingSubjects, subject)
}

// Older approvals contain a single subject. Never infer approval from an application request.
func (s Scope) ApprovedSubjects() []string {
	if len(s.Subjects) > 0 {
		return s.Subjects
	}
	return []string{s.Subject}
}

func (s Scope) CoversSubjects(subjects []string) bool {
	for _, subject := range subjects {
		if !slices.Contains(s.ApprovedSubjects(), subject) {
			return false
		}
	}
	return len(subjects) > 0
}

// Booking subjects and prices are determined from the saved learner class.
func BookingSubjects(class int, selected []string) ([]string, error) {
	if class < 1 || class > 12 || len(selected) == 0 || len(selected) > len(TeachingSubjects) {
		return nil, Fail(422, "subjects_required", "Select the subjects to book.")
	}
	if class <= 5 {
		if len(selected) != 1 || selected[0] != AllSubjects {
			return nil, Fail(422, "subject_scope", "Classes 1–5 use the All Subjects package.")
		}
		return []string{AllSubjects}, nil
	}
	seen := map[string]bool{}
	for _, subject := range selected {
		if !slices.Contains(TeachingSubjects, subject) || seen[subject] {
			return nil, Fail(422, "subject_scope", "Select each individual subject once for Class 6 onwards.")
		}
		seen[subject] = true
	}
	out := []string{}
	for _, subject := range TeachingSubjects {
		if seen[subject] {
			out = append(out, subject)
		}
	}
	return out, nil
}
