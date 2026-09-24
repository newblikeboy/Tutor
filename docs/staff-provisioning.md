# Operator staff provisioning

Public signup cannot grant staff roles. The Go `cmd/staff` command creates one new mentor, admin, support or finance account and a corresponding audit record in one MongoDB transaction. It never overwrites an existing account, promotes a public account, sends an invitation or grants tutor academic approval.

After migrations, from `apps/api` on the trusted operator host:

```powershell
go run ./cmd/staff --email staff@example.invalid --name "Operator name" --role support --operator "change-reference" --reason "Approved support appointment under reviewed access policy."
```

Replace the example identity and reason with the actual approved appointment. The command prompts for a 15–128 character password twice with terminal echo disabled. There is no default password and no password flag. An approved secret-manager integration can use `--password-stdin`; never put the password in shell history, arguments, Git, a screenshot or chat. Database/configuration errors are sanitised.

The bootstrap host's ability to read database credentials is privileged; restrict it and independently review the recorded operator reference. Production `AUTH_PROVIDER=password` enables only non-sample parent/tutor accounts: provisioning alone does not bypass the staff MFA gate. Staff MFA enrollment/recovery, staff permission-change UI, email ownership verification and actual invitation delivery remain separate implementation/release requirements. No production staff account has been created by this work.

Tests use an isolated real MongoDB database, verify normalised unique credentials and hashes, immutable existing roles and audit creation. Interactive terminal behavior on the actual droplet remains an operator check.
