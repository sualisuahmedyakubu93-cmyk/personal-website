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
// --------------------------------------------------
// ROLE APPOINTMENT NOTIFICATION HELPERS
// --------------------------------------------------

/**
 * Describe each supported role.
 *
 * Responsibilities and access remain subject to the
 * permissions assigned to the account.
 */
function getRoleAppointmentDetails(role) {
    const roleDetails = {
        admin: {
            title: "Administrator",
            responsibilities:
                "Manage authorized website operations, users, and content.",
            accessScope:
                "Administrative functions allowed by the permissions assigned to your account. You cannot appoint a Super Administrator or override protected security controls."
        },

        technical_staff: {
            title: "Technical Staff",
            responsibilities:
                "Support authorized technical maintenance, troubleshooting, and diagnostics.",
            accessScope:
                "Technical functions explicitly permitted for your account. Staff management and content access are not automatically granted."
        },

        content_staff: {
            title: "Content Staff",
            responsibilities:
                "Prepare, edit, and manage assigned documents, speeches, presentations, and writings.",
            accessScope:
                "Content areas and publishing actions permitted by your assigned permissions."
        },

        departmental_staff: {
            title: "Departmental Staff",
            responsibilities:
                "Support activities, records, and content for your assigned department.",
            accessScope:
                "Your assigned department and the functions permitted by your account permissions."
        },

        user: {
            title: "Regular User",
            responsibilities:
                "Maintain your account, manage your own profile, and use available public-facing website features.",
            accessScope:
                "Your own account and the features available to regular users. Staff and administrative controls are not included."
        }
    };

    return roleDetails[role] || null;
}

/**
 * Store a persistent notification about an appointment
 * or a change to an existing user's role.
 *
 * actor must be the actual database-verified account
 * that authorized the action.
 */
async function createRoleAppointmentNotification({
recipient,
actor,
previousRole = null,
newRole
}) {
const details = getRoleAppointmentDetails(newRole);


const message =
    previousRole && previousRole !== newRole
        ? `Your YASU Tech role has changed to ${details.title}.`
        : `You have been appointed to the role of ${details.title} at YASU Tech.`;

const metadata = {
    previousRole,
    newRole,
    roleTitle: details.title,
    responsibilities: details.responsibilities,
    accessScope: details.accessScope
};

await run(
    `INSERT INTO user_notifications (
        user_id,
        actor_user_id,
        type,
        title,
        message,
        metadata,
        is_read,
        created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
    [
        recipient.id,
        actor.id,
        previousRole && previousRole !== newRole
            ? "role_changed"
            : "role_appointment",
        "Your YASU Tech role",
        message,
        JSON.stringify(metadata)
    ]
);

// Send the appointment or promotion email after
// the in-app notification has been saved.
try {
    if (!recipient.email) {
        console.warn(
            "Staff appointment email skipped: recipient has no email address.",
            { recipientId: recipient.id }
        );
        return;
    }

    const escapeHtml = (value) =>
        String(value ?? "").replace(
            /[&<>"']/g,
            (character) => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[character]
        );

    const isPromotion =
        Boolean(previousRole) &&
        previousRole !== newRole;

    const previousDetails = previousRole
        ? getRoleAppointmentDetails(previousRole)
        : null;

    const actionTitle = isPromotion
        ? "Official Role Change Notification"
        : "Official Staff Appointment";

    const roleChangeDetails = isPromotion
        ? `
            <p><strong>Previous role:</strong>
                ${escapeHtml(previousDetails?.title || previousRole)}
            </p>
            <p><strong>New role:</strong>
                ${escapeHtml(details.title)}
            </p>
        `
        : `
            <p><strong>Appointed role:</strong>
                ${escapeHtml(details.title)}
            </p>
        `;

    const websiteUrl =
        process.env.PUBLIC_SITE_URL ||
        "https://yasutech.onrender.com";

    await sendBrevoEmail({
        to: recipient.email,
        subject: `${actionTitle} - YASU Tech`,
        htmlContent: `
            <div style="font-family:Arial,sans-serif;line-height:1.7;color:#222;max-width:680px;margin:0 auto;">
                <h2>${actionTitle}</h2>
                <p>Hello ${escapeHtml(recipient.username || "Team Member")},</p>
                <p>This email confirms an official change to your role at YASU Tech.</p>
                ${roleChangeDetails}
                <p><strong>Responsibilities:</strong>
                    ${escapeHtml(details.responsibilities)}
                </p>
                <p><strong>Access scope:</strong>
                    ${escapeHtml(details.accessScope)}
                </p>
                <p><strong>Authorised by:</strong>
                    ${escapeHtml(actor.username || actor.email || "An authorised administrator")}
                </p>
                <p>Your actual access depends on the permissions assigned to your account.</p>
                <p><a href="${escapeHtml(websiteUrl)}">Visit YASU Tech</a></p>
                <p>
                    YASU Tech<br>
                    Innovating Today, Engineering Tomorrow<br>
                    Powered by Yakubu Sualisu Ahmed
                </p>
            </div>
        `
    });

    console.info(
        "Staff appointment email accepted by Brevo:",
        {
            recipientId: recipient.id,
            role: newRole,
            type: isPromotion ? "promotion" : "appointment"
        }
    );
} catch (emailError) {
    console.error(
        "Staff appointment email could not be sent:",
        {
            recipientId: recipient.id,
            role: newRole,
            error: emailError.message
        }
    );
}


}


// --------------------------------------------------
// PERSONAL USER NOTIFICATIONS
// --------------------------------------------------


/**
 * Return notifications belonging only to the authenticated,
 * verified and active user.
 *
 * The user ID always comes from the current database-backed
 * authentication context, never from a request parameter.
 */
router.get(
    "/notifications",
    async (req, res) => {
        try {
            const currentUser = await get(
                `SELECT id, is_verified, is_active
                 FROM users
                 WHERE id = ?`,
                [req.user.id]
            );

            if (
                !currentUser ||
                !Number(currentUser.is_verified) ||
                !Number(currentUser.is_active)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Your account is unavailable, inactive, or not verified."
                });
            }

            const notifications = await all(
                `SELECT
                    id,
                    type,
                    title,
                    message,
                    metadata,
                    is_read,
                    created_at
                 FROM user_notifications
                 WHERE user_id = ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT 50`,
                [currentUser.id]
            );

            return res.json({
                success: true,
                count: notifications.length,
                unreadCount: notifications.filter(
                    notification =>
                        !Number(notification.is_read)
                ).length,
                notifications
            });
        } catch (error) {
            console.error(
                "Load personal notifications error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load your notifications."
            });
        }
    }
);

// Mark one of the current user's notifications as read.
router.patch(
    "/notifications/:id/read",
    async (req, res) => {
        try {
            const notificationId = Number(req.params.id);

            if (
                !Number.isSafeInteger(notificationId) ||
                notificationId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "A valid notification ID is required."
                });
            }

            const currentUser = await get(
                `SELECT id, is_verified, is_active
                 FROM users
                 WHERE id = ?`,
                [req.user.id]
            );

            if (
                !currentUser ||
                !Number(currentUser.is_verified) ||
                !Number(currentUser.is_active)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Your account is unavailable, inactive, or not verified."
                });
            }

            const notification = await get(
                `SELECT id, is_read
                 FROM user_notifications
                 WHERE id = ?
                   AND user_id = ?`,
                [notificationId, currentUser.id]
            );

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Notification not found."
                });
            }

            if (!Number(notification.is_read)) {
                await run(
                    `UPDATE user_notifications
                     SET is_read = 1
                     WHERE id = ?
                       AND user_id = ?`,
                    [notificationId, currentUser.id]
                );
            }

            return res.json({
                success: true,
                message:
                    "Notification marked as read."
            });
        } catch (error) {
            console.error(
                "Mark notification as read error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to update the notification."
            });
        }
    }
);

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

            // Validate the target user ID.
            if (!Number.isSafeInteger(targetId) || targetId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "A valid user ID is required."
                });
            }

            // Validate the requested role.
            if (typeof role !== "string" || !role.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "A role is required."
                });
            }

            const normalizedRole = role.trim().toLowerCase();

            // Prevent an administrator from changing their own role.
            if (targetId === Number(req.user.id)) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot change your own role."
                });
            }

            // Load the target account from the database.
            const target = await get(
                `SELECT id, username, email, role
                 FROM users
                 WHERE id = ?`,
                [targetId]
            );

            if (!target) {
                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });
            }

            // Confirm that the requested role exists.
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

            // Prevent ordinary role changes from appointing
            // another Super Administrator.
            if (
                normalizedRole === "super_admin" &&
                target.role !== "super_admin"
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Appointing another Super Administrator is not permitted through this endpoint."
                });
            }

            // Do not perform unnecessary updates or send
            // duplicate notifications when the role is unchanged.
            if (target.role === normalizedRole) {
                return res.json({
                    success: true,
                    message: "The user already has this role.",
                    changed: false
                });
            }

            // Protect the last Super Administrator.
            if (
                target.role === "super_admin" &&
                normalizedRole !== "super_admin"
            ) {
                const remaining = await get(
                    `SELECT COUNT(*) AS total
                     FROM users
                     WHERE role = 'super_admin'`
                );

                if (Number(remaining?.total || 0) <= 1) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "The last Super Administrator cannot be demoted."
                    });
                }
            }

            // Confirm the authorizing account from the database.
            const actor = await get(
                `SELECT id, username, email, role, is_verified, is_active
                 FROM users
                 WHERE id = ?`,
                [req.user.id]
            );

            if (
                !actor ||
                actor.role !== "super_admin" ||
                !Number(actor.is_verified) ||
                !Number(actor.is_active)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "An active, verified Super Administrator is required."
                });
            }

            // Update the user's role.
            await run(
                "UPDATE users SET role = ? WHERE id = ?",
                [normalizedRole, targetId]
            );

            // Record the change in the audit log.
            await writeAuditLog(
                actor.id,
                "user.role_changed",
                "user",
                targetId,
                {
                    previousRole: target.role,
                    newRole: normalizedRole
                }
            );

            // Create a persistent notification for the recipient.
            let notificationCreated = true;

            try {
                await createRoleAppointmentNotification({
                    recipient: target,
                    actor,
                    previousRole: target.role,
                    newRole: normalizedRole
                });
            } catch (notificationError) {
                notificationCreated = false;

                console.error(
                    "Role-change notification could not be saved:",
                    notificationError
                );
            }

            return res.json({
                success: true,
                message: notificationCreated
                    ? "User role updated and notification created successfully."
                    : "User role updated, but the notification could not be saved. Check the server logs.",
                changed: true,
                notificationCreated
            });
        } catch (error) {
            console.error("Update user role error:", error);

            return res.status(500).json({
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
            // Protect the Super Administrator role.
if (role === "super_admin") {
    return res.status(403).json({
        success: false,
        message:
            "The Super Administrator role cannot be assigned through ordinary account creation."
    });
}

// Verify the actual authorizing account from the database.
const actor = await get(
    `SELECT id, username, email, role, is_verified, is_active
     FROM users
     WHERE id = ?`,
    [req.user.id]
);

if (
    !actor ||
    actor.role !== "super_admin" ||
    !Number(actor.is_verified) ||
    !Number(actor.is_active)
) {
    return res.status(403).json({
        success: false,
        message:
            "An active, verified Super Administrator is required."
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
// Notify newly appointed staff members.
// Ordinary regular-user registrations do not receive
// staff-appointment notifications.
let notificationCreated = null;

if (role !== "user" && created) {
    try {
        await createRoleAppointmentNotification({
            recipient: created,
            actor,
            newRole: role
        });

        notificationCreated = true;
    } catch (notificationError) {
        notificationCreated = false;

        console.error(
            "Staff appointment notification could not be saved:",
            notificationError
        );
    }
}
            return res.status(201).json({
    success: true,
    message:
        "Account created. A verification code has been sent to the user's email.",
    user: created,
    notificationCreated
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
