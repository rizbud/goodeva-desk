# Bagian D: Python NLP dan Evaluasi Model

Bagian ini berisi script Python untuk ekstraksi entitas, klasifikasi tiket, dan evaluasi hasil model di Goodeva Desk:
1. `entity_extraction.py`: mengambil kontak (email dan nomor telepon) serta entitas nama (person, organization, location) memakai regex dan GLiNER atau model transformer.
2. `ticket_classification.py`: menentukan kategori tiket (`GENERAL`, `BILLING`, `TECHNICAL`) memakai NLI zero-shot tanpa mengubah isi database.
3. `compare_classification.py`: membaca tiket langsung dari database PostgreSQL dan membandingkan kategori hasil LLM di Bagian B dengan prediksi NLI lokal.
4. `seed_demo_tickets.py`: memasukkan sampel tiket realistis (Billing, Technical, General) ke database PostgreSQL untuk bahan pengujian.

## 1. Setup dan Instalasi

Jalankan instalasi dependensi dengan Python 3.10+:

```bash
pip install -r python/requirements.txt
```

Paket yang dipakai:
- `transformers` dan `torch` untuk model zero-shot NLI dan NER
- `gliner` untuk named entity recognition
- `psycopg2-binary` untuk koneksi langsung ke PostgreSQL
- `python-dotenv` untuk membaca file `.env`
- `rich` untuk tabel terminal
- `pydantic` untuk validasi data

Jika database masih baru atau kosong, jalankan seeder untuk mengisi beberapa tiket uji coba:

```bash
python python/seed_demo_tickets.py
```

## 2. Cara Menjalankan Script

### A. Ekstraksi Entitas (`python/entity_extraction.py`)

Mengambil alamat email dan nomor telepon (format Indonesia seperti `+628...` atau `08...`, serta nomor internasional), ditambah entitas nama jika model NER aktif.

Dari database:
```bash
python python/entity_extraction.py --from-db
```

Mode cepat (hanya regex kontak, tanpa memuat model transformer):
```bash
python python/entity_extraction.py --from-db --no-ner
```

Teks manual atau contoh bawaan:
```bash
python python/entity_extraction.py --text "Halo, saya Budi dari PT Maju. Hubungi budi@maju.co.id atau +6281234567890."
python python/entity_extraction.py
```

### B. Klasifikasi Kategori Tiket (`python/ticket_classification.py`)

Memprediksi kategori tiket (`BILLING`, `TECHNICAL`, `GENERAL`) secara inference-only. Script ini hanya membaca data dan tidak pernah mengubah record di database.

Dari database:
```bash
python python/ticket_classification.py --from-db
```

Mode cepat berbasis kata kunci:
```bash
python python/ticket_classification.py --from-db --keywords-only
```

Teks manual atau contoh bawaan:
```bash
python python/ticket_classification.py --subject "Deposit belum masuk" --message "Saya sudah transfer 500rb via BCA tapi saldo akun belum bertambah."
python python/ticket_classification.py
```

### C. Pembanding LLM dan NLI (`python/compare_classification.py`)

Mengambil tiket dari database PostgreSQL, membaca kategori yang sudah diisi oleh LLM, lalu membandingkannya dengan output NLI lokal sekaligus mendeteksi entitas kontak di dalam pesan. Script ini murni menjalankan query `SELECT`.

Jalankan evaluasi:
```bash
python python/compare_classification.py
```

Batasi jumlah tiket yang diperiksa:
```bash
python python/compare_classification.py --limit 50
```
