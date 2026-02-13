import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
dotenv.config();

// Define the desired schema structure
interface ColumnDefinition {
  name: string;
  type: string;
  notNull?: boolean;
  default?: string | number | null;
  primaryKey?: boolean;
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
  },
  feature_usage: {
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true },
      { name: 'feature', type: 'TEXT', notNull: true },
      { name: 'did', type: 'TEXT' },
      { name: 'details', type: 'JSON' },
      { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
    ]
  }
};

const dbFile = process.env.SQLITE_DB_FILE || ':memory:';

// Singleton connection
let sharedDb: sqlite3.Database | null = null;
let initializationPromise: Promise<void> | null = null;

const getSharedDb = (): Promise<sqlite3.Database> => {
  if (sharedDb) return Promise.resolve(sharedDb);

  if (!initializationPromise) {
    initializationPromise = new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbFile, (err) => {
        if (err) {
          console.error(`Could not connect to database ${dbFile}`, err);
          initializationPromise = null; // Reset on failure
          reject(err);
        } else {
          sharedDb = db;

          // Configure DB
          db.configure("busyTimeout", 5000); // 5 seconds

          // Enable WAL mode
          db.run('PRAGMA journal_mode = WAL;', (err) => {
            if (err) {
              console.error('Failed to enable WAL mode:', err);
            } else {
              console.log(`Connected to SQLite database: ${dbFile} [WAL Enabled]`);
            }
            resolve();
          });
        }
      });
    });
  }

  return initializationPromise.then(() => sharedDb!);
};

export class SQLite3 {
  tableName: string;
  pkName: string; // Primary Key column name

  constructor(tableName = 'followers', pkName = 'did') {
    this.tableName = tableName;
    this.pkName = pkName;
  }

  private async getDb(): Promise<sqlite3.Database> {
    return await getSharedDb();
  }

  private async getCurrentSchema(): Promise<ColumnDefinition[]> {
    const db = await this.getDb();
    const currentSchemaQuery = `PRAGMA table_info(${this.tableName});`;
    return new Promise((resolve, reject) => {
      db.all(currentSchemaQuery, [], (err, rows: any[]) => {
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

    const tableExists = await this.checkTableExists();
    if (!tableExists) {
      await this.createTable(desiredSchema);
    }

    const currentColumns = await this.getCurrentSchema();
    const existingColumnNames = new Set(currentColumns.map(col => col.name));
    const db = await this.getDb();

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
          db.run(addColumnQuery, (err) => {
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
  }

  private async checkTableExists(): Promise<boolean> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${this.tableName}';`, (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
  }

  private async createTable(schema: TableSchema): Promise<void> {
    let query = `CREATE TABLE ${this.tableName} (`;
    const cols = schema.columns.map(col => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.notNull) def += ' NOT NULL';
      if (col.default !== undefined) {
        const val = col.default;
        if (val === null) def += ' DEFAULT NULL';
        else if (typeof val === 'string') {
          if (val.toUpperCase() === 'CURRENT_TIMESTAMP') def += ' DEFAULT CURRENT_TIMESTAMP';
          else def += ` DEFAULT '${val.replace(/'/g, "''")}'`;
        }
        else def += ` DEFAULT ${val}`;
      }
      return def;
    });
    query += cols.join(', ') + ');';

    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      console.log(`Creating table ${this.tableName}:`, query);
      db.run(query, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async initialize(): Promise<void> {
    // Ensure DB is connected
    await this.getDb();
    // Then ensure schema
    await this.ensureSchema();
  }

  async insertDb(id: string): Promise<void> {
    const db = await this.getDb();
    const query = `INSERT OR IGNORE INTO ${this.tableName} (${this.pkName}) VALUES (?);`;
    db.run(query, [id], err => { if (err) console.error(err); });
  }

  async upsertRow(data: Record<string, any>) {
    const db = await this.getDb();
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const placeholders = keys.map(() => '?').join(',');
    const query = `INSERT OR REPLACE INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
    return new Promise<void>((resolve, reject) => {
      db.run(query, Object.values(data), (err) => {
        if (err) { console.error(err); reject(err); }
        else resolve();
      });
    });
  }

  async insertRow(data: Record<string, any>) {
    const db = await this.getDb();
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const placeholders = keys.map(() => '?').join(',');
    const query = `INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
    return new Promise<void>((resolve, reject) => {
      db.run(query, Object.values(data), (err) => {
        if (err) { console.error(err); reject(err); }
        else resolve();
      });
    });
  }

  async updateDb(id: string, column: string, value?: string | number | null): Promise<void> {
    const db = await this.getDb();
    const query = `UPDATE ${this.tableName} SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE ${this.pkName} = ?`;
    db.run(query, [value, id], err => { if (err) console.error(err); });
  }

  async getRowById(id: string): Promise<Record<string, any> | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM ${this.tableName} WHERE ${this.pkName} = ?;`;
      db.get(query, [id], (err, row: any) => {
        if (err) reject(err);
        else {
          resolve(row || null);
        }
      });
    });
  }

  async getOne(query: string, params: any[] = []): Promise<any> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getAll(query: string, params: any[] = []): Promise<any[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async run(query: string, params: any[] = []): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async selectRows(column: string, value: any): Promise<any[]> {
    return this.getAll(`SELECT * FROM ${this.tableName} WHERE ${column} = ?`, [value]);
  }

  async insertOrUpdateDb(id: string): Promise<void> {
    const db = await this.getDb();
    const query = `INSERT INTO ${this.tableName} (${this.pkName}) VALUES (?) ON CONFLICT(${this.pkName}) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;`;
    db.run(query, [id], err => { if (err) console.error(err); });
  }

  async deleteRow(id: string): Promise<void> {
    const db = await this.getDb();
    const query = `DELETE FROM ${this.tableName} WHERE ${this.pkName} = ?;`;
    db.run(query, [id], err => { if (err) console.error(err); });
  }

  async clearAllRows(): Promise<void> {
    const db = await this.getDb();
    const query = `DELETE FROM ${this.tableName};`;
    return new Promise((resolve, reject) => {
      db.run(query, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async closeDb(): Promise<void> {
    if (sharedDb) {
      sharedDb.close();
      sharedDb = null;
      initializationPromise = null;
    }
  }
}

export const db = new SQLite3("followers", "did");
export const dbPosts = new SQLite3("posts", "did");
export const dbLikes = new SQLite3("likes", "did");
export const dbReplies = new SQLite3("replies", "did");
export const dbBotState = new SQLite3("bot_state", "key");
export const dbAffirmations = new SQLite3("affirmations", "id");
export const dbFeatureUsage = new SQLite3("feature_usage", "id");

export async function initializeDatabases() {
  await db.initialize();
  await dbPosts.initialize();
  await dbLikes.initialize();
  await dbReplies.initialize();
  await dbBotState.initialize();
  await dbAffirmations.initialize();
  await dbFeatureUsage.initialize();
  console.log("All databases initialized.");
}
