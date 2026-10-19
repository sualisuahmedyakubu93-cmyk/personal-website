const express = require("express");

const {
    authenticateToken
} = require("../middleware/authMiddleware");

const {
    requireSuperAdmin
} = require("../middleware/permissions");

const {
    all
} = require("../database/database");

const router = express.Router();

/*
==================================================
LIST USERS
==================================================
GET /api/admin/users

Requires an authenticated administrator.
Returns safe user information only.
==================================================
*/

router.get(
    "/",

    authenticateToken,

    requireSuperAdmin,

    async (request, response) => {
        try {
            const users = await all(`
                SELECT
                    id,
                    username,
                    email,
                    role,
                    is_verified,
                    created_at
                FROM users
                ORDER BY created_at DESC
            `);

            return response.json({
                success: true,
                count: users.length,
                users
            });

        } catch (error) {
            console.error(
                "Administrator user-list error:",
                error.message
            );

            return response.status(500).json({
                success: false,
                message:
                    "Unable to retrieve user accounts."
            });
        }
    }
);

module.exports = router;