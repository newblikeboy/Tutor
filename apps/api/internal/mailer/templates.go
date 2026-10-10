package mailer

import (
	"bytes"
	"html/template"
	"strings"
)

type Detail struct{ Label, Value string }
type TemplateData struct {
	Name, Title, Intro, Code, Action, URL, Notice, Support string
	Details                                                []Detail
}

var branded = template.Must(template.New("utility").Parse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{.Title}} | GoCoaching</title></head><body style="margin:0;background:#f8f7f4;color:#173b3f;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 16px"><table role="presentation" style="width:100%;max-width:600px;margin:auto;border-collapse:collapse;background:white;border:1px solid #dce3d8"><tr><td style="padding:28px 32px;background:#173b3f;color:white"><span style="font-size:28px;font-weight:bold;letter-spacing:-1px">GoCoaching</span><br><span style="font-size:12px;letter-spacing:0.5px;line-height:1.7;color:#e6edd7">GOOD TEACHING. THOUGHTFULLY CONNECTED.</span></td></tr><tr><td style="padding:32px"><p style="font-size:15px;margin:0 0 20px">Hello{{if .Name}} {{.Name}}{{end}},</p><h1 style="font-size:25px;line-height:1.3;margin:0 0 16px">{{.Title}}</h1><p style="font-size:16px;line-height:1.7;margin:0 0 24px">{{.Intro}}</p>{{if .Code}}<div style="padding:24px;text-align:center;background:#edf2e3;border:1px solid #dce3d8;margin-bottom:24px"><span style="font-size:34px;font-weight:bold;letter-spacing:8px">{{.Code}}</span><p style="margin:12px 0 0;font-size:14px">Valid for 10 minutes. Never share this code.</p></div>{{end}}{{if .Details}}<table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:24px">{{range .Details}}<tr><td style="padding:12px 0;border-bottom:1px solid #e3e7df;font-size:14px;color:#526365;width:35%;vertical-align:top">{{.Label}}</td><td style="padding:12px 0 12px 16px;border-bottom:1px solid #e3e7df;font-size:15px;line-height:1.5;overflow-wrap:anywhere">{{.Value}}</td></tr>{{end}}</table>{{end}}{{if .URL}}<p style="margin:28px 0"><a href="{{.URL}}" style="display:inline-block;padding:15px 22px;background:#173b3f;color:white;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold">{{.Action}}</a></p><p style="font-size:12px;color:#526365;line-height:1.6;overflow-wrap:anywhere">Button not opening? Copy this link:<br><a href="{{.URL}}" style="color:#285e4c">{{.URL}}</a></p>{{end}}{{if .Notice}}<p style="padding:16px;background:#f5f6ef;font-size:14px;line-height:1.7">{{.Notice}}</p>{{end}}<p style="font-size:14px;line-height:1.7;margin:24px 0 0">Need help? Email <a href="mailto:{{.Support}}" style="color:#285e4c">{{.Support}}</a>.</p></td></tr><tr><td style="padding:22px 32px;background:#edf2e3;font-size:12px;color:#526365;line-height:1.7">GoCoaching · gocoaching.in<br>This is a service email about your account or classes. Manage class reminder emails in Account. Academic notes and private addresses remain inside your account.</td></tr></table></td></tr></table></body></html>`))

func Render(d TemplateData) (Content, error) {
	var html bytes.Buffer
	if err := branded.Execute(&html, d); err != nil {
		return Content{}, err
	}
	var text strings.Builder
	text.WriteString("GoCoaching | Good teaching. Thoughtfully connected.\n\nHello " + d.Name + ",\n\n" + d.Title + "\n" + d.Intro + "\n\n")
	if d.Code != "" {
		text.WriteString("Code: " + d.Code + "\nValid for 10 minutes. Never share this code.\n\n")
	}
	for _, detail := range d.Details {
		text.WriteString(detail.Label + ": " + detail.Value + "\n")
	}
	if d.URL != "" {
		text.WriteString("\n" + d.Action + ": " + d.URL + "\n")
	}
	text.WriteString("\n" + d.Notice + "\n\nNeed help? " + d.Support + "\nGoCoaching · gocoaching.in\n")
	return Content{Subject: d.Title + " | GoCoaching", Text: text.String(), HTML: html.String()}, nil
}
