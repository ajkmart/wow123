const { createCipheriv, randomBytes, scryptSync } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const ROOT = '/workspaces/mart-replit123';
const ENCRYPTED_FILE = path.join(ROOT, '.env.enc');
const ALGORITHM = 'aes-256-gcm';
const SALT = Buffer.from('AJKMart-Env-Salt-2024-v1', 'utf8');
const password = 'Khan@123.com';

function deriveKey(pwd) {
  return scryptSync(pwd, SALT, 32);
}

function encrypt(data, pwd) {
  const key = deriveKey(pwd);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

const envPath = path.join(ROOT, '.env');
const envData = readFileSync(envPath, 'utf8');
const encryptedData = encrypt(envData, password);
writeFileSync(ENCRYPTED_FILE, JSON.stringify(encryptedData, null, 2));
console.log('✅ .env.enc created successfully');