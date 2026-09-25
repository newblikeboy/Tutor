# Encrypted Updates

The operator requested a one-way inbox with read receipts and end-to-end encryption. `/notifications` now provides received updates, sent updates, composing and a separate Activity tab for the existing automated alerts. There are no replies or broadcasts. Each update has one sender and one recipient.

## Permissions and behaviour

| Actor | Can send | Can receive/read |
|---|---|---|
| Administrator | To an activated parent or tutor inbox, including applicants | Own sent updates and signed read receipts; no access to other people's updates |
| Approved, unexpired tutor | To a parent in an active, paused, pending-agreement or awaiting-payment tuition assignment | Administrative updates; own sent family updates while the assignment remains current |
| Parent | No | Updates addressed to their own account, including retained updates after a tutor change |
| Applicant, suspended or expired tutor | No family updates | Administrative updates addressed to their own account |
| Mentor, support, finance | No encrypted Updates access | Existing role-scoped Activity alerts remain available |

Recipients must activate their inbox before sending is possible. The recipient directory is paginated: administrators can filter parent/tutor names; tutors see only their current arrangements. It does not expose email, telephone or private learner details. The server rechecks approval and assignment inside the sending transaction and contends on the enrollment/application records to serialize against reassignment or suspension. Former tutors lose list/detail/key access to that family's updates. As with any downloaded content, access revocation cannot erase plaintext or ciphertext someone already retained on their own device.

Subjects and bodies are encrypted. The client decrypts subject lines for the unlocked message list; opening a message verifies its sender signature and decrypts it before requesting a receipt. Listing messages, fetching detail JSON, unlocking an inbox, or a failed decryption never marks an update read. The receipt is signed by the recipient's inbox identity and binds the exact message ID, nonce and recipient fingerprint. The server preserves the first receipt time; the sender's browser also verifies the receipt signature. “Read” means the recipient's client opened the message, not proof of human comprehension. The timestamp is the server's receipt time, not a cryptographically attested clock.

Sends require Origin/CSRF, a session, a valid sender signature, bounded envelopes, a persisted rate limit and an idempotency key. A unique sender/nonce index plus transactional receipts prevent replay duplication. Browser retry retains the exact encrypted envelope and request key after a lost response. Message content is never placed in URLs or audit logs. API errors do not log request bodies. Audit records contain actor/action/message ID only.

## Encryption protocol, version 1

No new crypto dependency was installed. `apps/web/src/lib/inbox-crypto.ts` uses the browser Web Crypto implementation:

- A 3072-bit RSA-OAEP key pair with SHA-256 encrypts each fresh message key separately for the sender and recipient.
- Each message uses a fresh AES-256-GCM key and random 96-bit IV. The subject/body JSON is encrypted with authenticated additional data binding the protocol version, nonce, sender, recipient, assignment and both identity fingerprints.
- A separate ECDSA P-256/SHA-256 key pair signs a canonical JSON string array covering those identifiers, IV, ciphertext and both wrapped keys. The API and receiving browser verify the signature. Untrusted ciphertext is not decrypted before signature verification.
- SHA-256 of `encryptionPublicKey + "." + signingPublicKey` identifies the combined public identity. Public keys are DER SPKI encoded as canonical base64. The UI exposes the full fingerprint as a safety number for comparison over a trusted channel.
- The private PKCS8 keys are encrypted together with AES-256-GCM. Its key is derived locally from the inbox passphrase using PBKDF2-HMAC-SHA-256, 600,000 iterations, and a random 256-bit salt. The vault uses its own fresh 96-bit IV and binds the owner and both public keys as additional authenticated data. Registration requires proof of signing-key possession.

The service stores the public identity and encrypted private-key vault in `inbox_keys`, and encrypted envelopes/read receipts in `inbox_updates`. It never receives the inbox passphrase, plaintext private keys, subject or body. Sender/recipient names, account/assignment IDs, public keys, envelope sizes, timestamps and read status remain visible metadata. Access to an encrypted vault is owner-only; list/detail endpoints expose only the public keys of authorized participants.

On unlock, the client validates the fingerprint, decrypts the vault, imports non-extractable private CryptoKeys, and verifies the private/public key pairs match. Unlocked keys, passphrase inputs and plaintext stay in component memory. Crypto mutations deliberately avoid the global TanStack mutation cache; private material is not stored in query data, localStorage, sessionStorage or IndexedDB. Locking, leaving the route, refreshing or signing out discards the active inbox component. JavaScript garbage collection does not provide a guarantee of physical memory zeroization.

The inbox passphrase is distinct from the account sign-in password. Setup requires confirmation and acknowledgement that the passphrase has been saved safely. It can unlock the same encrypted vault on another device. **There is no passphrase reset, identity rotation or administrator recovery path in this version.** Account password changes do not alter the inbox keys. Losing the inbox passphrase prevents recovery of existing messages and use of that immutable inbox identity. A future recovery/rotation workflow must be explicitly designed; it must never silently replace keys or claim old messages can be recovered.

## Security limits

This is an application-specific, tested envelope protocol, not an independently audited secure-messaging product. It protects stored message content from a service/database reader lacking an endpoint key or inbox passphrase. It does not provide forward secrecy, automatic key transparency, or protection from compromised browsers, XSS, extensions, stolen unlocked devices, weak passphrase guessing, or a malicious server that changes the JavaScript delivered to clients. Safety-number comparison provides manual identity verification; registration and key delivery still depend on authenticated HTTPS. New protocol versions, key rotation and independent cryptographic review remain follow-up work. No independent security-audit or production-readiness claim is made.

Existing tuition conversations, support cases and Activity alerts retain their previous access controls and storage. They are **not** retroactively encrypted or advertised as part of this encrypted inbox. Attachments, email, SMS, notifications outside the app and bulk delivery are not implemented here.

## Migration and deployment

`tutor-migrate --inbox-only` adds two collections, required-field validators, sender/recipient pagination indexes and a unique sender/nonce index. It is idempotent and records `006-encrypted-inbox`. The normal full migration calls it too. No existing messages, keys, accounts or content are rewritten/deleted.

The operator-run `scripts/deploy-existing.sh` now builds the reviewed release and uses a transient systemd task to run this narrow migration with `/etc/tutor/api.env` as the `tutor` service account **before** changing the active symlink. It does not source or print the private environment. Migration failure leaves the old release active. Application rollback leaves the additive collections/indexes in place; it never destroys inbox data. The runtime database user needs collection/index privileges for this step, or an operator must apply the same migration with approved migration credentials. Actual droplet execution is not performed by tests.

## Verification and references

Go integration tests run against a real local MongoDB replica set and cover immutable keys, role boundaries, applicant receiving, foreign-household denials, CSRF, signed receipts, cross-instance retry deduplication, revoked assignments, suspension and bounded pagination. Browser crypto tests cover sender/recipient decryption, unrelated key denial, vault recovery, incorrect passphrases, ciphertext/identity/routing tampering, randomized envelopes and forged receipts. Playwright covers real Go/Mongo delivery, mobile layouts, lock/unlock, no replies, encrypted HTTP payloads, lost-response retries and no receipt after tampering. See [progress](progress.md) for executed results and [visual review](visual-qa/encrypted-inbox/README.md).

Implementation references checked: [MDN Web Crypto encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt), [MDN key unwrapping and password-derived wrapping](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/unwrapKey), and [OWASP PBKDF2 work factors](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). These references support the primitive APIs and work factor; they do not audit this protocol.
