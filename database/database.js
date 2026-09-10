const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");
const fs = require("fs");

const dataDirectory = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(
    dataDirectory,
    "personalWebsite.db"
);

const db = new sqlite3.Database(
    databasePath,
    (error) => {
        if (error) {
            console.error(
                "Database error:",
                error.message
            );
        } else {
            console.log(
                "Connected to SQLite database."
            );
        }
    }
);

function run(
    sql,
    parameters = []
) {
    return new Promise(
        (resolve, reject) => {
            db.run(
                sql,
                parameters,
                function (error) {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve({
                        id: this.lastID,
                        changes: this.changes
                    });
                }
            );
        }
    );
}

function get(
    sql,
    parameters = []
) {
    return new Promise(
        (resolve, reject) => {
            db.get(
                sql,
                parameters,
                (error, row) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(row);
                }
            );
        }
    );
}

function all(
    sql,
    parameters = []
) {
    return new Promise(
        (resolve, reject) => {
            db.all(
                sql,
                parameters,
                (error, rows) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(rows);
                }
            );
        }
    );
}

/*
==========================================
MIGRATE CONTENT TABLE

This migration allows content to be created
either as:

1. An uploaded file
2. Typed rich-text content

Existing records are preserved.
Existing uploaded files are preserved.
==========================================
*/

async function migrateContentTable(
    contentColumns
) {
    const columnNames =
        contentColumns.map(
            column =>
                column.name
        );

    const hasSubcategory =
        columnNames.includes(
            "subcategory"
        );

    const hasContent =
        columnNames.includes(
            "content"
        );

    const filenameColumn =
        contentColumns.find(
            column =>
                column.name ===
                "filename"
        );

    /*
    ------------------------------------------
    CHECK WHETHER FILENAME IS REQUIRED
    ------------------------------------------
    */

    const filenameIsRequired =
        filenameColumn &&
        filenameColumn.notnull === 1;

    /*
    ------------------------------------------
    IF THE EXISTING TABLE ALREADY SUPPORTS
    TYPED CONTENT, ONLY ADD ANY MISSING
    COLUMN.
    ------------------------------------------
    */

    if (
        !filenameIsRequired &&
        !hasContent
    ) {
        await run(`
            ALTER TABLE content
            ADD COLUMN content TEXT
        `);

        console.log(
            "Content column added to content table."
        );

        return;
    }

    /*
    ------------------------------------------
    IF FILENAME IS STILL NOT NULL, SQLITE
    CANNOT DIRECTLY CHANGE THAT CONSTRAINT.

    Therefore, safely rebuild the content
    table while preserving all existing data.
    ------------------------------------------
    */

    if (filenameIsRequired) {
        console.log(
            "Migrating content table to support file or typed content..."
        );

        /*
        Turn off foreign-key enforcement
        temporarily for the table replacement.
        */

        await run(
            `PRAGMA foreign_keys = OFF`
        );

        try {
            await run(
                `BEGIN TRANSACTION`
            );

            /*
            ----------------------------------
            CREATE NEW CONTENT TABLE
            ----------------------------------
            */

            await run(`
                CREATE TABLE content_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    category TEXT NOT NULL,
                    subcategory TEXT,
                    filename TEXT,
                    original_name TEXT,
                    content TEXT,
                    uploaded_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    FOREIGN KEY (uploaded_by)
                    REFERENCES users(id)
                )
            `);

            /*
            ----------------------------------
            PREPARE DATA MIGRATION

            Existing databases may or may not
            already have the subcategory column.
            ----------------------------------
            */

            const subcategoryExpression =
                hasSubcategory
                    ? "subcategory"
                    : "NULL";

            const contentExpression =
                hasContent
                    ? "content"
                    : "NULL";

            /*
            ----------------------------------
            COPY ALL EXISTING RECORDS

            filename is copied exactly as it is.
            Therefore existing uploaded files
            remain completely intact.
            ----------------------------------
            */

            await run(`
                INSERT INTO content_new (
                    id,
                    title,
                    description,
                    category,
                    subcategory,
                    filename,
                    original_name,
                    content,
                    uploaded_by,
                    created_at
                )
                SELECT
                    id,
                    title,
                    description,
                    category,
                    ${subcategoryExpression},
                    filename,
                    original_name,
                    ${contentExpression},
                    uploaded_by,
                    created_at
                FROM content
            `);

            /*
            ----------------------------------
            REMOVE OLD TABLE
            ----------------------------------
            */

            await run(`
                DROP TABLE content
            `);

            /*
            ----------------------------------
            RENAME NEW TABLE
            ----------------------------------
            */

            await run(`
                ALTER TABLE content_new
                RENAME TO content
            `);

            /*
            ----------------------------------
            COMPLETE MIGRATION
            ----------------------------------
            */

            await run(
                `COMMIT`
            );

            console.log(
                "Content table migration completed successfully."
            );
        } catch (error) {
            /*
            If anything goes wrong during the
            migration, roll back the transaction
            so existing data is not intentionally
            left in a partially migrated state.
            */

            try {
                await run(
                    `ROLLBACK`
                );
            } catch (rollbackError) {
                console.error(
                    "Database rollback error:",
                    rollbackError.message
                );
            }

            throw error;
        } finally {
            /*
            Restore foreign-key enforcement.
            */

            try {
                await run(
                    `PRAGMA foreign_keys = ON`
                );
            } catch (foreignKeyError) {
                console.error(
                    "Could not restore foreign-key enforcement:",
                    foreignKeyError.message
                );
            }
        }

        return;
    }

    /*
    ------------------------------------------
    SAFETY NET

    If filename is already nullable but the
    content column is missing, simply add it.
    ------------------------------------------
    */

    if (!hasContent) {
        await run(`
            ALTER TABLE content
            ADD COLUMN content TEXT
        `);

        console.log(
            "Content column added to content table."
        );
    }

    /*
    ------------------------------------------
    SAFETY NET FOR SUBCATEGORY
    ------------------------------------------
    */

    if (!hasSubcategory) {
        await run(`
            ALTER TABLE content
            ADD COLUMN subcategory TEXT
        `);

        console.log(
            "Subcategory column added to content table."
        );
    }
}

/*
==========================================
INITIALIZE DATABASE
==========================================
*/

async function initializeDatabase() {
    try {
        /*
        ==========================================
        USERS TABLE
        ==========================================
        */

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

        /*
        ==========================================
        CONTENT TABLE

        For a new database, filename is nullable
        and content is available for typed
        rich-text content.
        ==========================================
        */

        await run(`
            CREATE TABLE IF NOT EXISTS content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                subcategory TEXT,
                filename TEXT,
                original_name TEXT,
                content TEXT,
                uploaded_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (uploaded_by)
                REFERENCES users(id)
            )
        `);

        /*
        ==========================================
        CHECK AND MIGRATE EXISTING CONTENT TABLE
        ==========================================
        */

        const contentColumns =
            await all(
                `
                PRAGMA table_info(content)
                `
            );

        await migrateContentTable(
            contentColumns
        );

        /*
        ==========================================
        CONTACT MESSAGES TABLE
        ==========================================
        */

        await run(`
            CREATE TABLE IF NOT EXISTS website_page_content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_key TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                filename TEXT,
                original_name TEXT,
                content TEXT,
                display_order INTEGER DEFAULT 0,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
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

        /*
        ==========================================
        CREATE ADMINISTRATOR ACCOUNT
        ==========================================
        */

        const adminUsername =
            process.env.ADMIN_USERNAME;

        const adminEmail =
            process.env.ADMIN_EMAIL;

        const adminPassword =
            process.env.ADMIN_PASSWORD;

        if (
            adminUsername &&
            adminEmail &&
            adminPassword
        ) {
            const existingAdmin =
                await get(
                    `
                    SELECT id
                    FROM users
                    WHERE username = ?
                    `,
                    [
                        adminUsername
                    ]
                );

            if (!existingAdmin) {
                const hashedPassword =
                    await bcrypt.hash(
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

                console.log(
                    "Administrator account created."
                );
            }
        }

        console.log(
            "Database initialized successfully."
        );
    } catch (error) {
        console.error(
            "Database initialization error:",
            error.message
        );
    }
}

/*
==========================================
EXPORTS
==========================================
*/

module.exports = {
    db,
    run,
    get,
    all,
    initializeDatabase
};
