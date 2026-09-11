const express = require("express");

const {
    run,
    all
} = require("../database/database");

const {
    authenticateToken,
    requireAdmin
} = require("../middleware/authMiddleware");

const {
    sendBrevoEmail
} = require("../services/emailService");

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


            /*
             * Send an email notification to YASU Tech.
             *
             * The visitor's email is used as Reply-To,
             * so you can reply directly to the person
             * who submitted the contact message.
             */

            try {

                await sendBrevoEmail({

                    to:
                        process.env.CONTACT_EMAIL ||
                        "saysoftwareengr@gmail.com",

                    subject:
                        subject
                            ? `YASU Tech Contact: ${subject}`
                            : "New YASU Tech Contact Message",

                    replyTo: email,

                    htmlContent: `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">

                            <h2>New Contact Message - YASU Tech</h2>

                            <p>
                                A visitor has submitted a new message
                                through the YASU Tech website.
                            </p>

                            <hr>

                            <p>
                                <strong>Name:</strong>
                                ${name}
                            </p>

                            <p>
                                <strong>Email:</strong>
                                ${email}
                            </p>

                            <p>
                                <strong>Subject:</strong>
                                ${subject || "No subject"}
                            </p>

                            <p>
                                <strong>Message:</strong>
                            </p>

                            <div style="
                                background: #f5f5f5;
                                padding: 15px;
                                border-radius: 6px;
                                white-space: pre-wrap;
                            ">
                                ${message}
                            </div>

                            <hr>

                            <p style="font-size: 13px; color: #666;">
                                Replying to this email will send your response
                                to the visitor's email address.
                            </p>

                            <p>
                                <strong>YASU Tech</strong><br>
                                Powered by Yakubu Sualisu Ahmed
                            </p>

                        </div>
                    `
                });

            } catch (emailError) {

                console.error(
                    "Brevo contact notification failed:",
                    emailError
                );

                /*
                 * The message has already been saved to the database.
                 * Therefore, an email failure should not make the
                 * visitor lose the message they submitted.
                 */
            }


            response.status(201).json({
                message:
                    "Your message was sent successfully."
            });

        } catch (error) {

            console.error(
                "Contact form error:",
                error
            );

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

            console.error(
                "Contact messages retrieval error:",
                error
            );

            response.status(500).json({
                message:
                    "Unable to retrieve messages."
            });
        }
    }
);


module.exports = router;