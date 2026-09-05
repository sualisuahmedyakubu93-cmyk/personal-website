require("dotenv").config();

async function testLogin() {

    const username =
        process.env.ADMIN_USERNAME;

    const password =
        process.env.ADMIN_PASSWORD;

    console.log(
        "Testing login for:",
        username
    );

    try {

        const response =
            await fetch(
                "http://localhost:3000/api/auth/login",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            username,
                            password,
                            rememberMe: false
                        })
                }
            );

        const data =
            await response.json();

        console.log(
            "HTTP status:",
            response.status
        );

        console.log(
            "Server response:",
            data
        );

    } catch (error) {

        console.error(
            "Connection error:",
            error.message
        );
    }
}

testLogin();