const crypto = require("crypto");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

/**
 * Return the AES-256 encryption key from the environment.
 * The key must be exactly 64 hexadecimal characters (32 bytes).
 */
function getEncryptionKey() {
    const key = process.env.MFA_ENCRYPTION_KEY;

    if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
        throw new Error(
            "MFA_ENCRYPTION_KEY is missing or incorrectly formatted."
        );
    }

    return Buffer.from(key, "hex");
}

/**
 * Return the secret used to authenticate temporary MFA challenges.
 */
function getChallengeSecret() {
    const secret = process.env.MFA_CHALLENGE_SECRET;

    if (!secret || !/^[0-9a-fA-F]{64}$/.test(secret)) {
        throw new Error(
            "MFA_CHALLENGE_SECRET is missing or incorrectly formatted."
        );
    }

    return Buffer.from(secret, "hex");
}

/**
 * Encrypt a sensitive authenticator secret using AES-256-GCM.
 *
 * Each encryption uses a new random 12-byte initialization vector.
 */
function encryptSecret(plainText) {
    if (typeof plainText !== "string" || plainText.length === 0) {
        throw new TypeError("The secret must be a non-empty string.");
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        key,
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(plainText, "utf8"),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return [
        "v1",
        iv.toString("hex"),
        authTag.toString("hex"),
        encrypted.toString("hex")
    ].join(":");
}

/**
 * Decrypt a secret previously encrypted by encryptSecret().
 *
 * Authentication failure causes decryption to fail rather than
 * returning potentially altered data.
 */
function decryptSecret(encryptedText) {
    if (typeof encryptedText !== "string") {
        throw new TypeError("The encrypted secret must be a string.");
    }

    const parts = encryptedText.split(":");

    if (parts.length !== 4 || parts[0] !== "v1") {
        throw new Error("The encrypted secret has an invalid format.");
    }

    const [, ivHex, authTagHex, encryptedHex] = parts;

    if (
        !/^[0-9a-fA-F]{24}$/.test(ivHex) ||
        !/^[0-9a-fA-F]{32}$/.test(authTagHex) ||
        !/^(?:[0-9a-fA-F]{2})+$/.test(encryptedHex)
    ) {
        throw new Error("The encrypted secret contains invalid data.");
    }

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(ivHex, "hex")
    );

    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, "hex")),
        decipher.final()
    ]);

    return decrypted.toString("utf8");
}

/**
 * Create a keyed hash for a temporary verification code.
 *
 * Including the challenge ID prevents a code hash from being
 * reused as the hash for a different challenge.
 */
function hashChallengeCode(challengeId, code) {
    if (
        typeof challengeId !== "string" ||
        challengeId.length === 0 ||
        typeof code !== "string" ||
        !/^\d{6}$/.test(code)
    ) {
        throw new TypeError(
            "A challenge ID and six-digit code are required."
        );
    }

    return crypto
        .createHmac("sha256", getChallengeSecret())
        .update(`${challengeId}:${code}`, "utf8")
        .digest("hex");
}

/**
 * Compare a submitted code against its stored keyed hash.
 */
function verifyChallengeCode(challengeId, code, storedHash) {
    if (
        typeof storedHash !== "string" ||
        !/^[0-9a-fA-F]{64}$/.test(storedHash)
    ) {
        return false;
    }

    let submittedHash;

    try {
        submittedHash = hashChallengeCode(challengeId, code);
    } catch {
        return false;
    }

    const submittedBuffer = Buffer.from(submittedHash, "hex");
    const storedBuffer = Buffer.from(storedHash, "hex");

    return (
        submittedBuffer.length === storedBuffer.length &&
        crypto.timingSafeEqual(submittedBuffer, storedBuffer)
    );
}

/**
 * Generate a new authenticator-app setup.
 *
 * The caller must protect the returned secret and must not enable
 * MFA until the user successfully verifies an authenticator code.
 */
async function generateAuthenticatorSetup(
    email,
    appName = "YASU Tech"
) {
    if (
        typeof email !== "string" ||
        email.trim().length === 0 ||
        typeof appName !== "string" ||
        appName.trim().length === 0
    ) {
        throw new TypeError("An email and application name are required.");
    }

    const authenticator = speakeasy.generateSecret({
        length: 20,
        name: `${appName}:${email.trim()}`,
        issuer: appName
    });

    const qrDataUrl = await QRCode.toDataURL(authenticator.otpauth_url);

    return {
        secret: authenticator.base32,
        qrDataUrl
    };
}

/**
 * Verify a six-digit authenticator-app TOTP.
 *
 * A window of one permits a small clock difference between
 * the authenticator and server.
 */
function verifyAuthenticatorCode(base32Secret, token) {
    if (
        typeof base32Secret !== "string" ||
        typeof token !== "string" ||
        !/^\d{6}$/.test(token)
    ) {
        return false;
    }

    return speakeasy.totp.verify({
        secret: base32Secret,
        encoding: "base32",
        token,
        window: 1
    });
}

module.exports = {
    encryptSecret,
    decryptSecret,
    hashChallengeCode,
    verifyChallengeCode,
    generateAuthenticatorSetup,
    verifyAuthenticatorCode
};