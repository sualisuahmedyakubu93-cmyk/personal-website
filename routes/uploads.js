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


/*
==================================================
CONTENT CATEGORIES AND SUBCATEGORIES
==================================================
*/

const categoryStructure = {

    documents: [
        "mathematics",
        "ict",
        "education",
        "reports"
    ],

    speeches: [
        "khutbah",
        "public",
        "academic"
    ],

    presentations: [
        "mathematics",
        "ict",
        "education"
    ],

    writings: [
        "academic",
        "technology",
        "reflections"
    ]

};


const categories =
    Object.keys(
        categoryStructure
    );


/*
==================================================
CATEGORIES THAT SUPPORT TYPED CONTENT
==================================================
*/

const writableCategories = [

    "speeches",
    "presentations",
    "writings"

];


/*
==================================================
UPLOAD DIRECTORIES
==================================================
*/

const uploadsRoot =
    path.join(
        __dirname,
        "..",
        "uploads"
    );


const temporaryUploadFolder =
    path.join(
        uploadsRoot,
        "temporary"
    );


/*
==================================================
CREATE REQUIRED FOLDERS
==================================================
*/

if (
    !fs.existsSync(
        uploadsRoot
    )
) {

    fs.mkdirSync(
        uploadsRoot,
        {
            recursive: true
        }
    );

}


if (
    !fs.existsSync(
        temporaryUploadFolder
    )
) {

    fs.mkdirSync(
        temporaryUploadFolder,
        {
            recursive: true
        }
    );

}


categories.forEach(
    category => {

        const folder =
            path.join(
                uploadsRoot,
                category
            );


        if (
            !fs.existsSync(
                folder
            )
        ) {

            fs.mkdirSync(
                folder,
                {
                    recursive: true
                }
            );

        }

    }
);


/*
==================================================
ALLOWED FILE TYPES
==================================================
*/

const allowedExtensions = [

    // Documents
    ".pdf",
    ".doc",
    ".docx",
    ".txt",

    // Presentations
    ".ppt",
    ".pptx",

    // Spreadsheets
    ".xls",
    ".xlsx",

    // Images
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",

    // Videos
    ".mp4",
    ".webm",
    ".mov"

];


/*
==================================================
MULTER TEMPORARY STORAGE
==================================================

Uploaded files are first stored safely in a
temporary folder.

We do NOT depend on request.body.category
for the temporary destination.

==================================================
*/

const temporaryStorage =
    multer.diskStorage({

        destination:
            (
                request,
                file,
                callback
            ) => {

                callback(
                    null,
                    temporaryUploadFolder
                );

            },


        filename:
            (
                request,
                file,
                callback
            ) => {

                const extension =
                    path.extname(
                        file.originalname
                    )
                    .toLowerCase();


                const uniqueFilename =
                    `${Date.now()}-${Math.round(
                        Math.random() * 1000000
                    )}${extension}`;


                callback(
                    null,
                    uniqueFilename
                );

            }

    });


/*
==================================================
MULTER UPLOAD CONFIGURATION
==================================================
*/

const upload =
    multer({

        storage:
            temporaryStorage,

        limits: {

            /*
            Maximum file size:
            100 MB
            */

            fileSize:
                100 * 1024 * 1024

        },


        fileFilter:
            (
                request,
                file,
                callback
            ) => {

                const extension =
                    path.extname(
                        file.originalname
                    )
                    .toLowerCase();


                if (
                    allowedExtensions.includes(
                        extension
                    )
                ) {

                    callback(
                        null,
                        true
                    );

                } else {

                    callback(
                        new Error(
                            `Unsupported file type: ${extension || "unknown"}`
                        )
                    );

                }

            }

    });


/*
==================================================
HELPER: DELETE FILE SAFELY
==================================================
*/

function deleteFileSafely(
    filePath
) {

    try {

        if (
            filePath &&
            fs.existsSync(
                filePath
            )
        ) {

            fs.unlinkSync(
                filePath
            );

        }

    } catch (error) {

        console.error(
            "Unable to delete file:",
            error.message
        );

    }

}


/*
==================================================
HELPER: CHECK WHETHER RICH-TEXT CONTENT IS EMPTY
==================================================
*/

function hasWrittenContent(
    content
) {

    if (
        typeof content !== "string"
    ) {

        return false;

    }


    /*
    Remove HTML tags and common blank-space
    entities so that content such as:

    <p><br></p>

    is treated as empty.
    */

    const plainText =
        content

            .replace(
                /<[^>]*>/g,
                " "
            )

            .replace(
                /&nbsp;/gi,
                " "
            )

            .replace(
                /&#160;/gi,
                " "
            )

            .replace(
                /\s+/g,
                " "
            )

            .trim();


    return plainText.length > 0;

}


/*
==================================================
UPLOAD OR WRITE CONTENT
ADMINISTRATOR ONLY
==================================================
*/

router.post(
    "/",

    authenticateToken,

    requireAdmin,

    (
        request,
        response
    ) => {

        /*
        Multer is still used for file uploads.

        If no file is supplied, Multer simply
        continues and request.file remains
        undefined. This allows typed content.
        */

        upload.single(
            "file"
        )(
            request,
            response,
            async function(error) {

                /*
                ==========================================
                HANDLE MULTER ERRORS
                ==========================================
                */

                if (
                    error
                ) {

                    console.error(
                        "Multer upload error:",
                        error.message
                    );


                    if (
                        error.code ===
                        "LIMIT_FILE_SIZE"
                    ) {

                        return response
                            .status(400)
                            .json({

                                message:
                                    "The selected file is too large. Maximum allowed size is 100 MB."

                            });

                    }


                    return response
                        .status(400)
                        .json({

                            message:
                                error.message
                                ||
                                "Unable to process the uploaded file."

                        });

                }


                /*
                ==========================================
                READ FORM DATA
                ==========================================
                */

                const {
                    title,
                    description,
                    category,
                    subcategory,
                    contentMode,
                    content
                } = request.body;


                /*
                ==========================================
                DETERMINE CONTENT MODE
                ==========================================
                */

                const mode =
                    contentMode === "write"
                        ? "write"
                        : "file";


                /*
                ==========================================
                VALIDATE TITLE
                ==========================================
                */

                if (
                    !title ||
                    !title.trim()
                ) {

                    if (
                        request.file
                    ) {

                        deleteFileSafely(
                            request.file.path
                        );

                    }


                    return response
                        .status(400)
                        .json({

                            message:
                                "Please enter a title."

                        });

                }


                /*
                ==========================================
                VALIDATE CATEGORY
                ==========================================
                */

                if (
                    !categories.includes(
                        category
                    )
                ) {

                    if (
                        request.file
                    ) {

                        deleteFileSafely(
                            request.file.path
                        );

                    }


                    return response
                        .status(400)
                        .json({

                            message:
                                "Invalid category."

                        });

                }


                /*
                ==========================================
                VALIDATE SUBCATEGORY
                ==========================================
                */

                if (
                    !subcategory ||
                    !categoryStructure[
                        category
                    ].includes(
                        subcategory
                    )
                ) {

                    if (
                        request.file
                    ) {

                        deleteFileSafely(
                            request.file.path
                        );

                    }


                    return response
                        .status(400)
                        .json({

                            message:
                                "Invalid subcategory for the selected category."

                        });

                }


                /*
                ==========================================
                DOCUMENTS MUST USE FILE UPLOAD
                ==========================================
                */

                if (
                    category === "documents" &&
                    mode === "write"
                ) {

                    return response
                        .status(400)
                        .json({

                            message:
                                "Documents must be uploaded as files."

                        });

                }


                /*
                ==========================================
                TYPED CONTENT IS ONLY ALLOWED FOR:
                SPEECHES
                PRESENTATIONS
                WRITINGS
                ==========================================
                */

                if (
                    mode === "write" &&
                    !writableCategories.includes(
                        category
                    )
                ) {

                    return response
                        .status(400)
                        .json({

                            message:
                                "Typed content is not available for the selected category."

                        });

                }


                /*
                ==========================================
                FILE MODE
                ==========================================
                */

                if (
                    mode === "file"
                ) {

                    /*
                    A file is required when the
                    administrator chooses file upload.
                    */

                    if (
                        !request.file
                    ) {

                        return response
                            .status(400)
                            .json({

                                message:
                                    "Please select a file."

                            });

                    }


                    const temporaryFilePath =
                        request.file.path;


                    try {

                        /*
                        ==========================================
                        DETERMINE FINAL DESTINATION
                        ==========================================
                        */

                        const finalCategoryFolder =
                            path.join(
                                uploadsRoot,
                                category
                            );


                        /*
                        ==========================================
                        MAKE SURE FINAL FOLDER EXISTS
                        ==========================================
                        */

                        if (
                            !fs.existsSync(
                                finalCategoryFolder
                            )
                        ) {

                            fs.mkdirSync(
                                finalCategoryFolder,
                                {
                                    recursive: true
                                }
                            );

                        }


                        /*
                        ==========================================
                        FINAL FILE PATH
                        ==========================================
                        */

                        const finalFilePath =
                            path.join(
                                finalCategoryFolder,
                                request.file.filename
                            );


                        /*
                        ==========================================
                        MOVE FILE FROM TEMPORARY FOLDER
                        TO FINAL CATEGORY FOLDER
                        ==========================================
                        */

                        fs.renameSync(
                            temporaryFilePath,
                            finalFilePath
                        );


                        /*
                        ==========================================
                        SAVE FILE INFORMATION TO DATABASE
                        ==========================================
                        */

                        await run(

                            `
                            INSERT INTO content (
                                title,
                                description,
                                category,
                                subcategory,
                                filename,
                                original_name,
                                content,
                                uploaded_by
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `,

                            [

                                title.trim(),

                                description
                                    ?
                                    description.trim()
                                    :
                                    "",

                                category,

                                subcategory,

                                request.file.filename,

                                request.file.originalname,

                                null,

                                request.user.id

                            ]

                        );


                        /*
                        ==========================================
                        SUCCESS
                        ==========================================
                        */

                        return response
                            .status(201)
                            .json({

                                message:
                                    "Content uploaded successfully."

                            });


                    } catch (error) {

                        /*
                        ==========================================
                        REMOVE TEMPORARY FILE
                        ==========================================
                        */

                        deleteFileSafely(
                            temporaryFilePath
                        );


                        /*
                        ==========================================
                        REMOVE FINAL FILE IF IT WAS MOVED
                        ==========================================
                        */

                        const possibleFinalPath =
                            path.join(
                                uploadsRoot,
                                category,
                                request.file.filename
                            );


                        deleteFileSafely(
                            possibleFinalPath
                        );


                        console.error(
                            "File upload error:",
                            error
                        );


                        return response
                            .status(500)
                            .json({

                                message:
                                    "Upload failed: " +
                                    (
                                        error.message
                                        ||
                                        "Unknown error."
                                    )

                            });

                    }

                }


                /*
                ==========================================
                WRITE MODE
                ==========================================
                */

                if (
                    mode === "write"
                ) {

                    /*
                    A typed article/speech/presentation
                    must actually contain text.
                    */

                    if (
                        !hasWrittenContent(
                            content
                        )
                    ) {

                        return response
                            .status(400)
                            .json({

                                message:
                                    "Please write some content before publishing."

                            });

                    }


                    try {

                        /*
                        ==========================================
                        SAVE TYPED RICH-TEXT CONTENT
                        ==========================================
                        */

                        await run(

                            `
                            INSERT INTO content (
                                title,
                                description,
                                category,
                                subcategory,
                                filename,
                                original_name,
                                content,
                                uploaded_by
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `,

                            [

                                title.trim(),

                                description
                                    ?
                                    description.trim()
                                    :
                                    "",

                                category,

                                subcategory,

                                null,

                                null,

                                content,

                                request.user.id

                            ]

                        );


                        /*
                        ==========================================
                        SUCCESS
                        ==========================================
                        */

                        return response
                            .status(201)
                            .json({

                                message:
                                    "Written content published successfully."

                            });


                    } catch (error) {

                        console.error(
                            "Written content error:",
                            error
                        );


                        return response
                            .status(500)
                            .json({

                                message:
                                    "Unable to save written content: " +
                                    (
                                        error.message
                                        ||
                                        "Unknown error."
                                    )

                            });

                    }

                }

            }
        );

    }
);


/*
==================================================
DELETE CONTENT
ADMINISTRATOR ONLY
==================================================
*/

router.delete(
    "/:id",

    authenticateToken,

    requireAdmin,

    async (
        request,
        response
    ) => {

        try {

            const content =
                await get(

                    `
                    SELECT *
                    FROM content
                    WHERE id = ?
                    `,

                    [
                        request.params.id
                    ]

                );


            /*
            ==========================================
            CONTENT NOT FOUND
            ==========================================
            */

            if (
                !content
            ) {

                return response
                    .status(404)
                    .json({

                        message:
                            "Content not found."

                    });

            }


            /*
            ==========================================
            DELETE PHYSICAL FILE
            ==========================================
            
            Typed content has no physical file.

            Therefore, only attempt to delete a
            physical file when filename exists.
            */

            if (
                content.filename
            ) {

                const filePath =
                    path.join(

                        uploadsRoot,

                        content.category,

                        content.filename

                    );


                deleteFileSafely(
                    filePath
                );

            }


            /*
            ==========================================
            DELETE DATABASE RECORD
            ==========================================
            */

            await run(

                `
                DELETE FROM content
                WHERE id = ?
                `,

                [
                    request.params.id
                ]

            );


            /*
            ==========================================
            SUCCESS
            ==========================================
            */

            return response
                .json({

                    message:
                        "Content deleted successfully."

                });


        } catch (error) {

            console.error(
                "Delete error:",
                error.message
            );


            return response
                .status(500)
                .json({

                    message:
                        "Unable to delete content."

                });

        }

    }
);


/*
==================================================
UPLOAD ERROR SAFETY NET
==================================================
*/

router.use(
    (
        error,
        request,
        response,
        next
    ) => {

        console.error(
            "Upload route error:",
            error
        );


        if (
            response.headersSent
        ) {

            return next(
                error
            );

        }


        return response
            .status(500)
            .json({

                message:
                    "An unexpected upload error occurred."

            });

    }
);


/*
==================================================
EXPORT ROUTER
==================================================
*/

module.exports =
    router;