const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const { authenticateToken: authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const db = require("../database/database");
const { supabaseConfigured, uploadFileToSupabase, deleteFileFromSupabase } = require("../storage/supabaseStorage");

// ============================================================
// WEBSITE PAGE CONFIGURATION
// ============================================================

const ALLOWED_PAGES = ["home", "about", "programming"];

const PAGES_UPLOAD_DIR = path.join(
    __dirname,
    "..",
    "uploads",
    "pages"
);

const TEMP_UPLOAD_DIR = path.join(
    __dirname,
    "..",
    "uploads",
    "temporary"
);

const ALLOWED_EXTENSIONS = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".txt",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".mp4",
    ".webm",
    ".mov"
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024;

// ============================================================
// ENSURE REQUIRED DIRECTORIES EXIST
// ============================================================

fs.mkdirSync(PAGES_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

// ============================================================
// MULTER CONFIGURATION
// ============================================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, TEMP_UPLOAD_DIR);
    },

    filename: function (req, file, cb) {
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1e9) +
            path.extname(file.originalname).toLowerCase();

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: MAX_FILE_SIZE
    },

    fileFilter: function (req, file, cb) {
        const extension = path.extname(
            file.originalname
        ).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(extension)) {
            return cb(
                new Error(
                    "This file type is not allowed for Website Pages."
                )
            );
        }

        cb(null, true);
    }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function isValidPage(pageKey) {
    return ALLOWED_PAGES.includes(pageKey);
}

function hasWrittenContent(content) {
    if (typeof content !== "string") {
        return false;
    }

    const plainText = content
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();

    return plainText.length > 0;
}

function deleteFileSafely(filename) {
    if (!filename) {
        return;
    }

    const filePath = path.join(
        PAGES_UPLOAD_DIR,
        filename
    );

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error(
            "Error deleting Website Page file:",
            error.message
        );
    }
}

function moveUploadedFile(file) {
    if (!file) {
        return null;
    }

    const destinationPath = path.join(
        PAGES_UPLOAD_DIR,
        file.filename
    );

    fs.renameSync(
        file.path,
        destinationPath
    );

    return file.filename;
}

function cleanupTemporaryFile(file) {
    if (!file || !file.path) {
        return;
    }

    try {
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    } catch (error) {
        console.error(
            "Error cleaning temporary upload:",
            error.message
        );
    }
}

function formatPage(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        page_key: row.page_key,
        title: row.title,
        description: row.description,
        caption: row.caption,
        filename: row.filename,
        original_name: row.original_name,
        content: row.content,
        visibility: row.visibility,
        display_mode: row.display_mode,
        display_order: row.display_order,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,

        file_url: row.filename
            ? `/uploads/pages/${encodeURIComponent(row.filename)}`
            : null
    };
}

// ============================================================
// GET ALL WEBSITE PAGE CONTENT
// ============================================================

router.get("/", authMiddleware, (req, res) => {
    const sql = `
        SELECT
            id,
            page_key,
            title,
            description,
            caption,
            filename,
            original_name,
            content,
            visibility,
            display_mode,
            display_order,
            created_by,
            created_at,
            updated_at
        FROM website_page_content
        ORDER BY
            CASE page_key
                WHEN 'home' THEN 1
                WHEN 'about' THEN 2
                WHEN 'programming' THEN 3
                ELSE 4
            END,
            display_order ASC,
            id ASC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(
                "Error loading Website Page content:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load Website Page content."
            });
        }

        return res.json({
            success: true,
            pages: rows.map(formatPage)
        });
    });
});

// ============================================================
// GET PUBLIC WEBSITE PAGE CONTENT
// ============================================================

router.get("/public/:pageKey", (req, res) => {
    const pageKey = String(
        req.params.pageKey || ""
    ).toLowerCase();

    if (!isValidPage(pageKey)) {
        return res.status(400).json({
            success: false,
            message: "Invalid Website Page."
        });
    }

    const sql = `
        SELECT
            id,
            page_key,
            title,
            description,
            caption,
            filename,
            original_name,
            content,
            visibility,
            display_mode,
            display_order,
            created_by,
            created_at,
            updated_at
        FROM website_page_content
        WHERE page_key = ?
            AND visibility = 'public'
        ORDER BY
            display_order ASC,
            id ASC
    `;

    db.all(
        sql,
        [pageKey],
        (err, rows) => {
            if (err) {
                console.error(
                    "Error loading public Website Page content:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Failed to load Website Page content."
                });
            }

            return res.json({
                success: true,
                page_key: pageKey,
                pages: rows.map(formatPage)
            });
        }
    );
});

// ============================================================
// GET WEBSITE PAGE CONTENT BY ID
// ============================================================

router.get("/item/:id", authMiddleware, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid Website Page content ID."
        });
    }

    const sql = `
        SELECT
            id,
            page_key,
            title,
            description,
caption,
filename,
original_name,
content,
visibility,
display_mode,
display_order,
            created_by,
            created_at,
            updated_at
        FROM website_page_content
        WHERE id = ?
    `;

    db.get(
        sql,
        [id],
        (err, row) => {
            if (err) {
                console.error(
                    "Error loading Website Page item:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Failed to load Website Page item."
                });
            }

            if (!row) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Website Page content item not found."
                });
            }

            return res.json({
                success: true,
                page: formatPage(row)
            });
        }
    );
});

// ============================================================
// CREATE WEBSITE PAGE CONTENT
// ============================================================

router.post(
    "/",
    authMiddleware,
    upload.single("file"),
    (req, res) => {
        const pageKey = String(
            req.body.pageKey || ""
        ).toLowerCase();

        const title = String(
            req.body.title || ""
        ).trim();

        const description =
            typeof req.body.description === "string"
                ? req.body.description.trim()
                : "";

        const contentMode =
            String(
                req.body.contentMode || ""
            ).toLowerCase();

        const content =
            typeof req.body.content === "string"
                ? req.body.content
                : "";

        const caption =
            typeof req.body.caption === "string"
                ? req.body.caption.trim()
                : "";

        const visibility =
            String(req.body.visibility || "public").toLowerCase() === "hidden"
                ? "hidden"
                : "public";

        const displayMode =
            String(req.body.displayMode || "download").toLowerCase();

        if (!isValidPage(pageKey)) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message: "Invalid Website Page."
            });
        }

        if (!title) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message: "Page title is required."
            });
        }

        if (
            contentMode !== "file" &&
            contentMode !== "write"
        ) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message:
                    "Please select either Upload File or Write Content."
            });
        }

        if (contentMode === "file" && !req.file) {
            return res.status(400).json({
                success: false,
                message:
                    "Please select a file to upload."
            });
        }

        if (
            contentMode === "write" &&
            !hasWrittenContent(content)
        ) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message:
                    "Please enter some written content."
            });
        }

        // --------------------------------------------------------
        // Determine the next display order
        // --------------------------------------------------------

        const orderSql = `
            SELECT COALESCE(
                MAX(display_order),
                -1
            ) + 1 AS next_order
            FROM website_page_content
            WHERE page_key = ?
        `;

        db.get(
            orderSql,
            [pageKey],
            async (orderErr, orderRow) => {
                if (orderErr) {
                    cleanupTemporaryFile(req.file);

                    console.error(
                        "Error determining Website Page order:",
                        orderErr
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Failed to prepare Website Page content."
                    });
                }

                const displayOrder =
                    Number(orderRow.next_order) || 0;

                let filename = null;
                let originalName = null;
                let savedContent = null;

                try {
                    if (contentMode === "file") {
                        filename =
                            moveUploadedFile(req.file);

                        originalName =
                            req.file.originalname;
                    } else {
                        savedContent = content;
                        cleanupTemporaryFile(req.file);
                    }
                } catch (fileError) {
                    cleanupTemporaryFile(req.file);

                    console.error(
                        "Error saving Website Page file:",
                        fileError
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Failed to save the uploaded file."
                    });
                }

                if (filename && supabaseConfigured) {
                    try {
                        await uploadFileToSupabase(
                            path.join(PAGES_UPLOAD_DIR, filename),
                            "pages/" + filename,
                            req.file ? req.file.mimetype : undefined
                        );
                    } catch (storageError) {
                        console.error(
                            "Error uploading Website Page file to Supabase:",
                            storageError
                        );
                    }
                }

                const userId =
                    req.user && req.user.id
                        ? req.user.id
                        : null;

                const insertSql = `
    INSERT INTO website_page_content (
        page_key,
        title,
        description,
        caption,
        filename,
        original_name,
        content,
        visibility,
        display_mode,
        display_order,
        created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

                db.run(
                    insertSql,
                    [
    pageKey,
    title,
    description || null,
    caption || null,
    filename,
    originalName,
    savedContent,
    visibility,
    displayMode,
    displayOrder,
    userId
],
                    function (insertErr) {
                        if (insertErr) {
                            if (filename) {
                                deleteFileSafely(filename);
                            }

                            console.error(
                                "Error creating Website Page content:",
                                insertErr
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Failed to create Website Page content."
                            });
                        }

                        db.get(
                            `
                            SELECT
    id,
    page_key,
    title,
    description,
    caption,
    filename,
    original_name,
    content,
    visibility,
    display_mode,
    display_order,
    created_by,
    created_at,
    updated_at
FROM website_page_content
                            WHERE id = ?
                            `,
                            [this.lastID],
                            (selectErr, row) => {
                                if (selectErr) {
                                    console.error(
                                        "Error loading newly created Website Page item:",
                                        selectErr
                                    );

                                    return res.status(500).json({
                                        success: false,
                                        message:
                                            "Content was created, but could not be loaded."
                                    });
                                }

                                return res.status(201).json({
                                    success: true,
                                    message:
                                        "Website Page content created successfully.",
                                    page: formatPage(row)
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);

// ============================================================
// UPDATE WEBSITE PAGE CONTENT BY ID
// ============================================================

router.put(
    "/item/:id",
    authMiddleware,
    upload.single("file"),
    (req, res) => {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message:
                    "Invalid Website Page content ID."
            });
        }

        const title = String(
            req.body.title || ""
        ).trim();

        const description =
            typeof req.body.description === "string"
                ? req.body.description.trim()
                : "";
const caption =
    typeof req.body.caption === "string"
        ? req.body.caption.trim()
        : "";

const visibility =
    String(
        req.body.visibility || "public"
    ).toLowerCase() === "hidden"
        ? "hidden"
        : "public";

const displayMode =
    String(
        req.body.displayMode || "download"
    ).toLowerCase();
        const contentMode =
            String(
                req.body.contentMode || ""
            ).toLowerCase();

        const content =
            typeof req.body.content === "string"
                ? req.body.content
                : "";

        if (!title) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message: "Page title is required."
            });
        }

        if (
            contentMode !== "file" &&
            contentMode !== "write"
        ) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message:
                    "Please select either Upload File or Write Content."
            });
        }

        if (
            contentMode === "file" &&
            !req.file
        ) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message:
                    "Please select a replacement file."
            });
        }

        if (
            contentMode === "write" &&
            !hasWrittenContent(content)
        ) {
            cleanupTemporaryFile(req.file);

            return res.status(400).json({
                success: false,
                message:
                    "Please enter some written content."
            });
        }

        db.get(
            `
            SELECT
                id,
                page_key,
                title,
                description,
                caption,
                filename,
                original_name,
                content,
                visibility,
                display_mode,
                display_order,
                created_by,
                created_at,
                updated_at
            FROM website_page_content
            WHERE id = ?
            `,
            [id],
            (findErr, existingRow) => {
                if (findErr) {
                    cleanupTemporaryFile(req.file);

                    console.error(
                        "Error finding Website Page item:",
                        findErr
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Failed to find Website Page content."
                    });
                }

                if (!existingRow) {
                    cleanupTemporaryFile(req.file);

                    return res.status(404).json({
                        success: false,
                        message:
                            "Website Page content item not found."
                    });
                }

                let filename =
                    existingRow.filename;

                let originalName =
                    existingRow.original_name;

                let savedContent =
                    existingRow.content;

                try {
                    if (contentMode === "file") {
                        filename =
                            moveUploadedFile(req.file);

                        originalName =
                            req.file.originalname;

                        savedContent = null;
                    } else {
                        filename = null;
                        originalName = null;
                        savedContent = content;

                        cleanupTemporaryFile(
                            req.file
                        );
                    }
                } catch (fileError) {
                    cleanupTemporaryFile(req.file);

                    console.error(
                        "Error saving replacement Website Page file:",
                        fileError
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Failed to save the uploaded file."
                    });
                }

                const updateSql = `
                    UPDATE website_page_content
                    SET
                        title = ?,
                        description = ?,
                        caption = ?,
                        filename = ?,
                        original_name = ?,
                        content = ?,
                        visibility = ?,
                        display_mode = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `;

                db.run(
                    updateSql,
                    [
                        title,
                        description || null,
                        caption || null,
                        filename,
                        originalName,
                        savedContent,
                        visibility,
                        displayMode,
                        id
                    ],
                    function (updateErr) {
                        if (updateErr) {
                            if (
                                filename &&
                                filename !==
                                    existingRow.filename
                            ) {
                                deleteFileSafely(
                                    filename
                                );
                            }

                            console.error(
                                "Error updating Website Page content:",
                                updateErr
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Failed to update Website Page content."
                            });
                        }

                        if (
                            existingRow.filename &&
                            existingRow.filename !==
                                filename
                        ) {
                            deleteFileSafely(
                                existingRow.filename
                            );
                        }

                        db.get(
                            `
                            SELECT
                                id,
                                page_key,
                                title,
                                description,
                                caption,
                                filename,
                                original_name,
                                content,
                                visibility,
                                display_mode,
                                display_order,
                                created_by,
                                created_at,
                                updated_at
                            FROM website_page_content
                            WHERE id = ?
                            `,
                            [id],
                            (selectErr, row) => {
                                if (selectErr) {
                                    console.error(
                                        "Error loading updated Website Page item:",
                                        selectErr
                                    );

                                    return res.status(500).json({
                                        success: false,
                                        message:
                                            "Content was updated, but could not be loaded."
                                    });
                                }

                                return res.json({
                                    success: true,
                                    message:
                                        "Website Page content updated successfully.",
                                    page: formatPage(row)
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);

// ============================================================
// DELETE WEBSITE PAGE CONTENT BY ID
// ============================================================

router.delete(
    "/item/:id",
    authMiddleware,
    (req, res) => {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid Website Page content ID."
            });
        }

        db.get(
            `
            SELECT
                id,
                page_key,
                title,
                filename
            FROM website_page_content
            WHERE id = ?
            `,
            [id],
            (findErr, row) => {
                if (findErr) {
                    console.error(
                        "Error finding Website Page item for deletion:",
                        findErr
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Failed to find Website Page content."
                    });
                }

                if (!row) {
                    return res.status(404).json({
                        success: false,
                        message:
                            "Website Page content item not found."
                    });
                }

                db.run(
                    `
                    DELETE FROM website_page_content
                    WHERE id = ?
                    `,
                    [id],
                    function (deleteErr) {
                        if (deleteErr) {
                            console.error(
                                "Error deleting Website Page content:",
                                deleteErr
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Failed to delete Website Page content."
                            });
                        }

                        if (row.filename) {
                            deleteFileSafely(
                                row.filename
                            );
                        }

                        return res.json({
                            success: true,
                            message:
                                "Website Page content deleted successfully."
                        });
                    }
                );
            }
        );
    }
);

// ============================================================
// UPDATE DISPLAY ORDER
// ============================================================

router.put(
    "/item/:id/order",
    authMiddleware,
    (req, res) => {
        const id = Number(req.params.id);
        const displayOrder =
            Number(req.body.display_order);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid Website Page content ID."
            });
        }

        if (
            !Number.isInteger(displayOrder) ||
            displayOrder < 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Display order must be a non-negative integer."
            });
        }

        db.run(
            `
            UPDATE website_page_content
            SET
                display_order = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [displayOrder, id],
            function (err) {
                if (err) {
                    console.error(
                        "Error updating Website Page order:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Failed to update Website Page order."
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message:
                            "Website Page content item not found."
                    });
                }

                return res.json({
                    success: true,
                    message:
                        "Website Page order updated successfully."
                });
            }
        );
    }
);

// ============================================================
// LEGACY PAGE ENDPOINT
// ============================================================
//
// This endpoint is retained for compatibility with existing
// code that requests /api/pages/:pageKey.
//
// It now returns the first content item for the requested page.
// New multi-content frontend code should use:
//
// GET /api/pages/public/:pageKey
//
// or:
//
// GET /api/pages
//
// ============================================================

router.get(
    "/:pageKey",
    authMiddleware,
    (req, res) => {
        const pageKey = String(
            req.params.pageKey || ""
        ).toLowerCase();

        if (!isValidPage(pageKey)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Website Page."
            });
        }

        db.get(
            `
            SELECT
                id,
                page_key,
                title,
                description,
                filename,
                original_name,
                content,
                display_order,
                created_by,
                created_at,
                updated_at
            FROM website_page_content
            WHERE page_key = ?
            ORDER BY
                display_order ASC,
                id ASC
            LIMIT 1
            `,
            [pageKey],
            (err, row) => {
                if (err) {
                    console.error(
                        "Error loading Website Page:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Failed to load Website Page."
                    });
                }

                return res.json({
                    success: true,
                    page: formatPage(row)
                });
            }
        );
    }
);

// ============================================================
// MULTER / UPLOAD ERROR HANDLER
// ============================================================

router.use(
    (err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            cleanupTemporaryFile(req.file);

            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    success: false,
                    message:
                        "The uploaded file exceeds the 100 MB limit."
                });
            }

            return res.status(400).json({
                success: false,
                message:
                    err.message ||
                    "File upload failed."
            });
        }

        if (err) {
            cleanupTemporaryFile(req.file);

            console.error(
                "Website Page upload error:",
                err
            );

            return res.status(400).json({
                success: false,
                message:
                    err.message ||
                    "Website Page upload failed."
            });
        }

        next();
    }
);

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;
