# Service App

Local development (Docker):

- Copy `.env` or set env vars: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD` (optional)
- Build and run:

```bash
docker-compose up --build -d
```

- Backend listens on port configured in `docker-compose.yml` (default 3001 externally).
- Open `http://localhost:3001` in your browser.

Default seeded users:
- Admin: username `admin` (password from ADMIN_PASSWORD env)
- User: username `user`, password `user123` (unless overridden)

API notes:
- Auth uses JWT in `Authorization: Bearer <token>` header.
- Upload photos: `POST /tasks/:id/photos` form field `photo`.
- Generate PDF: `GET /tasks/:id/pdf` (authenticated).

Front-end files are in `public/` (static pages).

If you want me to commit and push these changes, provide repository access or confirm credentials and method (SSH or PAT).