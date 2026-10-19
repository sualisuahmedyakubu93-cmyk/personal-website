const express = require("express");

const { get, all } = require("../database/database");

const {
    authenticateToken,
    requireAdmin
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
    "/",
    authenticateToken,
    requireAdmin,
    async (request, response) => {
        try {
            const [
                contentTotal,
                categoryRows,
                pageTotal,
                userTotal,
                staffTotal
            ] = await Promise.all([
                get(
                    "SELECT COUNT(*) AS total FROM content"
                ),

                all(
                    "SELECT category, COUNT(*) AS total FROM content GROUP BY category"
                ),

                get(
                    "SELECT COUNT(DISTINCT page_key) AS total FROM website_page_content"
                ),

                get(
                    "SELECT COUNT(*) AS total FROM users"
                ),

                get(`
                    SELECT COUNT(*) AS total
                    FROM users
                    WHERE role IN (
                        'super_admin',
                        'admin',
                        'content_staff',
                        'technical_staff',
                        'departmental_staff'
                    )
                `)
            ]);

            const categories = {
                documents: 0,
                speeches: 0,
                presentations: 0,
                writings: 0
            };

            for (const row of categoryRows) {
                const category = String(
                    row.category || ""
                ).toLowerCase();

                if (
                    Object.prototype.hasOwnProperty.call(
                        categories,
                        category
                    )
                ) {
                    categories[category] = Number(
                        row.total || 0
                    );
                }
            }

            return response.json({
                success: true,
                stats: {
                    totalContent: Number(
                        contentTotal?.total || 0
                    ),
                    documents: categories.documents,
                    speeches: categories.speeches,
                    presentations: categories.presentations,
                    writings: categories.writings,
                    pages: Number(pageTotal?.total || 0),
                    users: Number(userTotal?.total || 0),
                    staff: Number(staffTotal?.total || 0)
                }
            });
        } catch (error) {
            console.error(
                "Dashboard statistics error:",
                error.message
            );

            return response.status(500).json({
                success: false,
                message: "Unable to load dashboard statistics."
            });
        }
    }
);

module.exports = router;