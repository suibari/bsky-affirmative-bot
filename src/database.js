const { Client } = require('pg');

class PostgreSQL {
  constructor() {
    this.client = new Client({
      user: process.env.PG_USERNAME,
      host: process.env.PG_HOSTNAME || 'localhost',
      database: process.env.PG_DBNAME,
      password: process.env.PG_PASSWORD,
      port: 5432
    });
    this.client.connect();
    return this;
  }

  async createDbIfNotExist() {
    const query = {
      text: 'CREATE TABLE IF NOT EXISTS followers ('+
              'did VARCHAR(255),'+
              'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'+
              'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'+
              'PRIMARY KEY (did)'+
            ');'
    };
    await this.client.query(query)
    .then(res => {
      // console.log(res);
    })
    .catch(e => {
      console.error(e);
    });
  }

  async insertDb(id) {
    const query = {
      text: 'INSERT INTO followers VALUES ($1);',
      values: [id]
    };
    await this.client.query(query)
    .then(res => {
      // console.log(res);
    })
    .catch(e => {
      console.error(e);
    });
  }

  async updateDb(id) {
    const query = {
      text: 'UPDATE followers SET updated_at = CURRENT_TIMESTAMP WHERE did = $1;',
      values: [id]
    };
    await this.client.query(query)
    .then(res => {
      // console.log(res);
    })
    .catch(e => {
      console.error(e);
    });
  }

  async selectDb(id) {
    const query = {
      text: 'SELECT updated_at FROM followers WHERE did = $1;',
      values: [id]
    };
    try {
      const res = await this.client.query(query);
      return res.rows[0]?.updated_at;
    } catch(e) {
      console.error(e);
      throw e;
    }
  }

  async insertOrUpdateDb(id) {
    const query = {
      text: 'INSERT INTO followers'+
            'VALUES ($1)'+
            'ON CONFLICT (did) DO UPDATE'+
            'SET did = $1;',
      values: [id]
    };
    await this.client.query(query)
    .then(res => {
      console.log(res);
    })
    .catch(e => {
      console.error(e);
    });
  }

  async closeDb() {
    await this.client.end();
  }
}

module.exports = PostgreSQL;

// async function testDb() {
//   const db = new PostgreSQL();
//   await db.createDbIfNotExist();
//   // await db.insertDb('hoge');
//   // await db.updateDb('hoge');
//   const updated_at = await db.selectDb('hoge');
//   console.log(updated_at);
//   await db.closeDb();
// }
// testDb();
