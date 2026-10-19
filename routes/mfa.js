const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { run, get } = require("../database/database");
const { authenticateToken } = require("../middleware/authMiddleware");
const { sendBrevoEmail } = require("../services/emailService");

const {
    encryptSecret,
    decryptSecret,
    hashChallengeCode,
    verifyChallengeCode,
    generateAuthenticatorSetup,
    verifyAuthenticatorCode
} = require("../utils/mfa");

const router = express.Router();

const CHALLENGE_LIFETIME_MINUTES = 10;
const MAX_ATTEMPTS = 5;

let schemaPromise;

async function ensureMfaSettingsSchema() {
    if (!schemaPromise) {
        schemaPromise = run(`
            CREATE TABLE IF NOT EXISTS mfa_settings_challenges (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                purpose TEXT NOT NULL,
                method TEXT NOT NULL,
                code_hash TEXT,
                expires_at TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `).catch((error) => {
            schemaPromise = null;
            throw error;
        });
    }

    await schemaPromise;
}

function createChallengeId() {
    return crypto.randomUUID();
}

function createExpiry() {
    return new Date(
        Date.now() +
        CHALLENGE_LIFETIME_MINUTES * 60 * 1000
    ).toISOString();
}

function isExpired(value) {
    const timestamp = Date.parse(value);

    return !Number.isFinite(timestamp) ||
        timestamp <= Date.now();
}

function generateEmailCode() {
    return crypto.randomInt(0, 1000000)
        .toString()
        .padStart(6, "0");
}

function generateRecoveryCodes(count = 8) {
    return Array.from(
        { length: count },
        () => crypto.randomBytes(6).toString("hex").toUpperCase()
    );
}

function hashRecoveryCode(code) {
    return crypto.createHash("sha256")
        .update(code)
        .digest("hex");
}

async function getCurrentUser(userId) {
    return get(
        `SELECT
            id,
            username,
            email,
            password,
            is_active,
            is_verified,
            mfa_enabled,
            mfa_method,
            mfa_secret_encrypted,
            mfa_pending_secret_encrypted
         FROM users
         WHERE id = ?`,
        [userId]
    );
}

async function sendSettingsCode(user, code) {
    await sendBrevoEmail({
        to: user.email,
        subject: "YASU Tech security verification",
        htmlContent: `
            <div style="font-family:Arial,sans-serif">
                <h2>YASU Tech</h2>
                <p>Hello ${String(user.username).replace(/[<>&"]/g, "")},</p>
                <p>Your security verification code is:</p>
                <p style="font-size:28px;font-weight:bold;letter-spacing:5px">
                    ${code}
                </p>
                <p>This code expires in 10 minutes.</p>
                <p>If you did not request this code, you can ignore this email.</p>
            </div>
        `
    });
}

async function requirePassword(user, password) {
    if (
        typeof password !== "string" ||
        !password ||
        !(await bcrypt.compare(password, user.password))
    ) {
        return false;
    }

    return true;
}
/*
==========================================
CURRENT USER MFA STATUS
==========================================
*/

router.get(
    "/status",
    authenticateToken,
    async (request, response) => {
        try {
            const user = await getCurrentUser(
                request.user.id
            );

            if (
                !user ||
                !user.is_active ||
                !user.is_verified
            ) {
                return response.status(403).json({
                    message:
                        "Your account is unavailable or not verified."
                });
            }

            const enabled =
                Number(user.mfa_enabled) === 1 ||
                user.mfa_enabled === true;

            return response.json({
                success: true,
                mfa: {
                    enabled,
                    method: enabled
                        ? user.mfa_method
                        : null
                }
            });
        } catch (error) {
            console.error(
                "MFA status error:",
                error.message
            );

            return response.status(500).json({
                message:
                    "Unable to retrieve your MFA status."
            });
        }
    }
);
/*
==========================================
START MFA SETUP
==========================================
*/

router.post(
    "/setup",
    authenticateToken,
    async (request, response) => {
        try {
            await ensureMfaSettingsSchema();

            const { password, method } = request.body;

            if (!["email", "authenticator"].includes(method)) {
                return response.status(400).json({
                    message: "Choose email or authenticator verification."
                });
            }

            const user = await getCurrentUser(request.user.id);

            if (
                !user ||
                !user.is_active ||
                !user.is_verified
            ) {
                return response.status(403).json({
                    message: "Your account is unavailable or not verified."
                });
            }

            if (Number(user.mfa_enabled) === 1 ||
                user.mfa_enabled === true) {
                return response.status(409).json({
                    message: "MFA is already enabled."
                });
            }

            if (!(await requirePassword(user, password))) {
                return response.status(401).json({
                    message: "Your password is incorrect."
                });
            }

            const challengeId = createChallengeId();
            const expiresAt = createExpiry();

            if (method === "authenticator") {
                const setup = await generateAuthenticatorSetup(
                    user.email,
                    "YASU Tech"
                );

                const encryptedSecret = encryptSecret(setup.secret);

                await run(
                    `UPDATE users
                     SET mfa_pending_secret_encrypted = ?
                     WHERE id = ?`,
                    [encryptedSecret, user.id]
                );

                await run(
                    `INSERT INTO mfa_settings_challenges
                     (id, user_id, purpose, method, expires_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        challengeId,
                        user.id,
                        "setup",
                        "authenticator",
                        expiresAt
                    ]
                );

                return response.json({
                    message: "Scan the QR code and verify a code to finish setup.",
                    challengeId,
                    method,
                    qrDataUrl: setup.qrDataUrl,
                    expiresAt
                });
            }

            const code = generateEmailCode();
            const codeHash = hashChallengeCode(challengeId, code);

            await run(
                `INSERT INTO mfa_settings_challenges
                 (id, user_id, purpose, method, code_hash, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    challengeId,
                    user.id,
                    "setup",
                    "email",
                    codeHash,
                    expiresAt
                ]
            );

            try {
                await sendSettingsCode(user, code);
            } catch (emailError) {
                await run(
                    "DELETE FROM mfa_settings_challenges WHERE id = ?",
                    [challengeId]
                );

                throw emailError;
            }

            return response.json({
                message: "A verification code has been sent to your email.",
                challengeId,
                method,
                expiresAt
            });
        } catch (error) {
            console.error("MFA setup error:", error.message);

            return response.status(500).json({
                message: "Unable to start MFA setup. Please try again."
            });
        }
    }
);

/*
==========================================
VERIFY SETUP AND ENABLE MFA
==========================================
*/

router.post(
    "/setup/verify",
    authenticateToken,
    async (request, response) => {
        try {
            await ensureMfaSettingsSchema();

            const { challengeId, code } = request.body;

            if (
                typeof challengeId !== "string" ||
                typeof code !== "string" ||
                !/^\d{6}$/.test(code)
            ) {
                return response.status(400).json({
                    message: "Enter a valid six-digit verification code."
                });
            }

            const challenge = await get(
                `SELECT *
                 FROM mfa_settings_challenges
                 WHERE id = ? AND user_id = ? AND purpose = ?`,
                [challengeId, request.user.id, "setup"]
            );

            if (!challenge) {
                return response.status(404).json({
                    message: "This setup request is invalid or has expired."
                });
            }

            if (isExpired(challenge.expires_at)) {
                await run(
                    "DELETE FROM mfa_settings_challenges WHERE id = ?",
                    [challengeId]
                );

                return response.status(410).json({
                    message: "The verification request has expired. Start again."
                });
            }

            if (Number(challenge.attempts) >= MAX_ATTEMPTS) {
                await run(
                    "DELETE FROM mfa_settings_challenges WHERE id = ?",
                    [challengeId]
                );

                return response.status(429).json({
                    message: "Too many attempts. Start the setup again."
                });
            }

            const user = await getCurrentUser(request.user.id);

            if (
                !user ||
                !user.is_active ||
                !user.is_verified ||
                Number(user.mfa_enabled) === 1 ||
                user.mfa_enabled === true
            ) {
                return response.status(403).json({
                    message: "Your account or security settings have changed."
                });
            }

            await run(
                `UPDATE mfa_settings_challenges
                 SET attempts = attempts + 1
                 WHERE id = ? AND attempts < ?`,
                [challengeId, MAX_ATTEMPTS]
            );

            let verified = false;
            let encryptedSecret = null;

            if (challenge.method === "email") {
                verified = verifyChallengeCode(
                    challengeId,
                    code,
                    challenge.code_hash
                );
            } else if (challenge.method === "authenticator") {
                if (!user.mfa_pending_secret_encrypted) {
                    return response.status(409).json({
                        message: "Authenticator setup is incomplete. Start again."
                    });
                }

                const secret = decryptSecret(
                    user.mfa_pending_secret_encrypted
                );

                verified = verifyAuthenticatorCode(secret, code);

                if (verified) {
                    encryptedSecret = user.mfa_pending_secret_encrypted;
                }
            }

            if (!verified) {
                const latest = await get(
                    "SELECT attempts FROM mfa_settings_challenges WHERE id = ?",
                    [challengeId]
                );

                if (
                    latest &&
                    Number(latest.attempts) >= MAX_ATTEMPTS
                ) {
                    await run(
                        "DELETE FROM mfa_settings_challenges WHERE id = ?",
                        [challengeId]
                    );
                }

                return response.status(401).json({
                    message: "The verification code is incorrect."
                });
            }

            if (challenge.method === "authenticator") {
                await run(
                    `UPDATE users
                     SET mfa_enabled = 1,
                         mfa_method = ?,
                         mfa_secret_encrypted = ?,
                         mfa_pending_secret_encrypted = NULL
                     WHERE id = ?`,
                    ["authenticator", encryptedSecret, user.id]
                );
            } else {
                await run(
                    `UPDATE users
                     SET mfa_enabled = 1,
                         mfa_method = ?,
                         mfa_secret_encrypted = NULL,
                         mfa_pending_secret_encrypted = NULL
                     WHERE id = ?`,
                    ["email", user.id]
                );
            }

            await run(
                "DELETE FROM mfa_settings_challenges WHERE id = ?",
                [challengeId]
            );

            return response.json({
                success: true,
                message: "Two-step verification has been enabled.",
                method: challenge.method
            });
        } catch (error) {
            console.error("MFA setup verification error:", error.message);

            return response.status(500).json({
                message: "Unable to verify the setup. Please try again."
            });
        }
    }
);

/*
==========================================
DISABLE MFA
==========================================
*/

router.post(
    "/disable",
    authenticateToken,
    async (request, response) => {
        try {
            const { password, code } = request.body;

            const user = await getCurrentUser(request.user.id);

            if (!user || !user.is_active || !user.is_verified) {
                return response.status(403).json({
                    message: "Your account is unavailable."
                });
            }

            if (
                !(Number(user.mfa_enabled) === 1 ||
                  user.mfa_enabled === true)
            ) {
                return response.status(409).json({
                    message: "MFA is not enabled."
                });
            }

            if (!(await requirePassword(user, password))) {
                return response.status(401).json({
                    message: "Your password is incorrect."
                });
            }

            if (
                typeof code !== "string" ||
                !/^\d{6}$/.test(code)
            ) {
                return response.status(400).json({
                    message: "Enter your current six-digit verification code."
                });
            }

            if (user.mfa_method === "authenticator" ||
                user.mfa_method === "totp") {
                if (!user.mfa_secret_encrypted) {
                    return response.status(409).json({
                        message: "Your authenticator configuration is incomplete."
                    });
                }

                const secret = decryptSecret(user.mfa_secret_encrypted);

                if (!verifyAuthenticatorCode(secret, code)) {
                    return response.status(401).json({
                        message: "The authenticator code is incorrect."
                    });
                }
            } else if (user.mfa_method === "email") {
                // Email MFA must be verified by a code sent for this
                // disable operation. Never treat an arbitrary six-digit
                // value as proof of email ownership.
                return response.status(409).json({
                    message: "Email MFA disable verification is not implemented yet."
                });
            } else {
                return response.status(409).json({
                    message: "Your MFA method is not recognized."
                });
            }

            await run(
                `UPDATE users
                 SET mfa_enabled = 0,
                     mfa_method = NULL,
                     mfa_secret_encrypted = NULL,
                     mfa_pending_secret_encrypted = NULL
                 WHERE id = ?`,
                [user.id]
            );

            await run(
                "DELETE FROM mfa_recovery_codes WHERE user_id = ?",
                [user.id]
            );

            return response.json({
                success: true,
                message: "Two-step verification has been disabled."
            });
        } catch (error) {
            console.error("MFA disable error:", error.message);

            return response.status(500).json({
                message: "Unable to disable MFA. Please try again."
            });
        }
    }
);

/*
==========================================
GENERATE RECOVERY CODES
==========================================
*/

router.post(
    "/recovery-codes",
    authenticateToken,
    async (request, response) => {
        try {
            const { password, code } = request.body;

            const user = await getCurrentUser(request.user.id);

            if (!user || !user.is_active || !user.is_verified) {
                return response.status(403).json({
                    message: "Your account is unavailable."
                });
            }

            if (
                !(Number(user.mfa_enabled) === 1 ||
                  user.mfa_enabled === true)
            ) {
                return response.status(409).json({
                    message: "Enable MFA before generating recovery codes."
                });
            }

            if (!(await requirePassword(user, password))) {
                return response.status(401).json({
                    message: "Your password is incorrect."
                });
            }

            if (
                user.mfa_method !== "authenticator" &&
                user.mfa_method !== "totp"
            ) {
                return response.status(409).json({
                    message: "Recovery-code generation currently requires an authenticator app."
                });
            }

            if (
                typeof code !== "string" ||
                !/^\d{6}$/.test(code)
            ) {
                return response.status(400).json({
                    message: "Enter your current authenticator code."
                });
            }

            if (!user.mfa_secret_encrypted) {
                return response.status(409).json({
                    message: "Your authenticator configuration is incomplete."
                });
            }

            const secret = decryptSecret(user.mfa_secret_encrypted);

            if (!verifyAuthenticatorCode(secret, code)) {
                return response.status(401).json({
                    message: "The authenticator code is incorrect."
                });
            }

            const recoveryCodes = generateRecoveryCodes();

            await run(
                "DELETE FROM mfa_recovery_codes WHERE user_id = ?",
                [user.id]
            );

            for (const recoveryCode of recoveryCodes) {
                await run(
                    `INSERT INTO mfa_recovery_codes
                     (user_id, code_hash)
                     VALUES (?, ?)`,
                    [user.id, hashRecoveryCode(recoveryCode)]
                );
            }

            return response.json({
                success: true,
                message: "Save these recovery codes somewhere secure. They will not be shown again.",
                recoveryCodes
            });
        } catch (error) {
            console.error("MFA recovery-code error:", error.message);

            return response.status(500).json({
                message: "Unable to generate recovery codes. Please try again."
            });
        }
    }
);

module.exports = router;