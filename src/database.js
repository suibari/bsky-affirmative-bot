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

  updateDb(id) {
    const query = `UPDATE followers SET updated_at = CURRENT_TIMESTAMP WHERE did = ?;`;
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

  updateU18Db(id, is_u18) {
    // 型チェック: is_u18 は 0 または 1 である必要があります
    if (![0, 1].includes(is_u18)) {
      console.error('Error: is_u18 must be 0 or 1.');
      return;
    }

    const query = `UPDATE followers SET is_u18 = ? WHERE did = ?;`;
    this.db.run(query, [is_u18, id], (err) => {
      if (err) {
        console.error('Error updating data', err);
      }
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
