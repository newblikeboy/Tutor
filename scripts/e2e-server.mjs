// Test tooling only. All application endpoints are served by the compiled Go API.
import { spawn } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const env = { ...process.env }
try {
  for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
} catch {
  /* CI supplies environment directly */
}
if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required for real E2E persistence')
Object.assign(env, {
  APP_ENV: 'test',
  AUTH_PROVIDER: 'password',
  SEED_PASSWORD: 'E2E-only learning passphrase 426!',
  PAYMENT_PROVIDER: process.env.E2E_PAYMENT_SIMULATION === '1' ? 'simulation' : 'disabled',
  MAIL_PROVIDER: 'disabled',
  MEDIA_PROVIDER: 'disk',
  VIDEO_PROVIDER: 'disk',
  MEETING_PROVIDER: 'zoom',
  ZOOM_ACCOUNT_ID: 'test-account',
  ZOOM_CLIENT_ID: 'test-client',
  ZOOM_CLIENT_SECRET: 'test-secret',
  ZOOM_HOST_USER_ID: 'test-host',
  TEST_ZOOM_ENDPOINT: 'http://127.0.0.1:7999',
  MEDIA_ROOT: resolve(`.local/e2e-files-${Date.now()}`),
  CLAMAV_ADDRESS: '',
  TRIAL_FEE_PAISE: '0',
  MONGODB_DATABASE: `tutor_e2e_${Date.now()}`,
  HTTP_ADDR: '127.0.0.1:8081',
  WEB_ORIGIN: 'http://127.0.0.1:5174',
  API_TARGET: 'http://127.0.0.1:8081',
})
if (process.env.E2E_CLOUDINARY === '1')
  Object.assign(env, {
    MEDIA_PROVIDER: 'cloudinary',
    VIDEO_PROVIDER: 'cloudinary',
    CLOUDINARY_CLOUD_NAME: 'fixture-cloud',
    CLOUDINARY_API_KEY: 'fixture-cloudinary-key',
    CLOUDINARY_API_SECRET: 'fixture-cloudinary-secret',
    TEST_CLOUDINARY_ENDPOINT: 'http://127.0.0.1:7998',
  })
else env.TEST_CLOUDINARY_ENDPOINT = ''
// Browser email tests inspect encrypted jobs in their isolated database.
// SMTP transport and accepted content are tested separately with a private TLS fixture.
// Public signup now always needs mail configured. All test mail is confined to
// a closed loopback SMTP fixture; these settings never inherit operator secrets.
Object.assign(env, {
  MAIL_PROVIDER: 'smtp',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '7997',
  SMTP_SECURITY: 'starttls',
  SMTP_USER: 'fixture-user',
  SMTP_PASSWORD: 'fixture-secret',
  SMTP_FROM: 'support@gocoaching.in',
  MAIL_TOKEN_KEY: Buffer.alloc(32).toString('base64'),
})
console.log('E2E database:', env.MONGODB_DATABASE, '(isolated, retained for review)')
const children = []
function start(command, args, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true })
  children.push(child)
  return child
}
const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = start(command, args, cwd)
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Test setup command failed')),
    )
  })
await mkdir('.local', { recursive: true })
// Test fixtures use this exact isolated database, never a guessed or production name.
await writeFile(
  resolve('.local/e2e-runtime.json'),
  JSON.stringify({ databaseName: env.MONGODB_DATABASE, webOrigin: env.WEB_ORIGIN }),
)
start(process.execPath, [resolve('scripts/zoom-test-server.mjs')], resolve('.'))
if (process.env.E2E_CLOUDINARY === '1')
  start(process.execPath, [resolve('scripts/cloudinary-test-server.mjs')], resolve('.'))
await run('go', ['run', './cmd/migrate'], resolve('apps/api'))
await run('go', ['run', './cmd/seed'], resolve('apps/api'))
const binary = resolve(`.local/e2e-api${process.platform === 'win32' ? '.exe' : ''}`)
await run('go', ['build', '-o', binary, './cmd/api'], resolve('apps/api'))
start(binary, [], resolve('.'))
start(
  process.execPath,
  [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174'],
  resolve('apps/web'),
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const child of children) child.kill('SIGTERM')
    process.exit(0)
  })
