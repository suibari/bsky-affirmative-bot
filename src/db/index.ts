import sqlite3 from 'sqlite3';

class SQLite3 {
  db: sqlite3.Database;

  constructor() {
    const dbFile = process.env.SQLITE_DB_FILE || ':memory:'; // Use in-memory DB if no file is specified
    this.db = new sqlite3.Database(dbFile, (err) => {
      if (err) {
        console.error('Could not connect to database', err);
      } else {
        console.log('Connected to SQLite database');
      }
    });
    return this;
  }

  createDbIfNotExist() {
    const query = `
      CREATE TABLE IF NOT EXISTS followers (
        did TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_u18     INTEGER   DEFAULT 0,
        last_uranai_at TIMESTAMP DEFAULT NULL,
        reply_freq     INTEGER   DEFAULT 100,
        last_conv_at   TIMESTAMP DEFAULT NULL,
        conv_root_cid  TEXT      DEFAULT NULL,
        conv_history   JSON      DEFAULT NULL,
        last_analyze_at TIMESTAMP DEFAULT NULL
      );
    `;
    this.db.run(query, (err) => {
      if (err) {
        console.error('Error creating table', err);
      }
    });
  }

  insertDb(id: string) {
    const query = `INSERT INTO followers (did) VALUES (?);`;
    this.db.run(query, [id], (err) => {
      if (err) {
        console.error('Error inserting data', err);
      }
    });
  }

  updateDb(did: string, column: string, value?: string | number) {
    const query = `
      UPDATE followers
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
      const query = `SELECT * FROM followers WHERE did = ?;`;
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
      INSERT INTO followers (did)
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

  closeDb() {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing the database', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}
export const db = new SQLite3();

// async function testDb() {
//   const db = new SQLite3();
//   db.createDbIfNotExist();
//   // db.insertDb('hoge');
//   // db.updateDb('hoge');
//   const updated_at = await db.selectDb('hoge');
//   console.log(updated_at);
//   db.closeDb();
// }
// testDb();
