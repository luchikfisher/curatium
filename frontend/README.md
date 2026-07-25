# Curatium frontend

React, TypeScript, and Vite frontend for Curatium.

## Local development

```sh
npm install
npm run dev
```

Development requests beginning with `/api` are proxied to
`http://localhost:8080` by default. Override the backend target when necessary:

```sh
VITE_BACKEND_URL=http://localhost:8081 npm run dev
```

`VITE_BACKEND_URL` is consumed only by Vite's development server. In
production, hosting must route `/api` requests to the Spring backend, serve
static frontend assets normally, and rewrite every other non-asset frontend
route (including `/visit/1` and `/exhibitions/1/edit`) to `index.html` so
React Router can resolve it.

## Verification

```sh
npm run lint
npm test
npm run typecheck
npm run build
```
