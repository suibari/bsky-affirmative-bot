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
      { name: 'updated_at', type: 'TIMESTAMP' },
      { name: 'created_at', type: 'TIMESTAMP', notNull: true, default: 'CURRENT_TIMESTAMP' },
    ]
  }
};

export class SQLite3 {
  private db: sqlite3.Database | null = null; // Initialize to null
  tableName: string;
  private initializationPromise: Promise<void>; // To manage initialization

  constructor(tableName = 'followers') {
    const dbFile = process.env.SQLITE_DB_FILE || ':memory:';
    this.tableName = tableName;

    this.initializationPromise = new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbFile, (err) => {
        if (err) {
          console.error(`Could not connect to database ${dbFile}`, err);
          reject(err);
        } else {
          console.log(`Connected to SQLite database: ${dbFile}`);
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

  // Method to get current schema
  private async getCurrentSchema(): Promise<ColumnDefinition[]> {
    const currentSchemaQuery = `PRAGMA table_info(${this.tableName});`;
    // Use non-null assertion operator as db is guaranteed to be initialized by the time this is called via initialize()
    return new Promise((resolve, reject) => {
      this.db!.all(currentSchemaQuery, [], (err, rows: any[]) => {
        if (err) {
          console.error(`Error getting schema for ${this.tableName}:`, err);
          reject(err);
        } else {
          const schema: ColumnDefinition[] = rows.map(row => ({
            name: row.name,
            type: row.type,
            notNull: row.notnull === 1, // Corrected typo here: row.notnull maps to ColumnDefinition.notNull
            default: row.dflt_value !== undefined ? row.dflt_value : null,
            primaryKey: row.pk === 1
          }));
          resolve(schema);
        }
      });
    });
  }

  // Method to ensure the schema matches the desired definition
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
              addColumnQuery += ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`; // Escape single quotes
            }
          } else {
            addColumnQuery += ` DEFAULT ${defaultValue}`;
          }
        }
        if (desiredCol.primaryKey) {
          console.warn(`Skipping adding PRIMARY KEY for column ${desiredCol.name} in table ${this.tableName}. Primary keys should be defined during table creation.`);
        }

        console.log(`Executing: ${addColumnQuery}`);
        await new Promise((resolve, reject) => {
          // Use non-null assertion operator
          this.db!.run(addColumnQuery, (err) => {
            if (err) {
              console.error(`Error adding column ${desiredCol.name} to ${this.tableName}:`, err);
              reject(err);
            } else {
              console.log(`Column ${desiredCol.name} added successfully to ${this.tableName}.`);
              resolve(undefined);
            }
          });
        });
      } else {
        // Optional: Check if existing column definition matches desired definition (type, default, notNull)
        const existingCol = currentColumns.find(col => col.name === desiredCol.name);
        if (existingCol) {
          // Basic check for type and NOT NULL constraint. Default values are harder to compare reliably.
          if (existingCol.type.toUpperCase() !== desiredCol.type.toUpperCase()) {
            console.warn(`Type mismatch for column ${desiredCol.name} in ${this.tableName}: expected ${desiredCol.type}, found ${existingCol.type}. Skipping type alteration.`);
          }
          // Corrected comparison logic for notNull and typo for existingCol.notNull
          const existingNotNullValue = (existingCol.notNull ?? false) === true ? 1 : 0; // Handle potential undefined for existingCol.notNull
          const desiredNotNullValue = (desiredCol.notNull ?? false) === true ? 1 : 0; // Handle potential undefined for desiredCol.notNull
          if (existingNotNullValue !== desiredNotNullValue) {
            console.warn(`NOT NULL mismatch for column ${desiredCol.name} in ${this.tableName}: expected ${desiredCol.notNull === true ? 'NOT NULL' : 'NULL'}, found ${existingCol.notNull === true ? 'NOT NULL' : 'NULL'}. Skipping NOT NULL alteration.`);
          }
        }
      }
    }
  }

  // Public method to wait for initialization
  async initialize(): Promise<void> {
    await this.initializationPromise;
  }

  insertDb(id: string) {
    const query = `INSERT OR IGNORE INTO ${this.tableName} (did) VALUES (?);`;
    this.db!.run(query, [id], (err) => { // Use non-null assertion operator
      if (err) {
        console.error('Error inserting data', err);
      }
    });
  }

  updateDb(did: string, column: string, value?: string | number) {
    const query = `
          UPDATE ${this.tableName}
          SET ${column} = ?, updated_at = CURRENT_TIMESTAMP
          WHERE did = ?
        `;
    const params = [value, did];
    this.db!.run(query, params, (err) => { // Use non-null assertion operator
      if (err) {
        console.error('Error updating data', err);
      }
    });
  }

  selectDb(id: string, col_name: string): Promise<any> | null {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM ${this.tableName} WHERE did = ?;`;
      this.db!.get(query, [id], (err, row: Record<string, any>) => { // Use non-null assertion operator
        if (err) {
          console.error('Error selecting data', err);
          reject(err);
        } else {
          try {
            resolve(row ? JSON.parse(row[col_name]) : null);
          } catch (e) {
            resolve(row[col_name]);
          }
        }
      });
    });
  }

  /**
   * 指定された条件で複数の行を取得
   * @param columns 取得するカラム名の配列
   * @param whereClause (オプション) WHERE句の条件
   * @returns 
   */
  selectRows(
    columns: string[],
    whereClause?: { column: string; value: string | number }
  ): Promise<any[] | null> {
    return new Promise((resolve, reject) => {
      let query = `SELECT ${columns.join(', ')} FROM ${this.tableName}`;
      const params: any[] = [];

      if (whereClause) {
        query += ` WHERE ${whereClause.column} = ?`;
        params.push(whereClause.value);
      }

      query += ' ORDER BY RANDOM()'; // ランダム順に並べる
      query += ';';

      this.db!.all(query, params, (err, rows: Record<string, any>[]) => {
        if (err) {
          console.error('Error selecting data', err);
          reject(err);
        } else {
          resolve(rows ?? []);
        }
      });
    });
  }

  insertOrUpdateDb(id: string) {
    const query = `
          INSERT INTO ${this.tableName} (did)
          VALUES (?)
          ON CONFLICT(did) DO UPDATE
          SET updated_at = CURRENT_TIMESTAMP;
        `;
    this.db!.run(query, [id], (err) => { // Use non-null assertion operator
      if (err) {
        console.error('Error inserting or updating data', err);
      }
    });
  }

  deleteRow(did: string): void {
    const query = `DELETE FROM ${this.tableName} WHERE did = ?;`;
    this.db!.run(query, [did], (err) => { // Use non-null assertion operator
      if (err) {
        console.error(`Error deleting row with did=${did}`, err);
      }
    });
  }

  closeDb() {
    this.db!.close((err) => { // Use non-null assertion operator
      if (err) {
        console.error('Error closing the database', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }

  getHighestScore(): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `
              SELECT * FROM ${this.tableName}
              WHERE score IS NOT NULL
              ORDER BY score DESC
              LIMIT 1;
            `;
      this.db!.get(query, [], (err, row) => { // Use non-null assertion operator
        if (err) {
          console.error('Error fetching highest score', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  clearAllRows(): void {
    const query = `DELETE FROM ${this.tableName};`;

    this.db!.run(query, (err) => { // Use non-null assertion operator
      if (err) {
        console.error('Error clearing table', err);
      } else {
        console.log(`All rows deleted from ${this.tableName}`);
        this.db!.run('VACUUM;', (vacuumErr) => { // Use non-null assertion operator
          if (vacuumErr) {
            console.error('Error running VACUUM', vacuumErr);
          } else {
            console.log('Database vacuumed successfully');
          }
        });
      }
    });
  }

  /**
   * 指定didの全row取得
   * @param id 
   * @returns 
   */
  async getRowById(id: string): Promise<Record<string, any> | null> {
    await this.initialize(); // Ensure the database is initialized
    const query = `SELECT * FROM ${this.tableName} WHERE did = ?;`;
    return new Promise((resolve, reject) => {
      this.db!.get(query, [id], (err, row: Record<string, any>) => {
        if (err) {
          console.error(`Error fetching row with did=${id} from ${this.tableName}:`, err);
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }
}

// Initialize database instances
export const db = new SQLite3("followers");
export const dbPosts = new SQLite3("posts");
export const dbLikes = new SQLite3("likes");

// Export an initialization function that waits for all DBs to be ready
export async function initializeDatabases() {
  await Promise.all([
    db.initialize(),
    dbPosts.initialize(),
    dbLikes.initialize()
  ]);
  console.log("All databases initialized and schemas ensured.");
}

// Example of how to use it:
// import { initializeDatabases } from './db';
// async function main() {
//   await initializeDatabases();
//   // Now you can safely use db, dbPosts, dbLikes
//   // db.insertDb('some_did');
// }
// main();
