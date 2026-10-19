const express = require("express");
const router = express.Router();
const db = require("../database/database");

const {
    authenticateToken,
    requireAdmin
} = require("../middleware/authMiddleware");

const DEFAULT_SETTINGS = {
    site_name: "YASU Tech",
    site_slogan: "Innovating Today, Engineering Tomorrow",
    footer_text: "Powered by Yakubu Sualisu Ahmed",
    homepage_title: "YASU Tech | Education, Technology & Programming",
    homepage_description:
        "YASU Tech is the academic and professional digital portfolio of Yakubu Sualisu Ahmed, a Mathematics and ICT student teacher and aspiring Software Engineer.",
    logo_url: "/yasu-tech-logo/yasu-tech-logo-transparent.png"
};

const ALLOWED_SETTINGS = new Set(
    Object.keys(DEFAULT_SETTINGS)
);

const MAX_SETTING_LENGTH = 1000;

// GET /api/website-settings
// Publicly readable website settings.

router.get("/", async function (request, response) {
    try {
        const rows = await db.all(`
            SELECT setting_key, setting_value
            FROM website_settings
        `);

        const settings = {
            ...DEFAULT_SETTINGS
        };

        for (const row of rows) {
            if (ALLOWED_SETTINGS.has(row.setting_key)) {
                settings[row.setting_key] = row.setting_value;
            }
        }

        return response.json({
            success: true,
            settings
        });
    } catch (error) {
        console.error(
            "Unable to load website settings:",
            error.message
        );

        return response.status(500).json({
            success: false,
            message: "Unable to load website settings."
        });
    }
});

// PUT /api/website-settings
// Only verified administrators can update settings.

router.put(
    "/",
    authenticateToken,
    requireAdmin,
    async function (request, response) {
        try {
            const submittedSettings =
                request.body &&
                request.body.settings;

            if (
                !submittedSettings ||
                typeof submittedSettings !== "object" ||
                Array.isArray(submittedSettings)
            ) {
                return response.status(400).json({
                    success: false,
                    message: "Please provide a valid settings object."
                });
            }

            const entries = Object.entries(submittedSettings);

            if (entries.length === 0) {
                return response.status(400).json({
                    success: false,
                    message: "No settings were provided."
                });
            }

            if (
                entries.some(
                    ([key]) => !ALLOWED_SETTINGS.has(key)
                )
            ) {
                return response.status(400).json({
                    success: false,
                    message: "One or more settings are not allowed."
                });
            }

            const validatedSettings = {};

            for (const [key, value] of entries) {
                if (
                    typeof value !== "string" ||
                    value.length > MAX_SETTING_LENGTH
                ) {
                    return response.status(400).json({
                        success: false,
                        message:
                            "Each setting must be text containing no more than 1000 characters."
                    });
                }

                const cleanedValue = value.trim();

                if (!cleanedValue) {
                    return response.status(400).json({
                        success: false,
                        message: "Settings cannot be empty."
                    });
                }

                if (key === "logo_url") {
                    const isLocalPath =
                        cleanedValue.startsWith("/") &&
                        !cleanedValue.startsWith("//");

                    const isRelativePath =
                        !cleanedValue.startsWith("/") &&
                        !cleanedValue.includes("..") &&
                        !cleanedValue.includes(":");

                    const isHttpsUrl =
                        /^https:\/\/[^\s]+$/i.test(cleanedValue);

                    if (
                        !isLocalPath &&
                        !isRelativePath &&
                        !isHttpsUrl
                    ) {
                        return response.status(400).json({
                            success: false,
                            message:
                                "The logo must use a valid local path or HTTPS URL."
                        });
                    }
                }

                validatedSettings[key] = cleanedValue;
            }

            for (
                const [key, value]
                of Object.entries(validatedSettings)
            ) {
                await db.run(
                    `
                    INSERT INTO website_settings (
                        setting_key,
                        setting_value,
                        updated_at
                    )
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(setting_key)
                    DO UPDATE SET
                        setting_value = excluded.setting_value,
                        updated_at = CURRENT_TIMESTAMP
                    `,
                    [key, value]
                );
            }

            return response.json({
                success: true,
                message: "Website settings saved successfully.",
                updatedSettings: Object.keys(validatedSettings)
            });
        } catch (error) {
            console.error(
                "Unable to save website settings:",
                error.message
            );

            return response.status(500).json({
                success: false,
                message: "Unable to save website settings."
            });
        }
    }
);

module.exports = router;