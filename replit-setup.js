#!/usr/bin/env node

/**
 * Automated Replit Setup Script for Enterprise Authentication Package
 * Run with: node replit-setup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔐 Setting up Enterprise Authentication Package...\n');

// Check if we're in a submodule or direct installation
const isSubmodule = fs.existsSync('../package.json');
const targetDir = isSubmodule ? '..' : '.';

// Helper function to safely execute commands
function runCommand(command, description) {
  try {
    console.log(`📦 ${description}...`);
    execSync(command, { cwd: targetDir, stdio: 'inherit' });
    console.log(`✅ ${description} completed\n`);
  } catch (error) {
    console.log(`⚠️  ${description} failed, continuing...\n`);
  }
}

// Helper function to copy files
function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    files.forEach(file => {
      if (file !== '.git' && file !== 'node_modules') {
        copyRecursive(path.join(src, file), path.join(dest, file));
      }
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Install required dependencies
const dependencies = [
  'bcrypt',
  'express-session',
  'connect-pg-simple',
  'drizzle-orm',
  '@neondatabase/serverless'
];

console.log('📦 Installing authentication dependencies...');
dependencies.forEach(dep => {
  runCommand(`npm install ${dep}`, `Installing ${dep}`);
});

// 2. Copy auth system files to target directory
console.log('📁 Copying authentication system files...');
const authSystemDir = path.join(targetDir, 'auth-system');
if (!fs.existsSync(authSystemDir)) {
  fs.mkdirSync(authSystemDir, { recursive: true });
}

// Copy auth-system folder contents
if (fs.existsSync('./auth-system')) {
  copyRecursive('./auth-system', authSystemDir);
  console.log('✅ Authentication system files copied\n');
}

// 3. Update package.json scripts
const packageJsonPath = path.join(targetDir, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  console.log('📝 Updating package.json scripts...');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }
  
  // Add auth-related scripts
  packageJson.scripts['auth:test'] = 'node auth-system/test-auth.js';
  packageJson.scripts['auth:setup'] = 'node auth-system/setup-database.js';
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Package.json updated\n');
}

// 4. Create database setup if needed
console.log('🗄️  Setting up database schema...');
const dbSetupScript = `
const { db } = require('./auth-system/core/database');

async function setupAuthDatabase() {
  try {
    console.log('Setting up authentication database tables...');
    
    // Create users table if it doesn't exist
    await db.execute(\`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        profile_image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    \`);
    
    // Create sessions table if it doesn't exist
    await db.execute(\`
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    \`);
    
    console.log('✅ Authentication database setup complete');
  } catch (error) {
    console.error('Database setup error:', error.message);
  }
}

setupAuthDatabase();
`;

fs.writeFileSync(path.join(targetDir, 'setup-auth-db.js'), dbSetupScript);
runCommand('node setup-auth-db.js', 'Setting up authentication database');

// 5. Create integration example
console.log('📋 Creating integration example...');
const integrationExample = `
// Add this to your main server file (e.g., server/index.js or app.js)

const express = require('express');
const { setupAuth } = require('./auth-system');

const app = express();

// Setup authentication system
setupAuth(app);

// Your other routes here...

app.listen(3000, () => {
  console.log('Server running with authentication enabled');
});
`;

fs.writeFileSync(path.join(targetDir, 'auth-integration-example.js'), integrationExample);

// 6. Create environment variables template
console.log('⚙️  Creating environment template...');
const envTemplate = `
# Authentication Environment Variables
SESSION_SECRET=your-session-secret-here
DATABASE_URL=your-database-url-here

# Optional: Email configuration for password reset
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
`;

const envPath = path.join(targetDir, '.env.auth.example');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envTemplate);
  console.log('✅ Environment template created (.env.auth.example)\n');
}

// 7. Final instructions
console.log('🎉 Authentication Package Setup Complete!\n');
console.log('📋 Next Steps:');
console.log('1. Copy .env.auth.example to .env and configure your settings');
console.log('2. Add setupAuth(app) to your main server file');
console.log('3. Test the system with: npm run auth:test');
console.log('');
console.log('📚 Available Routes:');
console.log('- POST /api/auth/register - User registration');
console.log('- POST /api/auth/login - User login');
console.log('- POST /api/auth/logout - User logout');
console.log('- GET /api/auth/me - Get current user');
console.log('- PUT /api/auth/profile - Update profile');
console.log('');
console.log('🔒 Security Features Enabled:');
console.log('- Password hashing with bcrypt');
console.log('- Session management with database storage');
console.log('- Account lockout after failed attempts');
console.log('- Password strength validation');
console.log('- Email verification support');
console.log('');
console.log('📖 Documentation: See auth-system/README.md for detailed usage');