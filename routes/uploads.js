const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
    run,
    get
} = require("../database/database");

const {
    authenticateToken,
    requireAdmin
} = require("../middleware/authMiddleware");

const router = express.Router();

const categories = [
    "documents",
    "speeches",
    "presentations",
    "writings"
];


categories.forEach(category => {

    const folder =
        path.join(
            __dirname,
            "..",
            "uploads",
            category
        );

    if (!fs.existsSync(folder)) {
        fs.mkdirSync(
            folder,
            { recursive: true }
        );
    }
});


const storage =
    multer.diskStorage({

        destination:
            (request, file, callback) => {

                const category =
                    request.body.category;

                if (
                    !categories.includes(
                        category
                    )
                ) {
                    return callback(
                        new Error(
                            "Invalid category."
                        )
                    );
                }

                callback(
                    null,
                    path.join(
                        __dirname,
                        "..",
                        "uploads",
                        category
                    )
                );
            },

        filename:
            (request, file, callback) => {

                const extension =
                    path.extname(
                        file.originalname
                    );

                callback(
                    null,
                    `${Date.now()}-${Math.round(Math.random() * 1000000)}${extension}`
                );
            }
    });


const upload =
    multer({
        storage,

        limits: {
            fileSize:
                20 * 1024 * 1024
        }
    });


router.post(
    "/",
    authenticateToken,
    requireAdmin,
    upload.single("file"),

    async (request, response) => {

        try {

            const {
                title,
                description,
                category
            } = request.body;

            if (!request.file) {
                return response.status(400).json({
                    message:
                        "Please select a file."
                });
            }

            await run(
                `
                INSERT INTO content (
                    title,
                    description,
                    category,
                    filename,
                    original_name,
                    uploaded_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    title,
                    description || "",
                    category,
                    request.file.filename,
                    request.file.originalname,
                    request.user.id
                ]
            );

            response.status(201).json({
                message:
                    "Content uploaded successfully."
            });

        } catch (error) {

            response.status(500).json({
                message:
                    "Upload failed."
            });
        }
    }
);


router.delete(
    "/:id",
    authenticateToken,
    requireAdmin,

    async (request, response) => {

        try {

            const content =
                await get(
                    `
                    SELECT *
                    FROM content
                    WHERE id = ?
                    `,
                    [request.params.id]
                );

            if (!content) {
                return response.status(404).json({
                    message:
                        "Content not found."
                });
            }

            const filePath =
                path.join(
                    __dirname,
                    "..",
                    "uploads",
                    content.category,
                    content.filename
                );

            if (
                fs.existsSync(filePath)
            ) {
                fs.unlinkSync(filePath);
            }

            await run(
                `
                DELETE FROM content
                WHERE id = ?
                `,
                [request.params.id]
            );

            response.json({
                message:
                    "Content deleted successfully."
            });

        } catch (error) {

            response.status(500).json({
                message:
                    "Unable to delete content."
            });
        }
    }
);


module.exports = router;