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
    caption,
    category,
    subcategory,
    contentMode,
    content,
    visibility,
    displayMode
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
DETERMINE VISIBILITY
==========================================

Existing/current upload forms that do not
send a visibility value remain public.
*/

const contentVisibility =
    visibility === "hidden"
        ? "hidden"
        : "public";


/*
==========================================
DETERMINE DISPLAY MODE
==========================================

The administrator may later choose how an
image or video is displayed.

For existing uploads, automatically choose
the natural display mode.
*/

let contentDisplayMode =
    displayMode
        ? String(displayMode).trim().toLowerCase()
        : "";


if (!contentDisplayMode) {

    if (mode === "write") {

        contentDisplayMode = "read";

    } else if (request.file) {

        const extension =
            path.extname(
                request.file.originalname
            ).toLowerCase();

        const imageExtensions = [
            ".jpg",
            ".jpeg",
            ".png",
            ".gif",
            ".webp"
        ];

        const videoExtensions = [
            ".mp4",
            ".webm",
            ".mov"
        ];

        if (
            imageExtensions.includes(
                extension
            )
        ) {

            contentDisplayMode = "image";

        } else if (
            videoExtensions.includes(
                extension
            )
        ) {

            contentDisplayMode = "video";

        } else {

            contentDisplayMode = "download";

        }

    } else {

        contentDisplayMode = "read";

    }

}


/*
==========================================
VALIDATE DISPLAY MODE
==========================================
*/

const allowedDisplayModes = [
    "image",
    "video",
    "audio",
    "download",
    "read"
];


if (
    !allowedDisplayModes.includes(
        contentDisplayMode
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
                "Invalid display mode."

        });

}


/*
==========================================
VALIDATE DISPLAY MODE AGAINST CONTENT TYPE
==========================================
*/

if (
    mode === "write" &&
    contentDisplayMode !== "read"
) {

    return response
        .status(400)
        .json({

            message:
                "Written content can only use the read display mode."

        });

}


if (
    mode === "file" &&
    request.file
) {

    const extension =
        path.extname(
            request.file.originalname
        ).toLowerCase();

    const imageExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp"
    ];

    const videoExtensions = [
    ".mp4",
    ".webm",
    ".mov"
];

const audioExtensions = [
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".aac",
    ".flac"
];

    const isImage =
        imageExtensions.includes(
            extension
        );

    const isVideo =
        videoExtensions.includes(
            extension
        );

    const isAudio =
        audioExtensions.includes(
            extension
        );

    if (
        isImage &&
        ![
            "image",
            "download"
        ].includes(
            contentDisplayMode
        )
    ) {

        deleteFileSafely(
            request.file.path
        );

        return response
            .status(400)
            .json({

                message:
                    "Images can only use image or download display mode."

            });

    }

    if (
        isVideo &&
        ![
            "video",
            "download"
        ].includes(
            contentDisplayMode
        )
    ) {

        deleteFileSafely(
            request.file.path
        );

        return response
            .status(400)
            .json({

                message:
                    "Videos can only use video or download display mode."

            });

    }

    if (
        !isImage &&
        !isVideo &&
        contentDisplayMode !== "download"
    ) {

        deleteFileSafely(
            request.file.path
        );

        return response
            .status(400)
            .json({

                message:
                    "This file can only use download display mode."

            });

    }

}


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
    caption,
    category,
    subcategory,
    filename,
    original_name,
    content,
    visibility,
    display_mode,
    uploaded_by
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `,

                            [

                                title.trim(),

description
    ?
    description.trim()
    :
    "",

caption
    ?
    caption.trim()
    :
    "",

category,

subcategory,

request.file.filename,

request.file.originalname,

null,

contentVisibility,

contentDisplayMode,

request.user.id

                            ]

                        );

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
    visibility,
    display_mode,
    uploaded_by
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

contentVisibility,

contentDisplayMode,

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
UPDATE DISPLAY CONTROLS
ADMINISTRATOR ONLY
==================================================
*/

router.put(
    "/:id/display-controls",

    authenticateToken,

    requireAdmin,

    async (
        request,
        response
    ) => {

        try {

            const {
                visibility,
                displayMode
            } = request.body;


            /*
            ==========================================
            VALIDATE VISIBILITY
            ==========================================
            */

            const allowedVisibility = [
                "public",
                "hidden"
            ];


            if (
                !allowedVisibility.includes(
                    visibility
                )
            ) {

                return response
                    .status(400)
                    .json({

                        message:
                            "Invalid visibility setting."

                    });

            }


            /*
            ==========================================
            VALIDATE DISPLAY MODE
            ==========================================
            */

            const allowedDisplayModes = [
                "image",
                "video",
                "download",
                "read"
            ];


            if (
                !allowedDisplayModes.includes(
                    displayMode
                )
            ) {

                return response
                    .status(400)
                    .json({

                        message:
                            "Invalid display mode."

                    });

            }


            /*
            ==========================================
            GET EXISTING CONTENT
            ==========================================
            */

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
            VALIDATE DISPLAY MODE AGAINST CONTENT
            ==========================================
            */

            const hasFile =
                Boolean(
                    content.filename
                );


            const hasWrittenContent =
                !hasFile &&
                content.content &&
                String(
                    content.content
                ).trim() !== "";


            if (
                hasWrittenContent &&
                displayMode !== "read"
            ) {

                return response
                    .status(400)
                    .json({

                        message:
                            "Written content can only use the read display mode."

                    });

            }


            if (
                hasFile
            ) {

                const extension =
                    path.extname(
                        content.original_name ||
                        content.filename
                    )
                    .toLowerCase();


                const imageExtensions = [
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".gif",
                    ".webp"
                ];


                const videoExtensions = [
    ".mp4",
    ".webm",
    ".mov"
];

const audioExtensions = [
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".aac",
    ".flac"
];


const isImage =
    imageExtensions.includes(
        extension
    );


const isVideo =
    videoExtensions.includes(
        extension
    );


const isAudio =
    audioExtensions.includes(
        extension
    );


if (
    isImage &&
    ![
        "image",
        "download"
    ].includes(
        displayMode
    )
) {

    return response
        .status(400)
        .json({

            message:
                "Images can only use image or download display mode."

        });

}


if (
    isVideo &&
    ![
        "video",
        "download"
    ].includes(
        displayMode
    )
) {

    return response
        .status(400)
        .json({

            message:
                "Videos can only use video or download display mode."

        });

}


if (
    isAudio &&
    ![
        "audio",
        "download"
    ].includes(
        displayMode
    )
) {

    return response
        .status(400)
        .json({

            message:
                "Audio files can only use audio or download display mode."

        });

}



            }


            /*
            ==========================================
            UPDATE DISPLAY CONTROLS
            ==========================================
            */

            await run(

                `
                UPDATE content
                SET
                    visibility = ?,
                    display_mode = ?
                WHERE id = ?
                `,

                [
                    visibility,
                    displayMode,
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
                        "Display controls updated successfully."

                });


        } catch (error) {

            console.error(
                "Display controls update error:",
                error.message
            );


            return response
                .status(500)
                .json({

                    message:
                        "Unable to update display controls."

                });

        }

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
