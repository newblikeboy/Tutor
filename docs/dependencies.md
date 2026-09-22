# Verified dependency versions

Official documentation and package registries were consulted on 2026-09-23 before installation. These are the installed versions, locked in package-lock.json and apps/api/go.sum.

| Package | Version |
|---|---|
| @fontsource/manrope | 5.3.0 |
| @fontsource/noto-sans-devanagari | 5.3.0 |
| @hookform/resolvers | 5.9.1 |
| @radix-ui/react-dialog | 1.1.23 |
| @tanstack/react-query | 5.103.2 |
| i18next | 26.4.2 |
| lucide-react | 1.47.0 |
| react | 19.3.0 |
| react-dom | 19.3.0 |
| react-hook-form | 7.88.0 |
| react-i18next | 17.0.15 |
| react-router-dom | 7.18.4 |
| zod | 4.6.5 |
| @eslint/js | 10.0.1 |
| @tailwindcss/vite | 4.3.3 |
| @testing-library/jest-dom | 7.0.1 |
| @testing-library/react | 16.3.3 |
| @testing-library/user-event | 14.6.7 |
| @types/node | 26.6.2 |
| @types/react | 19.3.0 |
| @types/react-dom | 19.3.0 |
| @vitejs/plugin-react | 6.1.1 |
| eslint | 10.11.0 |
| eslint-plugin-react-hooks | 7.1.1 |
| eslint-plugin-react-refresh | 0.5.7 |
| globals | 17.12.0 |
| jsdom | 29.1.1 |
| tailwindcss | 4.3.3 |
| typescript | 6.0.3 |
| typescript-eslint | 8.70.1 |
| vite | 8.3.0 |
| vitest | 5.0.1 |
| @axe-core/playwright | 4.13.0 |
| @playwright/test | 1.63.0 |
| mongodb-memory-server-core | 11.3.0 |
| openapi-typescript | 7.13.0 |
| prettier | 3.9.8 |
| Go | 1.26.5 |
| github.com/go-chi/chi/v5 | 5.3.2 |
| go.mongodb.org/mongo-driver/v2 | 2.9.1 |
| golang.org/x/crypto | 0.53.0 (existing pin, now direct for Argon2id) |
| golang.org/x/sys | 0.46.0 (transitive Argon2 dependency) |

Sources: [React](https://react.dev/learn/build-a-react-app-from-scratch), [Vite](https://vite.dev/guide/), [Tailwind](https://tailwindcss.com/docs/installation/using-vite), [React Router](https://reactrouter.com/start/declarative/installation), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/installation), [Zod](https://zod.dev/), [react-i18next](https://react.i18next.com/latest/using-with-hooks), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [Vitest](https://vitest.dev/guide/), [Playwright snapshots](https://playwright.dev/docs/test-snapshots), [Go driver](https://www.mongodb.com/docs/drivers/go/current/), [Go transactions](https://www.mongodb.com/docs/drivers/go/current/crud/transactions/), [chi](https://pkg.go.dev/github.com/go-chi/chi/v5). React Hook Form site initially returned an internal error; its current package/resolver versions were verified in the npm registry and used successfully in the compiled/tested integration.

Node 22.17.1 meets the Vite/Vitest >=22.12 requirement on the Node 22 line. The optional local test replica-set binary is MongoDB Community 8.2.6. It is not an application backend implemented in Node.

GitHub Actions official latest releases checked: checkout 7.0.1, setup-go 7.0.0, setup-node 7.0.0, upload-artifact 7.0.1. The workflow has not yet run on GitHub.
