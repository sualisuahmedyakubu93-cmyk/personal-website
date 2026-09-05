require("dotenv").config();

const bcrypt = require("bcryptjs");

const {
    get
} = require("./database/database");

async function checkAdmin() {

    const username =
        process.env.ADMIN_USERNAME;

    const password =
        process.env.ADMIN_PASSWORD;

    console.log(
        "Admin username:",
        username
    );

    const user = await get(
        `
        SELECT *
        FROM users
        WHERE username = ?
        `,
        [username]
    );

    if (!user) {
        console.log(
            "❌ Administrator account was NOT found."
        );
        return;
    }

    console.log(
        "✅ Administrator account found."
    );

    console.log(
        "Database username:",
        user.username
    );

    console.log(
        "Database email:",
        user.email
    );

    console.log(
        "Database role:",
        user.role
    );

    console.log(
        "Verified:",
        user.is_verified
    );

    const passwordMatches =
        await bcrypt.compare(
            password,
            user.password
        );

    console.log(
        "Password matches:",
        passwordMatches
    );
}

checkAdmin();