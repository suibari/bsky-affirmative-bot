const sqlite3 = require('sqlite3').verbose();

class SQLite3 {
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
        is_u18     INTEGER   DEFAULT 0
      );
    `;
    this.db.run(query, (err) => {
      if (err) {
        console.error('Error creating table', err);
      }
    });
  }

  insertDb(id) {
    const query = `INSERT INTO followers (did) VALUES (?);`;
    this.db.run(query, [id], (err) => {
      if (err) {
        console.error('Error inserting data', err);
      }
    });
  }

  updateDb(id, col_name, value) {
    let query;

    if (col_name && value) {
      query = `UPDATE followers SET ${col_name} = ${value}, updated_at = CURRENT_TIMESTAMP WHERE did = ?`;
    } else {
      query = `UPDATE followers SET updated_at = CURRENT_TIMESTAMP WHERE did = ?`;
    }

    this.db.run(query, [id], (err) => {
      if (err) {
        console.error('Error updating data', err);
      }
    });
  }

  selectDb(id, col_name) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM followers WHERE did = ?;`;
      this.db.get(query, [id], (err, row) => {
        if (err) {
          console.error('Error selecting data', err);
          reject(err);
        } else {
          resolve(row ? row[col_name] : null);
        }
      });
    });
  }

  insertOrUpdateDb(id) {
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
const db = new SQLite3();

module.exports = db;

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
