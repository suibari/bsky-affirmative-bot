import sqlite3 from 'sqlite3';

// Define the desired schema structure
interface ColumnDefinition {
  name: string;
  type: string;
  notNull?: boolean; // Corrected from 'notnull'
  default?: string | number | null;
  primaryKey?: boolean; // Note: Adding PKs via ALTER TABLE is complex in SQLite
}

interface TableSchema {
  columns: ColumnDefinition[];
}

const desiredSchemas: Record<string, TableSchema> = {
  followers: {
    columns: [
      { name: 'did', type: 'TEXT', primaryKey: true },
      { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
      { name: 'is_u18', type: 'INTEGER', default: 0 },
      { name: 'is_ai_only', type: 'INTEGER', default: 0 },
      { name: 'last_uranai_at', type: 'TIMESTAMP', default: null },
      { name: 'reply_freq', type: 'INTEGER', default: 100 },
      { name: 'last_conv_at', type: 'TIMESTAMP', default: null },
      { name: 'conv_history', type: 'JSON', default: null },
      { name: 'conv_root_cid', type: 'TEXT', default: null },
      { name: 'last_analyze_at', type: 'TIMESTAMP', default: null },
      { name: 'last_cheer_at', type: 'TIMESTAMP', default: null },
      { name: 'last_dj_at', type: 'TIMESTAMP', default: null },
      { name: 'user_anniv_name', type: 'TEXT', default: null },
      { name: 'user_anniv_date', type: 'TEXT', default: null },
      { name: 'last_anniv_execed_at', type: 'TIMESTAMP', default: null },
      { name: 'last_anniv_registered_at', type: 'TIMESTAMP', default: null },
      { name: 'last_status_at', type: 'TIMESTAMP', default: null },
      { name: 'question_root_uri', type: 'TEXT', default: null },
      { name: 'last_answered_at', type: 'TIMESTAMP', default: null },
      { name: 'last_recap_at', type: 'TIMESTAMP', default: null },
    ]
  },
  posts: {
    columns: [
      { name: 'did', type: 'TEXT', primaryKey: true },
      { name: 'post', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
      { name: 'updated_at', type: 'TIMESTAMP' },
      { name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'CURRENT_TIMESTAMP' },
      { name: 'uri', type: 'TEXT' },
      { name: 'comment', type: 'TEXT' },
    ]
  },
  likes: {
    columns: [
      { name: 'did', type: 'TEXT', primaryKey: true },
      { name: 'liked_post', type: 'TEXT' },
      { name: 'uri', type: 'TEXT' },
      { name: 'updated_at', type: 'TIMESTAMP' },
      { name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'CURRENT_TIMESTAMP' },
    ]
  },
  replies: {
    columns: [
      { name: 'did', type: 'TEXT', primaryKey: true },
      { name: 'reply', type: 'TEXT' },
      { name: 'uri', type: 'TEXT' },
      { name: 'isRead', type: 'INTEGER', default: 0 },
      { name: 'updated_at', type: 'TIMESTAMP' },
      { name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'CURRENT_TIMESTAMP' },
    ]
  },
  bot_state: {
    columns: [
      { name: 'key', type: 'TEXT', primaryKey: true },
      { name: 'value', type: 'JSON' },
      { name: 'updated_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
    ]
  },
  affirmations: {
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true },
      { name: 'did', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
    ]
  }
};

export class SQLite3 {
  private db: sqlite3.Database | null = null;
  tableName: string;
  pkName: string; // Primary Key column name
  private initializationPromise: Promise<void>;

  constructor(tableName = 'followers', pkName = 'did') { // Default PK is 'did'
    const dbFile = process.env.SQLITE_DB_FILE || ':memory:';
    this.tableName = tableName;
    this.pkName = pkName;

    this.initializationPromise = new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbFile, (err) => {
        if (err) {
          console.error(`Could not connect to database ${dbFile}`, err);
          reject(err);
        } else {
          console.log(`Connected to SQLite database: ${dbFile} (Table: ${tableName})`);
          this.db!.configure("busyTimeout", 5000);
          this.ensureSchema()
            .then(() => resolve())
            .catch(schemaErr => {
              console.error(`Schema initialization failed for ${this.tableName}:`, schemaErr);
              reject(schemaErr);
            });
        }
      });
    });
  }

  // ... getCurrentSchema and ensureSchema skipped (unchanged mostly, except logging) ...
  // Actually, I should keep them or assume they are replaced if I replace the whole class.
  // But replace_file_content only replaces the chunk.
  // I will use replace_file_content for methods.

  // Method to get current schema
  private async getCurrentSchema(): Promise<ColumnDefinition[]> {
    const currentSchemaQuery = `PRAGMA table_info(${this.tableName});`;
    return new Promise((resolve, reject) => {
      this.db!.all(currentSchemaQuery, [], (err, rows: any[]) => {
        if (err) {
          console.error(`Error getting schema for ${this.tableName}:`, err);
          reject(err);
        } else {
          const schema: ColumnDefinition[] = rows.map(row => ({
            name: row.name,
            type: row.type,
            notNull: row.notnull === 1,
            default: row.dflt_value !== undefined ? row.dflt_value : null,
            primaryKey: row.pk === 1
          }));
          resolve(schema);
        }
      });
    });
  }

  async ensureSchema(): Promise<void> {
    const desiredSchema = desiredSchemas[this.tableName];
    if (!desiredSchema) {
      console.warn(`No desired schema found for table: ${this.tableName}`);
      return;
    }

    const currentColumns = await this.getCurrentSchema();
    const existingColumnNames = new Set(currentColumns.map(col => col.name));

    for (const desiredCol of desiredSchema.columns) {
      if (!existingColumnNames.has(desiredCol.name)) {
        let addColumnQuery = `ALTER TABLE ${this.tableName} ADD COLUMN ${desiredCol.name} ${desiredCol.type}`;

        if (desiredCol.notNull !== undefined && desiredCol.notNull) {
          addColumnQuery += ' NOT NULL';
        }
        if (desiredCol.default !== undefined) {
          const defaultValue = desiredCol.default;
          if (defaultValue === null) {
            addColumnQuery += ' DEFAULT NULL';
          } else if (typeof defaultValue === 'string') {
            if (defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP' || defaultValue.toUpperCase() === 'NULL') {
              addColumnQuery += ` DEFAULT ${defaultValue.toUpperCase()}`;
            } else {
              addColumnQuery += ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
            }
          } else {
            addColumnQuery += ` DEFAULT ${defaultValue}`;
          }
        }

        console.log(`Executing: ${addColumnQuery}`);
        await new Promise((resolve, reject) => {
          this.db!.run(addColumnQuery, (err) => {
            if (err) {
              console.error(`Error adding column ${desiredCol.name} to ${this.tableName}:`, err);
              reject(err);
            } else {
              resolve(undefined);
            }
          });
        });
      }
    }

    // Check if table exists (for create table if not exists - logic implied by ensureSchema requiring table? 
    // No, ensureSchema only ADDS columns. It doesn't CREATE table.
    // The original code seemingly assumed tables exist or created them elsewhere?
    // Wait, 'sqlite3' opens DB. If file exists, it opens. Tables?
    // The original code did NOT have CREATE TABLE logic!
    // It only had ALTER TABLE ADD COLUMN.
    // So if I start with empty DB, it will fail to ALTER TABLE on non-existent table!
    // I MUST ADD CREATE TABLE logic.

    const tableExists = await this.checkTableExists();
    if (!tableExists) {
      await this.createTable(desiredSchema);
    }
  }

  private checkTableExists(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db!.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${this.tableName}';`, (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
  }

  private createTable(schema: TableSchema): Promise<void> {
    let query = `CREATE TABLE ${this.tableName} (`;
    const cols = schema.columns.map(col => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.notNull) def += ' NOT NULL';
      if (col.default !== undefined) {
        const val = col.default;
        if (val === null) def += ' DEFAULT NULL';
        else if (typeof val === 'string') {
          // specialized handling for CURRENT_TIMESTAMP
          if (val.toUpperCase() === 'CURRENT_TIMESTAMP') def += ' DEFAULT CURRENT_TIMESTAMP';
          else def += ` DEFAULT '${val.replace(/'/g, "''")}'`;
        }
        else def += ` DEFAULT ${val}`;
      }
      return def;
    });
    query += cols.join(', ') + ');';

    return new Promise((resolve, reject) => {
      console.log(`Creating table ${this.tableName}:`, query);
      this.db!.run(query, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async initialize(): Promise<void> {
    await this.initializationPromise;
  }

  // Generic Insert/Update
  insertDb(id: string) {
    const query = `INSERT OR IGNORE INTO ${this.tableName} (${this.pkName}) VALUES (?);`;
    this.db!.run(query, [id], err => { if (err) console.error(err); });
  }

  // Generic Upsert Row (Insert or Replace)
  upsertRow(data: Record<string, any>) {
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const placeholders = keys.map(() => '?').join(',');
    const query = `INSERT OR REPLACE INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
    return new Promise<void>((resolve, reject) => {
      this.db!.run(query, Object.values(data), (err) => {
        if (err) { console.error(err); reject(err); }
        else resolve();
      });
    });
  }

  // Generic Insert Row
  insertRow(data: Record<string, any>) {
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const placeholders = keys.map(() => '?').join(',');
    const query = `INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
    return new Promise<void>((resolve, reject) => {
      this.db!.run(query, Object.values(data), (err) => {
        if (err) { console.error(err); reject(err); }
        else resolve();
      });
    });
  }

  updateDb(id: string, column: string, value?: string | number | null) {
    const query = `UPDATE ${this.tableName} SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE ${this.pkName} = ?`;
    this.db!.run(query, [value, id], err => { if (err) console.error(err); });
  }

  getRowById(id: string): Promise<Record<string, any> | null> {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM ${this.tableName} WHERE ${this.pkName} = ?;`;
      this.db!.get(query, [id], (err, row: any) => {
        if (err) reject(err);
        else {
          resolve(row || null);
        }
      });
    });
  }

  getOne(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db!.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  getAll(query: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  run(query: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  selectRows(column: string, value: any): Promise<any[]> {
    return this.getAll(`SELECT * FROM ${this.tableName} WHERE ${column} = ?`, [value]);
  }

  insertOrUpdateDb(id: string) {
    const query = `INSERT INTO ${this.tableName} (${this.pkName}) VALUES (?) ON CONFLICT(${this.pkName}) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;`;
    this.db!.run(query, [id], err => { if (err) console.error(err); });
  }

  // selectDb, selectRows, deleteRow, closeDb, getHighestScore, clearAllRows ... use generic logic or remove if unused.
  // Keeping essential ones.

  deleteRow(id: string): void {
    const query = `DELETE FROM ${this.tableName} WHERE ${this.pkName} = ?;`;
    this.db!.run(query, [id], err => { if (err) console.error(err); });
  }

  clearAllRows(): Promise<void> {
    const query = `DELETE FROM ${this.tableName};`;
    return new Promise((resolve, reject) => {
      this.db!.run(query, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  closeDb() { this.db!.close(); }
}

// Initialize database instances
export const db = new SQLite3("followers", "did");
export const dbPosts = new SQLite3("posts", "did");
export const dbLikes = new SQLite3("likes", "did");
export const dbReplies = new SQLite3("replies", "did");
export const dbBotState = new SQLite3("bot_state", "key");
export const dbAffirmations = new SQLite3("affirmations", "id");

export async function initializeDatabases() {
  await Promise.all([
    db.initialize(),
    dbPosts.initialize(),
    dbLikes.initialize(),
    dbReplies.initialize(),
    dbBotState.initialize(),
    dbAffirmations.initialize(),
  ]);
  console.log("All databases initialized.");
}

// Example of how to use it:
// import { initializeDatabases } from './db';
// async function main() {
//   await initializeDatabases();
//   // Now you can safely use db, dbPosts, dbLikes
//   // db.insertDb('some_did');
// }
// main();
