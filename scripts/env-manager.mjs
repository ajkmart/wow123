#!/usr/bin/env node
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ==================== CONFIGURATION ====================
const ENCRYPTED_FILE = path.join(ROOT, '.env.enc');
const ALGORITHM = 'aes-256-gcm';
const SALT = Buffer.from('AJKMart-Env-Salt-2024-v1', 'utf8'); // Fixed salt for consistency
const MAX_ATTEMPTS = 7;

// ==================== REQUIRED ENV VARIABLES ====================
const REQUIRED_VARIABLES = {
  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ajkmart',

  // JWT Secrets
  JWT_SECRET: '',
  ADMIN_ACCESS_TOKEN_SECRET: '',
  ADMIN_REFRESH_TOKEN_SECRET: '',
  ADMIN_CSRF_SECRET: '',

  // Admin Seed
  ADMIN_SEED_USERNAME: 'superadmin',
  ADMIN_SEED_PASSWORD: 'Admin@123',
  ADMIN_SEED_EMAIL: 'admin@ajkmart.com',
  ADMIN_SEED_NAME: 'Super Admin',

  // Port Configuration
  PORT: '5000',
  PORT_FALLBACK_ENABLE: 'true',
  PORT_MAX_RETRIES: '10',

  // URLs
  APP_BASE_URL: 'http://localhost:5000',
  ADMIN_BASE_URL: 'http://localhost:23744',
  FRONTEND_URL: 'http://localhost:23744,http://localhost:3002,http://localhost:3003,http://localhost:19006',
  CLIENT_URL: 'http://localhost:4200',

  // Third-Party (optional but should exist)
  GEMINI_API_KEY: '',
  FIREBASE_PROJECT_ID: '',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_FROM_NUMBER: '',
  SENDGRID_API_KEY: '',
  SMTP_HOST: '',
  GOOGLE_MAPS_API_KEY: '',
  OSRM_API_URL: '',
  REDIS_URL: '',
  SENTRY_DSN: '',

  // Feature Flags
  ADMIN_LEGACY_AUTH_DISABLED: '0',
  LOG_LEVEL: 'debug',
  NODE_ENV: 'development',

  // Security
  ERROR_REPORT_HMAC_SECRET: '',
  JWT_ISSUER: 'ajkmart-dev',
  ALLOWED_ORIGINS: '',

  // Admin Config
  ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN: '15',

  // Expo/Vite Config
  EXPO_PUBLIC_DOMAIN: 'localhost:5000',
  VITE_API_BASE_URL: 'http://localhost:5000',
  VITE_API_PROXY_TARGET: 'http://localhost:5000',
};

// ==================== COLORS ====================
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// ==================== PASSWORD INPUT (WITH HIDDEN CHARS) ====================
const askPassword = (prompt) => {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });

    // Hide password input
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (stringToWrite !== '\n' && stringToWrite !== '\r\n' && stringToWrite !== '\r') {
        rl.output.write('*');
      } else {
        rl.output.write(stringToWrite);
      }
    };
  });
};

// ==================== UTILITY FUNCTIONS ====================
function printError(message) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function printSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function printInfo(message) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function printWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function log(type, message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;

  switch (level) {
    case 'error':
      printError(logMessage);
      break;
    case 'success':
      printSuccess(logMessage);
      break;
    case 'warning':
      printWarning(logMessage);
      break;
    default:
      printInfo(logMessage);
  }
}

// ==================== ENCRYPTION/DECRYPTION ====================
function deriveKey(password) {
  return scryptSync(password, SALT, 32);
}

function encrypt(data, password) {
  const key = deriveKey(password);
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

function decrypt(encryptedData, password) {
  const key = deriveKey(password);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encryptedData.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ==================== ENV FILE OPERATIONS ====================
function loadEncryptedEnv() {
  if (!existsSync(ENCRYPTED_FILE)) {
    printError('No encrypted environment file found (.env.enc)');
    return null;
  }

  try {
    const data = readFileSync(ENCRYPTED_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    printError(`Failed to load encrypted env: ${error.message}`);
    return null;
  }
}

function saveEncryptedEnv(data) {
  try {
    writeFileSync(ENCRYPTED_FILE, JSON.stringify(data, null, 2));
    printSuccess(`Encrypted file saved: .env.enc`);
  } catch (error) {
    printError(`Failed to save encrypted env: ${error.message}`);
  }
}

function createEnvFile(envData) {
  const envPath = path.join(ROOT, '.env');
  const lines = [];

  for (const [key, value] of Object.entries(envData)) {
    if (value !== undefined && value !== null) {
      lines.push(`${key}=${value}`);
    }
  }

  try {
    writeFileSync(envPath, lines.join('\n') + '\n');
    printSuccess(`Environment file created: .env`);
  } catch (error) {
    printError(`Failed to create .env file: ${error.message}`);
  }
}

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  const env = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }

  return env;
}

// ==================== MAIN COMMANDS ====================
async function decryptEnv(password = null) {
  const encryptedData = loadEncryptedEnv();
  if (!encryptedData) return false;

  if (!password) {
    password = await askPassword(`Enter decryption password (attempt ${attempt}/${MAX_ATTEMPTS}): `);
  }

  try {
    const decrypted = decrypt(encryptedData, password);
    const envData = JSON.parse(decrypted);
    createEnvFile(envData);
    printSuccess('Environment decrypted successfully!');
    return true;
  } catch (error) {
    printError(`Decryption failed: ${error.message}`);
    return false;
  }
}

async function encryptEnv(password = null) {
  const envData = loadEnvFile();

  if (Object.keys(envData).length === 0) {
    printError('No environment variables found in .env file');
    return false;
  }

  if (!password) {
    password = await askPassword('Enter encryption password: ');
    const confirmPassword = await askPassword('Confirm encryption password: ');

    if (password !== confirmPassword) {
      printError('Passwords do not match');
      return false;
    }
  }

  const encryptedData = encrypt(JSON.stringify(envData, null, 2), password);
  saveEncryptedEnv(encryptedData);
  printSuccess('Environment encrypted successfully!');
  return true;
}

async function setupEnv() {
  printInfo('Setting up environment variables...');

  const envData = { ...REQUIRED_VARIABLES };

  // Load existing .env if it exists
  const existingEnv = loadEnvFile();
  Object.assign(envData, existingEnv);

  // Interactive setup for missing values
  for (const [key, defaultValue] of Object.entries(REQUIRED_VARIABLES)) {
    if (!envData[key] || envData[key] === '') {
      const value = await askPassword(`${key} (default: ${defaultValue}): `);
      envData[key] = value || defaultValue;
    }
  }

  createEnvFile(envData);
  printSuccess('Environment setup complete!');
}

async function resetEnv() {
  printWarning('RESET ENVIRONMENT — This will delete existing .env.enc');

  const confirm = await askPassword('Type "RESET" to confirm: ');
  if (confirm !== 'RESET') {
    printError('Reset cancelled');
    return;
  }

  if (existsSync(ENCRYPTED_FILE)) {
    const backupFile = `${ENCRYPTED_FILE}.backup.${Date.now()}`;
    try {
      const data = readFileSync(ENCRYPTED_FILE);
      writeFileSync(backupFile, data);
      printInfo(`Backup created: ${backupFile}`);
    } catch (error) {
      printWarning(`Failed to create backup: ${error.message}`);
    }
  }

  // Remove encrypted file
  if (existsSync(ENCRYPTED_FILE)) {
    require('fs').unlinkSync(ENCRYPTED_FILE);
    printSuccess('Encrypted environment file deleted');
  }

  // Remove .env file
  const envPath = path.join(ROOT, '.env');
  if (existsSync(envPath)) {
    require('fs').unlinkSync(envPath);
    printSuccess('Environment file deleted');
  }

  printSuccess('Environment reset complete!');
}

function showHelp() {
  console.log(`
${colors.bold}AJKMart Environment Manager${colors.reset}

${colors.cyan}USAGE:${colors.reset}
  node scripts/env-manager.mjs <command>

${colors.cyan}COMMANDS:${colors.reset}
  ${colors.green}decrypt${colors.reset}    Decrypt .env.enc to .env
  ${colors.green}encrypt${colors.reset}    Encrypt .env to .env.enc
  ${colors.green}setup${colors.reset}      Interactive environment setup
  ${colors.green}reset${colors.reset}      Reset environment (deletes .env.enc and .env)
  ${colors.green}help${colors.reset}        Show this help message

${colors.cyan}EXAMPLES:${colors.reset}
  node scripts/env-manager.mjs decrypt
  node scripts/env-manager.mjs encrypt
  node scripts/env-manager.mjs setup

${colors.yellow}SECURITY NOTES:${colors.reset}
  - .env.enc is git-safe (can be committed)
  - .env is gitignored (never commit)
  - Use strong passwords for encryption
  - Keep backups of .env.enc
`);
}

// ==================== MAIN ====================
async function main() {
  const command = process.argv[2];
  const password = process.argv[3]; // Optional password for non-interactive mode

  switch (command) {
    case 'decrypt':
      await decryptEnv(password);
      break;
    case 'encrypt':
      await encryptEnv(password);
      break;
    case 'setup':
      await setupEnv();
      break;
    case 'reset':
      await resetEnv();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

main().catch(error => {
  printError(`Unexpected error: ${error.message}`);
  process.exit(1);
});