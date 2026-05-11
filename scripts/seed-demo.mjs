#!/usr/bin/env node
/**
 * AJKMart Demo Seed Script
 * Uses psql directly — no extra dependencies needed.
 */

import { execSync } from "child_process";

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("DATABASE_URL not set"); process.exit(1); }

function psql(sql) {
  execSync(`psql "${DB}" -c "${sql.replace(/"/g, '\\"')}"`, { stdio: "ignore" });
}

function psqlFile(sql) {
  // Write SQL to a temp file to avoid shell escaping nightmares
  import("fs").then(fs => {
    fs.writeFileSync("/tmp/seed_demo.sql", sql);
    execSync(`psql "${DB}" -f /tmp/seed_demo.sql`, { stdio: "inherit" });
  });
}

import fs from "fs";

function runSQL(sql) {
  fs.writeFileSync("/tmp/_seed_chunk.sql", sql);
  try {
    execSync(`psql "${DB}" -f /tmp/_seed_chunk.sql`, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const err = e.stderr?.toString() ?? e.message;
    if (!err.includes("duplicate") && !err.includes("already exists") && !err.includes("unique")) {
      console.warn("  SQL warning:", err.split("\n")[0]);
    }
  }
}

async function seedViaAPI() {
  try {
    const loginRes = await fetch("http://127.0.0.1:5000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "superadmin", password: "Admin@123" }),
    });
    const { accessToken } = await loginRes.json();
    if (!accessToken) { console.log("  Could not get admin token for product seed"); return; }

    const res = await fetch("http://127.0.0.1:5000/api/seed/products", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.success || data.seeded) {
      const s = data.seeded ?? {};
      console.log(`✓ Products seeded — mart: ${s.mart ?? "?"}, food: ${s.food ?? "?"}, pharmacy: ${s.pharmacy ?? "?"}`);
    } else {
      console.log("  Products:", JSON.stringify(data).slice(0, 120));
    }
  } catch (e) {
    console.warn("  Products seed skipped:", e.message);
  }
}

console.log("\n╔══════════════════════════════════════╗");
console.log("║      AJKMart Demo Data Seeder        ║");
console.log("╚══════════════════════════════════════╝\n");

// ── Customers ─────────────────────────────────────────────────────────────
runSQL(`
INSERT INTO users (id,phone,name,email,roles,phone_verified,approval_status,is_active,wallet_balance,city,area)
VALUES
  ('demo_cust_001','+923001234567','Ali Khan',      'ali@demo.ajkmart.com',     'customer',true,'approved',true,1500,'Muzaffarabad','Chattar'),
  ('demo_cust_002','+923011234568','Sara Malik',    'sara@demo.ajkmart.com',    'customer',true,'approved',true,800,'Mirpur','Sector F'),
  ('demo_cust_003','+923021234569','Usman Ahmed',   'usman@demo.ajkmart.com',   'customer',true,'approved',true,2200,'Rawalakot','Main Bazar'),
  ('demo_cust_004','+923031234570','Ayesha Butt',   'ayesha@demo.ajkmart.com',  'customer',true,'approved',true,350,'Muzaffarabad','Kohala'),
  ('demo_cust_005','+923041234571','Bilal Hussain', 'bilal@demo.ajkmart.com',   'customer',true,'approved',true,950,'Bagh','Town')
ON CONFLICT (id) DO NOTHING;
`);
console.log("✓ 5 demo customers ready");

// ── Vendors ───────────────────────────────────────────────────────────────
runSQL(`
INSERT INTO users (id,phone,name,email,roles,phone_verified,approval_status,is_active,wallet_balance,city,area)
VALUES
  ('demo_vend_001','+923051234572','Ahmed Store',     'ahmed.store@demo.ajkmart.com', 'vendor',true,'approved',true,8500,'Muzaffarabad','Main Bazar'),
  ('demo_vend_002','+923061234573','Mirpur Mart',     'mirpur.mart@demo.ajkmart.com', 'vendor',true,'approved',true,12000,'Mirpur','Sector G'),
  ('demo_vend_003','+923071234574','Desi Kitchen AJK','desi.kitchen@demo.ajkmart.com','vendor',true,'approved',true,6200,'Muzaffarabad','Chattar')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendor_profiles (user_id,store_name,store_category,store_description,store_is_open,store_address,business_type)
VALUES
  ('demo_vend_001','Ahmed General Store','mart',   'Your local grocery & daily needs store',        true,'Shop 12, Main Bazar, Muzaffarabad','retail'),
  ('demo_vend_002','Mirpur Mart',         'mart',   'Premium groceries & household items in Mirpur', true,'G-8 Commercial, Mirpur AJK',         'retail'),
  ('demo_vend_003','Desi Kitchen',        'food',   'Authentic AJK cuisine — biryani, karahi & more',true,'Chattar Road, Muzaffarabad',          'restaurant')
ON CONFLICT (user_id) DO NOTHING;
`);
console.log("✓ 3 demo vendors + profiles ready");

// ── Riders ────────────────────────────────────────────────────────────────
runSQL(`
INSERT INTO users (id,phone,name,email,roles,phone_verified,approval_status,is_active,wallet_balance,city,area)
VALUES
  ('demo_rider_001','+923081234575','Tariq Rider',    'tariq@demo.ajkmart.com', 'rider',true,'approved',true,2100,'Muzaffarabad','City'),
  ('demo_rider_002','+923091234576','Zubair Express', 'zubair@demo.ajkmart.com','rider',true,'approved',true,1750,'Mirpur','City'),
  ('demo_rider_003','+923101234577','Kamran Delivery','kamran@demo.ajkmart.com','rider',true,'approved',true,890,'Rawalakot','City')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rider_profiles (user_id,vehicle_type,vehicle_plate)
VALUES
  ('demo_rider_001','motorcycle','AJK-2345'),
  ('demo_rider_002','motorcycle','AJK-6789'),
  ('demo_rider_003','bicycle','N/A')
ON CONFLICT (user_id) DO NOTHING;
`);
console.log("✓ 3 demo riders + profiles ready");

// ── Orders ────────────────────────────────────────────────────────────────
runSQL(`
INSERT INTO orders (id,user_id,type,items,status,total,delivery_address,payment_method,vendor_id,rider_id,rider_name,rider_phone,estimated_time,created_at,updated_at)
VALUES
  ('demo_ord_001','demo_cust_001','mart',   '[{"name":"Fresh Milk 1L","price":180,"qty":2},{"name":"Bread","price":90,"qty":1}]',  'delivered','450',  'House 5, Chattar, Muzaffarabad',  'wallet',   'demo_vend_001','demo_rider_001','Tariq Rider',    '+923081234575','30 min', NOW()-interval'3 hours', NOW()-interval'3 hours'),
  ('demo_ord_002','demo_cust_002','food',   '[{"name":"Chicken Biryani","price":350,"qty":1},{"name":"Raita","price":50,"qty":1}]','preparing','400',  'Flat 3B, Sector F, Mirpur',       'cod',      'demo_vend_003',NULL,           NULL,             NULL,          '45 min', NOW()-interval'30 minutes',NOW()-interval'30 minutes'),
  ('demo_ord_003','demo_cust_003','mart',   '[{"name":"Eggs dozen","price":320,"qty":1},{"name":"Cooking Oil 1L","price":480,"qty":1},{"name":"Sugar 1kg","price":160,"qty":2}]','pending','1120','Main Bazar, Rawalakot','wallet','demo_vend_002',NULL,NULL,NULL,'40 min',NOW()-interval'5 minutes',NOW()-interval'5 minutes'),
  ('demo_ord_004','demo_cust_004','food',   '[{"name":"Mutton Karahi","price":650,"qty":1},{"name":"Naan x4","price":120,"qty":1}]','on_the_way','770','Kohala Road, Muzaffarabad','jazzcash','demo_vend_003','demo_rider_002','Zubair Express','+923091234576','20 min',NOW()-interval'1 hour',NOW()-interval'1 hour'),
  ('demo_ord_005','demo_cust_005','mart',   '[{"name":"Shan Masala Pack","price":95,"qty":3},{"name":"Lemon 250g","price":60,"qty":1}]','delivered','345','Town Area, Bagh AJK','wallet','demo_vend_001','demo_rider_003','Kamran Delivery','+923101234577','35 min',NOW()-interval'5 hours',NOW()-interval'5 hours'),
  ('demo_ord_006','demo_cust_001','pharmacy','[{"name":"Panadol 500mg x10","price":45,"qty":2},{"name":"ORS Sachet","price":30,"qty":3}]','delivered','180','House 5, Chattar, Muzaffarabad','wallet','ajkmart_system','demo_rider_001','Tariq Rider','+923081234575','20 min',NOW()-interval'1 day',NOW()-interval'1 day'),
  ('demo_ord_007','demo_cust_002','mart',   '[{"name":"Basmati Rice 5kg","price":1200,"qty":1},{"name":"Daal Mash 1kg","price":280,"qty":1}]','cancelled','1480','Flat 3B, Sector F, Mirpur','cod','demo_vend_002',NULL,NULL,NULL,'40 min',NOW()-interval'12 hours',NOW()-interval'12 hours')
ON CONFLICT (id) DO NOTHING;
`);
console.log("✓ 7 demo orders ready (pending/preparing/on_the_way/delivered/cancelled)");

// ── Platform settings ─────────────────────────────────────────────────────
runSQL(`
INSERT INTO platform_settings (key,value,updated_at) VALUES
  ('app_name','AJKMart',NOW()),
  ('support_phone','+92-300-0000000',NOW()),
  ('support_email','support@ajkmart.com',NOW()),
  ('delivery_fee_base','50',NOW()),
  ('delivery_fee_per_km','15',NOW()),
  ('min_order_amount','200',NOW()),
  ('max_delivery_radius_km','10',NOW()),
  ('ride_base_fare','80',NOW()),
  ('ride_per_km_fare','25',NOW())
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
`);
console.log("✓ Platform settings configured");

// ── Seed products + rides via API ────────────────────────────────────────
console.log("\nSeeding products & rides via API...");
await seedViaAPI();

try {
  const ridesRes = await fetch("http://127.0.0.1:5000/api/seed/rides", {
    method: "POST",
    headers: { "x-admin-seed-key": "local-dev-seed-ajkmart", "Content-Type": "application/json" },
  });
  const ridesData = await ridesRes.json();
  if (ridesData.success) {
    console.log(`✓ Rides seeded: ${ridesData.message}`);
  } else {
    console.log("  Rides seed response:", JSON.stringify(ridesData).slice(0, 120));
  }
} catch (e) {
  console.warn("  Rides seed skipped:", e.message);
}

console.log("\n╔══════════════════════════════════════╗");
console.log("║  ✅ Demo seed complete!               ║");
console.log("║                                       ║");
console.log("║  Demo Credentials:                    ║");
console.log("║  Admin:  superadmin / Admin@123       ║");
console.log("║  Vendor: +923051234572 (OTP: 123456)  ║");
console.log("║  Rider:  +923081234575 (OTP: 123456)  ║");
console.log("║  Customer: +923001234567 (OTP: 123456)║");
console.log("╚══════════════════════════════════════╝\n");
