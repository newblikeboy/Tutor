// Produces fictional email previews for visual review. Never connects to SMTP.
package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"
	"tutorplatform/internal/mailer"
)

func main() {
	output := flag.String("out", ".local/email-previews", "Private preview output directory")
	flag.Parse()
	if err := os.MkdirAll(*output, 0755); err != nil {
		log.Fatal("Could not create preview directory")
	}
	examples := map[string]mailer.TemplateData{
		"verification":      {Title: "Verify your email address", Intro: "Use this code to confirm this email address belongs to you.", Code: "123456", Notice: "Fictional preview code. Never share your real codes or password."},
		"trial-confirmed":   {Title: "Your trial is confirmed", Intro: "The tutor has accepted the trial. The saved date and time are below.", Details: []mailer.Detail{{Label: "Learner", Value: "Fictional learner"}, {Label: "Subjects", Value: "Mathematics, Science"}, {Label: "Teaching mode", Value: "Online"}, {Label: "Tutor", Value: "Fictional tutor"}, {Label: "Class date and time", Value: "Mon, 12 Oct 2026, 5:00 PM IST"}, {Label: "Duration", Value: "60 minutes"}}, Action: "View trial", URL: "https://gocoaching.in/workspace?view=sessions"},
		"booking-confirmed": {Title: "Regular classes confirmed", Intro: "Payment has been verified and the regular booking is confirmed. Your agreed class schedule is ready to view.", Details: []mailer.Detail{{Label: "Learner", Value: "Fictional learner"}, {Label: "Subjects", Value: "All Subjects"}, {Label: "Teaching mode", Value: "Home Tuition"}, {Label: "Included classes", Value: "24"}, {Label: "Saved booking total", Value: "INR 4800.00"}, {Label: "Class date and time", Value: "Mon, 12 Oct 2026, 5:00 PM IST"}}, Action: "View classes", URL: "https://gocoaching.in/tuition/fictional-preview", Notice: "View the authorised teaching address in your account."},
		"reminder":          {Title: "Class reminder: 1 hour", Intro: "Your confirmed class is coming up. Check the details and be ready a few minutes early.", Details: []mailer.Detail{{Label: "Learner", Value: "Fictional learner"}, {Label: "Subjects", Value: "Mathematics"}, {Label: "Class date and time", Value: "Mon, 12 Oct 2026, 5:00 PM IST"}}, Action: "Open lesson", URL: "https://gocoaching.in/tuition/fictional-preview", Notice: "Open the lesson in your account to use the protected Zoom join control. It opens 15 minutes before the lesson; a meeting must first be prepared by the tutor."},
	}
	for name, data := range examples {
		data.Name = "Fictional parent"
		data.Support = "support@gocoaching.in"
		content, err := mailer.Render(data)
		if err != nil {
			log.Fatal("Could not render preview")
		}
		if err = os.WriteFile(filepath.Join(*output, name+".html"), []byte(content.HTML), 0644); err != nil {
			log.Fatal("Could not save HTML preview")
		}
		if err = os.WriteFile(filepath.Join(*output, name+".txt"), []byte(content.Text), 0644); err != nil {
			log.Fatal("Could not save text preview")
		}
	}
	log.Print("Fictional previews saved; no email was sent")
}
