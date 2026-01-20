# Database Schema

This document outlines the database schema for the Nation Stock Integrator.

## Tables

### `skus`

Stores the master stock for each SKU. This is the single source of truth.

- `sku` (text, primary key)
- `title` (text)
- `stock` (integer, default: `0`)
- `image_url` (text)
- `created_at` (timestamptz, default: `now()`)
- `updated_at` (timestamptz, default: `now()`)

### `ml_items`

Maps Mercado Libre items to our internal SKUs.

- `item_id` (text, primary key): The Mercado Libre item ID (e.g., `MLA12345678`).
- `sku` (text, foreign key to `skus.sku`)
- `title` (text)
- `stock_ml` (integer, default: `0`)
- `image_url` (text)
- `permalink` (text)
- `sku_source` (text)
- `created_at` (timestamptz, default: `now()`)
- `updated_at` (timestamptz, default: `now()`)

### `tn_items`

Maps Tienda Nube items to our internal SKUs.

- `product_id` (bigint)
- `variant_id` (bigint)
- `sku` (text, foreign key to `skus.sku`)
- `title` (text)
- `stock_tn` (integer, default: `0`)
- `image_url` (text)
- `price` (numeric)
- `created_at` (timestamptz, default: `now()`)
- `updated_at` (timestamptz, default: `now()`)

**Primary Key:** (`product_id`, `variant_id`)

### `stock_ledger`

Records every stock movement for auditing purposes.

- `id` (bigserial, primary key)
- `sku` (text, foreign key to `skus.sku`)
- `delta` (integer): The change in stock (e.g., -1, +10).
- `reason` (text): The reason for the change (e.g., `sale_ml`, `sale_tn`, `manual_update`, `initial_sync`).
- `ref` (text, optional): A reference for the movement (e.g., `order_id`).
- `created_at` (timestamptz, default: `now()`)

## SQL to create the main tables

```sql
CREATE TABLE skus (
  sku TEXT PRIMARY KEY,
  title TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ml_items (
  item_id TEXT PRIMARY KEY,
  sku TEXT REFERENCES skus(sku),
  title TEXT,
  stock_ml INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  permalink TEXT,
  sku_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tn_items (
  product_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  sku TEXT REFERENCES skus(sku),
  title TEXT,
  stock_tn INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, variant_id)
);

CREATE TABLE stock_ledger (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT REFERENCES skus(sku),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Idempotency guard for webhooks

This unique index avoids double-processing the same order for the same SKU.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_ledger_sku_reason_ref
  ON stock_ledger (sku, reason, ref)
  WHERE ref IS NOT NULL;
```

## SQL to update existing tables

Use these if the tables already exist and need columns added.

```sql
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE ml_items
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS stock_ml INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS permalink TEXT,
  ADD COLUMN IF NOT EXISTS sku_source TEXT;

ALTER TABLE tn_items
  ADD COLUMN IF NOT EXISTS sku TEXT REFERENCES skus(sku),
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS stock_tn INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC;
```
