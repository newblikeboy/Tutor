# Cloudinary uploads and private viewing

User direction, 2026-09-25: images, PDFs and videos upload directly to Cloudinary. MongoDB stores the provider URL and essential metadata, never file contents. This replaces the local scanner requirement for Cloudinary. Zoom remains the meeting provider.

## Upload flow

1. The signed-in browser requests an upload intent from Go. Go checks ownership, draft/enrollment state, filename/type, size, quota and an idempotency key.
2. Go reserves a reference and returns a signed form for an opaque, non-overwritable, authenticated Cloudinary asset. The API secret stays on the server.
3. The browser sends the File directly to Cloudinary with multipart/form-data. No file bytes/base64 pass through Go, Nginx or MongoDB in this flow.
4. The browser asks Go to complete the upload. Go independently queries Cloudinary with backend credentials and checks the exact public ID, authenticated type, resource type, format and byte count. Client-provided URLs/statuses are never trusted.
5. Go saves the canonical URL, public ID, asset ID/version, type, size, display name, uploader and target ownership. The state becomes `ready`; it is not called `clean` or malware-scanned. The form saves the selected reference through its existing draft API.

Images use Cloudinary `image`; PDFs use `raw` to preserve originals; MP4s use `video`. Existing limits remain: JPG/PNG/PDF up to 3 MiB and application MP4 up to 25 MiB. MP4 support does not restore the removed demo/video field in Teaching approach. The generic document picker still accepts images/PDFs only.

Intents expire after one hour; retries retain the public ID and original timestamp. Repeated completion is idempotent. Lost upload responses can be recovered by provider lookup. Confirmed references survive refresh/API restarts. Reserved uploads count toward the existing 100 MiB allowance and application attachment limit; expired/unlinked assets are retained, not automatically deleted. Quota reclamation/orphan retention remains lifecycle work.

Cloudinary validates image/video formats; raw PDF restrictions are extension-based. No malware scan is performed or claimed. Browser and completion checks enforce app limits, but a modified client can upload a larger asset before completion rejects it. Configure appropriate Cloudinary account/preset limits and monitor storage abuse; post-upload validation does not prevent all provider bandwidth/storage costs. No paid add-on is automatically enabled.

## Viewing and downloading

The browser requests `/files/{id}/view`, `/download` or video `/play`. Go checks current household/tutor/reviewer access and returns a no-store redirect to an authenticated Cloudinary download URL valid for five minutes. Images render inline, PDFs open via their viewing link, and the native video player receives MP4 bytes/range requests directly from Cloudinary. This is progressive MP4 delivery, not adaptive HLS/DASH transcoding. Video load failure offers a reload action that obtains a fresh link and retains playback position where supported.

The stored canonical URL is an authenticated reference, not a public URL. Signed URLs are generated on demand, never persisted or included in list responses. An already-issued bearer link can remain usable until its five-minute expiry after logout/reassignment; new link requests always recheck access. Do not log/share temporary URLs. This bounded capability is the tradeoff for direct provider delivery.

## Configuration

```dotenv
MEDIA_PROVIDER=cloudinary
VIDEO_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

No `CLAMAV_ADDRESS` is needed for Cloudinary. Private image/PDF/video delivery must be permitted by the actual Cloudinary account. The Nginx CSP permits uploads to `api.cloudinary.com` and media delivery from `api.cloudinary.com` and `res.cloudinary.com`. Keep credentials in the backend environment. Production authentication/payment gates remain separate and unchanged.

## Existing files and compatibility

Existing Cloudinary records are retained. On first authorised view, old `quarantined`/`clean` records are checked with Cloudinary and gain ready metadata; rejected/archived files remain unavailable. Existing disk/S3 files retain guarded legacy download/scanning. Changing providers never migrates or deletes objects automatically. No migration is required for the additive file fields.

Legacy base64 routes remain compatible with older clients and development disk/S3 tests. The current Cloudinary frontend always uses upload-intent/complete. Test provider fixtures are restricted to `APP_ENV=test` and loopback; they are never a production fallback.

References: [Browser uploads](https://cloudinary.com/documentation/client_side_uploading), [Upload parameters](https://cloudinary.com/documentation/image_upload_api_reference), [Authenticated delivery](https://cloudinary.com/documentation/control_access_to_media).
