require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const {
    initializeDatabase
} = require("./database/database");

const {
    authenticateToken
} = require("./middleware/authMiddleware");

const authRoutes =
    require("./routes/auth");

const uploadRoutes =
    require("./routes/uploads");

const contentRoutes =
    require("./routes/content");

const contactRoutes =
    require("./routes/contact");


const app = express();

const PORT =
    process.env.PORT || 3000;


app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);


/*
==========================================
STATIC FILES
==========================================
*/

app.use(
    "/css",
    express.static(
        path.join(
            __dirname,
            "css"
        )
    )
);

app.use(
    "/javascript",
    express.static(
        path.join(
            __dirname,
            "javascript"
        )
    )
);

app.use(
    "/images",
    express.static(
        path.join(
            __dirname,
            "images"
        )
    )
);


/*
==========================================
API ROUTES
==========================================
*/

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


/*
==========================================
PUBLIC AUTHENTICATION PAGES
==========================================
*/

app.get(
    "/",
    (request, response) => {
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
    (request, response) => {
        response.sendFile(
            path.join(
                __dirname,
                "login.html"
            )
        );
    }
);

app.get(
    "/register.html",
    (request, response) => {
        response.sendFile(
            path.join(
                __dirname,
                "register.html"
            )
        );
    }
);

app.get(
    "/verify-otp.html",
    (request, response) => {
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
PROTECTED UPLOADED FILES
==========================================
*/

app.get(
    "/uploads/:category/:filename",
    authenticateToken,

    (request, response) => {

        const allowedCategories = [
            "documents",
            "speeches",
            "presentations",
            "writings"
        ];

        const {
            category,
            filename
        } = request.params;

        if (
            !allowedCategories.includes(
                category
            )
        ) {
            return response.status(400).json({
                message:
                    "Invalid category."
            });
        }

        const safeFilename =
            path.basename(
                filename
            );

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
            return response.status(404).json({
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
ALL FRONTEND FILES
==========================================
*/

app.use(
    express.static(
        __dirname
    )
);


/*
==========================================
404
==========================================
*/

app.use(
    (request, response) => {

        response.status(404).send(
            "Page not found."
        );
    }
);


async function startServer() {

    await initializeDatabase();

    app.listen(
        PORT,
        () => {
            console.log(
                `Server running at http://localhost:${PORT}`
            );
        }
    );
}


startServer();