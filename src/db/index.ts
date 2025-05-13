import sqlite3 from 'sqlite3';

class SQLite3 {
  db: sqlite3.Database;
  tableName: string;

  constructor(tableName = 'followers') {
    const dbFile = process.env.SQLITE_DB_FILE || ':memory:'; // Use in-memory DB if no file is specified
    this.db = new sqlite3.Database(dbFile, (err) => {
      if (err) {
        console.error('Could not connect to database', err);
      } else {
        console.log('Connected to SQLite database');
      }
    });
    this.tableName = tableName;
    return this;
  }

  insertDb(id: string) {
    const query = `INSERT OR IGNORE INTO ${this.tableName} (did) VALUES (?);`;
    this.db.run(query, [id], (err) => {
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
    this.db.run(query, params, (err) => {
      if (err) {
        console.error('Error updating data', err);
      }
    });
  }

  selectDb(id: string, col_name: string): Promise<any> | null {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM ${this.tableName} WHERE did = ?;`;
      this.db.get(query, [id], (err, row: Record<string, any>) => {
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

  insertOrUpdateDb(id: string) {
    const query = `
      INSERT INTO ${this.tableName} (did)
      VALUES (?)
      ON CONFLICT(did) DO UPDATE
      SET updated_at = CURRENT_TIMESTAMP;
    `;
    this.db.run(query, [id], (err) => {
      if (err) {
        console.error('Error inserting or updating data', err);
      }
    });
  }

  deleteRow(did: string): void {
    const query = `DELETE FROM ${this.tableName} WHERE did = ?;`;
    this.db.run(query, [did], (err) => {
      if (err) {
        console.error(`Error deleting row with did=${did}`, err);
      }
    });
  }

  closeDb() {
    this.db.close((err) => {
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
      this.db.get(query, [], (err, row) => {
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

    this.db.run(query, (err) => {
      if (err) {
        console.error('Error clearing table', err);
      } else {
        console.log(`All rows deleted from ${this.tableName}`);

        // データベースファイルのサイズを削減
        this.db.run('VACUUM;', (vacuumErr) => {
          if (vacuumErr) {
            console.error('Error running VACUUM', vacuumErr);
          } else {
            console.log('Database vacuumed successfully');
          }
        });
      }
    });
  }
}

export const db = new SQLite3("followers");
export const dbPosts = new SQLite3("posts");
export const dbLikes = new SQLite3("likes");
