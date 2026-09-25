# Goodeva Desk API

Goodeva Desk adalah backend customer support desk multi-tenant yang dibangun dengan NestJS, PostgreSQL, Redis, dan BullMQ. Setiap tiket baru diklasifikasikan oleh LLM dan diberi saran balasan (_suggested reply_). Proses ini berjalan asinkron di background worker.

## Daftar isi

- [Arsitektur dan alur sistem](#arsitektur-dan-alur-sistem)
- [Menjalankan project](#menjalankan-project)
  - [Opsi 1: Docker Compose (direkomendasikan)](#opsi-1-docker-compose-direkomendasikan)
  - [Opsi 2: Menjalankan secara lokal](#opsi-2-menjalankan-secara-lokal)
- [Provider LLM](#provider-llm)
- [Keputusan desain](#keputusan-desain)
  - [Skema data dan multi-tenant](#skema-data-dan-multi-tenant)
  - [Rate limiting](#rate-limiting)
  - [Pemrosesan asinkron dengan BullMQ](#pemrosesan-asinkron-dengan-bullmq)
  - [Caching hasil LLM di Redis](#caching-hasil-llm-di-redis)
- [Pengujian](#pengujian)
- [Modul Python NLP dan evaluasi](#modul-python-nlp-dan-evaluasi)
- [Rencana pengembangan](#rencana-pengembangan)

## Arsitektur dan alur sistem

Diagram berikut menunjukkan alur dari pembuatan tiket sampai klasifikasi LLM selesai di background:

```mermaid
%%{init: {"themeCSS": "rect.rect { stroke: #888; stroke-width: 1.5px; stroke-dasharray: 6 4; }"}}%%
sequenceDiagram
    autonumber
    actor Client as Customer / Client
    participant API as Goodeva Desk API
    participant DB as PostgreSQL
    participant Queue as BullMQ (Redis)
    participant Worker as LlmProcessor
    participant Redis as Redis (Cache & Rate Limit)
    participant LLM as LLM Provider

    Client->>API: POST /tickets (Header: x-api-key)
    API->>Redis: ThrottlerGuard: cek rate limit (per IP & per API key)
    alt Melebihi limit
        Redis-->>API: Limit terlampaui
        API-->>Client: 429 Too Many Requests
    else Masih di bawah limit
        Redis-->>API: OK
        API-->>API: ApiKeyGuard: cek header x-api-key
        alt Header x-api-key tidak ada
            API-->>Client: 401 Unauthorized (Missing X-API-Key header)
        else Header ada
            API-->>API: Hash API key (SHA-256)
            API->>DB: Cari organisasi berdasarkan hash
            alt API key tidak valid / organisasi tidak ditemukan
                DB-->>API: null
                API-->>Client: 401 Unauthorized (Invalid API key)
            else Organisasi valid
                DB-->>API: Data organisasi
                API->>DB: Simpan tiket baru (status: OPEN)
                DB-->>API: Tiket tersimpan (ID cuid)
                API->>Queue: Enqueue job (ticketId, subject, message)
                Queue-->>API: Job queued
                API-->>Client: 201 Created (data tiket)
            end
        end
    end

    rect rgba(128, 128, 128, 0.08)
        Note over Queue,Worker: Pemrosesan asinkron (background worker)
        Queue->>Worker: Ambil job klasifikasi
        Worker->>Redis: Cek key (llm:sha256(subject:::message))
        alt Cache hit
            Redis-->>Worker: Kembalikan cached category & reply
        else Cache miss
            Worker->>LLM: generateText (Zod JSON Schema)
            LLM-->>Worker: { category, suggestedReply }
            Worker->>Redis: Simpan hasil (TTL 24h)
        end
        Worker->>DB: Update tiket (category, suggested_reply)
        Worker->>Queue: Tandai job selesai (completed)
    end
```

## Menjalankan project

### Persyaratan

- Node.js v22.22.3+, v24.15+, atau v26+
- Docker dan Docker Compose, jika ingin menjalankan lewat container
- PostgreSQL 16 dan Redis 7, jika menjalankan manual di mesin lokal
- API key dari provider LLM yang punya endpoint OpenAI-compatible. Konfigurasi default memakai Google Gemini, dan API key-nya bisa didapat gratis di [Google AI Studio](https://aistudio.google.com/).

### Opsi 1: Docker Compose (direkomendasikan)

Opsi ini tidak butuh PostgreSQL atau Redis terpasang di komputer host.

1. Clone repository dan siapkan file environment:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` dan isi API key LLM:
   ```env
   LLM_API_KEY=AIzaSy...your_gemini_api_key_here
   ```
3. Jalankan semua service:

   ```bash
   docker compose up --build -d
   ```

   Saat container aplikasi menyala, `docker-entrypoint.sh` otomatis menjalankan migrasi Prisma ke PostgreSQL.

4. Jalankan seed untuk membuat organisasi dan API key pertama:

   ```bash
   docker compose exec app npm run db:seed
   ```

   Terminal akan mencetak API key uji coba, misalnya:

   ```text
   Seeded organization: "Goodeva"
   API KEY (save this for testing): sk_gd_9f83...
   ```

   Simpan key tersebut untuk header `x-api-key` di setiap request.

5. Buka dokumentasi Swagger di [http://localhost:3000/docs](http://localhost:3000/docs). Status database dan Redis bisa dicek lewat `GET /health`, yang mengembalikan `503` kalau salah satunya mati.

### Opsi 2: Menjalankan secara lokal

1. Instal dependensi:

   ```bash
   npm install
   ```

   Lifecycle `postinstall` juga menjalankan `prisma generate`.

2. Salin `.env.example` menjadi `.env`:

   ```bash
   cp .env.example .env
   ```

   Lalu sesuaikan nilainya:

   ```env
   NODE_ENV=development
   PORT=3000

   # Database PostgreSQL lokal
   DATABASE_URL=postgresql://goodeva:goodeva@localhost:5432/goodeva_db

   # Redis lokal
   REDIS_URL=redis://localhost:6379

   # Provider LLM
   LLM_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   LLM_API_KEY=isi_dengan_gemini_api_key_anda
   LLM_MODEL_ID=gemini-2.5-flash-lite

   # Rate limiting (TTL dalam detik)
   THROTTLE_IP_TTL=60
   THROTTLE_IP_LIMIT=60
   THROTTLE_ORG_TTL=60
   THROTTLE_ORG_LIMIT=120
   ```

3. Pastikan PostgreSQL dan Redis berjalan. Kalau hanya butuh container database dan Redis:

   ```bash
   docker compose up -d postgres redis
   ```

4. Jalankan migrasi database:

   ```bash
   npm run db:migrate:dev
   ```

5. Seed organisasi dan catat raw API key yang tampil di konsol (contoh: `sk_gd_xxxxxxxxxxxx`):

   ```bash
   npm run db:seed
   ```

6. Jalankan aplikasi:
   ```bash
   # Mode development (auto-reload)
   npm run start:dev

   # Atau build & run production mode
   npm run build
   npm run start:prod
   ```

## Provider LLM

`LlmService` tidak terikat ke provider atau model tertentu. Klien LLM dibuat dengan Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`), jadi provider apa pun yang menyediakan endpoint OpenAI-compatible bisa dipakai, misalnya Gemini, OpenAI, Groq, Ollama, atau vLLM on-premise. Syaratnya satu: model harus mendukung structured output (JSON). Untuk ganti provider atau model, cukup ubah `LLM_API_BASE_URL`, `LLM_API_KEY`, dan `LLM_MODEL_ID` di `.env` tanpa mengubah kode.

Konfigurasi default memakai Google Gemini `gemini-2.5-flash-lite` lewat endpoint `https://generativelanguage.googleapis.com/v1beta/openai`. Tugasnya hanya memilih satu dari tiga kategori (`GENERAL`, `BILLING`, `TECHNICAL`) dan menulis balasan singkat, jadi model besar seperti GPT-4o atau Gemini Pro terlalu lambat dan mahal untuk ini. `gemini-2.5-flash-lite` punya _time to first token_ di bawah 1 detik, biaya token rendah, dan free tier yang cukup longgar untuk development.

Output model divalidasi dengan schema Zod lewat `Output.object({ schema: ... })`. Respons yang tidak cocok dengan schema dianggap error, lalu job di-retry oleh BullMQ, sehingga data yang tidak valid tidak pernah tersimpan ke database.

Setiap panggilan LLM dibatasi `AbortSignal.timeout(30_000)` supaya worker tidak menggantung kalau koneksi ke provider bermasalah.

## Keputusan desain

### Skema data dan multi-tenant

Entitas `Organization` punya relasi one-to-many ke `Ticket`, dan setiap request wajib membawa header `x-api-key` untuk menentukan organisasinya.

API key mentah (`sk_gd_...`) tidak pernah disimpan di database. Yang disimpan hanya hash SHA-256-nya. Saat verifikasi, `ApiKeyGuard` meng-hash key yang masuk lalu mencarinya di database.

ID memakai CUID (`@default(cuid())`), bukan auto-increment integer, supaya ID tidak bisa ditebak (mencegah enumeration dan IDOR) dan aman dibuat secara konkuren.

Tabel `Ticket` punya tiga index:

- `idx_ticket_organization_id` untuk isolasi data per tenant.
- `idx_ticket_organization_id_status` untuk filter dashboard, misalnya tiket open milik satu organisasi.
- `idx_ticket_organization_id_category` untuk reporting dan filter per kategori.

### Rate limiting

Rate limit memakai `@nestjs/throttler` sebagai guard global, dengan counter yang disimpan di Redis lewat `ThrottlerStorageRedisService`. Karena counter ada di Redis, limit berlaku sama di semua instance aplikasi. Ada dua limiter:

- `ip`: default 60 request per 60 detik per alamat IP.
- `org`: default 120 request per 60 detik per API key. Limiter ini dilewati kalau request tidak membawa header `x-api-key`.

Throttler berjalan sebelum `ApiKeyGuard`, jadi limiter `org` memakai nilai header `x-api-key` apa adanya. Key di Redis di-hash dengan SHA-256, sehingga API key mentah tidak tersimpan di sana. Semua nilai bisa diubah lewat variabel `THROTTLE_*`, dan endpoint `GET /health` tidak kena rate limit.

### Pemrosesan asinkron dengan BullMQ

Panggilan ke LLM bisa makan waktu ratusan milidetik sampai beberapa detik. Kalau `POST /tickets` menunggu LLM selesai, throughput API turun dan client ikut menunggu.

Karena itu, tiket langsung disimpan dengan status `OPEN` lalu dimasukkan ke antrean BullMQ `ticket-classification`, dan endpoint bisa mengembalikan `201 Created` dalam waktu kurang dari 20 milidetik.

`LlmProcessor` mengambil job dari antrean, memanggil LLM (atau membaca cache), lalu mengisi kolom `category` dan `suggestedReply`. Kalau terjadi kegagalan sementara seperti rate limit dari provider atau gangguan jaringan, BullMQ mengulang job sampai 3 kali dengan exponential backoff mulai dari 3 detik.

### Caching hasil LLM di Redis

Keluhan pelanggan sering mirip atau bahkan identik, misalnya pertanyaan dari template. Cache dibuat berdasarkan isi tiket setelah dinormalisasi:

```typescript
// Normalisasi spasi dan case
const normSubject = subject.toLowerCase().replace(/\s+/g, ' ').trim();
const normMessage = message.toLowerCase().replace(/\s+/g, ' ').trim();
const hash = sha256(`${normSubject}:::${normMessage}`);
const cacheKey = `llm:${hash}`;
```

Hasil klasifikasi disimpan dengan TTL 24 jam (`86400` detik). Untuk teks yang identik, worker tidak perlu memanggil provider LLM sama sekali (respons selesai sekitar 1 ms), jadi kuota dan biaya API LLM lebih hemat.

## Pengujian

Unit test memakai Vitest, yang mendukung ESM dan TypeScript tanpa konfigurasi tambahan.

```bash
# Menjalankan seluruh unit test
npm run test

# Menjalankan test coverage
npm run test:cov

# Menjalankan test dalam mode watch (interaktif)
npm run test:watch
```

Yang diuji:

- `TicketsController` dan `TicketsService`: validasi pembuatan tiket, filter, pagination, dan enqueue job.
- `LlmService`: cache hit, cache miss, parsing hasil, dan penanganan error.
- `ApiKeyGuard`: pengecekan header, validasi hash, dan penolakan request tanpa kredensial yang sah.
- `OrganizationsService` dan `PrismaService`: koneksi database dan hashing key.
- `RedisService`: operasi get/set/del/ping.
- `ThrottlerStorageRedisService`: namespace key per limiter dan konversi TTL.
- `AppController` dan `AppService`: health check.

## Modul Python NLP dan evaluasi

Folder `python/` berisi skrip pendukung untuk mengevaluasi hasil klasifikasi. Skrip ini dijalankan terpisah dari aplikasi utama:

- `python/seed_demo_tickets.py`: mengisi PostgreSQL dengan variasi tiket yang realistis (billing, technical, general).
- `python/entity_extraction.py`: mengekstrak kontak (email, nomor telepon Indonesia/internasional) dan nama dengan GLiNER/Transformer.
- `python/ticket_classification.py`: klasifikasi tiket _inference-only_ berbasis NLI (_zero-shot classification_).
- `python/compare_classification.py`: membaca tiket dari database lalu membandingkan hasil klasifikasi LLM dengan model NLI lokal.

Panduan lengkapnya ada di [python/README.md](python/README.md).

## Rencana pengembangan

1. **Notifikasi real-time (WebSocket atau SSE).** Saat ini client harus polling untuk tahu apakah `category` dan `suggestedReply` sudah terisi. Dengan WebSocket gateway atau SSE, dashboard agen bisa langsung menerima update begitu worker selesai.
2. **Beberapa API key per organisasi.** Sekarang setiap organisasi hanya punya satu API key (kolom `apiKey` di `Organization`). Memindahkannya ke tabel terpisah memungkinkan satu organisasi punya beberapa key, sehingga key bisa dirotasi atau dicabut satu per satu tanpa mengganggu integrasi lain.
3. **Dead letter queue dan triage manual.** Job yang tetap gagal setelah semua retry habis (misalnya karena prompt ditolak oleh safety policy LLM) saat ini langsung dibuang. Job seperti itu bisa dipindahkan ke antrean dead-letter, dan tiketnya ditandai `UNCLASSIFIED` untuk ditinjau manual oleh supervisor.
4. **Knowledge base retrieval (RAG).** Menghubungkan LLM dengan pencarian vektor berbasis pgvector atau Qdrant yang berisi SOP, artikel help center, dan riwayat tiket. Dengan konteks itu, `suggestedReply` bisa lebih spesifik terhadap produk organisasi dan lebih jarang berhalusinasi.
5. **Idempotency key.** Menerima header `Idempotency-Key` di `POST /tickets` supaya retry dari client karena gangguan jaringan tidak membuat tiket ganda.
