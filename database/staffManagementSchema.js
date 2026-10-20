/*
==================================================
YASU TECH STAFF MANAGEMENT DATABASE SCHEMA
==================================================

Supports:
- SQLite for local development
- PostgreSQL for production
- Configurable roles and permissions
- Departments and staff assignments
- Account activation
- Audit logging

This module does not replace existing user accounts.
==================================================
*/

async function initializeStaffManagementSchema({
    run,
    all,
    isPostgres
}) {
    /*
    --------------------------------------------------
    1. ADD ACCOUNT ACTIVATION SUPPORT
    --------------------------------------------------
    */

    if (isPostgres) {
        await run(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_active INTEGER
            NOT NULL DEFAULT 1
        `);
    } else {
        const userColumns = await all(`
            PRAGMA table_info(users)
        `);

        const hasActiveColumn = userColumns.some(
            column => column.name === "is_active"
        );

        if (!hasActiveColumn) {
            await run(`
                ALTER TABLE users
                ADD COLUMN is_active INTEGER
                NOT NULL DEFAULT 1
            `);
        }
    }
    /*
    --------------------------------------------------
    2. OPTIONAL MULTI-FACTOR AUTHENTICATION (MFA)
    --------------------------------------------------

    MFA is disabled by default for existing and new
    accounts. Users can opt in through account settings.

    Supports SQLite locally and PostgreSQL in production.
    --------------------------------------------------
    */

    const mfaUserColumns = [
        {
            name: "mfa_enabled",
            definition: "INTEGER NOT NULL DEFAULT 0"
        },
        {
            name: "mfa_method",
            definition: "TEXT"
        },
        {
            name: "mfa_secret_encrypted",
            definition: "TEXT"
        },
        {
            name: "mfa_pending_secret_encrypted",
            definition: "TEXT"
        }
    ];

    if (isPostgres) {
        for (const column of mfaUserColumns) {
            await run(`
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS ${column.name}
                ${column.definition}
            `);
        }
    } else {
        const existingUserColumns = await all(`
            PRAGMA table_info(users)
        `);

        const existingColumnNames = new Set(
            existingUserColumns.map(column => column.name)
        );

        for (const column of mfaUserColumns) {
            if (!existingColumnNames.has(column.name)) {
                await run(`
                    ALTER TABLE users
                    ADD COLUMN ${column.name}
                    ${column.definition}
                `);
            }
        }
    }

    /*
    --------------------------------------------------
    MFA LOGIN CHALLENGES
    --------------------------------------------------

    These records represent temporary login challenges.
    They must never be treated as authenticated sessions.
    --------------------------------------------------
    */

    await run(`
        CREATE TABLE IF NOT EXISTS mfa_login_challenges (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            code_hash TEXT,
            expires_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            remember_me INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    /*
    --------------------------------------------------
    SINGLE-USE MFA RECOVERY CODES
    --------------------------------------------------

    Only hashes of recovery codes will be stored.
    A code must be marked used after successful recovery.
    --------------------------------------------------
    */

    await run(
    isPostgres
        ? `
            CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                code_hash TEXT NOT NULL,
                used_at TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `
        : `
            CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                code_hash TEXT NOT NULL,
                used_at TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `
);

    
    /*
    --------------------------------------------------
    2. ROLES
    --------------------------------------------------

    Roles are database records, not a permanently
    hard-coded list in the application.
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS roles (
                    id SERIAL PRIMARY KEY,
                    slug TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    is_system INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS roles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    slug TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    is_system INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `
    );

    /*
    --------------------------------------------------
    3. PERMISSIONS
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS permissions (
                    id SERIAL PRIMARY KEY,
                    permission_key TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    category TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS permissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    permission_key TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    category TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `
    );

    /*
    --------------------------------------------------
    4. ROLE-PERMISSION ASSIGNMENTS
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS role_permissions (
                    role_id INTEGER NOT NULL
                        REFERENCES roles(id) ON DELETE CASCADE,
                    permission_id INTEGER NOT NULL
                        REFERENCES permissions(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (role_id, permission_id)
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS role_permissions (
                    role_id INTEGER NOT NULL,
                    permission_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    PRIMARY KEY (role_id, permission_id),

                    FOREIGN KEY (role_id)
                        REFERENCES roles(id) ON DELETE CASCADE,

                    FOREIGN KEY (permission_id)
                        REFERENCES permissions(id) ON DELETE CASCADE
                )
            `
    );

    /*
    --------------------------------------------------
    5. INDIVIDUAL USER PERMISSION OVERRIDES
    --------------------------------------------------

    Allows Super Admin to grant or deny a specific
    permission to an individual account.
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS user_permissions (
                    user_id INTEGER NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE,
                    permission_id INTEGER NOT NULL
                        REFERENCES permissions(id) ON DELETE CASCADE,
                    effect TEXT NOT NULL
                        CHECK (effect IN ('allow', 'deny')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, permission_id)
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS user_permissions (
                    user_id INTEGER NOT NULL,
                    permission_id INTEGER NOT NULL,
                    effect TEXT NOT NULL
                        CHECK (effect IN ('allow', 'deny')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    PRIMARY KEY (user_id, permission_id),

                    FOREIGN KEY (user_id)
                        REFERENCES users(id) ON DELETE CASCADE,

                    FOREIGN KEY (permission_id)
                        REFERENCES permissions(id) ON DELETE CASCADE
                )
            `
    );

    /*
    --------------------------------------------------
    6. DEPARTMENTS
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS departments (
                    id SERIAL PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS departments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `
    );

    /*
    --------------------------------------------------
    7. USER-DEPARTMENT ASSIGNMENTS
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS user_departments (
                    user_id INTEGER NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE,
                    department_id INTEGER NOT NULL
                        REFERENCES departments(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, department_id)
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS user_departments (
                    user_id INTEGER NOT NULL,
                    department_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    PRIMARY KEY (user_id, department_id),

                    FOREIGN KEY (user_id)
                        REFERENCES users(id) ON DELETE CASCADE,

                    FOREIGN KEY (department_id)
                        REFERENCES departments(id) ON DELETE CASCADE
                )
            `
    );

    /*
    --------------------------------------------------
    8. AUDIT LOGS
    --------------------------------------------------

    Records important staff-management actions.
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id SERIAL PRIMARY KEY,
                    actor_user_id INTEGER
                        REFERENCES users(id) ON DELETE SET NULL,
                    action TEXT NOT NULL,
                    target_type TEXT,
                    target_id TEXT,
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_user_id INTEGER,
                    action TEXT NOT NULL,
                    target_type TEXT,
                    target_id TEXT,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    FOREIGN KEY (actor_user_id)
                        REFERENCES users(id) ON DELETE SET NULL
                )
            `
    );

    /*
    --------------------------------------------------
    USER NOTIFICATIONS
    --------------------------------------------------

    Stores persistent, user-specific notifications.

    Notifications can record:
    - Role appointments and promotions
    - Role responsibilities and access scope
    - The person authorizing an appointment
    - Read and unread status

    Supports SQLite locally and PostgreSQL in production.
    --------------------------------------------------
    */

    await run(
        isPostgres
            ? `
                CREATE TABLE IF NOT EXISTS user_notifications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE,
                    actor_user_id INTEGER
                        REFERENCES users(id) ON DELETE SET NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    metadata TEXT,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `
            : `
                CREATE TABLE IF NOT EXISTS user_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    actor_user_id INTEGER,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    metadata TEXT,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id)
                        REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (actor_user_id)
                        REFERENCES users(id) ON DELETE SET NULL
                )
            `
    );

    await run(`
        CREATE INDEX IF NOT EXISTS
        idx_user_notifications_user_created
        ON user_notifications (user_id, created_at)
    `);

    /*
    --------------------------------------------------
    9. SEED INITIAL SYSTEM ROLES
    --------------------------------------------------

    These are starting records. Super Admin will
    eventually be able to manage roles through the
    dashboard.

    The system will not allow public registration
    to assign these privileged roles.
    --------------------------------------------------
    */

    const initialRoles = [
        {
            slug: "super_admin",
            name: "Super Administrator",
            description:
                "Full system administration and staff governance."
        },
        {
            slug: "admin",
            name: "Administrator",
            description:
                "Administrative access limited by assigned permissions."
        },
        {
            slug: "content_staff",
            name: "Content Staff",
            description:
                "Content-management duties."
        },
        {
            slug: "technical_staff",
            name: "Technical Staff",
            description:
                "Technical duties limited by assigned permissions."
        },
        {
            slug: "departmental_staff",
            name: "Departmental Staff",
            description:
                "Department-specific responsibilities."
        },
        {
            slug: "user",
            name: "User",
            description:
                "Ordinary website-user access."
        }
    ];

    for (const role of initialRoles) {
        await run(
            `
                INSERT INTO roles (
                    slug,
                    name,
                    description,
                    is_system
                )
                VALUES (?, ?, ?, 1)
                ON CONFLICT (slug) DO NOTHING
            `,
            [
                role.slug,
                role.name,
                role.description
            ]
        );
    }

    /*
    --------------------------------------------------
    10. SEED INITIAL PERMISSION DEFINITIONS
    --------------------------------------------------
    */

    const initialPermissions = [
        ["*", "Full system access", "All registered capabilities.", "system"],

        ["website.view", "View website", "Access public website features.", "website"],

        ["users.view", "View users", "View user accounts.", "users"],
        ["users.manage", "Manage users", "Manage ordinary user accounts.", "users"],

        ["staff.view", "View staff", "View staff-management records.", "staff"],
        ["staff.manage", "Manage staff", "Manage staff assignments.", "staff"],

        ["roles.view", "View roles", "View role definitions.", "roles"],
        ["roles.manage", "Manage roles", "Create and edit roles.", "roles"],

        ["permissions.view", "View permissions", "View available permissions.", "permissions"],
        ["permissions.manage", "Manage permissions", "Assign permissions to roles and users.", "permissions"],

        
        ["departments.view", "View departments", "View department information.", "departments"],
        ["department.view", "View assigned department", "View the user's assigned department.", "department"],
["department.content.view", "View departmental content", "View content within assigned departments.", "department"],
["department.content.create", "Create departmental content", "Create content within assigned departments.", "department"],
["department.content.edit", "Edit departmental content", "Edit content within assigned departments.", "department"],
        ["departments.manage", "Manage departments", "Create and edit departments.", "departments"],

        ["content.view", "View content", "View managed content.", "content"],
        ["content.create", "Create content", "Create content records.", "content"],
        ["content.edit", "Edit content", "Edit content records.", "content"],
        ["content.publish", "Publish content", "Publish content.", "content"],
        ["content.delete", "Delete content", "Delete content.", "content"],

        ["technical.view", "View technical tools", "View permitted technical information.", "technical"],
        ["technical.manage", "Manage technical tools", "Perform permitted technical operations.", "technical"],

        ["audit.view", "View audit logs", "View system audit records.", "audit"]
    ];

    for (const permission of initialPermissions) {
        await run(
            `
                INSERT INTO permissions (
                    permission_key,
                    name,
                    description,
                    category
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT (permission_key) DO NOTHING
            `,
            permission
        );
    }
/*
--------------------------------------------------
11. SEED INITIAL ROLE PERMISSIONS
--------------------------------------------------

These are initial database assignments.
The Super Administrator must be able to manage
role permissions through the dashboard later.
*/

const initialRolePermissions = {
    admin: [
        "content.view",
        "content.create",
        "content.edit",
        "content.publish",
        "content.delete",
        "technical.view",
        "technical.manage",
        "website.view"
    ],

    content_staff: [
        "content.view",
        "content.create",
        "content.edit"
    ],

    technical_staff: [
        "technical.view",
        "technical.manage"
    ],

    departmental_staff: [
        "department.view",
        "department.content.view",
        "department.content.create",
        "department.content.edit"
    ],

    user: [
        "website.view"
    ]
};

for (const [roleSlug, permissionKeys] of
    Object.entries(initialRolePermissions)) {

    for (const permissionKey of permissionKeys) {
        await run(
            `
                INSERT INTO role_permissions (
                    role_id,
                    permission_id
                )
                SELECT
                    roles.id,
                    permissions.id
                FROM roles
                CROSS JOIN permissions
                WHERE roles.slug = ?
                  AND permissions.permission_key = ?
                ON CONFLICT (role_id, permission_id)
                DO NOTHING
            `,
            [roleSlug, permissionKey]
        );
    }
}
    /*
    --------------------------------------------------
    11. GRANT INITIAL SUPER ADMIN ACCESS
    --------------------------------------------------

    Only the Super Administrator role receives
    the wildcard permission at this stage.

    Other roles receive no permissions automatically
    from this migration. Their permissions will be
    configured deliberately.
    --------------------------------------------------
    */

    await run(`
        INSERT INTO role_permissions (
            role_id,
            permission_id
        )
        SELECT
            roles.id,
            permissions.id
        FROM roles
        CROSS JOIN permissions
        WHERE roles.slug = 'super_admin'
          AND permissions.permission_key = '*'
        ON CONFLICT (role_id, permission_id) DO NOTHING
    `);

    console.log(
        "Staff-management database schema initialized successfully."
    );
}

module.exports = {
    initializeStaffManagementSchema
};