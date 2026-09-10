const express = require("express");

const {
    run,
    all
} = require("../database/database");

const {
    authenticateToken,
    requireAdmin
} = require("../middleware/authMiddleware");

const router = express.Router();


router.post(
    "/",
    authenticateToken,

    async (request, response) => {

        try {

            const {
                name,
                email,
                subject,
                message
            } = request.body;

            if (
                !name ||
                !email ||
                !message
            ) {
                return response.status(400).json({
                    message:
                        "Please complete all required fields."
                });
            }

            await run(
                `
                INSERT INTO contact_messages (
                    name,
                    email,
                    subject,
                    message
                )
                VALUES (?, ?, ?, ?)
                `,
                [
                    name,
                    email,
                    subject || "",
                    message
                ]
            );

            response.status(201).json({
                message:
                    "Your message was sent successfully."
            });

        } catch (error) {

            response.status(500).json({
                message:
                    "Unable to send your message."
            });
        }
    }
);


router.get(
    "/",
    authenticateToken,
    requireAdmin,

    async (request, response) => {

        try {

            const messages =
                await all(`
                    SELECT *
                    FROM contact_messages
                    ORDER BY created_at DESC
                `);

            response.json(messages);

        } catch (error) {

            response.status(500).json({
                message:
                    "Unable to retrieve messages."
            });
        }
    }
);


module.exports = router;

