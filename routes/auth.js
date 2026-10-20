const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
    sendBrevoEmail
} = require("../services/emailService");

const {
    run,
    get
} = require("../database/database");

const {
    authenticateToken
} = require("../middleware/authMiddleware");
const crypto = require("crypto");

const {
encryptSecret,
decryptSecret,
hashChallengeCode,
verifyChallengeCode,
generateAuthenticatorSetup,
verifyAuthenticatorCode
} = require("../utils/mfa");


const router = express.Router();


/*
==========================================
GENERATE OTP
==========================================
*/

function generateOTP() {

    return Math.floor(
        100000 +
        Math.random() * 900000
    ).toString();

}


/*
==========================================
STRONG PASSWORD VALIDATION
==========================================
*/

function isStrongPassword(password) {

    return (
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );

}


/*
==========================================
ESCAPE HTML
==========================================
*/

/*
==========================================
MFA HELPER FUNCTIONS
==========================================
*/

/**
 * Generate a cryptographically secure six-digit
 * verification code for MFA.
 *
 * This is separate from the existing registration OTP.
 */
function generateSecureMfaCode() {

    return crypto
        .randomInt(0, 1000000)
        .toString()
        .padStart(6, "0");

}


/**
 * Generate a unique ID for an MFA challenge.
 */
function generateMfaChallengeId() {

    return crypto.randomUUID();

}


/**
 * Calculate when an MFA challenge expires.
 *
 * The default lifetime is ten minutes.
 */
function getMfaChallengeExpiry(
    minutes = 10
) {

    if (
        !Number.isInteger(minutes) ||
        minutes < 1 ||
        minutes > 30
    ) {
        throw new RangeError(
            "MFA challenge lifetime must be between 1 and 30 minutes."
        );
    }

    return new Date(
        Date.now() + minutes * 60 * 1000
    ).toISOString();

}


/**
 * Check whether an MFA challenge has expired.
 */
function isMfaChallengeExpired(
    expiresAt
) {

    if (
        typeof expiresAt !== "string"
    ) {
        return true;
    }

    const expiryTime = Date.parse(
        expiresAt
    );

    return (
        !Number.isFinite(expiryTime) ||
        expiryTime <= Date.now()
    );

}

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/*
==========================================
SEND OTP EMAIL
==========================================
*/

async function sendOTP(
    email,
    username,
    otp
) {

    await sendBrevoEmail({

        to:
            email,

        subject:
            "Verify Your YASU Tech Account",

            htmlContent: `
            <div style="
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #222;
                max-width: 600px;
                margin: 0 auto;
            ">

                <h2>
                    Hello ${escapeHtml(username)},
                </h2>

                <p>
                    Thank you for registering with
                    <strong>YASU Tech</strong>.
                </p>

                <p>
                    Your email verification code is:
                </p>

                <div style="
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    text-align: center;
                    padding: 20px;
                    background: #f5f5f5;
                    border-radius: 8px;
                    margin: 20px 0;
                ">
                    ${escapeHtml(otp)}
                </div>

                <p>
                    This code will expire in
                    <strong>10 minutes</strong>.
                </p>

                <p>
                    If you did not request this account,
                    please ignore this email.
                </p>

                <hr>

                <p style="
                    font-size: 13px;
                    color: #666;
                ">
                    YASU Tech<br>
                    Powered by Yakubu Sualisu Ahmed
                </p>

            </div>
        `
    });

}
/*
==========================================
SEND MFA LOGIN CODE EMAIL
==========================================
*/

async function sendMfaCodeEmail(
    email,
    username,
    code
) {
    await sendBrevoEmail({
        to: email,

        subject: "Your YASU Tech Login Verification Code",

        htmlContent: `
            <div style="
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #222;
                max-width: 600px;
                margin: 0 auto;
            ">
                <h2>
                    Hello ${escapeHtml(username)},
                </h2>

                <p>
                    A login attempt requires an additional
                    verification step for your YASU Tech account.
                </p>

                <p>
                    Your login verification code is:
                </p>

                <div style="
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    text-align: center;
                    padding: 20px;
                    background: #f5f5f5;
                    border-radius: 8px;
                    margin: 20px 0;
                ">
                    ${escapeHtml(code)}
                </div>

                <p>
                    This code expires in
                    <strong>10 minutes</strong>.
                </p>

                <p>
                    Never share this code with anyone.
                    YASU Tech staff will not ask you to disclose it.
                </p>

                <p>
                    If you did not attempt to log in,
                    you can ignore this email. Consider changing
                    your password if you suspect someone else
                    knows it.
                </p>

                <hr>

                <p style="
                    font-size: 13px;
                    color: #666;
                ">
                    YASU Tech<br>
                    Innovating Today, Engineering Tomorrow.<br>
                    Powered by Yakubu Sualisu Ahmed
                </p>
            </div>
        `
    });
}

/*
==========================================
REGISTER
==========================================
*/

router.post(
    "/register",

    async (request, response) => {

        try {

            const {
                username,
                email,
                password
            } = request.body;


            if (
                !username ||
                !email ||
                !password
            ) {

                return response.status(400).json({
                    message:
                        "Username, email and password are required."
                });

            }


            if (
                username.length < 3
            ) {

                return response.status(400).json({
                    message:
                        "Username must contain at least 3 characters."
                });

            }


            /*
            ==========================================
            STRONG PASSWORD CHECK
            ==========================================
            */

            if (
                !isStrongPassword(password)
            ) {

                return response.status(400).json({
                    message:
                        "Password does not meet the required security standard."
                });

            }


            const existingUsername =
                await get(
                    `
                    SELECT id
                    FROM users
                    WHERE username = ?
                    `,
                    [username]
                );


            if (
                existingUsername
            ) {

                return response.status(409).json({
                    message:
                        "Username is already registered."
                });

            }


            const existingEmail =
                await get(
                    `
                    SELECT id
                    FROM users
                    WHERE email = ?
                    `,
                    [email]
                );


            if (
                existingEmail
            ) {

                return response.status(409).json({
                    message:
                        "Email address is already registered."
                });

            }


            const hashedPassword =
                await bcrypt.hash(
                    password,
                    12
                );


            const otp =
                generateOTP();


            const expiresAt =
                new Date(
                    Date.now() +
                    10 * 60 * 1000
                ).toISOString();


            await run(
                `
                INSERT INTO users (
                    username,
                    email,
                    password,
                    role,
                    is_verified,
                    otp_code,
                    otp_expires_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    username,
                    email,
                    hashedPassword,
                    "user",
                    0,
                    otp,
                    expiresAt
                ]
            );


            await sendOTP(
                email,
                username,
                otp
            );


            return response.status(201).json({
                message:
                    "Registration successful. Check your email for the OTP code.",

                email
            });

        } catch (error) {

            console.error(
                "Registration error:",
                error.message
            );


            return response.status(500).json({
                message:
                    "Registration failed. Please try again."
            });

        }

    }
);


/*
==========================================
VERIFY OTP
==========================================
*/

router.post(
    "/verify-otp",

    async (request, response) => {

        try {

            const {
                email,
                otp
            } = request.body;


            if (
                !email ||
                !otp
            ) {

                return response.status(400).json({
                    message:
                        "Email and OTP code are required."
                });

            }


            const user =
                await get(
                    `
                    SELECT *
                    FROM users
                    WHERE email = ?
                    `,
                    [email]
                );


            if (
                !user
            ) {

                return response.status(404).json({
                    message:
                        "Account was not found."
                });

            }


            if (
                user.otp_code !== otp
            ) {

                return response.status(400).json({
                    message:
                        "Incorrect verification code."
                });

            }


            if (
                new Date(
                    user.otp_expires_at
                ).getTime() < Date.now()
            ) {

                return response.status(400).json({
                    message:
                        "OTP has expired. Please request a new code."
                });

            }


            await run(
                `
                UPDATE users
                SET
                    is_verified = 1,
                    otp_code = NULL,
                    otp_expires_at = NULL
                WHERE email = ?
                `,
                [email]
            );


            return response.json({
                message:
                    "Email verified successfully. You can now log in."
            });

        } catch (error) {

            console.error(
                "OTP verification error:",
                error.message
            );


            return response.status(500).json({
                message:
                    "Unable to verify OTP."
            });

        }

    }
);


/*
==========================================
RESEND OTP
==========================================
*/

router.post(
    "/resend-otp",

    async (request, response) => {

        try {

            const {
                email
            } = request.body;


            const user =
                await get(
                    `
                    SELECT *
                    FROM users
                    WHERE email = ?
                    `,
                    [email]
                );


            if (
                !user
            ) {

                return response.status(404).json({
                    message:
                        "Account was not found."
                });

            }


            const otp =
                generateOTP();


            const expiresAt =
                new Date(
                    Date.now() +
                    10 * 60 * 1000
                ).toISOString();


            await run(
                `
                UPDATE users
                SET
                    otp_code = ?,
                    otp_expires_at = ?
                WHERE email = ?
                `,
                [
                    otp,
                    expiresAt,
                    email
                ]
            );


            await sendOTP(
                email,
                user.username,
                otp
            );


            return response.json({
                message:
                    "A new OTP has been sent to your email."
            });

        } catch (error) {

            console.error(
                "Resend OTP error:",
                error.message
            );


            return response.status(500).json({
                message:
                    "Unable to resend OTP."
            });

        }

    }
);


/*
==========================================
LOGIN
==========================================
*/

router.post(
    "/login",

    async (request, response) => {

        try {

            const {
                username,
                password,
                rememberMe
            } = request.body;


            const user =
                await get(
                    `
                    SELECT *
                    FROM users
                    WHERE username = ?
                    `,
                    [username]
                );


            if (
                !user
            ) {

                return response.status(401).json({
                    message:
                        "Incorrect username or password."
                });

            }


            const passwordMatches =
                await bcrypt.compare(
                    password,
                    user.password
                );


            if (
                !passwordMatches
            ) {

                return response.status(401).json({
                    message:
                        "Incorrect username or password."
                });

            }


            if (!user.is_active) {

                return response.status(403).json({
                    message:
                        "Your account has been deactivated. Please contact the administrator."
                });

            }


            if (
                !user.is_verified
            ) {

                return response.status(403).json({
                    message:
                        "Please verify your email before logging in.",

                    email:
                        user.email,

                    needsVerification:
                        true
                });

            }

            /*
            ==========================================
            OPTIONAL MFA LOGIN CHECK
            ==========================================
            */

            if (
                Number(user.mfa_enabled) === 1 ||
                user.mfa_enabled === true
            ) {

                const storedMethod = user.mfa_method;

                const method =
                    storedMethod === "totp"
                        ? "authenticator"
                        : storedMethod;

                if (
                    method !== "email" &&
                    method !== "authenticator"
                ) {

                    console.error(
                        "MFA configuration error for user:",
                        user.id
                    );

                    return response.status(500).json({
                        message:
                            "Your MFA configuration needs attention. Please contact support."
                    });

                }

                const challengeId =
                    generateMfaChallengeId();

                const expiresAt =
                    getMfaChallengeExpiry(10);

                let codeHash = null;
                let emailCode = null;

                if (method === "email") {

                    if (!user.email) {

                        return response.status(500).json({
                            message:
                                "Email verification is unavailable for this account. Please contact support."
                        });

                    }

                    emailCode =
                        generateSecureMfaCode();

                    codeHash =
                        hashChallengeCode(
                            challengeId,
                            emailCode
                        );

                } else {

                    try {

                        if (!user.mfa_secret_encrypted) {
                            throw new Error(
                                "The authenticator secret is missing."
                            );
                        }

                        decryptSecret(
                            user.mfa_secret_encrypted
                        );

                    } catch (error) {

                        console.error(
                            "MFA authenticator configuration error for user:",
                            user.id
                        );

                        return response.status(500).json({
                            message:
                                "Authenticator verification is temporarily unavailable. Please contact support."
                        });

                    }

                }

                await run(
                    `
                    INSERT INTO mfa_login_challenges (
                        id,
                        user_id,
                        method,
                        code_hash,
                        expires_at,
                        attempts,
                        remember_me
                    )
                    VALUES (?, ?, ?, ?, ?, 0, ?)
                    `,
                    [
                        challengeId,
                        user.id,
                        method,
                        codeHash,
                        expiresAt,
                        rememberMe ? 1 : 0
                    ]
                );

                if (method === "email") {

                    try {

                        await sendMfaCodeEmail(
                            user.email,
                            user.username,
                            emailCode
                        );

                    } catch (error) {

                        console.error(
                            "MFA email delivery error:",
                            error.message
                        );

                        await run(
                            `
                            DELETE FROM mfa_login_challenges
                            WHERE id = ?
                            `,
                            [challengeId]
                        );

                        return response.status(503).json({
                            message:
                                "We could not send your verification code. Please try logging in again."
                        });

                    }

                }

                return response.json({

                    message:
                        "Additional verification is required.",

                    mfaRequired:
                        true,

                    challengeId,

                    method

                });

            }
            const expiresIn =
                rememberMe
                    ? "30d"
                    : "24h";


            const token =
                jwt.sign(
                    {
                        id:
                            user.id,

                        username:
                            user.username,

                        email:
                            user.email,

                        role:
                            user.role
                    },

                    process.env.JWT_SECRET,

                    {
                        expiresIn
                    }
                );


            return response.json({

                message:
                    "Login successful.",

                token,

                user: {

                    id:
                        user.id,

                    username:
                        user.username,

                    email:
                        user.email,

                    role:
                        user.role

                }

            });

        } catch (error) {

            console.error(
                "Login error:",
                error.message
            );


            return response.status(500).json({
                message:
                    "Unable to log in."
            });

        }

    }
);

/*
==========================================
VERIFY MFA LOGIN CHALLENGE
==========================================
*/

router.post(
    "/verify-mfa-login",

    async (request, response) => {

        try {

            const {
                challengeId,
                code
            } = request.body;

            if (
                typeof challengeId !== "string" ||
                typeof code !== "string" ||
                !/^\d{6}$/.test(code)
            ) {

                return response.status(400).json({
                    message:
                        "Enter a valid six-digit verification code."
                });

            }

            let challenge =
                await get(
                    `
                    SELECT
                        c.id AS challenge_id,
                        c.user_id AS challenge_user_id,
                        c.method AS challenge_method,
                        c.code_hash AS challenge_code_hash,
                        c.expires_at AS challenge_expires_at,
                        c.attempts AS challenge_attempts,
                        c.remember_me AS challenge_remember_me,

                        u.id AS user_id,
                        u.username AS username,
                        u.email AS email,
                        u.role AS role,
                        u.is_active AS is_active,
                        u.is_verified AS is_verified,
                        u.mfa_enabled AS mfa_enabled,
                        u.mfa_method AS mfa_method,
                        u.mfa_secret_encrypted
                            AS mfa_secret_encrypted

                    FROM mfa_login_challenges c

                    INNER JOIN users u
                        ON u.id = c.user_id

                    WHERE c.id = ?
                    `,
                    [challengeId]
                );

            if (!challenge) {

                return response.status(401).json({
                    message:
                        "This verification request is invalid or has expired. Please log in again."
                });

            }

            if (
                isMfaChallengeExpired(
                    challenge.challenge_expires_at
                )
            ) {

                await run(
                    `
                    DELETE FROM mfa_login_challenges
                    WHERE id = ?
                    `,
                    [challengeId]
                );

                return response.status(401).json({
                    message:
                        "Your verification code has expired. Please log in again."
                });

            }

            if (
                Number(challenge.challenge_attempts) >= 5
            ) {

                await run(
                    `
                    DELETE FROM mfa_login_challenges
                    WHERE id = ?
                    `,
                    [challengeId]
                );

                return response.status(429).json({
                    message:
                        "Too many verification attempts. Please log in again."
                });

            }

            if (
                !challenge.is_active ||
                !challenge.is_verified ||
                !(
                    Number(challenge.mfa_enabled) === 1 ||
                    challenge.mfa_enabled === true
                )
            ) {

                await run(
                    `
                    DELETE FROM mfa_login_challenges
                    WHERE id = ?
                    `,
                    [challengeId]
                );

                return response.status(403).json({
                    message:
                        "Your account or MFA settings have changed. Please log in again."
                });

            }

            const configuredMethod =
                challenge.mfa_method === "totp"
                    ? "authenticator"
                    : challenge.mfa_method;

            if (
                configuredMethod !==
                challenge.challenge_method
            ) {

                await run(
                    `
                    DELETE FROM mfa_login_challenges
                    WHERE id = ?
                    `,
                    [challengeId]
                );

                return response.status(401).json({
                    message:
                        "Your verification request is no longer valid. Please log in again."
                });

            }

            /*
            ------------------------------------------
            RECORD A VERIFICATION ATTEMPT
            ------------------------------------------
            */

            const attemptResult =
                await run(
                    `
                    UPDATE mfa_login_challenges

                    SET attempts = attempts + 1

                    WHERE id = ?
                    AND attempts < 5
                    `,
                    [challengeId]
                );

            if (
                attemptResult.changes !== 1
            ) {

                return response.status(401).json({
                    message:
                        "This verification request is no longer valid. Please log in again."
                });

            }

            /*
            ------------------------------------------
            VERIFY THE SECOND FACTOR
            ------------------------------------------
            */

            let codeIsValid = false;

            if (
                challenge.challenge_method === "email"
            ) {

                codeIsValid =
                    verifyChallengeCode(
                        challengeId,
                        code,
                        challenge.challenge_code_hash
                    );

            } else if (
                challenge.challenge_method ===
                "authenticator"
            ) {

                try {

                    const authenticatorSecret =
                        decryptSecret(
                            challenge.mfa_secret_encrypted
                        );

                    codeIsValid =
                        verifyAuthenticatorCode(
                            authenticatorSecret,
                            code
                        );

                } catch (error) {

                    console.error(
                        "MFA verification configuration error:",
                        error.message
                    );

                    return response.status(500).json({
                        message:
                            "Authenticator verification is temporarily unavailable."
                    });

                }

            }

            if (!codeIsValid) {

                const latestChallenge =
                    await get(
                        `
                        SELECT attempts
                        FROM mfa_login_challenges
                        WHERE id = ?
                        `,
                        [challengeId]
                    );

                if (
                    !latestChallenge ||
                    Number(latestChallenge.attempts) >= 5
                ) {

                    await run(
                        `
                        DELETE FROM mfa_login_challenges
                        WHERE id = ?
                        `,
                        [challengeId]
                    );

                    return response.status(429).json({
                        message:
                            "Too many verification attempts. Please log in again."
                    });

                }

                return response.status(401).json({
                    message:
                        "The verification code is incorrect."
                });

            }

            /*
            ------------------------------------------
            CONSUME THE CHALLENGE
            ------------------------------------------

            Only the request that successfully deletes
            the challenge may proceed to issue a token.
            ------------------------------------------
            */

            const consumedChallenge =
                await run(
                    `
                    DELETE FROM mfa_login_challenges
                    WHERE id = ?
                    `,
                    [challengeId]
                );

            if (
                consumedChallenge.changes !== 1
            ) {

                return response.status(401).json({
                    message:
                        "This verification request has already been used. Please log in again."
                });

            }

            /*
            ------------------------------------------
            ISSUE THE AUTHENTICATED SESSION
            ------------------------------------------
            */

            const expiresIn =
                Number(challenge.challenge_remember_me) === 1
                    ? "30d"
                    : "24h";

            const token =
                jwt.sign(
                    {
                        id:
                            challenge.user_id,

                        username:
                            challenge.username,

                        email:
                            challenge.email,

                        role:
                            challenge.role
                    },

                    process.env.JWT_SECRET,

                    {
                        expiresIn
                    }
                );

            return response.json({

                message:
                    "Login successful.",

                token,

                user: {

                    id:
                        challenge.user_id,

                    username:
                        challenge.username,

                    email:
                        challenge.email,

                    role:
                        challenge.role

                }

            });

        } catch (error) {

            console.error(
                "MFA login verification error:",
                error.message
            );

            return response.status(500).json({
                message:
                    "Unable to verify your login. Please try again."
            });

        }

    }
);
/*
==========================================
CURRENT USER
==========================================
*/

router.get(
"/me",
authenticateToken,
async (request, response) => {
try {
if (!request.user || !request.user.id) {
return response.status(401).json({
success: false,
message: "Please log in again."
});
}


        const currentUser = await get(
            `SELECT
                id,
                username,
                email,
                role,
                is_verified,
                is_active
             FROM users
             WHERE id = ?`,
            [request.user.id]
        );

        if (!currentUser || !currentUser.is_verified) {
            return response.status(403).json({
                success: false,
                message: "Your account is unavailable or not verified."
            });
        }

        if (
            currentUser.is_active === false ||
            currentUser.is_active === 0
        ) {
            return response.status(403).json({
                success: false,
                message: "Your account is inactive."
            });
        }

        return response.json({
            success: true,
            user: {
                id: currentUser.id,
                username: currentUser.username,
                email: currentUser.email,
                role: currentUser.role,
                is_verified: currentUser.is_verified,
                is_active: currentUser.is_active
            }
        });
    } catch (error) {
        console.error(
            "Current-user retrieval error:",
            error.message
        );

        return response.status(500).json({
            success: false,
            message: "Unable to retrieve your account details."
        });
    }
}


);



module.exports = router;
