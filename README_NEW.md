# Service App — System Zarządzania Zleceniami Serwisowymi

Nowoczesna aplikacja do zarządzania zleceniami serwisowymi dla firm zajmujących się montażem i serwisem systemów CCTV, wentylacyjnych, ppoż, KD i innych.

## 🎯 Cechy

### Dashboard & Zarządzanie Zleceniami
- ✅ Intuicyjny dashboard z kalendarzem zleceń
- ✅ Lista zleceń z filtrowaniem i wyszukiwaniem
- ✅ Panel szczegółów zlecenia z mapą interaktywną
- ✅ Statystyki w real-time
- ✅ Śledzenie czasu pracy na zleceniu
- ✅ Historia zmian dla każdego zlecenia
- ✅ Tworzenie i edycja zleceń
- ✅ Przydzielanie technikom
- ✅ 4 poziomy statusu (Created, In Progress, Completed, Feedback)
- ✅ 3 poziomy priorytetu (High, Medium, Low)

### Dokumentacja & Raporty
- ✅ Przesyłanie zdjęć z kompresją
- ✅ Generowanie protokołów PDF
- ✅ Export zleceń do CSV
- ✅ Podpisy cyfrowe (wykonawcy i odbiorcy)
- ✅ Opis pracy wykonanej na zleceniu

### Bezpieczeństwo & Backend
- ✅ Autentykacja JWT (8h validity)
- ✅ Rate limiting (zapobiega bruteforce)
- ✅ Sanitizacja danych wejściowych
- ✅ Walidacja na backendie
- ✅ Kontrola dostępu (admin/user roles)
- ✅ Logging zdarzeń (audit trail)
- ✅ Walidacja MIME type fotografii
- ✅ Paginacja zleceń
- ✅ Zaawansowane filtry i sortowanie

### UX/UI & Design
- ✅ Responsywny design (mobile-first)
- ✅ Dark mode toggle
- ✅ Toast notyfikacje
- ✅ Animacje i smooth transitions
- ✅ Error handling & user feedback
- ✅ Loading indicators
- ✅ Accessibility (ARIA labels)
- ✅ Modern design system z zmiennymi CSS

### Progressive Web App
- ✅ Service Worker offline support
- ✅ PWA manifest
- ✅ Installable na smartphone
- ✅ Cache strategia (network-first)
- ✅ Asynchronous data sync

## 🚀 Szybki Start

### Wymagania
- Node.js 20+
- PostgreSQL 12+
- Docker & Docker Compose (opcjonalnie)

### Instalacja

1. Clone repository
2. Utwórz `.env`:
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/service_app
JWT_SECRET=twoj_super_tajny_klucz_zmien_to
ADMIN_PASSWORD=admin123
DEFAULT_USER_PASSWORD=user123
NODE_ENV=development
PORT=3000
```

3. Docker Compose (rekomendowane):
```bash
docker-compose up --build -d
http://localhost:3000
```

Lub lokalnie:
```bash
npm install
npm start
npm run dev  # development mode
```

## 👥 Domyślne Konta

- **Admin**: `admin` / `admin123`
- **User**: `user` / `user123`

Zmień hasła w `.env` i variables (ADMIN_PASSWORD itp.)

## 📡 API Endpoints

### Autentykacja
- `POST /register` - Rejestracja użytkownika
- `POST /login` - Logowanie (zwraca JWT token)
- `GET /me` - Info o zalogowanym użytkowniku

### Zlecenia
- `GET /tasks` - Lista zleceń (z paginacją, filtrami)
  - Query params: `page=1&limit=20&q=search&status=utworzony&priority=high`
- `GET /tasks/:id` - Szczegóły zlecenia (authenticated)
- `POST /tasks` - Utworzenie zlecenia (admin only)
- `PUT /tasks/:id` - Update zlecenia
- `DELETE /tasks/:id` - Usunięcie zlecenia (admin only)
- `GET /stats` - Statystyki (authenticated)

### Dokumenty
- `POST /tasks/:id/photos` - Upload zdjęcia (max 5MB)
- `GET /tasks/:id/photos` - Lista zdjęć
- `GET /tasks/:id/pdf` - Generowanie PDF (authenticated)
- `GET /tasks/:id/history` - Historia zmian

### System
- `GET /users` - Lista techników (authenticated)
- `GET /health` - Health check

## 🔐 Bezpieczeństwo

### Rate Limiting
- **Globalny**: 100 req/15 min na IP
- **Login**: 5 prób/15 min (zapobiega brute force)
- **Upload**: 10 zdjęć/minutę

### Walidacja
- MIME type check (tylko JPEG, PNG, WebP)
- Limit rozmiaru: 5MB na zdjęcie
- Input sanitization (SQL injection protection)
- Body size limit: 10MB

### Autentykacja
- JWT tokens (8-godzinne validity)
- Role-based access control (admin/user)
- Logging wszystkich zdarzeń w audit trail
- Helmet.js dla HTTP headers security

## 📱 Funkcje Frontend

### Toast Notifikacje
```javascript
Toast.success('Operacja udana');
Toast.error('Coś poszło nie tak');
Toast.warning('Ostrzeżenie');
Toast.info('Informacja');
```

### Export Danych
```javascript
const data = [...];
exportToCSV(data, 'filename.csv');
exportToJSON(data, 'filename.json');
```

### Geolokacja
```javascript
const location = await getLocation();
// { lat: 50.061, lng: 19.937, accuracy: 20 }
```

### Kompresja Zdjęć
```javascript
const compressed = await compressImage(file, 1200, 1200, 0.85);
```

### Utility Funkcje
```javascript
formatDate(dateStr, includeTime);
formatDuration(seconds);
debounce(func, wait);
showFieldError(fieldName, message);
isMobileDevice();
```

## 🎨 Design System

### Kolory
- **Primary**: `#58ADB2` (Teal)
- **Dark**: `#104447` (Navy)
- **Light**: `#F0EADD` (Cream)
- **Accent**: `#752C14` (Brown)
- **Background**: `#f5f5f5` (light mode) / `#1a1a1a` (dark mode)

### Design Tokens
- **Border Radius**: 8px (var(--radius))
- **Shadows**: var(--shadow-sm), var(--shadow-md), var(--shadow-lg), var(--shadow-xl)
- **Transitions**: 0.2s cubic-bezier(0.4, 0, 0.2, 1)

Dark mode jest automatycznie dostosowywany do preferencji systemu (`prefers-color-scheme`).

## 📊 Workflow Zlecenia

1. **Admin tworzy** zlecenie z adresem, opisem, priorytetem
2. **Admin przydzela** do technika, ustawia status
3. **Technik rozpoczyna** - time tracking starts
4. **Technik raportuje** - upload zdjęć, opis pracy
5. **Admin/Technik kończy** - time tracking stops
6. **Podpisy** - opcjonalne podpisy odbiorcy/wykonawcy
7. **PDF** - generowanie protokołu

## 📁 Struktura Projektu

```
.
├── server.js              # Express backend
├── package.json          # Dependencies
├── docker-compose.yml    # Docker config
├── .env.example          # Environment template
├── public/
│   ├── index.html       # Landing page
│   ├── login.html       # Login form
│   ├── register.html    # Registration form
│   ├── dashboard.html   # Main dashboard
│   ├── create.html      # Create task form
│   ├── style.css        # Design system & styles
│   ├── utils.js         # Frontend utilities & helpers
│   ├── app.js           # Landing page JS
│   ├── login.js         # Login logic
│   ├── register.js      # Register logic
│   ├── dashboard.js     # Dashboard logic
│   ├── create.js        # Create form logic
│   ├── sw.js            # Service Worker
│   ├── manifest.json    # PWA manifest
│   └── uploads/         # Dokumenty zdjęć
└── README.md
```

## 🌐 Progressive Web App Features

- **Offline Support**: Service Worker caches statyczne zasoby
- **Installable**: Może być instalowana na home screen
- **Network-First Strategy**: Próbuje API, падает back do cache
- **Auto Update**: Service Worker sprawdza updaty w tle

## 🚨 Troubleshooting

### Błąd: "Cannot find module"
```bash
npm install
npm ci  # clean install
```

### Błąd bazy danych
```bash
# Sprawdź PostgreSQL
psql -U user -d service_app

# Resetuj bazę
dropdb service_app
createdb service_app
npm start  # auto-migrates on start
```

### Service Worker nie Cache'uje
- Clear Cache Storage w DevTools
- Unregister SW
- Hard refresh (Ctrl+Shift+R)

### Zdjęcia nie uploadują
- Upewnij się, że `public/uploads/` istnieje
- Sprawdź permission (755)
- Max 5MB per file
- JPEG/PNG/WebP only

## 🚀 Deployment

### Heroku/Railway
```bash
git push heroku main
# lub
railway link
railway up
```

### Self-hosted (VPS)
```bash
git clone <repo>
cd service-app
npm install --production

# Setup env
cp .env.example .env
# edit .env with production values

# Start
npm start
# lub use PM2
pm2 start server.js --name "service-app"
```

### Docker
```bash
docker build -t service-app .
docker run -p 3000:3000 --env-file .env service-app
```

## 📈 Performance

- Response time < 200ms (bez cache)
- Offline support (100% offline compatible)
- Image compression (85% quality, auto-resize)
- Pagination (20 zleceń per page)
- Database indexes on frequently queried columns

## 🔄 Aktualizacje & Roadmap

### v1.1 (Current)
- ✅ JWT autentykacja
- ✅ Rate limiting & security
- ✅ Paginacja
- ✅ Toast notifications
- ✅ CSV export
- ✅ Dark mode
- ✅ Service Worker offline
- ✅ Kompresja zdjęć

### Planowane (v1.2+)
- [ ] Push notyfikacje
- [ ] Real-time updates (WebSocket)
- [ ] GPS tracking technika
- [ ] Invoice/billing integration
- [ ] Multi-language support
- [ ] Advanced analytics
- [ ] Mobile app (React Native)
- [ ] Integracja z CRM

## 📝 Licencja

Proprietary © 2026 Service App

## 👨‍💼 Support

Dla problemów lub sugestii skontaktuj się z administratorem.

---

**Service App v1.1** - Zarządzanie Zleceniami Serwisowymi Made Simple
