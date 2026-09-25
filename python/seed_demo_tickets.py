#!/usr/bin/env python3
"""
Seed realistic demo tickets into PostgreSQL for Bagian D testing.
Ticket IDs and timestamps are auto-generated.
"""
import os
import secrets
import time
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def generate_cuid() -> str:
  """Generate a Prisma-compatible CUID string."""
  ts = hex(int(time.time() * 1000))[2:]
  rand_part = secrets.token_hex(8)
  return f"c{ts}{rand_part}"[:25]


def seed():
  conn = psycopg2.connect(os.getenv("DATABASE_URL"))
  cur = conn.cursor()
  cur.execute('SELECT id FROM "Organization" LIMIT 1')
  org = cur.fetchone()
  if not org:
    print("No organization found. Please run 'npx tsx prisma/seed.ts' first.")
    return
  org_id = org[0]

  sample_tickets = [
    (
      "user1@example.com",
      "Deposit belum masuk ke akun",
      "Halo, deposit Rp 500.000 saya belum masuk ke akun sejak kemarin malam.",
      "BILLING",
      "Halo, kami sedang memeriksa status deposit Anda. Mohon ditunggu.",
    ),
    (
      "dev@client.com",
      "Error 500 saat query tickets API",
      "Endpoint /api/v1/tickets sering crash internal server error 500 saat load tinggi.",
      "TECHNICAL",
      "Halo, tim teknis kami sedang menyelidiki kendala HTTP 500 tersebut.",
    ),
    (
      "sales@corp.com",
      "Tanya jam operasional customer service",
      "Halo Goodeva, apakah melayani konsultasi demo fitur dan integrasi di akhir pekan?",
      "GENERAL",
      "Halo, layanan customer support kami beroperasi Senin-Jumat pukul 09:00-18:00 WIB.",
    ),
    (
      "budi@maju.id",
      "Kendala pembayaran tagihan invoice",
      "Saya Budi Santoso dari PT Maju. Pembayaran tagihan Rp 1.500.000 gagal. Hubungi WA di +6281234567890 atau email budi@maju.id.",
      "BILLING",
      "Halo Pak Budi, kami segera menindaklanjuti status tagihan invoice Anda.",
    ),
    (
      "admin@techcorp.com",
      "Bug login tidak bisa submit form",
      "Muncul error saat klik login di dashboard. Hubungi tim teknis kami di admin@techcorp.com / 081809112233.",
      "TECHNICAL",
      "Halo, mohon periksa kredensial atau bersihkan cache browser Anda.",
    ),
  ]

  insert_sql = (
    'INSERT INTO "Ticket" (id, organization_id, customer_email, subject, message, '
    'category, suggested_reply, status, created_at, updated_at) '
    'VALUES (%s, %s, %s, %s, %s, %s, %s, DEFAULT, DEFAULT, NOW())'
  )

  rows_to_insert = [
    (
      generate_cuid(),
      org_id,
      email,
      subj,
      msg,
      cat,
      reply,
    )
    for email, subj, msg, cat, reply in sample_tickets
  ]

  cur.executemany(insert_sql, rows_to_insert)
  conn.commit()
  print(f"Successfully seeded {len(rows_to_insert)} sample tickets into database (IDs & timestamps auto-generated).")
  cur.close()
  conn.close()


if __name__ == "__main__":
  seed()
