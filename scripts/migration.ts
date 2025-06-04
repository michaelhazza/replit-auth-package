import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { db } from '../server/db';
import fs from 'fs';
import path from 'path';

interface MigrationRecord {
  version: string;
  timestamp: Date;
  description: string;
  rollback?: string;
}

class MigrationManager {
  private migrationsPath: string;
  
  constructor() {
    this.migrationsPath = path.join(__dirname, '../migrations');
    this.ensureMigrationsTable();
  }

  private async ensureMigrationsTable() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auth_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        executed_at TIMESTAMP DEFAULT NOW(),
        rollback_sql TEXT
      );
    `);
  }

  async getCurrentVersion(): Promise<string | null> {
    const result = await db.execute(`
      SELECT version FROM auth_migrations 
      ORDER BY executed_at DESC 
      LIMIT 1
    `);
    return result.rows[0]?.version || null;
  }

  async getPendingMigrations(): Promise<string[]> {
    const currentVersion = await this.getCurrentVersion();
    const allMigrations = this.getAllMigrationFiles();
    
    if (!currentVersion) {
      return allMigrations;
    }
    
    const currentIndex = allMigrations.indexOf(currentVersion);
    return allMigrations.slice(currentIndex + 1);
  }

  private getAllMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsPath)) {
      return [];
    }
    
    return fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  async runMigration(version: string): Promise<void> {
    const migrationPath = path.join(this.migrationsPath, `${version}.sql`);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${version}.sql`);
    }
    
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const rollbackPath = path.join(this.migrationsPath, `${version}.rollback.sql`);
    const rollbackSql = fs.existsSync(rollbackPath) 
      ? fs.readFileSync(rollbackPath, 'utf8') 
      : null;
    
    try {
      // Execute migration in transaction
      await db.transaction(async (tx) => {
        await tx.execute(migrationSql);
        
        // Record migration
        await tx.execute(`
          INSERT INTO auth_migrations (version, description, rollback_sql)
          VALUES ($1, $2, $3)
        `, [version, `Migration ${version}`, rollbackSql]);
      });
      
      console.log(`Migration ${version} executed successfully`);
    } catch (error) {
      console.error(`Migration ${version} failed:`, error);
      throw error;
    }
  }

  async rollbackMigration(version?: string): Promise<void> {
    const targetVersion = version || await this.getCurrentVersion();
    
    if (!targetVersion) {
      throw new Error('No migrations to rollback');
    }
    
    const result = await db.execute(`
      SELECT rollback_sql FROM auth_migrations 
      WHERE version = $1
    `, [targetVersion]);
    
    const rollbackSql = result.rows[0]?.rollback_sql;
    
    if (!rollbackSql) {
      throw new Error(`No rollback script found for version ${targetVersion}`);
    }
    
    try {
      await db.transaction(async (tx) => {
        await tx.execute(rollbackSql);
        
        // Remove migration record
        await tx.execute(`
          DELETE FROM auth_migrations WHERE version = $1
        `, [targetVersion]);
      });
      
      console.log(`Migration ${targetVersion} rolled back successfully`);
    } catch (error) {
      console.error(`Rollback of ${targetVersion} failed:`, error);
      throw error;
    }
  }

  async runPendingMigrations(): Promise<void> {
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }
    
    console.log(`Running ${pendingMigrations.length} pending migrations...`);
    
    for (const migration of pendingMigrations) {
      await this.runMigration(migration.replace('.sql', ''));
    }
    
    console.log('All migrations completed');
  }

  async createMigration(description: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const version = `${timestamp}_${description.toLowerCase().replace(/\s+/g, '_')}`;
    
    const migrationPath = path.join(this.migrationsPath, `${version}.sql`);
    const rollbackPath = path.join(this.migrationsPath, `${version}.rollback.sql`);
    
    // Ensure migrations directory exists
    if (!fs.existsSync(this.migrationsPath)) {
      fs.mkdirSync(this.migrationsPath, { recursive: true });
    }
    
    // Create empty migration files
    fs.writeFileSync(migrationPath, `-- Migration: ${description}\n-- Created: ${new Date().toISOString()}\n\n-- Add your migration SQL here\n`);
    fs.writeFileSync(rollbackPath, `-- Rollback: ${description}\n-- Created: ${new Date().toISOString()}\n\n-- Add your rollback SQL here\n`);
    
    console.log(`Created migration files:\n- ${migrationPath}\n- ${rollbackPath}`);
    return version;
  }

  async getStatus(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = await this.getPendingMigrations();
    
    console.log(`Current version: ${currentVersion || 'None'}`);
    console.log(`Pending migrations: ${pendingMigrations.length}`);
    
    if (pendingMigrations.length > 0) {
      console.log('Pending:');
      pendingMigrations.forEach(migration => {
        console.log(`  - ${migration}`);
      });
    }
  }
}

// CLI interface
if (require.main === module) {
  const migrationManager = new MigrationManager();
  const command = process.argv[2];
  const arg = process.argv[3];
  
  switch (command) {
    case 'status':
      migrationManager.getStatus();
      break;
    case 'migrate':
      migrationManager.runPendingMigrations();
      break;
    case 'rollback':
      migrationManager.rollbackMigration(arg);
      break;
    case 'create':
      if (!arg) {
        console.error('Please provide a migration description');
        process.exit(1);
      }
      migrationManager.createMigration(arg);
      break;
    default:
      console.log(`
Usage: node migration.ts <command> [options]

Commands:
  status              Show current migration status
  migrate             Run all pending migrations
  rollback [version]  Rollback to previous version or specific version
  create <description> Create a new migration file

Examples:
  node migration.ts status
  node migration.ts migrate
  node migration.ts rollback
  node migration.ts create "add user preferences table"
      `);
  }
}

export { MigrationManager };