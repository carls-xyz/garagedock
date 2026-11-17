# GarageDock - Exercice initiation docker.

Prise de rendez-vous en ligne pour un garage. Node.js, PostgreSQL, Docker.

## Lancer

```bash
cp .env.example .env
docker compose up --build
```

Puis ouvrir http://localhost:3000

## Structure

```
compose.yaml
.env.example
app/
  Dockerfile
  server.js
  public/
    index.html
    style.css
```

## API

- `GET /api/sante` : état de la base
- `GET /api/reservations` : liste des rendez-vous
- `POST /api/reservations` : ajoute un rendez-vous

## Arrêter

```bash
docker compose down      # garde les données
docker compose down -v   # efface la base
```