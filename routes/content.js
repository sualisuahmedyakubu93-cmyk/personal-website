const express = require("express");

const {
    all
} = require("../database/database");

const {
    authenticateToken
} = require("../middleware/authMiddleware");

const router = express.Router();

const allowedCategories = [
    "documents",
    "speeches",
    "presentations",
    "writings"
];


router.get(
    "/",
    authenticateToken,
    async (request, response) => {

        try {

            const contents =
                await all(`
                    SELECT *
                    FROM content
                    ORDER BY created_at DESC
                `);

            const result =
                contents.map(
                    item => ({
                        ...item,
                        file_url:
                            `/uploads/${item.category}/${encodeURIComponent(item.filename)}`
                    })
                );

            response.json(result);

        } catch (error) {

            response.status(500).json({
                message:
                    "Unable to retrieve content."
            });
        }
    }
);


router.get(
    "/category/:category",
    authenticateToken,
    async (request, response) => {

        try {

            const category =
                request.params.category;

            if (
                !allowedCategories.includes(
                    category
                )
            ) {
                return response.status(400).json({
                    message:
                        "Invalid category."
                });
            }

            const contents =
                await all(
                    `
                    SELECT *
                    FROM content
                    WHERE category = ?
                    ORDER BY created_at DESC
                    `,
                    [category]
                );

            response.json(
                contents.map(
                    item => ({
                        ...item,
                        file_url:
                            `/uploads/${item.category}/${encodeURIComponent(item.filename)}`
                    })
                )
            );

        } catch (error) {

            response.status(500).json({
                message:
                    "Unable to retrieve content."
            });
        }
    }
);


module.exports = router;