/*
==========================================
AUTOMATIC YEAR
==========================================
*/

const currentYearElement =
    document.getElementById(
        "currentYear"
    );


if (
    currentYearElement
) {

    currentYearElement.textContent =
        new Date().getFullYear();

}


/*
==========================================
NAVIGATION MENU
==========================================
*/

const menuToggle =
    document.getElementById(
        "menuToggle"
    );


const navbar =
    document.getElementById(
        "navbar"
    );


if (
    menuToggle &&
    navbar
) {

    menuToggle.addEventListener(
        "click",

        () => {

            navbar.classList.toggle(
                "show"
            );

        }
    );


    const navigationLinks =
        navbar.querySelectorAll(
            "a"
        );


    navigationLinks.forEach(
        link => {

            link.addEventListener(
                "click",

                () => {

                    navbar.classList.remove(
                        "show"
                    );

                }
            );

        }
    );

}


/*
==========================================
LOGOUT
==========================================
*/

function logout() {

    localStorage.removeItem(
        "userToken"
    );

    localStorage.removeItem(
        "username"
    );

    localStorage.removeItem(
        "userRole"
    );


    sessionStorage.removeItem(
        "userToken"
    );

    sessionStorage.removeItem(
        "username"
    );

    sessionStorage.removeItem(
        "userRole"
    );


    window.location.href =
        "login.html";

}


/*
==========================================
PUBLIC WEBSITE PAGE — HOME
==========================================
*/

async function loadManagedHomeContent() {

    const managedHomeSection =
        document.getElementById(
            "managedHomeContent"
        );

    const managedHomeTitle =
        document.getElementById(
            "managedHomeTitle"
        );

    const managedHomeBody =
        document.getElementById(
            "managedHomeBody"
        );


    if (
        !managedHomeSection ||
        !managedHomeTitle ||
        !managedHomeBody
    ) {
        return;
    }


    try {

        const response =
            await fetch(
                "/api/pages/public/home",
                {
                    method: "GET",
                    credentials: "same-origin"
                }
            );


        if (!response.ok) {

            managedHomeSection.hidden =
                true;

            return;

        }


        const data =
            await response.json();


        if (
            !data.success ||
            !data.page
        ) {

            managedHomeSection.hidden =
                true;

            return;

        }


        const page =
            data.page;


        managedHomeTitle.textContent =
            page.title ||
            "Home";


        /*
        ------------------------------------------
        WRITTEN CONTENT
        ------------------------------------------
        */

        if (
            page.content &&
            page.content.trim()
        ) {

            managedHomeBody.innerHTML =
                page.content;

            managedHomeSection.hidden =
                false;

            return;

        }


        /*
        ------------------------------------------
        UPLOADED FILE
        ------------------------------------------
        */

        if (
            page.file_url &&
            page.original_name
        ) {

            const displayMode = String(page.display_mode || 'download').trim().toLowerCase();
            const fileName = String(page.filename || page.original_name || '').trim().toLowerCase();

            managedHomeBody.innerHTML = '';

            if (displayMode === 'image' && /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(fileName)) {
                const image = document.createElement('img');
                image.src = page.file_url;
                image.alt = page.caption || page.title || page.original_name;
                image.loading = 'lazy';
                image.style.maxWidth = '100%';
                image.style.height = 'auto';
                image.style.display = 'block';
                managedHomeBody.appendChild(image);
                managedHomeSection.hidden = false;
                return;
            }

            if (displayMode === 'video' && /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(fileName)) {
                const video = document.createElement('video');
                video.src = page.file_url;
                video.controls = true;
                video.preload = 'metadata';
                video.style.maxWidth = '100%';
                video.style.height = 'auto';
                video.style.display = 'block';
                managedHomeBody.appendChild(video);
                managedHomeSection.hidden = false;
                return;
            }

            if (displayMode === 'audio' && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(fileName)) {
                const audio = document.createElement('audio');
                audio.src = page.file_url;
                audio.controls = true;
                audio.preload = 'metadata';
                audio.style.width = '100%';
                audio.style.display = 'block';

                managedHomeBody.appendChild(audio);
                managedHomeSection.hidden = false;
                return;
            }
            const fileLink = document.createElement('a');
            fileLink.href = page.file_url;
            fileLink.target = '_blank';
            fileLink.rel = 'noopener noreferrer';
            fileLink.textContent = 'Open ' + page.original_name;
            managedHomeBody.appendChild(fileLink);
            managedHomeSection.hidden = false;
            return;
        }

        /*
        ------------------------------------------
        NO CONTENT
        ------------------------------------------
        */

        managedHomeSection.hidden =
            true;

    }
    catch (error) {

        console.error(
            "Error loading managed Home content:",
            error
        );

        managedHomeSection.hidden =
            true;

    }

}


/*
==========================================
LOAD MANAGED HOME CONTENT
==========================================
*/

/* Obsolete Home renderer disabled. index.html now owns public Home rendering. */


/*
==========================================
CONTACT FORM
==========================================
*/

document.addEventListener(
    "DOMContentLoaded",

    () => {

        const contactForm =
            document.getElementById(
                "contactForm"
            );

        const formMessage =
            document.getElementById(
                "formMessage"
            );


        if (
            !contactForm
        ) {
            return;
        }


        contactForm.addEventListener(
            "submit",

            async (event) => {

                event.preventDefault();


                if (
                    formMessage
                ) {

                    formMessage.textContent =
                        "Sending message...";

                }


                const name =
                    document.getElementById(
                        "name"
                    )?.value.trim();


                const email =
                    document.getElementById(
                        "email"
                    )?.value.trim();


                const message =
                    document.getElementById(
                        "message"
                    )?.value.trim();


                if (
                    !name ||
                    !email ||
                    !message
                ) {

                    if (
                        formMessage
                    ) {

                        formMessage.textContent =
                            "Please complete all required fields.";

                    }

                    return;

                }


                try {

                    const token =
                        localStorage.getItem(
                            "userToken"
                        ) ||
                        sessionStorage.getItem(
                            "userToken"
                        );


                    const response =
                        await fetch(
                            "/api/contact",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json",

                                    ...(token
                                        ? {
                                            "Authorization":
                                                `Bearer ${token}`
                                        }
                                        : {})
                                },

                                credentials:
                                    "same-origin",

                                body:
                                    JSON.stringify({
                                        name,
                                        email,
                                        subject: "",
                                        message
                                    })
                            }
                        );


                    const data =
                        await response
                            .json()
                            .catch(
                                () => ({})
                            );


                    if (
                        !response.ok
                    ) {

                        if (
                            formMessage
                        ) {

                            formMessage.textContent =
                                data.message ||
                                "Unable to send your message.";

                        }

                        return;

                    }


                    if (
                        formMessage
                    ) {

                        formMessage.textContent =
                            data.message ||
                            "Your message was sent successfully.";

                    }


                    contactForm.reset();

                }
                catch (error) {

                    console.error(
                        "Contact form submission error:",
                        error
                    );


                    if (
                        formMessage
                    ) {

                        formMessage.textContent =
                            "Unable to send your message. Please try again.";

                    }

                }

            }
        );

    }
);

/*
==========================================
YASU TECH VERSION DISPLAY
==========================================
*/

document.addEventListener("DOMContentLoaded", function () {
    const versionElement =
        document.getElementById("yasuTechVersion");

    if (!versionElement) {
        return;
    }

    fetch("/api/version")
        .then(function (response) {
            if (!response.ok) {
                throw new Error("Version request failed.");
            }

            return response.json();
        })
        .then(function (data) {
            if (
                data &&
                data.success &&
                data.version
            ) {
                versionElement.textContent =
                    "v" + data.version;
            }
        })
        .catch(function () {
            versionElement.textContent = "";
        });
});
