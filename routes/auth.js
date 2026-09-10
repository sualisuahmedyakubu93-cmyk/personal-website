const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const {
    run,
    get
} = require("../database/database");

const {
    authenticateToken
} = require("../middleware/authMiddleware");

const router = express.Router();


/*
==========================================
EMAIL TRANSPORTER
==========================================
*/

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),

    secure:
        process.env.EMAIL_SECURE === "true",

    auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
},

connectionTimeout: 15000,
greetingTimeout: 15000,
socketTimeout: 30000
});


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
SEND OTP EMAIL
==========================================
*/

async function sendOTP(
    email,
    username,
    otp
) {

    await transporter.sendMail({

        from:
            process.env.EMAIL_FROM,

        to:
            email,

        subject:
            "Verify Your YASU Tech Account",

        html: `
            <h2>Hello ${username},</h2>

            <p>
                Thank you for registering with YASU Tech.
            </p>

            <p>
                Your verification code is:
            </p>

            <h1>${otp}</h1>

            <p>
                This code will expire in 10 minutes.
            </p>

            <p>
                If you did not request this account,
                please ignore this email.
            </p>
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


            /*
            ==========================================
            TEMPORARY LOGIN DEBUG
            ==========================================

            This does NOT display your password.

            It only displays:
            - username received
            - password length
            - whether it matches ADMIN_PASSWORD
            */

            console.log(
                "\n========== LOGIN DEBUG =========="
            );

            console.log(
                "Username received:",
                username
            );

            console.log(
                "Password length received:",
                password
                    ? password.length
                    : 0
            );

            console.log(
                "Matches ADMIN_PASSWORD:",
                password ===
                process.env.ADMIN_PASSWORD
            );

            console.log(
                "=================================\n"
            );


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


            console.log(
                "bcrypt password matches database:",
                passwordMatches
            );


            if (
                !passwordMatches
            ) {

                return response.status(401).json({
                    message:
                        "Incorrect username or password."
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
CURRENT USER
==========================================
*/

router.get(
    "/me",

    authenticateToken,

    (request, response) => {

        response.json({

            user:
                request.user

        });

    }
);


module.exports = router;

