const mysql = require('mysql2');
require('dotenv').config();

const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'skin_disease_db',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Only enable SSL if explicitly requested by environment (e.g. cloud database)
if (process.env.DB_SSL === 'true') {
    poolConfig.ssl = {
        rejectUnauthorized: true
    };
}

const pool = mysql.createPool(poolConfig);

// Convert pool to use promises
const promisePool = pool.promise();

module.exports = promisePool;

