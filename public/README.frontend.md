Krótka instrukcja frontendu

- `login.html` — strona logowania. Wysyła POST /login i zapisuje token w localStorage.
- `dashboard.html` — chroniony dashboard. Używa tokena z localStorage, sprawdza /me, pobiera /tasks i pokazuje mapę (Leaflet) jeśli zadanie ma `lat`/`lng`.

Role:
- Admin widzi formularz tworzenia zleceń (wysyła POST /tasks z Bearer tokenem).

Jeśli chcesz zmienić map provider: edytuj źródło kafli w dashboard.html (Leaflet).
