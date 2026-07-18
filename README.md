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
