require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const {
    initializeDatabase,
    get
} = require("./database/database");

const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/uploads");
const contentRoutes = require("./routes/content");
const contactRoutes = require("./routes/contact");
const pagesRoutes = require("./routes/pages");

const app = express();

const PORT = process.env.PORT || 3000;

const packageInfo = require("./package.json");


/*
==========================================
REQUEST BODY PARSING
==========================================
*/

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


/*
==========================================
PUBLIC STATIC ASSETS
==========================================
*/

app.use(
    "/css",
    express.static(
        path.join(__dirname, "css")
    )
);

app.use(
    "/javascript",
    express.static(
        path.join(__dirname, "javascript")
    )
);

app.use(
    "/images",
    express.static(
        path.join(__dirname, "images")
    )
);


/*
==========================================
ADMIN STATIC ASSETS
==========================================
*/

app.use(
    "/admin/css",
    express.static(
        path.join(
            __dirname,
            "admin",
            "css"
        )
    )
);


/*
==========================================
API ROUTES
==========================================
*/

app.get(
    "/api/version",
    function (request, response) {
        response.json({
            success: true,
            name: packageInfo.name,
            version: packageInfo.version
        });
    }
);

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api/uploads",
    uploadRoutes
);

app.use(
    "/api/content",
    contentRoutes
);

app.use(
    "/api/contact",
    contactRoutes
);

app.use(
    "/api/pages",
    pagesRoutes
);


/*
==========================================
PUBLIC LOGIN
==========================================
*/

app.get(
    "/",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "login.html"
            )
        );
    }
);

app.get(
    "/login.html",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "login.html"
            )
        );
    }
);


/*
==========================================
REGISTRATION
==========================================
*/

app.get(
    "/register.html",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "register.html"
            )
        );
    }
);


/*
==========================================
OTP VERIFICATION
==========================================
*/

app.get(
    "/verify-otp.html",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "verify-otp.html"
            )
        );
    }
);


/*
==========================================
ADMINISTRATOR LOGIN
==========================================
*/

app.get(
    "/admin",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "admin",
                "login.html"
            )
        );
    }
);

app.get(
    "/admin/",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "admin",
                "login.html"
            )
        );
    }
);

app.get(
    "/admin/login.html",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "admin",
                "login.html"
            )
        );
    }
);


/*
==========================================
ADMINISTRATOR DASHBOARD
==========================================
*/

app.get(
    "/admin/dashboard.html",
    function (request, response) {
        response.sendFile(
            path.join(
                __dirname,
                "admin",
                "dashboard.html"
            )
        );
    }
);


/*
==========================================
PUBLIC UPLOADED FILES
==========================================
*/

app.get(
    "/uploads/:category/:filename",
    async function (request, response) {

        const allowedCategories = [
            "documents",
            "speeches",
            "presentations",
            "writings",
            "pages"
        ];

        const category =
            request.params.category;

        const filename =
            request.params.filename;


        if (
            !allowedCategories.includes(
                category
            )
        ) {
            return response
                .status(400)
                .json({
                    message:
                        "Invalid category."
                });
        }


        const safeFilename =
            path.basename(
                filename
            );


        /*
        ==========================================
        PROTECT MAIN CONTENT VISIBILITY
        ==========================================
        */

        if (
            category !== "pages"
        ) {

            try {

                const contentItem =
                    await get(
                        `
                        SELECT
                            id,
                            visibility
                        FROM content
                        WHERE category = ?
                        AND filename = ?
                        LIMIT 1
                        `,
                        [
                            category,
                            safeFilename
                        ]
                    );


                if (
                    !contentItem
                ) {
                    return response
                        .status(404)
                        .json({
                            message:
                                "File not found."
                        });
                }


                if (
                    contentItem.visibility !==
                    "public"
                ) {
                    return response
                        .status(403)
                        .send(
                            "This content is currently hidden by the administrator."
                        );
                }

            } catch (error) {

                console.error(
                    "Content visibility check error:",
                    error.message
                );

                return response
                    .status(500)
                    .json({
                        message:
                            "Unable to verify content visibility."
                    });
            }

        }


        const filePath =
            path.join(
                __dirname,
                "uploads",
                category,
                safeFilename
            );


        if (
            !fs.existsSync(
                filePath
            )
        ) {
            return response
                .status(404)
                .json({
                    message:
                        "File not found."
                });
        }




        response.sendFile(
            filePath
        );
    }
);


/*
==========================================
PUBLIC FRONTEND FILES
==========================================
*/

app.use(
    express.static(
        __dirname
    )
);


/*
==========================================
404 HANDLER
==========================================
*/

app.use(
    function (request, response) {
        response
            .status(404)
            .send(
                "Page not found."
            );
    }
);


/*
==========================================
START SERVER
==========================================
*/

async function startServer() {

    try {

        await initializeDatabase();

        app.listen(
            PORT,
            function () {

                console.log(
                    "=========================================="
                );

                console.log(
                    "YASU Tech Server"
                );

                console.log(
                    "=========================================="
                );

                console.log(
                    "Server running at http://localhost:" +
                    PORT
                );

                console.log(
                    "Administrator login: http://localhost:" +
                    PORT +
                    "/admin/login.html"
                );

                console.log(
                    "Administrator dashboard: http://localhost:" +
                    PORT +
                    "/admin/dashboard.html"
                );

                console.log(
                    "=========================================="
                );
            }
        );

    } catch (error) {

        console.error(
            "Failed to start server:"
        );

        console.error(
            error
        );

        process.exit(1);
    }
}

startServer();
