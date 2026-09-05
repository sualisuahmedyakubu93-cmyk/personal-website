require("dotenv").config();

const bcrypt = require("bcryptjs");

const {
    run
} = require("./database/database");


async function resetAdminPassword() {

    try {

        const hashedPassword =
            await bcrypt.hash(
                process.env.ADMIN_PASSWORD,
                12
            );


        const result =
            await run(
                `
                UPDATE users
                SET password = ?
                WHERE username = ?
                `,
                [
                    hashedPassword,
                    process.env.ADMIN_USERNAME
                ]
            );


        console.log(
            "Admin password reset successfully."
        );

        console.log(
            "Rows updated:",
            result.changes
        );


        process.exit(0);

    } catch (error) {

        console.error(
            "Password reset error:",
            error.message
        );

        process.exit(1);
    }
}


resetAdminPassword();