#!/bin/bash

# Cross-Repository Test Setup Script for Authentication Package
# This script configures testing environment in any repository using this auth package

set -e

echo "🔧 Setting up cross-repository authentication tests..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Please run this from your project root."
    exit 1
fi

# Create test directories if they don't exist
mkdir -p tests/auth
mkdir -p tests/integration

# Copy test files from auth package
if [ -d "auth-package-export/tests" ]; then
    echo "📋 Copying authentication test files..."
    cp auth-package-export/tests/auth.test.ts tests/auth/
    cp auth-package-export/tests/integration.test.ts tests/integration/
    cp auth-package-export/tests/setup.ts tests/
else
    echo "⚠️  Warning: Auth package tests not found. Ensure git submodule is properly initialized."
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please ensure you're in a Node.js project."
    exit 1
fi

# Install test dependencies if not present
echo "📦 Installing test dependencies..."
npm install --save-dev vitest @vitest/coverage-v8 supertest @types/supertest

# Create vitest config if it doesn't exist
if [ ! -f "vitest.config.ts" ]; then
    echo "⚙️  Creating vitest configuration..."
    cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'auth-package-export/'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@auth': resolve(__dirname, 'auth-package-export'),
      '@shared': resolve(__dirname, 'shared'),
      '@server': resolve(__dirname, 'server'),
      '@client': resolve(__dirname, 'client')
    }
  }
});
EOF
fi

# Add test scripts to package.json if they don't exist
echo "📝 Adding test scripts to package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts['test:auth'] = 'vitest run tests/auth/';
pkg.scripts['test:integration'] = 'vitest run tests/integration/';
pkg.scripts['test:auth-watch'] = 'vitest tests/auth/';
pkg.scripts['test:coverage'] = 'vitest run --coverage';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Create a test runner script
echo "🚀 Creating test runner script..."
cat > run-auth-tests.js << 'EOF'
#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🧪 Running Authentication System Tests...\n');

// Check if auth package exists
if (!fs.existsSync('auth-package-export')) {
    console.error('❌ Auth package not found. Please ensure git submodule is initialized.');
    process.exit(1);
}

try {
    // Run authentication unit tests
    console.log('📋 Running authentication unit tests...');
    execSync('npm run test:auth', { stdio: 'inherit' });
    
    // Run integration tests
    console.log('\n🔗 Running integration tests...');
    execSync('npm run test:integration', { stdio: 'inherit' });
    
    console.log('\n✅ All authentication tests passed!');
} catch (error) {
    console.error('\n❌ Some tests failed. Check output above for details.');
    process.exit(1);
}
EOF

chmod +x run-auth-tests.js

# Create GitHub Actions workflow for CI/CD
mkdir -p .github/workflows
if [ ! -f ".github/workflows/auth-tests.yml" ]; then
    echo "🔄 Creating GitHub Actions workflow..."
    cat > .github/workflows/auth-tests.yml << 'EOF'
name: Authentication Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
      with:
        submodules: recursive
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run authentication tests
      run: |
        npm run test:auth
        npm run test:integration
    
    - name: Generate test coverage
      run: npm run test:coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: auth-tests
        name: auth-coverage
EOF
fi

echo "✅ Cross-repository authentication test setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run 'npm run test:auth' to test authentication features"
echo "2. Run 'npm run test:integration' to test API endpoints"  
echo "3. Run 'npm run test:coverage' to generate coverage reports"
echo "4. Use './run-auth-tests.js' to run all auth tests at once"
echo ""
echo "🔧 The setup includes:"
echo "- Vitest configuration with coverage"
echo "- Test scripts in package.json"
echo "- GitHub Actions workflow for CI/CD"
echo "- Cross-repository test compatibility"