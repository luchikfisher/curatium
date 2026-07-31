# Curatium

Curatium is a web application for creating and visiting small virtual art exhibitions.

## Backend foundation

Requirements:

- Java 21
- Maven
- Docker Compose for local PostgreSQL

Start the local database:

```sh
docker compose up -d postgres
```

Run the backend in its normal local mode:

```sh
cd backend
./mvnw spring-boot:run
```

Run the frontend in a second terminal:

```sh
cd frontend
npm install
npm run dev
```

The backend uses these environment variables, with local defaults shown below:

```text
CURATIUM_DATABASE_URL=jdbc:postgresql://localhost:5432/curatium
CURATIUM_DATABASE_USERNAME=curatium
CURATIUM_DATABASE_PASSWORD=curatium
CURATIUM_FRONTEND_ORIGIN=http://localhost:5173
```

Run backend tests:

```sh
cd backend
./mvnw test
```

## Opt-in demo showcase

The normal application never creates demo records. To prepare a deterministic local showcase,
start the backend with both the explicit `local` and `demo` profiles after starting PostgreSQL:

```sh
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local,demo
```

The seeder does not activate with `demo` alone, and it is not part of normal or production startup.
When both profiles are active, it creates or refreshes one published exhibition, **Curatium Demo —
Light, Line, and Water**, with four ordered, public-domain Art Institute of Chicago snapshots,
curatorial notes, and a selected cover. It writes those snapshots directly to the local database and
does not search or import from the museum provider during startup.

Running the command again uses an internal demo-seed key—not the exhibition title—to restore only
the owned exhibition's metadata, publication state, cover, and ordered items without creating
duplicates. Existing non-demo exhibitions and artwork snapshots are left unchanged; a pre-existing
matching artwork snapshot is reused as-is. The exhibition is ready in the curator list/editor,
artwork-curation view, curator preview, public catalogue, public 2D view, and virtual gallery. The
selection includes portrait and landscape images for the gallery's aspect-ratio handling.
