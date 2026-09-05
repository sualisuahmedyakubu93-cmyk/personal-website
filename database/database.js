const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");

const databasePath = path.join(
    __dirname,
    "..",
    "data",
    "personalWebsite.db"
);

const db = new sqlite3.Database(
    databasePath,
    (error) => {
        if (error) {
            console.error("Database error:", error.message);
        } else {
            console.log("Connected to SQLite database.");
        }
    }
);

function run(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parameters, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                id: this.lastID,
                changes: this.changes
            });
        });
    });
}

function get(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, parameters, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

function all(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, parameters, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

async function initializeDatabase() {
    try {

        await run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                is_verified INTEGER DEFAULT 0,
                otp_code TEXT,
                otp_expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT,
                uploaded_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (uploaded_by)
                REFERENCES users(id)
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const adminUsername = process.env.ADMIN_USERNAME;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (
            adminUsername &&
            adminEmail &&
            adminPassword
        ) {
            const existingAdmin = await get(
                `
                SELECT id
                FROM users
                WHERE username = ?
                `,
                [adminUsername]
            );

            if (!existingAdmin) {
                const hashedPassword = await bcrypt.hash(
                    adminPassword,
                    12
                );

                await run(
                    `
                    INSERT INTO users (
                        username,
                        email,
                        password,
                        role,
                        is_verified
                    )
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        adminUsername,
                        adminEmail,
                        hashedPassword,
                        "admin",
                        1
                    ]
                );

                console.log("Administrator account created.");
            }
        }

        console.log("Database initialized successfully.");

    } catch (error) {
        console.error(
            "Database initialization error:",
            error.message
        );
    }
}

module.exports = {
    db,
    run,
    get,
    all,
    initializeDatabase
};