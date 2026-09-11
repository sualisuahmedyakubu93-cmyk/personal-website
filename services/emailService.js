const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const BREVO_SENDER_EMAIL =
    process.env.BREVO_SENDER_EMAIL ||
    "sualisuahmedyakubu93@gmail.com";

const BREVO_SENDER_NAME =
    process.env.BREVO_SENDER_NAME ||
    "YASU Tech";

async function sendBrevoEmail({
    to,
    subject,
    htmlContent,
    replyTo
}) {

    if (!process.env.BREVO_API_KEY) {
        throw new Error("BREVO_API_KEY is not configured.");
    }

    if (!to) {
        throw new Error("Email recipient is required.");
    }

    if (!subject) {
        throw new Error("Email subject is required.");
    }

    if (!htmlContent) {
        throw new Error("Email content is required.");
    }

    const emailData = {
        sender: {
            name: BREVO_SENDER_NAME,
            email: BREVO_SENDER_EMAIL
        },

        to: [
            {
                email: to
            }
        ],

        subject,

        htmlContent
    };

    if (replyTo) {
        emailData.replyTo = {
            email: replyTo
        };
    }

    const brevoResponse = await fetch(
        BREVO_API_URL,
        {
            method: "POST",

            headers: {
                accept: "application/json",
                "api-key": process.env.BREVO_API_KEY,
                "content-type": "application/json"
            },

            body: JSON.stringify(emailData)
        }
    );

    const responseData =
        await brevoResponse
            .json()
            .catch(() => ({}));

    if (!brevoResponse.ok) {

        const errorMessage =
            responseData.message ||
            `Brevo API request failed with status ${brevoResponse.status}.`;

        throw new Error(errorMessage);
    }

    return responseData;
}


module.exports = {
    sendBrevoEmail
};