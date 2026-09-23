document.addEventListener("DOMContentLoaded", () => {

    /*
    ==========================================
    CONTENT CATEGORY NAMES
    ==========================================
    */

    const names = {

        // DOCUMENTS
        "documents-mathematics":
            "Mathematics Documents",

        "documents-ict":
            "ICT Documents",

        "documents-education":
            "Education Documents",

        "documents-reports":
            "Academic Reports",


        // SPEECHES
        "speeches-khutbah":
            "Friday Khutbahs",

        "speeches-public":
            "Public Speeches",

        "speeches-academic":
            "Academic Speeches",


        // PRESENTATIONS
        "presentations-mathematics":
            "Mathematics Presentations",

        "presentations-ict":
            "ICT Presentations",

        "presentations-education":
            "Education Presentations",


        // WRITINGS
        "writings-academic":
            "Academic Writings",

        "writings-technology":
            "Technology & Programming",

        "writings-reflections":
            "Personal Reflections"

    };


    /*
    ==========================================
    CATEGORY DESCRIPTIONS
    ==========================================
    */

    const descriptions = {

        // DOCUMENTS
        "documents-mathematics":
            "Browse available Mathematics documents and learning materials.",

        "documents-ict":
            "Browse available ICT documents and learning materials.",

        "documents-education":
            "Browse available Education documents and learning materials.",

        "documents-reports":
            "Browse available academic reports and related documents.",


        // SPEECHES
        "speeches-khutbah":
            "Browse available Friday Khutbahs and Islamic reminders.",

        "speeches-public":
            "Browse available public speeches and addresses.",

        "speeches-academic":
            "Browse available academic speeches and presentations.",


        // PRESENTATIONS
        "presentations-mathematics":
            "Browse available Mathematics presentations and educational materials.",

        "presentations-ict":
            "Browse available ICT presentations and educational materials.",

        "presentations-education":
            "Browse available Education presentations and educational materials.",


        // WRITINGS
        "writings-academic":
            "Browse available academic writings and educational articles.",

        "writings-technology":
            "Browse writings about technology, programming, and software development.",

        "writings-reflections":
            "Browse personal reflections, thoughts, and experiences."

    };


    /*
    ==========================================
    GET PAGE ELEMENTS
    ==========================================
    */

    const contentGrid =
        document.getElementById("contentGrid");

    const contentTitle =
        document.getElementById("contentTitle");

    const contentCategory =
        document.getElementById("contentCategory");

    const contentDescription =
        document.getElementById("contentDescription");


    /*
    ==========================================
    GET URL PARAMETERS
    ==========================================
    */

    const parameters =
        new URLSearchParams(
            window.location.search
        );


    const category =
        parameters.get("category");

    const subcategory =
        parameters.get("subcategory");


    /*
    ==========================================
    VALIDATE PARAMETERS
    ==========================================
    */

    if (
        !category ||
        !subcategory
    ) {

        showError(
            "Invalid content category."
        );

        return;
    }


    const key =
        `${category}-${subcategory}`;


    if (
        !names[key]
    ) {

        showError(
            "The requested content category could not be found."
        );

        return;
    }


    /*
    ==========================================
    DISPLAY PAGE INFORMATION
    ==========================================
    */

    if (contentTitle) {

        contentTitle.textContent =
            names[key];

    }


    if (contentCategory) {

        contentCategory.textContent =
            getMainCategoryName(category);

    }


    if (contentDescription) {

        contentDescription.textContent =
            descriptions[key] ||
            `Browse available content in ${names[key]}.`;

    }


    /*
    ==========================================
    LOAD CONTENT
    ==========================================
    */

    loadContent(
        category,
        subcategory
    );


    /*
    ==========================================
    LOAD CONTENT FUNCTION
    ==========================================
    */

    async function loadContent(
        category,
        subcategory
    ) {

        if (!contentGrid) {
            return;
        }


        contentGrid.innerHTML = `
            <div class="loading">
                Loading content...
            </div>
        `;


        try {

            const response =
                await fetch(
                    `/api/content/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`
                );


            if (!response.ok) {

                throw new Error(
                    `Server returned ${response.status}`
                );

            }


            const data =
                await response.json();


            /*
            ==========================================
            NO CONTENT
            ==========================================
            */

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {

                contentGrid.innerHTML = `
                    <div class="empty-state">

                        <h3>
                            No Content Available
                        </h3>

                        <p>
                            No content has been published
                            in this category yet.
                        </p>

                    </div>
                `;

                return;
            }


            /*
            ==========================================
            DISPLAY CONTENT
            ==========================================
            */

            contentGrid.innerHTML =
                data
                    .filter(
                        item =>
                            !isHidden(item)
                    )
                    .map(
                        item =>
                            createContentCard(item)
                    )
                    .join("");


            /*
            ==========================================
            CHECK IF EVERYTHING IS HIDDEN
            ==========================================
            */

            if (
                contentGrid.innerHTML.trim() === ""
            ) {

                contentGrid.innerHTML = `
                    <div class="empty-state">

                        <h3>
                            No Content Available
                        </h3>

                        <p>
                            No content is currently available
                            for public viewing.
                        </p>

                    </div>
                `;

                return;
            }


            /*
            ==========================================
            ATTACH READ BUTTON EVENTS
            ==========================================
            */

            attachReadContentEvents();


        } catch (error) {

            console.error(
                "Error loading content:",
                error
            );


            contentGrid.innerHTML = `
                <div class="error-state">

                    <h3>
                        Unable to Load Content
                    </h3>

                    <p>
                        We could not load the content
                        in this category.
                    </p>

                    <p>
                        Please try again later.
                    </p>

                </div>
            `;

        }

    }


    /*
    ==========================================
    DETERMINE VISIBILITY
    ==========================================
    */

    function isHidden(item) {

        const visibility =
            String(
                item.visibility ||
                ""
            )
            .trim()
            .toLowerCase();


        const displayMode =
            String(
                item.display_mode ||
                ""
            )
            .trim()
            .toLowerCase();


        return (
            visibility === "hidden" ||
            displayMode === "hidden"
        );

    }


    /*
    ==========================================
    DETERMINE DISPLAY MODE
    ==========================================
    */

    function getDisplayMode(item) {

        const mode =
            String(
                item.display_mode ||
                ""
            )
            .trim()
            .toLowerCase();


        /*
        ======================================
        WRITTEN CONTENT
        ======================================
        */

        if (
            !item.filename &&
            item.content &&
            String(item.content).trim() !== ""
        ) {

            return (
                mode === "hidden"
                    ? "hidden"
                    : "read"
            );

        }


        /*
        ======================================
        FILE CONTENT
        ======================================
        */

        if (
            mode
        ) {

            return mode;

        }


        /*
        ======================================
        BACKWARD COMPATIBILITY
        ======================================
        */

        return "downloadable";

    }


    /*
    ==========================================
    DETERMINE FILE TYPE
    ==========================================
    */

    function getFileType(item) {

        const mimeType =
            String(
                item.mime_type ||
                item.mimetype ||
                item.mimeType ||
                ""
            )
            .trim()
            .toLowerCase();


        const filename =
            String(
                item.filename ||
                item.original_name ||
                item.originalName ||
                ""
            )
            .trim()
            .toLowerCase();


        if (
            mimeType.startsWith("image/")
        ) {

            return "image";

        }


        if (
            mimeType.startsWith("video/")
        ) {

            return "video";

        }


        if (
            /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(
                filename
            )
        ) {

            return "image";

        }


        if (
            /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(
                filename
            )
        ) {

            return "video";

        }


        return "file";

    }


    /*
    ==========================================
    CREATE CONTENT CARD
    ==========================================
    */

    function createContentCard(item) {

        const title =
            escapeHtml(
                item.title ||
                "Untitled Content"
            );


        const description =
            escapeHtml(
                item.description ||
                "No description available."
            );


        /*
        ======================================
        DETERMINE CONTENT TYPE
        ======================================
        */

        const isWrittenContent =
            !item.filename &&
            item.content &&
            String(item.content).trim() !== "";


        const displayMode =
            getDisplayMode(item);


        /*
        ======================================
        WRITTEN CONTENT CARD
        ======================================
        */

        if (
            isWrittenContent
        ) {

            if (
                displayMode === "hidden"
            ) {

                return "";

            }


            const preview =
                createWrittenPreview(
                    item.content
                );


            return `
                <article class="card content-card written-content-card">

                    <div class="card-icon">
                        📝
                    </div>

                    <h3>
                        ${title}
                    </h3>

                    <p>
                        ${description}
                    </p>

                    <div class="written-content-preview">
                        ${preview}
                    </div>

                    <div class="content-actions">

                        <button
                            type="button"
                            class="btn read-content-btn"
                            data-content-id="${escapeAttribute(
                                item.id
                            )}"
                        >
                            Read Full Content
                        </button>

                    </div>

                    <div
                        class="full-written-content"
                        id="written-content-${escapeAttribute(
                            item.id
                        )}"
                        hidden
                    >

                        <div class="written-content-body">

                            ${sanitizeWrittenContent(
                                item.content
                            )}

                        </div>

                        <div class="content-actions">

                            <button
                                type="button"
                                class="btn close-content-btn"
                                data-content-id="${escapeAttribute(
                                    item.id
                                )}"
                            >
                                Close Content
                            </button>

                        </div>

                    </div>

                </article>
            `;

        }


        /*
        ======================================
        FILE CONTENT
        ======================================
        */

        const originalName =
            escapeHtml(
                item.original_name ||
                item.filename ||
                "File"
            );


        const fileUrl =
            item.file_url ||
            "#";


        const fileType =
            getFileType(item);


        /*
        ======================================
        IMAGE — SHOW AS IMAGE
        ======================================
        */

        if (
            fileType === "image" &&
            displayMode === "image"
        ) {

            return `
                <article class="card content-card">

                    <div class="card-icon">
                        🖼️
                    </div>

                    <h3>
                        ${title}
                    </h3>

                    <p>
                        ${description}
                    </p>

                    <div class="content-media">

                        <img
                            src="${escapeAttribute(fileUrl)}"
                            alt="${title}"
                            loading="lazy"
                            style="max-width:100%;height:auto;display:block;"
                        >

                    </div>

                    <p class="file-name">

                        <strong>
                            File:
                        </strong>

                        ${originalName}

                    </p>

                </article>
            `;

        }


        /*
        ======================================
        VIDEO — PLAYABLE VIDEO
        ======================================
        */

        if (
            fileType === "video" &&
            displayMode === "video"
        ) {

            return `
                <article class="card content-card">

                    <div class="card-icon">
                        🎬
                    </div>

                    <h3>
                        ${title}
                    </h3>

                    <p>
                        ${description}
                    </p>

                    <div class="content-media">

                        <video
                            controls
                            preload="metadata"
                            style="width:100%;max-width:100%;height:auto;"
                        >

                            <source
                                src="${escapeAttribute(fileUrl)}"
                            >

                            Your browser does not support
                            video playback.

                        </video>

                    </div>

                    <p class="file-name">

                        <strong>
                            File:
                        </strong>

                        ${originalName}

                    </p>

                </article>
            `;

        }


        /*
        ======================================
        DOWNLOADABLE FILE
        ======================================
        */

        return `
            <article class="card content-card">

                <div class="card-icon">
                    📄
                </div>

                <h3>
                    ${title}
                </h3>

                <p>
                    ${description}
                </p>

                <p class="file-name">

                    <strong>
                        File:
                    </strong>

                    ${originalName}

                </p>

                <div class="content-actions">

                    <a
                        href="${escapeAttribute(fileUrl)}"
                        download
                        class="btn"
                    >
                        Download File
                    </a>

                </div>

            </article>
        `;

    }


    /*
    ==========================================
    CREATE WRITTEN CONTENT PREVIEW
    ==========================================
    */

    function createWrittenPreview(
        content
    ) {

        const sanitized =
            sanitizeWrittenContent(
                content
            );


        const temporaryContainer =
            document.createElement(
                "div"
            );


        temporaryContainer.innerHTML =
            sanitized;


        const text =
            temporaryContainer
                .textContent
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();


        if (!text) {

            return `
                <p>
                    Written content is available.
                </p>
            `;

        }


        const previewText =
            text.length > 280
                ? `${text.substring(0, 280)}...`
                : text;


        return `
            <p>
                ${escapeHtml(
                    previewText
                )}
            </p>
        `;

    }


    /*
    ==========================================
    ATTACH WRITTEN CONTENT EVENTS
    ==========================================
    */

    function attachReadContentEvents() {

        const readButtons =
            document.querySelectorAll(
                ".read-content-btn"
            );


        readButtons.forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const id =
                            button.dataset.contentId;


                        const contentElement =
                            document.getElementById(
                                `written-content-${id}`
                            );


                        if (!contentElement) {
                            return;
                        }


                        contentElement.hidden =
                            false;


                        const actions =
                            button.closest(
                                ".content-actions"
                            );


                        if (actions) {

                            actions.style.display =
                                "none";

                        }


                        contentElement.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest"
                        });

                    }
                );

            }
        );


        const closeButtons =
            document.querySelectorAll(
                ".close-content-btn"
            );


        closeButtons.forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const id =
                            button.dataset.contentId;


                        const contentElement =
                            document.getElementById(
                                `written-content-${id}`
                            );


                        if (!contentElement) {
                            return;
                        }


                        contentElement.hidden =
                            true;


                        const card =
                            button.closest(
                                ".written-content-card"
                            );


                        if (!card) {
                            return;
                        }


                        const readButton =
                            card.querySelector(
                                ".read-content-btn"
                            );


                        if (
                            readButton &&
                            readButton.closest(
                                ".content-actions"
                            )
                        ) {

                            readButton.closest(
                                ".content-actions"
                            ).style.display =
                                "";

                        }

                    }
                );

            }
        );

    }


    /*
    ==========================================
    SANITIZE WRITTEN CONTENT
    ==========================================
    */

    function sanitizeWrittenContent(
        html
    ) {

        const template =
            document.createElement(
                "template"
            );


        template.innerHTML =
            String(
                html || ""
            );


        const forbiddenElements =
            template.content.querySelectorAll(
                "script, iframe, object, embed, form, input, button, textarea, select, style, link, meta"
            );


        forbiddenElements.forEach(
            element => {
                element.remove();
            }
        );


        const elements =
            template.content.querySelectorAll(
                "*"
            );


        elements.forEach(
            element => {

                Array.from(
                    element.attributes
                ).forEach(
                    attribute => {

                        const name =
                            attribute.name.toLowerCase();

                        const value =
                            attribute.value;


                        /*
                        ==============================
                        REMOVE EVENT HANDLERS
                        ==============================
                        */

                        if (
                            name.startsWith(
                                "on"
                            )
                        ) {

                            element.removeAttribute(
                                attribute.name
                            );

                            return;
                        }


                        /*
                        ==============================
                        REMOVE UNSAFE URLS
                        ==============================
                        */

                        if (
                            (
                                name === "href" ||
                                name === "src"
                            ) &&
                            /^(javascript|data|vbscript):/i.test(
                                value.trim()
                            )
                        ) {

                            element.removeAttribute(
                                attribute.name
                            );

                        }

                    }
                );

            }
        );


        return (
            template.innerHTML
        );

    }


    /*
    ==========================================
    MAIN CATEGORY DISPLAY NAME
    ==========================================
    */

    function getMainCategoryName(
        category
    ) {

        const categoryNames = {

            documents:
                "Documents",

            speeches:
                "Speeches",

            presentations:
                "Presentations",

            writings:
                "Writings"

        };


        return (
            categoryNames[category] ||
            category
        );

    }


    /*
    ==========================================
    ERROR DISPLAY
    ==========================================
    */

    function showError(
        message
    ) {

        if (contentGrid) {

            contentGrid.innerHTML = `
                <div class="error-state">

                    <h3>
                        Content Not Found
                    </h3>

                    <p>
                        ${escapeHtml(
                            message
                        )}
                    </p>

                </div>
            `;

        }

    }


    /*
    ==========================================
    ESCAPE HTML
    ==========================================
    */

    function escapeHtml(
        value
    ) {

        const element =
            document.createElement(
                "div"
            );


        element.textContent =
            String(
                value
            );


        return element.innerHTML;

    }


    /*
    ==========================================
    ESCAPE ATTRIBUTE
    ==========================================
    */

    function escapeAttribute(
        value
    ) {

        return escapeHtml(
            value
        );

    }

});