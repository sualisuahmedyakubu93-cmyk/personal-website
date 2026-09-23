const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");
const path = require("path");
const bcrypt = require("bcryptjs");
const fs = require("fs");

/*
==================================================
DATABASE MODE
==================================================

If DATABASE_URL exists:
    Use Neon PostgreSQL.

If DATABASE_URL does not exist:
    Use the existing local SQLite database.

This allows the same project to support both
local development and production.
==================================================
*/

const usePostgres =
    Boolean(process.env.DATABASE_URL);

/*
==================================================
POSTGRESQL DATABASE
==================================================
*/

let pgPool = null;

if (usePostgres) {
    pgPool = new Pool({
        connectionString:
            process.env.DATABASE_URL
    });

    pgPool.on("error", (error) => {
        console.error(
            "PostgreSQL pool error:",
            error.message
        );
    });
}

/*
==================================================
SQLITE DATABASE
==================================================
*/

const dataDirectory = path.join(
    __dirname,
    "..",
    "data"
);

fs.mkdirSync(
    dataDirectory,
    {
        recursive: true
    }
);

const databasePath = path.join(
    dataDirectory,
    "personalWebsite.db"
);

let sqliteDb = null;

if (!usePostgres) {
    sqliteDb = new sqlite3.Database(
        databasePath,
        (error) => {
            if (error) {
                console.error(
                    "SQLite database error:",
                    error.message
                );
            } else {
                console.log(
                    "Connected to SQLite database."
                );
            }
        }
    );
}

/*
==================================================
POSTGRES SQL PLACEHOLDER CONVERSION
==================================================

Existing YASU Tech routes use SQLite-style:

    ?

PostgreSQL uses:

    $1
    $2
    $3

This function allows the existing routes to
continue using their current SQL format.
==================================================
*/

function convertSqlitePlaceholders(sql) {
    let parameterNumber = 0;

    return sql.replace(
        /\?/g,
        () => {
            parameterNumber += 1;

            return `$${parameterNumber}`;
        }
    );
}

/*
==================================================
POSTGRES QUERY HELPER
==================================================
*/

async function postgresQuery(
    sql,
    parameters = []
) {
    const postgresSql =
        convertSqlitePlaceholders(sql);

    return pgPool.query(
        postgresSql,
        parameters
    );
}

/*
==================================================
RUN
==================================================

Supports both:

    await run(...)

and SQLite-style callback usage:

    db.run(sql, params, callback)
==================================================
*/

function run(
    sql,
    parameters = [],
    callback = null
) {
    const promise = usePostgres
        ? postgresRun(sql, parameters)
        : new Promise((resolve, reject) => {
            sqliteDb.run(
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
        });

    if (typeof callback === "function") {
        promise
            .then((result) => {
                callback.call(
                    {
                        lastID: result.id,
                        changes: result.changes
                    },
                    null
                );
            })
            .catch((error) => {
                callback.call(
                    {
                        lastID: undefined,
                        changes: 0
                    },
                    error
                );
            });
    }

    return promise;
}

/*
==================================================
POSTGRES RUN
==================================================
*/

async function postgresRun(
    sql,
    parameters = []
) {
    let postgresSql =
        convertSqlitePlaceholders(sql);

    const trimmedSql =
        postgresSql.trim();

    /*
    PostgreSQL does not automatically provide
    the inserted ID in the same way SQLite does.

    For INSERT statements, request the generated
    id so existing code can continue using
    lastID.
    */

    if (
        /^INSERT\s+/i.test(trimmedSql) &&
        !/\bRETURNING\b/i.test(trimmedSql)
    ) {
        postgresSql =
            `${postgresSql} RETURNING id`;
    }

    const result =
        await pgPool.query(
            postgresSql,
            parameters
        );

    return {
        id:
            result.rows.length > 0 &&
            result.rows[0].id !== undefined
                ? result.rows[0].id
                : undefined,

        changes:
            result.rowCount || 0
    };
}

/*
==================================================
GET
==================================================

Supports:

    await get(...)

and:

    db.get(sql, params, callback)
==================================================
*/

function get(
    sql,
    parameters = [],
    callback = null
) {
    const promise = usePostgres
        ? postgresGet(sql, parameters)
        : new Promise((resolve, reject) => {
            sqliteDb.get(
                sql,
                parameters,
                function (error, row) {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(row);
                }
            );
        });

    if (typeof callback === "function") {
        promise
            .then((row) => {
                callback(null, row);
            })
            .catch((error) => {
                callback(error);
            });
    }

    return promise;
}

/*
==================================================
POSTGRES GET
==================================================
*/

async function postgresGet(
    sql,
    parameters = []
) {
    const result =
        await postgresQuery(
            sql,
            parameters
        );

    return result.rows[0];
}

/*
==================================================
ALL
==================================================

Supports:

    await all(...)

and:

    db.all(sql, params, callback)
==================================================
*/

function all(
    sql,
    parameters = [],
    callback = null
) {
    const promise = usePostgres
        ? postgresAll(sql, parameters)
        : new Promise((resolve, reject) => {
            sqliteDb.all(
                sql,
                parameters,
                function (error, rows) {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(rows);
                }
            );
        });

    if (typeof callback === "function") {
        promise
            .then((rows) => {
                callback(null, rows);
            })
            .catch((error) => {
                callback(error);
            });
    }

    return promise;
}

/*
==================================================
POSTGRES ALL
==================================================
*/

async function postgresAll(
    sql,
    parameters = []
) {
    const result =
        await postgresQuery(
            sql,
            parameters
        );

    return result.rows;
}

/*
==================================================
CALLBACK DATABASE OBJECT
==================================================

routes/pages.js uses the database object
directly with:

    db.get()
    db.all()
    db.run()

We preserve that interface here.
==================================================
*/

const db = {
    get(
        sql,
        parameters,
        callback
    ) {
        if (usePostgres) {
            postgresGet(
                sql,
                parameters
            )
                .then((row) => {
                    callback(
                        null,
                        row
                    );
                })
                .catch((error) => {
                    callback(
                        error
                    );
                });

            return;
        }

        sqliteDb.get(
            sql,
            parameters,
            callback
        );
    },

    all(
        sql,
        parameters,
        callback
    ) {
        if (usePostgres) {
            postgresAll(
                sql,
                parameters
            )
                .then((rows) => {
                    callback(
                        null,
                        rows
                    );
                })
                .catch((error) => {
                    callback(
                        error
                    );
                });

            return;
        }

        sqliteDb.all(
            sql,
            parameters,
            callback
        );
    },

    run(
        sql,
        parameters,
        callback
    ) {
        if (usePostgres) {
            postgresRun(
                sql,
                parameters
            )
                .then((result) => {
                    const context = {
                        lastID:
                            result.id,
                        changes:
                            result.changes
                    };

                    callback.call(
                        context,
                        null
                    );
                })
                .catch((error) => {
                    callback(
                        error
                    );
                });

            return;
        }

        sqliteDb.run(
            sql,
            parameters,
            callback
        );
    }
};

/*
==================================================
SQLITE CONTENT TABLE MIGRATION
==================================================

This remains available only for local SQLite.

It preserves the existing ability to store
either uploaded files or typed rich-text content.
==================================================
*/

async function migrateContentTable(
    contentColumns
) {
    const columnNames =
        contentColumns.map(
            (column) =>
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
            (column) =>
                column.name ===
                "filename"
        );

    const filenameIsRequired =
        filenameColumn &&
        filenameColumn.notnull === 1;

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

    if (filenameIsRequired) {
        console.log(
            "Migrating content table to support file or typed content..."
        );

        await run(
            `PRAGMA foreign_keys = OFF`
        );

        try {
            await run(
                `BEGIN TRANSACTION`
            );

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

            const subcategoryExpression =
                hasSubcategory
                    ? "subcategory"
                    : "NULL";

            const contentExpression =
                hasContent
                    ? "content"
                    : "NULL";

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

            await run(`
                DROP TABLE content
            `);

            await run(`
                ALTER TABLE content_new
                RENAME TO content
            `);

            await run(
                `COMMIT`
            );

            console.log(
                "Content table migration completed successfully."
            );
        } catch (error) {
            try {
                await run(
                    `ROLLBACK`
                );
            } catch (
                rollbackError
            ) {
                console.error(
                    "Database rollback error:",
                    rollbackError.message
                );
            }

            throw error;
        } finally {
            try {
                await run(
                    `PRAGMA foreign_keys = ON`
                );
            } catch (
                foreignKeyError
            ) {
                console.error(
                    "Could not restore foreign-key enforcement:",
                    foreignKeyError.message
                );
            }
        }

        return;
    }

    if (!hasContent) {
        await run(`
            ALTER TABLE content
            ADD COLUMN content TEXT
        `);

        console.log(
            "Content column added to content table."
        );
    }

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
==================================================
POSTGRES DATABASE INITIALIZATION
==================================================
*/

async function initializePostgresDatabase() {
    console.log(
        "Using Neon PostgreSQL database."
    );

    /*
    USERS
    */

    await run(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_verified INTEGER DEFAULT 0,
            otp_code TEXT,
            otp_expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    /*
    CONTENT
    */

    await run(`
    CREATE TABLE IF NOT EXISTS content (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        subcategory TEXT,
        filename TEXT,
        original_name TEXT,
        content TEXT,
        visibility TEXT NOT NULL DEFAULT 'public',
        display_mode TEXT NOT NULL DEFAULT 'file',
        caption TEXT,
        uploaded_by INTEGER
            REFERENCES users(id),
        created_at TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
    )
`);

await run(`
    ALTER TABLE content
    ADD COLUMN IF NOT EXISTS visibility TEXT
        NOT NULL DEFAULT 'public'
`);

await run(`
    ALTER TABLE content
    ADD COLUMN IF NOT EXISTS display_mode TEXT
        NOT NULL DEFAULT 'file'
`);

    /*
    PAGE CONTENT
    */

    await run(`
        CREATE TABLE IF NOT EXISTS page_content (
            id SERIAL PRIMARY KEY,
            page_key TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            filename TEXT,
            original_name TEXT,
            content TEXT,
            updated_by INTEGER
                REFERENCES users(id),
            updated_at TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        )
    `);

    /*
    WEBSITE PAGE CONTENT
    */

    await run(`
        CREATE TABLE IF NOT EXISTS website_page_content (
            id SERIAL PRIMARY KEY,
            page_key TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            filename TEXT,
            original_name TEXT,
            content TEXT,
            caption TEXT,
            visibility TEXT NOT NULL DEFAULT 'public',
            display_mode TEXT NOT NULL DEFAULT 'file',
            display_order INTEGER DEFAULT 0,
            created_by INTEGER
                REFERENCES users(id),
            created_at TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        )
    `);

    /*
    CONTACT MESSAGES
    */

    await run(`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            created_at TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        )
    `);

    /*
    CREATE ADMIN ONLY IF ONE DOES NOT
    ALREADY EXIST.

    This will not overwrite an existing
    administrator account.
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
        "Neon PostgreSQL database initialized successfully."
    );
}

/*
==================================================
SQLITE DATABASE INITIALIZATION
==================================================
*/

async function initializeSqliteDatabase() {
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
            created_at DATETIME
                DEFAULT CURRENT_TIMESTAMP
        )
    `);

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
        visibility TEXT NOT NULL DEFAULT 'public',
        display_mode TEXT NOT NULL DEFAULT 'file',
        caption TEXT,
        uploaded_by INTEGER,

        created_at DATETIME
            DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (uploaded_by)
        REFERENCES users(id)
    )
`);

    const contentColumns =
        await all(`
            PRAGMA table_info(content)
        `);

    await migrateContentTable(
        contentColumns
    );
const visibilityColumn =
    contentColumns.find(
        column =>
            column.name === "visibility"
    );

if (!visibilityColumn) {
    await run(`
        ALTER TABLE content
        ADD COLUMN visibility TEXT
            NOT NULL DEFAULT 'public'
    `);

    console.log(
        "Visibility column added to SQLite content table."
    );
}

const displayModeColumn =
    contentColumns.find(
        column =>
            column.name === "display_mode"
    );

if (!displayModeColumn) {
    await run(`
        ALTER TABLE content
        ADD COLUMN display_mode TEXT
            NOT NULL DEFAULT 'file'
    `);

    console.log(
        "Display mode column added to SQLite content table."
    );
}

const captionColumn =
    contentColumns.find(
        column =>
            column.name === "caption"
    );

if (!captionColumn) {
    await run(`
        ALTER TABLE content
        ADD COLUMN caption TEXT
    `);

    console.log(
        "Caption column added to SQLite content table."
    );
}
    await run(`
        CREATE TABLE IF NOT EXISTS page_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_key TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            filename TEXT,
            original_name TEXT,
            content TEXT,
            updated_by INTEGER,

            updated_at DATETIME
                DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (updated_by)
            REFERENCES users(id)
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS website_page_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_key TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            filename TEXT,
            original_name TEXT,
            content TEXT,
            caption TEXT,
            visibility TEXT NOT NULL DEFAULT 'public',
            display_mode TEXT NOT NULL DEFAULT 'file',
            display_order INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at DATETIME
                DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
                DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (created_by)
            REFERENCES users(id)
        )
    `);
const pageContentColumns =
    await all(`
        PRAGMA table_info(website_page_content)
    `);

const pageCaptionColumn =
    pageContentColumns.find(
        column =>
            column.name === "caption"
    );

if (!pageCaptionColumn) {
    await run(`
        ALTER TABLE website_page_content
        ADD COLUMN caption TEXT
    `);

    console.log(
        "Caption column added to SQLite website page content table."
    );
}

const pageVisibilityColumn =
    pageContentColumns.find(
        column =>
            column.name === "visibility"
    );

if (!pageVisibilityColumn) {
    await run(`
        ALTER TABLE website_page_content
        ADD COLUMN visibility TEXT
            NOT NULL DEFAULT 'public'
    `);

    console.log(
        "Visibility column added to SQLite website page content table."
    );
}

const pageDisplayModeColumn =
    pageContentColumns.find(
        column =>
            column.name === "display_mode"
    );

if (!pageDisplayModeColumn) {
    await run(`
        ALTER TABLE website_page_content
        ADD COLUMN display_mode TEXT
            NOT NULL DEFAULT 'file'
    `);

    console.log(
        "Display mode column added to SQLite website page content table."
    );
}
    await run(`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            created_at DATETIME
                DEFAULT CURRENT_TIMESTAMP
        )
    `);

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
        "SQLite database initialized successfully."
    );
}

/*
==================================================
INITIALIZE DATABASE
==================================================
*/

async function initializeDatabase() {
    try {
        if (usePostgres) {
            await initializePostgresDatabase();
        } else {
            await initializeSqliteDatabase();
        }
    } catch (error) {
        console.error(
            "Database initialization error:",
            error.message
        );

        throw error;
    }
}

/*
==================================================
EXPORTS
==================================================
*/

module.exports = {
    db,
    run,
    get,
    all,
    initializeDatabase
};
