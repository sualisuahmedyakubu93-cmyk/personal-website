const express = require("express");
const bcrypt = require("bcryptjs");
const { sendBrevoEmail } = require("../services/emailService");
const router = express.Router();

const { all, get, run } = require("../database/database");
const { authenticateToken } = require("../middleware/authMiddleware");
const {
    requirePermission,
    requireSuperAdmin
} = require("../middleware/permissions");

/*
 * YASU Tech Staff Management API
 *
 * Responsibilities:
 * - View users and staff accounts
 * - Activate or deactivate accounts
 * - Assign staff roles
 * - View roles, permissions and departments
 * - Record administrative actions
 *
 * All access is authenticated and permission-controlled.
 */

// Authenticate every request to this router.
router.use(authenticateToken);

// Record administrative actions.
async function writeAuditLog(actorId, action, targetType, targetId, details = {}) {
    await run(
        `INSERT INTO audit_logs
            (actor_user_id, action, target_type, target_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            actorId,
            action,
            targetType,
            String(targetId),
            JSON.stringify(details)
        ]
    );
}

// GET /api/staff-management/overview
router.get(
    "/overview",
    requirePermission("users.view"),
    async (req, res) => {
        try {
            const [users, activeUsers, roles, departments] = await Promise.all([
                get("SELECT COUNT(*) AS total FROM users"),
                get("SELECT COUNT(*) AS total FROM users WHERE is_active = 1"),
                get("SELECT COUNT(*) AS total FROM roles"),
                get("SELECT COUNT(*) AS total FROM departments WHERE is_active = 1")
            ]);

            res.json({
                success: true,
                overview: {
                    totalUsers: Number(users?.total || 0),
                    activeUsers: Number(activeUsers?.total || 0),
                    totalRoles: Number(roles?.total || 0),
                    activeDepartments: Number(departments?.total || 0)
                }
            });
        } catch (error) {
            console.error("Staff-management overview error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to load the management overview."
            });
        }
    }
);

// GET /api/staff-management/users
router.get(
    "/users",
    requirePermission("users.view"),
    async (req, res) => {
        try {
            const users = await all(
                `SELECT
                    id,
                    username,
                    email,
                    role,
                    is_verified,
                    is_active,
                    created_at
                 FROM users
                 ORDER BY created_at DESC`
            );

            res.json({
                success: true,
                count: users.length,
                users
            });
        } catch (error) {
            console.error("Staff-management users error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to load users."
            });
        }
    }
);

// PATCH /api/staff-management/users/:id/status
router.patch(
    "/users/:id/status",
    requirePermission("users.manage"),
    async (req, res) => {
        try {
            const targetId = Number(req.params.id);
            const { is_active } = req.body;

            if (!Number.isInteger(targetId) || targetId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "A valid user ID is required."
                });
            }

            if (typeof is_active !== "boolean" && is_active !== 0 && is_active !== 1) {
                return res.status(400).json({
                    success: false,
                    message: "is_active must be true, false, 1 or 0."
                });
            }

            const target = await get(
                "SELECT id, role, is_active FROM users WHERE id = ?",
                [targetId]
            );

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });
            }

            if (targetId === Number(req.user.id) && !Boolean(is_active)) {
                return res.status(400).json({
                    success: false,
                    message: "You cannot deactivate your own account."
                });
            }

            if (target.role === "super_admin" && !Boolean(is_active)) {
                return res.status(403).json({
                    success: false,
                    message: "A super administrator account cannot be deactivated through this endpoint."
                });
            }

            const newStatus = is_active ? 1 : 0;

            await run(
                "UPDATE users SET is_active = ? WHERE id = ?",
                [newStatus, targetId]
            );

            await writeAuditLog(
                req.user.id,
                newStatus ? "user.activated" : "user.deactivated",
                "user",
                targetId,
                { previousStatus: target.is_active, newStatus }
            );

            res.json({
                success: true,
                message: newStatus ? "User activated successfully." : "User deactivated successfully."
            });
        } catch (error) {
            console.error("Update user status error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to update the user status."
            });
        }
    }
);

// PATCH /api/staff-management/users/:id/role
router.patch(
    "/users/:id/role",
    requireSuperAdmin,
    async (req, res) => {
        try {
            const targetId = Number(req.params.id);
            const { role } = req.body;

            if (!Number.isInteger(targetId) || targetId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "A valid user ID is required."
                });
            }

            if (typeof role !== "string" || !role.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A role is required."
                });
            }

            const normalizedRole = role.trim().toLowerCase();

            const target = await get(
                "SELECT id, role FROM users WHERE id = ?",
                [targetId]
            );

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });
            }

            const roleRecord = await get(
                "SELECT slug FROM roles WHERE slug = ?",
                [normalizedRole]
            );

            if (!roleRecord) {
                return res.status(400).json({
                    success: false,
                    message: "The requested role does not exist."
                });
            }

            if (
                target.role === "super_admin" &&
                normalizedRole !== "super_admin"
            ) {
                const remaining = await get(
                    "SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin'"
                );

                if (Number(remaining?.total || 0) <= 1) {
                    return res.status(400).json({
                        success: false,
                        message: "The last super administrator cannot be demoted."
                    });
                }
            }

            await run(
                "UPDATE users SET role = ? WHERE id = ?",
                [normalizedRole, targetId]
            );

            await writeAuditLog(
                req.user.id,
                "user.role_changed",
                "user",
                targetId,
                { previousRole: target.role, newRole: normalizedRole }
            );

            res.json({
                success: true,
                message: "User role updated successfully."
            });
        } catch (error) {
            console.error("Update user role error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to update the user role."
            });
        }
    }
);

// GET /api/staff-management/roles
router.get(
    "/roles",
    requirePermission("roles.view"),
    async (req, res) => {
        try {
            const roles = await all(
                `SELECT id, slug, name, description, is_system, created_at, updated_at
                 FROM roles
                 ORDER BY name ASC`
            );

            res.json({ success: true, count: roles.length, roles });
        } catch (error) {
            console.error("Load roles error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to load roles."
            });
        }
    }
);

// GET /api/staff-management/permissions
router.get(
    "/permissions",
    requirePermission("permissions.view"),
    async (req, res) => {
        try {
            const permissions = await all(
                `SELECT id, permission_key, name, description, category
                 FROM permissions
                 ORDER BY category ASC, name ASC`
            );

            res.json({
                success: true,
                count: permissions.length,
                permissions
            });
        } catch (error) {
            console.error("Load permissions error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to load permissions."
            });
        }
    }
);

// GET /api/staff-management/departments
router.get(
    "/departments",
    requirePermission("departments.view"),
    async (req, res) => {
        try {
            const departments = await all(
                `SELECT id, name, description, is_active, created_at, updated_at
                 FROM departments
                 ORDER BY name ASC`
            );

            res.json({
                success: true,
                count: departments.length,
                departments
            });
        } catch (error) {
            console.error("Load departments error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to load departments."
            });
        }
    }
);

// POST /api/staff-management/departments
router.post(
    "/departments",
    requirePermission("departments.manage"),
    async (req, res) => {
        try {
            const name = typeof req.body.name === "string"
                ? req.body.name.trim()
                : "";

            const description = typeof req.body.description === "string"
                ? req.body.description.trim()
                : "";

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: "Department name is required."
                });
            }

            const existing = await get(
                "SELECT id FROM departments WHERE LOWER(name) = LOWER(?)",
                [name]
            );

            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "A department with that name already exists."
                });
            }

            const result = await run(
                `INSERT INTO departments
                    (name, description, is_active, created_at, updated_at)
                 VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [name, description]
            );

            const created = await get(
                "SELECT id, name, description, is_active, created_at, updated_at FROM departments WHERE name = ?",
                [name]
            );

            await writeAuditLog(
                req.user.id,
                "department.created",
                "department",
                created?.id ?? result?.lastID ?? "unknown",
                { name }
            );

            res.status(201).json({
                success: true,
                message: "Department created successfully.",
                department: created
            });
        } catch (error) {
            console.error("Create department error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to create the department."
            });
        }
    }
);

// GET /api/staff-management/audit-logs
router.get(
    "/audit-logs",
    requirePermission("audit.view"),
    async (req, res) => {
        try {
            const logs = await all(
                `SELECT
                    id,
                    actor_user_id,
                    action,
                    target_type,
                    target_id,
                    details,
                    created_at
                 FROM audit_logs
                 ORDER BY created_at DESC
                 LIMIT 200`
            );

            res.json({
                success: true,
                count: logs.length,
                logs
            });
        } catch (error) {
            console.error("Load audit logs error:", error);
            res.status(500).json({
                success: false,
                message: "Unable to load audit logs."
            });
        }
    }
);

// POST /api/staff-management/users
// Only the Super Administrator can create accounts and assign roles.
router.post(
    "/users",
    requireSuperAdmin,
    async (req, res) => {
        try {
            const username =
                typeof req.body.username === "string"
                    ? req.body.username.trim()
                    : "";

            const email =
                typeof req.body.email === "string"
                    ? req.body.email.trim().toLowerCase()
                    : "";

            const password = req.body.password;
            const role =
                typeof req.body.role === "string"
                    ? req.body.role.trim().toLowerCase()
                    : "user";

            if (!username || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: "Username, email and password are required."
                });
            }

            if (username.length < 3) {
                return res.status(400).json({
                    success: false,
                    message: "Username must contain at least 3 characters."
                });
            }

            if (
                typeof password !== "string" ||
                password.length < 8 ||
                !/[A-Z]/.test(password) ||
                !/[a-z]/.test(password) ||
                !/[0-9]/.test(password) ||
                !/[^A-Za-z0-9]/.test(password)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Password must contain at least 8 characters, including uppercase and lowercase letters, a number and a symbol."
                });
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: "if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {."
                });
            }

            const existing = await get(
                `SELECT id FROM users
                 WHERE LOWER(username) = LOWER(?)
                    OR LOWER(email) = LOWER(?)`,
                [username, email]
            );

            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "That username or email is already registered."
                });
            }

            const roleRecord = await get(
                "SELECT slug FROM roles WHERE slug = ?",
                [role]
            );

            if (!roleRecord) {
                return res.status(400).json({
                    success: false,
                    message: "The selected role does not exist."
                });
            }

            const passwordHash = await bcrypt.hash(password, 12);
            const otp = String(
                Math.floor(100000 + Math.random() * 900000)
            );
            const expiresAt = new Date(
                Date.now() + 10 * 60 * 1000
            ).toISOString();

            const result = await run(
                `INSERT INTO users (
                    username,
                    email,
                    password,
                    role,
                    is_verified,
                    otp_code,
                    otp_expires_at,
                    is_active
                )
                VALUES (?, ?, ?, ?, 0, ?, ?, 1)`,
                [
                    username,
                    email,
                    passwordHash,
                    role,
                    otp,
                    expiresAt
                ]
            );

            await sendBrevoEmail({
                to: email,
                subject: "Verify Your YASU Tech Account",
                htmlContent: `
                    <div style="font-family:Arial,sans-serif;line-height:1.6">
                        <h2>Hello ${username.replace(/[&<>"']/g, "")},</h2>
                        <p>Your YASU Tech account has been created.</p>
                        <p>Your email verification code is:</p>
                        <h1 style="letter-spacing:8px">${otp}</h1>
                        <p>This code expires in 10 minutes.</p>
                        <p>YASU Tech<br>
                        Powered by Yakubu Sualisu Ahmed</p>
                    </div>
                `
            });

            const created = await get(
                `SELECT id, username, email, role,
                        is_verified, is_active, created_at
                 FROM users
                 WHERE LOWER(email) = LOWER(?)`,
                [email]
            );

            await writeAuditLog(
                req.user.id,
                "user.created",
                "user",
                created?.id ?? result?.lastID ?? "unknown",
                { username, email, role }
            );

            return res.status(201).json({
                success: true,
                message:
                    "Account created. A verification code has been sent to the user's email.",
                user: created
            });
        } catch (error) {
            console.error("Staff account creation error:", error);

            return res.status(500).json({
                success: false,
                message:
                    "Unable to create the account. Check the server logs for details."
            });
        }
    }
);
module.exports = router;
